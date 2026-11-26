import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, Check, Lock, ShieldCheck } from 'lucide-react';
import { money, number } from '../../../lib/format';
import { useCompleteCheckoutMutation } from '../../../store/api/customerApi';
import { Button, errMsg, Modal } from '../../../components/ui';

const cycle = (p) => (p?.billing_cycle === 'yearly' ? 'year' : 'month');

/** Order summary + pay step. Rendered inside the shared Modal. */
export function CheckoutModal({ open, plan, current, session, onClose, onPaid }) {
  const [complete] = useCompleteCheckoutMutation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setBusy(false);
      setError(null);
    }
  }, [open]);

  if (!plan) return null;
  const pay = async () => {
    setBusy(true);
    setError(null);
    try {
      // Brief beat so the processing state is perceptible, not a flash.
      const [res] = await Promise.all([complete(session.id).unwrap(), new Promise((r) => setTimeout(r, 1100))]);
      onPaid(res);
    } catch (e) {
      setError(errMsg(e));
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      wide
      title="Review and pay"
      description="Your new plan limits apply as soon as the payment completes."
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={pay}>
            <Lock size={14} /> {busy ? 'Processing payment…' : `Pay ${money(plan.price_amount, plan.currency)}`}
          </Button>
        </>
      }
    >
      <div className="co-grid">
        <div className="co-summary">
          <span className="eyebrow">Order summary</span>
          <div className="co-switch">
            <span className="co-from">{current?.name ?? 'No plan'}</span>
            <ArrowRight size={16} />
            <span className="co-to">{plan.name}</span>
          </div>
          <ul className="co-features">
            <li>
              <Check size={14} /> {number(plan.included_call_minutes)} call minutes
            </li>
            <li>
              <Check size={14} /> {number(plan.included_agents)} agents
            </li>
            <li>
              <Check size={14} /> {number(plan.max_concurrent_calls)} concurrent calls
            </li>
          </ul>
        </div>

        <div className="co-pay">
          <div className="co-line">
            <span>
              {plan.name} plan <small className="muted">· billed every {cycle(plan)}</small>
            </span>
            <span>{money(plan.price_amount, plan.currency)}</span>
          </div>
          <div className="co-line total">
            <span>Total due today</span>
            <span>{money(plan.price_amount, plan.currency)}</span>
          </div>
          <div className="co-secure">
            <ShieldCheck size={16} />
            <span>Payments are processed securely. Card details never reach our servers.</span>
          </div>
          {error && (
            <div className="alert-inline">
              {error}
              {session?.url && (
                <>
                  {' '}
                  <a href={session.url}>Pay on the provider's page instead</a>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

/** Full-screen animated confirmation after a plan switch. */
export function PlanSuccess({ plan, paid, onDone }) {
  useEffect(() => {
    if (!plan) return;
    const onKey = (e) => (e.key === 'Escape' || e.key === 'Enter') && onDone();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [plan, onDone]);

  if (!plan) return null;
  return createPortal(
    <div className="overlay ps-overlay" role="dialog" aria-modal="true" aria-label="Plan updated">
      <div className="ps-card">
        <div className="ps-confetti" aria-hidden="true">
          {Array.from({ length: 14 }).map((_, i) => (
            <i key={i} style={{ '--i': i }} />
          ))}
        </div>
        <div className="ps-badge">
          <span className="ps-ring" />
          <span className="ps-ring r2" />
          <svg viewBox="0 0 52 52" className="ps-check" aria-hidden="true">
            <circle className="ps-circle" cx="26" cy="26" r="24" fill="none" />
            <path className="ps-tick" fill="none" d="M15 27l8 8 14-17" />
          </svg>
        </div>
        <h2 className="ps-title">You're now on {plan.name}</h2>
        <p className="ps-sub">{paid ? 'Payment received. ' : ''}Your new limits are active right now.</p>
        <div className="ps-stats">
          <div>
            <b>{number(plan.included_call_minutes)}</b>
            <span>minutes</span>
          </div>
          <div>
            <b>{number(plan.included_agents)}</b>
            <span>agents</span>
          </div>
          <div>
            <b>{number(plan.max_concurrent_calls)}</b>
            <span>concurrent calls</span>
          </div>
        </div>
        <Button variant="primary" block onClick={onDone} autoFocus>
          Continue
        </Button>
      </div>
    </div>,
    document.body,
  );
}
