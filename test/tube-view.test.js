import assert from 'node:assert/strict';
import {
  modeWavenumber, modeEnvelope, nodePositions, clampTilt, ringPoint,
  drawTube, TILT_MIN, TILT_MAX,
} from '../src/tube-view.js';

// Boundary conditions. The mouth is a pressure node either way; a stopped cap
// is an antinode, an open cap a node.
assert.equal(modeEnvelope('open', 1, 0), 0);
assert.ok(Math.abs(modeEnvelope('open', 1, 1)) < 1e-12);
assert.equal(modeEnvelope('open', 1, .5), 1);
assert.equal(modeEnvelope('stopped', 1, 0), 0);
assert.ok(Math.abs(modeEnvelope('stopped', 1, 1) - 1) < 1e-12);
assert.equal(modeWavenumber('stopped', 2), 1.5, 'Stopped modes are odd half-integers');

assert.deepEqual(nodePositions('open', 1), [], 'The fundamental has no interior node');
assert.deepEqual(nodePositions('open', 2), [.5]);
assert.deepEqual(nodePositions('stopped', 1), []);
assert.ok(Math.abs(nodePositions('stopped', 2)[0] - 2 / 3) < 1e-12);

assert.equal(clampTilt(0), TILT_MIN);
assert.equal(clampTilt(9), TILT_MAX);
assert.equal(clampTilt(.3), .3);

// A feature edge-on has no width; one facing the viewer has all of it.
assert.ok(Math.abs(ringPoint(0, 10, .3, 0).face) < 1e-12);
assert.ok(Math.abs(ringPoint(0, 10, .3, Math.PI / 2).face - 1) < 1e-12);
assert.equal(ringPoint(0, 10, .3, Math.PI / 2).front, true);
assert.equal(ringPoint(0, 10, .3, -Math.PI / 2).front, false);

// The length axis must not move when the pipe is turned, or the panel's shared
// metre-to-pixel scale would depend on the camera.
function recordingContext() {
  const ellipses = [];
  const noop = () => {};
  const gradient = { addColorStop: noop };
  return {
    ellipses,
    ellipse: (x, y, rx, ry) => ellipses.push({ x, y, rx, ry }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    save: noop, restore: noop, translate: noop, scale: noop,
    beginPath: noop, moveTo: noop, lineTo: noop, fill: noop, stroke: noop,
    fillRect: noop, arc: noop,
  };
}
const base = 300, height = 180, geometry = { x: 100, base, height, radius: 14, mode: 'open' };
for (const spin of [0, 1, 2.4, -3.1]) {
  for (const tilt of [TILT_MIN, .26, TILT_MAX]) {
    const ctx = recordingContext();
    drawTube(ctx, { ...geometry, spin, tilt });
    assert.ok(ctx.ellipses.some(e => e.y === base - height && e.rx === geometry.radius),
      `No cap at the pipe's top for spin ${spin}, tilt ${tilt}`);
    // The widest mark is the ground shadow at 1.5x the envelope radius.
    assert.ok(ctx.ellipses.every(e => e.rx <= geometry.radius * 2.4 * 1.5 + 1e-9),
      'The drawing stays inside its horizontal footprint');
  }
}
console.log('Tube view: boundary conditions, node positions, tilt clamp, facing, and 12 rotation-invariance cases pass.');
