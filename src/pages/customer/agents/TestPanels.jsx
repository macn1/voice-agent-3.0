import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Mic, MicOff, MessageSquareText, PhoneCall, PhoneOff, Send, Square, Volume2, VolumeX } from 'lucide-react';
import { Badge, Button, errMsg, Field, Input, StatusBadge } from '../../../components/ui';
import { useChatTestMutation, useCreateTestSessionMutation, useTestCallMutation } from '../../../store/api/flowApi';
import { useGetCallStatusQuery, useHangupCallMutation } from '../../../store/api/callsApi';
import { useEndTextSessionMutation, useSendTextMessageMutation, useStartTextSessionMutation } from '../../../store/api/orchestratorApi';
import { E164 } from '../shared';

const LIVE = ['queued', 'ringing', 'in_progress'];

/** One passage the agent answered from (reply.knowledge); the fields aren't fixed, so read what's there. */
function passageText(k) {
  if (typeof k === 'string') return k;
  return k.text ?? k.passage ?? k.answer ?? k.content ?? '';
}

function Bubbles({ turns, busy, endRef }) {
  return (
    <div className="chat" style={{ minHeight: 240 }}>
      {turns.map((t, i) => (
        <div key={i} className={`bubble ${t.role}`}>
          {t.text}
          {t.meta && <div className="meta">{t.meta}</div>}
          {t.passages?.length > 0 && (
            <details style={{ marginTop: 6 }}>
              <summary className="small" style={{ cursor: 'pointer' }}>
                {t.passages.length} knowledge passage{t.passages.length === 1 ? '' : 's'} used
              </summary>
              {t.passages.map((k, j) => (
                <div key={j} className="muted small" style={{ marginTop: 4 }}>
                  {k.source_title || k.title ? <b>{k.source_title ?? k.title}: </b> : null}
                  {passageText(k)}
                  {typeof k.score === 'number' ? ` (${Math.round(k.score * 100)}% match)` : ''}
                </div>
              ))}
            </details>
          )}
        </div>
      ))}
      {busy && <div className="bubble them muted">…</div>}
      <div ref={endRef} />
    </div>
  );
}

/* Chat with the PUBLISHED agent through the orchestrator ------------------- */

export function PublishedChat({ agent, variables }) {
  const [session, setSession] = useState(null);
  const [turns, setTurns] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [start] = useStartTextSessionMutation();
  const [send] = useSendTextMessageMutation();
  const [end] = useEndTextSessionMutation();
  const endRef = useRef(null);
  const openId = useRef(null);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), [turns]);

  // Leaving the panel closes the conversation so it doesn't count against the 5-open limit.
  useEffect(
    () => () => {
      if (openId.current) void end(openId.current);
    },
    [end],
  );

  const ended = session?.status === 'ended';

  const begin = async () => {
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      const vars = Object.fromEntries(Object.entries(variables).filter(([, v]) => v));
      const r = await start({ agent_id: agent.id, ...(Object.keys(vars).length ? { variables: vars } : {}) }).unwrap();
      setSession(r.session);
      openId.current = r.session.id;
      setTurns([{ role: 'them', text: r.greeting?.text ?? '', meta: 'greeting' }]);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const finish = async (s = session) => {
    if (!s) return;
    try {
      const r = await end(s.id).unwrap();
      openId.current = null;
      setSession(r);
      setResult(r);
    } catch (e) {
      setError(e);
    }
  };

  const say = async () => {
    const msg = text.trim();
    if (!msg || busy || !session || ended) return;
    setText('');
    setTurns((t) => [...t, { role: 'me', text: msg }]);
    setBusy(true);
    try {
      const r = await send({ id: session.id, text: msg }).unwrap();
      const rep = r.reply ?? {};
      const meta = [rep.rule && `Rule: ${rep.rule}`, r.agent?.latency_ms != null && `${r.agent.latency_ms} ms`].filter(Boolean).join(' · ');
      setTurns((t) => [...t, { role: 'them', text: rep.reply ?? r.agent?.text ?? '', meta, passages: rep.knowledge }]);
      setSession(r.session);
      if (r.session?.status === 'ended') {
        openId.current = null;
        setTurns((t) => [...t, { role: 'sys', text: rep.transfer ? 'The agent transferred the conversation to a person.' : 'The agent ended the conversation.' }]);
        void finish(r.session);
      }
    } catch (e) {
      setTurns((t) => [...t, { role: 'sys', text: errMsg(e) }]);
      if (e?.code === 'session_ended') setSession((s) => ({ ...s, status: 'ended' }));
    } finally {
      setBusy(false);
    }
  };

  if (!session) {
    return (
      <div className="stack">
        <p className="muted small">
          Talk to the agent's <b>published</b> version, exactly as a caller would reach it. The conversation is saved to your call log; typed conversations aren't billed per minute.
        </p>
        {error && (
          <div className="banner danger" style={{ margin: 0 }}>
            <AlertTriangle />
            <span className="grow">{errMsg(error)}</span>
          </div>
        )}
        <Button variant="primary" loading={busy} onClick={begin}>
          Start conversation
        </Button>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="row between wrap" style={{ gap: 8 }}>
        <Badge tone="blue">Scripted replies</Badge>
        <span className="muted small">
          Version {session.agent_version} · {session.turn_count ?? turns.length} turns
        </span>
      </div>
      <Bubbles turns={turns} busy={busy} endRef={endRef} />
      {result ? (
        <div className="card card-pad" style={{ padding: 14 }}>
          <div className="row between wrap">
            <div>
              <div className="field-label">Result</div>
              <div className="row" style={{ gap: 8 }}>
                <StatusBadge status={result.outcome ?? result.call_status ?? 'ended'} />
                {result.delivered_at ? <span className="muted small">Saved to call log</span> : <span className="muted small">Saving to call log…</span>}
              </div>
            </div>
            <Link to={`/calls/${result.call_id ?? result.id}`} className="btn sm">
              Open call
            </Link>
          </div>
        </div>
      ) : (
        <form
          className="prompt-box"
          style={{ marginTop: 0, height: 52 }}
          onSubmit={(e) => {
            e.preventDefault();
            void say();
          }}
        >
          <MessageSquareText aria-hidden />
          <input value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} placeholder="Say something as the caller…" disabled={ended} />
          <button className="round-ink" style={{ width: 36, height: 36 }} disabled={busy || ended || !text.trim()} aria-label="Send">
            <Send />
          </button>
        </form>
      )}
      <div className="row" style={{ gap: 8 }}>
        {!result && (
          <Button size="sm" icon={<Square />} onClick={() => finish()}>
            End conversation
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            if (!result && openId.current) void end(openId.current);
            openId.current = null;
            setSession(null);
            setTurns([]);
            setResult(null);
            setError(null);
          }}
        >
          Start over
        </Button>
      </div>
    </div>
  );
}

/* Voice test with the browser's speech (no realtime audio yet) -------------- */

const Recognition = typeof window !== 'undefined' ? (window.SpeechRecognition ?? window.webkitSpeechRecognition) : undefined;
const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;

export function VoiceTest({ agent }) {
  const [create] = useCreateTestSessionMutation();
  const [chat] = useChatTestMutation();
  const [session, setSession] = useState(null);
  const [turns, setTurns] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [muted, setMuted] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);
  const endRef = useRef(null);
  const mutedRef = useRef(false);
  mutedRef.current = muted;

  useEffect(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), [turns]);
  useEffect(
    () => () => {
      recRef.current?.abort?.();
      if (canSpeak) window.speechSynthesis.cancel();
    },
    [],
  );

  const speak = (line, lang) => {
    if (!canSpeak || mutedRef.current || !line) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(line);
    if (lang) u.lang = lang;
    window.speechSynthesis.speak(u);
  };

  const begin = async () => {
    setError(null);
    setBusy(true);
    try {
      const r = await create(agent.id).unwrap();
      setSession(r);
      setTurns([{ role: 'them', text: r.greeting, meta: 'greeting' }]);
      speak(r.greeting, r.language);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const say = async (line) => {
    const msg = line.trim();
    if (!msg || busy || !session) return;
    setText('');
    const next = [...turns, { role: 'me', text: msg }];
    setTurns(next);
    setBusy(true);
    try {
      const history = turns.filter((t) => t.role === 'me' || t.role === 'them').map((t) => ({ role: t.role === 'me' ? 'user' : 'agent', text: t.text }));
      const r = await chat({ id: agent.id, message: msg, history }).unwrap();
      setTurns([...next, { role: 'them', text: r.reply, meta: r.rule ? `Rule: ${r.rule}` : undefined }]);
      speak(r.reply, session.language);
    } catch (e) {
      setTurns([...next, { role: 'sys', text: errMsg(e) }]);
    } finally {
      setBusy(false);
    }
  };

  const toggleMic = () => {
    if (!Recognition) return;
    if (listening) {
      recRef.current?.stop();
      return;
    }
    if (canSpeak) window.speechSynthesis.cancel();
    const rec = new Recognition();
    rec.lang = session?.language ?? 'en-IN';
    rec.interimResults = false;
    rec.onresult = (ev) => void say(ev.results[0][0].transcript);
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  };

  if (!session) {
    return (
      <div className="stack">
        <div className="banner info" style={{ margin: 0 }}>
          <AlertTriangle />
          <span className="grow">
            This uses your browser's speech — the agent's greeting is spoken aloud and your words are sent as text. Real-time audio with the agent's own voice isn't available yet.
          </span>
        </div>
        {!canSpeak && <div className="alert-inline">This browser can't speak aloud. You can still read the replies below.</div>}
        {error && (
          <div className="banner danger" style={{ margin: 0 }}>
            <AlertTriangle />
            <span className="grow">{errMsg(error)}</span>
          </div>
        )}
        <Button variant="primary" icon={<Volume2 />} loading={busy} onClick={begin}>
          Start voice test
        </Button>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="row between wrap" style={{ gap: 8 }}>
        <Badge tone="blue">Browser speech · {session.language}</Badge>
        <Button size="sm" variant="ghost" icon={muted ? <VolumeX /> : <Volume2 />} onClick={() => (setMuted(!muted), canSpeak && window.speechSynthesis.cancel())}>
          {muted ? 'Unmute' : 'Mute'}
        </Button>
      </div>
      <Bubbles turns={turns} busy={busy} endRef={endRef} />
      <form
        className="prompt-box"
        style={{ marginTop: 0, height: 52 }}
        onSubmit={(e) => {
          e.preventDefault();
          void say(text);
        }}
      >
        {Recognition ? (
          <button type="button" className={`round-ink ${listening ? 'on' : ''}`} style={{ width: 36, height: 36 }} onClick={toggleMic} aria-label={listening ? 'Stop listening' : 'Speak'}>
            {listening ? <MicOff /> : <Mic />}
          </button>
        ) : (
          <MessageSquareText aria-hidden />
        )}
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={listening ? 'Listening…' : 'Type what the caller says…'} />
        <button className="round-ink" style={{ width: 36, height: 36 }} disabled={busy || !text.trim()} aria-label="Send">
          <Send />
        </button>
      </form>
      {!Recognition && <p className="muted small">Speech input isn't supported in this browser (try Chrome or Edge) — type instead.</p>}
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          recRef.current?.abort?.();
          if (canSpeak) window.speechSynthesis.cancel();
          setSession(null);
          setTurns([]);
        }}
      >
        Start over
      </Button>
    </div>
  );
}

/* "Call my phone" with the draft agent ---------------------------------- */

export function PhoneTest({ agent }) {
  const [to, setTo] = useState('');
  const [call, setCall] = useState(null);
  const [error, setError] = useState(null);
  const [testCall, { isLoading }] = useTestCallMutation();
  const [hangup] = useHangupCallMutation();
  const status = useGetCallStatusQuery(call?.id, { skip: !call, pollingInterval: call && LIVE.includes(call.status) ? 2000 : 0 });
  const current = status.data ?? call;
  useEffect(() => {
    if (status.data) setCall((c) => (c && c.status !== status.data.status ? { ...c, ...status.data } : c));
  }, [status.data]);

  const ring = async () => {
    if (!E164.test(to.trim())) return setError('Enter the number in international format, e.g. +919876543210');
    setError(null);
    try {
      setCall(await testCall({ id: agent.id, to_number: to.trim() }).unwrap());
    } catch (e) {
      setError(errMsg(e));
    }
  };

  if (current) {
    const idx = ['queued', 'ringing', 'in_progress', 'completed'].indexOf(LIVE.includes(current.status) ? current.status : 'completed');
    return (
      <div className="stack" style={{ alignItems: 'center', textAlign: 'center', padding: '12px 0' }}>
        <div className="steps" style={{ justifyContent: 'center' }}>
          {['queued', 'ringing', 'in_progress', 'completed'].map((s, i) => (
            <span key={s} className={`step ${i <= idx ? 'on' : ''}`}>
              <b>{i + 1}</b>
              {s.replace('_', ' ')}
            </span>
          ))}
        </div>
        <StatusBadge status={current.status} />
        <div className="muted small">{current.to_number ?? to}</div>
        <div className="row" style={{ gap: 8 }}>
          {LIVE.includes(current.status) && (
            <Button variant="danger" icon={<PhoneOff />} onClick={() => hangup(current.id).unwrap().then(setCall).catch((e) => setError(errMsg(e)))}>
              Hang up
            </Button>
          )}
          {!LIVE.includes(current.status) && current.call_id && (
            <Link to={`/calls/${current.call_id}`} className="btn">
              Open call
            </Link>
          )}
          <Button variant="ghost" onClick={() => setCall(null)}>
            Call again
          </Button>
        </div>
        {error && <div className="alert-inline">{error}</div>}
      </div>
    );
  }

  return (
    <div className="stack">
      <p className="muted small">Rings your phone with the <b>draft</b> agent — no need to publish first. Do-not-call, plan limits and calling hours apply.</p>
      {error && <div className="alert-inline">{error}</div>}
      <Field label="Your phone number">
        <Input className="mono" placeholder="+919876543210" value={to} onChange={(e) => setTo(e.target.value)} />
      </Field>
      <Button variant="primary" icon={<PhoneCall />} loading={isLoading} onClick={ring}>
        Call my phone
      </Button>
    </div>
  );
}
