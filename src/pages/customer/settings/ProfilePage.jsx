import { Link } from 'react-router-dom';
import { Building2, Clock, KeyRound, Mail, ShieldCheck } from 'lucide-react';
import { Badge, Skeleton, StatusBadge } from '../../../components/ui';
import { useAuth } from '../../../lib/auth';
import { date, dateTime, initials, money, number, titleCase } from '../../../lib/format';
import { roleLabel } from '../../../lib/normalize';
import { useBilling } from '../billingContext';
import { ChangePasswordCard } from './MoreSettings';

function Meter({ label, used, included, unit }) {
  const ratio = included ? used / included : 0;
  const tone = ratio >= 1 ? 'over' : ratio >= 0.8 ? 'warn' : '';
  return (
    <div className="pf-meter">
      <div className="row between" style={{ alignItems: 'baseline' }}>
        <span className="small fw-medium">{label}</span>
        <span className="small muted">
          {number(used, 1)}
          {included !== undefined ? ` / ${number(included)}` : ''} {unit}
          {included ? ` · ${Math.round(ratio * 100)}%` : ''}
        </span>
      </div>
      {included !== undefined && (
        <div className={`bar ${tone}`} style={{ marginTop: 8 }}>
          <span style={{ width: `${Math.min(100, ratio * 100)}%` }} />
        </div>
      )}
    </div>
  );
}

/** Plan + this period's usage, mirrored from the Plan and Usage pages. */
function PlanUsageCard() {
  const { loaded, subscription, plan, usage } = useBilling();

  if (!loaded)
    return (
      <div className="card card-pad">
        <Skeleton h={150} />
      </div>
    );

  if (!subscription)
    return (
      <div className="card card-pad row between wrap" style={{ gap: 12 }}>
        <div>
          <div className="card-title">Plan & usage</div>
          <div className="card-sub">No plan yet — pick one to start taking calls.</div>
        </div>
        <Link to="/settings/plan" className="btn sm primary">
          Choose a plan
        </Link>
      </div>
    );

  const end = subscription.current_period_end;
  const includedMin = usage?.includedMinutes ?? (plan ? Number(plan.included_call_minutes) : undefined);
  const includedAgents = usage?.includedAgents ?? (plan ? Number(plan.included_agents) : undefined);

  return (
    <div className="card card-pad pf-plan">
      <div className="row between wrap" style={{ gap: 12, alignItems: 'flex-start' }}>
        <div>
          <span className="eyebrow">Your plan</span>
          <div className="row" style={{ gap: 10, marginTop: 6 }}>
            <span className="text-heading-sm fw-semibold">{plan?.name ?? 'Current plan'}</span>
            <Badge>{titleCase(subscription.status)}</Badge>
          </div>
          <div className="muted small" style={{ marginTop: 4 }}>
            {plan && `${money(plan.price_amount, plan.currency)} / ${plan.billing_cycle === 'yearly' ? 'year' : 'month'}`}
            {end && ` · ${subscription.cancel_at_period_end ? 'ends' : 'renews'} ${date(end)}`}
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Link to="/settings/usage" className="btn sm">
            Usage
          </Link>
          <Link to="/settings/plan" className="btn sm primary">
            Change plan
          </Link>
        </div>
      </div>

      {usage ? (
        <div className="pf-meters">
          <Meter label="Call minutes" used={usage.callMinutes} included={includedMin} unit="min" />
          <Meter label="Active agents" used={usage.activeAgents} included={includedAgents} unit="agents" />
        </div>
      ) : (
        <div className="muted small" style={{ marginTop: 16 }}>
          Usage appears here as calls complete.
        </div>
      )}
    </div>
  );
}

function Detail({ icon: Icon, label, children }) {
  return (
    <div className="pf-detail">
      <span className="pf-detail-icon">
        <Icon size={16} />
      </span>
      <div>
        <div className="pf-detail-label">{label}</div>
        <div className="pf-detail-value">{children}</div>
      </div>
    </div>
  );
}

export function ProfilePage() {
  const { profile, realm } = useAuth();
  if (!profile) return null;
  const company = profile.tenant?.name ?? profile.tenant_name;
  const roles = profile.roles ?? [];
  const perms = (profile.permissions ?? []).map((p) => (typeof p === 'string' ? p : p?.code)).filter(Boolean);

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="card pf-hero">
        <span className="avatar pf-avatar">{initials(profile.name)}</span>
        <div className="grow">
          <div className="row wrap" style={{ gap: 10 }}>
            <h2 className="pf-name">{profile.name}</h2>
            <StatusBadge status={profile.status ?? 'active'} />
          </div>
          <div className="muted">{profile.email}</div>
          {roles.length > 0 && (
            <div className="tag-list" style={{ marginTop: 10 }}>
              {roles.map((r) => (
                <Badge key={roleLabel(r)} plain>
                  {roleLabel(r)}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="stack" style={{ gap: 20 }}>
          {realm === 'customer' && <PlanUsageCard />}

          <div className="card card-pad">
            <div className="card-title" style={{ marginBottom: 14 }}>
              Account details
            </div>
            <div className="pf-details">
              <Detail icon={Mail} label="Email">
                {profile.email}
              </Detail>
              {company && (
                <Detail icon={Building2} label="Company">
                  {company}
                </Detail>
              )}
              <Detail icon={Clock} label="Last sign-in">
                {dateTime(profile.last_login_at)}
              </Detail>
              {realm === 'customer' && profile.tenant_id && (
                <Detail icon={ShieldCheck} label="Company ID">
                  <span className="mono small">{profile.tenant_id}</span>
                </Detail>
              )}
            </div>
          </div>
        </div>

        <div className="stack" style={{ gap: 20 }}>
          {realm === 'customer' ? (
            <ChangePasswordCard />
          ) : (
            <div className="card card-pad">
              <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
                <KeyRound size={18} />
                <div>
                  <div className="card-title">Password</div>
                  <p className="muted small" style={{ marginTop: 4 }}>
                    Ask a super admin to reset your console password.
                  </p>
                </div>
              </div>
            </div>
          )}
          {perms.length > 0 && (
            <div className="card card-pad">
              <div className="card-title">Your permissions</div>
              <div className="card-sub" style={{ marginBottom: 14 }}>
                What your roles let you do in this workspace.
              </div>
              <div className="tag-list">
                {perms.map((code) => (
                  <span key={code} className="tag">
                    {code}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
