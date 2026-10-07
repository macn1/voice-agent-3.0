import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Copy, Download, Eye, FileUp, Pause, Play, Plus, RotateCcw, Trash2, Volume2, XCircle } from 'lucide-react';
import {
  useAddAgentDocumentMutation,
  useCreateScenarioMutation,
  useDeleteAgentMutation,
  useDuplicateAgentMutation,
  useGetAgentSectionQuery,
  useLazyExportAgentQuery,
  useLazyGetAgentSectionQuery,
  useLazyGetVersionQuery,
  useListAgentDocumentsQuery,
  useListGuidelinePresetsQuery,
  useListKnowledgeBasesQuery,
  useListScenariosQuery,
  useListTestRunsQuery,
  useListToolsQuery,
  useListVersionsQuery,
  usePauseAgentMutation,
  usePutAgentSectionMutation,
  useRemoveAgentDocumentMutation,
  useResumeAgentMutation,
  useRollbackVersionMutation,
  useStartTestRunMutation,
  useValidateFlowMutation,
} from '../../../store/api/flowApi';
import { useGetAgentDropoffQuery, useGetAgentLatencyQuery } from '../../../store/api/analyticsApi';
import { useListMessageTemplatesQuery } from '../../../store/api/integrationApi';
import { date, dateTime, number, titleCase } from '../../../lib/format';
import { Async, Badge, Button, ConfirmDialog, EmptyState, errMsg, Field, Input, Modal, StatusBadge, Toggle, useToast } from '../../../components/ui';
import { CopyField, downloadText, LinesEditor, ListEditor, SectionCard, Select, Slider, Textarea, useSection } from '../../../components/forms';
import { HBars, TimeChart } from '../../../components/charts';
import { LanguageSelect, ModelSelect, useModels, VoicePicker } from './pickers';

/* {{variable}} aware prompt field (AGT-10.4) --------------------------- */

/** One editor tab = one draft section: GET + PUT through RTK Query. */
function useAgentSection(id, section) {
  return useSection(useGetAgentSectionQuery({ id, section }), usePutAgentSectionMutation(), (body) => ({ id, section, body }));
}

function useVariableNames(agentId) {
  const v = useGetAgentSectionQuery({ id: agentId, section: 'variables' });
  return (v.data ?? []).map((x) => x.name);
}

export function PromptField({ value, onChange, variables, rows = 4, placeholder }) {
  const ref = useRef(null);
  const [suggest, setSuggest] = useState(null);
  const used = [...value.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]);
  const undefinedVars = [...new Set(used.filter((u) => !variables.includes(u)))];
  const matches = suggest ? variables.filter((v) => v.startsWith(suggest.q)) : [];

  const onInput = (text, caret) => {
    onChange(text);
    const before = text.slice(0, caret);
    const m = before.match(/\{\{\s*([\w.]*)$/);
    setSuggest(m ? { q: m[1], at: caret - m[1].length } : null);
  };

  const insert = (name) => {
    if (!suggest) return;
    const next = value.slice(0, suggest.at) + name + '}}' + value.slice(suggest.at + suggest.q.length).replace(/^\}\}/, '');
    onChange(next);
    setSuggest(null);
    requestAnimationFrame(() => ref.current?.focus());
  };

  return (
    <div style={{ position: 'relative' }}>
      <textarea
        className="textarea"
        ref={ref}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onInput(e.target.value, e.target.selectionStart)}
        onBlur={() => setTimeout(() => setSuggest(null), 150)}
      />
      {matches.length > 0 && (
        <div
          className="dropdown"
          style={{
            top: 'auto',
            bottom: 'calc(100% + 4px)',
            left: 0,
            right: 'auto',
            minWidth: 200,
          }}
        >
          {matches.map((m) => (
            <button key={m} type="button" className="dropdown-item mono" onMouseDown={(e) => e.preventDefault()} onClick={() => insert(m)}>
              {`{{${m}}}`}
            </button>
          ))}
        </div>
      )}
      {undefinedVars.length > 0 && (
        <div className="row small" style={{ marginTop: 6, color: 'var(--amber)', gap: 6 }}>
          <AlertTriangle size={14} /> Not defined in Variables: {undefinedVars.map((u) => `{{${u}}}`).join(', ')}
        </div>
      )}
    </div>
  );
}

/* Identity (AGT-07) + profile sections (AGT-08.7) ----------------------- */

const TONES = ['Warm', 'Professional', 'Friendly', 'Calm', 'Energetic', 'Empathetic', 'Formal'];
const PROFILE_SECTIONS = [
  { key: 'about', label: 'About the company' },
  { key: 'offerings', label: 'Products, services & prices' },
  { key: 'hours', label: 'Opening hours' },
  { key: 'locations', label: 'Locations' },
  { key: 'contact', label: 'Contact details' },
  { key: 'policies', label: 'Policies' },
  { key: 'faqs', label: 'Common questions' },
];

export function IdentityTab({ agent }) {
  const persona = useAgentSection(agent.id, 'persona');
  const overrides = useAgentSection(agent.id, 'profileOverrides');
  const [speaking, setSpeaking] = useState(false);
  const [loadSection] = useLazyGetAgentSectionQuery();

  const hear = async (p) => {
    if (!('speechSynthesis' in window)) return;
    let greeting = '';
    try {
      greeting = (await loadSection({ id: agent.id, section: 'flow' }).unwrap()).greeting;
    } catch {
      /* fall back to a generic introduction */
    }
    const u = new SpeechSynthesisUtterance(greeting || `Hi, I'm ${p.name}, ${p.role}. How can I help you today?`);
    u.rate = 0.8 + (p.personality.energy / 100) * 0.5;
    u.onend = () => setSpeaking(false);
    setSpeaking(true);
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  };

  return (
    <div className="stack">
      <SectionCard
        title="Identity"
        description="Who the agent is. This opens the prompt at call time, before company facts and rules."
        section={persona}
        actions={
          persona.draft && (
            <Button size="sm" variant="ghost" icon={<Volume2 />} loading={speaking} onClick={() => hear(persona.draft)} title="Preview in your browser's voice">
              Hear the introduction
            </Button>
          )
        }
      >
        {(p, patch) => (
          <>
            <div className="form-grid">
              <Field label="Agent's name">
                <Input value={p.name} onChange={(e) => patch({ name: e.target.value })} />
              </Field>
              <Field label="Gender">
                <Select value={p.gender} options={['female', 'male', 'neutral']} onChange={(e) => patch({ gender: e.target.value })} />
              </Field>
              <Field label="Role" className="full" hint="e.g. “Front-desk assistant for CareFirst Clinics”">
                <Input value={p.role} onChange={(e) => patch({ role: e.target.value })} />
              </Field>
            </div>
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
              {[
                ['warmth', 'Reserved', 'Warm'],
                ['energy', 'Calm', 'Energetic'],
                ['formality', 'Casual', 'Formal'],
                ['humour', 'Serious', 'Playful'],
              ].map(([k, l, r]) => (
                <Field key={k} label={titleCase(k)}>
                  <Slider value={p.personality[k]} left={l} right={r} onChange={(v) => patch({ personality: { ...p.personality, [k]: v } })} />
                </Field>
              ))}
            </div>
            <Field label="Speaking style" hint="Anything about how it talks — sentence length, words to use or avoid.">
              <Textarea rows={3} value={p.style} onChange={(e) => patch({ style: e.target.value })} />
            </Field>
          </>
        )}
      </SectionCard>
      <SectionCard
        title="Company profile sections"
        description="Which parts of the company profile this agent may talk about."
        section={overrides}
        actions={
          <Link to="/company" className="btn sm ghost">
            Edit profile
          </Link>
        }
      >
        {(o, patch) => (
          <div className="perm-grid">
            {PROFILE_SECTIONS.map((s) => (
              <label key={s.key} className="check">
                <input
                  type="checkbox"
                  checked={o.sections.includes(s.key)}
                  onChange={(e) =>
                    patch({
                      sections: e.target.checked ? [...o.sections, s.key] : o.sections.filter((x) => x !== s.key),
                    })
                  }
                />
                {s.label}
              </label>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

/* Conversation (AGT-03, ACT-04) --------------------------------------- */

const STEP_TYPES = [
  { value: 'say', label: 'Say / explain' },
  { value: 'collect', label: 'Collect a value' },
  { value: 'branch', label: 'Branch' },
  { value: 'keypad', label: 'Keypad input' },
  { value: 'transfer', label: 'Transfer to human' },
  { value: 'end', label: 'End the call' },
];

export function ConversationTab({ agent }) {
  const vars = useVariableNames(agent.id);
  const [validateFlow] = useValidateFlowMutation();
  const flow = useAgentSection(agent.id, 'flow');
  const [validation, setValidation] = useState(null);
  const [validating, setValidating] = useState(false);
  const toast = useToast();

  // Autosave the draft 1.5s after the last edit (AGT-03.6).
  useEffect(() => {
    if (!flow.dirty) return;
    const t = setTimeout(() => void flow.save(), 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.draft]);

  const validate = async () => {
    setValidating(true);
    try {
      if (flow.dirty) await flow.save();
      setValidation(await validateFlow(agent.id).unwrap());
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setValidating(false);
    }
  };

  const stepIds = (flow.draft?.steps ?? []).map((s) => ({
    value: s.id,
    label: s.title || s.id,
  }));

  return (
    <SectionCard
      title="Conversation"
      description={flow.saving ? 'Saving draft…' : flow.dirty ? 'Unsaved changes — autosaving…' : 'Draft saved. Type {{ to insert a variable.'}
      section={flow}
      actions={
        <Button size="sm" variant="ghost" icon={<CheckCircle2 />} loading={validating} onClick={validate}>
          Validate
        </Button>
      }
    >
      {(f, patch) => (
        <>
          {validation && (
            <div className="stack" style={{ gap: 6 }}>
              {validation.valid && !validation.warnings.length && (
                <div className="banner info" style={{ margin: 0 }}>
                  <CheckCircle2 />
                  <span className="grow">No problems found.</span>
                </div>
              )}
              {[...validation.errors.map((x) => ({ ...x, kind: 'danger' })), ...validation.warnings.map((x) => ({ ...x, kind: 'warn' }))].map((x, i) => (
                <div key={i} className={`banner ${x.kind}`} style={{ margin: 0 }}>
                  {x.kind === 'danger' ? <XCircle /> : <AlertTriangle />}
                  <span className="grow">
                    <b>{x.field}</b>: {x.message}
                  </span>
                </div>
              ))}
            </div>
          )}
          <Field label="Greeting" hint="The first thing the agent says when it speaks first.">
            <PromptField rows={2} value={f.greeting} variables={vars} onChange={(v) => patch({ greeting: v })} />
          </Field>
          <Field label="Instructions (system prompt)">
            <PromptField rows={8} value={f.system_prompt} variables={vars} onChange={(v) => patch({ system_prompt: v })} />
          </Field>
          <div className="field">
            <div className="row between">
              <span className="field-label">Steps</span>
              <Button
                size="sm"
                variant="ghost"
                icon={<Plus />}
                onClick={() =>
                  patch({
                    steps: [
                      ...f.steps,
                      {
                        id: `s${Date.now().toString(36)}`,
                        title: '',
                        instruction: '',
                        type: 'say',
                      },
                    ],
                  })
                }
              >
                Add step
              </Button>
            </div>
            {!f.steps.length && <p className="muted small">No steps — the agent follows the instructions above freely.</p>}
            {f.steps.map((s, i) => {
              const set = (p) =>
                patch({
                  steps: f.steps.map((x, j) => (j === i ? { ...x, ...p } : x)),
                });
              return (
                <div key={s.id} className="card" style={{ padding: 16 }}>
                  <div className="row between" style={{ marginBottom: 12 }}>
                    <span className="badge plain">Step {i + 1}</span>
                    <div className="row" style={{ gap: 4 }}>
                      <Button size="sm" variant="ghost" disabled={i === 0} onClick={() => patch({ steps: swap(f.steps, i, i - 1) })}>
                        ↑
                      </Button>
                      <Button size="sm" variant="ghost" disabled={i === f.steps.length - 1} onClick={() => patch({ steps: swap(f.steps, i, i + 1) })}>
                        ↓
                      </Button>
                      <Button size="sm" variant="ghost" icon={<Trash2 />} onClick={() => patch({ steps: f.steps.filter((_, j) => j !== i) })} />
                    </div>
                  </div>
                  <div className="form-grid">
                    <Field label="Title">
                      <Input value={s.title} onChange={(e) => set({ title: e.target.value })} />
                    </Field>
                    <Field label="Type">
                      <Select value={s.type} options={STEP_TYPES} onChange={(e) => set({ type: e.target.value })} />
                    </Field>
                    <Field label="What to do" className="full">
                      <PromptField rows={2} value={s.instruction} variables={vars} onChange={(v) => set({ instruction: v })} />
                    </Field>
                    {(s.type === 'collect' || s.type === 'keypad') && (
                      <Field label="Save the answer to">
                        <Select
                          value={s.collect_variable ?? ''}
                          options={vars}
                          placeholder="Choose a variable"
                          onChange={(e) => set({ collect_variable: e.target.value })}
                        />
                      </Field>
                    )}
                    {s.type === 'keypad' && (
                      <>
                        <Field label="Max digits">
                          <Input
                            type="number"
                            min={1}
                            value={s.keypad?.max_digits ?? 4}
                            onChange={(e) =>
                              set({
                                keypad: {
                                  max_digits: Number(e.target.value),
                                  mask_in_transcript: s.keypad?.mask_in_transcript ?? true,
                                },
                              })
                            }
                          />
                        </Field>
                        <div className="full">
                          <Toggle
                            checked={s.keypad?.mask_in_transcript ?? true}
                            onChange={(v) =>
                              set({
                                keypad: {
                                  max_digits: s.keypad?.max_digits ?? 4,
                                  mask_in_transcript: v,
                                },
                              })
                            }
                            label="Mask digits in the transcript"
                            description="Use for PINs, card or account numbers."
                          />
                        </div>
                      </>
                    )}
                    {s.type === 'branch' && (
                      <div className="full stack" style={{ gap: 8 }}>
                        <span className="field-label">Branches</span>
                        {(s.branches ?? []).map((b, k) => (
                          <div key={k} className="mapping-row">
                            <input
                              className="input"
                              placeholder="If the caller…"
                              value={b.condition}
                              onChange={(e) =>
                                set({
                                  branches: (s.branches ?? []).map((x, j) => (j === k ? { ...x, condition: e.target.value } : x)),
                                })
                              }
                            />
                            <span className="muted">→</span>
                            <Select
                              value={b.goto}
                              options={stepIds.filter((o) => o.value !== s.id)}
                              placeholder="Go to step"
                              onChange={(e) =>
                                set({
                                  branches: (s.branches ?? []).map((x, j) => (j === k ? { ...x, goto: e.target.value } : x)),
                                })
                              }
                            />
                            <button
                              type="button"
                              className="icon-btn"
                              style={{ width: 36, height: 36 }}
                              onClick={() =>
                                set({
                                  branches: (s.branches ?? []).filter((_, j) => j !== k),
                                })
                              }
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        ))}
                        <div>
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<Plus />}
                            onClick={() =>
                              set({
                                branches: [...(s.branches ?? []), { condition: '', goto: '' }],
                              })
                            }
                          >
                            Add branch
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="grid-2">
            <Field label="End the call when">
              <LinesEditor value={f.end_conditions} onChange={(v) => patch({ end_conditions: v })} placeholder="e.g. Appointment booked" />
            </Field>
            <Field label="Transfer to a human when">
              <LinesEditor value={f.transfer_rules} onChange={(v) => patch({ transfer_rules: v })} placeholder="e.g. Caller asks for a person" />
            </Field>
          </div>
        </>
      )}
    </SectionCard>
  );
}

function swap(xs, i, j) {
  const c = [...xs];
  [c[i], c[j]] = [c[j], c[i]];
  return c;
}

/* Variables (AGT-10) -------------------------------------------------- */

export function VariablesTab({ agent }) {
  const s = useAgentSection(agent.id, 'variables');
  return (
    <SectionCard
      title="Call variables"
      description="Inputs arrive with each call (from the API, a campaign CSV, or the contact). Outputs are what the agent must collect. Use them as {{name}}."
      section={s}
    >
      {(vars, _patch, set) => (
        <>
          <div className="table-wrap" style={{ margin: '-4px -24px' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Direction</th>
                  <th>Required</th>
                  <th>Default</th>
                  <th>Description</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {vars.map((v, i) => {
                  const upd = (p) => set(vars.map((x, j) => (j === i ? { ...x, ...p } : x)));
                  const dup = vars.filter((x) => x.name === v.name).length > 1;
                  return (
                    <tr key={i}>
                      <td>
                        <input
                          className={`input mono ${dup || !/^[a-z_][a-z0-9_]*$/.test(v.name) ? 'invalid' : ''}`}
                          style={{ height: 36, minWidth: 140 }}
                          value={v.name}
                          onChange={(e) => upd({ name: e.target.value.trim() })}
                        />
                      </td>
                      <td>
                        <Select
                          style={{ height: 36 }}
                          value={v.type}
                          options={['text', 'number', 'date', 'boolean', 'phone', 'email']}
                          onChange={(e) => upd({ type: e.target.value })}
                        />
                      </td>
                      <td>
                        <Select style={{ height: 36 }} value={v.direction} options={['input', 'output']} onChange={(e) => upd({ direction: e.target.value })} />
                      </td>
                      <td>
                        <input type="checkbox" checked={v.required} onChange={(e) => upd({ required: e.target.checked })} />
                      </td>
                      <td>
                        <input className="input" style={{ height: 36 }} value={v.default ?? ''} onChange={(e) => upd({ default: e.target.value })} />
                      </td>
                      <td>
                        <input
                          className="input"
                          style={{ height: 36, minWidth: 160 }}
                          value={v.description ?? ''}
                          onChange={(e) => upd({ description: e.target.value })}
                        />
                      </td>
                      <td className="actions">
                        <Button size="sm" variant="ghost" icon={<Trash2 />} onClick={() => set(vars.filter((_, j) => j !== i))} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div>
            <Button
              size="sm"
              variant="ghost"
              icon={<Plus />}
              onClick={() =>
                set([
                  ...vars,
                  {
                    name: `var_${vars.length + 1}`,
                    type: 'text',
                    required: false,
                    direction: 'input',
                  },
                ])
              }
            >
              Add variable
            </Button>
          </div>
          <p className="muted small">Names use lowercase letters, numbers and underscores.</p>
        </>
      )}
    </SectionCard>
  );
}

/* Rules (AGT-09) ------------------------------------------------------ */

export function RulesTab({ agent }) {
  const s = useAgentSection(agent.id, 'guidelines');
  const presets = useListGuidelinePresetsQuery();

  return (
    <SectionCard title="Response rules" description="What the agent must always or never do, and what to say when it doesn't know." section={s}>
      {(g, patch) => (
        <>
          {(presets.data ?? []).length > 0 && (
            <div className="field">
              <span className="field-label">Presets</span>
              <div className="row wrap" style={{ gap: 6 }}>
                {presets.data.map((p) => {
                  const on = g.preset_ids.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={`chip ${on ? 'active' : ''}`}
                      style={{ height: 34 }}
                      title={[...(p.rules.always ?? []), ...(p.rules.never ?? [])].join(' · ')}
                      onClick={() => {
                        if (on)
                          return patch({
                            preset_ids: g.preset_ids.filter((x) => x !== p.id),
                          });
                        const uniq = (a, b = []) => [...new Set([...a, ...b])];
                        patch({
                          preset_ids: [...g.preset_ids, p.id],
                          always: uniq(g.always, p.rules.always),
                          never: uniq(g.never, p.rules.never),
                          blocked_topics: uniq(g.blocked_topics, p.rules.blocked_topics),
                        });
                      }}
                    >
                      {p.name}
                    </button>
                  );
                })}
              </div>
              <span className="hint">Turning a preset on adds its rules below; edit them freely.</span>
            </div>
          )}
          <div className="grid-2">
            <Field label="Always">
              <LinesEditor value={g.always} onChange={(v) => patch({ always: v })} placeholder="e.g. Confirm the date back to the caller" />
            </Field>
            <Field label="Never">
              <LinesEditor value={g.never} onChange={(v) => patch({ never: v })} placeholder="e.g. Promise a discount" />
            </Field>
          </div>
          <Field label="Topics to refuse">
            <ListEditor value={g.blocked_topics} onChange={(v) => patch({ blocked_topics: v })} placeholder="Add a topic and press Enter" />
          </Field>
          <Field label="When it doesn't know" hint="Said instead of guessing. The agent never invents company facts.">
            <Textarea rows={2} value={g.fallback_answer} onChange={(e) => patch({ fallback_answer: e.target.value })} />
          </Field>
          <Field label="Hand over to a human when">
            <LinesEditor
              value={g.escalation_triggers}
              onChange={(v) => patch({ escalation_triggers: v })}
              placeholder="e.g. Caller mentions a legal complaint"
            />
          </Field>
        </>
      )}
    </SectionCard>
  );
}

/* Behaviour (AGT-12, CALL-06.4) --------------------------------------- */

export function BehaviourTab({ agent }) {
  const s = useAgentSection(agent.id, 'behaviour');
  return (
    <SectionCard title="Conversation behaviour" description="Who speaks first, silence, call length, voicemail and transfers." section={s}>
      {(b, patch) => (
        <>
          <div className="form-grid">
            <Field label="Who speaks first">
              <Select
                value={b.first_speaker}
                options={[
                  { value: 'agent', label: 'The agent' },
                  { value: 'caller', label: 'The caller' },
                ]}
                onChange={(e) => patch({ first_speaker: e.target.value })}
              />
            </Field>
            <Field label="Opening line">
              <Input value={b.opening_line} onChange={(e) => patch({ opening_line: e.target.value })} />
            </Field>
            <Field label="Silence timeout (seconds)">
              <Input
                type="number"
                min={2}
                max={30}
                value={b.silence_timeout_seconds}
                onChange={(e) => patch({ silence_timeout_seconds: Number(e.target.value) })}
              />
            </Field>
            <Field label="Reprompts before ending">
              <Input type="number" min={0} max={5} value={b.silence_reprompts} onChange={(e) => patch({ silence_reprompts: Number(e.target.value) })} />
            </Field>
            <Field label="Reprompt message" className="full">
              <Input value={b.reprompt_message} onChange={(e) => patch({ reprompt_message: e.target.value })} />
            </Field>
            <Field label="Max call length (minutes)">
              <Input type="number" min={1} max={60} value={b.max_duration_minutes} onChange={(e) => patch({ max_duration_minutes: Number(e.target.value) })} />
            </Field>
            <Field label="Transfer number" hint="Human line for transfers (international format).">
              <Input className="mono" placeholder="+918045678999" value={b.transfer_number} onChange={(e) => patch({ transfer_number: e.target.value })} />
            </Field>
          </div>
          <Field label="Phrases that end the call">
            <ListEditor value={b.end_call_phrases} onChange={(v) => patch({ end_call_phrases: v })} />
          </Field>
          <div className="form-grid">
            <Field label="If it reaches voicemail">
              <Select
                value={b.voicemail_action}
                options={[
                  { value: 'hang_up', label: 'Hang up' },
                  { value: 'leave_message', label: 'Leave a message' },
                  { value: 'retry_later', label: 'Hang up and retry later' },
                ]}
                onChange={(e) => patch({ voicemail_action: e.target.value })}
              />
            </Field>
            {b.voicemail_action === 'leave_message' && (
              <Field label="Voicemail message" className="full">
                <Textarea rows={2} value={b.voicemail_message} onChange={(e) => patch({ voicemail_message: e.target.value })} />
              </Field>
            )}
          </div>
        </>
      )}
    </SectionCard>
  );
}

/* Voice (AGT-02, AGT-13) ---------------------------------------------- */

export function VoiceTab({ agent }) {
  const speech = useAgentSection(agent.id, 'speech');
  const keywords = useAgentSection(agent.id, 'keywords');
  return (
    <div className="stack">
      <SectionCard title="Voice" description="How the agent sounds and how easily callers can interrupt it." section={speech}>
        {(s, patch) => (
          <>
            <div className="field">
              <span className="field-label">Voice</span>
              <VoicePicker language={agent.language} value={s.voice_id} onChange={(v) => patch({ voice_id: v })} />
            </div>
            <div className="grid-2">
              <Field label="Speaking speed">
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
                <Slider
                  value={s.interruption_sensitivity}
                  left="Hard to interrupt"
                  right="Stops instantly"
                  onChange={(v) => patch({ interruption_sensitivity: v })}
                />
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
      <SectionCard
        title="Recognition keywords"
        description="Names and products the speech recogniser should expect."
        section={keywords}
        actions={
          <Link to="/settings/pronunciations" className="btn sm ghost">
            Pronunciations
          </Link>
        }
      >
        {(k, _patch, set) => <ListEditor value={k} onChange={set} placeholder="e.g. CareFirst, Dr. Iyer" />}
      </SectionCard>
    </div>
  );
}

/* Languages (AGT-14) -------------------------------------------------- */

export function LanguagesTab({ agent }) {
  const s = useAgentSection(agent.id, 'languages');
  return (
    <SectionCard title="Languages" description="Primary language plus extras. Each language can have its own voice and greeting." section={s}>
      {(l, patch) => (
        <>
          <div className="form-grid">
            <Field label="Primary language">
              <LanguageSelect value={l.primary} onChange={(v) => patch({ primary: v })} />
            </Field>
            <Field label="Language switching">
              <Select
                value={l.detection}
                options={[
                  {
                    value: 'auto',
                    label: 'Detect the caller’s language and switch',
                  },
                  { value: 'ask', label: 'Ask the caller which language' },
                  { value: 'off', label: 'Stay in the primary language' },
                ]}
                onChange={(e) => patch({ detection: e.target.value })}
              />
            </Field>
          </div>
          {l.languages.map((lang, i) => {
            const upd = (p) =>
              patch({
                languages: l.languages.map((x, j) => (j === i ? { ...x, ...p } : x)),
              });
            return (
              <div key={i} className="card" style={{ padding: 16 }}>
                <div className="row between" style={{ marginBottom: 12 }}>
                  <div style={{ width: 280 }}>
                    <LanguageSelect value={lang.language} onChange={(v) => upd({ language: v })} />
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Trash2 />}
                    disabled={l.languages.length === 1}
                    onClick={() =>
                      patch({
                        languages: l.languages.filter((_, j) => j !== i),
                      })
                    }
                  >
                    Remove
                  </Button>
                </div>
                <Field label="Greeting in this language">
                  <Input value={lang.greeting} onChange={(e) => upd({ greeting: e.target.value })} />
                </Field>
                <div className="field" style={{ marginTop: 12 }}>
                  <span className="field-label">Voice</span>
                  <VoicePicker language={lang.language} value={lang.voice_id} onChange={(v) => upd({ voice_id: v })} />
                </div>
              </div>
            );
          })}
          <div>
            <Button
              size="sm"
              variant="ghost"
              icon={<Plus />}
              onClick={() =>
                patch({
                  languages: [...l.languages, { language: '', voice_id: '', greeting: '' }],
                })
              }
            >
              Add language
            </Button>
          </div>
        </>
      )}
    </SectionCard>
  );
}

/* Knowledge (KNW-01.7, AGT-05) --------------------------------------- */

export function KnowledgeTab({ agent }) {
  const toast = useToast();
  const kbs = useListKnowledgeBasesQuery();
  const [addDocument] = useAddAgentDocumentMutation();
  const [removeDocument] = useRemoveAgentDocumentMutation();
  const attached = useAgentSection(agent.id, 'knowledgeBases');
  const docs = useListAgentDocumentsQuery(agent.id);
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (file) => {
    setUploading(true);
    try {
      // Creates the document and uploads the file to its signed URL.
      await addDocument({ id: agent.id, file }).unwrap();
      toast(`${file.name} uploaded — processing`);
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="stack">
      <SectionCard
        title="Knowledge bases"
        description="Shared knowledge this agent answers from."
        section={attached}
        actions={
          <Link to="/knowledge" className="btn sm ghost">
            Manage
          </Link>
        }
      >
        {(ids, _patch, set) => (
          <Async state={kbs}>
            {(list) =>
              list.length ? (
                <div className="stack" style={{ gap: 10 }}>
                  {list.map((kb) => (
                    <label key={kb.id} className="check">
                      <input
                        type="checkbox"
                        checked={ids.includes(kb.id)}
                        onChange={(e) => set(e.target.checked ? [...ids, kb.id] : ids.filter((x) => x !== kb.id))}
                      />
                      <span>
                        <span style={{ fontWeight: 500 }}>{kb.name}</span>
                        <span className="muted small" style={{ display: 'block' }}>
                          {kb.sources_count} sources · updated {date(kb.updated_at)}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No knowledge bases"
                  description="Create one on the Knowledge page."
                  action={
                    <Link to="/knowledge" className="btn sm">
                      Go to Knowledge
                    </Link>
                  }
                />
              )
            }
          </Async>
        )}
      </SectionCard>
      <div className="card">
        <div className="card-head">
          <div>
            <h2>Agent documents</h2>
            <div className="card-sub">Files only this agent uses.</div>
          </div>
          <input ref={fileRef} type="file" hidden accept=".pdf,.doc,.docx,.txt,.md,.csv" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <Button size="sm" icon={<FileUp />} loading={uploading} onClick={() => fileRef.current?.click()}>
            Upload
          </Button>
        </div>
        <Async state={docs}>
          {(list) =>
            list.length ? (
              <table className="table">
                <tbody>
                  {list.map((d) => (
                    <tr key={d.id}>
                      <td className="cell-main">{d.title}</td>
                      <td>
                        <StatusBadge status={d.status === 'ready' ? 'active' : d.status} label={titleCase(d.status)} />
                        {d.error && (
                          <div className="cell-sub" style={{ color: 'var(--red)' }}>
                            {d.error}
                          </div>
                        )}
                      </td>
                      <td className="muted">{date(d.created_at)}</td>
                      <td className="actions">
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Trash2 />}
                          onClick={() =>
                            removeDocument({ id: agent.id, docId: d.id })
                              .unwrap()
                              .catch((e) => toast(errMsg(e), 'error'))
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState title="No documents" description="Upload PDFs, Word files or text." />
            )
          }
        </Async>
      </div>
    </div>
  );
}

/* Tools (ACT-01.6) ---------------------------------------------------- */

export function ToolsTab({ agent }) {
  const all = useListToolsQuery();
  const s = useAgentSection(agent.id, 'tools');
  return (
    <SectionCard
      title="Tools"
      description="APIs this agent may call during a conversation."
      section={s}
      actions={
        <Link to="/tools" className="btn sm ghost">
          Manage tools
        </Link>
      }
    >
      {(ids, _patch, set) => (
        <Async state={all}>
          {(list) =>
            list.length ? (
              <div className="stack" style={{ gap: 12 }}>
                {list.map((t) => (
                  <label key={t.id} className="check">
                    <input
                      type="checkbox"
                      checked={ids.includes(t.id)}
                      onChange={(e) => set(e.target.checked ? [...ids, t.id] : ids.filter((x) => x !== t.id))}
                    />
                    <span>
                      <span className="mono" style={{ fontWeight: 600 }}>
                        {t.name}
                      </span>
                      <span className="muted small" style={{ display: 'block' }}>
                        {t.description}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No tools yet"
                action={
                  <Link to="/tools" className="btn sm">
                    Create a tool
                  </Link>
                }
              />
            )
          }
        </Async>
      )}
    </SectionCard>
  );
}

/* Follow-ups (ACT-03) ------------------------------------------------- */

export function FollowUpsTab({ agent }) {
  const s = useAgentSection(agent.id, 'followUps');
  const templates = useListMessageTemplatesQuery();
  const outcomes = useGetAgentSectionQuery({ id: agent.id, section: 'outcomes' });
  return (
    <SectionCard
      title="Follow-up messages"
      description="When something happens on a call, send a WhatsApp, SMS or email with call variables filled in."
      section={s}
      actions={
        <Link to="/workflows?tab=messages" className="btn sm ghost">
          Sent log
        </Link>
      }
    >
      {(rules, _patch, set) => (
        <>
          {!rules.length && <p className="muted small">No follow-ups yet.</p>}
          {rules.map((r, i) => {
            const upd = (p) => set(rules.map((x, j) => (j === i ? { ...x, ...p } : x)));
            const tpl = (templates.data ?? []).filter((t) => t.channel === r.channel);
            return (
              <div key={r.id} className="card" style={{ padding: 16 }}>
                <div className="row between" style={{ marginBottom: 12 }}>
                  <Toggle checked={r.enabled} onChange={(v) => upd({ enabled: v })} label={r.enabled ? 'On' : 'Off'} />
                  <Button size="sm" variant="ghost" icon={<Trash2 />} onClick={() => set(rules.filter((_, j) => j !== i))} />
                </div>
                <div className="form-grid">
                  <Field label="When">
                    <Select
                      value={r.trigger}
                      options={[
                        { value: 'call_completed', label: 'A call completes' },
                        {
                          value: 'appointment_booked',
                          label: 'An appointment is booked',
                        },
                        {
                          value: 'outcome',
                          label: 'A call ends with an outcome',
                        },
                        {
                          value: 'no_answer',
                          label: 'The call isn’t answered',
                        },
                      ]}
                      onChange={(e) => upd({ trigger: e.target.value })}
                    />
                  </Field>
                  {r.trigger === 'outcome' && (
                    <Field label="Outcome">
                      <Select
                        value={r.outcome ?? ''}
                        options={(outcomes.data?.outcomes ?? []).map((o) => ({
                          value: o.key,
                          label: o.label,
                        }))}
                        placeholder="Choose"
                        onChange={(e) => upd({ outcome: e.target.value })}
                      />
                    </Field>
                  )}
                  <Field label="Channel">
                    <Select
                      value={r.channel}
                      options={[
                        { value: 'whatsapp', label: 'WhatsApp' },
                        { value: 'sms', label: 'SMS' },
                        { value: 'email', label: 'Email' },
                      ]}
                      onChange={(e) => upd({ channel: e.target.value, template_id: '' })}
                    />
                  </Field>
                  <Field label="Template" hint={r.channel === 'whatsapp' ? 'Only approved templates can be sent.' : undefined}>
                    <Select
                      value={r.template_id}
                      options={tpl.map((t) => ({
                        value: t.id,
                        label: `${t.name}${t.status !== 'approved' ? ` (${t.status})` : ''}`,
                      }))}
                      placeholder="Choose a template"
                      onChange={(e) => upd({ template_id: e.target.value })}
                    />
                  </Field>
                  <Field label="Delay (minutes)">
                    <Input type="number" min={0} value={r.delay_minutes} onChange={(e) => upd({ delay_minutes: Number(e.target.value) })} />
                  </Field>
                </div>
              </div>
            );
          })}
          <div>
            <Button
              size="sm"
              variant="ghost"
              icon={<Plus />}
              onClick={() =>
                set([
                  ...rules,
                  {
                    id: `fu_${Date.now().toString(36)}`,
                    trigger: 'call_completed',
                    channel: 'whatsapp',
                    template_id: '',
                    delay_minutes: 0,
                    enabled: true,
                  },
                ])
              }
            >
              Add follow-up
            </Button>
          </div>
        </>
      )}
    </SectionCard>
  );
}

/* Analysis & outcomes (PCA-01, PCA-02) -------------------------------- */

export function AnalysisTab({ agent }) {
  const cfg = useAgentSection(agent.id, 'analysis');
  const out = useAgentSection(agent.id, 'outcomes');
  return (
    <div className="stack">
      <SectionCard
        title="After each call"
        description="Summary, sentiment and the fields to extract. Results show on the call and go out in webhooks."
        section={cfg}
      >
        {(c, patch) => (
          <>
            <div className="row wrap" style={{ gap: 28 }}>
              <Toggle checked={c.summary} onChange={(v) => patch({ summary: v })} label="Write a summary" />
              <Toggle checked={c.sentiment} onChange={(v) => patch({ sentiment: v })} label="Detect sentiment" />
            </div>
            <div className="field">
              <span className="field-label">Fields to extract</span>
              {c.fields.map((f, i) => {
                const upd = (p) =>
                  patch({
                    fields: c.fields.map((x, j) => (j === i ? { ...x, ...p } : x)),
                  });
                return (
                  <div key={i} className="card" style={{ padding: 14 }}>
                    <div className="form-grid">
                      <Field label="Name">
                        <Input className="mono" value={f.name} onChange={(e) => upd({ name: e.target.value })} />
                      </Field>
                      <Field label="Type">
                        <Select value={f.type} options={['text', 'number', 'boolean', 'choice', 'date']} onChange={(e) => upd({ type: e.target.value })} />
                      </Field>
                      <Field label="What to look for" className="full">
                        <Input value={f.description} onChange={(e) => upd({ description: e.target.value })} />
                      </Field>
                      {f.type === 'choice' && (
                        <Field label="Choices" className="full">
                          <ListEditor value={f.choices ?? []} onChange={(v) => upd({ choices: v })} />
                        </Field>
                      )}
                    </div>
                    <div style={{ textAlign: 'right', marginTop: 8 }}>
                      <Button size="sm" variant="ghost" icon={<Trash2 />} onClick={() => patch({ fields: c.fields.filter((_, j) => j !== i) })}>
                        Remove
                      </Button>
                    </div>
                  </div>
                );
              })}
              <div>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Plus />}
                  onClick={() =>
                    patch({
                      fields: [...c.fields, { name: '', type: 'text', description: '' }],
                    })
                  }
                >
                  Add field
                </Button>
              </div>
            </div>
          </>
        )}
      </SectionCard>
      <SectionCard title="Outcomes" description="Every call ends with one outcome. Mark which ones count as success." section={out}>
        {(o, patch) => (
          <>
            {o.outcomes.map((x, i) => {
              const upd = (p) =>
                patch({
                  outcomes: o.outcomes.map((y, j) => (j === i ? { ...y, ...p } : y)),
                });
              return (
                <div key={i} className="row wrap" style={{ gap: 10 }}>
                  <input
                    className="input"
                    style={{ flex: 2, minWidth: 160 }}
                    placeholder="Label"
                    value={x.label}
                    onChange={(e) =>
                      upd({
                        label: e.target.value,
                        key: x.key || e.target.value.toLowerCase().replace(/\W+/g, '_'),
                      })
                    }
                  />
                  <input
                    className="input mono"
                    style={{ flex: 1, minWidth: 120 }}
                    placeholder="key"
                    value={x.key}
                    onChange={(e) => upd({ key: e.target.value })}
                  />
                  <label className="check" style={{ whiteSpace: 'nowrap' }}>
                    <input type="checkbox" checked={x.is_success} onChange={(e) => upd({ is_success: e.target.checked })} />
                    Success
                  </label>
                  <Button size="sm" variant="ghost" icon={<Trash2 />} onClick={() => patch({ outcomes: o.outcomes.filter((_, j) => j !== i) })} />
                </div>
              );
            })}
            <div>
              <Button
                size="sm"
                variant="ghost"
                icon={<Plus />}
                onClick={() =>
                  patch({
                    outcomes: [...o.outcomes, { key: '', label: '', is_success: false }],
                  })
                }
              >
                Add outcome
              </Button>
            </div>
            <Field label="Success means" hint="Plain-language rule shown in reports.">
              <Input value={o.success_rule} onChange={(e) => patch({ success_rule: e.target.value })} />
            </Field>
          </>
        )}
      </SectionCard>
    </div>
  );
}

/* Compliance (CMP-01) ------------------------------------------------- */

export function ComplianceTab({ agent }) {
  const s = useAgentSection(agent.id, 'compliance');
  return (
    <SectionCard title="Compliance" description="Recording consent and AI disclosure, spoken at the start of every call." section={s}>
      {(c, patch) => (
        <>
          <Toggle
            checked={c.recording_enabled}
            onChange={(v) => patch({ recording_enabled: v })}
            label="Record calls"
            description="Turn off where recording isn't allowed. Transcripts are still kept unless privacy settings say otherwise."
          />
          {c.recording_enabled && (
            <Field label="Recording notice">
              <Input value={c.consent_line} onChange={(e) => patch({ consent_line: e.target.value })} />
            </Field>
          )}
          <Toggle checked={c.ai_disclosure_enabled} onChange={(v) => patch({ ai_disclosure_enabled: v })} label="Tell callers they're talking to an AI" />
          {c.ai_disclosure_enabled && (
            <Field label="AI disclosure line">
              <Input value={c.ai_disclosure_line} onChange={(e) => patch({ ai_disclosure_line: e.target.value })} />
            </Field>
          )}
          <p className="muted small">
            Company-wide rules live in <Link to="/settings/privacy">Privacy</Link>, <Link to="/settings/calling-rules">Calling rules</Link> and{' '}
            <Link to="/settings/do-not-call">Do-not-call</Link>.
          </p>
        </>
      )}
    </SectionCard>
  );
}

/* Tests (QTY-01) ------------------------------------------------------ */

export function TestsTab({ agent }) {
  const toast = useToast();
  const scenarios = useListScenariosQuery(agent.id);
  const [poll, setPoll] = useState(0);
  const runs = useListTestRunsQuery(agent.id, { pollingInterval: poll });
  const [startTestRun, { isLoading: running }] = useStartTestRunMutation();
  const [createScenario] = useCreateScenarioMutation();
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState(null);

  // Poll while a run is in progress.
  const latest = runs.data?.[0];
  useEffect(() => setPoll(latest?.status === 'running' ? 2500 : 0), [latest]);

  return (
    <div className="stack">
      <div className="card">
        <div className="card-head">
          <div>
            <h2>Test scenarios</h2>
            <div className="card-sub">Simulated callers with what must happen. Run them before publishing.</div>
          </div>
          <div className="row">
            <Button size="sm" icon={<Plus />} onClick={() => setAdding(true)}>
              Add scenario
            </Button>
            <Button
              size="sm"
              variant="primary"
              icon={<Play />}
              loading={running}
              disabled={!scenarios.data?.length}
              onClick={async () => {
                try {
                  await startTestRun(agent.id).unwrap();
                } catch (e) {
                  toast(errMsg(e), 'error');
                }
              }}
            >
              Run all
            </Button>
          </div>
        </div>
        <Async state={scenarios}>
          {(list) =>
            list.length ? (
              <table className="table">
                <tbody>
                  {list.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <div className="cell-main">{s.name}</div>
                        <div className="cell-sub">{s.caller_script}</div>
                      </td>
                      <td>
                        <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>
                          {s.expectations.map((x) => (
                            <li key={x}>{x}</li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState title="No scenarios" description="e.g. “Angry caller asks for a refund” — must apologise and offer a callback." />
            )
          }
        </Async>
      </div>
      <div className="card">
        <div className="card-head">
          <h2>Runs</h2>
        </div>
        <Async state={runs}>
          {(list) =>
            list.length ? (
              <table className="table">
                <thead>
                  <tr>
                    <th>Started</th>
                    <th>Version</th>
                    <th>Result</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => (
                    <tr key={r.id}>
                      <td>{dateTime(r.started_at)}</td>
                      <td>{r.agent_version ? `v${r.agent_version}` : 'Draft'}</td>
                      <td>
                        <StatusBadge status={r.status === 'passed' ? 'active' : r.status === 'failed' ? 'failed' : 'pending'} label={titleCase(r.status)} />
                        {r.results.length > 0 && (
                          <span className="muted small" style={{ marginLeft: 8 }}>
                            {r.results.filter((x) => x.passed).length}/{r.results.length} passed
                          </span>
                        )}
                      </td>
                      <td className="actions">
                        <Button size="sm" variant="ghost" icon={<Eye />} disabled={!r.results.length} onClick={() => setViewing(r)}>
                          Details
                        </Button>
                      </td>
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
      <ScenarioModal
        open={adding}
        onClose={() => setAdding(false)}
        onSave={async (b) => {
          await createScenario({ id: agent.id, ...b }).unwrap();
          toast('Scenario added');
        }}
      />

      <Modal open={!!viewing} onClose={() => setViewing(null)} wide title="Test run results">
        {viewing?.results.map((r) => (
          <div key={r.scenario_id} className="perm-group">
            <div className="row" style={{ gap: 8 }}>
              {r.passed ? <CheckCircle2 size={16} color="var(--green)" /> : <XCircle size={16} color="var(--red)" />}
              <b>{r.name}</b>
            </div>
            <p className="muted small" style={{ margin: '6px 0 10px' }}>
              {r.notes}
            </p>
            <div className="chat">
              {r.transcript.map((t) => (
                <div key={t.seq} className={`bubble ${t.speaker === 'caller' ? 'me' : t.speaker === 'agent' ? 'them' : 'sys'}`}>
                  {t.text ?? t.tool_call?.name}
                </div>
              ))}
            </div>
          </div>
        ))}
      </Modal>
    </div>
  );
}

function ScenarioModal({ open, onClose, onSave }) {
  const [name, setName] = useState('');
  const [script, setScript] = useState('');
  const [exp, setExp] = useState(['']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (open) {
      setName('');
      setScript('');
      setExp(['']);
      setError(null);
    }
  }, [open]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New test scenario"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              const expectations = exp.map((x) => x.trim()).filter(Boolean);
              if (!name.trim() || !script.trim() || !expectations.length) return setError('Fill in the name, the caller and at least one expectation.');
              setBusy(true);
              try {
                await onSave({
                  name: name.trim(),
                  caller_script: script.trim(),
                  expectations,
                });
                onClose();
              } catch (e) {
                setError(errMsg(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Save scenario
          </Button>
        </>
      }
    >
      <div className="stack">
        {error && <div className="alert-inline">{error}</div>}
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Angry caller asks for a refund" />
        </Field>
        <Field label="Who is calling and what they want">
          <Textarea rows={3} value={script} onChange={(e) => setScript(e.target.value)} />
        </Field>
        <Field label="What must happen">
          <LinesEditor value={exp} onChange={setExp} placeholder="e.g. Apologises and offers a callback" />
        </Field>
      </div>
    </Modal>
  );
}

/* Insights (ANA-F2) --------------------------------------------------- */

export function InsightsTab({ agent }) {
  const drop = useGetAgentDropoffQuery(agent.id);
  const lat = useGetAgentLatencyQuery(agent.id);
  return (
    <div className="stack">
      <div className="card">
        <div className="card-head">
          <div>
            <h2>Where callers drop off</h2>
            <div className="card-sub">Callers reaching each step of the flow.</div>
          </div>
        </div>
        <div className="card-pad">
          <Async state={drop}>
            {(rows) =>
              rows.length ? (
                <HBars
                  rows={rows.map((r) => ({
                    label: r.step,
                    value: r.reached,
                    hint: `${r.reached} reached · ${r.dropped} dropped here`,
                  }))}
                />
              ) : (
                <EmptyState title="Not enough calls yet" />
              )
            }
          </Async>
        </div>
      </div>
      <div className="card">
        <div className="card-head">
          <div>
            <h2>Response time</h2>
            <div className="card-sub">Time from the caller finishing to the agent starting to speak. Target under 500 ms.</div>
          </div>
        </div>
        <div className="card-pad">
          <Async state={lat}>
            {(rows) =>
              rows.length ? (
                <TimeChart
                  data={rows}
                  x="day"
                  kind="line"
                  series={[
                    { key: 'p50', label: 'Median' },
                    { key: 'p95', label: '95th percentile' },
                  ]}
                  format={(v) => `${number(v)} ms`}
                />
              ) : (
                <EmptyState title="No latency data yet" />
              )
            }
          </Async>
        </div>
      </div>
    </div>
  );
}

/* Versions (AGT-04) --------------------------------------------------- */

export function VersionsTab({ agent }) {
  const toast = useToast();
  const versions = useListVersionsQuery(agent.id);
  const [loadVersion] = useLazyGetVersionQuery();
  const [rollback] = useRollbackVersionMutation();
  const [view, setView] = useState(null);
  const [rolling, setRolling] = useState(null);
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Version history</h2>
          <div className="card-sub">Each publish is an immutable snapshot. Roll back to make an older one live.</div>
        </div>
      </div>
      <Async state={versions}>
        {(list) =>
          list.length ? (
            <table className="table">
              <thead>
                <tr>
                  <th>Version</th>
                  <th>Note</th>
                  <th>Published</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((v) => (
                  <tr key={v.version}>
                    <td>
                      <div className="row" style={{ gap: 8 }}>
                        <b>v{v.version}</b>
                        {v.is_live && <Badge tone="green">Live</Badge>}
                      </div>
                    </td>
                    <td className="muted">{v.note || '—'}</td>
                    <td className="muted">
                      {dateTime(v.published_at)}
                      {v.published_by ? ` · ${v.published_by}` : ''}
                    </td>
                    <td className="actions">
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Eye />}
                        onClick={() =>
                          loadVersion({ id: agent.id, version: v.version })
                            .unwrap()
                            .then(setView)
                            .catch((e) => toast(errMsg(e), 'error'))
                        }
                      >
                        View
                      </Button>
                      {!v.is_live && (
                        <Button size="sm" variant="ghost" icon={<RotateCcw />} onClick={() => setRolling(v)}>
                          Roll back
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState title="Not published yet" description="Use Publish at the top to make version 1 live." />
          )
        }
      </Async>
      <Modal
        open={!!view}
        onClose={() => setView(null)}
        wide
        title={`Version ${view?.version}`}
        description={view ? `Published ${dateTime(view.published_at)}` : undefined}
      >
        <pre className="code" style={{ maxHeight: 460 }}>
          {JSON.stringify(view?.config ?? view, null, 2)}
        </pre>
      </Modal>
      <ConfirmDialog
        open={!!rolling}
        onClose={() => setRolling(null)}
        title={`Make version ${rolling?.version} live?`}
        description="New calls use it immediately. Your current draft is kept."
        confirmLabel="Roll back"
        onConfirm={async () => {
          await rollback({ id: agent.id, version: rolling.version }).unwrap();
          toast(`Version ${rolling.version} is live`);
        }}
      />
    </div>
  );
}

/* Web & chat (WID-01, WA-06.2, WA-03.2) -------------------------------- */

function WidgetCard({ title, description, agentId, section, snippet }) {
  const s = useAgentSection(agentId, section);
  return (
    <SectionCard title={title} description={description} section={s}>
      {(w, patch) => (
        <>
          <Toggle checked={w.enabled} onChange={(v) => patch({ enabled: v })} label="Enabled" />
          <div className="form-grid">
            <Field label="Button text">
              <Input value={w.button_text} onChange={(e) => patch({ button_text: e.target.value })} />
            </Field>
            <Field label="Colour">
              <div className="row" style={{ gap: 8 }}>
                <input type="color" className="color-input" value={w.color} onChange={(e) => patch({ color: e.target.value })} />
                <Input className="mono" value={w.color} onChange={(e) => patch({ color: e.target.value })} />
              </div>
            </Field>
            <Field label="Position">
              <Select
                value={w.position}
                options={[
                  { value: 'bottom-right', label: 'Bottom right' },
                  { value: 'bottom-left', label: 'Bottom left' },
                ]}
                onChange={(e) => patch({ position: e.target.value })}
              />
            </Field>
            <Field label="Allowed websites" className="full" hint="Only these domains can load it.">
              <ListEditor value={w.allowed_domains} onChange={(v) => patch({ allowed_domains: v })} placeholder="www.example.com" mono />
            </Field>
          </div>
          <div className="row" style={{ gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 260 }}>
              <div className="field-label" style={{ marginBottom: 6 }}>
                Embed snippet
              </div>
              <pre className="code">{snippet(w)}</pre>
            </div>
            <div style={{ width: 220 }}>
              <div className="field-label" style={{ marginBottom: 6 }}>
                Preview
              </div>
              <div
                style={{
                  position: 'relative',
                  height: 120,
                  borderRadius: 12,
                  border: '1px dashed var(--border-strong)',
                  background: 'var(--surface-2)',
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    bottom: 12,
                    [w.position === 'bottom-left' ? 'left' : 'right']: 12,
                    padding: '8px 14px',
                    borderRadius: 999,
                    background: w.color,
                    color: '#fff',
                    fontSize: 12.5,
                    fontWeight: 500,
                  }}
                >
                  {w.button_text}
                </span>
              </div>
            </div>
          </div>
        </>
      )}
    </SectionCard>
  );
}

export function ChannelsTab({ agent }) {
  const chat = useAgentSection(agent.id, 'chatSettings');
  const origin = window.location.origin;
  return (
    <div className="stack">
      <WidgetCard
        title="Web call widget"
        description="Website visitors click and talk to this agent in the browser."
        agentId={agent.id}
        section="widget"
        snippet={(w) => `<script src="${origin}/widget.js"\n  data-widget-key="${w.widget_key}"\n  async></script>`}
      />

      <WidgetCard
        title="Website chat bubble"
        description="The same agent answers typed chat on your site."
        agentId={agent.id}
        section="webchat"
        snippet={(w) => `<script src="${origin}/webchat.js"\n  data-key="${w.widget_key}"\n  async></script>`}
      />

      <SectionCard
        title="Chat settings"
        description="How this agent replies on WhatsApp and web chat."
        section={chat}
        actions={
          <Link to="/channels/whatsapp" className="btn sm ghost">
            WhatsApp
          </Link>
        }
      >
        {(c, patch) => (
          <div className="form-grid">
            <Field label="Reply style">
              <Input value={c.reply_style} onChange={(e) => patch({ reply_style: e.target.value })} />
            </Field>
            <Field label="Max reply length (characters)">
              <Input type="number" value={c.max_reply_chars} onChange={(e) => patch({ max_reply_chars: Number(e.target.value) })} />
            </Field>
            <div className="full">
              <Toggle checked={c.understand_voice_notes} onChange={(v) => patch({ understand_voice_notes: v })} label="Understand voice notes" />
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

/* Settings (AGT-17, AGT-18, AGT-19, CON-02.2) -------------------------- */

const TIMEZONES = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'America/New_York', 'UTC'];

export function SettingsTab({ agent }) {
  const toast = useToast();
  const navigate = useNavigate();
  const settings = useAgentSection(agent.id, 'settings');
  const model = useAgentSection(agent.id, 'model');
  const memory = useAgentSection(agent.id, 'memory');
  const models = useModels();
  const [pauseAgent, { isLoading: pausingP }] = usePauseAgentMutation();
  const [resumeAgent, { isLoading: resumingP }] = useResumeAgentMutation();
  const pausing = pausingP || resumingP;
  const [exportAgent] = useLazyExportAgentQuery();
  const [duplicateAgent] = useDuplicateAgentMutation();
  const [deleteAgent] = useDeleteAgentMutation();
  const [deleting, setDeleting] = useState(false);
  const paused = agent.status === 'paused';

  const estimate = useMemo(() => {
    const m = model.draft;
    const list = models.data ?? [];
    if (!m || !list.length) return null;
    const pick = (id) => list.find((x) => x.id === id);
    const parts = [pick(m.llm), pick(m.asr_provider), pick(m.tts_provider)].filter(Boolean);
    if (!parts.length) return null;
    return {
      latency: parts.reduce((s, p) => s + (p.latency_ms ?? 0), 0),
      cost: parts.reduce((s, p) => s + (p.cost_per_min ?? 0), 0),
    };
  }, [model.draft, models.data]);

  return (
    <div className="stack">
      <div className="card card-pad row between wrap">
        <div>
          <div className="card-title">{paused ? 'Agent is paused' : 'Agent is answering calls'}</div>
          <div className="card-sub">
            {paused
              ? 'Calls to its numbers are not answered and campaigns using it are on hold.'
              : 'Pause to stop it answering without changing anything else.'}
          </div>
        </div>
        <Button
          variant={paused ? 'primary' : 'danger'}
          icon={paused ? <Play /> : <Pause />}
          loading={pausing}
          onClick={async () => {
            try {
              await (paused ? resumeAgent(agent.id) : pauseAgent(agent.id)).unwrap();
              toast(paused ? 'Agent resumed' : 'Agent paused');
            } catch (e) {
              toast(errMsg(e), 'error');
            } finally {
              /* the agent refetches via cache invalidation */
            }
          }}
        >
          {paused ? 'Resume' : 'Pause'}
        </Button>
      </div>
      <SectionCard title="General" section={settings}>
        {(s, patch) => (
          <div className="form-grid">
            <Field label="Name">
              <Input value={s.name} onChange={(e) => patch({ name: e.target.value })} />
            </Field>
            <Field label="Time zone">
              <Select
                value={s.timezone}
                options={[...new Set([s.timezone, ...TIMEZONES].filter(Boolean))]}
                onChange={(e) => patch({ timezone: e.target.value })}
              />
            </Field>
            <Field label="Description" className="full">
              <Input value={s.description} onChange={(e) => patch({ description: e.target.value })} />
            </Field>
            <Field label="Tags" className="full">
              <ListEditor value={s.tags} onChange={(v) => patch({ tags: v })} />
            </Field>
            <Field label="Max calls at once" hint="Empty = use the plan limit.">
              <Input
                type="number"
                min={1}
                value={s.max_concurrent_calls ?? ''}
                onChange={(e) =>
                  patch({
                    max_concurrent_calls: e.target.value ? Number(e.target.value) : null,
                  })
                }
              />
            </Field>
            <Field label="Send this agent's events to" hint="Optional webhook URL just for this agent.">
              <Input className="mono" placeholder="https://" value={s.event_webhook_url} onChange={(e) => patch({ event_webhook_url: e.target.value })} />
            </Field>
          </div>
        )}
      </SectionCard>
      <SectionCard
        title="Model & speech providers"
        description="Advanced. Only options your plan and company allow are listed."
        section={model}
        actions={
          estimate && (
            <Badge plain>
              ≈ {estimate.latency} ms · ${estimate.cost.toFixed(3)}/min
            </Badge>
          )
        }
      >
        {(m, patch) => (
          <div className="form-grid">
            <Field label="Language model">
              <ModelSelect kind="llm" value={m.llm} onChange={(v) => patch({ llm: v })} />
            </Field>
            <Field label="Backup model" hint="Used if the first one fails.">
              <ModelSelect kind="llm" value={m.fallback_llm ?? ''} placeholder="None" onChange={(v) => patch({ fallback_llm: v })} />
            </Field>
            <Field label="Creativity" hint="Lower is more predictable.">
              <Slider
                value={m.temperature}
                min={0}
                max={1}
                step={0.05}
                left="Precise"
                right="Creative"
                format={(v) => v.toFixed(2)}
                onChange={(v) => patch({ temperature: v })}
              />
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
            <Field label="Backup text-to-speech">
              <ModelSelect kind="tts" value={m.fallback_tts ?? ''} placeholder="None" onChange={(v) => patch({ fallback_tts: v })} />
            </Field>
          </div>
        )}
      </SectionCard>
      <SectionCard title="Caller memory" description="Remember returning callers and what was discussed last time." section={memory}>
        {(m, patch) => (
          <div className="form-grid">
            <div className="full">
              <Toggle checked={m.enabled} onChange={(v) => patch({ enabled: v })} label="Remember returning callers" />
            </div>
            {m.enabled && (
              <Field label="Remember for (days)">
                <Input type="number" min={1} value={m.retention_days} onChange={(e) => patch({ retention_days: Number(e.target.value) })} />
              </Field>
            )}
          </div>
        )}
      </SectionCard>
      <div className="card card-pad row between wrap">
        <div>
          <div className="card-title">Copy & backup</div>
          <div className="card-sub">Export the full configuration, or duplicate this agent.</div>
        </div>
        <div className="row">
          <Button
            icon={<Download />}
            onClick={async () => {
              try {
                downloadText(`${agent.name.replace(/\W+/g, '-')}.json`, JSON.stringify(await exportAgent(agent.id).unwrap(), null, 2), 'application/json');
              } catch (e) {
                toast(errMsg(e), 'error');
              }
            }}
          >
            Export
          </Button>
          <Button
            icon={<Copy />}
            onClick={async () => {
              try {
                const d = await duplicateAgent(agent.id).unwrap();
                toast(`Created ${d.name}`);
                navigate(`/agents/${d.id}`);
              } catch (e) {
                toast(errMsg(e), 'error');
              }
            }}
          >
            Duplicate
          </Button>
          <Button variant="danger" icon={<Trash2 />} onClick={() => setDeleting(true)}>
            Delete
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        danger
        title={`Delete ${agent.name}?`}
        description="Blocked while the agent is attached to a number or a running campaign."
        confirmLabel="Delete agent"
        onConfirm={async () => {
          await deleteAgent(agent.id).unwrap();
          toast('Agent deleted');
          navigate('/agents');
        }}
      />

      <p className="muted small">
        Agent ID: <span className="mono">{agent.id}</span> · <CopyInline value={agent.id} />
      </p>
    </div>
  );
}

function CopyInline({ value }) {
  const toast = useToast();
  return (
    <button
      type="button"
      className="btn sm ghost"
      style={{ height: 24, padding: '0 8px' }}
      onClick={() => {
        navigator.clipboard?.writeText(value);
        toast('Copied');
      }}
    >
      Copy
    </button>
  );
}

export { CopyField };
