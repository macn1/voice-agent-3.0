import { ago, DAY, HOUR, MockError, on, page, table, uid } from '../engine';

// Remaining gaps: account-level routes in voice-auth-be (API keys, privacy,
// sub-accounts), the credit wallet in voice-billing-be, routing holidays and
// carrier connections, and the platform console's agent list. Demo data only.

// API keys ----------------------------------------------------------------------
const keys = table([
  { id: 'key-1', name: 'Website backend', key_prefix: 'vk_live_a81f', scopes: ['calls:write', 'calls:read'], created_at: ago(30 * DAY), last_used_at: ago(2 * HOUR), revoked_at: null },
  { id: 'key-2', name: 'Zapier', key_prefix: 'vk_live_3c9d', scopes: ['calls:read'], created_at: ago(11 * DAY), last_used_at: ago(1 * DAY), revoked_at: null },
]);
on('auth', 'GET', '/customer/api-keys', () => keys.all());
on('auth', 'POST', '/customer/api-keys', ({ body }) => {
  const secret = `vk_live_${uid()}${uid()}`;
  const k = keys.add({ name: body.name, scopes: body.scopes ?? [], key_prefix: secret.slice(0, 12), last_used_at: null, revoked_at: null });
  return { ...k, secret };
});
on('auth', 'DELETE', '/customer/api-keys/:id', ({ params }) => keys.patch(params.id, { revoked_at: new Date().toISOString() }));

// Privacy -----------------------------------------------------------------------
let privacy = { transcript_retention_days: 90, recording_retention_days: 30, redact_pii: true, redaction_types: ['card_number', 'aadhaar'] };
on('auth', 'GET', '/customer/privacy-settings', () => privacy);
on('auth', 'PUT', '/customer/privacy-settings', ({ body }) => (privacy = { ...privacy, ...body }));
on('auth', 'POST', '/customer/privacy/delete-request', ({ body }) => ({ id: uid('dr-'), phone: body.phone, status: 'received' }));

// Sub-accounts ------------------------------------------------------------------
const subs = table([
  { id: 'sub-1', name: 'Acme — Whitefield branch', slug: 'acme-whitefield', status: 'active' },
  { id: 'sub-2', name: 'Acme — Indiranagar branch', slug: 'acme-indiranagar', status: 'active' },
]);
on('auth', 'GET', '/customer/sub-accounts', () => subs.all());
on('auth', 'POST', '/customer/sub-accounts', ({ body }) => subs.add({ name: body.name, slug: String(body.name ?? '').toLowerCase().replace(/\W+/g, '-'), status: 'active' }));
on('auth', 'POST', '/customer/sub-accounts/:id/switch', () => {
  throw new MockError(501, 'not_implemented', 'Switching accounts is not available in the demo.');
});

// Credit wallet -------------------------------------------------------------------
const wallet = { balance: 12500, currency: 'INR', auto_recharge: { enabled: false, threshold: 1000, amount: 5000 } };
const txs = table([
  { id: 'wt-1', type: 'top_up', amount: 10000, balance_after: 12500, reason: 'Manual top-up', created_at: ago(6 * DAY) },
  { id: 'wt-2', type: 'usage', amount: -1840, balance_after: 2500, reason: 'Overage minutes — September', created_at: ago(12 * DAY) },
  { id: 'wt-3', type: 'top_up', amount: 5000, balance_after: 4340, reason: 'Auto recharge', created_at: ago(26 * DAY) },
]);
on('billing', 'GET', '/customer/billing/wallet', () => wallet);
on('billing', 'POST', '/customer/billing/wallet/top-up', ({ body }) => {
  const amount = Number(body.amount) || 0;
  wallet.balance += amount;
  txs.add({ type: 'top_up', amount, balance_after: wallet.balance, reason: 'Manual top-up' });
  return wallet;
});
on('billing', 'GET', '/customer/billing/wallet/transactions', () => txs.all());
on('billing', 'PUT', '/customer/billing/wallet/auto-recharge', ({ body }) => (wallet.auto_recharge = body));

// Numbers: routing holidays and carrier connections ------------------------------
let holidays = [
  { id: 'hol-1', name: 'Diwali', date: '2026-11-08', open: false, ranges: [] },
  { id: 'hol-2', name: 'Christmas Eve', date: '2026-12-24', open: true, ranges: [{ from: '09:00', to: '13:00' }] },
];
on('inbound', 'GET', '/customer/routing/holidays', () => holidays);
on('inbound', 'PUT', '/customer/routing/holidays', ({ body }) => {
  holidays = (Array.isArray(body) ? body : (body.holidays ?? body.items ?? [])).map((h) => ({ id: h.id ?? uid('hol-'), ...h }));
  return holidays;
});
const connections = table([{ id: 'con-1', provider: 'twilio', type: 'sip_trunk', status: 'connected', created_at: ago(40 * DAY) }]);
on('telephony', 'GET', '/customer/telephony/connections', () => connections.all());
on('telephony', 'POST', '/customer/telephony/connections', ({ body }) => connections.add({ status: 'connected', ...body }));

// Platform console: agents across customers -----------------------------------------
// The flow service only exposes /customer/agents and answers 403 to a platform
// admin token, so the console shows a demo roster tied to the real customers.
const AGENT_NAMES = [
  ['Front Desk Assistant', 'live', ['reception', 'inbound'], 'en-IN', 412],
  ['Booking Agent', 'live', ['booking'], 'en-IN', 268],
  ['Payment Reminder', 'paused', ['collections', 'outbound'], 'hi-IN', 0],
  ['Night Receptionist', 'live', ['after-hours'], 'en-IN', 76],
  ['Lead Qualifier', 'draft', ['sales'], 'en-IN', 0],
  ['Support Triage', 'live', ['support'], 'en-US', 189],
];
let adminAgents = null;
async function roster(live) {
  if (adminAgents) return adminAgents;
  const res = await live?.('auth', '/admin/customers', { limit: 6 });
  const tenants = res?.items?.length ? res.items : [{ id: 'demo-tenant', name: 'Demo customer' }];
  adminAgents = table(
    AGENT_NAMES.map(([name, status, tags, language, calls_7d], i) => ({
      id: `adm-agent-${i + 1}`,
      tenant_id: tenants[i % tenants.length].id,
      name,
      status,
      tags,
      language,
      calls_7d,
      numbers: status === 'draft' ? [] : [`+91 80 4567 ${8900 + i}`],
      description: `${name} for ${tenants[i % tenants.length].name}.`,
      timezone: 'Asia/Kolkata',
      max_concurrent_calls: 5,
      has_unpublished_changes: status === 'draft',
      last_published_at: status === 'draft' ? null : ago((i + 1) * DAY),
      created_at: ago((i + 10) * DAY),
      updated_at: ago((i + 1) * DAY),
    })),
  );
  return adminAgents;
}
const A = { realm: 'admin' };
on('flow', 'GET', '/customer/agents', async ({ query, live }) => {
  const t = await roster(live);
  const rows = t.all().filter((a) => !query.status || a.status === query.status);
  return page(rows, { limit: query.limit ?? 200, offset: query.offset ?? 0 });
}, A);
on('flow', 'POST', '/customer/agents', async ({ body, live }) => (await roster(live)).add({ status: 'draft', tags: [], numbers: [], calls_7d: 0, has_unpublished_changes: true, ...body }), A);
on('flow', 'GET', '/customer/agents/:id', async ({ params, live }) => (await roster(live)).must(params.id, 'agent'), A);
on('flow', 'PATCH', '/customer/agents/:id', async ({ params, body, live }) => (await roster(live)).patch(params.id, body), A);
on('flow', 'DELETE', '/customer/agents/:id', async ({ params, live }) => (await roster(live)).remove(params.id), A);
on('flow', 'POST', '/customer/agents/:id/pause', async ({ params, live }) => {
  const a = (await roster(live)).must(params.id, 'agent');
  if (a.status === 'draft') throw new MockError(409, 'agent_not_published', 'Only a published agent can be paused');
  return (await roster(live)).patch(params.id, { status: 'paused' });
}, A);
on('flow', 'POST', '/customer/agents/:id/resume', async ({ params, live }) => (await roster(live)).patch(params.id, { status: 'live' }), A);
on('flow', 'PUT', '/customer/agents/:id/flow/draft', async ({ params, body, live }) => (await roster(live)).patch(params.id, { ...body, has_unpublished_changes: true }), A);
