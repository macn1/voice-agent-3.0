import { loggedOut, tokensReceived } from '../slices/authSlice';
import { demoFallback } from '../../mocks';
import { API_BASE, PREFIX, SERVICE_LABEL } from './services';

// The single place that talks HTTP to the backend (FND-01.3 / FND-01.4).
//
// - Prefixes the owning service's path and attaches the realm's access token.
// - Unwraps the { success, data } envelope; errors become plain, serializable
//   objects: { status, code, message, notAvailable?, service, path }.
// - On 401 refreshes the realm's tokens once (shared by concurrent requests),
//   retries, and signs the realm out if the refresh fails.

const qs = (params) => {
  if (!params) return '';
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  });
  const s = p.toString();
  return s ? `?${s}` : '';
};

// Domain codes (agent_not_found, live_audio_unavailable, ...) mean the route exists.
const GENERIC_NOT_FOUND = ['not_found', 'http_404', 'route_not_found'];

async function send({ service = 'auth', url, method = 'GET', body, params }, token) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const path = `${PREFIX[service]}${url}`;

  let res;
  try {
    res = await fetch(API_BASE + path + qs(params), { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    return { error: { status: 0, code: 'network_error', message: 'Could not reach the server. Check your connection and try again.', service, path } };
  }

  const type = res.headers.get('content-type') ?? '';
  const text = res.status === 204 ? '' : await res.text();
  // An SPA host or dev server answers unknown paths with index.html.
  const html = type.includes('text/html');
  let json = null;
  if (text && !html) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }

  if (res.ok && !html && json?.success !== false) {
    return { data: json && typeof json === 'object' && 'data' in json ? json.data : (json ?? null) };
  }

  const status = html ? 404 : res.status;
  const err = json?.error ?? {};
  const code = err.code ?? (html ? 'route_not_found' : `http_${status}`);

  // The gateway's rate limit answers 429 with a plain-text body, not our envelope.
  if (status === 429 && !json?.error) {
    const wait = Number(res.headers.get('retry-after'));
    return {
      error: {
        status,
        code: 'rate_limited',
        retryAfter: Number.isFinite(wait) && wait > 0 ? wait : undefined,
        message: wait > 0 ? `Too many attempts, try again in ${Math.ceil(wait)} seconds.` : 'Too many attempts, try again in a moment.',
        service,
        path: `${method} ${path}`,
      },
    };
  }

  // A route is "not served" when the status says so and the body carries no
  // domain code of its own (live_audio_unavailable is a real 503 answer).
  const domainCode = !!json?.error?.code && !GENERIC_NOT_FOUND.includes(code) && !/^http_\d+$/.test(code);
  const notAvailable = [404, 405, 501, 502, 503].includes(status) && !domainCode;
  return {
    error: {
      status,
      code: notAvailable ? 'not_available' : code,
      message: notAvailable ? `${SERVICE_LABEL[service]} doesn't serve ${method} ${path} yet.` : (err.message ?? (res.statusText || 'Request failed')),
      notAvailable,
      fields: json?.meta?.fields,
      service,
      path: `${method} ${path}`,
    },
  };
}

// One in-flight refresh per realm.
const refreshing = {};

async function refreshTokens(realm, api) {
  const current = api.getState().auth[realm].tokens;
  if (!current?.refresh_token) return null;
  refreshing[realm] ??= send({ service: 'auth', url: `/api/v1/auth/${realm}/refresh`, method: 'POST', body: { refresh_token: current.refresh_token } })
    .then((r) => {
      if (r.error || !r.data?.access_token) return null;
      api.dispatch(tokensReceived({ realm, tokens: r.data }));
      return api.getState().auth[realm].tokens;
    })
    .finally(() => {
      delete refreshing[realm];
    });
  return refreshing[realm];
}

async function sendWithReauth(args, api) {
  const realm = args.realm ?? null;
  const token = realm ? api.getState().auth[realm].tokens?.access_token : undefined;
  const result = await send(args, token);
  if (!realm || !token || result.error?.status !== 401) return result;

  const next = await refreshTokens(realm, api);
  if (!next) {
    api.dispatch(loggedOut(realm));
    return result;
  }
  return send(args, next.access_token);
}

export async function baseQueryWithReauth(args, api) {
  const result = await sendWithReauth(args, api);
  if (!result.error) return result;
  // Routes the backend doesn't serve yet are answered with demo data (src/mocks).
  const token = args.realm ? api.getState().auth[args.realm].tokens?.access_token : undefined;
  const live = async (service, path, params) => (await send({ service, url: `/api/v1${path}`, params }, token)).data;
  return (await demoFallback(args, result.error, live)) ?? result;
}

/**
 * PUT a file's bytes to the upload_url the API returned (knowledge / agent documents).
 * `authed` sends the customer token: our own upload routes need it.
 */
export async function uploadToSignedUrl({ url, file, authed }) {
  const headers = { 'Content-Type': file.type || 'application/octet-stream' };
  let target = url;
  if (authed) {
    const { store } = await import('../index');
    const token = store.getState().auth.customer.tokens?.access_token;
    if (token) headers.Authorization = `Bearer ${token}`;
    // upload_url is absolute; keep it on this app's API origin (dev proxy, no CORS).
    try {
      const u = new URL(url);
      target = API_BASE + u.pathname + u.search;
    } catch {
      /* already relative */
    }
  }
  try {
    const r = await fetch(target, { method: 'PUT', body: file, headers });
    if (!r.ok) {
      let message = `Upload of ${file.name} failed (${r.status})`;
      try {
        message = (await r.json())?.error?.message ?? message;
      } catch {
        /* not JSON */
      }
      return { error: { status: r.status, code: 'upload_failed', message } };
    }
    return { data: { ok: true } };
  } catch {
    return { error: { status: 0, code: 'network_error', message: `Upload of ${file.name} failed` } };
  }
}

/**
 * Fetch a non-JSON route (PDF / CSV) with the realm's token and save it as
 * `filename`. Returns the Blob; throws an Error carrying the API's message.
 */
export async function downloadAuthed({ service, realm = 'customer', url, params, filename }) {
  const { store } = await import('../index');
  const run = (token) =>
    fetch(`${API_BASE}${PREFIX[service]}/api/v1${url}${qs(params)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  let res;
  try {
    res = await run(store.getState().auth[realm].tokens?.access_token);
    if (res.status === 401) {
      const next = await refreshTokens(realm, store);
      if (next) res = await run(next.access_token);
    }
  } catch {
    throw new Error('Could not reach the server. Check your connection and try again.');
  }
  if (!res.ok) {
    let message = `Download failed (${res.status})`;
    try {
      message = (await res.json())?.error?.message ?? message;
    } catch {
      /* not JSON */
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  if (filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  return blob;
}
