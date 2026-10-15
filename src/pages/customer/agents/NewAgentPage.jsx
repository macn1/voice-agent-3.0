import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Building2, ChevronRight, FileText, LayoutTemplate, Mic2, Plus, Sparkles, SpellCheck2, Users, Wrench } from 'lucide-react';
import {
  useCreateAgentMutation,
  useCreateFromTemplateMutation,
  useGenerateDraftMutation,
  useListTemplatesQuery,
  usePutAgentSectionMutation,
} from '../../../store/api/flowApi';
import { Async, Button, EmptyState, errMsg, Field, Input, PageHeader, SegmentTabs, useToast } from '../../../components/ui';
import { Textarea } from '../../../components/forms';
import { USE_CASES } from '../useCases';
import { LanguageSelect, ModelSelect, VoicePicker } from './pickers';

const START_OPTIONS = [
  { value: 'template', icon: LayoutTemplate, title: 'From a template', text: 'Pick a ready-made agent for your use case.' },
  { value: 'describe', icon: Sparkles, title: 'Describe it', text: 'Explain the job in a line and get a draft.' },
  { value: 'blank', icon: Plus, title: 'Blank agent', text: 'Start empty and configure everything yourself.' },
];

const BUILDING_BLOCKS = [
  { to: '/company', icon: Building2, title: 'Company profile', text: 'Business facts every agent can use.' },
  { to: '/knowledge', icon: FileText, title: 'Knowledge base', text: 'Documents, websites and FAQs.' },
  { to: '/tools', icon: Wrench, title: 'Tools', text: 'Let agents call your APIs mid-conversation.' },
  { to: '/settings/voices', icon: Mic2, title: 'Custom voices', text: 'Cloned or custom voices for your agents.' },
  { to: '/settings/pronunciations', icon: SpellCheck2, title: 'Pronunciations', text: 'How to say brand names and terms.' },
  { to: '/workflows?tab=teams', icon: Users, title: 'Agent teams', text: 'Hand callers between agents.' },
];

/** P-08 New agent: template gallery, one-line description, or blank (AGT-01, AGT-11).
 *  `hub` is the Build page: a guided "how do you want to start" picker beside the shared building blocks. */
export function NewAgentPage({ hub = false }) {
  const [params] = useSearchParams();
  const initialMode = params.get('prompt') ? 'describe' : 'template';
  const [mode, setMode] = useState(initialMode);

  const panel = (
    <>
      {mode === 'template' && <FromTemplate preselect={params.get('template')} />}
      {mode === 'describe' && <Describe initial={params.get('prompt') ?? ''} />}
      {mode === 'blank' && <Blank />}
    </>
  );

  if (hub) {
    return (
      <>
        <PageHeader
          eyebrow="Build"
          title="Build a voice agent"
          description="Choose how you want to start. Shared building blocks are on the right, set them up once and every agent can use them."
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
                  className={`build-option ${mode === o.value ? 'active' : ''}`}
                  onClick={() => setMode(o.value)}
                >
                  <o.icon aria-hidden />
                  <span>
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
                  <Link to={b.to} className="build-block">
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
      <Link to="/agents" className="back-link">
        <ArrowLeft /> Agents
      </Link>
      <PageHeader
        eyebrow="Build"
        title="New agent"
        description="Start from a template, describe the job in one line, or begin from a blank agent. You'll land in the editor afterwards."
      />
      <SegmentTabs value={mode} onChange={setMode} items={START_OPTIONS.map((o) => ({ value: o.value, label: o.value === 'blank' ? 'Blank' : o.title }))} />
      {panel}
    </>
  );
}

function FromTemplate({ preselect }) {
  const navigate = useNavigate();
  const toast = useToast();
  const templates = useListTemplatesQuery();
  const [createFromTemplate] = useCreateFromTemplateMutation();
  const [busy, setBusy] = useState(null);

  // Home's use-case cards pass a key; match it to a template by name / use case.
  const homeCase = USE_CASES.find((u) => u.key === preselect);

  const create = async (t) => {
    setBusy(t.id);
    try {
      const a = await createFromTemplate({ template_id: t.id, name: t.name }).unwrap();
      toast(`Created ${a.name}`);
      navigate(`/agents/${a.id}`);
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Async state={templates}>
      {(list) =>
        list.length ? (
          <div className="usecase-grid" style={{ marginTop: 0 }}>
            {list.map((t) => {
              const match =
                homeCase &&
                (t.name.toLowerCase().includes(homeCase.title.split(' ')[0].toLowerCase()) ||
                  homeCase.categories.some((c) => c.toLowerCase().includes(t.use_case.replace('_', ' '))));
              const uc = USE_CASES.find((u) => u.title.toLowerCase().includes(t.name.split(' ')[0].toLowerCase()));
              const Icon = uc?.icon ?? LayoutTemplate;
              return (
                <button
                  key={t.id}
                  className="usecase"
                  style={
                    match
                      ? {
                          borderColor: 'var(--accent-border)',
                          boxShadow: 'var(--shadow-glow)',
                        }
                      : undefined
                  }
                  disabled={!!busy}
                  onClick={() => create(t)}
                >
                  <span className={`clay ${match ? 'warm' : ''}`}>
                    <Icon />
                  </span>
                  <span>
                    <h3>{t.name}</h3>
                    <p>{t.description}</p>
                  </span>
                  <span className="arrow-btn">{busy === t.id ? <span className="spinner" /> : <ArrowRight />}</span>
                </button>
              );
            })}
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

function Describe({ initial }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState(null);
  const [generateDraft] = useGenerateDraftMutation();
  const [createAgent] = useCreateAgentMutation();
  const [createFromTemplate] = useCreateFromTemplateMutation();
  const [putSection] = usePutAgentSectionMutation();

  const generate = async () => {
    if (text.trim().length < 10) return setError('Describe the job in a sentence or two.');
    setBusy(true);
    setError(null);
    try {
      setDraft(await generateDraft(text.trim()).unwrap());
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (initial) void generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const create = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      // The suggestion is based on a template: start from it, then apply the edits made above.
      const a = draft.template_id
        ? await createFromTemplate({ template_id: draft.template_id, name: draft.name }).unwrap()
        : await createAgent({
            name: draft.name,
            greeting: draft.flow.greeting,
            system_prompt: draft.flow.system_prompt,
          }).unwrap();
      await Promise.allSettled(
        [
          ['persona', draft.persona],
          ['flow', draft.flow],
          ['guidelines', draft.guidelines],
          ['variables', draft.variables],
        ].map(([section, body]) => putSection({ id: a.id, section, body }).unwrap()),
      );
      toast(`Created ${a.name}`);
      navigate(`/agents/${a.id}`);
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <div className="card card-pad stack">
        <Field label="What should your agent do?" hint="e.g. “Call customers whose EMI is due in 3 days, remind them in Hindi, and record when they'll pay.”">
          <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        {error && <div className="alert-inline">{error}</div>}
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
          <div className="form-grid">
            <Field label="Agent name">
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </Field>
            <Field label="Role">
              <Input
                value={draft.persona.role}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    persona: { ...draft.persona, role: e.target.value },
                  })
                }
              />
            </Field>
            <Field label="Greeting" className="full">
              <Input
                value={draft.flow.greeting}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    flow: { ...draft.flow, greeting: e.target.value },
                  })
                }
              />
            </Field>
            <Field label="Instructions" className="full">
              <Textarea
                rows={6}
                value={draft.flow.system_prompt}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    flow: { ...draft.flow, system_prompt: e.target.value },
                  })
                }
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
            <Button variant="primary" icon={<ArrowRight />} loading={busy} onClick={create}>
              Create agent
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Blank() {
  const navigate = useNavigate();
  const toast = useToast();
  const [f, setF] = useState({
    name: '',
    language: 'en-IN',
    voice_id: '',
    llm: '',
    greeting: '',
    system_prompt: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [createAgent] = useCreateAgentMutation();
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  return (
    <div className="card card-pad stack">
      {error && <div className="alert-inline">{error}</div>}
      <div className="form-grid">
        <Field label="Agent name">
          <Input autoFocus placeholder="e.g. Riya — Appointments" value={f.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Language">
          <LanguageSelect value={f.language} onChange={(v) => set('language', v)} />
        </Field>
        <Field label="Model" hint="Only models your plan and company allow are listed.">
          <ModelSelect kind="llm" value={f.llm} onChange={(v) => set('llm', v)} />
        </Field>
        <Field label="Greeting">
          <Input placeholder="Hi, this is Riya from CareFirst…" value={f.greeting} onChange={(e) => set('greeting', e.target.value)} />
        </Field>
        <Field label="Instructions" className="full" hint="What the agent is for and how it should behave. You can refine this in the editor.">
          <Textarea rows={4} value={f.system_prompt} onChange={(e) => set('system_prompt', e.target.value)} />
        </Field>
      </div>
      <div className="field">
        <span className="field-label">Voice</span>
        <VoicePicker language={f.language} value={f.voice_id} onChange={(v) => set('voice_id', v)} />
      </div>
      <div>
        <Button
          variant="primary"
          loading={busy}
          icon={<ArrowRight />}
          onClick={async () => {
            if (!f.name.trim()) return setError('Give the agent a name');
            setBusy(true);
            setError(null);
            try {
              const a = await createAgent({ ...f, name: f.name.trim() }).unwrap();
              toast(`Created ${a.name}`);
              navigate(`/agents/${a.id}`);
            } catch (e) {
              setError(errMsg(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          Create agent
        </Button>
      </div>
    </div>
  );
}
