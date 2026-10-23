import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Building2, CheckCircle2, Clock3, Globe2, Package as PackageIcon, PhoneCall, Sparkles, UserPlus, Users } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { date, money, number, percent, titleCase } from '../../lib/format';
import { asList, listTotal, roleLabel } from '../../lib/normalize';
import {
  useGetPlatformOverviewQuery,
  useListAdminPackagesQuery,
  useListAdminStaffQuery,
  useListCustomersQuery,
  useListNumberPoolQuery,
} from '../../store/api/adminApi';
import { Async, Badge, Button, EmptyState, SegmentTabs, Skeleton, StatusBadge } from '../../components/ui';
import { HBars, ShareBar, TimeChart } from '../../components/charts';
import { COUNTRY_CENTER, countryName, WorldMap } from '../../components/WorldMap';

// ADM-12 Platform overview. Customers and staff from voice-auth-be, plans from
// voice-billing-be, numbers from voice-telephony-be, and call figures from
// voice-analytics-be (/admin/analytics/overview).

const CUSTOMER_SAMPLE = 200;
const STATUS_COLOR = {
  active: 'var(--green)',
  trial: 'var(--blue)',
  suspended: 'var(--amber)',
  cancelled: 'var(--muted)',
};

const monthKey = (d) => `${d.getFullYear()}-${d.getMonth()}`;
const isOnSale = (p) => p.status !== 'deprecated';

/**
 * Where a customer is. Tenants carry no address yet, so: an explicit country
 * field if the API sends one, else the country most of their phone numbers
 * are in, else the region of their default locale (en-IN → IN).
 */
function customerCountry(t, numbersByTenant) {
  const direct = t.country ?? t.country_code ?? t.settings?.country;
  if (direct) return String(direct).toUpperCase();
  const counts = numbersByTenant.get(t.id);
  if (counts) return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const locale = t.default_locale ?? t.settings?.default_locale;
  const region = typeof locale === 'string' ? locale.split(/[-_]/)[1] : undefined;
  return region && region.length === 2 ? region.toUpperCase() : null;
}

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

export function AdminOverviewPage() {
  const navigate = useNavigate();
  const { can, profile } = useAuth();
  const customers = useListCustomersQuery({ limit: CUSTOMER_SAMPLE, offset: 0 }, { skip: !can('customer.read') });
  const packages = useListAdminPackagesQuery();
  const staff = useListAdminStaffQuery(undefined, { skip: !can('staff.manage') });
  const numbers = useListNumberPoolQuery(undefined, { skip: !can('customer.read') });
  const firstName = profile?.name?.split(' ')[0];

  return (
    <>
      <section className="ov-hero">
        <div>
          <div className="eyebrow">
            Platform · <b>{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</b>
          </div>
          <h1>
            {greeting()}
            {firstName ? `, ${firstName}.` : '.'}
            <br />
            <span className="soft">Here's Aurlynn today.</span>
          </h1>
          <p className="lead">Customers, plans, voice traffic and your team — across every market you serve.</p>
        </div>
        <div className="ov-hero-actions">
          {can('customer.read') && (
            <Button variant="primary" icon={<Building2 />} onClick={() => navigate('/admin/customers')}>
              All customers
            </Button>
          )}
          <Button icon={<PackageIcon />} onClick={() => navigate('/admin/packages')}>
            Plans
          </Button>
        </div>
      </section>

      <div className="stack">
        <PlatformActivity customers={asList(customers.data)} />
        {can('customer.read') && (
          <Async state={customers} skeleton={<Skeleton h={420} />}>
            {(data) => <CustomerSection data={data} numbers={asList(numbers.data)} packages={asList(packages.data)} staff={staff.data} />}
          </Async>
        )}
        <div className="grid-2" style={{ alignItems: 'start' }}>
          <PlansCard state={packages} />
          {can('staff.manage') && <StaffCard state={staff} />}
        </div>
      </div>
    </>
  );
}

export function Kpi({ icon: Icon, label, value, hint, tone, onClick }) {
  return (
    <div className={`card kpi ${onClick ? 'clickable' : ''}`} onClick={onClick}>
      <div className="kpi-top">
        <span className={`kpi-icon ${tone ?? ''}`}>
          <Icon />
        </span>
        {onClick && <ArrowRight className="kpi-go" />}
      </div>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

function CustomerSection({ data, numbers, packages, staff }) {
  const navigate = useNavigate();
  const list = asList(data);
  const total = listTotal(data) ?? list.length;
  const count = (status) => list.filter((t) => (t.status ?? '').toLowerCase() === status).length;

  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => new Date(now.getFullYear(), now.getMonth() - 5 + i, 1));
  const perMonth = new Map(months.map((m) => [monthKey(m), 0]));
  list.forEach((t) => {
    const d = new Date(t.created_at);
    const k = monthKey(d);
    if (!Number.isNaN(d.getTime()) && perMonth.has(k)) perMonth.set(k, perMonth.get(k) + 1);
  });

  const statuses = Object.keys(STATUS_COLOR)
    .map((s) => ({ key: s, label: titleCase(s), value: count(s), color: STATUS_COLOR[s] }))
    .filter((p) => p.value > 0);
  const latest = [...list].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5);
  const onSale = packages.filter(isOnSale);
  const suspended = count('suspended');
  const thisMonth = perMonth.get(monthKey(months[5]));
  const lastMonth = perMonth.get(monthKey(months[4]));

  return (
    <>
      <div className="grid-3 kpi-row">
        <Kpi icon={Building2} label="Customers" value={number(total)} hint={`${number(count('active'))} active`} onClick={() => navigate('/admin/customers')} />
        <Kpi icon={Sparkles} tone="blue" label="On trial" value={number(count('trial'))} hint={suspended ? `${number(suspended)} suspended` : 'None suspended'} />
        <Kpi
          icon={UserPlus}
          tone="green"
          label="New this month"
          value={number(thisMonth)}
          hint={lastMonth ? `${thisMonth >= lastMonth ? '▲' : '▼'} vs ${number(lastMonth)} last month` : `${number(lastMonth)} last month`}
        />
        {staff !== undefined ? (
          <Kpi icon={Users} label="Platform staff" value={number(asList(staff).length)} hint={`${number(onSale.length)} plans on sale`} />
        ) : (
          <Kpi icon={PackageIcon} label="Plans on sale" value={number(onSale.length)} hint={`${number(onSale.filter((p) => p.is_public === false).length)} hidden`} />
        )}
      </div>

      <CustomerMap list={list} numbers={numbers} total={total} />

      <div className="grid-2" style={{ '--grid-cols': 'minmax(0, 1.4fr) minmax(0, 1fr)', alignItems: 'stretch' }}>
        <div className="card card-pad">
          <div className="row between" style={{ marginBottom: 16 }}>
            <div>
              <div className="card-title">New customers per month</div>
              <div className="card-sub">Last six months</div>
            </div>
            <span className="ov-big mono">{number([...perMonth.values()].reduce((s, v) => s + v, 0))}</span>
          </div>
          <HBars
            color="var(--accent)"
            rows={months.map((m) => ({
              label: m.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }),
              value: perMonth.get(monthKey(m)),
            }))}
          />
        </div>
        <div className="card card-pad">
          <div className="card-title">Customers by status</div>
          <div className="card-sub" style={{ marginBottom: 16 }}>
            {total > list.length ? `First ${number(list.length)} of ${number(total)}` : `All ${number(list.length)} customers`}
          </div>
          {statuses.length ? (
            <>
              <ShareBar parts={statuses} />
              <div className="ov-status-list">
                {statuses.map((s) => (
                  <div key={s.key}>
                    <i style={{ background: s.color }} />
                    <span className="grow">{s.label}</span>
                    <span className="mono">{number(s.value)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="muted">No customers yet.</div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>Newest customers</h2>
            <div className="card-sub">The five most recent sign-ups</div>
          </div>
          <Button size="sm" variant="ghost" onClick={() => navigate('/admin/customers')}>
            View all <ArrowRight />
          </Button>
        </div>
        {latest.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Slug</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {latest.map((t) => (
                  <tr key={t.id} className="clickable" onClick={() => navigate(`/admin/customers/${t.id}`)}>
                    <td>
                      <div className="row">
                        <span className="avatar sm soft">{t.name.slice(0, 1).toUpperCase()}</span>
                        <span className="cell-main">{t.name}</span>
                      </div>
                    </td>
                    <td className="mono muted">{t.slug}</td>
                    <td>
                      <StatusBadge status={t.status} />
                    </td>
                    <td className="muted">{date(t.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={<Building2 />} title="No customers yet" description="Create the first company from the Customers page." />
        )}
      </div>
    </>
  );
}

function CustomerMap({ list, numbers, total }) {
  const navigate = useNavigate();
  const [selected, setSelected] = useState(null);

  const { byCountry, unplaced } = useMemo(() => {
    const numbersByTenant = new Map();
    numbers.forEach((n) => {
      if (!n.tenant_id || !n.country) return;
      const m = numbersByTenant.get(n.tenant_id) ?? new Map();
      const c = String(n.country).toUpperCase();
      m.set(c, (m.get(c) ?? 0) + 1);
      numbersByTenant.set(n.tenant_id, m);
    });
    const groups = new Map();
    let missing = 0;
    list.forEach((t) => {
      const c = customerCountry(t, numbersByTenant);
      if (!c) return void missing++;
      groups.set(c, [...(groups.get(c) ?? []), t]);
    });
    return {
      byCountry: [...groups.entries()].map(([code, customers]) => ({ code, count: customers.length, customers })).sort((a, b) => b.count - a.count),
      unplaced: missing,
    };
  }, [list, numbers]);

  const placed = list.length - unplaced;
  const top = byCountry[0];
  const pick = byCountry.find((c) => c.code === selected);
  const max = Math.max(1, ...byCountry.map((c) => c.count));

  return (
    <div className="geo-card">
      <div className="geo-head">
        <div>
          <div className="eyebrow">
            <Globe2 /> Customer footprint
          </div>
          <h2>
            {byCountry.length ? (
              <>
                {number(placed)} {placed === 1 ? 'customer' : 'customers'} in <b>{number(byCountry.length)}</b> {byCountry.length === 1 ? 'country' : 'countries'}
              </>
            ) : (
              'Where your customers are'
            )}
          </h2>
        </div>
        <div className="geo-stats">
          <div>
            <span>Largest market</span>
            <b>{top ? countryName(top.code) : '—'}</b>
          </div>
          <div>
            <span>Share</span>
            <b>{top && placed ? `${Math.round((top.count / placed) * 100)}%` : '—'}</b>
          </div>
          <div>
            <span>No location</span>
            <b>{number(unplaced)}</b>
          </div>
        </div>
      </div>

      <div className="geo-body">
        <div className="geo-map">
          <WorldMap points={byCountry} selected={selected} onSelect={setSelected} />
          {!byCountry.length && (
            <div className="geo-empty">
              No locations yet. A customer appears here once they have a phone number allocated or a default locale set.
            </div>
          )}
        </div>

        <aside className="geo-side">
          {pick ? (
            <>
              <div className="row between">
                <div>
                  <div className="geo-side-title">{countryName(pick.code)}</div>
                  <div className="geo-side-sub">
                    {number(pick.count)} {pick.count === 1 ? 'customer' : 'customers'}
                  </div>
                </div>
                <button className="geo-link" onClick={() => setSelected(null)}>
                  All countries
                </button>
              </div>
              <div className="geo-list">
                {pick.customers.slice(0, 8).map((t) => (
                  <button key={t.id} className="geo-row" onClick={() => navigate(`/admin/customers/${t.id}`)}>
                    <span className="avatar sm">{t.name.slice(0, 1).toUpperCase()}</span>
                    <span className="grow ellipsis">{t.name}</span>
                    <StatusBadge status={t.status} />
                  </button>
                ))}
                {pick.count > 8 && <div className="geo-side-sub">+{number(pick.count - 8)} more</div>}
              </div>
            </>
          ) : (
            <>
              <div className="geo-side-title">Top countries</div>
              <div className="geo-side-sub">Select one to see its customers</div>
              <div className="geo-list">
                {byCountry.slice(0, 7).map((c) => (
                  <button key={c.code} className="geo-row country" onClick={() => setSelected(c.code)}>
                    <span className="geo-code mono">{c.code}</span>
                    <span className="grow">
                      <span className="row between">
                        <span className="ellipsis">{countryName(c.code)}</span>
                        <span className="mono">{number(c.count)}</span>
                      </span>
                      <span className="geo-bar">
                        <span style={{ width: `${(c.count / max) * 100}%` }} />
                      </span>
                    </span>
                  </button>
                ))}
                {!byCountry.length && <div className="geo-side-sub">Nothing to rank yet.</div>}
                {byCountry.some((c) => !COUNTRY_CENTER[c.code]) && <div className="geo-side-sub">Some countries are listed but not pinned on the map.</div>}
              </div>
            </>
          )}
        </aside>
      </div>
      {total > list.length && <div className="geo-foot">Mapped from the first {number(list.length)} customers.</div>}
    </div>
  );
}

function PlansCard({ state }) {
  const navigate = useNavigate();
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Plans on sale</h2>
          <div className="card-sub">What new customers can buy</div>
        </div>
        <Button size="sm" variant="ghost" onClick={() => navigate('/admin/packages')}>
          Manage
        </Button>
      </div>
      <Async state={state}>
        {(data) => {
          const rows = asList(data).filter(isOnSale);
          return rows.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Plan</th>
                    <th className="num">Price</th>
                    <th className="num">Minutes</th>
                    <th>Visibility</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.id}>
                      <td className="cell-main">{p.name}</td>
                      <td className="num">
                        {money(p.price_amount, p.currency)}
                        {p.billing_cycle && <span className="muted small"> / {titleCase(p.billing_cycle)}</span>}
                      </td>
                      <td className="num">{number(p.included_call_minutes)}</td>
                      <td>{p.is_public === false ? <Badge>Hidden</Badge> : <Badge tone="green">Public</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No plans on sale" description="Create one on the Plans page." />
          );
        }}
      </Async>
    </div>
  );
}

function StaffCard({ state }) {
  const navigate = useNavigate();
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Platform staff</h2>
          <div className="card-sub">People who run Aurlynn</div>
        </div>
        <Button size="sm" variant="ghost" onClick={() => navigate('/admin/staff')}>
          Manage
        </Button>
      </div>
      <Async state={state}>
        {(data) => {
          const rows = asList(data);
          return rows.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Roles</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 6).map((x) => (
                    <tr key={x.id}>
                      <td>
                        <div className="row">
                          <span className="avatar sm soft">{(x.name ?? '?').slice(0, 1).toUpperCase()}</span>
                          <div>
                            <div className="cell-main">{x.name}</div>
                            {x.email && <div className="cell-sub">{x.email}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="muted">{(x.roles ?? []).map(roleLabel).join(', ') || '—'}</td>
                      <td>
                        <StatusBadge status={x.status ?? 'active'} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No staff yet" />
          );
        }}
      </Async>
    </div>
  );
}

const RANGES = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
];

/** Change versus the previous period, e.g. "▲ 12% vs previous period". */
function delta(now, before) {
  if (!before) return now ? 'No calls in the previous period' : undefined;
  const d = ((now - before) / before) * 100;
  return `${d >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(d))}% vs previous period`;
}

function PlatformActivity({ customers }) {
  const navigate = useNavigate();
  const [days, setDays] = useState('7');
  // Whole days so the request (and its cache entry) stays stable while you browse.
  const from = useMemo(() => {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - Number(days));
    return d.toISOString();
  }, [days]);
  const overview = useGetPlatformOverviewQuery({ from });
  const names = useMemo(() => new Map(customers.map((c) => [c.id, c.name])), [customers]);
  const s = overview.data?.summary;
  if (overview.error) {
    return (
      <div className="banner info">
        <span className="grow">Call figures aren't available right now: {overview.error.message}</span>
      </div>
    );
  }
  if (!s) return <Skeleton h={120} style={{ borderRadius: 18 }} />;
  const prev = s.previous_period;
  const points = (overview.data.points ?? []).map((p) => ({ ...p, day: (p.bucket ?? '').slice(0, 10) }));
  const top = overview.data.top_customers ?? [];
  const outcomes = s.top_outcomes ?? [];
  const callsDelta = delta(s.total_calls, prev?.total_calls);
  return (
    <>
      <div className="row between wrap" style={{ gap: 8 }}>
        <div>
          <div className="card-title">Voice traffic</div>
          <div className="card-sub">Every customer, every agent</div>
        </div>
        <SegmentTabs value={days} onChange={setDays} items={RANGES} />
      </div>
      <div className="grid-3 kpi-row">
        <Kpi
          icon={PhoneCall}
          label="Calls"
          value={number(s.total_calls)}
          hint={`${number(s.inbound_calls)} inbound · ${number(s.outbound_calls)} outbound${callsDelta ? ` · ${callsDelta}` : ''}`}
        />
        <Kpi icon={Clock3} tone="blue" label="Minutes" value={number(s.total_minutes)} hint={delta(s.total_minutes, prev?.total_minutes)} />
        <Kpi
          icon={CheckCircle2}
          tone="green"
          label="Success rate"
          value={percent(s.success_rate)}
          hint={`${number(s.successful_calls)} of ${number(s.answered_calls)} answered · ${number(s.transferred_calls)} transferred`}
        />
        <Kpi
          icon={Building2}
          label="Active customers"
          value={number(overview.data.active_customers)}
          hint={`Cost ${money(s.total_cost)} · avg call ${number(s.avg_duration_seconds)} s`}
        />
      </div>
      {points.length > 0 && (
        <div className="card card-pad">
          <div className="card-title">Calls per day</div>
          <div className="card-sub" style={{ marginBottom: 14 }}>
            All calls and the successful ones
          </div>
          <TimeChart
            data={points}
            x="day"
            series={[
              { key: 'calls', label: 'Calls' },
              { key: 'successful_calls', label: 'Successful' },
            ]}
          />
        </div>
      )}
      <div className="grid-2" style={{ alignItems: 'start' }}>
        {top.length > 0 && (
          <div className="card">
            <div className="card-head">
              <div>
                <h2>Top customers</h2>
                <div className="card-sub">Ranked by calls in this period</div>
              </div>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th className="num">Calls</th>
                    <th className="num">Successful</th>
                    <th className="num">Minutes</th>
                  </tr>
                </thead>
                <tbody>
                  {top.map((r) => (
                    <tr key={r.tenant_id} className="clickable" onClick={() => navigate(`/admin/customers/${r.tenant_id}`)}>
                      <td className="cell-main">{names.get(r.tenant_id) ?? `${r.tenant_id.slice(0, 8)}…`}</td>
                      <td className="num">{number(r.calls)}</td>
                      <td className="num">{number(r.successful_calls)}</td>
                      <td className="num">{number(r.minutes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {outcomes.length > 0 && (
          <div className="card card-pad">
            <div className="card-title">What calls ended in</div>
            <div className="card-sub" style={{ marginBottom: 16 }}>
              Top outcomes
            </div>
            <HBars color="var(--accent)" rows={outcomes.map((o) => ({ label: titleCase(o.outcome), value: o.calls }))} />
          </div>
        )}
      </div>
    </>
  );
}
