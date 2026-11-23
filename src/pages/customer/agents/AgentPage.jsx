import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, AudioLines, Plus, Trash2, Volume2 } from 'lucide-react';
import {
  useDeleteAgentMutation,
  useGetAgentQuery,
  useGetAgentSectionQuery,
  useListCampaignsQuery,
  useListVoicesQuery,
  usePutAgentSectionMutation,
} from '../../../store/api/flowApi';
import { date, titleCase } from '../../../lib/format';
import { Async, Badge, Button, ConfirmDialog, EmptyState, errMsg, Field, Input, Skeleton, StatusBadge, Toggle, useToast } from '../../../components/ui';
import { SectionCard, Select, Slider, Textarea, useSection } from '../../../components/forms';
import { FormGroup } from '../campaigns/CampaignTabs';
import { DEFAULT_VOICE, findVoice, LanguageSelect, ModelSelect, useGreetingPreview, VoiceDialog } from './pickers';

// An agent is who speaks on a call: its name (what callers hear), job title,
// voice, languages, personality and model. Saved changes apply at once to
// every campaign it runs; what the calls are for lives in the campaign.

/** One identity section of the agent: GET + PUT through RTK Query. */
function useIdentity(id, section) {
  return useSection(useGetAgentSectionQuery({ id, section }), usePutAgentSectionMutation(), (body) => ({ id, section, body }));
}

const TONES = ['Warm', 'Professional', 'Friendly', 'Calm', 'Energetic', 'Empathetic', 'Formal'];

// How the agent words its replies (the middle means no preference).
const MANNER = [
  ['warmth', 'Reserved', 'Warm'],
  ['formality', 'Casual', 'Formal'],
  ['humour', 'Serious', 'Playful'],
  ['persuasiveness', 'Gentle', 'Persuasive'],
];

/** The agent's voice: which one, and a popup to change it (saved at once). */
function VoiceField({ agent }) {
  const toast = useToast();
  const speech = useIdentity(agent.id, 'speech');
  const voices = useListVoicesQuery(agent.language);
  const [putSection, { isLoading: saving }] = usePutAgentSectionMutation();
  const [open, setOpen] = useState(false);
  const saved = speech.data?.voice_id;
  const voice = findVoice(voices.data ?? [], saved);
  const save = async (voiceId) => {
    try {
      await putSection({ id: agent.id, section: 'speech', body: { ...(speech.data ?? {}), voice_id: voiceId } }).unwrap();
      toast('Voice saved. Every campaign of this agent uses it from the next call.');
      setOpen(false);
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };
  return (
    <div className="field">
      <span className="field-label">Voice</span>
      <div className="voice-row">
        <span>
          {voice ? (
            <>
              <b>{voice.name}</b> <span className="muted">({voice.gender})</span>
            </>
          ) : saved ? (
            <span style={{ color: 'var(--red)' }}>The saved voice isn't available any more: calls use {DEFAULT_VOICE}.</span>
          ) : (
            <>
              <b>{DEFAULT_VOICE}</b> <span className="muted">(default; none picked)</span>
            </>
          )}
        </span>
        <Button size="sm" onClick={() => setOpen(true)}>
          Change voice
        </Button>
      </div>
      <VoiceDialog
        open={open}
        onClose={() => setOpen(false)}
        language={agent.language}
        value={voice?.id ?? saved}
        speed={speech.data?.speed}
        saving={saving}
        onSave={save}
      />
    </div>
  );
}

function PersonaCard({ agent }) {
  const persona = useIdentity(agent.id, 'persona');
  const preview = useGreetingPreview(agent.id, 'agent');
  return (
    <SectionCard
      title="Identity"
      description="Who callers talk to. The name is the agent's name everywhere: in your lists and on calls."
      section={persona}
      actions={
        <Button
          size="sm"
          variant="ghost"
          icon={<Volume2 />}
          loading={preview.state === 'loading'}
          onClick={() => preview.play()}
          title="Plays the agent introducing itself in its voice, at its speaking speed"
        >
          {preview.state === 'playing' ? 'Stop' : 'Hear the voice'}
        </Button>
      }
    >
      {(p, patch) => (
        <>
          <FormGroup step="1" title="Basics" help="The name, voice and job the caller hears first.">
            <div className="form-grid">
              <Field label="Name" hint="The name it uses on calls, e.g. Riya. Never a job such as “Receptionist”.">
                <Input placeholder="e.g. Riya" value={p.name ?? ''} onChange={(e) => patch({ name: e.target.value })} />
              </Field>
              <VoiceField agent={agent} />
              <Field label="Job title" className="full" hint="What the agent says it does, e.g. “front-desk assistant at CareFirst Clinics”.">
                <Input placeholder="e.g. front-desk assistant at CareFirst Clinics" value={p.role ?? ''} onChange={(e) => patch({ role: e.target.value })} />
              </Field>
              <Field label="Gender" hint="How the agent refers to itself in languages that mark it.">
                <Select
                  value={p.gender ?? ''}
                  options={[
                    { value: 'female', label: 'Female' },
                    { value: 'male', label: 'Male' },
                  ]}
                  placeholder="Not set"
                  onChange={(e) => patch({ gender: e.target.value })}
                />
              </Field>
            </div>
          </FormGroup>

          <FormGroup step="2" title="Personality" help="Pick a tone, then fine-tune. The middle of a slider means no preference.">
            <div className="field">
              <span className="field-label">Tone</span>
              <div className="row wrap" style={{ gap: 6 }}>
                {TONES.map((t) => (
                  <button key={t} type="button" className={`chip ${p.tone === t ? 'active' : ''}`} style={{ height: 34 }} onClick={() => patch({ tone: t })}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid-2">
              {MANNER.map(([k, l, r]) => (
                <Field key={k} label={titleCase(k)}>
                  <Slider value={p.personality?.[k] ?? 50} left={l} right={r} onChange={(v) => patch({ personality: { ...p.personality, [k]: v } })} />
                </Field>
              ))}
            </div>
          </FormGroup>

          <FormGroup step="3" title="Speaking style" help="Optional. Speaking speed is under Voice below.">
            <Field label="How it should talk" hint="Sentence length, words to use or avoid, e.g. “Short sentences. Never say ‘unfortunately’.”">
              <Textarea rows={3} value={p.style ?? ''} onChange={(e) => patch({ style: e.target.value })} />
            </Field>
          </FormGroup>
        </>
      )}
    </SectionCard>
  );
}

function SpeechCard({ agent }) {
  const speech = useIdentity(agent.id, 'speech');
  const preview = useGreetingPreview(agent.id, 'agent');
  return (
    <SectionCard title="Voice" description="How fast the agent speaks and how easily callers can interrupt it." section={speech}>
      {(s, patch) => (
        <>
          <div className="grid-2">
            <Field
              label={
                <span className="row" style={{ gap: 6 }}>
                  Speaking speed
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Volume2 />}
                    loading={preview.state === 'loading'}
                    onClick={() => preview.play({ speed: s.speed })}
                    title="Plays the agent at this speed"
                  >
                    {preview.state === 'playing' ? 'Stop' : 'Hear it'}
                  </Button>
                </span>
              }
            >
              <Slider
                value={s.speed}
                min={0.7}
                max={1.3}
                step={0.05}
                left="Slower"
                right="Faster"
                format={(v) => `${v.toFixed(2)}×`}
                onChange={(v) => patch({ speed: v })}
              />
            </Field>
            <Field label="Interruption sensitivity">
              <Slider value={s.interruption_sensitivity} left="Hard to interrupt" right="Stops instantly" onChange={(v) => patch({ interruption_sensitivity: v })} />
            </Field>
          </div>
          <div className="form-grid">
            <Field label="Background ambience">
              <Select
                value={s.ambience}
                options={[
                  { value: 'none', label: 'None' },
                  { value: 'office', label: 'Office' },
                  { value: 'cafe', label: 'Café' },
                  { value: 'call_center', label: 'Call centre' },
                ]}
                onChange={(e) => patch({ ambience: e.target.value })}
              />
            </Field>
            <div style={{ alignSelf: 'end', paddingBottom: 10 }}>
              <Toggle
                checked={s.backchannel}
                onChange={(v) => patch({ backchannel: v })}
                label="Short acknowledgements"
                description="“mm-hm”, “okay” while the caller talks."
              />
            </div>
          </div>
        </>
      )}
    </SectionCard>
  );
}

function LanguagesCard({ agent }) {
  const s = useIdentity(agent.id, 'languages');
  return (
    <SectionCard title="Languages" description="The languages the agent speaks. The first one is its main language; the voice speaks all of them." section={s}>
      {(l, patch) => (
        <>
          <div className="form-grid">
            <Field label="Language switching">
              <Select
                value={l.detection}
                options={[
                  { value: 'auto', label: 'Detect the caller’s language and switch' },
                  { value: 'ask', label: 'Ask the caller which language' },
                  { value: 'off', label: 'Stay in the main language' },
                ]}
                onChange={(e) => patch({ detection: e.target.value })}
              />
            </Field>
          </div>
          {l.languages.map((lang, i) => {
            const upd = (p) => patch({ languages: l.languages.map((x, j) => (j === i ? { ...x, ...p } : x)) });
            return (
              <div key={i} className="card" style={{ padding: 16 }}>
                <div className="row between" style={{ marginBottom: 12 }}>
                  <div className="row" style={{ flex: '0 1 340px', minWidth: 0 }}>
                    <LanguageSelect value={lang.language} onChange={(v) => upd({ language: v })} />
                    {i === 0 && <Badge plain>Main</Badge>}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Trash2 />}
                    disabled={l.languages.length === 1 && i === 0}
                    onClick={() => patch({ languages: l.languages.filter((_, j) => j !== i) })}
                  >
                    Remove
                  </Button>
                </div>
                <Field label="Greeting in this language" hint="Optional: used instead of a campaign's greeting when the call is in this language.">
                  <Input value={lang.greeting} onChange={(e) => upd({ greeting: e.target.value })} />
                </Field>
              </div>
            );
          })}
          <div>
            <Button size="sm" variant="ghost" icon={<Plus />} onClick={() => patch({ languages: [...l.languages, { language: '', voice_id: '', greeting: '' }] })}>
              Add language
            </Button>
          </div>
        </>
      )}
    </SectionCard>
  );
}

function ModelCard({ agent }) {
  const model = useIdentity(agent.id, 'model');
  return (
    <SectionCard title="Model & speech providers" description="Advanced. Only options your plan and company allow are listed." section={model}>
      {(m, patch) => (
        <div className="form-grid">
          <Field label="Language model">
            <ModelSelect kind="llm" value={m.llm} onChange={(v) => patch({ llm: v })} />
          </Field>
          <Field label="Backup model" hint="Used if the first one fails.">
            <ModelSelect kind="llm" value={m.fallback_llm ?? ''} placeholder="None" onChange={(v) => patch({ fallback_llm: v })} />
          </Field>
          <Field label="Creativity" hint="Lower is more predictable.">
            <Slider value={m.temperature} min={0} max={1} step={0.05} left="Precise" right="Creative" format={(v) => v.toFixed(2)} onChange={(v) => patch({ temperature: v })} />
          </Field>
          <Field label="Max reply length (tokens)">
            <Input type="number" min={40} max={800} value={m.max_reply_tokens} onChange={(e) => patch({ max_reply_tokens: Number(e.target.value) })} />
          </Field>
          <Field label="Speech-to-text">
            <ModelSelect kind="asr" value={m.asr_provider} onChange={(v) => patch({ asr_provider: v })} />
          </Field>
          <Field label="Text-to-speech">
            <ModelSelect kind="tts" value={m.tts_provider} onChange={(v) => patch({ tts_provider: v })} />
          </Field>
        </div>
      )}
    </SectionCard>
  );
}

/** The campaigns this agent runs. */
function AgentCampaigns({ agent }) {
  const navigate = useNavigate();
  const list = useListCampaignsQuery({ agent_id: agent.id, limit: 200 });
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Campaigns</h2>
          <div className="card-sub">The campaigns this agent speaks on. A change on this page applies to all of them.</div>
        </div>
        <Link to={`/campaigns/new?agent=${agent.id}`} className="btn sm">
          <Plus size={14} /> New campaign
        </Link>
      </div>
      <Async state={list}>
        {(d) =>
          d.items.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Campaign</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Last published</th>
                  </tr>
                </thead>
                <tbody>
                  {d.items.map((c) => (
                    <tr key={c.id} className="clickable" onClick={() => navigate(`/campaigns/${c.id}`)}>
                      <td className="cell-main">{c.name}</td>
                      <td>{titleCase(c.direction)}</td>
                      <td>
                        <StatusBadge status={c.status} />
                      </td>
                      <td className="muted">{c.last_published_at ? date(c.last_published_at) : 'Never'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="Not on any campaign yet" description="Create a campaign and pick this agent to speak on it." />
          )
        }
      </Async>
    </div>
  );
}

/** An agent's Identity page: everything about who speaks, saved at once. */
export function AgentPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const agent = useGetAgentQuery(id);
  const [deleteAgent] = useDeleteAgentMutation();
  const [deleting, setDeleting] = useState(false);

  return (
    <>
      <Link to="/agents" className="back-link">
        <ArrowLeft /> Agents
      </Link>
      <Async state={agent} skeleton={<Skeleton h={70} w={420} style={{ marginBottom: 24 }} />}>
        {(a) => (
          <>
            <div className="agent-head">
              <div>
                <h1 className="text-detail-title">{a.name}</h1>
                <p className="muted" style={{ marginTop: 6 }}>
                  {a.role || 'No job title yet'} · on {a.campaigns} campaign{a.campaigns === 1 ? '' : 's'} · changes apply at once
                </p>
              </div>
              <div className="row wrap">
                <Link to={`/?agent_id=${a.id}#calls`} className="btn">
                  <AudioLines size={16} /> Calls
                </Link>
                <Button variant="danger" icon={<Trash2 />} onClick={() => setDeleting(true)}>
                  Delete
                </Button>
              </div>
            </div>
            <div className="stack">
              <PersonaCard agent={a} />
              <SpeechCard agent={a} />
              <LanguagesCard agent={a} />
              <ModelCard agent={a} />
              <AgentCampaigns agent={a} />
            </div>
            <ConfirmDialog
              open={deleting}
              onClose={() => setDeleting(false)}
              danger
              title={`Delete ${a.name}?`}
              description={
                a.campaigns
                  ? `${a.name} speaks on ${a.campaigns} campaign${a.campaigns === 1 ? '' : 's'}. Give those campaigns another agent (or delete them) first.`
                  : 'The agent is removed. Call history keeps its name.'
              }
              confirmLabel="Delete agent"
              onConfirm={async () => {
                try {
                  await deleteAgent(a.id).unwrap();
                  toast('Agent deleted');
                  navigate('/agents');
                } catch (e) {
                  toast(errMsg(e), 'error');
                }
              }}
            />
          </>
        )}
      </Async>
    </>
  );
}
