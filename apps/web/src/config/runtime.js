function trimTrailingSlash(value = '') {
  return String(value || '').replace(/\/+$/, '');
}

const apiBase = trimTrailingSlash(import.meta.env.VITE_API_BASE_URL || '');
const wsBase = trimTrailingSlash(import.meta.env.VITE_WS_BASE_URL || apiBase || '');
const realtimeEnabled = String(import.meta.env.VITE_ENABLE_REALTIME || 'false').toLowerCase() === 'true';

export function getApiBaseUrl() {
  return apiBase;
}

export function buildApiUrl(pathname = '') {
  if (!apiBase) {
    return pathname;
  }

  return `${apiBase}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
}

export function buildWebsocketUrl(pathname = '/starworks-groupware-websocket') {
  const base = wsBase || window.location.origin;
  const url = new URL(base);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = pathname.startsWith('/') ? pathname : `/${pathname}`;
  url.search = '';
  return url.toString();
}

export function buildFileDownloadUrl(saveFileNm = '') {
  return buildApiUrl(`/rest/file/download/${encodeURIComponent(saveFileNm)}`);
}

export function isRealtimeEnabled() {
  return realtimeEnabled;
}
