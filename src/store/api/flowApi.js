import { baseApi } from './baseApi';
import { uploadToSignedUrl } from './baseQuery';
import { C } from './services';

// voice-flow-be: agents (who speaks: name, role, voice, languages,
// personality, model), campaigns (what the calls are for: instructions,
// rules, variables, knowledge, tools, outcomes, follow-ups; draft -> publish),
// catalog (AGT-02), company profile (AGT-08), knowledge (KNW-01/02, AGT-05),
// tools (ACT-01), pronunciations (AGT-13.3), voices (AGT-15), test scenarios
// (QTY-01), chat test (QTY-02).

const ag = (id) => `/customer/agents/${id}`;
const cp = (id) => `/customer/campaigns/${id}`;

// Knowledge source bodies: the screens send {type, title, content}; the API wants
// faqs[{q,a}] / text / url / file details.
const sourceTo = ({ type, title, content, url, resync_schedule: _s, ...rest }, file) => {
  if (type === 'faq') {
    const list = Array.isArray(content) ? content : (rest.faqs ?? []);
    return { type, title, faqs: list.map((f) => ({ q: f.q ?? f.question, a: f.a ?? f.answer })) };
  }
  if (type === 'text') return { type, title, text: typeof content === 'string' ? content : (rest.text ?? '') };
  if (type === 'url') return { type, url, ...(title && title !== url ? { title } : {}) };
  if (type === 'file' && file) return { type, filename: file.name, content_type: file.type || 'application/octet-stream', size_bytes: file.size };
  return { type, title, ...rest };
};

const asArray = (d) => (Array.isArray(d) ? d : (d?.items ?? []));

// Tool parameters: list in the UI ({name, type, description, required}) <-> JSON schema on the wire.
const toolFrom = (t) => {
  if (!t || Array.isArray(t.parameters)) return t;
  const props = t.parameters?.properties ?? {};
  const required = t.parameters?.required ?? [];
  return {
    ...t,
    parameters: Object.entries(props).map(([name, p]) => ({
      name,
      type: p.format === 'date' ? 'date' : (p.type ?? 'string'),
      description: p.description ?? '',
      required: required.includes(name),
    })),
  };
};
const toolTo = ({ parameters, ...t }) => {
  // Fields the API computes are not sent back.
  const { id: _id, has_secret: _h, created_at: _c, updated_at: _u, ...rest } = t;
  if (!Array.isArray(parameters)) return rest;
  const list = parameters.filter((p) => p.name?.trim());
  const body = {
    ...rest,
    parameters: {
      type: 'object',
      required: list.filter((p) => p.required).map((p) => p.name),
      properties: Object.fromEntries(
        list.map((p) => [p.name, { type: p.type === 'date' ? 'string' : p.type, ...(p.type === 'date' ? { format: 'date' } : {}), ...(p.description ? { description: p.description } : {}) }]),
      ),
    },
  };
  // The secret goes where {{secret}} appears in a header; default to Authorization.
  if (body.secret && !Object.values(body.headers ?? {}).some((v) => String(v).includes('{{secret}}'))) {
    body.headers = { ...(body.headers ?? {}), Authorization: '{{secret}}' };
  }
  return body;
};

/**
 * Each tab of the campaign editor (and each part of an agent's Identity page)
 * is one GET/PUT pair on a section. `agent: true` sections belong to the
 * agent (/customer/agents/:id/...) and apply at once; the rest to the
 * campaign's draft (/customer/campaigns/:id/...). `wrap` shapes the PUT body
 * where the API expects an object around a list.
 */
// Sections whose stored shape differs from what the editor tab edits:
// `from` maps the API value to the tab's value, `wrap` maps it back.
const langFrom = (list = []) => ({
  detection: list[0]?.detection ?? 'auto',
  languages: list.map((x) =>
    typeof x === 'string' ? { language: x, voice_id: '', greeting: '' } : { language: x.code ?? '', voice_id: x.voice_id ?? '', greeting: x.greeting ?? '' },
  ),
});
const langWrap = (l) =>
  (l.languages ?? [])
    .filter((x) => x.language)
    .map((x, i) => ({
      code: x.language,
      ...(x.voice_id ? { voice_id: x.voice_id } : {}),
      ...(x.greeting ? { greeting: x.greeting } : {}),
      ...(i === 0 ? { detection: l.detection ?? 'auto' } : {}),
    }));

// The live API returns only what was saved ({} for a fresh tab), so every
// object section is merged over the defaults the editor tabs expect.
const withDefaults = (defaults) => (d) => ({ ...defaults, ...(d && typeof d === 'object' && !Array.isArray(d) ? d : {}) });

const PROFILE_KEYS = ['about', 'offerings', 'hours', 'locations', 'contact', 'policies', 'faqs'];

// Outcomes from before dispositions -> the built-in disposition they became.
export const LEGACY_DISPOSITIONS = {
  appointment_booked: 'appointment',
  question_answered: 'success',
  transferred_to_human: 'transferred',
  callback_requested: 'call_back_later',
  question_unanswered: 'failed',
  not_interested: 'failed',
  no_answer: 'not_connected',
  voicemail: 'not_connected',
};

// A follow-up as the tab edits it: { trigger: call_completed | disposition, disposition?, action, ... }.
// Ones saved before dispositions (trigger outcome / no_answer) show as disposition follow-ups.
const followUpFrom = (f) => {
  const out = { action: 'message', enabled: true, ...f };
  if (f.trigger === 'outcome') {
    out.trigger = 'disposition';
    out.disposition = LEGACY_DISPOSITIONS[f.outcome] ?? f.outcome;
    delete out.outcome;
  } else if (f.trigger === 'no_answer') {
    out.trigger = 'disposition';
    out.disposition = 'not_connected';
  }
  return out;
};

export const AGENT_SECTIONS = {
  persona: { agent: true, path: 'persona', from: withDefaults({ name: '', gender: 'female', role: '', tone: 'friendly', personality: {}, style: '' }) },
  profileOverrides: { path: 'company-profile-overrides', from: withDefaults({ sections: PROFILE_KEYS }) },
  flow: { path: 'flow/draft', from: withDefaults({ greeting: '', system_prompt: '', steps: [] }) },
  guidelines: {
    path: 'guidelines',
    from: withDefaults({ preset_ids: [], always: [], never: [], blocked_topics: [], fallback_answer: '', escalation_triggers: [] }),
  },
  variables: {
    path: 'variables',
    from: (d) => (Array.isArray(d) ? d : []).map((v) => ({ type: 'text', direction: 'input', required: false, description: '', ...v })),
  },
  behaviour: {
    path: 'behaviour',
    from: withDefaults({
      first_speaker: 'agent',
      opening_line: '',
      silence_timeout_seconds: 8,
      silence_reprompts: 2,
      reprompt_message: '',
      max_duration_minutes: 10,
      end_call_phrases: [],
      transfer_number: '',
      voicemail_action: 'hangup',
      voicemail_message: '',
    }),
  },
  speech: {
    agent: true,
    path: 'speech-settings',
    from: withDefaults({ voice_id: '', speed: 1, interruption_sensitivity: 0.5, ambience: 'none', backchannel: true }),
  },
  keywords: { path: 'keywords', from: (d) => d?.keywords ?? d?.items ?? [], wrap: (list) => ({ keywords: list }) },
  languages: { agent: true, path: 'languages', from: langFrom, wrap: langWrap },
  settings: {
    path: 'settings',
    from: withDefaults({ tags: [], description: '', event_webhook_url: '' }),
    // GET returns the whole campaign record; only these fields are editable.
    // An empty webhook URL is rejected (422), and null can't clear max_concurrent_calls, so both are left out.
    wrap: (a) => ({
      name: a.name,
      description: a.description,
      tags: a.tags,
      timezone: a.timezone,
      ...(a.max_concurrent_calls ? { max_concurrent_calls: a.max_concurrent_calls } : {}),
      ...(a.event_webhook_url ? { event_webhook_url: a.event_webhook_url } : {}),
    }),
  },
  model: {
    agent: true,
    path: 'model-settings',
    from: withDefaults({ llm: '', fallback_llm: '', temperature: 0.4, max_reply_tokens: 200, asr_provider: '', tts_provider: '', fallback_tts: '' }),
  },
  memory: { path: 'memory-settings' },
  knowledgeBases: { path: 'knowledge-bases', wrap: (ids) => ({ knowledge_base_ids: ids }) },
  tools: { path: 'tools', wrap: (ids) => ({ tool_ids: ids }) },
  followUps: { path: 'follow-ups', from: (d) => (Array.isArray(d) ? d : []).map(followUpFrom) },
  analysis: { path: 'analysis-config', from: withDefaults({ summary: true, sentiment: true, fields: [] }) },
  // Dispositions: GET lists the built-in ones (builtin: true) and the campaign's own; PUT takes only its own.
  outcomes: {
    path: 'outcomes',
    from: withDefaults({ outcomes: [] }),
    wrap: (o) => ({ outcomes: (o.outcomes ?? []).filter((x) => !x.builtin).map(({ builtin: _b, ...x }) => x) }),
  },
  // Stored as recording_notice / ai_disclosure text; the tab also keeps an on/off flag per line.
  compliance: {
    path: 'compliance',
    from: (d) => ({
      recording_enabled: true,
      ...d,
      consent_line: d?.consent_line ?? d?.recording_notice ?? '',
      ai_disclosure_enabled: d?.ai_disclosure_enabled ?? !!d?.ai_disclosure,
      ai_disclosure_line: d?.ai_disclosure_line ?? d?.ai_disclosure ?? '',
    }),
    wrap: ({ consent_line, ai_disclosure_line, ...c }) => ({ ...c, recording_notice: consent_line, ai_disclosure: ai_disclosure_line }),
  },
  chatSettings: { path: 'chat-settings' },
};

/** The section's address: the agent's or the campaign's. */
const sectionUrl = (id, section) => `${AGENT_SECTIONS[section].agent ? ag(id) : cp(id)}/${AGENT_SECTIONS[section].path}`;

// Version config key -> draft endpoint, used to compare a campaign's draft with
// its live version on the client (the backend has no diff route). The agent's
// sections aren't versioned: they apply at once.
const DIFF_SECTIONS = {
  flow: 'flow/draft',
  behaviour: 'behaviour',
  variables: 'variables',
  guidelines: 'guidelines',
  analysis: 'analysis-config',
  compliance: 'compliance',
  profile_overrides: 'company-profile-overrides',
  vocabulary: 'vocabulary',
};
const isEmpty = (v) => v == null || (Array.isArray(v) ? !v.length : typeof v === 'object' ? !Object.keys(v).length : v === '');
const canon = (v) =>
  JSON.stringify(v, (_k, x) =>
    x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x,
  );

const sectionTag = (id, section) => ({ type: 'AgentSection', id: `${id}:${section}` });

export const flowApi = baseApi.injectEndpoints({
  endpoints: (b) => ({
    // Agents: who speaks (identity only; edits apply at once) -------------
    // Items: { id, name, role, language, voice_id, gender, campaigns, updated_at }.
    listAgents: b.query({ query: (params = {}) => C.flow('/customer/agents', { params }), providesTags: ['Agent'] }),
    getAgent: b.query({ query: (id) => C.flow(ag(id)), providesTags: (_r, _e, id) => [{ type: 'Agent', id }] }),
    // { persona, speech, languages, model } in one go.
    getAgentIdentity: b.query({ query: (id) => C.flow(`${ag(id)}/identity`), providesTags: (_r, _e, id) => [{ type: 'Agent', id }] }),
    // body: { name, role } (name is what callers hear). 409 agent_name_in_use.
    createAgent: b.mutation({ query: (body) => C.flow('/customer/agents', { method: 'POST', body }), invalidatesTags: ['Agent'] }),
    updateAgent: b.mutation({ query: ({ id, ...body }) => C.flow(ag(id), { method: 'PATCH', body }), invalidatesTags: ['Agent', 'Campaign'] }),
    // 409 agent_in_use while campaigns use it.
    deleteAgent: b.mutation({ query: (id) => C.flow(ag(id), { method: 'DELETE' }), invalidatesTags: ['Agent'] }),

    // Campaigns: what the calls are for ------------------------------------
    // { items: [{ id, name, direction, agent_id, agent_name, agent_role, status, last_published_at, has_unpublished_changes }],
    //   total, usage: { used, limit } } (limit 0 = none).
    listCampaigns: b.query({ query: (params = {}) => C.flow('/customer/campaigns', { params }), providesTags: ['Campaign'] }),
    getCampaignUsage: b.query({ query: () => C.flow('/customer/campaigns/usage'), providesTags: ['Campaign'] }),
    // The API only returns published_version_id; the editor wants the version number.
    getCampaign: b.query({
      async queryFn(id, _api, _extra, baseQuery) {
        const r = await baseQuery(C.flow(cp(id)));
        if (r.error || !r.data?.published_version_id || r.data.published_version) return r;
        const v = await baseQuery(C.flow(`${cp(id)}/flow/versions`));
        const cur = Array.isArray(v.data) ? (v.data.find((x) => x.id === r.data.published_version_id) ?? v.data.find((x) => x.is_current)) : null;
        return { data: { ...r.data, published_version: cur?.version ?? true } };
      },
      providesTags: (_r, _e, id) => [{ type: 'Campaign', id }],
    }),
    // body: { name, direction, agent_id | new_agent: { name, role }, template_id?, config? }. 402 campaign_limit over the plan.
    createCampaign: b.mutation({ query: (body) => C.flow('/customer/campaigns', { method: 'POST', body }), invalidatesTags: ['Campaign', 'Agent'] }),
    updateCampaign: b.mutation({ query: ({ id, ...body }) => C.flow(cp(id), { method: 'PATCH', body }), invalidatesTags: ['Campaign', 'Agent', 'Number'] }),
    deleteCampaign: b.mutation({ query: (id) => C.flow(cp(id), { method: 'DELETE' }), invalidatesTags: ['Campaign', 'Agent', 'Number'] }),
    // arg: campaign id, or { id, name } ("<name> (copy)" by default).
    duplicateCampaign: b.mutation({
      query: (arg) => {
        const { id, name } = typeof arg === 'string' ? { id: arg } : arg;
        return C.flow(`${cp(id)}/duplicate`, { method: 'POST', body: name ? { name } : {} });
      },
      invalidatesTags: ['Campaign', 'Agent'],
    }),
    pauseCampaign: b.mutation({ query: (id) => C.flow(`${cp(id)}/pause`, { method: 'POST', body: {} }), invalidatesTags: ['Campaign'] }),
    resumeCampaign: b.mutation({ query: (id) => C.flow(`${cp(id)}/resume`, { method: 'POST', body: {} }), invalidatesTags: ['Campaign'] }),
    exportCampaign: b.query({ query: (id) => C.flow(`${cp(id)}/export`), keepUnusedDataFor: 0 }),
    // { agent_id, export, name? }. Older agent export files import too.
    importCampaign: b.mutation({
      query: ({ agent_id, export: file, name }) =>
        C.flow('/customer/campaigns/import', { method: 'POST', body: { agent_id, export: file, ...(name ? { name } : {}) } }),
      invalidatesTags: ['Campaign', 'Agent'],
    }),

    // Sections (AGT-03, 07..14, 17, 18; KNW-01.7; ACT-01.6, 03; PCA-01/02; CMP-01; CON-02.2; WID-01; WA-03.2/06.2)
    // id is the agent's for agent sections, the campaign's for the rest.
    getAgentSection: b.query({
      query: ({ id, section }) => C.flow(sectionUrl(id, section)),
      transformResponse: (d, _m, { section }) => (AGENT_SECTIONS[section].from ? AGENT_SECTIONS[section].from(d) : d),
      providesTags: (_r, _e, { id, section }) => [sectionTag(id, section)],
    }),
    putAgentSection: b.mutation({
      query: ({ id, section, body }) => {
        const def = AGENT_SECTIONS[section];
        return C.flow(sectionUrl(id, section), { method: 'PUT', body: def.wrap ? def.wrap(body) : body });
      },
      // A campaign section changes "unpublished changes"; an agent section (the name) shows in lists.
      invalidatesTags: (_r, _e, { id, section }) =>
        AGENT_SECTIONS[section].agent
          ? [sectionTag(id, section), { type: 'Agent', id }, 'Campaign']
          : [sectionTag(id, section), { type: 'Campaign', id }],
    }),

    // Catalog (AGT-02, AGT-18.3) -----------------------------------------
    listLanguages: b.query({ query: () => C.flow('/customer/catalog/languages'), providesTags: ['Catalog'] }),
    listVoices: b.query({ query: (language) => C.flow('/customer/catalog/voices', { params: { language } }), providesTags: ['Catalog'] }),
    listModels: b.query({ query: () => C.flow('/customer/catalog/models'), providesTags: ['Catalog'] }),
    listGuidelinePresets: b.query({ query: () => C.flow('/customer/guideline-presets'), providesTags: ['Catalog'] }),

    // Publish & versions (AGT-03.3, AGT-04): campaigns -------------------
    // API: { valid, issues: [{ field, message }] }; the screens read errors / warnings.
    validateFlow: b.mutation({
      query: (id) => C.flow(`${cp(id)}/flow/validate`, { method: 'POST', body: {} }),
      transformResponse: (d) => ({
        ...d,
        errors: d?.errors ?? d?.issues ?? [],
        warnings: d?.warnings ?? [],
      }),
    }),
    // No diff route on the backend: compare each draft tab with the live
    // version's config. Never published -> every non-empty tab counts as changed.
    getCampaignDiff: b.query({
      async queryFn(id, _api, _extra, baseQuery) {
        const versions = await baseQuery(C.flow(`${cp(id)}/flow/versions`));
        if (versions.error) return versions;
        const cur = (versions.data ?? []).find((v) => v.is_current);
        const live = cur ? await baseQuery(C.flow(`${cp(id)}/flow/versions/${cur.version}`)) : null;
        if (live?.error) return live;
        const keys = Object.keys(DIFF_SECTIONS);
        const drafts = await Promise.all(keys.map((k) => baseQuery(C.flow(`${cp(id)}/${DIFF_SECTIONS[k]}`))));
        const changed = keys.filter((k, i) => {
          if (drafts[i].error) return false;
          const d = drafts[i].data;
          const was = live?.data?.config?.[k];
          return live ? canon(isEmpty(d) ? null : d) !== canon(isEmpty(was) ? null : was) : !isEmpty(d);
        });
        return { data: { changed_sections: changed, published: !!cur, current_version: cur?.version ?? null } };
      },
      providesTags: (_r, _e, id) => [{ type: 'Campaign', id }, 'Version'],
    }),
    publishCampaign: b.mutation({
      query: ({ id, note }) => C.flow(`${cp(id)}/flow/publish`, { method: 'POST', body: { note } }),
      invalidatesTags: ['Campaign', 'Version', 'Number'],
    }),
    listVersions: b.query({ query: (id) => C.flow(`${cp(id)}/flow/versions`), providesTags: ['Version'] }),
    getVersion: b.query({ query: ({ id, version }) => C.flow(`${cp(id)}/flow/versions/${version}`) }),
    rollbackVersion: b.mutation({
      query: ({ id, version }) => C.flow(`${cp(id)}/flow/versions/${version}/rollback`, { method: 'POST', body: {} }),
      invalidatesTags: ['Campaign', 'Version'],
    }),

    // Templates & generator (AGT-11): they make campaigns ------------------
    listTemplates: b.query({ query: () => C.flow('/customer/campaign-templates'), providesTags: ['Template'] }),
    // { template_id, name?, direction?, agent_id | new_agent }
    createFromTemplate: b.mutation({
      query: (body) => C.flow('/customer/campaigns/from-template', { method: 'POST', body }),
      invalidatesTags: ['Campaign', 'Agent'],
    }),
    // API: { template_id, name, agent_name, config: { flow, persona, guidelines, variables, ... }, simulated }.
    // The "describe it" screen edits { name, agent_name, flow, persona, guidelines, variables } and sends config back.
    generateDraft: b.mutation({
      query: (description) => C.flow('/customer/campaigns/generate-draft', { method: 'POST', body: { description } }),
      transformResponse: (d) => {
        const c = d?.config ?? d ?? {};
        return {
          template_id: d?.template_id,
          simulated: !!d?.simulated,
          name: d?.name ?? 'New campaign',
          agent_name: d?.agent_name || c.persona?.name || '',
          config: c,
          flow: { greeting: '', system_prompt: '', steps: [], ...(c.flow ?? { greeting: d?.greeting, system_prompt: d?.system_prompt }) },
          persona: { name: '', role: '', ...(c.persona ?? {}) },
          guidelines: { always: [], never: [], blocked_topics: [], ...(c.guidelines ?? {}) },
          variables: Array.isArray(c.variables) ? c.variables : [],
        };
      },
    }),

    // Testing (AGT-06, QTY-01, QTY-02): campaigns ---------------------------
    // { id, draft }: draft runs the voice test on the saved draft (instructions,
    // rules as they are now) instead of the published version.
    createTestSession: b.mutation({
      query: (arg) => {
        const { id, draft, variables } = typeof arg === 'object' ? arg : { id: arg };
        return C.flow(`${cp(id)}/test-session`, { method: 'POST', body: { draft: !!draft, variables: variables ?? {} } });
      },
    }),
    // Rings to_number with the campaign's DRAFT; returns the call (poll outbound GET /calls/{id}).
    testCall: b.mutation({ query: ({ id, to_number }) => C.flow(`${cp(id)}/test-call`, { method: 'POST', body: { to_number } }) }),
    chatTest: b.mutation({ query: ({ id, ...body }) => C.flow(`${cp(id)}/chat-test`, { method: 'POST', body }) }),
    listScenarios: b.query({ query: (id) => C.flow(`${cp(id)}/test-scenarios`), providesTags: ['Scenario'] }),
    createScenario: b.mutation({ query: ({ id, ...body }) => C.flow(`${cp(id)}/test-scenarios`, { method: 'POST', body }), invalidatesTags: ['Scenario'] }),
    listTestRuns: b.query({ query: (id) => C.flow(`${cp(id)}/test-runs`), providesTags: ['TestRun'] }),
    startTestRun: b.mutation({ query: (id) => C.flow(`${cp(id)}/test-runs`, { method: 'POST', body: {} }), invalidatesTags: ['TestRun'] }),

    // A campaign's own documents (AGT-05) ------------------------------------
    listCampaignDocuments: b.query({ query: (id) => C.flow(`${cp(id)}/kb-documents`), providesTags: ['Source'] }),
    addCampaignDocument: b.mutation({
      async queryFn({ id, file }, _api, _extra, baseQuery) {
        const created = await baseQuery(C.flow(`${cp(id)}/kb-documents`, { method: 'POST', body: { filename: file.name, content_type: file.type || 'application/octet-stream', size_bytes: file.size } }));
        if (created.error) return created;
        if (created.data?.upload_url) {
          const up = await uploadToSignedUrl({ url: created.data.upload_url, file, authed: true });
          if (up.error) return up;
        }
        return created;
      },
      invalidatesTags: ['Source'],
    }),
    removeCampaignDocument: b.mutation({ query: ({ id, docId }) => C.flow(`${cp(id)}/kb-documents/${docId}`, { method: 'DELETE' }), invalidatesTags: ['Source'] }),

    // Company profile (AGT-08) -------------------------------------------
    getCompanyProfile: b.query({
      query: () => C.flow('/customer/company-profile'),
      // A new company's profile can come back with parts missing; the page
      // expects every part, each field editable from empty.
      transformResponse: (p) => ({
        ...(p ?? {}),
        about: { ...(p?.about ?? {}) },
        contact: { ...(p?.contact ?? {}) },
        policies: { ...(p?.policies ?? {}) },
        hours: { ...(p?.hours ?? {}) },
        offerings: Array.isArray(p?.offerings) ? p.offerings : [],
      }),
      providesTags: ['Company'],
    }),
    putCompanyProfile: b.mutation({ query: (body) => C.flow('/customer/company-profile', { method: 'PUT', body }), invalidatesTags: ['Company'] }),
    importCompanyFromWebsite: b.mutation({ query: (url) => C.flow('/customer/company-profile/import-from-website', { method: 'POST', body: { url } }) }),

    // Knowledge (KNW-01, KNW-02) -----------------------------------------
    listKnowledgeBases: b.query({ query: () => C.flow('/customer/knowledge-bases'), providesTags: ['Knowledge'] }),
    createKnowledgeBase: b.mutation({ query: (body) => C.flow('/customer/knowledge-bases', { method: 'POST', body }), invalidatesTags: ['Knowledge'] }),
    listSources: b.query({ query: (kbId) => C.flow(`/customer/knowledge-bases/${kbId}/sources`), providesTags: ['Source'] }),
    addSource: b.mutation({
      async queryFn({ kbId, file, ...body }, _api, _extra, baseQuery) {
        const created = await baseQuery(C.flow(`/customer/knowledge-bases/${kbId}/sources`, { method: 'POST', body: sourceTo(body, file) }));
        if (created.error || !file) return created;
        // File sources are created as awaiting_upload; the bytes go to upload_url, then the file is processed.
        if (created.data?.upload_url) {
          const up = await uploadToSignedUrl({ url: created.data.upload_url, file, authed: true });
          if (up.error) return up;
        }
        return created;
      },
      invalidatesTags: ['Source', 'Knowledge'],
    }),
    getSource: b.query({ query: ({ kbId, id }) => C.flow(`/customer/knowledge-bases/${kbId}/sources/${id}`) }),
    removeSource: b.mutation({
      query: ({ kbId, id }) => C.flow(`/customer/knowledge-bases/${kbId}/sources/${id}`, { method: 'DELETE' }),
      invalidatesTags: ['Source', 'Knowledge'],
    }),
    resyncSource: b.mutation({
      query: ({ kbId, id }) => C.flow(`/customer/knowledge-bases/${kbId}/sources/${id}/resync`, { method: 'POST', body: {} }),
      invalidatesTags: ['Source'],
    }),
    // Real full-text search: { answer, matches: [{ title, type, passage, score 0-1 }], simulated: false }.
    queryKnowledge: b.mutation({
      query: ({ kbId, question }) => C.flow(`/customer/knowledge-bases/${kbId}/query`, { method: 'POST', body: { question } }),
      transformResponse: (d) => ({
        ...d,
        passages: (d?.passages ?? d?.matches ?? []).map((m) => ({ source: m.title ?? m.source ?? m.type, text: m.passage ?? m.text ?? '', score: m.score ?? 0 })),
      }),
    }),

    // Tools (ACT-01) -----------------------------------------------------
    // The screens edit parameters as a list; the API stores a JSON schema.
    listTools: b.query({ query: () => C.flow('/customer/tools'), transformResponse: (d) => asArray(d).map(toolFrom), providesTags: ['Tool'] }),
    createTool: b.mutation({ query: (body) => C.flow('/customer/tools', { method: 'POST', body: toolTo(body) }), invalidatesTags: ['Tool'] }),
    updateTool: b.mutation({
      query: ({ id, ...body }) => C.flow(`/customer/tools/${id}`, { method: 'PATCH', body: toolTo(body) }),
      invalidatesTags: ['Tool'],
    }),
    deleteTool: b.mutation({ query: (id) => C.flow(`/customer/tools/${id}`, { method: 'DELETE' }), invalidatesTags: ['Tool'] }),
    // Sends the real request. Returns { request, response: { status, duration_ms, body, error }, missing_arguments? };
    // status 0 means nothing came back (missing arguments, or the address couldn't be reached).
    testTool: b.mutation({ query: ({ id, params }) => C.flow(`/customer/tools/${id}/test`, { method: 'POST', body: { arguments: params ?? {} } }) }),

    // Pronunciations, voices, teams -------------------------------------
    // Company-wide list: { entries: [{ word, say_as }] } on the wire, a plain array in the UI.
    listPronunciations: b.query({
      query: () => C.flow('/customer/pronunciations'),
      transformResponse: (d) => (Array.isArray(d) ? d : (d?.entries ?? d?.items ?? [])),
      providesTags: ['Pronunciation'],
    }),
    putPronunciations: b.mutation({
      query: (list) =>
        C.flow('/customer/pronunciations', {
          method: 'PUT',
          body: { entries: (Array.isArray(list) ? list : (list?.entries ?? [])).filter((e) => e.word?.trim()) },
        }),
      invalidatesTags: ['Pronunciation'],
    }),
    listCustomVoices: b.query({ query: () => C.flow('/customer/voices'), providesTags: ['Voice'] }),
    createCustomVoice: b.mutation({ query: (body) => C.flow('/customer/voices', { method: 'POST', body }), invalidatesTags: ['Voice'] }),
    deleteCustomVoice: b.mutation({ query: (id) => C.flow(`/customer/voices/${id}`, { method: 'DELETE' }), invalidatesTags: ['Voice'] }),
  }),
});

export const {
  useListAgentsQuery,
  useLazyListAgentsQuery,
  useGetAgentQuery,
  useGetAgentIdentityQuery,
  useCreateAgentMutation,
  useUpdateAgentMutation,
  useDeleteAgentMutation,
  useListCampaignsQuery,
  useLazyListCampaignsQuery,
  useGetCampaignUsageQuery,
  useGetCampaignQuery,
  useCreateCampaignMutation,
  useUpdateCampaignMutation,
  useDeleteCampaignMutation,
  useDuplicateCampaignMutation,
  usePauseCampaignMutation,
  useResumeCampaignMutation,
  useLazyExportCampaignQuery,
  useImportCampaignMutation,
  useGetAgentSectionQuery,
  useLazyGetAgentSectionQuery,
  usePutAgentSectionMutation,
  useListLanguagesQuery,
  useListVoicesQuery,
  useListModelsQuery,
  useListGuidelinePresetsQuery,
  useValidateFlowMutation,
  useGetCampaignDiffQuery,
  usePublishCampaignMutation,
  useListVersionsQuery,
  useGetVersionQuery,
  useLazyGetVersionQuery,
  useRollbackVersionMutation,
  useListTemplatesQuery,
  useCreateFromTemplateMutation,
  useGenerateDraftMutation,
  useCreateTestSessionMutation,
  useGetSourceQuery,
  useTestCallMutation,
  useChatTestMutation,
  useListScenariosQuery,
  useCreateScenarioMutation,
  useListTestRunsQuery,
  useStartTestRunMutation,
  useListCampaignDocumentsQuery,
  useAddCampaignDocumentMutation,
  useRemoveCampaignDocumentMutation,
  useGetCompanyProfileQuery,
  usePutCompanyProfileMutation,
  useImportCompanyFromWebsiteMutation,
  useListKnowledgeBasesQuery,
  useCreateKnowledgeBaseMutation,
  useListSourcesQuery,
  useAddSourceMutation,
  useRemoveSourceMutation,
  useResyncSourceMutation,
  useQueryKnowledgeMutation,
  useListToolsQuery,
  useCreateToolMutation,
  useUpdateToolMutation,
  useDeleteToolMutation,
  useTestToolMutation,
  useListPronunciationsQuery,
  usePutPronunciationsMutation,
  useListCustomVoicesQuery,
  useCreateCustomVoiceMutation,
  useDeleteCustomVoiceMutation,
} = flowApi;
