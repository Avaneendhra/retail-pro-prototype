// The app's side of the HTTP API. Every failure becomes an ApiError with a
// `code` the screens can turn into words; "could not reach the server" is status 0.

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

const TIMEOUT_MS = 30_000;

export function createApi(baseUrl = '', fetchImpl = (...args) => globalThis.fetch(...args)) {
  const base = String(baseUrl || '').replace(/\/+$/, '');

  async function request(method, path, { token, body } = {}) {
    let res;
    try {
      res = await fetchImpl(`${base}${path}`, {
        method,
        headers: {
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(TIMEOUT_MS) : undefined,
      });
    } catch {
      throw new ApiError(0, 'network', 'Could not reach the server.');
    }

    let json = null;
    try { json = await res.json(); } catch { /* not JSON: handled below */ }

    if (!res.ok) {
      throw new ApiError(res.status, json?.error?.code || 'http_error', json?.error?.message || `The server answered with an error (${res.status}).`);
    }
    // A plain web host answers unknown addresses with a page, not JSON: there is no API there.
    if (json === null || typeof json !== 'object') throw new ApiError(res.status, 'bad_response', 'The server sent something unexpected.');
    return json;
  }

  return {
    health: () => request('GET', '/api/health'),
    signup: (body) => request('POST', '/api/auth/signup', { body }),
    login: (body) => request('POST', '/api/auth/login', { body }),
    recover: (body) => request('POST', '/api/auth/recover', { body }),
    changePassword: (token, body) => request('POST', '/api/auth/password', { token, body }),
    sync: (token, body) => request('POST', '/api/sync', { token, body }),
    team: {
      list: (token) => request('GET', '/api/team', { token }),
      add: (token, body) => request('POST', '/api/team', { token, body }),
      update: (token, id, body) => request('PATCH', `/api/team/${encodeURIComponent(id)}`, { token, body }),
    },
  };
}
