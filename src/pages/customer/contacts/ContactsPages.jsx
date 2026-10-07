import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarClock, ListPlus, MessageSquare, PhoneCall, Plus, Search, Trash2, Upload, Users } from 'lucide-react';
import {
  useCreateContactListMutation,
  useCreateContactMutation,
  useCreateScheduledCallMutation,
  useDeleteContactMutation,
  useGetContactQuery,
  useGetContactTimelineQuery,
  useListContactFieldsQuery,
  useListContactListsQuery,
  useListContactsQuery,
  usePutContactFieldsMutation,
  useUpdateContactMutation,
} from '../../../store/api/callsApi';
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
  Pager,
  SegmentTabs,
  Skeleton,
  Toggle,
  useToast,
} from '../../../components/ui';
import { parseCsv, readFileText, SectionCard, Select, useSection } from '../../../components/forms';
import { CallNumberDialog, E164, useAgentOptions } from '../shared';

const PAGE = 50;

/** P-24 Contacts (CON-01). */
export function ContactsPage() {
  const [tab, setTab] = useState('contacts');
  return (
    <>
      <PageHeader eyebrow="Deploy" title="Contacts" description="Your contact book — import, organise into lists, and use lists in campaigns." />
      <SegmentTabs
        value={tab}
        onChange={setTab}
        items={[
          { value: 'contacts', label: 'Contacts' },
          { value: 'lists', label: 'Lists' },
          { value: 'fields', label: 'Custom fields' },
        ]}
      />

      {tab === 'contacts' && <ContactsTab />}
      {tab === 'lists' && <ListsTab />}
      {tab === 'fields' && <FieldsTab />}
    </>
  );
}

function ContactsTab() {
  const navigate = useNavigate();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [listId, setListId] = useState('');
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState([]);
  const list = useListContactsQuery({ q: q || undefined, list_id: listId || undefined, limit: PAGE, offset });
  const lists = useListContactListsQuery();
  const fields = useListContactFieldsQuery();
  const [createList] = useCreateContactListMutation();
  const [editing, setEditing] = useState(null);
  const [importing, setImporting] = useState(false);
  const [newList, setNewList] = useState(null);

  return (
    <div className="card">
      <div className="card-head">
        <div className="filters">
          <div className="search">
            <Search />
            <Input
              placeholder="Name, phone or email"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setOffset(0);
              }}
            />
          </div>
          <Select
            value={listId}
            options={(lists.data ?? []).map((l) => ({
              value: l.id,
              label: l.name,
            }))}
            placeholder="All lists"
            onChange={(e) => {
              setListId(e.target.value);
              setOffset(0);
            }}
          />
        </div>
        <div className="row">
          {selected.length > 0 && (
            <Button size="sm" icon={<ListPlus />} onClick={() => setNewList('')}>
              Make a list ({selected.length})
            </Button>
          )}
          <Button size="sm" icon={<Upload />} onClick={() => setImporting(true)}>
            Import CSV
          </Button>
          <Button size="sm" variant="primary" icon={<Plus />} onClick={() => setEditing({ custom_fields: {} })}>
            Add contact
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
                      <th style={{ width: 36 }}>
                        <input
                          type="checkbox"
                          checked={p.items.every((c) => selected.includes(c.id))}
                          onChange={(e) =>
                            setSelected(
                              e.target.checked
                                ? [...new Set([...selected, ...p.items.map((c) => c.id)])]
                                : selected.filter((id) => !p.items.some((c) => c.id === id)),
                            )
                          }
                        />
                      </th>
                      <th>Name</th>
                      <th>Phone</th>
                      {(fields.data ?? []).slice(0, 2).map((f) => (
                        <th key={f.key}>{f.label}</th>
                      ))}
                      <th>Last contacted</th>
                      <th>Last outcome</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.items.map((c) => (
                      <tr key={c.id} className="clickable" onClick={() => navigate(`/contacts/${c.id}`)}>
                        <td onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selected.includes(c.id)}
                            onChange={(e) => setSelected(e.target.checked ? [...selected, c.id] : selected.filter((x) => x !== c.id))}
                          />
                        </td>
                        <td>
                          <div className="cell-main">
                            {c.name ?? '—'} {c.do_not_call && <Badge tone="red">Do not call</Badge>}
                          </div>
                          {c.email && <div className="cell-sub">{c.email}</div>}
                        </td>
                        <td className="mono">{c.phone}</td>
                        {(fields.data ?? []).slice(0, 2).map((f) => (
                          <td key={f.key}>{c.custom_fields[f.key] ?? '—'}</td>
                        ))}
                        <td className="muted">{dateTime(c.last_contacted_at)}</td>
                        <td>{c.last_outcome ? titleCase(c.last_outcome) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState icon={<Users />} title="No contacts" description="Import a CSV or add contacts one by one." />
            )}
            <Pager offset={offset} limit={PAGE} count={p.items.length} total={p.total} onChange={setOffset} />
          </>
        )}
      </Async>
      <ContactModal value={editing} fields={fields.data ?? []} onClose={() => setEditing(null)} onSaved={() => toast('Contact saved')} />

      <ImportModal open={importing} onClose={() => setImporting(false)} fields={fields.data ?? []} lists={lists.data ?? []} onDone={() => {}} />
      <Modal
        open={newList !== null}
        onClose={() => setNewList(null)}
        title="New list from selection"
        footer={
          <>
            <Button onClick={() => setNewList(null)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!newList?.trim()}
              onClick={async () => {
                try {
                  await createList({ name: newList.trim(), contact_ids: selected }).unwrap();
                  toast('List created');
                  setSelected([]);
                  setNewList(null);
                } catch (e) {
                  toast(errMsg(e), 'error');
                }
              }}
            >
              Create list
            </Button>
          </>
        }
      >
        <Field label="List name">
          <Input autoFocus value={newList ?? ''} onChange={(e) => setNewList(e.target.value)} />
        </Field>
      </Modal>
    </div>
  );
}

function ContactModal({ value, fields, onClose, onSaved }) {
  const [createContact] = useCreateContactMutation();
  const [updateContact] = useUpdateContactMutation();
  const [c, setC] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (value) {
      setC({ custom_fields: {}, ...value });
      setError(null);
    }
  }, [value]);
  return (
    <Modal
      open={!!value}
      onClose={onClose}
      title={value?.id ? 'Edit contact' : 'Add contact'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              if (!E164.test(c.phone ?? '')) return setError('Phone must be in international format, e.g. +919876543210');
              setBusy(true);
              setError(null);
              try {
                const saved = value?.id ? await updateContact({ ...c, id: value.id }).unwrap() : await createContact(c).unwrap();
                onSaved(saved);
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
        <div className="form-grid">
          <Field label="Name">
            <Input value={c.name ?? ''} onChange={(e) => setC({ ...c, name: e.target.value })} />
          </Field>
          <Field label="Phone">
            <Input className="mono" placeholder="+919876543210" value={c.phone ?? ''} onChange={(e) => setC({ ...c, phone: e.target.value })} />
          </Field>
          <Field label="Email">
            <Input value={c.email ?? ''} onChange={(e) => setC({ ...c, email: e.target.value })} />
          </Field>
          <Field label="Time zone">
            <Select
              value={c.timezone ?? ''}
              options={['Asia/Kolkata', 'Asia/Dubai', 'Europe/London', 'America/New_York']}
              placeholder="Default"
              onChange={(e) => setC({ ...c, timezone: e.target.value })}
            />
          </Field>
          {fields.map((f) => (
            <Field key={f.key} label={f.label}>
              {f.type === 'choice' ? (
                <Select
                  value={c.custom_fields?.[f.key] ?? ''}
                  options={f.options ?? []}
                  placeholder="—"
                  onChange={(e) =>
                    setC({
                      ...c,
                      custom_fields: {
                        ...c.custom_fields,
                        [f.key]: e.target.value,
                      },
                    })
                  }
                />
              ) : (
                <Input
                  type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                  value={c.custom_fields?.[f.key] ?? ''}
                  onChange={(e) =>
                    setC({
                      ...c,
                      custom_fields: {
                        ...c.custom_fields,
                        [f.key]: e.target.value,
                      },
                    })
                  }
                />
              )}
            </Field>
          ))}
        </div>
      </div>
    </Modal>
  );
}

function ImportModal({ open, onClose, fields, lists, onDone }) {
  const toast = useToast();
  const [importContacts] = useCreateContactMutation();
  const fileRef = useRef(null);
  const [csv, setCsv] = useState(null);
  const [mapping, setMapping] = useState({});
  const [listId, setListId] = useState('');
  const [dup, setDup] = useState('skip');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const targets = [
    { value: 'phone', label: 'Phone' },
    { value: 'name', label: 'Name' },
    { value: 'email', label: 'Email' },
    { value: 'timezone', label: 'Time zone' },
    ...fields.map((f) => ({ value: `custom.${f.key}`, label: f.label })),
  ];
  useEffect(() => {
    if (open) {
      setCsv(null);
      setResult(null);
    }
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="Import contacts"
      footer={
        result ? (
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        ) : (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={!csv || !Object.values(mapping).includes('phone')}
              onClick={async () => {
                setBusy(true);
                try {
                  const r = await importContacts({
                    rows: csv.rows,
                    mapping,
                    list_id: listId || undefined,
                    on_duplicate: dup,
                  }).unwrap();
                  setResult(r);
                  onDone();
                } catch (e) {
                  toast(errMsg(e), 'error');
                } finally {
                  setBusy(false);
                }
              }}
            >
              Import {csv?.rows.length ?? ''} rows
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="grid-3">
          <div className="card stat">
            <div className="label">Created</div>
            <div className="value">{result.created}</div>
          </div>
          <div className="card stat">
            <div className="label">Updated</div>
            <div className="value">{result.updated}</div>
          </div>
          <div className="card stat">
            <div className="label">Skipped</div>
            <div className="value">{result.skipped}</div>
          </div>
        </div>
      ) : (
        <div className="stack">
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              const p = parseCsv(await readFileText(f));
              setCsv(p);
              setMapping(
                Object.fromEntries(
                  p.headers.map((h) => {
                    const k = h.toLowerCase();
                    const t = /phone|mobile/.test(k)
                      ? 'phone'
                      : /name/.test(k)
                        ? 'name'
                        : /mail/.test(k)
                          ? 'email'
                          : fields.find((f2) => f2.key === k || f2.label.toLowerCase() === k)
                            ? `custom.${fields.find((f2) => f2.key === k || f2.label.toLowerCase() === k).key}`
                            : '';
                    return [h, t];
                  }),
                ),
              );
            }}
          />

          <Button icon={<Upload />} onClick={() => fileRef.current?.click()}>
            {csv ? `${csv.rows.length} rows loaded — choose another file` : 'Choose CSV file'}
          </Button>
          {csv && (
            <>
              {csv.headers.map((h) => (
                <div key={h} className="mapping-row">
                  <span className="mono">{h}</span>
                  <span className="muted">→</span>
                  <Select
                    value={mapping[h] ?? ''}
                    options={targets}
                    placeholder="Skip column"
                    onChange={(e) => setMapping({ ...mapping, [h]: e.target.value })}
                  />
                  <span />
                </div>
              ))}
              <div className="form-grid">
                <Field label="Add to list">
                  <Select
                    value={listId}
                    options={lists.map((l) => ({ value: l.id, label: l.name }))}
                    placeholder="None"
                    onChange={(e) => setListId(e.target.value)}
                  />
                </Field>
                <Field label="If the phone already exists">
                  <Select
                    value={dup}
                    options={[
                      { value: 'skip', label: 'Skip the row' },
                      { value: 'update', label: 'Update the contact' },
                    ]}
                    onChange={(e) => setDup(e.target.value)}
                  />
                </Field>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

function ListsTab() {
  const navigate = useNavigate();
  const toast = useToast();
  const lists = useListContactListsQuery();
  const [createList] = useCreateContactListMutation();
  const [name, setName] = useState('');
  return (
    <div className="card">
      <div className="card-head">
        <h2>Lists</h2>
        <div className="row">
          <Input style={{ width: 220, height: 36 }} placeholder="New list name" value={name} onChange={(e) => setName(e.target.value)} />
          <Button
            size="sm"
            icon={<Plus />}
            disabled={!name.trim()}
            onClick={() =>
              createList({ name: name.trim() })
                .unwrap()
                .then(() => setName(''))
                .catch((e) => toast(errMsg(e), 'error'))
            }
          >
            Create
          </Button>
        </div>
      </div>
      <Async state={lists}>
        {(ls) =>
          ls.length ? (
            <table className="table">
              <tbody>
                {ls.map((l) => (
                  <tr key={l.id}>
                    <td className="cell-main">{l.name}</td>
                    <td className="num">{l.count} contacts</td>
                    <td className="actions">
                      <Button size="sm" variant="ghost" onClick={() => navigate(`/campaigns/new?list=${l.id}`)}>
                        Use in campaign
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState title="No lists" />
          )
        }
      </Async>
    </div>
  );
}

function FieldsTab() {
  const s = useSection(useListContactFieldsQuery(), usePutContactFieldsMutation(), (v) =>
    v.map(({ key, label, type, options }) => ({ key, label, type, options })),
  );
  return (
    <SectionCard title="Custom fields" description="Extra columns on every contact. Use them as call variables in campaigns." section={s}>
      {(fs, _p, set) => (
        <>
          {fs.map((f, i) => (
            <div key={i} className="row wrap" style={{ gap: 8 }}>
              <input
                className="input mono"
                style={{ width: 160 }}
                placeholder="key"
                value={f.key}
                onChange={(e) => set(fs.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))}
              />
              <input
                className="input"
                style={{ flex: 1, minWidth: 160 }}
                placeholder="Label"
                value={f.label}
                onChange={(e) => set(fs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
              />
              <Select
                style={{ width: 130 }}
                value={f.type}
                options={['text', 'number', 'date', 'choice']}
                onChange={(e) => set(fs.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)))}
              />
              {f.type === 'choice' && (
                <input
                  className="input"
                  style={{ flex: 1, minWidth: 160 }}
                  placeholder="Options, comma separated"
                  value={(f.options ?? []).join(', ')}
                  onChange={(e) =>
                    set(
                      fs.map((x, j) =>
                        j === i
                          ? {
                              ...x,
                              options: e.target.value
                                .split(',')
                                .map((o) => o.trim())
                                .filter(Boolean),
                            }
                          : x,
                      ),
                    )
                  }
                />
              )}
              <Button size="sm" variant="ghost" icon={<Trash2 />} onClick={() => set(fs.filter((_, j) => j !== i))} />
            </div>
          ))}
          <div>
            <Button size="sm" variant="ghost" icon={<Plus />} onClick={() => set([...fs, { id: '', key: '', label: '', type: 'text' }])}>
              Add field
            </Button>
          </div>
        </>
      )}
    </SectionCard>
  );
}

/** P-25 Contact detail (CON-02). */
export function ContactDetailPage() {
  const { id = '' } = useParams();
  const toast = useToast();
  const navigate = useNavigate();
  const contact = useGetContactQuery(id);
  const timeline = useGetContactTimelineQuery(id);
  const fields = useListContactFieldsQuery();
  const [updateContact] = useUpdateContactMutation();
  const [deleteContact] = useDeleteContactMutation();
  const [scheduleCall] = useCreateScheduledCallMutation();
  const { options } = useAgentOptions();
  const [editing, setEditing] = useState(false);
  const [calling, setCalling] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [sched, setSched] = useState({ agent_id: '', run_at: '', reason: '' });

  return (
    <>
      <Link to="/contacts" className="back-link">
        <ArrowLeft /> Contacts
      </Link>
      <Async state={contact} skeleton={<Skeleton h={200} />}>
        {(c) => (
          <>
            <header className="agent-head">
              <div>
                <h1
                  style={{
                    fontSize: 28,
                    fontWeight: 500,
                    letterSpacing: '-0.03em',
                  }}
                >
                  {c.name ?? c.phone}
                </h1>
                <p className="muted mono" style={{ marginTop: 6 }}>
                  {c.phone}
                  {c.email ? ` · ${c.email}` : ''}
                </p>
              </div>
              <div className="row wrap">
                <Button variant="primary" icon={<PhoneCall />} disabled={c.do_not_call} onClick={() => setCalling(true)}>
                  Call now
                </Button>
                <Button icon={<CalendarClock />} disabled={c.do_not_call} onClick={() => setScheduling(true)}>
                  Schedule a call
                </Button>
                <Link to="/inbox" className="btn">
                  <MessageSquare size={16} /> Message
                </Link>
                <Button onClick={() => setEditing(true)}>Edit</Button>
                <Button variant="ghost" icon={<Trash2 />} onClick={() => setRemoving(true)} />
              </div>
            </header>
            <div
              className="grid-2"
              style={{
                gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.4fr)',
                alignItems: 'start',
              }}
            >
              <div className="stack">
                <div className="card card-pad stack" style={{ gap: 12 }}>
                  <Toggle
                    checked={c.do_not_call}
                    onChange={(v) =>
                      updateContact({ id, do_not_call: v })
                        .unwrap()
                        .catch((e) => toast(errMsg(e), 'error'))
                    }
                    label="Do not call"
                    description="Campaigns and triggers will skip this number."
                  />

                  <dl
                    className="kv"
                    style={{
                      gridTemplateColumns: '120px 1fr',
                      rowGap: 8,
                      fontSize: 13.5,
                    }}
                  >
                    <dt>Source</dt>
                    <dd>{titleCase(c.source)}</dd>
                    <dt>Time zone</dt>
                    <dd>{c.timezone ?? '—'}</dd>
                    <dt>Last contacted</dt>
                    <dd>{dateTime(c.last_contacted_at)}</dd>
                    <dt>Last outcome</dt>
                    <dd>{c.last_outcome ? titleCase(c.last_outcome) : '—'}</dd>
                    {(fields.data ?? []).map((f) => (
                      <div key={f.key} style={{ display: 'contents' }}>
                        <dt>{f.label}</dt>
                        <dd>{c.custom_fields[f.key] ?? '—'}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <div className="card card-pad">
                  <div className="card-title">What agents remember</div>
                  <p className="small" style={{ marginTop: 8 }}>
                    {c.memory_summary ?? <span className="muted">Nothing yet — turn on caller memory on an agent's Settings tab.</span>}
                  </p>
                </div>
              </div>
              <div className="card">
                <div className="card-head">
                  <h2>Timeline</h2>
                </div>
                <Async state={timeline}>
                  {(items) =>
                    items.length ? (
                      <div style={{ padding: '8px 20px 16px' }}>
                        {items.map((t, i) => (
                          <div
                            key={i}
                            className="row"
                            style={{
                              gap: 14,
                              alignItems: 'flex-start',
                              padding: '12px 0',
                              borderBottom: '1px solid var(--divider)',
                            }}
                          >
                            <Badge plain>{titleCase(t.type)}</Badge>
                            <div style={{ flex: 1 }}>
                              <div className="cell-main">{t.link ? <Link to={t.link}>{t.title}</Link> : t.title}</div>
                              {t.detail && <div className="cell-sub">{t.detail}</div>}
                            </div>
                            <span className="muted small">{dateTime(t.at)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <EmptyState title="No activity yet" />
                    )
                  }
                </Async>
              </div>
            </div>
            <ContactModal value={editing ? c : null} fields={fields.data ?? []} onClose={() => setEditing(false)} onSaved={() => {}} />
            <CallNumberDialog open={calling} onClose={() => setCalling(false)} defaultTo={c.phone} />
            <Modal
              open={scheduling}
              onClose={() => setScheduling(false)}
              title="Schedule a call"
              footer={
                <>
                  <Button onClick={() => setScheduling(false)}>Cancel</Button>
                  <Button
                    variant="primary"
                    disabled={!sched.agent_id || !sched.run_at}
                    onClick={async () => {
                      try {
                        await scheduleCall({
                          to_number: c.phone,
                          agent_id: sched.agent_id,
                          run_at: new Date(sched.run_at).toISOString(),
                          reason: sched.reason || undefined,
                        }).unwrap();
                        toast('Call scheduled');
                        setScheduling(false);
                      } catch (e) {
                        toast(errMsg(e), 'error');
                      }
                    }}
                  >
                    Schedule
                  </Button>
                </>
              }
            >
              <div className="stack">
                <Field label="Agent">
                  <Select value={sched.agent_id} options={options} placeholder="Choose" onChange={(e) => setSched({ ...sched, agent_id: e.target.value })} />
                </Field>
                <Field label="When">
                  <input type="datetime-local" className="input" value={sched.run_at} onChange={(e) => setSched({ ...sched, run_at: e.target.value })} />
                </Field>
                <Field label="Reason">
                  <Input value={sched.reason} onChange={(e) => setSched({ ...sched, reason: e.target.value })} />
                </Field>
              </div>
            </Modal>
            <ConfirmDialog
              open={removing}
              onClose={() => setRemoving(false)}
              danger
              title="Delete this contact?"
              description="Call records are kept; the contact is removed from lists and campaigns that haven't called them."
              confirmLabel="Delete"
              onConfirm={async () => {
                await deleteContact(id).unwrap();
                navigate('/contacts');
              }}
            />
          </>
        )}
      </Async>
    </>
  );
}
