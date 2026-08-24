/**
 * Checks src/physics.js against reference thresholds and derivations.
 * Run: node test/physics.test.js
 */

import {
  scaleHeight,
  cutoffHz,
  criticalLength,
  pipeFundamentalHz,
  pipeLengthForHz,
  classify,
  lowestPropagatingMode,
  soundSpeedFromGas,
  octaveShift,
  GAMMA_DIATOMIC,
  G_EARTH,
  C_EARTH,
  FOOT_M,
} from '../src/physics.js';

const EARTH = { gamma: GAMMA_DIATOMIC, g: G_EARTH, c: C_EARTH };

let failed = 0;
let ran = 0;

function close(label, got, want, rtol = 1e-9) {
  ran += 1;
  const err = Math.abs(got - want) / Math.abs(want);
  if (!(err <= rtol)) {
    failed += 1;
    console.log(`FAIL  ${label}\n        got  ${got}\n        want ${want}  (rel err ${err.toExponential(3)})`);
  } else {
    console.log(`ok    ${label}  ${got}`);
  }
}

function equal(label, got, want) {
  ran += 1;
  if (got !== want) {
    failed += 1;
    console.log(`FAIL  ${label}\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
  } else {
    console.log(`ok    ${label}  ${JSON.stringify(got)}`);
  }
}

console.log('--- against thresholds_output.txt, Earth ---');
close('H = 8.57 km', scaleHeight(EARTH) / 1000, 8.57, 1e-3);
close('f_a = 3.1853 mHz', cutoffHz(EARTH) * 1000, 3.1853, 1e-4);
close('cutoff period = 5.2 min', 1 / cutoffHz(EARTH) / 60, 5.2, 1e-2);

close('L_crit open = 53.8 km', criticalLength(EARTH, 'open') / 1000, 53.8, 1e-3);
close('L_crit open / H = 2*pi', criticalLength(EARTH, 'open') / scaleHeight(EARTH), 2 * Math.PI);
close('L_crit stopped / H = pi', criticalLength(EARTH, 'stopped') / scaleHeight(EARTH), Math.PI);

close('L at 20 Hz = 8.57 m', pipeLengthForHz(20, EARTH, 'open'), 8.575, 1e-3);
close('threshold ratio = 6279x',
  criticalLength(EARTH, 'open') / pipeLengthForHz(20, EARTH, 'open'), 6279, 1e-4);

console.log('\n--- reference lengths ---');
const refs = [
  ['8-foot stop', 8 * FOOT_M, 70.333, 'audible'],
  ['32-foot stop', 32 * FOOT_M, 17.5833, 'infrasonic'],
  ['64-foot stop', 64 * FOOT_M, 8.79163, 'infrasonic'],
  ['1 km', 1e3, 0.1715, 'infrasonic'],
  ['10 km', 1e4, 0.01715, 'infrasonic'],
  ['100 km', 1e5, 0.001715, 'below-cutoff'],
  ['Earth radius', 6.371e6, 2.69189e-5, 'below-cutoff'],
  ['Earth circumference', 2 * Math.PI * 6.371e6, 4.28427e-6, 'below-cutoff'],
];
for (const [label, L, hz, regime] of refs) {
  close(`${label} f1`, pipeFundamentalHz(L, EARTH, 'open'), hz, 1e-5);
  equal(`${label} regime`, classify(pipeFundamentalHz(L, EARTH, 'open'), EARTH), regime);
}

console.log('\n--- properties not in the Python, checked against the algebra ---');
close('stopped pipe is half the length',
  pipeLengthForHz(100, EARTH, 'stopped') * 2, pipeLengthForHz(100, EARTH, 'open'));
close('c from gas ~ 343 m/s', soundSpeedFromGas(1.4, 293.15, 0.0289647), 343.0, 1e-3);
const lp = lowestPropagatingMode(1e5, EARTH, 'open');
equal('100 km open, lowest propagating mode n', lp.n, 2);
equal('at L_crit, n = 2', lowestPropagatingMode(criticalLength(EARTH, 'open'), EARTH, 'open').n, 2);
equal('stopped pipe skips even modes',
  lowestPropagatingMode(criticalLength(EARTH, 'stopped') * 1.2, EARTH, 'stopped').n % 2, 1);
equal('audible pipe has no forbidden fundamental',
  lowestPropagatingMode(2.44, EARTH, 'open'), null);
close('octaveShift is log2 of the ratio', octaveShift(10, 20), 1);

console.log(`\n${ran - failed}/${ran} passed`);
process.exit(failed === 0 ? 0 : 1);
