/**
 * Checks src/waveguide.js against PORG-4 mode structure and boundary conditions.
 *
 * Spec §4.3 & §7 step 4:
 * Check it against PORG-4 — an open line must produce every integer harmonic
 * and a stopped one only the odd ones.
 *
 * Run: node test/waveguide.test.js
 */

import { createWaveguide } from '../src/waveguide.js';
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
  const err = Math.abs(got - want) / Math.abs(want);
  if (!(err <= rtol)) {
    failed += 1;
    console.log(`FAIL  ${label}\n        got  ${got}\n        want ${want}  (rel err ${err.toExponential(3)})`);
  } else {
    console.log(`ok    ${label}  ${got}`);
  }
}

// Simple Discrete Fourier Transform magnitude at frequency f
function dftMag(samples, sampleRate, f) {
  const N = samples.length;
  let re = 0;
  let im = 0;
  const omega = (2 * Math.PI * f) / sampleRate;
  for (let n = 0; n < N; n++) {
    const angle = omega * n;
    re += samples[n] * Math.cos(angle);
    im -= samples[n] * Math.sin(angle);
  }
  return Math.hypot(re, im);
}

console.log('--- Waveguide Round-trip Impulse Timing ---');

// Test 1: Open pipe with exact integer delay
// 3.43 m pipe at 343 m/s has round trip tau = 2 * 3.43 / 343 = 0.02 s (50 Hz).
// At fs = 10000 Hz, delay is exactly 200 samples.
{
  const wg = createWaveguide({
    lengthM: 3.43,
    atm: EARTH,
    mode: 'open',
    sampleRate: 10000,
    excitationType: 'impulse',
    interpolatorType: 'none',
    lossFactor: 1.0,
  });

  const buffer = new Float64Array(1000);
  wg.processBlock(buffer);

  assert('open pipe sample 0 is impulse 0.8', Math.abs(buffer[0] - 0.8) < 1e-6);
  assert('open pipe sample 200 is first reflection 0.8', Math.abs(buffer[200] - 0.8) < 1e-6);
  assert('open pipe sample 400 is second reflection 0.8', Math.abs(buffer[400] - 0.8) < 1e-6);
  assert('open pipe sample 100 is silence', Math.abs(buffer[100]) < 1e-6);
}

// Test 2: Stopped pipe with exact integer delay
// 3.43 m stopped pipe at 343 m/s has loop feedback with sign -1 every 200 samples (tau_roundtrip = 400 samples = 25 Hz).
{
  const wg = createWaveguide({
    lengthM: 3.43,
    atm: EARTH,
    mode: 'stopped',
    sampleRate: 10000,
    excitationType: 'impulse',
    interpolatorType: 'none',
    lossFactor: 1.0,
  });

  const buffer = new Float64Array(1000);
  wg.processBlock(buffer);

  assert('stopped pipe sample 0 is impulse +0.8', Math.abs(buffer[0] - 0.8) < 1e-6);
  assert('stopped pipe sample 200 is inverted reflection -0.8', Math.abs(buffer[200] - (-0.8)) < 1e-6);
  assert('stopped pipe sample 400 is positive reflection +0.8', Math.abs(buffer[400] - 0.8) < 1e-6);
}

console.log('\n--- Waveguide Mode Harmonic Structure (PORG-4) ---');

// Test 3: Open pipe produces integer harmonics 1, 2, 3, 4...
{
  const sampleRate = 48000;
  const lengthM = 1.715; // f1 = 343 / (2 * 1.715) = 100 Hz.
  const wg = createWaveguide({
    lengthM,
    atm: EARTH,
    mode: 'open',
    sampleRate,
    excitationType: 'impulse',
    interpolatorType: 'linear',
    lossFactor: 0.9995,
  });

  const N = 48000; // 1 second of simulation
  const buffer = new Float64Array(N);
  wg.processBlock(buffer);

  const f1 = 100;
  const magH1 = dftMag(buffer, sampleRate, 1 * f1);
  const magH2 = dftMag(buffer, sampleRate, 2 * f1);
  const magH3 = dftMag(buffer, sampleRate, 3 * f1);
  const magH4 = dftMag(buffer, sampleRate, 4 * f1);
  const magOff = dftMag(buffer, sampleRate, 1.5 * f1); // in-between off-resonance

  assert('open pipe has strong fundamental h1 (100 Hz)', magH1 > 50);
  assert('open pipe has strong 2nd harmonic h2 (200 Hz)', magH2 > 50);
  assert('open pipe has strong 3rd harmonic h3 (300 Hz)', magH3 > 50);
  assert('open pipe has strong 4th harmonic h4 (400 Hz)', magH4 > 50);
  assert('open pipe has low energy at off-resonance 150 Hz', magH1 / magOff > 10, `ratio: ${(magH1/magOff).toFixed(1)}`);
}

// Test 4: Stopped pipe produces ODD harmonics (1, 3, 5...) and suppresses EVEN harmonics (2, 4...)
{
  const sampleRate = 48000;
  const lengthM = 1.715; // stopped pipe f1 = 343 / (4 * 1.715) = 50 Hz.
  const wg = createWaveguide({
    lengthM,
    atm: EARTH,
    mode: 'stopped',
    sampleRate,
    excitationType: 'impulse',
    interpolatorType: 'linear',
    lossFactor: 0.9995,
  });

  const N = 48000; // 1 second of simulation
  const buffer = new Float64Array(N);
  wg.processBlock(buffer);

  const f1 = 50;
  const magOdd1 = dftMag(buffer, sampleRate, 1 * f1); // 50 Hz
  const magEven2 = dftMag(buffer, sampleRate, 2 * f1); // 100 Hz
  const magOdd3 = dftMag(buffer, sampleRate, 3 * f1); // 150 Hz
  const magEven4 = dftMag(buffer, sampleRate, 4 * f1); // 200 Hz
  const magOdd5 = dftMag(buffer, sampleRate, 5 * f1); // 250 Hz

  assert('stopped pipe has strong 1st harmonic (50 Hz)', magOdd1 > 50);
  assert('stopped pipe has strong 3rd harmonic (150 Hz)', magOdd3 > 50);
  assert('stopped pipe has strong 5th harmonic (250 Hz)', magOdd5 > 50);

  // Even modes should be heavily suppressed relative to odd modes
  assert('stopped pipe suppresses even mode h2 (100 Hz)', magOdd1 / magEven2 > 20, `ratio: ${(magOdd1/magEven2).toFixed(1)}`);
  assert('stopped pipe suppresses even mode h4 (200 Hz)', magOdd3 / magEven4 > 20, `ratio: ${(magOdd3/magEven4).toFixed(1)}`);
}

console.log(`\n${ran - failed}/${ran} passed`);
process.exit(failed === 0 ? 0 : 1);
