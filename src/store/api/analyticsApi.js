import { baseApi } from './baseApi';
import { C } from './services';

// voice-analytics-be (proposed): dashboards (ANA-F1..F7), agent insights
// (ANA-F2), unanswered questions (KNW-02.4), exports & scheduled reports
// (EXT-03), activity log (CMP-04.1).

// There is no "list exports" route, so exports started from this browser are remembered
// (id only) and each one is read back by id, until it expires.
const EXPORTS_KEY = 'aurlynn.exports';
const knownExports = () => {
  try {
    return JSON.parse(localStorage.getItem(EXPORTS_KEY) ?? '[]');
  } catch {
    return [];
  }
};
const rememberExport = (id) => {
  try {
    localStorage.setItem(EXPORTS_KEY, JSON.stringify([id, ...knownExports().filter((x) => x !== id)].slice(0, 20)));
  } catch {
    /* storage blocked: the export is still downloadable from the toast */
  }
};
const forgetExport = (id) => {
  try {
    localStorage.setItem(EXPORTS_KEY, JSON.stringify(knownExports().filter((x) => x !== id)));
  } catch {
    /* ignore */
  }
};

export const analyticsApi = baseApi.injectEndpoints({
  endpoints: (b) => ({
    /**
     * One endpoint for every analytics report (all served by voice-analytics-be):
     * report = summary | timeseries | agents | outcomes | funnel | usage | cost | quality
     *        | sentiment | heatmap | campaigns | phone-numbers
     * Not served yet: topics, extracted-fields, per-agent drop-off and latency.
     */
    getAnalytics: b.query({
      query: ({ report, range, ...params }) => {
        const p = { ...params };
        if (range && !p.from) {
          const m = String(range).match(/^(\d+)d$/);
          const days = m ? Number(m[1]) : 7;
          p.from = new Date(Date.now() - days * 86400000).toISOString();
        }
        if (report === 'timeseries' && !p.interval) {
          p.interval = 'day';
        }
        return C.analytics(`/customer/analytics/${report}`, { params: p });
      },
      transformResponse: (res, _meta, arg) => {
        if (!res) return res;
        const day = (pt) => (pt.bucket ?? '').slice(0, 10);
        switch (arg?.report) {
          case 'summary': {
            const s = res.summary ?? {};
            const prev = s.previous_period;
            return {
              ...res,
              calls: s.total_calls ?? 0,
              minutes: s.total_minutes ?? 0,
              success_rate: s.success_rate ?? 0,
              avg_duration: s.avg_duration_seconds ?? 0,
              top_outcomes: s.top_outcomes ?? [],
              prev: prev
                ? { calls: prev.total_calls ?? 0, minutes: prev.total_minutes ?? 0, success_rate: prev.success_rate ?? 0, avg_duration: prev.avg_duration_seconds ?? 0 }
                : undefined,
            };
          }
          case 'timeseries':
            return (res.points ?? []).map((pt) => ({ ...pt, day: day(pt), successful: pt.successful_calls ?? 0, calls: pt.calls ?? 0, minutes: pt.minutes ?? 0 }));
          case 'agents':
            return (res.items ?? []).map((r) => ({ ...r, avg_duration: r.avg_duration_seconds ?? 0 }));
          case 'outcomes':
            return (res.items ?? []).map((r) => ({ ...r, count: r.calls, is_success: r.successful > 0 && r.successful === r.calls }));
          case 'funnel':
            return (res.stages ?? []).map((r) => ({ ...r, stage: r.label, count: r.calls }));
          case 'usage':
            return { ...res, by_day: (res.points ?? []).map((pt) => ({ ...pt, day: day(pt) })) };
          case 'cost':
            return { ...res, total: res.total_cost ?? 0, per_call: res.cost_per_call ?? 0, per_minute: res.cost_per_minute ?? 0 };
          case 'sentiment':
            return { ...res, rows: (res.points ?? []).map((pt) => ({ ...pt, day: day(pt) })) };
          case 'heatmap':
            // weekday: 0 = Sunday ... 6 = Saturday on the wire; the grid starts on Monday.
            return (res.cells ?? []).map((c) => ({ ...c, weekday: (c.weekday + 6) % 7, connect_rate: c.calls ? c.answered / c.calls : 0 }));
          case 'phone-numbers':
            // Rows: { number, inbound_calls, outbound_calls, answered_calls, minutes }.
            return (res.items ?? []).map((r) => {
              const calls = (r.inbound_calls ?? 0) + (r.outbound_calls ?? 0);
              return { ...r, name: r.number ?? '—', calls, connect_rate: calls ? (r.answered_calls ?? 0) / calls : 0 };
            });
          case 'campaigns':
            return (res.items ?? []).map((r) => ({ ...r, name: r.name ?? r.campaign_name ?? r.e164 ?? r.phone_number ?? r.campaign_id ?? r.phone_number_id ?? '—', connect_rate: r.connect_rate ?? (r.calls ? (r.answered_calls ?? 0) / r.calls : 0) }));
          default:
            return res;
        }
      },
      providesTags: ['Analytics'],
    }),

    // Demo call simulator endpoints (DEMO_MODE only) --------------------
    listDemoScenarios: b.query({
      query: () => C.analytics('/customer/demo/scenarios'),
    }),
    simulateDemoCall: b.mutation({
      query: (body) => C.analytics('/customer/demo/calls', { method: 'POST', body }),
      invalidatesTags: ['Call', 'Analytics', 'Usage'],
    }),
    generateDemoHistory: b.mutation({
      query: (body) => C.analytics('/customer/demo/history', { method: 'POST', body }),
      invalidatesTags: ['Call', 'Analytics', 'Usage'],
    }),
    resetDemoCalls: b.mutation({
      query: () => C.analytics('/customer/demo/calls', { method: 'DELETE' }),
      invalidatesTags: ['Call', 'Analytics', 'Usage'],
    }),
    // Last 30 days. Drop-off: [{ step, reached, dropped }] by how many times the caller spoke.
    getAgentDropoff: b.query({
      query: (id) => C.analytics(`/customer/analytics/agents/${id}/dropoff`, { params: { from: new Date(Date.now() - 30 * 86400000).toISOString() } }),
      transformResponse: (d) => d?.items ?? d ?? [],
      providesTags: ['Analytics'],
    }),
    // Last 30 days, per day: [{ day, p50, p95, replies }] in ms.
    getAgentLatency: b.query({
      query: (id) => C.analytics(`/customer/analytics/agents/${id}/latency`, { params: { from: new Date(Date.now() - 30 * 86400000).toISOString() } }),
      transformResponse: (d) => d?.items ?? d ?? [],
      providesTags: ['Analytics'],
    }),
    // { items: [{ question, times_asked, last_asked_at, last_call_id }] }
    listUnansweredQuestions: b.query({
      query: () => C.analytics('/customer/analytics/unanswered-questions', { params: { from: new Date(Date.now() - 90 * 86400000).toISOString() } }),
      transformResponse: (d) =>
        (d?.items ?? d ?? []).map((q) => ({
          ...q,
          id: q.id ?? q.question,
          occurrences: q.times_asked ?? q.occurrences ?? 1,
          last_seen_at: q.last_asked_at ?? q.last_seen_at,
          example_call_id: q.last_call_id ?? q.example_call_id,
        })),
      providesTags: ['Knowledge'],
    }),

    listSavedViews: b.query({ query: () => C.analytics('/customer/analytics/saved-views'), providesTags: ['SavedView'] }),
    saveView: b.mutation({ query: (body) => C.analytics('/customer/analytics/saved-views', { method: 'POST', body }), invalidatesTags: ['SavedView'] }),
    // The page's daily figures as CSV (type daily_summary). Ready at once; download within 24 hours.
    exportAnalytics: b.mutation({
      query: () => C.analytics('/customer/analytics/export', { method: 'POST', body: {} }),
      transformResponse: (d) => {
        if (d?.id) rememberExport(d.id);
        return d;
      },
      invalidatesTags: ['Export'],
    }),

    // Exports started from this browser, newest first, with their current status.
    listExports: b.query({
      async queryFn(_arg, _api, _extra, baseQuery) {
        const rows = await Promise.all(
          knownExports().map(async (id) => {
            const r = await baseQuery(C.analytics(`/customer/exports/${id}`));
            if (r.error?.status === 404) forgetExport(id);
            return r.data ? { ...r.data, kind: r.data.type } : null;
          }),
        );
        return { data: rows.filter(Boolean) };
      },
      providesTags: ['Export'],
    }),
    // kind: calls | daily_summary. filters: from, to, timezone, agent_id, direction, outcome (default last 30 days).
    createExport: b.mutation({
      query: ({ kind, filters = {} }) => C.analytics('/customer/exports', { method: 'POST', body: { type: kind, format: 'csv', ...filters } }),
      transformResponse: (d) => {
        if (d?.id) rememberExport(d.id);
        return d;
      },
      invalidatesTags: ['Export'],
    }),
    // [{ id, name, type, frequency daily|weekly|monthly, weekday, hour, timezone, recipients, enabled, next_run_at, delivery }].
    // delivery is email_not_connected until an email provider is added.
    listScheduledReports: b.query({ query: () => C.analytics('/customer/scheduled-reports'), providesTags: ['Report'] }),
    // Replaces the whole list.
    putScheduledReports: b.mutation({
      query: (reports) =>
        C.analytics('/customer/scheduled-reports', {
          method: 'PUT',
          body: { reports: (Array.isArray(reports) ? reports : (reports?.reports ?? [])).map(({ id: _id, next_run_at: _n, delivery: _d, ...r }) => r) },
        }),
      invalidatesTags: ['Report'],
    }),
    deleteSavedView: b.mutation({ query: (id) => C.analytics(`/customer/analytics/saved-views/${id}`, { method: 'DELETE' }), invalidatesTags: ['SavedView'] }),

    listAuditLog: b.query({ query: (params) => C.analytics('/customer/audit-log', { params }), providesTags: ['Audit'] }),
  }),
});

export const {
  useGetAnalyticsQuery,
  useListDemoScenariosQuery,
  useSimulateDemoCallMutation,
  useGenerateDemoHistoryMutation,
  useResetDemoCallsMutation,
  useDeleteSavedViewMutation,
  useGetAgentDropoffQuery,
  useGetAgentLatencyQuery,
  useListUnansweredQuestionsQuery,
  useListSavedViewsQuery,
  useSaveViewMutation,
  useExportAnalyticsMutation,
  useListExportsQuery,
  useCreateExportMutation,
  useListScheduledReportsQuery,
  usePutScheduledReportsMutation,
  useListAuditLogQuery,
} = analyticsApi;
