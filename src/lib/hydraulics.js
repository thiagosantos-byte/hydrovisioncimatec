/**
 * HYDROVISION — modelo hidráulico didático
 * ----------------------------------------------------------------------------
 * Substitui a interpolação de valores por um modelo dinâmico contínuo:
 *  - curva da bomba x curva do sistema (vazão de equilíbrio)
 *  - NPSH disponível calculado a partir da pressão absoluta de sucção
 *  - NPSH requerido em função da vazão e da presença de ar
 *  - inércia do conjunto motobomba, atraso de instrumentação e ruído de leitura
 *  - nível com resposta lenta, arraste de ar e vórtice em níveis baixos
 *
 * As constantes foram calibradas para a estação demonstrativa. Não é um
 * modelo de projeto: serve para ensinar causa e efeito com coerência física.
 */

export const PHYS = {
  rho: 993,            // kg/m³ a ~38 °C
  g: 9.81,
  pAtm: 1.013,         // bar abs
  pumpHead0: 66,       // m (shut-off a 100% de rotação)
  pumpCurveK: 0.004,   // m/(m³/h)²
  systemK: 0.0485,
  systemStatic: 10.5,  // m
  npshK: 0.0034,
  npsh0: 2.4,
  nominalFlow: 32.5,
  tankVolume: 14,      // m³
  motorPower: 11       // kW instalado
};

export const NOMINAL = {
  level: 78,
  suction: 1.16,       // bar absoluto
  discharge: 7.22,
  flow: 32.5,
  temperature: 38,
  air: 0,
  restriction: 0,
  vibration: 1.7,
  speed: 1
};

export const DEFAULT_INPUTS = {
  running: true,
  suctionValve: 1,
  dischargeValve: 1,
  refill: true,
  sensorOnline: true,
  radarOnline: true,
  levelTarget: 78,
  airInjection: 0,
  restriction: 0,
  ambient: 26
};

export const SCENARIO_PROFILES = {
  normal: {
    label: 'Referência', duration: 0, severity: 'INFO',
    hint: 'Condição de referência: NPSHa acima do NPSHr, sem ar na linha.'
  },
  cavitation: {
    label: 'Cavitação', duration: 11, severity: 'CRITICO',
    hint: 'Restrição progressiva na sucção + nível baixo derrubam o NPSHa abaixo do NPSHr.',
    fault: { restriction: 0.95, levelTarget: 34, airInjection: 0.08, temperature: 45 }
  },
  air: {
    label: 'Entrada de ar', duration: 9, severity: 'ATENCAO',
    hint: 'Ar na linha reduz a eficiência, instabiliza a vazão e eleva a vibração.',
    fault: { airInjection: 0.82, restriction: 0.12, levelTarget: 66 }
  },
  'low-level': {
    label: 'Nível baixo', duration: 12, severity: 'ATENCAO',
    hint: 'Nível insuficiente gera vórtice, arraste de ar e perda de submergência.',
    fault: { levelTarget: 14, airInjection: 0.3, restriction: 0.2 }
  },
  instrumentation: {
    label: 'Instrumentação', duration: 8, severity: 'CRITICO',
    hint: 'Perda de sinal do manômetro e deriva do radar de nível. A leitura deixa de ser confiável.',
    fault: { sensorOnline: false, radarOnline: false, levelTarget: 70, restriction: 0.35 }
  }
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const damp = (current, target, tau, dt) => current + (target - current) * (1 - Math.exp(-dt / Math.max(0.08, tau)));

export function vaporPressure(temperatureC = 38) {
  // Antoine (água, 1–100 °C) → mmHg → bar abs
  const t = clamp(temperatureC, 1, 99);
  const mmHg = Math.pow(10, 8.07131 - (1730.63 / (233.426 + t)));
  return (mmHg * 133.322) / 1e5;
}

export function createPlant(overrides = {}) {
  return {
    ...NOMINAL,
    time: 0,
    lastMeasure: { level: NOMINAL.level, suction: NOMINAL.suction, discharge: NOMINAL.discharge, flow: NOMINAL.flow, temperature: NOMINAL.temperature },
    ...overrides
  };
}

/**
 * Avança o modelo em `dt` segundos.
 * @param {object} plant estado atual (não é mutado)
 * @param {object} inputs entradas operacionais
 * @param {number} dt segundos
 */
export function stepPlant(plant, inputs = {}, dt = 0.12) {
  const dtc = clamp(dt, 0, 0.4);
  const next = { ...plant, time: (plant.time || 0) + dtc };
  const i = { ...DEFAULT_INPUTS, ...inputs };

  // ---- atuadores com inércia -------------------------------------------
  next.speed = damp(plant.speed ?? 1, i.running ? 1 : 0, 1.15, dtc);
  next.air = damp(plant.air ?? 0, clamp(i.airInjection, 0, 1) * 100, 1.6, dtc);
  next.restriction = damp(plant.restriction ?? 0, clamp(i.restriction ?? 0, 0, 1), 1.4, dtc);
  next.level = damp(plant.level ?? NOMINAL.level, clamp(i.levelTarget ?? 78, 2, 100), 5.5, dtc);

  const airFrac = clamp(next.air / 100, 0, 1);
  const valveFactor = clamp(i.suctionValve, 0, 1) * clamp(i.dischargeValve, 0, 1);

  // ---- ponto de operação: curva da bomba x curva do sistema ------------
  const h0 = PHYS.pumpHead0 * next.speed * next.speed;
  const staticHead = PHYS.systemStatic + 0.02 * next.level;
  const systemK = PHYS.systemK
    + 0.42 * Math.pow(1 - valveFactor, 2)
    + 0.022 * next.restriction
    + 0.035 * airFrac;
  const flowCurve = Math.sqrt(Math.max(0, (h0 - staticHead) / (PHYS.pumpCurveK + systemK)));
  let flowTarget = flowCurve * Math.pow(Math.max(0.0001, valveFactor), 0.22) * (1 - 0.30 * airFrac);

  // ---- pressão de sucção (absoluta) -----------------------------------
  const levelHead = 0.35 + 1.72 * (next.level / 100);
  const vortexLoss = next.level < 26 ? ((26 - next.level) / 26) * 1.35 : 0;
  const suctionLoss = (0.18 + 14.5 * next.restriction + 0.9 * airFrac) * Math.pow(Math.max(0.05, flowTarget / PHYS.nominalFlow), 1.7)
    + (1 - clamp(i.suctionValve, 0, 1)) * 3.2
    + vortexLoss;
  let suctionTarget = PHYS.pAtm + (levelHead - suctionLoss) * (PHYS.rho * PHYS.g) / 1e5;

  // Vazão finita é necessária para haver cavitação: o rotor continua girando,
  // mas o escoamento é bloqueado parcialmente pelas bolhas.
  const npshReqNow = (PHYS.npsh0 + PHYS.npshK * flowTarget * flowTarget) * (1 + 1.15 * airFrac);
  const npshAvailNow = ((Math.max(0.02, suctionTarget) - vaporPressure(plant.temperature ?? 38)) * 1e5) / (PHYS.rho * PHYS.g);
  const deficitNow = npshReqNow - npshAvailNow;
  if (deficitNow > 0) {
    const choke = clamp(1 - deficitNow * 0.028, 0.58, 1);
    flowTarget *= choke;
    suctionTarget = Math.max(0.02, suctionTarget);
  }

  next.flow = damp(plant.flow ?? NOMINAL.flow, Math.max(0, flowTarget), 0.55, dtc);
  next.suction = damp(plant.suction ?? NOMINAL.suction, Math.max(0.02, suctionTarget), 0.85, dtc);

  // ---- pressão de descarga ---------------------------------------------
  const head = Math.max(0, h0 - PHYS.pumpCurveK * next.flow * next.flow);
  const dischargeTarget = next.suction + head * (PHYS.rho * PHYS.g) / 1e5;
  next.discharge = damp(plant.discharge ?? NOMINAL.discharge, dischargeTarget, 0.7, dtc);

  // ---- temperatura, vibração e eficiência ------------------------------
  const load = clamp(next.flow / PHYS.nominalFlow, 0, 1.25);
  const cavitationLoad = clamp(deficitNow / 6, 0, 1);
  const tempTarget = (i.ambient ?? 26) + 10.5 * load + 14 * cavitationLoad + (i.running ? 2 : 0);
  next.temperature = damp(plant.temperature ?? NOMINAL.temperature, tempTarget, 26, dtc);
  const vibrationTarget = 1.4 + 0.9 * load + 5.5 * cavitationLoad + 2.4 * airFrac + (i.running ? 0 : 0);
  next.vibration = damp(plant.vibration ?? NOMINAL.vibration, vibrationTarget, 2.4, dtc);

  // ---- leituras medidas (ruído, deriva e falha de instrumento) ---------
  const noise = (amp) => (Math.random() - 0.5) * amp;
  const radarReliable = i.radarOnline !== false;
  const levelMeasured = radarReliable
    ? clamp(next.level + noise(0.45), 0, 100)
    : clamp((plant.lastMeasure?.level ?? next.level) + noise(0.9) + (next.time % 30) * 0.02, 0, 100);

  next.lastMeasure = {
    level: Number(levelMeasured.toFixed(1)),
    suction: i.sensorOnline === false ? null : Number((next.suction + noise(0.012)).toFixed(3)),
    discharge: i.sensorOnline === false ? null : Number((next.discharge + noise(0.02)).toFixed(2)),
    flow: Number((next.flow + noise(0.35)).toFixed(1)),
    temperature: Number((next.temperature + noise(0.15)).toFixed(1))
  };

  next.sensorOnline = i.sensorOnline !== false;
  next.radarOnline = radarReliable;
  next.riskCache = evaluateRisk(next, i);

  return next;
}

export function derivePlant(plant, inputs = {}) {
  const i = { ...DEFAULT_INPUTS, ...inputs };
  const pVap = vaporPressure(plant.temperature ?? 38);
  const npshAvailable = ((Math.max(0.02, plant.suction) - pVap) * 1e5) / (PHYS.rho * PHYS.g);
  const airFrac = clamp((plant.air ?? 0) / 100, 0, 1);
  const npshRequired = (PHYS.npsh0 + PHYS.npshK * Math.pow(plant.flow ?? 0, 2)) * (1 + 1.15 * airFrac);
  const npshMargin = npshAvailable - npshRequired;
  const cavitation = npshMargin < 0;
  const cavitationIndex = clamp(npshMargin < 0 ? 0.35 + (-npshMargin) / 8 : Math.max(0, (1.6 - npshMargin) / 12), 0, 1);
  const flowRatio = clamp((plant.flow ?? 0) / PHYS.nominalFlow, 0, 1.4);
  const efficiency = clamp(0.79 - 0.00042 * Math.pow((plant.flow ?? 0) - 29, 2) - 0.16 * airFrac - 0.1 * cavitationIndex, 0.18, 0.82);
  const head = Math.max(0, PHYS.pumpHead0 * Math.pow(plant.speed ?? 1, 2) - PHYS.pumpCurveK * Math.pow(plant.flow ?? 0, 2));
  const hydraulicPower = (PHYS.rho * PHYS.g * (plant.flow ?? 0) * head) / 3.6e6;
  const powerKw = clamp(hydraulicPower / Math.max(0.2, efficiency), 0, PHYS.motorPower * 1.35);
  const loadPercent = clamp((powerKw / PHYS.motorPower) * 100, 0, 130);
  const risk = evaluateRisk(plant, i);

  return {
    npshAvailable,
    npshRequired,
    npshMargin,
    cavitation,
    cavitationIndex,
    flowRatio,
    efficiency,
    head,
    powerKw,
    loadPercent,
    specificEnergy: plant.flow > 0.5 ? powerKw / (plant.flow / 3.6) : 0,
    risk,
    level: plant.level,
    flow: plant.flow,
    suction: plant.suction,
    discharge: plant.discharge,
    temperature: plant.temperature,
    air: plant.air,
    restriction: plant.restriction,
    vibration: plant.vibration,
    speed: plant.speed,
    pVap,
    measured: plant.lastMeasure
  };
}

export function evaluateRisk(plant, inputs = {}) {
  const i = { ...DEFAULT_INPUTS, ...inputs };
  const pVap = vaporPressure(plant.temperature ?? 38);
  const npshAvailable = ((Math.max(0.02, plant.suction) - pVap) * 1e5) / (PHYS.rho * PHYS.g);
  const airFrac = clamp((plant.air ?? 0) / 100, 0, 1);
  const npshRequired = (PHYS.npsh0 + PHYS.npshK * Math.pow(plant.flow ?? 0, 2)) * (1 + 1.15 * airFrac);
  const margin = npshAvailable - npshRequired;
  const level = plant.level ?? NOMINAL.level;
  const vibration = plant.vibration ?? 1.7;
  const temperature = plant.temperature ?? 38;

  let risk = 4;
  if (margin < 0) risk += 62 + clamp(-margin * 8, 0, 30);
  else if (margin < 1.5) risk += clamp((1.5 - margin) * 26, 0, 34);
  else risk += clamp((1.8 - margin) * 10, 0, 8);
  risk += airFrac * 27;
  risk += level < 28 ? (28 - level) * 2.4 : 0;
  const flowRatio = clamp((plant.flow ?? 0) / PHYS.nominalFlow, 0, 1.4);
  risk += flowRatio < 0.78 ? (0.78 - flowRatio) * 55 : 0;
  risk += i.sensorOnline === false ? 46 : 0;
  risk += i.radarOnline === false ? 12 : 0;
  if (i.suctionValve === 0) risk += 35;
  if (i.dischargeValve === 0) risk += 28;
  if (!i.running) risk = Math.max(risk * 0.55, level < 25 ? 26 : 8);
  risk += vibration > 4.5 ? (vibration - 4.5) * 5 : 0;
  risk += temperature > 62 ? (temperature - 62) * 1.4 : 0;
  return Math.round(clamp(risk, 0, 98));
}

export function conditionFromRisk(risk) {
  if (risk >= 65) return { tone: 'critical', label: 'Condição crítica' };
  if (risk >= 30) return { tone: 'warning', label: 'Atenção operacional' };
  return { tone: 'good', label: 'Operação estável' };
}

export function scenarioInputs(scenario, ramp = 0, base = DEFAULT_INPUTS) {
  const profile = SCENARIO_PROFILES[scenario];
  if (!profile?.fault) return { ...base, ...defaultsForScenario(scenario) };
  const r = clamp(ramp, 0, 1);
  const fault = profile.fault;
  const mixed = { ...base };
  if (fault.restriction !== undefined) mixed.restriction = base.restriction + (fault.restriction - base.restriction) * r;
  if (fault.airInjection !== undefined) mixed.airInjection = base.airInjection + (fault.airInjection - base.airInjection) * r;
  if (fault.levelTarget !== undefined) mixed.levelTarget = base.levelTarget + (fault.levelTarget - base.levelTarget) * r;
  if (r > 0.22) {
    if (fault.sensorOnline === false) mixed.sensorOnline = false;
    if (fault.radarOnline === false) mixed.radarOnline = false;
  }
  return mixed;
}

function defaultsForScenario(scenario) {
  if (scenario === 'instrumentation') return { sensorOnline: false, radarOnline: false };
  return {};
}

export function buildRecommendation(derived, inputs = {}) {
  if (inputs.sensorOnline === false) {
    return {
      title: 'Instrumentação sem sinal',
      detail: 'A leitura de pressão não é confiável. Verifique alimentação, cabeamento e calibração; mantenha a última leitura apenas como histórico.',
      action: 'Restaurar comunicação do sensor'
    };
  }
  if (derived.npshMargin < 0) {
    return {
      title: 'Margem de NPSH negativa',
      detail: 'Risco de cavitação. Reduza a restrição na sucção, eleve o nível do tanque e confirme a temperatura do fluido antes de aumentar a vazão.',
      action: 'Limpar sucção e restabelecer nível'
    };
  }
  if (derived.npshMargin < 1.2) {
    return {
      title: 'Margem de NPSH reduzida',
      detail: `NPSHa ${derived.npshAvailable.toFixed(1)} m contra NPSHr ${derived.npshRequired.toFixed(1)} m. A folga é pequena: reduza a restrição na sucção, eleve o nível e reavalie a temperatura antes de aumentar a vazão.`,
      action: 'Abrir sucção e elevar nível'
    };
  }
  if (derived.air > 30) {
    return {
      title: 'Ar na linha hidráulica',
      detail: 'Purgue a linha, revise vedações e juntas da sucção e confirme a submergência mínima.',
      action: 'Purgar linha e revisar vedações'
    };
  }
  if (derived.level < 25) {
    return {
      title: 'Nível abaixo do mínimo operacional',
      detail: 'Restabeleça a reposição e valide a medição do radar de nível antes de retomar a carga.',
      action: 'Repor fluido no reservatório'
    };
  }
  if (derived.vibration > 4.5) {
    return {
      title: 'Vibração acima do limite',
      detail: 'Verifique alinhamento motor-bomba, acoplamento e balanceamento do rotor.',
      action: 'Inspecionar alinhamento'
    };
  }
  return {
    title: 'Operação dentro das faixas de referência',
    detail: 'Mantenha o monitoramento contínuo e registre as intervenções no histórico.',
    action: 'Nenhuma ação imediata'
  };
}
