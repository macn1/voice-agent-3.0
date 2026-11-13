import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Cable,
  CalendarDays,
  Check,
  Clock,
  Cloud,
  Link2,
  Phone,
  PhoneCall,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  Unlink,
} from 'lucide-react';
import {
  useAddConnectionMutation,
  useAssignNumberAgentMutation,
  useGetNumberQuery,
  useGetRoutingQuery,
  useDeleteConnectionMutation,
  useListConnectionsQuery,
  useTestConnectionMutation,
  useListHolidaysQuery,
  useListNumbersQuery,
  usePurchaseNumberMutation,
  usePutHolidaysMutation,
  usePutRoutingMutation,
  useSearchAvailableNumbersQuery,
  useSimulateRoutingMutation,
  useUnassignNumberAgentMutation,
} from '../../../store/api/callsApi';
import { date, dateTime, money, titleCase } from '../../../lib/format';
import {
  Async,
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  errMsg,
  Field,
  Input,
  Modal,
  PageHeader,
  SegmentTabs,
  StatusBadge,
  Toggle,
  useToast,
} from '../../../components/ui';
import { SectionCard, Select, Textarea, useSection } from '../../../components/forms';
import { useAgentOptions } from '../shared';
import { useGetAnalyticsQuery } from '../../../store/api/analyticsApi';

// Telephony providers shown on "Bring your own telephony". Each logo is read from
// public/providers/<key>.png; if that file is missing the fallback icon is shown,
// so adding an official logo later needs no code change.
const PROVIDERS = [
  { key: 'exotel', name: 'Exotel' },
  { key: 'smartflo', name: 'Smartflo', fallback: Cloud },
  { key: 'pulse', name: 'Pulse', fallback: Activity },
  { key: 'intalk', name: 'InTalk' },
  { key: 'vobiz', name: 'Vobiz' },
  { key: 'twilio', name: 'Twilio' },
  { key: 'plivo', name: 'Plivo' },
];

function ProviderChip({ provider }) {
  const [missing, setMissing] = useState(false);
  const Fallback = provider.fallback ?? Phone;
  return (
    <span className="provider-chip">
      {missing ? <Fallback aria-hidden /> : <img src={`/providers/${provider.key}.png`} alt="" aria-hidden="true" onError={() => setMissing(true)} />}
      {provider.name}
    </span>
  );
}

/** P-14 Phone numbers (NUM-01, EXT-01). */
export function NumbersPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const list = useListNumbersQuery();
  const usage = useGetAnalyticsQuery({ report: 'phone-numbers', range: '7d' });
  // The report is keyed by the number itself (E.164).
  const calls7d = Object.fromEntries((Array.isArray(usage.data) ? usage.data : []).map((r) => [r.number, r.calls]));
  const [assignAgent] = useAssignNumberAgentMutation();
  const [unassignAgent] = useUnassignNumberAgentMutation();
  const { options: agentOptions, agents } = useAgentOptions();
  const [assigning, setAssigning] = useState(null);
  const [agentId, setAgentId] = useState('');
  const [unassigning, setUnassigning] = useState(null);
  const [buying, setBuying] = useState(false);
  const [tab, setTab] = useState('numbers');
  const manageRef = useRef(null);
  // "Connect" opens the carrier tab, then scrolls once it has rendered (scrolling
  // first gets cancelled when the tab swap changes the page height).
  const [scrollToManage, setScrollToManage] = useState(false);
  useEffect(() => {
    if (!scrollToManage) return;
    manageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setScrollToManage(false);
  }, [scrollToManage, tab]);

  return (
    <>
      <section className="page-hero">
        <h1>Take your agent live</h1>
        <div className="option-grid">
          <article className="option-card">
            <span className="clay warm" aria-hidden>
              <PhoneCall />
            </span>
            <h2>Rent from Aurlynn</h2>
            <p>Aurlynn provisions and manages the phone numbers for you, end to end.</p>
            <ul className="check-list">
              <li>
                <Check /> Add or release numbers anytime
              </li>
              <li>
                <Check /> Search and buy numbers right here, in India and abroad
              </li>
              <li>
                <Check /> Fully managed telephony — nothing to set up
              </li>
            </ul>
            <p className="small muted option-meta">
              Priced per number, per month ·{' '}
              <Link to="/settings/plan" className="login-link">
                View plans
              </Link>
            </p>
            <div className="option-foot">
              <Button variant="primary" onClick={() => setBuying(true)}>
                Get started <ArrowRight />
              </Button>
            </div>
          </article>

          <article className="option-card">
            <span className="clay" aria-hidden>
              <Cable />
            </span>
            <h2>Bring your own telephony</h2>
            <p>Connect a telephony provider you already use and import your phone numbers.</p>
            <ul className="check-list">
              <li>
                <Check /> Works with {PROVIDERS.length} leading providers
              </li>
              <li>
                <Check /> Integrate your existing telephony instantly
              </li>
              <li>
                <Check /> Keep your current numbers and rates
              </li>
            </ul>
            <div className="provider-chips">
              {PROVIDERS.map((p) => (
                <ProviderChip key={p.key} provider={p} />
              ))}
            </div>
            <div className="option-foot">
              <Button
                onClick={() => {
                  setTab('carrier');
                  setScrollToManage(true);
                }}
              >
                Connect <ArrowRight />
              </Button>
            </div>
          </article>
        </div>
      </section>

      <section className="page-section" ref={manageRef}>
        <div className="page-section-head">
          <div>
            <h2 className="text-subheading">Your numbers</h2>
            <p className="muted small">Numbers allocated to your company, and the agent that answers each one.</p>
          </div>
          <Button icon={<ShoppingCart />} onClick={() => setBuying(true)}>
            Get a number
          </Button>
        </div>

        <SegmentTabs
          value={tab}
          onChange={setTab}
          items={[
            { value: 'numbers', label: 'Numbers' },
            { value: 'holidays', label: 'Holidays' },
            { value: 'carrier', label: 'Own carrier / SIP' },
          ]}
        />

        {tab === 'numbers' && (
          <div className="card">
            <Async state={list}>
              {(nums) =>
                nums.length ? (
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Number</th>
                          <th>Answered by</th>
                          <th className="num">Calls (7d)</th>
                          <th>Since</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {nums.map((n) => {
                          const agent = agents.find((a) => a.id === n.agent_id);
                          const unpublished = n.agent_id && (n.agent_published === false || (agent && !agent.published_version));
                          return (
                            <tr key={n.id}>
                              <td>
                                <div className="cell-main mono">{n.e164}</div>
                                <div className="cell-sub">
                                  {n.country} · {[n.capabilities?.voice && 'Voice', n.capabilities?.sms && 'SMS'].filter(Boolean).join(' + ') || 'Voice'}
                                </div>
                              </td>
                              <td>
                                {n.agent_id ? (
                                  <>
                                    <Link to={`/agents/${n.agent_id}`} className="cell-main">
                                      {n.agent_name ?? agent?.name ?? n.agent_id}
                                    </Link>
                                    {unpublished && (
                                      <div className="cell-sub row" style={{ color: 'var(--amber)', gap: 4 }}>
                                        <AlertTriangle size={13} /> Agent has no published version — calls won't be answered
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <span className="muted">Not assigned</span>
                                )}
                              </td>
                              <td className="num">{calls7d[n.e164] ?? 0}</td>
                              <td className="muted">{date(n.allocated_at || n.created_at)}</td>
                              <td className="actions">
                                <Button size="sm" variant="ghost" icon={<Clock />} onClick={() => navigate(`/numbers/${n.id}`)}>
                                  Routing
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  icon={<Link2 />}
                                  onClick={() => {
                                    setAssigning(n);
                                    setAgentId(n.agent_id ?? '');
                                  }}
                                >
                                  {n.agent_id ? 'Change' : 'Assign'}
                                </Button>
                                {n.agent_id && <Button size="sm" variant="ghost" icon={<Unlink />} title="Remove agent" onClick={() => setUnassigning(n)} />}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState
                    icon={<Phone />}
                    title="No numbers yet"
                    description="Ask Aurlynn for a number, buy one, or connect your own carrier."
                    action={<Button onClick={() => setBuying(true)}>Get a number</Button>}
                  />
                )
              }
            </Async>
          </div>
        )}
        {tab === 'holidays' && <HolidaysCard />}
        {tab === 'carrier' && <CarrierCard />}
      </section>

      <Modal
        open={!!assigning}
        onClose={() => setAssigning(null)}
        title={`Who answers ${assigning?.e164}?`}
        footer={
          <>
            <Button onClick={() => setAssigning(null)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!agentId}
              onClick={async () => {
                try {
                  await assignAgent({ id: assigning.id, agent_id: agentId }).unwrap();
                  toast('Agent assigned');
                  setAssigning(null);
                } catch (e) {
                  toast(errMsg(e), 'error');
                }
              }}
            >
              Assign
            </Button>
          </>
        }
      >
        <Field label="Agent" hint="Calls use the agent's published version.">
          <Select value={agentId} options={agentOptions} placeholder="Choose an agent" onChange={(e) => setAgentId(e.target.value)} />
        </Field>
      </Modal>
      <ConfirmDialog
        open={!!unassigning}
        onClose={() => setUnassigning(null)}
        danger
        title={`Remove the agent from ${unassigning?.e164}?`}
        description="Calls to this number won't be answered until you assign another agent."
        confirmLabel="Remove"
        onConfirm={async () => {
          await unassignAgent(unassigning.id).unwrap();
        }}
      />

      <BuyNumberModal open={buying} onClose={() => setBuying(false)} onBought={() => {}} />
    </>
  );
}

const AREA_CODES = [
  { value: '80', label: 'Bengaluru (80)' },
  { value: '11', label: 'Delhi (11)' },
  { value: '22', label: 'Mumbai (22)' },
  { value: '20', label: 'Pune (20)' },
  { value: '40', label: 'Hyderabad (40)' },
  { value: '44', label: 'Chennai (44)' },
  { value: '33', label: 'Kolkata (33)' },
  { value: '79', label: 'Ahmedabad (79)' },
];

function BuyNumberModal({ open, onClose, onBought }) {
  const toast = useToast();
  const [type, setType] = useState('local');
  const [areaCode, setAreaCode] = useState('80');
  const [contains, setContains] = useState('');
  // The number picked to buy, waiting for the person to confirm the price.
  const [pick, setPick] = useState(null);
  // Search runs when the button is pressed; `at` makes each press a fresh query.
  const [search, setSearch] = useState(null);
  const results = useSearchAvailableNumbersQuery(search ?? {}, { skip: !open || !search });
  const [purchaseNumber] = usePurchaseNumberMutation();
  return (
    <Modal open={open} onClose={onClose} wide title="Get a phone number" description="Search available numbers and buy one instantly.">
      <div className="stack">
        <div className="row wrap">
          <Select
            style={{ width: 160 }}
            value={type}
            options={[
              { value: 'local', label: 'Local' },
              { value: 'mobile', label: 'Mobile' },
              { value: 'toll_free', label: 'Toll-free' },
            ]}
            onChange={(e) => setType(e.target.value)}
          />
          {type === 'local' && <Select style={{ width: 180 }} value={areaCode} options={AREA_CODES} onChange={(e) => setAreaCode(e.target.value)} />}
          <Input style={{ flex: 1, minWidth: 160 }} placeholder="Contains digits (optional)" value={contains} onChange={(e) => setContains(e.target.value)} />
          <Button icon={<Search />} onClick={() => setSearch({ type, area_code: type === 'local' ? areaCode : undefined, contains: contains || undefined, at: Date.now() })}>
            Search
          </Button>
        </div>
        {search && (
          <Async state={results}>
            {(r) =>
              r?.items?.length ? (
                <div className="table-wrap">
                  <table className="table">
                    <tbody>
                      {r.items.map((n) => (
                        <tr key={n.e164}>
                          <td className="mono cell-main">{n.e164}</td>
                          <td className="muted">{[n.locality, n.capabilities?.voice && 'Voice', n.capabilities?.sms && 'SMS'].filter(Boolean).join(' · ')}</td>
                          <td className="num">
                            {money(n.monthly_price, n.currency ?? 'INR')}
                            /mo
                          </td>
                          <td className="actions">
                            <Button size="sm" variant="primary" onClick={() => setPick(n)}>
                              Buy
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState title="No numbers found" description="Try another area or fewer digits." />
              )
            }
          </Async>
        )}
      </div>
      <ConfirmDialog
        open={!!pick}
        onClose={() => setPick(null)}
        title={pick ? `Buy ${pick.e164}?` : 'Buy this number?'}
        description={
          pick
            ? `It costs ${money(pick.monthly_price, pick.currency ?? 'INR')} a month until you release it. It is added to your account right away.`
            : undefined
        }
        confirmLabel={pick ? `Buy for ${money(pick.monthly_price, pick.currency ?? 'INR')}/mo` : 'Buy'}
        onConfirm={async () => {
          try {
            await purchaseNumber(pick.e164).unwrap();
          } catch (e) {
            throw e?.status === 409 ? 'Someone just took that number. Pick another one.' : e;
          }
          toast(`${pick.e164} is yours`);
          onBought();
          onClose();
        }}
      />
    </Modal>
  );
}

function HolidaysCard() {
  const s = useSection(useListHolidaysQuery(), usePutHolidaysMutation(), (v) => v.map(({ date: d, name }) => ({ date: d, name })));
  return (
    <SectionCard title="Holidays" description="On these dates every number uses its after-hours behaviour." section={s}>
      {(hs, _p, set) => (
        <>
          {hs.map((h, i) => (
            <div key={h.id ?? i} className="row" style={{ gap: 8 }}>
              <input
                type="date"
                className="input"
                style={{ width: 180 }}
                value={h.date}
                onChange={(e) => set(hs.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))}
              />
              <input
                className="input"
                placeholder="Name"
                value={h.name}
                onChange={(e) => set(hs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
              />
              <Button size="sm" variant="ghost" icon={<Trash2 />} onClick={() => set(hs.filter((_, j) => j !== i))} />
            </div>
          ))}
          <div>
            <Button
              size="sm"
              variant="ghost"
              icon={<CalendarDays />}
              onClick={() =>
                set([
                  ...hs,
                  {
                    id: '',
                    date: new Date().toISOString().slice(0, 10),
                    name: '',
                  },
                ])
              }
            >
              Add holiday
            </Button>
          </div>
        </>
      )}
    </SectionCard>
  );
}

const CARRIERS = [
  { value: 'sip_trunk', label: 'SIP trunk' },
  { value: 'twilio', label: 'Twilio' },
  { value: 'plivo', label: 'Plivo' },
  { value: 'exotel', label: 'Exotel' },
];

function CarrierCard() {
  const toast = useToast();
  const conns = useListConnectionsQuery();
  const [addConnection] = useAddConnectionMutation();
  const [testConnection] = useTestConnectionMutation();
  const [deleteConnection] = useDeleteConnectionMutation();
  const [type, setType] = useState('sip_trunk');
  const [fields, setFields] = useState({});
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(null);
  const set = (k, v) => setFields((f) => ({ ...f, [k]: v }));
  const sip = type === 'sip_trunk';
  return (
    <div className="stack">
      <div className="card">
        <div className="card-head">
          <h2>Connections</h2>
        </div>
        <Async state={conns}>
          {(list) =>
            list.length ? (
              <div className="table-wrap">
                <table className="table">
                  <tbody>
                    {list.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <div className="cell-main">{c.name}</div>
                          <div className="cell-sub">
                            {c.type === 'sip_trunk' ? `SIP trunk · ${c.config?.host ?? ''}` : titleCase(c.type)}
                            {c.config?.numbers?.length ? ` · ${c.config.numbers.length} number${c.config.numbers.length === 1 ? '' : 's'}` : ''}
                          </div>
                        </td>
                        <td>
                          <StatusBadge status={c.status} />
                          {c.last_error && (
                            <div className="cell-sub" style={{ color: 'var(--red)' }}>
                              {c.last_error}
                            </div>
                          )}
                        </td>
                        <td className="muted">{c.last_checked_at ? `Checked ${dateTime(c.last_checked_at)}` : dateTime(c.created_at)}</td>
                        <td className="actions">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              testConnection(c.id)
                                .unwrap()
                                .then((r) => toast(r.status === 'active' ? 'Connection works' : `Connection check: ${r.status}`, r.status === 'active' ? undefined : 'error'))
                                .catch((e) => toast(errMsg(e), 'error'))
                            }
                          >
                            Test
                          </Button>
                          <Button size="sm" variant="ghost" icon={<Trash2 />} onClick={() => setRemoving(c)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="Using Aurlynn's carrier" description="Connect your own carrier account or SIP trunk to bring your numbers." />
            )
          }
        </Async>
      </div>
      <div className="card card-pad stack">
        <div className="card-title">Connect your own</div>
        <SegmentTabs value={type} onChange={setType} items={CARRIERS} />

        <div className="form-grid">
          <Field label="Name" className="full">
            <Input placeholder="Office PBX" value={fields.name ?? ''} onChange={(e) => set('name', e.target.value)} />
          </Field>
          {sip ? (
            <>
              <Field label="SIP host" hint="A public address">
                <Input className="mono" placeholder="sip.example.com" value={fields.host ?? ''} onChange={(e) => set('host', e.target.value)} />
              </Field>
              <Field label="Port">
                <Input type="number" placeholder="5060" value={fields.port ?? ''} onChange={(e) => set('port', e.target.value)} />
              </Field>
              <Field label="Username">
                <Input value={fields.username ?? ''} onChange={(e) => set('username', e.target.value)} />
              </Field>
              <Field label="Password">
                <Input type="password" value={fields.password ?? ''} onChange={(e) => set('password', e.target.value)} />
              </Field>
            </>
          ) : (
            <>
              <Field label="Account SID / ID">
                <Input value={fields.account_sid ?? ''} onChange={(e) => set('account_sid', e.target.value)} />
              </Field>
              <Field label="Auth token">
                <Input type="password" value={fields.auth_token ?? ''} onChange={(e) => set('auth_token', e.target.value)} />
              </Field>
            </>
          )}
          <Field label="Numbers to bring" hint="Comma-separated, international format (optional)" className="full">
            <Input className="mono" placeholder="+918044440000, +918044440001" value={fields.numbers ?? ''} onChange={(e) => set('numbers', e.target.value)} />
          </Field>
        </div>
        <p className="muted small" style={{ margin: 0 }}>
          Secrets are stored encrypted and never shown again. The connection check is simulated for now.
        </p>
        <div>
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const body = sip
                  ? { host: fields.host ?? '', ...(fields.port ? { port: Number(fields.port) } : {}), transport: 'udp', username: fields.username ?? '', password: fields.password ?? '' }
                  : { account_sid: fields.account_sid ?? '', auth_token: fields.auth_token ?? '' };
                await addConnection({
                  name: fields.name?.trim() || CARRIERS.find((c) => c.value === type).label,
                  type,
                  ...body,
                  numbers: (fields.numbers ?? '').split(/[,\s]+/).filter(Boolean),
                }).unwrap();
                toast('Connection added');
                setFields({});
              } catch (e) {
                toast(errMsg(e), 'error');
              } finally {
                setBusy(false);
              }
            }}
          >
            Connect
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        danger
        title={`Remove ${removing?.name ?? 'this connection'}?`}
        description="Numbers that came with it stop working here."
        confirmLabel="Remove"
        onConfirm={async () => {
          await deleteConnection(removing.id).unwrap();
          toast('Connection removed');
        }}
      />
    </div>
  );
}

/** P-15 Number routing (NUM-02). */
export function NumberRoutingPage() {
  const { id = '' } = useParams();
  const nums = useListNumbersQuery();
  const num = nums.data?.find((n) => n.id === id);
  const single = useGetNumberQuery(id, { skip: !id || !!num });
  const current = num ?? single.data;
  const routing = useSection(useGetRoutingQuery(id), usePutRoutingMutation(), (body) => ({ id, body }));
  const [simulate, { isLoading: simBusy }] = useSimulateRoutingMutation();
  const { options } = useAgentOptions();
  const [sim, setSim] = useState(null);
  const [simAt, setSimAt] = useState('');
  const toast = useToast();
  const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

  return (
    <>
      <Link to="/numbers" className="back-link">
        <ArrowLeft /> Phone numbers
      </Link>
      <PageHeader
        eyebrow="Routing"
        title={current?.e164 ?? 'Number routing'}
        description="Business hours, what happens after hours, and the fallback if the agent can't take the call."
      />
      <div className="stack">
        <div className="card card-pad stack">
          <div className="card-title">What happens if someone calls…</div>
          <div className="row wrap">
            <input type="datetime-local" className="input" style={{ width: 240 }} value={simAt} onChange={(e) => setSimAt(e.target.value)} />
            <Button
              loading={simBusy}
              onClick={async () => {
                try {
                  setSim(await simulate({ id, at: simAt ? new Date(simAt).toISOString() : undefined }).unwrap());
                } catch (e) {
                  toast(errMsg(e), 'error');
                }
              }}
            >
              {simAt ? 'Check this time' : 'Check right now'}
            </Button>
          </div>
          {sim && (
            <div className="banner info" style={{ margin: 0 }}>
              <span className="grow">
                <b>{sim.outcome}</b>
                {sim.agent_name ? ` (${sim.agent_name})` : ''} — {sim.detail} · local time {sim.local_time}
              </span>
            </div>
          )}
        </div>
        <SectionCard title="Routing rules" section={routing}>
          {(r, patch) => (
            <>
              <Field label="Time zone">
                <Select
                  value={r.timezone}
                  options={[...new Set([r.timezone, 'Asia/Kolkata', 'Asia/Dubai', 'Europe/London', 'America/New_York', 'UTC'])]}
                  onChange={(e) => patch({ timezone: e.target.value })}
                />
              </Field>
              <Toggle
                checked={r.always_open}
                onChange={(v) => patch({ always_open: v })}
                label="Open around the clock"
                description="The agent answers at any time. Turn off to set business hours; calls outside them follow the after-hours rule."
              />
              <div style={r.always_open ? { display: 'none' } : undefined}>
                <span className="field-label">Business hours</span>
                <div className="stack" style={{ gap: 8, marginTop: 8 }}>
                  {days.map((d) => {
                    const h = r.business_hours[d] ?? {
                      open: false,
                      ranges: [],
                    };
                    const setDay = (x) =>
                      patch({
                        business_hours: { ...r.business_hours, [d]: x },
                      });
                    return (
                      <div key={d} className="row wrap" style={{ gap: 10 }}>
                        <span className="fw-medium" style={{ width: 44, textTransform: 'capitalize' }}>
                          {d}
                        </span>
                        <label className="check" style={{ width: 80 }}>
                          <input
                            type="checkbox"
                            checked={h.open}
                            onChange={(e) =>
                              setDay({
                                open: e.target.checked,
                                ranges: h.ranges.length ? h.ranges : [{ from: '09:00', to: '18:00' }],
                              })
                            }
                          />
                          Open
                        </label>
                        {h.open &&
                          h.ranges.map((rg, i) => (
                            <span key={i} className="row" style={{ gap: 6 }}>
                              <input
                                type="time"
                                className="input"
                                style={{ width: 120, height: 38 }}
                                value={rg.from}
                                onChange={(e) =>
                                  setDay({
                                    ...h,
                                    ranges: h.ranges.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)),
                                  })
                                }
                              />
                              –
                              <input
                                type="time"
                                className="input"
                                style={{ width: 120, height: 38 }}
                                value={rg.to}
                                onChange={(e) =>
                                  setDay({
                                    ...h,
                                    ranges: h.ranges.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)),
                                  })
                                }
                              />
                              {h.ranges.length > 1 && (
                                <button
                                  type="button"
                                  className="icon-btn"
                                  style={{ width: 30, height: 30 }}
                                  onClick={() =>
                                    setDay({
                                      ...h,
                                      ranges: h.ranges.filter((_, j) => j !== i),
                                    })
                                  }
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </span>
                          ))}
                        {h.open && (
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<Plus />}
                            onClick={() =>
                              setDay({
                                ...h,
                                ranges: [...h.ranges, { from: '14:00', to: '18:00' }],
                              })
                            }
                          >
                            Split
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="form-grid">
                <Field label="After hours">
                  <Select
                    value={r.after_hours_action}
                    options={[
                      { value: 'agent', label: 'Same agent answers anyway' },
                      { value: 'message', label: 'Play a message and hang up' },
                      {
                        value: 'other_agent',
                        label: 'A different agent answers',
                      },
                      { value: 'voicemail', label: 'Take a voicemail' },
                      { value: 'forward', label: 'Forward to another number' },
                    ]}
                    onChange={(e) => patch({ after_hours_action: e.target.value })}
                  />
                </Field>
                {r.after_hours_action === 'other_agent' && (
                  <Field label="After-hours agent">
                    <Select
                      value={r.after_hours_agent_id ?? ''}
                      options={options}
                      placeholder="Choose"
                      onChange={(e) => patch({ after_hours_agent_id: e.target.value })}
                    />
                  </Field>
                )}
                {(r.after_hours_action === 'message' || r.after_hours_action === 'voicemail') && (
                  <Field label="Message" className="full">
                    <Textarea rows={2} value={r.after_hours_message ?? ''} onChange={(e) => patch({ after_hours_message: e.target.value })} />
                  </Field>
                )}
                <Field label={r.after_hours_action === 'forward' ? 'Forward to' : 'Fallback number'} hint={r.after_hours_action === 'forward' ? 'International format, e.g. +918045678999' : 'Used when after hours is “Forward to another number”.'}>
                  <Input
                    className="mono"
                    placeholder="+918045678999"
                    value={r.fallback_number ?? ''}
                    onChange={(e) => patch({ fallback_number: e.target.value })}
                  />
                </Field>
              </div>
            </>
          )}
        </SectionCard>
      </div>
    </>
  );
}

export function NumberBadge({ n }) {
  return <Badge plain>{n.e164}</Badge>;
}
