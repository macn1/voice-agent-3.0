import { KeyRound } from 'lucide-react';
import { Badge, StatusBadge } from '../../../components/ui';
import { useAuth } from '../../../lib/auth';
import { dateTime, initials } from '../../../lib/format';
import { roleLabel } from '../../../lib/normalize';
import { ChangePasswordCard } from './MoreSettings';

export function ProfilePage() {
  const { profile, realm } = useAuth();
  if (!profile) return null;
  const company = profile.tenant?.name ?? profile.tenant_name;

  return (
    <div className="grid-2" style={{ alignItems: 'start' }}>
      <div className="card card-pad">
        <div className="row" style={{ gap: 16, marginBottom: 24 }}>
          <span className="avatar" style={{ width: 56, height: 56, fontSize: 20 }}>
            {initials(profile.name)}
          </span>
          <div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{profile.name}</div>
            <div className="muted">{profile.email}</div>
          </div>
        </div>
        <dl className="kv">
          {company && (
            <>
              <dt>Company</dt>
              <dd>{company}</dd>
            </>
          )}
          <dt>Status</dt>
          <dd>
            <StatusBadge status={profile.status ?? 'active'} />
          </dd>
          <dt>Roles</dt>
          <dd>
            {profile.roles?.length ? (
              <div className="tag-list">
                {profile.roles.map((r) => (
                  <Badge key={roleLabel(r)} plain>
                    {roleLabel(r)}
                  </Badge>
                ))}
              </div>
            ) : (
              '—'
            )}
          </dd>
          <dt>Last sign-in</dt>
          <dd>{dateTime(profile.last_login_at)}</dd>
          {realm === 'customer' && profile.tenant_id && (
            <>
              <dt>Company ID</dt>
              <dd className="mono">{profile.tenant_id}</dd>
            </>
          )}
        </dl>
      </div>

      <div className="stack">
        {profile.permissions?.length ? (
          <div className="card card-pad">
            <div className="card-title">Your permissions</div>
            <div className="card-sub" style={{ marginBottom: 14 }}>
              What your roles let you do in this workspace.
            </div>
            <div className="tag-list">
              {/* Codes may arrive as strings or as { code } objects. */}
              {profile.permissions
                .map((p) => (typeof p === "string" ? p : p?.code))
                .filter(Boolean)
                .map((code) => (
                  <span key={code} className="tag">
                    {code}
                  </span>
                ))}
            </div>
          </div>
        ) : null}
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
      </div>
    </div>
  );
}
