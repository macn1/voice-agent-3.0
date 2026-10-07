import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Ban, Copy, Download, History, Pause, Play, Plus, RotateCw, Send, Trash2, Upload, X } from 'lucide-react';
import {
  useCampaignActionMutation,
  useCreateCampaignMutation,
  useGetCampaignFunnelQuery,
  useGetCampaignOutcomesQuery,
  useGetCampaignQuery,
  useGetCampaignSettingsQuery,
  useGetCampaignSummaryQuery,
  useGetCampaignTimeseriesQuery,
  useGetCampaignVariantsQuery,
  useLazyGetCampaignEstimateQuery,
  useLazyGetCampaignResultsQuery,
  useListCampaignContactsQuery,
  useListCampaignsQuery,
  useListContactAttemptsQuery,
  useListContactListsQuery,
  usePutCampaignSettingsMutation,
  usePutCampaignVariantsMutation,
  useRemoveCampaignContactMutation,
  useRetryCampaignContactMutation,
  useUpdateCampaignMutation,
  useUploadCampaignContactsMutation,
  useValidateCampaignContactsMutation,
} from '../../../store/api/callsApi';
import { useGetAgentSectionQuery } from '../../../store/api/flowApi';
import { date, dateTime, number, titleCase } from '../../../lib/format';
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
  useToast,
} from '../../../components/ui';
import { downloadText, Drawer, parseCsv, readFileText, SectionCard, Select, useSection, WeekdayPicker } from '../../../components/forms';
import { HBars, Stat, TimeChart } from '../../../components/charts';
import { useAgentOptions, useNumberOptions } from '../shared';

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

function Progress({ c }) {
  const t = c.totals;
  const done = t.completed + t.failed + t.skipped;
  return (
    <div style={{ minWidth: 160 }}>
      <div className="bar">
        <span style={{ width: `${pct(done, t.contacts)}%` }} />
      </div>
      <div className="cell-sub">
        {number(done)} / {number(t.contacts)} done
      </div>
    </div>
  );
}

/** P-20 Campaigns list (CALL-03). */
export function CampaignsPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('');
  const [poll, setPoll] = useState(0);
  const list = useListCampaignsQuery({ status: status || undefined, limit: 100 }, { pollingInterval: poll });
  useEffect(() => setPoll(list.data?.items.some((c) => c.status === 'running') ? 8000 : 0), [list.data]);

  return (
    <>
      <PageHeader
        eyebrow="Deploy"
        title="Outbound campaigns"
        description="Call a list of contacts with an agent — on a schedule, with pacing and retries."
        actions={
          <>
            <Link to="/workflows" className="btn">
              Triggers & callbacks
            </Link>
            <Button variant="primary" icon={<Plus />} onClick={() => navigate('/campaigns/new')}>
              New campaign
            </Button>
          </>
        }
      />

      <div className="card">
        <div className="card-head">
          <div className="filters">
            <Select
              value={status}
              options={['draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled']}
              placeholder="All statuses"
              onChange={(e) => setStatus(e.target.value)}
            />
          </div>
        </div>
        <Async state={list}>
          {(p) =>
            p.items.length ? (
              <table className="table">
                <thead>
                  <tr>
                    <th>Campaign</th>
                    <th>Status</th>
                    <th>Progress</th>
                    <th className="num">Connected</th>
                    <th className="num">Success</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {p.items.map((c) => (
                    <tr key={c.id} className="clickable" onClick={() => navigate(`/campaigns/${c.id}`)}>
                      <td>
                        <div className="cell-main">{c.name}</div>
                        <div className="cell-sub">{c.agent_name}</div>
                      </td>
                      <td>
                        <StatusBadge status={c.status === 'running' ? 'active' : c.status === 'scheduled' ? 'pending' : c.status} label={titleCase(c.status)} />
                      </td>
                      <td>
                        <Progress c={c} />
                      </td>
                      <td className="num">{pct(c.totals.connected + c.totals.completed, c.totals.contacts - c.totals.pending - c.totals.skipped)}%</td>
                      <td className="num">{pct(c.totals.successful, c.totals.completed)}%</td>
                      <td className="muted">{date(c.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState
                icon={<Send />}
                title="No campaigns yet"
                description="Upload a CSV or pick a contact list to start calling."
                action={
                  <Button variant="primary" onClick={() => navigate('/campaigns/new')}>
                    New campaign
                  </Button>
                }
              />
            )
          }
        </Async>
      </div>
    </>
  );
}

/* Wizard (P-21) ------------------------------------------------------- */

const DEFAULT_SETTINGS = {
  calling_windows: {
    days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
    from: '10:00',
    to: '19:00',
    timezone_mode: 'contact',
    timezone: 'Asia/Kolkata',
  },
  max_concurrent: 3,
  calls_per_minute: 10,
  retry_rules: {
    no_answer: { attempts: 2, gap_minutes: 120 },
    busy: { attempts: 2, gap_minutes: 30 },
    voicemail: { attempts: 1, gap_minutes: 240 },
    failed: { attempts: 1, gap_minutes: 60 },
  },
  budget_minutes: null,
  end_at: null,
};

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

  const next = async () => {
    setError(null);
    try {
      if (step === 0) {
        if (!basics.name.trim() || !basics.agent_id || !basics.from_number_id) throw new Error('Fill in the name, agent and from-number');
        setStep(1);
      } else if (step === 1) {
        setBusy(true);
        const c =
          campaign ??
          (await createCampaign({
            ...basics,
            name: basics.name.trim(),
            settings,
            variable_mapping: mapping,
          }).unwrap());
        setCampaign(c);
        if (source === 'csv') {
          if (!csv || !phoneCol) throw new Error('Upload a CSV and pick the phone column');
          await uploadContacts({
            id: c.id,
            rows: csv.rows,
            phone_column: phoneCol,
            mapping,
          }).unwrap();
        } else {
          if (!listId) throw new Error('Pick a contact list');
          await uploadContacts({
            id: c.id,
            rows: [],
            phone_column: 'phone',
            mapping,
            contact_list_id: listId,
          }).unwrap();
        }
        setReport(await validateContacts(c.id).unwrap());
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
        await updateCampaign({
          id: campaign.id,
          start_at: new Date(startAt).toISOString(),
          status: 'scheduled',
        }).unwrap();
        toast('Campaign scheduled');
      } else {
        await campaignAction({ id: campaign.id, action: 'start' }).unwrap();
        toast('Campaign started');
      }
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
            <Field label="Call from">
              <Select
                value={basics.from_number_id}
                options={numberOptions}
                placeholder="Choose a number"
                onChange={(e) => setBasics({ ...basics, from_number_id: e.target.value })}
              />
            </Field>
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
                    label: `${l.name} (${l.count})`,
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
                          .filter((h) => !/phone|mobile/i.test(h))
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
                  <div style={{ marginTop: 6, fontWeight: 500 }}>{csv ? csv.name : 'Choose a CSV file'}</div>
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
                        .filter((h) => h !== phoneCol)
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
                  <b>{number(report.valid)}</b> of {number(report.total)} contacts will be called · removed: {report.invalid} invalid, {report.duplicate}{' '}
                  duplicate, {report.dnd} on do-not-call
                </span>
              </div>
            )}
            {report?.samples.length ? (
              <details>
                <summary className="small" style={{ cursor: 'pointer' }}>
                  See what was removed
                </summary>
                <table className="table" style={{ marginTop: 8 }}>
                  <tbody>
                    {report.samples.map((s, i) => (
                      <tr key={i}>
                        <td className="mono">{s.phone}</td>
                        <td className="muted">{titleCase(s.reason)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            ) : null}
            <ScheduleForm value={settings} onChange={setSettings} />
          </>
        )}
        {step === 3 && (
          <>
            <div className="grid-3">
              <Stat label="Contacts to call" value={number(estimate?.contacts ?? report?.valid ?? 0)} />
              <Stat
                label="Estimated minutes"
                value={estimate ? number(estimate.est_minutes) : '—'}
                hint={estimate ? `about ${number(estimate.est_hours, 1)} hours of calling` : undefined}
              />
              <Stat
                label="Minutes left on plan"
                value={estimate?.plan_minutes_left != null ? number(estimate.plan_minutes_left) : '—'}
                hint={estimate && !estimate.fits_plan ? 'Extra minutes will be billed as overage' : undefined}
              />
            </div>
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

export function ScheduleForm({ value: s, onChange }) {
  const w = s.calling_windows;
  return (
    <div className="stack">
      <div className="field">
        <span className="field-label">Calling days</span>
        <WeekdayPicker value={w.days} onChange={(days) => onChange({ ...s, calling_windows: { ...w, days } })} />
      </div>
      <div className="form-grid">
        <Field label="From">
          <input
            type="time"
            className="input"
            value={w.from}
            onChange={(e) =>
              onChange({
                ...s,
                calling_windows: { ...w, from: e.target.value },
              })
            }
          />
        </Field>
        <Field label="To">
          <input type="time" className="input" value={w.to} onChange={(e) => onChange({ ...s, calling_windows: { ...w, to: e.target.value } })} />
        </Field>
        <Field label="Hours are in">
          <Select
            value={w.timezone_mode}
            options={[
              { value: 'contact', label: "Each contact's time zone" },
              { value: 'fixed', label: 'One time zone' },
            ]}
            onChange={(e) =>
              onChange({
                ...s,
                calling_windows: { ...w, timezone_mode: e.target.value },
              })
            }
          />
        </Field>
        {w.timezone_mode === 'fixed' && (
          <Field label="Time zone">
            <Select
              value={w.timezone}
              options={['Asia/Kolkata', 'Asia/Dubai', 'Europe/London', 'America/New_York', 'UTC']}
              onChange={(e) =>
                onChange({
                  ...s,
                  calling_windows: { ...w, timezone: e.target.value },
                })
              }
            />
          </Field>
        )}
        <Field label="Calls at once">
          <Input type="number" min={1} value={s.max_concurrent} onChange={(e) => onChange({ ...s, max_concurrent: Number(e.target.value) })} />
        </Field>
        <Field label="Calls per minute" hint="Empty = no limit">
          <Input
            type="number"
            min={1}
            value={s.calls_per_minute ?? ''}
            onChange={(e) =>
              onChange({
                ...s,
                calls_per_minute: e.target.value ? Number(e.target.value) : null,
              })
            }
          />
        </Field>
        <Field label="Stop after (minutes used)" hint="Budget — empty = no limit">
          <Input
            type="number"
            min={1}
            value={s.budget_minutes ?? ''}
            onChange={(e) =>
              onChange({
                ...s,
                budget_minutes: e.target.value ? Number(e.target.value) : null,
              })
            }
          />
        </Field>
        <Field label="End date" hint="Optional">
          <input
            type="date"
            className="input"
            value={s.end_at?.slice(0, 10) ?? ''}
            onChange={(e) =>
              onChange({
                ...s,
                end_at: e.target.value ? new Date(e.target.value).toISOString() : null,
              })
            }
          />
        </Field>
      </div>
      <div className="field">
        <span className="field-label">Retries</span>
        {Object.keys(s.retry_rules).map((k) => (
          <div key={k} className="row wrap" style={{ gap: 10 }}>
            <span style={{ width: 110 }}>{titleCase(k)}</span>
            <Input
              style={{ width: 90 }}
              type="number"
              min={0}
              max={5}
              value={s.retry_rules[k].attempts}
              onChange={(e) =>
                onChange({
                  ...s,
                  retry_rules: {
                    ...s.retry_rules,
                    [k]: {
                      ...s.retry_rules[k],
                      attempts: Number(e.target.value),
                    },
                  },
                })
              }
            />
            <span className="muted small">more tries, every</span>
            <Input
              style={{ width: 100 }}
              type="number"
              min={5}
              value={s.retry_rules[k].gap_minutes}
              onChange={(e) =>
                onChange({
                  ...s,
                  retry_rules: {
                    ...s.retry_rules,
                    [k]: {
                      ...s.retry_rules[k],
                      gap_minutes: Number(e.target.value),
                    },
                  },
                })
              }
            />
            <span className="muted small">minutes</span>
          </div>
        ))}
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
  useEffect(() => setPoll(camp.data?.status === 'running' ? 6000 : 0), [camp.data?.status]);
  const [campaignAction] = useCampaignActionMutation();
  const [loadResults] = useLazyGetCampaignResultsQuery();
  const [tab, setTab] = useState('overview');
  const [cancelling, setCancelling] = useState(false);

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
                  <h1
                    style={{
                      fontSize: 28,
                      fontWeight: 500,
                      letterSpacing: '-0.03em',
                    }}
                  >
                    {c.name}
                  </h1>
                  <StatusBadge status={c.status === 'running' ? 'active' : c.status} label={titleCase(c.status)} />
                </div>
                <p className="muted" style={{ marginTop: 6 }}>
                  {c.agent_name} · from {c.from_number ?? '—'} · {c.start_at ? `started ${dateTime(c.start_at)}` : 'not started'}
                </p>
              </div>
              <div className="row wrap">
                {(c.status === 'draft' || c.status === 'scheduled') && (
                  <Button variant="primary" icon={<Play />} onClick={() => act('start', 'Campaign started')}>
                    Start
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
                  onClick={async () => {
                    try {
                      downloadText(`${c.name.replace(/\W+/g, '-')}-results.csv`, (await loadResults(id).unwrap()).csv);
                    } catch (e) {
                      toast(errMsg(e), 'error');
                    }
                  }}
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
            <SegmentTabs
              value={tab}
              onChange={setTab}
              items={[
                { value: 'overview', label: 'Overview' },
                { value: 'contacts', label: 'Contacts' },
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
  const t = c.totals;
  const rows = [
    { label: 'Pending', value: t.pending },
    { label: 'Calling now', value: t.calling },
    { label: 'Connected', value: t.connected },
    { label: 'Completed', value: t.completed },
    { label: 'Failed / no answer', value: t.failed },
    { label: 'Skipped', value: t.skipped },
  ];
  return (
    <div className="stack">
      <div className="grid-3">
        <Stat label="Contacts" value={number(t.contacts)} />
        <Stat label="Completed" value={number(t.completed)} hint={`${pct(t.completed, t.contacts)}% of contacts`} />
        <Stat label="Successful" value={number(t.successful)} hint={`${pct(t.successful, t.completed)}% of completed calls`} />
      </div>
      <div className="card card-pad">
        <div className="card-title" style={{ marginBottom: 14 }}>
          Live counts
        </div>
        <HBars rows={rows} max={t.contacts || 1} />
      </div>
    </div>
  );
}

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
            options={['pending', 'calling', 'connected', 'completed', 'no_answer', 'busy', 'failed', 'skipped']}
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
                          status={ct.status === 'completed' ? 'active' : ct.status === 'skipped' ? 'cancelled' : ct.status}
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
                        {['no_answer', 'busy', 'failed'].includes(ct.status) && (
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<RotateCw />}
                            onClick={() =>
                              retryContact({ id, contactId: ct.id })
                                .unwrap()
                                .catch((e) => toast(errMsg(e), 'error'))
                            }
                          >
                            Retry
                          </Button>
                        )}
                        {ct.status === 'pending' && (
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
            ) : (
              <EmptyState title="No contacts" />
            )}
            <Pager offset={offset} limit={50} count={p.items.length} total={p.total} onChange={setOffset} />
          </>
        )}
      </Async>
      <Drawer open={!!viewing} onClose={() => setViewing(null)} title={viewing?.name ?? viewing?.phone ?? ''} subtitle="Attempt history">
        <Async state={attempts}>
          {(list) =>
            list.length ? (
              <div className="stack">
                {list.map((a) => (
                  <div key={a.id} className="card" style={{ padding: 14 }}>
                    <div className="row between">
                      <b>Attempt {a.attempt_no}</b>
                      <StatusBadge status={a.result === 'connected' ? 'active' : 'pending'} label={titleCase(a.result)} />
                    </div>
                    <div className="muted small" style={{ marginTop: 4 }}>
                      {dateTime(a.started_at)}
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
            )
          }
        </Async>
        {viewing && Object.keys(viewing.variables).length > 0 && (
          <div className="card card-pad" style={{ marginTop: 16 }}>
            <div className="field-label" style={{ marginBottom: 8 }}>
              Variables
            </div>
            {Object.entries(viewing.variables).map(([k, v]) => (
              <div key={k} className="row between small">
                <span className="mono">{k}</span>
                <span>{v}</span>
              </div>
            ))}
          </div>
        )}
      </Drawer>
    </div>
  );
}

function AnalyticsTab({ id }) {
  const summary = useGetCampaignSummaryQuery(id);
  const funnel = useGetCampaignFunnelQuery(id);
  const outcomes = useGetCampaignOutcomesQuery(id);
  const ts = useGetCampaignTimeseriesQuery(id);
  const variants = useGetCampaignVariantsQuery(id);
  return (
    <div className="stack">
      <Async state={summary} skeleton={<Skeleton h={100} />}>
        {(s) => (
          <div className="grid-3">
            <Stat label="Connect rate" value={`${Math.round(s.connect_rate * 100)}%`} hint={`${number(s.connected)} of ${number(s.dialed)} dialed`} />
            <Stat label="Success rate" value={`${Math.round(s.success_rate * 100)}%`} hint={`${number(s.successful)} successful`} />
            <Stat label="Minutes used" value={number(s.minutes)} hint={`avg ${Math.round(s.avg_duration)}s per call`} />
          </div>
        )}
      </Async>
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="card card-pad">
          <div className="card-title" style={{ marginBottom: 14 }}>
            Funnel
          </div>
          <Async state={funnel}>{(rows) => <HBars rows={rows.map((r) => ({ label: r.stage, value: r.count }))} />}</Async>
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
                    label: titleCase(r.outcome),
                    value: r.count,
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
          Connect rate by hour
        </div>
        <Async state={ts}>
          {(rows) => (
            <TimeChart
              data={rows.map((r) => ({
                ...r,
                label: `${String(r.hour).padStart(2, '0')}:00`,
              }))}
              x="label"
              series={[
                { key: 'dialed', label: 'Dialed' },
                { key: 'connected', label: 'Connected' },
              ]}
            />
          )}
        </Async>
      </div>
      {(variants.data ?? []).length > 0 && (
        <div className="card">
          <div className="card-head">
            <h2>Agent comparison</h2>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Agent</th>
                <th className="num">Calls</th>
                <th className="num">Success</th>
                <th className="num">Avg duration</th>
              </tr>
            </thead>
            <tbody>
              {variants.data.map((v) => (
                <tr key={v.agent_name}>
                  <td className="cell-main">{v.agent_name}</td>
                  <td className="num">{v.calls}</td>
                  <td className="num">{Math.round(v.success_rate * 100)}%</td>
                  <td className="num">{Math.round(v.avg_duration)}s</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SettingsTab({ id }) {
  const s = useSection(useGetCampaignSettingsQuery(id), usePutCampaignSettingsMutation(), (body) => ({ id, body }));
  const [putVariants] = usePutCampaignVariantsMutation();
  const { options } = useAgentOptions();
  const toast = useToast();
  const [variants, setVariants] = useState([]);
  const total = useMemo(() => variants.reduce((a, v) => a + v.share, 0), [variants]);
  return (
    <div className="stack">
      <SectionCard title="Schedule, pacing & retries" section={s}>
        {(v, _p, set) => <ScheduleForm value={v} onChange={set} />}
      </SectionCard>
      <div className="card card-pad stack">
        <div>
          <div className="card-title">Compare agents (A/B)</div>
          <div className="card-sub">Split contacts between agents and compare success on the Analytics tab.</div>
        </div>
        {variants.map((v, i) => (
          <div key={i} className="row" style={{ gap: 8 }}>
            <Select
              style={{ flex: 1 }}
              value={v.agent_id}
              options={options}
              placeholder="Agent"
              onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, agent_id: e.target.value } : x)))}
            />
            <Input
              style={{ width: 100 }}
              type="number"
              min={1}
              max={100}
              value={v.share}
              onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, share: Number(e.target.value) } : x)))}
            />
            <span className="muted">%</span>
            <Button size="sm" variant="ghost" icon={<X />} onClick={() => setVariants(variants.filter((_, j) => j !== i))} />
          </div>
        ))}
        <div className="row">
          <Button size="sm" variant="ghost" icon={<Plus />} onClick={() => setVariants([...variants, { agent_id: '', share: 50 }])}>
            Add agent
          </Button>
          {variants.length > 0 && (
            <Button
              size="sm"
              variant="primary"
              disabled={total !== 100 || variants.some((v) => !v.agent_id)}
              title={total !== 100 ? 'Shares must add up to 100%' : undefined}
              onClick={() =>
                putVariants({ id, variants })
                  .unwrap()
                  .then(() => toast('Split saved'))
                  .catch((e) => toast(errMsg(e), 'error'))
              }
            >
              Save split ({total}%)
            </Button>
          )}
        </div>
      </div>
      <p className="muted small">
        <Badge plain>Tip</Badge> Calling-hour limits from Settings → Calling rules always apply on top of these.
      </p>
    </div>
  );
}
