import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Ban, Check, FileText, Globe, Pencil, Phone, Play, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { date, dateTime, money, number, titleCase } from '../../lib/format';
import { asList, normalizeUsage } from '../../lib/normalize';
import {
  useActivateCustomerMutation,
  useAddDomainMutation,
  useAllocateNumberMutation,
  useAssignPackageMutation,
  useDeleteDomainMutation,
  useGetCustomerQuery,
  useGetTenantSettingsQuery,
  useGetTenantSubscriptionHistoryQuery,
  useGetTenantSubscriptionQuery,
  useGetTenantUsageQuery,
  useLazyGetTenantInvoiceQuery,
  useListAdminPackagesQuery,
  useListDomainsQuery,
  useListLlmProvidersQuery,
  useListNumberPoolQuery,
  useListTenantInvoicesQuery,
  useListTenantNumbersQuery,
  usePutTenantSettingsMutation,
  useReleaseNumberMutation,
  useSuspendCustomerMutation,
  useUpdateCustomerMutation,
  useVerifyDomainMutation,
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
  SegmentTabs,
  Skeleton,
  StatusBadge,
  Toggle,
  useToast,
} from '../../components/ui';
import { InvoiceTable, PackageFeatures } from '../customer/settings/BillingPages';

export function CustomerDetailPage() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'overview';
  const tenant = useGetCustomerQuery(id);
  const { can } = useAuth();

  const tabs = [
    { value: 'overview', label: 'Overview' },
    ...(can('domain.manage') ? [{ value: 'domains', label: 'Domains' }] : []),
    ...(can('settings.manage') ? [{ value: 'settings', label: 'Settings' }] : []),
    { value: 'plan', label: 'Plan' },
    { value: 'invoices', label: 'Invoices' },
    { value: 'usage', label: 'Usage' },
    { value: 'numbers', label: 'Numbers' },
  ];

  return (
    <>
      <Link to="/admin/customers" className="back-link">
        <ArrowLeft /> Customers
      </Link>
      <Async state={tenant} skeleton={<Skeleton h={60} w={360} style={{ marginBottom: 28 }} />}>
        {(t) => (
          <header className="page-head">
            <div>
              <div className="eyebrow">Customer</div>
              <div className="row" style={{ gap: 12, marginTop: 10 }}>
                <h1 style={{ margin: 0 }}>{t.name}</h1>
                <StatusBadge status={t.status} />
              </div>
              <p className="mono" style={{ fontSize: 13 }}>
                {t.slug} · {t.id}
              </p>
            </div>
          </header>
        )}
      </Async>
      <SegmentTabs value={tab} onChange={(v) => setParams({ tab: v }, { replace: true })} items={tabs} />
      {tenant.data && (
        <>
          {tab === 'overview' && <OverviewTab tenant={tenant.data} />}
          {tab === 'domains' && <DomainsTab tenantId={id} />}
          {tab === 'settings' && <SettingsTab tenant={tenant.data} />}
          {tab === 'plan' && <PlanTab tenantId={id} />}
          {tab === 'invoices' && <InvoicesTab tenantId={id} />}
          {tab === 'usage' && <UsageTab tenantId={id} />}
          {tab === 'numbers' && <NumbersTab tenantId={id} />}
        </>
      )}
    </>
  );
}

/* Overview (ADM-03) -------------------------------------------------- */

function OverviewTab({ tenant }) {
  const { can } = useAuth();
  const toast = useToast();
  const [suspendCustomer] = useSuspendCustomerMutation();
  const [activateCustomer] = useActivateCustomerMutation();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const suspended = tenant.status === 'suspended';

  return (
    <div className="grid-2" style={{ alignItems: 'start' }}>
      <div className="card">
        <div className="card-head">
          <h2>Details</h2>
          {can('customer.update') && (
            <Button size="sm" icon={<Pencil />} onClick={() => setEditing(true)}>
              Edit
            </Button>
          )}
        </div>
        <div className="card-pad">
          <dl className="kv">
            <dt>Name</dt>
            <dd>{tenant.name}</dd>
            <dt>Slug</dt>
            <dd className="mono">{tenant.slug}</dd>
            <dt>Status</dt>
            <dd>
              <StatusBadge status={tenant.status} />
            </dd>
            <dt>Created</dt>
            <dd>{dateTime(tenant.created_at)}</dd>
            <dt>Last updated</dt>
            <dd>{dateTime(tenant.updated_at)}</dd>
          </dl>
        </div>
      </div>

      <div className="card card-pad">
        <div className="card-title">{suspended ? 'Account suspended' : 'Account access'}</div>
        <p className="muted small" style={{ marginTop: 6, marginBottom: 18 }}>
          {suspended
            ? "This company's staff can't sign in and its calls are not answered. Activate it to restore access."
            : 'Suspending blocks every staff login for this company and stops its agents answering calls.'}
        </p>
        {suspended
          ? can('customer.activate') && (
              <Button variant="primary" icon={<Play />} onClick={() => setConfirm('activate')}>
                Activate customer
              </Button>
            )
          : can('customer.suspend') && (
              <Button variant="danger" icon={<Ban />} onClick={() => setConfirm('suspend')}>
                Suspend customer
              </Button>
            )}
      </div>

      <EditCustomerModal tenant={editing ? tenant : null} onClose={() => setEditing(false)} onSaved={() => toast('Customer updated')} />

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        danger={confirm === 'suspend'}
        title={confirm === 'suspend' ? `Suspend ${tenant.name}?` : `Activate ${tenant.name}?`}
        description={
          confirm === 'suspend' ? 'Their staff are signed out and blocked until you activate the account again.' : 'Their staff can sign in again immediately.'
        }
        confirmLabel={confirm === 'suspend' ? 'Suspend' : 'Activate'}
        onConfirm={async () => {
          await (confirm === 'suspend' ? suspendCustomer(tenant.id) : activateCustomer(tenant.id)).unwrap();
          toast(confirm === 'suspend' ? 'Customer suspended' : 'Customer activated');
        }}
      />
    </div>
  );
}

function EditCustomerModal({ tenant, onClose, onSaved }) {
  const [updateCustomer] = useUpdateCustomerMutation();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (tenant) {
      setName(tenant.name);
      setSlug(tenant.slug);
      setError(null);
    }
  }, [tenant]);

  return (
    <Modal
      open={!!tenant}
      onClose={onClose}
      title="Edit customer"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              if (!tenant) return;
              const body = {};
              if (name.trim() !== tenant.name) body.name = name.trim();
              if (slug !== tenant.slug) body.slug = slug;
              if (!Object.keys(body).length) return onClose();
              if (!body.name && body.name !== undefined) return setError('Name is required');
              setBusy(true);
              setError(null);
              try {
                await updateCustomer({ id: tenant.id, ...body }).unwrap();
                onSaved();
                onClose();
              } catch (e) {
                setError(errMsg(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="stack">
        {error && <div className="alert-inline">{error}</div>}
        <Field label="Company name">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Slug" hint="Changing it can break links that use the old slug.">
          <Input className="mono" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} />
        </Field>
      </div>
    </Modal>
  );
}

/* Domains (ADM-04) --------------------------------------------------- */

function DomainsTab({ tenantId }) {
  const toast = useToast();
  const domains = useListDomainsQuery(tenantId);
  const [addDomain] = useAddDomainMutation();
  const [deleteDomain] = useDeleteDomainMutation();
  const [verifyDomain] = useVerifyDomainMutation();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [domain, setDomain] = useState('');
  const [primary, setPrimary] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Domains</h2>
          <div className="card-sub">Custom domains the customer's dashboard is served on.</div>
        </div>
        <Button
          variant="primary"
          icon={<Plus />}
          onClick={() => {
            setDomain('');
            setPrimary(false);
            setError(null);
            setAdding(true);
          }}
        >
          Add domain
        </Button>
      </div>
      <Async state={domains}>
        {(data) => {
          const list = asList(data);
          if (!list.length) return <EmptyState icon={<Globe />} title="No domains" description="Add a domain like app.customer.com." />;
          return (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Domain</th>
                    <th>Verification</th>
                    <th>Added</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {list.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <div className="row" style={{ gap: 8 }}>
                          <span className="cell-main mono" style={{ fontSize: 13.5 }}>
                            {d.domain}
                          </span>
                          {d.is_primary && <Badge tone="ink">Primary</Badge>}
                        </div>
                      </td>
                      <td>
                        <StatusBadge status={d.verification_status} />
                        {d.verification_status !== 'verified' && (
                          <div className="cell-sub">
                            Add a TXT record <span className="mono">_aurlynn-verify.{d.domain}</span> and a CNAME to{' '}
                            <span className="mono">{window.location.host}</span>, then verify.
                          </div>
                        )}
                      </td>
                      <td className="muted">{date(d.created_at)}</td>
                      <td className="actions">
                        {d.verification_status !== 'verified' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<ShieldCheck />}
                            onClick={() =>
                              verifyDomain({ tenantId, domainId: d.id })
                                .unwrap()
                                .then((r) => {
                                  toast(r.verification_status === 'verified' ? 'Domain verified' : 'DNS records not found yet — try again in a few minutes');
                                })
                                .catch((e) => toast(errMsg(e), 'error'))
                            }
                          >
                            Verify now
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" icon={<Trash2 />} onClick={() => setRemoving(d)}>
                          Remove
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }}
      </Async>

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Add domain"
        footer={
          <>
            <Button onClick={() => setAdding(false)}>Cancel</Button>
            <Button
              variant="primary"
              loading={busy}
              onClick={async () => {
                const d = domain.trim().toLowerCase();
                if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(d)) return setError('Enter a domain like app.example.com');
                setBusy(true);
                setError(null);
                try {
                  await addDomain({ tenantId, domain: d, is_primary: primary }).unwrap();
                  toast('Domain added');
                  setAdding(false);
                } catch (e) {
                  setError(errMsg(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Add domain
            </Button>
          </>
        }
      >
        <div className="stack">
          {error && <div className="alert-inline">{error}</div>}
          <Field label="Domain">
            <Input autoFocus className="mono" placeholder="app.example.com" value={domain} onChange={(e) => setDomain(e.target.value)} />
          </Field>
          <Toggle checked={primary} onChange={setPrimary} label="Primary domain" description="Used in links and emails for this customer." />
        </div>
      </Modal>

      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        danger
        title={`Remove ${removing?.domain}?`}
        description="The customer's dashboard stops loading on this domain."
        confirmLabel="Remove"
        onConfirm={async () => {
          await deleteDomain({ tenantId, domainId: removing.id }).unwrap();
          toast('Domain removed');
        }}
      />
    </div>
  );
}

/* Settings (ADM-05) -------------------------------------------------- */

// No catalog endpoint yet (ADM-05.3), so the selectable providers are fixed.
const LLM_PROVIDERS = [
  { id: 'openai', label: 'OpenAI' },
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'google', label: 'Google Gemini' },
  { id: 'azure-openai', label: 'Azure OpenAI' },
  { id: 'groq', label: 'Groq' },
  { id: 'sarvam', label: 'Sarvam AI' },
];

const LOCALES = ['en-US', 'en-IN', 'hi-IN', 'bn-IN', 'ta-IN', 'te-IN', 'mr-IN', 'gu-IN', 'kn-IN', 'ml-IN', 'pa-IN'];

const DEFAULT_SETTINGS = {
  llm_provider_ids: [],
  transcripts_visible_to_customer: true,
  branding: {},
  default_locale: 'en-IN',
};

function SettingsTab({ tenant }) {
  const toast = useToast();
  const [s, setS] = useState(tenant.settings ?? DEFAULT_SETTINGS);
  const [error, setError] = useState(null);
  const catalog = useListLlmProvidersQuery();
  // ADM-05.2: prefill from the read route once it exists.
  const remote = useGetTenantSettingsQuery(tenant.id);
  const known = remote.data ?? tenant.settings;
  const [putSettings, { isLoading: busy }] = usePutTenantSettingsMutation();
  useEffect(() => {
    if (remote.data) setS({ ...DEFAULT_SETTINGS, ...remote.data });
  }, [remote.data]);

  const base = catalog.data?.length ? catalog.data.map((p) => ({ id: p.id, label: p.name })) : LLM_PROVIDERS;
  const providers = [...base, ...s.llm_provider_ids.filter((id) => !base.some((p) => p.id === id)).map((id) => ({ id, label: id }))];
  const toggleProvider = (id) =>
    setS((x) => ({
      ...x,
      llm_provider_ids: x.llm_provider_ids.includes(id) ? x.llm_provider_ids.filter((p) => p !== id) : [...x.llm_provider_ids, id],
    }));

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Customer settings</h2>
          <div className="card-sub">What this customer is allowed to use, and how their dashboard looks.</div>
        </div>
        <Button
          variant="primary"
          loading={busy}
          icon={<Check />}
          onClick={async () => {
            setError(null);
            try {
              await putSettings({ tenantId: tenant.id, body: s }).unwrap();
              toast('Settings saved');
            } catch (e) {
              setError(errMsg(e));
            }
          }}
        >
          Save settings
        </Button>
      </div>
      <div className="card-pad stack" style={{ gap: 26 }}>
        {error && <div className="alert-inline">{error}</div>}
        {!known && (
          <div className="banner info" style={{ marginBottom: 0 }}>
            <span className="grow">
              Current settings can't be read yet (no read route), so defaults are shown. Saving replaces all settings for this customer.
            </span>
          </div>
        )}
        <div className="field">
          <span className="field-label">Allowed AI model providers</span>
          <div className="row wrap" style={{ gap: 8 }}>
            {providers.map((p) => {
              const on = s.llm_provider_ids.includes(p.id);
              return (
                <button key={p.id} type="button" className={`chip ${on ? 'active' : ''}`} onClick={() => toggleProvider(p.id)} aria-pressed={on}>
                  {on && <Check size={14} />}
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
        <Toggle
          checked={s.transcripts_visible_to_customer}
          onChange={(v) => setS((x) => ({ ...x, transcripts_visible_to_customer: v }))}
          label="Customer can see call transcripts"
          description="When off, transcripts are hidden from the customer's call log."
        />

        <div className="form-grid">
          <Field label="Default language">
            <select className="select" value={s.default_locale} onChange={(e) => setS((x) => ({ ...x, default_locale: e.target.value }))}>
              {[...new Set([s.default_locale, ...LOCALES])].map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </Field>
          <Field label="Brand colour">
            <div className="row" style={{ gap: 10 }}>
              <input
                type="color"
                className="color-input"
                value={s.branding.primary_color ?? '#111111'}
                onChange={(e) =>
                  setS((x) => ({
                    ...x,
                    branding: { ...x.branding, primary_color: e.target.value },
                  }))
                }
              />

              <Input
                className="mono"
                value={s.branding.primary_color ?? ''}
                placeholder="#111111"
                onChange={(e) =>
                  setS((x) => ({
                    ...x,
                    branding: { ...x.branding, primary_color: e.target.value },
                  }))
                }
              />
            </div>
          </Field>
          <Field label="Logo URL" className="full" hint="Shown on the customer's dashboard.">
            <Input
              placeholder="https://…/logo.svg"
              value={s.branding.logo_url ?? ''}
              onChange={(e) =>
                setS((x) => ({
                  ...x,
                  branding: {
                    ...x.branding,
                    logo_url: e.target.value || undefined,
                  },
                }))
              }
            />
          </Field>
        </div>
      </div>
    </div>
  );
}

/* Plan (ADM-09) ------------------------------------------------------ */

function PlanTab({ tenantId }) {
  const { can } = useAuth();
  const toast = useToast();
  const packages = useListAdminPackagesQuery();
  const [choice, setChoice] = useState(null);
  // ADM-09.2 / 09.3: current plan + history, when the read routes exist.
  const sub = useGetTenantSubscriptionQuery(tenantId);
  const history = useGetTenantSubscriptionHistoryQuery(tenantId);
  const [assignPackage] = useAssignPackageMutation();
  const [assignedLocal, setAssignedLocal] = useState(null);
  const assigned = sub.data ?? assignedLocal;
  const readable = !sub.error;
  const pkgName = (id) => (id ? (asList(packages.data).find((p) => p.id === id)?.name ?? id.slice(0, 8)) : '—');

  return (
    <div className="stack">
      {assigned ? (
        <div className="banner neutral">
          <Check />
          <span className="grow">
            Assigned <b>{asList(packages.data).find((p) => p.id === assigned.package_id)?.name ?? 'plan'}</b> — status {titleCase(assigned.status)}
            {assigned.current_period_end ? `, renews ${date(assigned.current_period_end)}` : ''}.
          </span>
        </div>
      ) : !readable ? (
        <div className="banner info">
          <span className="grow">The customer's current plan can't be read yet (ADM-09.2 not deployed). Assigning a plan replaces whatever they're on.</span>
        </div>
      ) : (
        <div className="banner neutral">
          <span className="grow">No plan assigned yet.</span>
        </div>
      )}
      <Async state={packages}>
        {(data) => {
          const list = asList(data).filter((p) => p.status !== 'deprecated');
          if (!list.length) return <EmptyState title="No plans" description="Create a plan on the Plans page first." />;
          return (
            <div className="grid-3">
              {list.map((p) => (
                <div key={p.id} className={`plan-card ${assigned?.package_id === p.id ? 'current' : ''}`}>
                  <div className="row between">
                    <span style={{ fontWeight: 600, fontSize: 16 }}>{p.name}</span>
                    {!p.is_public && <Badge plain>Admin only</Badge>}
                  </div>
                  <div className="price">
                    {money(p.price_amount, p.currency)} <small>/ {p.billing_cycle === 'yearly' ? 'year' : 'month'}</small>
                  </div>
                  <PackageFeatures p={p} />
                  {can('package.assign') && (
                    <Button
                      block
                      variant={assigned?.package_id === p.id ? 'default' : 'primary'}
                      disabled={assigned?.package_id === p.id}
                      onClick={() => setChoice(p)}
                      style={{ marginTop: 'auto' }}
                    >
                      {assigned?.package_id === p.id ? 'Assigned' : `Assign ${p.name}`}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          );
        }}
      </Async>
      <ConfirmDialog
        open={!!choice}
        onClose={() => setChoice(null)}
        title={`Assign ${choice?.name}?`}
        description="The new plan and its limits apply to this customer immediately."
        confirmLabel="Assign plan"
        onConfirm={async () => {
          const res = await assignPackage({ tenantId, package_id: choice.id }).unwrap();
          setAssignedLocal(res ?? { package_id: choice.id, status: 'active' });
          toast(`${choice.name} assigned`);
        }}
      />

      {history.data && (
        <div className="card">
          <div className="card-head">
            <h2>Plan history</h2>
          </div>
          {history.data.length ? (
            <table className="table">
              <tbody>
                {history.data.map((h) => (
                  <tr key={h.id}>
                    <td className="muted">{date(h.created_at)}</td>
                    <td>
                      {pkgName(h.old_package_id)} → <b>{pkgName(h.new_package_id)}</b>
                    </td>
                    <td>{titleCase(h.changed_by)}</td>
                    <td className="muted">{h.reason ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState title="No changes yet" />
          )}
        </div>
      )}
    </div>
  );
}

/* Invoices & usage (ADM-10) ------------------------------------------ */

function InvoicesTab({ tenantId }) {
  const toast = useToast();
  const invoices = useListTenantInvoicesQuery(tenantId);
  const [loadInvoice] = useLazyGetTenantInvoiceQuery();
  const [open, setOpen] = useState(null);
  return (
    <div className="card">
      <div className="card-head">
        <h2>Invoices</h2>
      </div>
      <Async state={invoices}>
        {(data) => {
          const list = asList(data);
          return list.length ? (
            <InvoiceTable
              invoices={list}
              onOpen={(inv) =>
                loadInvoice({ tenantId, invoiceId: inv.id })
                  .unwrap()
                  .then(setOpen)
                  .catch((e) => (e?.notAvailable ? setOpen(inv) : toast(errMsg(e), 'error')))
              }
            />
          ) : (
            <EmptyState icon={<FileText />} title="No invoices yet" />
          );
        }}
      </Async>
      <Modal
        open={!!open}
        onClose={() => setOpen(null)}
        wide
        title={open?.invoice_number ?? ''}
        description={open ? `${date(open.period_start)} – ${date(open.period_end)} · ${titleCase(open.status)}` : undefined}
      >
        {open && (
          <div className="stack">
            {(open.line_items ?? open.items ?? []).length ? (
              <table className="table">
                <tbody>
                  {(open.line_items ?? open.items ?? []).map((l) => (
                    <tr key={l.id}>
                      <td>{l.description || titleCase(l.item_type)}</td>
                      <td className="num">{number(l.quantity, 2)}</td>
                      <td className="num">{money(l.amount, open.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="muted small">Line items are not included in this view.</p>
            )}
            <div className="row between">
              <span className="muted">Total</span>
              <b>{money(open.total_amount, open.currency)}</b>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* Numbers (ADM-11.6) ------------------------------------------------- */

function NumbersTab({ tenantId }) {
  const toast = useToast();
  const nums = useListTenantNumbersQuery(tenantId);
  const pool = useListNumberPoolQuery();
  const [allocateNumber] = useAllocateNumberMutation();
  const [releaseNumber] = useReleaseNumberMutation();
  const [pick, setPick] = useState('');
  const [releasing, setReleasing] = useState(null);
  const available = (pool.data ?? []).filter((n) => n.status === 'available');
  return (
    <div className="card">
      <div className="card-head">
        <h2>Phone numbers</h2>
        <div className="row">
          <select className="select" style={{ height: 36, width: 220 }} value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">{available.length ? 'Pick from the pool' : 'No free numbers'}</option>
            {available.map((n) => (
              <option key={n.id} value={n.id}>
                {n.e164}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="primary"
            icon={<Plus />}
            disabled={!pick}
            onClick={() =>
              allocateNumber({ tenantId, numberId: pick })
                .unwrap()
                .then(() => setPick(''))
                .catch((e) => toast(errMsg(e), 'error'))
            }
          >
            Allocate
          </Button>
        </div>
      </div>
      <Async state={nums}>
        {(list) =>
          list.length ? (
            <table className="table">
              <tbody>
                {list.map((n) => (
                  <tr key={n.id}>
                    <td className="mono cell-main">{n.e164}</td>
                    <td>{n.agent_name ?? <span className="muted">No agent</span>}</td>
                    <td className="muted">{date(n.allocated_at)}</td>
                    <td className="actions">
                      <Button size="sm" variant="ghost" onClick={() => setReleasing(n)}>
                        Release
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState icon={<Phone />} title="No numbers allocated" />
          )
        }
      </Async>
      <ConfirmDialog
        open={!!releasing}
        onClose={() => setReleasing(null)}
        danger
        title={`Release ${releasing?.e164}?`}
        description="It goes back to the pool; calls to it stop being answered."
        confirmLabel="Release"
        onConfirm={async () => {
          await releaseNumber({ tenantId, numberId: releasing.id }).unwrap();
        }}
      />
    </div>
  );
}

function UsageTab({ tenantId }) {
  const usage = useGetTenantUsageQuery(tenantId);
  return (
    <Async state={usage} skeleton={<Skeleton h={140} />}>
      {(data) => {
        const u = normalizeUsage(data);
        const ratio = u.includedMinutes ? u.callMinutes / u.includedMinutes : undefined;
        return (
          <div className="stack">
            {(u.periodStart || u.periodEnd) && (
              <div className="muted">
                Billing period {date(u.periodStart)} – {date(u.periodEnd)}
              </div>
            )}
            <div className="grid-3">
              <div className="card stat">
                <div className="label">Call minutes</div>
                <div className="value">
                  {number(u.callMinutes, 1)}
                  {u.includedMinutes !== undefined && (
                    <span className="muted" style={{ fontSize: 15 }}>
                      {' '}
                      / {number(u.includedMinutes)}
                    </span>
                  )}
                </div>
                {ratio !== undefined && (
                  <div className={`bar ${ratio >= 1 ? 'over' : ratio >= 0.8 ? 'warn' : ''}`} style={{ marginTop: 12 }}>
                    <span style={{ width: `${Math.min(100, ratio * 100)}%` }} />
                  </div>
                )}
              </div>
              <div className="card stat">
                <div className="label">Active agents</div>
                <div className="value">{number(u.activeAgents)}</div>
              </div>
              <div className="card stat">
                <div className="label">API calls</div>
                <div className="value">{number(u.apiCalls)}</div>
              </div>
            </div>
          </div>
        );
      }}
    </Async>
  );
}
