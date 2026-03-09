function buildQuery(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }
    search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : '';
}

function defaultHeaders(env, token = '', extra = {}) {
  const headers = {
    'apikey': env.supabaseAnonKey,
    ...extra,
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

async function requestJson(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function createSupabaseError(response, payload) {
  const message = payload?.message || payload?.error_description || payload?.hint || payload?.details || 'Supabase request failed';
  const error = new Error(message);
  error.status = response.status;
  error.payload = payload;
  return error;
}

async function fetchSupabase(env, path, { method = 'GET', token = '', params = {}, headers = {}, body } = {}) {
  const url = `${env.supabaseUrl}${path}${buildQuery(params)}`;
  const response = await fetch(url, {
    method,
    headers: defaultHeaders(env, token, headers),
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const payload = await requestJson(response);
  if (!response.ok) {
    throw createSupabaseError(response, payload);
  }

  return payload;
}

export async function fetchAuthUser(env, token) {
  return fetchSupabase(env, '/auth/v1/user', { token });
}

export async function selectRows(env, table, { token = '', params = {}, headers = {} } = {}) {
  return fetchSupabase(env, `/rest/v1/${table}`, {
    token,
    params,
    headers: {
      Accept: 'application/json',
      ...headers,
    },
  });
}

export async function insertRows(env, table, { token = '', body = {}, params = {}, headers = {}, upsert = false } = {}) {
  return fetchSupabase(env, `/rest/v1/${table}`, {
    method: 'POST',
    token,
    params,
    body,
    headers: {
      'Content-Type': 'application/json',
      Prefer: upsert ? 'resolution=merge-duplicates,return=representation' : 'return=representation',
      ...headers,
    },
  });
}

export async function patchRows(env, table, { token = '', params = {}, body = {}, headers = {} } = {}) {
  return fetchSupabase(env, `/rest/v1/${table}`, {
    method: 'PATCH',
    token,
    params,
    body,
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...headers,
    },
  });
}

export async function deleteRows(env, table, { token = '', params = {}, headers = {} } = {}) {
  return fetchSupabase(env, `/rest/v1/${table}`, {
    method: 'DELETE',
    token,
    params,
    headers: {
      Prefer: 'return=representation',
      ...headers,
    },
  });
}

export async function rpc(env, fn, { token = '', body = {}, headers = {} } = {}) {
  return fetchSupabase(env, `/rest/v1/rpc/${fn}`, {
    method: 'POST',
    token,
    body,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
}
