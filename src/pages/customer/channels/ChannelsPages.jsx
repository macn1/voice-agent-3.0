import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bot, BookOpen, ExternalLink, Hand, Inbox as InboxIcon, MessageCircle, MessageSquare, Plus, Search, Send, Sparkles, Trash2, Undo2, Unplug, UserRound } from 'lucide-react';
import {
  useConnectWhatsappMutation,
  useConversationHandoffMutation,
  useCreateBroadcastMutation,
  useCreateMessageTemplateMutation,
  useDeleteMessageTemplateMutation,
  useDisconnectWhatsappMutation,
  useListBroadcastsQuery,
  useListConversationMessagesQuery,
  useListConversationsQuery,
  useListMessageTemplatesQuery,
  useListWhatsappAccountsQuery,
  useReplyToConversationMutation,
  useSetWhatsappCampaignMutation,
} from '../../../store/api/integrationApi';
import { useListContactListsQuery } from '../../../store/api/callsApi';
import { dateTime, number, titleCase } from '../../../lib/format';
import {
  Async,
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  errMsg,
  Field,
  formErrors,
  Input,
  Modal,
  PageHeader,
  SegmentTabs,
  StatusBadge,
  useToast,
} from '../../../components/ui';
import { CopyField, Select, Textarea } from '../../../components/forms';
import { ShareBar, SERIES } from '../../../components/charts';
import { PixelHero } from '../../../components/PixelHero';
import { asList } from '../../../lib/normalize';
import { useCampaignOptions } from '../shared';

/** P-26 WhatsApp setup (WA-01, WA-02, WA-03, WA-06.1). */
export function WhatsAppPage() {
  const [tab, setTab] = useState('connection');
  const [setup, setSetup] = useState(false);
  const accounts = useListWhatsappAccountsQuery();
  const none = accounts.isError || (accounts.isSuccess && asList(accounts.data).length === 0);

  if (none && !setup) {
    return (
      <PixelHero
        icon={MessageCircle}
        motion="ring"
        warm
        title="Follow up with every caller on WhatsApp"
        description="Connect a WhatsApp Business number to send follow-ups, run broadcasts and let your agents answer chats."
        actions={
          <>
            <Link to="/docs" className="btn">
              <BookOpen /> Read docs
            </Link>
            <Button variant="primary" icon={<Plus />} onClick={() => setSetup(true)}>
              Connect WhatsApp
            </Button>
          </>
        }
      />
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Connect"
        title="WhatsApp"
        description="Send follow-ups and broadcasts, and let your agents answer chats."
        actions={
          <>
            <Link to="/inbox" className="btn">
              <MessageSquare size={16} /> Inbox
            </Link>
            <Link to="/broadcasts" className="btn">
              <Send size={16} /> Broadcasts
            </Link>
          </>
        }
      />

      <SegmentTabs
        value={tab}
        onChange={setTab}
        items={[
          { value: 'connection', label: 'Connection' },
          { value: 'templates', label: 'Templates' },
          { value: 'chats', label: 'Chats' },
        ]}
      />

      {tab === 'connection' && <ConnectionTab accounts={accounts} />}
      {tab === 'templates' && <TemplatesTab accounts={accounts} />}
      {tab === 'chats' && <ChatsTab accounts={accounts} />}
    </>
  );
}

function ConnectionTab({ accounts }) {
  const [disconnectWhatsapp] = useDisconnectWhatsappMutation();
  const [removing, setRemoving] = useState(null);
  const [adding, setAdding] = useState(false);
  const [justConnected, setJustConnected] = useState(null);
  return (
    <Async state={accounts}>
      {(data) => {
        const list = asList(data);
        const hasReal = list.some((a) => !a.is_simulated);
        return (
          <div className="stack">
            {list.map((a) => (
              <AccountCard key={a.id} account={a} highlight={a.id === justConnected} onDisconnect={() => setRemoving(a)} />
            ))}
            {!hasReal || adding ? (
              <ConnectForm
                onCancel={hasReal ? () => setAdding(false) : undefined}
                onConnected={(a) => {
                  setAdding(false);
                  setJustConnected(a?.id ?? null);
                }}
              />
            ) : (
              <div>
                <Button icon={<Plus />} onClick={() => setAdding(true)}>
                  Connect another number
                </Button>
              </div>
            )}
            <ConfirmDialog
              open={!!removing}
              onClose={() => setRemoving(null)}
              danger
              title="Disconnect WhatsApp?"
              description="Follow-ups, broadcasts and chat replies on this number stop."
              confirmLabel="Disconnect"
              onConfirm={async () => {
                await disconnectWhatsapp(removing.id).unwrap();
              }}
            />
          </div>
        );
      }}
    </Async>
  );
}

function AccountCard({ account: a, highlight, onDisconnect }) {
  const ref = useRef(null);
  useEffect(() => {
    if (highlight) {
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [highlight]);
  return (
    <div ref={ref} className="card card-pad stack">
      <div className="row between wrap">
        <div className="row" style={{ gap: 16, minWidth: 0 }}>
          <span className="clay" style={{ width: 52, height: 52, borderRadius: 14, flexShrink: 0 }}>
            <MessageCircle />
          </span>
          <div style={{ minWidth: 0 }}>
            <div className="row wrap" style={{ gap: 8 }}>
              <span className="card-title">{a.display_name ?? a.phone}</span>
              <StatusBadge status={a.status === 'connected' ? 'active' : a.status} label={titleCase(a.status)} />
              {a.is_simulated && <Badge tone="amber">Demo number – not connected to Meta</Badge>}
            </div>
            <div className="muted mono small">{a.phone}</div>
            <div className="muted small">
              {!a.is_simulated && a.phone_number_id ? `Phone number ID ${a.phone_number_id} · ` : ''}Connected {dateTime(a.created_at)}
            </div>
          </div>
        </div>
        <Button variant="danger" icon={<Unplug />} onClick={onDisconnect}>
          Disconnect
        </Button>
      </div>
      {a.is_simulated && (
        <p className="muted small" style={{ margin: 0 }}>
          Messages on a demo number are simulated: nothing reaches WhatsApp. Disconnect it, and connect your real number from Meta.
        </p>
      )}
      {!a.is_simulated && a.webhook_url && <FinishInMeta account={a} />}
    </div>
  );
}

/** What to enter in the Meta app so customers' messages and template reviews reach Aurlynn. */
function FinishInMeta({ account }) {
  return (
    <div className="stack" style={{ gap: 12, borderTop: '1px solid var(--divider)', paddingTop: 16 }}>
      <div>
        <div className="card-title">Finish in Meta</div>
        <div className="card-sub">Do this once, so customers' messages and template reviews reach Aurlynn.</div>
      </div>
      <div className="form-grid">
        <Field label="Callback URL" className="full">
          <CopyField value={account.webhook_url} />
        </Field>
        <Field label="Verify token" className="full">
          <CopyField value={account.verify_token ?? ''} />
        </Field>
      </div>
      <ol className="small lh-spacious" style={{ margin: 0, paddingLeft: 20 }}>
        <li>
          In your app on{' '}
          <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer">
            Meta for Developers <ExternalLink size={12} />
          </a>
          , open <b>WhatsApp › Configuration</b>, and under <b>Webhook</b> click <b>Edit</b>.
        </li>
        <li>
          Paste the Callback URL and the Verify token above, then click <b>Verify and save</b>.
        </li>
        <li>
          Under <b>Webhook fields</b>, subscribe to <span className="mono">messages</span> and <span className="mono">message_template_status_update</span>.
        </li>
      </ol>
    </div>
  );
}

const WA_FIELDS = ['phone_number_id', 'waba_id', 'access_token', 'app_secret'];

/** Connect a real number from the company's own Meta app (WhatsApp Cloud API). */
function ConnectForm({ onConnected, onCancel }) {
  const toast = useToast();
  const [connectWhatsapp] = useConnectWhatsappMutation();
  const blank = { phone_number_id: '', waba_id: '', access_token: '', app_secret: '' };
  const [f, setF] = useState(blank);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => {
    setF({ ...f, [k]: e.target.value });
    if (errors[k]) setErrors({ ...errors, [k]: undefined });
  };

  const submit = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(WA_FIELDS.map((k) => [k, f[k].trim()]));
    // All four are needed: the API turns an empty request into a demo number.
    const missing = Object.fromEntries(WA_FIELDS.filter((k) => !body[k]).map((k) => [k, 'Required']));
    setError(null);
    setErrors(missing);
    if (Object.keys(missing).length) return;
    setBusy(true);
    try {
      const a = await connectWhatsapp(body).unwrap();
      setF(blank);
      toast('WhatsApp connected. Now finish the webhook setup in Meta.');
      onConnected?.(a);
    } catch (err) {
      const r = formErrors(err, WA_FIELDS);
      setErrors(r.fields);
      setError(r.general);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card card-pad stack" onSubmit={submit} noValidate>
      <div>
        <div className="card-title">Connect your WhatsApp Business number</div>
        <div className="card-sub">
          Through Meta's WhatsApp Cloud API, from your own Meta app. You need a Meta Business account and a number that isn't used in the WhatsApp app.
        </div>
      </div>
      <ol className="small lh-spacious" style={{ margin: 0, paddingLeft: 20 }}>
        <li>
          In{' '}
          <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer">
            Meta for Developers <ExternalLink size={12} />
          </a>
          , create a <b>Business</b> app and add the <b>WhatsApp</b> product.
        </li>
        <li>
          In <b>WhatsApp › API setup</b>, copy the <b>Phone number ID</b> and the <b>WhatsApp Business Account ID</b>.
        </li>
        <li>
          In{' '}
          <a href="https://business.facebook.com/settings/system-users" target="_blank" rel="noreferrer">
            Business settings › System users <ExternalLink size={12} />
          </a>
          , add an <b>admin</b> system user, give it the app and the WhatsApp account, and generate a <b>permanent token</b> with{' '}
          <span className="mono">whatsapp_business_messaging</span> and <span className="mono">whatsapp_business_management</span>.
        </li>
        <li>
          In <b>App settings › Basic</b>, copy the <b>App secret</b>.
        </li>
      </ol>
      <div className="form-grid">
        <Field label="Phone number ID" error={errors.phone_number_id}>
          <Input className="mono" inputMode="numeric" value={f.phone_number_id} invalid={!!errors.phone_number_id} onChange={set('phone_number_id')} autoComplete="off" />
        </Field>
        <Field label="WhatsApp Business Account ID" error={errors.waba_id}>
          <Input className="mono" inputMode="numeric" value={f.waba_id} invalid={!!errors.waba_id} onChange={set('waba_id')} autoComplete="off" />
        </Field>
        <Field label="Access token" hint="The system user's permanent token. Stored encrypted." error={errors.access_token}>
          <Input type="password" className="mono" value={f.access_token} invalid={!!errors.access_token} onChange={set('access_token')} autoComplete="new-password" />
        </Field>
        <Field label="App secret" hint="Checks that incoming messages really come from Meta. Stored encrypted." error={errors.app_secret}>
          <Input type="password" className="mono" value={f.app_secret} invalid={!!errors.app_secret} onChange={set('app_secret')} autoComplete="new-password" />
        </Field>
      </div>
      {error && <div className="alert-inline">{error}</div>}
      <div className="row wrap" style={{ gap: 8 }}>
        <Button variant="primary" type="submit" loading={busy}>
          {busy ? 'Checking with Meta…' : 'Connect'}
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

// Template review states (Meta's, for a real number).
const TEMPLATE_STATUS = {
  pending: ['pending', 'In review'],
  approved: ['active', 'Approved'],
  rejected: ['failed', 'Rejected'],
  paused: ['expired', 'Paused'],
  disabled: ['disabled', 'Disabled'],
};

function TemplatesTab({ accounts }) {
  const toast = useToast();
  const real = asList(accounts.data).some((a) => !a.is_simulated);
  const [poll, setPoll] = useState(0);
  const list = useListMessageTemplatesQuery(undefined, { pollingInterval: poll });
  const [deleteTemplate] = useDeleteMessageTemplateMutation();
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(null);
  useEffect(() => setPoll(list.data?.some((t) => t.status === 'pending') ? 10000 : 0), [list.data]);
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Message templates</h2>
          <div className="card-sub">
            WhatsApp requires approved templates to message someone outside a 24-hour reply window.
            {real && ' Meta reviews each new template; that can take from a few minutes to a few hours.'}
          </div>
        </div>
        <Button variant="primary" icon={<Plus />} onClick={() => setEditing(true)}>
          New template
        </Button>
      </div>
      <Async state={list}>
        {(ts) =>
          ts.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Template</th>
                    <th>Channel</th>
                    <th>Category</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {ts.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <div className="cell-main mono">{t.name}</div>
                        <div
                          className="cell-sub"
                          style={{
                            maxWidth: 420,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {t.body}
                        </div>
                      </td>
                      <td>
                        {titleCase(t.channel)} · {t.language}
                      </td>
                      <td>{titleCase(t.category)}</td>
                      <td>
                        <StatusBadge status={TEMPLATE_STATUS[t.status]?.[0] ?? 'pending'} label={TEMPLATE_STATUS[t.status]?.[1] ?? titleCase(t.status)} />
                        {t.reject_reason && (
                          <div className="cell-sub" style={{ color: 'var(--red)' }}>
                            {t.reject_reason}
                          </div>
                        )}
                      </td>
                      <td className="actions">
                        <Button size="sm" variant="ghost" icon={<Trash2 />} onClick={() => setRemoving(t)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No templates" />
          )
        }
      </Async>
      <TemplateEditor open={editing} onClose={() => setEditing(false)} onSaved={() => toast(real ? 'Sent to Meta for review' : 'Submitted for approval')} />

      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        danger
        title={`Delete ${removing?.name}?`}
        confirmLabel="Delete"
        onConfirm={async () => {
          await deleteTemplate(removing.id).unwrap();
        }}
      />
    </div>
  );
}

function TemplateEditor({ open, onClose, onSaved }) {
  const [createTemplate] = useCreateMessageTemplateMutation();
  const blank = {
    channel: 'whatsapp',
    name: '',
    language: 'en',
    category: 'utility',
    body: 'Hi {{1}}, ',
    variables: [],
    buttons: [],
  };
  const [t, setT] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (open) {
      setT(blank);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const placeholders = useMemo(() => [...new Set([...t.body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => m[1]))], [t.body]);
  const preview = t.body.replace(/\{\{(\d+)\}\}/g, (_, n) => `[${t.variables[Number(n) - 1] || `var ${n}`}]`);

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="New template"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              if (!/^[a-z0-9_]+$/.test(t.name)) return setError('Name: lowercase letters, numbers and underscores');
              if (!t.body.trim()) return setError('Write the message');
              setBusy(true);
              setError(null);
              try {
                await createTemplate({
                  ...t,
                  variables: placeholders.map((p) => t.variables[Number(p) - 1] ?? `var_${p}`),
                }).unwrap();
                onSaved();
                onClose();
              } catch (e) {
                setError(errMsg(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Submit for review
          </Button>
        </>
      }
    >
      <div className="row" style={{ gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div className="stack" style={{ flex: 1, minWidth: 280 }}>
          {error && <div className="alert-inline">{error}</div>}
          <div className="form-grid">
            <Field label="Name">
              <Input className="mono" value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} placeholder="appointment_confirmation" />
            </Field>
            <Field label="Language">
              <Select
                value={t.language}
                options={['en', 'hi', 'ta', 'te', 'kn', 'ml', 'mr', 'bn', 'gu']}
                onChange={(e) => setT({ ...t, language: e.target.value })}
              />
            </Field>
            <Field label="Category">
              <Select value={t.category} options={['utility', 'marketing', 'authentication']} onChange={(e) => setT({ ...t, category: e.target.value })} />
            </Field>
          </div>
          <Field label="Message" hint="Use {{1}}, {{2}}… for values filled in at send time.">
            <Textarea rows={4} value={t.body} onChange={(e) => setT({ ...t, body: e.target.value })} />
          </Field>
          {placeholders.length > 0 && (
            <div className="field">
              <span className="field-label">Fill placeholders from call variables</span>
              {placeholders.map((p) => (
                <div key={p} className="row" style={{ gap: 8 }}>
                  <span className="mono" style={{ width: 48 }}>{`{{${p}}}`}</span>
                  <Input
                    placeholder="customer_name"
                    value={t.variables[Number(p) - 1] ?? ''}
                    onChange={(e) => {
                      const v = [...t.variables];
                      v[Number(p) - 1] = e.target.value;
                      setT({ ...t, variables: v });
                    }}
                  />
                </div>
              ))}
            </div>
          )}
          <div className="field">
            <span className="field-label">Buttons</span>
            {t.buttons.map((b, i) => (
              <div key={i} className="row" style={{ gap: 8 }}>
                <Select
                  style={{ width: 150 }}
                  value={b.type}
                  options={[
                    { value: 'quick_reply', label: 'Quick reply' },
                    { value: 'url', label: 'Website' },
                    { value: 'call', label: 'Call' },
                  ]}
                  onChange={(e) =>
                    setT({
                      ...t,
                      buttons: t.buttons.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)),
                    })
                  }
                />
                <Input
                  placeholder="Text"
                  value={b.text}
                  onChange={(e) =>
                    setT({
                      ...t,
                      buttons: t.buttons.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)),
                    })
                  }
                />
                {b.type !== 'quick_reply' && (
                  <Input
                    placeholder={b.type === 'url' ? 'https://' : '+91…'}
                    value={b.value ?? ''}
                    onChange={(e) =>
                      setT({
                        ...t,
                        buttons: t.buttons.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)),
                      })
                    }
                  />
                )}
                <Button size="sm" variant="ghost" icon={<Trash2 />} onClick={() => setT({ ...t, buttons: t.buttons.filter((_, j) => j !== i) })} />
              </div>
            ))}
            {t.buttons.length < 3 && (
              <div>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Plus />}
                  onClick={() =>
                    setT({
                      ...t,
                      buttons: [...t.buttons, { type: 'quick_reply', text: '' }],
                    })
                  }
                >
                  Add button
                </Button>
              </div>
            )}
          </div>
        </div>
        <div>
          <div className="field-label" style={{ marginBottom: 8 }}>
            Preview
          </div>
          <div className="phone-preview">
            <div className="wa">{preview}</div>
            {t.buttons.map((b, i) => (
              <div key={i} className="wa-btn">
                {b.text || 'Button'}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function ChatsTab({ accounts }) {
  const toast = useToast();
  const [setWhatsappCampaign] = useSetWhatsappCampaignMutation();
  const { campaigns, loading } = useCampaignOptions();
  return (
    <Async state={accounts}>
      {(data) => {
        const list = asList(data);
        return list.length ? (
          <div className="stack">
            {list.map((a) => (
              <ChatCampaignCard
                key={`${a.id}:${a.campaign_id ?? ''}`}
                account={a}
                campaigns={campaigns}
                loading={loading}
                onSave={(campaign_id) =>
                  setWhatsappCampaign({ id: a.id, campaign_id })
                    .unwrap()
                    .then(() => toast(campaign_id ? 'Saved: the campaign answers chats on this number' : 'Saved: staff answer chats in the Inbox'))
                    .catch((e) => toast(errMsg(e), 'error'))
                }
              />
            ))}
          </div>
        ) : (
          <div className="card">
            <EmptyState title="Connect WhatsApp first" />
          </div>
        );
      }}
    </Async>
  );
}

function ChatCampaignCard({ account, campaigns, loading, onSave }) {
  const [campaign, setCampaign] = useState(account.campaign_id ?? '');
  const [saving, setSaving] = useState(false);
  const current = campaigns.find((c) => c.id === account.campaign_id);
  // Published campaigns first: chats are answered from the published version, so a campaign never published stays silent.
  const options = [...campaigns]
    .sort((a, b) => (a.status === 'draft' ? 1 : 0) - (b.status === 'draft' ? 1 : 0) || a.name.localeCompare(b.name))
    .map((c) => ({ value: c.id, label: `${c.name}${c.agent_name ? ` · ${c.agent_name}` : ''}${c.status === 'draft' ? " (not published: won't answer)" : ''}` }));
  if (account.campaign_id && !current && !loading) options.unshift({ value: account.campaign_id, label: 'Deleted campaign' });
  const changed = campaign !== (account.campaign_id ?? '');
  return (
    <div className="card card-pad stack">
      <div>
        <div className="row wrap" style={{ gap: 8 }}>
          <span className="card-title">{account.display_name ?? account.phone}</span>
          {account.is_simulated && <Badge tone="amber">Demo number – not connected to Meta</Badge>}
        </div>
        <div className="muted mono small">{account.phone}</div>
      </div>
      <p className="small" style={{ margin: 0 }}>
        {account.campaign_id ? (
          <>
            Answered now by <b>{current ? current.name : 'a deleted campaign'}</b>
            {current?.agent_name ? ` (${current.agent_name})` : ''}.
            {current?.status === 'draft' && (
              <span style={{ color: 'var(--red)' }}> It isn't published yet, so it doesn't answer: publish it first.</span>
            )}
          </>
        ) : (
          'No campaign answers chats on this number: staff reply in the Inbox.'
        )}
      </p>
      <div className="form-grid">
        <Field
          label="Campaign that answers chats"
          hint="Its agent replies from the campaign's published version (instructions, knowledge and tools), until a person takes the conversation over in the Inbox."
        >
          <Select value={campaign} options={options} placeholder="Nobody: staff answer in the Inbox" onChange={(e) => setCampaign(e.target.value)} />
        </Field>
      </div>
      <div className="row wrap" style={{ gap: 8 }}>
        <Button
          variant="primary"
          loading={saving}
          disabled={!changed}
          onClick={async () => {
            setSaving(true);
            try {
              await onSave(campaign || null);
            } finally {
              setSaving(false);
            }
          }}
        >
          Save
        </Button>
        {campaigns.some((c) => c.id === campaign) && (
          <Link to={`/campaigns/${campaign}/channels`} className="btn ghost">
            Reply style, hours & hand-over keywords
          </Link>
        )}
      </div>
    </div>
  );
}

/** P-27 Inbox with human takeover (WA-04). */
export function InboxPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [filter, setFilter] = useState('');
  const list = useListConversationsQuery({ status: filter || undefined }, { pollingInterval: 10000 });
  const allQ = useListConversationsQuery({}, { pollingInterval: 10000 });
  const [search, setSearch] = useState('');
  const [active, setActive] = useState(null);
  const msgs = useListConversationMessagesQuery(active?.id, { skip: !active, pollingInterval: 10000 });
  const templates = useListMessageTemplatesQuery();
  const [handoff] = useConversationHandoffMutation();
  const [reply] = useReplyToConversationMutation();
  const [text, setText] = useState('');
  const [tpl, setTpl] = useState('');
  const [tplVars, setTplVars] = useState([]);
  const end = useRef(null);
  useEffect(() => {
    end.current?.scrollIntoView();
  }, [msgs.data]);

  const windowClosed = active?.window_expires_at ? Date.parse(active.window_expires_at) < Date.now() : false;
  const update = (c) => setActive(c); // the list refetches via cache invalidation
  const all = asList(allQ.data);
  const counts = { open: all.filter((c) => c.status === 'open').length, human: all.filter((c) => c.status === 'human').length };
  const unread = all.reduce((n, c) => n + Number(c.unread_count ?? 0), 0);
  const initials = (n = '?') =>
    String(n)
      .replace(/[^\p{L}\p{N} ]/gu, '')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase() || '#';
  const empty = !filter && (list.isError || (list.isSuccess && asList(list.data).length === 0));

  if (empty) {
    return (
      <PixelHero
        icon={InboxIcon}
        motion="pulse"
        title="Every customer chat, in one inbox"
        description="Connect WhatsApp so customers can message you. Agents reply automatically, and you can take over any time."
        actions={
          <>
            <Link to="/docs" className="btn">
              <BookOpen /> Read docs
            </Link>
            <Button variant="primary" icon={<MessageCircle />} onClick={() => navigate('/channels/whatsapp')}>
              Set up WhatsApp
            </Button>
          </>
        }
      />
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Connect"
        title="Inbox"
        description="WhatsApp conversations. Agents reply automatically; take over any time and hand back when done."
      />
      <div className="ib-stats">
        {[
          { k: 'total', icon: MessageSquare, label: 'Conversations', value: all.length, tone: 'blue' },
          { k: 'open', icon: Bot, label: 'With the AI agent', value: counts.open, tone: 'green' },
          { k: 'human', icon: UserRound, label: 'With your team', value: counts.human, tone: 'orange' },
          { k: 'unread', icon: Sparkles, label: 'Unread messages', value: unread, tone: 'amber' },
        ].map((t) => (
          <div key={t.k} className={`ib-stat tone-${t.tone}`}>
            <span className="ib-stat-icon">
              <t.icon size={17} />
            </span>
            <div>
              <b>{number(t.value)}</b>
              <span>{t.label}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="card ib-shell">
        <div className="inbox">
          <div className="inbox-list">
            <div className="ib-list-head">
              <div className="ib-search">
                <Search size={15} />
                <input placeholder="Search name or number" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <div className="ib-pills">
                {[
                  ['', 'All'],
                  ['open', 'AI agent'],
                  ['human', 'Staff'],
                  ['closed', 'Closed'],
                ].map(([v, l]) => (
                  <button key={v} type="button" className={filter === v ? 'on' : ''} onClick={() => setFilter(v)}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <Async state={list}>
              {(cs) => {
                const q = search.trim().toLowerCase();
                const shown = cs.filter((c) => `${c.contact_name ?? ''} ${c.contact_address ?? ''}`.toLowerCase().includes(q));
                return shown.length ? (
                  <div className="ib-items">
                    {shown.map((c) => (
                      <button key={c.id} className={`inbox-item ib-item ${active?.id === c.id ? 'active' : ''}`} onClick={() => setActive(c)}>
                        <span className={`ib-avatar st-${c.status}`}>{initials(c.contact_name ?? c.contact_address)}</span>
                        <span className="ib-item-body">
                          <span className="ib-item-top">
                            <b>{c.contact_name ?? c.contact_address}</b>
                            <time>{dateTime(c.last_message_at)}</time>
                          </span>
                          <span className="ib-item-msg">{c.last_message}</span>
                          <span className="ib-item-foot">
                            <span className={`ib-tag st-${c.status}`}>
                              {c.status === 'human' ? 'With staff' : c.status === 'open' ? 'AI agent' : titleCase(c.status)}
                            </span>
                            {c.unread_count > 0 && <span className="ib-unread">{c.unread_count}</span>}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <EmptyState title="No conversations" />
                );
              }}
            </Async>
          </div>
          <div className="ib-main">
            {active ? (
              <>
                <div className="card-head ib-chat-head">
                  <div className="ib-chat-who">
                    <span className={`ib-avatar lg st-${active.status}`}>{initials(active.contact_name ?? active.contact_address)}</span>
                    <div>
                      <h2>{active.contact_name ?? active.contact_address}</h2>
                      <div className="card-sub mono">{active.contact_address}</div>
                    </div>
                    <span className={`ib-live st-${active.status}`}>
                      <i /> {active.status === 'human' ? 'You are live' : active.status === 'open' ? 'AI agent replying' : 'Closed'}
                    </span>
                  </div>
                  {active.status === 'human' ? (
                    <Button
                      size="sm"
                      icon={<Undo2 />}
                      onClick={() =>
                        handoff({ id: active.id, action: 'release' })
                          .unwrap()
                          .then(update)
                          .catch((e) => toast(errMsg(e), 'error'))
                      }
                    >
                      Hand back to agent
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="primary"
                      icon={<Hand />}
                      onClick={() =>
                        handoff({ id: active.id, action: 'takeover' })
                          .unwrap()
                          .then(update)
                          .catch((e) => toast(errMsg(e), 'error'))
                      }
                    >
                      Take over
                    </Button>
                  )}
                </div>
                <div className="chat ib-chat">
                  <Async state={msgs}>
                    {(ms) => (
                      <>
                        {ms.map((m) => (
                          <div key={m.id} className={`bubble ${m.direction === 'in' ? 'them' : m.sender === 'system' ? 'sys' : 'me'}`}>
                            {m.body}
                            <div className="meta">
                              {m.direction === 'out' ? `${titleCase(m.sender)} · ` : ''}
                              {dateTime(m.created_at)}
                            </div>
                            {m.status === 'failed' && (
                              <div className="meta" style={{ color: 'var(--red)' }}>
                                Not sent{m.error ? `: ${m.error}` : ''}
                              </div>
                            )}
                          </div>
                        ))}
                        <div ref={end} />
                      </>
                    )}
                  </Async>
                </div>
                <div className="ib-composer">
                  {windowClosed ? (
                    <div className="row wrap" style={{ gap: 8 }}>
                      <span className="muted small" style={{ flex: 1 }}>
                        The 24-hour reply window has closed — only approved templates can be sent.
                      </span>
                      <Select
                        style={{ width: 220 }}
                        value={tpl}
                        options={(templates.data ?? []).filter((t) => t.status === 'approved').map((t) => ({ value: t.id, label: t.name }))}
                        placeholder="Choose template"
                        onChange={(e) => {
                          setTpl(e.target.value);
                          setTplVars([]);
                        }}
                      />
                      {[...new Set([...((templates.data ?? []).find((t) => t.id === tpl)?.body ?? '').matchAll(/\{\{(\d+)\}\}/g)].map((m) => m[1]))].map((n) => (
                        <Input
                          key={n}
                          style={{ width: 140 }}
                          placeholder={`{{${n}}}`}
                          value={tplVars[Number(n) - 1] ?? ''}
                          onChange={(e) => {
                            const v = [...tplVars];
                            v[Number(n) - 1] = e.target.value;
                            setTplVars(v);
                          }}
                        />
                      ))}
                      <Button
                        variant="primary"
                        disabled={!tpl}
                        onClick={() =>
                          reply({ id: active.id, template_id: tpl, variables: tplVars.map((v) => v ?? '') })
                            .unwrap()
                            .then(() => {
                              setTpl('');
                              setTplVars([]);
                            })
                            .catch((e) => toast(errMsg(e), 'error'))
                        }
                      >
                        Send
                      </Button>
                    </div>
                  ) : (
                    <form
                      className="row ib-form"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (!text.trim()) return;
                        try {
                          await reply({ id: active.id, body: text.trim() }).unwrap();
                          setText('');
                        } catch (err) {
                          toast(errMsg(err), 'error');
                        }
                      }}
                    >
                      <Input
                        placeholder={active.status === 'human' ? 'Type a reply…' : 'Replying takes over from the agent…'}
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                      />
                      <Button variant="primary" type="submit" icon={<Send />}>
                        Send
                      </Button>
                    </form>
                  )}
                </div>
              </>
            ) : (
              <div className="ib-pick">
                <span className="ib-pick-orb">
                  <MessageSquare size={26} />
                </span>
                <h3>Select a conversation</h3>
                <p>Pick a chat on the left to read it, take over from the AI agent, or hand it back.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/** P-28 Broadcasts (WA-05). */
export function BroadcastsPage() {
  const toast = useToast();
  const list = useListBroadcastsQuery();
  const templates = useListMessageTemplatesQuery();
  const lists = useListContactListsQuery();
  const accounts = useListWhatsappAccountsQuery();
  const [createBroadcast] = useCreateBroadcastMutation();
  const [creating, setCreating] = useState(false);
  const [f, setF] = useState({
    name: '',
    template_id: '',
    contact_list_id: '',
    variables: [],
  });
  const [step, setStep] = useState(0);
  const approved = (templates.data ?? []).filter((t) => t.status === 'approved');
  const tpl = approved.find((t) => t.id === f.template_id);
  const list_ = (lists.data ?? []).find((l) => l.id === f.contact_list_id);

  return (
    <>
      <PageHeader
        eyebrow="Connect"
        title="Broadcasts"
        description="Send an approved WhatsApp template to a contact list. People who opted out are skipped."
        actions={
          <Button
            variant="primary"
            icon={<Plus />}
            onClick={() => {
              setF({
                name: '',
                template_id: '',
                contact_list_id: '',
                variables: [],
              });
              setStep(0);
              setCreating(true);
            }}
          >
            New broadcast
          </Button>
        }
      />

      <div className="card">
        <Async state={list}>
          {(bs) =>
            bs.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Broadcast</th>
                      <th>Status</th>
                      <th style={{ width: 280 }}>Delivery</th>
                      <th className="num">Replied</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bs.map((b) => (
                      <tr key={b.id}>
                        <td>
                          <div className="cell-main">{b.name}</div>
                          <div className="cell-sub">
                            {(templates.data ?? []).find((t) => t.id === b.template_id)?.name ?? 'Template'} → {number(b.recipient_count)} recipients · {dateTime(b.completed_at ?? b.created_at)}
                          </div>
                        </td>
                        <td>
                          <StatusBadge
                            status={['done', 'sent'].includes(b.status) ? 'active' : b.status === 'scheduled' || b.status === 'sending' ? 'pending' : b.status}
                            label={titleCase(b.status)}
                          />
                        </td>
                        <td>
                          {b.stats.sent ? (
                            <ShareBar
                              parts={[
                                {
                                  label: 'Read',
                                  value: b.stats.read,
                                  color: SERIES[2],
                                },
                                {
                                  label: 'Delivered',
                                  value: Math.max(0, b.stats.delivered - b.stats.read),
                                  color: SERIES[0],
                                },
                                {
                                  label: 'Sent',
                                  value: Math.max(0, b.stats.sent - b.stats.delivered - b.stats.failed),
                                  color: '#b8b6b1',
                                },
                                {
                                  label: 'Failed',
                                  value: b.stats.failed,
                                  color: SERIES[1],
                                },
                              ]}
                            />
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td className="num">{number(b.stats.replied)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState icon={<Send />} title="No broadcasts yet" />
            )
          }
        </Async>
      </div>
      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        wide
        title="New broadcast"
        description={['Choose the contact list', 'Choose the template', 'Schedule'][step]}
        footer={
          <>
            <Button disabled={step === 0} onClick={() => setStep(step - 1)}>
              Back
            </Button>
            {step < 2 ? (
              <Button variant="primary" disabled={(step === 0 && !f.contact_list_id) || (step === 1 && !f.template_id)} onClick={() => setStep(step + 1)}>
                Continue
              </Button>
            ) : (
              <Button
                variant="primary"
                disabled={!f.name.trim()}
                onClick={async () => {
                  try {
                    // A real number first: a demo number's messages are only simulated.
                    const list = asList(accounts.data);
                    const account = list.find((a) => !a.is_simulated && a.status === 'connected') ?? list[0];
                    if (!account) throw new Error('Connect a WhatsApp number first');
                    await createBroadcast({
                      name: f.name.trim(),
                      account_id: account.id,
                      template_id: f.template_id,
                      contact_list_id: f.contact_list_id,
                      variables: f.variables.map((v) => v ?? ''),
                    }).unwrap();
                    toast('Broadcast sent');
                    setCreating(false);
                  } catch (e) {
                    toast(errMsg(e), 'error');
                  }
                }}
              >
                Send now
              </Button>
            )}
          </>
        }
      >
        {step === 0 && (
          <Field label="Contact list">
            <Select
              value={f.contact_list_id}
              options={(lists.data ?? []).map((l) => ({
                value: l.id,
                label: `${l.name} (${l.member_count ?? l.count ?? 0})`,
              }))}
              placeholder="Choose"
              onChange={(e) => setF({ ...f, contact_list_id: e.target.value })}
            />
          </Field>
        )}
        {step === 1 && (
          <div className="row" style={{ gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <Field label="Approved template" className="grow">
              <Select
                value={f.template_id}
                options={approved.map((t) => ({ value: t.id, label: t.name }))}
                placeholder={approved.length ? 'Choose' : 'No approved templates'}
                onChange={(e) => setF({ ...f, template_id: e.target.value })}
              />
            </Field>
            {tpl && (
              <div className="phone-preview">
                <div className="wa">{tpl.body}</div>
                {(tpl.buttons ?? []).map((b, i) => (
                  <div key={i} className="wa-btn">
                    {b.text}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {step === 2 && (
          <div className="stack">
            <Field label="Name">
              <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Diwali timings" />
            </Field>
            {[...new Set([...(tpl?.body ?? '').matchAll(/\{\{(\d+)\}\}/g)].map((m) => m[1]))].map((n) => (
              <Field key={n} label={`Value for {{${n}}}`} hint={tpl?.examples?.[Number(n) - 1] ? `e.g. ${tpl.examples[Number(n) - 1]}` : undefined}>
                <Input
                  value={f.variables[Number(n) - 1] ?? ''}
                  onChange={(e) => {
                    const v = [...f.variables];
                    v[Number(n) - 1] = e.target.value;
                    setF({ ...f, variables: v });
                  }}
                />
              </Field>
            ))}
            <div className="banner neutral" style={{ margin: 0 }}>
              <span className="grow">
                {tpl?.name} → {list_?.name} ({list_?.member_count ?? list_?.count ?? 0} contacts). Contacts on the do-not-call list are left out.
              </span>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
