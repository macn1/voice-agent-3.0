import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Bookmark, Download } from 'lucide-react';
import {
  useExportAnalyticsMutation,
  useGetAnalyticsQuery,
  useListSavedViewsQuery,
  useListScheduledReportsQuery,
  usePutScheduledReportsMutation,
  useSaveViewMutation,
} from '../../../store/api/analyticsApi';
import { useListCampaignsQuery } from '../../../store/api/callsApi';
import { money, number, percent, titleCase } from '../../../lib/format';
import { Async, Button, EmptyState, errMsg, Field, Input, Modal, PageHeader, SegmentTabs, Skeleton, useToast } from '../../../components/ui';
import { Select, ListEditor } from '../../../components/forms';
import { delta, Heatmap, HBars, SERIES, ShareBar, Stat, TimeChart } from '../../../components/charts';
import { useAgentOptions } from '../shared';

const FILTER_KEYS = ['range', 'agent_id', 'campaign_id', 'direction'];

/** P-29 Analytics (ANA-F1, F3–F7). */
export function AnalyticsPage() {
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const tab = params.get('tab') || 'overview';
  const filters = Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) ?? (k === 'range' ? '30d' : '')]).filter(([, v]) => v));
  const { options: agentOptions } = useAgentOptions();
  const camps = useListCampaignsQuery({ limit: 100 });
  const views = useListSavedViewsQuery();
  const [exportAnalytics] = useExportAnalyticsMutation();
  const [saveView] = useSaveViewMutation();
  const [saving, setSaving] = useState(false);
  const [viewName, setViewName] = useState('');
  const [scheduling, setScheduling] = useState(false);

  const set = (k, v) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v);
    else p.delete(k);
    setParams(p, { replace: true });
  };

  return (
    <>
      <PageHeader
        eyebrow="Monitor"
        title="Analytics"
        description="How your agents perform — volume, outcomes, cost, quality and when calls work best."
        actions={
          <>
            <Button icon={<Bookmark />} onClick={() => setSaving(true)}>
              Save view
            </Button>
            <Button
              icon={<Download />}
              onClick={async () => {
                try {
                  await exportAnalytics(filters).unwrap();
                  toast('Export ready — download it from Settings → Exports');
                } catch (e) {
                  toast(errMsg(e), 'error');
                }
              }}
            >
              Export
            </Button>
            <Button onClick={() => setScheduling(true)}>Email report</Button>
          </>
        }
      />

      <div className="filters" style={{ marginBottom: 18 }}>
        <Select
          value={filters.range ?? '30d'}
          options={[
            { value: '7d', label: 'Last 7 days' },
            { value: '30d', label: 'Last 30 days' },
            { value: '90d', label: 'Last 90 days' },
          ]}
          onChange={(e) => set('range', e.target.value)}
        />
        <Select value={filters.agent_id ?? ''} options={agentOptions} placeholder="All agents" onChange={(e) => set('agent_id', e.target.value)} />
        <Select
          value={filters.campaign_id ?? ''}
          options={(camps.data?.items ?? []).map((c) => ({
            value: c.id,
            label: c.name,
          }))}
          placeholder="All campaigns"
          onChange={(e) => set('campaign_id', e.target.value)}
        />
        <Select
          value={filters.direction ?? ''}
          options={['inbound', 'outbound']}
          placeholder="All directions"
          onChange={(e) => set('direction', e.target.value)}
        />
        {(views.data ?? []).length > 0 && (
          <Select
            value=""
            options={views.data.map((v) => ({
              value: v.id,
              label: `★ ${v.name}`,
            }))}
            placeholder="Saved views"
            onChange={(e) => {
              const v = views.data.find((x) => x.id === e.target.value);
              if (v)
                setParams(new URLSearchParams({ ...v.filters, tab }), {
                  replace: true,
                });
            }}
          />
        )}
      </div>
      <SegmentTabs
        value={tab}
        onChange={(v) => set('tab', v)}
        items={[
          { value: 'overview', label: 'Overview' },
          { value: 'outcomes', label: 'Outcomes & conversion' },
          { value: 'usage', label: 'Usage & cost' },
          { value: 'quality', label: 'Quality' },
          { value: 'patterns', label: 'Patterns' },
        ]}
      />

      {tab === 'overview' && <Overview filters={filters} />}
      {tab === 'outcomes' && <Outcomes filters={filters} />}
      {tab === 'usage' && <Usage filters={filters} />}
      {tab === 'quality' && <Quality filters={filters} />}
      {tab === 'patterns' && <Patterns filters={filters} />}

      <Modal
        open={saving}
        onClose={() => setSaving(false)}
        title="Save this view"
        description="Saves the current filters so you can come back to them."
        footer={
          <>
            <Button onClick={() => setSaving(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!viewName.trim()}
              onClick={async () => {
                try {
                  await saveView({ name: viewName.trim(), filters }).unwrap();
                  toast('View saved');
                  setSaving(false);
                  setViewName('');
                } catch (e) {
                  toast(errMsg(e), 'error');
                }
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <Field label="Name">
          <Input autoFocus value={viewName} onChange={(e) => setViewName(e.target.value)} placeholder="Riya — last 7 days" />
        </Field>
      </Modal>
      <ScheduleReportModal open={scheduling} onClose={() => setScheduling(false)} />
    </>
  );
}

function Overview({ filters }) {
  const navigate = useNavigate();
  const summary = useGetAnalyticsQuery({ report: 'summary', ...filters });
  const ts = useGetAnalyticsQuery({ report: 'timeseries', ...filters });
  const agents = useGetAnalyticsQuery({ report: 'agents', ...filters });
  const { agents: agentList } = useAgentOptions();
  const agentName = (id) => agentList.find((a) => a.id === id)?.name ?? `${String(id).slice(0, 8)}…`;
  return (
    <div className="stack">
      <Async state={summary} skeleton={<Skeleton h={110} />}>
        {(s) => (
          <div className="grid-3" style={{ '--grid-cols': 'repeat(4, minmax(0, 1fr))' }}>
            <Stat label="Calls" value={number(s.calls)} hint={delta(s.calls, s.prev?.calls)} onClick={() => navigate('/calls')} />
            <Stat label="Minutes" value={number(s.minutes)} hint={delta(s.minutes, s.prev?.minutes)} />
            <Stat label="Success rate" value={percent(s.success_rate)} hint={delta(s.success_rate, s.prev?.success_rate)} />
            <Stat
              label="Avg duration"
              value={`${Math.floor(s.avg_duration / 60)}:${String(Math.round(s.avg_duration % 60)).padStart(2, '0')}`}
              hint={delta(s.avg_duration, s.prev?.avg_duration)}
            />
          </div>
        )}
      </Async>
      <div className="card card-pad">
        <div className="card-title" style={{ marginBottom: 12 }}>
          Calls per day
        </div>
        <Async state={ts}>
          {(rows) =>
            rows.length ? (
              <TimeChart
                data={rows}
                x="day"
                series={[
                  { key: 'calls', label: 'All calls' },
                  { key: 'successful', label: 'Successful' },
                ]}
              />
            ) : (
              <EmptyState title="No calls in this period" />
            )
          }
        </Async>
      </div>
      <div className="card">
        <div className="card-head">
          <h2>By agent</h2>
        </div>
        <Async state={agents}>
          {(rows) =>
            rows.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Agent</th>
                      <th className="num">Calls</th>
                      <th className="num">Minutes</th>
                      <th className="num">Success</th>
                      <th className="num">Avg duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.agent_id} className="clickable" onClick={() => navigate(`/calls?agent_id=${r.agent_id}`)}>
                        <td className="cell-main">{r.agent_name ?? agentName(r.agent_id)}</td>
                        <td className="num">{number(r.calls)}</td>
                        <td className="num">{number(r.minutes)}</td>
                        <td className="num">{percent(r.success_rate)}</td>
                        <td className="num">{Math.round(r.avg_duration)}s</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="No data" />
            )
          }
        </Async>
      </div>
    </div>
  );
}

function Outcomes({ filters }) {
  const navigate = useNavigate();
  const outcomes = useGetAnalyticsQuery({ report: 'outcomes', ...filters });
  const funnel = useGetAnalyticsQuery({ report: 'funnel', ...filters });
  return (
    <div className="stack">
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="card card-pad">
          <div className="card-title" style={{ marginBottom: 14 }}>
            Outcomes
          </div>
          <Async state={outcomes}>
            {(rows) =>
              rows.length ? (
                <HBars
                  rows={rows.map((r) => ({
                    label: `${titleCase(r.outcome)}${r.is_success ? ' ✓' : ''}`,
                    value: r.count,
                  }))}
                  onClick={(i) => navigate(`/calls?outcome=${rows[i].outcome}`)}
                />
              ) : (
                <EmptyState title="No outcomes yet" />
              )
            }
          </Async>
        </div>
        <div className="card card-pad">
          <div className="card-title" style={{ marginBottom: 14 }}>
            Funnel
          </div>
          <Async state={funnel}>{(rows) => <HBars color={SERIES[2]} rows={rows.map((r) => ({ label: r.stage, value: r.count }))} />}</Async>
        </div>
      </div>
    </div>
  );
}

function Usage({ filters }) {
  const usage = useGetAnalyticsQuery({ report: 'usage', ...filters });
  const cost = useGetAnalyticsQuery({ report: 'cost', ...filters });
  return (
    <div className="stack">
      <Async state={cost} skeleton={<Skeleton h={110} />}>
        {(c) => (
          <div className="grid-3" style={{ '--grid-cols': 'repeat(4, minmax(0, 1fr))' }}>
            <Stat label="Total cost" value={money(c.total, c.currency)} />
            <Stat label="Cost per call" value={money(c.per_call, c.currency)} />
            <Stat label="Cost per minute" value={money(c.per_minute, c.currency)} />
            <Stat label="Minutes" value={number(c.total_minutes)} hint={`${number(c.inbound_minutes)} inbound · ${number(c.outbound_minutes)} outbound`} />
          </div>
        )}
      </Async>
      <Async state={usage}>
        {(u) => (
          <div className="grid-2" style={{ alignItems: 'start' }}>
            <div className="card card-pad">
              <div className="card-title" style={{ marginBottom: 12 }}>
                Minutes per day
              </div>
              {u.by_day.length ? (
                <TimeChart
                  data={u.by_day}
                  x="day"
                  series={[
                    { key: 'inbound_minutes', label: 'Inbound' },
                    { key: 'outbound_minutes', label: 'Outbound' },
                  ]}
                />
              ) : (
                <EmptyState title="No usage in this period" />
              )}
            </div>
            <div className="card card-pad">
              <div className="card-title" style={{ marginBottom: 12 }}>
                Cost per day
              </div>
              {u.by_day.length ? <TimeChart data={u.by_day} x="day" series={[{ key: 'cost', label: 'Cost' }]} format={(v) => number(v, 2)} /> : <EmptyState title="No usage in this period" />}
            </div>
          </div>
        )}
      </Async>
    </div>
  );
}

function Quality({ filters }) {
  const navigate = useNavigate();
  const q = useGetAnalyticsQuery({ report: 'quality', ...filters });
  const sentiment = useGetAnalyticsQuery({ report: 'sentiment', ...filters });
  return (
    <div className="stack">
      <Async state={q} skeleton={<Skeleton h={110} />}>
        {(x) => (
          <>
            <div className="grid-3">
              <Stat label="Flagged for review" value={percent(x.flagged_rate)} hint={`${number(x.flagged_calls)} of ${number(x.answered_calls)} answered calls`} onClick={() => navigate('/review')} />
              <Stat label="Reviewed" value={percent(x.reviewed_rate)} hint={`${number(x.reviewed_calls)} calls scored`} />
              <Stat label="Average review score" value={x.avg_review_score != null ? x.avg_review_score.toFixed(1) : '—'} hint={x.avg_review_score == null ? 'No reviews yet' : undefined} />
            </div>
            {x.flag_reasons?.length > 0 && (
              <div className="card card-pad">
                <div className="card-title" style={{ marginBottom: 12 }}>
                  Why calls were flagged
                </div>
                <HBars rows={x.flag_reasons.map((r) => ({ label: titleCase(r.reason ?? r.flag ?? r.key ?? ''), value: r.calls ?? r.count ?? 0 }))} />
              </div>
            )}
          </>
        )}
      </Async>
      <div className="card card-pad">
        <div className="card-title" style={{ marginBottom: 12 }}>
          Sentiment
        </div>
        <Async state={sentiment}>
          {(d) => {
            const rows = d.rows;
            const tot = rows.reduce(
              (a, r) => ({
                positive: a.positive + r.positive,
                neutral: a.neutral + r.neutral,
                negative: a.negative + r.negative,
              }),
              { positive: 0, neutral: 0, negative: 0 },
            );
            return rows.length ? (
              <div className="stack">
                <ShareBar
                  parts={[
                    { label: 'Positive', value: tot.positive, color: SERIES[2] },
                    { label: 'Neutral', value: tot.neutral, color: '#b8b6b1' },
                    { label: 'Negative', value: tot.negative, color: SERIES[1] },
                  ]}
                />

                <TimeChart
                  data={rows}
                  x="day"
                  kind="line"
                  series={[
                    { key: 'positive', label: 'Positive' },
                    { key: 'negative', label: 'Negative' },
                  ]}
                />
              </div>
            ) : (
              <EmptyState title="No sentiment data" />
            );
          }}
        </Async>
      </div>
      <p className="muted small">Topics callers ask about, drop-off points and response-time figures aren't available yet.</p>
    </div>
  );
}

function Patterns({ filters }) {
  const heat = useGetAnalyticsQuery({ report: 'heatmap', ...filters });
  const camps = useGetAnalyticsQuery({ report: 'campaigns', ...filters });
  const nums = useGetAnalyticsQuery({ report: 'phone-numbers', ...filters });
  const [metric, setMetric] = useState('connect_rate');
  return (
    <div className="stack">
      <div className="card card-pad">
        <div className="row between" style={{ marginBottom: 14 }}>
          <span className="card-title">Best time to call</span>
          <SegmentTabs
            value={metric}
            onChange={setMetric}
            items={[
              { value: 'connect_rate', label: 'Connect rate' },
              { value: 'calls', label: 'Call volume' },
            ]}
          />
        </div>
        <Async state={heat}>
          {(cells) => (
            <Heatmap
              cells={cells}
              value={metric}
              format={metric === 'connect_rate' ? (v) => `${Math.round(v * 100)}% connected` : (v) => `${number(v)} calls`}
            />
          )}
        </Async>
      </div>
      <div className="grid-2" style={{ alignItems: 'start' }}>
        {[
          ['Campaigns', camps],
          ['Phone numbers', nums],
        ].map(([t, s]) => (
          <div key={t} className="card">
            <div className="card-head">
              <h2>{t}</h2>
            </div>
            <Async state={s}>
              {(rows) =>
                rows.length ? (
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th className="num">Calls</th>
                          <th className="num">Connect</th>
                          <th className="num">Success</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.name}>
                            <td className="cell-main">{r.name}</td>
                            <td className="num">{number(r.calls)}</td>
                            <td className="num">{percent(r.connect_rate)}</td>
                            <td className="num">{percent(r.success_rate)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState title="No data" />
                )
              }
            </Async>
          </div>
        ))}
      </div>
    </div>
  );
}

/** ANA-F7 / EXT-03.2 scheduled email reports. */
function ScheduleReportModal({ open, onClose }) {
  const toast = useToast();
  const reports = useListScheduledReportsQuery(undefined, { skip: !open });
  const [putReports] = usePutScheduledReportsMutation();
  const [name, setName] = useState('Weekly summary');
  const [freq, setFreq] = useState('weekly');
  const [to, setTo] = useState([]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Email a report"
      description="Emails the summary (calls, minutes, success rate) on a schedule — mornings at 9."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!to.length}
            onClick={async () => {
              try {
                await putReports([
                  ...(reports.data ?? []),
                  {
                    name,
                    type: 'summary',
                    frequency: freq,
                    weekday: 1,
                    hour: 9,
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                    recipients: to,
                    enabled: true,
                  },
                ]).unwrap();
                toast('Report saved — it will be emailed once an email provider is connected');
                onClose();
              } catch (e) {
                toast(errMsg(e), 'error');
              }
            }}
          >
            Schedule
          </Button>
        </>
      }
    >
      <div className="stack">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="form-grid">
          <Field label="How often">
            <Select value={freq} options={['daily', 'weekly', 'monthly']} onChange={(e) => setFreq(e.target.value)} />
          </Field>
        </div>
        <Field label="Send to">
          <ListEditor value={to} onChange={setTo} placeholder="name@company.com" />
        </Field>
      </div>
    </Modal>
  );
}
