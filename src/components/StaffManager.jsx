import { useEffect, useMemo, useState } from 'react';
import { Copy, MailPlus, Pencil, Search, Trash2, UserPlus, Users, Wand2 } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { dateTime, initials } from '../lib/format';
import { asList, roleId, roleLabel } from '../lib/normalize';
import { Async, Badge, Button, ConfirmDialog, EmptyState, errMsg, Field, Input, Modal, StatusBadge, Toggle, useToast } from './ui';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('') + '!7';
}

const useNone = () => [null];

/**
 * Team table shared by the customer dashboard and the admin console.
 * `hooks` are RTK Query hooks: { useList, useListRoles, useCreate, useUpdate,
 * useRemove?, useResendInvite? }.
 */
export function StaffManager({ hooks, title, noun = 'team member' }) {
  const { profile } = useAuth();
  const toast = useToast();
  const staff = hooks.useList();
  const roles = hooks.useListRoles();
  const [createStaff] = hooks.useCreate();
  const [updateStaff] = hooks.useUpdate();
  const [removeStaff] = (hooks.useRemove ?? useNone)();
  const [resendInvite] = (hooks.useResendInvite ?? useNone)();
  const roleList = useMemo(() => asList(roles.data), [roles.data]);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [created, setCreated] = useState(null);
  const [inviteLink, setInviteLink] = useState(null);

  const roleName = (r) => {
    if (typeof r !== 'string') return r.name;
    return roleList.find((x) => x.id === r)?.name ?? r;
  };

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>{title}</h2>
          <div className="card-sub">Invite people, set their roles, and disable access when they leave.</div>
        </div>
        <div className="row wrap">
          <div className="search">
            <Search />
            <Input placeholder="Search name or email" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <Button variant="primary" icon={<UserPlus />} onClick={() => setCreating(true)}>
            Add {noun}
          </Button>
        </div>
      </div>

      <Async state={staff}>
        {(data) => {
          const q = query.trim().toLowerCase();
          const rows = asList(data).filter((s) => !q || s.name?.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q));
          if (!rows.length)
            return (
              <EmptyState
                icon={<Users />}
                title={q ? 'No matches' : `No ${noun}s yet`}
                description={q ? 'Try a different name or email.' : `Add your first ${noun} to share the workload.`}
              />
            );
          return (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Roles</th>
                    <th>Status</th>
                    <th>Last sign-in</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => {
                    const isMe = s.id === profile?.id;
                    const rs = s.roles ?? s.role_ids ?? [];
                    return (
                      <tr key={s.id}>
                        <td>
                          <div className="row">
                            <span className="avatar sm soft">{initials(s.name)}</span>
                            <div>
                              <div className="cell-main">
                                {s.name} {isMe && <span className="muted small">(you)</span>}
                              </div>
                              <div className="cell-sub">{s.email}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          {rs.length ? (
                            <div className="tag-list">
                              {rs.map((r) => (
                                <Badge key={roleId(r)} plain>
                                  {roleName(r)}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td>
                          <StatusBadge status={s.status} />
                        </td>
                        <td className="muted">{dateTime(s.last_login_at)}</td>
                        <td className="actions">
                          {resendInvite && s.status === 'invited' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<MailPlus />}
                              onClick={async () => {
                                try {
                                  const r = await resendInvite(s.id).unwrap();
                                  setInviteLink(r.invite_link);
                                } catch (e) {
                                  toast(errMsg(e), 'error');
                                }
                              }}
                            >
                              Resend invite
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" icon={<Pencil />} onClick={() => setEditing(s)}>
                            Edit
                          </Button>
                          {removeStaff && (
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<Trash2 />}
                              disabled={isMe}
                              title={isMe ? "You can't remove yourself" : undefined}
                              onClick={() => setRemoving(s)}
                            >
                              Remove
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        }}
      </Async>

      <CreateStaffModal
        open={creating}
        onClose={() => setCreating(false)}
        roles={roleList}
        noun={noun}
        onCreate={async (body) => {
          await createStaff(body).unwrap();
          setCreated({ email: body.email, password: body.password });
          toast(`${body.name} added`);
        }}
      />

      <EditStaffModal
        staff={editing}
        isMe={editing?.id === profile?.id}
        onClose={() => setEditing(null)}
        onSave={async (id, body) => {
          await updateStaff({ id, ...body }).unwrap();
          toast('Changes saved');
        }}
      />

      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        danger
        title={`Remove ${removing?.name}?`}
        description="They lose access immediately. Their past activity stays in your records."
        confirmLabel="Remove"
        onConfirm={async () => {
          await removeStaff(removing.id).unwrap();
          toast(`${removing.name} removed`);
        }}
      />

      <Modal
        open={!!inviteLink}
        onClose={() => setInviteLink(null)}
        title="Invite link"
        description="Email isn't connected yet — copy this link and send it to them."
        footer={
          <Button
            variant="primary"
            icon={<Copy />}
            onClick={() => {
              navigator.clipboard?.writeText(inviteLink ?? '');
              toast('Copied');
              setInviteLink(null);
            }}
          >
            Copy link
          </Button>
        }
      >
        <code className="tag" style={{ height: 'auto', padding: 10, wordBreak: 'break-all' }}>
          {inviteLink}
        </code>
      </Modal>

      <Modal
        open={!!created}
        onClose={() => setCreated(null)}
        title="Share their sign-in details"
        description="Invite emails aren't sent yet. Copy these details and share them securely — the password won't be shown again."
        footer={
          <>
            <Button
              icon={<Copy />}
              onClick={() => {
                navigator.clipboard?.writeText(`Sign in at ${window.location.origin}/login\nEmail: ${created.email}\nPassword: ${created.password}`);
                toast('Copied to clipboard');
              }}
            >
              Copy
            </Button>
            <Button variant="primary" onClick={() => setCreated(null)}>
              Done
            </Button>
          </>
        }
      >
        {created && (
          <dl className="kv">
            <dt>Email</dt>
            <dd className="mono">{created.email}</dd>
            <dt>Temporary password</dt>
            <dd className="mono">{created.password}</dd>
          </dl>
        )}
      </Modal>
    </div>
  );
}

function CreateStaffModal({ open, onClose, roles, noun, onCreate }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [roleIds, setRoleIds] = useState([]);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setName('');
      setEmail('');
      setPassword(generatePassword());
      setRoleIds([]);
      setTouched(false);
      setError(null);
    }
  }, [open]);

  const errs = {
    name: !name.trim() ? 'Enter a name' : null,
    email: !EMAIL_RE.test(email) ? 'Enter a valid email' : null,
    password: password.length < 8 ? 'At least 8 characters' : null,
  };
  const invalid = Object.values(errs).some(Boolean);

  const submit = async () => {
    setTouched(true);
    if (invalid) return;
    setBusy(true);
    setError(null);
    try {
      await onCreate({
        name: name.trim(),
        email: email.trim(),
        password,
        role_ids: roleIds,
      });
      onClose();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Add ${noun}`}
      description="They can sign in right away with the temporary password."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={submit}>
            Add {noun}
          </Button>
        </>
      }
    >
      <div className="stack">
        {error && <div className="alert-inline">{error}</div>}
        <Field label="Full name" error={touched ? errs.name : null}>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} invalid={touched && !!errs.name} />
        </Field>
        <Field label="Email" error={touched ? errs.email : null}>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} invalid={touched && !!errs.email} />
        </Field>
        <Field label="Temporary password" error={touched ? errs.password : null} hint="Share it securely; they should change it after signing in.">
          <div className="input-wrap">
            <Input className="mono" value={password} onChange={(e) => setPassword(e.target.value)} invalid={touched && !!errs.password} />
            <button type="button" className="input-icon" title="Generate" onClick={() => setPassword(generatePassword())}>
              <Wand2 />
            </button>
          </div>
        </Field>
        <div className="field">
          <span className="field-label">Roles</span>
          {roles.length ? (
            <div className="stack" style={{ gap: 10 }}>
              {roles.map((r) => (
                <label key={r.id} className="check">
                  <input
                    type="checkbox"
                    checked={roleIds.includes(r.id)}
                    onChange={(e) => setRoleIds((ids) => (e.target.checked ? [...ids, r.id] : ids.filter((x) => x !== r.id)))}
                  />

                  <span>
                    <span style={{ fontWeight: 500 }}>{roleLabel(r)}</span>
                    {r.description && (
                      <span className="muted small" style={{ display: 'block' }}>
                        {r.description}
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <span className="hint">No roles yet — create one on the Roles tab.</span>
          )}
        </div>
      </div>
    </Modal>
  );
}

function EditStaffModal({ staff, isMe, onClose, onSave }) {
  const [name, setName] = useState('');
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (staff) {
      setName(staff.name);
      setActive(staff.status !== 'disabled' && staff.status !== 'suspended');
      setError(null);
    }
  }, [staff]);

  const submit = async () => {
    if (!staff) return;
    const body = {};
    if (name.trim() && name.trim() !== staff.name) body.name = name.trim();
    const wasActive = staff.status !== 'disabled' && staff.status !== 'suspended';
    if (active !== wasActive) body.status = active ? 'active' : 'disabled';
    if (!Object.keys(body).length) return onClose();
    setBusy(true);
    setError(null);
    try {
      await onSave(staff.id, body);
      onClose();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!staff}
      onClose={onClose}
      title={`Edit ${staff?.name ?? ''}`}
      description={staff?.email}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={submit}>
            Save changes
          </Button>
        </>
      }
    >
      <div className="stack">
        {error && <div className="alert-inline">{error}</div>}
        <Field label="Full name">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Toggle
          checked={active}
          onChange={setActive}
          disabled={isMe}
          label="Can sign in"
          description={isMe ? "You can't disable your own account." : 'Turn off to block sign-in without deleting the account.'}
        />
      </div>
    </Modal>
  );
}
