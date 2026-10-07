import { useEffect, useState } from 'react';
import { Package as PackageIcon, Pencil, Plus } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { money, number, titleCase } from '../../lib/format';
import { asList } from '../../lib/normalize';
import { useCreatePackageMutation, useListAdminPackagesQuery, useUpdatePackageMutation } from '../../store/api/adminApi';
import { Async, Badge, Button, EmptyState, errMsg, Field, Input, Modal, PageHeader, StatusBadge, Toggle, useToast } from '../../components/ui';

export function PackagesPage() {
  const { can } = useAuth();
  const toast = useToast();
  const packages = useListAdminPackagesQuery();
  const [editing, setEditing] = useState(null);
  const canManage = can('package.manage');

  return (
    <>
      <PageHeader
        eyebrow="Billing"
        title="Plans"
        description="Packages customers can be on: price, included minutes, agents, concurrency and overage."
        actions={
          canManage && (
            <Button variant="primary" icon={<Plus />} onClick={() => setEditing('new')}>
              New plan
            </Button>
          )
        }
      />

      <div className="card">
        <Async state={packages}>
          {(data) => {
            const list = asList(data);
            if (!list.length)
              return <EmptyState icon={<PackageIcon />} title="No plans yet" description="Create Starter, Growth and Enterprise to get going." />;
            return (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Plan</th>
                      <th className="num">Price</th>
                      <th className="num">Minutes</th>
                      <th className="num">Agents</th>
                      <th className="num">Concurrent</th>
                      <th className="num">Overage / min</th>
                      <th>Visibility</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <div className="cell-main">{p.name}</div>
                          <div className="cell-sub mono">
                            {p.code}
                            {p.llm_tier ? ` · ${titleCase(p.llm_tier)} tier` : ''}
                          </div>
                        </td>
                        <td className="num">
                          {money(p.price_amount, p.currency)}
                          <div className="cell-sub">{p.billing_cycle}</div>
                        </td>
                        <td className="num">{number(p.included_call_minutes)}</td>
                        <td className="num">{number(p.included_agents)}</td>
                        <td className="num">{number(p.max_concurrent_calls)}</td>
                        <td className="num">{money(p.overage_rate_per_minute, p.currency)}</td>
                        <td>{p.is_public ? <Badge tone="blue">Public</Badge> : <Badge>Admin only</Badge>}</td>
                        <td>
                          <StatusBadge status={p.status} />
                        </td>
                        <td className="actions">
                          {canManage && (
                            <Button size="sm" variant="ghost" icon={<Pencil />} onClick={() => setEditing(p)}>
                              Edit
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }}
        </Async>
      </div>

      <PackageModal
        value={editing}
        onClose={() => setEditing(null)}
        onSaved={(isNew) => {
          toast(isNew ? 'Plan created' : 'Plan updated');
        }}
      />
    </>
  );
}

const EMPTY = {
  code: '',
  name: '',
  price_amount: '',
  currency: 'USD',
  billing_cycle: 'monthly',
  included_call_minutes: '',
  included_agents: '',
  max_concurrent_calls: '',
  overage_rate_per_minute: '',
  llm_tier: 'standard',
  is_public: true,
  status: 'active',
};

const toForm = (p) => ({
  code: p.code,
  name: p.name,
  price_amount: String(p.price_amount),
  currency: p.currency,
  billing_cycle: p.billing_cycle,
  included_call_minutes: String(p.included_call_minutes),
  included_agents: String(p.included_agents),
  max_concurrent_calls: String(p.max_concurrent_calls),
  overage_rate_per_minute: String(p.overage_rate_per_minute),
  llm_tier: p.llm_tier ?? '',
  is_public: p.is_public,
  status: p.status,
});

function PackageModal({ value, onClose, onSaved }) {
  const isNew = value === 'new';
  const [createPackage] = useCreatePackageMutation();
  const [updatePackage] = useUpdatePackageMutation();
  const [f, setF] = useState(EMPTY);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (value) {
      setF(value === 'new' ? EMPTY : toForm(value));
      setTouched(false);
      setError(null);
    }
  }, [value]);

  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const isNum = (s) => s.trim() !== '' && !Number.isNaN(Number(s)) && Number(s) >= 0;
  const errs = {};
  if (!f.code.trim()) errs.code = 'Required';
  if (!f.name.trim()) errs.name = 'Required';
  if (!/^[A-Z]{3}$/.test(f.currency)) errs.currency = '3-letter code, e.g. USD';
  ['price_amount', 'included_call_minutes', 'included_agents', 'max_concurrent_calls', 'overage_rate_per_minute'].forEach((k) => {
    if (!isNum(f[k])) errs[k] = 'Enter a number ≥ 0';
  });
  const e = (k) => (touched ? errs[k] : undefined);

  const submit = async () => {
    setTouched(true);
    if (Object.keys(errs).length) return;
    const body = {
      code: f.code.trim(),
      name: f.name.trim(),
      price_amount: Number(f.price_amount),
      currency: f.currency,
      billing_cycle: f.billing_cycle,
      included_call_minutes: Number(f.included_call_minutes),
      included_agents: Number(f.included_agents),
      max_concurrent_calls: Number(f.max_concurrent_calls),
      overage_rate_per_minute: Number(f.overage_rate_per_minute),
      llm_tier: f.llm_tier || undefined,
      is_public: f.is_public,
    };
    setBusy(true);
    setError(null);
    try {
      if (isNew) await createPackage(body).unwrap();
      else await updatePackage({ id: value.id, ...body, status: f.status }).unwrap();
      onSaved(isNew);
      onClose();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!value}
      onClose={onClose}
      wide
      title={isNew ? 'New plan' : `Edit ${value?.name ?? ''}`}
      description={isNew ? undefined : 'Changes apply to customers on this plan from their next billing period.'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={submit}>
            {isNew ? 'Create plan' : 'Save changes'}
          </Button>
        </>
      }
    >
      <div className="stack">
        {error && <div className="alert-inline">{error}</div>}
        <div className="form-grid">
          <Field label="Name" error={e('name')}>
            <Input autoFocus value={f.name} onChange={(ev) => set('name', ev.target.value)} placeholder="Growth" />
          </Field>
          <Field label="Code" error={e('code')} hint="Unique identifier, e.g. growth">
            <Input className="mono" value={f.code} disabled={!isNew} onChange={(ev) => set('code', ev.target.value.toLowerCase())} />
          </Field>
          <Field label="Price" error={e('price_amount')}>
            <Input inputMode="decimal" value={f.price_amount} onChange={(ev) => set('price_amount', ev.target.value)} placeholder="499" />
          </Field>
          <div className="form-grid" style={{ gap: 12 }}>
            <Field label="Currency" error={e('currency')}>
              <Input className="mono" maxLength={3} value={f.currency} onChange={(ev) => set('currency', ev.target.value.toUpperCase())} />
            </Field>
            <Field label="Billing cycle">
              <select className="select" value={f.billing_cycle} onChange={(ev) => set('billing_cycle', ev.target.value)}>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </Field>
          </div>
          <Field label="Included call minutes" error={e('included_call_minutes')}>
            <Input inputMode="numeric" value={f.included_call_minutes} onChange={(ev) => set('included_call_minutes', ev.target.value)} placeholder="5000" />
          </Field>
          <Field label="Included agents" error={e('included_agents')}>
            <Input inputMode="numeric" value={f.included_agents} onChange={(ev) => set('included_agents', ev.target.value)} placeholder="5" />
          </Field>
          <Field label="Max concurrent calls" error={e('max_concurrent_calls')}>
            <Input inputMode="numeric" value={f.max_concurrent_calls} onChange={(ev) => set('max_concurrent_calls', ev.target.value)} placeholder="10" />
          </Field>
          <Field label="Overage rate per minute" error={e('overage_rate_per_minute')}>
            <Input
              inputMode="decimal"
              value={f.overage_rate_per_minute}
              onChange={(ev) => set('overage_rate_per_minute', ev.target.value)}
              placeholder="0.08"
            />
          </Field>
          <Field label="AI model tier">
            <select className="select" value={f.llm_tier} onChange={(ev) => set('llm_tier', ev.target.value)}>
              <option value="">—</option>
              <option value="basic">Basic</option>
              <option value="standard">Standard</option>
              <option value="premium">Premium</option>
            </select>
          </Field>
          {!isNew && (
            <Field label="Status">
              <select className="select" value={f.status} onChange={(ev) => set('status', ev.target.value)}>
                <option value="active">Active</option>
                <option value="deprecated">Deprecated</option>
              </select>
            </Field>
          )}
          <div className="full">
            <Toggle
              checked={f.is_public}
              onChange={(v) => set('is_public', v)}
              label="Public plan"
              description="Public plans appear in the customer's plan picker. Admin-only plans can only be assigned from the console."
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}
