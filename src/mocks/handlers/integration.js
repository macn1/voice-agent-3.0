import { ago, ahead, DAY, HOUR, MIN, on, page, table, uid } from '../engine';

// voice-integration-be routes not served yet: webhooks, integrations
// (CRM / helpdesk / calendar / sheets), booking, messages, notifications and
// the WhatsApp / SMS channels with inbox and broadcasts. Demo data only.

const svc = 'integration';

// Webhooks -------------------------------------------------------------------
const webhooks = table([
  { id: 'wh-1', url: 'https://hooks.acme.example/voice/events', events: ['call.started', 'call.completed', 'call.failed'], secret: 'whsec_demo_a81f…', status: 'active', last_delivery_at: ago(25 * MIN), created_at: ago(20 * DAY) },
  { id: 'wh-2', url: 'https://zapier.example/hooks/catch/8841/abc', events: ['call.completed'], secret: 'whsec_demo_77c2…', status: 'active', last_delivery_at: ago(3 * HOUR), created_at: ago(9 * DAY) },
]);
const deliveries = [
  { id: 'd1', event_type: 'call.completed', status: 'delivered', response_code: 200, attempt: 1, created_at: ago(25 * MIN) },
  { id: 'd2', event_type: 'call.started', status: 'delivered', response_code: 200, attempt: 1, created_at: ago(27 * MIN) },
  { id: 'd3', event_type: 'call.failed', status: 'failed', response_code: 500, attempt: 3, created_at: ago(5 * HOUR) },
];
on(svc, 'GET', '/customer/webhooks', () => webhooks.all());
on(svc, 'POST', '/customer/webhooks', ({ body }) => webhooks.add({ status: 'active', events: [], ...body, secret: `whsec_${uid()}` }));
on(svc, 'PATCH', '/customer/webhooks/:id', ({ params, body }) => {
  const { regenerate_secret, ...rest } = body;
  return webhooks.patch(params.id, regenerate_secret ? { ...rest, secret: `whsec_${uid()}` } : rest);
});
on(svc, 'DELETE', '/customer/webhooks/:id', ({ params }) => webhooks.remove(params.id));
on(svc, 'POST', '/customer/webhooks/:id/test', () => ({ status: 'delivered', response_code: 200 }));
on(svc, 'GET', '/customer/webhooks/:id/deliveries', () => deliveries);

// Integrations ------------------------------------------------------------------
const catalog = [
  { provider: 'hubspot', name: 'HubSpot', category: 'crm', description: 'Sync contacts, log calls on the timeline and look up callers.', permissions: ['Read and write contacts', 'Create call and note engagements'] },
  { provider: 'salesforce', name: 'Salesforce', category: 'crm', description: 'Two-way contact sync and call logging to leads and opportunities.', permissions: ['Read and write leads and contacts', 'Create tasks and activities'] },
  { provider: 'zoho-crm', name: 'Zoho CRM', category: 'crm', description: 'Keep contacts in sync and log every call automatically.', permissions: ['Read and write contacts', 'Create call logs'] },
  { provider: 'zendesk', name: 'Zendesk', category: 'helpdesk', description: 'Create tickets from calls and pull customer history.', permissions: ['Read and create tickets', 'Read users'] },
  { provider: 'freshdesk', name: 'Freshdesk', category: 'helpdesk', description: 'Open tickets for unresolved calls.', permissions: ['Read and create tickets'] },
  { provider: 'google-calendar', name: 'Google Calendar', category: 'calendar', description: 'Let agents check availability and book appointments.', permissions: ['View and edit events on your calendars'] },
  { provider: 'outlook-calendar', name: 'Outlook Calendar', category: 'calendar', description: 'Book into Microsoft 365 calendars.', permissions: ['Read and write calendar events'] },
  { provider: 'google-sheets', name: 'Google Sheets', category: 'sheets', description: 'Import contacts and write call results back to a sheet.', permissions: ['Read and edit selected spreadsheets'] },
  { provider: 'zapier', name: 'Zapier', category: 'automation', description: 'Connect Aurlynn to 5,000+ apps with triggers and actions.', permissions: [] },
  { provider: 'make', name: 'Make', category: 'automation', description: 'Build multi-step automations around your calls.', permissions: [] },
];
const integrations = new Map([
  ['hubspot', { connected: true, status: 'active', account_label: 'acme-clinic.hubspot.com', last_sync_at: ago(35 * MIN) }],
  ['google-calendar', { connected: true, status: 'active', account_label: 'frontdesk@acme-clinic.example', last_sync_at: ago(10 * MIN) }],
  ['zendesk', { connected: true, status: 'error', account_label: 'acme.zendesk.com', last_sync_at: ago(2 * DAY), last_error: 'Authorization expired. Reconnect to resume ticket creation.' }],
]);
const view = (c) => ({ ...c, connected: false, status: 'disconnected', ...integrations.get(c.provider) });
const find = (p) => {
  const c = catalog.find((x) => x.provider === p);
  return c ? view(c) : { provider: p, name: p, category: 'automation', description: '', connected: false, permissions: [] };
};

on(svc, 'GET', '/customer/integrations', () => catalog.map(view));
on(svc, 'GET', '/customer/integrations/catalog', () => catalog.map(view));
on(svc, 'GET', '/customer/integrations/:p/status', ({ params }) => find(params.p));
on(svc, 'POST', '/customer/integrations/:p/connect', ({ params }) => {
  integrations.set(params.p, { connected: true, status: 'active', account_label: 'demo-account', last_sync_at: new Date().toISOString() });
  return find(params.p);
});
on(svc, 'DELETE', '/customer/integrations/:p', ({ params }) => {
  integrations.delete(params.p);
  return null;
});
on(svc, 'POST', '/customer/integrations/google-sheets/connect', () => {
  integrations.set('google-sheets', { connected: true, status: 'active', account_label: 'frontdesk@acme-clinic.example', last_sync_at: new Date().toISOString() });
  return { connected: true };
});
on(svc, 'POST', '/customer/integrations/calendar/connect', ({ body }) => {
  integrations.set(body.provider, { connected: true, status: 'active', account_label: 'frontdesk@acme-clinic.example', last_sync_at: new Date().toISOString() });
  return { connected: true };
});
on(svc, 'GET', '/customer/integrations/google-sheets/sheets', () => [
  { id: 'sh-1', name: 'Patients — master list', rows: 1240 },
  { id: 'sh-2', name: 'Call results (auto)', rows: 312 },
]);
on(svc, 'PUT', '/customer/integrations/google-sheets/write-back', ({ body }) => body);

const SETTING_DEFAULTS = {
  'sync-settings': { direction: 'both', schedule: 'hourly', mapping: { name: 'firstname', phone: 'phone', email: 'email' }, filter: '' },
  'call-logging': { enabled: true, create_task_on_success: true, create_when: 'after_call', outcome_to_status: { appointment_booked: 'Demo booked' }, write: { filter: 'all' } },
  'lookup-settings': { enabled: true, mapping: { name: 'firstname', last_visit: 'last_visit_date' } },
  'ticket-settings': { enabled: true, default_group: 'Support', default_priority: 'normal', create_when: 'unresolved' },
};
const settings = new Map();
Object.entries(SETTING_DEFAULTS).forEach(([path, def]) => {
  on(svc, 'GET', `/customer/integrations/:p/${path}`, ({ params }) => settings.get(`${params.p}:${path}`) ?? def);
  on(svc, 'PUT', `/customer/integrations/:p/${path}`, ({ params, body }) => {
    settings.set(`${params.p}:${path}`, body);
    return body;
  });
});
on(svc, 'GET', '/customer/integrations/:p/fields', () => [
  { key: 'firstname', label: 'First name' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'last_visit_date', label: 'Last visit' },
]);
on(svc, 'GET', '/customer/integrations/:p/events', () => [
  { key: 'contact.created', label: 'Contact created' },
  { key: 'deal.stage_changed', label: 'Deal moved to “Demo booked”' },
  { key: 'appointment.missed', label: 'Appointment missed' },
]);
const syncLog = [
  { id: 'sl-1', started_at: ago(35 * MIN), status: 'success', direction: 'in', kind: 'contacts', counts: { created: 4, updated: 18, failed: 0 }, errors: [] },
  { id: 'sl-2', started_at: ago(1 * DAY), status: 'partial', direction: 'both', kind: 'contacts', counts: { created: 2, updated: 31, failed: 2 }, errors: ['Row 14: invalid phone number', 'Row 22: missing email'] },
];
on(svc, 'GET', '/customer/integrations/:p/sync-log', () => syncLog);
on(svc, 'POST', '/customer/integrations/:p/sync', () => {
  syncLog.unshift({ id: uid('sl-'), started_at: new Date().toISOString(), status: 'success', direction: 'both', kind: 'contacts', counts: { created: 1, updated: 6, failed: 0 }, errors: [] });
  return { started: true };
});
on(svc, 'POST', '/customer/integrations/:p/lookup-test', ({ body }) => ({
  found: true,
  record: { id: 'rec_8841', firstname: 'Anita', lastname: 'Nair', phone: body.phone, last_visit_date: '2026-09-12' },
  variables: { caller_name: 'Anita', last_visit: '12 Sep 2026' },
}));

// Booking and appointments --------------------------------------------------
let booking = { calendar_id: 'frontdesk@acme-clinic.example', slot_minutes: 30, buffer_minutes: 10, bookable_hours: { days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'], from: '09:00', to: '18:00' } };
on(svc, 'GET', '/customer/booking-settings', () => booking);
on(svc, 'PUT', '/customer/booking-settings', ({ body }) => (booking = body));
on(svc, 'GET', '/customer/appointments', () => [
  { id: 'ap-1', contact_name: 'Anita Nair', agent_name: 'Booking Agent', starts_at: ahead(1 * DAY), status: 'confirmed', details: 'Dental check-up', call_id: null },
  { id: 'ap-2', contact_name: 'Rohan Mehta', agent_name: 'Front Desk Assistant', starts_at: ahead(2 * DAY), status: 'confirmed', details: 'Teeth cleaning', call_id: null },
  { id: 'ap-3', contact_name: 'Priya Sharma', agent_name: 'Booking Agent', starts_at: ago(1 * DAY), status: 'completed', details: 'Consultation', call_id: null },
]);

// Messages and notifications --------------------------------------------------
const messages = table(
  [
    ['WhatsApp', 'delivered', 'Hi Anita, your appointment is confirmed for Tue 11:00.', '+91 98450 11122'],
    ['SMS', 'delivered', 'Reminder: check-up tomorrow at 10:30. Reply 1 to confirm.', '+91 98450 33344'],
    ['WhatsApp', 'read', 'Thanks for calling Acme Clinic! Here is our price list.', '+91 98450 55566'],
    ['SMS', 'failed', 'Your invoice #1042 is due on 20 Oct.', '+91 98450 77788'],
  ].map(([channel, status, body, to_address], i) => ({ id: `msg-${i}`, channel, status, body, to_address, call_id: null, created_at: ago((i + 1) * 2 * HOUR) })),
);
on(svc, 'GET', '/customer/messages', ({ query }) => page(messages.all(), { limit: query.limit ?? 50, offset: query.offset ?? 0 }));

const notifications = table([
  { id: 'nt-1', title: 'Call flagged for review', body: 'Front Desk Assistant — caller sounded upset.', link: '/review', read_at: null, created_at: ago(40 * MIN) },
  { id: 'nt-2', title: 'Campaign finished', body: 'Lapsed patients win-back — 85 contacts called.', link: '/campaigns', read_at: null, created_at: ago(5 * HOUR) },
  { id: 'nt-3', title: 'Usage reached 80%', body: 'You have used 4,000 of 5,000 plan minutes.', link: '/settings/usage', read_at: ago(1 * DAY), created_at: ago(2 * DAY) },
]);
on(svc, 'GET', '/customer/notifications', () => notifications.all());
on(svc, 'POST', '/customer/notifications/:id/read', ({ params }) => notifications.patch(params.id, { read_at: new Date().toISOString() }));
let notifSettings = {
  preferences: {
    'call.failed': { email: true, whatsapp: false, in_app: true },
    'call.needs_review': { email: false, whatsapp: false, in_app: true },
    'usage.80': { email: true, whatsapp: true, in_app: true },
    'campaign.finished': { email: true, whatsapp: false, in_app: true },
  },
  recipients: ['owner@acme.test'],
};
on(svc, 'GET', '/customer/notification-settings', () => notifSettings);
on(svc, 'PUT', '/customer/notification-settings', ({ body }) => (notifSettings = body));

// Channels: WhatsApp, SMS, inbox, broadcasts -----------------------------------
const wa = table([{ id: 'wa-1', display_name: 'Acme Clinic', phone: '+91 80 4567 8901', status: 'connected', provider: 'meta', agent_id: 'front', created_at: ago(18 * DAY), chat_settings: { reply_style: 'friendly', away_message: 'We are closed right now and will reply at 9 AM.', working_hours: { days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'], from: '09:00', to: '19:00' } } }]);
on(svc, 'GET', '/customer/channels/whatsapp', () => wa.all());
on(svc, 'POST', '/customer/channels/whatsapp/connect', ({ body }) => wa.add({ display_name: body.display_name ?? 'WhatsApp Business', phone: body.phone ?? '+91 80 0000 0000', status: 'connected', provider: 'meta' }));
on(svc, 'DELETE', '/customer/channels/whatsapp/:id', ({ params }) => wa.remove(params.id));
on(svc, 'PUT', '/customer/channels/whatsapp/:id/agent', ({ params, body }) => wa.patch(params.id, { agent_id: body.agent_id, chat_settings: body.chat_settings }));

const templates = table([
  { id: 'mt-1', name: 'appointment_confirmation', channel: 'whatsapp', category: 'utility', language: 'en', status: 'approved', body: 'Hi {{1}}, your appointment is confirmed for {{2}}.', variables: ['name', 'time'], buttons: [{ type: 'quick_reply', text: 'Reschedule' }] },
  { id: 'mt-2', name: 'payment_reminder', channel: 'whatsapp', category: 'utility', language: 'en', status: 'pending', body: 'Hello {{1}}, invoice {{2}} is due on {{3}}.', variables: ['name', 'invoice', 'date'], buttons: [] },
  { id: 'mt-3', name: 'festive_offer', channel: 'whatsapp', category: 'marketing', language: 'en', status: 'rejected', reject_reason: 'Promotional content must include an opt-out option.', body: 'Diwali offer: 20% off all treatments, {{1}}!', variables: ['name'], buttons: [] },
]);
on(svc, 'GET', '/customer/channels/whatsapp/templates', () => templates.all());
on(svc, 'POST', '/customer/channels/whatsapp/templates', ({ body }) => templates.add({ status: 'pending', buttons: [], variables: [], ...body }));
on(svc, 'DELETE', '/customer/channels/whatsapp/templates/:id', ({ params }) => templates.remove(params.id));

const sms = table([{ id: 'sms-1', display_name: 'ACMECL', phone: 'ACMECL', provider: 'twilio', status: 'connected' }]);
on(svc, 'GET', '/customer/channels/sms', () => sms.all());
on(svc, 'POST', '/customer/channels/sms/connect', ({ body }) => sms.add({ status: 'connected', provider: 'twilio', ...body }));

const conversations = table([
  { id: 'cv-1', contact_name: 'Anita Nair', contact_address: '+91 98450 11122', last_message: 'Can I move my appointment to Thursday?', last_message_at: ago(8 * MIN), status: 'needs_human', unread_count: 2 },
  { id: 'cv-2', contact_name: 'Rohan Mehta', contact_address: '+91 98450 33344', last_message: 'Thank you!', last_message_at: ago(2 * HOUR), status: 'agent', unread_count: 0 },
  { id: 'cv-3', contact_name: 'Priya Sharma', contact_address: '+91 98450 55566', last_message: 'What are your Saturday hours?', last_message_at: ago(1 * DAY), status: 'agent', unread_count: 0 },
]);
const convMessages = {
  'cv-1': [
    { id: 'm1', direction: 'inbound', sender: 'Anita Nair', body: 'Hi, I have an appointment on Tuesday.', created_at: ago(30 * MIN) },
    { id: 'm2', direction: 'outbound', sender: 'Agent', body: 'Hello Anita! Yes, you are booked for Tuesday at 11:00.', created_at: ago(29 * MIN) },
    { id: 'm3', direction: 'inbound', sender: 'Anita Nair', body: 'Can I move my appointment to Thursday?', created_at: ago(8 * MIN) },
  ],
};
on(svc, 'GET', '/customer/conversations', ({ query }) => conversations.all().filter((c) => !query.status || c.status === query.status));
on(svc, 'GET', '/customer/conversations/:id/messages', ({ params }) => convMessages[params.id] ?? [{ id: 'mx', direction: 'inbound', sender: 'Customer', body: conversations.get(params.id)?.last_message ?? '', created_at: ago(1 * HOUR) }]);
on(svc, 'POST', '/customer/conversations/:id/messages', ({ params, body }) => {
  const m = { id: uid('m'), direction: 'outbound', sender: 'You', body: body.body, created_at: new Date().toISOString() };
  (convMessages[params.id] ??= []).push(m);
  conversations.patch(params.id, { last_message: body.body, last_message_at: m.created_at, unread_count: 0 });
  return m;
});
for (const action of ['takeover', 'handback', 'resolve']) {
  on(svc, 'POST', `/customer/conversations/:id/${action}`, ({ params }) => conversations.patch(params.id, { status: action === 'takeover' ? 'human' : 'agent' }));
}

const broadcasts = table([
  { id: 'bc-1', name: 'October check-up reminder', type: 'whatsapp', status: 'sent', template_name: 'appointment_confirmation', list_name: 'October check-up reminders', scheduled_at: ago(2 * DAY), stats: { sent: 120, delivered: 114, read: 87, replied: 23, failed: 6 } },
  { id: 'bc-2', name: 'Webinar invitation', type: 'whatsapp', status: 'scheduled', template_name: 'appointment_confirmation', list_name: 'Webinar sign-ups', scheduled_at: ahead(1 * DAY), stats: { sent: 0, delivered: 0, read: 0, replied: 0, failed: 0 } },
]);
on(svc, 'GET', '/customer/broadcasts', () => broadcasts.all());
on(svc, 'POST', '/customer/broadcasts', ({ body }) => broadcasts.add({ status: body.scheduled_at ? 'scheduled' : 'sent', stats: { sent: 0, delivered: 0, read: 0, replied: 0, failed: 0 }, ...body }));
