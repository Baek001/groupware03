const SUPABASE_SESSION_KEY = 'edge-rewrite.supabase.session';

function getConfig() {
  const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
  const anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '');
  return { supabaseUrl, anonKey };
}

function createAuthError(message, status = 401) {
  const error = new Error(message);
  error.response = {
    status,
    data: { message },
  };
  return error;
}

function readStoredSession() {
  const raw = localStorage.getItem(SUPABASE_SESSION_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    localStorage.removeItem(SUPABASE_SESSION_KEY);
    return null;
  }
}

function writeStoredSession(session) {
  localStorage.setItem(SUPABASE_SESSION_KEY, JSON.stringify(session));
}

async function parseError(response, fallbackMessage) {
  const data = await response.json().catch(() => ({}));
  throw createAuthError(data?.msg || data?.error_description || data?.message || fallbackMessage, response.status);
}

export function getAccessToken() {
  return readStoredSession()?.access_token || '';
}

export async function signInWithPassword(identifier, password) {
  const { supabaseUrl, anonKey } = getConfig();
  if (!supabaseUrl || !anonKey) {
    throw createAuthError('Supabase 환경변수가 설정되지 않았습니다.', 500);
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': anonKey,
    },
    body: JSON.stringify({
      email: String(identifier || '').trim(),
      password,
    }),
  });

  if (!response.ok) {
    await parseError(response, '로그인에 실패했습니다.');
  }

  const session = await response.json();
  writeStoredSession(session);
  return session;
}

export async function signUpWithPassword(email, password, metadata = {}) {
  const { supabaseUrl, anonKey } = getConfig();
  if (!supabaseUrl || !anonKey) {
    throw createAuthError('Supabase 환경변수가 설정되지 않았습니다.', 500);
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': anonKey,
    },
    body: JSON.stringify({
      email: String(email || '').trim(),
      password,
      data: metadata,
    }),
  });

  if (!response.ok) {
    await parseError(response, '가입에 실패했습니다.');
  }

  const payload = await response.json();
  if (payload?.access_token) {
    writeStoredSession(payload);
    return payload;
  }

  if (payload?.session?.access_token) {
    writeStoredSession(payload.session);
    return payload.session;
  }

  throw createAuthError('가입은 되었지만 세션을 받지 못했습니다. Supabase 이메일 확인 설정을 확인해 주세요.', 400);
}

export async function signOut() {
  const { supabaseUrl, anonKey } = getConfig();
  const accessToken = getAccessToken();

  localStorage.removeItem(SUPABASE_SESSION_KEY);

  if (!supabaseUrl || !anonKey || !accessToken) {
    return;
  }

  await fetch(`${supabaseUrl}/auth/v1/logout`, {
    method: 'POST',
    headers: {
      'apikey': anonKey,
      'Authorization': `Bearer ${accessToken}`,
    },
  }).catch(() => null);
}

export async function requireSession() {
  const session = readStoredSession();
  if (!session?.access_token) {
    throw createAuthError('세션이 없습니다.', 401);
  }

  return session;
}
