import { createPlant, stepPlant, derivePlant, scenarioInputs, DEFAULT_INPUTS, SCENARIO_PROFILES } from '../src/lib/hydraulics.js';

function run(name, scenario) {
  let plant = createPlant();
  const profile = SCENARIO_PROFILES[scenario];
  const dur = (profile.duration || 0) * 1000;
  let t = 0;
  const samples = [];
  while (t < 20000) {
    const ramp = dur ? Math.min(1, t / dur) : 0;
    const inputs = scenarioInputs(scenario, ramp, DEFAULT_INPUTS);
    plant = stepPlant(plant, inputs, 0.1);
    t += 100;
    if (t % 2000 === 0) samples.push({ t: t/1000, lvl:+plant.level.toFixed(0), suc:+plant.suction.toFixed(2), dis:+plant.discharge.toFixed(1), q:+plant.flow.toFixed(1), air:+plant.air.toFixed(0), restr:+plant.restriction.toFixed(2), temp:+plant.temperature.toFixed(1), vib:+plant.vibration.toFixed(1), risk: derivePlant(plant, inputs).risk, npsha:+derivePlant(plant, inputs).npshAvailable.toFixed(1), npshr:+derivePlant(plant, inputs).npshRequired.toFixed(1), marg:+derivePlant(plant, inputs).npshMargin.toFixed(1), eff:+(derivePlant(plant, inputs).efficiency*100).toFixed(0) });
  }
  console.log('\n===', name, '===');
  console.table(samples);
}
run('baseline', 'normal');
run('cavitation', 'cavitation');
run('air', 'air');
run('low-level', 'low-level');
run('instrumentation', 'instrumentation');
