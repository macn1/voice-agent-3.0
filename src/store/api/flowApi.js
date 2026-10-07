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
export const AGENT_SECTIONS = {
  persona: { path: 'persona' },
  profileOverrides: { path: 'company-profile-overrides' },
  flow: { path: 'flow/draft' },
  guidelines: { path: 'guidelines' },
  variables: { path: 'variables' },
  behaviour: { path: 'behaviour' },
  speech: { path: 'speech-settings' },
  keywords: { path: 'keywords' },
  languages: { path: 'languages' },
  settings: { path: 'settings' },
  model: { path: 'model-settings' },
  memory: { path: 'memory-settings' },
  knowledgeBases: { path: 'knowledge-bases', wrap: (ids) => ({ knowledge_base_ids: ids }) },
  tools: { path: 'tools', wrap: (ids) => ({ tool_ids: ids }) },
  followUps: { path: 'follow-ups' },
  analysis: { path: 'analysis-config' },
  outcomes: { path: 'outcomes' },
  compliance: { path: 'compliance' },
  widget: { path: 'widget' },
  webchat: { path: 'webchat' },
  chatSettings: { path: 'chat-settings' },
};

const sectionTag = (id, section) => ({ type: 'AgentSection', id: `${id}:${section}` });

export const flowApi = baseApi.injectEndpoints({
  endpoints: (b) => ({
    // Agents (AGT-01) ------------------------------------------------------
    listAgents: b.query({ query: (params = {}) => C.flow('/customer/agents', { params }), providesTags: ['Agent'] }),
    getAgent: b.query({ query: (id) => C.flow(ag(id)), providesTags: (_r, _e, id) => [{ type: 'Agent', id }] }),
    createAgent: b.mutation({ query: (body) => C.flow('/customer/agents', { method: 'POST', body }), invalidatesTags: ['Agent'] }),
    updateAgent: b.mutation({ query: ({ id, ...body }) => C.flow(ag(id), { method: 'PATCH', body }), invalidatesTags: ['Agent'] }),
    deleteAgent: b.mutation({ query: (id) => C.flow(ag(id), { method: 'DELETE' }), invalidatesTags: ['Agent', 'Number'] }),
    duplicateAgent: b.mutation({ query: (id) => C.flow(`${ag(id)}/duplicate`, { method: 'POST', body: {} }), invalidatesTags: ['Agent'] }),
    pauseAgent: b.mutation({ query: (id) => C.flow(`${ag(id)}/pause`, { method: 'POST', body: {} }), invalidatesTags: ['Agent'] }),
    resumeAgent: b.mutation({ query: (id) => C.flow(`${ag(id)}/resume`, { method: 'POST', body: {} }), invalidatesTags: ['Agent'] }),
    exportAgent: b.query({ query: (id) => C.flow(`${ag(id)}/export`), keepUnusedDataFor: 0 }),
    importAgent: b.mutation({ query: (config) => C.flow('/customer/agents/import', { method: 'POST', body: config }), invalidatesTags: ['Agent'] }),

    // Editor sections (AGT-03, 07..14, 17, 18; KNW-01.7; ACT-01.6, 03; PCA-01/02; CMP-01; CON-02.2; WID-01; WA-03.2/06.2)
    getAgentSection: b.query({
      query: ({ id, section }) => C.flow(`${ag(id)}/${AGENT_SECTIONS[section].path}`),
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
    validateFlow: b.mutation({ query: (id) => C.flow(`${ag(id)}/flow/validate`, { method: 'POST', body: {} }) }),
    getAgentDiff: b.query({ query: (id) => C.flow(`${ag(id)}/flow/diff`), providesTags: (_r, _e, id) => [{ type: 'Agent', id }] }),
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
    generateDraft: b.mutation({ query: (description) => C.flow('/customer/agents/generate-draft', { method: 'POST', body: { description } }) }),

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
    listPronunciations: b.query({ query: () => C.flow('/customer/pronunciations'), providesTags: ['Pronunciation'] }),
    putPronunciations: b.mutation({ query: (body) => C.flow('/customer/pronunciations', { method: 'PUT', body }), invalidatesTags: ['Pronunciation'] }),
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
