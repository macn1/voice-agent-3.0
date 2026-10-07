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
      query: ({ report, ...params }) => C.analytics(`/customer/analytics/${report}`, { params }),
      providesTags: ['Analytics'],
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
