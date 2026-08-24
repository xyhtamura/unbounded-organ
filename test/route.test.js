/**
 * The instrument never dead-ends.
 *
 * Checks that planRenderRoute() finds a way to render at every length in the
 * range, and that the way it finds is a degradation of the model rather than a
 * substitute for it — resolution or duration, never a different computation.
 *
 * Run:  node test/route.test.js
 */

import {
  planRenderRoute, maxSampleRateFor, isForced,
  quoteRenderCost, MAX_SAFE_DELAY_SAMPLES, WAV_MAX_BYTES,
} from '../src/digital_medium.js';
import { pipeFundamentalHz, cutoffHz } from '../src/physics.js';

const ATM = { gamma: 1.4, g: 9.80665, c: 343 };
const MIN_M = 0.008575;
const MAX_M = 4.0075e7;

let ran = 0, failed = 0;
function ok(label, cond, detail = '') {
  ran += 1;
  if (cond) { console.log(`ok    ${label}${detail ? '  ' + detail : ''}`); }
  else { failed += 1; console.log(`FAIL  ${label}${detail ? '  ' + detail : ''}`); }
}

console.log('--- a route exists at every length ---');

// Sweep the full range logarithmically, at the most demanding rate.
const lo = Math.log10(MIN_M), hi = Math.log10(MAX_M);
let worstBand = Infinity;
let sweepOk = true;
for (let i = 0; i <= 200; i += 1) {
  const L = Math.pow(10, lo + (i / 200) * (hi - lo));
  for (const mode of ['open', 'stopped']) {
    const route = planRenderRoute({
      lengthM: L, atm: ATM, mode,
      sampleRate: 48000, bitDepth: 16,
      renderMode: 'cycles', durationSec: 2, cycleCount: 1,
    });
    if (!route.canRender) {
      sweepOk = false;
      console.log(`  FAIL no route at L=${L.toPrecision(4)} m (${mode})`);
    }
    if (route.sampleRate / 2 < worstBand) worstBand = route.sampleRate / 2;
  }
}
ok('every length in range renders, both modes (402 cases)', sweepOk);
ok('worst band across the sweep is still usable', worstBand > 100,
   `${worstBand.toFixed(1)} Hz`);

console.log('\n--- the route degrades the model, never replaces it ---');

const earth = planRenderRoute({
  lengthM: 6.371e6, atm: ATM, mode: 'open',
  sampleRate: 48000, bitDepth: 16, renderMode: 'cycles', durationSec: 2, cycleCount: 1,
});
ok('Earth radius needs a route', earth.needed);
ok('Earth radius still renders', earth.canRender);
ok('only sample rate or duration is touched',
   earth.steps.every((s) => s.kind === 'sampleRate' || s.kind === 'duration'),
   earth.steps.map((s) => s.kind).join(','));
ok('the routed rate actually fits the delay line',
   (2 * 6.371e6 / ATM.c) * earth.sampleRate <= MAX_SAFE_DELAY_SAMPLES,
   `${((2 * 6.371e6 / ATM.c) * earth.sampleRate / 1e6).toFixed(1)}M samples`);
ok('the routed file actually fits the container',
   earth.quote.totalFileSizeBytes <= WAV_MAX_BYTES + 44,
   `${(earth.quote.totalFileSizeBytes / 1024 ** 2).toFixed(0)} MiB`);
ok('every step states what it costs', earth.steps.every((s) => s.cost && s.why));

console.log('\n--- one full cycle is always renderable ---');
// For an open pipe the round trip IS the period, so at the highest fitting
// rate a whole cycle is exactly MAX_SAFE_DELAY_SAMPLES.
let cycleOk = true;
for (const L of [53841.78, 1.786e6, 6.371e6, 4.0075e7]) {
  const rate = Math.floor(maxSampleRateFor(L, ATM));
  const q = quoteRenderCost({
    lengthM: L, atm: ATM, mode: 'open', sampleRate: rate, bitDepth: 16,
    renderMode: 'cycles', durationSec: 0, cycleCount: 1,
  });
  const mib = q.totalFileSizeBytes / 1024 ** 2;
  const fits = q.canRender && mib < 600;
  if (!fits) cycleOk = false;
  console.log(`      L=${(L / 1000).toFixed(0)} km  rate=${rate} Hz  one cycle=${mib.toFixed(0)} MiB  ${fits ? 'ok' : 'FAIL'}`);
}
ok('one whole cycle fits at the fitting rate, at every scale', cycleOk);

console.log('\n--- the override flag tracks the physics, not the apparatus ---');
const fa = cutoffHz(ATM);
ok('a 2.44 m pipe is not forced', isForced(2.4384, ATM, 'open') === false);
ok('a 100 km pipe is forced', isForced(1e5, ATM, 'open') === true);
ok('forced flips exactly at the cutoff length',
   isForced(53841.0, ATM, 'open') === false && isForced(53843.0, ATM, 'open') === true,
   `f_a = ${(fa * 1000).toFixed(4)} mHz`);
ok('a stopped pipe is forced at half the length',
   isForced(26922.0, ATM, 'stopped') === true && isForced(26920.0, ATM, 'stopped') === false);

console.log('\n--- settings that already work are left alone ---');
const small = planRenderRoute({
  lengthM: 2.4384, atm: ATM, mode: 'open',
  sampleRate: 48000, bitDepth: 16, renderMode: 'cycles', durationSec: 2, cycleCount: 1,
});
ok('no route needed for an audible pipe', small.needed === false);
ok('sample rate untouched', small.sampleRate === 48000);

console.log(`\n${ran - failed}/${ran} passed`);
process.exit(failed === 0 ? 0 : 1);
