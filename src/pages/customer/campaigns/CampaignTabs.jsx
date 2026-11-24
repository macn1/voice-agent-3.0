import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Copy, Download, Eye, FileUp, Pause, Play, Plus, RotateCcw, Trash2, XCircle } from 'lucide-react';
import {
  useAddCampaignDocumentMutation,
  useCreateScenarioMutation,
  useDeleteCampaignMutation,
  useDuplicateCampaignMutation,
  useGetAgentSectionQuery,
  useLazyExportCampaignQuery,
  useLazyGetVersionQuery,
  useListCampaignDocumentsQuery,
  useListGuidelinePresetsQuery,
  useListKnowledgeBasesQuery,
  useListScenariosQuery,
  useListTestRunsQuery,
  useListToolsQuery,
  useListVersionsQuery,
  usePauseCampaignMutation,
  usePutAgentSectionMutation,
  useRemoveCampaignDocumentMutation,
  useResumeCampaignMutation,
  useRollbackVersionMutation,
  useStartTestRunMutation,
  useValidateFlowMutation,
} from '../../../store/api/flowApi';
import { useGetCampaignDropoffQuery, useGetCampaignLatencyQuery } from '../../../store/api/analyticsApi';
import { date, dateTime, number, titleCase } from '../../../lib/format';
import { Async, Badge, Button, ConfirmDialog, EmptyState, errMsg, Field, Input, Modal, StatusBadge, Toggle, useToast } from '../../../components/ui';
import { CopyField, downloadText, LinesEditor, ListEditor, SectionCard, Select, Textarea, useSection } from '../../../components/forms';
import { HBars, TimeChart } from '../../../components/charts';
import { copyText } from '../../../lib/clipboard';
import { fileProblem, KNOWLEDGE_ACCEPT, KNOWLEDGE_HINT } from '../../../lib/uploads';

/* {{variable}} aware prompt field (AGT-10.4) --------------------------- */

/** One editor tab = one draft section: GET + PUT through RTK Query. */
export function useAgentSection(id, section) {
  return useSection(useGetAgentSectionQuery({ id, section }), usePutAgentSectionMutation(), (body) => ({ id, section, body }));
}

function useVariableNames(agentId) {
  const v = useGetAgentSectionQuery({ id: agentId, section: 'variables' });
  return (v.data ?? []).map((x) => x.name);
}

export function PromptField({ value = '', onChange, variables, rows = 4, placeholder }) {
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

/* Company profile sections (AGT-08.7) ------------------------------------ */

const PROFILE_SECTIONS = [
  { key: 'about', label: 'About the company' },
  { key: 'offerings', label: 'Products, services & prices' },
  { key: 'hours', label: 'Opening hours' },
  { key: 'locations', label: 'Locations' },
  { key: 'contact', label: 'Contact details' },
  { key: 'policies', label: 'Policies' },
  { key: 'faqs', label: 'Common questions' },
];

/** A titled, numbered block inside a section card: groups related fields with a plain-language hint. */
export function FormGroup({ step, title, help, children }) {
  return (
    <section className="fgroup">
      <header className="fgroup-head">
        {step && <span className="fgroup-step">{step}</span>}
        <div>
          <h3>{title}</h3>
          {help && <p>{help}</p>}
        </div>
      </header>
      <div className="fgroup-body">{children}</div>
    </section>
  );
}

/** Which parts of the company profile the campaign's calls may talk about. */
export function CompanyFactsCard({ campaign }) {
  const overrides = useAgentSection(campaign.id, 'profileOverrides');
  return (
    <SectionCard
      title="Company profile sections"
      description="Which parts of the company profile this campaign's calls may talk about."
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

export function ConversationTab({ campaign }) {
  const vars = useVariableNames(campaign.id);
  const [validateFlow] = useValidateFlowMutation();
  const flow = useAgentSection(campaign.id, 'flow');
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
      setValidation(await validateFlow(campaign.id).unwrap());
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
      {(flowDraft, patch) => {
        const f = { ...flowDraft, steps: flowDraft.steps ?? [] };
        return (
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
        );
      }}
    </SectionCard>
  );
}

function swap(xs, i, j) {
  const c = [...xs];
  [c[i], c[j]] = [c[j], c[i]];
  return c;
}

/* Variables (AGT-10) -------------------------------------------------- */

// The same rule the server applies on save and publish.
const VARIABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** What is wrong with the variable names, in words, or null. */
export function variableProblems(vars) {
  if (!Array.isArray(vars)) return null;
  const empty = vars.filter((v) => !v.name).length;
  const bad = vars.filter((v) => v.name && !VARIABLE_NAME.test(v.name)).map((v) => v.name);
  const seen = new Set();
  const dups = new Set();
  for (const v of vars) {
    if (!v.name) continue;
    if (seen.has(v.name)) dups.add(v.name);
    seen.add(v.name);
  }
  const out = [];
  if (empty) out.push(empty === 1 ? 'One variable has no name.' : `${empty} variables have no name.`);
  if (bad.length) out.push(`${bad.map((n) => `"${n}"`).join(', ')}: start with a letter or underscore, and use only letters, numbers and underscores (no spaces).`);
  if (dups.size) out.push(`${[...dups].map((n) => `"${n}"`).join(', ')} ${dups.size === 1 ? 'is' : 'are'} used more than once; each name must be unique.`);
  return out.length ? `Fix before saving: ${out.join(' ')}` : null;
}

const nextVariableName = (vars) => {
  let n = vars.length + 1;
  while (vars.some((v) => v.name === `var_${n}`)) n += 1;
  return `var_${n}`;
};

export function VariablesTab({ campaign }) {
  const s = useAgentSection(campaign.id, 'variables');
  return (
    <SectionCard
      title="Call variables"
      description="Inputs arrive with each call (from the API, a campaign CSV, or the contact). Outputs are what the agent must collect. Use them as {{name}}."
      section={s}
      invalid={variableProblems(s.draft)}
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
                  const dup = !!v.name && vars.filter((x) => x.name === v.name).length > 1;
                  const bad = dup || !VARIABLE_NAME.test(v.name ?? '');
                  return (
                    <tr key={i}>
                      <td>
                        <input
                          className={`input mono ${bad ? 'invalid' : ''}`}
                          aria-invalid={bad || undefined}
                          aria-label="Variable name"
                          title={dup ? 'This name is already used' : bad ? 'Letters, numbers and underscores; no spaces' : undefined}
                          style={{ height: 36, minWidth: 140 }}
                          value={v.name ?? ''}
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
                    name: nextVariableName(vars),
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
          <p className="muted small">Names use letters, numbers and underscores (for example caller_name), start with a letter, and must be unique.</p>
        </>
      )}
    </SectionCard>
  );
}

/* Rules (AGT-09) ------------------------------------------------------ */

export function RulesTab({ campaign }) {
  const s = useAgentSection(campaign.id, 'guidelines');
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

export function BehaviourTab({ campaign }) {
  const s = useAgentSection(campaign.id, 'behaviour');
  return (
    <div className="stack">
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
    <KeywordsCard campaign={campaign} />
    </div>
  );
}

/* Recognition keywords (AGT-13.4) ------------------------------------ */

/** Names and products the speech recogniser should expect on this campaign's calls. */
export function KeywordsCard({ campaign }) {
  const keywords = useAgentSection(campaign.id, 'keywords');
  return (
    <SectionCard
      title="Recognition keywords"
      description="Names and products the speech recogniser should expect on this campaign's calls."
      section={keywords}
      actions={
        <Link to="/settings/pronunciations" className="btn sm ghost">
          Pronunciations
        </Link>
      }
    >
      {(k, _patch, set) => <ListEditor value={k} onChange={set} placeholder="e.g. CareFirst, Dr. Iyer" />}
    </SectionCard>
  );
}

/* Knowledge (KNW-01.7, AGT-05) --------------------------------------- */

export function KnowledgeTab({ campaign }) {
  const toast = useToast();
  const kbs = useListKnowledgeBasesQuery();
  const [addDocument] = useAddCampaignDocumentMutation();
  const [removeDocument] = useRemoveCampaignDocumentMutation();
  const attached = useAgentSection(campaign.id, 'knowledgeBases');
  const docs = useListCampaignDocumentsQuery(campaign.id);
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (file) => {
    const problem = fileProblem(file);
    if (problem) return toast(problem, 'error');
    setUploading(true);
    try {
      // Creates the document and uploads the file to its signed URL.
      await addDocument({ id: campaign.id, file }).unwrap();
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
        description="Shared knowledge this campaign's calls answer from."
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
                        <span className="fw-medium">{kb.name}</span>
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
            <div className="card-sub">Files only this campaign uses.</div>
          </div>
          <input ref={fileRef} type="file" hidden accept={KNOWLEDGE_ACCEPT} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <Button size="sm" icon={<FileUp />} loading={uploading} onClick={() => fileRef.current?.click()}>
            Upload
          </Button>
        </div>
        <Async state={docs}>
          {(list) =>
            list.length ? (
              <div className="table-wrap">
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
                              removeDocument({ id: campaign.id, docId: d.id })
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
              <EmptyState title="No documents" description={KNOWLEDGE_HINT} />
            )
          }
        </Async>
      </div>
    </div>
  );
}

/* Tools (ACT-01.6) ---------------------------------------------------- */

export function ToolsTab({ campaign }) {
  const all = useListToolsQuery();
  const s = useAgentSection(campaign.id, 'tools');
  return (
    <SectionCard
      title="Tools"
      description="APIs the agent may call during this campaign's conversations."
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
                      <span className="mono fw-semibold">{t.name}</span>
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

/* Follow-ups by disposition (ACT-03) ----------------------------------- */

const FOLLOW_UP_ACTIONS = [
  { value: 'message', label: 'Send a message' },
  { value: 'callback', label: 'Call back' },
  { value: 'do_not_call', label: 'Add the number to do-not-call' },
  { value: 'notify', label: 'Notify the team' },
];

export function FollowUpsTab({ campaign }) {
  const s = useAgentSection(campaign.id, 'followUps');
  const dispositions = useGetAgentSectionQuery({ id: campaign.id, section: 'outcomes' });
  const options = (dispositions.data?.outcomes ?? []).map((o) => ({ value: o.key, label: o.label }));
  return (
    <SectionCard
      title="Follow-up actions"
      description="What happens after a call, by how it ended (its disposition): send a WhatsApp, SMS or email, call back later, stop calling the number, or tell your team."
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
            return (
              <div key={r.id ?? i} className="card" style={{ padding: 16 }}>
                <div className="row between" style={{ marginBottom: 12 }}>
                  <Toggle checked={r.enabled !== false} onChange={(v) => upd({ enabled: v })} label={r.enabled !== false ? 'On' : 'Off'} />
                  <Button size="sm" variant="ghost" icon={<Trash2 />} onClick={() => set(rules.filter((_, j) => j !== i))} />
                </div>
                <div className="form-grid">
                  <Field label="When">
                    <Select
                      value={r.trigger}
                      options={[
                        { value: 'disposition', label: 'A call ends with a disposition' },
                        { value: 'call_completed', label: 'Any call ends' },
                      ]}
                      onChange={(e) => upd({ trigger: e.target.value, ...(e.target.value === 'disposition' ? {} : { disposition: undefined }) })}
                    />
                  </Field>
                  {r.trigger === 'disposition' && (
                    <Field label="Disposition">
                      <Select value={r.disposition ?? ''} options={options} placeholder="Choose" onChange={(e) => upd({ disposition: e.target.value })} />
                    </Field>
                  )}
                  <Field label="Then">
                    <Select
                      value={r.action ?? 'message'}
                      options={FOLLOW_UP_ACTIONS}
                      onChange={(e) => {
                        const action = e.target.value;
                        upd({
                          action,
                          ...(action === 'message' ? { channel: r.channel ?? 'whatsapp', delay_minutes: 0 } : {}),
                          ...(action === 'callback' ? { delay_minutes: Math.max(60, r.delay_minutes ?? 0) } : {}),
                        });
                      }}
                    />
                  </Field>
                  {(r.action ?? 'message') === 'message' && (
                    <>
                      <Field label="Channel">
                        <Select
                          value={r.channel ?? 'whatsapp'}
                          options={[
                            { value: 'whatsapp', label: 'WhatsApp' },
                            { value: 'sms', label: 'SMS' },
                            { value: 'email', label: 'Email' },
                          ]}
                          onChange={(e) => upd({ channel: e.target.value })}
                        />
                      </Field>
                      <Field label="Message" className="full" hint="Use call variables as {{name}}. WhatsApp needs an approved template with the same text.">
                        <Textarea rows={3} value={r.template ?? ''} onChange={(e) => upd({ template: e.target.value })} />
                      </Field>
                      <Field label="Send after (minutes)" hint="0 to 1440">
                        <Input type="number" min={0} max={1440} value={r.delay_minutes ?? 0} onChange={(e) => upd({ delay_minutes: Number(e.target.value) })} />
                      </Field>
                    </>
                  )}
                  {r.action === 'callback' && (
                    <Field label="Call back after (minutes)" hint="5 minutes to 7 days (10080)">
                      <Input type="number" min={5} max={10080} value={r.delay_minutes ?? 60} onChange={(e) => upd({ delay_minutes: Number(e.target.value) })} />
                    </Field>
                  )}
                  {r.action === 'notify' && (
                    <Field label="Note for the team" className="full" hint="Optional. Shown in the dashboard's notifications.">
                      <Input value={r.message ?? ''} onChange={(e) => upd({ message: e.target.value })} />
                    </Field>
                  )}
                  {r.action === 'do_not_call' && (
                    <p className="muted small full" style={{ margin: 0 }}>
                      The caller's number goes on your do-not-call list: no campaign calls it again.
                    </p>
                  )}
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
                    trigger: 'disposition',
                    disposition: 'call_back_later',
                    action: 'callback',
                    delay_minutes: 60,
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

/* Analysis & dispositions (PCA-01, PCA-02) -------------------------------- */

export function AnalysisTab({ campaign }) {
  const cfg = useAgentSection(campaign.id, 'analysis');
  const out = useAgentSection(campaign.id, 'outcomes');
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
      <SectionCard
        title="Dispositions"
        description="How a call ended. After each call the agent's analysis picks one; your team can change it on the call. Follow-up actions run by disposition."
        section={out}
      >
        {(o, patch) => {
          const builtin = o.outcomes.filter((x) => x.builtin);
          const own = o.outcomes.filter((x) => !x.builtin);
          const setOwn = (list) => patch({ outcomes: [...builtin, ...list] });
          return (
            <>
              <div className="tag-list">
                {builtin.map((x) => (
                  <span key={x.key} className="tag" title={x.description}>
                    {x.label}
                    {x.is_success ? ' ✓' : ''}
                  </span>
                ))}
              </div>
              <p className="muted small" style={{ margin: 0 }}>
                Built in on every campaign (✓ counts as a successful call). Add your own below, with a line on when it applies.
              </p>
              {own.map((x, i) => {
                const upd = (p) => setOwn(own.map((y, j) => (j === i ? { ...y, ...p } : y)));
                return (
                  <div key={i} className="card" style={{ padding: 14 }}>
                    <div className="form-grid">
                      <Field label="Label">
                        <Input placeholder="e.g. Site visit booked" value={x.label} onChange={(e) => upd({ label: e.target.value })} />
                      </Field>
                      <div style={{ alignSelf: 'end', paddingBottom: 10 }}>
                        <label className="check">
                          <input type="checkbox" checked={!!x.is_success} onChange={(e) => upd({ is_success: e.target.checked })} />
                          Counts as success
                        </label>
                      </div>
                      <Field label="When it applies" className="full" hint="Helps the analysis pick it, e.g. “The caller agreed to visit the site”.">
                        <Input value={x.description ?? ''} onChange={(e) => upd({ description: e.target.value })} />
                      </Field>
                    </div>
                    <div style={{ textAlign: 'right', marginTop: 8 }}>
                      <Button size="sm" variant="ghost" icon={<Trash2 />} onClick={() => setOwn(own.filter((_, j) => j !== i))}>
                        Remove
                      </Button>
                    </div>
                  </div>
                );
              })}
              <div>
                <Button size="sm" variant="ghost" icon={<Plus />} onClick={() => setOwn([...own, { label: '', description: '', is_success: false }])}>
                  Add a disposition
                </Button>
              </div>
            </>
          );
        }}
      </SectionCard>
    </div>
  );
}

/* Compliance (CMP-01) ------------------------------------------------- */

export function ComplianceTab({ campaign }) {
  const s = useAgentSection(campaign.id, 'compliance');
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

export function TestsTab({ campaign }) {
  const toast = useToast();
  const scenarios = useListScenariosQuery(campaign.id);
  const [poll, setPoll] = useState(0);
  const runs = useListTestRunsQuery(campaign.id, { pollingInterval: poll });
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
                  await startTestRun(campaign.id).unwrap();
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
              <div className="table-wrap">
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
              </div>
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
              <div className="table-wrap">
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
              </div>
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
          await createScenario({ id: campaign.id, ...b }).unwrap();
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

export function InsightsTab({ campaign }) {
  // This campaign's calls only (not the agent's other campaigns).
  const drop = useGetCampaignDropoffQuery(campaign.id);
  const lat = useGetCampaignLatencyQuery(campaign.id);
  return (
    <div className="stack">
      <div className="card">
        <div className="card-head">
          <div>
            <h2>Where callers drop off</h2>
            <div className="card-sub">
              This campaign's answered calls in the last 30 days, by how far the conversation got. Dropped: the caller left there without a good
              outcome.
            </div>
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
            <div className="card-sub">How long the agent takes to answer each time the caller speaks on this campaign's calls, last 30 days.</div>
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

export function VersionsTab({ campaign }) {
  const toast = useToast();
  const versions = useListVersionsQuery(campaign.id);
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
            <div className="table-wrap">
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
                            loadVersion({ id: campaign.id, version: v.version })
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
            </div>
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
          await rollback({ id: campaign.id, version: rolling.version }).unwrap();
          toast(`Version ${rolling.version} is live`);
        }}
      />
    </div>
  );
}

/* Web & chat (WID-01, WA-06.2, WA-03.2) -------------------------------- */

export function ChannelsTab({ campaign }) {
  const chat = useAgentSection(campaign.id, 'chatSettings');
  return (
    <div className="stack">
      <div className="card card-pad">
        <div className="row" style={{ gap: 8 }}>
          <h2 style={{ margin: 0 }}>Website call button & chat bubble</h2>
          <Badge>Coming soon</Badge>
        </div>
        <p className="muted" style={{ marginTop: 6 }}>
          Put this campaign on your website as a click-to-talk button or a chat bubble. Until then, talk to it with the Test button above.
        </p>
      </div>

      <SectionCard
        title="Chat settings"
        description="How this campaign replies on WhatsApp and web chat."
        section={chat}
        actions={
          <Link to="/channels/whatsapp" className="btn sm ghost">
            WhatsApp
          </Link>
        }
      >
        {(chatDraft, patch) => {
          const c = { enabled: false, use_emojis: false, business_hours_only: false, max_reply_chars: 1000, handoff_keywords: [], ...chatDraft };
          return (
          <div className="form-grid">
            <div className="full">
              <Toggle checked={c.enabled} onChange={(v) => patch({ enabled: v })} label="Answer chats" description="Reply on WhatsApp and web chat until a person takes over." />
            </div>
            <Field label="Greeting" hint="Sent when a new chat starts. Empty = no greeting." className="full">
              <Input value={c.greeting ?? ''} onChange={(e) => patch({ greeting: e.target.value })} />
            </Field>
            <Field label="Max reply length (characters)" hint="100–4096">
              <Input type="number" min={100} max={4096} value={c.max_reply_chars} onChange={(e) => patch({ max_reply_chars: Number(e.target.value) })} />
            </Field>
            <Field label="Typing delay (ms)" hint="Pause before each reply so it feels natural">
              <Input type="number" min={0} value={c.typing_delay_ms ?? 0} onChange={(e) => patch({ typing_delay_ms: Number(e.target.value) })} />
            </Field>
            <Field label="Hand over to a person when the customer says" className="full">
              <ListEditor value={c.handoff_keywords ?? []} onChange={(v) => patch({ handoff_keywords: v })} placeholder="agent" />
            </Field>
            <div className="full">
              <Toggle checked={c.use_emojis} onChange={(v) => patch({ use_emojis: v })} label="Use emojis" />
            </div>
            <div className="full">
              <Toggle
                checked={c.business_hours_only}
                onChange={(v) => patch({ business_hours_only: v })}
                label="Only reply during business hours"
                description="Outside them the after-hours message is sent instead."
              />
            </div>
            {c.business_hours_only && (
              <Field label="After-hours message" className="full">
                <Input value={c.after_hours_message ?? ''} onChange={(e) => patch({ after_hours_message: e.target.value })} />
              </Field>
            )}
          </div>
          );
        }}
      </SectionCard>
    </div>
  );
}

/* Settings (AGT-17, AGT-18, AGT-19, CON-02.2) -------------------------- */

const TIMEZONES = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'America/New_York', 'UTC'];

export function SettingsTab({ campaign }) {
  const toast = useToast();
  const navigate = useNavigate();
  const settings = useAgentSection(campaign.id, 'settings');
  const memory = useAgentSection(campaign.id, 'memory');
  const [pauseCampaign, { isLoading: pausingP }] = usePauseCampaignMutation();
  const [resumeCampaign, { isLoading: resumingP }] = useResumeCampaignMutation();
  const pausing = pausingP || resumingP;
  const [exportCampaign] = useLazyExportCampaignQuery();
  const [duplicateCampaign] = useDuplicateCampaignMutation();
  const [deleteCampaign] = useDeleteCampaignMutation();
  const [deleting, setDeleting] = useState(false);
  const paused = campaign.status === 'paused';

  return (
    <div className="stack">
      <div className="card card-pad row between wrap">
        <div>
          <div className="card-title">{paused ? 'Campaign is paused' : campaign.status === 'draft' ? 'Campaign is not published yet' : 'Campaign is taking calls'}</div>
          <div className="card-sub">
            {paused
              ? 'Calls to its numbers are not answered and its calling is on hold.'
              : 'Pause to stop its calls without changing anything else.'}
          </div>
        </div>
        <Button
          variant={paused ? 'primary' : 'danger'}
          icon={paused ? <Play /> : <Pause />}
          loading={pausing}
          onClick={async () => {
            try {
              await (paused ? resumeCampaign(campaign.id) : pauseCampaign(campaign.id)).unwrap();
              toast(paused ? 'Campaign resumed' : 'Campaign paused');
            } catch (e) {
              toast(errMsg(e), 'error');
            } finally {
              /* the campaign refetches via cache invalidation */
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
            <Field label="Send this campaign's events to" hint="Optional webhook URL just for this campaign.">
              <Input className="mono" placeholder="https://" value={s.event_webhook_url} onChange={(e) => patch({ event_webhook_url: e.target.value })} />
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
              <>
                <Field label="Remember for (days)" hint="1–365">
                  <Input type="number" min={1} max={365} value={m.retention_days} onChange={(e) => patch({ retention_days: Number(e.target.value) })} />
                </Field>
                <div className="full">
                  <Toggle checked={m.greet_returning_callers} onChange={(v) => patch({ greet_returning_callers: v })} label="Greet returning callers by name" />
                </div>
                <div className="full field">
                  <span className="field-label">What to remember</span>
                  <div className="row wrap" style={{ gap: 14 }}>
                    {[
                      ['summary', 'Summary of the last call'],
                      ['preferences', 'Preferences'],
                      ['last_outcome', 'Last outcome'],
                      ['open_requests', 'Open requests'],
                    ].map(([key, label]) => (
                      <label key={key} className="check">
                        <input
                          type="checkbox"
                          checked={(m.remember ?? []).includes(key)}
                          onChange={(e) => patch({ remember: e.target.checked ? [...(m.remember ?? []), key] : (m.remember ?? []).filter((x) => x !== key) })}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </SectionCard>
      <div className="card card-pad row between wrap">
        <div>
          <div className="card-title">Copy & backup</div>
          <div className="card-sub">Export the full configuration, or duplicate this campaign (same agent).</div>
        </div>
        <div className="row">
          <Button
            icon={<Download />}
            onClick={async () => {
              try {
                downloadText(`${campaign.name.replace(/\W+/g, '-')}.json`, JSON.stringify(await exportCampaign(campaign.id).unwrap(), null, 2), 'application/json');
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
                const d = await duplicateCampaign({ id: campaign.id }).unwrap();
                toast(`Created ${d.name}`);
                navigate(`/campaigns/${d.id}`);
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
        title={`Delete ${campaign.name}?`}
        description="Its calls stop and its phone numbers are left without a campaign. Call history is kept."
        confirmLabel="Delete campaign"
        onConfirm={async () => {
          await deleteCampaign(campaign.id).unwrap();
          toast('Campaign deleted');
          navigate('/campaigns');
        }}
      />

      <p className="muted small">
        Campaign ID: <span className="mono">{campaign.id}</span> · <CopyInline value={campaign.id} />
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
      onClick={async () => {
        if (await copyText(value)) toast('Copied');
        else toast("Couldn't copy. Select the text and copy it yourself.", 'error');
      }}
    >
      Copy
    </button>
  );
}

export { CopyField };
