import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Building2, ChevronRight, FileText, LayoutTemplate, Mic2, Plus, Sparkles, SpellCheck2, Wrench, Zap } from 'lucide-react';
import {
  useCreateCampaignMutation,
  useCreateFromTemplateMutation,
  useGenerateDraftMutation,
  useGetCampaignUsageQuery,
  useListAgentsQuery,
  useListTemplatesQuery,
} from '../../../store/api/flowApi';
import { Async, Button, EmptyState, errMsg, Field, Input, PageHeader, SegmentTabs, useToast } from '../../../components/ui';
import { Select, Textarea } from '../../../components/forms';
import { categoriesOf, templateCard } from '../useCases';

const START_OPTIONS = [
  { value: 'template', icon: LayoutTemplate, tone: 'blue', tag: 'Fastest', title: 'From a template', text: 'Pick a ready-made campaign for your use case.' },
  { value: 'describe', icon: Sparkles, tone: 'violet', tag: 'AI draft', title: 'Describe it', text: 'Explain the job in a line and get a draft.' },
  { value: 'blank', icon: Plus, tone: 'slate', tag: 'Full control', title: 'Blank campaign', text: 'Start empty and configure everything yourself.' },
];

const BUILDING_BLOCKS = [
  { to: '/company', icon: Building2, title: 'Company profile', text: 'Business facts every campaign can use.' },
  { to: '/knowledge', icon: FileText, title: 'Knowledge base', text: 'Documents, websites and FAQs.' },
  { to: '/tools', icon: Wrench, title: 'Tools', text: 'Let calls use your APIs mid-conversation.' },
  { to: '/settings/voices', icon: Mic2, title: 'Custom voices', text: 'Cloned or custom voices for your agents.' },
  { to: '/settings/pronunciations', icon: SpellCheck2, title: 'Pronunciations', text: 'How to say brand names and terms.' },
  { to: '/workflows', icon: Zap, title: 'Call triggers', text: 'Start calls from your website, CRM or API.' },
];

/** The plan's campaign limit: { atLimit, limit, used } (limit 0 = none). */
export function useCampaignLimit() {
  const usage = useGetCampaignUsageQuery();
  const limit = Number(usage.data?.limit ?? 0);
  const used = Number(usage.data?.used ?? 0);
  return { atLimit: limit > 0 && used >= limit, limit, used, loaded: usage.isSuccess };
}

/** Who speaks on the new campaign: an existing agent, or a new one (name + role). */
function AgentChoice({ value, onChange, suggested }) {
  const agents = useListAgentsQuery({ limit: 200 });
  const list = agents.data?.items ?? [];
  // A new agent when there are none yet, or when a template / draft suggests one.
  useEffect(() => {
    if (agents.isSuccess && value.mode === undefined) {
      onChange({ mode: list.length && !suggested?.name ? 'existing' : 'new', agent_id: '', name: suggested?.name ?? '', role: suggested?.role ?? '' });
    }
     
  }, [agents.isSuccess, value.mode]);
  return (
    <div className="field full">
      <span className="field-label">Agent</span>
      <span className="hint" style={{ marginTop: 0, marginBottom: 6 }}>
        Who speaks on the calls. An agent can run many campaigns.
      </span>
      <SegmentTabs
        value={value.mode ?? 'existing'}
        onChange={(mode) => onChange({ ...value, mode })}
        items={[
          { value: 'existing', label: 'An agent you have' },
          { value: 'new', label: 'A new agent' },
        ]}
      />
      <div className="form-grid" style={{ marginTop: 10 }}>
        {value.mode === 'new' ? (
          <>
            <Field label="Agent's name" hint="What callers hear, e.g. Riya.">
              <Input placeholder="e.g. Riya" value={value.name ?? ''} onChange={(e) => onChange({ ...value, name: e.target.value })} />
            </Field>
            <Field label="Role">
              <Input placeholder="e.g. Front-desk receptionist" value={value.role ?? ''} onChange={(e) => onChange({ ...value, role: e.target.value })} />
            </Field>
          </>
        ) : (
          <Field label="Agent">
            <Select
              value={value.agent_id ?? ''}
              options={list.map((a) => ({ value: a.id, label: a.role ? `${a.name} · ${a.role}` : a.name }))}
              placeholder={agents.isLoading ? 'Loading…' : list.length ? 'Choose an agent' : 'No agents yet: create a new one'}
              onChange={(e) => onChange({ ...value, agent_id: e.target.value })}
            />
          </Field>
        )}
      </div>
    </div>
  );
}

/** The create request's agent part, or an error message. */
function agentPart(a) {
  if (a.mode === 'new') return a.name?.trim() ? { new_agent: { name: a.name.trim(), role: (a.role ?? '').trim() } } : 'Give the new agent a name';
  return a.agent_id ? { agent_id: a.agent_id } : 'Pick the agent who speaks on the calls';
}

function DirectionChoice({ value, onChange }) {
  return (
    <Field label="Type" hint={value === 'outbound' ? 'It calls a list of numbers.' : 'Callers ring its phone numbers.'}>
      <SegmentTabs
        value={value}
        onChange={onChange}
        items={[
          { value: 'inbound', label: 'Inbound' },
          { value: 'outbound', label: 'Outbound' },
        ]}
      />
    </Field>
  );
}

function LimitBanner() {
  const { atLimit, limit } = useCampaignLimit();
  if (!atLimit) return null;
  return (
    <div className="banner warn">
      <span className="grow">
        Your plan allows {limit} campaign{limit === 1 ? '' : 's'}, and you have them all. Delete one or move to a bigger plan to add another.
      </span>
      <Link to="/settings/plan" className="btn sm">
        Plans
      </Link>
    </div>
  );
}

/** New campaign: template, one-line description, or blank. `hub` is the Build page with the shared building blocks. */
export function NewCampaignPage({ hub = false }) {
  const [params] = useSearchParams();
  const initialMode = params.get('prompt') ? 'describe' : params.get('mode') === 'blank' ? 'blank' : 'template';
  const [mode, setMode] = useState(initialMode);
  const direction = params.get('type') === 'outbound' ? 'outbound' : 'inbound';

  const panel = (
    <>
      <LimitBanner />
      {mode === 'template' && <FromTemplate preselect={params.get('template')} agentId={params.get('agent')} direction={direction} />}
      {mode === 'describe' && <Describe initial={params.get('prompt') ?? ''} agentId={params.get('agent')} direction={direction} />}
      {mode === 'blank' && <Blank agentId={params.get('agent')} direction={direction} />}
    </>
  );

  if (hub) {
    return (
      <>
        <PageHeader
          eyebrow="Build"
          title="Build a campaign"
          description="A campaign is what the calls are for, spoken by one of your agents. Shared building blocks are on the right: set them up once and every campaign can use them."
        />
        <div className="build-layout">
          <div className="build-main">
            <div className="build-step-label">
              <span>1</span> How do you want to start?
            </div>
            <div className="build-options" role="tablist" aria-label="How to start">
              {START_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  role="tab"
                  aria-selected={mode === o.value}
                  className={`build-option tone-${o.tone} ${mode === o.value ? 'active' : ''}`}
                  onClick={() => setMode(o.value)}
                >
                  <span className="bo-top">
                    <span className="bo-icon">
                      <o.icon aria-hidden />
                    </span>
                    <span className="bo-check" aria-hidden />
                  </span>
                  <span className="bo-copy">
                    <b>{o.title}</b>
                    <small>{o.text}</small>
                  </span>
                </button>
              ))}
            </div>
            <div className="build-step-label">
              <span>2</span> {START_OPTIONS.find((o) => o.value === mode).title}
            </div>
            <div className="build-panel">{panel}</div>
          </div>

          <aside className="build-side card">
            <div className="card-head">
              <h2>Shared building blocks</h2>
            </div>
            <ul>
              {BUILDING_BLOCKS.map((b) => (
                <li key={b.to}>
                  <Link to={b.to} state={{ backTo: '/build', backLabel: 'Build' }} className="build-block">
                    <b.icon aria-hidden />
                    <span>
                      <b>{b.title}</b>
                      <small>{b.text}</small>
                    </span>
                    <ChevronRight aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </>
    );
  }

  return (
    <>
      <Link to="/campaigns" className="back-link">
        <ArrowLeft /> Campaigns
      </Link>
      <PageHeader
        eyebrow="Campaigns"
        title="New campaign"
        description="Start from a template, describe the job in one line, or begin blank. Pick the agent who speaks; you'll land in the editor afterwards."
      />
      <SegmentTabs value={mode} onChange={setMode} items={START_OPTIONS.map((o) => ({ value: o.value, label: o.value === 'blank' ? 'Blank' : o.title }))} />
      {panel}
    </>
  );
}

function FromTemplate({ preselect, agentId, direction: initialDirection }) {
  const navigate = useNavigate();
  const toast = useToast();
  const templates = useListTemplatesQuery();
  const [createFromTemplate] = useCreateFromTemplateMutation();
  const { atLimit } = useCampaignLimit();
  const [picked, setPicked] = useState(null);
  const [direction, setDirection] = useState(initialDirection);
  const [agent, setAgent] = useState(agentId ? { mode: 'existing', agent_id: agentId } : {});
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [category, setCategory] = useState('All');

  // Home's use-case cards pass the template's key (or id).
  useEffect(() => {
    if (preselect && templates.data && !picked) {
      const t = templates.data.find((x) => x.key === preselect || x.id === preselect);
      if (t) choose(t);
    }
     
  }, [preselect, templates.data]);

  const choose = (t) => {
    setPicked(t);
    setName(t.name);
    setError(null);
    // An outbound use case (reminders, collections, follow-ups) starts outbound.
    const cats = templateCard(t, LayoutTemplate).categories.join(' ').toLowerCase();
    if (/outbound|reminder|collection/.test(`${cats} ${t.use_case ?? ''}`)) setDirection('outbound');
    let persona = {};
    try {
      persona = (typeof t.config === 'string' ? JSON.parse(t.config) : t.config)?.persona ?? {};
    } catch {
      persona = {};
    }
    if (!agentId) setAgent({ mode: undefined, suggested: { name: persona.name ?? '', role: persona.role ?? '' } });
  };

  const create = async () => {
    const who = agentPart(agent);
    if (typeof who === 'string') return setError(who);
    setBusy(true);
    setError(null);
    try {
      const c = await createFromTemplate({ template_id: picked.id, name: name.trim() || picked.name, direction, ...who }).unwrap();
      toast(`Created ${c.name}`);
      navigate(`/campaigns/${c.id}`);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  if (picked) {
    return (
      <div className="card card-pad stack">
        <div className="row between">
          <div>
            <div className="card-title">{picked.name}</div>
            <div className="card-sub">{picked.description}</div>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setPicked(null)}>
            Other templates
          </Button>
        </div>
        {error && <div className="alert-inline">{error}</div>}
        <div className="form-grid">
          <Field label="Campaign name" hint="e.g. Appointment reminder">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <DirectionChoice value={direction} onChange={setDirection} />
          <AgentChoice value={agent} onChange={setAgent} suggested={agent.suggested} />
        </div>
        <div>
          <Button variant="primary" icon={<ArrowRight />} loading={busy} disabled={atLimit} onClick={create}>
            Create campaign
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Async state={templates}>
      {(list) =>
        list.length ? (
          <div className="stack" style={{ gap: 12 }}>
            <div className="chips" role="tablist" aria-label="Template categories">
              {categoriesOf(list.map((t) => templateCard(t, LayoutTemplate))).map((c) => (
                <button key={c} role="tab" aria-selected={category === c} className={`chip ${category === c ? 'active' : ''}`} onClick={() => setCategory(c)}>
                  {c}
                </button>
              ))}
            </div>
            <div className="usecase-grid" style={{ marginTop: 0 }}>
              {list
                .map((t) => ({ t, card: templateCard(t, LayoutTemplate) }))
                .filter(({ card }) => category === 'All' || card.categories.includes(category))
                .sort((a, b) => a.card.order - b.card.order || a.card.title.localeCompare(b.card.title))
                .map(({ t, card }) => {
                  const Icon = card.icon;
                  return (
                    <button key={t.id} className="usecase" onClick={() => choose(t)}>
                      <span className="clay">
                        <Icon />
                      </span>
                      <span>
                        <h3>{t.name}</h3>
                        <p>{t.description}</p>
                      </span>
                      <span className="arrow-btn">
                        <ArrowRight />
                      </span>
                    </button>
                  );
                })}
            </div>
          </div>
        ) : (
          <div className="card">
            <EmptyState title="No templates yet" description="Your platform team hasn't published any templates." />
          </div>
        )
      }
    </Async>
  );
}

function Describe({ initial, agentId, direction: initialDirection }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState(null);
  const [direction, setDirection] = useState(initialDirection);
  const [agent, setAgent] = useState(agentId ? { mode: 'existing', agent_id: agentId } : {});
  const [generateDraft] = useGenerateDraftMutation();
  const [createCampaign] = useCreateCampaignMutation();
  const { atLimit } = useCampaignLimit();

  const generate = async () => {
    if (text.trim().length < 10) return setError('Describe the job in a sentence or two.');
    setBusy(true);
    setError(null);
    try {
      const d = await generateDraft(text.trim()).unwrap();
      setDraft(d);
      if (!agentId) setAgent({ mode: undefined, suggested: { name: d.agent_name ?? '', role: d.persona.role ?? '' } });
      if (/\b(call|remind|follow up|follow-up|collect)\b/i.test(text) && !/\b(answer|incoming|inbound|receptionist)\b/i.test(text)) setDirection('outbound');
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (initial) void generate();
     
  }, []);

  const create = async () => {
    if (!draft) return;
    const who = agentPart(agent);
    if (typeof who === 'string') return setError(who);
    setBusy(true);
    setError(null);
    try {
      // The draft's sections, with the edits made above; a new agent takes its persona.
      const config = {
        ...draft.config,
        flow: draft.flow,
        guidelines: draft.guidelines,
        variables: draft.variables,
        persona: { ...draft.persona, ...(who.new_agent ? { name: who.new_agent.name, role: who.new_agent.role } : {}) },
      };
      const c = await createCampaign({
        name: draft.name.trim() || 'New campaign',
        direction,
        ...(draft.template_id ? { template_id: draft.template_id } : {}),
        config,
        ...who,
      }).unwrap();
      toast(`Created ${c.name}`);
      navigate(`/campaigns/${c.id}`);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <div className="card card-pad stack">
        <Field label="What should the calls do?" hint="e.g. “Call customers whose EMI is due in 3 days, remind them in Hindi, and record when they'll pay.”">
          <Textarea rows={3} placeholder="Describe what the calls are for, who they talk to and in which language…" value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        {error && !draft && <div className="alert-inline">{error}</div>}
        <div>
          <Button variant="primary" icon={<Sparkles />} loading={busy && !draft} onClick={generate}>
            {draft ? 'Generate again' : 'Generate draft'}
          </Button>
        </div>
      </div>
      {draft && (
        <div className="card card-pad stack">
          <div className="card-title">Review the draft</div>
          {draft.simulated && (
            <div className="banner info" style={{ margin: 0 }}>
              <span className="grow">This draft is simulated: it picks the closest template by keywords. Edit anything below before creating.</span>
            </div>
          )}
          {error && <div className="alert-inline">{error}</div>}
          <div className="form-grid">
            <Field label="Campaign name">
              <Input placeholder="e.g. Appointment reminders" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </Field>
            <DirectionChoice value={direction} onChange={setDirection} />
            <AgentChoice value={agent} onChange={setAgent} suggested={agent.suggested} />
            <Field label="Greeting" className="full">
              <Input
                placeholder="Hi, this is Riya from CareFirst. How can I help?"
                value={draft.flow.greeting}
                onChange={(e) => setDraft({ ...draft, flow: { ...draft.flow, greeting: e.target.value } })}
              />
            </Field>
            <Field label="Instructions" className="full">
              <Textarea
                rows={6}
                placeholder="What the calls are for and how they should go…"
                value={draft.flow.system_prompt}
                onChange={(e) => setDraft({ ...draft, flow: { ...draft.flow, system_prompt: e.target.value } })}
              />
            </Field>
          </div>
          <div className="grid-2">
            <div>
              <div className="field-label">Always</div>
              <ul className="small muted">
                {draft.guidelines.always.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
            <div>
              <div className="field-label">Never</div>
              <ul className="small muted">
                {draft.guidelines.never.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          </div>
          {draft.variables.length > 0 && (
            <div className="tag-list">
              {draft.variables.map((v) => (
                <span key={v.name} className="tag">{`{{${v.name}}}`}</span>
              ))}
            </div>
          )}
          <div>
            <Button variant="primary" icon={<ArrowRight />} loading={busy} disabled={atLimit} onClick={create}>
              Create campaign
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Blank({ agentId, direction: initialDirection }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [name, setName] = useState('');
  const [direction, setDirection] = useState(initialDirection);
  const [agent, setAgent] = useState(agentId ? { mode: 'existing', agent_id: agentId } : {});
  const [greeting, setGreeting] = useState('');
  const [instructions, setInstructions] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [createCampaign] = useCreateCampaignMutation();
  const { atLimit } = useCampaignLimit();

  return (
    <div className="card card-pad stack">
      {error && <div className="alert-inline">{error}</div>}
      <div className="form-grid">
        <Field label="Campaign name" hint="What the calls are for, e.g. Appointment reminder">
          <Input autoFocus placeholder="e.g. Appointment reminder" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <DirectionChoice value={direction} onChange={setDirection} />
        <AgentChoice value={agent} onChange={setAgent} />
        <Field label="Greeting" className="full">
          <Input placeholder="Hi, this is Riya from CareFirst…" value={greeting} onChange={(e) => setGreeting(e.target.value)} />
        </Field>
        <Field label="Instructions" className="full" hint="What the calls are for and how they should go. You can refine this in the editor.">
          <Textarea
            rows={4}
            placeholder="e.g. Remind patients of tomorrow's appointment, offer to reschedule, and hand off to a person for anything else."
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
          />
        </Field>
      </div>
      <div>
        <Button
          variant="primary"
          loading={busy}
          disabled={atLimit}
          icon={<ArrowRight />}
          onClick={async () => {
            if (!name.trim()) return setError('Give the campaign a name');
            const who = agentPart(agent);
            if (typeof who === 'string') return setError(who);
            setBusy(true);
            setError(null);
            try {
              const flow = greeting.trim() || instructions.trim() ? { flow: { greeting: greeting.trim(), system_prompt: instructions.trim(), steps: [] } } : null;
              const c = await createCampaign({ name: name.trim(), direction, ...who, ...(flow ? { config: flow } : {}) }).unwrap();
              toast(`Created ${c.name}`);
              navigate(`/campaigns/${c.id}`);
            } catch (e) {
              setError(errMsg(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          Create campaign
        </Button>
      </div>
    </div>
  );
}
