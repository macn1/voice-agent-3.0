import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Play } from 'lucide-react';
import { useListLanguagesQuery, useListModelsQuery, useListVoicesQuery } from '../../../store/api/flowApi';
import { API_BASE } from '../../../store/api/services';
import { postForBlob } from '../../../store/api/baseQuery';
import { Select } from '../../../components/forms';
import { Button, Modal, SegmentTabs, useToast } from '../../../components/ui';

// AGT-02 catalog pickers.

// Calls are spoken by Sarvam; with no voice picked (or one that's gone) it
// uses its default speaker.
export const DEFAULT_VOICE = 'Shubh';

/**
 * The voice saying a short greeting, made by the media server with the same
 * Sarvam voice calls use (made once per voice and language, then kept).
 */
export const previewUrl = (v, language, speed) =>
  `${API_BASE}/realtime/v1/voices/${encodeURIComponent(v.provider_voice_id || v.name)}/sample?language=${encodeURIComponent(language || 'en-IN')}` +
  (speed ? `&pace=${Number(speed).toFixed(2)}` : '');

const titleWord = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');

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

/** The voice a stored voice id stands for, from the catalog list (id or provider id). */
export function findVoice(list, value) {
  if (!value) return null;
  return list.find((v) => v.id === value || v.provider_voice_id === String(value).toLowerCase()) ?? null;
}

/** The voice list with real previews. gender narrows it; speed plays previews at the agent's speed. */
export function VoicePicker({ language, value, onChange, speed, gender }) {
  const toast = useToast();
  const voices = useListVoicesQuery(language);
  const audio = useRef(null);
  const [playing, setPlaying] = useState(null);
  // 'loading' from the click until sound actually starts, then 'playing'.
  const [phase, setPhase] = useState('playing');
  const all = voices.data ?? [];
  const list = gender ? all.filter((v) => v.gender === gender) : all;
  const selected = findVoice(all, value);

  useEffect(() => () => audio.current?.pause(), []);

  const stop = () => {
    audio.current?.pause();
    audio.current = null;
    setPlaying(null);
  };

  // Plays the real voice. A language without previews falls back to English.
  const play = (v) => {
    if (playing === v.id) return stop();
    stop();
    setPhase('loading');
    setPlaying(v.id);
    const start = (lang, retry) => {
      const a = new Audio(previewUrl(v, lang, speed));
      audio.current = a;
      a.onplaying = () => setPhase('playing');
      a.onwaiting = () => setPhase('loading');
      a.onended = () => setPlaying(null);
      a.onerror = () => {
        if (audio.current !== a) return;
        if (retry) return start('en-IN', false);
        audio.current = null;
        setPlaying(null);
        toast(`Couldn't play ${v.name}'s preview. Try again in a moment.`, 'error');
      };
      a.play().catch(() => {});
    };
    start(language || 'en-IN', !!language && language !== 'en-IN');
  };

  if (!all.length) {
    return (
      <div className="muted small">{voices.isLoading ? 'Loading voices…' : voices.error ? "Couldn't load the voices. Reload to try again." : 'No voices available.'}</div>
    );
  }
  return (
    <div className="stack" style={{ gap: 10 }}>
      {selected ? (
        <div className="small">
          Selected: <b>{selected.name}</b> <span className="muted">({selected.gender})</span>
        </div>
      ) : value ? (
        <div className="banner warn" style={{ margin: 0 }}>
          <AlertTriangle />
          <span className="grow">
            The saved voice isn't available any more, so calls use {DEFAULT_VOICE}. Pick a voice below and save.
          </span>
        </div>
      ) : (
        <div className="small muted">No voice picked: calls use {DEFAULT_VOICE}, Sarvam's default voice.</div>
      )}
      <div className="grid-3" style={{ gap: 8 }}>
        {list.map((v) => {
          const on = selected?.id === v.id;
          return (
            <div
              key={v.id}
              role="radio"
              aria-checked={on}
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
                borderColor: on ? 'var(--ink)' : undefined,
                boxShadow: on ? '0 0 0 1px var(--ink)' : undefined,
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
                  if (!on) onChange(v.id);
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
                <div className="cell-main">
                  {v.name}
                  {on && <span className="muted small"> · selected</span>}
                </div>
                <div className="cell-sub">
                  {playing === v.id ? (phase === 'loading' ? 'Loading…' : 'Playing…') : `${titleWord(v.gender)} · speaks every language`}
                </div>
              </div>
            </div>
          );
        })}
      </div>
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

/** Choose the agent's voice in a popup: female / male filter, real previews at its speed. */
export function VoiceDialog({ open, onClose, language, value, speed, onSave, saving }) {
  const [pick, setPick] = useState(value);
  const [gender, setGender] = useState('');
  useEffect(() => {
    if (open) setPick(value);
  }, [open, value]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="Choose the agent's voice"
      description="Press play to hear each voice at the agent's speaking speed. Every voice speaks all the agent's languages."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} disabled={!pick || pick === value} onClick={() => onSave(pick)}>
            Use this voice
          </Button>
        </>
      }
    >
      <div className="stack" style={{ gap: 12 }}>
        <SegmentTabs
          value={gender}
          onChange={setGender}
          items={[
            { value: '', label: 'All' },
            { value: 'female', label: 'Female' },
            { value: 'male', label: 'Male' },
          ]}
        />
        <VoicePicker language={language} value={pick} onChange={setPick} speed={speed} gender={gender} />
      </div>
    </Modal>
  );
}

/**
 * Plays the agent's greeting (or a given line) in its real voice, made by the
 * server. play({ voice_id, speed, text }) overrides the saved settings.
 */
export function useGreetingPreview(agentId) {
  const toast = useToast();
  const audio = useRef(null);
  const [state, setState] = useState('idle'); // idle | loading | playing
  useEffect(
    () => () => {
      audio.current?.pause();
    },
    [],
  );
  const stop = () => {
    audio.current?.pause();
    audio.current = null;
    setState('idle');
  };
  const play = async (opts = {}) => {
    if (state !== 'idle') return stop();
    setState('loading');
    try {
      const blob = await postForBlob({ service: 'flow', url: `/customer/agents/${agentId}/voice-preview`, body: opts });
      const url = URL.createObjectURL(blob);
      const a = new Audio(url);
      audio.current = a;
      a.onplaying = () => setState('playing');
      a.onended = () => {
        URL.revokeObjectURL(url);
        setState('idle');
      };
      a.onerror = () => {
        setState('idle');
        toast("Couldn't play the preview.", 'error');
      };
      await a.play();
    } catch (e) {
      setState('idle');
      toast(e?.message || "Couldn't make the preview. Try again.", 'error');
    }
  };
  return { play, stop, state };
}
