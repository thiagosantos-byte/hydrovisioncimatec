import crypto from 'node:crypto';

/**
 * HYDROVISION — Notification service
 * ----------------------------------------------------------------------------
 * Canais suportados:
 *  - in-app  : SSE (/api/notifications/stream) + histórico REST
 *  - whatsapp: Meta Cloud API, Twilio, Evolution API ou webhook genérico
 *  - webhook : POST JSON para n8n/Zapier/Make/qualquer automação
 *
 * Sem credenciais, o serviço continua funcionando em modo demonstração:
 * as mensagens ficam na "outbox" com o texto exato que seria enviado e um
 * link wa.me para encaminhamento manual. Nada é enviado sem configuração.
 */

const SEVERITY_RANK = { INFO: 0, ATENCAO: 1, CRITICO: 2 };
const SEVERITY_LABEL = { INFO: 'INFO', ATENCAO: 'ATENÇÃO', CRITICO: 'CRÍTICO' };
const MAX_ITEMS = 200;
const MAX_OUTBOX = 60;

export function severityFromRisk(risk = 0) {
  const value = Number(risk) || 0;
  if (value >= 65) return 'CRITICO';
  if (value >= 30) return 'ATENCAO';
  return 'INFO';
}

export function severityRank(severity) {
  return SEVERITY_RANK[String(severity || 'INFO').toUpperCase()] ?? 0;
}

function normalizeSeverity(value) {
  const upper = String(value || 'INFO').toUpperCase();
  return upper in SEVERITY_RANK ? upper : 'INFO';
}

function clampText(value, max = 900) {
  return String(value ?? '').slice(0, max);
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function formatNumber(value, digits = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return numeric.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function formatTimestamp(date = new Date()) {
  return date.toLocaleString('pt-BR', { timeZone: process.env.NOTIFY_TIMEZONE || 'America/Sao_Paulo' });
}

export function buildAlertMessage(payload = {}) {
  const severity = normalizeSeverity(payload.severity);
  const icon = severity === 'CRITICO' ? '🚨' : severity === 'ATENCAO' ? '⚠️' : 'ℹ️';
  const lines = [
    `${icon} *HYDROVISION · ${SEVERITY_LABEL[severity]}*`,
    `Estação 01 · ${payload.equipment || 'BMB-001'} — conjunto motobomba`,
    '',
    `*${clampText(payload.title || 'Evento operacional', 120)}*`
  ];
  if (payload.message) lines.push(clampText(payload.message, 600));

  const metrics = payload.metrics || {};
  const metricLabels = {
    level: ['Nível', '%'],
    suction: ['Sucção', 'bar abs'],
    discharge: ['Descarga', 'bar'],
    flow: ['Vazão', 'm³/h'],
    npshMargin: ['Margem NPSH', 'm'],
    temperature: ['Temperatura', '°C'],
    air: ['Ar na linha', '%'],
    risk: ['Índice de risco', '/100']
  };
  const metricLine = Object.entries(metricLabels)
    .filter(([key]) => metrics[key] !== undefined && metrics[key] !== null && metrics[key] !== '')
    .map(([key, [label, unit]]) => `${label}: ${formatNumber(metrics[key], unit === '/100' ? 0 : 1)}${unit === '/100' ? '' : ` ${unit}`}`)
    .join(' · ');
  if (metricLine) lines.push('', metricLine);

  if (payload.suggestedAction) lines.push('', `🔧 *Ação sugerida:* ${clampText(payload.suggestedAction, 320)}`);
  lines.push('', `${formatTimestamp()} · ambiente ${payload.origin === 'REAL' ? 'real' : 'simulado (demonstração)'}`);
  return lines.join('\n');
}

export class NotificationService {
  constructor() {
    this.items = [];
    this.outbox = [];
    this.subscribers = new Set();
    this.dedupe = new Map();
    this.snapshot = null;
    this.settings = {
      whatsappEnabled: String(process.env.WHATSAPP_ENABLED || 'true') !== 'false',
      minSeverity: normalizeSeverity(process.env.WHATSAPP_MIN_SEVERITY || 'ATENCAO'),
      recipient: process.env.WHATSAPP_DEFAULT_TO || '',
      notifyOnRecovery: true,
      quietHours: process.env.NOTIFY_QUIET_HOURS || ''
    };
    this.heartbeat = setInterval(() => this.broadcast({ type: 'ping', at: Date.now() }), 20000);
    this.heartbeat.unref?.();
  }

  get config() {
    const provider = String(
      process.env.WHATSAPP_PROVIDER
      || (process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID ? 'cloud' : '')
      || (process.env.EVOLUTION_API_URL ? 'evolution' : '')
      || (process.env.TWILIO_ACCOUNT_SID ? 'twilio' : '')
      || 'demo'
    ).toLowerCase();

    const missing = [];
    if (provider === 'cloud') {
      if (!process.env.WHATSAPP_TOKEN) missing.push('WHATSAPP_TOKEN');
      if (!process.env.WHATSAPP_PHONE_NUMBER_ID) missing.push('WHATSAPP_PHONE_NUMBER_ID');
    }
    if (provider === 'twilio') {
      if (!process.env.TWILIO_ACCOUNT_SID) missing.push('TWILIO_ACCOUNT_SID');
      if (!process.env.TWILIO_AUTH_TOKEN) missing.push('TWILIO_AUTH_TOKEN');
      if (!process.env.TWILIO_WHATSAPP_FROM) missing.push('TWILIO_WHATSAPP_FROM');
    }
    if (provider === 'evolution') {
      if (!process.env.EVOLUTION_API_URL) missing.push('EVOLUTION_API_URL');
      if (!process.env.EVOLUTION_INSTANCE) missing.push('EVOLUTION_INSTANCE');
    }
    if (provider === 'webhook' && !process.env.NOTIFY_WEBHOOK_URL) missing.push('NOTIFY_WEBHOOK_URL');

    return {
      provider,
      configured: missing.length === 0 && provider !== 'demo',
      missing,
      from: process.env.TWILIO_WHATSAPP_FROM || process.env.WHATSAPP_FROM || '',
      webhookConfigured: Boolean(process.env.NOTIFY_WEBHOOK_URL),
      template: process.env.WHATSAPP_TEMPLATE_NAME || ''
    };
  }

  channelStatus() {
    const config = this.config;
    return {
      inApp: {
        enabled: true,
        transport: 'sse',
        connectedClients: this.subscribers.size
      },
      whatsapp: {
        ...config,
        enabled: this.settings.whatsappEnabled,
        recipient: this.settings.recipient,
        minSeverity: this.settings.minSeverity,
        mode: config.configured ? 'live' : 'demo'
      },
      webhook: {
        configured: config.webhookConfigured,
        enabled: config.webhookConfigured
      }
    };
  }

  list({ limit = 60, onlyUnread = false } = {}) {
    const items = onlyUnread ? this.items.filter((item) => !item.read) : this.items;
    return {
      items: items.slice(0, Math.max(1, Math.min(MAX_ITEMS, Number(limit) || 60))),
      unread: this.items.filter((item) => !item.read).length,
      total: this.items.length
    };
  }

  recentOutbox(limit = 20) {
    return this.outbox.slice(0, Math.max(1, Math.min(MAX_OUTBOX, Number(limit) || 20)));
  }

  subscribe(res) {
    this.subscribers.add(res);
    res.write(`event: ready\ndata: ${JSON.stringify({ channels: this.channelStatus() })}\n\n`);
    return () => this.subscribers.delete(res);
  }

  broadcast(event) {
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of this.subscribers) {
      try {
        client.write(payload);
      } catch {
        this.subscribers.delete(client);
      }
    }
  }

  setSnapshot(snapshot = {}) {
    this.snapshot = {
      ...snapshot,
      updatedAt: new Date().toISOString(),
      origin: snapshot.origin || 'SIMULADO'
    };
    this.broadcast({ type: 'telemetry', snapshot: this.snapshot });
    return this.snapshot;
  }

  updateSettings(patch = {}) {
    if (typeof patch.whatsappEnabled === 'boolean') this.settings.whatsappEnabled = patch.whatsappEnabled;
    if (patch.minSeverity) this.settings.minSeverity = normalizeSeverity(patch.minSeverity);
    if (typeof patch.recipient === 'string') this.settings.recipient = clampText(patch.recipient, 32);
    if (typeof patch.notifyOnRecovery === 'boolean') this.settings.notifyOnRecovery = patch.notifyOnRecovery;
    if (typeof patch.quietHours === 'string') this.settings.quietHours = clampText(patch.quietHours, 32);
    return this.channelStatus();
  }

  async create(payload = {}) {
    const severity = normalizeSeverity(payload.severity);
    const now = new Date();
    const key = clampText(payload.key || payload.title || 'evento', 120).toLowerCase();
    const cooldown = Math.max(5, Number(process.env.NOTIFY_COOLDOWN_SECONDS || 45)) * 1000;
    const last = this.dedupe.get(key);
    if (last && now.getTime() - last < cooldown && severityRank(severity) < 2) {
      return { deduplicated: true, notification: this.items[0] || null };
    }
    this.dedupe.set(key, now.getTime());

    const notification = {
      id: `NTF-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      key,
      title: clampText(payload.title || 'Evento operacional', 140),
      message: clampText(payload.message || '', 800),
      severity,
      origin: payload.origin === 'REAL' ? 'REAL' : 'SIMULADO',
      equipment: clampText(payload.equipment || 'BMB-001', 40),
      suggestedAction: clampText(payload.suggestedAction || '', 320),
      metrics: payload.metrics || {},
      channels: { inApp: 'delivered', whatsapp: 'queued', webhook: 'queued' },
      read: false,
      createdAt: now.toISOString(),
      createdAtLabel: formatTimestamp(now)
    };

    this.items.unshift(notification);
    this.items = this.items.slice(0, MAX_ITEMS);
    this.broadcast({ type: 'notification', notification });

    // Canais externos são disparados em paralelo e nunca bloqueiam a resposta.
    this.dispatch(notification, payload).catch((error) => {
      console.error('Notification dispatch error:', error?.message || error);
    });

    return { deduplicated: false, notification };
  }

  async dispatch(notification, payload) {
    const rank = severityRank(notification.severity);
    const minRank = severityRank(this.settings.minSeverity);
    const shouldUseWhatsApp = this.settings.whatsappEnabled && rank >= minRank;
    const body = buildAlertMessage({ ...payload, ...notification });

    if (shouldUseWhatsApp) {
      const recipient = this.settings.recipient || process.env.WHATSAPP_DEFAULT_TO || '';
      try {
        const delivery = await this.sendWhatsApp(body, recipient, payload);
        notification.channels.whatsapp = delivery.status;
        notification.whatsapp = delivery;
        this.pushOutbox({ ...delivery, notificationId: notification.id, body, recipient });
      } catch (error) {
        notification.channels.whatsapp = 'failed';
        notification.whatsapp = { status: 'failed', error: error?.message || String(error) };
        this.pushOutbox({
          id: `OUT-${crypto.randomUUID().slice(0, 8)}`,
          notificationId: notification.id,
          channel: 'whatsapp',
          status: 'failed',
          provider: this.config.provider,
          recipient,
          body,
          error: error?.message || String(error),
          createdAt: new Date().toISOString()
        });
      }
      this.broadcast({ type: 'notification-update', notification });
    } else {
      notification.channels.whatsapp = 'skipped';
      this.broadcast({ type: 'notification-update', notification });
    }

    if (process.env.NOTIFY_WEBHOOK_URL) {
      try {
        const response = await fetch(process.env.NOTIFY_WEBHOOK_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(process.env.NOTIFY_WEBHOOK_TOKEN ? { Authorization: `Bearer ${process.env.NOTIFY_WEBHOOK_TOKEN}` } : {})
          },
          body: JSON.stringify({ source: 'HYDROVISION', ...notification, text: body }),
          signal: AbortSignal.timeout(8000)
        });
        notification.channels.webhook = response.ok ? 'delivered' : `failed:${response.status}`;
      } catch (error) {
        notification.channels.webhook = `failed:${error?.message || 'network'}`;
      }
    } else {
      notification.channels.webhook = 'not-configured';
    }
  }

  pushOutbox(entry) {
    this.outbox.unshift({ id: entry.id || `OUT-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date().toISOString(), ...entry });
    this.outbox = this.outbox.slice(0, MAX_OUTBOX);
    this.broadcast({ type: 'outbox', entry: this.outbox[0] });
  }

  /** Envia texto pelo provedor configurado. Em modo demo devolve o link wa.me. */
  async sendWhatsApp(body, recipientRaw, payload = {}) {
    const config = this.config;
    const recipient = onlyDigits(recipientRaw);

    if (!config.configured) {
      const link = recipient
        ? `https://wa.me/${recipient.length > 11 ? recipient : `55${recipient}`}?text=${encodeURIComponent(body)}`
        : '';
      return {
        status: 'demo',
        provider: 'demo',
        recipient,
        link,
        note: 'WhatsApp não configurado. Mensagem registrada na outbox com link wa.me para envio manual.'
      };
    }

    if (config.provider === 'cloud') {
      const to = String(recipientRaw || '').replace(/\D/g, '');
      if (!to) throw new Error('Informe o destinatário (WHATSAPP_DEFAULT_TO ou campo de número).');
      const url = `https://graph.facebook.com/v22.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
      const useTemplate = Boolean(config.template);
      const response = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(useTemplate
          ? {
            messaging_product: 'whatsapp',
            to,
            type: 'template',
            template: {
              name: config.template,
              language: { code: process.env.WHATSAPP_TEMPLATE_LANG || 'pt_BR' },
              components: [{ type: 'body', parameters: [
                { type: 'text', text: payload.title || 'HYDROVISION' },
                { type: 'text', text: (payload.message || '').slice(0, 200) },
                { type: 'text', text: notificationSeverityLabel(payload.severity) }
              ] }]
            }
          }
          : { messaging_product: 'whatsapp', to, type: 'text', text: { preview_url: false, body } }),
        signal: AbortSignal.timeout(10000)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error?.message || `Cloud API ${response.status}`);
      return { status: 'sent', provider: 'cloud', recipient: to, messageId: data?.messages?.[0]?.id || null };
    }

    if (config.provider === 'twilio') {
      const to = `whatsapp:+${String(recipientRaw || '').replace(/\D/g, '')}`;
      const from = process.env.TWILIO_WHATSAPP_FROM.startsWith('whatsapp:') ? process.env.TWILIO_WHATSAPP_FROM : `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`;
      const auth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`, {
        method: 'POST',
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ To: to, From: from, Body: body }),
        signal: AbortSignal.timeout(10000)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.message || `Twilio ${response.status}`);
      return { status: 'sent', provider: 'twilio', recipient: to, messageId: data?.sid || null };
    }

    if (config.provider === 'evolution') {
      const base = process.env.EVOLUTION_API_URL.replace(/\/$/, '');
      const instance = process.env.EVOLUTION_INSTANCE;
      const number = String(recipientRaw || '').replace(/\D/g, '');
      if (!number) throw new Error('Informe o destinatário para a Evolution API.');
      const response = await fetch(`${base}/message/sendText/${instance}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(process.env.EVOLUTION_API_KEY ? { apikey: process.env.EVOLUTION_API_KEY } : {}) },
        body: JSON.stringify({ number, text: body, delay: 1200, linkPreview: false }),
        signal: AbortSignal.timeout(10000)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.message || `Evolution API ${response.status}`);
      return { status: 'sent', provider: 'evolution', recipient: number, messageId: data?.key?.id || null };
    }

    if (config.provider === 'webhook') {
      const response = await fetch(process.env.NOTIFY_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.NOTIFY_WEBHOOK_TOKEN ? { Authorization: `Bearer ${process.env.NOTIFY_WEBHOOK_TOKEN}` } : {})
        },
        body: JSON.stringify({ source: 'HYDROVISION', type: 'whatsapp-message', to: onlyDigits(recipientRaw), text: body, payload }),
        signal: AbortSignal.timeout(8000)
      });
      if (!response.ok) throw new Error(`Webhook ${response.status}`);
      return { status: 'sent', provider: 'webhook', recipient: onlyDigits(recipientRaw) };
    }

    return { status: 'demo', provider: config.provider, recipient };
  }

  markRead(id) {
    const item = this.items.find((entry) => entry.id === id);
    if (!item) return null;
    item.read = true;
    this.broadcast({ type: 'read', id });
    return item;
  }

  markAllRead() {
    this.items.forEach((item) => { item.read = true; });
    this.broadcast({ type: 'read-all' });
    return this.list().unread;
  }

  clear() {
    this.items = [];
    this.dedupe.clear();
    this.broadcast({ type: 'clear' });
  }

  /** Resposta automática para mensagens recebidas no WhatsApp. */
  buildStatusReply() {
    const snapshot = this.snapshot;
    if (!snapshot) {
      return 'ℹ️ *HYDROVISION*\n\nNenhuma telemetria recebida ainda. Abra o painel para iniciar a supervisão.\n\nComandos: *STATUS*, *SILENCIAR*, *AJUDA*.';
    }
    const { values = {}, derived = {} } = snapshot;
    return [
      '📊 *HYDROVISION · STATUS DA ESTAÇÃO 01*',
      '',
      `Nível: ${formatNumber(values.level, 0)}%`,
      `Sucção: ${formatNumber(values.suction, 2)} bar abs`,
      `Descarga: ${formatNumber(values.discharge, 2)} bar`,
      `Vazão: ${formatNumber(values.flow, 1)} m³/h`,
      `NPSHa: ${formatNumber(derived.npshAvailable, 1)} m · NPSHr: ${formatNumber(derived.npshRequired, 1)} m`,
      `Margem: ${formatNumber(derived.npshMargin, 1)} m`,
      `Índice de risco: ${formatNumber(derived.risk, 0)}/100`,
      '',
      `Atualizado: ${formatTimestamp(new Date(snapshot.updatedAt || Date.now()))}`,
      'Dados simulados do laboratório virtual.'
    ].join('\n');
  }

  async handleInbound(message = {}) {
    const text = String(message.text || '').trim().toUpperCase();
    const from = message.from || '';
    if (!text) return { handled: false };

    if (/^(STATUS|SITUACAO|SITUAÇÃO|LEITURA)$/.test(text)) {
      const reply = this.buildStatusReply();
      await this.sendWhatsApp(reply, from, { title: 'Status da estação' }).catch(() => {});
      return { handled: true, action: 'status' };
    }
    if (/^(SILENCIAR|PARAR|STOP)$/.test(text)) {
      this.settings.whatsappEnabled = false;
      const reply = '🔕 *HYDROVISION*\n\nNotificações do WhatsApp silenciadas. Envie *ATIVAR* para retomar.';
      await this.sendWhatsApp(reply, from).catch(() => {});
      return { handled: true, action: 'muted' };
    }
    if (/^(ATIVAR|START)$/.test(text)) {
      this.settings.whatsappEnabled = true;
      await this.sendWhatsApp('🔔 *HYDROVISION*\n\nNotificações reativadas.', from).catch(() => {});
      return { handled: true, action: 'unmuted' };
    }
    const help = [
      '🤖 *HYDROVISION · Assistente de plantão*',
      '',
      'Comandos disponíveis:',
      '• *STATUS* — resumo das variáveis da estação',
      '• *SILENCIAR* — pausa os alertas',
      '• *ATIVAR* — retoma os alertas',
      '',
      'Os dados são do laboratório virtual (demonstração).'
    ].join('\n');
    await this.sendWhatsApp(help, from).catch(() => {});
    return { handled: true, action: 'help' };
  }
}

function notificationSeverityLabel(severity) {
  return SEVERITY_LABEL[normalizeSeverity(severity)] || 'INFO';
}

export function registerNotificationRoutes(app, service) {
  app.get('/api/notifications', (req, res) => {
    res.json({ ...service.list({ limit: req.query.limit, onlyUnread: req.query.unread === '1' }), channels: service.channelStatus() });
  });

  app.get('/api/notifications/stream', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.write('retry: 4000\n\n');
    const unsubscribe = service.subscribe(res);
    req.on('close', unsubscribe);
  });

  app.post('/api/notifications', async (req, res) => {
    const result = await service.create(req.body || {});
    res.status(201).json(result);
  });

  app.post('/api/notifications/:id/read', (req, res) => {
    const item = service.markRead(req.params.id);
    if (!item) return res.status(404).json({ error: 'Notificação não encontrada.' });
    return res.json({ item, ...service.list({ limit: 60 }) });
  });

  app.post('/api/notifications/read-all', (_req, res) => {
    service.markAllRead();
    return res.json(service.list({ limit: 60 }));
  });

  app.post('/api/notifications/clear', (_req, res) => {
    service.clear();
    res.json({ ok: true });
  });

  app.get('/api/notifications/settings', (_req, res) => {
    res.json({ settings: service.settings, channels: service.channelStatus() });
  });

  app.post('/api/notifications/settings', (req, res) => {
    res.json({ settings: service.settings, channels: service.updateSettings(req.body || {}) });
  });

  app.get('/api/notifications/outbox', (req, res) => {
    res.json({ items: service.recentOutbox(req.query.limit), channels: service.channelStatus() });
  });

  app.post('/api/notifications/test', async (req, res) => {
    const body = buildAlertMessage({
      severity: 'INFO',
      title: 'Teste de integração WhatsApp',
      message: 'Se você recebeu esta mensagem, o canal de notificações da HYDROVISION está operacional.',
      suggestedAction: 'Nenhuma ação necessária. Mensagem de teste.',
      origin: 'SIMULADO',
      metrics: service.snapshot?.values || {}
    });
    const recipient = req.body?.recipient || service.settings.recipient;
    try {
      const delivery = await service.sendWhatsApp(body, recipient, { title: 'Teste de integração' });
      service.pushOutbox({ ...delivery, channel: 'whatsapp', body, test: true, recipient: onlyDigits(recipient) });
      res.json({ ok: delivery.status === 'sent', delivery, body, channels: service.channelStatus() });
    } catch (error) {
      res.status(502).json({ ok: false, error: error?.message || String(error), body, channels: service.channelStatus() });
    }
  });

  // ---------------------------------------------------------------- webhooks
  app.get('/api/whatsapp/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    if (mode === 'subscribe' && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      return res.status(200).send(req.query['hub.challenge']);
    }
    return res.status(403).send('Forbidden');
  });

  app.post('/api/whatsapp/webhook', async (req, res) => {
    res.status(200).json({ received: true });
    const payload = req.body || {};
    try {
      const messages = payload?.entry?.[0]?.changes?.[0]?.value?.messages || [];
      const inbound = messages[0];
      if (inbound?.text?.body) {
        await service.handleInbound({ from: inbound.from, text: inbound.text.body });
        return;
      }
      // Evolution API / webhook genérico
      const text = payload?.data?.message?.conversation
        || payload?.data?.message?.extendedTextMessage?.text
        || payload?.message
        || payload?.text;
      const from = payload?.data?.key?.remoteJid || payload?.from || '';
      if (text) await service.handleInbound({ from: onlyDigits(from), text });
    } catch (error) {
      console.error('WhatsApp inbound error:', error?.message || error);
    }
  });

  // ---------------------------------------------------------- telemetria base
  app.post('/api/telemetry', (req, res) => {
    res.json(service.setSnapshot(req.body || {}));
  });

  app.get('/api/telemetry', (_req, res) => {
    res.json({ snapshot: service.snapshot });
  });
}
