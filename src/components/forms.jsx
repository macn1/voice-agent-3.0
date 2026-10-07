import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, Plus, Trash2, X } from 'lucide-react';
import { Async, Button, errMsg, useToast } from './ui';

/* Basic inputs -------------------------------------------------------- */

export function Select({ options, placeholder, className = '', ...rest }) {
  return (
    <select className={`select ${className}`} {...rest}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => {
        const v = typeof o === 'string' ? o : o.value;
        return (
          <option key={v} value={v}>
            {typeof o === 'string' ? o : o.label}
          </option>
        );
      })}
    </select>
  );
}

export function Textarea({ className = '', ...rest }) {
  return <textarea className={`textarea ${className}`} {...rest} />;
}

export function Slider({ value, onChange, min = 0, max = 100, step = 1, left, right, format }) {
  return (
    <div>
      <div className="row" style={{ gap: 12 }}>
        <input type="range" className="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
        <span className="mono muted" style={{ minWidth: 44, textAlign: 'right' }}>
          {format ? format(value) : value}
        </span>
      </div>
      {(left || right) && (
        <div className="row between muted small" style={{ marginTop: 2, marginRight: 56 }}>
          <span>{left}</span>
          <span>{right}</span>
        </div>
      )}
    </div>
  );
}

/** Editable list of short strings shown as removable tags. */
export function ListEditor({ value, onChange, placeholder = 'Add and press Enter', mono }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (v && !value.includes(v)) onChange([...value, v]);
    setDraft('');
  };
  return (
    <div className="list-editor">
      {value.map((v) => (
        <span key={v} className={`pill ${mono ? 'mono' : ''}`}>
          {v}
          <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(value.filter((x) => x !== v))}>
            <X size={13} />
          </button>
        </span>
      ))}
      <input
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add();
          } else if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={add}
      />
    </div>
  );
}

/** Ordered list of sentences (rules, phrases) with one input per row. */
export function LinesEditor({ value, onChange, placeholder, addLabel = 'Add' }) {
  return (
    <div className="stack" style={{ gap: 8 }}>
      {value.map((v, i) => (
        <div key={i} className="row" style={{ gap: 8 }}>
          <input className="input" value={v} placeholder={placeholder} onChange={(e) => onChange(value.map((x, j) => (j === i ? e.target.value : x)))} />
          <button
            type="button"
            className="icon-btn"
            style={{ width: 36, height: 36, flexShrink: 0 }}
            aria-label="Remove"
            onClick={() => onChange(value.filter((_, j) => j !== i))}
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}
      <div>
        <Button size="sm" variant="ghost" icon={<Plus />} onClick={() => onChange([...value, ''])}>
          {addLabel}
        </Button>
      </div>
    </div>
  );
}

/** key → value mapping rows (field mapping, headers, variables). */
export function MappingEditor({ value, onChange, keyLabel = 'Key', valueLabel = 'Value', keyOptions, valueOptions, addLabel = 'Add row' }) {
  const rows = Object.entries(value);
  const setRow = (i, k, v) => onChange(Object.fromEntries(rows.map((r, j) => (j === i ? [k, v] : r))));
  const cell = (val, opts, set, ph) =>
    opts ? (
      <Select value={val} options={opts} placeholder="Choose…" onChange={(e) => set(e.target.value)} />
    ) : (
      <input className="input mono" value={val} placeholder={ph} onChange={(e) => set(e.target.value)} />
    );
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="mapping-row muted small">
        <span>{keyLabel}</span>
        <span />
        <span>{valueLabel}</span>
        <span />
      </div>
      {rows.map(([k, v], i) => (
        <div key={i} className="mapping-row">
          {cell(k, keyOptions, (s) => setRow(i, s, v), keyLabel)}
          <span className="muted">→</span>
          {cell(v, valueOptions, (s) => setRow(i, k, s), valueLabel)}
          <button
            type="button"
            className="icon-btn"
            style={{ width: 36, height: 36 }}
            aria-label="Remove"
            onClick={() => onChange(Object.fromEntries(rows.filter((_, j) => j !== i)))}
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}
      <div>
        <Button
          size="sm"
          variant="ghost"
          icon={<Plus />}
          onClick={() =>
            onChange({
              ...value,
              [rows.some(([k]) => k === '') ? `key_${rows.length}` : '']: '',
            })
          }
        >
          {addLabel}
        </Button>
      </div>
    </div>
  );
}

export function WeekdayPicker({ value, onChange }) {
  const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  return (
    <div className="row wrap" style={{ gap: 6 }}>
      {days.map((d) => {
        const on = value.includes(d);
        return (
          <button
            key={d}
            type="button"
            className={`chip ${on ? 'active' : ''}`}
            style={{ height: 34, padding: '0 12px' }}
            onClick={() => onChange(on ? value.filter((x) => x !== d) : [...value, d])}
          >
            {d[0].toUpperCase() + d.slice(1)}
          </button>
        );
      })}
    </div>
  );
}

/* Drawer -------------------------------------------------------------- */

export function Drawer({ open, onClose, title, subtitle, children, footer, width = 520 }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="overlay drawer-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" style={{ width }} role="dialog" aria-modal="true">
        <div
          className="modal-head"
          style={{
            paddingBottom: 14,
            borderBottom: '1px solid var(--divider)',
          }}
        >
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-btn" style={{ width: 34, height: 34 }} onClick={onClose} aria-label="Close">
            <X />
          </button>
        </div>
        <div className="drawer-body">{children}</div>
        {footer && (
          <div className="modal-foot" style={{ borderTop: '1px solid var(--divider)', paddingTop: 16 }}>
            {footer}
          </div>
        )}
      </aside>
    </div>,
    document.body,
  );
}

/* Section editing: load → edit → save (one GET/PUT pair per agent tab) --- */

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Local draft over an RTK Query GET, saved through an RTK Query mutation.
 *   const s = useSection(useGetXQuery(arg), usePutXMutation(), (draft) => mutationArg)
 * The draft follows fresh server data until the user edits it; after a save
 * the mutation's tag invalidation refetches the query.
 */
export function useSection(query, mutation, toArg = (d) => d) {
  const [trigger, { isLoading: saving }] = mutation;
  const [draft, setDraft] = useState();
  const [base, setBase] = useState();
  const toast = useToast();

  useEffect(() => {
    if (query.data === undefined) return;
    setDraft((d) => (d === undefined || same(d, base) || same(d, query.data) ? structuredClone(query.data) : d));
    setBase(query.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data]);

  const dirty = base !== undefined && draft !== undefined && !same(draft, base);
  const commit = useCallback(async () => {
    if (draft === undefined) return;
    try {
      await trigger(toArg(draft)).unwrap();
      setBase(structuredClone(draft));
      toast('Saved');
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  }, [draft, trigger, toArg, toast]);

  return {
    data: query.data,
    draft,
    setDraft,
    patch: (p) => setDraft((d) => ({ ...d, ...p })),
    error: query.error,
    loading: query.isLoading,
    saving,
    dirty,
    save: commit,
    reset: () => setDraft(structuredClone(base)),
    reload: query.refetch,
  };
}

/** Card wrapper with title, save bar and async states for a section. */
export function SectionCard({ title, description, section, children, actions }) {
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>{title}</h2>
          {description && <div className="card-sub">{description}</div>}
        </div>
        <div className="row">
          {actions}
          {section.dirty && (
            <Button size="sm" variant="ghost" onClick={section.reset}>
              Discard
            </Button>
          )}
          <Button size="sm" variant="primary" icon={<Check />} loading={section.saving} disabled={!section.dirty} onClick={section.save}>
            Save
          </Button>
        </div>
      </div>
      <Async
        state={{
          data: section.draft,
          error: section.error,
          loading: section.loading,
          reload: section.reload,
        }}
      >
        {(d) => (
          <div className="card-pad stack" style={{ gap: 20 }}>
            {children(d, section.patch, section.setDraft)}
          </div>
        )}
      </Async>
    </div>
  );
}

/** Read a file chosen by the user as text (CSV import). */
export function readFileText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

/** Minimal CSV parser (quoted fields, commas, newlines). */
export function parseCsv(text) {
  const out = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      out.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    out.push(row);
  }
  const clean = out.filter((r) => r.some((c) => c.trim() !== ''));
  const headers = (clean[0] ?? []).map((h) => h.trim());
  const rows = clean.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()])));
  return { headers, rows };
}

export function downloadText(name, text, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function CopyField({ value, mono = true }) {
  const toast = useToast();
  return (
    <div className="input-wrap">
      <input className={`input ${mono ? 'mono' : ''}`} readOnly value={value} onFocus={(e) => e.target.select()} />
      <button
        type="button"
        className="input-icon"
        title="Copy"
        onClick={() => {
          navigator.clipboard?.writeText(value);
          toast('Copied');
        }}
      >
        <Copy size={16} />
      </button>
    </div>
  );
}
