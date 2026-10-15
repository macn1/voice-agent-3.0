import { useState } from 'react';
import { Phone, Plus } from 'lucide-react';
import { date, titleCase } from '../../lib/format';
import { asList } from '../../lib/normalize';
import {
  useAllocateNumberMutation,
  useListAdminAuditQuery,
  useListCustomersQuery,
  useListNumberPoolQuery,
  useRegisterNumberMutation,
  useReleaseNumberMutation,
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
                        <td>{titleCase(p.provider)}</td>
                        <td>
                          <StatusBadge
                            status={p.status === 'available' ? 'active' : p.status === 'allocated' ? 'pending' : 'cancelled'}
                            label={titleCase(p.status)}
                          />
                        </td>
                        <td>{p.tenant_name ?? customerName(p.tenant_id)}</td>
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
