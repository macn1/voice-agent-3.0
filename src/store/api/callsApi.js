import { baseApi } from './baseApi';
import { C, P } from './services';

// voice-telephony-be + voice-inbound-be (NUM-01/02, EXT-01), voice-outbound-be
// (CALL-02/03/04/07/08/10/11, CON-01/03, CMP-03) and call records in
// voice-analytics-be (CALL-05/06, PCA-01..03, QTY-03). All proposed.

const cp = (id) => `/customer/campaigns/${id}`;
const CAMP = (_r, _e, arg) => [{ type: 'Campaign', id: typeof arg === 'string' ? arg : arg.id }];

export const callsApi = baseApi.injectEndpoints({
  endpoints: (b) => ({
    // Phone numbers & routing ------------------------------------------------
    listNumbers: b.query({ query: () => C.telephony('/customer/phone-numbers'), providesTags: ['Number'] }),
    assignNumberAgent: b.mutation({
      query: ({ id, agent_id }) => C.inbound(`/customer/phone-numbers/${id}/agent`, { method: 'PUT', body: { agent_id } }),
      invalidatesTags: ['Number', 'Agent'],
    }),
    unassignNumberAgent: b.mutation({
      query: (id) => C.inbound(`/customer/phone-numbers/${id}/agent`, { method: 'DELETE' }),
      invalidatesTags: ['Number', 'Agent'],
    }),
    getRouting: b.query({ query: (id) => C.inbound(`/customer/phone-numbers/${id}/routing`), providesTags: (_r, _e, id) => [{ type: 'Routing', id }] }),
    putRouting: b.mutation({
      query: ({ id, body }) => C.inbound(`/customer/phone-numbers/${id}/routing`, { method: 'PUT', body }),
      invalidatesTags: (_r, _e, { id }) => [{ type: 'Routing', id }],
    }),
    simulateRouting: b.mutation({ query: ({ id, at }) => C.inbound(`/customer/phone-numbers/${id}/routing/simulate`, { method: 'POST', body: { at } }) }),
    listHolidays: b.query({ query: () => C.inbound('/customer/routing/holidays'), providesTags: ['Holiday'] }),
    putHolidays: b.mutation({ query: (body) => C.inbound('/customer/routing/holidays', { method: 'PUT', body }), invalidatesTags: ['Holiday'] }),
    searchAvailableNumbers: b.query({ query: ({ country, contains }) => C.telephony('/customer/phone-numbers/available', { params: { country, contains } }) }),
    purchaseNumber: b.mutation({
      query: (e164) => C.telephony('/customer/phone-numbers/purchase', { method: 'POST', body: { e164 } }),
      invalidatesTags: ['Number'],
    }),
    listConnections: b.query({ query: () => C.telephony('/customer/telephony/connections'), providesTags: ['Connection'] }),
    addConnection: b.mutation({ query: (body) => C.telephony('/customer/telephony/connections', { method: 'POST', body }), invalidatesTags: ['Connection'] }),

    // Single calls (CALL-02) -------------------------------------------------
    startCall: b.mutation({ query: (body) => C.outbound('/calls', { method: 'POST', body }), invalidatesTags: ['Call'] }),
    getCallStatus: b.query({ query: (id) => C.outbound(`/calls/${id}`), providesTags: (_r, _e, id) => [{ type: 'Call', id }] }),
    hangupCall: b.mutation({ query: (id) => C.outbound(`/calls/${id}/hangup`, { method: 'POST', body: {} }), invalidatesTags: ['Call'] }),

    // Call records (CALL-05, CALL-06, PCA, QTY-03) ---------------------------
    listCalls: b.query({ query: (params = {}) => C.analytics('/customer/calls', { params }), providesTags: ['Call'] }),
    getCall: b.query({ query: (id) => C.analytics(`/customer/calls/${id}`), providesTags: (_r, _e, id) => [{ type: 'Call', id }] }),
    getTranscript: b.query({ query: (id) => C.analytics(`/customer/calls/${id}/transcript`) }),
    getRecording: b.query({ query: (id) => C.analytics(`/customer/calls/${id}/recording`) }),
    listLiveCalls: b.query({ query: () => C.analytics('/customer/calls/live'), providesTags: ['Call'] }),
    updateCall: b.mutation({ query: ({ id, ...body }) => C.analytics(`/customer/calls/${id}`, { method: 'PATCH', body }), invalidatesTags: ['Call'] }),
    rerunAnalysis: b.mutation({ query: (id) => C.analytics(`/customer/calls/${id}/analysis/rerun`, { method: 'POST', body: {} }), invalidatesTags: ['Call'] }),
    listReviews: b.query({ query: (id) => C.analytics(`/customer/calls/${id}/reviews`), providesTags: ['Review'] }),
    addReview: b.mutation({ query: ({ id, ...body }) => C.analytics(`/customer/calls/${id}/reviews`, { method: 'POST', body }), invalidatesTags: ['Review'] }),
    pushCallToCrm: b.mutation({ query: (id) => C.integration(`/customer/calls/${id}/push-to-crm`, { method: 'POST', body: {} }), invalidatesTags: ['Call'] }),
    listenToCall: b.mutation({ query: (id) => C.analytics(`/customer/calls/${id}/listen`, { method: 'POST', body: {} }) }),
    takeOverCall: b.mutation({ query: (id) => C.analytics(`/customer/calls/${id}/takeover`, { method: 'POST', body: {} }) }),
    listScorecards: b.query({ query: () => C.analytics('/customer/qa-scorecards'), providesTags: ['Scorecard'] }),
    putScorecards: b.mutation({ query: (body) => C.analytics('/customer/qa-scorecards', { method: 'PUT', body }), invalidatesTags: ['Scorecard'] }),

    // Campaigns (CALL-03, 07, 08, 09, 11) ------------------------------------
    listCampaigns: b.query({ query: (params = {}) => C.outbound('/customer/campaigns', { params }), providesTags: ['Campaign'] }),
    getCampaign: b.query({ query: (id) => C.outbound(cp(id)), providesTags: CAMP }),
    createCampaign: b.mutation({ query: (body) => C.outbound('/customer/campaigns', { method: 'POST', body }), invalidatesTags: ['Campaign'] }),
    updateCampaign: b.mutation({ query: ({ id, ...body }) => C.outbound(cp(id), { method: 'PATCH', body }), invalidatesTags: ['Campaign'] }),
    uploadCampaignContacts: b.mutation({
      query: ({ id, ...body }) => C.outbound(`${cp(id)}/contacts`, { method: 'POST', body }),
      invalidatesTags: ['Campaign', 'CampaignContact'],
    }),
    campaignAction: b.mutation({
      // action: start | pause | resume | cancel | duplicate
      query: ({ id, action }) => C.outbound(`${cp(id)}/${action}`, { method: 'POST', body: {} }),
      invalidatesTags: ['Campaign', 'CampaignContact'],
    }),
    getCampaignResults: b.query({ query: (id) => C.outbound(`${cp(id)}/results`), keepUnusedDataFor: 0 }),
    listCampaignContacts: b.query({ query: ({ id, ...params }) => C.outbound(`${cp(id)}/contacts`, { params }), providesTags: ['CampaignContact'] }),
    listContactAttempts: b.query({ query: ({ id, contactId }) => C.outbound(`${cp(id)}/contacts/${contactId}/attempts`), providesTags: ['CampaignContact'] }),
    retryCampaignContact: b.mutation({
      query: ({ id, contactId }) => C.outbound(`${cp(id)}/contacts/${contactId}/retry`, { method: 'POST', body: {} }),
      invalidatesTags: ['CampaignContact', 'Campaign'],
    }),
    removeCampaignContact: b.mutation({
      query: ({ id, contactId }) => C.outbound(`${cp(id)}/contacts/${contactId}`, { method: 'DELETE' }),
      invalidatesTags: ['CampaignContact', 'Campaign'],
    }),
    validateCampaignContacts: b.mutation({ query: (id) => C.outbound(`${cp(id)}/contacts/validate`, { method: 'POST', body: {} }) }),
    getCampaignSettings: b.query({ query: (id) => C.outbound(`${cp(id)}/settings`), providesTags: CAMP }),
    putCampaignSettings: b.mutation({ query: ({ id, body }) => C.outbound(`${cp(id)}/settings`, { method: 'PUT', body }), invalidatesTags: ['Campaign'] }),
    getCampaignEstimate: b.query({ query: (id) => C.outbound(`${cp(id)}/estimate`), providesTags: CAMP }),
    getCampaignSummary: b.query({ query: (id) => C.analytics(`${cp(id)}/analytics/summary`), providesTags: CAMP }),
    getCampaignFunnel: b.query({ query: (id) => C.analytics(`${cp(id)}/analytics/funnel`), providesTags: CAMP }),
    getCampaignOutcomes: b.query({ query: (id) => C.analytics(`${cp(id)}/analytics/outcomes`), providesTags: CAMP }),
    getCampaignTimeseries: b.query({ query: (id) => C.analytics(`${cp(id)}/analytics/timeseries`), providesTags: CAMP }),
    getCampaignVariants: b.query({ query: (id) => C.analytics(`${cp(id)}/analytics/variants`), providesTags: CAMP }),
    putCampaignVariants: b.mutation({
      query: ({ id, variants }) => C.outbound(`${cp(id)}/variants`, { method: 'PUT', body: { variants } }),
      invalidatesTags: ['Campaign'],
    }),

    // Contacts (CON-01, CON-02) ---------------------------------------------
    listContacts: b.query({ query: (params = {}) => C.outbound('/customer/contacts', { params }), providesTags: ['Contact'] }),
    getContact: b.query({ query: (id) => C.outbound(`/customer/contacts/${id}`), providesTags: (_r, _e, id) => [{ type: 'Contact', id }] }),
    createContact: b.mutation({ query: (body) => C.outbound('/customer/contacts', { method: 'POST', body }), invalidatesTags: ['Contact', 'ContactList'] }),
    updateContact: b.mutation({ query: ({ id, ...body }) => C.outbound(`/customer/contacts/${id}`, { method: 'PATCH', body }), invalidatesTags: ['Contact'] }),
    deleteContact: b.mutation({ query: (id) => C.outbound(`/customer/contacts/${id}`, { method: 'DELETE' }), invalidatesTags: ['Contact', 'ContactList'] }),
    getContactTimeline: b.query({
      query: (id) => C.outbound(`/customer/contacts/${id}/timeline`),
      providesTags: (_r, _e, id) => [{ type: 'Contact', id }, 'Scheduled'],
    }),
    listContactLists: b.query({ query: () => C.outbound('/customer/contact-lists'), providesTags: ['ContactList'] }),
    createContactList: b.mutation({
      query: ({ name, contact_ids = [] }) => C.outbound('/customer/contact-lists', { method: 'POST', body: { name, contact_ids } }),
      invalidatesTags: ['ContactList', 'Contact'],
    }),
    listContactFields: b.query({ query: () => C.outbound('/customer/contact-fields'), providesTags: ['ContactField'] }),
    putContactFields: b.mutation({ query: (body) => C.outbound('/customer/contact-fields', { method: 'PUT', body }), invalidatesTags: ['ContactField'] }),

    // Do-not-call (CALL-04), calling rules (CMP-03) -------------------------
    listDnd: b.query({ query: (params = {}) => C.outbound('/customer/dnd-numbers', { params }), providesTags: ['Dnd'] }),
    addDnd: b.mutation({ query: (body) => C.outbound('/customer/dnd-numbers', { method: 'POST', body }), invalidatesTags: ['Dnd'] }),
    removeDnd: b.mutation({ query: (id) => C.outbound(`/customer/dnd-numbers/${id}`, { method: 'DELETE' }), invalidatesTags: ['Dnd'] }),
    getCallingRules: b.query({ query: () => C.outbound('/customer/calling-rules'), providesTags: ['CallingRules'] }),
    putCallingRules: b.mutation({ query: (body) => C.outbound('/customer/calling-rules', { method: 'PUT', body }), invalidatesTags: ['CallingRules'] }),

    // Scheduled calls (CON-03) & triggers (CALL-10) -------------------------
    listScheduledCalls: b.query({ query: () => C.outbound('/customer/scheduled-calls'), providesTags: ['Scheduled'] }),
    createScheduledCall: b.mutation({ query: (body) => C.outbound('/customer/scheduled-calls', { method: 'POST', body }), invalidatesTags: ['Scheduled'] }),
    deleteScheduledCall: b.mutation({ query: (id) => C.outbound(`/customer/scheduled-calls/${id}`, { method: 'DELETE' }), invalidatesTags: ['Scheduled'] }),
    listTriggers: b.query({ query: () => C.outbound('/customer/call-triggers'), providesTags: ['Trigger'] }),
    createTrigger: b.mutation({ query: (body) => C.outbound('/customer/call-triggers', { method: 'POST', body }), invalidatesTags: ['Trigger'] }),
    updateTrigger: b.mutation({
      query: ({ id, ...body }) => C.outbound(`/customer/call-triggers/${id}`, { method: 'PATCH', body }),
      invalidatesTags: ['Trigger'],
    }),
    listTriggerRuns: b.query({ query: (id) => C.outbound(`/customer/call-triggers/${id}/runs`), providesTags: ['Trigger'] }),
    fireTrigger: b.mutation({
      query: ({ key, payload }) => P.outbound(`/hooks/triggers/${key}`, { method: 'POST', body: payload }),
      invalidatesTags: ['Trigger'],
    }),
  }),
});

export const {
  useListNumbersQuery,
  useAssignNumberAgentMutation,
  useUnassignNumberAgentMutation,
  useGetRoutingQuery,
  usePutRoutingMutation,
  useSimulateRoutingMutation,
  useListHolidaysQuery,
  usePutHolidaysMutation,
  useSearchAvailableNumbersQuery,
  usePurchaseNumberMutation,
  useListConnectionsQuery,
  useAddConnectionMutation,
  useStartCallMutation,
  useGetCallStatusQuery,
  useHangupCallMutation,
  useListCallsQuery,
  useGetCallQuery,
  useGetTranscriptQuery,
  useGetRecordingQuery,
  useListLiveCallsQuery,
  useUpdateCallMutation,
  useRerunAnalysisMutation,
  useListReviewsQuery,
  useAddReviewMutation,
  usePushCallToCrmMutation,
  useListenToCallMutation,
  useTakeOverCallMutation,
  useListScorecardsQuery,
  usePutScorecardsMutation,
  useListCampaignsQuery,
  useGetCampaignQuery,
  useCreateCampaignMutation,
  useUpdateCampaignMutation,
  useUploadCampaignContactsMutation,
  useCampaignActionMutation,
  useLazyGetCampaignResultsQuery,
  useListCampaignContactsQuery,
  useListContactAttemptsQuery,
  useRetryCampaignContactMutation,
  useRemoveCampaignContactMutation,
  useValidateCampaignContactsMutation,
  useGetCampaignSettingsQuery,
  usePutCampaignSettingsMutation,
  useLazyGetCampaignEstimateQuery,
  useGetCampaignSummaryQuery,
  useGetCampaignFunnelQuery,
  useGetCampaignOutcomesQuery,
  useGetCampaignTimeseriesQuery,
  useGetCampaignVariantsQuery,
  usePutCampaignVariantsMutation,
  useListContactsQuery,
  useGetContactQuery,
  useCreateContactMutation,
  useUpdateContactMutation,
  useDeleteContactMutation,
  useGetContactTimelineQuery,
  useListContactListsQuery,
  useCreateContactListMutation,
  useListContactFieldsQuery,
  usePutContactFieldsMutation,
  useListDndQuery,
  useAddDndMutation,
  useRemoveDndMutation,
  useGetCallingRulesQuery,
  usePutCallingRulesMutation,
  useListScheduledCallsQuery,
  useCreateScheduledCallMutation,
  useDeleteScheduledCallMutation,
  useListTriggersQuery,
  useCreateTriggerMutation,
  useUpdateTriggerMutation,
  useListTriggerRunsQuery,
  useFireTriggerMutation,
} = callsApi;
