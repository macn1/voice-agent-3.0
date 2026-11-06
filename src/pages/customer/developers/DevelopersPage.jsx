import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Ban,
  BarChart3,
  Braces,
  ChevronDown,
  ChevronRight,
  Eye,
  Gauge,
  KeyRound,
  Layers,
  Pause,
  PhoneForwarded,
  PhoneIncoming,
  PhoneOff,
  PhoneOutgoing,
  Play,
  Plus,
  Send,
  Share2,
  Terminal,
  Trash2,
  Webhook,
  Workflow,
  Zap,
} from 'lucide-react';
import { useCreateApiKeyMutation, useListApiKeysQuery, useRevokeApiKeyMutation } from '../../../store/api/authApi';
import {
  useCreateWebhookMutation,
  useDeleteWebhookMutation,
  useListWebhookDeliveriesQuery,
  useListWebhookEventsQuery,
  useListWebhooksQuery,
  useTestWebhookMutation,
  useUpdateWebhookMutation,
} from '../../../store/api/integrationApi';
import { dateTime, titleCase } from '../../../lib/format';
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
import { CopyField, Drawer, Select } from '../../../components/forms';
import { ClayIcon } from '../../../components/PixelHero';
import { API_BASE, PREFIX } from '../../../store/api/services';

// Where the APIs are: their own host when the dashboard is served elsewhere.
const API_ORIGIN = API_BASE || window.location.origin;

const DEPLOY_CARDS = [
  { icon: PhoneOutgoing, motion: 'fly', title: 'Instant outbound', description: 'Place a single outbound call with one API request', to: '?tab=quickstart' },
  { icon: Layers, motion: 'pulse', title: 'Batch outbound calling', description: 'Run outbound calling campaigns at scale', to: '/campaigns/new' },
  { icon: PhoneIncoming, motion: 'ring', title: 'Inbound deployments', description: 'Deploy an agent on a number to answer inbound calls', to: '/numbers' },
  { icon: BarChart3, motion: 'pulse', title: 'Data fetch', description: 'Fetch call outcomes, recordings, and transcripts', to: '?tab=webhooks' },
  { icon: Braces, motion: 'nudge', title: 'API reference', description: 'Every endpoint your code can call', to: '/docs' },
  { icon: PhoneOff, motion: 'ring', title: 'DND lists', description: 'Manage do not disturb lists', to: '/settings/do-not-call' },
];

const RECIPES = [
  { text: 'Mo', title: 'MoEngage', description: 'Trigger calls from MoEngage with a call trigger URL', to: '/workflows' },
  { icon: PhoneForwarded, motion: 'nudge', title: 'Outbound with inbound callback', description: 'Campaign with callback fallback', to: '/workflows' },
  { icon: Zap, motion: 'pulse', title: 'Zapier', description: 'Call from any Zap', to: '/integrations/zapier' },
  { text: 'M', italic: true, title: 'Make', description: 'Call from a scenario', to: '/integrations/make' },
  { icon: Share2, motion: 'pulse', title: 'HubSpot', description: 'Call from workflows', to: '/integrations/hubspot' },
  { icon: Workflow, motion: 'nudge', title: 'n8n', description: 'Call from a workflow with a call trigger URL', to: '/workflows' },
  { icon: Gauge, motion: 'pulse', title: 'Balancing rate limits', description: 'Pace calls under provider limits', to: '/settings/calling-rules' },
];

const CODING_TOOLS = ['Claude Code', 'Cursor', 'Windsurf', 'GitHub Copilot'];

/** P-32 Webhooks + P-33 Developers (INT-F1, DEV-01, DEV-02). Landing by default; ?tab= opens keys / webhooks / quickstart. */
export function DevelopersPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab');
  if (!tab) return <DeployLanding />;
  return (
    <>
      <Link to="/developers" className="back-link">
        <ArrowLeft /> Deploy with code
      </Link>
      <PageHeader
        eyebrow="Deploy"
        title="Deploy with code"
        description="API keys to start calls from your systems, webhooks to receive results, and copy-paste examples."
      />
      <SegmentTabs
        value={tab}
        onChange={(v) => setParams({ tab: v }, { replace: true })}
        items={[
          { value: 'keys', label: 'API keys' },
          { value: 'webhooks', label: 'Webhooks' },
          { value: 'quickstart', label: 'Quickstart' },
        ]}
      />

      {tab === 'keys' && <KeysTab />}
      {tab === 'webhooks' && <WebhooksTab />}
      {tab === 'quickstart' && <Quickstart />}
    </>
  );
}

function DeployLanding() {
  const navigate = useNavigate();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false);
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  const copySetup = async (tool) => {
    setOpen(false);
    const base = `${API_ORIGIN}${PREFIX.outbound}/api/v1`;
    const prompt = [
      'Set up Aurlynn voice agents in this project.',
      `- Auth: read the API key from the AURLYNN_API_KEY env var and exchange it for a short-lived access token: POST ${API_ORIGIN}${PREFIX.auth}/api/v1/auth/api-key/token with "Authorization: Bearer <API key>"; the token is data.access_token. Send "Authorization: Bearer <access token>" on every other request and get a new token when it expires.`,
      `- Start a call: POST ${base}/calls with { "agent_id", "to_number" (E.164), "variables" }`,
      `- Call status: GET ${base}/calls/{id}`,
      '- Responses are { success, data } or { success: false, error: { code, message } }.',
      '- Results: add a webhook for call.completed. The body is { id, type, created_at, tenant_id, data: { call_id, status, outcome, is_success, duration_seconds, summary, ... } }. Verify the X-Aurlynn-Signature header "t=<unix>,v1=<hex>": v1 is HMAC-SHA256 of "<t>.<raw body>" with the endpoint\'s signing secret.',
      `- Docs: ${window.location.origin}/docs`,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(prompt);
      toast(`Setup prompt copied — paste it into ${tool}`);
    } catch {
      toast('Could not copy to the clipboard', 'error');
    }
  };

  const go = (to) => navigate(to.startsWith('?') ? `/developers${to}` : to);

  return (
    <>
      <section className="code-hero">
        <h1>Build voice agents with code</h1>
        <div className="code-hero-actions">
          <div ref={ref} style={{ position: 'relative' }}>
            <Button size="sm" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
              Set up for AI coding tool <ChevronDown />
            </Button>
            {open && (
              <div className="dropdown" role="menu">
                {CODING_TOOLS.map((t) => (
                  <button key={t} className="dropdown-item" role="menuitem" onClick={() => copySetup(t)}>
                    <Terminal />
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Button size="sm" variant="primary" icon={<KeyRound />} onClick={() => navigate('/developers?tab=keys&create=1')}>
            Generate API key
          </Button>
        </div>
      </section>

      <section className="code-section">
        <h2>Deploy with APIs</h2>
        <div className="code-grid">
          {DEPLOY_CARDS.map((c) => (
            <button key={c.title} className="code-card" onClick={() => go(c.to)}>
              <ClayIcon icon={c.icon} motion={c.motion} size="sm" />
              <h3>{c.title}</h3>
              <p>{c.description}</p>
              <ChevronRight className="chev" aria-hidden />
            </button>
          ))}
        </div>
      </section>

      <section className="code-section">
        <h2>Recipes & Guides</h2>
        <div className="code-grid">
          {RECIPES.map((r) => (
            <button key={r.title} className="code-card row-card" onClick={() => go(r.to)}>
              <ClayIcon icon={r.icon} motion={r.motion} size="sm">
                {r.text && <span className={`clay-text ${r.italic ? 'italic' : ''}`}>{r.text}</span>}
              </ClayIcon>
              <span>
                <h3>{r.title}</h3>
                <p>{r.description}</p>
              </span>
              <ChevronRight className="chev" aria-hidden />
            </button>
          ))}
        </div>
      </section>
    </>
  );
}

const EXPIRY = [
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '365', label: '1 year' },
  { value: '', label: 'Never' },
];

function KeysTab() {
  const toast = useToast();
  const list = useListApiKeysQuery();
  const [createKey] = useCreateApiKeyMutation();
  const [revokeKey] = useRevokeApiKeyMutation();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [expiry, setExpiry] = useState('365');
  const [created, setCreated] = useState(null);
  const [revoking, setRevoking] = useState(null);
  const [busy, setBusy] = useState(false);
  const [params, setParams] = useSearchParams();

  // "Generate API key" on the landing links here with ?create=1.
  useEffect(() => {
    if (params.get('create') !== '1') return;
    setName('');
    setCreating(true);
    setParams({ tab: 'keys' }, { replace: true });
  }, [params, setParams]);

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>API keys</h2>
          <div className="card-sub">Secrets are shown once when created. Revoke a key the moment it may have leaked.</div>
        </div>
        <Button
          variant="primary"
          icon={<Plus />}
          onClick={() => {
            setName('');
            setCreating(true);
          }}
        >
          Create key
        </Button>
      </div>
      <Async state={list}>
        {(keys) =>
          keys.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Key</th>
                    <th>Access</th>
                    <th>Expires</th>
                    <th>Last used</th>
                    <th>Created</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {keys.map((k) => (
                    <tr key={k.id} style={k.revoked_at ? { opacity: 0.55 } : undefined}>
                      <td className="cell-main">
                        {k.name} {k.revoked_at && <Badge tone="red">Revoked</Badge>}
                      </td>
                      <td className="mono">{k.prefix ?? k.key_prefix}…</td>
                      <td className="muted small" title={(k.permissions ?? []).join(', ')}>
                        {(k.permissions ?? []).length} permissions
                      </td>
                      <td className="muted">{k.expires_at ? dateTime(k.expires_at) : 'Never'}</td>
                      <td className="muted">{k.last_used_at ? dateTime(k.last_used_at) : 'Never'}</td>
                      <td className="muted">{dateTime(k.created_at)}</td>
                      <td className="actions">
                        {!k.revoked_at && (
                          <Button size="sm" variant="ghost" icon={<Ban />} onClick={() => setRevoking(k)}>
                            Revoke
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon={<KeyRound />} title="No API keys" description="Create a key to start calls from your CRM or backend." />
          )
        }
      </Async>
      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Create API key"
        footer={
          <>
            <Button onClick={() => setCreating(false)}>Cancel</Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={!name.trim()}
              onClick={async () => {
                setBusy(true);
                try {
                  setCreated(await createKey({ name: name.trim(), ...(expiry ? { expires_in_days: Number(expiry) } : {}) }).unwrap());
                  setCreating(false);
                } catch (e) {
                  toast(errMsg(e), 'error');
                } finally {
                  setBusy(false);
                }
              }}
            >
              Create
            </Button>
          </>
        }
      >
        <div className="stack">
          <Field label="Name">
            <Input autoFocus value={name} placeholder="CRM sync" onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Expires after" hint="The key can use whatever you can, except managing people, keys, sub-accounts and billing.">
            <Select value={expiry} options={EXPIRY} onChange={(e) => setExpiry(e.target.value)} />
          </Field>
        </div>
      </Modal>
      <Modal
        open={!!created}
        onClose={() => setCreated(null)}
        title="Copy your key now"
        description="This is the only time the full key is shown."
        footer={
          <Button variant="primary" onClick={() => setCreated(null)}>
            I've saved it
          </Button>
        }
      >
        {created?.key && (
          <div className="stack">
            <CopyField value={created.key} />
            <p className="muted small" style={{ margin: 0 }}>
              Exchange it for a short-lived token with <span className="mono">POST /auth/api/v1/auth/api-key/token</span> and the body <span className="mono">{`{"api_key": "…"}`}</span>, then use that token as a Bearer token on any service.
            </p>
          </div>
        )}
      </Modal>
      <ConfirmDialog
        open={!!revoking}
        onClose={() => setRevoking(null)}
        danger
        title={`Revoke “${revoking?.name}”?`}
        description="Requests using it start failing immediately. This can't be undone."
        confirmLabel="Revoke key"
        onConfirm={async () => {
          await revokeKey(revoking.id).unwrap();
        }}
      />
    </div>
  );
}

const EVENTS = ['call.started', 'call.completed', 'call.failed', 'appointment.booked', 'message.received', 'campaign.completed'];

function WebhooksTab() {
  const toast = useToast();
  const list = useListWebhooksQuery();
  const [updateWebhook] = useUpdateWebhookMutation();
  const [deleteWebhook] = useDeleteWebhookMutation();
  const [editing, setEditing] = useState(null);
  const [secret, setSecret] = useState(null);
  const [logFor, setLogFor] = useState(null);
  const [removing, setRemoving] = useState(null);

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Webhook endpoints</h2>
          <div className="card-sub">We POST signed JSON to these URLs and retry on failure.</div>
        </div>
        <Button variant="primary" icon={<Plus />} onClick={() => setEditing({ url: '', events: ['call.completed'] })}>
          Add endpoint
        </Button>
      </div>
      <Async state={list}>
        {(eps) =>
          eps.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>URL</th>
                    <th>Events</th>
                    <th>Status</th>
                    <th>Last delivery</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {eps.map((w) => (
                    <tr key={w.id}>
                      <td className="mono small">{w.url}</td>
                      <td>
                        <div className="tag-list">
                          {w.events.map((e) => (
                            <span key={e} className="tag">
                              {e}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <StatusBadge status={w.status === 'disabled' ? 'pending' : w.fail_count > 0 ? 'failed' : 'active'} label={w.status === 'disabled' ? 'Paused' : w.fail_count > 0 ? `Failing (${w.fail_count})` : 'Active'} />
                        {w.description && <div className="cell-sub">{w.description}</div>}
                      </td>
                      <td className="muted">{dateTime(w.last_delivery_at)}</td>
                      <td className="actions">
                        <Button size="sm" variant="ghost" icon={<Eye />} onClick={() => setLogFor(w)}>
                          Deliveries
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={w.status === 'disabled' ? <Play /> : <Pause />}
                          title={w.status === 'disabled' ? 'Resume' : 'Pause'}
                          onClick={() =>
                            updateWebhook({ id: w.id, status: w.status === 'disabled' ? 'active' : 'disabled' })
                              .unwrap()
                              .catch((e) => toast(errMsg(e), 'error'))
                          }
                        />

                        <Button size="sm" variant="ghost" onClick={() => setEditing(w)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="ghost" icon={<Trash2 />} onClick={() => setRemoving(w)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon={<Webhook />} title="No webhooks" description="Send call results to your CRM, data warehouse or automation tool." />
          )
        }
      </Async>
      <WebhookEditor
        value={editing}
        onClose={() => setEditing(null)}
        onSaved={(w, isNew) => {
          if (isNew && w.secret) setSecret(w.secret);
        }}
      />

      <Modal
        open={!!secret}
        onClose={() => setSecret(null)}
        title="Signing secret"
        description="Use it to verify the X-Aurlynn-Signature header (t=<unix>,v1=<HMAC-SHA256 of 't.body'>). It's shown once, so copy it now."
        footer={
          <Button variant="primary" onClick={() => setSecret(null)}>
            Done
          </Button>
        }
      >
        {secret && <CopyField value={secret} />}
      </Modal>
      <DeliveriesDrawer endpoint={logFor} onClose={() => setLogFor(null)} />
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        danger
        title="Delete this endpoint?"
        description={removing?.url}
        confirmLabel="Delete"
        onConfirm={async () => {
          await deleteWebhook(removing.id).unwrap();
        }}
      />
    </div>
  );
}

function WebhookEditor({ value, onClose, onSaved }) {
  const [createWebhook] = useCreateWebhookMutation();
  const [updateWebhook] = useUpdateWebhookMutation();
  const [w, setW] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const eventsQ = useListWebhookEventsQuery();
  const events = eventsQ.data?.length ? eventsQ.data : EVENTS.map((key) => ({ key }));
  useEffect(() => {
    if (value) {
      setW(value);
      setError(null);
    }
  }, [value]);
  return (
    <Modal
      open={!!value}
      onClose={onClose}
      title={value?.id ? 'Edit endpoint' : 'Add endpoint'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              if (!/^https?:\/\/.+\..+/.test(w.url ?? '')) return setError('Enter a public http(s) address, e.g. https://hooks.example.com/voice');
              if (!w.events?.length) return setError('Pick at least one event');
              setBusy(true);
              setError(null);
              try {
                const saved = value?.id
                  ? await updateWebhook({ id: value.id, url: w.url, events: w.events, description: w.description ?? '' }).unwrap()
                  : await createWebhook({ url: w.url, events: w.events, ...(w.description ? { description: w.description } : {}) }).unwrap();
                onSaved(saved, !value?.id);
                onClose();
              } catch (e) {
                setError(errMsg(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="stack">
        {error && <div className="alert-inline">{error}</div>}
        <Field label="URL">
          <Input className="mono" placeholder="https://hooks.example.com/voice" value={w.url ?? ''} onChange={(e) => setW({ ...w, url: e.target.value })} />
        </Field>
        <div className="field">
          <span className="field-label">Events</span>
          <div className="perm-grid">
            {events.map(({ key: e, description }) => (
              <label key={e} className="check mono text-small" title={description}>
                <input
                  type="checkbox"
                  checked={(w.events ?? []).includes(e)}
                  onChange={(ev) =>
                    setW({
                      ...w,
                      events: ev.target.checked ? [...(w.events ?? []), e] : (w.events ?? []).filter((x) => x !== e),
                    })
                  }
                />
                {e}
              </label>
            ))}
          </div>
        </div>
        <Field label="Description" hint="Optional">
          <Input value={w.description ?? ''} onChange={(e) => setW({ ...w, description: e.target.value })} placeholder="Our CRM bridge" />
        </Field>
      </div>
    </Modal>
  );
}

function DeliveriesDrawer({ endpoint, onClose }) {
  const toast = useToast();
  const list = useListWebhookDeliveriesQuery(endpoint?.id, { skip: !endpoint });
  const [testWebhook] = useTestWebhookMutation();
  const [open, setOpen] = useState(null);
  return (
    <Drawer
      open={!!endpoint}
      onClose={onClose}
      width={640}
      title="Deliveries"
      subtitle={endpoint?.url}
      footer={
        <Button
          icon={<Send />}
          onClick={() =>
            testWebhook(endpoint.id)
              .unwrap()
              .then(() => toast('Test event sent'))
              .catch((e) => toast(errMsg(e), 'error'))
          }
        >
          Send test event
        </Button>
      }
    >
      <Async state={list}>
        {(ds) =>
          ds.length ? (
            <div className="table-wrap">
              <table className="table">
                <tbody>
                  {ds.map((d) => (
                    <tr key={d.id} className="clickable" onClick={() => setOpen(open?.id === d.id ? null : d)}>
                      <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                        {dateTime(d.created_at)}
                      </td>
                      <td className="mono small">{d.event_type}</td>
                      <td>
                        <Badge tone={d.status === 'delivered' ? 'green' : d.status === 'pending' ? 'amber' : 'red'}>
                          {d.response_code ?? titleCase(d.status)}
                        </Badge>
                      </td>
                      <td className="muted small">attempt {d.attempt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No deliveries yet" />
          )
        }
      </Async>
      {open && (
        <div className="stack" style={{ marginTop: 16 }}>
          {open.payload !== undefined && (
            <>
              <div className="field-label">Payload</div>
              <pre className="code">{JSON.stringify(open.payload, null, 2)}</pre>
            </>
          )}
          <div className="field-label">Response{open.response_code ? ` (${open.response_code})` : ''}</div>
          <pre className="code">{open.response_body ?? '—'}</pre>
        </div>
      )}
    </Drawer>
  );
}

function Quickstart() {
  const base = `${API_ORIGIN}${PREFIX.outbound}/api/v1`;
  const tokenUrl = `${API_ORIGIN}${PREFIX.auth}/api/v1/auth/api-key/token`;
  return (
    <div className="stack">
      <div className="card card-pad stack">
        <div className="card-title">1. Get an access token</div>
        <p className="muted small" style={{ margin: 0 }}>
          API keys aren't sent with each request: exchange yours for a short-lived access token, and get a new one when it expires.
        </p>
        <pre className="code">{`curl -X POST ${tokenUrl} \\
  -H "Authorization: Bearer $AURLYNN_API_KEY"
# { "success": true, "data": { "access_token": "…", ... } }`}</pre>
      </div>
      <div className="card card-pad stack">
        <div className="card-title">2. Start an outbound call</div>
        <pre className="code">{`curl -X POST ${base}/calls \\
  -H "Authorization: Bearer $AURLYNN_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "agent_id": "AGENT_ID",
    "to_number": "+919876543210",
    "variables": { "customer_name": "Priya", "amount_due": "4500" }
  }'`}</pre>
      </div>
      <div className="card card-pad stack">
        <div className="card-title">3. Check its status</div>
        <pre className="code">{`curl ${base}/calls/CALL_ID \\
  -H "Authorization: Bearer $AURLYNN_TOKEN"`}</pre>
      </div>
      <div className="card card-pad stack">
        <div className="card-title">4. Receive the result</div>
        <p className="muted small">
          Add a webhook for <span className="mono">call.completed</span>. You'll receive:
        </p>
        <pre className="code">{`{
  "id": "…",
  "type": "call.completed",
  "created_at": "2026-11-06T10:42:00Z",
  "tenant_id": "…",
  "data": {
    "call_id": "…",
    "agent_id": "…",
    "direction": "outbound",
    "to_number": "+919876543210",
    "status": "completed",
    "outcome": "callback_requested",
    "is_success": true,
    "duration_seconds": 142,
    "summary": "…",
    "started_at": "…",
    "ended_at": "…"
  }
}`}</pre>
        <p className="muted small">
          Verify the <span className="mono">X-Aurlynn-Signature</span> header, <span className="mono">t=&lt;unix&gt;,v1=&lt;hex&gt;</span>: v1 is HMAC-SHA256 of{' '}
          <span className="mono">&lt;t&gt;.&lt;raw body&gt;</span> with your endpoint's signing secret.
        </p>
      </div>
      <div className="card card-pad stack">
        <div className="card-title">Node.js</div>
        <pre className="code">{`const tokenRes = await fetch("${tokenUrl}", {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${process.env.AURLYNN_API_KEY}\`,
  },
});
const { data: auth } = await tokenRes.json();

const res = await fetch("${base}/calls", {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${auth.access_token}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ agent_id, to_number: "+919876543210", variables: {} }),
});
const { data } = await res.json();`}</pre>
      </div>
    </div>
  );
}
