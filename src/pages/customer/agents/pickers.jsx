import { useEffect, useRef, useState } from 'react';
import { Play } from 'lucide-react';
import { useListLanguagesQuery, useListModelsQuery, useListVoicesQuery } from '../../../store/api/flowApi';
import { Select } from '../../../components/forms';

// AGT-02 catalog pickers.

const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;
const SAMPLE_LINE = (name) => `Hello, I'm ${name}. Thank you for calling. How can I help you today?`;

// The catalog's field for a sample clip isn't fixed: take the first string that looks like audio.
const AUDIO_RE = /(\.(mp3|wav|ogg|m4a|aac|webm)(\?|#|$))|^data:audio\//i;
function sampleUrl(v) {
  const named = v.preview_url ?? v.sample_url ?? v.audio_url ?? v.sample ?? v.preview ?? v.demo_url ?? v.url;
  if (typeof named === 'string' && named) return named;
  return Object.values(v).find((x) => typeof x === 'string' && AUDIO_RE.test(x));
}

// Without a clip, vary the browser voice so cards are at least distinguishable: a stable pick per voice id.
function hash(str) {
  let h = 0;
  for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

export function useLanguages() {
  return useListLanguagesQuery();
}

export function useModels() {
  return useListModelsQuery();
}

export function LanguageSelect({ value, onChange }) {
  const langs = useLanguages();
  const opts = (langs.data ?? []).map((l) => ({
    value: l.code,
    label: `${l.name} (${l.code})`,
  }));
  if (value && !opts.some((o) => o.value === value)) opts.unshift({ value, label: value });
  return <Select value={value} options={opts} placeholder={langs.isLoading ? 'Loading…' : 'Choose language'} onChange={(e) => onChange(e.target.value)} />;
}

export function VoicePicker({ language, value, onChange }) {
  const voices = useListVoicesQuery(language);
  const audio = useRef(null);
  const [playing, setPlaying] = useState(null);
  // 'loading' from the click until sound actually starts, then 'playing'.
  const [phase, setPhase] = useState('playing');
  const list = voices.data ?? [];
  useEffect(() => {
    if (import.meta.env.DEV && list[0]) console.info('[VoicePicker] first catalog voice:', list[0]);
  }, [list]);

  useEffect(
    () => () => {
      audio.current?.pause();
      if (canSpeak) window.speechSynthesis.cancel();
    },
    [],
  );

  const stop = () => {
    audio.current?.pause();
    audio.current = null;
    if (canSpeak) window.speechSynthesis.cancel();
    setPlaying(null);
  };

  // Plays the catalog's sample audio when it has one, else speaks a sample line with the browser's voice.
  const play = (v) => {
    if (playing === v.id) return stop();
    stop();
    const url = sampleUrl(v);
    const speakFallback = () => {
      if (!canSpeak) return setPlaying(null);
      const u = new SpeechSynthesisUtterance(SAMPLE_LINE(v.name));
      u.lang = v.language || language || 'en-IN';
      const sys = window.speechSynthesis.getVoices();
      const want = (v.gender ?? '').toLowerCase();
      const lang2 = String(u.lang).slice(0, 2).toLowerCase();
      const female = /female|zira|heera|neerja|swara|samantha|susan|hazel|aria|jenny/i;
      const male = /(?<!fe)male|david|ravi|prabhat|madhur|mark|daniel|guy|george/i;
      const inLang = sys.filter((s) => s.lang.toLowerCase().startsWith(lang2));
      const pool = (inLang.length ? inLang : sys).filter((s) => (want === 'female' ? female : want === 'male' ? male : /./).test(s.name));
      const candidates = pool.length ? pool : inLang.length ? inLang : sys;
      const h = hash(v.id ?? v.name);
      u.voice = candidates.length ? candidates[h % candidates.length] : null;
      // Same system voice for several cards: shift pitch and pace so each one still sounds different.
      u.pitch = 0.8 + ((h >> 3) % 9) * 0.05 + (want === 'male' ? -0.1 : want === 'female' ? 0.1 : 0);
      u.rate = 0.88 + ((h >> 7) % 6) * 0.04;
      u.onstart = () => setPhase('playing');
      u.onend = () => setPlaying(null);
      u.onerror = () => setPlaying(null);
      window.speechSynthesis.speak(u);
    };
    setPhase('loading');
    setPlaying(v.id);
    if (!url) return speakFallback();
    const a = new Audio(url);
    audio.current = a;
    a.onplaying = () => setPhase('playing');
    a.onwaiting = () => setPhase('loading');
    a.onended = () => setPlaying(null);
    a.play().catch(() => {
      audio.current = null;
      speakFallback();
    });
  };

  if (!list.length) {
    return (
      <input className="input mono" value={value} placeholder={voices.isLoading ? 'Loading voices…' : 'Voice ID'} onChange={(e) => onChange(e.target.value)} />
    );
  }
  return (
    <div className="grid-3" style={{ gap: 8 }}>
      {list.map((v) => (
        <div
          key={v.id}
          role="radio"
          aria-checked={value === v.id}
          tabIndex={0}
          onClick={() => {
            onChange(v.id);
            play(v);
          }}
          onKeyDown={(e) => e.key === 'Enter' && onChange(v.id)}
          className={`card row voice-card ${playing === v.id ? 'playing' : ''}`}
          style={{
            padding: '10px 12px',
            cursor: 'pointer',
            borderColor: value === v.id ? 'var(--ink)' : undefined,
            boxShadow: value === v.id ? '0 0 0 1px var(--ink)' : undefined,
          }}
        >
          <button
            type="button"
            className="icon-btn"
            style={{
              width: 32,
              height: 32,
              flexShrink: 0,
              background: playing === v.id ? 'var(--ink)' : 'var(--gray-bg)',
              color: playing === v.id ? 'var(--on-ink)' : undefined,
            }}
            title={playing === v.id ? 'Stop' : 'Play preview'}
            aria-label={playing === v.id ? `Stop ${v.name}` : `Play ${v.name}`}
            onClick={(e) => {
              e.stopPropagation();
              // Playing a voice also selects it, so the highlighted card always matches what you hear.
              if (value !== v.id) onChange(v.id);
              play(v);
            }}
          >
            {playing === v.id && phase === 'loading' ? (
              <span className="spin" aria-hidden />
            ) : playing === v.id ? (
              <span className="eq" aria-hidden>
                <i />
                <i />
                <i />
                <i />
              </span>
            ) : (
              <Play size={14} />
            )}
          </button>
          <div style={{ minWidth: 0 }}>
            <div className="cell-main">{v.name}</div>
            <div className="cell-sub">
              {playing === v.id ? (phase === 'loading' ? 'Loading…' : 'Playing…') : `${v.gender} · ${v.language} · ${v.provider}`}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ModelSelect({ kind, value, onChange, placeholder }) {
  const models = useModels();
  const opts = (models.data ?? [])
    // The catalog names speech-to-text models kind "stt"; older screens say "asr".
    .filter((m) => m.kind === kind || (kind === 'asr' && m.kind === 'stt'))
    .map((m) => ({
      value: m.id,
      label: `${m.name}${m.tier ? ` · ${m.tier}` : ''}`,
    }));
  if (value && !opts.some((o) => o.value === value)) opts.unshift({ value, label: value });
  return (
    <Select value={value} options={opts} placeholder={placeholder ?? (models.isLoading ? 'Loading…' : 'Choose')} onChange={(e) => onChange(e.target.value)} />
  );
}
