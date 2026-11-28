import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { AudioLines, Download, PhoneCall, PhoneIncoming, PhoneOutgoing, Search, X, Zap } from 'lucide-react';
import { useListCallsQuery } from '../../../store/api/callsApi';
import { useCreateExportMutation } from '../../../store/api/analyticsApi';
import { LEGACY_DISPOSITIONS } from '../../../store/api/flowApi';
import { titleCase } from '../../../lib/format';
import { Async, Badge, Button, EmptyState, errMsg, Input, Pager, SegmentTabs, useToast } from '../../../components/ui';
import { Select } from '../../../components/forms';
import { DemoSimulatorModal } from '../../../components/DemoSimulatorModal';
import { CallNumberDialog, duration, useAgentName, useCampaignName, useCampaignOptions } from '../shared';

// The call log on Home (it replaced the Call logs page): every call, newest
// first, 20 a page, with its filters in the URL so they survive a reload and
// can be linked to (e.g. /?campaign_id=...).

const PAGE = 20;
const IST = 'Asia/Kolkata';

/** YYYY-MM-DD of a moment, in India. */
const istDay = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const istStart = (ymd) => `${ymd}T00:00:00+05:30`;
const addDays = (ymd, n) => {
  const d = new Date(istStart(ymd));
  d.setUTCDate(d.getUTCDate() + n);
  return istDay(d);
};
const istTime = new Intl.DateTimeFormat('en-IN', { timeZone: IST, day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

/** The date range a preset (or custom from / to days) stands for, as the API's from / to (RFC 3339, India). */
export function rangeOf(range, fromDay, toDay) {
  const today = istDay();
  switch (range) {
    case 'today':
      return { from: istStart(today) };
    case '30d':
      return { from: istStart(addDays(today, -29)) };
    case '90d':
      return { from: istStart(addDays(today, -89)) };
    case 'custom':
      return {
        ...(fromDay ? { from: istStart(fromDay) } : {}),
        ...(toDay ? { to: istStart(addDays(toDay, 1)) } : {}),
      };
    default:
      return { from: istStart(addDays(today, -6)) };
  }
}

// The built-in dispositions every campaign has, and their colours.
export const BUILTIN = [
  ['not_connected', 'Not connected'],
  ['wrong_person', 'Wrong person'],
  ['appointment', 'Appointment'],
  ['call_back_later', 'Call back later'],
  ['unsubscribe', 'Unsubscribe'],
  ['success', 'Success'],
  ['failed', 'Failed'],
  ['transferred', 'Transferred'],
];
const DISPOSITION_TONE = {
  appointment: 'green',
  success: 'green',
  transferred: 'blue',
  call_back_later: 'amber',
  wrong_person: 'orange',
  unsubscribe: 'red',
  failed: 'red',
  not_connected: '',
};

/** The call's disposition: its own, or the one an older call's outcome became. */
export function dispositionOf(c) {
  const key = c.disposition ?? LEGACY_DISPOSITIONS[c.outcome] ?? c.outcome;
  if (!key) return null;
  const builtin = BUILTIN.find(([k]) => k === key);
  return { key, label: c.disposition_label ?? builtin?.[1] ?? titleCase(key) };
}

export function DispositionBadge({ call }) {
  const d = dispositionOf(call);
  if (!d) return <span className="muted">—</span>;
  const tone = DISPOSITION_TONE[d.key] ?? (call.is_success === true ? 'green' : call.is_success === false ? 'amber' : '');
  return <Badge tone={tone}>{d.label}</Badge>;
}

/** Who the call was with: the caller for inbound, the callee for outbound. */
const numberOf = (c) => (c.direction === 'outbound' ? c.to_number : c.from_number) ?? (c.channel === 'web' ? 'Web test' : '—');

// Filters set elsewhere (dashboards, analytics) that the bar has no control for: shown as chips.
const EXTRA = {
  agent_id: 'Agent',
  status: 'Result',
  flagged: 'Flagged',
  outcome: 'Outcome',
};

export function CallLog() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const agentName = useAgentName();
  const campaignName = useCampaignName();
  const { options: campaignOptions } = useCampaignOptions();
  const [calling, setCalling] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [createExport] = useCreateExportMutation();
  const sectionRef = useRef(null);
  // Links to /#calls (and old /calls links) land on the call log.
  useEffect(() => {
    if (location.hash === '#calls') {
      sectionRef.current?.scrollIntoView({ block: 'start' });
    }
  }, [location.hash]);

  const range = params.get('range') ?? '7d';
  const offset = Math.max(0, Number(params.get('offset') ?? 0) || 0);
  const q = params.get('q') ?? '';
  const filters = useMemo(() => {
    const f = { ...rangeOf(range, params.get('from'), params.get('to')) };
    for (const k of ['campaign_id', 'direction', 'disposition', 'agent_id', 'status', 'flagged']) {
      if (params.get(k)) f[k] = params.get(k);
    }
    // An outcome from before dispositions (old links) filters by the disposition it became.
    if (!f.disposition && params.get('outcome')) f.disposition = LEGACY_DISPOSITIONS[params.get('outcome')] ?? params.get('outcome');
    if (q.trim()) f.q = q.trim();
    return f;
  }, [params, range, q]);
  const list = useListCallsQuery({ ...filters, limit: PAGE, offset });

  const set = (patch) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    p.delete('offset');
    setParams(p, { replace: true });
  };

  // Dispositions to filter by: the built-in ones, plus custom ones seen on this page.
  const dispositionOptions = useMemo(() => {
    const seen = new Map(BUILTIN);
    for (const c of list.data?.items ?? []) {
      const d = dispositionOf(c);
      if (d && !seen.has(d.key)) seen.set(d.key, d.label);
    }
    const current = params.get('disposition');
    if (current && !seen.has(current)) seen.set(current, titleCase(current));
    return [...seen].map(([value, label]) => ({ value, label }));
  }, [list.data, params]);

  const extras = Object.keys(EXTRA).filter((k) => params.get(k));

  return (
    <section className="page-section" id="calls" ref={sectionRef} style={{ position: 'relative', zIndex: 1 }}>
      <div className="page-section-head">
        <div>
          <h2 className="text-subheading">Calls</h2>
          <p className="muted small">Every call with its campaign, agent, disposition, recording and transcript. Times are India time.</p>
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          <Button icon={<Zap />} onClick={() => setSimulating(true)}>
            Simulate call
          </Button>
          <Button
            icon={<Download />}
            onClick={async () => {
              try {
                await createExport({ kind: 'calls', filters }).unwrap();
                toast('Export started — find it in Settings → Exports');
              } catch (e) {
                toast(errMsg(e), 'error');
              }
            }}
          >
            Export
          </Button>
          <Link to="/calls/live" className="btn">
            <AudioLines size={16} /> Live calls
          </Link>
          <Button variant="primary" icon={<PhoneCall />} onClick={() => setCalling(true)}>
            Call a number
          </Button>
        </div>
      </div>
      <div className="card">
        <div className="card-head" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
          <div className="filters">
            <SegmentTabs
              value={range}
              onChange={(v) => set({ range: v === '7d' ? '' : v, ...(v === 'custom' ? {} : { from: '', to: '' }) })}
              items={[
                { value: 'today', label: 'Today' },
                { value: '7d', label: 'Last 7 days' },
                { value: '30d', label: 'Last 30 days' },
                { value: 'custom', label: 'Custom' },
              ]}
            />
            {range === 'custom' && (
              <div className="date-range">
                <input
                  type="date"
                  className="input"
                  aria-label="From"
                  value={params.get('from') ?? ''}
                  max={params.get('to') || istDay()}
                  onChange={(e) => set({ from: e.target.value })}
                />
                <span className="muted small">to</span>
                <input
                  type="date"
                  className="input"
                  aria-label="To"
                  value={params.get('to') ?? ''}
                  min={params.get('from') || undefined}
                  max={istDay()}
                  onChange={(e) => set({ to: e.target.value })}
                />
              </div>
            )}
          </div>
          <div className="filters">
            <div className="search">
              <Search />
              <Input placeholder="Phone number" value={q} onChange={(e) => set({ q: e.target.value })} />
            </div>
            <Select value={params.get('campaign_id') ?? ''} options={campaignOptions} placeholder="All campaigns" onChange={(e) => set({ campaign_id: e.target.value })} />
            <Select
              value={params.get('disposition') ?? ''}
              options={dispositionOptions}
              placeholder="All dispositions"
              onChange={(e) => set({ disposition: e.target.value, outcome: '' })}
            />
            <Select
              value={params.get('direction') ?? ''}
              options={[
                { value: 'inbound', label: 'Inbound' },
                { value: 'outbound', label: 'Outbound' },
              ]}
              placeholder="Both directions"
              onChange={(e) => set({ direction: e.target.value })}
            />
            {extras.map((k) => (
              <button key={k} type="button" className="chip active" style={{ height: 34 }} onClick={() => set({ [k]: '' })} title="Remove this filter">
                {EXTRA[k]}: {k === 'agent_id' ? agentName({ agent_id: params.get(k) }) : titleCase(params.get(k))} <X size={13} />
              </button>
            ))}
          </div>
        </div>
        <Async state={list}>
          {(page) => (
            <>
              {page.items.length ? (
                <div className="table-wrap">
                  <table className="table table-stack">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Campaign</th>
                        <th>Agent</th>
                        <th>Number</th>
                        <th>Direction</th>
                        <th className="num">Duration</th>
                        <th>Disposition</th>
                        <th>Sentiment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {page.items.map((c) => (
                        <tr
                          key={c.id}
                          className="clickable"
                          onClick={() => navigate(`/calls/${c.id}`, { state: { logSearch: location.search } })}
                        >
                          <td className="muted" data-label="Time" style={{ whiteSpace: 'nowrap' }}>
                            {c.started_at ? istTime.format(new Date(c.started_at)) : '—'}
                          </td>
                          <td data-label="Campaign">{campaignName(c) ?? <span className="muted">—</span>}</td>
                          <td data-label="Agent">{agentName(c)}</td>
                          <td className="mono" data-label="Number">
                            {numberOf(c)}
                          </td>
                          <td data-label="Direction">
                            <span className="row" style={{ gap: 6 }}>
                              {c.direction === 'outbound' ? <PhoneOutgoing size={14} /> : <PhoneIncoming size={14} />}
                              {titleCase(c.direction)}
                            </span>
                          </td>
                          <td className="num mono" data-label="Duration">
                            {duration(c.duration_seconds)}
                          </td>
                          <td data-label="Disposition">
                            <DispositionBadge call={c} />
                          </td>
                          <td data-label="Sentiment">
                            {c.sentiment ? (
                              <Badge plain tone={c.sentiment === 'positive' ? 'green' : c.sentiment === 'negative' ? 'red' : ''}>
                                {titleCase(c.sentiment)}
                              </Badge>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState
                  icon={<AudioLines />}
                  title="No calls match"
                  description="Try a wider date range or clear the filters."
                  action={
                    params.toString() ? (
                      <Button onClick={() => setParams({}, { replace: true })}>Clear filters</Button>
                    ) : (
                      <Button icon={<Zap />} onClick={() => setSimulating(true)}>
                        Simulate a demo call
                      </Button>
                    )
                  }
                />
              )}
              <Pager
                offset={offset}
                limit={PAGE}
                count={page.items.length}
                total={page.total}
                onChange={(o) => {
                  const p = new URLSearchParams(params);
                  if (o) p.set('offset', String(o));
                  else p.delete('offset');
                  setParams(p);
                }}
              />
              {/* The pager hides itself on a single page; the count still shows. */}
              {offset === 0 && page.items.length > 0 && page.total <= PAGE && (
                <div className="pager">
                  <span>
                    Showing 1–{page.items.length} of {page.total}
                  </span>
                </div>
              )}
            </>
          )}
        </Async>
      </div>
      <CallNumberDialog open={calling} onClose={() => setCalling(false)} />
      <DemoSimulatorModal open={simulating} onClose={() => setSimulating(false)} />
    </section>
  );
}
