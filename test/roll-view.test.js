/**
 * Checks src/roll-view.js geometry and hit testing.
 * Run: node test/roll-view.test.js
 */

import assert from 'node:assert/strict';
import {
  MIN_LENGTH_M, MAX_LENGTH_M, BAR_HEIGHT, EDGE_GRAB_PX,
  lengthToUnit, unitToLength, plotBox, lengthToY, yToLength,
  timeToX, xToTime, hitTest, finiteDuration, decadeLines, thresholdLines,
} from '../src/roll-view.js';
import { C_EARTH, GAMMA_DIATOMIC, G_EARTH, pipeFundamentalHz } from '../src/physics.js';

const EARTH = { gamma: GAMMA_DIATOMIC, g: G_EARTH, c: C_EARTH };
const box = plotBox(900, 420);

assert.equal(lengthToUnit(MIN_LENGTH_M), 0);
assert.equal(lengthToUnit(MAX_LENGTH_M), 1);
assert.ok(Math.abs(unitToLength(0) - MIN_LENGTH_M) < 1e-12);
assert.ok(Math.abs(unitToLength(1) - MAX_LENGTH_M) < 1e-6);

// The axis is logarithmic, so equal ratios take equal space. This is what lets
// a transposition read as a rigid shift.
const oneOctave = lengthToUnit(2) - lengthToUnit(1);
for (const base of [0.05, 1, 1000, 1e6]) {
  assert.ok(Math.abs((lengthToUnit(base * 2) - lengthToUnit(base)) - oneOctave) < 1e-12,
    `an octave is not the same height at ${base} m`);
}

// Short pipes sit at the top, so higher pitch reads upward.
assert.ok(lengthToY(0.01, box) < lengthToY(1, box));
assert.ok(lengthToY(1, box) < lengthToY(1e6, box));
for (const m of [MIN_LENGTH_M, 0.5, 2.4384, 40000, MAX_LENGTH_M]) {
  const back = yToLength(lengthToY(m, box), box);
  assert.ok(Math.abs(back / m - 1) < 1e-9, `round trip lost ${m} m`);
}
assert.ok(lengthToY(MIN_LENGTH_M, box) >= box.y);
assert.ok(lengthToY(MAX_LENGTH_M, box) <= box.y + box.h);

// Out-of-range lengths clamp rather than leaving the plot.
assert.equal(lengthToUnit(1e-9), 0);
assert.equal(lengthToUnit(1e12), 1);

const spanS = 8;
assert.equal(timeToX(0, box, spanS), box.x);
assert.ok(Math.abs(timeToX(spanS, box, spanS) - (box.x + box.w)) < 1e-9);
assert.ok(Math.abs(xToTime(timeToX(3.25, box, spanS), box, spanS) - 3.25) < 1e-9);

assert.equal(finiteDuration({ startS: 2, durationS: 1 }, spanS), 1);
assert.equal(finiteDuration({ startS: 2, durationS: Infinity }, spanS), 6,
  'a voice with no release runs to the end of the timeline');

const decades = decadeLines();
assert.ok(decades.every(m => m >= MIN_LENGTH_M && m <= MAX_LENGTH_M));
assert.ok(decades.includes(1) && decades.includes(1000),
  'the metre and kilometre rules are drawn');

// The threshold lines are the two hearing bounds and the acoustic cutoff, as
// lengths. Each one must sit where a pipe of that length actually sounds.
const lines = thresholdLines(EARTH);
const floorLine = lines.find(l => l.label === '20 Hz floor');
assert.ok(Math.abs(pipeFundamentalHz(floorLine.lengthM, EARTH, 'open') - 20) < 1e-9);
const ceilingLine = lines.find(l => l.label === '20 kHz ceiling');
assert.ok(Math.abs(pipeFundamentalHz(ceilingLine.lengthM, EARTH, 'open') - 20000) < 1e-6);

// Hit testing.
const voices = [
  { lengthM: 2.4384, startS: 0, durationS: 3 },
  { lengthM: 100, startS: 1, durationS: 2 },
];
const bar = voices[0];
const barY = lengthToY(bar.lengthM, box);
const midX = timeToX(1.5, box, spanS);
assert.deepEqual(hitTest(midX, barY, voices, box, spanS), { index: 0, part: 'body' });
assert.equal(hitTest(midX, barY + BAR_HEIGHT, voices, box, spanS), null,
  'a point clear of the bar hits nothing');
assert.equal(hitTest(timeToX(5, box, spanS), barY, voices, box, spanS), null,
  'a point past the release hits nothing');

const endX = timeToX(bar.startS + bar.durationS, box, spanS);
assert.equal(hitTest(endX - 2, barY, voices, box, spanS).part, 'end',
  'the right edge is the resize grip');
assert.equal(hitTest(endX - EDGE_GRAB_PX - 4, barY, voices, box, spanS).part, 'body');

// Later voices win, so a bar dropped on another is the one you grab.
const stacked = [{ lengthM: 10, startS: 0, durationS: 4 }, { lengthM: 10, startS: 0, durationS: 4 }];
assert.equal(hitTest(timeToX(1, box, spanS), lengthToY(10, box), stacked, box, spanS).index, 1);

console.log('Roll view: log axis, octave invariance, round trips, thresholds, and hit testing pass.');
