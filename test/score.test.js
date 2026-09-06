/**
 * Checks src/score.js rank score export.
 * Run: node test/score.test.js
 */

import assert from 'node:assert/strict';
import { generateRankScore } from '../src/score.js';
import { C_EARTH, GAMMA_DIATOMIC, G_EARTH } from '../src/physics.js';
import { poolUsage, equalLengthCeiling } from '../src/polyphony.js';

const EARTH = { gamma: GAMMA_DIATOMIC, g: G_EARTH, c: C_EARTH };
const MEDIUM = {
  sampleRate: 48000, bitDepth: 16, interpolatorType: 'linear', excitationType: 'impulse',
};

const rank = [
  { lengthM: 2.4384, startS: 0, durationS: 3 },          // 70.33 Hz, audible
  { lengthM: 8.575, startS: 0.5, durationS: 2.5 },       // 20.00 Hz, at the floor
  { lengthM: 1000, startS: 1, durationS: 4, mode: 'stopped' }, // infrasonic
  { lengthM: 6371000, startS: 2, durationS: 3 },         // below the cutoff
];

const score = generateRankScore({
  date: '2026-09-06', voices: rank, atm: EARTH, digitalMedium: MEDIUM,
});

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

console.log('--- Rank score ---');

// The rank table is the one whose second cell is the boundary condition; the
// pool table further down opens with a length too. It is sorted by length, so
// the score reads from the top of the rank down whatever order they were
// placed in.
const rows = score.split('\n').filter(l => /^\| [^|]+ \| (open|stopped) \|/.test(l));
ok('every voice gets a row', rows.length === rank.length, `got ${rows.length}`);
ok('rows run shortest first',
  rows[0].startsWith('| 2.438 m |') && rows[3].startsWith('| 6371.000 km |'),
  rows.map(r => r.slice(0, 18)).join(' / '));

ok('a zero onset reads as a time, not as an empty period',
  rows[0].includes('| 0.00 s |'), rows[0]);
ok('a stopped pipe is named as one', score.includes('| stopped |'));

// The set report counts rather than repeating the single-pipe explanation.
ok('the set is counted', score.includes('| **Voices** | 4 |'));
ok('audible voices are counted against the total',
  score.includes('**Audible** | 2 of 4'), 'expected 2 of 4');
ok('only the planetary pipe is below the acoustic cutoff',
  /\*\*Below the acoustic cutoff\*\* \| 1 /.test(score)
  && score.includes('evanescent; below the 3.185 mHz cutoff'));
ok('the range names both extremes',
  score.includes('26.919 µHz') && score.includes('70.33 Hz'));

// The pool decides whether the piece is renderable, so it is in the artifact.
const pool = poolUsage(rank, EARTH, MEDIUM.sampleRate);
ok('the rank does not fit at 48 kHz', !pool.fits);
ok('and the score says so rather than only quoting a percentage',
  score.includes('**Fits**: no — over by'));
ok('the exchange rate is stated for this many voices',
  score.includes(`4 pipes of equal length reach `)
  && score.includes('One pipe alone would reach 479.549 km'),
  `ceiling for 4 is ${equalLengthCeiling(4, EARTH, 48000)}`);
ok('each voice reports its own share of the pool',
  score.split('\n').filter(l => /\| [\d.]+% \|$/.test(l)).length === 4);

// The route is the same contract as the single-pipe planner: degrade, never
// substitute.
ok('the route lowers the rate and says what that costs',
  score.includes('**sampleRate**:') && score.includes('band drops to'));
ok('and reports the rank renderable after it', score.includes('**Renderable**: yes'));

// A rank that fits says so, and takes no route.
const small = generateRankScore({
  date: '2026-09-06',
  voices: [{ lengthM: 2.4384, startS: 0, durationS: 2 }],
  atm: EARTH, digitalMedium: MEDIUM,
});
ok('a rank inside the pool needs no route',
  small.includes('None. The rank renders as specified.') && small.includes('**Fits**: yes'));

// The machine-readable block is what makes the score an exchange rather than
// a description: the rank can be rebuilt from it without a resolver.
const json = score.slice(score.indexOf('```json') + 7);
const parsed = JSON.parse(json.slice(0, json.indexOf('```')));
ok('the block parses', parsed.voices.length === 4);
ok('and round-trips every length, mode, onset and release',
  parsed.voices.every((v, i) => {
    const source = rank.find(r => Math.abs(r.lengthM - v.lengthM) < 1e-12);
    return source && v.mode === (source.mode ?? 'open')
      && v.startS === source.startS && v.durationS === source.durationS;
  }));
ok('it carries the atmosphere and the medium too',
  parsed.atmosphere.c === C_EARTH && parsed.sampleRate === 48000 && parsed.bitDepth === 16);

// A held voice has no release; that has to survive both the table and the JSON.
const held = generateRankScore({
  date: '2026-09-06',
  voices: [{ lengthM: 4, startS: 1 }],
  atm: EARTH, digitalMedium: MEDIUM,
});
ok('a held voice is named as held in the table', held.includes('| held |'));
const heldJson = held.slice(held.indexOf('```json') + 7);
ok('and is null rather than Infinity in the block',
  JSON.parse(heldJson.slice(0, heldJson.indexOf('```'))).voices[0].durationS === null);

ok('the score is dated and titled',
  score.startsWith('# The Unbounded Organ — Rank Score')
  && score.includes('*Generated: 2026-09-06*'));

console.log(`\n${ran} checks run.`);
if (process.exitCode) console.log('FAILURES ABOVE');
else console.log('Score: rank table, set report, pool, route, and machine-readable round trip pass.');
