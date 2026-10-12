import { baseApi } from './baseApi';
import { C } from './services';

// voice-analytics-be (proposed): dashboards (ANA-F1..F7), agent insights
// (ANA-F2), unanswered questions (KNW-02.4), exports & scheduled reports
// (EXT-03), activity log (CMP-04.1).

export const analyticsApi = baseApi.injectEndpoints({
  endpoints: (b) => ({
    /**
     * One endpoint for every analytics report:
     * report = summary | timeseries | agents | outcomes | funnel | extracted-fields
     *        | usage | cost | quality | sentiment | topics | heatmap | campaigns | phone-numbers
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
        if (arg?.report === 'summary' && res.summary) {
          const s = res.summary;
          const prev = s.previous_period;
          return {
            ...res,
            calls: s.total_calls ?? 0,
            minutes: s.total_minutes ?? 0,
            success_rate: s.success_rate ?? 0,
            avg_duration: s.avg_duration_seconds ?? 0,
            top_outcomes: s.top_outcomes ?? [],
            prev: prev
              ? {
                  calls: prev.total_calls ?? 0,
                  minutes: prev.total_minutes ?? 0,
                  success_rate: prev.success_rate ?? 0,
                  avg_duration: prev.avg_duration_seconds ?? 0,
                }
              : undefined,
          };
        }
        if (arg?.report === 'timeseries' && Array.isArray(res.points)) {
          return res.points.map((pt) => ({
            ...pt,
            day: (pt.bucket ?? '').slice(0, 10),
            successful: pt.successful_calls ?? 0,
            calls: pt.calls ?? 0,
            minutes: pt.minutes ?? 0,
          }));
        }
        return res;
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
    getAgentDropoff: b.query({ query: (id) => C.analytics(`/customer/analytics/agents/${id}/dropoff`), providesTags: ['Analytics'] }),
    getAgentLatency: b.query({ query: (id) => C.analytics(`/customer/analytics/agents/${id}/latency`), providesTags: ['Analytics'] }),
    listUnansweredQuestions: b.query({ query: () => C.analytics('/customer/analytics/unanswered-questions'), providesTags: ['Knowledge'] }),

    listSavedViews: b.query({ query: () => C.analytics('/customer/analytics/saved-views'), providesTags: ['SavedView'] }),
    saveView: b.mutation({ query: (body) => C.analytics('/customer/analytics/saved-views', { method: 'POST', body }), invalidatesTags: ['SavedView'] }),
    exportAnalytics: b.mutation({
      query: (filters) => C.analytics('/customer/analytics/export', { method: 'POST', body: { filters } }),
      invalidatesTags: ['Export'],
    }),

    listExports: b.query({ query: () => C.analytics('/customer/exports'), providesTags: ['Export'] }),
    createExport: b.mutation({
      query: ({ kind, filters = {} }) => C.analytics('/customer/exports', { method: 'POST', body: { kind, filters } }),
      invalidatesTags: ['Export'],
    }),
    listScheduledReports: b.query({ query: () => C.analytics('/customer/scheduled-reports'), providesTags: ['Report'] }),
    putScheduledReports: b.mutation({ query: (body) => C.analytics('/customer/scheduled-reports', { method: 'PUT', body }), invalidatesTags: ['Report'] }),

    listAuditLog: b.query({ query: (params) => C.analytics('/customer/audit-log', { params }), providesTags: ['Audit'] }),
  }),
});

export const {
  useGetAnalyticsQuery,
  useListDemoScenariosQuery,
  useSimulateDemoCallMutation,
  useGenerateDemoHistoryMutation,
  useResetDemoCallsMutation,
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
