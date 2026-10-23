import { baseApi } from './baseApi';
import { C } from './services';

// voice-orchestrator-be: typed test conversations with the PUBLISHED agent and
// the live-sessions monitor (text and voice).

export const orchestratorApi = baseApi.injectEndpoints({
  endpoints: (b) => ({
    // Returns { session, greeting }. 409 agent_not_published / agent_paused, 402 / 429 plan checks.
    startTextSession: b.mutation({
      query: (body) => C.orchestrator('/customer/text-sessions', { method: 'POST', body }),
      invalidatesTags: ['TextSession', 'Entitlements'],
    }),
    // Returns { caller, agent, reply, session }.
    sendTextMessage: b.mutation({
      query: ({ id, text }) => C.orchestrator(`/customer/text-sessions/${id}/messages`, { method: 'POST', body: { text } }),
    }),
    // Returns the session with outcome and delivered_at; the call log has it as call_id.
    endTextSession: b.mutation({
      query: (id) => C.orchestrator(`/customer/text-sessions/${id}/end`, { method: 'POST', body: {} }),
      invalidatesTags: ['TextSession', 'Call'],
    }),
    getTextSession: b.query({ query: (id) => C.orchestrator(`/customer/text-sessions/${id}`), providesTags: ['TextSession'] }),
    // mode: text | voice | undefined (both)
    listLiveSessions: b.query({
      query: (mode) => C.orchestrator('/customer/live-sessions', { params: { mode } }),
      providesTags: ['TextSession'],
    }),
    getLiveSession: b.query({ query: (id) => C.orchestrator(`/customer/live-sessions/${id}`) }),
  }),
});

export const {
  useStartTextSessionMutation,
  useSendTextMessageMutation,
  useEndTextSessionMutation,
  useGetTextSessionQuery,
  useListLiveSessionsQuery,
  useGetLiveSessionQuery,
} = orchestratorApi;
