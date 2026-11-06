import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, Bell, BellRing, BrainCircuit,
  Camera, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Copy, Cpu, Droplets, Expand,
  FlaskConical, Gauge, History, Layers3, MessageCircle, Minimize2, Moon, PanelBottomClose,
  PanelBottomOpen, Pause, Play, Radar, RotateCcw, Send, ShieldCheck, Signal, SlidersHorizontal,
  Sparkles, Stethoscope, Sun, Waves, Wifi, X, Zap
} from 'lucide-react';
import {
  Area, AreaChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer,
  Tooltip, XAxis, YAxis
} from 'recharts';
import HydraulicScene from './components/HydraulicScene.jsx';
import NotificationCenter from './components/NotificationCenter.jsx';
import DiagnosticsPanel from './components/DiagnosticsPanel.jsx';
import {
  DEFAULT_INPUTS, PHYS, SCENARIO_PROFILES, buildRecommendation, conditionFromRisk,
  createPlant, derivePlant, scenarioInputs, stepPlant
} from './lib/hydraulics.js';
import { API_BASE, notificationsApi, subscribeNotifications } from './lib/notifications.js';

/* --------------------------------------------------------------- constantes */

const initialInputs = { ...DEFAULT_INPUTS };

const scenarios = [
  { id: 'cavitation', number: '01', name: 'Cavitação', description: 'Restrição na sucção e NPSH insuficiente', icon: Waves, color: 'amber' },
  { id: 'air', number: '02', name: 'Entrada de ar', description: 'Ar na linha hidráulica', icon: Droplets, color: 'blue' },
  { id: 'low-level', number: '03', name: 'Nível baixo', description: 'Submergência insuficiente no tanque', icon: ArrowDownRight, color: 'amber' },
  { id: 'instrumentation', number: '04', name: 'Instrumentação', description: 'Perda de sinal e deriva de medição', icon: Signal, color: 'red' }
];

const presentationStages = [
  { title: 'Visão geral da instalação', description: 'Arquitetura do sistema de bombeamento, instrumentação e relação entre os equipamentos.', view: 'overview', component: null, mode: 'normal' },
  { title: 'Conjunto motobomba', description: 'Bomba centrífuga, motor elétrico, acoplamento e base estrutural.', view: 'pump', component: 'pump', mode: 'normal' },
  { title: 'Reservatório e nível', description: 'Tanque vertical, visor, radar de nível e estrutura de suporte.', view: 'tank', component: 'tank', mode: 'normal' },
  { title: 'Instrumentação', description: 'Manômetros, medidor de vazão e sensores que acompanham o processo.', view: 'sensor-pressure', component: 'sensor-pressure', mode: 'normal' },
  { title: 'Circulação hidráulica', description: 'Caminho do fluido nas linhas de sucção e descarga, com visores de inspeção.', view: 'overview', component: null, mode: 'normal' },
  { title: 'Anormalidade simulada', description: 'Cavitação: a restrição na sucção derruba o NPSHa abaixo do NPSHr.', view: 'pump', component: 'pump', mode: 'fault' },
  { title: 'Recuperação operacional', description: 'Limpeza da sucção, purga e radar de nível devolvem a margem de NPSH.', view: 'overview', component: null, mode: 'recovery' }
];

const componentInfo = {
  tank: { title: 'Tanque principal', code: 'TNQ-001', detail: 'Reservatório vertical · visor de nível e radar superior' },
  pump: { title: 'Bomba centrífuga', code: 'BMB-001', detail: 'Bomba horizontal · conjunto de sucção e descarga' },
  motor: { title: 'Motor elétrico', code: 'MTR-001', detail: 'Motor de indução com aletas de dissipação' },
  suction: { title: 'Linha de sucção', code: 'SUC-001', detail: 'Trecho entre o tanque e o bocal de sucção' },
  discharge: { title: 'Linha de descarga', code: 'DSC-001', detail: 'Tubulação de recalque após a bomba' },
  'sensor-level': { title: 'Radar de nível', code: 'SEN-NVL-01', detail: 'Medição contínua do nível do tanque' },
  'sensor-pressure': { title: 'Manômetro de sucção', code: 'SEN-PRS-01', detail: 'Pressão absoluta na linha de sucção' },
  'sensor-flow': { title: 'Medidor de vazão', code: 'SEN-VAZ-01', detail: 'Medição da vazão na linha de descarga' },
  'suction-valve': { title: 'Válvula de sucção', code: 'VLV-SUC-01', detail: 'Válvula de bloqueio instalada na linha de sucção' },
  'discharge-valve': { title: 'Válvula de descarga', code: 'VLV-DSC-01', detail: 'Válvula de bloqueio instalada na linha de descarga' }
};

const navItems = [
  { id: 'overview', label: 'Visão geral', icon: Activity },
  { id: 'digital', label: 'Digital Twin', icon: Layers3 },
  { id: 'experiments', label: 'Experimentos', icon: FlaskConical },
  { id: 'diagnostics', label: 'Diagnóstico', icon: Stethoscope },
  { id: 'history', label: 'Histórico', icon: History }
];

/* ----------------------------------------------------------------- helpers */

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round = (value, digits = 1) => Number(Number(value || 0).toFixed(digits));
const fmt = (value, digits = 1) => Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });

function lerpInputs(from, to, t) {
  const out = { ...from };
  Object.keys(to).forEach((key) => {
    if (typeof to[key] === 'number' && typeof from[key] === 'number') out[key] = from[key] + (to[key] - from[key]) * t;
    else if (t > 0.55) out[key] = to[key];
  });
  return out;
}

function Sparkline({ data = [], tone = 'accent' }) {
  const values = data.length > 1 ? data : [0, 0];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * 84;
    const y = 24 - ((value - min) / span) * 20 - 2;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
  return (
    <svg className={`metric-spark spark-${tone}`} viewBox="0 0 84 26" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={points} fill="none" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round"/>
    </svg>
  );
}

function Metric({ label, value, unit, icon: Icon, sub, tone = 'normal', spark = [], delta = null }) {
  return (
    <div className={`metric metric-${tone}`}>
      <div className="metric-top"><span>{label}</span><Icon size={14}/></div>
      <div className="metric-value-row"><strong>{value}</strong>{unit && <span>{unit}</span>}</div>
      <div className="metric-foot">
        <span>{sub}</span>
        {delta !== null && <em className={delta >= 0 ? 'up' : 'down'}>{delta >= 0 ? <ArrowUpRight size={10}/> : <ArrowDownRight size={10}/>}{fmt(Math.abs(delta), 1)}</em>}
      </div>
      <Sparkline data={spark} tone={tone}/>
    </div>
  );
}

function HealthRing({ risk, tone }) {
  const radius = 23;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className={`health-ring ${tone}`}>
      <svg viewBox="0 0 60 60">
        <circle className="ring-track" cx="30" cy="30" r={radius}/>
        <circle
          className="ring-value"
          cx="30" cy="30" r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamp(risk, 0, 100) / 100)}
        />
      </svg>
      <div><strong>{Math.round(risk)}</strong><small>/100</small></div>
    </div>
  );
}

function DeckTab({ active, onClick, icon: Icon, label, count }) {
  return <button className={`deck-tab ${active ? 'active' : ''}`} onClick={onClick}><Icon size={15}/><span>{label}</span>{count > 0 && <small>{count}</small>}</button>;
}

function MarkdownLite({ text }) {
  return <div className="message-copy">{String(text).split('\n').map((line, index) => {
    const cleaned = line.replace(/\*\*(.*?)\*\*/g, '$1');
    if (cleaned.startsWith('- ')) return <div className="message-bullet" key={index}><span>•</span>{cleaned.slice(2)}</div>;
    if (/^\d+\. /.test(cleaned)) return <div className="message-bullet" key={index}><span>{cleaned.match(/^\d+/)[0]}.</span>{cleaned.replace(/^\d+\. /, '')}</div>;
    return <div key={index}>{cleaned || '\u00a0'}</div>;
  })}</div>;
}

function toneFromRisk(risk) {
  return risk >= 65 ? 'critical' : risk >= 30 ? 'warning' : 'good';
}

/* --------------------------------------------------------------------- app */

export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem('hydrovision-theme') || 'dark');
  const [section, setSection] = useState('overview');
  const [deckTab, setDeckTab] = useState('experiments');
  const [deckOpen, setDeckOpen] = useState(true);
  const [selected, setSelected] = useState(null);
  const [viewPreset, setViewPreset] = useState('overview');
  const [viewResetKey, setViewResetKey] = useState(0);
  const [renderQuality, setRenderQuality] = useState('auto');

  const [scenario, setScenario] = useState('normal');
  const [inputs, setInputs] = useState(initialInputs);
  const [plant, setPlant] = useState(() => createPlant());
  const [simulation, setSimulation] = useState({ status: 'idle', kind: 'fault', progress: 0, ramp: 0 });
  const [solutionApplied, setSolutionApplied] = useState(false);
  const [comparison, setComparison] = useState(null);
  const [history, setHistory] = useState([]);
  const [trend, setTrend] = useState([]);
  const [toast, setToast] = useState('');
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Olá! Sou a HYDRO AI. Analiso os parâmetros do laboratório virtual, explico as condições hidráulicas e sugiro verificações técnicas. Acompanho também as notificações no aplicativo e no WhatsApp.' }
  ]);
  const [input, setInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMode, setAiMode] = useState('local');
  const [apiOnline, setApiOnline] = useState(false);

  const [notifications, setNotifications] = useState([]);
  const [channels, setChannels] = useState(null);
  const [notifSettings, setNotifSettings] = useState({ whatsappEnabled: true, minSeverity: 'ATENCAO', recipient: '' });
  const [outbox, setOutbox] = useState([]);
  const [streamState, setStreamState] = useState('offline');
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notificationTab, setNotificationTab] = useState('alerts');

  const [presentMode, setPresentMode] = useState(false);
  const [presentationStep, setPresentationStep] = useState(0);

  /* refs espelhando o estado para o loop de simulação */
  const plantRef = useRef(plant);
  const inputsRef = useRef(inputs);
  const simRef = useRef(simulation);
  const scenarioRef = useRef(scenario);
  const runRef = useRef(null);
  const derivedRef = useRef(null);
  const finishRef = useRef(() => {});
  const alertsRef = useRef(() => {});
  const alertCooldown = useRef({});
  const telemetryTick = useRef(0);
  const notificationIds = useRef(new Set());

  plantRef.current = plant;
  inputsRef.current = inputs;
  simRef.current = simulation;
  scenarioRef.current = scenario;

  const derived = useMemo(() => derivePlant(plant, inputs), [plant, inputs]);
  derivedRef.current = derived;

  const risk = derived.risk;
  const state = conditionFromRisk(risk);
  const tone = toneFromRisk(risk);
  const unread = notifications.filter((item) => !item.read).length;
  const currentScenario = scenarios.find((item) => item.id === scenario);
  const recommendation = buildRecommendation(derived, inputs);
  const transport = inputs.running && inputs.suctionValve > 0.5 && inputs.dischargeValve > 0.5;
  const cavitationNow = derived.cavitation && transport;
  const airNow = derived.air > 20 && transport;

  const operatingValues = {
    running: inputs.running,
    suctionValveOpen: inputs.suctionValve > 0.5,
    dischargeValveOpen: inputs.dischargeValve > 0.5,
    sensorOnline: inputs.sensorOnline,
    radarOnline: inputs.radarOnline,
    level: round(plant.level, 0),
    suction: plant.suction,
    discharge: plant.discharge,
    flow: plant.flow,
    temperature: plant.temperature,
    air: round(plant.air, 0),
    speed: plant.speed,
    npshMargin: derived.npshMargin,
    solutionApplied
  };

  const selectedBaseInfo = selected ? componentInfo[selected] : null;
  const selectedDynamic = {
    tank: { value: `${round(plant.level, 0)}%`, status: plant.level < 25 ? 'Nível baixo' : 'Monitorado' },
    suction: { value: `${fmt(plant.suction, 2)} bar abs`, status: inputs.sensorOnline ? 'Linha pressurizada' : 'Sem sinal' },
    discharge: { value: `${fmt(plant.discharge, 2)} bar`, status: inputs.dischargeValve > 0.5 ? 'Linha pressurizada' : 'Válvula fechada' },
    pump: { value: inputs.running ? `${Math.round(plant.speed * 1750)} rpm` : '0 rpm', status: inputs.running ? 'Em operação' : 'Parada' },
    motor: { value: `${fmt(plant.temperature, 1)} °C`, status: inputs.running ? 'Em operação' : 'Parado' },
    'sensor-level': { value: `${round(plant.lastMeasure?.level ?? plant.level, 1)}%`, status: inputs.radarOnline ? 'Conectado' : 'Sem comunicação' },
    'sensor-pressure': { value: inputs.sensorOnline ? `${fmt(plant.suction, 2)} bar abs` : '— · sem sinal', status: inputs.sensorOnline ? 'Conectado' : 'Sem comunicação' },
    'sensor-flow': { value: `${fmt(plant.flow, 1)} m³/h`, status: 'Conectado' },
    'suction-valve': { value: inputs.suctionValve > 0.5 ? '100% · aberta' : '0% · fechada', status: inputs.suctionValve > 0.5 ? 'Passagem liberada' : 'Sucção bloqueada' },
    'discharge-valve': { value: inputs.dischargeValve > 0.5 ? '100% · aberta' : '0% · fechada', status: inputs.dischargeValve > 0.5 ? 'Passagem liberada' : 'Descarga bloqueada' }
  };
  const selectedInfo = selectedBaseInfo ? { ...selectedBaseInfo, ...(selectedDynamic[selected] || {}) } : null;

  /* ---------------------------------------------------------- notificações */

  const mergeNotification = useCallback((incoming) => {
    if (!incoming?.id) return;
    setNotifications((current) => {
      const index = current.findIndex((item) => item.id === incoming.id);
      if (index >= 0) {
        const copy = [...current];
        copy[index] = { ...copy[index], ...incoming };
        return copy;
      }
      notificationIds.current.add(incoming.id);
      return [incoming, ...current].slice(0, 80);
    });
  }, []);

  const refreshChannels = useCallback(async () => {
    try {
      const [list, settingsResponse, outboxResponse] = await Promise.all([
        notificationsApi.list(),
        notificationsApi.settings(),
        notificationsApi.outbox()
      ]);
      setNotifications(list.items || []);
      (list.items || []).forEach((item) => notificationIds.current.add(item.id));
      setChannels(list.channels || null);
      setNotifSettings(settingsResponse.settings || {});
      setChannels(settingsResponse.channels || list.channels || null);
      setOutbox(outboxResponse.items || []);
    } catch {
      setApiOnline(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    notificationsApi.health().then((data) => {
      if (cancelled) return;
      setApiOnline(true);
      setAiMode(data.aiProvider === 'openai' ? 'openai' : 'local');
      if (data.notifications) setChannels(data.notifications);
      if (data.notifications?.whatsapp) {
        setNotifSettings((current) => ({
          ...current,
          whatsappEnabled: data.notifications.whatsapp.enabled,
          minSeverity: data.notifications.whatsapp.minSeverity,
          recipient: data.notifications.whatsapp.recipient
        }));
      }
    }).catch(() => setApiOnline(false));
    refreshChannels();
    const unsubscribe = subscribeNotifications({
      onStatus: setStreamState,
      onEvent: (event) => {
        if (event.type === 'notification' || event.type === 'notification-update') {
          setApiOnline(true);
          mergeNotification(event.notification);
        }
        if (event.type === 'outbox' && event.entry) {
          setOutbox((current) => [event.entry, ...current.filter((item) => item.id !== event.entry.id)].slice(0, 40));
        }
        if (event.type === 'read' && event.id) {
          setNotifications((current) => current.map((item) => item.id === event.id ? { ...item, read: true } : item));
        }
        if (event.type === 'read-all') {
          setNotifications((current) => current.map((item) => ({ ...item, read: true })));
        }
        if (event.type === 'clear') setNotifications([]);
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [mergeNotification, refreshChannels]);

  const emitAlert = useCallback(async (payload) => {
    const notification = {
      origin: 'SIMULADO',
      equipment: 'BMB-001',
      metrics: {
        level: round(plantRef.current.level, 0),
        suction: round(plantRef.current.suction, 2),
        discharge: round(plantRef.current.discharge, 2),
        flow: round(plantRef.current.flow, 1),
        npshMargin: round(derivedRef.current?.npshMargin, 1),
        temperature: round(plantRef.current.temperature, 1),
        air: round(plantRef.current.air, 0),
        risk: derivedRef.current?.risk
      },
      ...payload
    };
    try {
      const result = await notificationsApi.create(notification);
      if (result?.notification) mergeNotification(result.notification);
      setApiOnline(true);
    } catch {
      const local = {
        ...notification,
        id: `LOCAL-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
        createdAt: new Date().toISOString(),
        createdAtLabel: new Date().toLocaleString('pt-BR'),
        read: false,
        channels: { inApp: 'delivered', whatsapp: 'queued', webhook: 'not-configured' }
      };
      mergeNotification(local);
      setApiOnline(false);
    }
    setToast(`Notificação registrada: ${payload.title}`);
  }, [mergeNotification]);

  /* ------------------------------------------------------ loop de simulação */

  useEffect(() => {
    const interval = setInterval(() => {
      const now = performance.now();
      const run = runRef.current;
      const sim = simRef.current;
      let nextInputs = inputsRef.current;
      let nextStatus = sim.status;
      let ramp = sim.ramp;
      let progress = sim.progress;

      if (run && (sim.status === 'running' || sim.status === 'applying')) {
        ramp = clamp(run.rampStart + (now - run.startedAt) / 1000 / run.totalDuration, 0, 1);
        progress = Math.round(ramp * 100);
        if (run.kind === 'fault') {
          nextInputs = scenarioInputs(scenarioRef.current, ramp, run.baseInputs);
        } else {
          const eased = ramp * ramp * (3 - 2 * ramp);
          nextInputs = lerpInputs(run.baseInputs, run.correctiveInputs, eased);
          if (ramp > 0.25) {
            nextInputs.sensorOnline = true;
            nextInputs.radarOnline = true;
          }
        }
        inputsRef.current = nextInputs;
        setInputs(nextInputs);
        if (ramp >= 1) {
          nextStatus = run.kind === 'fault' ? 'completed' : 'recovered';
          runRef.current = null;
          finishRef.current?.(run.kind);
        }
      }

      if (sim.status !== 'paused') {
        const next = stepPlant(plantRef.current, nextInputs, 0.12);
        plantRef.current = next;
        setPlant(next);
        if (nextStatus !== sim.status || progress !== sim.progress) {
          setSimulation({ status: nextStatus, kind: sim.kind, progress, ramp });
        }
      }

      telemetryTick.current += 1;
      if (telemetryTick.current % 40 === 0) {
        alertsRef.current?.();
      }
      if (telemetryTick.current % 55 === 0) {
        const d = derivedRef.current;
        const p = plantRef.current;
        notificationsApi.pushTelemetry({
          values: {
            level: round(p.level, 0),
            suction: p.suction,
            discharge: p.discharge,
            flow: p.flow,
            temperature: p.temperature,
            air: p.air
          },
          derived: d,
          scenario: scenarioRef.current,
          origin: 'SIMULADO'
        }).catch(() => {});
      }
    }, 110);
    return () => clearInterval(interval);
  }, []);

  /* ------------------------------------------------------------ finalização */

  const handleFinished = (kind) => {
    if (kind === 'solution') {
      const fresh = derivePlant(plantRef.current, inputsRef.current);
      setSolutionApplied(true);
      setComparison((current) => current ? {
        ...current,
        after: { ...fresh, values: { ...plantRef.current } }
      } : null);
      setHistory((items) => [{ id: `EVT-${Date.now()}`, title: 'Solução aplicada: condição recuperada', time: new Date().toLocaleTimeString('pt-BR'), tone: 'good' }, ...items].slice(0, 8));
      setToast('Solução aplicada. NPSH e vazão recuperados no modelo virtual.');
      emitAlert({
        key: 'recovery',
        severity: 'INFO',
        title: 'Condição operacional recuperada',
        message: 'Após a correção virtual, a margem de NPSH voltou a ser positiva e a vazão retornou à faixa de referência.',
        suggestedAction: 'Registrar a intervenção e manter o monitoramento contínuo.'
      });
    } else {
      setHistory((items) => [{ id: `EVT-${Date.now()}`, title: `Experimento concluído: ${SCENARIO_PROFILES[scenarioRef.current]?.label || 'cenário'}`, time: new Date().toLocaleTimeString('pt-BR'), tone: risk >= 65 ? 'critical' : 'warning' }, ...items].slice(0, 8));
      setToast('Simulação concluída. Analise o diagnóstico e as recomendações.');
    }
  };
  finishRef.current = handleFinished;

  /* --------------------------------------------------------- alertas automáticos */

  const evaluateAlerts = () => {
    const d = derivedRef.current;
    if (!d) return;
    const currentInputs = inputsRef.current;
    const now = Date.now();
    const candidates = [];
    const metrics = {
      level: round(plantRef.current.level, 0),
      suction: round(plantRef.current.suction, 2),
      flow: round(plantRef.current.flow, 1),
      npshMargin: round(d.npshMargin, 1),
      risk: d.risk
    };

    if (currentInputs.sensorOnline === false) {
      candidates.push({
        key: 'sensor-offline', severity: 'CRITICO',
        title: 'Sensor de pressão sem comunicação',
        message: 'A leitura de sucção está indisponível. O sistema não deve assumir o último valor como medição atual.',
        suggestedAction: 'Verificar alimentação, cabeamento, conector e calibração do instrumento.'
      });
    } else if (d.npshMargin < 0) {
      candidates.push({
        key: 'npsh-negative', severity: 'CRITICO',
        title: 'Cavitação provável: margem de NPSH negativa',
        message: `NPSHa ${fmt(d.npshAvailable)} m abaixo do NPSHr ${fmt(d.npshRequired)} m (margem ${fmt(d.npshMargin)} m).`,
        suggestedAction: 'Reduzir a restrição na sucção, elevar o nível e confirmar a temperatura do fluido.'
      });
    } else if (d.npshMargin < 1.2) {
      candidates.push({
        key: 'npsh-low', severity: 'ATENCAO',
        title: 'Margem de NPSH reduzida',
        message: `Margem de apenas ${fmt(d.npshMargin)} m. Pequenas variações podem levar à cavitação.`,
        suggestedAction: 'Inspecionar filtro e linha de sucção antes de aumentar a vazão.'
      });
    }
    if (d.air > 35) {
      candidates.push({
        key: 'air-high', severity: 'ATENCAO',
        title: 'Entrada de ar na linha hidráulica',
        message: `${fmt(d.air, 0)}% de ar estimado, com perda de eficiência e vibração em ${fmt(d.vibration)} mm/s.`,
        suggestedAction: 'Purgar a linha e revisar vedações, juntas e submergência da sucção.'
      });
    }
    if (d.vibration > 4.5) {
      candidates.push({
        key: 'vibration', severity: 'ATENCAO',
        title: 'Vibração acima do limite de referência',
        message: `Vibração em ${fmt(d.vibration)} mm/s. Verificar alinhamento, acoplamento e balanceamento.`,
        suggestedAction: 'Inspecionar alinhamento motor-bomba e condição do acoplamento.'
      });
    }
    if (plantRef.current.level < 22) {
      candidates.push({
        key: 'level-low', severity: 'ATENCAO',
        title: 'Nível do tanque abaixo do mínimo operacional',
        message: `Nível em ${fmt(plantRef.current.level, 0)}%, com risco de vórtice e arraste de ar.`,
        suggestedAction: 'Restabelecer a reposição e validar a medição do radar de nível.'
      });
    }

    for (const candidate of candidates) {
      const last = alertCooldown.current[candidate.key] || 0;
      if (now - last > 90000) {
        alertCooldown.current[candidate.key] = now;
        emitAlert({ ...candidate, metrics });
        break;
      }
    }
  };
  alertsRef.current = evaluateAlerts;

  /* ------------------------------------------------------------- histórico */

  useEffect(() => {
    const id = setInterval(() => {
      const d = derivedRef.current;
      const p = plantRef.current;
      if (!d) return;
      setTrend((current) => [...current.slice(-39), {
        time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        pressure: Number(p.suction.toFixed(2)),
        flow: Number(p.flow.toFixed(1)),
        level: Number(p.level.toFixed(0)),
        npsha: Number(d.npshAvailable.toFixed(1)),
        npshr: Number(d.npshRequired.toFixed(1)),
        margin: Number(d.npshMargin.toFixed(1)),
        efficiency: Number((d.efficiency * 100).toFixed(0)),
        power: Number(d.powerKw.toFixed(1)),
        vibration: Number(p.vibration.toFixed(1))
      }]);
    }, 1500);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('hydrovision-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(''), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (risk < 30) setBannerDismissed(false);
  }, [risk]);

  /* ---------------------------------------------------------- controles run */

  const baseInputsForFault = () => ({
    ...inputsRef.current,
    running: true,
    suctionValve: 1,
    dischargeValve: 1,
    sensorOnline: true,
    radarOnline: inputsRef.current.radarOnline,
    restriction: 0,
    airInjection: 0,
    levelTarget: Math.round(clamp(plantRef.current.level, 8, 100))
  });

  const startFault = (scenarioId, options = {}) => {
    const profile = SCENARIO_PROFILES[scenarioId];
    if (!profile?.fault) return;
    const base = baseInputsForFault();
    const duration = (options.duration || profile.duration) * 1000;
    inputsRef.current = base;
    setInputs(base);
    setScenario(scenarioId);
    scenarioRef.current = scenarioId;
    setSolutionApplied(false);
    setComparison(null);
    setSection('experiments');
    setDeckTab('experiments');
    setDeckOpen(true);
    setSelected(null);
    runRef.current = { kind: 'fault', startedAt: performance.now(), rampStart: 0, totalDuration: duration / 1000, baseInputs: base };
    setSimulation({ status: 'running', kind: 'fault', progress: 0, ramp: 0 });
    setToast(`Simulação iniciada: ${profile.label}. Acompanhe NPSH, vazão e notificações.`);
    setHistory((items) => [{ id: `EVT-${Date.now()}`, title: `Experimento iniciado: ${profile.label}`, time: new Date().toLocaleTimeString('pt-BR'), tone: 'warning' }, ...items].slice(0, 8));
  };

  const activateScenario = (id) => {
    const base = baseInputsForFault();
    inputsRef.current = base;
    setInputs(base);
    setScenario(id);
    scenarioRef.current = id;
    setSimulation({ status: 'ready', kind: 'fault', progress: 0, ramp: 0 });
    runRef.current = null;
    setComparison(null);
    setSolutionApplied(false);
    setDeckTab('experiments');
    setDeckOpen(true);
    setSection('experiments');
    setSelected(null);
    setToast(`Cenário ${scenarios.find((item) => item.id === id)?.name} preparado. Execute para observar a falha.`);
  };

  const startSimulation = () => {
    if (scenario === 'normal') {
      setToast('Selecione um experimento antes de executar.');
      setDeckTab('experiments');
      setDeckOpen(true);
      return;
    }
    startFault(scenario);
  };

  const pauseSimulation = () => {
    const run = runRef.current;
    const sim = simRef.current;
    if (!run || (sim.status !== 'running' && sim.status !== 'applying')) return;
    const ramp = clamp(run.rampStart + (performance.now() - run.startedAt) / 1000 / run.totalDuration, 0, 1);
    runRef.current = { ...run, rampStart: ramp };
    setSimulation((current) => ({ ...current, status: 'paused', ramp, progress: Math.round(ramp * 100) }));
    setToast('Simulação pausada. Você pode continuar de onde parou.');
  };

  const resumeSimulation = () => {
    const run = runRef.current;
    const sim = simRef.current;
    if (!run) return;
    const remaining = Math.max(0.6, (1 - sim.ramp) * run.totalDuration);
    runRef.current = { ...run, startedAt: performance.now(), rampStart: sim.ramp, totalDuration: remaining };
    setSimulation((current) => ({ ...current, status: run.kind === 'solution' ? 'applying' : 'running' }));
  };

  const applySolution = () => {
    if (scenario === 'normal' && risk < 30) {
      setToast('Selecione um experimento antes de aplicar uma solução.');
      return;
    }
    const before = { ...derivedRef.current, values: { ...plantRef.current } };
    const corrective = {
      ...inputsRef.current,
      running: true,
      suctionValve: 1,
      dischargeValve: 1,
      sensorOnline: true,
      radarOnline: true,
      restriction: 0,
      airInjection: 0,
      levelTarget: Math.max(78, Math.round(plantRef.current.level))
    };
    const base = { ...inputsRef.current };
    runRef.current = { kind: 'solution', startedAt: performance.now(), rampStart: 0, totalDuration: 3.6, baseInputs: base, correctiveInputs: corrective };
    setSimulation({ status: 'applying', kind: 'solution', progress: 0, ramp: 0 });
    setComparison({ before, after: null });
    setToast('Aplicando correções: limpeza de sucção, purga e radar de nível.');
    setHistory((items) => [{ id: `EVT-${Date.now()}`, title: 'Aplicação de solução virtual iniciada', time: new Date().toLocaleTimeString('pt-BR'), tone: 'good' }, ...items].slice(0, 8));
    fetch(`${API_BASE}/api/simulations/record`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario, values: { before: canonicalBefore(before), after: corrective } })
    }).catch(() => {});
  };

  const restore = () => {
    runRef.current = null;
    setSimulation({ status: 'idle', kind: 'fault', progress: 0, ramp: 0 });
    setScenario('normal');
    scenarioRef.current = 'normal';
    setInputs({ ...initialInputs });
    inputsRef.current = { ...initialInputs };
    const fresh = createPlant();
    plantRef.current = fresh;
    setPlant(fresh);
    setSolutionApplied(false);
    setComparison(null);
    setSelected(null);
    setViewResetKey((value) => value + 1);
    setHistory((items) => [{ id: `EVT-${Date.now()}`, title: 'Condições de referência restauradas', time: new Date().toLocaleTimeString('pt-BR'), tone: 'good' }, ...items].slice(0, 8));
    setToast('Cenário restaurado para condição de referência.');
  };

  const patchInputs = (patch) => {
    const next = { ...inputsRef.current, ...patch };
    inputsRef.current = next;
    setInputs(next);
    if (simRef.current.status === 'idle' || simRef.current.status === 'ready' || simRef.current.status === 'completed' || simRef.current.status === 'recovered') {
      setSimulation((current) => ({ ...current, status: 'manual' }));
    }
  };

  const toggleComponent = (id) => {
    if (id === 'suction-valve') {
      patchInputs({ suctionValve: inputs.suctionValve > 0.5 ? 0 : 1 });
      setToast(`Válvula de sucção ${inputs.suctionValve > 0.5 ? 'fechada' : 'aberta'} no modelo virtual.`);
    } else if (id === 'discharge-valve') {
      patchInputs({ dischargeValve: inputs.dischargeValve > 0.5 ? 0 : 1 });
      setToast(`Válvula de descarga ${inputs.dischargeValve > 0.5 ? 'fechada' : 'aberta'} no modelo virtual.`);
    } else if (id === 'pump') {
      patchInputs({ running: !inputs.running });
      setToast(inputs.running ? 'Bomba virtual desligada; vazão em desaceleração.' : 'Bomba virtual ligada.');
    } else if (id === 'sensor-pressure') {
      patchInputs({ sensorOnline: inputs.sensorOnline === false });
      setToast(inputs.sensorOnline === false ? 'Comunicação do sensor restaurada.' : 'Sensor de pressão desconectado.');
    }
  };

  /* ------------------------------------------------------------- apresentação */

  const applyPresentationStep = (index) => {
    const bounded = clamp(index, 0, presentationStages.length - 1);
    const stage = presentationStages[bounded];
    setPresentationStep(bounded);
    setViewPreset(stage.view);
    setSelected(stage.component);
    setComparison(null);
    if (stage.mode === 'fault') {
      startFault('cavitation', { duration: 8 });
    } else if (stage.mode === 'recovery') {
      setSimulation({ status: 'applying', kind: 'solution', progress: 0, ramp: 0 });
      const corrective = {
        ...inputsRef.current, running: true, suctionValve: 1, dischargeValve: 1,
        sensorOnline: true, radarOnline: true, restriction: 0, airInjection: 0,
        levelTarget: Math.max(78, Math.round(plantRef.current.level))
      };
      runRef.current = { kind: 'solution', startedAt: performance.now(), rampStart: 0, totalDuration: 3.2, baseInputs: { ...inputsRef.current }, correctiveInputs: corrective };
      setSolutionApplied(true);
    } else {
      runRef.current = null;
      setSimulation({ status: 'idle', kind: 'fault', progress: 0, ramp: 0 });
      setScenario('normal');
      scenarioRef.current = 'normal';
      setInputs({ ...initialInputs });
      inputsRef.current = { ...initialInputs };
      const fresh = createPlant();
      plantRef.current = fresh;
      setPlant(fresh);
      setSolutionApplied(false);
    }
  };

  useEffect(() => {
    if (!presentMode) return undefined;
    const handleKeys = (event) => {
      if (event.key === 'ArrowRight') { event.preventDefault(); applyPresentationStep(presentationStep + 1); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); applyPresentationStep(presentationStep - 1); }
    };
    window.addEventListener('keydown', handleKeys);
    return () => window.removeEventListener('keydown', handleKeys);
  }, [presentMode, presentationStep]);

  const enterPresentation = () => {
    setPresentMode(true);
    applyPresentationStep(0);
    if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  };

  const exitPresentation = () => {
    setPresentMode(false);
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
  };

  useEffect(() => {
    const onFullscreenChange = () => { if (!document.fullscreenElement) setPresentMode(false); };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const cycleRenderQuality = () => {
    const options = ['auto', 'high', 'balanced', 'economy'];
    setRenderQuality((current) => options[(options.indexOf(current) + 1) % options.length]);
  };
  const renderQualityLabel = ({ auto: 'AUTO', high: 'ALTA', balanced: 'EQUILIBRADA', economy: 'ECONÔMICA' })[renderQuality];

  /* ------------------------------------------------------------------ IA */

  const localFallback = (message) => {
    const lower = message.toLowerCase();
    const npshLine = `NPSHa ${fmt(derived.npshAvailable)} m · NPSHr ${fmt(derived.npshRequired)} m · margem ${fmt(derived.npshMargin)} m.`;
    if (lower.includes('cavita') || lower.includes('npsh')) return `**Cavitação — análise técnica**\n\nA cavitação ocorre quando a pressão local cai abaixo da pressão de vapor e as bolhas colapsam no rotor.\n\n${npshLine}\n\n**Verificações:** nível e submergência, restrição na sucção, temperatura, pressão absoluta e NPSHr de fábrica. Um radar de nível com leitura confiável ajuda a evitar operação com nível baixo.\n\nOs valores pertencem ao laboratório virtual.`;
    if (lower.includes('whatsapp') || lower.includes('notifica')) return `**Notificações**\n\nA central entrega alertas no aplicativo em tempo real e no WhatsApp (Cloud API, Twilio, Evolution ou webhook). Alertas críticos e de atenção seguem o nível mínimo configurado.\n\nNo WhatsApp é possível responder **STATUS**, **SILENCIAR** e **ATIVAR**.`;
    if (lower.includes('sensor') || lower.includes('instrument')) return `**Instrumentação — análise**\n\nManômetro: ${inputs.sensorOnline ? 'online' : 'sem comunicação'} · radar de nível: ${inputs.radarOnline ? 'online' : 'offline'}.\n\nSem sinal, a leitura deve ser marcada como indisponível. Verifique alimentação, cabeamento, calibração e diagnóstico do instrumento.`;
    if (lower.includes('nível') || lower.includes('tanque')) return `**Nível do tanque — análise**\n\nNível em ${fmt(plant.level, 0)}%, margem de NPSH ${fmt(derived.npshMargin)} m. Níveis baixos favorecem vórtice e arraste de ar.\n\nValide o radar, restabeleça a reposição e configure limites operacionais aprovados.`;
    return `**HYDRO AI — contexto da instalação**\n\nCenário: ${currentScenario?.name || 'referência'} · risco ${risk}/100.\nNível ${fmt(plant.level, 0)}% · sucção ${fmt(plant.suction, 2)} bar abs · vazão ${fmt(plant.flow, 1)} m³/h · ar ${fmt(plant.air, 0)}%.\n${npshLine}\n\nPosso explicar cavitação, entrada de ar, nível baixo, instrumentação e as notificações. Dados simulados.`;
  };

  const sendMessage = async (preset) => {
    const message = (preset ?? input).trim();
    if (!message || aiLoading) return;
    const nextMessages = [...messages, { role: 'user', content: message }];
    setMessages(nextMessages);
    setInput('');
    setAiLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          context: messages.slice(-8),
          simulation: {
            scenario, ...operatingValues, risk,
            npshAvailable: derived.npshAvailable,
            npshRequired: derived.npshRequired,
            npshMargin: derived.npshMargin,
            efficiency: derived.efficiency,
            origin: 'SIMULADO',
            simulationStatus: simulation.status
          }
        })
      });
      if (!response.ok) throw new Error('API indisponível');
      const data = await response.json();
      setAiMode(data.mode || 'local');
      setMessages((items) => [...items, { role: 'assistant', content: data.answer }]);
    } catch {
      setApiOnline(false);
      setMessages((items) => [...items, { role: 'assistant', content: localFallback(message) }]);
    } finally {
      setAiLoading(false);
    }
  };

  /* ------------------------------------------------------------ navegação */

  const changeSection = (id) => {
    setSection(id);
    if (id === 'experiments') { setDeckTab('experiments'); setDeckOpen(true); }
    if (id === 'history') { setDeckTab('alerts'); setDeckOpen(true); }
    if (id === 'diagnostics') { setDeckTab('diagnostics'); setDeckOpen(true); }
    if (id === 'digital') { setDeckOpen(false); setSelected(null); }
    if (id === 'overview') { setDeckTab('operation'); setDeckOpen(true); }
  };

  const openNotifications = (tab = 'alerts') => {
    setNotificationTab(tab);
    setNotificationOpen(true);
    refreshChannels();
  };

  const handleRead = async (id) => {
    setNotifications((current) => current.map((item) => item.id === id ? { ...item, read: true } : item));
    notificationsApi.read(id).catch(() => {});
  };

  const handleReadAll = async () => {
    setNotifications((current) => current.map((item) => ({ ...item, read: true })));
    notificationsApi.readAll().catch(() => {});
  };

  const handleClear = async () => {
    setNotifications([]);
    notificationsApi.clear().catch(() => {});
  };

  const handleSaveSettings = async (patch) => {
    setNotifSettings((current) => ({ ...current, ...patch }));
    try {
      const result = await notificationsApi.saveSettings(patch);
      setChannels(result.channels || null);
      setNotifSettings(result.settings || patch);
    } catch {
      setToast('Não foi possível salvar as preferências (API offline).');
    }
  };

  const handleTest = async (recipient) => {
    const result = await notificationsApi.test(recipient);
    notificationsApi.outbox().then((data) => setOutbox(data.items || [])).catch(() => {});
    setToast(result?.ok ? 'Teste enviado ao WhatsApp.' : 'Teste registrado na outbox (modo demonstração).');
    return result;
  };

  /* -------------------------------------------------------------- métricas */

  const spark = (key) => trend.slice(-14).map((item) => item[key]);
  const metrics = [
    { key: 'level', label: 'Nível do tanque', value: fmt(derived.measured?.level ?? plant.level, 0), unit: '%', icon: Droplets, sub: inputs.radarOnline ? 'Radar · TNQ-001' : 'Radar offline', tone: plant.level < 25 ? 'warning' : 'normal' },
    { key: 'pressure', label: 'Pressão de sucção', value: inputs.sensorOnline ? fmt(plant.suction, 2) : '—', unit: inputs.sensorOnline ? 'bar abs' : '', icon: Gauge, sub: inputs.sensorOnline ? 'SEN-PRS-01' : 'Sem sinal', tone: !inputs.sensorOnline || plant.suction < 0.85 ? 'warning' : 'normal' },
    { key: 'flow', label: 'Vazão', value: fmt(plant.flow, 1), unit: 'm³/h', icon: Waves, sub: `Nominal ${fmt(PHYS.nominalFlow, 1)} m³/h`, tone: derived.flowRatio < 0.75 ? 'warning' : 'normal' },
    { key: 'margin', label: 'Margem de NPSH', value: fmt(derived.npshMargin, 1), unit: 'm', icon: Activity, sub: `NPSHa ${fmt(derived.npshAvailable, 1)} · NPSHr ${fmt(derived.npshRequired, 1)}`, tone: derived.npshMargin < 0 ? 'critical' : derived.npshMargin < 1.5 ? 'warning' : 'good' }
  ];

  const chartTooltip = {
    contentStyle: { background: 'var(--surface-elevated)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 11 }
  };

  const beforeValues = comparison?.before?.values;
  const afterValues = comparison?.after?.values;

  return (
    <div className={`app-shell ${presentMode ? 'presentation-mode' : ''}`}>
      <header className="topbar">
        <button className="brand" onClick={() => changeSection('overview')} aria-label="Ir para visão geral">
          <span className="brand-symbol"><Waves size={20}/></span>
          <span className="brand-copy"><strong>HYDROVISION<span>.</span></strong><small>INDUSTRIAL INTELLIGENCE</small></span>
        </button>
        <div className="installation-tag"><span className="tiny-dot"/> ESTAÇÃO 01 <ChevronDown size={13}/></div>
        <nav className="main-nav" aria-label="Navegação principal">
          {navItems.map((item) => {
            const Icon = item.icon;
            return <button key={item.id} className={`nav-link ${section === item.id ? 'selected' : ''}`} onClick={() => changeSection(item.id)}><Icon size={15}/>{item.label}</button>;
          })}
          <button className={`nav-link ai-nav ${section === 'ai' ? 'selected' : ''}`} onClick={() => { setSection('ai'); setDeckOpen(false); }}><BrainCircuit size={15}/>HYDRO AI</button>
        </nav>
        <div className="top-actions">
          <div className="live-status"><span className="pulse-dot"/> {apiOnline ? (streamState === 'connected' ? 'API + NOTIFICAÇÕES' : 'API CONECTADA') : 'MODO DEMONSTRAÇÃO'}</div>
          <button className="icon-button wa-button" title="Configurar notificações no WhatsApp" onClick={() => openNotifications('whatsapp')}><MessageCircle size={17}/></button>
          <button className="icon-button bell-button" title="Notificações e eventos" onClick={() => openNotifications('alerts')}>
            {unread > 0 ? <BellRing size={17}/> : <Bell size={17}/>}
            {unread > 0 && <b className="bell-count">{unread > 9 ? '9+' : unread}</b>}
            {risk >= 30 && <i/>}
          </button>
          <button className="icon-button theme-toggle" title={theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={17}/> : <Moon size={17}/>}</button>
          <button className="avatar" title="Operador demonstrativo">OP</button>
        </div>
      </header>

      {!presentMode && <section className="metrics-strip v3" aria-label="Indicadores operacionais">
        <div className="metrics-intro"><span>LIVE PARAMETERS</span><strong>Parâmetros operacionais</strong><small>Telemetria demonstrativa</small></div>
        {metrics.map((metric) => <Metric key={metric.label} {...metric} spark={spark(metric.key)}/>)}
        <div className="health-card">
          <HealthRing risk={risk} tone={tone}/>
          <div className="health-copy">
            <small>CONDIÇÃO GERAL</small>
            <strong>{state.label}</strong>
            <span>{recommendation.title}</span>
          </div>
        </div>
        <div className={`channel-card ${channels?.whatsapp?.mode === 'live' ? 'live' : 'demo'}`}>
          <div className="channel-card-top"><MessageCircle size={13}/><span>WHATSAPP</span><i className={`dot ${channels?.whatsapp?.mode === 'live' ? 'on' : 'idle'}`}/></div>
          <strong>{channels?.whatsapp?.mode === 'live' ? 'Canal ativo' : 'Modo demonstração'}</strong>
          <small>{unread > 0 ? `${unread} alerta${unread === 1 ? '' : 's'} não lido${unread === 1 ? '' : 's'}` : 'Nenhum alerta pendente'}</small>
          <button onClick={() => openNotifications('whatsapp')}>Configurar <ChevronRight size={12}/></button>
        </div>
      </section>}

      {!presentMode && risk >= 30 && !bannerDismissed && (
        <div className={`alert-banner ${tone}`}>
          <span className="alert-banner-icon">{risk >= 65 ? <AlertTriangle size={16}/> : <Activity size={16}/>}</span>
          <div>
            <strong>{recommendation.title}</strong>
            <span>{recommendation.detail}</span>
          </div>
          <div className="alert-banner-actions">
            <button onClick={() => changeSection('diagnostics')}>Diagnóstico</button>
            <button onClick={() => openNotifications('whatsapp')}>Notificar WhatsApp</button>
            <button className="solid" onClick={applySolution}>Aplicar solução</button>
            <button className="close" onClick={() => setBannerDismissed(true)} aria-label="Dispensar"><X size={14}/></button>
          </div>
        </div>
      )}

      <div className={`workspace-grid ${presentMode ? 'workspace-present' : ''}`}>
        <main className="main-workspace">
          <div className="scene-heading">
            <div>
              <span className="eyebrow">DIGITAL TWIN / ESTAÇÃO DE BOMBEAMENTO 01</span>
              <h1>{section === 'experiments' ? 'Laboratório de simulação' : section === 'history' ? 'Histórico operacional' : section === 'ai' ? 'Central de inteligência' : section === 'diagnostics' ? 'Diagnóstico técnico' : 'Instalação hidráulica'}</h1>
            </div>
            <div className="scene-heading-actions">
              <span className="demo-tag"><span/> AMBIENTE VIRTUAL · DADOS SIMULADOS</span>
              <button className="small-icon-button" title={presentMode ? 'Sair do modo apresentação' : 'Iniciar modo apresentação'} onClick={() => presentMode ? exitPresentation() : enterPresentation()}>{presentMode ? <Minimize2 size={15}/> : <Expand size={15}/>}</button>
            </div>
          </div>

          <section className="scene-frame">
            <HydraulicScene
              values={operatingValues}
              scenario={scenario}
              risk={risk}
              selected={selected}
              setSelected={setSelected}
              theme={theme}
              resetKey={viewResetKey}
              viewPreset={viewPreset}
              quality={renderQuality}
            />
            <div className="scene-top-overlay">
              <div className="scene-caption"><span className="caption-square"/> ESTAÇÃO DE BOMBEAMENTO · MODELO 3D</div>
              <div className={`pump-state ${inputs.running ? 'running' : 'paused'}`}><span/>{inputs.running ? 'CONJUNTO EM OPERAÇÃO' : 'CONJUNTO PAUSADO'}</div>
            </div>
            {presentMode && (
              <motion.div key={presentationStep} className="presentation-stage-card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <span>ETAPA {String(presentationStep + 1).padStart(2, '0')} / {String(presentationStages.length).padStart(2, '0')}</span>
                <strong>{presentationStages[presentationStep].title}</strong>
                <p>{presentationStages[presentationStep].description}</p>
              </motion.div>
            )}
            <div className="scene-left-legend">
              <div><i className="legend-water"/> FLUXO DO FLUIDO</div>
              <div><i className="legend-sensor"/> INSTRUMENTAÇÃO</div>
              <div className={`legend-npsh ${derived.npshMargin < 0 ? 'bad' : derived.npshMargin < 1.5 ? 'warn' : ''}`}><i/> NPSH {fmt(derived.npshMargin, 1)} m</div>
              {risk >= 30 && <div className="legend-alert"><i/> ANORMALIDADE SIMULADA</div>}
            </div>
            {selectedInfo && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="component-inspector">
                <button className="inspector-close" onClick={() => setSelected(null)}><X size={14}/></button>
                <span className="eyebrow">COMPONENTE SELECIONADO · {selectedInfo.code}</span>
                <strong>{selectedInfo.title}</strong><p>{selectedInfo.detail}</p>
                <div className="inspector-bottom"><b>{selectedInfo.value}</b><span>{selectedInfo.status}</span></div>
                {['suction-valve', 'discharge-valve', 'pump', 'sensor-pressure'].includes(selected) && (
                  <button className="inspector-action" onClick={() => toggleComponent(selected)}>
                    {selected === 'suction-valve' ? (inputs.suctionValve > 0.5 ? 'Fechar válvula' : 'Abrir válvula')
                      : selected === 'discharge-valve' ? (inputs.dischargeValve > 0.5 ? 'Fechar válvula' : 'Abrir válvula')
                        : selected === 'pump' ? (inputs.running ? 'Desligar bomba virtual' : 'Ligar bomba virtual')
                          : (inputs.sensorOnline ? 'Desconectar sensor' : 'Restaurar comunicação')}
                  </button>
                )}
              </motion.div>
            )}
            <div className="scene-controls">
              <span><SlidersHorizontal size={13}/> {typeof window !== 'undefined' && window.innerWidth <= 680 ? 'TOQUE PARA GIRAR · PINÇA PARA ZOOM' : 'ARRASTE PARA GIRAR · SCROLL PARA ZOOM'}</span>
              <div className="scene-control-actions">
                <button className="quality-toggle" onClick={cycleRenderQuality} title="Alternar perfil gráfico"><Gauge size={12}/> {renderQualityLabel}</button>
                <button onClick={() => { setSelected(null); setViewPreset('overview'); setViewResetKey((value) => value + 1); }}>REPOSICIONAR CÂMERA</button>
              </div>
            </div>
          </section>

          <div className="scene-footer">
            <div className="component-shortcuts">
              <button onClick={() => { setSelected(null); setViewPreset('overview'); }} className={!selected && viewPreset === 'overview' ? 'active' : ''}><Camera size={14}/> Geral</button>
              <button onClick={() => { setSelected(null); setViewPreset('front'); }} className={viewPreset === 'front' ? 'active' : ''}><Layers3 size={14}/> Frontal</button>
              <button onClick={() => { setSelected(null); setViewPreset('side'); }} className={viewPreset === 'side' ? 'active' : ''}><Layers3 size={14}/> Lateral</button>
              <button onClick={() => { setSelected(null); setViewPreset('top'); }} className={viewPreset === 'top' ? 'active' : ''}><Layers3 size={14}/> Superior</button>
              <button onClick={() => { setViewPreset('tank'); setSelected('tank'); }} className={selected === 'tank' ? 'active' : ''}><Droplets size={14}/> Tanque</button>
              <button onClick={() => { setViewPreset('pump'); setSelected('pump'); }} className={selected === 'pump' ? 'active' : ''}><Gauge size={14}/> Bomba</button>
              <button onClick={() => { setViewPreset('motor'); setSelected('motor'); }} className={selected === 'motor' ? 'active' : ''}><Cpu size={14}/> Motor</button>
              <button onClick={() => { setViewPreset('sensor-pressure'); setSelected('sensor-pressure'); }} className={selected === 'sensor-pressure' ? 'active' : ''}><Signal size={14}/> Instrumentação</button>
            </div>
            <span className="scene-scale">MODELO 3D INTERATIVO <span>·</span> WEBGL <span>·</span> PBR</span>
          </div>
        </main>

        {!presentMode && (
          <aside className={`ai-side-panel ${section === 'ai' ? 'ai-side-focused' : ''}`}>
            <div className="ai-side-header">
              <div className="ai-avatar"><BrainCircuit size={20}/></div>
              <div><strong>HYDRO AI</strong><small>Copiloto de engenharia · {aiMode === 'openai' ? 'Modelo conectado' : 'Análise técnica local'}</small></div>
              <span className="ai-status-pill"><i/> ATIVO</span>
            </div>
            <div className={`ai-side-summary ${tone}`}>
              <div className="ai-summary-mark">{risk >= 65 ? <AlertTriangle size={17}/> : risk >= 30 ? <Activity size={17}/> : <CheckCircle2 size={17}/>}</div>
              <div>
                <strong>{recommendation.title}</strong>
                <p>{recommendation.detail}</p>
              </div>
            </div>
            <div className="ai-side-insights">
              <div className="ai-side-section-title"><span>LEITURA DO CENÁRIO</span><b>{risk}/100</b></div>
              <div><span>Margem de NPSH</span><strong className={derived.npshMargin < 0 ? 'bad' : derived.npshMargin < 1.5 ? 'warn' : ''}>{fmt(derived.npshMargin, 1)} m</strong></div>
              <div><span>Sucção (abs.)</span><strong>{inputs.sensorOnline ? `${fmt(plant.suction, 2)} bar` : 'Sem sinal'}</strong></div>
              <div><span>Vazão</span><strong>{fmt(plant.flow, 1)} m³/h</strong></div>
              <div><span>Eficiência</span><strong>{fmt(derived.efficiency * 100, 0)}%</strong></div>
              <div><span>Entrada de ar</span><strong>{fmt(plant.air, 0)}%</strong></div>
            </div>
            <div className="ai-side-chat-label"><span>CONVERSA COM A HYDRO AI</span><small>{streamState === 'connected' ? 'alertas em tempo real' : 'modo local'}</small></div>
            <div className="chat-messages side-chat-messages" aria-live="polite">
              {messages.slice(-5).map((message, index) => (
                <div className={`chat-message ${message.role}`} key={`${message.role}-${index}`}>
                  <span className="chat-avatar">{message.role === 'assistant' ? <Sparkles size={13}/> : 'OP'}</span>
                  <div className="chat-bubble"><MarkdownLite text={message.content}/></div>
                </div>
              ))}
              {aiLoading && <div className="chat-message assistant"><span className="chat-avatar"><Sparkles size={13}/></span><div className="chat-bubble typing"><i/><i/><i/> Analisando...</div></div>}
            </div>
            <div className="ai-side-quick">
              <button onClick={() => sendMessage('Analise o cenário atual e explique os riscos.')}>Analisar cenário</button>
              <button onClick={() => sendMessage('Explique a margem de NPSH atual.')}>NPSH</button>
              <button onClick={() => sendMessage('Como funcionam as notificações no WhatsApp?')}>Notificações</button>
            </div>
            <form className="ai-input-row ai-side-input" onSubmit={(event) => { event.preventDefault(); sendMessage(); }}>
              <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Pergunte sobre a instalação..."/>
              <button type="submit" disabled={!input.trim() || aiLoading}><Send size={16}/></button>
            </form>
            <div className="ai-disclaimer">A IA apoia a interpretação. Não aciona equipamentos físicos nem substitui validação técnica.</div>
          </aside>
        )}
      </div>

      {!presentMode && (
        <section className={`control-deck ${deckOpen ? 'expanded' : 'collapsed'}`}>
          <div className="deck-header">
            <div className="deck-tabs">
              <DeckTab active={deckTab === 'operation'} onClick={() => { setDeckTab('operation'); setDeckOpen(true); }} icon={Activity} label="Operação"/>
              <DeckTab active={deckTab === 'experiments'} onClick={() => { setDeckTab('experiments'); setDeckOpen(true); }} icon={FlaskConical} label="Experimentos"/>
              <DeckTab active={deckTab === 'telemetry'} onClick={() => { setDeckTab('telemetry'); setDeckOpen(true); }} icon={Waves} label="Telemetria"/>
              <DeckTab active={deckTab === 'diagnostics'} onClick={() => { setDeckTab('diagnostics'); setDeckOpen(true); }} icon={Stethoscope} label="Diagnóstico"/>
              <DeckTab active={deckTab === 'alerts'} onClick={() => { setDeckTab('alerts'); setDeckOpen(true); }} icon={AlertTriangle} label="Eventos" count={unread || (risk >= 30 ? 1 : 0)}/>
            </div>
            <div className="deck-tools">
              <span className="deck-live"><i/> CONTROL DECK</span>
              <button className="deck-collapse" onClick={() => setDeckOpen(!deckOpen)}>{deckOpen ? <PanelBottomClose size={16}/> : <PanelBottomOpen size={16}/>}<span>{deckOpen ? 'Recolher' : 'Expandir'}</span></button>
            </div>
          </div>
          <AnimatePresence initial={false}>
            {deckOpen && (
              <motion.div className="deck-content" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }}>
                {deckTab === 'experiments' && (
                  <div className="experiments-panel">
                    <div className="experiment-list">
                      <div className="panel-intro"><span className="eyebrow">LABORATÓRIO VIRTUAL</span><strong>Escolha uma condição para reproduzir</strong><small>Os cenários agora evoluem com física contínua: NPSH, curva da bomba, ar e inércia.</small></div>
                      <div className="scenario-grid">
                        {scenarios.map((item) => {
                          const Icon = item.icon;
                          return (
                            <button key={item.id} className={`scenario-card ${scenario === item.id ? 'active' : ''}`} onClick={() => activateScenario(item.id)}>
                              <span className={`scenario-icon ${item.color}`}><Icon size={17}/></span>
                              <span className="scenario-number">EXP. {item.number}</span>
                              <strong>{item.name}</strong>
                              <small>{item.description}</small>
                              {scenario === item.id && <CheckCircle2 className="scenario-check" size={15}/>}
                            </button>
                          );
                        })}
                      </div>
                      <div className="experiment-toggles">
                        <button className={`mini-toggle ${inputs.sensorOnline ? 'on' : ''}`} onClick={() => patchInputs({ sensorOnline: !inputs.sensorOnline })}><Signal size={12}/> Manômetro {inputs.sensorOnline ? 'ONLINE' : 'OFFLINE'}</button>
                        <button className={`mini-toggle ${inputs.radarOnline ? 'on' : ''}`} onClick={() => patchInputs({ radarOnline: !inputs.radarOnline })}><Radar size={12}/> Radar de nível {inputs.radarOnline ? 'ONLINE' : 'OFFLINE'}</button>
                        <button className={`mini-toggle ${inputs.running ? 'on' : ''}`} onClick={() => patchInputs({ running: !inputs.running })}><Zap size={12}/> Bomba {inputs.running ? 'LIGADA' : 'DESLIGADA'}</button>
                      </div>
                    </div>
                    <div className="experiment-controls">
                      <div className="controls-title">
                        <div><span className="eyebrow">PARÂMETROS DE SIMULAÇÃO</span><strong>{currentScenario?.name || 'Condição de referência'}</strong></div>
                        <span className="demo-pill">DEMO</span>
                      </div>
                      <div className="slider-control">
                        <div><label>Nível alvo do tanque</label><b>{Math.round(inputs.levelTarget)}%</b></div>
                        <input type="range" min="5" max="100" value={Math.round(inputs.levelTarget)} onChange={(event) => patchInputs({ levelTarget: Number(event.target.value) })}/>
                      </div>
                      <div className="slider-control">
                        <div><label>Restrição na sucção</label><b>{Math.round(inputs.restriction * 100)}%</b></div>
                        <input type="range" min="0" max="100" value={Math.round(inputs.restriction * 100)} onChange={(event) => patchInputs({ restriction: Number(event.target.value) / 100 })}/>
                      </div>
                      <div className="slider-control">
                        <div><label>Entrada de ar</label><b>{Math.round(inputs.airInjection * 100)}%</b></div>
                        <input type="range" min="0" max="100" value={Math.round(inputs.airInjection * 100)} onChange={(event) => patchInputs({ airInjection: Number(event.target.value) / 100 })}/>
                      </div>
                      <div className="derived-row">
                        <span>NPSHa <b className={derived.npshMargin < 0 ? 'bad' : ''}>{fmt(derived.npshAvailable, 1)} m</b></span>
                        <span>NPSHr <b>{fmt(derived.npshRequired, 1)} m</b></span>
                        <span>Margem <b className={derived.npshMargin < 0 ? 'bad' : derived.npshMargin < 1.5 ? 'warn' : 'ok'}>{fmt(derived.npshMargin, 1)} m</b></span>
                      </div>
                      <div className="simulation-progress-row">
                        <span>ETAPA DA SIMULAÇÃO</span>
                        <strong>
                          {simulation.status === 'running' ? 'EM EXECUÇÃO'
                            : simulation.status === 'paused' ? 'PAUSADA'
                              : simulation.status === 'completed' ? 'FALHA REPRODUZIDA'
                                : simulation.status === 'applying' ? 'APLICANDO SOLUÇÃO'
                                  : simulation.status === 'recovered' ? 'CONDIÇÃO RECUPERADA'
                                    : simulation.status === 'manual' ? 'AJUSTE MANUAL'
                                      : simulation.status === 'ready' ? 'PRONTA PARA EXECUTAR'
                                        : 'AGUARDANDO EXPERIMENTO'}
                        </strong>
                        <div className="simulation-progress-track"><i style={{ width: `${simulation.progress}%` }}/></div>
                      </div>
                      <div className="experiment-actions">
                        {simulation.status === 'running' || simulation.status === 'applying'
                          ? <button className="button-primary" onClick={pauseSimulation}><Pause size={14}/> Pausar simulação</button>
                          : simulation.status === 'paused'
                            ? <button className="button-primary" onClick={resumeSimulation}><Play size={14}/> Continuar simulação</button>
                            : <button className="button-primary" disabled={scenario === 'normal'} onClick={startSimulation}><Play size={14}/>{simulation.status === 'completed' ? 'Executar novamente' : 'Executar cenário'}</button>}
                        <button className="button-secondary" onClick={applySolution} disabled={simulation.status === 'applying' || (scenario === 'normal' && risk < 30)}>Aplicar solução</button>
                        <button className="button-secondary" onClick={() => patchInputs({ running: !inputs.running })}><Zap size={14}/>{inputs.running ? 'Desligar bomba' : 'Ligar bomba'}</button>
                        <button className="button-ghost" onClick={restore} title="Restaurar cenário"><RotateCcw size={14}/></button>
                      </div>
                    </div>
                    {solutionApplied && (
                      <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="solution-result">
                        <CheckCircle2 size={17}/>
                        <div><strong>Solução demonstrativa aplicada</strong><span>Sucção limpa, linha purgada e radar de nível confiável. Compare os valores na telemetria.</span></div>
                        <button onClick={() => setDeckTab('telemetry')}>Ver comparação <ChevronRight size={14}/></button>
                      </motion.div>
                    )}
                  </div>
                )}

                {deckTab === 'operation' && (
                  <div className="operation-panel">
                    <div className="panel-intro"><span className="eyebrow">RESUMO OPERACIONAL</span><strong>Estação principal · BMB-001</strong><small>Estado físico atual do ambiente demonstrativo.</small></div>
                    <div className="operation-stats">
                      <div><small>Pressão de descarga</small><strong>{fmt(plant.discharge, 1)} <i>bar</i></strong><span>DSC-001</span></div>
                      <div><small>Potência estimada</small><strong>{fmt(derived.powerKw, 1)} <i>kW</i></strong><span>{fmt(derived.loadPercent, 0)}% da carga</span></div>
                      <div><small>Eficiência</small><strong>{fmt(derived.efficiency * 100, 0)} <i>%</i></strong><span>Curva da bomba</span></div>
                      <div><small>Vibração</small><strong>{fmt(plant.vibration, 1)} <i>mm/s</i></strong><span>{plant.vibration > 4.5 ? 'Acima do limite' : 'Faixa aceitável'}</span></div>
                    </div>
                    <div className="operation-note"><ShieldCheck size={17}/><span>Ambiente demonstrativo. Nenhum equipamento físico é controlado pela aplicação.</span></div>
                  </div>
                )}

                {deckTab === 'telemetry' && (
                  <div className="telemetry-panel">
                    <div className="chart-heading">
                      <div><span className="eyebrow">TELEMETRIA / ÚLTIMAS AMOSTRAS</span><strong>Comportamento das variáveis</strong></div>
                      <span className="demo-pill">DADOS SIMULADOS</span>
                    </div>
                    <div className="charts-grid">
                      <div className="chart-card">
                        <div><span>Pressão de sucção (abs.)</span><strong>{fmt(plant.suction, 2)} bar</strong></div>
                        <ResponsiveContainer width="100%" height={105}>
                          <AreaChart data={trend}>
                            <defs><linearGradient id="pressureFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#28a9e8" stopOpacity={0.26}/><stop offset="100%" stopColor="#28a9e8" stopOpacity={0}/></linearGradient></defs>
                            <CartesianGrid strokeDasharray="3 4" vertical={false} stroke="var(--chart-grid)"/>
                            <XAxis dataKey="time" hide/><YAxis hide domain={['dataMin - 0.2', 'dataMax + 0.2']}/>
                            <Tooltip {...chartTooltip}/>
                            <Area type="monotone" dataKey="pressure" stroke="#28a9e8" strokeWidth={2} fill="url(#pressureFill)"/>
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="chart-card">
                        <div><span>Vazão</span><strong>{fmt(plant.flow, 1)} m³/h</strong></div>
                        <ResponsiveContainer width="100%" height={105}>
                          <LineChart data={trend}>
                            <CartesianGrid strokeDasharray="3 4" vertical={false} stroke="var(--chart-grid)"/>
                            <XAxis dataKey="time" hide/><YAxis hide domain={['dataMin - 3', 'dataMax + 3']}/>
                            <Tooltip {...chartTooltip}/>
                            <Line type="monotone" dataKey="flow" stroke="#6b9fce" strokeWidth={2.2} dot={false}/>
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="chart-card">
                        <div><span>Nível do tanque</span><strong>{fmt(plant.level, 0)}%</strong></div>
                        <ResponsiveContainer width="100%" height={105}>
                          <AreaChart data={trend}>
                            <CartesianGrid strokeDasharray="3 4" vertical={false} stroke="var(--chart-grid)"/>
                            <XAxis dataKey="time" hide/><YAxis hide domain={[0, 100]}/>
                            <Tooltip {...chartTooltip}/>
                            <Area type="monotone" dataKey="level" stroke="#c59b55" strokeWidth={2} fill="#c59b55" fillOpacity={0.12}/>
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    <div className="charts-grid second">
                      <div className="chart-card npsh-card">
                        <div><span>NPSHa × NPSHr</span><strong className={derived.npshMargin < 0 ? 'bad' : ''}>margem {fmt(derived.npshMargin, 1)} m</strong></div>
                        <ResponsiveContainer width="100%" height={110}>
                          <LineChart data={trend}>
                            <CartesianGrid strokeDasharray="3 4" vertical={false} stroke="var(--chart-grid)"/>
                            <XAxis dataKey="time" hide/><YAxis hide domain={['auto', 'auto']}/>
                            <Tooltip {...chartTooltip}/>
                            <ReferenceLine y={0} stroke="rgba(224,120,120,.5)" strokeDasharray="4 4"/>
                            <Line type="monotone" dataKey="npsha" stroke="#3fd0a4" strokeWidth={2} dot={false}/>
                            <Line type="monotone" dataKey="npshr" stroke="#e0ad60" strokeWidth={2} dot={false} strokeDasharray="5 3"/>
                            <Line type="monotone" dataKey="margin" stroke="#49bdf2" strokeWidth={1.4} dot={false}/>
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="chart-card">
                        <div><span>Temperatura</span><strong>{fmt(plant.temperature, 1)} °C</strong></div>
                        <ResponsiveContainer width="100%" height={110}>
                          <AreaChart data={trend}>
                            <CartesianGrid strokeDasharray="3 4" vertical={false} stroke="var(--chart-grid)"/>
                            <XAxis dataKey="time" hide/><YAxis hide domain={['dataMin - 2', 'dataMax + 2']}/>
                            <Tooltip {...chartTooltip}/>
                            <Area type="monotone" dataKey="temperature" stroke="#e08a78" strokeWidth={2} fill="#e08a78" fillOpacity={0.1}/>
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="chart-card">
                        <div><span>Vibração</span><strong>{fmt(plant.vibration, 1)} mm/s</strong></div>
                        <ResponsiveContainer width="100%" height={110}>
                          <AreaChart data={trend}>
                            <CartesianGrid strokeDasharray="3 4" vertical={false} stroke="var(--chart-grid)"/>
                            <XAxis dataKey="time" hide/><YAxis hide domain={['dataMin - 1', 'dataMax + 1']}/>
                            <Tooltip {...chartTooltip}/>
                            <Area type="monotone" dataKey="vibration" stroke="#b98bd8" strokeWidth={2} fill="#b98bd8" fillOpacity={0.1}/>
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    {comparison && (<div className="comparison-grid">
                      <div className="comparison-heading"><CheckCircle2 size={15}/> ANTES × DEPOIS DA SOLUÇÃO</div>
                      {[
                        ['Pressão de sucção', beforeValues?.suction, afterValues?.suction, 'bar'],
                        ['Vazão', beforeValues?.flow, afterValues?.flow, 'm³/h'],
                        ['Nível do tanque', beforeValues?.level, afterValues?.level, '%'],
                        ['Margem NPSH', comparison.before?.npshMargin, comparison.after?.npshMargin, 'm']
                      ].map(([label, beforeValue, afterValue, unit]) => (
                        <div className="comparison-item" key={label}>
                          <span>{label}</span>
                          <b>{beforeValue !== undefined ? `${fmt(beforeValue, 1)} ${unit}` : '—'}</b>
                          <ChevronRight size={13}/>
                          <strong>{afterValue !== undefined ? `${fmt(afterValue, 1)} ${unit}` : 'medindo...'}</strong>
                        </div>
                      ))}
                    </div>)}
                  </div>
                )}

                {deckTab === 'diagnostics' && (
                  <DiagnosticsPanel
                    derived={derived}
                    inputs={inputs}
                    scenario={scenario}
                    onSimulate={(id) => startFault(id)}
                    onApplySolution={applySolution}
                    onNotify={() => openNotifications('whatsapp')}
                  />
                )}

                {deckTab === 'alerts' && (
                  <div className="alerts-panel">
                    <div className="panel-intro"><span className="eyebrow">CENTRAL DE EVENTOS</span><strong>Ocorrências e notificações</strong><small>Eventos do modelo e canais de entrega.</small></div>
                    <div className="event-list">
                      {risk >= 30 && <div className="event-row critical"><span className="event-icon"><AlertTriangle size={16}/></span><div><strong>{currentScenario?.name || 'Condição anormal'} identificada</strong><small>Condição simulada · {new Date().toLocaleTimeString('pt-BR')}</small></div><span className="event-severity">{risk >= 65 ? 'CRÍTICO' : 'ATENÇÃO'}</span></div>}
                      {!inputs.sensorOnline && <div className="event-row critical"><span className="event-icon"><Signal size={16}/></span><div><strong>Sensor sem comunicação</strong><small>SEN-PRS-01 · telemetria demonstrativa</small></div><span className="event-severity">CRÍTICO</span></div>}
                      {notifications.slice(0, 4).map((item) => (
                        <div className={`event-row ${item.severity === 'CRITICO' ? 'critical' : ''}`} key={item.id}>
                          <span className={`event-icon ${item.severity === 'INFO' ? 'success' : ''}`}>{item.severity === 'CRITICO' ? <AlertTriangle size={16}/> : item.severity === 'ATENCAO' ? <Activity size={16}/> : <CheckCircle2 size={16}/>}</span>
                          <div><strong>{item.title}</strong><small>{item.createdAtLabel || ''} · app {item.channels?.inApp} · WhatsApp {item.channels?.whatsapp}</small></div>
                          <span className={`event-severity ${item.severity === 'INFO' ? 'good' : ''}`}>{item.severity}</span>
                        </div>
                      ))}
                      {history.map((event) => (
                        <div className="event-row" key={event.id}>
                          <span className="event-icon success"><CheckCircle2 size={16}/></span>
                          <div><strong>{event.title}</strong><small>{event.time} · ambiente demonstrativo</small></div>
                          <span className="event-severity good">REGISTRADO</span>
                        </div>
                      ))}
                      {risk < 30 && history.length === 0 && notifications.length === 0 && (
                        <div className="empty-events"><CheckCircle2 size={24}/><strong>Nenhuma ocorrência ativa</strong><span>Execute um experimento para gerar eventos nesta demonstração.</span></div>
                      )}
                    </div>
                    <button className="event-open-center" onClick={() => openNotifications('alerts')}><BellRing size={14}/> Abrir central de notificações</button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      )}

      {presentMode && (
        <div className="presentation-controls">
          <button onClick={() => applyPresentationStep(presentationStep - 1)} disabled={presentationStep === 0}><ChevronLeft size={15}/> Anterior</button>
          <span className="presentation-step-count">{String(presentationStep + 1).padStart(2, '0')} / {String(presentationStages.length).padStart(2, '0')}</span>
          <button onClick={() => applyPresentationStep(presentationStep + 1)} disabled={presentationStep === presentationStages.length - 1}>Próxima etapa <ChevronRight size={15}/></button>
          <button onClick={() => applyPresentationStep(0)}><RotateCcw size={14}/> Reiniciar roteiro</button>
          <button onClick={() => { exitPresentation(); setDeckTab('experiments'); setDeckOpen(true); }}><FlaskConical size={14}/> Experimentos</button>
          <button onClick={exitPresentation}><Minimize2 size={14}/> Sair</button>
        </div>
      )}

      {!presentMode && (
        <footer className="statusbar">
          <span><i/> HYDROVISION CONTROL CENTER</span>
          <span>AMBIENTE DE DEMONSTRAÇÃO · SEM ATUADORES FÍSICOS</span>
          <span>{apiOnline ? 'API CONECTADA' : 'MODO LOCAL'} · {channels?.whatsapp?.mode === 'live' ? 'WHATSAPP ATIVO' : 'WHATSAPP DEMO'} · v2.3</span>
        </footer>
      )}

      <AnimatePresence>
        {notificationOpen && (
          <NotificationCenter
            open={notificationOpen}
            onClose={() => setNotificationOpen(false)}
            notifications={notifications}
            unread={unread}
            channels={channels}
            settings={notifSettings}
            outbox={outbox}
            streamState={streamState}
            tab={notificationTab}
            onTabChange={setNotificationTab}
            onRead={handleRead}
            onReadAll={handleReadAll}
            onClear={handleClear}
            onSaveSettings={handleSaveSettings}
            onTest={handleTest}
            onRefresh={refreshChannels}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div className="toast" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}>
            <Check size={15}/>{toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function canonicalBefore(before) {
  return {
    level: round(before.level, 0),
    suction: round(before.suction, 2),
    discharge: round(before.discharge, 2),
    flow: round(before.flow, 1),
    temperature: round(before.temperature, 1),
    air: round(before.air, 0),
    npshMargin: round(before.npshMargin, 1)
  };
}
