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
  tickets: 'ticket-settings',
};

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
    listWebhookDeliveries: b.query({ query: (id) => C.integration(`/customer/webhooks/${id}/deliveries`), providesTags: ['Webhook'] }),

    // Integrations -----------------------------------------------------------
    listIntegrations: b.query({ query: () => C.integration('/customer/integrations'), providesTags: ['Integration'] }),
    listIntegrationCatalog: b.query({ query: () => C.integration('/customer/integrations/catalog'), providesTags: ['Integration'] }),
    getIntegrationStatus: b.query({ query: (p) => C.integration(`${ip(p)}/status`), providesTags: ['Integration'] }),
    connectIntegration: b.mutation({ query: (p) => C.integration(`${ip(p)}/connect`, { method: 'POST', body: {} }), invalidatesTags: ['Integration'] }),
    disconnectIntegration: b.mutation({ query: (p) => C.integration(ip(p), { method: 'DELETE' }), invalidatesTags: ['Integration'] }),
    getIntegrationSetting: b.query({
      query: ({ provider, kind }) => C.integration(`${ip(provider)}/${INTEGRATION_SETTINGS[kind]}`),
      providesTags: (_r, _e, { provider, kind }) => [{ type: 'Integration', id: `${provider}:${kind}` }],
    }),
    putIntegrationSetting: b.mutation({
      query: ({ provider, kind, body }) => C.integration(`${ip(provider)}/${INTEGRATION_SETTINGS[kind]}`, { method: 'PUT', body }),
      invalidatesTags: (_r, _e, { provider, kind }) => [{ type: 'Integration', id: `${provider}:${kind}` }],
    }),
    listIntegrationFields: b.query({ query: (p) => C.integration(`${ip(p)}/fields`) }),
    runIntegrationSync: b.mutation({ query: (p) => C.integration(`${ip(p)}/sync`, { method: 'POST', body: {} }), invalidatesTags: ['Integration'] }),
    listSyncLog: b.query({ query: (p) => C.integration(`${ip(p)}/sync-log`), providesTags: ['Integration'] }),
    lookupTest: b.mutation({ query: ({ provider, phone }) => C.integration(`${ip(provider)}/lookup-test`, { method: 'POST', body: { phone } }) }),
    listIntegrationEvents: b.query({ query: (p) => C.integration(`${ip(p)}/events`) }),
    connectSheets: b.mutation({
      query: () => C.integration('/customer/integrations/google-sheets/connect', { method: 'POST', body: {} }),
      invalidatesTags: ['Integration'],
    }),
    listSheets: b.query({ query: () => C.integration('/customer/integrations/google-sheets/sheets'), providesTags: ['Integration'] }),
    putSheetsWriteBack: b.mutation({ query: (body) => C.integration('/customer/integrations/google-sheets/write-back', { method: 'PUT', body }) }),

    // Booking (ACT-02) -------------------------------------------------------
    connectCalendar: b.mutation({
      query: (provider) => C.integration('/customer/integrations/calendar/connect', { method: 'POST', body: { provider } }),
      invalidatesTags: ['Integration', 'Booking'],
    }),
    getBookingSettings: b.query({ query: () => C.integration('/customer/booking-settings'), providesTags: ['Booking'] }),
    putBookingSettings: b.mutation({ query: (body) => C.integration('/customer/booking-settings', { method: 'PUT', body }), invalidatesTags: ['Booking'] }),
    listAppointments: b.query({ query: () => C.integration('/customer/appointments'), providesTags: ['Booking'] }),

    // Messages & notifications -----------------------------------------------
    listMessages: b.query({ query: (params = {}) => C.integration('/customer/messages', { params }), providesTags: ['Message'] }),
    listNotifications: b.query({ query: () => C.integration('/customer/notifications'), providesTags: ['Notification'] }),
    markNotificationRead: b.mutation({
      query: (id) => C.integration(`/customer/notifications/${id}/read`, { method: 'POST', body: {} }),
      // Optimistic: mark it read in the cached list right away.
      async onQueryStarted(id, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          integrationApi.util.updateQueryData('listNotifications', undefined, (draft) => {
            const n = draft?.find?.((x) => x.id === id);
            if (n) n.read_at = new Date().toISOString();
          }),
        );
        queryFulfilled.catch(patch.undo);
      },
    }),
    getNotificationSettings: b.query({ query: () => C.integration('/customer/notification-settings'), providesTags: ['NotificationSettings'] }),
    putNotificationSettings: b.mutation({
      query: (body) => C.integration('/customer/notification-settings', { method: 'PUT', body }),
      invalidatesTags: ['NotificationSettings'],
    }),

    // Channels (WA-01..03, WA-06) --------------------------------------------
    listWhatsappAccounts: b.query({ query: () => C.integration('/customer/channels/whatsapp'), providesTags: ['Channel'] }),
    connectWhatsapp: b.mutation({
      query: (body) => C.integration('/customer/channels/whatsapp/connect', { method: 'POST', body }),
      invalidatesTags: ['Channel'],
    }),
    disconnectWhatsapp: b.mutation({ query: (id) => C.integration(`/customer/channels/whatsapp/${id}`, { method: 'DELETE' }), invalidatesTags: ['Channel'] }),
    setWhatsappAgent: b.mutation({
      query: ({ id, agent_id, chat_settings }) =>
        C.integration(`/customer/channels/whatsapp/${id}/agent`, { method: 'PUT', body: { agent_id, chat_settings } }),
      invalidatesTags: ['Channel'],
    }),
    listMessageTemplates: b.query({ query: () => C.integration('/customer/channels/whatsapp/templates'), providesTags: ['MessageTemplate'] }),
    createMessageTemplate: b.mutation({
      query: (body) => C.integration('/customer/channels/whatsapp/templates', { method: 'POST', body }),
      invalidatesTags: ['MessageTemplate'],
    }),
    deleteMessageTemplate: b.mutation({
      query: (id) => C.integration(`/customer/channels/whatsapp/templates/${id}`, { method: 'DELETE' }),
      invalidatesTags: ['MessageTemplate'],
    }),
    listSmsSenders: b.query({ query: () => C.integration('/customer/channels/sms'), providesTags: ['Channel'] }),
    connectSms: b.mutation({ query: (body) => C.integration('/customer/channels/sms/connect', { method: 'POST', body }), invalidatesTags: ['Channel'] }),

    // Inbox (WA-04) & broadcasts (WA-05) -------------------------------------
    listConversations: b.query({ query: (params = {}) => C.integration('/customer/conversations', { params }), providesTags: ['Conversation'] }),
    listConversationMessages: b.query({
      query: (id) => C.integration(`/customer/conversations/${id}/messages`),
      providesTags: (_r, _e, id) => [{ type: 'Conversation', id }],
    }),
    replyToConversation: b.mutation({
      query: ({ id, body, template_id }) => C.integration(`/customer/conversations/${id}/messages`, { method: 'POST', body: { body, template_id } }),
      invalidatesTags: ['Conversation'],
    }),
    conversationHandoff: b.mutation({
      // action: takeover | release
      query: ({ id, action }) => C.integration(`/customer/conversations/${id}/${action}`, { method: 'POST', body: {} }),
      invalidatesTags: ['Conversation'],
    }),
    listBroadcasts: b.query({ query: () => C.integration('/customer/broadcasts'), providesTags: ['Broadcast'] }),
    createBroadcast: b.mutation({ query: (body) => C.integration('/customer/broadcasts', { method: 'POST', body }), invalidatesTags: ['Broadcast'] }),
  }),
});

export const {
  useListWebhooksQuery,
  useCreateWebhookMutation,
  useUpdateWebhookMutation,
  useDeleteWebhookMutation,
  useTestWebhookMutation,
  useListWebhookDeliveriesQuery,
  useListIntegrationsQuery,
  useListIntegrationCatalogQuery,
  useGetIntegrationStatusQuery,
  useConnectIntegrationMutation,
  useDisconnectIntegrationMutation,
  useGetIntegrationSettingQuery,
  usePutIntegrationSettingMutation,
  useListIntegrationFieldsQuery,
  useRunIntegrationSyncMutation,
  useListSyncLogQuery,
  useLookupTestMutation,
  useListIntegrationEventsQuery,
  useConnectSheetsMutation,
  useListSheetsQuery,
  usePutSheetsWriteBackMutation,
  useConnectCalendarMutation,
  useGetBookingSettingsQuery,
  usePutBookingSettingsMutation,
  useListAppointmentsQuery,
  useListMessagesQuery,
  useListNotificationsQuery,
  useMarkNotificationReadMutation,
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
} = integrationApi;
