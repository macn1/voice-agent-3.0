import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, BookOpen, Plug, RefreshCw, Unplug } from 'lucide-react';
import {
  useConnectCalendarMutation,
  useConnectIntegrationMutation,
  useDisconnectIntegrationMutation,
  useGetBookingSettingsQuery,
  useGetIntegrationSettingQuery,
  useGetIntegrationStatusQuery,
  useListAppointmentsQuery,
  useListIntegrationCatalogQuery,
  useListIntegrationEventsQuery,
  useListIntegrationFieldsQuery,
  useListSyncLogQuery,
  useLookupTestMutation,
  usePutBookingSettingsMutation,
  usePutIntegrationMappingMutation,
  usePutIntegrationSettingMutation,
  useRunIntegrationSyncMutation,
} from '../../../store/api/integrationApi';
import { dateTime, number, titleCase } from '../../../lib/format';
import { PixelHero } from '../../../components/PixelHero';
import { Async, Badge, Button, ConfirmDialog, EmptyState, errMsg, Field, Input, Modal, PageHeader, SegmentTabs, Skeleton, StatusBadge, Toggle, useToast } from '../../../components/ui';
import { CopyField, MappingEditor, SectionCard, Select, useSection, WeekdayPicker } from '../../../components/forms';

/** Sync / call-logging / lookup settings: GET + PUT for one kind. */
function useIntegrationSetting(provider, kind) {
  return useSection(useGetIntegrationSettingQuery({ provider, kind }), usePutIntegrationSettingMutation(), (body) => ({ provider, kind, body }));
}

const CATEGORY_LABEL = { crm: 'CRM', automation: 'Automation', calendar: 'Calendar' };
const isCalendar = (item) => item?.category === 'calendar';

/** Catalog of everything that can be connected (INT-F2). */
export function IntegrationsPage() {
  const catalog = useListIntegrationCatalogQuery();
  const [params] = useSearchParams();
  const toast = useToast();
  const navigate = useNavigate();
  const items = catalog.data ?? [];

  // Back from a provider's consent page: ?provider=hubspot&status=connected
  useEffect(() => {
    const provider = params.get('provider');
    if (!provider) return;
    toast(params.get('status') === 'connected' ? `${titleCase(provider)} connected` : `${titleCase(provider)} wasn't connected`, params.get('status') === 'connected' ? undefined : 'error');
    navigate(`/integrations/${provider}`, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (catalog.isError && !catalog.data) {
    return (
      <PixelHero
        icon={Plug}
        motion="nudge"
        title="Connect the tools your team already uses"
        description="Link your CRM, calendar and automation tools so agents can look things up, book meetings and log every call."
        actions={
          <>
            <Link to="/docs" className="btn">
              <BookOpen /> Read docs
            </Link>
            <Link to="/developers" className="btn primary">
              Build with API <ArrowRight />
            </Link>
          </>
        }
      />
    );
  }

  const groups = ['crm', 'calendar', 'automation'].map((c) => [c, items.filter((i) => i.category === c)]).filter(([, list]) => list.length);
  return (
    <>
      <PageHeader
        eyebrow="Connect"
        title="Integrations"
        description="Link your CRM, calendar and automation tools so agents can look things up, book meetings and log every call."
        actions={
          <Link to="/developers" className="btn">
            Build with API <ArrowRight />
          </Link>
        }
      />
      <Async state={catalog} skeleton={<Skeleton h={220} />}>
        {() => (
          <div className="stack" style={{ gap: 28 }}>
            {groups.map(([cat, list]) => (
              <section key={cat}>
                <h2 className="text-subheading" style={{ marginBottom: 12 }}>
                  {CATEGORY_LABEL[cat] ?? titleCase(cat)}
                </h2>
                <div className="grid-3">
                  {list.map((i) => (
                    <Link key={i.key} to={`/integrations/${i.key}`} className="card card-pad stack" style={{ gap: 10, textDecoration: 'none', color: 'inherit' }}>
                      <div className="row between">
                        <span className="clay fw-bold" style={{ width: 44, height: 44, borderRadius: 12 }}>
                          {i.name[0]}
                        </span>
                        {i.connected ? <Badge tone="green">Connected</Badge> : <Badge plain>{i.auth_type === 'oauth' ? 'Sign in' : 'API key'}</Badge>}
                      </div>
                      <div>
                        <div className="card-title">{i.name}</div>
                        <p className="muted small" style={{ margin: '4px 0 0' }}>
                          {i.description}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </Async>
    </>
  );
}

/** Integration detail with per-category tabs (INT-F2, F4–F9, ACT-02). */
export function IntegrationDetailPage() {
  const { provider = '' } = useParams();
  const toast = useToast();
  const catalog = useListIntegrationCatalogQuery();
  const item = (catalog.data ?? []).find((i) => i.key === provider);
  const status = useGetIntegrationStatusQuery(provider, { skip: !item?.connected });
  const [connectCalendar] = useConnectCalendarMutation();
  const [connectIntegration] = useConnectIntegrationMutation();
  const [disconnectIntegration] = useDisconnectIntegrationMutation();
  const [busy, setBusy] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [keyForm, setKeyForm] = useState(null);
  const [secrets, setSecrets] = useState(null);

  const startConnect = async () => {
    if (isCalendar(item)) {
      setBusy(true);
      try {
        await connectCalendar(provider).unwrap();
        toast('Calendar connected');
      } catch (e) {
        toast(errMsg(e), 'error');
      } finally {
        setBusy(false);
      }
    } else if (item.auth_type === 'oauth') {
      setBusy(true);
      try {
        const r = await connectIntegration({ provider, redirect_url: `${window.location.origin}/integrations` }).unwrap();
        // Finish on the provider's consent page; it sends you back to /integrations?provider=&status=.
        if (r?.authorize_url) window.location.href = r.authorize_url;
        else toast('Connected');
      } catch (e) {
        toast(errMsg(e), 'error');
      } finally {
        setBusy(false);
      }
    } else {
      setKeyForm({ api_key: '', account_label: '' });
    }
  };

  const submitKey = async () => {
    setBusy(true);
    try {
      const r = await connectIntegration({ provider, api_key: keyForm.api_key.trim(), ...(keyForm.account_label.trim() ? { account_label: keyForm.account_label.trim() } : {}) }).unwrap();
      setKeyForm(null);
      if (r?.webhook_url) setSecrets({ url: r.webhook_url, secret: r.webhook_secret });
      else toast('Connected');
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Link to="/integrations" className="back-link">
        <ArrowLeft /> Integrations
      </Link>
      <Async state={catalog} skeleton={<Skeleton h={120} />}>
        {() =>
          !item ? (
            <EmptyState title="Unknown integration" description="It isn't in the catalog." action={<Link to="/integrations" className="btn">All integrations</Link>} />
          ) : (
            <>
              <header className="agent-head">
                <div className="row" style={{ gap: 16, alignItems: 'flex-start' }}>
                  <span className="clay fw-bold text-heading-lg" style={{ width: 56, height: 56, borderRadius: 16 }}>
                    {item.name[0]}
                  </span>
                  <div>
                    <div className="row" style={{ gap: 10 }}>
                      <h1 className="text-detail-title">{item.name}</h1>
                      <StatusBadge
                        status={item.connected ? (status.data?.health === 'error' ? 'failed' : 'active') : 'cancelled'}
                        label={item.connected ? (status.data?.health === 'error' ? 'Error' : 'Connected') : 'Not connected'}
                      />
                      {status.data?.is_simulated && <Badge plain>Demo connection</Badge>}
                    </div>
                    <p className="muted" style={{ marginTop: 6, maxWidth: 560 }}>
                      {item.description}
                    </p>
                    {item.connected && status.data && (
                      <p className="small muted" style={{ marginTop: 4 }}>
                        {status.data.account_label ? `${status.data.account_label} · ` : ''}
                        {status.data.last_sync_at ? `last sync ${dateTime(status.data.last_sync_at)}` : 'not synced yet'}
                      </p>
                    )}
                  </div>
                </div>
                {item.connected ? (
                  <Button variant="danger" icon={<Unplug />} onClick={() => setDisconnecting(true)}>
                    Disconnect
                  </Button>
                ) : (
                  <Button variant="primary" icon={<Plug />} loading={busy} onClick={startConnect}>
                    Connect
                  </Button>
                )}
              </header>
              {status.data?.last_error && <div className="banner danger">{status.data.last_error}</div>}
              {!item.connected ? (
                <div className="card card-pad">
                  <div className="card-title">What it can do</div>
                  <ul className="small" style={{ marginTop: 10 }}>
                    {(item.capabilities ?? []).map((c) => (
                      <li key={c}>{CAPABILITY[c] ?? titleCase(c)}</li>
                    ))}
                  </ul>
                  <p className="muted small">
                    {isCalendar(item)
                      ? 'Connecting links a calendar for booking (demo: no sign-in needed).'
                      : item.auth_type === 'oauth'
                        ? `You'll sign in to ${item.name} and approve access.`
                        : `You'll paste an API key from ${item.name}; it is stored encrypted.`}{' '}
                    You can disconnect at any time.
                  </p>
                </div>
              ) : (
                <ConnectedTabs item={item} />
              )}
              <Modal
                open={!!keyForm}
                onClose={() => setKeyForm(null)}
                title={`Connect ${item.name}`}
                footer={
                  <>
                    <Button onClick={() => setKeyForm(null)}>Cancel</Button>
                    <Button variant="primary" loading={busy} disabled={!keyForm?.api_key.trim()} onClick={submitKey}>
                      Connect
                    </Button>
                  </>
                }
              >
                <div className="stack">
                  <Field label="API key" hint={`From your ${item.name} account settings.`}>
                    <Input type="password" autoFocus value={keyForm?.api_key ?? ''} onChange={(e) => setKeyForm({ ...keyForm, api_key: e.target.value })} />
                  </Field>
                  <Field label="Account name" hint="Optional — how this connection is shown.">
                    <Input value={keyForm?.account_label ?? ''} onChange={(e) => setKeyForm({ ...keyForm, account_label: e.target.value })} />
                  </Field>
                </div>
              </Modal>
              <Modal
                open={!!secrets}
                onClose={() => setSecrets(null)}
                title="Connected — set up CRM events"
                description="To start calls from events in your CRM, send them to this address, signed with the secret. The secret is shown only once."
                footer={
                  <Button variant="primary" onClick={() => setSecrets(null)}>
                    Done
                  </Button>
                }
              >
                <div className="stack">
                  <Field label="Webhook URL">
                    <CopyField value={secrets?.url ?? ''} />
                  </Field>
                  <Field label="Signing secret">
                    <CopyField value={secrets?.secret ?? ''} />
                  </Field>
                </div>
              </Modal>
              <ConfirmDialog
                open={disconnecting}
                onClose={() => setDisconnecting(false)}
                danger
                title={`Disconnect ${item.name}?`}
                description="Syncing, call logging and lookups stop. Settings are kept if you reconnect."
                confirmLabel="Disconnect"
                onConfirm={async () => {
                  await disconnectIntegration(provider).unwrap();
                }}
              />
            </>
          )
        }
      </Async>
    </>
  );
}

const CAPABILITY = {
  contact_sync: 'Sync contacts both ways',
  call_logging: 'Log every call as an activity',
  lookup: 'Look up callers so the agent can greet them by name',
  events: 'Start calls from events in the CRM',
};

function ConnectedTabs({ item }) {
  const tabs =
    item.category === 'crm'
      ? [
          { value: 'sync', label: 'Contacts sync' },
          { value: 'logging', label: 'Call logging' },
          { value: 'lookup', label: 'Caller lookup' },
          ...(item.capabilities?.includes('events') ? [{ value: 'triggers', label: 'Triggers' }] : []),
        ]
      : item.category === 'calendar'
        ? [{ value: 'booking', label: 'Booking' }]
        : [{ value: 'automation', label: 'Setup' }];
  const [tab, setTab] = useState(tabs[0].value);
  const p = item.key;
  return (
    <>
      {tabs.length > 1 && <SegmentTabs value={tab} onChange={setTab} items={tabs} />}
      {tab === 'sync' && <SyncTab provider={p} />}
      {tab === 'logging' && <LoggingTab provider={p} />}
      {tab === 'lookup' && <LookupTab provider={p} />}
      {tab === 'triggers' && <TriggersTab provider={p} />}
      {tab === 'booking' && <BookingTab provider={p} />}
      {tab === 'automation' && <AutomationTab name={item.name} />}
    </>
  );
}

const FREQUENCIES = [
  { value: 15, label: 'Every 15 minutes' },
  { value: 60, label: 'Every hour' },
  { value: 360, label: 'Every 6 hours' },
  { value: 1440, label: 'Daily' },
];

function SyncTab({ provider }) {
  const toast = useToast();
  const s = useIntegrationSetting(provider, 'sync');
  const fields = useListIntegrationFieldsQuery(provider);
  const log = useListSyncLogQuery(provider);
  const [runSync, { isLoading: running }] = useRunIntegrationSyncMutation();
  const [putMapping, { isLoading: savingMap }] = usePutIntegrationMappingMutation();
  // The API stores the mapping but has no route to read it back, so edits start empty each visit.
  const [mapping, setMapping] = useState({});
  return (
    <div className="stack">
      <SectionCard
        title="Contacts sync"
        section={s}
        actions={
          <Button
            size="sm"
            icon={<RefreshCw />}
            loading={running}
            onClick={async () => {
              try {
                const r = await runSync(provider).unwrap();
                toast(r.status === 'completed' ? 'Sync finished' : `Sync ${r.status}`, r.status === 'failed' ? 'error' : undefined);
              } catch (e) {
                toast(errMsg(e), 'error');
              }
            }}
          >
            Sync now
          </Button>
        }
      >
        {(v, patch) => (
          <>
            <Toggle checked={v.enabled} onChange={(x) => patch({ enabled: x })} label="Keep contacts in sync automatically" />
            <div className="form-grid">
              <Field label="Direction">
                <Select
                  value={v.direction}
                  options={[
                    { value: 'import', label: 'CRM → Aurlynn' },
                    { value: 'export', label: 'Aurlynn → CRM' },
                    { value: 'two_way', label: 'Both ways' },
                  ]}
                  onChange={(e) => patch({ direction: e.target.value })}
                />
              </Field>
              <Field label="How often">
                <Select value={v.frequency_minutes} options={FREQUENCIES} onChange={(e) => patch({ frequency_minutes: Number(e.target.value) })} />
              </Field>
            </div>
            <Toggle
              checked={v.create_missing_contacts}
              onChange={(x) => patch({ create_missing_contacts: x })}
              label="Create contacts that don't exist yet"
              description="When off, only contacts you already have are updated."
            />
          </>
        )}
      </SectionCard>
      <div className="card card-pad stack">
        <div>
          <div className="card-title">Field mapping</div>
          <div className="card-sub">Which CRM field fills which Aurlynn field. Saving replaces the mapping.</div>
        </div>
        <Async state={fields} skeleton={<Skeleton h={80} />}>
          {(f) => (
            <MappingEditor
              value={mapping}
              onChange={setMapping}
              keyLabel="CRM field"
              valueLabel="Aurlynn field"
              keyOptions={(f.fields ?? []).map((x) => ({ value: x.key, label: x.label }))}
              valueOptions={(f.platform_fields ?? []).map((x) => ({ value: x.key, label: x.label }))}
            />
          )}
        </Async>
        <div>
          <Button
            variant="primary"
            loading={savingMap}
            disabled={!Object.keys(mapping).length}
            onClick={() =>
              putMapping({ provider, field_mapping: mapping })
                .unwrap()
                .then(() => toast('Mapping saved'))
                .catch((e) => toast(errMsg(e), 'error'))
            }
          >
            Save mapping
          </Button>
        </div>
      </div>
      <SyncLog log={log} />
    </div>
  );
}

function SyncLog({ log }) {
  return (
    <div className="card">
      <div className="card-head">
        <h2>Sync log</h2>
      </div>
      <Async state={log}>
        {(runs) =>
          runs.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Started</th>
                    <th>What</th>
                    <th>Result</th>
                    <th className="num">Imported</th>
                    <th className="num">Exported</th>
                    <th className="num">Skipped</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id}>
                      <td className="muted">{dateTime(r.started_at)}</td>
                      <td>
                        {titleCase(r.kind)} · {titleCase(r.direction ?? '')}
                      </td>
                      <td>
                        <StatusBadge
                          status={['ok', 'completed'].includes(r.status) ? 'active' : r.status === 'running' ? 'pending' : r.status === 'partial' ? 'expired' : 'failed'}
                          label={titleCase(r.status)}
                        />
                        {(r.errors ?? []).map((e, i) => (
                          <div key={i} className="cell-sub" style={{ color: 'var(--red)' }}>
                            {e.record ? `${e.record}: ` : ''}
                            {e.error ?? e.message ?? String(e)}
                          </div>
                        ))}
                      </td>
                      <td className="num">{number((r.counts?.imported_created ?? 0) + (r.counts?.imported_updated ?? 0))}</td>
                      <td className="num">{number(r.counts?.exported)}</td>
                      <td className="num">{number(r.counts?.skipped)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No syncs yet" />
          )
        }
      </Async>
    </div>
  );
}

function LoggingTab({ provider }) {
  const s = useIntegrationSetting(provider, 'callLogging');
  return (
    <SectionCard title="Log calls into the CRM" description="After each call, an activity is created on the matching contact." section={s}>
      {(v, patch) => (
        <>
          <Toggle checked={v.enabled} onChange={(x) => patch({ enabled: x })} label="Log every call" />
          <div className="form-grid">
            <Field label="Log it as">
              <Select
                value={v.log_as}
                options={[
                  { value: 'activity', label: 'An activity' },
                  { value: 'note', label: 'A note' },
                ]}
                onChange={(e) => patch({ log_as: e.target.value })}
              />
            </Field>
          </div>
          <div className="field">
            <span className="field-label">What to write</span>
            <div className="perm-grid">
              {[
                ['include_summary', 'Call summary'],
                ['include_transcript', 'Full transcript'],
                ['include_recording_link', 'Recording link'],
                ['only_answered', 'Only calls that were answered'],
              ].map(([key, label]) => (
                <label key={key} className="check">
                  <input type="checkbox" checked={!!v[key]} onChange={(e) => patch({ [key]: e.target.checked })} />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <Field label="Outcome → lead status">
            <MappingEditor value={v.outcome_mapping ?? {}} onChange={(m) => patch({ outcome_mapping: m })} keyLabel="Call outcome" valueLabel="CRM status" />
          </Field>
        </>
      )}
    </SectionCard>
  );
}

function LookupTab({ provider }) {
  const toast = useToast();
  const s = useIntegrationSetting(provider, 'lookup');
  const fields = useListIntegrationFieldsQuery(provider);
  const [lookupTest, { isLoading }] = useLookupTestMutation();
  const [phone, setPhone] = useState('');
  const [res, setRes] = useState(null);
  const options = (fields.data?.fields ?? []).map((f) => f.key);
  return (
    <div className="stack">
      <SectionCard
        title="Caller lookup"
        description="Find the caller in the CRM by phone and pass their details into the call so the agent greets them by name."
        section={s}
      >
        {(v, patch) => (
          <>
            <Toggle checked={v.enabled} onChange={(x) => patch({ enabled: x })} label="Look up callers" />
            <Toggle checked={v.greet_by_name} onChange={(x) => patch({ greet_by_name: x })} label="Greet them by name" />
            <div className="form-grid">
              <Field label="Remember a lookup for (minutes)">
                <Input type="number" min={0} value={v.cache_minutes} onChange={(e) => patch({ cache_minutes: Number(e.target.value) })} />
              </Field>
            </div>
            <Field label="CRM fields to pass to the agent">
              <div className="row wrap" style={{ gap: 12 }}>
                {(options.length ? options : v.fields ?? []).map((f) => (
                  <label key={f} className="check">
                    <input
                      type="checkbox"
                      checked={(v.fields ?? []).includes(f)}
                      onChange={(e) => patch({ fields: e.target.checked ? [...(v.fields ?? []), f] : (v.fields ?? []).filter((x) => x !== f) })}
                    />
                    {f}
                  </label>
                ))}
              </div>
            </Field>
          </>
        )}
      </SectionCard>
      <div className="card card-pad stack">
        <div className="card-title">Try a number</div>
        <div className="row">
          <Input className="mono" placeholder="+919876543210" value={phone} onChange={(e) => setPhone(e.target.value)} style={{ maxWidth: 260 }} />
          <Button
            loading={isLoading}
            disabled={!phone.trim()}
            onClick={() =>
              lookupTest({ provider, phone: phone.trim() })
                .unwrap()
                .then(setRes)
                .catch((e) => toast(errMsg(e), 'error'))
            }
          >
            Look up
          </Button>
        </div>
        {res &&
          (res.found ? (
            <>
              <pre className="code">{JSON.stringify(res.record, null, 2)}</pre>
              {res.source && <span className="muted small">Source: {res.source}</span>}
            </>
          ) : (
            <span className="muted small">No record found for that number.</span>
          ))}
      </div>
    </div>
  );
}

function TriggersTab({ provider }) {
  const events = useListIntegrationEventsQuery(provider);
  return (
    <div className="card card-pad stack">
      <div className="card-title">Calls triggered from the CRM</div>
      <p className="muted small">Pick one of these events in a call trigger to call automatically — for example when a contact is created.</p>
      <Async state={events}>
        {(evs) => (
          <div className="tag-list">
            {evs.map((e) => (
              <span key={e.key} className="tag" title={e.description}>
                {e.key}
              </span>
            ))}
          </div>
        )}
      </Async>
      <div>
        <Link to="/workflows?tab=triggers" className="btn primary">
          Create a CRM trigger
        </Link>
      </div>
    </div>
  );
}

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function BookingTab({ provider }) {
  const s = useSection(useGetBookingSettingsQuery(), usePutBookingSettingsMutation());
  const appts = useListAppointmentsQuery();
  return (
    <div className="stack">
      <SectionCard title="Booking rules" description="When agents may book appointments on this calendar." section={s}>
        {(v, patch) => (
          <>
            <div className="form-grid">
              <Field label="Slot length (minutes)">
                <Input type="number" min={5} value={v.slot_minutes} onChange={(e) => patch({ slot_minutes: Number(e.target.value) })} />
              </Field>
              <Field label="Buffer between slots (minutes)">
                <Input type="number" min={0} value={v.buffer_minutes} onChange={(e) => patch({ buffer_minutes: Number(e.target.value) })} />
              </Field>
              <Field label="Book up to (days ahead)">
                <Input type="number" min={1} value={v.booking_window_days} onChange={(e) => patch({ booking_window_days: Number(e.target.value) })} />
              </Field>
              <Field label="Minimum notice (minutes)">
                <Input type="number" min={0} value={v.min_notice_minutes} onChange={(e) => patch({ min_notice_minutes: Number(e.target.value) })} />
              </Field>
            </div>
            <div className="field">
              <span className="field-label">Bookable days</span>
              <WeekdayPicker
                value={DAYS.filter((d) => (v.hours?.[d] ?? []).length > 0)}
                onChange={(days) =>
                  patch({
                    hours: Object.fromEntries(DAYS.map((d) => [d, days.includes(d) ? (v.hours?.[d]?.length ? v.hours[d] : [{ start: '09:00', end: '18:00' }]) : []])),
                  })
                }
              />
            </div>
            <div className="stack" style={{ gap: 8 }}>
              {DAYS.filter((d) => (v.hours?.[d] ?? []).length > 0).map((d) => (
                <div key={d} className="row wrap" style={{ gap: 8 }}>
                  <span className="fw-medium" style={{ width: 44, textTransform: 'capitalize' }}>
                    {d}
                  </span>
                  {v.hours[d].map((w, i) => (
                    <span key={i} className="row" style={{ gap: 6 }}>
                      <input
                        type="time"
                        className="input"
                        style={{ width: 120, height: 38 }}
                        value={w.start}
                        onChange={(e) => patch({ hours: { ...v.hours, [d]: v.hours[d].map((x, j) => (j === i ? { ...x, start: e.target.value } : x)) } })}
                      />
                      –
                      <input
                        type="time"
                        className="input"
                        style={{ width: 120, height: 38 }}
                        value={w.end}
                        onChange={(e) => patch({ hours: { ...v.hours, [d]: v.hours[d].map((x, j) => (j === i ? { ...x, end: e.target.value } : x)) } })}
                      />
                    </span>
                  ))}
                </div>
              ))}
            </div>
            <p className="muted small" style={{ margin: 0 }}>
              Bookings go to {titleCase(v.calendar_provider ?? provider)}.
            </p>
          </>
        )}
      </SectionCard>
      <div className="card">
        <div className="card-head">
          <h2>Appointments booked by agents</h2>
        </div>
        <Async state={appts}>
          {(list) =>
            list.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Who</th>
                      <th>Details</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((a) => (
                      <tr key={a.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>{dateTime(a.starts_at ?? a.start_at ?? a.start)}</td>
                        <td>
                          <div className="cell-main">{a.contact_name ?? a.name ?? a.contact_phone ?? a.phone ?? '—'}</div>
                          <div className="cell-sub">{a.agent_name ?? ''}</div>
                        </td>
                        <td className="small muted">{a.details && typeof a.details === 'object' ? Object.values(a.details).join(' · ') : (a.notes ?? a.title ?? '')}</td>
                        <td>
                          <StatusBadge
                            status={a.status === 'booked' ? 'active' : ['cancelled', 'no_show'].includes(a.status) ? 'cancelled' : 'pending'}
                            label={titleCase(a.status ?? '')}
                          />
                        </td>
                        <td>{a.call_id && <Link to={`/calls/${a.call_id}`}>Call</Link>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="No appointments yet" />
            )
          }
        </Async>
      </div>
    </div>
  );
}

/** EXT-02 no-code connectors: triggers = our webhooks, actions = our API with a key. */
function AutomationTab({ name }) {
  return (
    <div className="card card-pad stack">
      <div className="card-title">Set up {name}</div>
      <ol className="small lh-spacious">
        <li>
          Create an API key on <Link to="/developers?tab=keys">Deploy with code → API keys</Link>.
        </li>
        <li>In {name}, add the Aurlynn app and paste the key. It is exchanged for a short-lived token automatically.</li>
        <li>
          Triggers (call completed, campaign completed) arrive as <Link to="/developers?tab=webhooks">webhooks</Link>; the “Place a call” and “Add contact” actions use the connector API.
        </li>
      </ol>
    </div>
  );
}
