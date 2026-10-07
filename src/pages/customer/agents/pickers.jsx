import { useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { useListLanguagesQuery, useListModelsQuery, useListVoicesQuery } from '../../../store/api/flowApi';
import { Select } from '../../../components/forms';

// AGT-02 catalog pickers.

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
  const list = voices.data ?? [];

  const play = (v) => {
    audio.current?.pause();
    if (playing === v.id || !v.preview_url) return setPlaying(null);
    audio.current = new Audio(v.preview_url);
    audio.current.onended = () => setPlaying(null);
    audio.current.play().catch(() => setPlaying(null));
    setPlaying(v.id);
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
          onClick={() => onChange(v.id)}
          onKeyDown={(e) => e.key === 'Enter' && onChange(v.id)}
          className="card row"
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
            style={{ width: 32, height: 32, background: 'var(--gray-bg)' }}
            disabled={!v.preview_url}
            title={v.preview_url ? 'Preview' : 'No preview available'}
            onClick={(e) => {
              e.stopPropagation();
              play(v);
            }}
          >
            {playing === v.id ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <div style={{ minWidth: 0 }}>
            <div className="cell-main">{v.name}</div>
            <div className="cell-sub">
              {v.gender} · {v.language} · {v.provider}
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
    .filter((m) => m.kind === kind)
    .map((m) => ({
      value: m.id,
      label: `${m.name}${m.tier ? ` · ${m.tier}` : ''}`,
    }));
  if (value && !opts.some((o) => o.value === value)) opts.unshift({ value, label: value });
  return (
    <Select value={value} options={opts} placeholder={placeholder ?? (models.isLoading ? 'Loading…' : 'Choose')} onChange={(e) => onChange(e.target.value)} />
  );
}
