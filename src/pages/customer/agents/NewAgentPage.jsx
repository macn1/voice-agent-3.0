import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Building2, FileText, LayoutTemplate, Mic2, Sparkles, SpellCheck2, Users, Wrench } from 'lucide-react';
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

/** P-08 New agent: template gallery, one-line description, or blank (AGT-01, AGT-11). */
export function NewAgentPage({ hub = false }) {
  const [params] = useSearchParams();
  const initialMode = params.get('prompt') ? 'describe' : params.get('template') ? 'template' : 'template';
  const [mode, setMode] = useState(initialMode);

  return (
    <>
      {!hub && (
        <Link to="/agents" className="back-link">
          <ArrowLeft /> Agents
        </Link>
      )}
      <PageHeader
        eyebrow="Build"
        title={hub ? 'Build a voice agent' : 'New agent'}
        description="Start from a template, describe the job in one line, or begin from a blank agent. You'll land in the editor afterwards."
      />

      <SegmentTabs
        value={mode}
        onChange={setMode}
        items={[
          { value: 'template', label: 'From a template' },
          { value: 'describe', label: 'Describe it' },
          { value: 'blank', label: 'Blank' },
        ]}
      />

      {mode === 'template' && <FromTemplate preselect={params.get('template')} />}
      {mode === 'describe' && <Describe initial={params.get('prompt') ?? ''} />}
      {mode === 'blank' && <Blank />}

      {hub && (
        <div style={{ marginTop: 36 }}>
          <div className="card-title" style={{ fontSize: 18, marginBottom: 14 }}>
            Shared building blocks
          </div>
          <div className="grid-3">
            {[
              {
                to: '/company',
                icon: Building2,
                title: 'Company profile',
                text: 'Business facts every agent can use.',
              },
              {
                to: '/tools',
                icon: Wrench,
                title: 'Tools',
                text: 'Let agents call your APIs mid-conversation.',
              },
              {
                to: '/knowledge',
                icon: FileText,
                title: 'Knowledge base',
                text: 'Documents, websites and FAQs.',
              },
              {
                to: '/settings/pronunciations',
                icon: SpellCheck2,
                title: 'Pronunciations',
                text: 'How to say brand names and terms.',
              },
              {
                to: '/settings/voices',
                icon: Mic2,
                title: 'Custom voices',
                text: 'Cloned or custom voices for your agents.',
              },
              {
                to: '/workflows?tab=teams',
                icon: Users,
                title: 'Agent teams',
                text: 'Hand callers between agents.',
              },
            ].map((b) => (
              <Link
                key={b.to}
                to={b.to}
                className="usecase"
                style={{
                  gridTemplateColumns: '48px minmax(0,1fr) 34px',
                  minHeight: 0,
                }}
              >
                <span className="clay" style={{ width: 48, height: 48, borderRadius: 14 }}>
                  <b.icon style={{ width: 22, height: 22 }} />
                </span>
                <span>
                  <h3 style={{ marginTop: 2 }}>{b.title}</h3>
                  <p style={{ marginTop: 4 }}>{b.text}</p>
                </span>
                <span className="arrow-btn">
                  <ArrowRight />
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
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
      const a = await createAgent({
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
