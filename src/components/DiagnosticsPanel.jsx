import React from 'react';
import {
  Activity, AlertTriangle, CheckCircle2, Gauge, Play, Radar, ShieldCheck,
  SlidersHorizontal, Wrench, Wind
} from 'lucide-react';

const CHECKS = [
  { title: 'Alinhamento motor × bomba', detail: 'Verificado e sem comprometimento do funcionamento do sistema.', reference: 'Item 1' },
  { title: 'Integridade elétrica', detail: 'Sem sobretensões, desequilíbrio de fases ou quedas de tensão. Leituras corretas.', reference: 'Item 2' },
  { title: 'Construção e estrutura', detail: 'Sem deficiências construtivas ou desgastes que demandem substituição de peças.', reference: 'Item 3' },
  { title: 'Lubrificação', detail: 'Nenhuma falha associada à lubrificação foi encontrada nos componentes mecânicos.', reference: 'Item 4' }
];

function toneFor(severity) {
  if (severity >= 65) return 'critical';
  if (severity >= 30) return 'warning';
  return 'good';
}

export default function DiagnosticsPanel({ derived, inputs, scenario, onSimulate, onApplySolution, onNotify }) {
  const cavitation = derived.npshMargin < 0;
  const airProblem = derived.air > 25;
  const instrumentProblem = inputs.sensorOnline === false || inputs.radarOnline === false;
  const problems = [
    {
      id: 'cavitation',
      title: 'Cavitação por baixa pressão ou restrição na sucção',
      detail: `NPSHa ${derived.npshAvailable.toFixed(1)} m · NPSHr ${derived.npshRequired.toFixed(1)} m · margem ${derived.npshMargin.toFixed(1)} m.`,
      status: cavitation ? 'CRÍTICO' : derived.npshMargin < 1.5 ? 'ATENÇÃO' : 'CONTROLADO',
      severity: cavitation ? 90 : derived.npshMargin < 1.5 ? 40 : 8,
      action: 'Reproduzir cavitação'
    },
    {
      id: 'air',
      title: 'Entrada de ar no sistema hidráulico',
      detail: `${derived.air.toFixed(0)}% de ar na linha · vibração ${derived.vibration.toFixed(1)} mm/s · eficiência ${(derived.efficiency * 100).toFixed(0)}%.`,
      status: airProblem ? 'ATENÇÃO' : 'CONTROLADO',
      severity: airProblem ? 45 : 8,
      action: 'Reproduzir entrada de ar'
    },
    {
      id: 'instrumentation',
      title: 'Falha de instrumentação e monitoramento insuficiente',
      detail: `Manômetro ${inputs.sensorOnline === false ? 'sem sinal' : 'online'} · radar de nível ${inputs.radarOnline === false ? 'offline' : 'online'}.`,
      status: instrumentProblem ? 'CRÍTICO' : 'CONTROLADO',
      severity: instrumentProblem ? 70 : 6,
      action: 'Reproduzir falha de sinal'
    }
  ];

  return (
    <div className="diagnostics-panel">
      <div className="diag-head">
        <div>
          <span className="eyebrow">DIAGNÓSTICO TÉCNICO · CASO ESTAÇÃO 01</span>
          <strong>Conclusão do atendimento</strong>
          <small>As verificações de alinhamento, elétrica, estrutura e lubrificação foram descartadas. A causa provável está na sucção, na vedação e na instrumentação.</small>
        </div>
        <div className="diag-summary">
          <span className={`diag-score ${toneFor(derived.risk)}`}>{derived.risk}</span>
          <div><small>ÍNDICE DIDÁTICO</small><strong>{derived.risk >= 65 ? 'Ação imediata' : derived.risk >= 30 ? 'Investigação' : 'Monitorar'}</strong></div>
          <button className="diag-notify" onClick={onNotify}><SlidersHorizontal size={13}/> Notificar</button>
        </div>
      </div>

      <div className="diag-grid">
        <section className="diag-col">
          <header><ShieldCheck size={14}/> Verificações realizadas <b>{CHECKS.length}</b></header>
          {CHECKS.map((item) => (
            <div className="diag-check" key={item.title}>
              <CheckCircle2 size={15}/>
              <div><strong>{item.title}</strong><span>{item.detail}</span></div>
              <small>{item.reference}</small>
            </div>
          ))}
        </section>

        <section className="diag-col">
          <header><AlertTriangle size={14}/> Problemas encontrados <b>{problems.filter((p) => p.severity >= 30).length}</b></header>
          {problems.map((problem) => (
            <div className={`diag-problem ${toneFor(problem.severity)}`} key={problem.id}>
              <div className="diag-problem-top">
                <strong>{problem.title}</strong>
                <span>{problem.status}</span>
              </div>
              <p>{problem.detail}</p>
              <button onClick={() => onSimulate(problem.id)}><Play size={12}/> {problem.action}</button>
            </div>
          ))}
        </section>

        <section className="diag-col">
          <header><Wrench size={14}/> Soluções apresentadas <b>3</b></header>
          <div className="diag-solution">
            <span className="diag-solution-icon"><Radar size={15}/></span>
            <div>
              <strong>Sensor radar de nível</strong>
              <p>Leitura contínua e fidedigna da quantidade de fluido, reduzindo medições falsas e permitindo bloqueios por nível baixo.</p>
              <button onClick={() => onSimulate('instrumentation')}><Gauge size={12}/> Testar cenário de nível</button>
            </div>
          </div>
          <div className="diag-solution">
            <span className="diag-solution-icon"><Wind size={15}/></span>
            <div>
              <strong>Purga e vedação da sucção</strong>
              <p>Elimina entrada de ar, estabiliza a vazão e devolve a margem de NPSH. Revisar juntas, conexões e submergência.</p>
              <button onClick={() => onSimulate('air')}><Play size={12}/> Reproduzir entrada de ar</button>
            </div>
          </div>
          <div className="diag-solution">
            <span className="diag-solution-icon"><Activity size={15}/></span>
            <div>
              <strong>Monitoramento contínuo com alertas</strong>
              <p>NPSHa × NPSHr, pressão, vazão e vibração monitorados com notificação no aplicativo e no WhatsApp.</p>
              <button onClick={onApplySolution}><CheckCircle2 size={12}/> Aplicar solução completa</button>
            </div>
          </div>
        </section>
      </div>

      <div className="diag-foot">
        <span><ShieldCheck size={12}/> Verificações mecânicas e elétricas descartadas com base no relatório da equipe.</span>
        <span>{scenario === 'normal' ? 'Cenário atual: referência' : `Cenário atual: ${scenario}`}</span>
      </div>
    </div>
  );
}
