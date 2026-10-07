import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Plug, RefreshCw, Search, Unplug } from 'lucide-react';
import {
  useConnectCalendarMutation,
  useConnectIntegrationMutation,
  useConnectSheetsMutation,
  useDisconnectIntegrationMutation,
  useGetBookingSettingsQuery,
  useGetIntegrationSettingQuery,
  useGetIntegrationStatusQuery,
  useListAppointmentsQuery,
  useListIntegrationCatalogQuery,
  useListIntegrationEventsQuery,
  useListIntegrationFieldsQuery,
  useListSheetsQuery,
  useListSyncLogQuery,
  useLookupTestMutation,
  usePutBookingSettingsMutation,
  usePutIntegrationSettingMutation,
  usePutSheetsWriteBackMutation,
  useRunIntegrationSyncMutation,
} from '../../../store/api/integrationApi';
import { dateTime, titleCase } from '../../../lib/format';
import {
  Async,
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  errMsg,
  Field,
  Input,
  PageHeader,
  SegmentTabs,
  Skeleton,
  StatusBadge,
  Toggle,
  useToast,
} from '../../../components/ui';
import { MappingEditor, SectionCard, Select, useSection, WeekdayPicker } from '../../../components/forms';

const CATEGORIES = ['all', 'crm', 'helpdesk', 'calendar', 'sheets', 'automation', 'messaging'];
const CAT_LABEL = {
  all: 'All',
  crm: 'CRM',
  helpdesk: 'Helpdesk',
  calendar: 'Calendar',
  sheets: 'Sheets',
  automation: 'Automation',
  messaging: 'Messaging',
};

/** P-31 Integrations catalog (INT-F3). */
/** Sync / call-logging / lookup / ticket settings: GET + PUT for one kind. */
function useIntegrationSetting(provider, kind) {
  return useSection(useGetIntegrationSettingQuery({ provider, kind }), usePutIntegrationSettingMutation(), (body) => ({ provider, kind, body }));
}

export function IntegrationsPage() {
  const navigate = useNavigate();
  const catalog = useListIntegrationCatalogQuery();
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');
  return (
    <>
      <PageHeader
        eyebrow="Connect"
        title="Integrations"
        description="Connect your CRM, calendar, helpdesk and automation tools so agents can look things up, book, and log every call."
      />
      <div className="row between wrap" style={{ marginBottom: 18 }}>
        <div className="tabs" style={{ margin: 0 }}>
          {CATEGORIES.map((c) => (
            <button key={c} className={`chip ${cat === c ? 'active' : ''}`} onClick={() => setCat(c)}>
              {CAT_LABEL[c]}
            </button>
          ))}
        </div>
        <div className="search">
          <Search />
          <Input placeholder="Search integrations" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <Async state={catalog} skeleton={<Skeleton h={300} />}>
        {(items) => {
          const rows = items.filter((i) => (cat === 'all' || i.category === cat) && (!q || i.name.toLowerCase().includes(q.toLowerCase())));
          return rows.length ? (
            <div className="grid-3">
              {rows.map((i) => (
                <button
                  key={i.provider}
                  className="usecase"
                  style={{
                    gridTemplateColumns: '48px minmax(0,1fr)',
                    minHeight: 0,
                  }}
                  onClick={() => navigate(`/integrations/${i.provider}`)}
                >
                  <span
                    className="clay"
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 14,
                      fontWeight: 700,
                      fontSize: 18,
                    }}
                  >
                    {i.name[0]}
                  </span>
                  <span>
                    <span className="row between">
                      <h3 style={{ marginTop: 0 }}>{i.name}</h3>
                      {i.connected ? (
                        <Badge tone={i.status === 'error' ? 'red' : 'green'}>{i.status === 'error' ? 'Error' : 'Connected'}</Badge>
                      ) : (
                        <Badge plain>{CAT_LABEL[i.category]}</Badge>
                      )}
                    </span>
                    <p style={{ marginTop: 6 }}>{i.description}</p>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="card">
              <EmptyState title="No integrations match" />
            </div>
          );
        }}
      </Async>
    </>
  );
}

/** P-31 Integration detail with per-category tabs (INT-F2, F4–F9, ACT-02). */
export function IntegrationDetailPage() {
  const { provider = '' } = useParams();
  const toast = useToast();
  const status = useGetIntegrationStatusQuery(provider);
  const [connectCalendar] = useConnectCalendarMutation();
  const [connectSheets] = useConnectSheetsMutation();
  const [connectIntegration] = useConnectIntegrationMutation();
  const [disconnectIntegration] = useDisconnectIntegrationMutation();
  const [busy, setBusy] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const connect = async () => {
    setBusy(true);
    try {
      const r = await (status.data?.category === 'calendar'
        ? connectCalendar(provider).unwrap()
        : provider === 'google-sheets'
          ? connectSheets().unwrap()
          : connectIntegration(provider).unwrap());
      // OAuth providers hand back a URL to finish the connection there.
      if (r?.redirect_url) window.location.href = r.redirect_url;
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
      <Async state={status} skeleton={<Skeleton h={120} />}>
        {(i) => (
          <>
            <header className="agent-head">
              <div className="row" style={{ gap: 16, alignItems: 'flex-start' }}>
                <span
                  className="clay"
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 16,
                    fontWeight: 700,
                    fontSize: 22,
                  }}
                >
                  {i.name[0]}
                </span>
                <div>
                  <div className="row" style={{ gap: 10 }}>
                    <h1
                      style={{
                        fontSize: 28,
                        fontWeight: 500,
                        letterSpacing: '-0.03em',
                      }}
                    >
                      {i.name}
                    </h1>
                    <StatusBadge
                      status={i.connected ? (i.status === 'error' ? 'failed' : 'active') : 'cancelled'}
                      label={i.connected ? (i.status === 'error' ? 'Error' : 'Connected') : 'Not connected'}
                    />
                  </div>
                  <p className="muted" style={{ marginTop: 6, maxWidth: 560 }}>
                    {i.description}
                  </p>
                  {i.connected && (
                    <p className="small muted" style={{ marginTop: 4 }}>
                      {i.account_label} · last sync {dateTime(i.last_sync_at)}
                    </p>
                  )}
                </div>
              </div>
              {i.connected ? (
                <Button variant="danger" icon={<Unplug />} onClick={() => setDisconnecting(true)}>
                  Disconnect
                </Button>
              ) : (
                <Button variant="primary" icon={<Plug />} loading={busy} onClick={connect}>
                  Connect
                </Button>
              )}
            </header>
            {i.last_error && <div className="banner danger">{i.last_error}</div>}
            {!i.connected ? (
              <div className="card card-pad">
                <div className="card-title">What it can access</div>
                <ul className="small" style={{ marginTop: 10 }}>
                  {(i.permissions ?? []).map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
                <p className="muted small">You'll sign in to {i.name} and approve access. You can disconnect at any time.</p>
              </div>
            ) : (
              <ConnectedTabs item={i} />
            )}
            <ConfirmDialog
              open={disconnecting}
              onClose={() => setDisconnecting(false)}
              danger
              title={`Disconnect ${i.name}?`}
              description="Syncing, call logging and lookups stop. Settings are kept if you reconnect."
              confirmLabel="Disconnect"
              onConfirm={async () => {
                await disconnectIntegration(provider).unwrap();
              }}
            />
          </>
        )}
      </Async>
    </>
  );
}

function ConnectedTabs({ item }) {
  const tabs =
    item.category === 'crm'
      ? [
          { value: 'sync', label: 'Contacts sync' },
          { value: 'logging', label: 'Call logging' },
          { value: 'lookup', label: 'Caller lookup' },
          { value: 'triggers', label: 'Triggers' },
        ]
      : item.category === 'helpdesk'
        ? [
            { value: 'tickets', label: 'Tickets' },
            { value: 'lookup', label: 'Caller lookup' },
          ]
        : item.category === 'calendar'
          ? [{ value: 'booking', label: 'Booking' }]
          : item.category === 'sheets'
            ? [{ value: 'sheets', label: 'Sheets' }]
            : [{ value: 'automation', label: 'Setup' }];
  const [tab, setTab] = useState(tabs[0].value);
  const p = item.provider;
  return (
    <>
      {tabs.length > 1 && <SegmentTabs value={tab} onChange={setTab} items={tabs} />}
      {tab === 'sync' && <SyncTab provider={p} />}
      {tab === 'logging' && <LoggingTab provider={p} />}
      {tab === 'lookup' && <LookupTab provider={p} />}
      {tab === 'triggers' && <TriggersTab provider={p} />}
      {tab === 'tickets' && <TicketsTab provider={p} />}
      {tab === 'booking' && <BookingTab />}
      {tab === 'sheets' && <SheetsTab />}
      {tab === 'automation' && <AutomationTab name={item.name} />}
    </>
  );
}

const OUR_FIELDS = ['name', 'phone', 'email', 'timezone', 'city', 'loan_id', 'amount_due'];

function SyncTab({ provider }) {
  const toast = useToast();
  const s = useIntegrationSetting(provider, 'sync');
  const fields = useListIntegrationFieldsQuery(provider);
  const log = useListSyncLogQuery(provider);
  const [runSync, { isLoading: running }] = useRunIntegrationSyncMutation();
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
                await runSync(provider).unwrap();
                toast('Sync started');
              } catch (e) {
                toast(errMsg(e), 'error');
              } finally {
                /* the sync log refetches via cache invalidation */
              }
            }}
          >
            Sync now
          </Button>
        }
      >
        {(v, patch) => (
          <>
            <div className="form-grid">
              <Field label="Direction">
                <Select
                  value={v.direction}
                  options={[
                    { value: 'in', label: 'CRM → Aurlynn' },
                    { value: 'both', label: 'Both ways' },
                  ]}
                  onChange={(e) => patch({ direction: e.target.value })}
                />
              </Field>
              <Field label="Schedule">
                <Select
                  value={v.schedule}
                  options={[
                    { value: 'manual', label: 'Only when I click Sync now' },
                    { value: 'hourly', label: 'Every hour' },
                    { value: 'daily', label: 'Daily' },
                  ]}
                  onChange={(e) => patch({ schedule: e.target.value })}
                />
              </Field>
              <Field label="Filter" className="full" hint="Which CRM records to bring in, e.g. lifecycle stage = lead">
                <Input value={v.filter} onChange={(e) => patch({ filter: e.target.value })} />
              </Field>
            </div>
            <Field label="Field mapping">
              <MappingEditor
                value={v.mapping}
                onChange={(mapping) => patch({ mapping })}
                keyLabel="CRM field"
                valueLabel="Aurlynn field"
                keyOptions={(fields.data ?? []).map((f) => f.key)}
                valueOptions={OUR_FIELDS}
              />
            </Field>
          </>
        )}
      </SectionCard>
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
            <table className="table">
              <thead>
                <tr>
                  <th>Started</th>
                  <th>What</th>
                  <th>Result</th>
                  <th className="num">Created</th>
                  <th className="num">Updated</th>
                  <th className="num">Failed</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td className="muted">{dateTime(r.started_at)}</td>
                    <td>
                      {titleCase(r.kind)} · {r.direction === 'in' ? 'in' : 'out'}
                    </td>
                    <td>
                      <StatusBadge
                        status={r.status === 'ok' ? 'active' : r.status === 'running' ? 'pending' : r.status === 'partial' ? 'expired' : 'failed'}
                        label={titleCase(r.status)}
                      />
                      {r.errors.map((e, i) => (
                        <div key={i} className="cell-sub" style={{ color: 'var(--red)' }}>
                          {e.record}: {e.error}
                        </div>
                      ))}
                    </td>
                    <td className="num">{r.counts.created}</td>
                    <td className="num">{r.counts.updated}</td>
                    <td className="num">{r.counts.failed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState title="No syncs yet" />
          )
        }
      </Async>
    </div>
  );
}

const WRITE_OPTIONS = [
  { key: 'summary', label: 'Call summary' },
  { key: 'outcome', label: 'Outcome' },
  { key: 'recording_link', label: 'Recording link' },
  { key: 'transcript', label: 'Full transcript' },
  { key: 'extracted_fields', label: 'Extracted fields' },
];

function LoggingTab({ provider }) {
  const s = useIntegrationSetting(provider, 'callLogging');
  return (
    <SectionCard title="Log calls into the CRM" description="After each call, an activity is created on the matching contact." section={s}>
      {(v, patch) => (
        <>
          <Toggle checked={v.enabled} onChange={(x) => patch({ enabled: x })} label="Log every call" />
          <div className="field">
            <span className="field-label">What to write</span>
            <div className="perm-grid">
              {WRITE_OPTIONS.map((o) => (
                <label key={o.key} className="check">
                  <input
                    type="checkbox"
                    checked={v.write.includes(o.key)}
                    onChange={(e) =>
                      patch({
                        write: e.target.checked ? [...v.write, o.key] : v.write.filter((x) => x !== o.key),
                      })
                    }
                  />
                  {o.label}
                </label>
              ))}
            </div>
          </div>
          <Field label="Outcome → lead status">
            <MappingEditor value={v.outcome_to_status} onChange={(m) => patch({ outcome_to_status: m })} keyLabel="Call outcome" valueLabel="CRM status" />
          </Field>
          <Toggle
            checked={v.create_task_on_success}
            onChange={(x) => patch({ create_task_on_success: x })}
            label="Create a follow-up task when the call succeeds"
          />
        </>
      )}
    </SectionCard>
  );
}

function LookupTab({ provider }) {
  const toast = useToast();
  const s = useIntegrationSetting(provider, 'lookup');
  const fields = useListIntegrationFieldsQuery(provider);
  const [lookupTest] = useLookupTestMutation();
  const [phone, setPhone] = useState('');
  const [res, setRes] = useState(null);
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
            <Field label="CRM field → call variable">
              <MappingEditor
                value={v.mapping}
                onChange={(m) => patch({ mapping: m })}
                keyLabel="CRM field"
                valueLabel="Call variable"
                keyOptions={(fields.data ?? []).map((f) => f.key)}
              />
            </Field>
          </>
        )}
      </SectionCard>
      <div className="card card-pad stack">
        <div className="card-title">Try a number</div>
        <div className="row">
          <Input className="mono" placeholder="+919876543210" value={phone} onChange={(e) => setPhone(e.target.value)} style={{ maxWidth: 260 }} />
          <Button
            onClick={() =>
              lookupTest({ provider, phone })
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
            <div className="grid-2">
              <pre className="code">{JSON.stringify(res.record, null, 2)}</pre>
              <pre className="code">{JSON.stringify(res.variables, null, 2)}</pre>
            </div>
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
      <p className="muted small">Pick one of these events in a call trigger to call automatically — for example when a deal moves to “Demo booked”.</p>
      <Async state={events}>
        {(evs) => (
          <div className="tag-list">
            {evs.map((e) => (
              <span key={e.key} className="tag">
                {e.label}
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

function TicketsTab({ provider }) {
  const s = useIntegrationSetting(provider, 'tickets');
  return (
    <SectionCard title="Tickets" description="Agents create or update a ticket during the call; the link shows on the call." section={s}>
      {(v, patch) => (
        <div className="form-grid">
          <Field label="Create a ticket when">
            <Select
              value={v.create_when}
              options={[
                { value: 'never', label: 'Never' },
                { value: 'agent_decides', label: 'The agent decides' },
                { value: 'unresolved', label: 'The call is unresolved' },
                { value: 'always', label: 'Every call' },
              ]}
              onChange={(e) => patch({ create_when: e.target.value })}
            />
          </Field>
          <Field label="Default priority">
            <Select value={v.default_priority} options={['low', 'medium', 'high', 'urgent']} onChange={(e) => patch({ default_priority: e.target.value })} />
          </Field>
          <Field label="Default group / queue">
            <Input value={v.default_group} onChange={(e) => patch({ default_group: e.target.value })} />
          </Field>
        </div>
      )}
    </SectionCard>
  );
}

function BookingTab() {
  const s = useSection(useGetBookingSettingsQuery(), usePutBookingSettingsMutation());
  const appts = useListAppointmentsQuery();
  return (
    <div className="stack">
      <SectionCard title="Booking rules" description="When agents may book appointments on this calendar." section={s}>
        {(v, patch) => (
          <>
            <div className="form-grid">
              <Field label="Calendar">
                <Input value={v.calendar_id} onChange={(e) => patch({ calendar_id: e.target.value })} />
              </Field>
              <Field label="Slot length (minutes)">
                <Input type="number" min={5} value={v.slot_minutes} onChange={(e) => patch({ slot_minutes: Number(e.target.value) })} />
              </Field>
              <Field label="Buffer between slots (minutes)">
                <Input type="number" min={0} value={v.buffer_minutes} onChange={(e) => patch({ buffer_minutes: Number(e.target.value) })} />
              </Field>
            </div>
            <div className="field">
              <span className="field-label">Bookable days</span>
              <WeekdayPicker
                value={Object.entries(v.bookable_hours)
                  .filter(([, h]) => h.open)
                  .map(([d]) => d)}
                onChange={(days) =>
                  patch({
                    bookable_hours: Object.fromEntries(
                      ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [
                        d,
                        {
                          open: days.includes(d),
                          ranges: v.bookable_hours[d]?.ranges?.length ? v.bookable_hours[d].ranges : [{ from: '09:00', to: '18:00' }],
                        },
                      ]),
                    ),
                  })
                }
              />
            </div>
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
                      <td style={{ whiteSpace: 'nowrap' }}>{dateTime(a.starts_at)}</td>
                      <td>
                        <div className="cell-main">{a.contact_name}</div>
                        <div className="cell-sub">{a.agent_name}</div>
                      </td>
                      <td className="small muted">{Object.values(a.details).join(' · ')}</td>
                      <td>
                        <StatusBadge
                          status={a.status === 'booked' ? 'active' : a.status === 'cancelled' ? 'cancelled' : 'pending'}
                          label={titleCase(a.status)}
                        />
                      </td>
                      <td>{a.call_id && <Link to={`/calls/${a.call_id}`}>Call</Link>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState title="No appointments yet" />
            )
          }
        </Async>
      </div>
    </div>
  );
}

function SheetsTab() {
  const toast = useToast();
  const sheets = useListSheetsQuery();
  const [writeBack] = usePutSheetsWriteBackMutation();
  const [sheet, setSheet] = useState('');
  const [cols, setCols] = useState({ outcome: '', summary: '', called_at: '' });
  const current = sheets.data?.find((s) => s.id === sheet);
  useEffect(() => {
    if (!sheet && sheets.data?.[0]) setSheet(sheets.data[0].id);
  }, [sheets.data, sheet]);
  return (
    <div className="card card-pad stack">
      <div className="card-title">Use a sheet as a contact list</div>
      <p className="muted small">Pick the sheet in the campaign wizard to call its rows. Results are written back to the same row.</p>
      <Async state={sheets}>
        {(list) => (
          <>
            <Field label="Sheet">
              <Select
                value={sheet}
                options={list.map((s) => ({
                  value: s.id,
                  label: `${s.name} (${s.rows} rows)`,
                }))}
                onChange={(e) => setSheet(e.target.value)}
              />
            </Field>
            {current && (
              <Field label="Write results to columns">
                <MappingEditor
                  value={cols}
                  onChange={setCols}
                  keyLabel="Result"
                  valueLabel="Sheet column"
                  keyOptions={['outcome', 'summary', 'called_at', 'duration', 'recording_link']}
                  valueOptions={current.columns}
                />
              </Field>
            )}
            <div>
              <Button
                variant="primary"
                icon={<CheckCircle2 />}
                disabled={!sheet}
                onClick={() =>
                  writeBack({ sheet_id: sheet, columns: cols })
                    .unwrap()
                    .then(() => toast('Write-back saved'))
                    .catch((e) => toast(errMsg(e), 'error'))
                }
              >
                Save write-back
              </Button>
            </div>
          </>
        )}
      </Async>
    </div>
  );
}

/** EXT-02 no-code connectors: triggers = our webhooks, actions = our API with a key. */
function AutomationTab({ name }) {
  return (
    <div className="card card-pad stack">
      <div className="card-title">Set up {name}</div>
      <ol className="small" style={{ lineHeight: 1.9 }}>
        <li>
          Create an API key on <Link to="/developers?tab=keys">Deploy with code → API keys</Link> with <span className="mono">calls:write</span>.
        </li>
        <li>In {name}, add the Aurlynn app and paste the key.</li>
        <li>
          Triggers (call completed, appointment booked) arrive as <Link to="/developers?tab=webhooks">webhooks</Link>; the “Start a call” action uses{' '}
          <span className="mono">POST /calls</span>.
        </li>
      </ol>
    </div>
  );
}
