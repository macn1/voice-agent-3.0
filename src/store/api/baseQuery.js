import { loggedOut, tokensReceived } from '../slices/authSlice';
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

// Domain "not found" codes (e.g. agent_not_found) mean the route exists.
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
  const notAvailable = [404, 405, 501, 502, 503].includes(status) && (status !== 404 || GENERIC_NOT_FOUND.includes(code));
  return {
    error: {
      status,
      code: notAvailable ? 'not_available' : code,
      message: notAvailable ? `${SERVICE_LABEL[service]} doesn't serve ${method} ${path} yet.` : (err.message ?? (res.statusText || 'Request failed')),
      notAvailable,
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

export async function baseQueryWithReauth(args, api) {
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

/** PUT a file to a pre-signed upload URL returned by the API (knowledge / agent documents). */
export async function uploadToSignedUrl({ url, file }) {
  try {
    const r = await fetch(url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' } });
    if (!r.ok) return { error: { status: r.status, code: 'upload_failed', message: `Upload of ${file.name} failed (${r.status})` } };
    return { data: { ok: true } };
  } catch {
    return { error: { status: 0, code: 'network_error', message: `Upload of ${file.name} failed` } };
  }
}
