import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Trash2, UserRound } from 'lucide-react';
import { useCreateAgentMutation, useDeleteAgentMutation, useListAgentsQuery, useListVoicesQuery } from '../../../store/api/flowApi';
import { Async, Button, ConfirmDialog, EmptyState, errMsg, Field, Input, Modal, PageHeader, useToast } from '../../../components/ui';
import { DEFAULT_VOICE, findVoice } from './pickers';

/** Agents are who speaks on calls (Riya, Ramesh): name, role, voice. What the calls are for is a campaign. */
export function AgentsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [q, setQ] = useState('');
  const list = useListAgentsQuery({ limit: 200 });
  const voices = useListVoicesQuery();
  const [deleteAgent] = useDeleteAgentMutation();
  const [removing, setRemoving] = useState(null);
  const [creating, setCreating] = useState(false);

  const items = list.data?.items ?? [];
  const needle = q.trim().toLowerCase();
  const rows = items.filter((a) => !needle || a.name.toLowerCase().includes(needle) || (a.role ?? '').toLowerCase().includes(needle));
  const voiceName = (a) => (a.voice_id ? (findVoice(voices.data ?? [], a.voice_id)?.name ?? 'Unavailable voice') : `${DEFAULT_VOICE} (default)`);

  return (
    <>
      <PageHeader
        eyebrow="Build"
        title="Agents"
        description="Who speaks on your calls. An agent's name, voice and personality apply to every campaign it runs; what the calls are for is set on the campaign."
        actions={
          <Button variant="primary" icon={<Plus />} onClick={() => setCreating(true)}>
            New agent
          </Button>
        }
      />
      <div className="card">
        <div className="card-head">
          <div className="filters">
            <div className="search">
              <Search />
              <Input placeholder="Search by name or role" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
        </div>
        <Async state={list}>
          {() =>
            rows.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Role</th>
                      <th>Voice</th>
                      <th>Language</th>
                      <th className="num">Campaigns</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((a) => (
                      <tr key={a.id} className="clickable" onClick={() => navigate(`/agents/${a.id}`)}>
                        <td className="cell-main">{a.name}</td>
                        <td className="muted">{a.role || '—'}</td>
                        <td>{voiceName(a)}</td>
                        <td className="muted">{a.language ?? '—'}</td>
                        <td className="num">{a.campaigns ?? 0}</td>
                        <td className="actions" onClick={(e) => e.stopPropagation()}>
                          <Button size="sm" variant="ghost" icon={<Trash2 />} title="Delete" onClick={() => setRemoving(a)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                icon={<UserRound />}
                title={items.length ? 'No agents match' : 'No agents yet'}
                description={items.length ? 'Try another search.' : 'Create an agent, give it a name and a voice, then put it on a campaign.'}
                action={
                  !items.length && (
                    <Button variant="primary" icon={<Plus />} onClick={() => setCreating(true)}>
                      New agent
                    </Button>
                  )
                }
              />
            )
          }
        </Async>
      </div>
      <NewAgentDialog open={creating} onClose={() => setCreating(false)} onCreated={(a) => navigate(`/agents/${a.id}`)} />
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        danger
        title={`Delete ${removing?.name}?`}
        description={
          removing?.campaigns
            ? `${removing.name} speaks on ${removing.campaigns} campaign${removing.campaigns === 1 ? '' : 's'}. Give those campaigns another agent (or delete them) first.`
            : 'The agent is removed. Call history keeps its name.'
        }
        confirmLabel="Delete agent"
        onConfirm={async () => {
          try {
            await deleteAgent(removing.id).unwrap();
            toast('Agent deleted');
          } catch (e) {
            toast(errMsg(e), 'error');
          }
        }}
      />
    </>
  );
}

/** Name (what callers hear, e.g. Riya) and job title. The voice and the rest are set on its Identity page. */
export function NewAgentDialog({ open, onClose, onCreated }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [error, setError] = useState(null);
  const [createAgent, { isLoading }] = useCreateAgentMutation();
  const submit = async () => {
    if (!name.trim()) return setError('Give the agent a name, e.g. Riya');
    setError(null);
    try {
      const a = await createAgent({ name: name.trim(), role: role.trim() }).unwrap();
      toast(`Created ${a.name}`);
      setName('');
      setRole('');
      onClose();
      onCreated?.(a);
    } catch (e) {
      setError(errMsg(e));
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New agent"
      description="The name is what callers hear, so use a person's name, not a job."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={isLoading} onClick={submit}>
            Create agent
          </Button>
        </>
      }
    >
      <div className="stack">
        {error && <div className="alert-inline">{error}</div>}
        <Field label="Name">
          <Input autoFocus placeholder="e.g. Riya" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Role" hint="Its job title, shown in your lists and said on calls when it introduces itself.">
          <Input placeholder="e.g. Front-desk receptionist" value={role} onChange={(e) => setRole(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
