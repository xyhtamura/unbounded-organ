import assert from 'node:assert/strict';
import { cameraSpan, REFERENCES } from '../src/scale-view.js';

assert.equal(cameraSpan(2, 4), 4, 'Keep the camera still inside its framing band');
assert.ok(cameraSpan(4, 4) > 4, 'Pull back when the pipe reaches the frame edge');
assert.ok(cameraSpan(.1, 4) < 4, 'Move in after substantial contraction');
assert.equal(cameraSpan(40075000, 4, true), 4, 'Lock survives a planetary jump');
// Every allowed length must retain a visible dimensioned reference at phone size.
for (let i = 0; i <= 1000; i++) {
  const length = .008575 * (40075000 / .008575) ** (i / 1000);
  const span = cameraSpan(length);
  const pixelsPerMetre = 196 / span;
  assert.ok(REFERENCES.some(r => r.height * pixelsPerMetre >= 2 && r.height * pixelsPerMetre <= 196 * 1.15), `No reference at ${length} m`);
}
console.log('Scale view: camera thresholds, lock, and 1,001 reference coverage cases pass.');
