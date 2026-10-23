import { Fragment, useEffect, useRef, useState } from 'react';
import { downloadAuthed } from '../../../store/api/baseQuery';
import { useNavigate } from 'react-router-dom';
import { Download, KeyRound, Mic2, Plus, Search, Trash2, Upload, Volume2, Wallet as WalletIcon, Building, ArrowRightLeft } from 'lucide-react';
import {
  useChangePasswordMutation,
  useCreateSubAccountMutation,
  useGetPrivacyQuery,
  useListSubAccountsQuery,
  useListPrivacyDeleteRequestsQuery,
  usePrivacyDeleteRequestMutation,
  usePutPrivacyMutation,
  useSwitchSubAccountMutation,
} from '../../../store/api/authApi';
import { useGetWalletQuery, useListStaffQuery, useListWalletTransactionsQuery, useSetAutoRechargeMutation, useTopUpWalletMutation } from '../../../store/api/customerApi';
import { useAddDndMutation, useGetCallingRulesQuery, useListDndQuery, usePutCallingRulesMutation, useRemoveDndMutation } from '../../../store/api/callsApi';
import {
  useCreateExportMutation,
  useListAuditLogQuery,
  useListExportsQuery,
  useListScheduledReportsQuery,
  usePutScheduledReportsMutation,
} from '../../../store/api/analyticsApi';
import { useGetNotificationSettingsQuery, usePutNotificationSettingsMutation } from '../../../store/api/integrationApi';
import {
  useCreateCustomVoiceMutation,
  useDeleteCustomVoiceMutation,
  useListCustomVoicesQuery,
  useListPronunciationsQuery,
  usePutPronunciationsMutation,
} from '../../../store/api/flowApi';
import { dateTime, money, slugify, titleCase } from '../../../lib/format';
import { Async, Button, ConfirmDialog, EmptyState, errMsg, Field, Input, Modal, Pager, StatusBadge, Toggle, useToast } from '../../../components/ui';
import { ListEditor, parseCsv, readFileText, SectionCard, Select, useSection, WeekdayPicker } from '../../../components/forms';
import { LanguageSelect } from '../agents/pickers';

/* Notifications (QTY-04.1) ---------------------------------------------- */

const EVENT_LABEL = {
  'call.failed': 'A call fails',
  'call.needs_review': 'A call is flagged for review',
  'usage.80': 'Usage reaches 80% of the plan',
  'campaign.finished': 'A campaign finishes',
  'conversation.needs_human': 'A chat needs a human',
  'integration.error': 'An integration or crawl fails',
};

export function NotificationSettingsPage() {
  const s = useSection(useGetNotificationSettingsQuery(), usePutNotificationSettingsMutation());
  return (
    <SectionCard title="Notifications" description="Which alerts you get, and where." section={s}>
      {(v, _p, set) => {
        const events = [...new Set([...Object.keys(EVENT_LABEL), ...Object.keys(v.preferences)])];
        return (
          <div className="table-wrap">
            <table className="table" style={{ margin: '-8px -24px' }}>
              <thead>
                <tr>
                  <th>Alert</th>
                  <th style={{ textAlign: 'center' }}>In-app</th>
                  <th style={{ textAlign: 'center' }}>Email</th>
                  <th style={{ textAlign: 'center' }}>WhatsApp</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => {
                  const p = v.preferences[e] ?? {
                    email: false,
                    whatsapp: false,
                    in_app: true,
                  };
                  const toggle = (k) =>
                    set({
                      preferences: {
                        ...v.preferences,
                        [e]: { ...p, [k]: !p[k] },
                      },
                    });
                  return (
                    <tr key={e}>
                      <td>{EVENT_LABEL[e] ?? e}</td>
                      {['in_app', 'email', 'whatsapp'].map((k) => (
                        <td key={k} style={{ textAlign: 'center' }}>
                          <input type="checkbox" checked={p[k]} onChange={() => toggle(k)} />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      }}
    </SectionCard>
  );
}

/* Do-not-call (CALL-04) ------------------------------------------------- */

export function DoNotCallPage() {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const list = useListDndQuery({ q: q || undefined, limit: 50, offset });
  const [addDnd] = useAddDndMutation();
  const [removeDnd] = useRemoveDndMutation();
  const [adding, setAdding] = useState(false);
  const [phones, setPhones] = useState([]);
  const [reason, setReason] = useState('');
  const fileRef = useRef(null);

  const add = async (ps) => {
    try {
      const r = await addDnd({ phones: ps, reason: reason || undefined }).unwrap();
      toast(`${r.added} numbers blocked`);
      setAdding(false);
      setPhones([]);
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Do-not-call list</h2>
          <div className="card-sub">These numbers are never dialed by campaigns, triggers or manual calls.</div>
        </div>
        <div className="row">
          <div className="search">
            <Search />
            <Input
              placeholder="Search number"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setOffset(0);
              }}
            />
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              const text = await readFileText(f);
              const { headers, rows } = parseCsv(text);
              const col = headers.find((h) => /phone|number|mobile/i.test(h));
              const nums = col ? rows.map((r) => r[col]) : text.split(/[\s,;]+/);
              void add(nums.map((n) => n.trim()).filter(Boolean));
            }}
          />

          <Button size="sm" icon={<Upload />} onClick={() => fileRef.current?.click()}>
            Bulk upload
          </Button>
          <Button size="sm" variant="primary" icon={<Plus />} onClick={() => setAdding(true)}>
            Add
          </Button>
        </div>
      </div>
      <Async state={list}>
        {(p) => (
          <>
            {p.items.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Number</th>
                      <th>Reason</th>
                      <th>Source</th>
                      <th>Added</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {p.items.map((d) => (
                      <tr key={d.id}>
                        <td className="mono cell-main">{d.phone}</td>
                        <td>{d.reason ?? '—'}</td>
                        <td>{titleCase(d.source)}</td>
                        <td className="muted">{dateTime(d.created_at)}</td>
                        <td className="actions">
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<Trash2 />}
                            onClick={() =>
                              removeDnd(d.id)
                                .unwrap()
                                .catch((e) => toast(errMsg(e), 'error'))
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="No blocked numbers" />
            )}
            <Pager offset={offset} limit={50} count={p.items.length} total={p.total} onChange={setOffset} />
          </>
        )}
      </Async>
      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Block numbers"
        footer={
          <>
            <Button onClick={() => setAdding(false)}>Cancel</Button>
            <Button variant="primary" disabled={!phones.length} onClick={() => add(phones)}>
              Block {phones.length || ''}
            </Button>
          </>
        }
      >
        <div className="stack">
          <Field label="Numbers" hint="International format, press Enter after each.">
            <ListEditor value={phones} onChange={setPhones} placeholder="+919876543210" mono />
          </Field>
          <Field label="Reason">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Customer request" />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

/* Calling rules (CMP-03) ------------------------------------------------ */

const TIMEZONES = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'Australia/Sydney', 'UTC'];

export function CallingRulesPage() {
  const s = useSection(useGetCallingRulesQuery(), usePutCallingRulesMutation());
  return (
    <SectionCard title="Calling rules" description="Company-wide limits every outbound call obeys. Campaigns use these hours unless they set their own." section={s}>
      {(r, patch) => (
        <>
          <div className="field">
            <span className="field-label">Allowed days</span>
            <WeekdayPicker value={r.allowed_windows.days} onChange={(days) => patch({ allowed_windows: { ...r.allowed_windows, days } })} />
          </div>
          <div className="form-grid">
            <Field label="Earliest call">
              <input
                type="time"
                className="input"
                value={r.allowed_windows.from}
                onChange={(e) =>
                  patch({
                    allowed_windows: {
                      ...r.allowed_windows,
                      from: e.target.value,
                    },
                  })
                }
              />
            </Field>
            <Field label="Latest call">
              <input
                type="time"
                className="input"
                value={r.allowed_windows.to}
                onChange={(e) =>
                  patch({
                    allowed_windows: {
                      ...r.allowed_windows,
                      to: e.target.value,
                    },
                  })
                }
              />
            </Field>
            <Field label="Time zone" hint="The hours above are in this time zone">
              <Select value={r.timezone} options={TIMEZONES.includes(r.timezone) ? TIMEZONES : [r.timezone, ...TIMEZONES]} onChange={(e) => patch({ timezone: e.target.value })} />
            </Field>
            <Field label="Max attempts per number per day" hint="Empty = no limit">
              <Input
                type="number"
                min={1}
                value={r.max_attempts_per_day ?? ''}
                onChange={(e) =>
                  patch({
                    max_attempts_per_day: e.target.value ? Number(e.target.value) : null,
                  })
                }
              />
            </Field>
            <Field label="Max attempts per number per week">
              <Input
                type="number"
                min={1}
                value={r.max_attempts_per_week ?? ''}
                onChange={(e) =>
                  patch({
                    max_attempts_per_week: e.target.value ? Number(e.target.value) : null,
                  })
                }
              />
            </Field>
          </div>
        </>
      )}
    </SectionCard>
  );
}

/* Privacy (CMP-02) ------------------------------------------------------ */


const deletionSummary = (r = {}) => {
  const o = r.outbound ?? {};
  const parts = [
    [r.calls_deleted, 'calls'],
    [r.transcript_lines_deleted, 'transcript lines'],
    [r.reviews_deleted, 'reviews'],
    [o.contacts_deleted, 'contacts'],
    [o.scheduled_calls_deleted, 'scheduled calls'],
  ].filter(([n]) => n > 0);
  return parts.length ? `removed ${parts.map(([n, l]) => `${n} ${l}`).join(', ')}` : 'nothing was stored for this number';
};

function DeleteRequestHistory() {
  const list = useListPrivacyDeleteRequestsQuery();
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Deletion requests</h2>
          <div className="card-sub">Numbers are masked in this list.</div>
        </div>
      </div>
      <Async state={list}>
        {(rows) =>
          rows.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Number</th>
                    <th>Status</th>
                    <th>Result</th>
                    <th>Requested</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="mono">{r.phone}</td>
                      <td>
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="muted">{deletionSummary(r.result)}</td>
                      <td className="muted">{dateTime(r.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No deletion requests yet" />
          )
        }
      </Async>
    </div>
  );
}

export function PrivacyPage() {
  const toast = useToast();
  const s = useSection(useGetPrivacyQuery(), usePutPrivacyMutation());
  const [deleteRequest] = usePrivacyDeleteRequestMutation();
  const [phone, setPhone] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState(null);
  return (
    <div className="stack">
      <SectionCard title="Privacy" description="Mask sensitive data and decide how long recordings and transcripts are kept." section={s}>
        {(p, patch) => (
          <>
            <Toggle checked={p.record_calls} onChange={(v) => patch({ record_calls: v })} label="Record calls" />
            {p.record_calls && (
              <>
                <Toggle checked={p.announce_recording} onChange={(v) => patch({ announce_recording: v })} label="Tell callers the call is recorded" />
                {p.announce_recording && (
                  <Field label="What the agent says" hint="Spoken at the start of the call">
                    <Input value={p.consent_message ?? ''} onChange={(e) => patch({ consent_message: e.target.value })} />
                  </Field>
                )}
              </>
            )}
            <Toggle checked={p.store_transcripts} onChange={(v) => patch({ store_transcripts: v })} label="Keep transcripts" />
            <Toggle checked={p.redact_pii} onChange={(v) => patch({ redact_pii: v })} label="Mask sensitive data in transcripts" />
            <div className="form-grid">
              <Field label="Keep recordings for (days)" hint="Empty = keep forever">
                <Input
                  type="number"
                  min={1}
                  value={p.recording_retention_days ?? ''}
                  onChange={(e) =>
                    patch({
                      recording_retention_days: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                />
              </Field>
              <Field label="Keep transcripts for (days)" hint="Empty = keep forever">
                <Input
                  type="number"
                  min={1}
                  value={p.transcript_retention_days ?? ''}
                  onChange={(e) =>
                    patch({
                      transcript_retention_days: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                />
              </Field>
            </div>
          </>
        )}
      </SectionCard>
      <div className="card card-pad stack">
        <div>
          <div className="card-title">Delete a caller's data</div>
          <div className="card-sub">Removes calls, recordings, transcripts and the contact for this number. This can't be undone.</div>
        </div>
        <div className="row">
          <Input className="mono" style={{ maxWidth: 260 }} placeholder="+919876543210" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Button variant="danger" disabled={!/^\+\d{8,15}$/.test(phone)} onClick={() => setConfirming(true)}>
            Delete data
          </Button>
        </div>
        {result && <div className="banner info" style={{ margin: 0 }}>
          <span className="grow">
            Request {result.status} for {result.phone}: {deletionSummary(result.result)}.
          </span>
        </div>}
      </div>
      <DeleteRequestHistory />
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        danger
        title={`Delete all data for ${phone}?`}
        description="Calls, transcripts, reviews and the contact record for this number are permanently removed."
        confirmLabel="Delete permanently"
        onConfirm={async () => {
          setResult(await deleteRequest(phone).unwrap());
          toast('Deletion requested');
        }}
      />
    </div>
  );
}

/* Activity log (CMP-04.1) ----------------------------------------------- */

const AUDIT_SERVICES = [
  { value: 'auth', label: 'Team & access' },
  { value: 'billing', label: 'Billing' },
  { value: 'flow', label: 'Agents' },
  { value: 'outbound', label: 'Campaigns & calls' },
  { value: 'inbound', label: 'Numbers' },
  { value: 'telephony', label: 'Telephony' },
  { value: 'integration', label: 'Integrations' },
  { value: 'analytics', label: 'Analytics & privacy' },
  { value: 'orchestrator', label: 'Call runtime' },
];

const shortId = (id) => (id ? `${String(id).slice(0, 8)}…` : '—');

/**
 * Audit log: successful changes across every service. Each row carries
 * action (e.g. campaigns.start), entity_type / entity_id, actor_type / actor_id,
 * service and detail { method, route, status, ip }. Filters are action prefix,
 * service, and (admin) tenant_id.
 *
 * `actors` maps actor ids to names and `tenants` tenant ids to company names,
 * when the caller has them; otherwise ids are shown shortened.
 */
export function ActivityLogPage({ useLog = useListAuditLogQuery, showTenant = false, tenantId, tenantOptions, actors: given, tenants }) {
  // The company's own log names people from its staff list.
  const staff = useListStaffQuery(undefined, { skip: !!given || showTenant });
  const actors = given ?? new Map((staff.data?.items ?? staff.data ?? []).map((x) => [x.id, x.name]));
  const [action, setAction] = useState('');
  const [service, setService] = useState('');
  const [tenant, setTenant] = useState('');
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState(null);
  const reset = (fn) => (e) => {
    fn(e.target.value);
    setOffset(0);
  };
  const list = useLog({
    action: action.trim() || undefined,
    service: service || undefined,
    tenant_id: tenantId || tenant || undefined,
    limit: 50,
    offset,
  });
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Activity log</h2>
          <div className="card-sub">Who changed what.</div>
        </div>
        <div className="filters">
          <div className="search">
            <Search />
            <Input placeholder="Action, e.g. campaigns" value={action} onChange={reset(setAction)} />
          </div>
          <Select value={service} options={AUDIT_SERVICES} placeholder="All areas" onChange={reset(setService)} />
          {showTenant && !tenantId && tenantOptions?.length > 0 && (
            <Select value={tenant} options={tenantOptions} placeholder="All customers" onChange={reset(setTenant)} />
          )}
        </div>
      </div>
      <Async state={list}>
        {(p) => (
          <>
            {p.items.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Who</th>
                      <th>What</th>
                      {showTenant && !tenantId && <th>Customer</th>}
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {p.items.map((a) => {
                      const d = a.detail ?? {};
                      return (
                        <Fragment key={a.id}>
                          <tr>
                            <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                              {dateTime(a.created_at)}
                            </td>
                            <td>
                              <div className="cell-main">{actors?.get?.(a.actor_id) ?? a.actor_name ?? shortId(a.actor_id)}</div>
                              <div className="cell-sub">{titleCase(a.actor_type ?? '')}</div>
                            </td>
                            <td>
                              <span className="tag">{a.action}</span>{' '}
                              <span className="muted small">
                                {a.entity_name ?? (a.entity_id ? `${a.entity_type ?? ''} ${shortId(a.entity_id)}` : '')}
                              </span>
                            </td>
                            {showTenant && !tenantId && <td>{tenants?.get?.(a.tenant_id) ?? a.tenant_name ?? shortId(a.tenant_id)}</td>}
                            <td className="actions">
                              <Button size="sm" variant="ghost" onClick={() => setOpen(open === a.id ? null : a.id)}>
                                {open === a.id ? 'Hide' : 'Details'}
                              </Button>
                            </td>
                          </tr>
                          {open === a.id && (
                            <tr>
                              <td colSpan={5}>
                                <dl className="kv" style={{ gridTemplateColumns: '120px 1fr', rowGap: 6, margin: '4px 0' }}>
                                  <dt>Request</dt>
                                  <dd className="mono small">
                                    {d.method} {d.route} → {d.status}
                                  </dd>
                                  <dt>Area</dt>
                                  <dd>{titleCase(a.service ?? '')}</dd>
                                  <dt>From</dt>
                                  <dd className="mono small">{d.ip ?? '—'}</dd>
                                  <dt>Item</dt>
                                  <dd className="mono small">
                                    {a.entity_type} {a.entity_id}
                                  </dd>
                                </dl>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="No activity" />
            )}
            <Pager offset={offset} limit={50} count={p.items.length} total={p.total} onChange={setOffset} />
          </>
        )}
      </Async>
    </div>
  );
}

/* Pronunciations (AGT-13.3) --------------------------------------------- */

export function PronunciationsPage() {
  const s = useSection(useListPronunciationsQuery(), usePutPronunciationsMutation(), (v) =>
    v.map(({ word, say_as }) => ({ word, say_as })),
  );
  const say = (text) => {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  };
  return (
    <SectionCard title="Pronunciations" description="Tell every agent in your company how to say brand names, people and terms." section={s}>
      {(list, _p, set) => (
        <>
          {list.map((x, i) => {
            const upd = (p) => set(list.map((y, j) => (j === i ? { ...y, ...p } : y)));
            return (
              <div key={i} className="row wrap" style={{ gap: 8 }}>
                <input className="input" style={{ flex: 1, minWidth: 140 }} placeholder="Word" value={x.word} onChange={(e) => upd({ word: e.target.value })} />
                <span className="muted">say as</span>
                <input
                  className="input"
                  style={{ flex: 1, minWidth: 140 }}
                  placeholder="How to say it"
                  value={x.say_as}
                  onChange={(e) => upd({ say_as: e.target.value })}
                />
                <Button size="sm" variant="ghost" icon={<Volume2 />} title="Play in your browser" onClick={() => say(x.say_as)} />
                <Button size="sm" variant="ghost" icon={<Trash2 />} onClick={() => set(list.filter((_, j) => j !== i))} />
              </div>
            );
          })}
          <div>
            <Button size="sm" variant="ghost" icon={<Plus />} onClick={() => set([...list, { word: '', say_as: '' }])}>
              Add word
            </Button>
          </div>
        </>
      )}
    </SectionCard>
  );
}

/* Custom voices (AGT-15) ------------------------------------------------ */

export function VoicesPage() {
  const toast = useToast();
  const list = useListCustomVoicesQuery();
  const [createVoice] = useCreateCustomVoiceMutation();
  const [deleteVoice] = useDeleteCustomVoiceMutation();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [lang, setLang] = useState('en-IN');
  const [files, setFiles] = useState([]);
  const [consent, setConsent] = useState(false);
  const [removing, setRemoving] = useState(null);
  const fileRef = useRef(null);
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Custom voices</h2>
          <div className="card-sub">Create a voice from recordings, with the speaker's consent.</div>
        </div>
        <Button variant="primary" icon={<Mic2 />} onClick={() => setCreating(true)}>
          New voice
        </Button>
      </div>
      <Async state={list}>
        {(vs) =>
          vs.length ? (
            <div className="table-wrap">
              <table className="table">
                <tbody>
                  {vs.map((v) => (
                    <tr key={v.id}>
                      <td className="cell-main">{v.name}</td>
                      <td>{v.language}</td>
                      <td>
                        <StatusBadge status={v.status === 'ready' ? 'active' : v.status === 'failed' ? 'failed' : 'pending'} label={titleCase(v.status)} />
                      </td>
                      <td className="muted">{dateTime(v.created_at)}</td>
                      <td className="actions">
                        <Button size="sm" variant="ghost" icon={<Trash2 />} onClick={() => setRemoving(v.id)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon={<Mic2 />} title="No custom voices" />
          )
        }
      </Async>
      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="New custom voice"
        footer={
          <>
            <Button onClick={() => setCreating(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!name.trim() || !files.length || !consent}
              onClick={async () => {
                try {
                  await createVoice({
                    name: name.trim(),
                    language: lang,
                    sample_names: files.map((f) => f.name),
                    consent,
                  }).unwrap();
                  toast('Voice is being created');
                  setCreating(false);
                } catch (e) {
                  toast(errMsg(e), 'error');
                }
              }}
            >
              Create voice
            </Button>
          </>
        }
      >
        <div className="stack">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Language">
            <LanguageSelect value={lang} onChange={setLang} />
          </Field>
          <input ref={fileRef} type="file" accept="audio/*" multiple hidden onChange={(e) => setFiles([...(e.target.files ?? [])])} />
          <Button icon={<Upload />} onClick={() => fileRef.current?.click()}>
            {files.length ? `${files.length} samples selected` : 'Choose audio samples (1–5 minutes total)'}
          </Button>
          <label className="check">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>I confirm the speaker has given written consent for their voice to be cloned and used by our agents.</span>
          </label>
        </div>
      </Modal>
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        danger
        title="Delete this voice?"
        description="Agents using it switch to their language's default voice."
        confirmLabel="Delete"
        onConfirm={async () => {
          await deleteVoice(removing).unwrap();
        }}
      />
    </div>
  );
}

/* Exports & reports (EXT-03) -------------------------------------------- */

export function ExportsPage() {
  const toast = useToast();
  const jobs = useListExportsQuery();
  const [createExport] = useCreateExportMutation();
  const reports = useSection(useListScheduledReportsQuery(), usePutScheduledReportsMutation());
  return (
    <div className="stack">
      <div className="card">
        <div className="card-head">
          <div>
            <h2>Exports</h2>
            <div className="card-sub">CSV downloads of your calls and daily figures for the last 30 days. Each file is ready to download for 24 hours.</div>
          </div>
          <div className="row">
            {[
              ['calls', 'Calls'],
              ['daily_summary', 'Daily figures'],
            ].map(([k, label]) => (
              <Button
                key={k}
                size="sm"
                icon={<Download />}
                onClick={() =>
                  createExport({ kind: k })
                    .unwrap()
                    .then(() => toast('Export ready'))
                    .catch((e) => toast(errMsg(e), 'error'))
                }
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
        <Async state={jobs}>
          {(js) =>
            js.length ? (
              <div className="table-wrap">
                <table className="table">
                  <tbody>
                    {js.map((j) => (
                      <tr key={j.id}>
                        <td className="cell-main">{j.kind === 'daily_summary' ? 'Daily figures' : titleCase(j.kind)}</td>
                        <td className="muted">{dateTime(j.created_at)}</td>
                        <td>
                          <StatusBadge
                            status={j.status === 'ready' ? 'active' : j.status === 'failed' ? 'failed' : 'pending'}
                            label={j.status === 'queued' ? 'Preparing…' : titleCase(j.status)}
                          />
                          {j.row_count != null && <div className="cell-sub">{j.row_count} rows</div>}
                        </td>
                        <td className="muted">{j.expires_at ? `expires ${dateTime(j.expires_at)}` : ''}</td>
                        <td className="actions">
                          {j.status === 'ready' && (
                            <Button
                              size="sm"
                              icon={<Download size={15} />}
                              onClick={() =>
                                downloadAuthed({ service: 'analytics', url: `/customer/exports/${j.id}/download`, filename: `${j.kind}-${j.created_at.slice(0, 10)}.csv` }).catch((e) =>
                                  toast(errMsg(e), 'error'),
                                )
                              }
                            >
                              Download
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="No exports yet" />
            )
          }
        </Async>
      </div>
      <SectionCard title="Scheduled reports" description="Reports emailed on a schedule. Create one from Analytics → Email report. They are saved now and sent once an email provider is connected." section={reports}>
        {(rs, _p, set) =>
          rs.length ? (
            <>
              {rs.map((r, i) => (
                <div key={r.id ?? i} className="row wrap" style={{ gap: 10 }}>
                  <Toggle checked={r.enabled} onChange={(v) => set(rs.map((x, j) => (j === i ? { ...x, enabled: v } : x)))} label="" />
                  <b style={{ minWidth: 160 }}>{r.name}</b>
                  <Select
                    style={{ width: 130 }}
                    value={r.frequency}
                    options={['daily', 'weekly', 'monthly']}
                    onChange={(e) => set(rs.map((x, j) => (j === i ? { ...x, frequency: e.target.value } : x)))}
                  />
                  <span className="muted small" style={{ flex: 1 }}>
                    to {r.recipients.join(', ')}
                    {r.next_run_at ? ` · next ${dateTime(r.next_run_at)}` : ''}
                    {r.delivery === 'email_not_connected' ? ' · email delivery isn’t connected yet' : ''}
                  </span>
                  <Button size="sm" variant="ghost" icon={<Trash2 />} onClick={() => set(rs.filter((_, j) => j !== i))} />
                </div>
              ))}
            </>
          ) : (
            <span className="muted small">No scheduled reports.</span>
          )
        }
      </SectionCard>
    </div>
  );
}

/* Credits (EXT-05) ------------------------------------------------------ */

export function CreditsPage() {
  const toast = useToast();
  const wallet = useGetWalletQuery();
  const tx = useListWalletTransactionsQuery();
  const [topUp] = useTopUpWalletMutation();
  const [saveAutoRecharge] = useSetAutoRechargeMutation();
  const [amount, setAmount] = useState('5000');
  const [auto, setAuto] = useState(null);
  useEffect(() => {
    if (wallet.data)
      setAuto(
        wallet.data.auto_recharge ?? {
          enabled: false,
          threshold: 1000,
          amount: 5000,
        },
      );
  }, [wallet.data]);
  return (
    <div className="stack">
      <Async state={wallet}>
        {(w) => (
          <div className="grid-2" style={{ alignItems: 'start' }}>
            <div className="hero-plan">
              <div style={{ position: 'relative', zIndex: 1 }}>
                <div className="eyebrow" style={{ color: '#a9a8a5' }}>
                  Credit balance
                </div>
                <div className="text-metric-lg" style={{ marginTop: 10 }}>
                  {money(w.balance, w.currency)}
                </div>
                <div className="row" style={{ marginTop: 18 }}>
                  <Input style={{ maxWidth: 160, color: 'var(--text)' }} type="number" min={100} value={amount} onChange={(e) => setAmount(e.target.value)} />
                  <Button
                    variant="accent"
                    icon={<WalletIcon />}
                    onClick={() =>
                      topUp(Number(amount))
                        .unwrap()
                        .then(() => toast('Credits added'))
                        .catch((e) => toast(errMsg(e), 'error'))
                    }
                  >
                    Top up
                  </Button>
                </div>
              </div>
            </div>
            {auto && (
              <div className="card card-pad stack">
                <Toggle
                  checked={auto.enabled}
                  onChange={(v) => setAuto({ ...auto, enabled: v })}
                  label="Auto-recharge"
                  description="Top up automatically from your default payment method."
                />
                <div className="form-grid">
                  <Field label={`When balance falls below (${w.currency})`}>
                    <Input type="number" value={auto.threshold} onChange={(e) => setAuto({ ...auto, threshold: Number(e.target.value) })} />
                  </Field>
                  <Field label={`Add (${w.currency})`}>
                    <Input type="number" value={auto.amount} onChange={(e) => setAuto({ ...auto, amount: Number(e.target.value) })} />
                  </Field>
                </div>
                <div>
                  <Button
                    variant="primary"
                    onClick={() =>
                      saveAutoRecharge(auto)
                        .unwrap()
                        .then(() => toast('Saved'))
                        .catch((e) => toast(errMsg(e), 'error'))
                    }
                  >
                    Save
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Async>
      <div className="card">
        <div className="card-head">
          <h2>Transactions</h2>
        </div>
        <Async state={tx}>
          {(rows) =>
            rows.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>What</th>
                      <th className="num">Amount</th>
                      <th className="num">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((t) => (
                      <tr key={t.id}>
                        <td className="muted">{dateTime(t.created_at)}</td>
                        <td>{titleCase(t.reason)}</td>
                        <td
                          className="num"
                          style={{
                            color: t.type === 'credit' ? 'var(--green)' : undefined,
                          }}
                        >
                          {t.type === 'credit' ? '+' : '−'}
                          {money(t.amount, wallet.data?.currency)}
                        </td>
                        <td className="num">{money(t.balance_after, wallet.data?.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="No transactions" />
            )
          }
        </Async>
      </div>
    </div>
  );
}

/* Sub-accounts (EXT-04) ------------------------------------------------- */

export function SubAccountsPage() {
  const toast = useToast();
  const list = useListSubAccountsQuery();
  const [createSubAccount] = useCreateSubAccountMutation();
  const [switchSubAccount] = useSwitchSubAccountMutation();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Sub-accounts</h2>
          <div className="card-sub">For agencies: separate accounts for each of your clients, with their own agents, numbers and billing.</div>
        </div>
        <div className="row">
          <Input style={{ width: 220, height: 36 }} placeholder="Client name" value={name} onChange={(e) => setName(e.target.value)} />
          <Button
            size="sm"
            variant="primary"
            icon={<Building />}
            disabled={!name.trim()}
            onClick={() =>
              createSubAccount({ name: name.trim(), slug: slugify(name) })
                .unwrap()
                .then(() => setName(''))
                .catch((e) => toast(errMsg(e), 'error'))
            }
          >
            Create
          </Button>
        </div>
      </div>
      <Async state={list}>
        {(xs) =>
          xs.length ? (
            <div className="table-wrap">
              <table className="table">
                <tbody>
                  {xs.map((s) => (
                    <tr key={s.id}>
                      <td className="cell-main">{s.name}</td>
                      <td className="mono muted">{s.slug}</td>
                      <td>
                        <StatusBadge status={s.status} />
                      </td>
                      <td className="actions">
                        <Button
                          size="sm"
                          icon={<ArrowRightLeft />}
                          onClick={async () => {
                            try {
                              // Stores the sub-account's tokens and clears the cache.
                              await switchSubAccount(s.id).unwrap();
                              navigate('/');
                            } catch (e) {
                              toast(errMsg(e), 'error');
                            }
                          }}
                        >
                          Switch to
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No sub-accounts" />
          )
        }
      </Async>
    </div>
  );
}

/* Change password (CUS-02.4) -------------------------------------------- */

export function ChangePasswordCard() {
  const toast = useToast();
  const [changePassword] = useChangePasswordMutation();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  return (
    <div className="card card-pad stack">
      <div className="row" style={{ gap: 10 }}>
        <KeyRound size={18} />
        <span className="card-title">Change password</span>
      </div>
      {error && <div className="alert-inline">{error}</div>}
      <Field label="Current password">
        <Input type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
      </Field>
      <Field label="New password" hint="At least 8 characters, with a number.">
        <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
      </Field>
      <Field label="Confirm new password">
        <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </Field>
      <div>
        <Button
          variant="primary"
          loading={busy}
          onClick={async () => {
            if (next.length < 8 || !/\d/.test(next)) return setError('Use at least 8 characters including a number.');
            if (next !== confirm) return setError("The new passwords don't match.");
            setBusy(true);
            setError(null);
            try {
              await changePassword({
                current_password: cur,
                new_password: next,
              }).unwrap();
              toast('Password changed');
              setCur('');
              setNext('');
              setConfirm('');
            } catch (e) {
              setError(errMsg(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          Update password
        </Button>
      </div>
    </div>
  );
}
