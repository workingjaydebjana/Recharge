const USER_TOKEN_KEY = 'paysetu_user_session_token';
const ADMIN_TOKEN_KEY = 'paysetu_admin_session_token';

export function saveUserToken(token) {
  try {
    if (typeof window !== 'undefined' && token) {
      window.localStorage.setItem(USER_TOKEN_KEY, token);
    }
  } catch {
    // Ignore storage quota / privacy mode errors; HttpOnly cookie remains active
  }
}

export function readUserToken() {
  try {
    if (typeof window !== 'undefined') {
      return window.localStorage.getItem(USER_TOKEN_KEY) || '';
    }
  } catch {
    // Ignore storage errors
  }
  return '';
}

export function clearUserToken() {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(USER_TOKEN_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

export function saveAdminToken(token) {
  try {
    if (typeof window !== 'undefined' && token) {
      window.localStorage.setItem(ADMIN_TOKEN_KEY, token);
    }
  } catch {
    // Ignore storage errors
  }
}

export function readAdminToken() {
  try {
    if (typeof window !== 'undefined') {
      return window.localStorage.getItem(ADMIN_TOKEN_KEY) || '';
    }
  } catch {
    // Ignore storage errors
  }
  return '';
}

export function clearAdminToken() {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(ADMIN_TOKEN_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

/**
 * Standardized API client supporting both HttpOnly session cookies and server-verified Bearer tokens.
 */
export async function apiRequest(url, { method = 'GET', token = '', body = null } = {}) {
  const headers = {
    'X-Requested-With': 'XMLHttpRequest',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (body !== null) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body !== null ? JSON.stringify(body) : undefined,
    credentials: 'include',
    cache: 'no-store',
  });

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('text/csv')) {
    const text = await res.text();
    if (!res.ok) throw new Error('Failed to export CSV report.');
    return { ok: true, csv: text };
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}
