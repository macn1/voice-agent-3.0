import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutTemplate, Phone, Plus } from 'lucide-react';
import { date, money, number, titleCase } from '../../lib/format';
import { asList } from '../../lib/normalize';
import {
  useAllocateNumberMutation,
  useCreateAdminTemplateMutation,
  useGetCustomerRankingQuery,
  useGetPlatformSummaryQuery,
  useListAdminAuditQuery,
  useListAdminTemplatesQuery,
  useListCustomersQuery,
  useListNumberPoolQuery,
  useRegisterNumberMutation,
  useReleaseNumberMutation,
} from '../../store/api/adminApi';
import {
  Async,
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  errMsg,
  Field,
  Input,
  Modal,
  PageHeader,
  Skeleton,
  StatusBadge,
  Toggle,
  useToast,
} from '../../components/ui';
import { Select, Textarea } from '../../components/forms';
import { Stat, TimeChart } from '../../components/charts';
import { ActivityLogPage } from '../customer/settings/MoreSettings';

/** ADM-12 Platform overview. */
export function AdminOverviewPage() {
  const navigate = useNavigate();
  const summary = useGetPlatformSummaryQuery();
  const ranking = useGetCustomerRankingQuery();
  return (
    <>
      <PageHeader eyebrow="Platform" title="Overview" description="How the whole platform is doing right now." />
      <Async state={summary} skeleton={<Skeleton h={120} />}>
        {(s) => (
          <div className="stack">
            <div className="grid-3">
              <Stat label="Customers" value={number(s.customers)} hint={`${number(s.active_customers)} active`} onClick={() => navigate('/admin/customers')} />
              <Stat label="Live calls now" value={number(s.live_calls)} />
              <Stat label="Minutes this month" value={number(s.minutes_month)} />
              <Stat label="Revenue this month" value={money(s.revenue_month)} />
              <Stat label="Failed calls (24h)" value={number(s.failing_calls_24h)} />
            </div>
            {s.timeseries.length > 0 && (
              <div className="card card-pad">
                <div className="card-title" style={{ marginBottom: 12 }}>
                  Calls per day
                </div>
                <TimeChart data={s.timeseries} x="day" series={[{ key: 'calls', label: 'Calls' }]} />
              </div>
            )}
          </div>
        )}
      </Async>
      <div className="card" style={{ marginTop: 18 }}>
        <div className="card-head">
          <h2>Customers by usage</h2>
        </div>
        <Async state={ranking}>
          {(rows) =>
            rows.length ? (
              <table className="table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Plan</th>
                    <th className="num">Calls</th>
                    <th className="num">Minutes</th>
                    <th className="num">Revenue</th>
                    <th className="num">Failure rate</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.tenant_id} className="clickable" onClick={() => navigate(`/admin/customers/${r.tenant_id}`)}>
                      <td className="cell-main">{r.tenant_name}</td>
                      <td>{r.plan ?? '—'}</td>
                      <td className="num">{number(r.calls)}</td>
                      <td className="num">{number(r.minutes)}</td>
                      <td className="num">{money(r.revenue)}</td>
                      <td
                        className="num"
                        style={{
                          color: r.failure_rate > 0.1 ? 'var(--red)' : undefined,
                        }}
                      >
                        {Math.round(r.failure_rate * 100)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState title="No usage yet" />
            )
          }
        </Async>
      </div>
    </>
  );
}

/** ADM-11.5 Number pool. */
export function NumberPoolPage() {
  const toast = useToast();
  const pool = useListNumberPoolQuery();
  const customersQ = useListCustomersQuery({ limit: 200, offset: 0 });
  const customers = { data: asList(customersQ.data) };
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
  const [filter, setFilter] = useState('');

  return (
    <>
      <PageHeader
        eyebrow="Telephony"
        title="Number pool"
        description="Numbers we own. Allocate them to customers; customers then pick which agent answers."
        actions={
          <Button variant="primary" icon={<Plus />} onClick={() => setRegistering(true)}>
            Register number
          </Button>
        }
      />

      <div className="card">
        <div className="card-head">
          <div className="filters">
            <Select value={filter} options={['available', 'allocated', 'released']} placeholder="All numbers" onChange={(e) => setFilter(e.target.value)} />
          </div>
        </div>
        <Async state={pool}>
          {(list) => {
            const rows = list.filter((x) => !filter || x.status === filter);
            return rows.length ? (
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
                          {p.country} · {[p.capabilities.voice && 'Voice', p.capabilities.sms && 'SMS'].filter(Boolean).join(' + ')}
                        </div>
                      </td>
                      <td>{titleCase(p.provider)}</td>
                      <td>
                        <StatusBadge
                          status={p.status === 'available' ? 'active' : p.status === 'allocated' ? 'pending' : 'cancelled'}
                          label={titleCase(p.status)}
                        />
                      </td>
                      <td>{p.tenant_name ?? '—'}</td>
                      <td className="muted">{date(p.allocated_at)}</td>
                      <td className="actions">
                        {p.status === 'available' ? (
                          <Button
                            size="sm"
                            onClick={() => {
                              setAllocating(p);
                              setTenant('');
                            }}
                          >
                            Allocate
                          </Button>
                        ) : p.status === 'allocated' ? (
                          <Button size="sm" variant="ghost" onClick={() => setReleasing(p)}>
                            Release
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
        description={`${releasing?.tenant_name ?? 'The customer'} loses this number and calls to it stop being answered.`}
        confirmLabel="Release"
        onConfirm={async () => {
          await releaseNumber({ tenantId: releasing.tenant_id, numberId: releasing.id }).unwrap();
        }}
      />
    </>
  );
}

/** AGT-11.8 Admin template manager. */
export function TemplatesAdminPage() {
  const toast = useToast();
  const list = useListAdminTemplatesQuery();
  const [createTemplate] = useCreateAdminTemplateMutation();
  const [editing, setEditing] = useState(null);
  const [config, setConfig] = useState('{}');
  return (
    <>
      <PageHeader
        eyebrow="Agents"
        title="Agent templates"
        description="Starting points customers see when they create an agent."
        actions={
          <Button
            variant="primary"
            icon={<Plus />}
            onClick={() => {
              setEditing({
                name: '',
                use_case: 'booking',
                description: '',
                is_active: true,
              });
              setConfig('{\n  "persona": {},\n  "flow": {},\n  "guidelines": {},\n  "variables": []\n}');
            }}
          >
            New template
          </Button>
        }
      />

      <div className="card">
        <Async state={list}>
          {(ts) =>
            ts.length ? (
              <table className="table">
                <thead>
                  <tr>
                    <th>Template</th>
                    <th>Use case</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {ts.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <div className="cell-main">{t.name}</div>
                        <div className="cell-sub">{t.description}</div>
                      </td>
                      <td>{titleCase(t.use_case)}</td>
                      <td>{t.is_active === false ? <Badge>Hidden</Badge> : <Badge tone="green">Visible</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState icon={<LayoutTemplate />} title="No templates" />
            )
          }
        </Async>
      </div>
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        wide
        title="New template"
        footer={
          <>
            <Button onClick={() => setEditing(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={async () => {
                let cfg;
                try {
                  cfg = JSON.parse(config);
                } catch {
                  return toast('Configuration must be valid JSON', 'error');
                }
                if (!editing?.name?.trim()) return toast('Give it a name', 'error');
                try {
                  await createTemplate({
                    name: editing.name.trim(),
                    use_case: editing.use_case ?? 'support',
                    description: editing.description ?? '',
                    is_active: editing.is_active ?? true,
                    config: cfg,
                  }).unwrap();
                  setEditing(null);
                } catch (e) {
                  toast(errMsg(e), 'error');
                }
              }}
            >
              Create
            </Button>
          </>
        }
      >
        {editing && (
          <div className="stack">
            <div className="form-grid">
              <Field label="Name">
                <Input value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </Field>
              <Field label="Use case">
                <Select
                  value={editing.use_case ?? ''}
                  options={['booking', 'lead_qualification', 'collections', 'support', 'recovery', 'reminder']}
                  onChange={(e) => setEditing({ ...editing, use_case: e.target.value })}
                />
              </Field>
              <Field label="Description" className="full">
                <Input value={editing.description ?? ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
              </Field>
            </div>
            <Field label="Agent configuration (JSON)" hint="Same shape as an agent export: persona, flow, guidelines, variables…">
              <Textarea rows={10} className="mono" value={config} onChange={(e) => setConfig(e.target.value)} />
            </Field>
            <Toggle checked={editing.is_active ?? true} onChange={(v) => setEditing({ ...editing, is_active: v })} label="Visible to customers" />
          </div>
        )}
      </Modal>
    </>
  );
}

/** CMP-04.4 Admin audit log. */
export function AdminAuditPage() {
  return (
    <>
      <PageHeader eyebrow="Monitor" title="Audit log" description="Everything our staff changed, across all customers." />
      <ActivityLogPage useLog={useListAdminAuditQuery} showTenant />
    </>
  );
}
