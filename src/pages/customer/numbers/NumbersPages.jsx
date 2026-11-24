import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Cable,
  CalendarDays,
  Check,
  Clock,
  Link2,
  Phone,
  PhoneCall,
  PhoneIncoming,
  PhoneOff,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  Unlink,
} from 'lucide-react';
import {
  useAssignNumberCampaignMutation,
  useGetNumberQuery,
  useGetNumberShopQuery,
  useGetRoutingQuery,
  useListConnectionsQuery,
  useListHolidaysQuery,
  useListNumbersQuery,
  usePurchaseNumberMutation,
  usePutHolidaysMutation,
  usePutRoutingMutation,
  useRemoveOwnNumberMutation,
  useSearchAvailableNumbersQuery,
  useSimulateRoutingMutation,
  useUnassignNumberCampaignMutation,
} from '../../../store/api/callsApi';
import { date, money } from '../../../lib/format';
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
  Toggle,
  useToast,
} from '../../../components/ui';
import { SectionCard, Select, Textarea, useSection } from '../../../components/forms';
import { useCampaignOptions } from '../shared';
import { useGetAnalyticsQuery } from '../../../store/api/analyticsApi';
import { CarrierAccounts, carrierName } from './CarrierAccounts';

// Carriers a company can connect its own account from (public/providers/<key>.png).
const OWN_CARRIERS = [
  { key: 'plivo', name: 'Plivo' },
  { key: 'twilio', name: 'Twilio' },
  { key: 'exotel', name: 'Exotel' },
];

function ProviderChip({ provider }) {
  const [missing, setMissing] = useState(false);
  return (
    <span className="provider-chip">
      {missing ? <Phone aria-hidden /> : <img src={`/providers/${provider.key}.png`} alt="" aria-hidden="true" onError={() => setMissing(true)} />}
      {provider.name}
    </span>
  );
}

const NUMBER_TYPES = ['local', 'mobile', 'toll_free'];
const TYPE_LABEL = { local: 'Local', mobile: 'Mobile', toll_free: 'Toll-free' };
const inr = (amount, currency) => money(amount, currency ?? 'INR');
/** "₹500/mo" or "₹500/mo + ₹1,000 setup". */
const priceText = (p) => `${inr(p.monthly_price, p.currency)}/mo${Number(p.setup_price) > 0 ? ` + ${inr(p.setup_price, p.currency)} setup` : ''}`;

const TABS = ['numbers', 'carriers', 'holidays'];

/** P-14 Phone numbers (NUM-01, EXT-01): rent from Aurlynn, the company's own carrier accounts, its numbers. */
export function NumbersPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const list = useListNumbersQuery();
  const shop = useGetNumberShopQuery();
  const conns = useListConnectionsQuery();
  const usage = useGetAnalyticsQuery({ report: 'phone-numbers', range: '7d' });
  // The report is keyed by the number itself (E.164).
  const calls7d = Object.fromEntries((Array.isArray(usage.data) ? usage.data : []).map((r) => [r.number, r.calls]));
  const [assignCampaign] = useAssignNumberCampaignMutation();
  const [unassignCampaign] = useUnassignNumberCampaignMutation();
  const [removeOwnNumber] = useRemoveOwnNumberMutation();
  const { campaigns } = useCampaignOptions();
  // Inbound campaigns first: they are the ones that answer numbers.
  const campaignOptions = [...campaigns]
    .sort((a, b) => (a.direction === 'inbound' ? 0 : 1) - (b.direction === 'inbound' ? 0 : 1) || a.name.localeCompare(b.name))
    .map((c) => ({ value: c.id, label: `${c.name}${c.agent_name ? ` · ${c.agent_name}` : ''}${c.direction === 'outbound' ? ' (outbound)' : ''}` }));
  const [assigning, setAssigning] = useState(null);
  const [campaignId, setCampaignId] = useState('');
  const [unassigning, setUnassigning] = useState(null);
  const [takingOut, setTakingOut] = useState(null);
  const [buying, setBuying] = useState(false);
  // The tab is in the address (?tab=carriers), so a reload or a link keeps it.
  const [params, setParams] = useSearchParams();
  const tab = TABS.includes(params.get('tab')) ? params.get('tab') : 'numbers';
  const setTab = (t) => setParams(t === 'numbers' ? {} : { tab: t }, { replace: true });
  const manageRef = useRef(null);
  // "Connect" opens the carrier tab, then scrolls once it has rendered (scrolling
  // first gets cancelled when the tab swap changes the page height).
  const [scrollToManage, setScrollToManage] = useState(false);
  useEffect(() => {
    if (!scrollToManage) return;
    manageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setScrollToManage(false);
  }, [scrollToManage, tab]);
  const openCarriers = () => {
    setTab('carriers');
    setScrollToManage(true);
  };

  // The shop opens when our own Plivo account is connected; until then (or if the
  // route isn't served yet) renting is "coming soon".
  const canRent = shop.data?.available === true;
  const prices = NUMBER_TYPES.map((t) => (shop.data?.prices ?? []).find((p) => p.number_type === t)).filter(Boolean);
  const connections = conns.data ?? [];
  const ownCarrier = (n) => {
    if (!n.carrier_connection_id) return null;
    const c = connections.find((x) => x.id === n.carrier_connection_id);
    return { type: c?.type ?? n.provider, name: c?.name };
  };

  return (
    <>
      <section className="page-hero">
        <h1>Take your campaigns live</h1>
        <div className="option-grid">
          <article className="option-card">
            <span className="clay warm" aria-hidden>
              <PhoneCall />
            </span>
            <h2>
              Rent from Aurlynn{' '}
              {!canRent && !shop.isLoading && (
                <span style={{ verticalAlign: 'middle' }}>
                  <Badge tone="amber">Coming soon</Badge>
                </span>
              )}
            </h2>
            <p>Aurlynn rents Indian phone numbers for you and manages them end to end.</p>
            <ul className="check-list">
              <li>
                <Check /> Local, mobile and toll-free numbers in India
              </li>
              <li>
                <Check /> Search and buy them right here
              </li>
              <li>
                <Check /> Fully managed: nothing to set up with a carrier
              </li>
            </ul>
            <p className="small muted option-meta">
              {prices.length ? prices.map((p) => `${TYPE_LABEL[p.number_type]} ${priceText(p)}`).join(' · ') : 'Priced per number, per month'}
            </p>
            <div className="option-foot">
              {canRent ? (
                <Button variant="primary" onClick={() => setBuying(true)}>
                  Get a number <ArrowRight />
                </Button>
              ) : (
                <div className="stack" style={{ gap: 8 }}>
                  <div>
                    <Button disabled>{shop.isLoading ? 'Get a number' : 'Coming soon'}</Button>
                  </div>
                  {!shop.isLoading && (
                    <p className="small muted" style={{ margin: 0 }}>
                      Renting numbers from Aurlynn opens soon. Until then, bring in numbers from your own carrier account.
                    </p>
                  )}
                </div>
              )}
            </div>
          </article>

          <article className="option-card">
            <span className="clay" aria-hidden>
              <Cable />
            </span>
            <h2>Bring your own carrier</h2>
            <p>Connect your Plivo, Twilio or Exotel account and bring in the numbers you already have.</p>
            <ul className="check-list">
              <li>
                <Check /> Keep your numbers and your carrier’s rates
              </li>
              <li>
                <Check /> Plivo and Twilio numbers are pointed at Aurlynn for you
              </li>
              <li>
                <Check /> Exotel: add our Voicebot applet to your call flow
              </li>
            </ul>
            <div className="provider-chips">
              {OWN_CARRIERS.map((p) => (
                <ProviderChip key={p.key} provider={p} />
              ))}
              <span className="provider-chip" title="SIP trunks are coming soon">
                <Cable aria-hidden /> SIP trunk · Coming soon
              </span>
            </div>
            <div className="option-foot">
              <Button onClick={openCarriers}>
                {connections.length ? 'Your carrier accounts' : 'Connect'} <ArrowRight />
              </Button>
            </div>
          </article>
        </div>
      </section>

      <section className="page-section" ref={manageRef}>
        <div className="page-section-head">
          <div>
            <h2 className="text-subheading">Your numbers</h2>
            <p className="muted small">Numbers your company uses, and the campaign that answers each one.</p>
          </div>
          {canRent && (
            <Button icon={<ShoppingCart />} onClick={() => setBuying(true)}>
              Get a number
            </Button>
          )}
        </div>

        <SegmentTabs
          value={tab}
          onChange={setTab}
          items={[
            { value: 'numbers', label: 'Numbers' },
            { value: 'carriers', label: 'Carrier accounts' },
            { value: 'holidays', label: 'Holidays' },
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
                          const unpublished = n.campaign_id && n.campaign_published === false;
                          const own = ownCarrier(n);
                          return (
                            <tr key={n.id}>
                              <td>
                                <div className="cell-main mono">{n.e164}</div>
                                <div className="cell-sub">
                                  {n.country} · {[n.capabilities?.voice && 'Voice', n.capabilities?.sms && 'SMS'].filter(Boolean).join(' + ') || 'Voice'}
                                </div>
                                {own && (
                                  <span title={own.name ? `From ${own.name}` : undefined}>
                                    <Badge tone="blue">Your {carrierName(own.type)}</Badge>
                                  </span>
                                )}
                              </td>
                              <td>
                                {n.campaign_id ? (
                                  <>
                                    <Link to={`/campaigns/${n.campaign_id}`} className="cell-main">
                                      {n.campaign_name ?? 'Deleted campaign'}
                                    </Link>
                                    {n.agent_name && <div className="cell-sub">spoken by {n.agent_name}</div>}
                                    {unpublished && (
                                      <div className="cell-sub row" style={{ color: 'var(--amber)', gap: 4 }}>
                                        <AlertTriangle size={13} /> Campaign isn't published — calls won't be answered
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
                                    setCampaignId(n.campaign_id ?? '');
                                  }}
                                >
                                  {n.campaign_id ? 'Change' : 'Assign'}
                                </Button>
                                {n.campaign_id && <Button size="sm" variant="ghost" icon={<Unlink />} title="Remove campaign" onClick={() => setUnassigning(n)} />}
                                {own && (
                                  <Button size="sm" variant="ghost" icon={<PhoneOff />} title="Take out of Aurlynn" onClick={() => setTakingOut({ ...n, own })}>
                                    Take out
                                  </Button>
                                )}
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
                    description={
                      canRent
                        ? 'Get a number from Aurlynn, or bring in the numbers you have from your own carrier account.'
                        : 'Bring in the numbers you have from your own Plivo, Twilio or Exotel account. Renting numbers from Aurlynn is coming soon.'
                    }
                    action={
                      <div className="row wrap" style={{ gap: 8, justifyContent: 'center' }}>
                        <Button icon={<PhoneIncoming />} onClick={openCarriers}>
                          Connect a carrier account
                        </Button>
                        {canRent && (
                          <Button variant="primary" onClick={() => setBuying(true)}>
                            Get a number
                          </Button>
                        )}
                      </div>
                    }
                  />
                )
              }
            </Async>
          </div>
        )}
        {tab === 'holidays' && <HolidaysCard />}
        {tab === 'carriers' && <CarrierAccounts />}
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
              disabled={!campaignId}
              onClick={async () => {
                try {
                  await assignCampaign({ id: assigning.id, campaign_id: campaignId }).unwrap();
                  toast('Campaign assigned');
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
        <Field label="Campaign" hint="Callers get the campaign's published version, spoken by its agent.">
          <Select value={campaignId} options={campaignOptions} placeholder="Choose a campaign" onChange={(e) => setCampaignId(e.target.value)} />
        </Field>
      </Modal>
      <ConfirmDialog
        open={!!unassigning}
        onClose={() => setUnassigning(null)}
        danger
        title={`Remove the campaign from ${unassigning?.e164}?`}
        description="Calls to this number won't be answered until you assign another campaign."
        confirmLabel="Remove"
        onConfirm={async () => {
          await unassignCampaign(unassigning.id).unwrap();
        }}
      />
      <ConfirmDialog
        open={!!takingOut}
        onClose={() => setTakingOut(null)}
        danger
        title={`Take ${takingOut?.e164} out of Aurlynn?`}
        description={
          takingOut
            ? `${takingOut.campaign_id ? `${takingOut.campaign_name ?? 'Its campaign'} stops answering it. ` : ''}The number stays on your ${carrierName(
                takingOut.own.type,
              )} account: change where its calls go there, or callers won't be answered. You can bring it back in from Carrier accounts.`
            : undefined
        }
        confirmLabel="Take out"
        onConfirm={async () => {
          await removeOwnNumber(takingOut.id).unwrap();
          toast(`${takingOut.e164} taken out of Aurlynn`);
        }}
      />

      {canRent && <BuyNumberModal open={buying} onClose={() => setBuying(false)} shop={shop.data} />}
    </>
  );
}

const CITY_ORDER = ['80', '11', '22', '20', '40', '44', '33', '79'];

/** Search the numbers Aurlynn rents and buy one, at the admins' price for its type. */
function BuyNumberModal({ open, onClose, shop }) {
  const toast = useToast();
  const prices = NUMBER_TYPES.map((t) => (shop?.prices ?? []).find((p) => p.number_type === t)).filter(Boolean);
  const localities = shop?.localities ?? {};
  const areas = Object.keys(localities)
    .sort((a, b) => (CITY_ORDER.indexOf(a) + 1 || 99) - (CITY_ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b))
    .map((code) => ({ value: code, label: `${localities[code]} (${code})` }));
  const [type, setType] = useState('local');
  const [areaCode, setAreaCode] = useState('80');
  const [contains, setContains] = useState('');
  // The number picked to buy, waiting for the person to confirm the price.
  const [pick, setPick] = useState(null);
  // Search runs when the button is pressed; `at` makes each press a fresh query.
  const [search, setSearch] = useState(null);
  const results = useSearchAvailableNumbersQuery(search ?? {}, { skip: !open || !search });
  const [purchaseNumber] = usePurchaseNumberMutation();
  const area = areas.some((a) => a.value === areaCode) ? areaCode : (areas[0]?.value ?? '');
  const price = (n) => ({ monthly_price: n.monthly_price, setup_price: n.setup_price, currency: n.currency });
  return (
    <Modal open={open} onClose={onClose} wide title="Get a phone number" description="Search the numbers Aurlynn rents and buy one instantly.">
      <div className="stack">
        <div className="row wrap">
          <Select
            style={{ width: 220 }}
            value={type}
            options={(prices.length ? prices : NUMBER_TYPES.map((t) => ({ number_type: t }))).map((p) => ({
              value: p.number_type,
              label: p.monthly_price !== undefined ? `${TYPE_LABEL[p.number_type]} · ${inr(p.monthly_price, p.currency)}/mo` : TYPE_LABEL[p.number_type],
            }))}
            onChange={(e) => setType(e.target.value)}
          />
          {type === 'local' && areas.length > 0 && <Select style={{ width: 180 }} value={area} options={areas} onChange={(e) => setAreaCode(e.target.value)} />}
          <Input style={{ flex: 1, minWidth: 160 }} placeholder="Contains digits (optional)" value={contains} onChange={(e) => setContains(e.target.value.replace(/\D/g, ''))} />
          <Button icon={<Search />} onClick={() => setSearch({ type, area_code: type === 'local' ? area || undefined : undefined, contains: contains || undefined, at: Date.now() })}>
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
                          <td className="num">{priceText(price(n))}</td>
                          <td className="actions">
                            <Button size="sm" variant="primary" onClick={() => setPick({ ...n, type: n.type ?? search.type })}>
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
            ? `It costs ${inr(pick.monthly_price, pick.currency)} a month${
                Number(pick.setup_price) > 0 ? `, plus ${inr(pick.setup_price, pick.currency)} once to set it up` : ''
              }. It is added to your numbers right away.`
            : undefined
        }
        confirmLabel={pick ? `Buy for ${inr(pick.monthly_price, pick.currency)}/mo` : 'Buy'}
        onConfirm={async () => {
          let bought;
          try {
            bought = await purchaseNumber({ e164: pick.e164, type: pick.type }).unwrap();
          } catch (e) {
            throw e?.status === 409 ? 'Someone just took that number. Pick another one.' : e;
          }
          toast(bought?.status === 'pending' ? `${pick.e164} is yours once the carrier finishes its checks` : `${pick.e164} is yours`);
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

/** P-15 Number routing (NUM-02). */
export function NumberRoutingPage() {
  const { id = '' } = useParams();
  const nums = useListNumbersQuery();
  const num = nums.data?.find((n) => n.id === id);
  const single = useGetNumberQuery(id, { skip: !id || !!num });
  const current = num ?? single.data;
  const routing = useSection(useGetRoutingQuery(id), usePutRoutingMutation(), (body) => ({ id, body }));
  const [simulate, { isLoading: simBusy }] = useSimulateRoutingMutation();
  const { options } = useCampaignOptions();
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
        description="Business hours, what happens after hours, and the fallback if the campaign can't take the call."
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
                {sim.campaign_name ? ` (${sim.campaign_name}${sim.agent_name ? `, spoken by ${sim.agent_name}` : ''})` : ''} — {sim.detail} · local time{' '}
                {sim.local_time}
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
                description="The campaign answers at any time. Turn off to set business hours; calls outside them follow the after-hours rule."
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
                      { value: 'agent', label: 'Same campaign answers anyway' },
                      { value: 'message', label: 'Play a message and hang up' },
                      {
                        value: 'other_campaign',
                        label: 'A different campaign answers',
                      },
                      { value: 'voicemail', label: 'Take a voicemail' },
                      { value: 'forward', label: 'Forward to another number' },
                    ]}
                    onChange={(e) => patch({ after_hours_action: e.target.value })}
                  />
                </Field>
                {r.after_hours_action === 'other_campaign' && (
                  <Field label="After-hours campaign">
                    <Select
                      value={r.after_hours_campaign_id ?? ''}
                      options={options}
                      placeholder="Choose"
                      onChange={(e) => patch({ after_hours_campaign_id: e.target.value })}
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
