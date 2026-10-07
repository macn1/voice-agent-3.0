import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { NavLink } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Construction, Inbox, Lock, RotateCw, X, XCircle } from 'lucide-react';
import { titleCase } from '../lib/format';
import { SERVICE_LABEL } from '../store/api/services';

/* Buttons ------------------------------------------------------------ */

export function Button({ variant = 'default', size, block, loading, icon, className = '', children, disabled, ...rest }) {
  const cls = ['btn', variant !== 'default' && variant, size, block && 'block', className].filter(Boolean).join(' ');
  return (
    <button type="button" className={cls} disabled={disabled || loading} {...rest}>
      {loading ? <span className="spinner" aria-hidden /> : icon}
      {children}
    </button>
  );
}

/* Badges ------------------------------------------------------------- */

const STATUS_TONE = {
  active: 'green',
  paid: 'green',
  verified: 'green',
  succeeded: 'green',
  live: 'green',
  trial: 'blue',
  trialing: 'blue',
  invited: 'amber',
  pending: 'amber',
  open: 'amber',
  draft: '',
  past_due: 'red',
  suspended: 'red',
  failed: 'red',
  disabled: 'red',
  uncollectible: 'red',
  cancelled: '',
  void: '',
  deprecated: '',
  expired: 'amber',
  removed: '',
};

export function StatusBadge({ status, label }) {
  const s = (status ?? 'unknown').toLowerCase();
  return <span className={`badge ${STATUS_TONE[s] ?? ''}`}>{label ?? titleCase(s)}</span>;
}

export function Badge({ tone = '', plain, children }) {
  return <span className={`badge ${tone} ${plain ? 'plain' : ''}`}>{children}</span>;
}

/* Layout pieces ------------------------------------------------------ */

export function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <header className="page-head">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </header>
  );
}

export function Tabs({ items }) {
  return (
    <nav className="tabs" aria-label="Section">
      {items.map((it, i) =>
        it === 'sep' ? (
          <span key={`sep-${i}`} className="sep" aria-hidden />
        ) : (
          <NavLink key={it.to} to={it.to} end={it.end} className={({ isActive }) => `chip ${isActive ? 'active' : ''}`}>
            {it.label}
          </NavLink>
        ),
      )}
    </nav>
  );
}

export function SegmentTabs({ value, onChange, items }) {
  return (
    <div className="tabs" role="tablist">
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          aria-selected={value === it.value}
          className={`chip ${value === it.value ? 'active' : ''}`}
          onClick={() => onChange(it.value)}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

/* States ------------------------------------------------------------- */

export function EmptyState({ icon, title, description, action }) {
  return (
    <div className="state">
      <div className="state-icon">{icon ?? <Inbox />}</div>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  if (error?.notAvailable) {
    return (
      <div className="state">
        <div className="state-icon">
          <Construction />
        </div>
        <h3>Not available yet</h3>
        <p>
          This screen is ready, but <b>{SERVICE_LABEL[error.service]}</b> isn't deployed or doesn't serve this route yet. It will start working as soon as the
          backend ships it.
        </p>
        <code className="tag" style={{ marginTop: 4 }}>
          {error.path}
        </code>
        {onRetry && (
          <Button size="sm" icon={<RotateCw />} onClick={onRetry} style={{ marginTop: 8 }}>
            Check again
          </Button>
        )}
      </div>
    );
  }
  if (error?.status === 403) {
    return (
      <div className="state error">
        <div className="state-icon">
          <Lock />
        </div>
        <h3>You don't have access</h3>
        <p>Your role doesn't include the permission for this. Ask a company admin to update your role.</p>
      </div>
    );
  }
  return (
    <div className="state error">
      <div className="state-icon">
        <AlertTriangle />
      </div>
      <h3>Couldn't load this</h3>
      <p>{errMsg(error)}</p>
      {onRetry && (
        <Button size="sm" icon={<RotateCw />} onClick={onRetry} style={{ marginTop: 8 }}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Skeleton({ h = 16, w = '100%', style }) {
  return <div className="skeleton" style={{ height: h, width: w, ...style }} />;
}

export function TableSkeleton({ rows = 5 }) {
  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }} aria-busy>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="row" style={{ gap: 20 }}>
          <Skeleton h={14} w="28%" />
          <Skeleton h={14} w="22%" />
          <Skeleton h={14} w="14%" />
          <Skeleton h={14} w="18%" />
        </div>
      ))}
    </div>
  );
}

/**
 * Renders loading / error / children for an RTK Query result
 * ({ data, error, refetch }) or any { data, error, reload } object.
 */
export function Async({ state, children, skeleton }) {
  if (state.error && state.data === undefined) return <ErrorState error={state.error} onRetry={state.refetch ?? state.reload} />;
  if (state.data === undefined) return <>{skeleton ?? <TableSkeleton />}</>;
  return <>{children(state.data)}</>;
}

export function Pager({ offset, limit, count, total, onChange }) {
  const hasNext = total !== undefined ? offset + limit < total : count === limit;
  if (offset === 0 && !hasNext) return null;
  return (
    <div className="pager">
      <span>
        Showing {count ? offset + 1 : 0}–{offset + count}
        {total !== undefined ? ` of ${total}` : ''}
      </span>
      <div className="row" style={{ gap: 6 }}>
        <Button size="sm" icon={<ChevronLeft />} disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - limit))}>
          Prev
        </Button>
        <Button size="sm" disabled={!hasNext} onClick={() => onChange(offset + limit)}>
          Next <ChevronRight />
        </Button>
      </div>
    </div>
  );
}

/* Forms -------------------------------------------------------------- */

export function Field({ label, hint, error, children, className = '' }) {
  return (
    <div className={`field ${className}`}>
      <label>{label}</label>
      {children}
      {error ? <span className="error-text">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function Input({ invalid, className = '', ...rest }) {
  return <input className={`input ${invalid ? 'invalid' : ''} ${className}`} {...rest} />;
}

export function Toggle({ checked, onChange, label, description, disabled }) {
  return (
    <label className="toggle" style={disabled ? { opacity: 0.55, cursor: 'not-allowed' } : undefined}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="track" aria-hidden />
      <span>
        <span style={{ fontWeight: 500, fontSize: 14 }}>{label}</span>
        {description && (
          <span className="muted small" style={{ display: 'block', marginTop: 2 }}>
            {description}
          </span>
        )}
      </span>
    </label>
  );
}

/* Modal -------------------------------------------------------------- */

export function Modal({ open, onClose, title, description, children, footer, wide }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button className="icon-btn" style={{ width: 34, height: 34, marginTop: -4, marginRight: -8 }} onClick={onClose} aria-label="Close">
            <X />
          </button>
        </div>
        {children && <div className="modal-body">{children}</div>}
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, description, confirmLabel = 'Confirm', danger }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (open) setError(null);
  }, [open]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant={danger ? 'danger solid' : 'primary'}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await onConfirm();
                onClose();
              } catch (e) {
                setError(errMsg(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {error ? <div className="alert-inline">{error}</div> : null}
    </Modal>
  );
}

/* Toasts ------------------------------------------------------------- */

const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((message, tone = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs, { id, message, tone }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 3600);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      {createPortal(
        <div className="toasts" aria-live="polite">
          {items.map((t) => (
            <div key={t.id} className={`toast ${t.tone === 'error' ? 'error' : ''}`}>
              {t.tone === 'error' ? <XCircle /> : <CheckCircle2 />}
              {t.message}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

/** Message for an RTK Query error object, a thrown Error, or anything else. */
export const errMsg = (e) =>
  e?.notAvailable
    ? `Not available yet — ${SERVICE_LABEL[e.service]} doesn't serve this route.`
    : (e?.message ?? (typeof e === 'string' ? e : 'Something went wrong.'));
