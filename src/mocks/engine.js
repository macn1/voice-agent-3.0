// Minimal in-memory REST engine for demo data. Handlers are registered per
// service + method + path pattern ("/customer/tools/:id"); state lives in
// module-level tables so created / edited / deleted rows persist until reload.
//
// This file never talks to the network. It is only consulted by
// store/api/baseQuery.js when the real backend does not serve a route yet.

export const uid = (p = '') => `${p}${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
export const ago = (ms) => new Date(Date.now() - ms).toISOString();
export const ahead = (ms) => new Date(Date.now() + ms).toISOString();
export const MIN = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;

export class MockError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Deterministic pseudo-random so charts look the same on every reload. */
export function rng(seed = 7) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

/** An id-keyed, insertion-ordered table with CRUD helpers. */
export function table(seed = []) {
  const rows = seed.map((r) => ({ ...r }));
  return {
    rows,
    all: () => rows,
    get: (id) => rows.find((r) => r.id === id),
    must(id, what = 'resource') {
      const r = rows.find((x) => x.id === id);
      if (!r) throw new MockError(404, 'not_found', `${what} not found`);
      return r;
    },
    add(row) {
      const r = { id: uid(), created_at: new Date().toISOString(), ...row };
      rows.unshift(r);
      return r;
    },
    patch(id, body) {
      const r = this.must(id);
      Object.assign(r, body, { updated_at: new Date().toISOString() });
      return r;
    },
    remove(id) {
      const i = rows.findIndex((r) => r.id === id);
      if (i < 0) throw new MockError(404, 'not_found', 'resource not found');
      rows.splice(i, 1);
      return null;
    },
    replace(next) {
      rows.splice(0, rows.length, ...next);
      return rows;
    },
  };
}

export const page = (rows, { limit = 50, offset = 0 } = {}) => ({
  items: rows.slice(Number(offset), Number(offset) + Number(limit)),
  total: rows.length,
});

// Routing ---------------------------------------------------------------

const routes = [];

function compile(pattern) {
  const keys = [];
  const re = new RegExp(
    '^' +
      pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/:(\w+)/g, (_m, k) => {
        keys.push(k);
        return '([^/]+)';
      }) +
      '/?$',
  );
  return { re, keys };
}

/** on('flow', 'GET', '/customer/tools/:id', ({ params, query, body, realm }) => data) */
export function on(service, method, pattern, handler, { realm } = {}) {
  routes.push({ service, method, realm, handler, ...compile(pattern) });
}

/**
 * `live(service, url)` lets a handler read real backend data (e.g. the customer
 * list) so demo rows can reference real tenant ids.
 *
 * Returns { handled: false } when no demo handler matches, otherwise
 * { handled: true, data } or { handled: true, error }.
 */
export async function resolve({ service, realm, url, method = 'GET', body, params, live }) {
  const path = url.replace(/^\/api\/v1/, '');
  for (const r of routes) {
    if (r.service !== service || r.method !== method || (r.realm && r.realm !== realm)) continue;
    const m = r.re.exec(path);
    if (!m) continue;
    const p = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    try {
      const data = await r.handler({ params: p, query: params ?? {}, body: body ?? {}, realm, live });
      return { handled: true, data: data === undefined ? null : JSON.parse(JSON.stringify(data)) };
    } catch (e) {
      if (e instanceof MockError) {
        return { handled: true, error: { status: e.status, code: e.code, message: e.message, service, path: `${method} ${path}` } };
      }
      throw e;
    }
  }
  return { handled: false };
}
