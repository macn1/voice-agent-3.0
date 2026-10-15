import { ago, ahead, DAY, HOUR, on, page, rng, table, uid } from '../engine';

// voice-analytics-be routes not served yet: the report variants beyond
// summary/timeseries, agent insights, saved views, exports, scheduled reports,
// QA scorecards, live calls, reviews, the activity log and the platform
// overview. summary/timeseries/calls are real and are not mocked.

const svc = 'analytics';
const r = rng(23);
const day = (n) => new Date(Date.now() - n * DAY).toISOString().slice(0, 10);
const DAYS = 14;

const AGENTS = [
  { agent_id: 'front', agent_name: 'Front Desk Assistant', calls: 412, minutes: 1180, success_rate: 0.71, avg_duration: 172 },
  { agent_id: 'book', agent_name: 'Booking Agent', calls: 268, minutes: 934, success_rate: 0.78, avg_duration: 209 },
  { agent_id: 'billing', agent_name: 'Billing Helper', calls: 131, minutes: 322, success_rate: 0.64, avg_duration: 148 },
  { agent_id: 'night', agent_name: 'Night Receptionist', calls: 76, minutes: 164, success_rate: 0.59, avg_duration: 129 },
];

const series = (base) =>
  Array.from({ length: DAYS }, (_, i) => {
    const calls = Math.round(base * (0.6 + r() * 0.8));
    return { day: day(DAYS - 1 - i), calls, successful: Math.round(calls * (0.6 + r() * 0.2)), minutes: Math.round(calls * 2.6) };
  });

const REPORTS = {
  agents: () => AGENTS,
  outcomes: () => [
    { outcome: 'appointment_booked', count: 214, is_success: true },
    { outcome: 'question_answered', count: 301, is_success: true },
    { outcome: 'callback_requested', count: 96, is_success: false },
    { outcome: 'transferred_to_human', count: 58, is_success: false },
    { outcome: 'not_interested', count: 41, is_success: false },
  ],
  funnel: () => [
    { stage: 'Calls received', count: 887 },
    { stage: 'Answered by agent', count: 861 },
    { stage: 'Caller engaged', count: 704 },
    { stage: 'Goal reached', count: 515 },
  ],
  'extracted-fields': () => [
    { field: 'caller_name', count: 612 },
    { field: 'appointment_date', count: 214 },
    { field: 'treatment', count: 188 },
    { field: 'insurance_provider', count: 97 },
  ],
  usage: () => ({
    by_day: series(60).map(({ day, minutes }) => ({ day, minutes })),
    by_agent: AGENTS.map((a) => ({ name: a.agent_name, minutes: a.minutes })),
    by_campaign: [
      { name: 'October check-up reminders', minutes: 640 },
      { name: 'Lapsed patients win-back', minutes: 388 },
    ],
    by_number: [
      { name: '+91 80 4567 8901', minutes: 1420 },
      { name: '+91 80 4567 8902', minutes: 1180 },
    ],
  }),
  cost: () => ({ total: 1842.5, per_call: 2.08, per_success: 3.58, currency: 'USD', forecast_minutes: 3900, plan_minutes: 5000 }),
  quality: () => ({ transfer_rate: 0.07, didnt_know_rate: 0.11, p50_latency_ms: 420, interruptions_per_call: 1.4, long_silences: 23, short_hangups: 41 }),
  sentiment: () => series(60).map(({ day }) => ({ day, positive: Math.round(30 + r() * 20), neutral: Math.round(15 + r() * 10), negative: Math.round(2 + r() * 8) })),
  topics: () => [
    { topic: 'Appointment booking', count: 322 },
    { topic: 'Pricing', count: 174 },
    { topic: 'Insurance', count: 131 },
    { topic: 'Opening hours', count: 98 },
    { topic: 'Cancellation', count: 64 },
  ],
  heatmap: () =>
    Array.from({ length: 7 }, (_, weekday) =>
      Array.from({ length: 24 }, (_, hour) => {
        const work = hour >= 9 && hour <= 18 && weekday < 6;
        const calls = Math.round((work ? 8 + r() * 14 : r() * 3) * (weekday === 5 ? 0.5 : 1));
        return { weekday, hour, calls, connect_rate: calls ? 0.45 + r() * 0.4 : 0 };
      }),
    ).flat(),
  campaigns: () => [
    { name: 'October check-up reminders', calls: 120, connect_rate: 0.64, success_rate: 0.42 },
    { name: 'Lapsed patients win-back', calls: 85, connect_rate: 0.68, success_rate: 0.32 },
  ],
  'phone-numbers': () => [
    { name: '+91 80 4567 8901', calls: 512, connect_rate: 0.81, success_rate: 0.66 },
    { name: '+91 80 4567 8902', calls: 301, connect_rate: 0.77, success_rate: 0.7 },
  ],
};
Object.entries(REPORTS).forEach(([name, fn]) => on(svc, 'GET', `/customer/analytics/${name}`, fn));

on(svc, 'GET', '/customer/analytics/agents/:id/dropoff', () => [
  { step: 'Greeting', reached: 400, dropped: 12 },
  { step: 'Identify caller', reached: 388, dropped: 31 },
  { step: 'Understand request', reached: 357, dropped: 44 },
  { step: 'Check availability', reached: 313, dropped: 38 },
  { step: 'Confirm booking', reached: 275, dropped: 21 },
]);
on(svc, 'GET', '/customer/analytics/agents/:id/latency', () => series(1).map(({ day }) => ({ day, p50: Math.round(380 + r() * 120), p95: Math.round(800 + r() * 300) })));

// Campaign analytics (served by analytics-be, scoped to a campaign)
on(svc, 'GET', '/customer/campaigns/:id/analytics/summary', () => ({ dialed: 96, connected: 61, connect_rate: 0.64, successful: 34, success_rate: 0.56, minutes: 214, avg_duration: 128 }));
on(svc, 'GET', '/customer/campaigns/:id/analytics/funnel', () => [
  { stage: 'Dialed', count: 96 },
  { stage: 'Connected', count: 61 },
  { stage: 'Engaged', count: 47 },
  { stage: 'Goal reached', count: 34 },
]);
on(svc, 'GET', '/customer/campaigns/:id/analytics/outcomes', () => [
  { outcome: 'appointment_booked', count: 34 },
  { outcome: 'callback_requested', count: 15 },
  { outcome: 'not_interested', count: 12 },
]);
on(svc, 'GET', '/customer/campaigns/:id/analytics/timeseries', () => Array.from({ length: 10 }, (_, i) => ({ hour: 9 + i, dialed: Math.round(6 + r() * 14), connected: Math.round(3 + r() * 9) })));
on(svc, 'GET', '/customer/campaigns/:id/analytics/variants', () => []);

// Knowledge gaps
const unanswered = table([
  { id: 'uq-1', question: 'Do you offer teeth whitening for under-18s?', agent_name: 'Front Desk Assistant', occurrences: 7, last_seen_at: ago(3 * HOUR), resolved: false },
  { id: 'uq-2', question: 'Is there parking at the Koramangala clinic?', agent_name: 'Front Desk Assistant', occurrences: 5, last_seen_at: ago(1 * DAY), resolved: false },
  { id: 'uq-3', question: 'Can I pay the bill in instalments?', agent_name: 'Billing Helper', occurrences: 4, last_seen_at: ago(2 * DAY), resolved: false },
]);
on(svc, 'GET', '/customer/analytics/unanswered-questions', () => unanswered.all());

// Saved views, exports, scheduled reports
const views = table([
  { id: 'sv-1', name: 'Last 7 days — all agents', filters: { range: '7d' } },
  { id: 'sv-2', name: 'Booking Agent — last 30 days', filters: { range: '30d', agent_id: 'book' } },
]);
on(svc, 'GET', '/customer/analytics/saved-views', () => views.all());
on(svc, 'POST', '/customer/analytics/saved-views', ({ body }) => views.add(body));
on(svc, 'POST', '/customer/analytics/export', () => ({ id: uid('ex-'), status: 'ready' }));

const exportsT = table([
  { id: 'ex-1', kind: 'calls', status: 'ready', created_at: ago(1 * DAY), expires_at: ahead(6 * DAY), download_url: '#' },
  { id: 'ex-2', kind: 'transcripts', status: 'ready', created_at: ago(4 * DAY), expires_at: ahead(3 * DAY), download_url: '#' },
]);
on(svc, 'GET', '/customer/exports', () => exportsT.all());
on(svc, 'POST', '/customer/exports', ({ body }) => exportsT.add({ kind: body.kind, status: 'ready', expires_at: ahead(7 * DAY), download_url: '#' }));

let reports = [{ id: 'rep-1', name: 'Weekly performance', view_id: 'sv-1', frequency: 'weekly', recipients: ['owner@acme.test'], is_enabled: true }];
on(svc, 'GET', '/customer/scheduled-reports', () => reports);
on(svc, 'PUT', '/customer/scheduled-reports', ({ body }) => {
  reports = (Array.isArray(body) ? body : (body.reports ?? body.items ?? [])).map((x) => ({ id: x.id ?? uid('rep-'), ...x }));
  return reports;
});

// QA, live calls, reviews
let scorecards = [
  { id: 'qa-1', name: 'Standard call quality', is_default: true, criteria: [{ name: 'Greeting', description: 'Greets the caller and states the business name', weight: 20 }, { name: 'Accuracy', description: 'Gives correct information', weight: 40 }, { name: 'Tone', description: 'Polite and natural', weight: 20 }, { name: 'Resolution', description: 'Caller’s need is resolved', weight: 20 }] },
];
on(svc, 'GET', '/customer/qa-scorecards', () => scorecards);
on(svc, 'PUT', '/customer/qa-scorecards', ({ body }) => {
  scorecards = (Array.isArray(body) ? body : (body.scorecards ?? scorecards)).map((s) => ({ id: s.id ?? uid('qa-'), ...s }));
  return scorecards;
});
on(svc, 'GET', '/customer/calls/live', () => [
  { id: 'live-1', agent_name: 'Front Desk Assistant', contact_name: 'Meera Joshi', direction: 'inbound', from_number: '+91 98450 11122', to_number: '+91 80 4567 8901', started_at: ago(94 * 1000), status: 'in_progress' },
  { id: 'live-2', agent_name: 'Booking Agent', contact_name: 'Karthik Iyer', direction: 'outbound', from_number: '+91 80 4567 8902', to_number: '+91 98450 33344', started_at: ago(41 * 1000), status: 'in_progress' },
]);
const reviews = new Map();
on(svc, 'GET', '/customer/calls/:id/reviews', ({ params }) => reviews.get(params.id) ?? []);
on(svc, 'POST', '/customer/calls/:id/reviews', ({ params, body }) => {
  const card = scorecards[0];
  const total = Math.round(card.criteria.reduce((s, c) => s + ((body.scores?.[c.name] ?? 0) / 5) * c.weight, 0));
  const rv = { id: uid('rv-'), total_score: total, reviewer: 'You', created_at: new Date().toISOString(), comments: body.comments ?? [] };
  reviews.set(params.id, [rv, ...(reviews.get(params.id) ?? [])]);
  return rv;
});
on(svc, 'POST', '/customer/calls/:id/listen', () => ({ url: '#', expires_in: 300 }));
on(svc, 'POST', '/customer/calls/:id/takeover', () => ({ ok: true }));

// Activity log (customer) and platform audit log (admin)
const ACTIONS = [
  ['agent.published', 'Front Desk Assistant', 'Priya Shah'],
  ['staff.invited', 'rahul@acme.test', 'Acme Owner'],
  ['campaign.started', 'October check-up reminders', 'Priya Shah'],
  ['number.assigned', '+91 80 4567 8901', 'Acme Owner'],
  ['tool.created', 'check_availability', 'Priya Shah'],
  ['webhook.created', 'https://hooks.acme.example/voice', 'Acme Owner'],
  ['plan.changed', 'Growth', 'Acme Owner'],
];
const auditRows = (tenant) =>
  Array.from({ length: 28 }, (_, i) => {
    const [action, entity_name, actor_name] = ACTIONS[i % ACTIONS.length];
    return { id: `au-${i}`, action, entity_name, actor_name, actor_type: tenant ? 'platform_admin' : 'tenant_user', tenant_name: tenant ? ['Acme Voice', 'Globex Health', 'Initech Dental'][i % 3] : undefined, created_at: ago((i + 1) * 3 * HOUR) };
  });
const auditPage = (rows, { query }) => {
  const filtered = rows.filter((x) => !query.q || `${x.action} ${x.entity_name}`.toLowerCase().includes(String(query.q).toLowerCase()));
  return page(filtered, { limit: query.limit ?? 50, offset: query.offset ?? 0 });
};
on(svc, 'GET', '/customer/audit-log', (ctx) => auditPage(auditRows(false), ctx));
on(svc, 'GET', '/admin/audit-log', (ctx) => auditPage(auditRows(true), ctx));

// Platform overview (admin). Ranks the real customers so the links work.
on(svc, 'GET', '/admin/analytics/summary', () => ({
  live_calls: 7,
  minutes_month: 48210,
  revenue_month: 18420,
  failing_calls_24h: 12,
  timeseries: series(380).map(({ day, calls }) => ({ day, calls })),
}));
on(svc, 'GET', '/admin/analytics/customers', async ({ live }) => {
  const res = await live?.('auth', '/admin/customers', { limit: 8 });
  const tenants = res?.items ?? [];
  const base = tenants.length ? tenants : [{ id: 'demo-1', name: 'Acme Voice' }];
  return base.slice(0, 8).map((t, i) => ({
    tenant_id: t.id,
    tenant_name: t.name,
    plan: ['Growth', 'Starter', 'Scale', 'Starter'][i % 4],
    calls: Math.round(2400 / (i + 1.4)),
    minutes: Math.round(7100 / (i + 1.6)),
    revenue: Math.round(4200 / (i + 1.8)),
    failure_rate: [0.03, 0.05, 0.12, 0.04, 0.02, 0.08, 0.15, 0.06][i % 8],
  }));
});
