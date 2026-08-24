/**
 * Checks src/interpolator.js for phase delay and inharmonicity measurements.
 * Run: node test/interpolator.test.js
 */

import {
  interpolatorResponse,
  measurePhaseDelay,
  analyzeModeDeviations,
} from '../src/interpolator.js';
import { C_EARTH, GAMMA_DIATOMIC, G_EARTH } from '../src/physics.js';

const EARTH = { gamma: GAMMA_DIATOMIC, g: G_EARTH, c: C_EARTH };

let failed = 0;
let ran = 0;

function assert(label, condition, msg = '') {
  ran += 1;
  if (!condition) {
    failed += 1;
    console.log(`FAIL  ${label} ${msg}`);
  } else {
    console.log(`ok    ${label}`);
  }
}

function close(label, got, want, rtol = 1e-4) {
  ran += 1;
  const err = Math.abs(got - want) / Math.abs(want || 1);
  if (!(err <= rtol)) {
    failed += 1;
    console.log(`FAIL  ${label}\n        got  ${got}\n        want ${want}  (rel err ${err.toExponential(3)})`);
  } else {
    console.log(`ok    ${label}  ${got}`);
  }
}

console.log('--- Interpolator Response Properties ---');

// Test 1: Thiran 1st order allpass has unity magnitude for all frequencies
{
  const omegas = [0.01, 0.1, 0.5, 1.0, 2.0, Math.PI - 0.01];
  for (const w of omegas) {
    const resp = interpolatorResponse('thiran1', 0.4, w);
    close(`thiran1 |H| is 1.0 at omega=${w.toFixed(2)}`, resp.mag, 1.0, 1e-6);
  }
}

// Test 2: When fractional delay is zero, phase delay is exactly zero
{
  const delay = measurePhaseDelay('linear', 10, 0.0, 0.05);
  close('linear phase delay at frac=0 is exactly intDelay', delay, 10.0, 1e-6);
}

// Test 3: Phase delay at low frequencies approximates requested fractional delay d
{
  const targetFrac = 0.35;
  const intDelay = 100;
  const lowFreq = 0.001; // f / fs = 0.001

  const delayLin = measurePhaseDelay('linear', intDelay, targetFrac, lowFreq);
  const delayLag = measurePhaseDelay('lagrange3', intDelay, targetFrac, lowFreq);
  const delayThi = measurePhaseDelay('thiran1', intDelay, targetFrac, lowFreq);

  close('linear DC phase delay matches target', delayLin, intDelay + targetFrac, 1e-3);
  close('lagrange3 DC phase delay matches target', delayLag, intDelay + targetFrac, 1e-4);
  close('thiran1 DC phase delay matches target', delayThi, intDelay + targetFrac, 1e-3);
}

console.log('\n--- Mode Inharmonicity Analysis ---');

// Test 4: When delay is an exact integer, inharmonicity is zero for all modes
{
  // 3.43 m pipe at c=343, open -> tau = 0.02 s -> at fs=10000, delay is exactly 200 samples
  const analysis = analyzeModeDeviations({
    lengthM: 3.43,
    atm: EARTH,
    mode: 'open',
    sampleRate: 10000,
    interpolatorType: 'linear',
    maxModes: 8,
  });

  close('integer delay has 0 RMS inharmonicity', analysis.rmsDeviation, 0.0, 1e-6);
  for (const m of analysis.modes) {
    close(`mode ${m.n} target equals realised`, m.realisedHz, m.targetHz, 1e-6);
  }
}

// Test 5: Fractional delay yields measurable inharmonicity report
{
  const analysis = analyzeModeDeviations({
    lengthM: 2.4384, // 8 ft pipe
    atm: EARTH,
    mode: 'open',
    sampleRate: 48000,
    interpolatorType: 'linear',
    maxModes: 6,
  });

  assert('modes array populated', analysis.modes.length > 0);
  assert('RMS inharmonicity is finite and >= 0', Number.isFinite(analysis.rmsDeviation) && analysis.rmsDeviation >= 0);
  assert('maxAbsDev is reported', Number.isFinite(analysis.maxAbsDev));
}

console.log(`\n${ran - failed}/${ran} passed`);
process.exit(failed === 0 ? 0 : 1);
