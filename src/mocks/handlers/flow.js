import { ago, DAY, HOUR, MIN, MockError, on, table, uid } from '../engine';

// voice-flow-be routes the backend does not serve yet: knowledge bases, tools,
// pronunciations, custom voices, agent teams (Crew), templates, test runs and
// the less common agent-editor sections. Demo data only.

const kbs = table([
  { id: 'kb-clinic', name: 'Clinic FAQs & policies', description: 'Opening hours, insurance, cancellation and fees.', sources_count: 4, agents_count: 2, created_at: ago(30 * DAY), updated_at: ago(2 * DAY) },
  { id: 'kb-services', name: 'Services & pricing', description: 'Treatment menu with prices and durations.', sources_count: 3, agents_count: 1, created_at: ago(21 * DAY), updated_at: ago(5 * DAY) },
  { id: 'kb-onboarding', name: 'New patient onboarding', description: 'What to bring, forms to fill, first-visit checklist.', sources_count: 2, agents_count: 1, created_at: ago(12 * DAY), updated_at: ago(1 * DAY) },
]);

const sources = {
  'kb-clinic': table([
    { id: 's1', type: 'file', title: 'Patient handbook 2026.pdf', status: 'ready', last_synced_at: ago(2 * DAY) },
    { id: 's2', type: 'url', title: 'Clinic website', url: 'https://www.acme-clinic.example/faq', status: 'ready', resync_schedule: 'weekly', last_synced_at: ago(1 * DAY) },
    { id: 's3', type: 'faq', title: 'Insurance FAQs (18 entries)', status: 'ready', last_synced_at: ago(6 * DAY) },
    { id: 's4', type: 'text', title: 'Cancellation policy', status: 'ready', last_synced_at: ago(9 * DAY) },
  ]),
  'kb-services': table([
    { id: 's5', type: 'file', title: 'Price list October.xlsx', status: 'ready', last_synced_at: ago(5 * DAY) },
    { id: 's6', type: 'url', title: 'Treatments page', url: 'https://www.acme-clinic.example/treatments', status: 'processing' },
    { id: 's7', type: 'file', title: 'Legacy brochure.docx', status: 'failed', error: 'Could not extract text from this file.' },
  ]),
  'kb-onboarding': table([
    { id: 's8', type: 'file', title: 'New patient forms.pdf', status: 'ready', last_synced_at: ago(1 * DAY) },
    { id: 's9', type: 'text', title: 'First visit checklist', status: 'ready', last_synced_at: ago(1 * DAY) },
  ]),
};

const tools = table([
  { id: 't-book', name: 'check_availability', description: 'Look up free appointment slots for a date and treatment.', method: 'GET', url: 'https://api.acme-clinic.example/v1/slots', headers: [{ key: 'X-Api-Key', value: '' }], has_secret: true, parameters: [{ name: 'date', type: 'string', required: true, description: 'ISO date, e.g. 2026-10-20' }, { name: 'treatment', type: 'string', required: false, description: 'Treatment code' }], timeout_ms: 5000, wait_message: 'One moment while I check the diary.', last_status: '200', agents_count: 2, updated_at: ago(1 * DAY) },
  { id: 't-create', name: 'create_appointment', description: 'Book an appointment for the caller.', method: 'POST', url: 'https://api.acme-clinic.example/v1/appointments', headers: [], has_secret: true, parameters: [{ name: 'patient_name', type: 'string', required: true, description: 'Full name' }, { name: 'phone', type: 'string', required: true, description: 'Caller phone number' }, { name: 'slot_id', type: 'string', required: true, description: 'Slot from check_availability' }], timeout_ms: 8000, wait_message: 'Booking that for you now.', last_status: '201', agents_count: 1, updated_at: ago(3 * DAY) },
  { id: 't-crm', name: 'lookup_patient', description: 'Find an existing patient record by phone number.', method: 'GET', url: 'https://crm.acme-clinic.example/api/patients', headers: [], has_secret: false, parameters: [{ name: 'phone', type: 'string', required: true, description: 'E.164 phone number' }], timeout_ms: 4000, wait_message: '', last_status: '404', agents_count: 1, updated_at: ago(7 * DAY) },
]);

const pronunciations = { items: [{ word: 'Aurlynn', say_as: 'AWR-lin', language: 'en-IN' }, { word: 'Dr. Iyer', say_as: 'doctor EYE-er', language: 'en-IN' }, { word: 'Koramangala', say_as: 'ko-ra-MANG-uh-la', language: 'en-IN' }] };

const voices = table([
  { id: 'cv-1', name: 'Anita (brand voice)', language: 'en-IN', status: 'ready', created_at: ago(14 * DAY), preferences: { consent: true } },
  { id: 'cv-2', name: 'Rahul — support', language: 'hi-IN', status: 'processing', created_at: ago(1 * HOUR), preferences: { consent: true } },
]);

const teams = table([
  { id: 'team-1', name: 'Front desk crew', description: 'Greets callers, then hands off to specialists.', members: [{ agent_id: 'front', agent_name: 'Front Desk Assistant', role: 'Router' }, { agent_id: 'billing', agent_name: 'Billing Helper', role: 'Specialist' }, { agent_id: 'book', agent_name: 'Booking Agent', role: 'Specialist' }], handoff_rules: [{ id: 'h1', when: 'Caller asks about an invoice or payment', to_agent_id: 'billing' }, { id: 'h2', when: 'Caller wants to book or move an appointment', to_agent_id: 'book' }], created_at: ago(10 * DAY) },
  { id: 'team-2', name: 'After-hours crew', description: 'Takes messages and books callbacks overnight.', members: [{ agent_id: 'night', agent_name: 'Night Receptionist', role: 'Router' }, { agent_id: 'book', agent_name: 'Booking Agent', role: 'Specialist' }], handoff_rules: [{ id: 'h3', when: 'Caller reports an emergency', to_agent_id: 'night' }], created_at: ago(4 * DAY) },
]);

const templates = table([
  { id: 'tpl-reception', name: 'Clinic receptionist', category: 'Healthcare', description: 'Answers calls, books appointments and shares clinic information.', language: 'en-IN' },
  { id: 'tpl-support', name: 'Customer support', category: 'Support', description: 'Handles order, billing and account questions with human handoff.', language: 'en-IN' },
  { id: 'tpl-sales', name: 'Sales qualifier', category: 'Sales', description: 'Qualifies inbound leads and books demos.', language: 'en-IN' },
  { id: 'tpl-collections', name: 'Payment reminder', category: 'Finance', description: 'Politely reminds customers about due invoices.', language: 'en-IN' },
]);

const scenarios = table([
  { id: 'sc-1', name: 'Books a new appointment', expected: 'Agent confirms date, time and sends SMS', created_at: ago(8 * DAY) },
  { id: 'sc-2', name: 'Asks about insurance cover', expected: 'Agent cites the insurance FAQ', created_at: ago(8 * DAY) },
  { id: 'sc-3', name: 'Angry caller wants a manager', expected: 'Agent transfers to a human', created_at: ago(6 * DAY) },
]);

const runs = table([
  { id: 'run-1', status: 'completed', passed: 3, failed: 0, total: 3, created_at: ago(2 * DAY) },
  { id: 'run-2', status: 'completed', passed: 2, failed: 1, total: 3, created_at: ago(5 * DAY) },
]);

const svc = 'flow';
const withCounts = () => kbs.all().map((k) => ({ ...k, sources_count: sources[k.id]?.all().length ?? k.sources_count }));

// Knowledge bases
on(svc, 'GET', '/customer/knowledge-bases', withCounts);
on(svc, 'POST', '/customer/knowledge-bases', ({ body }) => {
  const kb = kbs.add({ name: body.name, description: body.description ?? '', sources_count: 0, agents_count: 0 });
  sources[kb.id] = table([]);
  return kb;
});
on(svc, 'GET', '/customer/knowledge-bases/:id/sources', ({ params }) => (sources[params.id] ??= table([])).all());
on(svc, 'POST', '/customer/knowledge-bases/:id/sources', ({ params, body }) =>
  (sources[params.id] ??= table([])).add({
    type: body.type ?? 'text',
    title: body.title ?? body.url ?? 'Untitled source',
    url: body.url,
    status: 'ready',
    last_synced_at: new Date().toISOString(),
  }),
);
on(svc, 'DELETE', '/customer/knowledge-bases/:id/sources/:sid', ({ params }) => sources[params.id]?.remove(params.sid) ?? null);
on(svc, 'POST', '/customer/knowledge-bases/:id/sources/:sid/resync', ({ params }) => sources[params.id]?.patch(params.sid, { status: 'ready', error: undefined, last_synced_at: new Date().toISOString() }));
on(svc, 'POST', '/customer/knowledge-bases/:id/query', ({ body }) => ({
  answer: `Based on your documents: ${/insur/i.test(body.question) ? 'we accept most major insurers; the front desk verifies cover before your visit.' : /cancel/i.test(body.question) ? 'appointments can be cancelled free of charge up to 24 hours before the visit.' : 'the clinic is open Monday to Saturday, 9 AM to 7 PM.'}`,
  passages: [
    { source: 'Patient handbook 2026.pdf', score: 0.91, text: 'Appointments may be cancelled or rescheduled up to 24 hours in advance without a fee.' },
    { source: 'Insurance FAQs (18 entries)', score: 0.84, text: 'We work with all major insurers. Please bring your policy card to the first visit.' },
  ],
}));

// Tools
on(svc, 'GET', '/customer/tools', () => tools.all());
on(svc, 'POST', '/customer/tools', ({ body }) => tools.add({ agents_count: 0, headers: [], parameters: [], ...body, has_secret: !!body.secret }));
on(svc, 'PATCH', '/customer/tools/:id', ({ params, body }) => tools.patch(params.id, body));
on(svc, 'DELETE', '/customer/tools/:id', ({ params }) => tools.remove(params.id));
on(svc, 'POST', '/customer/tools/:id/test', ({ params }) => {
  tools.patch(params.id, { last_status: '200' });
  return { status: 200, ok: true, latency_ms: 214, response: { ok: true, slots: ['10:00', '11:30', '15:00'] } };
});

// Pronunciations, voices, teams
on(svc, 'GET', '/customer/pronunciations', () => pronunciations.items);
on(svc, 'PUT', '/customer/pronunciations', ({ body }) => {
  pronunciations.items = body.items ?? body.pronunciations ?? pronunciations.items;
  return pronunciations.items;
});
on(svc, 'GET', '/customer/voices', () => voices.all());
on(svc, 'POST', '/customer/voices', ({ body }) => voices.add({ status: 'processing', language: 'en-IN', ...body }));
on(svc, 'DELETE', '/customer/voices/:id', ({ params }) => voices.remove(params.id));
on(svc, 'GET', '/customer/agent-teams', () => teams.all());
on(svc, 'POST', '/customer/agent-teams', ({ body }) => teams.add({ members: [], handoff_rules: [], ...body }));
on(svc, 'PUT', '/customer/agent-teams/:id', ({ params, body }) => teams.patch(params.id, body));

// Templates and generator
on(svc, 'GET', '/customer/agent-templates', () => templates.all());
on(svc, 'POST', '/customer/agents/generate-draft', ({ body }) => ({
  name: 'Generated agent',
  greeting: 'Hello, thanks for calling. How can I help you today?',
  system_prompt: `You are a helpful voice agent. Goal: ${String(body.description ?? '').slice(0, 200)}`,
}));

// Test scenarios & runs
on(svc, 'GET', '/customer/agents/:id/test-scenarios', () => scenarios.all());
on(svc, 'POST', '/customer/agents/:id/test-scenarios', ({ body }) => scenarios.add(body));
on(svc, 'GET', '/customer/agents/:id/test-runs', () => runs.all());
on(svc, 'POST', '/customer/agents/:id/test-runs', () => runs.add({ status: 'completed', passed: scenarios.all().length, failed: 0, total: scenarios.all().length }));
on(svc, 'POST', '/customer/agents/:id/test-session', () => ({ session_id: uid('ts-'), expires_at: new Date(Date.now() + 15 * MIN).toISOString() }));
on(svc, 'POST', '/customer/agents/:id/test-call', () => ({ call_id: uid('tc-'), status: 'ringing' }));

// Agent documents
const agentDocs = table([]);
on(svc, 'GET', '/customer/agents/:id/kb-documents', () => agentDocs.all());
on(svc, 'POST', '/customer/agents/:id/kb-documents', ({ body }) => agentDocs.add({ title: body.title, size: body.size, status: 'ready' }));
on(svc, 'DELETE', '/customer/agents/:id/kb-documents/:docId', ({ params }) => agentDocs.remove(params.docId));

// Agent editor sections the backend has no route for yet. Stored per agent.
const SECTION_DEFAULTS = {
  'speech-settings': { voice_id: '', speed: 1, interruption_sensitivity: 0.5, backchannel: true },
  keywords: { items: [] },
  languages: { primary: 'en-IN', extras: [], detection: 'auto' },
  'model-settings': { llm: '', asr_provider: '', tts_provider: '', temperature: 0.4 },
  'memory-settings': { enabled: true, remember_callers: true, retention_days: 90 },
  'knowledge-bases': [],
  tools: [],
  'follow-ups': [],
  widget: { enabled: false, widget_key: 'wk_demo_8f3a21' },
  webchat: { enabled: false, widget_key: 'wk_demo_chat_41c9' },
  'chat-settings': { whatsapp_enabled: false, sms_enabled: false },
};
const sectionStore = new Map();
Object.entries(SECTION_DEFAULTS).forEach(([path, def]) => {
  const key = (id) => `${id}:${path}`;
  on(svc, 'GET', `/customer/agents/:id/${path}`, ({ params }) => sectionStore.get(key(params.id)) ?? def);
  on(svc, 'PUT', `/customer/agents/:id/${path}`, ({ params, body }) => {
    const next = Array.isArray(def) ? (body.knowledge_base_ids ?? body.tool_ids ?? body) : body;
    sectionStore.set(key(params.id), next);
    return next;
  });
});

on(svc, 'POST', '/customer/agents/:id/duplicate', () => {
  throw new MockError(501, 'not_implemented', 'Duplicating agents is not available in the demo yet.');
});
