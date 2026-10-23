import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bot, FilePen, Pause, Play, RotateCw, Search, SearchX, X } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { date, dateTime, initials, number, titleCase } from '../../lib/format';
import { asList, listTotal } from '../../lib/normalize';
import { useListAdminAgentsQuery, useListCustomersQuery } from '../../store/api/adminApi';
import { Async, Badge, Button, EmptyState, ErrorState, Field, Input, PageHeader, Pager, Skeleton, StatusBadge } from '../../components/ui';
import { CopyField, Drawer, Select } from '../../components/forms';
import { Kpi } from './AdminOverviewPage';

// Every customer's agents, read-only: GET /flow/api/v1/admin/agents
// ?tenant_id=&status=&q= -> { items, total } with the published version. Agents
// are edited by their customer; the platform console only monitors them.

const PAGE = 50;
const STATUSES = ['live', 'paused', 'draft'];
const STATUS_LABEL = { live: 'Active', paused: 'Inactive', draft: 'Draft' };

const statusOf = (a) => (a.status ?? '').toLowerCase();
const AgentStatus = ({ status }) => <StatusBadge status={status} label={STATUS_LABEL[status] ?? titleCase(status || 'unknown')} />;

/** Debounced copy of a value, so typing in the search box doesn't fire a request per key. */
function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function AdminAgentsPage() {
  const { can } = useAuth();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [tenant, setTenant] = useState('');
  const [offset, setOffset] = useState(0);
  const [viewing, setViewing] = useState(null);
  const search = useDebounced(q.trim());

  const customersQ = useListCustomersQuery({ limit: 200, offset: 0 }, { skip: !can('customer.read') });
  const customers = asList(customersQ.data);
  const customerName = (id) => (id ? (customers.find((c) => c.id === id)?.name ?? `${id.slice(0, 8)}…`) : '—');

  const filters = { ...(tenant ? { tenant_id: tenant } : {}), ...(search ? { q: search } : {}) };
  const list = useListAdminAgentsQuery({ ...filters, ...(status ? { status } : {}), limit: PAGE, offset });
  // Status tiles: one cheap count per status under the current customer / search filters.
  const all = useListAdminAgentsQuery({ ...filters, limit: 1 });
  const live = useListAdminAgentsQuery({ ...filters, status: 'live', limit: 1 });
  const paused = useListAdminAgentsQuery({ ...filters, status: 'paused', limit: 1 });
  const draft = useListAdminAgentsQuery({ ...filters, status: 'draft', limit: 1 });

  const items = useMemo(() => asList(list.data), [list.data]);
  const total = listTotal(list.data) ?? items.length;
  const filtering = !!(q || status || tenant);
  const clearFilters = () => {
    setQ('');
    setStatus('');
    setTenant('');
    setOffset(0);
  };
  const reset = (fn) => (e) => {
    fn(e.target.value);
    setOffset(0);
  };
  const stat = (s) => (s.data === undefined ? (s.error ? '—' : <Skeleton h={28} w={56} />) : number(listTotal(s.data) ?? 0));

  return (
    <>
      <PageHeader
        eyebrow="Telephony & agents"
        title="Agents"
        description="Every customer's voice agents and which version is live. Customers edit their own agents."
        actions={
          <Button icon={<RotateCw />} loading={list.isFetching && list.data !== undefined} onClick={() => list.refetch()}>
            Refresh
          </Button>
        }
      />

      <div className="grid-3 kpi-row" style={{ marginBottom: 20 }}>
        <Kpi icon={Bot} label="Total agents" value={stat(all)} />
        <Kpi icon={Play} tone="green" label="Active agents" value={stat(live)} hint="Live and taking calls" />
        <Kpi icon={Pause} label="Inactive agents" value={stat(paused)} hint="Paused" />
        <Kpi icon={FilePen} tone="blue" label="Draft agents" value={stat(draft)} hint="Never published" />
      </div>

      <div className="card">
        <div className="card-head agents-toolbar">
          <div className="filters">
            <div className="search">
              <Search />
              <Input placeholder="Search by agent name" value={q} onChange={reset(setQ)} aria-label="Search agents" />
            </div>
            <Select
              value={status}
              aria-label="Filter by status"
              options={STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
              placeholder="All statuses"
              onChange={reset(setStatus)}
            />
            {customers.length > 1 && (
              <Select
                value={tenant}
                aria-label="Filter by customer"
                options={customers.map((c) => ({ value: c.id, label: c.name }))}
                placeholder="All customers"
                onChange={reset(setTenant)}
              />
            )}
            {filtering && (
              <Button size="sm" variant="ghost" icon={<X />} onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </div>
        </div>

        {list.error && list.data === undefined ? (
          <ErrorState error={list.error} onRetry={list.refetch} />
        ) : (
          <Async state={list}>
            {() =>
              !items.length ? (
                filtering ? (
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
                  <EmptyState icon={<Bot />} title="No agents yet" description="Agents appear here once a customer creates one." />
                )
              ) : (
                <>
                  <div className="table-wrap">
                    <table className="table agents-table">
                      <thead>
                        <tr>
                          <th>Agent</th>
                          <th className="col-lg">Customer</th>
                          <th>Status</th>
                          <th className="col-md">Live version</th>
                          <th className="col-sm">Last updated</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((a) => (
                          <tr key={a.id} className="clickable" onClick={() => setViewing(a)}>
                            <td>
                              <div className="row agent-cell">
                                <span className="avatar sm soft" aria-hidden>
                                  {initials(a.name)}
                                </span>
                                <div className="agent-cell-text">
                                  <div className="cell-main ellipsis">{a.name ?? 'Untitled agent'}</div>
                                </div>
                              </div>
                            </td>
                            <td className="col-lg">{customerName(a.tenant_id)}</td>
                            <td>
                              <AgentStatus status={statusOf(a)} />
                            </td>
                            <td className="col-md muted">{a.published_version ? `v${a.published_version}` : '—'}</td>
                            <td className="col-sm muted">{date(a.updated_at ?? a.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Pager offset={offset} limit={PAGE} count={items.length} total={total} onChange={setOffset} />
                </>
              )
            }
          </Async>
        )}
      </div>

      <AgentDetailsDrawer agent={viewing} customerName={customerName} onClose={() => setViewing(null)} />
    </>
  );
}

/* Details drawer ------------------------------------------------------- */

function AgentDetailsDrawer({ agent: a, customerName, onClose }) {
  return (
    <Drawer open={!!a} onClose={onClose} title={a?.name ?? 'Agent'} footer={<Button onClick={onClose}>Close</Button>}>
      {a && (
        <div className="stack">
          <dl className="kv agent-kv">
            <dt>Status</dt>
            <dd>
              <AgentStatus status={statusOf(a)} />
            </dd>
            <dt>Customer</dt>
            <dd>
              <Link to={`/admin/customers/${a.tenant_id}`}>{customerName(a.tenant_id)}</Link>
            </dd>
            <dt>Live version</dt>
            <dd>{a.published_version ? <Badge plain>v{a.published_version}</Badge> : 'Never published'}</dd>
            <dt>Created</dt>
            <dd>{dateTime(a.created_at)}</dd>
            <dt>Last updated</dt>
            <dd>{dateTime(a.updated_at ?? a.created_at)}</dd>
          </dl>
          <Field label="Agent ID">
            <CopyField value={a.id} />
          </Field>
        </div>
      )}
    </Drawer>
  );
}
