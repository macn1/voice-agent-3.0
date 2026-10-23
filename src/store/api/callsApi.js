import { baseApi } from './baseApi';
import { C, P } from './services';

// voice-telephony-be + voice-inbound-be (NUM-01/02, EXT-01), voice-outbound-be
// (CALL-02/03/04/07/08/10/11, CON-01/03, CMP-03) and call records in
// voice-analytics-be (CALL-05/06, PCA-01..03, QTY-03). All proposed.

const cp = (id) => `/customer/campaigns/${id}`;

// Call triggers. Wire: field_mapping { phone: 'lead.mobile', name: 'lead.name', variables: { product: 'lead.product' } }
// (call field -> path in the incoming JSON), source webhook | crm. The page edits { 'lead.mobile': 'phone', ... }
// (incoming path -> call field) and calls the CRM source "crm_event".
const triggerFrom = (t) => {
  const fm = t?.field_mapping ?? {};
  const ui = {};
  if (fm.phone) ui[fm.phone] = 'phone';
  if (fm.name) ui[fm.name] = 'name';
  Object.entries(fm.variables ?? {}).forEach(([v, path]) => (ui[path] = v));
  return { ...t, source: t?.source === 'crm' ? 'crm_event' : t?.source, field_mapping: ui, trigger_key: String(t?.hook_url ?? '').split('/').pop() };
};
const triggerTo = ({ field_mapping, source, id: _id, trigger_key: _k, hook_url: _h, agent_name: _a, last_run_at: _l, created_at: _c, updated_at: _u, ...rest }) => {
  const body = { ...rest, ...(source ? { source: source === 'crm_event' ? 'crm' : source } : {}) };
  if (field_mapping) {
    const fm = { variables: {} };
    Object.entries(field_mapping).forEach(([path, target]) => {
      if (!path || !target) return;
      if (target === 'phone' || target === 'name') fm[target] = path;
      else fm.variables[target] = path;
    });
    body.field_mapping = fm;
  }
  return body;
};

const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
// Routing on the wire: business_hours { mon: [{start,end}] } (empty object = always open),
// after_hours_action agent | message | voicemail | forward. The page edits
// { always_open, business_hours { mon: { open, ranges: [{from,to}] } } } and "other_agent".
const routingFrom = (d) => {
  const bh = d?.business_hours ?? {};
  return {
    ...d,
    always_open: Object.keys(bh).length === 0,
    business_hours: Object.fromEntries(WEEK.map((day) => [day, { open: (bh[day] ?? []).length > 0, ranges: (bh[day] ?? []).map((w) => ({ from: w.start, to: w.end })) }])),
    after_hours_action: d?.after_hours_action === 'agent' && d?.after_hours_agent_id ? 'other_agent' : (d?.after_hours_action ?? 'agent'),
  };
};
const routingTo = (r) => ({
  timezone: r.timezone,
  business_hours: r.always_open
    ? {}
    : Object.fromEntries(WEEK.map((day) => [day, r.business_hours[day]?.open ? r.business_hours[day].ranges.map((x) => ({ start: x.from, end: x.to })) : []])),
  after_hours_action: r.after_hours_action === 'other_agent' ? 'agent' : r.after_hours_action,
  after_hours_agent_id: r.after_hours_action === 'other_agent' ? (r.after_hours_agent_id || null) : null,
  after_hours_message: ['message', 'voicemail'].includes(r.after_hours_action) ? (r.after_hours_message || null) : null,
  fallback_number: r.fallback_number || null,
});


/**
 * What the wizard collected -> the body of Upload / Validate Numbers:
 * { contacts: [{ phone, name, variables }] } | { contact_list_id } | { contact_ids }.
 * `rows` are CSV rows (objects keyed by header); every column except the phone
 * and name columns becomes a variable on the number.
 */
export function numbersBody({ rows = [], phone_column, name_column, contact_list_id, contact_ids }) {
  if (contact_list_id) return { contact_list_id };
  if (contact_ids?.length) return { contact_ids };
  return {
    contacts: rows
      .map((r) => {
        const { [phone_column]: phone, [name_column]: name, ...rest } = r;
        const variables = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== '' && v != null));
        return { phone: String(phone ?? '').trim(), ...(name ? { name } : {}), ...(Object.keys(variables).length ? { variables } : {}) };
      })
      .filter((c) => c.phone),
  };
}
const CAMP = (_r, _e, arg) => [{ type: 'Campaign', id: typeof arg === 'string' ? arg : arg.id }];

export const callsApi = baseApi.injectEndpoints({
  endpoints: (b) => ({
    // Phone numbers & routing ------------------------------------------------
    // inbound knows which agent answers; telephony knows when the number was allocated.
    listNumbers: b.query({
      async queryFn(_arg, _api, _extra, baseQuery) {
        const [inb, tel] = await Promise.all([baseQuery(C.inbound('/customer/phone-numbers')), baseQuery(C.telephony('/customer/phone-numbers'))]);
        if (inb.error) return inb;
        const since = new Map((tel.data ?? []).map((n) => [n.id, n]));
        return {
          data: (inb.data ?? []).map((n) => ({
            ...since.get(n.id),
            ...n,
            agent_id: n.agent?.id ?? null,
            agent_name: n.agent?.name,
            agent_published: n.agent ? n.agent.status !== 'draft' : undefined,
          })),
        };
      },
      providesTags: ['Number'],
    }),
    getNumber: b.query({ query: (id) => C.telephony(`/customer/phone-numbers/${id}`), providesTags: (_r, _e, id) => [{ type: 'Number', id }] }),
    assignNumberAgent: b.mutation({
      query: ({ id, agent_id }) => C.inbound(`/customer/phone-numbers/${id}/agent`, { method: 'PUT', body: { agent_id } }),
      invalidatesTags: ['Number', 'Agent'],
    }),
    unassignNumberAgent: b.mutation({
      query: (id) => C.inbound(`/customer/phone-numbers/${id}/agent`, { method: 'DELETE' }),
      invalidatesTags: ['Number', 'Agent'],
    }),
    getRouting: b.query({
      query: (id) => C.inbound(`/customer/phone-numbers/${id}/routing`),
      transformResponse: routingFrom,
      providesTags: (_r, _e, id) => [{ type: 'Routing', id }],
    }),
    putRouting: b.mutation({
      query: ({ id, body }) => C.inbound(`/customer/phone-numbers/${id}/routing`, { method: 'PUT', body: routingTo(body) }),
      invalidatesTags: (_r, _e, { id }) => [{ type: 'Routing', id }],
    }),
    // Who would answer at `at` (default now): { local_time, in_business_hours, holiday, action, agent, forward_to, message, reason }.
    simulateRouting: b.mutation({
      query: ({ id, at }) => C.inbound(`/customer/phone-numbers/${id}/routing/simulate`, { method: 'POST', body: at ? { at } : {} }),
      transformResponse: (d) => ({
        ...d,
        outcome: { agent: 'An agent answers', message: 'A message plays', voicemail: 'Voicemail takes the call', forward: 'The call is forwarded' }[d?.action] ?? d?.action,
        agent_name: d?.agent?.name,
        detail: [d?.reason, d?.holiday && `holiday: ${d.holiday.name ?? d.holiday}`, d?.forward_to && `to ${d.forward_to}`, d?.message && `“${d.message}”`].filter(Boolean).join(' · '),
      }),
    }),
    listHolidays: b.query({ query: () => C.inbound('/customer/routing/holidays'), transformResponse: (d) => d?.holidays ?? d ?? [], providesTags: ['Holiday'] }),
    putHolidays: b.mutation({
      query: (list) => C.inbound('/customer/routing/holidays', { method: 'PUT', body: { holidays: Array.isArray(list) ? list : (list?.holidays ?? []) } }),
      invalidatesTags: ['Holiday'],
    }),
    // type: local | mobile | toll_free; area_code for local numbers. Returns { items[{ e164, type, locality, monthly_price, currency, capabilities }], localities }.
    searchAvailableNumbers: b.query({
      query: ({ type, area_code, contains }) => C.telephony('/customer/phone-numbers/available', { params: { type, area_code, contains, limit: 20 } }),
    }),
    purchaseNumber: b.mutation({
      query: (e164) => C.telephony('/customer/phone-numbers/purchase', { method: 'POST', body: { e164 } }),
      invalidatesTags: ['Number'],
    }),
    listConnections: b.query({ query: () => C.telephony('/customer/telephony/connections'), providesTags: ['Connection'] }),
    addConnection: b.mutation({ query: (body) => C.telephony('/customer/telephony/connections', { method: 'POST', body }), invalidatesTags: ['Connection'] }),
    testConnection: b.mutation({
      query: (id) => C.telephony(`/customer/telephony/connections/${id}/test`, { method: 'POST', body: {} }),
      invalidatesTags: ['Connection'],
    }),
    deleteConnection: b.mutation({
      query: (id) => C.telephony(`/customer/telephony/connections/${id}`, { method: 'DELETE' }),
      invalidatesTags: ['Connection', 'Number'],
    }),

    // Single calls (CALL-02) -------------------------------------------------
    startCall: b.mutation({
      query: (body) => C.outbound('/calls', { method: 'POST', body: { ...body, to_number: body.to_number || body.to } }),
      invalidatesTags: ['Call'],
    }),
    getCallStatus: b.query({ query: (id) => C.outbound(`/calls/${id}`), providesTags: (_r, _e, id) => [{ type: 'Call', id }] }),
    hangupCall: b.mutation({ query: (id) => C.outbound(`/calls/${id}/hangup`, { method: 'POST', body: {} }), invalidatesTags: ['Call'] }),

    // Call records (CALL-05, CALL-06, PCA, QTY-03) ---------------------------
    listCalls: b.query({
      query: ({ range, phone, ...params } = {}) => {
        const p = { ...params };
        if (phone && !p.q) p.q = phone;
        if (range && !p.from) {
          const m = String(range).match(/^(\d+)d$/);
          const days = m ? Number(m[1]) : 7;
          p.from = new Date(Date.now() - days * 86400000).toISOString();
        }
        return C.analytics('/customer/calls', { params: p });
      },
      providesTags: ['Call'],
    }),
    getCall: b.query({ query: (id) => C.analytics(`/customer/calls/${id}`), providesTags: (_r, _e, id) => [{ type: 'Call', id }] }),
    getTranscript: b.query({
      query: (id) => C.analytics(`/customer/calls/${id}/transcript`),
      transformResponse: (res) => res?.turns ?? res ?? [],
    }),
    getCallAnalysis: b.query({ query: (id) => C.analytics(`/customer/calls/${id}/analysis`) }),
    getRecording: b.query({ query: (id) => C.analytics(`/customer/calls/${id}/recording`) }),
    listLiveCalls: b.query({ query: () => C.outbound('/customer/calls/live'), providesTags: ['Call'] }),
    updateCall: b.mutation({ query: ({ id, ...body }) => C.analytics(`/customer/calls/${id}`, { method: 'PATCH', body }), invalidatesTags: ['Call'] }),
    rerunAnalysis: b.mutation({ query: (id) => C.analytics(`/customer/calls/${id}/analysis/rerun`, { method: 'POST', body: {} }), invalidatesTags: ['Call'] }),
    listReviews: b.query({ query: (id) => C.analytics(`/customer/calls/${id}/reviews`), providesTags: ['Review'] }),
    addReview: b.mutation({ query: ({ id, ...body }) => C.analytics(`/customer/calls/${id}/reviews`, { method: 'POST', body }), invalidatesTags: ['Review'] }),
    pushCallToCrm: b.mutation({ query: (id) => C.integration(`/customer/calls/${id}/push-to-crm`, { method: 'POST', body: {} }), invalidatesTags: ['Call'] }),
    // Listen-in and take-over answer 503 live_audio_unavailable until the media server is connected.
    listenToCall: b.mutation({ query: (id) => C.outbound(`/customer/calls/${id}/listen`, { method: 'POST', body: {} }) }),
    takeOverCall: b.mutation({ query: (id) => C.outbound(`/customer/calls/${id}/takeover`, { method: 'POST', body: {} }) }),
    listScorecards: b.query({ query: () => C.analytics('/customer/qa-scorecards'), providesTags: ['Scorecard'] }),
    putScorecards: b.mutation({ query: (body) => C.analytics('/customer/qa-scorecards', { method: 'PUT', body }), invalidatesTags: ['Scorecard'] }),

    // Campaigns (CALL-03, 07, 08, 09, 11) ------------------------------------
    listCampaigns: b.query({ query: (params = {}) => C.outbound('/customer/campaigns', { params }), providesTags: ['Campaign'] }),
    getCampaign: b.query({ query: (id) => C.outbound(cp(id)), providesTags: CAMP }),
    // body: { name, agent_id, from_number_id?, settings?, contact_list_id?, start_at?, end_at? }
    createCampaign: b.mutation({ query: (body) => C.outbound('/customer/campaigns', { method: 'POST', body }), invalidatesTags: ['Campaign'] }),
    updateCampaign: b.mutation({ query: ({ id, ...body }) => C.outbound(cp(id), { method: 'PATCH', body }), invalidatesTags: ['Campaign'] }),
    // Adds numbers (see numbersBody). Do-not-call numbers are added as skipped.
    uploadCampaignContacts: b.mutation({
      query: ({ id, ...input }) => C.outbound(`${cp(id)}/contacts`, { method: 'POST', body: numbersBody(input) }),
      invalidatesTags: ['Campaign', 'CampaignContact'],
    }),
    campaignAction: b.mutation({
      // action: start | pause | resume | cancel | duplicate
      query: ({ id, action }) => C.outbound(`${cp(id)}/${action}`, { method: 'POST', body: {} }),
      invalidatesTags: ['Campaign', 'CampaignContact'],
    }),
    // JSON: { campaign, items, outcomes, total }. The CSV is fetched with downloadAuthed (?format=csv).
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
    // Dry run of the same input: { total_rows, valid, invalid, duplicates_in_file, already_in_campaign, do_not_call, will_add, errors[] }.
    validateCampaignContacts: b.mutation({
      query: ({ id, ...input }) => C.outbound(`${cp(id)}/contacts/validate`, { method: 'POST', body: numbersBody(input) }),
    }),
    getCampaignSettings: b.query({ query: (id) => C.outbound(`${cp(id)}/settings`), providesTags: CAMP }),
    putCampaignSettings: b.mutation({ query: ({ id, body }) => C.outbound(`${cp(id)}/settings`, { method: 'PUT', body }), invalidatesTags: ['Campaign'] }),
    getCampaignEstimate: b.query({ query: (id) => C.outbound(`${cp(id)}/estimate`), providesTags: CAMP }),
    // Served by voice-outbound-be, scoped to the campaign.
    getCampaignSummary: b.query({ query: (id) => C.outbound(`${cp(id)}/analytics/summary`), providesTags: CAMP }),
    getCampaignFunnel: b.query({
      query: (id) => C.outbound(`${cp(id)}/analytics/funnel`),
      transformResponse: (d) => d?.stages ?? d ?? [],
      providesTags: CAMP,
    }),
    getCampaignOutcomes: b.query({
      query: (id) => C.outbound(`${cp(id)}/analytics/outcomes`),
      transformResponse: (d) => d?.outcomes ?? d ?? [],
      providesTags: CAMP,
    }),
    getCampaignTimeseries: b.query({
      query: (id) => C.outbound(`${cp(id)}/analytics/timeseries`, { params: { interval: 'hour', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } }),
      transformResponse: (d) => d?.points ?? d ?? [],
      providesTags: CAMP,
    }),

    // Contacts (CON-01, CON-02) ---------------------------------------------
    listContacts: b.query({ query: (params = {}) => C.outbound('/customer/contacts', { params }), providesTags: ['Contact'] }),
    getContact: b.query({ query: (id) => C.outbound(`/customer/contacts/${id}`), providesTags: (_r, _e, id) => [{ type: 'Contact', id }] }),
    createContact: b.mutation({ query: (body) => C.outbound('/customer/contacts', { method: 'POST', body }), invalidatesTags: ['Contact', 'ContactList'] }),
    // CSV rows + column mapping -> { contacts: [...] } in chunks of 1000. Existing phones are updated.
    // Returns { total_rows, created, updated, invalid, errors[] } summed over the chunks.
    importContacts: b.mutation({
      async queryFn({ rows, mapping, list_id }, _api, _extra, baseQuery) {
        const contacts = rows
          .map((r) => {
            const c = { custom_fields: {} };
            Object.entries(mapping).forEach(([col, target]) => {
              const v = (r[col] ?? '').toString().trim();
              if (!target || !v) return;
              if (target.startsWith('custom.')) c.custom_fields[target.slice(7)] = v;
              else c[target] = v;
            });
            return c;
          })
          .filter((c) => c.phone);
        const total = { total_rows: 0, created: 0, updated: 0, invalid: 0, errors: [] };
        for (let i = 0; i < contacts.length; i += 1000) {
          const res = await baseQuery(C.outbound('/customer/contacts', { method: 'POST', body: { contacts: contacts.slice(i, i + 1000) }, params: { list_id } }));
          if (res.error) return res;
          const d = res.data ?? {};
          total.total_rows += d.total_rows ?? 0;
          total.created += d.created ?? 0;
          total.updated += d.updated ?? 0;
          total.invalid += d.invalid ?? 0;
          total.errors.push(...(d.errors ?? []).map((e) => ({ ...e, row: (e.row ?? 0) + i })));
        }
        return { data: total };
      },
      invalidatesTags: ['Contact', 'ContactList'],
    }),
    updateContact: b.mutation({ query: ({ id, ...body }) => C.outbound(`/customer/contacts/${id}`, { method: 'PATCH', body }), invalidatesTags: ['Contact'] }),
    // { calls_hidden, contact, items[{ type, at, title, status, call_id?, scheduled_call_id? }] }, newest first.
    getContactTimeline: b.query({
      query: (id) => C.outbound(`/customer/contacts/${id}/timeline`),
      transformResponse: (d) =>
        (d?.items ?? []).map((i) => ({
          ...i,
          link: i.call_id ? `/calls/${i.call_id}` : i.campaign_id ? `/campaigns/${i.campaign_id}` : undefined,
          detail: i.detail ?? (i.status ? i.status.replace(/_/g, ' ') : undefined),
        })),
      providesTags: (_r, _e, id) => [{ type: 'Contact', id }, 'Scheduled'],
    }),
    listContactLists: b.query({ query: () => C.outbound('/customer/contact-lists'), providesTags: ['ContactList'] }),
    renameContactList: b.mutation({
      query: ({ id, name }) => C.outbound(`/customer/contact-lists/${id}`, { method: 'PATCH', body: { name } }),
      invalidatesTags: ['ContactList'],
    }),
    addToContactList: b.mutation({
      query: ({ id, contact_ids }) => C.outbound(`/customer/contact-lists/${id}/members`, { method: 'POST', body: { contact_ids } }),
      invalidatesTags: ['ContactList', 'Contact'],
    }),
    createContactList: b.mutation({
      query: ({ name, contact_ids = [] }) => C.outbound('/customer/contact-lists', { method: 'POST', body: { name, contact_ids } }),
      invalidatesTags: ['ContactList', 'Contact'],
    }),
    listContactFields: b.query({ query: () => C.outbound('/customer/contact-fields'), providesTags: ['ContactField'] }),
    // Replaces the definitions: { fields: [{ key, label, type, options? }] }.
    putContactFields: b.mutation({
      query: (fields) => C.outbound('/customer/contact-fields', { method: 'PUT', body: { fields: Array.isArray(fields) ? fields : (fields?.fields ?? []) } }),
      invalidatesTags: ['ContactField'],
    }),

    // Do-not-call (CALL-04), calling rules (CMP-03) -------------------------
    listDnd: b.query({ query: (params = {}) => C.outbound('/customer/dnd-numbers', { params }), providesTags: ['Dnd'] }),
    // body: { phone } | { phones: [...] } (up to 10,000), reason?. Returns { added[], already_listed, invalid[] }.
    addDnd: b.mutation({ query: (body) => C.outbound('/customer/dnd-numbers', { method: 'POST', body }), invalidatesTags: ['Dnd', 'Contact'] }),
    removeDnd: b.mutation({ query: (id) => C.outbound(`/customer/dnd-numbers/${id}`, { method: 'DELETE' }), invalidatesTags: ['Dnd', 'Contact'] }),
    // Finds the do-not-call entry for one number (the contact page toggles it).
    findDnd: b.query({
      query: (phone) => C.outbound('/customer/dnd-numbers', { params: { q: phone, limit: 5 } }),
      transformResponse: (d, _m, phone) => (d?.items ?? []).find((x) => x.phone === phone) ?? null,
      providesTags: ['Dnd'],
    }),
    // Wire: { schedule: { timezone, windows: [{ days, start, end }] }, max_attempts_per_day, max_attempts_per_week }.
    // The page edits the first window as allowed_windows { days, from, to }.
    getCallingRules: b.query({
      query: () => C.outbound('/customer/calling-rules'),
      transformResponse: (d) => {
        const [w = {}, ...more] = d?.schedule?.windows ?? [];
        return {
          ...d,
          timezone: d?.schedule?.timezone ?? 'Asia/Kolkata',
          allowed_windows: { days: w.days ?? [], from: w.start ?? '09:00', to: w.end === '24:00' ? '23:59' : (w.end ?? '21:00') },
          more_windows: more,
        };
      },
      providesTags: ['CallingRules'],
    }),
    putCallingRules: b.mutation({
      query: (r) =>
        C.outbound('/customer/calling-rules', {
          method: 'PUT',
          body: {
            schedule: {
              timezone: r.timezone,
              windows: [{ days: r.allowed_windows.days, start: r.allowed_windows.from, end: r.allowed_windows.to === '23:59' ? '24:00' : r.allowed_windows.to }, ...(r.more_windows ?? [])],
            },
            max_attempts_per_day: r.max_attempts_per_day ?? null,
            max_attempts_per_week: r.max_attempts_per_week ?? null,
          },
        }),
      invalidatesTags: ['CallingRules'],
    }),

    // Scheduled calls (CON-03) & triggers (CALL-10) -------------------------
    // status: scheduled | placing | placed | failed | canceled
    listScheduledCalls: b.query({
      query: (params = {}) => C.outbound('/customer/scheduled-calls', { params: { limit: 100, ...params } }),
      transformResponse: (d) => d?.items ?? d ?? [],
      providesTags: ['Scheduled'],
    }),
    createScheduledCall: b.mutation({ query: (body) => C.outbound('/customer/scheduled-calls', { method: 'POST', body }), invalidatesTags: ['Scheduled'] }),
    deleteScheduledCall: b.mutation({ query: (id) => C.outbound(`/customer/scheduled-calls/${id}`, { method: 'DELETE' }), invalidatesTags: ['Scheduled'] }),
    listTriggers: b.query({ query: () => C.outbound('/customer/call-triggers'), transformResponse: (d) => (d?.items ?? d ?? []).map(triggerFrom), providesTags: ['Trigger'] }),
    createTrigger: b.mutation({
      query: (body) => C.outbound('/customer/call-triggers', { method: 'POST', body: triggerTo(body) }),
      invalidatesTags: ['Trigger'],
    }),
    updateTrigger: b.mutation({
      query: ({ id, ...body }) => C.outbound(`/customer/call-triggers/${id}`, { method: 'PATCH', body: triggerTo(body) }),
      invalidatesTags: ['Trigger'],
    }),
    listTriggerRuns: b.query({
      query: (id) => C.outbound(`/customer/call-triggers/${id}/runs`),
      transformResponse: (d) => d?.items ?? d ?? [],
      providesTags: ['Trigger'],
    }),
    fireTrigger: b.mutation({
      query: ({ key, payload }) => P.outbound(`/hooks/triggers/${key}`, { method: 'POST', body: payload }),
      invalidatesTags: ['Trigger'],
    }),
  }),
});

export const {
  useListNumbersQuery,
  useGetNumberQuery,
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
  useTestConnectionMutation,
  useDeleteConnectionMutation,
  useStartCallMutation,
  useGetCallStatusQuery,
  useHangupCallMutation,
  useListCallsQuery,
  useGetCallQuery,
  useGetTranscriptQuery,
  useGetCallAnalysisQuery,
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
  useListContactsQuery,
  useGetContactQuery,
  useCreateContactMutation,
  useUpdateContactMutation,
  useImportContactsMutation,
  useGetContactTimelineQuery,
  useListContactListsQuery,
  useCreateContactListMutation,
  useRenameContactListMutation,
  useAddToContactListMutation,
  useListContactFieldsQuery,
  usePutContactFieldsMutation,
  useListDndQuery,
  useAddDndMutation,
  useRemoveDndMutation,
  useFindDndQuery,
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
