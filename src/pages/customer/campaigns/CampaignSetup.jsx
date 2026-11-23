import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Link2, Phone, Plus, Unlink, UserRound, Volume2 } from 'lucide-react';
import { useGetAgentQuery, useListAgentsQuery, useListVoicesQuery, useUpdateCampaignMutation } from '../../../store/api/flowApi';
import { useAssignNumberCampaignMutation, useListNumbersQuery, useUnassignNumberCampaignMutation } from '../../../store/api/callsApi';
import { Async, Badge, Button, EmptyState, errMsg, Field, useToast } from '../../../components/ui';
import { Select } from '../../../components/forms';
import { DEFAULT_VOICE, findVoice, useGreetingPreview } from '../agents/pickers';
import { NewAgentDialog } from '../agents/AgentsPage';

/** The campaign's agent: who speaks on its calls. Changing it applies at once. */
export function AgentTab({ campaign }) {
  const toast = useToast();
  const agent = useGetAgentQuery(campaign.agent_id, { skip: !campaign.agent_id });
  const agents = useListAgentsQuery({ limit: 200 });
  const voices = useListVoicesQuery(agent.data?.language);
  const preview = useGreetingPreview(campaign.id, 'campaign');
  const [updateCampaign, { isLoading: saving }] = useUpdateCampaignMutation();
  const [pick, setPick] = useState(campaign.agent_id ?? '');
  const [creating, setCreating] = useState(false);
  useEffect(() => setPick(campaign.agent_id ?? ''), [campaign.agent_id]);

  const change = async (agentId) => {
    try {
      await updateCampaign({ id: campaign.id, agent_id: agentId }).unwrap();
      toast('Agent changed. Calls use the new agent from the next one.');
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };
  const a = agent.data;
  const voice = a ? (a.voice_id ? (findVoice(voices.data ?? [], a.voice_id)?.name ?? 'Unavailable voice') : `${DEFAULT_VOICE} (default)`) : null;

  return (
    <div className="stack">
      <div className="card">
        <div className="card-head">
          <div>
            <h2>Who speaks</h2>
            <div className="card-sub">The agent's name, voice and personality are set on its own page and apply to every campaign it runs.</div>
          </div>
          <div className="row">
            <Button
              size="sm"
              variant="ghost"
              icon={<Volume2 />}
              loading={preview.state === 'loading'}
              onClick={() => preview.play()}
              title="Plays this campaign's greeting in the agent's voice"
            >
              {preview.state === 'playing' ? 'Stop' : 'Hear the greeting'}
            </Button>
            {a && (
              <Link to={`/agents/${a.id}`} className="btn sm">
                <UserRound size={14} /> Edit {a.name}
              </Link>
            )}
          </div>
        </div>
        <div className="card-pad">
          {campaign.agent_id && agent.isError ? (
            <div className="banner danger" style={{ margin: 0 }}>
              <AlertTriangle />
              <span className="grow">This campaign's agent was deleted. Pick another agent below so the calls have someone to speak.</span>
            </div>
          ) : (
            <Async state={agent}>
              {(x) => (
                <dl className="kv" style={{ gridTemplateColumns: '140px 1fr', rowGap: 8 }}>
                  <dt>Name</dt>
                  <dd className="fw-medium">{x.name}</dd>
                  <dt>Role</dt>
                  <dd>{x.role || <span className="muted">No job title</span>}</dd>
                  <dt>Voice</dt>
                  <dd>{voice}</dd>
                  <dt>Language</dt>
                  <dd>{x.language ?? '—'}</dd>
                  <dt>Campaigns</dt>
                  <dd>
                    {x.campaigns} {x.campaigns > 1 && <span className="muted small">(a change to the agent shows on all of them)</span>}
                  </dd>
                </dl>
              )}
            </Async>
          )}
        </div>
      </div>
      <div className="card card-pad stack">
        <div className="card-title">Change the agent</div>
        <div className="row wrap" style={{ gap: 10, alignItems: 'flex-end' }}>
          <div style={{ minWidth: 260 }}>
          <Field label="Agent">
            <Select
              value={pick}
              options={(agents.data?.items ?? []).map((x) => ({ value: x.id, label: x.role ? `${x.name} · ${x.role}` : x.name }))}
              placeholder="Choose an agent"
              onChange={(e) => setPick(e.target.value)}
            />
          </Field>
          </div>
          <Button variant="primary" loading={saving} disabled={!pick || pick === campaign.agent_id} onClick={() => change(pick)}>
            Use this agent
          </Button>
          <span className="muted">or</span>
          <Button icon={<Plus />} onClick={() => setCreating(true)}>
            New agent
          </Button>
        </div>
        <p className="muted small" style={{ margin: 0 }}>
          The agent isn't part of a published version: a new agent applies to calls at once.
        </p>
      </div>
      <NewAgentDialog open={creating} onClose={() => setCreating(false)} onCreated={(x) => change(x.id)} />
    </div>
  );
}

/** Inbound campaign: which of the company's numbers it answers. */
export function PhoneNumbersTab({ campaign }) {
  const toast = useToast();
  const numbers = useListNumbersQuery();
  const [assign] = useAssignNumberCampaignMutation();
  const [unassign] = useUnassignNumberCampaignMutation();
  const [busy, setBusy] = useState(null);

  const act = async (n, on) => {
    setBusy(n.id);
    try {
      if (on) await assign({ id: n.id, campaign_id: campaign.id }).unwrap();
      else await unassign(n.id).unwrap();
      toast(on ? `${n.e164} now answers with ${campaign.name}` : `${n.e164} no longer answers with ${campaign.name}`);
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="stack">
      {!campaign.published_version && (
        <div className="banner warn" style={{ margin: 0 }}>
          <AlertTriangle />
          <span className="grow">This campaign isn't published yet: its numbers aren't answered until you publish it.</span>
        </div>
      )}
      <div className="card">
        <div className="card-head">
          <div>
            <h2>Phone numbers</h2>
            <div className="card-sub">Callers to these numbers talk to this campaign. A number answers for one campaign at a time.</div>
          </div>
          <Link to="/numbers" className="btn sm ghost">
            <Phone size={14} /> Numbers & routing
          </Link>
        </div>
        <Async state={numbers}>
          {(list) =>
            list.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Number</th>
                      <th>Answers now</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {[...list]
                      .sort((x, y) => (y.campaign_id === campaign.id) - (x.campaign_id === campaign.id))
                      .map((n) => {
                        const mine = n.campaign_id === campaign.id;
                        return (
                          <tr key={n.id}>
                            <td className="mono">{n.e164}</td>
                            <td>
                              {mine ? (
                                <Badge tone="green">This campaign</Badge>
                              ) : n.campaign_id ? (
                                <Link to={`/campaigns/${n.campaign_id}`}>{n.campaign_name ?? 'Another campaign'}</Link>
                              ) : (
                                <span className="muted">Nobody</span>
                              )}
                            </td>
                            <td className="actions">
                              {mine ? (
                                <Button size="sm" variant="ghost" icon={<Unlink />} loading={busy === n.id} onClick={() => act(n, false)}>
                                  Remove
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  icon={<Link2 />}
                                  loading={busy === n.id}
                                  title={n.campaign_id ? `Moves the number from ${n.campaign_name ?? 'its campaign'} to this one` : undefined}
                                  onClick={() => act(n, true)}
                                >
                                  {n.campaign_id ? 'Move here' : 'Use for this campaign'}
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
                title="No phone numbers yet"
                description="Get a number, then let this campaign answer it."
                action={
                  <Link to="/numbers" className="btn">
                    Get a number
                  </Link>
                }
              />
            )
          }
        </Async>
      </div>
    </div>
  );
}
