import { ago, ahead, DAY, HOUR, MIN, MockError, on, page, rng, table, uid } from '../engine';

// voice-outbound-be routes not served yet: campaigns, contacts, lists, custom
// fields, do-not-call, calling rules, scheduled calls and call triggers.

const svc = 'outbound';
const r = rng(11);
const pick = (a) => a[Math.floor(r() * a.length)];

const NAMES = ['Anita Nair', 'Rohan Mehta', 'Priya Sharma', 'Vikram Singh', 'Neha Kapoor', 'Arjun Reddy', 'Sana Khan', 'Karthik Iyer', 'Meera Joshi', 'Imran Qureshi', 'Divya Menon', 'Sahil Verma', 'Pooja Desai', 'Aman Gupta', 'Lakshmi Rao', 'Farhan Ali', 'Ritu Bansal', 'Nikhil Shah', 'Tara Pillai', 'Harsh Vora'];
const OUTCOMES = ['appointment_booked', 'question_answered', 'callback_requested', 'not_interested'];

const contacts = table(
  NAMES.map((name, i) => ({
    id: `ct-${i + 1}`,
    name,
    phone: `+91 98${String(10000000 + i * 137291).slice(0, 8)}`,
    email: `${name.toLowerCase().replace(/\s+/g, '.')}@example.com`,
    timezone: 'Asia/Kolkata',
    source: pick(['csv', 'manual', 'crm', 'csv']),
    do_not_call: i === 6,
    last_contacted_at: i % 3 === 0 ? null : ago((i + 1) * 9 * HOUR),
    last_outcome: i % 3 === 0 ? null : pick(OUTCOMES),
    memory_summary: i % 4 === 0 ? 'Prefers morning calls. Booked a check-up in September.' : '',
    custom_fields: { city: pick(['Bengaluru', 'Mumbai', 'Pune', 'Chennai']), plan: pick(['Gold', 'Silver', 'Basic']) },
    created_at: ago((i + 3) * DAY),
  })),
);

const lists = table([
  { id: 'cl-1', name: 'October check-up reminders', count: 12 },
  { id: 'cl-2', name: 'Lapsed patients (6 months)', count: 8 },
  { id: 'cl-3', name: 'Webinar sign-ups', count: 5 },
]);

let fields = [
  { key: 'city', label: 'City', type: 'text' },
  { key: 'plan', label: 'Plan', type: 'select', options: ['Gold', 'Silver', 'Basic'] },
  { key: 'next_visit', label: 'Next visit', type: 'date' },
];

const dnd = table([
  { id: 'dnd-1', phone: '+91 9811122233', reason: 'Asked on call', source: 'agent', created_at: ago(3 * DAY) },
  { id: 'dnd-2', phone: '+91 9822233344', reason: 'Imported from NDNC registry', source: 'import', created_at: ago(9 * DAY) },
  { id: 'dnd-3', phone: '+91 9833344455', reason: 'Customer request by email', source: 'manual', created_at: ago(15 * DAY) },
]);

let callingRules = {
  allowed_windows: { days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'], from: '10:00', to: '19:00' },
  max_attempts_per_day: 2,
  max_attempts_per_week: 5,
  respect_dnd: true,
  timezone: 'Asia/Kolkata',
};

const scheduled = table([
  { id: 'sch-1', agent_name: 'Front Desk Assistant', agent_id: 'front', contact_name: 'Anita Nair', to_number: '+91 9810000001', run_at: ahead(3 * HOUR), status: 'scheduled', reason: 'Follow up on missed appointment' },
  { id: 'sch-2', agent_name: 'Booking Agent', agent_id: 'book', contact_name: 'Rohan Mehta', to_number: '+91 9810000002', run_at: ahead(1 * DAY), status: 'scheduled', reason: 'Callback requested' },
  { id: 'sch-3', agent_name: 'Front Desk Assistant', agent_id: 'front', contact_name: 'Priya Sharma', to_number: '+91 9810000003', run_at: ago(2 * HOUR), status: 'completed', reason: 'Reminder call' },
]);

const triggers = table([
  { id: 'trg-1', name: 'New CRM lead → call within 5 min', source: 'integration', source_config: { provider: 'hubspot', event: 'contact.created' }, trigger_key: 'trg_lead_8f21', agent_id: 'front', agent_name: 'Front Desk Assistant', delay_seconds: 300, field_mapping: { phone: 'properties.phone', name: 'properties.firstname' }, is_enabled: true, created_at: ago(12 * DAY) },
  { id: 'trg-2', name: 'Missed appointment → reschedule', source: 'webhook', source_config: {}, trigger_key: 'trg_noshow_c4d7', agent_id: 'book', agent_name: 'Booking Agent', delay_seconds: 900, field_mapping: { phone: 'patient.phone' }, is_enabled: true, created_at: ago(6 * DAY) },
  { id: 'trg-3', name: 'Invoice overdue → payment reminder', source: 'webhook', source_config: {}, trigger_key: 'trg_overdue_91aa', agent_id: 'front', agent_name: 'Front Desk Assistant', delay_seconds: 0, field_mapping: { phone: 'customer.phone' }, is_enabled: false, created_at: ago(2 * DAY) },
]);
const triggerRuns = [
  { id: 'tr-1', status: 'called', detail: 'Call placed to Anita Nair', created_at: ago(40 * MIN), payload: { phone: '+91 9810000001' } },
  { id: 'tr-2', status: 'skipped', detail: 'Number is on the do-not-call list', created_at: ago(5 * HOUR), payload: { phone: '+91 9811122233' } },
  { id: 'tr-3', status: 'called', detail: 'Call placed to Rohan Mehta', created_at: ago(1 * DAY), payload: { phone: '+91 9810000002' } },
];

// Campaigns -----------------------------------------------------------------

const totals = (contacts, pending, calling, completed, connected, successful, failed, skipped) => ({ contacts, pending, calling, completed, connected, successful, failed, skipped });

const campaigns = table([
  { id: 'cmp-1', name: 'October check-up reminders', status: 'running', agent_id: 'front', agent_name: 'Front Desk Assistant', from_number: '+91 80 4567 8901', start_at: ago(2 * DAY), totals: totals(120, 38, 2, 80, 61, 34, 9, 3), created_at: ago(3 * DAY) },
  { id: 'cmp-2', name: 'Lapsed patients win-back', status: 'completed', agent_id: 'book', agent_name: 'Booking Agent', from_number: '+91 80 4567 8902', start_at: ago(14 * DAY), totals: totals(85, 0, 0, 85, 58, 27, 18, 4), created_at: ago(15 * DAY) },
  { id: 'cmp-3', name: 'Webinar invitations', status: 'scheduled', agent_id: 'front', agent_name: 'Front Desk Assistant', from_number: '+91 80 4567 8901', start_at: ahead(1 * DAY), totals: totals(60, 60, 0, 0, 0, 0, 0, 0), created_at: ago(1 * DAY) },
  { id: 'cmp-4', name: 'Diwali offers (draft)', status: 'draft', agent_id: 'front', agent_name: 'Front Desk Assistant', from_number: '+91 80 4567 8901', start_at: null, totals: totals(0, 0, 0, 0, 0, 0, 0, 0), created_at: ago(2 * HOUR) },
]);

const campaignSettings = new Map();
const DEFAULT_CAMPAIGN_SETTINGS = {
  calling_windows: { days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'], from: '10:00', to: '19:00', timezone_mode: 'contact', timezone: 'Asia/Kolkata' },
  max_concurrent: 3,
  calls_per_minute: 10,
  retry_rules: { no_answer: { attempts: 2, gap_minutes: 120 }, busy: { attempts: 2, gap_minutes: 30 }, voicemail: { attempts: 1, gap_minutes: 240 }, failed: { attempts: 1, gap_minutes: 60 } },
  budget_minutes: null,
  end_at: null,
};
const STATUSES = ['completed', 'completed', 'connected', 'no_answer', 'busy', 'pending', 'failed', 'completed'];
const campaignContacts = (id) => {
  const c = campaigns.get(id);
  return NAMES.map((name, i) => {
    const status = c?.status === 'draft' ? 'pending' : c?.status === 'scheduled' ? 'pending' : STATUSES[i % STATUSES.length];
    return {
      id: `${id}-cc-${i}`,
      name,
      phone: contacts.get(`ct-${i + 1}`)?.phone,
      status,
      attempts: status === 'pending' ? 0 : 1 + (i % 3 === 0 ? 1 : 0),
      outcome: status === 'completed' ? OUTCOMES[i % OUTCOMES.length] : null,
      next_attempt_at: ['no_answer', 'busy'].includes(status) ? ahead((i + 1) * HOUR) : null,
      variables: { city: contacts.get(`ct-${i + 1}`)?.custom_fields.city },
    };
  });
};

on(svc, 'GET', '/customer/campaigns', ({ query }) => page(query.status ? campaigns.all().filter((c) => c.status === query.status) : campaigns.all(), query));
on(svc, 'POST', '/customer/campaigns', ({ body }) => campaigns.add({ status: 'draft', agent_name: 'Front Desk Assistant', from_number: '+91 80 4567 8901', start_at: null, totals: totals(0, 0, 0, 0, 0, 0, 0, 0), ...body }));
on(svc, 'GET', '/customer/campaigns/:id', ({ params }) => campaigns.must(params.id, 'campaign'));
on(svc, 'PATCH', '/customer/campaigns/:id', ({ params, body }) => campaigns.patch(params.id, body));
on(svc, 'POST', '/customer/campaigns/:id/contacts', ({ params, body }) => {
  const n = body.contacts?.length ?? body.rows?.length ?? 25;
  const c = campaigns.must(params.id);
  c.totals = totals(n, n, 0, 0, 0, 0, 0, 0);
  return { added: n, valid: n, invalid: 0, duplicates: 0, skipped_dnd: 0 };
});
on(svc, 'POST', '/customer/campaigns/:id/contacts/validate', ({ params }) => {
  const t = campaigns.must(params.id).totals.contacts || 25;
  return { total: t, valid: t - 2, invalid: 1, duplicates: 1, skipped_dnd: 0 };
});
on(svc, 'GET', '/customer/campaigns/:id/contacts', ({ params, query }) => {
  const all = campaignContacts(params.id).filter((c) => !query.status || c.status === query.status);
  return page(all, { limit: query.limit ?? 50, offset: query.offset ?? 0 });
});
on(svc, 'GET', '/customer/campaigns/:id/contacts/:cid/attempts', ({ params }) => [
  { id: `${params.cid}-a1`, attempt_no: 1, result: 'no_answer', started_at: ago(26 * HOUR), call_id: null },
  { id: `${params.cid}-a2`, attempt_no: 2, result: 'connected', started_at: ago(3 * HOUR), call_id: null },
]);
on(svc, 'POST', '/customer/campaigns/:id/contacts/:cid/retry', () => ({ ok: true }));
on(svc, 'DELETE', '/customer/campaigns/:id/contacts/:cid', () => null);
on(svc, 'GET', '/customer/campaigns/:id/settings', ({ params }) => campaignSettings.get(params.id) ?? DEFAULT_CAMPAIGN_SETTINGS);
on(svc, 'PUT', '/customer/campaigns/:id/settings', ({ params, body }) => {
  campaignSettings.set(params.id, body);
  return body;
});
on(svc, 'GET', '/customer/campaigns/:id/estimate', ({ params }) => {
  const n = campaigns.must(params.id).totals.contacts || 60;
  return { contacts: n, est_minutes: n * 2, est_hours: (n * 2) / 60, plan_minutes_left: 3200, fits_plan: true };
});
for (const action of ['start', 'pause', 'resume', 'cancel', 'stop', 'schedule']) {
  on(svc, 'POST', `/customer/campaigns/:id/${action}`, ({ params }) => {
    const status = { start: 'running', resume: 'running', pause: 'paused', cancel: 'cancelled', stop: 'cancelled', schedule: 'scheduled' }[action];
    return campaigns.patch(params.id, { status, start_at: action === 'start' ? new Date().toISOString() : undefined });
  });
}
on(svc, 'GET', '/customer/campaigns/:id/results', ({ params }) => ({
  csv: ['name,phone,status,outcome', ...campaignContacts(params.id).map((c) => `${c.name},${c.phone},${c.status},${c.outcome ?? ''}`)].join('\n'),
}));
const variants = new Map();
on(svc, 'PUT', '/customer/campaigns/:id/variants', ({ params, body }) => {
  variants.set(params.id, body.variants);
  return body.variants;
});

// Contacts -------------------------------------------------------------------

on(svc, 'GET', '/customer/contacts', ({ query }) => {
  const q = String(query.q ?? query.search ?? '').toLowerCase();
  const rows = contacts.all().filter((c) => (!q || c.name.toLowerCase().includes(q) || c.phone.includes(q)) && (!query.list_id || true));
  return page(rows, { limit: query.limit ?? 50, offset: query.offset ?? 0 });
});
on(svc, 'POST', '/customer/contacts', ({ body }) => contacts.add({ custom_fields: {}, source: 'manual', do_not_call: false, ...body }));
on(svc, 'GET', '/customer/contacts/:id', ({ params }) => contacts.must(params.id, 'contact'));
on(svc, 'PATCH', '/customer/contacts/:id', ({ params, body }) => contacts.patch(params.id, body));
on(svc, 'DELETE', '/customer/contacts/:id', ({ params }) => contacts.remove(params.id));
on(svc, 'GET', '/customer/contacts/:id/timeline', ({ params }) => {
  const c = contacts.must(params.id);
  return [
    { type: 'call', title: 'Inbound call — appointment booked', detail: 'Booked a check-up for next Tuesday, 11:00.', at: ago(2 * DAY), link: '/calls' },
    { type: 'message', title: 'WhatsApp confirmation sent', detail: `Hi ${c.name.split(' ')[0]}, your appointment is confirmed.`, at: ago(2 * DAY) },
    { type: 'campaign', title: 'Added to “October check-up reminders”', detail: '', at: ago(5 * DAY) },
  ];
});
on(svc, 'GET', '/customer/contact-lists', () => lists.all());
on(svc, 'POST', '/customer/contact-lists', ({ body }) => lists.add({ name: body.name, count: body.contact_ids?.length ?? 0 }));
on(svc, 'GET', '/customer/contact-fields', () => fields);
on(svc, 'PUT', '/customer/contact-fields', ({ body }) => {
  fields = body.fields ?? body.items ?? (Array.isArray(body) ? body : fields);
  return fields;
});

// Do-not-call, calling rules --------------------------------------------------

on(svc, 'GET', '/customer/dnd-numbers', ({ query }) => page(dnd.all(), { limit: query.limit ?? 50, offset: query.offset ?? 0 }));
on(svc, 'POST', '/customer/dnd-numbers', ({ body }) => {
  if (!body.phone) throw new MockError(422, 'validation_error', 'Enter a phone number');
  return dnd.add({ source: 'manual', ...body });
});
on(svc, 'DELETE', '/customer/dnd-numbers/:id', ({ params }) => dnd.remove(params.id));
on(svc, 'GET', '/customer/calling-rules', () => callingRules);
on(svc, 'PUT', '/customer/calling-rules', ({ body }) => (callingRules = { ...callingRules, ...body }));

// Scheduled calls and triggers ------------------------------------------------

on(svc, 'GET', '/customer/scheduled-calls', () => scheduled.all());
on(svc, 'POST', '/customer/scheduled-calls', ({ body }) => scheduled.add({ status: 'scheduled', agent_name: 'Front Desk Assistant', ...body }));
on(svc, 'DELETE', '/customer/scheduled-calls/:id', ({ params }) => scheduled.remove(params.id));
on(svc, 'GET', '/customer/call-triggers', () => triggers.all());
on(svc, 'POST', '/customer/call-triggers', ({ body }) => triggers.add({ trigger_key: uid('trg_'), is_enabled: true, delay_seconds: 0, field_mapping: {}, source_config: {}, ...body }));
on(svc, 'PATCH', '/customer/call-triggers/:id', ({ params, body }) => triggers.patch(params.id, body));
on(svc, 'GET', '/customer/call-triggers/:id/runs', () => triggerRuns);
on(svc, 'POST', '/hooks/triggers/:key', () => ({ accepted: true, run_id: uid('tr-') }));
