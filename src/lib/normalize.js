// The design docs fix the column names but not the exact JSON shapes of list
// and summary responses, so these helpers accept the plausible variants.

export function asList(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    const o = data;
    for (const key of ['items', 'data', 'results', 'customers', 'staff', 'roles', 'packages', 'invoices', 'domains', 'payment_methods']) {
      if (Array.isArray(o[key])) return o[key];
    }
  }
  return [];
}

export function listTotal(data) {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const o = data;
    const t = o.total ?? o.total_count ?? o.count ?? o.meta?.total;
    if (typeof t === 'number') return t;
  }
  return undefined;
}

export const roleLabel = (r) => (typeof r === 'string' ? r : r.name);
export const roleId = (r) => (typeof r === 'string' ? r : r.id);

export function rolePermissionCodes(role) {
  return (role.permissions ?? []).map((p) => (typeof p === 'string' ? p : p.code));
}

/** Decodes a JWT payload without verifying it (verification is the server's job). */
export function decodeJwt(token) {
  if (!token) return null;
  try {
    const part = token.split('.')[1];
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decodeURIComponent(escape(json)));
  } catch {
    return null;
  }
}

/**
 * Permission codes for the signed-in subject: from /me when present, otherwise
 * from the access-token claims. `null` means "unknown" — the UI then shows
 * everything and lets the API enforce access.
 */
export function permissionsOf(profile, accessToken) {
  // Codes may arrive as strings or as { code } objects.
  const code = (p) => (typeof p === 'string' ? p : (p?.code ?? ''));
  const fromProfile = profile?.permissions;
  if (Array.isArray(fromProfile) && fromProfile.length) return new Set(fromProfile.map(code).filter(Boolean));
  if (Array.isArray(profile?.roles)) {
    const codes = profile.roles.flatMap((r) => (typeof r === 'string' ? [] : rolePermissionCodes(r)));
    if (codes.length) return new Set(codes);
  }
  const claims = decodeJwt(accessToken);
  const perms = claims?.permissions ?? claims?.perms ?? claims?.scopes;
  if (Array.isArray(perms)) return new Set(perms);
  return null;
}

export function packageOf(sub, catalog) {
  if (!sub) return undefined;
  return sub.package ?? catalog.find((p) => p.id === sub.package_id);
}

const num = (v) => (v == null || v === '' ? undefined : Number(v));

/** Accepts `{metrics: {...}}`, `{call_minutes: n}`, `[{metric_type, quantity}]`, `{records|items: [...]}`. */
export function normalizeUsage(data) {
  const out = { callMinutes: 0, activeAgents: 0, apiCalls: 0 };
  if (!data || typeof data !== 'object') return out;
  const o = data;

  const add = (metric, qty) => {
    const q = Number(qty) || 0;
    if (metric === 'call_minutes') out.callMinutes += q;
    else if (metric === 'active_agents') out.activeAgents = Math.max(out.activeAgents, q);
    else if (metric === 'api_calls') out.apiCalls += q;
  };

  const rows = Array.isArray(data) ? data : asList(o.records ?? o.items ?? o.usage ?? o.metrics);
  if (rows.length) {
    rows.forEach((r) => add(String(r.metric_type ?? r.metric ?? ''), r.quantity ?? r.total ?? r.value));
  } else {
    const src = o.metrics && typeof o.metrics === 'object' ? o.metrics : o.totals && typeof o.totals === 'object' ? o.totals : o;
    for (const key of ['call_minutes', 'active_agents', 'api_calls']) {
      const v = src[key];
      if (v && typeof v === 'object') add(key, v.used ?? v.quantity);
      else if (v != null) add(key, v);
    }
    const cm = src.call_minutes;
    if (cm && typeof cm === 'object') out.includedMinutes = num(cm.included ?? cm.limit);
  }

  if (!Array.isArray(data)) {
    out.periodStart = o.period_start ?? o.billing_period_start ?? o.current_period_start;
    out.periodEnd = o.period_end ?? o.billing_period_end ?? o.current_period_end;
    out.includedMinutes ??= num(o.included_call_minutes ?? o.included_minutes);
    out.includedAgents = num(o.included_agents);
    out.overageMinutes = num(o.overage_minutes);
    out.overageCost = num(o.overage_amount ?? o.overage_cost);
  }
  return out;
}
