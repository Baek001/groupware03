const AUTH_USER_TTL_MS = 15_000;
const SESSION_BUNDLE_TTL_MS = 15_000;

const authUserCache = new Map();
const sessionBundleCache = new Map();

function cloneValue(value) {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function clearExpiredEntries(store) {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (!entry || entry.expiresAt <= now) {
      store.delete(key);
    }
  }
}

function readCache(store, key) {
  if (!key) {
    return null;
  }

  clearExpiredEntries(store);
  const entry = store.get(key);
  if (!entry || entry.expiresAt <= Date.now()) {
    store.delete(key);
    return null;
  }

  return cloneValue(entry.value);
}

function writeCache(store, key, value, ttlMs) {
  if (!key || value === undefined) {
    return;
  }

  clearExpiredEntries(store);
  store.set(key, {
    value: cloneValue(value),
    expiresAt: Date.now() + ttlMs,
  });
}

function deleteCache(store, key) {
  if (!key) {
    return;
  }
  store.delete(key);
}

export function getCachedAuthUser(token) {
  return readCache(authUserCache, token);
}

export function setCachedAuthUser(token, user) {
  writeCache(authUserCache, token, user, AUTH_USER_TTL_MS);
}

export function getCachedSessionBundle(token) {
  return readCache(sessionBundleCache, token);
}

export function setCachedSessionBundle(token, bundle) {
  writeCache(sessionBundleCache, token, bundle, SESSION_BUNDLE_TTL_MS);
}

export function invalidateCachedSessionBundle(token) {
  deleteCache(sessionBundleCache, token);
}
