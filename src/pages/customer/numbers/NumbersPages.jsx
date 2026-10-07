import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, CalendarDays, Clock, Link2, Phone, Plus, Search, ShoppingCart, Trash2, Unlink } from 'lucide-react';
import {
  useAddConnectionMutation,
  useAssignNumberAgentMutation,
  useGetRoutingQuery,
  useListConnectionsQuery,
  useListHolidaysQuery,
  useListNumbersQuery,
  usePurchaseNumberMutation,
  usePutHolidaysMutation,
  usePutRoutingMutation,
  useSearchAvailableNumbersQuery,
  useSimulateRoutingMutation,
  useUnassignNumberAgentMutation,
} from '../../../store/api/callsApi';
import { date, dateTime, money } from '../../../lib/format';
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
  useToast,
} from '../../../components/ui';
import { SectionCard, Select, Textarea, useSection } from '../../../components/forms';
import { useAgentOptions } from '../shared';

/** P-14 Phone numbers (NUM-01, EXT-01). */
export function NumbersPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const list = useListNumbersQuery();
  const [assignAgent] = useAssignNumberAgentMutation();
  const [unassignAgent] = useUnassignNumberAgentMutation();
  const { options: agentOptions, agents } = useAgentOptions();
  const [assigning, setAssigning] = useState(null);
  const [agentId, setAgentId] = useState('');
  const [unassigning, setUnassigning] = useState(null);
  const [buying, setBuying] = useState(false);
  const [tab, setTab] = useState('numbers');

  return (
    <>
      <PageHeader
        eyebrow="Deploy"
        title="Phone numbers"
        description="Numbers allocated to your company, and the agent that answers each one."
        actions={
          <Button icon={<ShoppingCart />} onClick={() => setBuying(true)}>
            Get a number
          </Button>
        }
      />

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
                              {n.country} · {[n.capabilities.voice && 'Voice', n.capabilities.sms && 'SMS'].filter(Boolean).join(' + ')}
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
                          <td className="num">{n.calls_7d ?? 0}</td>
                          <td className="muted">{date(n.allocated_at)}</td>
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

function BuyNumberModal({ open, onClose, onBought }) {
  const toast = useToast();
  const [country, setCountry] = useState('IN');
  const [contains, setContains] = useState('');
  const [busy, setBusy] = useState(null);
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
            value={country}
            options={[
              { value: 'IN', label: 'India' },
              { value: 'US', label: 'United States' },
              { value: 'GB', label: 'United Kingdom' },
              { value: 'AE', label: 'UAE' },
            ]}
            onChange={(e) => setCountry(e.target.value)}
          />
          <Input style={{ flex: 1, minWidth: 160 }} placeholder="Contains digits (optional)" value={contains} onChange={(e) => setContains(e.target.value)} />
          <Button icon={<Search />} onClick={() => setSearch({ country, contains: contains || undefined, at: Date.now() })}>
            Search
          </Button>
        </div>
        {search && (
          <Async state={results}>
            {(r) =>
              r?.length ? (
                <table className="table">
                  <tbody>
                    {r.map((n) => (
                      <tr key={n.e164}>
                        <td className="mono cell-main">{n.e164}</td>
                        <td className="muted">{[n.capabilities.voice && 'Voice', n.capabilities.sms && 'SMS'].filter(Boolean).join(' + ')}</td>
                        <td className="num">
                          {money(n.monthly_price, country === 'IN' ? 'INR' : 'USD')}
                          /mo
                        </td>
                        <td className="actions">
                          <Button
                            size="sm"
                            variant="primary"
                            loading={busy === n.e164}
                            onClick={async () => {
                              setBusy(n.e164);
                              try {
                                await purchaseNumber(n.e164).unwrap();
                                toast(`${n.e164} is yours`);
                                onBought();
                                onClose();
                              } catch (e) {
                                toast(errMsg(e), 'error');
                              } finally {
                                setBusy(null);
                              }
                            }}
                          >
                            Buy
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <EmptyState title="No numbers found" description="Try another country or fewer digits." />
              )
            }
          </Async>
        )}
        <p className="muted small">Can't buy in-app yet? Ask Aurlynn support to allocate a number to your account.</p>
      </div>
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

function CarrierCard() {
  const toast = useToast();
  const conns = useListConnectionsQuery();
  const [addConnection] = useAddConnectionMutation();
  const [type, setType] = useState('carrier_account');
  const [provider, setProvider] = useState('twilio');
  const [fields, setFields] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setFields((f) => ({ ...f, [k]: v }));
  return (
    <div className="stack">
      <div className="card">
        <div className="card-head">
          <h2>Connections</h2>
        </div>
        <Async state={conns}>
          {(list) =>
            list.length ? (
              <table className="table">
                <tbody>
                  {list.map((c) => (
                    <tr key={c.id}>
                      <td className="cell-main">{c.type === 'sip_trunk' ? 'SIP trunk' : 'Carrier account'}</td>
                      <td>{c.provider}</td>
                      <td>
                        <StatusBadge status={c.status} />
                      </td>
                      <td className="muted">{dateTime(c.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState title="Using Aurlynn's carrier" description="Connect your own carrier account or SIP trunk to bring your numbers." />
            )
          }
        </Async>
      </div>
      <div className="card card-pad stack">
        <div className="card-title">Connect your own</div>
        <SegmentTabs
          value={type}
          onChange={setType}
          items={[
            { value: 'carrier_account', label: 'Carrier account' },
            { value: 'sip_trunk', label: 'SIP trunk' },
          ]}
        />

        <div className="form-grid">
          {type === 'carrier_account' ? (
            <>
              <Field label="Provider">
                <Select value={provider} options={['twilio', 'plivo', 'exotel', 'vonage']} onChange={(e) => setProvider(e.target.value)} />
              </Field>
              <Field label="Account SID / ID">
                <Input value={fields.account_id ?? ''} onChange={(e) => set('account_id', e.target.value)} />
              </Field>
              <Field label="Auth token" className="full">
                <Input type="password" value={fields.auth_token ?? ''} onChange={(e) => set('auth_token', e.target.value)} />
              </Field>
            </>
          ) : (
            <>
              <Field label="SIP host">
                <Input className="mono" placeholder="sip.example.com" value={fields.host ?? ''} onChange={(e) => set('host', e.target.value)} />
              </Field>
              <Field label="Username">
                <Input value={fields.username ?? ''} onChange={(e) => set('username', e.target.value)} />
              </Field>
              <Field label="Password" className="full">
                <Input type="password" value={fields.password ?? ''} onChange={(e) => set('password', e.target.value)} />
              </Field>
            </>
          )}
        </div>
        <div>
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const sip = type === 'sip_trunk';
                await addConnection({
                  type,
                  provider: sip ? 'sip' : provider,
                  credentials: sip
                    ? { password: fields.password ?? '' }
                    : {
                        account_id: fields.account_id ?? '',
                        auth_token: fields.auth_token ?? '',
                      },
                  sip_config: sip
                    ? {
                        host: fields.host ?? '',
                        username: fields.username ?? '',
                      }
                    : undefined,
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
    </div>
  );
}

/** P-15 Number routing (NUM-02). */
export function NumberRoutingPage() {
  const { id = '' } = useParams();
  const nums = useListNumbersQuery();
  const num = nums.data?.find((n) => n.id === id);
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
        title={num?.e164 ?? 'Number routing'}
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
                <b>{sim.outcome}</b> — {sim.detail}
                {sim.agent_name ? ` (${sim.agent_name})` : ''} · local time {sim.local_time}
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
              <div>
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
                        <span
                          style={{
                            width: 44,
                            fontWeight: 500,
                            textTransform: 'capitalize',
                          }}
                        >
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
                <Field label="Fallback number" hint="Called if the agent fails or is paused.">
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
