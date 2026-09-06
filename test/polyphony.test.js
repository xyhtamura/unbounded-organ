/**
 * Checks src/polyphony.js budget arithmetic and src/render.js rank rendering.
 * Run: node test/polyphony.test.js
 */

import assert from 'node:assert/strict';
import {
  poolUsage, maxSampleRateForVoices, equalLengthCeiling, voiceCeilingAtLength,
  rankSpanS, describeRank, transposeRank, quotePolyphonicRender, planPolyphonicRoute,
  voiceDelaySamples, roundTripS,
} from '../src/polyphony.js';
import { MAX_SAFE_DELAY_SAMPLES } from '../src/digital_medium.js';
import { C_EARTH, GAMMA_DIATOMIC, G_EARTH, HEARING_FLOOR_HZ } from '../src/physics.js';
import { renderOffline, renderRank } from '../src/render.js';

const EARTH = { gamma: GAMMA_DIATOMIC, g: G_EARTH, c: C_EARTH };
const SR = 48000;

let ran = 0;
function ok(label, condition, msg = '') {
  ran += 1;
  if (!condition) {
    console.log(`FAIL  ${label} ${msg}`);
    process.exitCode = 1;
  } else {
    console.log(`ok    ${label}`);
  }
}

console.log('--- The pool is a ceiling on the sum ---');

const one = poolUsage([{ lengthM: 1 }], EARTH, SR);
const three = poolUsage([{ lengthM: 1 }, { lengthM: 1 }, { lengthM: 1 }], EARTH, SR);
ok('three unison pipes cost three delay lines',
  Math.abs(three.totalDelaySamples - 3 * one.totalDelaySamples) < 1e-9);
ok('state bytes count what is allocated, not the exact transit time',
  three.totalStateBytes === three.allocatedSamples * 8
  && three.allocatedSamples > three.totalDelaySamples);

// Mixed registers are cheap: the pool is spent on the sum, and a short pipe
// beside a long one is nearly free. This is the fact the roll has to show.
const long = 100000;
const soloLong = poolUsage([{ lengthM: long }], EARTH, SR);
const longPlusThree = poolUsage(
  [{ lengthM: long }, { lengthM: 1 }, { lengthM: 1 }, { lengthM: 1 }], EARTH, SR);
ok('three metre pipes beside a 100 km pipe add under 0.01% ',
  (longPlusThree.totalDelaySamples / soloLong.totalDelaySamples) - 1 < 1e-4);

console.log('--- The exchange rate ---');

const soloCeiling = equalLengthCeiling(1, EARTH, SR);
ok('one voice reaches 479.5 km at 48 kHz', Math.abs(soloCeiling - 479548.76) < 1);
// Not exactly an eighth: eight voices also pay eight lots of interpolator
// padding, which is 1.25 cm of pipe at this rate.
ok('eight unison voices reach an eighth of that, less their padding',
  Math.abs(equalLengthCeiling(8, EARTH, SR) - soloCeiling / 8) < 0.02);

for (const count of [1, 2, 8, 61]) {
  const lengthM = equalLengthCeiling(count, EARTH, SR);
  const rank = Array.from({ length: count }, () => ({ lengthM }));
  const usage = poolUsage(rank, EARTH, SR);
  ok(`${count} voices at the ceiling fill the pool without overrunning it`,
    usage.fits && usage.fractionUsed > 0.99999);
  const over = poolUsage(rank.concat([{ lengthM }]), EARTH, SR);
  ok(`${count} voices plus one overruns it`, !over.fits);
}

ok('a 2.44 m rank fits 195,652 voices at 48 kHz',
  voiceCeilingAtLength(2.44, EARTH, SR) === 195652,
  `got ${voiceCeilingAtLength(2.44, EARTH, SR)}`);
ok('and that many really do fit while one more does not',
  poolUsage(Array.from({ length: 195652 }, () => ({ lengthM: 2.44 })), EARTH, SR).fits
  && !poolUsage(Array.from({ length: 195653 }, () => ({ lengthM: 2.44 })), EARTH, SR).fits);

const mixed = [{ lengthM: 2.44 }, { lengthM: 1000 }, { lengthM: 60000 }];
const maxRate = maxSampleRateForVoices(mixed, EARTH);
ok('the whole rank fits at its own maximum rate',
  poolUsage(mixed, EARTH, maxRate).fits);
ok('and not one per cent above it',
  !poolUsage(mixed, EARTH, maxRate * 1.01).fits);

console.log('--- The set-level report ---');

const rank = [
  { lengthM: 2.44 },              // 70.3 Hz, audible
  { lengthM: 8.575 },             // 20.0 Hz, at the floor
  { lengthM: 1000 },              // 0.17 Hz, infrasonic
  { lengthM: 6371000 },           // 26.9 uHz, below the cutoff
];
const report = describeRank(rank, EARTH);
ok('four voices reported', report.voiceCount === 4);
ok('two of them are audible', report.audible === 2, `got ${report.audible}`);
ok('two are not', report.inaudible === 2);
ok('the 6,371 km voice fails the acoustic cutoff', report.forced === 1,
  `got ${report.forced}`);
ok('the lowest voice is the longest pipe', report.lowest.voice.lengthM === 6371000);
ok('the highest is the shortest', report.highest.voice.lengthM === 2.44);
ok('the floor voice sits at 20 Hz',
  Math.abs(report.entries[1].hz - HEARING_FLOOR_HZ) < 0.01);

// Transposition is a rigid shift on a log-length axis; the count is the point.
const down = transposeRank(rank, 2, EARTH);
ok('doubling every length halves every frequency',
  down.after.entries.every((e, i) => Math.abs(e.hz * 2 - report.entries[i].hz) < 1e-9));
ok('and drops the voice that was sitting on the 20 Hz floor',
  down.lostAudible === 1 && down.after.audible === 1, `got ${down.lostAudible}`);
ok('while the 2.44 m voice survives it at 35.17 Hz',
  Math.abs(down.after.entries[0].hz - 35.1434) < 0.001 && down.after.entries[0].audible);
const up = transposeRank(rank, 0.5, EARTH);
ok('halving them brings the 1 km voice no closer to hearing',
  up.after.audible === 2, `got ${up.after.audible}`);

ok('rank span is the last release, not the last onset',
  rankSpanS([{ startS: 0, durationS: 4 }, { startS: 3, durationS: 0.5 }]) === 4);
ok('a voice with no release ends at its onset',
  rankSpanS([{ startS: 2 }]) === 2);

console.log('--- Quoting and routing ---');

const tooBig = Array.from({ length: 4 }, () => ({ lengthM: 400000 }));
const quote = quotePolyphonicRender({
  voices: tooBig, atm: EARTH, sampleRate: SR, bitDepth: 16, durationSec: 2,
});
ok('a rank over the pool cannot render', !quote.canRender && !quote.pool.fits);

const route = planPolyphonicRoute({
  voices: tooBig, atm: EARTH, sampleRate: SR, bitDepth: 16, durationSec: 2,
});
ok('the route lowers the rate rather than dead-ending', route.needed && route.canRender);
ok('and says which step it took and why',
  route.steps[0].kind === 'sampleRate' && route.steps[0].to < SR
  && route.steps[0].why.includes('delay lines'));
ok('the routed rate actually fits', poolUsage(tooBig, EARTH, route.sampleRate).fits);

console.log('--- Rendering a rank ---');

async function renderTests() {
  // One voice through the rank path must be the single-pipe path, sample for
  // sample. If these ever diverge the rank is no longer the waveguide running.
  const solo = await renderOffline({
    lengthM: 2.44, atm: EARTH, mode: 'open', sampleRate: 8000, bitDepth: 16,
    renderMode: 'duration', durationSec: 0.25, normalize: false,
  });
  const asRank = await renderRank({
    voices: [{ lengthM: 2.44, mode: 'open' }], atm: EARTH, sampleRate: 8000,
    bitDepth: 16, durationSec: 0.25, normalize: false,
  });
  let maxDiff = 0;
  for (let i = 0; i < solo.samples.length; i++) {
    maxDiff = Math.max(maxDiff, Math.abs(solo.samples[i] - asRank.samples[i]));
  }
  ok('a rank of one is the single pipe, sample for sample', maxDiff === 0,
    `max difference ${maxDiff}`);

  // Voices sum. Two pipes of the same length at the same onset are one pipe
  // at twice the amplitude; two different lengths are neither.
  const doubled = await renderRank({
    voices: [{ lengthM: 2.44 }, { lengthM: 2.44 }], atm: EARTH, sampleRate: 8000,
    bitDepth: 16, durationSec: 0.25, normalize: false,
  });
  let sumDiff = 0;
  for (let i = 0; i < doubled.samples.length; i++) {
    sumDiff = Math.max(sumDiff, Math.abs(doubled.samples[i] - 2 * solo.samples[i]));
  }
  ok('two identical voices sum to twice one', sumDiff < 1e-12, `max difference ${sumDiff}`);

  const chord = await renderRank({
    voices: [{ lengthM: 2.44 }, { lengthM: 3.66 }], atm: EARTH, sampleRate: 8000,
    bitDepth: 16, durationSec: 0.25, normalize: false,
  });
  ok('two different voices do not', chord.samples.some(
    (s, i) => Math.abs(s - 2 * solo.samples[i]) > 1e-9));

  // A voice is silent before its onset, and is not stepped either, so its
  // ring-down begins when the pallet opens.
  const late = await renderRank({
    voices: [{ lengthM: 2.44, startS: 0.1 }], atm: EARTH, sampleRate: 8000,
    bitDepth: 16, durationSec: 0.25, normalize: false,
  });
  const onset = Math.round(0.1 * 8000);
  let beforeOnset = 0;
  for (let i = 0; i < onset; i++) beforeOnset = Math.max(beforeOnset, Math.abs(late.samples[i]));
  ok('nothing sounds before a voice opens', beforeOnset === 0);
  ok('and the same pipe sounds after it',
    Math.abs(late.samples[onset] - solo.samples[0]) < 1e-12);

  // Closing the pallet stops the drive. With a sustained excitation that is
  // the difference between a note and a drone.
  const held = await renderRank({
    voices: [{ lengthM: 2.44 }], atm: EARTH, sampleRate: 8000, bitDepth: 16,
    excitationType: 'step', durationSec: 0.5, normalize: false,
  });
  const released = await renderRank({
    voices: [{ lengthM: 2.44, durationS: 0.05 }], atm: EARTH, sampleRate: 8000,
    bitDepth: 16, excitationType: 'step', durationSec: 0.5, normalize: false,
  });
  const tailEnergy = (buf) => {
    let e = 0;
    for (let i = Math.round(0.4 * 8000); i < buf.length; i++) e += buf[i] * buf[i];
    return e;
  };
  ok('a released voice carries less late energy than a held one',
    tailEnergy(released.samples) < tailEnergy(held.samples),
    `${tailEnergy(released.samples)} vs ${tailEnergy(held.samples)}`);
  ok('but is identical while the pallet is still open',
    Math.abs(released.samples[100] - held.samples[100]) < 1e-12);

  // The allocation fails where the quote said it would, not part way through.
  let threw = null;
  try {
    await renderRank({
      voices: tooBig, atm: EARTH, sampleRate: SR, bitDepth: 16, durationSec: 0.01,
    });
  } catch (err) { threw = err; }
  ok('a rank over the pool throws before rendering',
    threw !== null && threw.message.includes('ceiling'));

  ok('the render reports the pool it used and the rank it was',
    asRank.pool.fits && asRank.rank.voiceCount === 1 && asRank.silentVoices === 0);

  console.log(`\n${ran} checks run.`);
  if (process.exitCode) console.log('FAILURES ABOVE');
  else console.log('Polyphony: pool arithmetic, set report, transposition, routing, and rank rendering pass.');
}

await renderTests();
