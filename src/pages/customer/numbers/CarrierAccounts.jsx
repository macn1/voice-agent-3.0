import { useState } from 'react';
import { Check, ExternalLink, Phone, PhoneIncoming, Plus, RefreshCw, Unplug } from 'lucide-react';
import {
  useAddConnectionMutation,
  useDeleteConnectionMutation,
  useGetTelephonySettingsQuery,
  useImportCarrierNumbersMutation,
  useListCarrierNumbersQuery,
  useListConnectionsQuery,
  usePutTelephonySettingsMutation,
  useTestConnectionMutation, useUpdateConnectionMutation } from '../../../store/api/callsApi';
import { dateTime, number } from '../../../lib/format';
import { Async, Badge, Button, ConfirmDialog, EmptyState, errMsg, Field, formErrors, Input, Modal, Skeleton, useToast } from '../../../components/ui';
import { CopyField, Select } from '../../../components/forms';

// A company's own carrier accounts (phase 6). Plivo and Twilio numbers are pointed at
// Aurlynn when they are brought in; Exotel needs our Voicebot applet in its call flow.
export const CARRIERS = {
  plivo: {
    name: 'Plivo',
    sid: 'Auth ID',
    sidHint: 'Starts with MA or SA.',
    token: 'Auth Token',
    console: 'https://console.plivo.com/dashboard/',
    consoleName: 'Plivo console',
    where: (
      <>
        Open <b>Overview</b> and copy the <b>Auth ID</b> and the <b>Auth Token</b>.
      </>
    ),
  },
  twilio: {
    name: 'Twilio',
    sid: 'Account SID',
    sidHint: 'Starts with AC.',
    token: 'Auth Token',
    console: 'https://console.twilio.com/',
    consoleName: 'Twilio console',
    where: (
      <>
        Under <b>Account info</b> on the home page, copy the <b>Account SID</b> and the <b>Auth Token</b>.
      </>
    ),
  },
  exotel: {
    name: 'Exotel',
    sid: 'Account SID',
    sidHint: 'Your Exotel account’s SID, e.g. yourcompany1.',
    token: 'API token',
    console: 'https://my.exotel.com/',
    consoleName: 'Exotel',
    where: (
      <>
        Open <b>Settings › API settings</b> and copy the <b>API key</b>, the <b>API token</b> and the <b>Account SID</b>. Pick the region your account is in.
      </>
    ),
  },
};
const CARRIER_KEYS = ['plivo', 'twilio', 'exotel'];
// Connections made by the old simulated form can be SIP trunks (coming soon).
export const carrierName = (type) => CARRIERS[type]?.name ?? (type === 'sip_trunk' ? 'SIP trunk' : 'carrier');

const REGIONS = [
  { value: 'in', label: 'Mumbai (India)' },
  { value: 'sg', label: 'Singapore' },
];

/** The carrier's logo from public/providers/<type>.png, or a phone icon. */
export function CarrierLogo({ type, size = 48 }) {
  const [missing, setMissing] = useState(false);
  return (
    <span className="carrier-logo" style={{ width: size, height: size }} aria-hidden>
      {missing || !CARRIERS[type] ? <Phone /> : <img src={`/providers/${type}.png`} alt="" onError={() => setMissing(true)} />}
    </span>
  );
}

const STATUS = {
  active: ['green', 'Connected'],
  failed: ['red', 'Check failed'],
  unverified: ['amber', 'Not checked'],
};

/** The Carrier accounts tab: the company's accounts, connecting one, and the outbound carrier. */
export function CarrierAccounts() {
  const conns = useListConnectionsQuery();
  const [adding, setAdding] = useState(false);
  const [bringing, setBringing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [deleteConnection] = useDeleteConnectionMutation();
  const settings = useGetTelephonySettingsQuery();
  const toast = useToast();

  return (
    <div className="stack">
      <Async state={conns} skeleton={<Skeleton h={160} />}>
        {(list) => (
          <>
            {list.length ? (
              list.map((c) => <ConnectionCard key={c.id} conn={c} onBringIn={() => setBringing(c)} onDisconnect={() => setRemoving(c)} />)
            ) : (
              <div className="card">
                <EmptyState
                  icon={<PhoneIncoming />}
                  title="No carrier accounts yet"
                  description="Connect your Plivo, Twilio or Exotel account to answer calls to the numbers you already have."
                />
              </div>
            )}
            {!list.length || adding ? (
              <ConnectCarrierForm
                onCancel={list.length ? () => setAdding(false) : undefined}
                onConnected={(c) => {
                  setAdding(false);
                  setBringing(c);
                }}
              />
            ) : (
              <div>
                <Button icon={<Plus />} onClick={() => setAdding(true)}>
                  Connect another account
                </Button>
              </div>
            )}
            <OutboundCarrierCard connections={list} settings={settings} />
          </>
        )}
      </Async>

      <div className="banner neutral" style={{ margin: 0 }}>
        <span className="grow">
          <b>SIP trunks</b> <Badge>Coming soon</Badge>
          <span className="muted"> For now, connect a Plivo, Twilio or Exotel account.</span>
        </span>
      </div>

      <BringInModal conn={bringing} onClose={() => setBringing(null)} />
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        danger
        title={`Disconnect ${removing?.name ?? 'this account'}?`}
        description={
          removing
            ? `${
                removing.numbers
                  ? `Its ${removing.numbers === 1 ? 'number leaves' : `${number(removing.numbers)} numbers leave`} Aurlynn and campaigns stop answering ${
                      removing.numbers === 1 ? 'it' : 'them'
                    }. ${removing.numbers === 1 ? 'It stays' : 'They stay'} on your ${carrierName(removing.type)} account.`
                  : 'No numbers were brought in from it.'
              }${settings.data?.outbound_connection_id === removing.id ? ' Outbound calls go back through Aurlynn.' : ''}`
            : undefined
        }
        confirmLabel="Disconnect"
        onConfirm={async () => {
          await deleteConnection(removing.id).unwrap();
          toast(`${removing.name} disconnected`);
        }}
      />
    </div>
  );
}

function ConnectionCard({ conn: c, onBringIn, onDisconnect }) {
  const toast = useToast();
  const [testConnection, { isLoading: checking }] = useTestConnectionMutation();
  const [tone, label] = STATUS[c.status] ?? ['', c.status];
  const carrier = CARRIERS[c.type];
  const active = c.status === 'active';

  const check = async () => {
    try {
      const r = await testConnection(c.id).unwrap();
      if (r.status === 'active') toast(`${carrierName(c.type)} accepted the account`);
      else toast(r.last_error || `${carrierName(c.type)} refused the account`, 'error');
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };

  return (
    <div className="card card-pad stack" data-connection={c.id}>
      <div className="row between wrap" style={{ alignItems: 'flex-start' }}>
        <div className="row" style={{ gap: 14, minWidth: 0, alignItems: 'flex-start' }}>
          <CarrierLogo type={c.type} />
          <div style={{ minWidth: 0 }}>
            <div className="row wrap" style={{ gap: 8 }}>
              <span className="card-title" style={{ overflowWrap: 'anywhere' }}>
                {c.name}
              </span>
              <Badge tone={tone}>{label}</Badge>
            </div>
            <div className="muted small" style={{ overflowWrap: 'anywhere' }}>
              {carrierName(c.type)}
              {/* The carrier's own name for the account, when the name here is a different one. */}
              {c.account_name && c.account_name !== c.account_sid && !(c.name ?? '').includes(c.account_name) ? ` · ${c.account_name}` : ''}
              {c.account_sid && (
                <>
                  {' '}
                  · {carrier?.sid ?? 'Account'} <span className="mono">{c.account_sid}</span>
                </>
              )}
              {c.type === 'exotel' && c.region ? ` · ${REGIONS.find((r) => r.value === c.region)?.label ?? c.region}` : ''}
            </div>
            <div className="muted small">
              {c.numbers ? `${number(c.numbers)} ${c.numbers === 1 ? 'number' : 'numbers'} in Aurlynn` : 'No numbers brought in yet'}
              {c.last_checked_at ? ` · Checked ${dateTime(c.last_checked_at)}` : ''}
            </div>
          </div>
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          <Button icon={<RefreshCw />} loading={checking} onClick={check}>
            {checking ? `Checking with ${carrierName(c.type)}…` : 'Check again'}
          </Button>
          <Button
            variant={active ? 'primary' : 'default'}
            icon={<PhoneIncoming />}
            disabled={!active}
            title={active ? undefined : 'Check the account again first'}
            onClick={onBringIn}
          >
            Bring in numbers
          </Button>
          <Button variant="danger" icon={<Unplug />} onClick={onDisconnect}>
            Disconnect
          </Button>
        </div>
      </div>
      {c.last_error && (
        <div className={`banner ${c.status === 'unverified' ? 'warn' : 'danger'}`} role="alert" style={{ margin: 0 }}>
          <span className="grow" style={{ overflowWrap: 'anywhere' }}>
            {c.last_error}
          </span>
        </div>
      )}
      {c.type === 'exotel' && c.stream_url && <FinishInExotel url={c.stream_url} />}
      {c.type === 'exotel' && active && <ExotelOutboundFlow conn={c} />}
      {(c.type === 'plivo' || c.type === 'twilio') && active && (
        <p className="muted small" style={{ margin: 0 }}>
          Numbers you bring in are pointed at Aurlynn in your {carrierName(c.type)} account for you: their calls come straight to your campaigns.
        </p>
      )}
    </div>
  );
}

/** Exotel sends calls to Aurlynn only from a call flow with our Voicebot applet. */
function FinishInExotel({ url }) {
  return (
    <div className="stack" style={{ gap: 12, borderTop: '1px solid var(--divider)', paddingTop: 16 }}>
      <div>
        <div className="card-title">Finish in Exotel</div>
        <div className="card-sub">Exotel sends calls to Aurlynn through the Voicebot applet in your call flow. Do this once for each flow your numbers use.</div>
      </div>
      <Field label="Voicebot stream URL" hint="Keep it private: it carries this account's key, like a password." className="full">
        <CopyField value={url} />
      </Field>
      <ol className="small lh-spacious" style={{ margin: 0, paddingLeft: 20 }}>
        <li>
          In{' '}
          <a href={CARRIERS.exotel.console} target="_blank" rel="noreferrer">
            Exotel <ExternalLink size={12} />
          </a>
          , open <b>App Bazaar</b> and open the call flow your numbers use (or create one).
        </li>
        <li>
          Add the <b>Voicebot</b> applet to the flow.
        </li>
        <li>Paste the stream URL above into the applet.</li>
        <li>
          Make the flow’s next step after the Voicebot a <b>Hangup</b>, so the call ends when the agent is done.
        </li>
        <li>
          <b>Save</b> the flow, and make sure your numbers use it.
        </li>
      </ol>
    </div>
  );
}

/** Exotel places outbound calls only into a call flow: the one with our Voicebot applet. */
function ExotelOutboundFlow({ conn }) {
  const toast = useToast();
  const [updateConnection] = useUpdateConnectionMutation();
  const [flow, setFlow] = useState(conn.outbound_flow_id ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const saved = conn.outbound_flow_id ?? '';
  return (
    <div className="stack" style={{ gap: 10, borderTop: '1px solid var(--divider)', paddingTop: 16 }}>
      <div>
        <div className="card-title">Outbound calls through Exotel</div>
        <div className="card-sub">
          Exotel places a call into one of your call flows. Give the ID of the flow with the Voicebot applet (App Bazaar shows it next to the flow’s name).
        </div>
      </div>
      <div className="row wrap" style={{ gap: 8, alignItems: 'flex-end' }}>
        <div style={{ minWidth: 220 }}>
          <Field label="Call flow ID" error={error}>
            <Input className="mono" inputMode="numeric" placeholder="e.g. 456789" value={flow} onChange={(e) => setFlow(e.target.value.trim())} />
          </Field>
        </div>
        <Button
          variant="primary"
          loading={saving}
          disabled={flow === saved}
          onClick={async () => {
            setSaving(true);
            setError('');
            try {
              await updateConnection({ id: conn.id, outbound_flow_id: flow }).unwrap();
              toast(flow ? 'Outbound call flow saved' : 'Outbound call flow cleared');
            } catch (e) {
              const { fields, general } = formErrors(e, ['outbound_flow_id']);
              setError(fields.outbound_flow_id ?? general ?? errMsg(e));
            } finally {
              setSaving(false);
            }
          }}
        >
          Save
        </Button>
      </div>
      {!saved && <span className="muted small">Without it, outbound calls can’t go through this Exotel account.</span>}
    </div>
  );
}

const CONNECT_FIELDS = ['account_sid', 'auth_token', 'api_key', 'region', 'name'];
const BLANK = { account_sid: '', auth_token: '', api_key: '', region: 'in', name: '' };

/** Connect a Plivo, Twilio or Exotel account: checked with the carrier before it's saved. */
function ConnectCarrierForm({ onConnected, onCancel }) {
  const toast = useToast();
  const [addConnection] = useAddConnectionMutation();
  const [type, setType] = useState('plivo');
  const [f, setF] = useState(BLANK);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const carrier = CARRIERS[type];
  const exotel = type === 'exotel';
  const set = (k) => (e) => {
    setF({ ...f, [k]: e.target.value });
    if (errors[k]) setErrors({ ...errors, [k]: undefined });
  };
  const pick = (t) => {
    if (busy) return;
    setType(t);
    setF(BLANK);
    setErrors({});
    setError(null);
  };

  const submit = async (e) => {
    e.preventDefault();
    const body = { type, account_sid: f.account_sid.trim(), auth_token: f.auth_token.trim(), ...(f.name.trim() ? { name: f.name.trim() } : {}) };
    if (exotel) Object.assign(body, { api_key: f.api_key.trim(), region: f.region });
    const missing = Object.fromEntries(['account_sid', 'auth_token', ...(exotel ? ['api_key'] : [])].filter((k) => !body[k]).map((k) => [k, 'Required']));
    setError(null);
    setErrors(missing);
    if (Object.keys(missing).length) return;
    setBusy(true);
    try {
      const c = await addConnection(body).unwrap();
      setF(BLANK);
      toast(`${carrier.name} account connected. Now bring in your numbers.`);
      onConnected?.(c);
    } catch (err) {
      const r = formErrors(err, CONNECT_FIELDS);
      setErrors(r.fields);
      setError(r.general);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card card-pad stack" onSubmit={submit} noValidate>
      <div>
        <div className="card-title">Connect a carrier account</div>
        <div className="card-sub">
          Bring the numbers you already have. We check the keys with your carrier before saving them; tokens are stored encrypted and never shown again.
        </div>
      </div>
      <div className="tabs" role="tablist" aria-label="Carrier" style={{ marginBottom: 0 }}>
        {CARRIER_KEYS.map((k) => (
          <button key={k} type="button" role="tab" aria-selected={type === k} className={`chip ${type === k ? 'active' : ''}`} onClick={() => pick(k)}>
            <img className="chip-logo" src={`/providers/${k}.png`} alt="" aria-hidden="true" />
            {CARRIERS[k].name}
          </button>
        ))}
      </div>
      <p className="small" style={{ margin: 0 }}>
        <b>Where to find them:</b> in the{' '}
        <a href={carrier.console} target="_blank" rel="noreferrer">
          {carrier.consoleName} <ExternalLink size={12} />
        </a>
        . {carrier.where}
      </p>
      <div className="form-grid">
        {exotel && (
          <Field label="API key" error={errors.api_key}>
            <Input className="mono" value={f.api_key} invalid={!!errors.api_key} onChange={set('api_key')} autoComplete="off" spellCheck={false} />
          </Field>
        )}
        {!exotel && (
          <Field label={carrier.sid} hint={carrier.sidHint} error={errors.account_sid}>
            <Input className="mono" value={f.account_sid} invalid={!!errors.account_sid} onChange={set('account_sid')} autoComplete="off" spellCheck={false} />
          </Field>
        )}
        <Field label={carrier.token} hint="Stored encrypted." error={errors.auth_token}>
          <Input type="password" className="mono" value={f.auth_token} invalid={!!errors.auth_token} onChange={set('auth_token')} autoComplete="new-password" />
        </Field>
        {exotel && (
          <>
            <Field label={carrier.sid} hint={carrier.sidHint} error={errors.account_sid}>
              <Input className="mono" value={f.account_sid} invalid={!!errors.account_sid} onChange={set('account_sid')} autoComplete="off" spellCheck={false} />
            </Field>
            <Field label="Region" hint="Where your Exotel account is: most Indian accounts are in Mumbai." error={errors.region}>
              <Select value={f.region} options={REGIONS} onChange={set('region')} />
            </Field>
          </>
        )}
        <Field label="Name (optional)" hint="How it's shown here. Leave it empty to use the account's own name." error={errors.name} className="full">
          <Input value={f.name} invalid={!!errors.name} maxLength={100} placeholder={`${carrier.name} – main account`} onChange={set('name')} />
        </Field>
      </div>
      {error && <div className="alert-inline">{error}</div>}
      <div className="row wrap" style={{ gap: 8 }}>
        <Button variant="primary" type="submit" loading={busy}>
          {busy ? `Checking with ${carrier.name}…` : 'Connect'}
        </Button>
        {onCancel && (
          <Button onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

const BATCH = 50;

/** Picks numbers on the carrier account and brings them into Aurlynn, with each number's result. */
function BringInModal({ conn, onClose }) {
  return (
    <Modal open={!!conn} onClose={onClose} wide title={`Bring in numbers from ${conn?.name ?? 'your account'}`} description="The numbers on your account. Pick the ones campaigns should answer.">
      {conn && <BringInBody key={conn.id} conn={conn} onClose={onClose} />}
    </Modal>
  );
}

function BringInBody({ conn, onClose }) {
  const nums = useListCarrierNumbersQuery(conn.id, { refetchOnMountOrArgChange: true });
  const [importNumbers] = useImportCarrierNumbersMutation();
  const [picked, setPicked] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const carrier = carrierName(conn.type);
  const pickable = (nums.data ?? []).filter((n) => n.voice && !n.phone_number_id);
  const toggle = (e164) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(e164)) next.delete(e164);
      else next.add(e164);
      return next;
    });

  const bringIn = async () => {
    setBusy(true);
    setError(null);
    const list = [...picked];
    const out = [];
    try {
      for (let i = 0; i < list.length; i += BATCH) {
        out.push(...(await importNumbers({ id: conn.id, numbers: list.slice(i, i + BATCH) }).unwrap()));
      }
      setResults(out);
      setPicked(new Set());
    } catch (e) {
      if (out.length) setResults(out);
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  if (results) {
    const ok = results.filter((r) => r.phone_number_id);
    return (
      <div className="stack">
        {error && <div className="alert-inline">{error}</div>}
        <ul className="carrier-results" aria-label="Results">
          {results.map((r) => (
            <li key={r.e164}>
              <span className="mono fw-medium">{r.e164}</span>
              {r.phone_number_id ? (
                <span className="row" style={{ gap: 4, color: 'var(--green)' }}>
                  <Check size={14} /> Brought in
                </span>
              ) : (
                <span style={{ color: 'var(--red)' }}>{r.error ? r.error[0].toUpperCase() + r.error.slice(1) : 'Not brought in'}</span>
              )}
            </li>
          ))}
        </ul>
        {ok.length > 0 &&
          (conn.type === 'exotel' ? (
            <div className="banner warn" style={{ margin: 0 }}>
              <span className="grow">
                One more step: calls reach Aurlynn only after you add the <b>Voicebot</b> applet to your Exotel call flow (see <b>Finish in Exotel</b> on this
                account). Then assign a campaign to each number on the Numbers tab.
              </span>
            </div>
          ) : (
            <div className="banner info" style={{ margin: 0 }}>
              <span className="grow">
                Calls to {ok.length === 1 ? 'this number' : 'these numbers'} now come to Aurlynn automatically: we pointed {ok.length === 1 ? 'it' : 'them'} at
                Aurlynn in your {carrier} account. Assign a campaign to each on the Numbers tab, so calls get answered.
              </span>
            </div>
          ))}
        <div className="modal-foot" style={{ padding: 0 }}>
          <Button onClick={() => setResults(null)}>Bring in more</Button>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      <Async state={nums}>
        {(list) =>
          list.length ? (
            <>
              {pickable.length > 1 && (
                <div className="row between wrap">
                  <span className="muted small">
                    {picked.size ? `${number(picked.size)} picked` : `${number(pickable.length)} ${pickable.length === 1 ? 'number' : 'numbers'} can be brought in`}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setPicked(picked.size === pickable.length ? new Set() : new Set(pickable.map((n) => n.e164)))}
                  >
                    {picked.size === pickable.length ? 'Clear' : 'Pick all'}
                  </Button>
                </div>
              )}
              <ul className="carrier-numbers">
                {list.map((n) => {
                  const inAurlynn = !!n.phone_number_id;
                  const disabled = inAurlynn || !n.voice;
                  return (
                    <li key={n.e164} className={disabled ? 'off' : ''}>
                      <label className="check">
                        <input type="checkbox" checked={inAurlynn || picked.has(n.e164)} disabled={disabled} onChange={() => toggle(n.e164)} />
                        <span style={{ minWidth: 0 }}>
                          <span className="mono fw-medium">{n.e164}</span>
                          {n.name && n.name !== n.e164 && <span className="muted"> · {n.name}</span>}
                          {!n.voice && <span className="cell-sub">Can't take calls (not a voice number)</span>}
                          {inAurlynn && conn.type !== 'exotel' && !n.points_to_us && (
                            <span className="cell-sub" style={{ color: 'var(--amber)' }}>
                              Its calls go somewhere else in {carrier}: point it back at Aurlynn there.
                            </span>
                          )}
                        </span>
                      </label>
                      {inAurlynn && <Badge tone="green">In Aurlynn</Badge>}
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <EmptyState icon={<Phone />} title="No numbers on this account" description={`Buy or port a number in ${carrier} first, then bring it in here.`} />
          )
        }
      </Async>
      {error && <div className="alert-inline">{error}</div>}
      <div className="modal-foot" style={{ padding: 0 }}>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant="primary" icon={<PhoneIncoming />} loading={busy} disabled={!picked.size} onClick={bringIn}>
          {busy ? 'Bringing in…' : picked.size > 1 ? `Bring in ${number(picked.size)} numbers` : 'Bring in number'}
        </Button>
      </div>
    </div>
  );
}

/** Which carrier places the company's outbound calls: Aurlynn, or one of its active accounts. */
function OutboundCarrierCard({ connections, settings }) {
  const toast = useToast();
  const [putSettings, { isLoading: saving }] = usePutTelephonySettingsMutation();
  const saved = settings.data?.outbound_connection_id ?? '';
  // An edit is kept against the saved choice it started from: when the server's choice
  // changes (the account was disconnected), the edit is dropped.
  const [draft, setDraft] = useState(null);
  const value = draft && draft.from === saved ? draft.value : saved;
  const current = connections.find((c) => c.id === saved);
  const options = [
    { value: '', label: 'Aurlynn' },
    ...connections
      .filter((c) => c.status === 'active' || c.id === saved)
      .map((c) => ({ value: c.id, label: `${c.name} (${carrierName(c.type)})${c.status === 'active' ? '' : ' – check failed'}` })),
  ];

  const save = async () => {
    try {
      await putSettings({ outbound_connection_id: value || null }).unwrap();
      setDraft(null);
      toast('Saved');
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };

  return (
    <div className="card card-pad stack">
      <div>
        <div className="card-title">Outbound calls go through</div>
        <div className="card-sub">The carrier that places your outbound campaigns’ calls. Aurlynn’s own carrier is used unless you pick one of your accounts.</div>
      </div>
      <Async state={settings} skeleton={<Skeleton h={40} />}>
        {() => (
          <>
            <div style={{ maxWidth: 440 }}>
              <Field label="Carrier for outbound calls">
                <Select value={value} options={options} onChange={(e) => setDraft({ from: saved, value: e.target.value })} />
              </Field>
            </div>
            {current && current.status !== 'active' && (
              <div className="banner warn" style={{ margin: 0 }}>
                <span className="grow">
                  {current.name} failed its last check: outbound calls can’t go through it until it passes. Check it again, or pick another carrier.
                </span>
              </div>
            )}
            <p className="muted small" style={{ margin: 0 }}>
              Calls go out for real through the account you pick, from one of its numbers. Through Aurlynn they are simulated until Aurlynn’s own
              carrier is connected.
            </p>
            <div className="row" style={{ gap: 8 }}>
              <Button variant="primary" icon={<Check />} loading={saving} disabled={value === saved} onClick={save}>
                Save
              </Button>
              {value !== saved && (
                <Button variant="ghost" onClick={() => setDraft(null)}>
                  Discard
                </Button>
              )}
            </div>
          </>
        )}
      </Async>
    </div>
  );
}
