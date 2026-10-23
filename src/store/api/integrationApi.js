import { baseApi } from './baseApi';
import { C } from './services';

// voice-integration-be (proposed): webhooks (INT-F1), integrations & CRM
// (INT-F2..F9), calendar booking (ACT-02), sent messages (ACT-03.2),
// notifications (QTY-04), WhatsApp/SMS channels, inbox, broadcasts (WA-01..06).

const ip = (p) => `/customer/integrations/${p}`;

// Per-integration settings pages share one GET/PUT pair.
export const INTEGRATION_SETTINGS = {
  sync: 'sync-settings',
  callLogging: 'call-logging',
  lookup: 'lookup-settings',
};

const CALENDARS = ['google_calendar', 'outlook_calendar'];

export const integrationApi = baseApi.injectEndpoints({
  endpoints: (b) => ({
    // Webhooks ---------------------------------------------------------------
    listWebhooks: b.query({ query: () => C.integration('/customer/webhooks'), providesTags: ['Webhook'] }),
    createWebhook: b.mutation({ query: (body) => C.integration('/customer/webhooks', { method: 'POST', body }), invalidatesTags: ['Webhook'] }),
    updateWebhook: b.mutation({
      query: ({ id, ...body }) => C.integration(`/customer/webhooks/${id}`, { method: 'PATCH', body }),
      invalidatesTags: ['Webhook'],
    }),
    deleteWebhook: b.mutation({ query: (id) => C.integration(`/customer/webhooks/${id}`, { method: 'DELETE' }), invalidatesTags: ['Webhook'] }),
    testWebhook: b.mutation({ query: (id) => C.integration(`/customer/webhooks/${id}/test`, { method: 'POST', body: {} }), invalidatesTags: ['Webhook'] }),
    listWebhookEvents: b.query({ query: () => C.integration('/customer/webhooks/events') }),
    listWebhookDeliveries: b.query({ query: (id) => C.integration(`/customer/webhooks/${id}/deliveries`), providesTags: ['Webhook'] }),

    // Integrations -----------------------------------------------------------
    // The catalog: [{ key, name, category crm|automation|calendar, auth_type oauth|api_key, description, capabilities, connected, status }].
    listIntegrations: b.query({ query: () => C.integration('/customer/integrations'), providesTags: ['Integration'] }),
    listIntegrationCatalog: b.query({ query: () => C.integration('/customer/integrations/catalog'), providesTags: ['Integration'] }),
    // { provider, status, health, account_label, connected_at, last_sync_at, last_error, is_simulated, recent_runs }
    getIntegrationStatus: b.query({ query: (p) => C.integration(`${ip(p)}/status`), providesTags: ['Integration'] }),
    // api_key providers: { api_key, account_label }. OAuth providers: { redirect_url } -> authorize_url to open.
    // Returns { authorize_url, connection, webhook_url, webhook_secret } (the secret is shown once).
    connectIntegration: b.mutation({
      query: ({ provider, ...body }) => C.integration(`${ip(provider)}/connect`, { method: 'POST', body }),
      invalidatesTags: ['Integration'],
    }),
    disconnectIntegration: b.mutation({
      query: (p) => C.integration(CALENDARS.includes(p) ? `${ip('calendar')}/${p}` : ip(p), { method: 'DELETE' }),
      invalidatesTags: ['Integration', 'Booking'],
    }),
    getIntegrationSetting: b.query({
      query: ({ provider, kind }) => C.integration(`${ip(provider)}/${INTEGRATION_SETTINGS[kind]}`),
      providesTags: (_r, _e, { provider, kind }) => [{ type: 'Integration', id: `${provider}:${kind}` }],
    }),
    putIntegrationSetting: b.mutation({
      query: ({ provider, kind, body }) => C.integration(`${ip(provider)}/${INTEGRATION_SETTINGS[kind]}`, { method: 'PUT', body }),
      invalidatesTags: (_r, _e, { provider, kind }) => [{ type: 'Integration', id: `${provider}:${kind}` }],
    }),
    // { fields: the CRM's fields, platform_fields: ours to map them to }
    listIntegrationFields: b.query({ query: (p) => C.integration(`${ip(p)}/fields`) }),
    // { field_mapping: { crmField: 'contact.phone' } }. There is no route to read the saved mapping back.
    putIntegrationMapping: b.mutation({
      query: ({ provider, field_mapping }) => C.integration(`${ip(provider)}/mapping`, { method: 'PUT', body: { field_mapping } }),
    }),
    // Runs a sync now: { kind, direction, status, counts { exported, imported_created, imported_updated, skipped }, errors }
    runIntegrationSync: b.mutation({ query: (p) => C.integration(`${ip(p)}/sync`, { method: 'POST', body: {} }), invalidatesTags: ['Integration'] }),
    listSyncLog: b.query({ query: (p) => C.integration(`${ip(p)}/sync-log`), transformResponse: (d) => d?.items ?? d ?? [], providesTags: ['Integration'] }),
    // What the agent would learn about this caller: { found, record, source }
    lookupTest: b.mutation({ query: ({ provider, phone }) => C.integration(`${ip(provider)}/lookup-test`, { method: 'POST', body: { phone } }) }),
    // Events a call trigger can listen to: [{ key, description, phone_path }]
    listIntegrationEvents: b.query({ query: (p) => C.integration(`${ip(p)}/events`) }),

    // Booking (ACT-02) -------------------------------------------------------
    connectCalendar: b.mutation({
      query: (provider) => C.integration('/customer/integrations/calendar/connect', { method: 'POST', body: { provider } }),
      invalidatesTags: ['Integration', 'Booking'],
    }),
    listCalendars: b.query({ query: () => C.integration('/customer/integrations/calendar'), providesTags: ['Integration', 'Booking'] }),
    getBookingSettings: b.query({ query: () => C.integration('/customer/booking-settings'), providesTags: ['Booking'] }),
    putBookingSettings: b.mutation({ query: (body) => C.integration('/customer/booking-settings', { method: 'PUT', body }), invalidatesTags: ['Booking'] }),
    // status: booked | cancelled | completed | no_show
    listAppointments: b.query({
      query: (params = {}) => C.integration('/customer/appointments', { params: { limit: 50, ...params } }),
      transformResponse: (d) => d?.items ?? d ?? [],
      providesTags: ['Booking'],
    }),

    // Messages & notifications -----------------------------------------------
    listMessages: b.query({ query: (params = {}) => C.integration('/customer/messages', { params }), providesTags: ['Message'] }),
    // { items (newest first, read flag), unread_count }
    listNotifications: b.query({ query: () => C.integration('/customer/notifications', { params: { limit: 25 } }), providesTags: ['Notification'] }),
    markNotificationRead: b.mutation({
      query: (id) => C.integration(`/customer/notifications/${id}/read`, { method: 'POST', body: {} }),
      // Optimistic: mark it read in the cached list right away.
      async onQueryStarted(id, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          integrationApi.util.updateQueryData('listNotifications', undefined, (draft) => {
            const n = draft?.items?.find?.((x) => x.id === id);
            if (n && !n.read) {
              n.read = true;
              n.read_at = new Date().toISOString();
              draft.unread_count = Math.max(0, (draft.unread_count ?? 1) - 1);
            }
          }),
        );
        queryFulfilled.catch(patch.undo);
      },
    }),
    markAllNotificationsRead: b.mutation({
      query: () => C.integration('/customer/notifications/read-all', { method: 'POST', body: {} }),
      invalidatesTags: ['Notification'],
    }),
    getNotificationSettings: b.query({ query: () => C.integration('/customer/notification-settings'), providesTags: ['NotificationSettings'] }),
    putNotificationSettings: b.mutation({
      query: (body) => C.integration('/customer/notification-settings', { method: 'PUT', body }),
      invalidatesTags: ['NotificationSettings'],
    }),

    // Channels (WA-01..03, WA-06) --------------------------------------------
    listWhatsappAccounts: b.query({ query: () => C.integration('/customer/channels/whatsapp'), providesTags: ['Channel'] }),
    // { phone, display_name }. Without Meta credentials this is a demo number (is_simulated); with
    // embedded signup add phone_number_id, access_token, waba_id.
    connectWhatsapp: b.mutation({
      query: ({ business_id, ...body }) => C.integration('/customer/channels/whatsapp/connect', { method: 'POST', body: { ...body, ...(business_id ? { waba_id: business_id } : {}) } }),
      invalidatesTags: ['Channel'],
    }),
    disconnectWhatsapp: b.mutation({ query: (id) => C.integration(`/customer/channels/whatsapp/${id}`, { method: 'DELETE' }), invalidatesTags: ['Channel'] }),
    // agent_id null = staff only. The agent replies until a person takes the conversation over.
    setWhatsappAgent: b.mutation({
      query: ({ id, agent_id }) => C.integration(`/customer/channels/whatsapp/${id}/agent`, { method: 'PUT', body: { agent_id } }),
      invalidatesTags: ['Channel'],
    }),
    // Review is simulated (~10 s): pending -> approved, or rejected with reject_reason.
    listMessageTemplates: b.query({
      query: () => C.integration('/customer/channels/whatsapp/templates'),
      transformResponse: (d) => (d?.items ?? d ?? []).map((t) => ({ ...t, channel: 'whatsapp', variables: t.examples ?? [] })),
      providesTags: ['MessageTemplate'],
    }),
    createMessageTemplate: b.mutation({
      query: ({ name, language, category, body, variables, buttons }) =>
        C.integration('/customer/channels/whatsapp/templates', {
          method: 'POST',
          body: { name, language, category: String(category ?? 'utility').toLowerCase(), body, examples: variables ?? [], ...(buttons?.length ? { buttons } : {}) },
        }),
      invalidatesTags: ['MessageTemplate'],
    }),
    deleteMessageTemplate: b.mutation({
      query: (id) => C.integration(`/customer/channels/whatsapp/templates/${id}`, { method: 'DELETE' }),
      invalidatesTags: ['MessageTemplate'],
    }),
    listSmsSenders: b.query({ query: () => C.integration('/customer/channels/sms'), providesTags: ['Channel'] }),
    connectSms: b.mutation({ query: (body) => C.integration('/customer/channels/sms/connect', { method: 'POST', body }), invalidatesTags: ['Channel'] }),

    // Inbox (WA-04) & broadcasts (WA-05) -------------------------------------
    // Wire: { items: [{ contact_address, status open|human|closed, unread_count, window_open, window_expires_at, last_message: {...} }], total }.
    // The inbox reads an array and last_message as text.
    listConversations: b.query({
      query: (params = {}) => C.integration('/customer/conversations', { params }),
      transformResponse: (d) => (d?.items ?? d ?? []).map((c) => ({ ...c, last_message: c.last_message?.body ?? c.last_message ?? '' })),
      providesTags: ['Conversation'],
    }),
    // Oldest first; opening a conversation marks it read. direction is inbound | outbound on the wire, in | out in the inbox.
    listConversationMessages: b.query({
      query: (id) => C.integration(`/customer/conversations/${id}/messages`),
      transformResponse: (d) => (d?.items ?? d ?? []).map((m) => ({ ...m, direction: m.direction === 'inbound' ? 'in' : 'out' })),
      providesTags: (_r, _e, id) => [{ type: 'Conversation', id }, 'Conversation'],
    }),
    // Free text inside the 24 h window, otherwise { template_id, variables } (422 window_closed). Replying takes over.
    replyToConversation: b.mutation({
      query: ({ id, body, template_id, variables }) =>
        C.integration(`/customer/conversations/${id}/messages`, { method: 'POST', body: template_id ? { template_id, variables: variables ?? [] } : { text: body } }),
      invalidatesTags: ['Conversation'],
    }),
    conversationHandoff: b.mutation({
      // action: takeover | release
      query: ({ id, action }) => C.integration(`/customer/conversations/${id}/${action}`, { method: 'POST', body: {} }),
      transformResponse: (c) => ({ ...c, last_message: c?.last_message?.body ?? c?.last_message ?? '' }),
      invalidatesTags: ['Conversation'],
    }),
    listBroadcasts: b.query({ query: () => C.integration('/customer/broadcasts'), transformResponse: (d) => d?.items ?? d ?? [], providesTags: ['Broadcast'] }),
    // { name, account_id, template_id, variables[], phones[] | contact_list_id }. Do-not-call contacts are left out.
    createBroadcast: b.mutation({ query: (body) => C.integration('/customer/broadcasts', { method: 'POST', body }), invalidatesTags: ['Broadcast'] }),
    // total, sent, delivered, read, failed, replied (delivery receipts are simulated)
    getBroadcast: b.query({ query: (id) => C.integration(`/customer/broadcasts/${id}`), providesTags: ['Broadcast'] }),
  }),
});

export const {
  useListWebhooksQuery,
  useCreateWebhookMutation,
  useUpdateWebhookMutation,
  useDeleteWebhookMutation,
  useTestWebhookMutation,
  useListWebhookDeliveriesQuery,
  useListWebhookEventsQuery,
  useListIntegrationsQuery,
  useListIntegrationCatalogQuery,
  useGetIntegrationStatusQuery,
  useConnectIntegrationMutation,
  useDisconnectIntegrationMutation,
  useGetIntegrationSettingQuery,
  usePutIntegrationSettingMutation,
  useListIntegrationFieldsQuery,
  usePutIntegrationMappingMutation,
  useListCalendarsQuery,
  useRunIntegrationSyncMutation,
  useListSyncLogQuery,
  useLookupTestMutation,
  useListIntegrationEventsQuery,
  useConnectCalendarMutation,
  useGetBookingSettingsQuery,
  usePutBookingSettingsMutation,
  useListAppointmentsQuery,
  useListMessagesQuery,
  useListNotificationsQuery,
  useMarkNotificationReadMutation,
  useMarkAllNotificationsReadMutation,
  useGetNotificationSettingsQuery,
  usePutNotificationSettingsMutation,
  useListWhatsappAccountsQuery,
  useConnectWhatsappMutation,
  useDisconnectWhatsappMutation,
  useSetWhatsappAgentMutation,
  useListMessageTemplatesQuery,
  useCreateMessageTemplateMutation,
  useDeleteMessageTemplateMutation,
  useListSmsSendersQuery,
  useConnectSmsMutation,
  useListConversationsQuery,
  useListConversationMessagesQuery,
  useReplyToConversationMutation,
  useConversationHandoffMutation,
  useListBroadcastsQuery,
  useCreateBroadcastMutation,
  useGetBroadcastQuery,
} = integrationApi;
