import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  Brain,
  FlaskConical,
  GitBranch,
  Globe2,
  History,
  IdCard,
  ListChecks,
  MessageSquareText,
  Mic,
  PhoneCall,
  Play,
  Rocket,
  Send,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Variable as VariableIcon,
  Webhook,
  Wrench,
  AlertTriangle,
  CheckCircle2,
  Phone,
} from 'lucide-react';
import {
  useChatTestMutation,
  useCreateTestSessionMutation,
  useGetAgentDiffQuery,
  useGetAgentQuery,
  useGetAgentSectionQuery,
  useListTestRunsQuery,
  usePublishAgentMutation,
  useTestCallMutation,
  useValidateFlowMutation,
} from '../../../store/api/flowApi';
import { Async, Badge, Button, errMsg, Field, Input, Modal, SegmentTabs, Skeleton, StatusBadge, useToast } from '../../../components/ui';
import { Drawer } from '../../../components/forms';
import { CallNumberDialog, E164 } from '../shared';
import * as Tabs from './AgentTabs';

const TABS = [
  {
    group: 'Who it is',
    items: [
      {
        key: 'identity',
        label: 'Identity',
        icon: IdCard,
        el: Tabs.IdentityTab,
      },
      {
        key: 'conversation',
        label: 'Conversation',
        icon: GitBranch,
        el: Tabs.ConversationTab,
      },
      {
        key: 'variables',
        label: 'Variables',
        icon: VariableIcon,
        el: Tabs.VariablesTab,
      },
      { key: 'rules', label: 'Rules', icon: ListChecks, el: Tabs.RulesTab },
      {
        key: 'behaviour',
        label: 'Behaviour',
        icon: SlidersHorizontal,
        el: Tabs.BehaviourTab,
      },
    ],
  },
  {
    group: 'Voice & language',
    items: [
      { key: 'voice', label: 'Voice', icon: Mic, el: Tabs.VoiceTab },
      {
        key: 'languages',
        label: 'Languages',
        icon: Globe2,
        el: Tabs.LanguagesTab,
      },
    ],
  },
  {
    group: 'Knowledge & actions',
    items: [
      {
        key: 'knowledge',
        label: 'Knowledge',
        icon: BookOpen,
        el: Tabs.KnowledgeTab,
      },
      { key: 'tools', label: 'Tools', icon: Wrench, el: Tabs.ToolsTab },
      {
        key: 'follow-ups',
        label: 'Follow-ups',
        icon: Send,
        el: Tabs.FollowUpsTab,
      },
    ],
  },
  {
    group: 'Quality',
    items: [
      { key: 'analysis', label: 'Analysis', icon: Brain, el: Tabs.AnalysisTab },
      {
        key: 'compliance',
        label: 'Compliance',
        icon: ShieldCheck,
        el: Tabs.ComplianceTab,
      },
      { key: 'tests', label: 'Tests', icon: FlaskConical, el: Tabs.TestsTab },
      {
        key: 'insights',
        label: 'Insights',
        icon: BarChart3,
        el: Tabs.InsightsTab,
      },
    ],
  },
  {
    group: 'Release',
    items: [
      {
        key: 'versions',
        label: 'Versions',
        icon: History,
        el: Tabs.VersionsTab,
      },
      {
        key: 'channels',
        label: 'Web & chat',
        icon: Webhook,
        el: Tabs.ChannelsTab,
      },
      {
        key: 'settings',
        label: 'Settings',
        icon: Settings2,
        el: Tabs.SettingsTab,
      },
    ],
  },
];

/** P-09 Agent editor. Every tab saves to the draft; Publish makes it live. */
export function AgentEditor() {
  const { id = '', tab = 'identity' } = useParams();
  const agent = useGetAgentQuery(id);
  const [params] = useSearchParams();
  const [testing, setTesting] = useState(!!params.get('test'));
  const [calling, setCalling] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const all = TABS.flatMap((g) => g.items);
  const current = all.find((t) => t.key === tab) ?? all[0];
  const Tab = current.el;

  return (
    <>
      <Link to="/agents" className="back-link">
        <ArrowLeft /> Agents
      </Link>
      <Async state={agent} skeleton={<Skeleton h={70} w={420} style={{ marginBottom: 24 }} />}>
        {(a) => (
          <div className="agent-head">
            <div>
              <div className="row" style={{ gap: 10 }}>
                <h1
                  style={{
                    fontSize: 30,
                    fontWeight: 500,
                    letterSpacing: '-0.03em',
                  }}
                >
                  {a.name}
                </h1>
                <StatusBadge status={a.status} />
                {a.has_unpublished_changes && <Badge tone="orange">Unpublished changes</Badge>}
              </div>
              <p className="muted" style={{ marginTop: 6 }}>
                {a.description || 'No description'} · {a.published_version ? `Live: version ${a.published_version}` : 'Never published'}
              </p>
            </div>
            <div className="row wrap">
              <Button icon={<Play />} onClick={() => setTesting(true)}>
                Test
              </Button>
              <Button
                icon={<PhoneCall />}
                disabled={!a.published_version}
                title={a.published_version ? undefined : 'Publish first — calls use the live version'}
                onClick={() => setCalling(true)}
              >
                Call a number
              </Button>
              <Button variant="primary" icon={<Rocket />} onClick={() => setPublishing(true)}>
                Publish
              </Button>
            </div>
          </div>
        )}
      </Async>
      {agent.data && (
        <div className="section-grid">
          <nav className="subnav" aria-label="Agent sections">
            {TABS.map((g) => (
              <div key={g.group} style={{ display: 'contents' }}>
                <div className="group">{g.group}</div>
                {g.items.map((t) => (
                  <NavLink key={t.key} to={`/agents/${id}/${t.key}`} className={() => (t.key === current.key ? 'active' : '')}>
                    <t.icon />
                    {t.label}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
          <div style={{ minWidth: 0 }}>
            <Tab agent={agent.data} />
          </div>
        </div>
      )}
      {agent.data && (
        <>
          <TestPanel open={testing} onClose={() => setTesting(false)} agent={agent.data} initialMode={params.get('test') === 'voice' ? 'voice' : 'chat'} />
          <CallNumberDialog open={calling} onClose={() => setCalling(false)} agentId={id} />
          <PublishDialog open={publishing} onClose={() => setPublishing(false)} agent={agent.data} onPublished={agent.refetch} />
        </>
      )}
    </>
  );
}

/* Publish (AGT-04) ---------------------------------------------------- */

function PublishDialog({ open, onClose, agent, onPublished }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [note, setNote] = useState('');
  const [error, setError] = useState(null);
  const [publish, { isLoading: busy }] = usePublishAgentMutation();
  // Pre-publish checks: what changed, flow validation, last test run.
  const diff = useGetAgentDiffQuery(agent.id, { skip: !open, refetchOnMountOrArgChange: true });
  const runs = useListTestRunsQuery(agent.id, { skip: !open });
  const [validate, validation] = useValidateFlowMutation();

  useEffect(() => {
    if (open) {
      setNote('');
      setError(null);
      validate(agent.id);
    }
  }, [open, agent.id, validate]);

  const check = { loading: diff.isLoading || validation.isLoading || runs.isLoading };
  const c = {
    changed: diff.data ? diff.data.changed_sections : null,
    validation: validation.data ?? null,
    lastRun: runs.data?.[0],
  };
  const blocking = !!c?.validation && !c.validation.valid;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Publish version ${(agent.published_version ?? 0) + 1}`}
      description="Live calls switch to this version. Calls already in progress finish on the old one."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            icon={<Rocket />}
            loading={busy}
            disabled={blocking}
            onClick={async () => {
              setError(null);
              try {
                const v = await publish({ id: agent.id, note: note.trim() || undefined }).unwrap();
                toast(`Version ${v.version} is live`);
                onPublished();
                onClose();
                navigate(`/agents/${agent.id}/versions`);
              } catch (e) {
                setError(errMsg(e));
              }
            }}
          >
            Publish
          </Button>
        </>
      }
    >
      <div className="stack">
        {error && <div className="alert-inline">{error}</div>}
        {check.loading ? (
          <Skeleton h={80} />
        ) : (
          <>
            <div>
              <div className="field-label" style={{ marginBottom: 8 }}>
                What changed since the live version
              </div>
              {c?.changed ? (
                c.changed.length ? (
                  <div className="tag-list">
                    {c.changed.map((s) => (
                      <span key={s} className="tag">
                        {s}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="muted small">No changes — publishing creates an identical version.</span>
                )
              ) : (
                <span className="muted small">Change summary isn't available.</span>
              )}
            </div>
            {c?.validation && (
              <div className="stack" style={{ gap: 6 }}>
                {c.validation.errors.map((e, i) => (
                  <div key={`e${i}`} className="banner danger" style={{ margin: 0 }}>
                    <AlertTriangle />
                    <span className="grow">
                      <b>{e.field}</b>: {e.message}
                    </span>
                  </div>
                ))}
                {c.validation.warnings.map((w, i) => (
                  <div key={`w${i}`} className="banner warn" style={{ margin: 0 }}>
                    <AlertTriangle />
                    <span className="grow">
                      <b>{w.field}</b>: {w.message}
                    </span>
                  </div>
                ))}
                {c.validation.valid && !c.validation.warnings.length && (
                  <div className="row small" style={{ color: 'var(--green)' }}>
                    <CheckCircle2 size={16} /> Configuration is valid
                  </div>
                )}
              </div>
            )}
            {c?.lastRun?.status === 'failed' && (
              <div className="banner warn" style={{ margin: 0 }}>
                <AlertTriangle />
                <span className="grow">The last test run failed. You can still publish, but check the Tests tab first.</span>
              </div>
            )}
          </>
        )}
        <Field label="Release note" hint="Optional — shown in version history.">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Added Kannada greeting" />
        </Field>
      </div>
    </Modal>
  );
}

/* Test panel (P-10: AGT-06, QTY-02) ----------------------------------- */

function TestPanel({ open, onClose, agent, initialMode = 'chat' }) {
  const [mode, setMode] = useState(initialMode);
  const [values, setValues] = useState({});
  const varsQ = useGetAgentSectionQuery({ id: agent.id, section: 'variables' }, { skip: !open });
  const vars = (varsQ.data ?? []).filter((x) => x.direction === 'input');

  return (
    <Drawer open={open} onClose={onClose} width={560} title={`Test ${agent.name}`} subtitle={<Badge tone="orange">Testing draft</Badge>}>
      <SegmentTabs
        value={mode}
        onChange={setMode}
        items={[
          { value: 'chat', label: 'Chat' },
          { value: 'voice', label: 'Voice' },
          { value: 'phone', label: 'Call my phone' },
        ]}
      />

      {vars.length > 0 && (
        <details style={{ marginBottom: 16 }}>
          <summary className="small" style={{ cursor: 'pointer', fontWeight: 500 }}>
            Test values for call variables ({vars.length})
          </summary>
          <div className="form-grid" style={{ marginTop: 12 }}>
            {vars.map((v) => (
              <Field key={v.name} label={v.name}>
                <Input value={values[v.name] ?? ''} placeholder={v.default} onChange={(e) => setValues((x) => ({ ...x, [v.name]: e.target.value }))} />
              </Field>
            ))}
          </div>
        </details>
      )}
      {mode === 'chat' && <ChatTest agentId={agent.id} variables={values} />}
      {mode === 'voice' && <VoiceTest agentId={agent.id} />}
      {mode === 'phone' && <PhoneTest agentId={agent.id} variables={values} />}
    </Drawer>
  );
}

function ChatTest({ agentId, variables }) {
  const [turns, setTurns] = useState([]);
  const [session, setSession] = useState();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [collected, setCollected] = useState({});
  const [chatTest] = useChatTestMutation();
  const end = useRef(null);

  useEffect(() => end.current?.scrollIntoView({ behavior: 'smooth' }), [turns]);

  const send = async () => {
    const msg = text.trim();
    if (!msg || busy) return;
    setText('');
    setTurns((t) => [...t, { role: 'me', text: msg }]);
    setBusy(true);
    try {
      const r = await chatTest({ id: agentId, session_id: session, message: msg, variables }).unwrap();
      setSession(r.session_id);
      setCollected(r.collected ?? {});
      const extra = [
        ...(r.tool_calls ?? []).map((tc) => ({
          role: 'sys',
          text: `Tool ${tc.name} → ${JSON.stringify(tc.response).slice(0, 140)}`,
        })),
        ...(r.knowledge ?? []).map((k) => ({
          role: 'sys',
          text: `Knowledge: “${k.passage.slice(0, 120)}” — ${k.source}`,
        })),
      ];
      setTurns((t) => [...t, ...extra, { role: 'them', text: r.reply, meta: `${r.latency_ms} ms` }]);
      if (r.ended) setTurns((t) => [...t, { role: 'sys', text: 'The agent ended the conversation.' }]);
    } catch (e) {
      setTurns((t) => [...t, { role: 'sys', text: errMsg(e) }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <div className="chat" style={{ minHeight: 240 }}>
        {!turns.length && <p className="muted small">Type as the caller would. You'll see the reply, any tool calls, the knowledge used and response time.</p>}
        {turns.map((t, i) => (
          <div key={i} className={`bubble ${t.role}`}>
            {t.text}
            {t.meta && <div className="meta">{t.meta}</div>}
          </div>
        ))}
        {busy && <div className="bubble them muted">…</div>}
        <div ref={end} />
      </div>
      {Object.keys(collected).length > 0 && (
        <div className="card card-pad" style={{ padding: 14 }}>
          <div className="field-label" style={{ marginBottom: 6 }}>
            Collected so far
          </div>
          <dl className="kv" style={{ gridTemplateColumns: '140px 1fr', rowGap: 6 }}>
            {Object.entries(collected).map(([k, v]) => (
              <div key={k} style={{ display: 'contents' }}>
                <dt className="mono">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      <form
        className="prompt-box"
        style={{ marginTop: 0, height: 52 }}
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <MessageSquareText aria-hidden />
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Say something as the caller…" />
        <button className="round-ink" style={{ width: 36, height: 36 }} disabled={busy || !text.trim()} aria-label="Send">
          <Send />
        </button>
      </form>
      {turns.length > 0 && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setTurns([]);
            setSession(undefined);
            setCollected({});
          }}
        >
          Start over
        </Button>
      )}
    </div>
  );
}

/** Browser voice test: mic → media WebSocket from test-session (AGT-06.1/.3). */
function VoiceTest({ agentId }) {
  const [state, setState] = useState('idle');
  const [lines, setLines] = useState([]);
  const [error, setError] = useState('');
  const [createTestSession] = useCreateTestSessionMutation();
  const ws = useRef(null);
  const rec = useRef(null);
  const stream = useRef(null);

  const stop = () => {
    rec.current?.stop();
    stream.current?.getTracks().forEach((t) => t.stop());
    ws.current?.close();
    setState('idle');
  };
  useEffect(() => stop, []);

  const start = async () => {
    setState('connecting');
    setLines([]);
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
    } catch {
      return setState('denied');
    }
    try {
      const s = await createTestSession(agentId).unwrap();
      const sock = new WebSocket(`${s.media_url}${s.media_url.includes('?') ? '&' : '?'}token=${encodeURIComponent(s.token)}`);
      ws.current = sock;
      sock.binaryType = 'arraybuffer';
      sock.onopen = () => {
        setState('live');
        const r = new MediaRecorder(stream.current, {
          mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '',
        });
        r.ondataavailable = (e) => e.data.size && sock.readyState === 1 && sock.send(e.data);
        r.start(250);
        rec.current = r;
      };
      sock.onmessage = (m) => {
        if (typeof m.data === 'string') {
          try {
            const ev = JSON.parse(m.data);
            if (ev.text) setLines((l) => [...l, { speaker: ev.speaker ?? 'agent', text: ev.text }]);
          } catch {
            /* ignore non-JSON frames */
          }
        } else {
          new Audio(URL.createObjectURL(new Blob([m.data]))).play().catch(() => {});
        }
      };
      sock.onerror = () => {
        setError('The media connection failed.');
        setState('error');
      };
      sock.onclose = () => setState((st) => (st === 'live' ? 'idle' : st));
    } catch (e) {
      stream.current?.getTracks().forEach((t) => t.stop());
      setError(errMsg(e));
      setState('error');
    }
  };

  return (
    <div className="stack">
      {state === 'denied' && (
        <div className="banner warn" style={{ margin: 0 }}>
          <AlertTriangle />
          <span className="grow">Microphone access was blocked. Allow it from the address bar's site settings, or use Chat mode.</span>
        </div>
      )}
      {state === 'error' && <div className="alert-inline">{error}</div>}
      <div className="card card-pad" style={{ textAlign: 'center' }}>
        <div className="clay warm" style={{ margin: '0 auto 14px' }}>
          <Mic />
        </div>
        <p className="muted small" style={{ marginBottom: 14 }}>
          {state === 'live' ? 'Listening — speak as the caller.' : 'Talk to the draft agent through your microphone.'}
        </p>
        {state === 'live' ? (
          <Button variant="danger" onClick={stop}>
            End test
          </Button>
        ) : (
          <Button variant="primary" icon={<Mic />} loading={state === 'connecting'} onClick={start}>
            Start voice test
          </Button>
        )}
      </div>
      <div className="chat">
        {lines.map((l, i) => (
          <div key={i} className={`bubble ${l.speaker === 'caller' ? 'me' : 'them'}`}>
            {l.text}
          </div>
        ))}
      </div>
    </div>
  );
}

function PhoneTest({ agentId, variables }) {
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [testCall] = useTestCallMutation();
  return (
    <div className="card card-pad stack">
      <p className="muted small">We'll ring this number and connect you to the draft agent.</p>
      <Field label="Your phone number">
        <Input className="mono" placeholder="+919876543210" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </Field>
      {msg && (
        <div className={msg.ok ? 'banner info' : 'alert-inline'} style={msg.ok ? { margin: 0 } : undefined}>
          {msg.text}
        </div>
      )}
      <div>
        <Button
          variant="primary"
          icon={<Phone />}
          loading={busy}
          onClick={async () => {
            if (!E164.test(phone.trim()))
              return setMsg({
                ok: false,
                text: 'Use international format, e.g. +919876543210',
              });
            setBusy(true);
            setMsg(null);
            try {
              const r = await testCall({ id: agentId, phone: phone.trim(), variables }).unwrap();
              setMsg({
                ok: true,
                text: `Calling you now (${r.status}). Pick up to talk to the draft agent.`,
              });
            } catch (e) {
              setMsg({ ok: false, text: errMsg(e) });
            } finally {
              setBusy(false);
            }
          }}
        >
          Call my phone
        </Button>
      </div>
    </div>
  );
}
