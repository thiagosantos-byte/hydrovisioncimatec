import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle, BellRing, Check, CheckCheck, Copy, ExternalLink, Inbox,
  Info, MessageCircle, RefreshCw, Send, Settings2, ShieldAlert, Smartphone, Wifi, WifiOff, X
} from 'lucide-react';

const SEVERITY_META = {
  CRITICO: { label: 'CRÍTICO', tone: 'critical', icon: ShieldAlert },
  ATENCAO: { label: 'ATENÇÃO', tone: 'warning', icon: AlertTriangle },
  INFO: { label: 'INFO', tone: 'good', icon: Info }
};

const CHANNEL_LABEL = {
  delivered: 'entregue',
  sent: 'enviado',
  queued: 'na fila',
  skipped: 'ignorado',
  demo: 'demonstração',
  failed: 'falhou',
  'not-configured': 'não configurado'
};

function timeLabel(item) {
  if (item.createdAtLabel) return item.createdAtLabel;
  const date = new Date(item.createdAt || Date.now());
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function ChannelBadge({ state, label }) {
  const ok = ['delivered', 'sent', 'demo'].includes(state);
  return (
    <span className={`ntf-channel-badge ${ok ? 'ok' : state === 'failed' ? 'fail' : 'idle'}`}>
      <i/>{label}: {CHANNEL_LABEL[state] || state || '—'}
    </span>
  );
}

export default function NotificationCenter({
  open, onClose, notifications = [], unread = 0, channels, settings = {},
  outbox = [], streamState = 'offline', tab, onTabChange,
  onRead, onReadAll, onClear, onSaveSettings, onTest, onRefresh, onSendToWhatsApp
}) {
  const [recipient, setRecipient] = useState(settings.recipient || '');
  const [testState, setTestState] = useState({ status: 'idle', message: '', link: '' });
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState('');

  useEffect(() => {
    setRecipient(settings.recipient || '');
  }, [settings.recipient]);

  const whatsapp = channels?.whatsapp || {};
  const inApp = channels?.inApp || {};
  const isDemo = whatsapp.mode === 'demo' || !whatsapp.configured;
  const activeTab = tab || 'alerts';

  const demoLink = useMemo(() => {
    const digits = String(settings.recipient || '').replace(/\D/g, '');
    if (!digits) return '';
    return `https://wa.me/${digits.length > 11 ? digits : `55${digits}`}`;
  }, [settings.recipient]);

  if (!open) return null;

  const save = async (patch) => {
    setSaving(true);
    try {
      await onSaveSettings?.({ ...settings, ...patch });
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    setTestState({ status: 'loading', message: 'Enviando teste...', link: '' });
    try {
      const result = await onTest?.(recipient);
      const delivery = result?.delivery || {};
      setTestState({
        status: delivery.status === 'sent' ? 'ok' : 'demo',
        message: delivery.status === 'sent'
          ? 'Mensagem enviada ao provedor de WhatsApp.'
          : (delivery.note || 'Sem credenciais configuradas: mensagem registrada na outbox.'),
        link: delivery.link || ''
      });
    } catch (error) {
      setTestState({ status: 'error', message: error?.message || 'Falha ao enviar o teste.', link: '' });
    }
  };

  const copy = async (text, id) => {
    const ok = await copyText(text);
    if (ok) {
      setCopied(id);
      setTimeout(() => setCopied(''), 1600);
    }
  };

  return (
    <>
      <motion.div className="ntf-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}/>
      <motion.aside
        className="ntf-drawer"
        role="dialog"
        aria-label="Central de notificações"
        initial={{ x: 40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 40, opacity: 0 }}
        transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <header className="ntf-head">
          <div className="ntf-head-title">
            <span className="ntf-mark"><BellRing size={17}/></span>
            <div>
              <strong>Central de notificações</strong>
              <small>No aplicativo + WhatsApp · {unread} não lida{unread === 1 ? '' : 's'}</small>
            </div>
          </div>
          <button className="ntf-close" onClick={onClose} aria-label="Fechar"><X size={16}/></button>
        </header>

        <div className="ntf-channels">
          <div className={`ntf-channel ${streamState === 'connected' ? 'ok' : 'idle'}`}>
            <span className="ntf-channel-dot"/>
            <div><strong>Aplicativo</strong><small>{streamState === 'connected' ? 'tempo real · SSE' : streamState === 'reconnecting' ? 'reconectando...' : 'conectando...'}</small></div>
            {streamState === 'connected' ? <Wifi size={14}/> : <WifiOff size={14}/>}
          </div>
          <div className={`ntf-channel ${whatsapp.configured ? 'ok' : 'demo'}`}>
            <span className="ntf-channel-dot"/>
            <div><strong>WhatsApp</strong><small>{whatsapp.configured ? `provedor ${whatsapp.provider}` : 'modo demonstração'}</small></div>
            <Smartphone size={14}/>
          </div>
        </div>

        <nav className="ntf-tabs">
          <button className={activeTab === 'alerts' ? 'active' : ''} onClick={() => onTabChange?.('alerts')}>Alertas {unread > 0 && <i>{unread}</i>}</button>
          <button className={activeTab === 'whatsapp' ? 'active' : ''} onClick={() => onTabChange?.('whatsapp')}>WhatsApp</button>
          <button className={activeTab === 'outbox' ? 'active' : ''} onClick={() => onTabChange?.('outbox')}>Envios</button>
        </nav>

        <div className="ntf-body">
          {activeTab === 'alerts' && (
            <div className="ntf-alerts">
              <div className="ntf-toolbar">
                <span>{notifications.length} registro{notifications.length === 1 ? '' : 's'}</span>
                <div>
                  <button onClick={() => onRefresh?.()} title="Atualizar"><RefreshCw size={13}/></button>
                  <button onClick={() => onReadAll?.()} title="Marcar todas como lidas"><CheckCheck size={13}/></button>
                  <button onClick={() => onClear?.()} title="Limpar histórico">Limpar</button>
                </div>
              </div>
              {notifications.length === 0 && (
                <div className="ntf-empty">
                  <Inbox size={26}/>
                  <strong>Nenhuma notificação ainda</strong>
                  <span>Execute um experimento para gerar alertas nos canais configurados.</span>
                </div>
              )}
              {notifications.map((item) => {
                const meta = SEVERITY_META[item.severity] || SEVERITY_META.INFO;
                const Icon = meta.icon;
                return (
                  <article key={item.id} className={`ntf-item ${meta.tone} ${item.read ? 'read' : ''}`}>
                    <span className="ntf-item-icon"><Icon size={15}/></span>
                    <div className="ntf-item-main">
                      <div className="ntf-item-top">
                        <span className="ntf-severity">{meta.label}</span>
                        <time>{timeLabel(item)}</time>
                      </div>
                      <strong>{item.title}</strong>
                      {item.message && <p>{item.message}</p>}
                      <div className="ntf-item-channels">
                        <ChannelBadge state={item.channels?.inApp} label="app"/>
                        <ChannelBadge state={item.channels?.whatsapp} label="wpp"/>
                        {item.origin === 'SIMULADO' && <span className="ntf-origin">simulado</span>}
                      </div>
                      {item.whatsapp?.link && (
                        <a className="ntf-wa-link" href={item.whatsapp.link} target="_blank" rel="noreferrer">
                          <MessageCircle size={12}/> Abrir no WhatsApp
                        </a>
                      )}
                    </div>
                    {!item.read && <button className="ntf-read" onClick={() => onRead?.(item.id)} title="Marcar como lida"><Check size={13}/></button>}
                  </article>
                );
              })}
            </div>
          )}

          {activeTab === 'whatsapp' && (
            <div className="ntf-wa">
              <div className={`ntf-wa-state ${isDemo ? 'demo' : 'live'}`}>
                <MessageCircle size={16}/>
                <div>
                  <strong>{isDemo ? 'Canal em modo demonstração' : `Canal ativo · ${whatsapp.provider}`}</strong>
                  <span>{isDemo
                    ? 'As mensagens ficam na aba Envios com o texto pronto e link wa.me. Configure as variáveis de ambiente para envio automático.'
                    : 'Alertas de atenção e críticos são enviados automaticamente ao número configurado.'}</span>
                </div>
              </div>

              <label className="ntf-switch-row">
                <div><strong>Enviar alertas no WhatsApp</strong><small>Respeita o nível mínimo de gravidade abaixo.</small></div>
                <button
                  className={`toggle-switch ${settings.whatsappEnabled ? 'on' : ''}`}
                  onClick={() => save({ whatsappEnabled: !settings.whatsappEnabled })}
                  aria-label="Ativar notificações no WhatsApp"
                ><i/></button>
              </label>

              <div className="ntf-field">
                <label>Número de destino (com DDI/DDD)</label>
                <div className="ntf-field-row">
                  <input
                    value={recipient}
                    onChange={(event) => setRecipient(event.target.value)}
                    placeholder="55 11 99999-9999"
                    inputMode="tel"
                  />
                  <button className="ntf-btn" disabled={saving} onClick={() => save({ recipient })}>Salvar</button>
                </div>
                <small>Exemplo: 5511999999999. O número precisa estar habilitado no provedor.</small>
              </div>

              <div className="ntf-field">
                <label>Gravidade mínima</label>
                <select value={settings.minSeverity || 'ATENCAO'} onChange={(event) => save({ minSeverity: event.target.value })}>
                  <option value="INFO">INFO — todos os eventos</option>
                  <option value="ATENCAO">ATENÇÃO — atenção e crítico</option>
                  <option value="CRITICO">CRÍTICO — somente crítico</option>
                </select>
              </div>

              <div className="ntf-test">
                <button className="ntf-btn primary" onClick={runTest}>
                  <Send size={13}/> Enviar mensagem de teste
                </button>
                {testState.status !== 'idle' && (
                  <div className={`ntf-test-result ${testState.status}`}>
                    <span>{testState.message}</span>
                    {testState.link && <a href={testState.link} target="_blank" rel="noreferrer">Abrir conversa <ExternalLink size={11}/></a>}
                  </div>
                )}
              </div>

              <div className="ntf-providers">
                <strong>Provedores suportados</strong>
                <ul>
                  <li><b>Meta Cloud API</b> — WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID</li>
                  <li><b>Twilio</b> — TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_WHATSAPP_FROM</li>
                  <li><b>Evolution API</b> — EVOLUTION_API_URL + EVOLUTION_INSTANCE</li>
                  <li><b>Webhook</b> — NOTIFY_WEBHOOK_URL (n8n, Zapier, Make)</li>
                </ul>
                {Array.isArray(whatsapp.missing) && whatsapp.missing.length > 0 && (
                  <small>Faltando no ambiente: {whatsapp.missing.join(', ')}</small>
                )}
                <div className="ntf-webhook">
                  <Settings2 size={12}/>
                  Webhook de entrada: <code>/api/whatsapp/webhook</code> · comandos STATUS, SILENCIAR, ATIVAR.
                </div>
              </div>

              {demoLink && (
                <a className="ntf-btn ghost" href={demoLink} target="_blank" rel="noreferrer">
                  <MessageCircle size={13}/> Abrir conversa com o número salvo
                </a>
              )}
            </div>
          )}

          {activeTab === 'outbox' && (
            <div className="ntf-outbox">
              <div className="ntf-toolbar">
                <span>{outbox.length} envio{outbox.length === 1 ? '' : 's'} registrado{outbox.length === 1 ? '' : 's'}</span>
                <div><button onClick={() => onRefresh?.()} title="Atualizar"><RefreshCw size={13}/></button></div>
              </div>
              {outbox.length === 0 && (
                <div className="ntf-empty">
                  <Inbox size={26}/>
                  <strong>Nenhum envio registrado</strong>
                  <span>Alertas gerados aparecem aqui com provedor, destinatário e corpo da mensagem.</span>
                </div>
              )}
              {outbox.map((entry) => (
                <article key={entry.id} className="ntf-out">
                  <div className="ntf-out-top">
                    <span className={`ntf-provider ${entry.status}`}>{entry.provider || entry.channel}</span>
                    <time>{timeLabel(entry)}</time>
                  </div>
                  <div className="ntf-out-meta">
                    <span>{CHANNEL_LABEL[entry.status] || entry.status}</span>
                    {entry.recipient && <span>→ {entry.recipient}</span>}
                    {entry.test && <span>teste</span>}
                  </div>
                  <pre>{entry.body}</pre>
                  <div className="ntf-out-actions">
                    <button onClick={() => copy(entry.body, entry.id)}>
                      {copied === entry.id ? <Check size={12}/> : <Copy size={12}/>} {copied === entry.id ? 'Copiado' : 'Copiar mensagem'}
                    </button>
                    {onSendToWhatsApp && entry.link && <a href={entry.link} target="_blank" rel="noreferrer"><MessageCircle size={12}/> WhatsApp</a>}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <footer className="ntf-foot">
          <ShieldAlert size={12}/>
          Ambiente demonstrativo · nenhum atuador físico é acionado por notificações.
        </footer>
      </motion.aside>
    </>
  );
}
