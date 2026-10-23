import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, ArrowRight, Ban, Copy, Download, History, Pause, Play, Plus, RotateCw, Send, Trash2, Upload } from 'lucide-react';
import {
  useCampaignActionMutation,
  useCreateCampaignMutation,
  useGetCampaignFunnelQuery,
  useGetCampaignOutcomesQuery,
  useGetCampaignQuery,
  useGetCampaignSettingsQuery,
  useGetCampaignSummaryQuery,
  useGetCampaignTimeseriesQuery,
  useLazyGetCampaignEstimateQuery,
  useListCampaignContactsQuery,
  useListCampaignsQuery,
  useListContactAttemptsQuery,
  useListContactListsQuery,
  usePutCampaignSettingsMutation,
  useRemoveCampaignContactMutation,
  useRetryCampaignContactMutation,
  useUpdateCampaignMutation,
  useUploadCampaignContactsMutation,
  useValidateCampaignContactsMutation,
} from '../../../store/api/callsApi';
import { downloadAuthed } from '../../../store/api/baseQuery';
import { useGetAgentSectionQuery } from '../../../store/api/flowApi';
import { dateTime, number, percent, titleCase } from '../../../lib/format';
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
  Pager,
  SegmentTabs,
  Skeleton,
  StatusBadge,
  Toggle,
  useToast,
} from '../../../components/ui';
import { Drawer, parseCsv, readFileText, SectionCard, Select, useSection, WeekdayPicker } from '../../../components/forms';
import { HBars, Stat, TimeChart } from '../../../components/charts';
import { PixelHero } from '../../../components/PixelHero';
import { useAgentOptions, useNumberOptions } from '../shared';

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

/** Why a campaign isn't dialling right now (waiting_reason) and what happens next. */
const WAITING_COPY = {
  plan_limit_reached: "Your plan doesn't allow calls right now (no plan, or minutes and wallet used up). The campaign continues on its own once calls are allowed again.",
  outside_calling_hours: 'Outside calling hours — it continues when the next calling window opens.',
  waiting_for_retries: 'Waiting for the retry delay before trying the remaining numbers again.',
};
const waitingText = (r) => WAITING_COPY[r] ?? titleCase(r);

const CAMPAIGN_STATUSES = ['draft', 'scheduled', 'running', 'paused', 'completed', 'canceled'];
const statusTone = (s) => (s === 'running' ? 'active' : s === 'canceled' ? 'cancelled' : s);

/** P-20 Campaigns list (CALL-03). */
export function CampaignsPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const { agents } = useAgentOptions();
  const list = useListCampaignsQuery({ status: status || undefined, q: q.trim() || undefined, limit: 100 }, { pollingInterval: 15000 });
  const items = list.data?.items ?? [];
  const nameOf = (id) => agents.find((a) => a.id === id)?.name ?? '—';

  if (list.isSuccess && !items.length && !status && !q) {
    return (
      <PixelHero
        icon={Send}
        motion="fly"
        warm
        title="Reach thousands of customers by phone"
        description={agents.length ? 'Upload your numbers, pick an agent and let it make the calls.' : 'Create an agent to launch your first campaign.'}
        actions={
          agents.length ? (
            <Link to="/campaigns/new" className="btn primary">
              <Plus /> New campaign
            </Link>
          ) : undefined
        }
      />
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Deploy"
        title="Outbound campaigns"
        description="Call a list of numbers with an agent, with calling hours, pacing and retries."
        actions={
          <Link to="/campaigns/new" className="btn primary">
            <Plus /> New campaign
          </Link>
        }
      />
      <div className="card">
        <div className="card-head">
          <div className="filters">
            <Input placeholder="Search campaigns" value={q} onChange={(e) => setQ(e.target.value)} />
            <Select value={status} options={CAMPAIGN_STATUSES.map((s) => ({ value: s, label: titleCase(s) }))} placeholder="All statuses" onChange={(e) => setStatus(e.target.value)} />
          </div>
        </div>
        <Async state={list}>
          {() =>
            items.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Campaign</th>
                      <th>Status</th>
                      <th>Progress</th>
                      <th className="num">Numbers</th>
                      <th className="num">Successful</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((c) => (
                      <tr key={c.id} className="clickable" onClick={() => navigate(`/campaigns/${c.id}`)}>
                        <td>
                          <div className="cell-main">{c.name}</div>
                          <div className="cell-sub">
                            {nameOf(c.agent_id)} · from {c.from_number ?? '—'}
                          </div>
                        </td>
                        <td>
                          <StatusBadge status={statusTone(c.status)} label={titleCase(c.status)} />
                          {c.waiting_reason && <div className="cell-sub">{titleCase(c.waiting_reason)}</div>}
                        </td>
                        <td style={{ minWidth: 140 }}>
                          <div className="bar">
                            <span style={{ width: `${Math.min(100, c.stats?.progress_percent ?? 0)}%` }} />
                          </div>
                          <div className="cell-sub">{Math.round(c.stats?.progress_percent ?? 0)}%</div>
                        </td>
                        <td className="num">{number(c.stats?.total)}</td>
                        <td className="num">{number(c.stats?.successful)}</td>
                        <td className="muted">{dateTime(c.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="No campaigns match" />
            )
          }
        </Async>
      </div>
    </>
  );
}

/* Wizard (P-21) ------------------------------------------------------- */

// Settings use the API's own shape. calling_windows null = follow the company's calling rules.
const DEFAULT_SETTINGS = {
  calling_windows: null,
  max_concurrent: 3,
  calls_per_minute: null,
  budget_minutes: null,
  retry_rules: { max_attempts: 2, retry_delay_minutes: 60, retry_on: ['no_answer', 'busy', 'voicemail', 'failed'] },
  variable_mapping: {},
};

const NAME_COLUMN = /^(full[_ ]?name|name|contact[_ ]?name)$/i;

export function CampaignWizard() {
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const { options: agentOptions } = useAgentOptions();
  const { options: numberOptions } = useNumberOptions();
  const lists = useListContactListsQuery();
  const [createCampaign] = useCreateCampaignMutation();
  const [uploadContacts] = useUploadCampaignContactsMutation();
  const [validateContacts] = useValidateCampaignContactsMutation();
  const [putSettings] = usePutCampaignSettingsMutation();
  const [loadEstimate] = useLazyGetCampaignEstimateQuery();
  const [updateCampaign] = useUpdateCampaignMutation();
  const [campaignAction] = useCampaignActionMutation();
  const [step, setStep] = useState(0);
  const [basics, setBasics] = useState({
    name: '',
    agent_id: '',
    from_number_id: '',
  });
  const [source, setSource] = useState(params.get('list') ? 'list' : 'csv');
  const [listId, setListId] = useState(params.get('list') ?? '');
  const [csv, setCsv] = useState(null);
  const [phoneCol, setPhoneCol] = useState('');
  const [mapping, setMapping] = useState({});
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [startAt, setStartAt] = useState('');
  const [campaign, setCampaign] = useState(null);
  const [report, setReport] = useState(null);
  const [estimate, setEstimate] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);

  // Input variables of the chosen agent, for column mapping.
  const varsQ = useGetAgentSectionQuery({ id: basics.agent_id, section: 'variables' }, { skip: !basics.agent_id });
  const vars = basics.agent_id ? (varsQ.data ?? []).filter((x) => x.direction === 'input').map((x) => x.name) : [];

  // The numbers as the API wants them (CSV columns other than phone / name become variables on the number).
  const numbersInput = () =>
    source === 'csv'
      ? { rows: csv.rows, phone_column: phoneCol, name_column: csv.headers.find((h) => h !== phoneCol && NAME_COLUMN.test(h)) }
      : { contact_list_id: listId };
  // agent variable -> the column that feeds it
  const variableMapping = () => Object.fromEntries(Object.entries(mapping).filter(([, v]) => v).map(([col, v]) => [v, col]));

  const next = async () => {
    setError(null);
    try {
      if (step === 0) {
        if (!basics.name.trim() || !basics.agent_id) throw new Error('Fill in the name and agent');
        if (!numberOptions.length) throw new Error('Buy or connect a phone number first — campaigns call from one of your numbers');
        setStep(1);
      } else if (step === 1) {
        if (source === 'csv' && (!csv || !phoneCol)) throw new Error('Upload a CSV and pick the phone column');
        if (source === 'list' && !listId) throw new Error('Pick a contact list');
        setBusy(true);
        const c =
          campaign ??
          (await createCampaign({
            name: basics.name.trim(),
            agent_id: basics.agent_id,
            ...(basics.from_number_id ? { from_number_id: basics.from_number_id } : {}),
            settings: { ...settings, variable_mapping: variableMapping() },
          }).unwrap());
        setCampaign(c);
        // Dry run first so the next step can say what will and won't be called.
        const dry = await validateContacts({ id: c.id, ...numbersInput() }).unwrap();
        if (!dry.valid && !dry.will_add) throw new Error('None of those numbers can be called — check the phone column');
        await uploadContacts({ id: c.id, ...numbersInput() }).unwrap();
        setReport(dry);
        setStep(2);
      } else if (step === 2) {
        setBusy(true);
        await putSettings({ id: campaign.id, body: settings }).unwrap();
        setEstimate(
          await loadEstimate(campaign.id)
            .unwrap()
            .catch(() => null),
        );
        setStep(3);
      }
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const launch = async (now) => {
    setBusy(true);
    setError(null);
    try {
      if (!now) {
        if (!startAt) throw new Error('Pick a start time');
        // A start time in the future makes Start schedule it instead of dialling now.
        await updateCampaign({ id: campaign.id, start_at: new Date(startAt).toISOString() }).unwrap();
      }
      await campaignAction({ id: campaign.id, action: 'start' }).unwrap();
      toast(now ? 'Campaign started' : 'Campaign scheduled');
      navigate(`/campaigns/${campaign.id}`);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const STEPS = ['Basics', 'Contacts', 'Schedule', 'Review'];
  return (
    <>
      <Link to="/campaigns" className="back-link">
        <ArrowLeft /> Campaigns
      </Link>
      <PageHeader eyebrow="Outbound" title="New campaign" />
      <div className="steps">
        {STEPS.map((s, i) => (
          <span key={s} style={{ display: 'contents' }}>
            {i > 0 && <span className="bar-sep" />}
            <span className={`step ${i <= step ? 'on' : ''}`}>
              <b>{i + 1}</b>
              {s}
            </span>
          </span>
        ))}
      </div>
      <div className="card card-pad stack">
        {error && <div className="alert-inline">{error}</div>}
        {step === 0 && (
          <div className="form-grid">
            <Field label="Campaign name" className="full">
              <Input autoFocus value={basics.name} onChange={(e) => setBasics({ ...basics, name: e.target.value })} placeholder="EMI reminders — November" />
            </Field>
            <Field label="Agent" hint="Calls use its published version.">
              <Select
                value={basics.agent_id}
                options={agentOptions}
                placeholder="Choose"
                onChange={(e) => setBasics({ ...basics, agent_id: e.target.value })}
              />
            </Field>
            <Field label="Call from" hint="Optional — defaults to your first number">
              <Select
                value={basics.from_number_id}
                options={numberOptions}
                placeholder="Default"
                onChange={(e) => setBasics({ ...basics, from_number_id: e.target.value })}
              />
            </Field>
            {!numberOptions.length && (
              <div className="banner warn full" style={{ margin: 0 }}>
                <AlertTriangle />
                <span className="grow">You have no phone number yet. Campaigns call from one of your numbers.</span>
                <Link to="/numbers" className="btn sm">
                  Get a number
                </Link>
              </div>
            )}
          </div>
        )}
        {step === 1 && (
          <>
            <SegmentTabs
              value={source}
              onChange={setSource}
              items={[
                { value: 'csv', label: 'Upload CSV' },
                { value: 'list', label: 'Contact list' },
              ]}
            />

            {source === 'list' ? (
              <Field label="Contact list">
                <Select
                  value={listId}
                  options={(lists.data ?? []).map((l) => ({
                    value: l.id,
                    label: `${l.name} (${l.member_count ?? l.count ?? 0})`,
                  }))}
                  placeholder="Choose"
                  onChange={(e) => setListId(e.target.value)}
                />
              </Field>
            ) : (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  hidden
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (!f) return;
                    const parsed = parseCsv(await readFileText(f));
                    if (!parsed.rows.length) return setError('That file has no rows.');
                    setCsv({ ...parsed, name: f.name });
                    setPhoneCol(parsed.headers.find((h) => /phone|mobile|number/i.test(h)) ?? '');
                    setMapping(
                      Object.fromEntries(
                        parsed.headers
                          .filter((h) => !/phone|mobile/i.test(h) && !NAME_COLUMN.test(h))
                          .map((h) => [h, vars.find((v) => v.toLowerCase() === h.toLowerCase().replace(/\W+/g, '_')) ?? '']),
                      ),
                    );
                  }}
                />

                <button
                  type="button"
                  className="card"
                  style={{
                    padding: 24,
                    textAlign: 'center',
                    borderStyle: 'dashed',
                    cursor: 'pointer',
                  }}
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload size={20} />
                  <div className="fw-medium" style={{ marginTop: 6 }}>
                    {csv ? csv.name : 'Choose a CSV file'}
                  </div>
                  <div className="muted small">{csv ? `${csv.rows.length} rows · ${csv.headers.length} columns` : 'First row must be the column names'}</div>
                </button>
                {csv && (
                  <>
                    <Field label="Phone number column">
                      <Select value={phoneCol} options={csv.headers} placeholder="Choose" onChange={(e) => setPhoneCol(e.target.value)} />
                    </Field>
                    <div className="field">
                      <span className="field-label">Map columns to call variables</span>
                      {csv.headers
                        .filter((h) => h !== phoneCol && !NAME_COLUMN.test(h))
                        .map((h) => (
                          <div key={h} className="mapping-row">
                            <span className="mono">{h}</span>
                            <span className="muted">→</span>
                            <Select
                              value={mapping[h] ?? ''}
                              options={vars}
                              placeholder="Don't use"
                              onChange={(e) => setMapping({ ...mapping, [h]: e.target.value })}
                            />
                            <span />
                          </div>
                        ))}
                      <p className="muted small" style={{ marginBottom: 0 }}>
                        Every column is saved on the number; mapped ones fill the agent's call variables.
                      </p>
                    </div>
                    <div className="table-wrap card">
                      <table className="table">
                        <thead>
                          <tr>
                            {csv.headers.map((h) => (
                              <th key={h}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {csv.rows.slice(0, 5).map((r, i) => (
                            <tr key={i}>
                              {csv.headers.map((h) => (
                                <td key={h} className="small">
                                  {r[h]}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}
        {step === 2 && (
          <>
            {report && (
              <div className="banner neutral" style={{ margin: 0 }}>
                <span className="grow">
                  <b>{number(report.will_add ?? report.valid)}</b> of {number(report.total_rows)} numbers will be called · skipped: {number(report.invalid)} invalid,{' '}
                  {number((report.duplicates_in_file ?? 0) + (report.already_in_campaign ?? 0))} duplicate, {number(report.do_not_call)} on do-not-call
                </span>
              </div>
            )}
            {report?.errors?.length ? (
              <details>
                <summary className="small" style={{ cursor: 'pointer' }}>
                  See what was skipped
                </summary>
                <div className="table-wrap">
                  <table className="table" style={{ marginTop: 8 }}>
                    <tbody>
                      {report.errors.slice(0, 50).map((s, i) => (
                        <tr key={i}>
                          <td className="muted">Row {s.row}</td>
                          <td className="mono">{s.phone}</td>
                          <td className="muted">{titleCase(s.reason)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            ) : null}
            <ScheduleForm value={settings} onChange={setSettings} />
          </>
        )}
        {step === 3 && (
          <>
            <div className="grid-3">
              <Stat label="Numbers to call" value={number(estimate?.pending_contacts ?? report?.will_add ?? 0)} />
              <Stat
                label="Estimated minutes"
                value={estimate ? number(estimate.estimated_minutes) : '—'}
                hint={estimate?.estimated_finish_at ? `finishes about ${dateTime(estimate.estimated_finish_at)}` : undefined}
              />
              <Stat
                label="Minutes left on plan"
                value={estimate?.plan?.remaining_minutes != null ? number(estimate.plan.remaining_minutes) : '—'}
                hint={estimate?.plan && !estimate.plan.fits ? `${number(estimate.plan.overage_minutes)} extra minutes will be billed as overage` : undefined}
              />
            </div>
            {estimate?.within_budget === false && (
              <div className="banner warn" style={{ margin: 0 }}>
                <AlertTriangle />
                <span className="grow">The estimate is above your minutes budget, so the campaign will stop when the budget is used.</span>
              </div>
            )}
            <div className="row wrap" style={{ gap: 12, alignItems: 'flex-end' }}>
              <Button variant="primary" icon={<Play />} loading={busy} onClick={() => launch(true)}>
                Start now
              </Button>
              <span className="muted">or</span>
              <Field label="Schedule for">
                <input type="datetime-local" className="input" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
              </Field>
              <Button loading={busy} onClick={() => launch(false)}>
                Schedule
              </Button>
            </div>
          </>
        )}
        {step < 3 && (
          <div className="row between">
            <Button disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
              Back
            </Button>
            <Button variant="primary" icon={<ArrowRight />} loading={busy} onClick={next}>
              Continue
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

const TIMEZONES = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'Australia/Sydney', 'UTC'];
const RETRY_REASONS = ['no_answer', 'busy', 'voicemail', 'failed'];
// The first window is edited; any further windows are kept as they are.
const EVERY_DAY = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
// <input type="time"> can't hold 24:00.
const toInput = (t) => (t === '24:00' ? '23:59' : t);
const fromInput = (t) => (t === '23:59' ? '24:00' : t);

export function ScheduleForm({ value: s, onChange }) {
  const cw = s.calling_windows;
  const w = cw?.windows?.[0] ?? { days: EVERY_DAY, start: '09:00', end: '21:00' };
  const setWindow = (patch) => onChange({ ...s, calling_windows: { timezone: cw?.timezone ?? 'Asia/Kolkata', windows: [{ ...w, ...patch }, ...(cw?.windows?.slice(1) ?? [])] } });
  const retry = s.retry_rules ?? DEFAULT_SETTINGS.retry_rules;
  const setRetry = (patch) => onChange({ ...s, retry_rules: { ...retry, ...patch } });
  return (
    <div className="stack">
      <Toggle
        checked={!cw}
        onChange={(v) => onChange({ ...s, calling_windows: v ? null : { timezone: 'Asia/Kolkata', windows: [{ days: EVERY_DAY, start: '09:00', end: '21:00' }] } })}
        label="Follow my company's calling rules"
        description="Use the hours set in Settings → Calling rules. Turn off to set hours for this campaign only."
      />
      {cw && (
        <>
          <div className="field">
            <span className="field-label">Calling days</span>
            <WeekdayPicker value={w.days} onChange={(days) => setWindow({ days })} />
          </div>
          <div className="form-grid">
            <Field label="From">
              <input type="time" className="input" value={toInput(w.start)} onChange={(e) => setWindow({ start: e.target.value })} />
            </Field>
            <Field label="To">
              <input type="time" className="input" value={toInput(w.end)} onChange={(e) => setWindow({ end: fromInput(e.target.value) })} />
            </Field>
            <Field label="Time zone">
              <Select
                value={cw.timezone}
                options={TIMEZONES.includes(cw.timezone) ? TIMEZONES : [cw.timezone, ...TIMEZONES]}
                onChange={(e) => onChange({ ...s, calling_windows: { ...cw, timezone: e.target.value } })}
              />
            </Field>
          </div>
        </>
      )}
      <div className="form-grid">
        <Field label="Calls at once" hint="1–50">
          <Input type="number" min={1} max={50} value={s.max_concurrent} onChange={(e) => onChange({ ...s, max_concurrent: Number(e.target.value) })} />
        </Field>
        <Field label="Calls per minute" hint="Empty = no limit">
          <Input
            type="number"
            min={1}
            value={s.calls_per_minute ?? ''}
            onChange={(e) => onChange({ ...s, calls_per_minute: e.target.value ? Number(e.target.value) : null })}
          />
        </Field>
        <Field label="Stop after (minutes used)" hint="Budget — empty = no limit">
          <Input
            type="number"
            min={1}
            value={s.budget_minutes ?? ''}
            onChange={(e) => onChange({ ...s, budget_minutes: e.target.value ? Number(e.target.value) : null })}
          />
        </Field>
      </div>
      <div className="field">
        <span className="field-label">Retries</span>
        <div className="form-grid">
          <Field label="Tries per number" hint="1–10, including the first call">
            <Input type="number" min={1} max={10} value={retry.max_attempts} onChange={(e) => setRetry({ max_attempts: Number(e.target.value) })} />
          </Field>
          <Field label="Wait between tries (minutes)">
            <Input type="number" min={1} value={retry.retry_delay_minutes} onChange={(e) => setRetry({ retry_delay_minutes: Number(e.target.value) })} />
          </Field>
        </div>
        <div className="row wrap" style={{ gap: 14, marginTop: 8 }}>
          <span className="muted small">Try again when the call was</span>
          {RETRY_REASONS.map((r) => (
            <label key={r} className="check">
              <input
                type="checkbox"
                checked={retry.retry_on?.includes(r)}
                onChange={(e) => setRetry({ retry_on: e.target.checked ? [...(retry.retry_on ?? []), r] : (retry.retry_on ?? []).filter((x) => x !== r) })}
              />
              {titleCase(r)}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

/* Detail (P-22) ------------------------------------------------------- */

export function CampaignDetailPage() {
  const { id = '' } = useParams();
  const toast = useToast();
  const navigate = useNavigate();
  const [poll, setPoll] = useState(0);
  const camp = useGetCampaignQuery(id, { pollingInterval: poll });
  useEffect(() => setPoll(['running', 'scheduled'].includes(camp.data?.status) ? 6000 : 0), [camp.data?.status]);
  const [campaignAction] = useCampaignActionMutation();
  const [tab, setTab] = useState('overview');
  const [cancelling, setCancelling] = useState(false);
  const { agents } = useAgentOptions();

  const act = async (action, msg) => {
    try {
      await campaignAction({ id, action }).unwrap();
      toast(msg);
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };

  return (
    <>
      <Link to="/campaigns" className="back-link">
        <ArrowLeft /> Campaigns
      </Link>
      <Async state={camp} skeleton={<Skeleton h={60} w={400} />}>
        {(c) => (
          <>
            <header className="agent-head">
              <div>
                <div className="row" style={{ gap: 10 }}>
                  <h1 className="text-detail-title">{c.name}</h1>
                  <StatusBadge status={statusTone(c.status)} label={titleCase(c.status)} />
                </div>
                <p className="muted" style={{ marginTop: 6 }}>
                  {agents.find((a) => a.id === c.agent_id)?.name ?? 'Agent'} · from {c.from_number ?? '—'} ·{' '}
                  {c.started_at ? `started ${dateTime(c.started_at)}` : c.start_at ? `starts ${dateTime(c.start_at)}` : 'not started'}
                </p>
              </div>
              <div className="row wrap">
                {(c.status === 'draft' || c.status === 'scheduled') && (
                  <Button variant="primary" icon={<Play />} onClick={() => act('start', c.status === 'scheduled' ? 'Campaign scheduled' : 'Campaign started')}>
                    {c.status === 'scheduled' ? 'Start now' : 'Start'}
                  </Button>
                )}
                {c.status === 'running' && (
                  <Button icon={<Pause />} onClick={() => act('pause', 'Paused')}>
                    Pause
                  </Button>
                )}
                {c.status === 'paused' && (
                  <Button variant="primary" icon={<Play />} onClick={() => act('resume', 'Resumed')}>
                    Resume
                  </Button>
                )}
                <Button
                  icon={<Copy />}
                  onClick={async () => {
                    try {
                      const d = await campaignAction({ id, action: 'duplicate' }).unwrap();
                      toast('Copied as a draft');
                      navigate(`/campaigns/${d.id}`);
                    } catch (e) {
                      toast(errMsg(e), 'error');
                    }
                  }}
                >
                  Duplicate
                </Button>
                <Button
                  icon={<Download />}
                  onClick={() =>
                    downloadAuthed({
                      service: 'outbound',
                      url: `/customer/campaigns/${id}/results`,
                      params: { format: 'csv' },
                      filename: `${c.name.replace(/\W+/g, '-')}-results.csv`,
                    }).catch((e) => toast(errMsg(e), 'error'))
                  }
                >
                  Results
                </Button>
                {['running', 'paused', 'scheduled'].includes(c.status) && (
                  <Button variant="danger" icon={<Ban />} onClick={() => setCancelling(true)}>
                    Cancel
                  </Button>
                )}
              </div>
            </header>
            {c.waiting_reason && ['running', 'scheduled'].includes(c.status) && (
              <div className={`banner ${c.waiting_reason === 'plan_limit_reached' ? 'warn' : 'info'}`}>
                <AlertTriangle />
                <span className="grow">
                  <b>Waiting.</b> {waitingText(c.waiting_reason)}
                  {c.next_window_at ? ` Next window: ${dateTime(c.next_window_at)}.` : ''}
                </span>
                {c.waiting_reason === 'plan_limit_reached' && (
                  <Link to="/settings/plan" className="btn sm">
                    Plan & credits
                  </Link>
                )}
              </div>
            )}
            {c.end_reason && !['running', 'scheduled', 'draft', 'paused'].includes(c.status) && (
              <p className="muted small">Ended: {titleCase(c.end_reason)}</p>
            )}
            <SegmentTabs
              value={tab}
              onChange={setTab}
              items={[
                { value: 'overview', label: 'Overview' },
                { value: 'contacts', label: 'Numbers' },
                { value: 'analytics', label: 'Analytics' },
                { value: 'settings', label: 'Settings' },
              ]}
            />

            {tab === 'overview' && <Overview c={c} />}
            {tab === 'contacts' && <ContactsTab id={id} />}
            {tab === 'analytics' && <AnalyticsTab id={id} />}
            {tab === 'settings' && <SettingsTab id={id} />}
            <ConfirmDialog
              open={cancelling}
              onClose={() => setCancelling(false)}
              danger
              title="Cancel this campaign?"
              description="No more calls are placed. Results so far are kept."
              confirmLabel="Cancel campaign"
              onConfirm={() => campaignAction({ id, action: 'cancel' }).unwrap()}
            />
          </>
        )}
      </Async>
    </>
  );
}

function Overview({ c }) {
  const t = c.stats ?? {};
  const rows = [
    { label: 'Waiting', value: t.pending },
    { label: 'Calling now', value: t.calling },
    { label: 'Completed', value: t.completed },
    { label: 'Failed', value: t.failed },
    { label: 'Skipped', value: t.skipped },
  ];
  return (
    <div className="stack">
      <div className="grid-3">
        <Stat label="Numbers" value={number(t.total)} hint={`${Math.round(t.progress_percent ?? 0)}% done`} />
        <Stat label="Completed" value={number(t.completed)} hint={`${pct(t.completed, t.total)}% of numbers · ${number(t.attempts)} calls made`} />
        <Stat label="Successful" value={number(t.successful)} hint={`${pct(t.successful, t.completed)}% of completed · ${number(t.minutes)} min used`} />
      </div>
      <div className="card card-pad">
        <div className="card-title" style={{ marginBottom: 14 }}>
          Live counts
        </div>
        <HBars rows={rows} max={t.total || 1} />
      </div>
    </div>
  );
}

const CONTACT_STATUSES = ['pending', 'calling', 'completed', 'failed', 'skipped', 'canceled'];

function ContactsTab({ id }) {
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [offset, setOffset] = useState(0);
  const list = useListCampaignContactsQuery({ id, status: status || undefined, limit: 50, offset });
  const [viewing, setViewing] = useState(null);
  const attempts = useListContactAttemptsQuery({ id, contactId: viewing?.id }, { skip: !viewing });
  const [retryContact] = useRetryCampaignContactMutation();
  const [removeContact] = useRemoveCampaignContactMutation();

  return (
    <div className="card">
      <div className="card-head">
        <div className="filters">
          <Select
            value={status}
            options={CONTACT_STATUSES.map((s) => ({ value: s, label: titleCase(s) }))}
            placeholder="All statuses"
            onChange={(e) => {
              setStatus(e.target.value);
              setOffset(0);
            }}
          />
        </div>
      </div>
      <Async state={list}>
        {(p) => (
          <>
            {p.items.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Contact</th>
                      <th>Status</th>
                      <th className="num">Attempts</th>
                      <th>Outcome</th>
                      <th>Next attempt</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {p.items.map((ct) => (
                      <tr key={ct.id}>
                        <td>
                          <div className="cell-main">{ct.name ?? ct.phone}</div>
                          <div className="cell-sub mono">{ct.phone}</div>
                        </td>
                        <td>
                          <StatusBadge
                            status={ct.status === 'completed' ? 'active' : ct.status === 'skipped' || ct.status === 'canceled' ? 'cancelled' : ct.status}
                            label={titleCase(ct.status)}
                          />
                          {ct.skip_reason && <div className="cell-sub">{titleCase(ct.skip_reason)}</div>}
                        </td>
                        <td className="num">{ct.attempts}</td>
                        <td>{ct.outcome ? titleCase(ct.outcome) : '—'}</td>
                        <td className="muted">{dateTime(ct.next_attempt_at)}</td>
                        <td className="actions">
                          <Button size="sm" variant="ghost" icon={<History />} onClick={() => setViewing(ct)}>
                            Attempts
                          </Button>
                          {(ct.status === 'failed' || (ct.status === 'completed' && ct.is_success === false)) && (
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<RotateCw />}
                              onClick={() =>
                                retryContact({ id, contactId: ct.id })
                                  .unwrap()
                                  .then(() => toast('Queued to call again'))
                                  .catch((e) => toast(errMsg(e), 'error'))
                              }
                            >
                              Retry
                            </Button>
                          )}
                          {ct.status !== 'calling' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<Trash2 />}
                              onClick={() =>
                                removeContact({ id, contactId: ct.id })
                                  .unwrap()
                                  .catch((e) => toast(errMsg(e), 'error'))
                              }
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="No numbers" />
            )}
            <Pager offset={offset} limit={50} count={p.items.length} total={p.total} onChange={setOffset} />
          </>
        )}
      </Async>
      <Drawer open={!!viewing} onClose={() => setViewing(null)} title={viewing?.name ?? viewing?.phone ?? ''} subtitle="Attempt history">
        <Async state={attempts}>
          {(res) => {
            const list = Array.isArray(res) ? res : (res?.items ?? []);
            return list.length ? (
              <div className="stack">
                {list.map((a, i) => (
                  <div key={a.id ?? i} className="card" style={{ padding: 14 }}>
                    <div className="row between">
                      <b>Attempt {a.attempt_no ?? a.attempt ?? i + 1}</b>
                      <StatusBadge
                        status={['connected', 'completed', 'answered'].includes(a.result ?? a.status) ? 'active' : 'pending'}
                        label={titleCase(a.result ?? a.status ?? a.outcome ?? '')}
                      />
                    </div>
                    <div className="muted small" style={{ marginTop: 4 }}>
                      {dateTime(a.started_at ?? a.created_at)}
                    </div>
                    {a.call_id && (
                      <Link to={`/calls/${a.call_id}`} className="small">
                        Open call
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="Not called yet" />
            );
          }}
        </Async>
        {viewing && Object.keys(viewing.variables ?? {}).length > 0 && (
          <div className="card card-pad" style={{ marginTop: 16 }}>
            <div className="field-label" style={{ marginBottom: 8 }}>
              Variables
            </div>
            {Object.entries(viewing.variables).map(([k, v]) => (
              <div key={k} className="row between small">
                <span className="mono">{k}</span>
                <span>{String(v)}</span>
              </div>
            ))}
          </div>
        )}
      </Drawer>
    </div>
  );
}

/** Hourly points: label by local hour and chart whichever of these counts the API sends. */
const HOURLY_SERIES = [
  ['dialed', 'Dialed'],
  ['calls', 'Calls'],
  ['answered', 'Answered'],
  ['answered_calls', 'Answered'],
  ['successful', 'Successful'],
  ['successful_calls', 'Successful'],
];

function AnalyticsTab({ id }) {
  const summary = useGetCampaignSummaryQuery(id);
  const funnel = useGetCampaignFunnelQuery(id);
  const outcomes = useGetCampaignOutcomesQuery(id);
  const ts = useGetCampaignTimeseriesQuery(id);
  return (
    <div className="stack">
      <Async state={summary} skeleton={<Skeleton h={100} />}>
        {(s) => (
          <div className="grid-3">
            <Stat label="Answer rate" value={percent(s.answer_rate)} hint={`${number(s.answered)} answered of ${number(s.dialed)} dialed`} />
            <Stat label="Success rate" value={percent(s.success_rate)} hint={`${number(s.successful)} successful · ${percent(s.conversion_rate)} of all numbers`} />
            <Stat label="Minutes used" value={number(s.total_minutes)} hint={`avg ${Math.round(s.avg_duration_seconds ?? 0)}s per call`} />
          </div>
        )}
      </Async>
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="card card-pad">
          <div className="card-title" style={{ marginBottom: 14 }}>
            Funnel
          </div>
          <Async state={funnel}>{(rows) => <HBars rows={rows.map((r) => ({ label: r.label ?? titleCase(r.key ?? r.stage ?? ''), value: r.count ?? r.calls ?? 0 }))} />}</Async>
        </div>
        <div className="card card-pad">
          <div className="card-title" style={{ marginBottom: 14 }}>
            Outcomes
          </div>
          <Async state={outcomes}>
            {(rows) =>
              rows.length ? (
                <HBars
                  color="var(--series-2)"
                  rows={rows.map((r) => ({
                    label: titleCase(r.outcome ?? r.key ?? ''),
                    value: r.count ?? r.calls ?? 0,
                  }))}
                />
              ) : (
                <span className="muted small">No outcomes yet.</span>
              )
            }
          </Async>
        </div>
      </div>
      <div className="card card-pad">
        <div className="card-title" style={{ marginBottom: 14 }}>
          Calls by hour
        </div>
        <Async state={ts}>
          {(points) => {
            const rows = points.map((r) => ({
              ...r,
              label: r.bucket ? new Date(r.bucket).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : String(r.hour ?? ''),
            }));
            const series = HOURLY_SERIES.filter(([k]) => rows.some((r) => r[k] != null)).filter(([, l], i, a) => a.findIndex(([, x]) => x === l) === i);
            return rows.length && series.length ? (
              <TimeChart data={rows} x="label" series={series.map(([key, label]) => ({ key, label }))} />
            ) : (
              <span className="muted small">No calls yet.</span>
            );
          }}
        </Async>
      </div>
    </div>
  );
}

function SettingsTab({ id }) {
  const s = useSection(useGetCampaignSettingsQuery(id), usePutCampaignSettingsMutation(), (body) => ({ id, body }));
  return (
    <div className="stack">
      <SectionCard title="Schedule, pacing & retries" section={s}>
        {(v, _p, set) => <ScheduleForm value={v} onChange={set} />}
      </SectionCard>
      <p className="muted small">
        <Badge plain>Tip</Badge> Turn on “Follow my company's calling rules” to use the hours from Settings → Calling rules.
      </p>
    </div>
  );
}
