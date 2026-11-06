import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';
import { NotificationService, registerNotificationRoutes, severityFromRisk } from './notifications.js';

const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN?.split(',') || true }));
app.use(express.json({ limit: '1mb' }));

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
const localRuns = [];
const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasSupabase = Boolean(supabaseUrl && supabaseKey);

const notifications = new NotificationService();
registerNotificationRoutes(app, notifications);

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'online',
    aiProvider: openai ? 'openai' : 'local',
    persistence: hasSupabase ? 'supabase' : 'memory',
    notifications: notifications.channelStatus(),
    timestamp: new Date().toISOString()
  });
});

/* ---------------------------------------------------------------- alertas */

/** Regras padrão compartilhadas com o frontend (GET /api/alerts/rules). */
const ALERT_RULES = [
  { id: 'npsh', label: 'Margem de NPSH negativa', metric: 'npshMargin', operator: '<', threshold: 0, severity: 'CRITICO', action: 'Verificar restrição na sucção, nível do tanque e temperatura do fluido.' },
  { id: 'npsh-watch', label: 'Margem de NPSH abaixo de 1,5 m', metric: 'npshMargin', operator: '<', threshold: 1.5, severity: 'ATENCAO', action: 'Inspecionar filtro e linha de sucção antes de elevar a vazão.' },
  { id: 'suction-pressure', label: 'Pressão de sucção baixa', metric: 'suction', operator: '<', threshold: 0.85, severity: 'CRITICO', action: 'Checar restrição, válvula de sucção e submergência.' },
  { id: 'level', label: 'Nível do tanque abaixo de 25%', metric: 'level', operator: '<', threshold: 25, severity: 'ATENCAO', action: 'Restabelecer reposição e validar a medição do radar de nível.' },
  { id: 'air', label: 'Entrada de ar acima de 40%', metric: 'air', operator: '>', threshold: 40, severity: 'ATENCAO', action: 'Purgar a linha e revisar vedações e juntas da sucção.' },
  { id: 'vibration', label: 'Vibração acima de 4,5 mm/s', metric: 'vibration', operator: '>', threshold: 4.5, severity: 'ATENCAO', action: 'Verificar alinhamento, acoplamento e balanceamento.' },
  { id: 'temperature', label: 'Temperatura acima de 65 °C', metric: 'temperature', operator: '>', threshold: 65, severity: 'CRITICO', action: 'Reduzir carga e verificar refrigeração e lubrificação.' },
  { id: 'sensor', label: 'Sensor de pressão sem comunicação', metric: 'sensorOnline', operator: '==', threshold: 0, severity: 'CRITICO', action: 'Verificar alimentação, cabeamento e calibração do instrumento.' },
  { id: 'flow', label: 'Vazão abaixo de 60% do nominal', metric: 'flowRatio', operator: '<', threshold: 0.6, severity: 'ATENCAO', action: 'Comparar com a curva da bomba e checar bloqueios na linha.' }
];

app.get('/api/alerts/rules', (_req, res) => {
  res.json({ rules: ALERT_RULES, severityFromRisk: { 65: 'CRITICO', 30: 'ATENCAO', 0: 'INFO' } });
});

app.get('/api/alerts/summary', (_req, res) => {
  const snapshot = notifications.snapshot;
  const list = notifications.list({ limit: 200 }).items;
  const open = list.filter((item) => item.severity !== 'INFO');
  res.json({
    total: list.length,
    critical: open.filter((item) => item.severity === 'CRITICO').length,
    warning: open.filter((item) => item.severity === 'ATENCAO').length,
    lastAlert: list[0] || null,
    snapshot,
    channels: notifications.channelStatus()
  });
});

async function saveAlertToSupabase(alert) {
  if (!hasSupabase || alert.severity === 'INFO') return;
  try {
    await fetch(`${supabaseUrl}/rest/v1/alertas`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({
        titulo: alert.title,
        descricao: alert.message || alert.title,
        gravidade: alert.severity === 'CRITICO' ? 'CRITICO' : 'ATENCAO',
        origem: 'SIMULADO',
        status: 'ABERTO'
      })
    });
  } catch (error) {
    console.error('Alerta Supabase:', error?.message || error);
  }
}

app.post('/api/alerts', async (req, res) => {
  const payload = req.body || {};
  const severity = payload.severity || severityFromRisk(payload.metrics?.risk);
  const result = await notifications.create({ ...payload, severity });
  if (!result.deduplicated && result.notification) saveAlertToSupabase(result.notification);
  res.status(201).json(result);
});

/* -------------------------------------------------------------- HYDRO AI */

function fmt(value, digits = 1) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : '—';
}

function localTechnicalAnswer(message, simulation = {}) {
  const text = String(message || '').toLowerCase();
  const level = Number(simulation.level ?? 0);
  const suction = Number(simulation.suction ?? 0);
  const air = Number(simulation.air ?? 0);
  const risk = Number(simulation.risk ?? 0);
  const npsha = Number(simulation.npshAvailable ?? 0);
  const npshr = Number(simulation.npshRequired ?? 0);
  const margin = Number(simulation.npshMargin ?? (npsha - npshr));
  const scenario = simulation.scenario || 'normal';
  const source = 'Os valores citados pertencem ao laboratório virtual e não são medições de campo.';

  if (text.includes('cavita') || scenario === 'cavitation' || margin < 0) {
    return `**Cavitação — análise técnica**\n\nA cavitação ocorre quando a pressão local cai abaixo da pressão de vapor do líquido e as bolhas colapsam na saída do rotor. O critério de engenharia é a comparação entre NPSH disponível e requerido.\n\n**Situação simulada:** NPSHa ${fmt(npsha)} m · NPSHr ${fmt(npshr)} m · margem ${fmt(margin)} m (${margin < 0 ? 'negativa — risco de cavitação' : 'positiva'}).\n\n**Verificações recomendadas:**\n- Confirmar nível do tanque e submergência da sucção.\n- Inspecionar filtro, válvulas, conexões e possíveis restrições.\n- Conferir pressão absoluta e temperatura do fluido (vapor).\n- Comparar a vazão com a curva e o NPSHr do fabricante.\n- Avaliar instalação de sensor de nível radar para leitura fidedigna.\n\n${source}`;
  }
  if (text.includes('entrada de ar') || text.includes('bolha') || /\bar\b/.test(text) || scenario === 'air') {
    return `**Entrada de ar — análise técnica**\n\nAr na linha provoca escoamento irregular, perda de escorva, ruído e instabilidade de vazão, além de reduzir a eficiência e elevar a vibração.\n\n**Situação simulada:** entrada de ar ${fmt(air, 0)}% · vazão ${fmt(simulation.flow)} m³/h · margem NPSH ${fmt(margin)} m.\n\n**Verificações recomendadas:** conexões e juntas da sucção, vedações da bomba, submergência, purga e nível mínimo do tanque.\n\n${source}`;
  }
  if (text.includes('nível') || text.includes('tanque') || scenario === 'low-level') {
    return `**Nível baixo — análise técnica**\n\nO nível simulado é ${fmt(level, 0)}%. Nível insuficiente reduz a submergência, favorece vórtice e arraste de ar e compromete a margem de NPSH.\n\n**Ações possíveis:** validar o radar de nível, restabelecer a reposição, avaliar o poço de sucção e configurar limites operacionais aprovados.\n\n${source}`;
  }
  if (text.includes('instrument') || scenario === 'instrumentation') {
    return `**Instrumentação — análise técnica**\n\nPerda de comunicação impede confiar na atualização do sensor. A interface deve marcar a leitura como indisponível, nunca manter o último valor como atual.\n\n**Verificações:** alimentação, cabeamento, conectores, rede, gateway, calibração e diagnóstico do instrumento. Para o nível, um radar com diagnóstico e redundância reduz o risco de medição falsa.\n\n${source}`;
  }
  if (text.includes('whatsapp') || text.includes('notifica') || text.includes('alerta')) {
    return `**Notificações — como funciona**\n\nO backend mantém uma central de notificações com três canais: no aplicativo (tempo real via SSE), WhatsApp (Cloud API, Twilio, Evolution API ou webhook) e webhook genérico.\n\n**Boas práticas:** notificar apenas ATENÇÃO e CRÍTICO, agrupar eventos repetidos (cooldown), registrar a outbox para auditoria e permitir silenciar por comando no WhatsApp.\n\nO ambiente é demonstrativo; nenhum atuador físico é acionado.`;
  }
  if (text.includes('solução') || text.includes('resolver') || text.includes('corrigir')) {
    return `**Plano de verificação sugerido**\n\n1. Confirmar a qualidade e a calibração dos instrumentos (radar de nível).\n2. Conferir nível, linha de sucção, válvulas e filtros.\n3. Comparar as condições medidas com a curva da bomba e o NPSHr.\n4. Purgar a linha e revisar vedações quando houver ar.\n5. Registrar a intervenção e acompanhar a estabilidade após a correção.\n\nA solução aplicada no laboratório virtual altera apenas os parâmetros demonstrativos. ${source}`;
  }
  const suctionText = simulation.sensorOnline === false ? 'indisponível (sensor sem sinal)' : `${fmt(suction, 2)} bar abs`;
  return `**HYDRO AI — análise do contexto**\n\nCenário: ${scenario}. Nível: ${fmt(level, 0)}%. Pressão de sucção: ${suctionText}. Vazão simulada: ${fmt(simulation.flow)} m³/h. NPSHa ${fmt(npsha)} m / NPSHr ${fmt(npshr)} m. Entrada de ar: ${fmt(air, 0)}%. Índice didático: ${risk}/100.\n\nPosso explicar cavitação, entrada de ar, nível baixo, instrumentação e as notificações do sistema. ${source}`;
}

app.post('/api/ai/chat', async (req, res) => {
  const { message, context = [], simulation = {} } = req.body || {};
  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Informe uma mensagem para a HYDRO AI.' });
  }

  if (!openai) {
    return res.json({ answer: localTechnicalAnswer(message, simulation), mode: 'local' });
  }

  try {
    const system = `Você é a HYDRO AI, assistente técnico de uma plataforma acadêmica de monitoramento e simulação de bombeamento hidráulico. Responda em português brasileiro, com clareza e cautela. Diferencie medições reais, simulações, estimativas e hipóteses. Nunca declare uma falha como confirmada sem evidências. Ao falar de cavitação, explique que a avaliação exige NPSHa versus NPSHr, pressão absoluta, temperatura do fluido, perdas na sucção e dados da bomba. Não dê instruções para acionar ou desligar fisicamente equipamentos. A plataforma é supervisória; intertravamentos reais devem ficar em controladores industriais adequados. O contexto desta instalação é de demonstração, salvo indicação explícita em contrário. Quando fizer sentido, cite o uso de sensor de nível radar e o canal de notificações (aplicativo e WhatsApp) como recursos de supervisão.`;
    const input = [
      ...context.slice(-8).map((item) => ({ role: item.role === 'assistant' ? 'assistant' : 'user', content: String(item.content || '') })),
      { role: 'user', content: `Contexto atual da simulação: ${JSON.stringify(simulation)}\n\nPergunta: ${message}` }
    ];
    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
      instructions: system,
      input,
      max_output_tokens: 750
    });
    res.json({ answer: response.output_text || localTechnicalAnswer(message, simulation), mode: 'openai' });
  } catch (error) {
    console.error('HYDRO AI error:', error?.message || error);
    res.status(200).json({
      answer: localTechnicalAnswer(message, simulation),
      mode: 'local-fallback',
      note: 'O serviço de IA externa está indisponível; foi utilizada a análise técnica local.'
    });
  }
});

/* ------------------------------------------------------- persistência demo */

async function saveRun(record) {
  if (!hasSupabase) {
    localRuns.unshift(record);
    localRuns.splice(40);
    return { persistence: 'memory' };
  }
  const response = await fetch(`${supabaseUrl}/rest/v1/execucoes_simulacao`, {
    method: 'POST',
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify({
      cenario: record.scenario,
      parametros: record.values?.before || {},
      resultado: record.values?.after || {},
      origem: 'DEMO'
    })
  });
  if (!response.ok) throw new Error(`Supabase retornou ${response.status}: ${await response.text()}`);
  return { persistence: 'supabase', data: await response.json() };
}

app.post('/api/simulations/record', async (req, res) => {
  const { scenario, values } = req.body || {};
  const record = {
    id: `SIM-${Date.now()}`,
    scenario: scenario || 'normal',
    values: values || {},
    recordedAt: new Date().toISOString(),
    source: 'DEMO'
  };
  try {
    const stored = await saveRun(record);
    res.status(201).json({ ...record, persistence: stored.persistence });
  } catch (error) {
    console.error('Simulation persistence error:', error?.message || error);
    res.status(502).json({ error: 'Não foi possível persistir a execução no Supabase.', fallback: record });
  }
});

app.get('/api/simulations/recent', (_req, res) => {
  res.json({ items: localRuns.slice(0, 20), persistence: hasSupabase ? 'supabase' : 'memory' });
});

const port = Number(process.env.PORT || 3001);
app.listen(port, () => console.log(`HYDROVISION API disponível em http://localhost:${port}`));
