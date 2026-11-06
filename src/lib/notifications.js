/**
 * Cliente da central de notificações HYDROVISION.
 * - REST para histórico, preferências e outbox
 * - SSE para entrega em tempo real (com fallback para polling)
 */

export const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
  return data;
}

export const notificationsApi = {
  list: (params = '') => request(`/api/notifications${params}`),
  read: (id) => request(`/api/notifications/${id}/read`, { method: 'POST' }),
  readAll: () => request('/api/notifications/read-all', { method: 'POST' }),
  clear: () => request('/api/notifications/clear', { method: 'POST' }),
  settings: () => request('/api/notifications/settings'),
  saveSettings: (payload) => request('/api/notifications/settings', { method: 'POST', body: JSON.stringify(payload) }),
  outbox: () => request('/api/notifications/outbox'),
  test: (recipient) => request('/api/notifications/test', { method: 'POST', body: JSON.stringify({ recipient }) }),
  create: (payload) => request('/api/notifications', { method: 'POST', body: JSON.stringify(payload) }),
  pushTelemetry: (payload) => request('/api/telemetry', { method: 'POST', body: JSON.stringify(payload) }),
  health: () => request('/api/health')
};

/**
 * Assina o stream SSE. Retorna função de cancelamento.
 * @param {{onEvent?: Function, onStatus?: Function}} handlers
 */
export function subscribeNotifications({ onEvent, onStatus } = {}) {
  if (typeof window === 'undefined' || typeof window.EventSource === 'undefined') {
    onStatus?.('unsupported');
    return () => {};
  }

  let source = null;
  let closed = false;
  let retry = 0;

  const connect = () => {
    if (closed) return;
    source = new EventSource(`${API_BASE}/api/notifications/stream`);
    source.addEventListener('ready', () => {
      retry = 0;
      onStatus?.('connected');
    });
    source.onmessage = (event) => {
      try {
        onEvent?.(JSON.parse(event.data));
      } catch { /* evento inválido é ignorado */ }
    };
    source.onerror = () => {
      onStatus?.('reconnecting');
      source?.close();
      retry = Math.min(retry + 1, 6);
      if (!closed) setTimeout(connect, retry * 1500);
    };
  };

  connect();
  return () => {
    closed = true;
    source?.close();
  };
}
