import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  AudioLines,
  Download,
  ExternalLink,
  Flag,
  Headphones,
  Pause,
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  Play,
  RefreshCw,
  Search,
  Share2,
  Star,
  UserRound,
  Wrench,
} from 'lucide-react';
import {
  useAddReviewMutation,
  useGetCallQuery,
  useGetRecordingQuery,
  useGetTranscriptQuery,
  useListCallsQuery,
  useListenToCallMutation,
  useListLiveCallsQuery,
  useListReviewsQuery,
  useListScorecardsQuery,
  usePushCallToCrmMutation,
  usePutScorecardsMutation,
  useRerunAnalysisMutation,
  useTakeOverCallMutation,
  useUpdateCallMutation,
} from '../../../store/api/callsApi';
import { useGetAgentSectionQuery } from '../../../store/api/flowApi';
import { useCreateExportMutation } from '../../../store/api/analyticsApi';
import { dateTime, money, number, titleCase } from '../../../lib/format';
import { Async, Badge, Button, EmptyState, errMsg, Field, Input, Modal, PageHeader, Pager, Skeleton, StatusBadge, useToast } from '../../../components/ui';
import { ListEditor, Select, Textarea } from '../../../components/forms';
import { useAuth } from '../../../lib/auth';
import { CallNumberDialog, duration, OUTCOME_TONE, useAgentOptions } from '../shared';

const PAGE = 25;

export function CallFilters({ params, set, agentOptions }) {
  return (
    <div className="filters">
      <div className="search">
        <Search />
        <Input placeholder="Phone number" value={params.get('phone') ?? ''} onChange={(e) => set('phone', e.target.value)} />
      </div>
      <Select
        value={params.get('range') ?? '7d'}
        options={[
          { value: '1d', label: 'Today' },
          { value: '7d', label: 'Last 7 days' },
          { value: '30d', label: 'Last 30 days' },
          { value: '90d', label: 'Last 90 days' },
        ]}
        onChange={(e) => set('range', e.target.value)}
      />
      <Select value={params.get('agent_id') ?? ''} options={agentOptions} placeholder="All agents" onChange={(e) => set('agent_id', e.target.value)} />
      <Select
        value={params.get('direction') ?? ''}
        options={['inbound', 'outbound', 'web', 'test']}
        placeholder="All directions"
        onChange={(e) => set('direction', e.target.value)}
      />
      <Select
        value={params.get('status') ?? ''}
        options={['completed', 'no_answer', 'busy', 'voicemail', 'failed']}
        placeholder="All results"
        onChange={(e) => set('status', e.target.value)}
      />
      <Select
        value={params.get('flagged') ?? ''}
        options={[{ value: 'true', label: 'Flagged only' }]}
        placeholder="Flagged or not"
        onChange={(e) => set('flagged', e.target.value)}
      />
    </div>
  );
}

export function CallsTable({ calls, onOpen }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Caller / callee</th>
            <th>Agent</th>
            <th className="num">Duration</th>
            <th>Result</th>
            <th>Outcome</th>
            <th>Sentiment</th>
          </tr>
        </thead>
        <tbody>
          {calls.map((c) => {
            const other = c.direction === 'outbound' ? c.to_number : c.from_number;
            return (
              <tr key={c.id} className="clickable" onClick={() => onOpen(c)}>
                <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                  {dateTime(c.started_at)}
                </td>
                <td>
                  <div className="row" style={{ gap: 8 }}>
                    {c.direction === 'outbound' ? <PhoneOutgoing size={15} /> : <PhoneIncoming size={15} />}
                    <div>
                      <div className="cell-main">{c.contact_name ?? other}</div>
                      <div className="cell-sub mono">{c.contact_name ? other : (c.campaign_name ?? titleCase(c.direction))}</div>
                    </div>
                    {c.flagged && <Flag size={14} color="var(--accent)" />}
                  </div>
                </td>
                <td>{c.agent_name ?? '—'}</td>
                <td className="num mono">{duration(c.duration_seconds)}</td>
                <td>
                  <StatusBadge status={c.status === 'completed' ? 'active' : c.status} label={titleCase(c.status)} />
                </td>
                <td>{c.outcome ? <Badge tone={OUTCOME_TONE(c.is_success)}>{titleCase(c.outcome)}</Badge> : <span className="muted">—</span>}</td>
                <td>
                  {c.sentiment ? (
                    <Badge plain tone={c.sentiment === 'positive' ? 'green' : c.sentiment === 'negative' ? 'red' : ''}>
                      {titleCase(c.sentiment)}
                    </Badge>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** P-16 Calls (CALL-05). */
export function CallsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const { options } = useAgentOptions();
  const [calling, setCalling] = useState(false);
  const offset = Number(params.get('offset') ?? 0);
  const filters = Object.fromEntries([...params.entries()].filter(([k]) => k !== 'offset'));
  const list = useListCallsQuery({ range: '7d', ...filters, limit: PAGE, offset });
  const [createExport] = useCreateExportMutation();
  const set = (k, v) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v);
    else p.delete(k);
    p.delete('offset');
    setParams(p, { replace: true });
  };

  return (
    <>
      <PageHeader
        eyebrow="Monitor"
        title="Call logs"
        description="Every call with its recording, transcript, summary, extracted data and outcome."
        actions={
          <>
            <Button
              icon={<Download />}
              onClick={async () => {
                try {
                  await createExport({ kind: 'calls', filters: { range: '7d', ...filters } }).unwrap();
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
          </>
        }
      />

      <div className="card">
        <div className="card-head">
          <CallFilters params={params} set={set} agentOptions={options} />
        </div>
        <Async state={list}>
          {(page) => (
            <>
              {page.items.length ? (
                <CallsTable calls={page.items} onOpen={(c) => navigate(`/calls/${c.id}`)} />
              ) : (
                <EmptyState icon={<AudioLines />} title="No calls match" description="Try a wider date range or clear filters." />
              )}
              <Pager
                offset={offset}
                limit={PAGE}
                count={page.items.length}
                total={page.total}
                onChange={(o) => {
                  const p = new URLSearchParams(params);
                  p.set('offset', String(o));
                  setParams(p);
                }}
              />
            </>
          )}
        </Async>
      </div>
      <CallNumberDialog open={calling} onClose={() => setCalling(false)} />
    </>
  );
}

/** P-19 Live calls (CALL-06, QTY-03). */
export function LiveCallsPage({ embedded = false }) {
  const toast = useToast();
  const live = useListLiveCallsQuery(undefined, { pollingInterval: 5000 });
  const [listenToCall] = useListenToCallMutation();
  const [takeOverCall] = useTakeOverCallMutation();
  const [, force] = useState(0);
  useEffect(() => {
    const tick = setInterval(() => force((x) => x + 1), 1000);
    return () => clearInterval(tick);
  }, []);

  const body = (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Calls in progress</h2>
          <div className="card-sub">Refreshes every 5 seconds.</div>
        </div>
      </div>
      <Async state={live}>
        {(calls) =>
          calls.length ? (
            <table className="table">
              <thead>
                <tr>
                  <th>Caller</th>
                  <th>Agent</th>
                  <th className="num">Elapsed</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {calls.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div className="cell-main">{c.contact_name ?? (c.direction === 'outbound' ? c.to_number : c.from_number)}</div>
                      <div className="cell-sub">{titleCase(c.direction)}</div>
                    </td>
                    <td>{c.agent_name}</td>
                    <td className="num mono">{duration(Math.round((Date.now() - Date.parse(c.started_at)) / 1000))}</td>
                    <td>
                      <StatusBadge status="active" label={titleCase(c.status)} />
                    </td>
                    <td className="actions">
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Headphones />}
                        onClick={() =>
                          listenToCall(c.id)
                            .unwrap()
                            .then((r) => window.open(r.media_url, '_blank'))
                            .catch((e) => toast(errMsg(e), 'error'))
                        }
                      >
                        Listen
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<UserRound />}
                        onClick={() =>
                          takeOverCall(c.id)
                            .unwrap()
                            .then(() => toast('You are now on the call'))
                            .catch((e) => toast(errMsg(e), 'error'))
                        }
                      >
                        Take over
                      </Button>
                      <Link to={`/calls/${c.id}`} className="btn sm ghost">
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState icon={<AudioLines />} title="No calls right now" description="Calls in progress appear here as they happen." />
          )
        }
      </Async>
    </div>
  );
  if (embedded) return body;
  return (
    <>
      <Link to="/calls" className="back-link">
        <ArrowLeft /> Call logs
      </Link>
      <PageHeader eyebrow="Monitor" title="Live calls" />
      {body}
    </>
  );
}

/** P-17 Call detail (CALL-05, PCA-01..03, INT-F5). */
export function CallDetailPage() {
  const { id = '' } = useParams();
  const toast = useToast();
  const { can } = useAuth();
  const call = useGetCallQuery(id);
  const transcript = useGetTranscriptQuery(id);
  const recording = useGetRecordingQuery(id);
  const reviews = useListReviewsQuery(id);
  const outcomes = useGetAgentSectionQuery({ id: call.data?.agent_id, section: 'outcomes' }, { skip: !call.data?.agent_id });
  const [updateCall] = useUpdateCallMutation();
  const [rerunAnalysis] = useRerunAnalysisMutation();
  const [pushToCrm] = usePushCallToCrmMutation();
  const audio = useRef(null);
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [rerunning, setRerunning] = useState(false);

  const activeSeq = useMemo(() => {
    const t = transcript.data ?? [];
    let a = -1;
    t.forEach((x) => x.offset_ms <= pos && (a = x.seq));
    return a;
  }, [transcript.data, pos]);

  const seek = (ms) => {
    if (!audio.current) return;
    audio.current.currentTime = ms / 1000;
    void audio.current.play();
  };

  const transcriptHidden = transcript.error?.status === 403;

  return (
    <>
      <Link to="/calls" className="back-link">
        <ArrowLeft /> Call logs
      </Link>
      <Async state={call} skeleton={<Skeleton h={300} style={{ borderRadius: 14 }} />}>
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
                    {c.contact_name ?? (c.direction === 'outbound' ? c.to_number : c.from_number)}
                  </h1>
                  <StatusBadge status={c.status === 'completed' ? 'active' : c.status} label={titleCase(c.status)} />
                  {c.outcome && <Badge tone={OUTCOME_TONE(c.is_success)}>{titleCase(c.outcome)}</Badge>}
                  {c.flagged && <Badge tone="orange">Flagged</Badge>}
                  {c.is_simulated && <Badge>Simulated</Badge>}
                </div>
                <p className="muted" style={{ marginTop: 6 }}>
                  {titleCase(c.direction)} · {dateTime(c.started_at)} · {duration(c.duration_seconds)} · {c.agent_name}
                  {c.agent_version ? ` v${c.agent_version}` : ''} · {number(c.billable_minutes)} min
                  {c.cost_amount != null ? ` · ${money(c.cost_amount)}` : ''}
                </p>
              </div>
              <div className="row wrap">
                <Button
                  size="sm"
                  icon={<Flag />}
                  onClick={() =>
                    updateCall({ id, flagged: !c.flagged })
                      .unwrap()
                      .catch((e) => toast(errMsg(e), 'error'))
                  }
                >
                  {c.flagged ? 'Unflag' : 'Flag'}
                </Button>
                <Button size="sm" onClick={() => setEditing(true)}>
                  Outcome & tags
                </Button>
                <Button size="sm" icon={<Star />} onClick={() => setReviewing(true)}>
                  Review
                </Button>
                <Button
                  size="sm"
                  icon={<Share2 />}
                  onClick={() => {
                    navigator.clipboard?.writeText(window.location.href);
                    toast('Link copied');
                  }}
                >
                  Share
                </Button>
              </div>
            </header>

            <div
              className="grid-2"
              style={{
                gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)',
                alignItems: 'start',
              }}
            >
              <div className="stack">
                <div className="card card-pad">
                  <div className="row between" style={{ marginBottom: 12 }}>
                    <span className="card-title">Recording</span>
                    {recording.data?.url && (
                      <a className="btn sm ghost" href={recording.data.url} download>
                        <Download size={15} /> Download
                      </a>
                    )}
                  </div>
                  {recording.data?.url ? (
                    <div className="row">
                      <button
                        className="round-ink"
                        onClick={() => (playing ? audio.current?.pause() : audio.current?.play())}
                        aria-label={playing ? 'Pause' : 'Play'}
                      >
                        {playing ? <Pause /> : <Play />}
                      </button>
                      <input
                        type="range"
                        className="range"
                        min={0}
                        max={c.duration_seconds * 1000}
                        value={pos}
                        onChange={(e) => {
                          if (audio.current) audio.current.currentTime = Number(e.target.value) / 1000;
                        }}
                      />

                      <span className="mono small">
                        {duration(Math.round(pos / 1000))} / {duration(c.duration_seconds)}
                      </span>
                      <audio
                        ref={audio}
                        src={recording.data.url}
                        onTimeUpdate={(e) => setPos(e.currentTarget.currentTime * 1000)}
                        onPlay={() => setPlaying(true)}
                        onPause={() => setPlaying(false)}
                      />
                    </div>
                  ) : (
                    <p className="muted small">{recording.isLoading ? 'Loading…' : 'No recording — still uploading, or recording is off for this agent.'}</p>
                  )}
                </div>
                <div className="card">
                  <div className="card-head">
                    <h2>Transcript</h2>
                    <span className="muted small">Click a line to jump there</span>
                  </div>
                  <div style={{ padding: 8 }}>
                    {!can('transcripts.view') || transcriptHidden ? (
                      <EmptyState title="Transcript hidden" description="Transcripts aren't visible for your company or your role." />
                    ) : (
                      <Async state={transcript}>
                        {(turns) =>
                          turns.length ? (
                            <>
                              {turns.map((t) => (
                                <TranscriptLine key={t.seq} t={t} active={t.seq === activeSeq} onClick={() => seek(t.offset_ms)} />
                              ))}
                            </>
                          ) : (
                            <EmptyState title="No transcript" />
                          )
                        }
                      </Async>
                    )}
                  </div>
                </div>
              </div>
              <div className="stack">
                <div className="card card-pad stack" style={{ gap: 14 }}>
                  <div className="row between">
                    <span className="card-title">Summary</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<RefreshCw />}
                      loading={rerunning}
                      onClick={async () => {
                        setRerunning(true);
                        try {
                          await rerunAnalysis(id).unwrap();
                          toast('Analysis updated');
                        } catch (e) {
                          toast(errMsg(e), 'error');
                        } finally {
                          setRerunning(false);
                        }
                      }}
                    >
                      Re-run
                    </Button>
                  </div>
                  <p style={{ fontSize: 14.5 }}>{c.summary ?? <span className="muted">No summary.</span>}</p>
                  {c.sentiment && (
                    <div className="row small">
                      Sentiment{' '}
                      <Badge plain tone={c.sentiment === 'positive' ? 'green' : c.sentiment === 'negative' ? 'red' : ''}>
                        {titleCase(c.sentiment)}
                      </Badge>
                    </div>
                  )}
                  {c.flag_reasons.length > 0 && (
                    <div className="banner warn" style={{ margin: 0 }}>
                      {c.flag_reasons.join(' · ')}
                    </div>
                  )}
                </div>
                <KvCard title="Extracted fields" data={c.extracted} />
                <KvCard title="Call variables" data={c.variables} />
                <div className="card card-pad stack" style={{ gap: 10 }}>
                  <span className="card-title">Details</span>
                  <dl
                    className="kv"
                    style={{
                      gridTemplateColumns: '120px 1fr',
                      rowGap: 8,
                      fontSize: 13.5,
                    }}
                  >
                    <dt>From</dt>
                    <dd className="mono">{c.from_number}</dd>
                    <dt>To</dt>
                    <dd className="mono">{c.to_number}</dd>
                    <dt>Ended by</dt>
                    <dd>{titleCase(c.end_reason ?? '—')}</dd>
                    <dt>Transferred</dt>
                    <dd>{c.transferred ? 'Yes' : 'No'}</dd>
                    <dt>Response time</dt>
                    <dd>{c.latency_ms_p50 ? `${c.latency_ms_p50} ms median` : '—'}</dd>
                    {c.campaign_id && (
                      <>
                        <dt>Campaign</dt>
                        <dd>
                          <Link to={`/campaigns/${c.campaign_id}`}>{c.campaign_name ?? 'Open'}</Link>
                        </dd>
                      </>
                    )}
                    {c.contact_id && (
                      <>
                        <dt>Contact</dt>
                        <dd>
                          <Link to={`/contacts/${c.contact_id}`}>{c.contact_name ?? 'Open'}</Link>
                        </dd>
                      </>
                    )}
                    <dt>Tags</dt>
                    <dd>{c.tags.length ? c.tags.join(', ') : '—'}</dd>
                    <dt>CRM</dt>
                    <dd>
                      {c.crm_push?.status === 'pushed' ? (
                        <a href={c.crm_push.external_url} target="_blank" rel="noreferrer" className="row" style={{ gap: 4 }}>
                          Synced <ExternalLink size={13} />
                        </a>
                      ) : (
                        <button
                          className="btn sm ghost"
                          style={{ height: 26 }}
                          onClick={() =>
                            pushToCrm(id)
                              .unwrap()
                              .catch((e) => toast(errMsg(e), 'error'))
                          }
                        >
                          {c.crm_push?.status === 'failed' ? 'Retry push' : 'Push to CRM'}
                        </button>
                      )}
                    </dd>
                  </dl>
                </div>
                <div className="card card-pad stack" style={{ gap: 10 }}>
                  <span className="card-title">Reviews</span>
                  {(reviews.data ?? []).length ? (
                    reviews.data.map((r) => (
                      <div key={r.id} className="small">
                        <b>{r.total_score}</b>/100 by {r.reviewer} · {dateTime(r.created_at)}
                        {r.comments.map((cm, i) => (
                          <div key={i} className="muted">
                            Line {cm.seq}: {cm.text}
                          </div>
                        ))}
                      </div>
                    ))
                  ) : (
                    <span className="muted small">Not reviewed yet.</span>
                  )}
                </div>
              </div>
            </div>
            <OutcomeModal open={editing} onClose={() => setEditing(false)} call={c} outcomes={outcomes.data ?? null} onSaved={() => {}} />
            <ReviewModal open={reviewing} onClose={() => setReviewing(false)} call={c} turns={transcript.data ?? []} onSaved={() => {}} />
          </>
        )}
      </Async>
    </>
  );
}

function TranscriptLine({ t, active, onClick }) {
  return (
    <div className={`transcript-line ${active ? 'active' : ''}`} onClick={onClick}>
      <span className="mono muted small">{duration(Math.round(t.offset_ms / 1000))}</span>
      <span
        className="who"
        style={{
          color: t.speaker === 'agent' ? 'var(--series-1, #2a78d6)' : t.speaker === 'tool' ? 'var(--accent)' : undefined,
        }}
      >
        {t.speaker}
      </span>
      <span>
        {t.tool_call ? (
          <span className="row small" style={{ gap: 6 }}>
            <Wrench size={13} /> <span className="mono">{t.tool_call.name}</span> →{' '}
            <span className="mono muted">{JSON.stringify(t.tool_call.response).slice(0, 120)}</span>
          </span>
        ) : (
          t.text
        )}
        {t.latency_ms ? <span className="muted small"> · {t.latency_ms} ms</span> : null}
      </span>
    </div>
  );
}

function KvCard({ title, data }) {
  const entries = Object.entries(data ?? {});
  return (
    <div className="card card-pad stack" style={{ gap: 10 }}>
      <span className="card-title">{title}</span>
      {entries.length ? (
        <dl
          className="kv"
          style={{
            gridTemplateColumns: '140px 1fr',
            rowGap: 8,
            fontSize: 13.5,
          }}
        >
          {entries.map(([k, v]) => (
            <div key={k} style={{ display: 'contents' }}>
              <dt className="mono">{k}</dt>
              <dd>{v === null || v === undefined ? '—' : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v)}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <span className="muted small">None.</span>
      )}
    </div>
  );
}

function OutcomeModal({ open, onClose, call, outcomes, onSaved }) {
  const [outcome, setOutcome] = useState(call.outcome ?? '');
  const [tags, setTags] = useState(call.tags);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const [updateCall] = useUpdateCallMutation();
  useEffect(() => {
    setOutcome(call.outcome ?? '');
    setTags(call.tags);
  }, [call, open]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Outcome & tags"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                onSaved(await updateCall({ id: call.id, outcome, tags }).unwrap());
                onClose();
              } catch (e) {
                toast(errMsg(e), 'error');
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
        <Field label="Outcome">
          <Select
            value={outcome}
            options={(outcomes?.outcomes ?? []).map((o) => ({
              value: o.key,
              label: o.label,
            }))}
            placeholder="No outcome"
            onChange={(e) => setOutcome(e.target.value)}
          />
        </Field>
        <Field label="Tags">
          <ListEditor value={tags} onChange={setTags} />
        </Field>
      </div>
    </Modal>
  );
}

/** PCA-03.5 scorecard + line-level comments. */
function ReviewModal({ open, onClose, call, turns, onSaved }) {
  const toast = useToast();
  const cards = useListScorecardsQuery(undefined, { skip: !open });
  const [addReview] = useAddReviewMutation();
  const card = cards.data?.find((c) => c.is_default) ?? cards.data?.[0];
  const [scores, setScores] = useState({});
  const [comments, setComments] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setScores({});
      setComments([]);
    }
  }, [open]);
  const total = card ? Math.round(card.criteria.reduce((s, c) => s + ((scores[c.name] ?? 0) / 5) * c.weight, 0)) : 0;
  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="Review this call"
      description={card ? `${card.name} · score ${total}/100` : 'Score the call and comment on lines.'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await addReview({
                  id: call.id,
                  scores,
                  comments: comments.filter((c) => c.text.trim()),
                }).unwrap();
                toast('Review saved');
                onSaved();
                onClose();
              } catch (e) {
                toast(errMsg(e), 'error');
              } finally {
                setBusy(false);
              }
            }}
          >
            Save review
          </Button>
        </>
      }
    >
      <div className="stack">
        {card?.criteria.map((c) => (
          <div key={c.name} className="row between wrap">
            <div>
              <div style={{ fontWeight: 500 }}>
                {c.name} <span className="muted small">· {c.weight}%</span>
              </div>
              <div className="muted small">{c.description}</div>
            </div>
            <div className="row" style={{ gap: 4 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`chip ${scores[c.name] === n ? 'active' : ''}`}
                  style={{
                    height: 32,
                    width: 36,
                    padding: 0,
                    justifyContent: 'center',
                  }}
                  onClick={() => setScores((s) => ({ ...s, [c.name]: n }))}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        ))}
        {!card && !cards.isLoading && <p className="muted small">No scorecard defined — set one up on the Quality review page.</p>}
        <div className="field">
          <span className="field-label">Comments on lines</span>
          {comments.map((cm, i) => (
            <div key={i} className="row" style={{ gap: 8 }}>
              <Select
                style={{ width: 220 }}
                value={String(cm.seq)}
                options={turns.map((t) => ({
                  value: String(t.seq),
                  label: `${t.seq}. ${(t.text ?? t.tool_call?.name ?? '').slice(0, 30)}`,
                }))}
                onChange={(e) => setComments(comments.map((x, j) => (j === i ? { ...x, seq: Number(e.target.value) } : x)))}
              />
              <Textarea rows={1} value={cm.text} onChange={(e) => setComments(comments.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
            </div>
          ))}
          <div>
            <Button size="sm" variant="ghost" disabled={!turns.length} onClick={() => setComments([...comments, { seq: turns[0]?.seq ?? 0, text: '' }])}>
              Add comment
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/** P-30 Quality review (PCA-03). */
export function ReviewPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const queue = useListCallsQuery({ flagged: true, range: '30d', limit: 50 });
  const cards = useListScorecardsQuery();
  const [putScorecards] = usePutScorecardsMutation();
  const [editing, setEditing] = useState(null);

  return (
    <>
      <PageHeader
        eyebrow="Monitor"
        title="Quality review"
        description="Calls flagged automatically — rule broken, caller upset, agent didn't know, very short call. Listen, score and fix."
      />
      <div className="card">
        <div className="card-head">
          <h2>Review queue</h2>
        </div>
        <Async state={queue}>
          {(p) =>
            p.items.length ? (
              <CallsTable calls={p.items} onOpen={(c) => navigate(`/calls/${c.id}`)} />
            ) : (
              <EmptyState icon={<Flag />} title="Nothing to review" description="Flagged calls land here." />
            )
          }
        </Async>
      </div>
      <div className="card" style={{ marginTop: 18 }}>
        <div className="card-head">
          <div>
            <h2>Scorecards</h2>
            <div className="card-sub">Criteria reviewers score each call on.</div>
          </div>
          <Button
            size="sm"
            onClick={() =>
              setEditing({
                id: '',
                name: 'New scorecard',
                criteria: [{ name: '', weight: 100, description: '' }],
                is_default: !(cards.data ?? []).length,
              })
            }
          >
            New scorecard
          </Button>
        </div>
        <Async state={cards}>
          {(list) =>
            list.length ? (
              <table className="table">
                <tbody>
                  {list.map((c) => (
                    <tr key={c.id} className="clickable" onClick={() => setEditing(structuredClone(c))}>
                      <td className="cell-main">
                        {c.name} {c.is_default && <Badge tone="ink">Default</Badge>}
                      </td>
                      <td className="muted">{c.criteria.map((x) => `${x.name} ${x.weight}%`).join(' · ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState title="No scorecards" />
            )
          }
        </Async>
      </div>
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        wide
        title="Scorecard"
        footer={
          <>
            <Button onClick={() => setEditing(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={async () => {
                if (!editing) return;
                const sum = editing.criteria.reduce((s, c) => s + Number(c.weight), 0);
                if (sum !== 100) return toast(`Weights add up to ${sum}% — make them 100%`, 'error');
                const all = cards.data ?? [];
                const next = editing.id ? all.map((c) => (c.id === editing.id ? editing : c)) : [...all, editing];
                try {
                  await putScorecards(next.map((c) => (editing.is_default && c !== editing ? { ...c, is_default: false } : c))).unwrap();
                  setEditing(null);
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
        {editing && (
          <div className="stack">
            <Field label="Name">
              <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </Field>
            {editing.criteria.map((c, i) => (
              <div key={i} className="row wrap" style={{ gap: 8 }}>
                <input
                  className="input"
                  style={{ flex: 1, minWidth: 140 }}
                  placeholder="Criterion"
                  value={c.name}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      criteria: editing.criteria.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                    })
                  }
                />
                <input
                  className="input"
                  style={{ width: 90 }}
                  type="number"
                  value={c.weight}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      criteria: editing.criteria.map((x, j) => (j === i ? { ...x, weight: Number(e.target.value) } : x)),
                    })
                  }
                />
                <input
                  className="input"
                  style={{ flex: 2, minWidth: 160 }}
                  placeholder="What good looks like"
                  value={c.description}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      criteria: editing.criteria.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)),
                    })
                  }
                />
              </div>
            ))}
            <div className="row">
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  setEditing({
                    ...editing,
                    criteria: [...editing.criteria, { name: '', weight: 0, description: '' }],
                  })
                }
              >
                Add criterion
              </Button>
              <label className="check">
                <input type="checkbox" checked={editing.is_default} onChange={(e) => setEditing({ ...editing, is_default: e.target.checked })} />
                Default scorecard
              </label>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

/** Inbound calls: live calls + inbound log + number routing shortcuts. */
export function InboundPage() {
  const navigate = useNavigate();
  const inbound = useListCallsQuery({ direction: 'inbound', range: '7d', limit: 15 });
  return (
    <>
      <PageHeader
        eyebrow="Deploy"
        title="Inbound calls"
        description="Calls coming in to your numbers right now and recently. Set who answers and when on Phone numbers."
        actions={
          <Link to="/numbers" className="btn">
            <PhoneIncoming size={16} /> Numbers & routing
          </Link>
        }
      />

      <div className="stack">
        <LiveCallsPage embedded />
        <div className="card">
          <div className="card-head">
            <h2>Recent inbound calls</h2>
            <Link to="/calls?direction=inbound" className="btn sm ghost">
              All inbound calls
            </Link>
          </div>
          <Async state={inbound}>
            {(p) =>
              p.items.length ? (
                <CallsTable calls={p.items} onOpen={(c) => navigate(`/calls/${c.id}`)} />
              ) : (
                <EmptyState title="No inbound calls in the last 7 days" />
              )
            }
          </Async>
        </div>
      </div>
    </>
  );
}
