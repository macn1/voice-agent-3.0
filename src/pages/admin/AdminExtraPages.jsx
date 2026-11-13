import { useState } from 'react';
import { Phone, Plus, RefreshCw, Search } from 'lucide-react';
import { date, titleCase } from '../../lib/format';
import { useAuth } from '../../lib/auth';
import { asList } from '../../lib/normalize';
import {
  useAllocateNumberMutation,
  useLazySearchCarrierNumbersQuery,
  useListAdminAuditQuery,
  useListAdminStaffQuery,
  useListCarrierAccountsQuery,
  useListCustomersQuery,
  useListNumberPoolQuery,
  useRegisterNumberMutation,
  useReleaseNumberMutation,
  useRentCarrierNumberMutation,
  useRetireNumberMutation,
  useSyncCarrierAccountMutation,
} from '../../store/api/adminApi';
import {
  Async,
  Button,
  ConfirmDialog,
  EmptyState,
  errMsg,
  Field,
  Input,
  Modal,
  PageHeader,
  StatusBadge,
  Toggle,
  useToast,
} from '../../components/ui';
import { Select } from '../../components/forms';
import { ActivityLogPage } from '../customer/settings/MoreSettings';

/** ADM-11.5 Number pool. */
export function NumberPoolPage() {
  const toast = useToast();
  const pool = useListNumberPoolQuery();
  const customersQ = useListCustomersQuery({ limit: 200, offset: 0 });
  const customers = { data: asList(customersQ.data) };
  // The pool lists tenant_id only; name it from the customer list.
  const customerName = (id) => (id ? (customers.data.find((c) => c.id === id)?.name ?? id.slice(0, 8)) : '—');
  const [registerNumber] = useRegisterNumberMutation();
  const [allocateNumber] = useAllocateNumberMutation();
  const [releaseNumber] = useReleaseNumberMutation();
  const [registering, setRegistering] = useState(false);
  const [n, setN] = useState({
    e164: '',
    country: 'IN',
    provider: 'manual',
    voice: true,
    sms: false,
  });
  const [allocating, setAllocating] = useState(null);
  const [tenant, setTenant] = useState('');
  const [releasing, setReleasing] = useState(null);
  const [retiring, setRetiring] = useState(null);
  const [buying, setBuying] = useState(false);
  const [filter, setFilter] = useState('');
  const accountsQ = useListCarrierAccountsQuery();
  const accounts = accountsQ.data ?? [];
  const [syncAccount, { isLoading: syncing }] = useSyncCarrierAccountMutation();
  const [retireNumber] = useRetireNumberMutation();

  // Brings in numbers rented in Plivo's console and points them all at us.
  const syncAll = async () => {
    try {
      const done = [];
      for (const a of accounts) {
        const r = await syncAccount(a.name).unwrap();
        done.push(`${a.name}: ${r.total} on the account, ${r.added} new, ${r.attached} re-pointed`);
      }
      toast(`Synced. ${done.join(' · ')}`);
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Telephony"
        title="Number pool"
        description="Numbers we rent from our phone carrier. Allocate them to customers; customers then pick which agent answers."
        actions={
          <div className="row" style={{ gap: 8 }}>
            <Button icon={<RefreshCw />} loading={syncing} disabled={!accounts.length} onClick={syncAll}>
              Sync from Plivo
            </Button>
            <Button icon={<Plus />} onClick={() => setRegistering(true)}>
              Register by hand
            </Button>
            <Button variant="primary" icon={<Search />} disabled={!accounts.length} onClick={() => setBuying(true)}>
              Buy number
            </Button>
          </div>
        }
      />

      {accountsQ.isSuccess && !accounts.length && (
        <div className="banner info">
          <span className="grow">
            No Plivo account is connected yet, so numbers can't be bought here. Numbers can still be registered by hand; to buy them, add the
            account to the cluster (secret voice-plivo, see docs/phone-calls.md in voice-realtime-be).
          </span>
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <div className="filters">
            <Select value={filter} options={['available', 'allocated', 'pending', 'retired']} placeholder="All numbers" onChange={(e) => setFilter(e.target.value)} />
          </div>
        </div>
        <Async state={pool}>
          {(list) => {
            const rows = asList(list).filter((x) => !filter || x.status === filter);
            return rows.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Number</th>
                      <th>Provider</th>
                      <th>Status</th>
                      <th>Customer</th>
                      <th>Since</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <div className="cell-main mono">{p.e164}</div>
                          <div className="cell-sub">
                            {p.country} · {[p.capabilities?.voice && 'Voice', p.capabilities?.sms && 'SMS'].filter(Boolean).join(' + ')}
                          </div>
                        </td>
                        <td>
                          {titleCase(p.provider)}
                          {p.carrier_account && <div className="cell-sub">Account {p.carrier_account}</div>}
                        </td>
                        <td>
                          <StatusBadge
                            status={p.status === 'available' ? 'active' : p.status === 'allocated' || p.status === 'pending' ? 'pending' : 'cancelled'}
                            label={p.status === 'pending' ? 'Carrier checking' : titleCase(p.status)}
                          />
                        </td>
                        <td>{p.tenant_name ?? customerName(p.tenant_id)}</td>
                        <td className="muted">{date(p.allocated_at)}</td>
                        <td className="actions">
                          {p.status === 'available' && (
                            <Button
                              size="sm"
                              onClick={() => {
                                setAllocating(p);
                                setTenant('');
                              }}
                            >
                              Allocate
                            </Button>
                          )}
                          {(p.status === 'available' || p.status === 'pending') && (
                            <Button size="sm" variant="ghost" onClick={() => setRetiring(p)}>
                              Retire
                            </Button>
                          )}
                          {p.status === 'allocated' && (
                            <Button size="sm" variant="ghost" onClick={() => setReleasing(p)}>
                              Release
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState icon={<Phone />} title="No numbers" description="Register numbers you've bought from a carrier." />
            );
          }}
        </Async>
      </div>
      <Modal
        open={registering}
        onClose={() => setRegistering(false)}
        title="Register a number"
        footer={
          <>
            <Button onClick={() => setRegistering(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!/^\+[1-9]\d{7,14}$/.test(n.e164)}
              onClick={async () => {
                try {
                  await registerNumber({
                    e164: n.e164,
                    country: n.country,
                    provider: n.provider,
                    capabilities: { voice: n.voice, sms: n.sms },
                  }).unwrap();
                  setRegistering(false);
                } catch (e) {
                  toast(errMsg(e), 'error');
                }
              }}
            >
              Register
            </Button>
          </>
        }
      >
        <div className="form-grid">
          <Field label="Number" className="full">
            <Input className="mono" placeholder="+918045678900" value={n.e164} onChange={(e) => setN({ ...n, e164: e.target.value })} />
          </Field>
          <Field label="Country">
            <Select value={n.country} options={['IN', 'US', 'GB', 'AE', 'SG']} onChange={(e) => setN({ ...n, country: e.target.value })} />
          </Field>
          <Field label="Provider">
            <Select value={n.provider} options={['manual', 'twilio', 'plivo', 'exotel']} onChange={(e) => setN({ ...n, provider: e.target.value })} />
          </Field>
          <Toggle checked={n.voice} onChange={(v) => setN({ ...n, voice: v })} label="Voice" />
          <Toggle checked={n.sms} onChange={(v) => setN({ ...n, sms: v })} label="SMS" />
        </div>
      </Modal>
      <Modal
        open={!!allocating}
        onClose={() => setAllocating(null)}
        title={`Allocate ${allocating?.e164}`}
        footer={
          <>
            <Button onClick={() => setAllocating(null)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!tenant}
              onClick={async () => {
                try {
                  await allocateNumber({ tenantId: tenant, numberId: allocating.id }).unwrap();
                  toast('Number allocated');
                  setAllocating(null);
                } catch (e) {
                  toast(errMsg(e), 'error');
                }
              }}
            >
              Allocate
            </Button>
          </>
        }
      >
        <Field label="Customer">
          <Select
            value={tenant}
            options={(customers.data ?? []).map((c) => ({
              value: c.id,
              label: c.name,
            }))}
            placeholder="Choose a customer"
            onChange={(e) => setTenant(e.target.value)}
          />
        </Field>
      </Modal>
      <ConfirmDialog
        open={!!releasing}
        onClose={() => setReleasing(null)}
        danger
        title={`Release ${releasing?.e164}?`}
        description={`${releasing ? (releasing.tenant_name ?? customerName(releasing.tenant_id)) : 'The customer'} loses this number and calls to it stop being answered.`}
        confirmLabel="Release"
        onConfirm={async () => {
          await releaseNumber({ tenantId: releasing.tenant_id, numberId: releasing.id }).unwrap();
        }}
      />
      <ConfirmDialog
        open={!!retiring}
        onClose={() => setRetiring(null)}
        danger
        title={`Retire ${retiring?.e164}?`}
        description={
          retiring?.carrier_account
            ? 'It goes back to Plivo for good: its monthly charge stops, and this number can’t be had back.'
            : 'It leaves the pool for good. It was registered by hand, so cancel it with its carrier too.'
        }
        confirmLabel="Retire"
        onConfirm={async () => {
          await retireNumber(retiring.id).unwrap();
          toast('Number retired');
        }}
      />
      <BuyNumberModal open={buying} onClose={() => setBuying(false)} accounts={accounts} />
    </>
  );
}

const NUMBER_TYPES = [
  { value: 'local', label: 'Local (landline)' },
  { value: 'mobile', label: 'Mobile' },
  { value: 'tollfree', label: 'Toll-free' },
];

/** Finds a number for rent on one of our Plivo accounts and rents it into the pool. */
function BuyNumberModal({ open, onClose, accounts }) {
  const toast = useToast();
  const [q, setQ] = useState({ account: '', country: 'IN', type: 'local', pattern: '' });
  const [search, found] = useLazySearchCarrierNumbersQuery();
  const [rent, { isLoading: renting }] = useRentCarrierNumberMutation();
  const [picked, setPicked] = useState(null);
  const [error, setError] = useState(null);
  const account = q.account || accounts[0]?.name || '';
  const close = () => {
    setPicked(null);
    setError(null);
    onClose();
  };
  const run = () => {
    setError(null);
    search({ account, country: q.country, type: q.type, pattern: q.pattern || undefined });
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Buy a number"
      description="Numbers for rent on our Plivo account. Renting starts its monthly charge; the number then waits in the pool until you allocate it to a customer."
      footer={
        picked ? (
          <>
            <Button onClick={() => setPicked(null)}>Back</Button>
            <Button
              variant="primary"
              loading={renting}
              onClick={async () => {
                setError(null);
                try {
                  const n = await rent({ account, number: picked.e164, country: q.country }).unwrap();
                  toast(n?.status === 'pending' ? `${picked.e164} rented; Plivo is still checking documents` : `${picked.e164} added to the pool`);
                  setPicked(null);
                  run();
                } catch (e) {
                  setError(errMsg(e));
                }
              }}
            >
              Rent number
            </Button>
          </>
        ) : (
          <Button onClick={close}>Close</Button>
        )
      }
    >
      {error && <div className="alert-inline">{error}</div>}
      {picked ? (
        <p>
          Rent <span className="mono fw-medium">{picked.e164}</span>
          {picked.locality ? ` (${picked.locality})` : ''} for <b>{picked.monthly_price}</b> a month, in the Plivo account’s currency? It’s charged
          from now until the number is retired.
        </p>
      ) : (
        <>
          <div className="form-grid">
            {accounts.length > 1 && (
              <Field label="Account">
                <Select value={account} options={accounts.map((a) => a.name)} onChange={(e) => setQ({ ...q, account: e.target.value })} />
              </Field>
            )}
            <Field label="Country" hint="Two letters, e.g. IN.">
              <Input value={q.country} maxLength={2} onChange={(e) => setQ({ ...q, country: e.target.value.toUpperCase() })} />
            </Field>
            <Field label="Type">
              <Select value={q.type} options={NUMBER_TYPES} onChange={(e) => setQ({ ...q, type: e.target.value })} />
            </Field>
            <Field label="Starts with" hint="Digits after the country code, e.g. 80 for Bengaluru.">
              <Input className="mono" value={q.pattern} onChange={(e) => setQ({ ...q, pattern: e.target.value.replace(/\D/g, '') })} />
            </Field>
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <Button variant="primary" icon={<Search />} loading={found.isFetching} disabled={!/^[A-Z]{2}$/.test(q.country) || !account} onClick={run}>
              Search
            </Button>
          </div>
          {found.isError && <div className="alert-inline" style={{ marginTop: 12 }}>{errMsg(found.error)}</div>}
          {found.isSuccess &&
            !found.isFetching &&
            (found.data.length ? (
              <div className="table-wrap" style={{ marginTop: 12 }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Number</th>
                      <th>Where</th>
                      <th>Per month</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {found.data.map((o) => (
                      <tr key={o.e164}>
                        <td className="mono cell-main">{o.e164}</td>
                        <td className="muted">{[titleCase(o.type), o.locality].filter(Boolean).join(' · ')}</td>
                        <td>{o.monthly_price}</td>
                        <td className="actions">
                          <Button size="sm" onClick={() => setPicked(o)}>
                            Rent
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState icon={<Phone />} title="Nothing for rent" description="Try another type, or fewer digits." />
            ))}
        </>
      )}
    </Modal>
  );
}

/** CMP-04.4 Admin audit log. */
export function AdminAuditPage() {
  const { can } = useAuth();
  const customers = asList(useListCustomersQuery({ limit: 200, offset: 0 }, { skip: !can('customer.read') }).data);
  const staff = asList(useListAdminStaffQuery(undefined, { skip: !can('staff.manage') }).data);
  const actors = new Map(staff.map((x) => [x.id, x.name]));
  return (
    <>
      <PageHeader eyebrow="Monitor" title="Audit log" description="Everything our staff changed, across all customers." />
      <ActivityLogPage useLog={useListAdminAuditQuery} showTenant tenantOptions={customers.map((c) => ({ value: c.id, label: c.name }))} tenants={new Map(customers.map((c) => [c.id, c.name]))} actors={actors} />
    </>
  );
}
