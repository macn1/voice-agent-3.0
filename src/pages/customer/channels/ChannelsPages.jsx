import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Hand, MessageCircle, MessageSquare, Plus, Send, Smartphone, Trash2, Undo2, Unplug } from 'lucide-react';
import {
  useConnectSmsMutation,
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
  useListSmsSendersQuery,
  useListWhatsappAccountsQuery,
  useReplyToConversationMutation,
  useSetWhatsappAgentMutation,
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
  Input,
  Modal,
  PageHeader,
  SegmentTabs,
  StatusBadge,
  useToast,
} from '../../../components/ui';
import { Select, Textarea } from '../../../components/forms';
import { ShareBar, SERIES } from '../../../components/charts';
import { useAgentOptions } from '../shared';

/** P-26 WhatsApp setup (WA-01, WA-02, WA-03, WA-06.1). */
export function WhatsAppPage() {
  const [tab, setTab] = useState('connection');
  const accounts = useListWhatsappAccountsQuery();
  return (
    <>
      <PageHeader
        eyebrow="Connect"
        title="WhatsApp & SMS"
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
          { value: 'agent', label: 'Chat agent' },
          { value: 'sms', label: 'SMS' },
        ]}
      />

      {tab === 'connection' && <ConnectionTab accounts={accounts} />}
      {tab === 'templates' && <TemplatesTab />}
      {tab === 'agent' && <ChatAgentTab accounts={accounts} />}
      {tab === 'sms' && <SmsTab />}
    </>
  );
}

function ConnectionTab({ accounts }) {
  const toast = useToast();
  const [connectWhatsapp] = useConnectWhatsappMutation();
  const [disconnectWhatsapp] = useDisconnectWhatsappMutation();
  const [f, setF] = useState({ display_name: '', phone: '', business_id: '' });
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(null);
  return (
    <Async state={accounts}>
      {(list) =>
        list.length ? (
          <div className="stack">
            {list.map((a) => (
              <div key={a.id} className="card card-pad row between wrap">
                <div className="row" style={{ gap: 16 }}>
                  <span className="clay" style={{ width: 52, height: 52, borderRadius: 14 }}>
                    <MessageCircle />
                  </span>
                  <div>
                    <div className="row" style={{ gap: 8 }}>
                      <span className="card-title">{a.display_name}</span>
                      <StatusBadge status={a.status === 'connected' ? 'active' : a.status} label={titleCase(a.status)} />
                    </div>
                    <div className="muted mono small">{a.phone}</div>
                    <div className="muted small">Connected {dateTime(a.created_at)}</div>
                  </div>
                </div>
                <Button variant="danger" icon={<Unplug />} onClick={() => setRemoving(a)}>
                  Disconnect
                </Button>
              </div>
            ))}
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
        ) : (
          <div className="card card-pad stack">
            <div className="card-title">Connect your WhatsApp Business number</div>
            <p className="muted small">You'll need a WhatsApp Business Account in Meta Business Manager and a number not already used in the WhatsApp app.</p>
            <div className="form-grid">
              <Field label="Display name">
                <Input value={f.display_name} onChange={(e) => setF({ ...f, display_name: e.target.value })} />
              </Field>
              <Field label="Phone number">
                <Input className="mono" placeholder="+919845012345" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
              </Field>
              <Field label="WhatsApp Business Account ID" className="full">
                <Input className="mono" value={f.business_id} onChange={(e) => setF({ ...f, business_id: e.target.value })} />
              </Field>
            </div>
            <div>
              <Button
                variant="primary"
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await connectWhatsapp(f).unwrap();
                    toast('WhatsApp connected');
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
        )
      }
    </Async>
  );
}

function TemplatesTab() {
  const toast = useToast();
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
          <div className="card-sub">WhatsApp requires approved templates to message someone outside a 24-hour reply window.</div>
        </div>
        <Button variant="primary" icon={<Plus />} onClick={() => setEditing(true)}>
          New template
        </Button>
      </div>
      <Async state={list}>
        {(ts) =>
          ts.length ? (
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
                      <StatusBadge status={t.status === 'approved' ? 'active' : t.status === 'rejected' ? 'failed' : 'pending'} label={titleCase(t.status)} />
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
          ) : (
            <EmptyState title="No templates" />
          )
        }
      </Async>
      <TemplateEditor open={editing} onClose={() => setEditing(false)} onSaved={() => toast('Submitted for approval')} />

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
    category: 'UTILITY',
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
            Submit for approval
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
            <Field label="Channel">
              <Select value={t.channel} options={['whatsapp', 'sms', 'email']} onChange={(e) => setT({ ...t, channel: e.target.value })} />
            </Field>
            <Field label="Language">
              <Select
                value={t.language}
                options={['en', 'hi', 'ta', 'te', 'kn', 'ml', 'mr', 'bn', 'gu']}
                onChange={(e) => setT({ ...t, language: e.target.value })}
              />
            </Field>
            <Field label="Category">
              <Select value={t.category} options={['UTILITY', 'MARKETING', 'AUTHENTICATION']} onChange={(e) => setT({ ...t, category: e.target.value })} />
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

function ChatAgentTab({ accounts }) {
  const toast = useToast();
  const [setWhatsappAgent] = useSetWhatsappAgentMutation();
  const { options } = useAgentOptions();
  return (
    <Async state={accounts}>
      {(list) =>
        list.length ? (
          <div className="stack">
            {list.map((a) => (
              <ChatAgentCard
                key={a.id}
                account={a}
                options={options}
                onSave={(agent_id, settings) =>
                  setWhatsappAgent({ id: a.id, agent_id, chat_settings: settings })
                    .unwrap()
                    .then(() => toast('Saved'))
                    .catch((e) => toast(errMsg(e), 'error'))
                }
              />
            ))}
          </div>
        ) : (
          <div className="card">
            <EmptyState title="Connect WhatsApp first" />
          </div>
        )
      }
    </Async>
  );
}

function ChatAgentCard({ account, options, onSave }) {
  const [agent, setAgent] = useState(account.agent_id ?? '');
  const [s, setS] = useState(account.chat_settings);
  return (
    <div className="card card-pad stack">
      <div className="card-title">{account.display_name}</div>
      <div className="form-grid">
        <Field label="Agent that answers chats" hint="Uses the same persona, company profile, rules, knowledge and tools.">
          <Select value={agent} options={options} placeholder="Nobody — humans answer in the Inbox" onChange={(e) => setAgent(e.target.value)} />
        </Field>
        <Field label="Reply style">
          <Input value={s.reply_style ?? ''} onChange={(e) => setS({ ...s, reply_style: e.target.value })} />
        </Field>
        <Field label="Working hours">
          <Input value={s.working_hours ?? ''} placeholder="24x7, or Mon–Sat 9–20" onChange={(e) => setS({ ...s, working_hours: e.target.value })} />
        </Field>
        <Field label="Away message">
          <Input value={s.away_message ?? ''} onChange={(e) => setS({ ...s, away_message: e.target.value })} />
        </Field>
      </div>
      <div>
        <Button variant="primary" onClick={() => onSave(agent || null, s)}>
          Save
        </Button>
      </div>
    </div>
  );
}

function SmsTab() {
  const toast = useToast();
  const list = useListSmsSendersQuery();
  const [connectSms] = useConnectSmsMutation();
  const [provider, setProvider] = useState('msg91');
  const [sender, setSender] = useState('');
  return (
    <div className="stack">
      <div className="card">
        <div className="card-head">
          <h2>SMS senders</h2>
        </div>
        <Async state={list}>
          {(xs) =>
            xs.length ? (
              <table className="table">
                <tbody>
                  {xs.map((x) => (
                    <tr key={x.id}>
                      <td className="cell-main">{x.display_name ?? x.phone}</td>
                      <td>{x.provider}</td>
                      <td>
                        <StatusBadge status={x.status === 'connected' ? 'active' : x.status} label={titleCase(x.status)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState icon={<Smartphone />} title="No SMS sender" />
            )
          }
        </Async>
      </div>
      <div className="card card-pad stack">
        <div className="card-title">Connect an SMS sender</div>
        <div className="form-grid">
          <Field label="Provider">
            <Select value={provider} options={['msg91', 'twilio', 'gupshup', 'kaleyra']} onChange={(e) => setProvider(e.target.value)} />
          </Field>
          <Field label="Sender ID (DLT approved)">
            <Input value={sender} onChange={(e) => setSender(e.target.value)} placeholder="CAREFR" />
          </Field>
        </div>
        <div>
          <Button
            variant="primary"
            disabled={!sender.trim()}
            onClick={() =>
              connectSms({ provider, sender_id: sender.trim() })
                .unwrap()
                .then(() => toast('SMS sender connected'))
                .catch((e) => toast(errMsg(e), 'error'))
            }
          >
            Connect
          </Button>
        </div>
      </div>
    </div>
  );
}

/** P-27 Inbox with human takeover (WA-04). */
export function InboxPage() {
  const toast = useToast();
  const [filter, setFilter] = useState('');
  const list = useListConversationsQuery({ status: filter || undefined }, { pollingInterval: 10000 });
  const [active, setActive] = useState(null);
  const msgs = useListConversationMessagesQuery(active?.id, { skip: !active, pollingInterval: 10000 });
  const templates = useListMessageTemplatesQuery();
  const [handoff] = useConversationHandoffMutation();
  const [reply] = useReplyToConversationMutation();
  const [text, setText] = useState('');
  const [tpl, setTpl] = useState('');
  const end = useRef(null);
  useEffect(() => end.current?.scrollIntoView(), [msgs.data]);

  const windowClosed = active?.window_expires_at ? Date.parse(active.window_expires_at) < Date.now() : false;
  const update = (c) => setActive(c); // the list refetches via cache invalidation

  return (
    <>
      <PageHeader
        eyebrow="Connect"
        title="Inbox"
        description="WhatsApp conversations. Agents reply automatically; take over any time and hand back when done."
      />
      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="inbox">
          <div className="inbox-list">
            <div style={{ padding: 12, borderBottom: '1px solid var(--divider)' }}>
              <Select
                value={filter}
                options={[
                  { value: 'needs_human', label: 'Needs a human' },
                  { value: 'human', label: 'With staff' },
                  { value: 'agent', label: 'With agent' },
                  { value: 'closed', label: 'Closed' },
                ]}
                placeholder="All conversations"
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>
            <Async state={list}>
              {(cs) =>
                cs.length ? (
                  <>
                    {cs.map((c) => (
                      <button key={c.id} className={`inbox-item ${active?.id === c.id ? 'active' : ''}`} onClick={() => setActive(c)}>
                        <div className="row between">
                          <b style={{ fontSize: 14 }}>{c.contact_name ?? c.contact_address}</b>
                          {c.unread_count > 0 && <span className="badge orange plain">{c.unread_count}</span>}
                        </div>
                        <div
                          className="muted small"
                          style={{
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {c.last_message}
                        </div>
                        <div className="row between" style={{ marginTop: 4 }}>
                          <Badge tone={c.status === 'needs_human' ? 'red' : c.status === 'human' ? 'blue' : ''}>
                            {c.status === 'needs_human' ? 'Needs human' : titleCase(c.status)}
                          </Badge>
                          <span className="muted" style={{ fontSize: 11.5 }}>
                            {dateTime(c.last_message_at)}
                          </span>
                        </div>
                      </button>
                    ))}
                  </>
                ) : (
                  <EmptyState title="No conversations" />
                )
              }
            </Async>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 560 }}>
            {active ? (
              <>
                <div className="card-head">
                  <div>
                    <h2>{active.contact_name ?? active.contact_address}</h2>
                    <div className="card-sub mono">{active.contact_address}</div>
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
                <div
                  className="chat"
                  style={{
                    flex: 1,
                    padding: 20,
                    overflowY: 'auto',
                    maxHeight: 460,
                  }}
                >
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
                          </div>
                        ))}
                        <div ref={end} />
                      </>
                    )}
                  </Async>
                </div>
                <div style={{ padding: 16, borderTop: '1px solid var(--divider)' }}>
                  {windowClosed ? (
                    <div className="row" style={{ gap: 8 }}>
                      <span className="muted small" style={{ flex: 1 }}>
                        The 24-hour reply window has closed — only approved templates can be sent.
                      </span>
                      <Select
                        style={{ width: 220 }}
                        value={tpl}
                        options={(templates.data ?? [])
                          .filter((t) => t.status === 'approved' && t.channel === 'whatsapp')
                          .map((t) => ({ value: t.id, label: t.name }))}
                        placeholder="Choose template"
                        onChange={(e) => setTpl(e.target.value)}
                      />
                      <Button
                        variant="primary"
                        disabled={!tpl}
                        onClick={() =>
                          reply({ id: active.id, body: '', template_id: tpl })
                            .unwrap()
                            .then(() => setTpl(''))
                            .catch((e) => toast(errMsg(e), 'error'))
                        }
                      >
                        Send
                      </Button>
                    </div>
                  ) : (
                    <form
                      className="row"
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
              <EmptyState icon={<MessageSquare />} title="Pick a conversation" />
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
  const [createBroadcast] = useCreateBroadcastMutation();
  const [creating, setCreating] = useState(false);
  const [f, setF] = useState({
    name: '',
    template_id: '',
    contact_list_id: '',
    scheduled_at: '',
  });
  const [step, setStep] = useState(0);
  const approved = (templates.data ?? []).filter((t) => t.status === 'approved' && t.channel === 'whatsapp');
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
                scheduled_at: '',
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
                          {b.template_name ?? b.template_id} → {b.list_name ?? b.contact_list_id} · {dateTime(b.scheduled_at)}
                        </div>
                      </td>
                      <td>
                        <StatusBadge
                          status={b.status === 'done' ? 'active' : b.status === 'scheduled' || b.status === 'sending' ? 'pending' : b.status}
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
                                value: b.stats.delivered - b.stats.read,
                                color: SERIES[0],
                              },
                              {
                                label: 'Sent',
                                value: b.stats.sent - b.stats.delivered - b.stats.failed,
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
                    await createBroadcast({
                      name: f.name.trim(),
                      template_id: f.template_id,
                      contact_list_id: f.contact_list_id,
                      scheduled_at: f.scheduled_at ? new Date(f.scheduled_at).toISOString() : null,
                    }).unwrap();
                    toast(f.scheduled_at ? 'Broadcast scheduled' : 'Broadcast sending');
                    setCreating(false);
                  } catch (e) {
                    toast(errMsg(e), 'error');
                  }
                }}
              >
                {f.scheduled_at ? 'Schedule' : 'Send now'}
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
                label: `${l.name} (${l.count})`,
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
                {tpl.buttons.map((b, i) => (
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
            <Field label="Send at" hint="Leave empty to send now.">
              <input type="datetime-local" className="input" value={f.scheduled_at} onChange={(e) => setF({ ...f, scheduled_at: e.target.value })} />
            </Field>
            <div className="banner neutral" style={{ margin: 0 }}>
              <span className="grow">
                {tpl?.name} → {list_?.name} ({list_?.count} contacts)
              </span>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
