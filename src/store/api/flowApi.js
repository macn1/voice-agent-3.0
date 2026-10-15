import { baseApi } from './baseApi';
import { uploadToSignedUrl } from './baseQuery';
import { C } from './services';

// voice-flow-be (all proposed in FEATURE-TICKETS.md): agents (AGT-01..19),
// catalog (AGT-02), company profile (AGT-08), knowledge (KNW-01/02, AGT-05),
// tools (ACT-01), pronunciations (AGT-13.3), voices (AGT-15), teams (AGT-16),
// test scenarios (QTY-01), chat test (QTY-02).

const ag = (id) => `/customer/agents/${id}`;

/**
 * Each tab of the agent editor is one GET/PUT pair on the draft
 * (DB-DESIGN §6: one jsonb column per section). `wrap` shapes the PUT body
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

export const AGENT_SECTIONS = {
  persona: { path: 'persona', from: withDefaults({ name: '', gender: 'female', role: '', tone: 'friendly', personality: {}, style: '' }) },
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
    path: 'speech-settings',
    from: withDefaults({ voice_id: '', speed: 1, interruption_sensitivity: 0.5, ambience: 'none', backchannel: true }),
  },
  keywords: { path: 'keywords', from: (d) => d?.keywords ?? d?.items ?? [], wrap: (list) => ({ keywords: list }) },
  languages: { path: 'languages', from: langFrom, wrap: langWrap },
  settings: {
    path: 'settings',
    from: withDefaults({ tags: [], description: '', event_webhook_url: '' }),
    // GET returns the whole agent record; only these fields are editable.
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
    path: 'model-settings',
    from: withDefaults({ llm: '', fallback_llm: '', temperature: 0.4, max_reply_tokens: 200, asr_provider: '', tts_provider: '', fallback_tts: '' }),
  },
  memory: { path: 'memory-settings' },
  knowledgeBases: { path: 'knowledge-bases', wrap: (ids) => ({ knowledge_base_ids: ids }) },
  tools: { path: 'tools', wrap: (ids) => ({ tool_ids: ids }) },
  followUps: { path: 'follow-ups' },
  analysis: { path: 'analysis-config', from: withDefaults({ summary: true, sentiment: true, fields: [] }) },
  outcomes: { path: 'outcomes', from: withDefaults({ outcomes: [], success_rule: '' }) },
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
  widget: { path: 'widget' },
  webchat: { path: 'webchat' },
  chatSettings: { path: 'chat-settings' },
};

// Version config key -> draft endpoint, used to compare the draft with the live
// version on the client (the backend has no diff route).
const DIFF_SECTIONS = {
  flow: 'flow/draft',
  persona: 'persona',
  behaviour: 'behaviour',
  variables: 'variables',
  guidelines: 'guidelines',
  analysis: 'analysis-config',
  compliance: 'compliance',
  profile_overrides: 'company-profile-overrides',
  speech: 'speech-settings',
  model: 'model-settings',
  languages: 'languages',
};
const isEmpty = (v) => v == null || (Array.isArray(v) ? !v.length : typeof v === 'object' ? !Object.keys(v).length : v === '');
const canon = (v) =>
  JSON.stringify(v, (_k, x) =>
    x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x,
  );

const sectionTag = (id, section) => ({ type: 'AgentSection', id: `${id}:${section}` });

export const flowApi = baseApi.injectEndpoints({
  endpoints: (b) => ({
    // Agents (AGT-01) ------------------------------------------------------
    // The API only returns published_version_id; the screens want a truthy
    // "is published" flag in lists and the version number on the editor.
    listAgents: b.query({
      query: (params = {}) => C.flow('/customer/agents', { params }),
      transformResponse: (d) =>
        d?.items ? { ...d, items: d.items.map((a) => ({ ...a, published_version: a.published_version ?? (a.published_version_id ? true : null) })) } : d,
      providesTags: ['Agent'],
    }),
    getAgent: b.query({
      async queryFn(id, _api, _extra, baseQuery) {
        const r = await baseQuery(C.flow(ag(id)));
        if (r.error || !r.data?.published_version_id || r.data.published_version) return r;
        const v = await baseQuery(C.flow(`${ag(id)}/flow/versions`));
        const cur = Array.isArray(v.data) ? (v.data.find((x) => x.id === r.data.published_version_id) ?? v.data.find((x) => x.is_current)) : null;
        return { data: { ...r.data, published_version: cur?.version ?? true } };
      },
      providesTags: (_r, _e, id) => [{ type: 'Agent', id }],
    }),
    createAgent: b.mutation({ query: (body) => C.flow('/customer/agents', { method: 'POST', body }), invalidatesTags: ['Agent'] }),
    updateAgent: b.mutation({ query: ({ id, ...body }) => C.flow(ag(id), { method: 'PATCH', body }), invalidatesTags: ['Agent'] }),
    deleteAgent: b.mutation({ query: (id) => C.flow(ag(id), { method: 'DELETE' }), invalidatesTags: ['Agent', 'Number'] }),
    // arg: agent id, or { id, name } ("<name> (copy)" by default).
    duplicateAgent: b.mutation({
      query: (arg) => {
        const { id, name } = typeof arg === 'string' ? { id: arg } : arg;
        return C.flow(`${ag(id)}/duplicate`, { method: 'POST', body: name ? { name } : {} });
      },
      invalidatesTags: ['Agent'],
    }),
    pauseAgent: b.mutation({ query: (id) => C.flow(`${ag(id)}/pause`, { method: 'POST', body: {} }), invalidatesTags: ['Agent'] }),
    resumeAgent: b.mutation({ query: (id) => C.flow(`${ag(id)}/resume`, { method: 'POST', body: {} }), invalidatesTags: ['Agent'] }),
    exportAgent: b.query({ query: (id) => C.flow(`${ag(id)}/export`), keepUnusedDataFor: 0 }),
    // arg: the export file, or { export, name }. 409 agent_name_in_use if the name is taken.
    importAgent: b.mutation({
      query: (arg) =>
        C.flow('/customer/agents/import', {
          method: 'POST',
          body: arg?.export ? { export: arg.export, ...(arg.name ? { name: arg.name } : {}) } : { export: arg },
        }),
      invalidatesTags: ['Agent'],
    }),

    // Editor sections (AGT-03, 07..14, 17, 18; KNW-01.7; ACT-01.6, 03; PCA-01/02; CMP-01; CON-02.2; WID-01; WA-03.2/06.2)
    getAgentSection: b.query({
      query: ({ id, section }) => C.flow(`${ag(id)}/${AGENT_SECTIONS[section].path}`),
      transformResponse: (d, _m, { section }) => (AGENT_SECTIONS[section].from ? AGENT_SECTIONS[section].from(d) : d),
      providesTags: (_r, _e, { id, section }) => [sectionTag(id, section)],
    }),
    putAgentSection: b.mutation({
      query: ({ id, section, body }) => {
        const def = AGENT_SECTIONS[section];
        return C.flow(`${ag(id)}/${def.path}`, { method: 'PUT', body: def.wrap ? def.wrap(body) : body });
      },
      // Saving a section changes "unpublished changes" on the agent itself.
      invalidatesTags: (_r, _e, { id, section }) => [sectionTag(id, section), { type: 'Agent', id }],
    }),

    // Catalog (AGT-02, AGT-18.3) -----------------------------------------
    listLanguages: b.query({ query: () => C.flow('/customer/catalog/languages'), providesTags: ['Catalog'] }),
    listVoices: b.query({ query: (language) => C.flow('/customer/catalog/voices', { params: { language } }), providesTags: ['Catalog'] }),
    listModels: b.query({ query: () => C.flow('/customer/catalog/models'), providesTags: ['Catalog'] }),
    listGuidelinePresets: b.query({ query: () => C.flow('/customer/guideline-presets'), providesTags: ['Catalog'] }),

    // Publish & versions (AGT-03.3, AGT-04) -------------------------------
    // API: { valid, issues: [{ field, message }] }; the screens read errors / warnings.
    validateFlow: b.mutation({
      query: (id) => C.flow(`${ag(id)}/flow/validate`, { method: 'POST', body: {} }),
      transformResponse: (d) => ({
        ...d,
        errors: d?.errors ?? d?.issues ?? [],
        warnings: d?.warnings ?? [],
      }),
    }),
    // No diff route on the backend: compare each draft tab with the live
    // version's config. Never published -> every non-empty tab counts as changed.
    getAgentDiff: b.query({
      async queryFn(id, _api, _extra, baseQuery) {
        const versions = await baseQuery(C.flow(`${ag(id)}/flow/versions`));
        if (versions.error) return versions;
        const cur = (versions.data ?? []).find((v) => v.is_current);
        const live = cur ? await baseQuery(C.flow(`${ag(id)}/flow/versions/${cur.version}`)) : null;
        if (live?.error) return live;
        const keys = Object.keys(DIFF_SECTIONS);
        const drafts = await Promise.all(keys.map((k) => baseQuery(C.flow(`${ag(id)}/${DIFF_SECTIONS[k]}`))));
        const changed = keys.filter((k, i) => {
          if (drafts[i].error) return false;
          const d = drafts[i].data;
          const was = live?.data?.config?.[k];
          return live ? canon(isEmpty(d) ? null : d) !== canon(isEmpty(was) ? null : was) : !isEmpty(d);
        });
        return { data: { changed_sections: changed, published: !!cur, current_version: cur?.version ?? null } };
      },
      providesTags: (_r, _e, id) => [{ type: 'Agent', id }, 'Version'],
    }),
    publishAgent: b.mutation({
      query: ({ id, note }) => C.flow(`${ag(id)}/flow/publish`, { method: 'POST', body: { note } }),
      invalidatesTags: ['Agent', 'Version', 'Number'],
    }),
    listVersions: b.query({ query: (id) => C.flow(`${ag(id)}/flow/versions`), providesTags: ['Version'] }),
    getVersion: b.query({ query: ({ id, version }) => C.flow(`${ag(id)}/flow/versions/${version}`) }),
    rollbackVersion: b.mutation({
      query: ({ id, version }) => C.flow(`${ag(id)}/flow/versions/${version}/rollback`, { method: 'POST', body: {} }),
      invalidatesTags: ['Agent', 'Version'],
    }),

    // Templates & generator (AGT-11) -------------------------------------
    listTemplates: b.query({ query: () => C.flow('/customer/agent-templates'), providesTags: ['Template'] }),
    createFromTemplate: b.mutation({
      query: ({ template_id, name }) => C.flow('/customer/agents/from-template', { method: 'POST', body: { template_id, name } }),
      invalidatesTags: ['Agent'],
    }),
    // API: { template_id, name, config: { flow, persona, guidelines, variables, ... }, simulated }.
    // The "describe it" screen edits { name, flow, persona, guidelines, variables }.
    generateDraft: b.mutation({
      query: (description) => C.flow('/customer/agents/generate-draft', { method: 'POST', body: { description } }),
      transformResponse: (d) => {
        const c = d?.config ?? d ?? {};
        return {
          template_id: d?.template_id,
          simulated: !!d?.simulated,
          name: d?.name ?? 'New agent',
          flow: { greeting: '', system_prompt: '', steps: [], ...(c.flow ?? { greeting: d?.greeting, system_prompt: d?.system_prompt }) },
          persona: { name: '', role: '', ...(c.persona ?? {}) },
          guidelines: { always: [], never: [], blocked_topics: [], ...(c.guidelines ?? {}) },
          variables: Array.isArray(c.variables) ? c.variables : [],
        };
      },
    }),

    // Testing (AGT-06, QTY-01, QTY-02) -----------------------------------
    createTestSession: b.mutation({ query: (id) => C.flow(`${ag(id)}/test-session`, { method: 'POST', body: {} }) }),
    testCall: b.mutation({ query: ({ id, phone, variables }) => C.flow(`${ag(id)}/test-call`, { method: 'POST', body: { phone, variables } }) }),
    chatTest: b.mutation({ query: ({ id, ...body }) => C.flow(`${ag(id)}/chat-test`, { method: 'POST', body }) }),
    listScenarios: b.query({ query: (id) => C.flow(`${ag(id)}/test-scenarios`), providesTags: ['Scenario'] }),
    createScenario: b.mutation({ query: ({ id, ...body }) => C.flow(`${ag(id)}/test-scenarios`, { method: 'POST', body }), invalidatesTags: ['Scenario'] }),
    listTestRuns: b.query({ query: (id) => C.flow(`${ag(id)}/test-runs`), providesTags: ['TestRun'] }),
    startTestRun: b.mutation({ query: (id) => C.flow(`${ag(id)}/test-runs`, { method: 'POST', body: {} }), invalidatesTags: ['TestRun'] }),

    // Agent documents (AGT-05) -------------------------------------------
    listAgentDocuments: b.query({ query: (id) => C.flow(`${ag(id)}/kb-documents`), providesTags: ['Source'] }),
    addAgentDocument: b.mutation({
      async queryFn({ id, file }, _api, _extra, baseQuery) {
        const created = await baseQuery(C.flow(`${ag(id)}/kb-documents`, { method: 'POST', body: { title: file.name, size: file.size } }));
        if (created.error) return created;
        if (created.data?.upload_url) {
          const up = await uploadToSignedUrl({ url: created.data.upload_url, file });
          if (up.error) return up;
        }
        return created;
      },
      invalidatesTags: ['Source'],
    }),
    removeAgentDocument: b.mutation({ query: ({ id, docId }) => C.flow(`${ag(id)}/kb-documents/${docId}`, { method: 'DELETE' }), invalidatesTags: ['Source'] }),

    // Company profile (AGT-08) -------------------------------------------
    getCompanyProfile: b.query({ query: () => C.flow('/customer/company-profile'), providesTags: ['Company'] }),
    putCompanyProfile: b.mutation({ query: (body) => C.flow('/customer/company-profile', { method: 'PUT', body }), invalidatesTags: ['Company'] }),
    importCompanyFromWebsite: b.mutation({ query: (url) => C.flow('/customer/company-profile/import-from-website', { method: 'POST', body: { url } }) }),

    // Knowledge (KNW-01, KNW-02) -----------------------------------------
    listKnowledgeBases: b.query({ query: () => C.flow('/customer/knowledge-bases'), providesTags: ['Knowledge'] }),
    createKnowledgeBase: b.mutation({ query: (body) => C.flow('/customer/knowledge-bases', { method: 'POST', body }), invalidatesTags: ['Knowledge'] }),
    listSources: b.query({ query: (kbId) => C.flow(`/customer/knowledge-bases/${kbId}/sources`), providesTags: ['Source'] }),
    addSource: b.mutation({
      async queryFn({ kbId, file, ...body }, _api, _extra, baseQuery) {
        const created = await baseQuery(C.flow(`/customer/knowledge-bases/${kbId}/sources`, { method: 'POST', body }));
        if (created.error || !file) return created;
        if (created.data?.upload_url) {
          const up = await uploadToSignedUrl({ url: created.data.upload_url, file });
          if (up.error) return up;
        }
        return created;
      },
      invalidatesTags: ['Source', 'Knowledge'],
    }),
    removeSource: b.mutation({
      query: ({ kbId, id }) => C.flow(`/customer/knowledge-bases/${kbId}/sources/${id}`, { method: 'DELETE' }),
      invalidatesTags: ['Source', 'Knowledge'],
    }),
    resyncSource: b.mutation({
      query: ({ kbId, id }) => C.flow(`/customer/knowledge-bases/${kbId}/sources/${id}/resync`, { method: 'POST', body: {} }),
      invalidatesTags: ['Source'],
    }),
    queryKnowledge: b.mutation({ query: ({ kbId, question }) => C.flow(`/customer/knowledge-bases/${kbId}/query`, { method: 'POST', body: { question } }) }),

    // Tools (ACT-01) -----------------------------------------------------
    listTools: b.query({ query: () => C.flow('/customer/tools'), providesTags: ['Tool'] }),
    createTool: b.mutation({ query: (body) => C.flow('/customer/tools', { method: 'POST', body }), invalidatesTags: ['Tool'] }),
    updateTool: b.mutation({ query: ({ id, ...body }) => C.flow(`/customer/tools/${id}`, { method: 'PATCH', body }), invalidatesTags: ['Tool'] }),
    deleteTool: b.mutation({ query: (id) => C.flow(`/customer/tools/${id}`, { method: 'DELETE' }), invalidatesTags: ['Tool'] }),
    testTool: b.mutation({ query: ({ id, params }) => C.flow(`/customer/tools/${id}/test`, { method: 'POST', body: { params } }), invalidatesTags: ['Tool'] }),

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
    listAgentTeams: b.query({ query: () => C.flow('/customer/agent-teams'), providesTags: ['Team'] }),
    createAgentTeam: b.mutation({ query: (body) => C.flow('/customer/agent-teams', { method: 'POST', body }), invalidatesTags: ['Team'] }),
    updateAgentTeam: b.mutation({ query: ({ id, ...body }) => C.flow(`/customer/agent-teams/${id}`, { method: 'PUT', body }), invalidatesTags: ['Team'] }),
  }),
});

export const {
  useListAgentsQuery,
  useLazyListAgentsQuery,
  useGetAgentQuery,
  useCreateAgentMutation,
  useUpdateAgentMutation,
  useDeleteAgentMutation,
  useDuplicateAgentMutation,
  usePauseAgentMutation,
  useResumeAgentMutation,
  useLazyExportAgentQuery,
  useImportAgentMutation,
  useGetAgentSectionQuery,
  useLazyGetAgentSectionQuery,
  usePutAgentSectionMutation,
  useListLanguagesQuery,
  useListVoicesQuery,
  useListModelsQuery,
  useListGuidelinePresetsQuery,
  useValidateFlowMutation,
  useGetAgentDiffQuery,
  usePublishAgentMutation,
  useListVersionsQuery,
  useLazyGetVersionQuery,
  useRollbackVersionMutation,
  useListTemplatesQuery,
  useCreateFromTemplateMutation,
  useGenerateDraftMutation,
  useCreateTestSessionMutation,
  useTestCallMutation,
  useChatTestMutation,
  useListScenariosQuery,
  useCreateScenarioMutation,
  useListTestRunsQuery,
  useStartTestRunMutation,
  useListAgentDocumentsQuery,
  useAddAgentDocumentMutation,
  useRemoveAgentDocumentMutation,
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
  useListAgentTeamsQuery,
  useCreateAgentTeamMutation,
  useUpdateAgentTeamMutation,
} = flowApi;
