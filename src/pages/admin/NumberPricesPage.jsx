import { useState } from 'react';
import { Check } from 'lucide-react';
import { dateTime } from '../../lib/format';
import { useListCarrierAccountsQuery, useListNumberPricesQuery, usePutNumberPricesMutation } from '../../store/api/adminApi';
import { Async, Button, Field, formErrors, Input, PageHeader, useToast } from '../../components/ui';

const TYPES = [
  { key: 'local', label: 'Local', hint: 'A landline number in an Indian city, e.g. Bengaluru 080.' },
  { key: 'mobile', label: 'Mobile', hint: 'A mobile-series Indian number.' },
  { key: 'toll_free', label: 'Toll-free', hint: 'An 1800 number: callers pay nothing.' },
];
const MAX = 1_000_000;

const toForm = (list) =>
  Object.fromEntries(
    TYPES.map(({ key }) => {
      const p = (list ?? []).find((x) => x.number_type === key);
      return [key, { monthly: p ? String(p.monthly_price) : '', setup: p ? String(p.setup_price) : '' }];
    }),
  );

const amountError = (s) => {
  const v = s.trim();
  if (!v) return 'Required';
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return 'A rupee amount, e.g. 500 or 499.50';
  if (Number(v) > MAX) return 'At most ₹10,00,000';
  return undefined;
};

/** What customers pay to rent a number from Aurlynn, per number type (INR). */
export function NumberPricesPage() {
  const prices = useListNumberPricesQuery();
  const accounts = useListCarrierAccountsQuery();
  return (
    <>
      <PageHeader
        eyebrow="Telephony"
        title="Number prices"
        description="What customers pay to rent a number from Aurlynn: a monthly price and a one-time setup price per number type, in rupees. Customers see these in the number shop."
      />
      {accounts.isSuccess && !(accounts.data ?? []).some((a) => a.name === 'in') && (
        <div className="banner info">
          <span className="grow">
            Our Indian Plivo account isn’t connected yet, so customers see the number shop as “Coming soon”, with these prices. They can buy numbers once
            it’s connected.
          </span>
        </div>
      )}
      <Async state={prices}>{(list) => <PricesForm key={JSON.stringify(list)} list={list} />}</Async>
    </>
  );
}

/** The form starts from the saved prices; after a save the list refetches and the form starts again from it. */
function PricesForm({ list }) {
  const toast = useToast();
  const [putPrices, { isLoading: saving }] = usePutNumberPricesMutation();
  const [base] = useState(() => toForm(list));
  const [f, setF] = useState(base);
  const [touched, setTouched] = useState(false);
  const [serverErrors, setServerErrors] = useState({});
  const [error, setError] = useState(null);
  const dirty = JSON.stringify(f) !== JSON.stringify(base);
  const byType = Object.fromEntries((list ?? []).map((p) => [p.number_type, p]));

  const local = {};
  TYPES.forEach(({ key }) => {
    local[`${key}.monthly`] = amountError(f[key].monthly);
    local[`${key}.setup`] = amountError(f[key].setup);
  });
  const invalid = Object.values(local).some(Boolean);
  const set = (key, part) => (e) => {
    setF({ ...f, [key]: { ...f[key], [part]: e.target.value } });
    if (serverErrors[key]) setServerErrors({ ...serverErrors, [key]: undefined });
  };

  const save = async () => {
    setTouched(true);
    setError(null);
    if (invalid) return;
    try {
      await putPrices(TYPES.map(({ key }) => ({ number_type: key, monthly_price: Number(f[key].monthly), setup_price: Number(f[key].setup) }))).unwrap();
      toast('Prices saved');
    } catch (e) {
      const r = formErrors(
        e,
        TYPES.map((t) => t.key),
      );
      setServerErrors(r.fields);
      setError(r.general);
    }
  };

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Prices per number type</h2>
          <div className="card-sub">In Indian rupees (INR), from ₹0 to ₹10,00,000. A new price applies to numbers bought after you save it.</div>
        </div>
        <div className="row">
          {dirty && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setF(base);
                setTouched(false);
                setServerErrors({});
                setError(null);
              }}
            >
              Discard
            </Button>
          )}
          <Button size="sm" variant="primary" icon={<Check />} loading={saving} disabled={!dirty} onClick={save}>
            Save
          </Button>
        </div>
      </div>
      <div className="card-pad stack" style={{ gap: 20 }}>
        {error && <div className="alert-inline">{error}</div>}
        {TYPES.map(({ key, label, hint }) => {
          const saved = byType[key];
          return (
            <div key={key} className="stack" style={{ gap: 10 }} data-type={key}>
              <div className="row between wrap" style={{ gap: 4 }}>
                <div>
                  <div className="fw-medium">{label}</div>
                  <div className="muted small">{hint}</div>
                </div>
                <span className="muted small">{saved ? `Changed ${dateTime(saved.updated_at)}` : 'No price yet: customers can’t buy this type'}</span>
              </div>
              <div className="form-grid">
                <Field label="Monthly price (₹)" error={(touched && local[`${key}.monthly`]) || serverErrors[key]}>
                  <Input
                    inputMode="decimal"
                    aria-label={`${label} monthly price`}
                    value={f[key].monthly}
                    invalid={!!((touched && local[`${key}.monthly`]) || serverErrors[key])}
                    onChange={set(key, 'monthly')}
                    placeholder="500"
                  />
                </Field>
                <Field label="Setup price (₹)" hint="Charged once, when the number is bought. 0 for none." error={touched ? local[`${key}.setup`] : undefined}>
                  <Input
                    inputMode="decimal"
                    aria-label={`${label} setup price`}
                    value={f[key].setup}
                    invalid={!!(touched && local[`${key}.setup`])}
                    onChange={set(key, 'setup')}
                    placeholder="0"
                  />
                </Field>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
