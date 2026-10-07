import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Ban, Eye, KeyRound, Pause, Play, Plus, RefreshCw, Send, Trash2, Webhook } from 'lucide-react';
import { useCreateApiKeyMutation, useListApiKeysQuery, useRevokeApiKeyMutation } from '../../../store/api/authApi';
import {
  useCreateWebhookMutation,
  useDeleteWebhookMutation,
  useListWebhookDeliveriesQuery,
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
import { CopyField, Drawer } from '../../../components/forms';
import { PREFIX } from '../../../store/api/services';

/** P-32 Webhooks + P-33 Developers (INT-F1, DEV-01, DEV-02). */
export function DevelopersPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'keys';
  return (
    <>
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

const SCOPES = ['calls:write', 'calls:read', 'contacts:write', 'contacts:read', 'campaigns:write', 'analytics:read'];

function KeysTab() {
  const toast = useToast();
  const list = useListApiKeysQuery();
  const [createKey] = useCreateApiKeyMutation();
  const [revokeKey] = useRevokeApiKeyMutation();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState(['calls:write', 'calls:read']);
  const [created, setCreated] = useState(null);
  const [revoking, setRevoking] = useState(null);
  const [busy, setBusy] = useState(false);

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
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Key</th>
                  <th>Scopes</th>
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
                    <td className="mono">{k.key_prefix}…</td>
                    <td>
                      <div className="tag-list">
                        {k.scopes.map((s) => (
                          <span key={s} className="tag">
                            {s}
                          </span>
                        ))}
                      </div>
                    </td>
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
              disabled={!name.trim() || !scopes.length}
              onClick={async () => {
                setBusy(true);
                try {
                  setCreated(await createKey({ name: name.trim(), scopes }).unwrap());
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
          <div className="field">
            <span className="field-label">Scopes</span>
            <div className="perm-grid">
              {SCOPES.map((s) => (
                <label key={s} className="check mono" style={{ fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={scopes.includes(s)}
                    onChange={(e) => setScopes(e.target.checked ? [...scopes, s] : scopes.filter((x) => x !== s))}
                  />
                  {s}
                </label>
              ))}
            </div>
          </div>
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
        {created?.secret && <CopyField value={created.secret} />}
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
                      <StatusBadge status={w.status === 'failing' ? 'failed' : w.status === 'paused' ? 'pending' : 'active'} label={titleCase(w.status)} />
                    </td>
                    <td className="muted">{dateTime(w.last_delivery_at)}</td>
                    <td className="actions">
                      <Button size="sm" variant="ghost" icon={<Eye />} onClick={() => setLogFor(w)}>
                        Deliveries
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={w.status === 'paused' ? <Play /> : <Pause />}
                        title={w.status === 'paused' ? 'Resume' : 'Pause'}
                        onClick={() =>
                          updateWebhook({ id: w.id, status: w.status === 'paused' ? 'active' : 'paused' })
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
        description="Use it to verify our signature header. It's shown once — regenerate it from Edit if you lose it."
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
  const toast = useToast();
  const [createWebhook] = useCreateWebhookMutation();
  const [updateWebhook] = useUpdateWebhookMutation();
  const [w, setW] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [newSecret, setNewSecret] = useState(null);
  useEffect(() => {
    if (value) {
      setW(value);
      setError(null);
      setNewSecret(null);
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
              if (!/^https:\/\//.test(w.url ?? '')) return setError('The URL must start with https://');
              if (!w.events?.length) return setError('Pick at least one event');
              setBusy(true);
              setError(null);
              try {
                const saved = value?.id
                  ? await updateWebhook({ id: value.id, url: w.url, events: w.events }).unwrap()
                  : await createWebhook({ url: w.url, events: w.events }).unwrap();
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
            {EVENTS.map((e) => (
              <label key={e} className="check mono" style={{ fontSize: 13 }}>
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
        {value?.id && (
          <div className="field">
            <span className="field-label">Signing secret</span>
            {newSecret ? (
              <CopyField value={newSecret} />
            ) : (
              <div>
                <Button
                  size="sm"
                  icon={<RefreshCw />}
                  onClick={async () => {
                    try {
                      const r = await updateWebhook({ id: value.id, regenerate_secret: true }).unwrap();
                      setNewSecret(r.secret ?? '');
                    } catch (e) {
                      toast(errMsg(e), 'error');
                    }
                  }}
                >
                  Regenerate secret
                </Button>
              </div>
            )}
          </div>
        )}
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
          ) : (
            <EmptyState title="No deliveries yet" />
          )
        }
      </Async>
      {open && (
        <div className="stack" style={{ marginTop: 16 }}>
          <div className="field-label">Payload</div>
          <pre className="code">{JSON.stringify(open.payload, null, 2)}</pre>
          <div className="field-label">Response</div>
          <pre className="code">{open.response_body ?? '—'}</pre>
        </div>
      )}
    </Drawer>
  );
}

function Quickstart() {
  const base = `${window.location.origin}${PREFIX.outbound}/api/v1`;
  return (
    <div className="stack">
      <div className="card card-pad stack">
        <div className="card-title">1. Start an outbound call</div>
        <pre className="code">{`curl -X POST ${base}/calls \\
  -H "Authorization: Bearer $AURLYNN_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "agent_id": "AGENT_ID",
    "to": "+919876543210",
    "variables": { "customer_name": "Priya", "amount_due": "4500" }
  }'`}</pre>
      </div>
      <div className="card card-pad stack">
        <div className="card-title">2. Check its status</div>
        <pre className="code">{`curl ${base}/calls/CALL_ID \\
  -H "Authorization: Bearer $AURLYNN_API_KEY"`}</pre>
      </div>
      <div className="card card-pad stack">
        <div className="card-title">3. Receive the result</div>
        <p className="muted small">
          Add a webhook for <span className="mono">call.completed</span>. You'll receive:
        </p>
        <pre className="code">{`{
  "event": "call.completed",
  "call_id": "…",
  "agent_id": "…",
  "status": "completed",
  "duration_seconds": 142,
  "outcome": "booked",
  "summary": "Caller booked a dermatology slot for Friday 6:30 PM.",
  "extracted": { "appointment_booked": true },
  "recording_url": "https://…"
}`}</pre>
        <p className="muted small">
          Verify the <span className="mono">X-Aurlynn-Signature</span> header: HMAC-SHA256 of the raw body with your endpoint's signing secret.
        </p>
      </div>
      <div className="card card-pad stack">
        <div className="card-title">Node.js</div>
        <pre className="code">{`const res = await fetch("${base}/calls", {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${process.env.AURLYNN_API_KEY}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ agent_id, to: "+919876543210", variables: {} }),
});
const { data } = await res.json();`}</pre>
      </div>
    </div>
  );
}
