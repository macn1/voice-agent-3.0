import { useEffect, useMemo, useState } from 'react';
import { Lock, Plus, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { groupPermissions } from '../lib/permissions';
import { asList, rolePermissionCodes } from '../lib/normalize';
import { Async, Badge, Button, EmptyState, errMsg, Field, Input, Modal, useToast } from './ui';

/**
 * Roles + permission matrix shared by both realms. `hooks` are RTK Query hooks:
 * { useList, useCreate, useSetPermissions, useCatalog }.
 */
export function RolesManager({ hooks, catalog, title }) {
  const toast = useToast();
  const roles = hooks.useList();
  const [createRole] = hooks.useCreate();
  const [setPermissions] = hooks.useSetPermissions();
  // Permission catalog route (ADM-07.4 / CUS-04.4); built-in list until it exists.
  const remote = hooks.useCatalog();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  // Codes saved in this session, for APIs whose list response omits permissions.
  const [saved, setSaved] = useState({});

  const codesOf = (r) => saved[r.id] ?? rolePermissionCodes(r);
  const extraCodes = useMemo(() => asList(roles.data).flatMap(rolePermissionCodes), [roles.data]);
  const groups = useMemo(() => {
    const defs = remote.data?.length
      ? remote.data.map((p) => ({
          code: p.code,
          label: p.description || p.code,
          category: p.category || 'Other',
        }))
      : catalog;
    return groupPermissions(defs, extraCodes);
  }, [catalog, extraCodes, remote.data]);

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>{title}</h2>
          <div className="card-sub">Roles bundle permissions. Built-in roles are read-only.</div>
        </div>
        <Button variant="primary" icon={<Plus />} onClick={() => setCreating(true)}>
          New role
        </Button>
      </div>
      <Async state={roles}>
        {(data) => {
          const list = asList(data);
          if (!list.length) return <EmptyState icon={<ShieldCheck />} title="No roles yet" description="Create a role, then tick what it allows." />;
          return (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Role</th>
                    <th>Permissions</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => {
                    const codes = codesOf(r);
                    return (
                      <tr key={r.id}>
                        <td style={{ minWidth: 220 }}>
                          <div className="row" style={{ gap: 8 }}>
                            <span className="cell-main">{r.name}</span>
                            {r.is_system && (
                              <Badge plain>
                                <Lock size={11} /> Built-in
                              </Badge>
                            )}
                          </div>
                          {r.description && <div className="cell-sub">{r.description}</div>}
                        </td>
                        <td>
                          {codes.length ? (
                            <div className="tag-list">
                              {codes.map((c) => (
                                <span key={c} className="tag">
                                  {c}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="muted small">{r.permissions ? 'No permissions' : 'Not listed'}</span>
                          )}
                        </td>
                        <td className="actions">
                          <Button size="sm" variant="ghost" icon={<SlidersHorizontal />} onClick={() => setEditing(r)}>
                            {r.is_system ? 'View' : 'Permissions'}
                          </Button>
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

      <CreateRoleModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreate={async (name, description) => {
          const role = await createRole({ name, description }).unwrap();
          toast(`Role “${name}” created`);
          if (role?.id)
            setEditing({
              ...role,
              name: role.name ?? name,
              permissions: role.permissions ?? [],
            });
        }}
      />

      <PermissionMatrix
        role={editing}
        groups={groups}
        initial={editing ? codesOf(editing) : []}
        onClose={() => setEditing(null)}
        onSave={async (codes) => {
          await setPermissions({ id: editing.id, permissions: codes }).unwrap();
          setSaved((s) => ({ ...s, [editing.id]: codes }));
          toast('Permissions updated');
        }}
      />
    </div>
  );
}

function CreateRoleModal({ open, onClose, onCreate }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (open) {
      setName('');
      setDescription('');
      setError(null);
    }
  }, [open]);

  const submit = async () => {
    if (!name.trim()) return setError('Give the role a name');
    setBusy(true);
    setError(null);
    try {
      await onCreate(name.trim(), description.trim());
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
      title="New role"
      description="You'll choose its permissions next."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={submit}>
            Create role
          </Button>
        </>
      }
    >
      <div className="stack">
        {error && <div className="alert-inline">{error}</div>}
        <Field label="Name">
          <Input autoFocus placeholder="e.g. Billing viewer" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Description" hint="Optional — helps others pick the right role.">
          <Input placeholder="Read-only access to billing" value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function PermissionMatrix({ role, groups, initial, onClose, onSave }) {
  const [selected, setSelected] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const readOnly = !!role?.is_system;

  useEffect(() => {
    if (role) {
      setSelected(new Set(initial));
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const toggle = (code, on) =>
    setSelected((s) => {
      const n = new Set(s);
      if (on) n.add(code);
      else n.delete(code);
      return n;
    });

  return (
    <Modal
      open={!!role}
      onClose={onClose}
      wide
      title={role?.name ?? ''}
      description={readOnly ? 'Built-in role — permissions are fixed.' : 'Tick what this role allows. Saving replaces the whole set.'}
      footer={
        readOnly ? (
          <Button onClick={onClose}>Close</Button>
        ) : (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button
              variant="primary"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  await onSave([...selected]);
                  onClose();
                } catch (e) {
                  setError(errMsg(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Save permissions
            </Button>
          </>
        )
      }
    >
      {error && (
        <div className="alert-inline" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}
      {role && !role.permissions && (
        <div className="banner info">
          <span className="grow">This role's current permissions weren't included in the response, so nothing is pre-ticked.</span>
        </div>
      )}
      {groups.map(([category, defs]) => (
        <div key={category} className="perm-group">
          <h4>{category}</h4>
          <div className="perm-grid">
            {defs.map((d) => (
              <label key={d.code} className="check">
                <input type="checkbox" disabled={readOnly} checked={selected.has(d.code)} onChange={(e) => toggle(d.code, e.target.checked)} />
                <span>
                  <span style={{ fontWeight: 500 }}>{d.label}</span>
                  <span className="mono muted" style={{ display: 'block', fontSize: 11.5 }}>
                    {d.code}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </Modal>
  );
}
