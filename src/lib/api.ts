/**
 * Centralized API client for all backend communications.
 *
 * VITE_API_URL: points to the backend base URL.
 * When migrating to NestJS, set VITE_API_URL to the NestJS server URL.
 * The Supabase REST API (PostgREST) is used as the initial backend at /rest/v1/*.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
export const API_BASE_URL = import.meta.env.VITE_API_URL || `${SUPABASE_URL}/functions/v1`;
export const REST_BASE_URL = `${SUPABASE_URL}/rest/v1`;

function getToken(): string | null {
  return localStorage.getItem('auth_token');
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': token ? `Bearer ${token}` : `Bearer ${SUPABASE_ANON_KEY}`,
    'Prefer': 'return=representation',
  };
  return headers;
}

function edgeFunctionHeaders(): Record<string, string> {
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      message = body.error || body.message || body.hint || message;
    } catch {}
    throw new Error(message);
  }
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (undefined as unknown as T);
}

// REST resource client (talks directly to Supabase PostgREST / or NestJS REST endpoints)
export const rest = {
  get<T>(table: string, query?: string): Promise<T[]> {
    const url = `${REST_BASE_URL}/${table}${query ? `?${query}` : ''}`;
    return fetch(url, {
      headers: { ...authHeaders(), 'Prefer': '' },
    }).then((r) => handleResponse<T[]>(r));
  },

  getOne<T>(table: string, query?: string): Promise<T | null> {
    const url = `${REST_BASE_URL}/${table}${query ? `?${query}` : ''}`;
    return fetch(url, {
      headers: { ...authHeaders(), 'Prefer': 'return=representation' },
    }).then(async (r) => {
      if (!r.ok) {
        if (r.status === 406) return null;
        let message = `HTTP ${r.status}`;
        try { const b = await r.json(); message = b.error || b.message || message; } catch {}
        throw new Error(message);
      }
      const text = await r.text();
      if (!text) return null;
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed[0] ?? null;
      return parsed;
    });
  },

  count(table: string, query?: string): Promise<number> {
    const url = `${REST_BASE_URL}/${table}${query ? `?${query}` : ''}`;
    return fetch(url, {
      headers: { ...authHeaders(), 'Prefer': 'count=exact' },
    }).then(async (r) => {
      if (!r.ok) return 0;
      const range = r.headers.get('Content-Range');
      if (range) {
        const match = range.match(/\/(\d+)$/);
        if (match) return parseInt(match[1], 10);
      }
      return 0;
    });
  },

  insert<T>(table: string, data: unknown): Promise<T> {
    return fetch(`${REST_BASE_URL}/${table}`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Prefer': 'return=representation' },
      body: JSON.stringify(data),
    }).then(async (r) => {
      const result = await handleResponse<T[] | T>(r);
      return Array.isArray(result) ? result[0] : result;
    });
  },

  update<T>(table: string, query: string, data: unknown): Promise<T[]> {
    return fetch(`${REST_BASE_URL}/${table}?${query}`, {
      method: 'PATCH',
      headers: { ...authHeaders(), 'Prefer': 'return=representation' },
      body: JSON.stringify(data),
    }).then((r) => handleResponse<T[]>(r));
  },

  upsert<T>(table: string, data: unknown, onConflict?: string): Promise<T[]> {
    const prefer = `return=representation${onConflict ? `,resolution=merge-duplicates` : ''}`;
    const url = onConflict
      ? `${REST_BASE_URL}/${table}?on_conflict=${encodeURIComponent(onConflict)}`
      : `${REST_BASE_URL}/${table}`;
    return fetch(url, {
      method: 'POST',
      headers: { ...authHeaders(), 'Prefer': prefer },
      body: JSON.stringify(data),
    }).then((r) => handleResponse<T[]>(r));
  },

  delete(table: string, query: string): Promise<void> {
    return fetch(`${REST_BASE_URL}/${table}?${query}`, {
      method: 'DELETE',
      headers: authHeaders(),
    }).then((r) => handleResponse<void>(r));
  },
};

// Edge function client (auth, whatsapp, etc.)
export const api = {
  get<T>(path: string): Promise<T> {
    return fetch(`${API_BASE_URL}${path}`, {
      headers: edgeFunctionHeaders(),
    }).then((r) => handleResponse<T>(r));
  },

  post<T>(path: string, body?: unknown): Promise<T> {
    return fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: edgeFunctionHeaders(),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }).then((r) => handleResponse<T>(r));
  },

  patch<T>(path: string, body?: unknown): Promise<T> {
    return fetch(`${API_BASE_URL}${path}`, {
      method: 'PATCH',
      headers: edgeFunctionHeaders(),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }).then((r) => handleResponse<T>(r));
  },

  delete<T>(path: string): Promise<T> {
    return fetch(`${API_BASE_URL}${path}`, {
      method: 'DELETE',
      headers: edgeFunctionHeaders(),
    }).then((r) => handleResponse<T>(r));
  },

  rawFetch(path: string, init?: RequestInit): Promise<Response> {
    const headers = { ...edgeFunctionHeaders(), ...(init?.headers as Record<string, string> || {}) };
    return fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  },
};

export { SUPABASE_URL, SUPABASE_ANON_KEY };
