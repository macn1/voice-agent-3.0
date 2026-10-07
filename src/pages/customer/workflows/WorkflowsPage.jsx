import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarClock, History, Pencil, Plus, Send, Trash2, Users, X, Zap } from 'lucide-react';
import {
  useCreateScheduledCallMutation,
  useCreateTriggerMutation,
  useDeleteScheduledCallMutation,
  useFireTriggerMutation,
  useListScheduledCallsQuery,
  useListTriggerRunsQuery,
  useListTriggersQuery,
  useUpdateTriggerMutation,
} from '../../../store/api/callsApi';
import { useCreateAgentTeamMutation, useListAgentTeamsQuery, useUpdateAgentTeamMutation } from '../../../store/api/flowApi';
import { useListIntegrationEventsQuery, useListIntegrationsQuery, useListMessagesQuery } from '../../../store/api/integrationApi';
import { dateTime, titleCase } from '../../../lib/format';
import {
  Async,
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
import { CopyField, Drawer, MappingEditor, Select, Textarea } from '../../../components/forms';
import { E164, useAgentOptions, useNumberOptions } from '../shared';

/** Workflows: call triggers (CALL-10, INT-F7), callbacks (CON-03), follow-up log (ACT-03.4), agent teams (AGT-16). */
export function WorkflowsPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'triggers';
  return (
    <>
      <PageHeader
        eyebrow="Build"
        title="Workflows"
        description="Automations around your agents — call a lead the moment they sign up, call people back when promised, follow up by message, and hand callers between agents."
      />
      <SegmentTabs
        value={tab}
        onChange={(v) => setParams({ tab: v }, { replace: true })}
        items={[
          { value: 'triggers', label: 'Call triggers' },
          { value: 'scheduled', label: 'Scheduled calls' },
          { value: 'messages', label: 'Follow-up messages' },
          { value: 'teams', label: 'Agent teams' },
        ]}
      />

      {tab === 'triggers' && <TriggersTab />}
      {tab === 'scheduled' && <ScheduledTab />}
      {tab === 'messages' && <MessagesTab />}
      {tab === 'teams' && <TeamsTab />}
    </>
  );
}

function TriggersTab() {
  const toast = useToast();
  const list = useListTriggersQuery();
  const [editing, setEditing] = useState(null);
  const [runsFor, setRunsFor] = useState(null);
  const runs = useListTriggerRunsQuery(runsFor?.id, { skip: !runsFor });
  const [updateTrigger] = useUpdateTriggerMutation();
  const [fireTrigger] = useFireTriggerMutation();
  const hookUrl = (t) => `${window.location.origin}/outbound/api/v1/hooks/triggers/${t.trigger_key}`;

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Call triggers</h2>
          <div className="card-sub">“When a new lead arrives, call within 30 seconds with agent X.”</div>
        </div>
        <Button
          variant="primary"
          icon={<Plus />}
          onClick={() =>
            setEditing({
              source: 'webhook',
              delay_seconds: 30,
              field_mapping: { phone: 'phone' },
              is_enabled: true,
            })
          }
        >
          New trigger
        </Button>
      </div>
      <Async state={list}>
        {(ts) =>
          ts.length ? (
            <table className="table">
              <thead>
                <tr>
                  <th>Trigger</th>
                  <th>Source</th>
                  <th>Calls with</th>
                  <th>Delay</th>
                  <th>On</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {ts.map((t) => (
                  <tr key={t.id}>
                    <td className="cell-main">{t.name}</td>
                    <td>
                      {titleCase(t.source)}
                      {t.source_config.provider && <div className="cell-sub">{`${t.source_config.provider} · ${t.source_config.event}`}</div>}
                    </td>
                    <td>{t.agent_name ?? t.agent_id}</td>
                    <td>{t.delay_seconds < 60 ? `${t.delay_seconds}s` : `${Math.round(t.delay_seconds / 60)} min`}</td>
                    <td>
                      <input
                        type="checkbox"
                        checked={t.is_enabled}
                        onChange={(e) =>
                          updateTrigger({ id: t.id, is_enabled: e.target.checked })
                            .unwrap()
                            .catch((err) => toast(errMsg(err), 'error'))
                        }
                      />
                    </td>
                    <td className="actions">
                      <Button size="sm" variant="ghost" icon={<History />} onClick={() => setRunsFor(t)}>
                        Runs
                      </Button>
                      <Button size="sm" variant="ghost" icon={<Pencil />} onClick={() => setEditing(t)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState icon={<Zap />} title="No triggers" description="Connect a web form, CRM or webhook so new leads get a call instantly." />
          )
        }
      </Async>
      <TriggerEditor value={editing} onClose={() => setEditing(null)} onSaved={() => {}} />
      <Drawer open={!!runsFor} onClose={() => setRunsFor(null)} width={600} title={runsFor?.name ?? ''} subtitle="Run log">
        {runsFor && (
          <div className="stack">
            {runsFor.source !== 'crm_event' && (
              <Field label="Inbound webhook URL" hint="POST lead data here (JSON). Fields are mapped to call variables.">
                <CopyField value={hookUrl(runsFor)} />
              </Field>
            )}
            <Button
              size="sm"
              icon={<Zap />}
              onClick={() =>
                fireTrigger({
                  key: runsFor.trigger_key,
                  payload: Object.fromEntries(Object.keys(runsFor.field_mapping).map((k) => [k, k === 'phone' ? '+919800000000' : 'Test'])),
                })
                  .unwrap()
                  .then(() => toast('Test event sent'))
                  .catch((e) => toast(errMsg(e), 'error'))
              }
            >
              Send a test event
            </Button>
            <Async state={runs}>
              {(rs) =>
                rs.length ? (
                  <table className="table">
                    <tbody>
                      {rs.map((r) => (
                        <tr key={r.id}>
                          <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                            {dateTime(r.created_at)}
                          </td>
                          <td>
                            <StatusBadge
                              status={r.status === 'called' ? 'active' : r.status === 'queued' ? 'pending' : r.status === 'skipped' ? 'cancelled' : 'failed'}
                              label={titleCase(r.status)}
                            />
                            {r.detail && <div className="cell-sub">{r.detail}</div>}
                          </td>
                          <td className="mono small">{JSON.stringify(r.payload).slice(0, 80)}</td>
                          <td>{r.call_id && <Link to={`/calls/${r.call_id}`}>Call</Link>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <EmptyState title="No runs yet" />
                )
              }
            </Async>
          </div>
        )}
      </Drawer>
    </div>
  );
}

function TriggerEditor({ value, onClose, onSaved }) {
  const { options: agentOptions } = useAgentOptions();
  const { options: numberOptions } = useNumberOptions();
  const integrationsQ = useListIntegrationsQuery();
  const connected = { data: (integrationsQ.data ?? []).filter((i) => i.connected && i.category === 'crm') };
  const [t, setT] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const events = useListIntegrationEventsQuery(t.source_config?.provider, {
    skip: !(t.source === 'crm_event' && t.source_config?.provider),
  });
  const [createTrigger] = useCreateTriggerMutation();
  const [updateTrigger] = useUpdateTriggerMutation();

  useEffect(() => {
    if (value) {
      setT({ source_config: {}, field_mapping: {}, ...value });
      setError(null);
    }
  }, [value]);

  return (
    <Modal
      open={!!value}
      onClose={onClose}
      wide
      title={value?.id ? 'Edit trigger' : 'New call trigger'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              if (!t.name?.trim() || !t.agent_id || !t.from_number_id) return setError('Fill in the name, agent and from-number');
              if (!Object.values(t.field_mapping ?? {}).includes('phone')) return setError('Map one incoming field to “phone”');
              setBusy(true);
              setError(null);
              try {
                if (value?.id) await updateTrigger({ ...t, id: value.id }).unwrap();
                else await createTrigger(t).unwrap();
                onSaved();
                onClose();
              } catch (e) {
                setError(errMsg(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Save trigger
          </Button>
        </>
      }
    >
      <div className="stack">
        {error && <div className="alert-inline">{error}</div>}
        <div className="form-grid">
          <Field label="Name" className="full">
            <Input value={t.name ?? ''} onChange={(e) => setT({ ...t, name: e.target.value })} placeholder="New website lead → call in 30s" />
          </Field>
          <Field label="When">
            <Select
              value={t.source ?? 'webhook'}
              options={[
                { value: 'webhook', label: 'A webhook is received' },
                { value: 'form', label: 'A web form is submitted' },
                { value: 'crm_event', label: 'Something happens in the CRM' },
              ]}
              onChange={(e) => setT({ ...t, source: e.target.value })}
            />
          </Field>
          <Field label="Wait before calling (seconds)">
            <Input type="number" min={0} value={t.delay_seconds ?? 0} onChange={(e) => setT({ ...t, delay_seconds: Number(e.target.value) })} />
          </Field>
          {t.source === 'crm_event' && (
            <>
              <Field label="CRM">
                <Select
                  value={t.source_config?.provider ?? ''}
                  options={(connected.data ?? []).map((c) => ({
                    value: c.provider,
                    label: c.name,
                  }))}
                  placeholder={(connected.data ?? []).length ? 'Choose' : 'Connect a CRM first'}
                  onChange={(e) => setT({ ...t, source_config: { provider: e.target.value } })}
                />
              </Field>
              <Field label="Event">
                <Select
                  value={t.source_config?.event ?? ''}
                  options={(events.data ?? []).map((e) => ({
                    value: e.key,
                    label: e.label,
                  }))}
                  placeholder="Choose"
                  onChange={(e) =>
                    setT({
                      ...t,
                      source_config: {
                        ...t.source_config,
                        event: e.target.value,
                      },
                    })
                  }
                />
              </Field>
            </>
          )}
          <Field label="Call with agent">
            <Select value={t.agent_id ?? ''} options={agentOptions} placeholder="Choose" onChange={(e) => setT({ ...t, agent_id: e.target.value })} />
          </Field>
          <Field label="From number">
            <Select
              value={t.from_number_id ?? ''}
              options={numberOptions}
              placeholder="Choose"
              onChange={(e) => setT({ ...t, from_number_id: e.target.value })}
            />
          </Field>
        </div>
        <Field
          label="Map incoming fields to call variables"
          hint="Left: field name in the incoming data. Right: variable name (use “phone” for the number to call)."
        >
          <MappingEditor
            value={t.field_mapping ?? {}}
            onChange={(field_mapping) => setT({ ...t, field_mapping })}
            keyLabel="Incoming field"
            valueLabel="Call variable"
          />
        </Field>
        <Toggle checked={t.is_enabled ?? true} onChange={(v) => setT({ ...t, is_enabled: v })} label="Enabled" />
      </div>
    </Modal>
  );
}

function ScheduledTab() {
  const toast = useToast();
  const list = useListScheduledCallsQuery();
  const [createScheduled] = useCreateScheduledCallMutation();
  const [deleteScheduled] = useDeleteScheduledCallMutation();
  const { options } = useAgentOptions();
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({
    to_number: '',
    agent_id: '',
    run_at: '',
    reason: '',
  });
  const [cancelling, setCancelling] = useState(null);
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Scheduled calls</h2>
          <div className="card-sub">Callbacks agents promised, and calls you scheduled by hand.</div>
        </div>
        <Button variant="primary" icon={<CalendarClock />} onClick={() => setAdding(true)}>
          Schedule a call
        </Button>
      </div>
      <Async state={list}>
        {(cs) =>
          cs.length ? (
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>Agent</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {cs.map((c) => (
                  <tr key={c.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{dateTime(c.run_at)}</td>
                    <td>
                      <div className="cell-main">{c.contact_name ?? c.to_number}</div>
                      <div className="cell-sub mono">{c.to_number}</div>
                    </td>
                    <td>{c.agent_name ?? c.agent_id}</td>
                    <td>
                      {c.reason ?? '—'}
                      <div className="cell-sub">{c.source === 'agent_promise' ? 'Promised by the agent' : 'Scheduled manually'}</div>
                    </td>
                    <td>
                      <StatusBadge status={c.status === 'scheduled' ? 'pending' : c.status === 'done' ? 'active' : 'cancelled'} label={titleCase(c.status)} />
                    </td>
                    <td className="actions">
                      {c.status === 'scheduled' && (
                        <Button size="sm" variant="ghost" icon={<X />} onClick={() => setCancelling(c.id)}>
                          Cancel
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState icon={<CalendarClock />} title="Nothing scheduled" />
          )
        }
      </Async>
      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Schedule a call"
        footer={
          <>
            <Button onClick={() => setAdding(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={async () => {
                if (!E164.test(f.to_number) || !f.agent_id || !f.run_at) return toast('Fill in the number (+91…), agent and time', 'error');
                try {
                  await createScheduled({
                    ...f,
                    run_at: new Date(f.run_at).toISOString(),
                    reason: f.reason || undefined,
                  }).unwrap();
                  setAdding(false);
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
        <div className="form-grid">
          <Field label="Number">
            <Input className="mono" value={f.to_number} placeholder="+919876543210" onChange={(e) => setF({ ...f, to_number: e.target.value })} />
          </Field>
          <Field label="Agent">
            <Select value={f.agent_id} options={options} placeholder="Choose" onChange={(e) => setF({ ...f, agent_id: e.target.value })} />
          </Field>
          <Field label="When">
            <input type="datetime-local" className="input" value={f.run_at} onChange={(e) => setF({ ...f, run_at: e.target.value })} />
          </Field>
          <Field label="Reason">
            <Input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
          </Field>
        </div>
      </Modal>
      <ConfirmDialog
        open={!!cancelling}
        onClose={() => setCancelling(null)}
        title="Cancel this call?"
        confirmLabel="Cancel call"
        danger
        onConfirm={async () => {
          await deleteScheduled(cancelling).unwrap();
        }}
      />
    </div>
  );
}

function MessagesTab() {
  const list = useListMessagesQuery({ limit: 100 });
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Follow-up messages</h2>
          <div className="card-sub">Messages sent because of a call. Set up rules on an agent's Follow-ups tab.</div>
        </div>
      </div>
      <Async state={list}>
        {(p) =>
          p.items.length ? (
            <table className="table">
              <thead>
                <tr>
                  <th>Sent</th>
                  <th>To</th>
                  <th>Channel</th>
                  <th>Message</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {p.items.map((m) => (
                  <tr key={m.id}>
                    <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                      {dateTime(m.created_at)}
                    </td>
                    <td className="mono">{m.to_address}</td>
                    <td>{titleCase(m.channel)}</td>
                    <td>
                      <div
                        style={{
                          maxWidth: 380,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {m.body}
                      </div>
                      {m.call_id && (
                        <Link to={`/calls/${m.call_id}`} className="cell-sub">
                          From call
                        </Link>
                      )}
                    </td>
                    <td>
                      <StatusBadge
                        status={['delivered', 'read', 'sent'].includes(m.status) ? 'active' : m.status === 'failed' ? 'failed' : 'pending'}
                        label={titleCase(m.status)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState icon={<Send />} title="No messages sent yet" />
          )
        }
      </Async>
    </div>
  );
}

function TeamsTab() {
  const toast = useToast();
  const list = useListAgentTeamsQuery();
  const [createTeam] = useCreateAgentTeamMutation();
  const [updateTeam] = useUpdateAgentTeamMutation();
  const { options, agents } = useAgentOptions();
  const [editing, setEditing] = useState(null);
  const name = (id) => agents.find((a) => a.id === id)?.name ?? id;
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Agent teams</h2>
          <div className="card-sub">A receptionist agent hands callers to sales or support — context carries over.</div>
        </div>
        <Button variant="primary" icon={<Plus />} onClick={() => setEditing({ name: '', members: [], handoff_rules: [] })}>
          New team
        </Button>
      </div>
      <Async state={list}>
        {(ts) =>
          ts.length ? (
            <table className="table">
              <tbody>
                {ts.map((t) => (
                  <tr key={t.id} className="clickable" onClick={() => setEditing(structuredClone(t))}>
                    <td className="cell-main">{t.name}</td>
                    <td>{t.members.map(name).join(', ')}</td>
                    <td className="muted">{t.handoff_rules.length} handoff rules</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState icon={<Users />} title="No teams" />
          )
        }
      </Async>
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        wide
        title={editing?.id ? 'Edit team' : 'New team'}
        footer={
          <>
            <Button onClick={() => setEditing(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={async () => {
                const e = editing;
                if (!e.name?.trim() || (e.members ?? []).length < 2) return toast('Name the team and add at least two agents', 'error');
                const body = {
                  name: e.name.trim(),
                  members: e.members ?? [],
                  handoff_rules: e.handoff_rules ?? [],
                };
                try {
                  if (e.id) await updateTeam({ id: e.id, ...body }).unwrap();
                  else await createTeam(body).unwrap();
                  setEditing(null);
                } catch (err) {
                  toast(errMsg(err), 'error');
                }
              }}
            >
              Save team
            </Button>
          </>
        }
      >
        {editing && (
          <div className="stack">
            <Field label="Team name">
              <Input value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </Field>
            <div className="field">
              <span className="field-label">Agents</span>
              <div className="perm-grid">
                {options.map((o) => (
                  <label key={o.value} className="check">
                    <input
                      type="checkbox"
                      checked={(editing.members ?? []).includes(o.value)}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          members: e.target.checked ? [...(editing.members ?? []), o.value] : (editing.members ?? []).filter((x) => x !== o.value),
                        })
                      }
                    />
                    {o.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="field">
              <span className="field-label">Handoff rules</span>
              {(editing.handoff_rules ?? []).map((r, i) => {
                const upd = (p) =>
                  setEditing({
                    ...editing,
                    handoff_rules: editing.handoff_rules.map((x, j) => (j === i ? { ...x, ...p } : x)),
                  });
                const members = options.filter((o) => (editing.members ?? []).includes(o.value));
                return (
                  <div key={i} className="row wrap" style={{ gap: 8 }}>
                    <Select style={{ width: 180 }} value={r.from} options={members} placeholder="From" onChange={(e) => upd({ from: e.target.value })} />
                    <span className="muted">→</span>
                    <Select style={{ width: 180 }} value={r.to} options={members} placeholder="To" onChange={(e) => upd({ to: e.target.value })} />
                    <Textarea
                      rows={1}
                      style={{ flex: 1, minWidth: 200 }}
                      placeholder="When the caller…"
                      value={r.when}
                      onChange={(e) => upd({ when: e.target.value })}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Trash2 />}
                      onClick={() =>
                        setEditing({
                          ...editing,
                          handoff_rules: editing.handoff_rules.filter((_, j) => j !== i),
                        })
                      }
                    />
                  </div>
                );
              })}
              <div>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Plus />}
                  onClick={() =>
                    setEditing({
                      ...editing,
                      handoff_rules: [...(editing.handoff_rules ?? []), { from: '', to: '', when: '' }],
                    })
                  }
                >
                  Add rule
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
