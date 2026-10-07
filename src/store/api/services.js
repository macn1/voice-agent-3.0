// One path prefix per backend service at the ingress (DEMO-PATH D-05).
// Only voice-auth-be and voice-billing-be are deployed today; the others'
// endpoints are proposed in FEATURE-TICKETS.md and answer "not available"
// until they ship.

const env = import.meta.env;

export const API_BASE = (env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

export const SERVICE_LABEL = {
  auth: 'voice-auth-be',
  billing: 'voice-billing-be',
  flow: 'voice-flow-be',
  telephony: 'voice-telephony-be',
  inbound: 'voice-inbound-be',
  outbound: 'voice-outbound-be',
  analytics: 'voice-analytics-be',
  integration: 'voice-integration-be',
};

export const PREFIX = {
  auth: env.VITE_AUTH_PREFIX ?? '/auth',
  billing: env.VITE_BILLING_PREFIX ?? '/billing',
  flow: env.VITE_FLOW_PREFIX ?? '/flow',
  telephony: env.VITE_TELEPHONY_PREFIX ?? '/telephony',
  inbound: env.VITE_INBOUND_PREFIX ?? '/inbound',
  outbound: env.VITE_OUTBOUND_PREFIX ?? '/outbound',
  analytics: env.VITE_ANALYTICS_PREFIX ?? '/analytics',
  integration: env.VITE_INTEGRATION_PREFIX ?? '/integration',
};

/**
 * Request descriptor used by every endpoint:
 * { service, realm, url, method?, body?, params? }
 * `realm` decides which session's token is sent (null = public route).
 */
export const req =
  (service, realm) =>
  (url, extra = {}) => ({ service, realm, url: `/api/v1${url}`, ...extra });

// Customer-realm builders, one per service.
export const C = {
  auth: req('auth', 'customer'),
  billing: req('billing', 'customer'),
  flow: req('flow', 'customer'),
  telephony: req('telephony', 'customer'),
  inbound: req('inbound', 'customer'),
  outbound: req('outbound', 'customer'),
  analytics: req('analytics', 'customer'),
  integration: req('integration', 'customer'),
};

// Admin-realm builders.
export const A = {
  auth: req('auth', 'admin'),
  billing: req('billing', 'admin'),
  flow: req('flow', 'admin'),
  telephony: req('telephony', 'admin'),
  analytics: req('analytics', 'admin'),
};

// Public (no token) builders.
export const P = {
  auth: req('auth', null),
  billing: req('billing', null),
  outbound: req('outbound', null),
};
