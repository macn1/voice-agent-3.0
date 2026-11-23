import { useListStaffQuery } from '../../../store/api/customerApi';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  AudioLines,
  Download,
  ExternalLink,
  Flag,
  Headphones,
  Pause,
  PhoneIncoming,
  PhoneOutgoing,
  Play,
  RefreshCw,
  Share2,
  Star,
  UserRound,
  Wrench,
  Zap,
} from 'lucide-react';
import {
  useAddReviewMutation,
  useGetCallAnalysisQuery,
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
import { LEGACY_DISPOSITIONS, useGetAgentSectionQuery, useListCampaignsQuery } from '../../../store/api/flowApi';
import { useGetLiveSessionQuery, useListLiveSessionsQuery } from '../../../store/api/orchestratorApi';
import { dateTime, money, number, titleCase } from '../../../lib/format';
import { Async, Badge, Button, EmptyState, errMsg, Field, Input, Modal, PageHeader, SegmentTabs, Skeleton, StatusBadge, useToast } from '../../../components/ui';
import { ListEditor, Select, Textarea } from '../../../components/forms';
import { useAuth } from '../../../lib/auth';
import { duration, useAgentName, useCampaignName } from '../shared';
import { BUILTIN, DispositionBadge } from './CallLog';
import { DemoSimulatorModal } from '../../../components/DemoSimulatorModal';
import { copyText } from '../../../lib/clipboard';

/** A list of calls (the Review page's queue); Home has the full call log (CallLog.jsx). */
export function CallsTable({ calls, onOpen }) {
  const agentName = useAgentName();
  const campaignName = useCampaignName();
  return (
    <div className="table-wrap">
      <table className="table table-stack">
        <thead>
          <tr>
            <th>Time</th>
            <th>Caller / callee</th>
            <th>Agent</th>
            <th className="num">Duration</th>
            <th>Result</th>
            <th>Disposition</th>
            <th>Sentiment</th>
          </tr>
        </thead>
        <tbody>
          {calls.map((c) => {
            const other = c.direction === 'outbound' ? c.to_number : c.from_number;
            return (
              <tr key={c.id} className="clickable" onClick={() => onOpen(c)}>
                <td className="muted" data-label="Time" style={{ whiteSpace: 'nowrap' }}>
                  {dateTime(c.started_at)}
                </td>
                <td data-label="">
                  <div className="row" style={{ gap: 8 }}>
                    {c.direction === 'outbound' ? <PhoneOutgoing size={15} /> : <PhoneIncoming size={15} />}
                    <div>
                      <div className="cell-main">{c.contact_name ?? other}</div>
                      <div className="cell-sub mono">{c.contact_name ? other : (campaignName(c) ?? titleCase(c.direction))}</div>
                    </div>
                    {c.flagged && <Flag size={14} color="var(--accent)" />}
                  </div>
                </td>
                <td data-label="Agent">{agentName(c)}</td>
                <td className="num mono" data-label="Duration">
                  {duration(c.duration_seconds)}
                </td>
                <td data-label="Result">
                  <StatusBadge status={c.status === 'completed' ? 'active' : c.status} label={titleCase(c.status)} />
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
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** P-19 Live calls (CALL-06, QTY-03). */
export function LiveCallsPage({ embedded = false }) {
  const toast = useToast();
  const live = useListLiveCallsQuery(undefined, { pollingInterval: 5000 });
  const [listenToCall] = useListenToCallMutation();
  const [takeOverCall] = useTakeOverCallMutation();
  const [simulating, setSimulating] = useState(false);
  const [, force] = useState(0);
  useEffect(() => {
    const tick = setInterval(() => force((x) => x + 1), 1000);
    return () => clearInterval(tick);
  }, []);

  const body = (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Campaign and dialled calls</h2>
          <div className="card-sub">Outbound calls being placed by campaigns and "Call a number", plus simulated calls. Refreshes every 5 seconds.</div>
        </div>
        {!embedded && (
          <Button size="sm" icon={<Zap />} onClick={() => setSimulating(true)}>
            Simulate a call
          </Button>
        )}
      </div>
      <Async state={live}>
        {(calls) =>
          calls.length ? (
            <div className="table-wrap">
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
                        <div className="cell-main">{c.contact_name ?? (c.direction === 'outbound' ? c.to_number : c.from_number) ?? '—'}</div>
                        <div className="cell-sub">{titleCase(c.direction)}</div>
                      </td>
                      <td>{c.agent_name ?? c.agent?.name ?? '—'}</td>
                      <td className="num mono">{duration(Math.max(0, Math.round((Date.now() - Date.parse(c.started_at ?? c.created_at)) / 1000)) || 0)}</td>
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
                              .then((r) => (r?.media_url ? window.open(r.media_url, '_blank') : toast('Listening in…')))
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
            </div>
          ) : (
            <EmptyState
              icon={<AudioLines />}
              title="No outbound calls right now"
              description="Calls taken by your agents (phone numbers, the web widget, the Test panel) show under Live sessions below."
              action={
                embedded ? undefined : (
                  <Button icon={<Zap />} onClick={() => setSimulating(true)}>
                    Simulate a call
                  </Button>
                )
              }
            />
          )
        }
      </Async>
      <DemoSimulatorModal open={simulating} onClose={() => setSimulating(false)} />
    </div>
  );
  if (embedded) return body;
  return (
    <>
      <Link to="/#calls" className="back-link">
        <ArrowLeft /> Calls
      </Link>
      <PageHeader
        eyebrow="Monitor"
        title="Live calls"
        description="Everything your agents are handling right now: outbound calls at the top, and every live conversation (phone, web widget, Test panel) under Live sessions."
        actions={
          <Button icon={<Zap />} onClick={() => setSimulating(true)}>
            Simulate call
          </Button>
        }
      />
      <div className="stack">
        {body}
        <LiveSessionsCard />
      </div>
    </>
  );
}

/** Conversations and calls running through the orchestrator (typed tests now; voice once the media server is connected). */
function LiveSessionsCard() {
  const [mode, setMode] = useState('');
  const sessions = useListLiveSessionsQuery(mode || undefined, { pollingInterval: 4000 });
  const [open, setOpen] = useState(null);
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Live sessions</h2>
          <div className="card-sub">Every conversation an agent is in right now: phone calls, the web widget and the Test panel. Refreshes every few seconds.</div>
        </div>
        <SegmentTabs
          value={mode}
          onChange={setMode}
          items={[
            { value: '', label: 'All' },
            { value: 'text', label: 'Text' },
            { value: 'voice', label: 'Voice' },
          ]}
        />
      </div>
      <Async state={sessions}>
        {(list) =>
          list.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Agent</th>
                    <th>Mode</th>
                    <th>Channel</th>
                    <th className="num">Turns</th>
                    <th>Started</th>
                    <th>Last activity</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {list.map((x) => (
                    <tr key={x.id}>
                      <td>{x.agent_name ?? x.agent?.name ?? '—'}</td>
                      <td>
                        <Badge tone={x.mode === 'voice' ? 'blue' : ''}>{titleCase(x.mode)}</Badge>
                      </td>
                      <td>{titleCase(x.channel ?? '—')}</td>
                      <td className="num">{x.turn_count ?? 0}</td>
                      <td>{dateTime(x.started_at)}</td>
                      <td>{dateTime(x.last_activity_at)}</td>
                      <td className="actions">
                        <Button size="sm" variant="ghost" onClick={() => setOpen(x)}>
                          Transcript
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={<AudioLines />}
              title="No conversations right now"
              description="They appear here while they run. To try one, open an agent and use Test, or call one of your numbers."
            />
          )
        }
      </Async>
      <LiveSessionModal session={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function LiveSessionModal({ session, onClose }) {
  const q = useGetLiveSessionQuery(session?.id, { skip: !session, pollingInterval: session ? 3000 : 0 });
  const turns = q.data?.turns ?? [];
  return (
    <Modal open={!!session} onClose={onClose} wide title={session?.agent_name ?? 'Session'} description={session ? `${titleCase(session.mode)} · started ${dateTime(session.started_at)}` : undefined}>
      <Async state={q} skeleton={<Skeleton h={200} />}>
        {() =>
          turns.length ? (
            <div className="chat" style={{ maxHeight: 420, overflow: 'auto' }}>
              {turns.map((t) => (
                <div key={t.id ?? t.seq} className={`bubble ${t.speaker === 'caller' ? 'me' : t.speaker === 'tool' ? 'sys' : 'them'}`}>
                  {t.text}
                  <div className="meta">
                    {[t.speaker === 'tool' ? 'Tool' : null, t.rule && `Rule: ${t.rule}`, t.latency_ms != null && `${t.latency_ms} ms`, t.offset_ms != null && `+${(t.offset_ms / 1000).toFixed(1)}s`]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No turns yet" />
          )
        }
      </Async>
    </Modal>
  );
}

/** P-17 Call detail (CALL-05, PCA-01..03, INT-F5). */
export function CallDetailPage() {
  const { id = '' } = useParams();
  // Back to the call log with the filters it was opened from.
  const { state } = useLocation();
  const agentName = useAgentName();
  const campaignName = useCampaignName();
  const staff = useListStaffQuery();
  const staffName = (userId) => (staff.data?.items ?? staff.data ?? []).find?.((u) => u.id === userId)?.name ?? 'a teammate';
  const toast = useToast();
  const { can } = useAuth();
  const call = useGetCallQuery(id);
  const transcript = useGetTranscriptQuery(id);
  const analysis = useGetCallAnalysisQuery(id);
  // Only ask for a recording when the call says it has one (else the API answers 404).
  const recording = useGetRecordingQuery(id, { skip: !call.data?.has_recording });
  const reviews = useListReviewsQuery(id);
  // Outcome labels come from the call's campaign (its agent's, for a call from before campaigns).
  // A call whose campaign was deleted keeps its name; its dispositions are then the built-in ones.
  const campaigns = useListCampaignsQuery({ limit: 200 });
  const campaignGone = !!call.data?.campaign_id && campaigns.isSuccess && !campaigns.data.items.some((x) => x.id === call.data.campaign_id);
  const outcomes = useGetAgentSectionQuery({ id: call.data?.campaign_id, section: 'outcomes' }, { skip: !call.data?.campaign_id || !campaigns.isSuccess || campaignGone });
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
    const raw = transcript.data;
    const t = Array.isArray(raw) ? raw : (raw?.turns ?? []);
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
      <Link to={`/${state?.logSearch ?? ''}#calls`} className="back-link">
        <ArrowLeft /> Calls
      </Link>
      <Async state={call} skeleton={<Skeleton h={300} style={{ borderRadius: 14 }} />}>
        {(c) => (
          <>
            <header className="agent-head">
              <div>
                <div className="row" style={{ gap: 10 }}>
                  <h1 className="text-detail-title">{c.contact_name ?? (c.direction === 'outbound' ? c.to_number : c.from_number)}</h1>
                  <StatusBadge status={c.status === 'completed' ? 'active' : c.status} label={titleCase(c.status)} />
                  {(c.disposition || c.outcome) && <DispositionBadge call={c} />}
                  {c.flagged && <Badge tone="orange">Flagged</Badge>}
                  {c.is_simulated && <Badge>Simulated</Badge>}
                </div>
                <p className="muted" style={{ marginTop: 6 }}>
                  {c.campaign_id ? (
                    campaignGone ? (
                      <span>{campaignName(c) ?? 'Campaign'} (deleted)</span>
                    ) : (
                      <Link to={`/campaigns/${c.campaign_id}`}>{campaignName(c) ?? 'Campaign'}</Link>
                    )
                  ) : (
                    'No campaign'
                  )}{' '}
                  · {titleCase(c.direction)} · {dateTime(c.started_at)} · {duration(c.duration_seconds)} · {agentName(c)}
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
                  Disposition & tags
                </Button>
                <Button size="sm" icon={<Star />} onClick={() => setReviewing(true)}>
                  Review
                </Button>
                <Button
                  size="sm"
                  icon={<Share2 />}
                  onClick={async () => {
                    if (await copyText(window.location.href)) toast('Link copied. Anyone in your company who can see calls can open it.');
                    else toast(`Couldn't copy. The link is ${window.location.href}`, 'error');
                  }}
                >
                  Share
                </Button>
              </div>
            </header>

            <div
              className="grid-2"
              style={{
                '--grid-cols': 'minmax(0, 1.4fr) minmax(0, 1fr)',
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
                    <p className="muted small">
                      {recording.isLoading
                        ? 'Loading…'
                        : !call.data?.has_recording || recording.error?.status === 404
                          ? 'No recording for this call. The transcript below has everything that was said.'
                          : "The recording couldn't be loaded. Try again in a minute."}
                    </p>
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
                        {(data) => {
                          const turns = Array.isArray(data) ? data : (data?.turns ?? []);
                          return turns.length ? (
                            <>
                              {turns.map((t) => (
                                <TranscriptLine key={t.seq} t={t} active={t.seq === activeSeq} onClick={() => seek(t.offset_ms)} />
                              ))}
                            </>
                          ) : (
                            <EmptyState title="No transcript" />
                          );
                        }}
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
                  <p className="text-body">{analysis.data?.summary ?? c.summary ?? <span className="muted">No summary.</span>}</p>
                  {(analysis.data?.sentiment ?? c.sentiment) && (
                    <div className="row small">
                      Sentiment{' '}
                      <Badge
                        plain
                        tone={
                          (analysis.data?.sentiment ?? c.sentiment) === 'positive'
                            ? 'green'
                            : (analysis.data?.sentiment ?? c.sentiment) === 'negative'
                              ? 'red'
                              : ''
                        }
                      >
                        {titleCase(analysis.data?.sentiment ?? c.sentiment)}
                      </Badge>
                    </div>
                  )}
                  {c.flag_reasons.length > 0 && (
                    <div className="banner warn" style={{ margin: 0 }}>
                      {c.flag_reasons.join(' · ')}
                    </div>
                  )}
                </div>
                <KvCard title="Extracted fields" data={analysis.data?.extracted ?? c.extracted} />
                <KvCard title="Call variables" data={c.variables} />
                <div className="card card-pad stack" style={{ gap: 10 }}>
                  <span className="card-title">Details</span>
                  <dl
                    className="kv"
                    style={{
                      gridTemplateColumns: '120px 1fr',
                      rowGap: 8,
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
                          <Link to={`/campaigns/${c.campaign_id}`}>{campaignName(c) ?? 'Open'}</Link>
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
                        <b>{Math.round(r.total_score ?? 0)}</b>/100 by {staffName(r.reviewer_user_id)} · {dateTime(r.created_at)}
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

/** The call's disposition (how it ended) and tags; an older call's outcome shows as the disposition it became. */
function OutcomeModal({ open, onClose, call, outcomes, onSaved }) {
  const current = () => call.disposition ?? LEGACY_DISPOSITIONS[call.outcome] ?? call.outcome ?? '';
  const [outcome, setOutcome] = useState(current());
  const [tags, setTags] = useState(call.tags);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const [updateCall] = useUpdateCallMutation();
  useEffect(() => {
    setOutcome(current());
    setTags(call.tags);
  }, [call, open]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Disposition & tags"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const label = (outcomes?.outcomes ?? []).find((o) => o.key === outcome)?.label;
                onSaved(await updateCall({ id: call.id, disposition: outcome || undefined, ...(label ? { disposition_label: label } : {}), tags }).unwrap());
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
        <Field label="Disposition" hint="How the call ended. Follow-up actions use it.">
          <Select
            value={outcome}
            options={(outcomes?.outcomes ?? BUILTIN.map(([key, label]) => ({ key, label }))).map((o) => ({
              value: o.key,
              label: o.label,
            }))}
            placeholder="None"
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
  const total = card ? Math.round(card.criteria.reduce((s, c) => s + ((scores[c.key] ?? 0) / (c.max_score || 5)) * c.weight, 0)) : 0;
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
                  scorecard_id: card?.id,
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
          <div key={c.key} className="row between wrap">
            <div>
              <div className="fw-medium">
                {c.name} <span className="muted small">· {c.weight}%</span>
              </div>
              <div className="muted small">{c.description}</div>
            </div>
            <div className="row" style={{ gap: 4 }}>
              {Array.from({ length: c.max_score || 5 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`chip ${scores[c.key] === n ? 'active' : ''}`}
                  style={{
                    height: 32,
                    width: 36,
                    padding: 0,
                    justifyContent: 'center',
                  }}
                  onClick={() => setScores((s) => ({ ...s, [c.key]: n }))}
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
            <div key={i} className="row wrap" style={{ gap: 8 }}>
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
              <div className="table-wrap">
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
              </div>
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
