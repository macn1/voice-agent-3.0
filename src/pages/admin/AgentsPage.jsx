import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Bot, CircleDot, Eye, FilePen, MoreHorizontal, Pause, Pencil, Play, Plus, RotateCw, Search, SearchX, Trash2, X } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { date, dateTime, initials, number, titleCase } from '../../lib/format';
import { asList, listTotal } from '../../lib/normalize';
import {
  useCreateAdminAgentMutation,
  useDeleteAdminAgentMutation,
  useGetAdminAgentQuery,
  useListAdminAgentsQuery,
  useListCustomersQuery,
  usePauseAdminAgentMutation,
  usePutAdminAgentFlowDraftMutation,
  useResumeAdminAgentMutation,
  useUpdateAdminAgentMutation,
} from '../../store/api/adminApi';
import { Async, Badge, Button, ConfirmDialog, EmptyState, ErrorState, errMsg, Field, Input, Modal, PageHeader, Skeleton, StatusBadge, useToast } from '../../components/ui';
import { CopyField, Drawer, ListEditor, Select, Textarea } from '../../components/forms';
import { Kpi } from './AdminOverviewPage';

// AGT-01 agents, managed from the platform console. The API is
// GET /flow/api/v1/customer/agents -> { items, total }; it filters by ?status
// only, so search, the other filters and sorting run on the fetched list.

const FETCH_LIMIT = 200;
const STATUSES = ['live', 'paused', 'draft'];
const STATUS_LABEL = { live: 'Active', paused: 'Inactive', draft: 'Draft' };
const STATUS_ORDER = { live: 0, paused: 1, draft: 2 };
const SORTS = [
  { value: 'updated', label: 'Last updated' },
  { value: 'name', label: 'Name (A–Z)' },
  { value: 'status', label: 'Status' },
];
const NAME_MAX = 150; // agents.name varchar(150)

const statusOf = (a) => (a.status ?? '').toLowerCase();
const updatedOf = (a) => a.updated_at ?? a.last_published_at ?? a.created_at;
const time = (v) => {
  const t = v ? new Date(v).getTime() : NaN;
  return Number.isNaN(t) ? 0 : t;
};
const AgentStatus = ({ status }) => <StatusBadge status={status} label={STATUS_LABEL[status] ?? titleCase(status || 'unknown')} />;

export function AdminAgentsPage() {
  const toast = useToast();
  const { can } = useAuth();
  const list = useListAdminAgentsQuery({ limit: FETCH_LIMIT, offset: 0 });
  const customersQ = useListCustomersQuery({ limit: 200, offset: 0 }, { skip: !can('customer.read') });
  const [pauseAgent] = usePauseAdminAgentMutation();
  const [resumeAgent] = useResumeAdminAgentMutation();
  const [deleteAgent] = useDeleteAdminAgentMutation();

  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [tenant, setTenant] = useState('');
  const [tag, setTag] = useState('');
  const [sort, setSort] = useState('updated');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const items = useMemo(() => asList(list.data), [list.data]);
  const total = listTotal(list.data) ?? items.length;
  const customers = asList(customersQ.data);
  const customerName = (id) => (id ? (customers.find((c) => c.id === id)?.name ?? `${id.slice(0, 8)}…`) : '—');

  // Columns and filters appear only when the API returns the field.
  const has = useMemo(() => {
    const any = (fn) => items.some(fn);
    return {
      tenant: any((a) => a.tenant_id),
      language: any((a) => a.language),
      numbers: any((a) => a.numbers?.length),
      calls: any((a) => a.calls_7d != null),
    };
  }, [items]);
  const tags = useMemo(() => [...new Set(items.flatMap((a) => a.tags ?? []))].sort(), [items]);
  const tenants = useMemo(() => [...new Set(items.map((a) => a.tenant_id).filter(Boolean))], [items]);

  const count = (s) => items.filter((a) => statusOf(a) === s).length;
  const filtering = !!(q || status || tenant || tag);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = items.filter(
      (a) =>
        (!needle || (a.name ?? '').toLowerCase().includes(needle)) &&
        (!status || statusOf(a) === status) &&
        (!tenant || a.tenant_id === tenant) &&
        (!tag || a.tags?.includes(tag)),
    );
    const byName = (a, b) => (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base' });
    const cmp = {
      name: byName,
      status: (a, b) => (STATUS_ORDER[statusOf(a)] ?? 9) - (STATUS_ORDER[statusOf(b)] ?? 9) || byName(a, b),
      updated: (a, b) => time(updatedOf(b)) - time(updatedOf(a)),
    }[sort];
    return [...out].sort(cmp);
  }, [items, q, status, tenant, tag, sort]);

  const clearFilters = () => {
    setQ('');
    setStatus('');
    setTenant('');
    setTag('');
  };

  const toggleStatus = async (a) => {
    const live = statusOf(a) === 'live';
    setBusyId(a.id);
    try {
      await (live ? pauseAgent(a.id) : resumeAgent(a.id)).unwrap();
      toast(live ? `${a.name} deactivated` : `${a.name} activated`);
    } catch (e) {
      toast(e?.code === 'agent_not_published' ? 'Only a published agent can be deactivated.' : errMsg(e), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const loading = list.data === undefined && !list.error;
  const stat = (n) => (loading ? <Skeleton h={28} w={56} /> : list.error && list.data === undefined ? '—' : number(n));

  return (
    <>
      <PageHeader
        eyebrow="Telephony & agents"
        title="Agents"
        description="Manage, monitor, and configure your AI voice agents."
        actions={
          <>
            <Button icon={<RotateCw />} loading={list.isFetching && !loading} onClick={() => list.refetch()}>
              Refresh
            </Button>
            <Button variant="primary" icon={<Plus />} onClick={() => setCreating(true)}>
              Create Agent
            </Button>
          </>
        }
      />

      <div className="grid-3 kpi-row" style={{ marginBottom: 20 }}>
        <Kpi icon={Bot} label="Total agents" value={stat(total)} hint={total > items.length ? `Status counts cover the first ${number(items.length)}` : undefined} />
        <Kpi icon={Play} tone="green" label="Active agents" value={stat(count('live'))} hint="Live and taking calls" />
        <Kpi icon={Pause} label="Inactive agents" value={stat(count('paused'))} hint="Paused by an admin" />
        <Kpi icon={FilePen} tone="blue" label="Draft agents" value={stat(count('draft'))} hint="Never published" />
      </div>

      <div className="card">
        <div className="card-head agents-toolbar">
          <div className="filters">
            <div className="search">
              <Search />
              <Input placeholder="Search by agent name" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search agents" />
            </div>
            <Select
              value={status}
              aria-label="Filter by status"
              options={STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
              placeholder="All statuses"
              onChange={(e) => setStatus(e.target.value)}
            />
            {has.tenant && tenants.length > 1 && (
              <Select
                value={tenant}
                aria-label="Filter by customer"
                options={tenants.map((id) => ({ value: id, label: customerName(id) }))}
                placeholder="All customers"
                onChange={(e) => setTenant(e.target.value)}
              />
            )}
            {tags.length > 0 && <Select value={tag} aria-label="Filter by tag" options={tags} placeholder="All tags" onChange={(e) => setTag(e.target.value)} />}
            <Select value={sort} aria-label="Sort agents" options={SORTS} onChange={(e) => setSort(e.target.value)} />
            {filtering && (
              <Button size="sm" variant="ghost" icon={<X />} onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </div>
        </div>

        {list.error && list.data === undefined ? (
          <AgentsError error={list.error} onRetry={list.refetch} />
        ) : (
          <Async state={list}>
            {() =>
              !items.length ? (
                <EmptyState
                  icon={<Bot />}
                  title="No agents yet"
                  description="Agents answer and place calls. Create one to start configuring its persona and instructions."
                  action={
                    <Button variant="primary" icon={<Plus />} onClick={() => setCreating(true)}>
                      Create Agent
                    </Button>
                  }
                />
              ) : !rows.length ? (
                <EmptyState
                  icon={<SearchX />}
                  title="No agents match"
                  description="Nothing matches this search and these filters."
                  action={
                    <Button icon={<X />} onClick={clearFilters}>
                      Clear filters
                    </Button>
                  }
                />
              ) : (
                <>
                  <div className="table-wrap">
                    <table className="table agents-table">
                      <thead>
                        <tr>
                          <th>Agent</th>
                          {has.tenant && <th className="col-lg">Customer</th>}
                          <th>Status</th>
                          {has.language && <th className="col-lg">Language</th>}
                          {has.numbers && <th className="col-lg">Numbers</th>}
                          {has.calls && <th className="num col-md">Calls (7d)</th>}
                          <th className="col-sm">Last updated</th>
                          <th aria-label="Actions" />
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((a) => (
                          <tr key={a.id} className="clickable" onClick={() => setViewing(a)}>
                            <td>
                              <div className="row agent-cell">
                                <span className="avatar sm soft" aria-hidden>
                                  {initials(a.name)}
                                </span>
                                <div className="agent-cell-text">
                                  <div className="cell-main ellipsis">{a.name ?? 'Untitled agent'}</div>
                                  {a.description && <div className="cell-sub agent-desc">{a.description}</div>}
                                  {a.tags?.length > 0 && (
                                    <div className="tag-list" style={{ marginTop: 6 }}>
                                      {a.tags.map((t) => (
                                        <span key={t} className="tag">
                                          {t}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                            {has.tenant && <td className="col-lg">{customerName(a.tenant_id)}</td>}
                            <td>
                              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                                <AgentStatus status={statusOf(a)} />
                                {a.has_unpublished_changes && <Badge tone="orange">Unpublished changes</Badge>}
                              </div>
                            </td>
                            {has.language && <td className="col-lg muted">{a.language ?? '—'}</td>}
                            {has.numbers && <td className="col-lg mono small">{a.numbers?.length ? a.numbers.join(', ') : <span className="muted">—</span>}</td>}
                            {has.calls && <td className="num col-md">{a.calls_7d != null ? number(a.calls_7d) : '—'}</td>}
                            <td className="col-sm muted">{date(updatedOf(a))}</td>
                            <td className="actions" onClick={(e) => e.stopPropagation()}>
                              <AgentActions
                                agent={a}
                                busy={busyId === a.id}
                                onView={() => setViewing(a)}
                                onEdit={() => setEditing(a)}
                                onToggle={() => toggleStatus(a)}
                                onDelete={() => setRemoving(a)}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="pager">
                    <span>
                      Showing {number(rows.length)} of {number(items.length)}
                      {total > items.length ? ` loaded (${number(total)} in total)` : ''}
                    </span>
                  </div>
                </>
              )
            }
          </Async>
        )}
      </div>

      <AgentFormModal open={creating} onClose={() => setCreating(false)} />
      <AgentFormModal open={!!editing} agent={editing} onClose={() => setEditing(null)} />
      <AgentDetailsDrawer
        agent={viewing}
        customerName={customerName}
        onClose={() => setViewing(null)}
        onEdit={(a) => {
          setViewing(null);
          setEditing(a);
        }}
      />
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        danger
        title={`Delete ${removing?.name ?? 'this agent'}?`}
        description="This can't be undone. Agents attached to a phone number or a running campaign can't be deleted — detach them first."
        confirmLabel="Delete agent"
        onConfirm={async () => {
          await deleteAgent(removing.id).unwrap();
          toast(`${removing.name ?? 'Agent'} deleted`);
        }}
      />
    </>
  );
}

/** Load failure. The flow service is documented as tenant-only, so say so plainly when it rejects the admin session. */
function AgentsError({ error, onRetry }) {
  if (error?.status !== 401 && error?.status !== 403) return <ErrorState error={error} onRetry={onRetry} />;
  return (
    <div className="state error">
      <div className="state-icon">
        <AlertTriangle />
      </div>
      <h3>The agents service refused the admin session</h3>
      <p>voice-flow-be only accepts tenant users on its agents API today, so platform admins can't list agents until it allows them.</p>
      <code className="tag" style={{ height: 'auto', minHeight: 24, maxWidth: '100%', overflowWrap: 'anywhere' }}>
        {error.path} → {error.status} {error.message}
      </code>
      <Button size="sm" icon={<RotateCw />} onClick={onRetry} style={{ marginTop: 8 }}>
        Try again
      </Button>
    </div>
  );
}

/* Row action menu ----------------------------------------------------- */

const MENU_WIDTH = 220;

function AgentActions({ agent, busy, onView, onEdit, onToggle, onDelete }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btn = useRef(null);
  const menu = useRef(null);
  const s = statusOf(agent);

  // Portal + fixed position so the table's scroll container can't clip it; flips up near the viewport bottom.
  useLayoutEffect(() => {
    if (!open || !btn.current || !menu.current) return;
    const r = btn.current.getBoundingClientRect();
    const h = menu.current.offsetHeight;
    const left = Math.max(8, Math.min(r.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8));
    const below = r.bottom + 6;
    setPos({ left, top: below + h > window.innerHeight - 8 ? Math.max(8, r.top - 6 - h) : below });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onDown = (e) => !menu.current?.contains(e.target) && !btn.current?.contains(e.target) && close();
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      close();
      btn.current?.focus();
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open]);

  const pick = (fn) => () => {
    setOpen(false);
    fn();
  };

  return (
    <>
      <button
        ref={btn}
        type="button"
        className="icon-btn agent-menu-btn"
        aria-label={`Actions for ${agent.name ?? 'agent'}`}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy}
        onClick={() => {
          setPos(null);
          setOpen((o) => !o);
        }}
      >
        {busy ? <span className="spinner" aria-hidden /> : <MoreHorizontal />}
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            className="dropdown agent-menu"
            role="menu"
            style={{ width: MENU_WIDTH, left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? 'visible' : 'hidden' }}
          >
            <button type="button" className="dropdown-item" role="menuitem" onClick={pick(onView)}>
              <Eye /> View details
            </button>
            <button type="button" className="dropdown-item" role="menuitem" onClick={pick(onEdit)}>
              <Pencil /> Edit agent
            </button>
            {s === 'live' && (
              <button type="button" className="dropdown-item" role="menuitem" onClick={pick(onToggle)}>
                <Pause /> Deactivate
              </button>
            )}
            {s === 'paused' && (
              <button type="button" className="dropdown-item" role="menuitem" onClick={pick(onToggle)}>
                <Play /> Activate
              </button>
            )}
            {s === 'draft' && (
              <button type="button" className="dropdown-item" role="menuitem" disabled title="A draft goes live when it's published">
                <CircleDot /> Activate (publish first)
              </button>
            )}
            <button type="button" className="dropdown-item danger" role="menuitem" onClick={pick(onDelete)}>
              <Trash2 /> Delete agent
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}

/* Details drawer ------------------------------------------------------- */

function AgentDetailsDrawer({ agent, customerName, onClose, onEdit }) {
  const detail = useGetAdminAgentQuery(agent?.id, { skip: !agent });
  // Show the list row straight away; swap in the full record once it loads.
  const a = detail.data ?? agent;
  return (
    <Drawer
      open={!!agent}
      onClose={onClose}
      title={a?.name ?? 'Agent'}
      subtitle={a?.description}
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button variant="primary" icon={<Pencil />} onClick={() => onEdit(a)}>
            Edit agent
          </Button>
        </>
      }
    >
      {a && (
        <div className="stack">
          {detail.error && !detail.data && <div className="alert-inline">Showing the list summary — the full record didn't load: {errMsg(detail.error)}</div>}
          <dl className="kv agent-kv">
            <dt>Status</dt>
            <dd>
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                <AgentStatus status={statusOf(a)} />
                {a.has_unpublished_changes && <Badge tone="orange">Unpublished changes</Badge>}
              </div>
            </dd>
            {a.tenant_id && (
              <>
                <dt>Customer</dt>
                <dd>{customerName(a.tenant_id)}</dd>
              </>
            )}
            <dt>Tags</dt>
            <dd>
              {a.tags?.length ? (
                <div className="tag-list">
                  {a.tags.map((t) => (
                    <span key={t} className="tag">
                      {t}
                    </span>
                  ))}
                </div>
              ) : (
                '—'
              )}
            </dd>
            {a.language && (
              <>
                <dt>Language</dt>
                <dd>{a.language}</dd>
              </>
            )}
            <dt>Timezone</dt>
            <dd>{a.timezone || '—'}</dd>
            {a.max_concurrent_calls != null && (
              <>
                <dt>Max concurrent calls</dt>
                <dd>{number(a.max_concurrent_calls)}</dd>
              </>
            )}
            {a.numbers?.length > 0 && (
              <>
                <dt>Numbers</dt>
                <dd className="mono">{a.numbers.join(', ')}</dd>
              </>
            )}
            {a.calls_7d != null && (
              <>
                <dt>Calls (7 days)</dt>
                <dd>{number(a.calls_7d)}</dd>
              </>
            )}
            <dt>Last published</dt>
            <dd>{a.last_published_at ? dateTime(a.last_published_at) : 'Never'}</dd>
            <dt>Created</dt>
            <dd>{dateTime(a.created_at)}</dd>
            <dt>Last updated</dt>
            <dd>{dateTime(updatedOf(a))}</dd>
          </dl>
          <Field label="Agent ID">
            <CopyField value={a.id} />
          </Field>
        </div>
      )}
    </Drawer>
  );
}

/* Create / edit form ------------------------------------------------- */

function timezones() {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return [];
  }
}

const EMPTY = { name: '', description: '', tags: [], timezone: '', greeting: '', system_prompt: '' };

/**
 * Create: POST /customer/agents { name, description, tags, timezone }, then the
 * greeting / instructions go to the draft (PUT …/flow/draft) when given.
 * Edit: PATCH /customer/agents/{id} with the same agent fields.
 */
function AgentFormModal({ open, agent, onClose }) {
  const toast = useToast();
  const editing = !!agent;
  const [f, setF] = useState(EMPTY);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [createAgent] = useCreateAdminAgentMutation();
  const [updateAgent] = useUpdateAdminAgentMutation();
  const [putDraft] = usePutAdminAgentFlowDraftMutation();
  const zones = useMemo(timezones, []);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    if (!open) return;
    setF(
      agent
        ? { ...EMPTY, name: agent.name ?? '', description: agent.description ?? '', tags: agent.tags ?? [], timezone: agent.timezone ?? '' }
        : { ...EMPTY, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? '' },
    );
    setTouched(false);
    setError(null);
  }, [open, agent]);

  const name = f.name.trim();
  const errs = {
    name: !name ? 'Give the agent a name' : name.length > NAME_MAX ? `Keep it under ${NAME_MAX} characters` : null,
  };
  const show = (k) => (touched ? errs[k] : null);

  const submit = async () => {
    setTouched(true);
    if (Object.values(errs).some(Boolean)) return;
    setBusy(true);
    setError(null);
    const body = { name, description: f.description.trim(), tags: f.tags, ...(f.timezone ? { timezone: f.timezone } : {}) };
    try {
      if (editing) {
        await updateAgent({ id: agent.id, ...body }).unwrap();
        toast(`${name} saved`);
        onClose();
        return;
      }
      const created = await createAgent(body).unwrap();
      const draft = { greeting: f.greeting.trim(), system_prompt: f.system_prompt.trim() };
      if (created?.id && (draft.greeting || draft.system_prompt)) {
        try {
          await putDraft({ id: created.id, ...draft }).unwrap();
        } catch (e) {
          // The agent exists; only the draft text failed, so don't report the whole create as failed.
          toast(`${name} created, but the greeting and instructions weren't saved: ${errMsg(e)}`, 'error');
          onClose();
          return;
        }
      }
      toast(`${name} created as a draft`);
      onClose();
    } catch (e) {
      const msg = errMsg(e);
      setError(e?.status === 409 || /exists|duplicate|unique/i.test(msg) ? `An agent called “${name}” already exists for this workspace.` : msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={editing ? `Edit ${agent?.name ?? 'agent'}` : 'Create agent'}
      description={editing ? 'Changes save straight to the agent.' : 'The agent starts as a draft. It goes live once it is published.'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={submit}>
            {editing ? 'Save changes' : 'Create agent'}
          </Button>
        </>
      }
    >
      <div className="stack">
        {error && <div className="alert-inline">{error}</div>}
        <div className="form-grid">
          <Field label="Agent name" error={show('name')}>
            <Input autoFocus invalid={!!show('name')} placeholder="e.g. Front Desk" value={f.name} maxLength={NAME_MAX + 20} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="Timezone" hint="Used for business hours and call scheduling.">
            {zones.length ? (
              // Keep a stored zone the browser lists under another alias (Asia/Kolkata vs Asia/Calcutta).
              <Select
                value={f.timezone}
                options={f.timezone && !zones.includes(f.timezone) ? [f.timezone, ...zones] : zones}
                placeholder="Not set"
                onChange={(e) => set('timezone', e.target.value)}
              />
            ) : (
              <Input placeholder="Asia/Kolkata" value={f.timezone} onChange={(e) => set('timezone', e.target.value)} />
            )}
          </Field>
          <Field label="Description" className="full">
            <Input placeholder="Answers the main line" value={f.description} onChange={(e) => set('description', e.target.value)} />
          </Field>
          <Field label="Tags" className="full" hint="Press Enter after each tag.">
            <ListEditor value={f.tags} onChange={(v) => set('tags', v)} placeholder="reception" />
          </Field>
          {!editing && (
            <>
              <Field label="Greeting" className="full" hint="Optional. The first thing the agent says.">
                <Input placeholder="Hello, this is Priya. How can I help you?" value={f.greeting} onChange={(e) => set('greeting', e.target.value)} />
              </Field>
              <Field label="Instructions (system prompt)" className="full" hint="Optional now, but required before the agent can be published.">
                <Textarea rows={5} placeholder="You are Priya, the receptionist at…" value={f.system_prompt} onChange={(e) => set('system_prompt', e.target.value)} />
              </Field>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
