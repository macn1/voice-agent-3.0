# Aurlynn — frontend

Customer dashboard + platform admin console for the Voice AI platform
(see `../claude-data`). Frontend only — no backend or database lives here.

Vite 6 · React 19 · TypeScript · React Router 7 · lucide-react · plain CSS design tokens
(`src/styles/global.css`, measured from the reference home screen; `modules.css` for module UI).

## Run

```bash
npm install
cp .env.example .env    # optional
npm run dev             # http://localhost:5173
npm run build           # typecheck + production build into dist/
```

In dev, Vite proxies `/<service>/api/*` to `VITE_PROXY_TARGET`. In production serve `dist/`
from the same domain as the ingress, with SPA fallback to `index.html`.

## How API calls are routed

`src/lib/services.ts` sends each call to its owning service at `PREFIX[service] + /api/v1/...`
(prefixes configurable in `.env`). Typed clients:

| File | Covers |
|---|---|
| `src/lib/api.ts` | Everything in the Postman collection (auth + billing, both realms) |
| `src/lib/endpoints.ts` | Every *proposed* endpoint in `FEATURE-TICKETS.md`, tagged with its ticket ID, plus the documented gap routes on auth/billing |
| `src/lib/types.ts` | Shapes for the proposed services, column-for-column from `DB-DESIGN.md` |

When a route isn't deployed yet (404 / 405 / 501 / gateway error / HTML fallback), the screen
shows **"Not available yet"** with the exact method and path it called, plus a *Check again*
button. Nothing is faked. As each backend ships its routes, the screens start working.

## Screens

**Customer** — Home (reference design + today's KPIs, needs-attention, recent calls) ·
Build hub · Agents list / new (template, describe, blank, import) · Agent editor with tabs:
Identity, Conversation (with `{{variable}}` autocomplete, validation, autosave), Variables,
Rules (+ presets), Behaviour, Voice, Languages, Knowledge, Tools, Follow-ups, Analysis &
outcomes, Compliance, Tests, Insights, Versions (publish / rollback), Web & chat widgets,
Settings (pause, model/providers, memory, export, duplicate, delete) · Test panel (chat, browser
voice, call my phone) · Publish dialog (diff, validation, failed-test warning) · Company profile
(+ autofill from website) · Tools (+ test runner) · Workflows (call triggers + run log,
scheduled calls, follow-up message log, agent teams) · Knowledge (sources, ask a question,
unanswered questions) · Phone numbers (assign agent, buy, own carrier/SIP, holidays) · Number
routing (+ "what happens if someone calls now") · Inbound (live + recent) · Campaigns (list,
4-step CSV wizard, detail: overview / contacts + attempts / analytics / settings + A/B) ·
Contacts (import with mapping, lists, custom fields, detail timeline) · Deploy with code (API
keys, webhooks + deliveries, quickstart) · Integrations (catalog; CRM sync, call logging, caller
lookup, CRM triggers; helpdesk tickets; calendar booking + appointments; Google Sheets;
automation) · WhatsApp & SMS (connect, templates with phone preview, chat agent) · Inbox
(takeover / hand back, 24-hour window) · Broadcasts · Analytics (overview, outcomes, usage &
cost, quality, patterns heat map; saved views, export, email reports) · Call logs · Call detail
(player synced to transcript, summary, extracted fields, outcome/tags, review, CRM push) · Live
calls (listen, take over) · Quality review (queue, scorecards) · Docs (API reference) ·
Notifications bell · Settings: Profile (+ change password), Team (+ resend invite), Roles &
permissions, Plan, Usage, Invoices, Payment methods, Credits, Do-not-call, Calling rules,
Privacy (+ delete a caller's data), Activity log, Notifications, Pronunciations, Custom
voices, Exports & reports, Sub-accounts · Sign-up, verify email, accept invite, forgot /
reset password, onboarding checklist.

**Admin** — Overview · Customers (+ detail: overview, domains with verify, settings, plan with
current plan + history, invoices with detail, usage, numbers) · Plans · Number pool · Agent
templates · Staff · Roles & permissions · Audit log.

## Notes

- Team, Roles and every Settings page are always visible; if a role lacks a permission the API
  answers 403 and the page says so. Permission codes are read from `/me` as strings or `{code}`.
- Role editors use the permission catalog route when it exists (CUS-04.4 / ADM-07.4), else the
  codes documented in the Postman collection (`src/lib/permissions.ts`).
- Response shapes for lists/usage aren't documented; `src/lib/normalize.ts` accepts the likely
  variants for the existing auth/billing routes.
