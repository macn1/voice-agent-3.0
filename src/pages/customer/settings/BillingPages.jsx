import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, CreditCard, Download, FileText, Landmark, Plus, Star, Trash2 } from 'lucide-react';
import { date, money, number, titleCase } from '../../../lib/format';
import { asList, normalizeUsage } from '../../../lib/normalize';
import {
  useAddPaymentMethodMutation,
  useCancelSubscriptionMutation,
  useGetInvoiceQuery,
  useGetUsageQuery,
  useListInvoicesQuery,
  useListPaymentMethodsQuery,
  useRemovePaymentMethodMutation,
  useSelectPackageMutation,
  useSetDefaultPaymentMethodMutation,
} from '../../../store/api/customerApi';
import { Async, Badge, Button, ConfirmDialog, EmptyState, errMsg, Field, Input, Modal, Skeleton, StatusBadge, useToast } from '../../../components/ui';
import { useBilling } from '../billingContext';

/* Plan (CUS-05) ------------------------------------------------------ */

export function PackageFeatures({ p }) {
  return (
    <ul>
      <li>
        <Check /> {number(p.included_call_minutes)} call minutes / {p.billing_cycle === 'yearly' ? 'year' : 'month'}
      </li>
      <li>
        <Check /> {number(p.included_agents)} agents
      </li>
      <li>
        <Check /> {number(p.max_concurrent_calls)} concurrent calls
      </li>
      <li>
        <Check /> {money(p.overage_rate_per_minute, p.currency)} per extra minute
      </li>
      {p.llm_tier && (
        <li>
          <Check /> {titleCase(p.llm_tier)} AI models
        </li>
      )}
    </ul>
  );
}

export function PlanPage() {
  const toast = useToast();
  const billing = useBilling();
  const { subscription, plan, catalog, loaded } = billing;
  const [choice, setChoice] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  // Both invalidate 'Subscription', so the plan card and top-bar meter refresh.
  const [selectPackage] = useSelectPackageMutation();
  const [cancelSubscription] = useCancelSubscriptionMutation();

  if (!loaded)
    return (
      <div className="stack">
        <Skeleton h={180} style={{ borderRadius: 18 }} />
        <Skeleton h={300} style={{ borderRadius: 18 }} />
      </div>
    );

  const periodEnd = subscription?.current_period_end;
  const plans = catalog.filter((p) => p.status !== 'deprecated');

  return (
    <div className="stack" style={{ gap: 28 }}>
      {subscription ? (
        <div className="hero-plan">
          <div
            className="row between wrap"
            style={{
              position: 'relative',
              zIndex: 1,
              alignItems: 'flex-start',
              gap: 24,
            }}
          >
            <div>
              <div className="row" style={{ gap: 10 }}>
                <span className="eyebrow" style={{ color: '#a9a8a5' }}>
                  Current plan
                </span>
                <Badge>{titleCase(subscription.status)}</Badge>
              </div>
              <div
                style={{
                  marginTop: 12,
                  fontSize: 32,
                  fontWeight: 500,
                  letterSpacing: '-0.03em',
                }}
              >
                {plan?.name ?? 'Your plan'}
              </div>
              {plan && (
                <div className="muted" style={{ marginTop: 4 }}>
                  {money(plan.price_amount, plan.currency)} / {plan.billing_cycle === 'yearly' ? 'year' : 'month'}
                </div>
              )}
            </div>
            <div style={{ textAlign: 'right' }}>
              {subscription.status === 'trialing' && subscription.trial_ends_at ? (
                <>
                  <div className="muted small">Trial ends</div>
                  <div style={{ fontSize: 18, fontWeight: 500 }}>{date(subscription.trial_ends_at)}</div>
                </>
              ) : periodEnd ? (
                <>
                  <div className="muted small">{subscription.cancel_at_period_end ? 'Active until' : 'Renews on'}</div>
                  <div style={{ fontSize: 18, fontWeight: 500 }}>{date(periodEnd)}</div>
                </>
              ) : null}
            </div>
          </div>
          {plan && (
            <div
              className="row wrap"
              style={{
                position: 'relative',
                zIndex: 1,
                gap: 28,
                marginTop: 24,
                fontSize: 14,
              }}
            >
              <span>
                <b>{number(plan.included_call_minutes)}</b> <span className="muted">minutes</span>
              </span>
              <span>
                <b>{number(plan.included_agents)}</b> <span className="muted">agents</span>
              </span>
              <span>
                <b>{number(plan.max_concurrent_calls)}</b> <span className="muted">concurrent calls</span>
              </span>
              <span>
                <b>{money(plan.overage_rate_per_minute, plan.currency)}</b> <span className="muted">/ extra minute</span>
              </span>
            </div>
          )}
          <div className="row wrap" style={{ position: 'relative', zIndex: 1, marginTop: 24, gap: 10 }}>
            <Link to="/settings/usage" className="btn sm">
              View usage
            </Link>
            {subscription.cancel_at_period_end ? (
              <span className="muted small">Cancellation scheduled — your plan stays active until {date(periodEnd)}.</span>
            ) : (
              subscription.status !== 'cancelled' && (
                <button className="btn sm ghost" onClick={() => setCancelling(true)}>
                  Cancel subscription
                </button>
              )
            )}
          </div>
        </div>
      ) : (
        <div className="banner info">
          <span className="grow">You don't have a plan yet. Pick one below to start taking calls.</span>
        </div>
      )}

      <div>
        <div className="row between wrap" style={{ marginBottom: 16 }}>
          <div>
            <div className="card-title" style={{ fontSize: 18 }}>
              Compare plans
            </div>
            <div className="card-sub">Switching takes effect immediately. Demo mode: no payment is taken.</div>
          </div>
        </div>
        {plans.length ? (
          <div className="grid-3">
            {plans.map((p) => {
              const current = p.id === subscription?.package_id;
              return (
                <div key={p.id} className={`plan-card ${current ? 'current' : ''}`}>
                  <div className="row between">
                    <span style={{ fontWeight: 600, fontSize: 16 }}>{p.name}</span>
                    {current && <Badge tone="ink">Current</Badge>}
                  </div>
                  <div className="price">
                    {money(p.price_amount, p.currency)} <small>/ {p.billing_cycle === 'yearly' ? 'year' : 'month'}</small>
                  </div>
                  <PackageFeatures p={p} />
                  <Button variant={current ? 'default' : 'primary'} disabled={current} block onClick={() => setChoice(p)} style={{ marginTop: 'auto' }}>
                    {current ? 'Your current plan' : subscription ? `Switch to ${p.name}` : `Choose ${p.name}`}
                  </Button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="card">
            <EmptyState title="No plans published" description="Contact Aurlynn sales to set up a plan for your company." />
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!choice}
        onClose={() => setChoice(null)}
        title={`Switch to ${choice?.name}?`}
        description={choice ? `${money(choice.price_amount, choice.currency)} / ${choice.billing_cycle}. Your new limits apply right away.` : undefined}
        confirmLabel={`Switch to ${choice?.name ?? ''}`}
        onConfirm={async () => {
          await selectPackage(choice.id).unwrap();
          toast(`You're now on ${choice.name}`);
        }}
      />

      <ConfirmDialog
        open={cancelling}
        onClose={() => setCancelling(false)}
        danger
        title="Cancel your subscription?"
        description={`Your plan stays active until ${date(periodEnd)}. After that, agents stop answering calls.`}
        confirmLabel="Cancel at period end"
        onConfirm={async () => {
          await cancelSubscription().unwrap();
          toast('Cancellation scheduled');
        }}
      />
    </div>
  );
}

/* Usage (CUS-08) ----------------------------------------------------- */

function UsageBar({ label, used, included, unit }) {
  const ratio = included ? used / included : 0;
  const tone = ratio >= 1 ? 'over' : ratio >= 0.8 ? 'warn' : '';
  return (
    <div className="card card-pad">
      <div className="row between" style={{ alignItems: 'baseline' }}>
        <span className="card-title">{label}</span>
        {included ? <span className="muted small">{Math.round(ratio * 100)}%</span> : null}
      </div>
      <div
        style={{
          marginTop: 12,
          fontSize: 28,
          fontWeight: 500,
          letterSpacing: '-0.02em',
        }}
      >
        {number(used, 1)}
        <span className="muted" style={{ fontSize: 15, fontWeight: 400 }}>
          {included !== undefined ? ` / ${number(included)}` : ''} {unit}
        </span>
      </div>
      {included !== undefined && (
        <div className={`bar ${tone}`} style={{ marginTop: 14 }}>
          <span style={{ width: `${Math.min(100, ratio * 100)}%` }} />
        </div>
      )}
    </div>
  );
}

export function UsagePage() {
  const usage = useGetUsageQuery();
  const { plan, subscription } = useBilling();

  return (
    <Async
      state={usage}
      skeleton={
        <div className="grid-3">
          <Skeleton h={140} />
          <Skeleton h={140} />
          <Skeleton h={140} />
        </div>
      }
    >
      {(data) => {
        const u = normalizeUsage(data);
        const includedMin = u.includedMinutes ?? (plan ? Number(plan.included_call_minutes) : undefined);
        const includedAgents = u.includedAgents ?? (plan ? Number(plan.included_agents) : undefined);
        const overMin = u.overageMinutes ?? (includedMin !== undefined ? Math.max(0, u.callMinutes - includedMin) : 0);
        const overCost = u.overageCost ?? (plan ? overMin * Number(plan.overage_rate_per_minute) : undefined);
        const start = u.periodStart ?? subscription?.current_period_start;
        const end = u.periodEnd ?? subscription?.current_period_end;
        return (
          <div className="stack">
            <div className="muted">
              Billing period {start || end ? `${date(start)} – ${date(end)}` : 'current'}
              {plan && ` · ${plan.name} plan`}
            </div>
            <div className="grid-3">
              <UsageBar label="Call minutes" used={u.callMinutes} included={includedMin} unit="min" />
              <UsageBar label="Active agents" used={u.activeAgents} included={includedAgents} unit="agents" />
              <div className="card card-pad">
                <span className="card-title">Overage estimate</span>
                <div
                  style={{
                    marginTop: 12,
                    fontSize: 28,
                    fontWeight: 500,
                    letterSpacing: '-0.02em',
                  }}
                >
                  {overCost !== undefined ? money(overCost, plan?.currency) : '—'}
                </div>
                <div className="muted small" style={{ marginTop: 6 }}>
                  {number(overMin, 1)} extra minutes
                  {plan ? ` × ${money(plan.overage_rate_per_minute, plan.currency)}` : ''}
                </div>
              </div>
            </div>
            {plan && (
              <div className="card card-pad row between wrap">
                <div>
                  <div className="card-title">Concurrent calls</div>
                  <div className="card-sub">Your plan allows up to {number(plan.max_concurrent_calls)} calls at the same time.</div>
                </div>
                <Link to="/settings/plan" className="btn sm">
                  Change plan
                </Link>
              </div>
            )}
            {u.callMinutes === 0 && (
              <div className="banner neutral">
                <span className="grow">No call minutes recorded yet this period. Usage appears here as calls complete.</span>
              </div>
            )}
          </div>
        );
      }}
    </Async>
  );
}

/* Invoices (CUS-07) -------------------------------------------------- */

export function InvoicesPage() {
  const invoices = useListInvoicesQuery();
  const navigate = useNavigate();
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Invoices</h2>
          <div className="card-sub">Monthly bills with subscription and overage lines.</div>
        </div>
      </div>
      <Async state={invoices}>
        {(data) => {
          const list = asList(data);
          if (!list.length)
            return <EmptyState icon={<FileText />} title="No invoices yet" description="Your first invoice appears at the end of your billing period." />;
          return <InvoiceTable invoices={list} onOpen={(inv) => navigate(`/settings/invoices/${inv.id}`)} />;
        }}
      </Async>
    </div>
  );
}

export function InvoiceTable({ invoices, onOpen }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Invoice</th>
            <th>Period</th>
            <th>Status</th>
            <th>Due</th>
            <th className="num">Total</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((i) => (
            <tr key={i.id} className={onOpen ? 'clickable' : ''} onClick={() => onOpen?.(i)}>
              <td className="cell-main">{i.invoice_number}</td>
              <td className="muted">
                {date(i.period_start)} – {date(i.period_end)}
              </td>
              <td>
                <StatusBadge status={i.status} />
              </td>
              <td className="muted">{date(i.due_date)}</td>
              <td className="num cell-main">{money(i.total_amount, i.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function InvoiceDetailPage() {
  const { id = '' } = useParams();
  const invoice = useGetInvoiceQuery(id);
  return (
    <>
      <Link to="/settings/invoices" className="back-link">
        <ArrowLeft /> All invoices
      </Link>
      <Async state={invoice} skeleton={<Skeleton h={320} style={{ borderRadius: 14 }} />}>
        {(inv) => {
          const lines = inv.line_items ?? inv.items ?? [];
          return (
            <div className="card">
              <div className="card-head">
                <div>
                  <div className="row" style={{ gap: 10 }}>
                    <h2 style={{ fontSize: 20 }}>{inv.invoice_number}</h2>
                    <StatusBadge status={inv.status} />
                  </div>
                  <div className="card-sub">
                    {date(inv.period_start)} – {date(inv.period_end)} · Issued {date(inv.issued_at)} · Due {date(inv.due_date)}
                  </div>
                </div>
                <Button icon={<Download />} disabled title="PDF download is coming soon">
                  Download PDF
                </Button>
              </div>
              {lines.length ? (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th className="num">Qty</th>
                        <th className="num">Unit price</th>
                        <th className="num">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l) => (
                        <tr key={l.id}>
                          <td>
                            <div className="cell-main">{l.description || titleCase(l.item_type)}</div>
                            <div className="cell-sub">{titleCase(l.item_type)}</div>
                          </td>
                          <td className="num">{number(l.quantity, 2)}</td>
                          <td className="num">{money(l.unit_price, inv.currency)}</td>
                          <td className="num cell-main">{money(l.amount, inv.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState title="No line items" />
              )}
              <div
                style={{
                  padding: '18px 20px',
                  borderTop: '1px solid var(--divider)',
                  display: 'flex',
                  justifyContent: 'flex-end',
                }}
              >
                <dl
                  className="kv"
                  style={{
                    gridTemplateColumns: '140px 120px',
                    textAlign: 'right',
                  }}
                >
                  <dt>Subtotal</dt>
                  <dd>{money(inv.subtotal_amount, inv.currency)}</dd>
                  <dt>Tax</dt>
                  <dd>{money(inv.tax_amount, inv.currency)}</dd>
                  <dt style={{ color: 'var(--text)', fontWeight: 600 }}>Total</dt>
                  <dd style={{ fontWeight: 600 }}>{money(inv.total_amount, inv.currency)}</dd>
                  <dt>Paid</dt>
                  <dd>{money(inv.amount_paid, inv.currency)}</dd>
                </dl>
              </div>
            </div>
          );
        }}
      </Async>
    </>
  );
}

/* Payment methods (CUS-06) ------------------------------------------- */

export function PaymentMethodsPage() {
  const toast = useToast();
  const methods = useListPaymentMethodsQuery();
  const [setDefault] = useSetDefaultPaymentMethodMutation();
  const [addMethod] = useAddPaymentMethodMutation();
  const [removeMethod] = useRemovePaymentMethodMutation();
  const { subscription } = useBilling();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const list = asList(methods.data).filter((m) => m.status !== 'removed');
  const paidPlanActive = !!subscription && ['active', 'past_due'].includes(subscription.status);

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Payment methods</h2>
          <div className="card-sub">The default method is charged for invoices and overage.</div>
        </div>
        <Button variant="primary" icon={<Plus />} onClick={() => setAdding(true)}>
          Add method
        </Button>
      </div>
      <Async state={methods}>
        {() =>
          !list.length ? (
            <EmptyState icon={<CreditCard />} title="No payment methods" description="Add a card or bank account so your plan keeps running." />
          ) : (
            <div>
              {list.map((m, idx) => {
                const onlyOne = list.length === 1 && paidPlanActive;
                return (
                  <div
                    key={m.id}
                    className="pm-card"
                    style={{
                      borderTop: idx ? '1px solid var(--divider)' : undefined,
                    }}
                  >
                    <span className="pm-logo">{m.type === 'bank_account' ? <Landmark size={16} /> : (m.brand ?? 'CARD').toUpperCase().slice(0, 4)}</span>
                    <div style={{ flex: 1 }}>
                      <div className="cell-main">
                        {m.type === 'bank_account' ? 'Bank account' : titleCase(m.brand ?? 'Card')} {m.last4 ? `•••• ${m.last4}` : ''}
                      </div>
                      <div className="cell-sub">
                        {titleCase(m.provider)} · added {date(m.created_at)}
                      </div>
                    </div>
                    {m.is_default ? (
                      <Badge tone="ink">Default</Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Star />}
                        loading={busyId === m.id}
                        onClick={async () => {
                          setBusyId(m.id);
                          try {
                            await setDefault(m.id).unwrap();
                            toast('Default payment method updated');
                          } catch (e) {
                            toast(errMsg(e), 'error');
                          } finally {
                            setBusyId(null);
                          }
                        }}
                      >
                        Make default
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Trash2 />}
                      disabled={onlyOne}
                      title={onlyOne ? "You can't remove your only payment method while a paid plan is active" : undefined}
                      onClick={() => setRemoving(m)}
                    >
                      Remove
                    </Button>
                  </div>
                );
              })}
            </div>
          )
        }
      </Async>

      <AddPaymentMethodModal
        open={adding}
        onClose={() => setAdding(false)}
        onAdd={async (type, token) => {
          await addMethod({ type, token }).unwrap();
          toast('Payment method added');
        }}
      />

      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        danger
        title="Remove this payment method?"
        description={removing?.is_default ? 'This is your default method. Pick another default afterwards.' : undefined}
        confirmLabel="Remove"
        onConfirm={async () => {
          await removeMethod(removing.id).unwrap();
          toast('Payment method removed');
        }}
      />
    </div>
  );
}

function AddPaymentMethodModal({ open, onClose, onAdd }) {
  const [type, setType] = useState('card');
  const [token, setToken] = useState('tok_test_visa_4242');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setType('card');
      setToken('tok_test_visa_4242');
      setError(null);
    }
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add payment method"
      description="Card details are tokenized by the payment provider — they never reach Aurlynn's servers."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              if (!token.trim()) return setError('Enter a provider token');
              setBusy(true);
              setError(null);
              try {
                await onAdd(type, token.trim());
                onClose();
              } catch (e) {
                setError(errMsg(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Add method
          </Button>
        </>
      }
    >
      <div className="stack">
        {error && <div className="alert-inline">{error}</div>}
        <div className="banner info" style={{ marginBottom: 0 }}>
          <span className="grow">Demo mode: the payment provider is a test stub. Use a test token — no real card is charged.</span>
        </div>
        <div className="field">
          <span className="field-label">Type</span>
          <div className="row" style={{ gap: 8 }}>
            {['card', 'bank_account'].map((t) => (
              <button key={t} type="button" className={`chip ${type === t ? 'active' : ''}`} onClick={() => setType(t)}>
                {t === 'card' ? <CreditCard size={15} /> : <Landmark size={15} />}
                {t === 'card' ? 'Card' : 'Bank account'}
              </button>
            ))}
          </div>
        </div>
        <Field label="Provider token" hint="Issued by the provider's secure form (e.g. Stripe Elements / Razorpay).">
          <Input className="mono" value={token} onChange={(e) => setToken(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
