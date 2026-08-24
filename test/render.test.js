/**
 * Checks src/render.js offline chunked rendering and progress callbacks.
 * Run: node test/render.test.js
 */

import { renderOffline } from '../src/render.js';
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

console.log('--- Offline Render Test ---');

async function testRender() {
  let progressCount = 0;

  const result = await renderOffline(
    {
      lengthM: 2.4384, // 8 ft pipe (~70.3 Hz)
      atm: EARTH,
      mode: 'open',
      sampleRate: 48000,
      bitDepth: 16,
      excitationType: 'impulse',
      interpolatorType: 'linear',
      lossFactor: 0.9995,
      renderMode: 'duration',
      durationSec: 0.1, // 0.1s = 4800 samples
      normalize: true,
    },
    (prog) => {
      progressCount++;
    }
  );

  assert('Render completed', result != null);
  assert('Progress callback called', progressCount > 0);
  assert('Total samples is 4800', result.totalSamples === 4800);
  assert('WAV bytes array created', result.wavBytes instanceof Uint8Array);
  assert('WAV byte length is 44 + 4800*2 = 9644', result.wavBytes.length === 9644);
  assert('Peak amplitude detected and > 0', result.peakAmplitude > 0);
  assert('Filename is formatted', result.filename.includes('2.44m'));

  console.log(`\n${ran - failed}/${ran} passed`);
  process.exit(failed === 0 ? 0 : 1);
}

testRender().catch((err) => {
  console.error(err);
  process.exit(1);
});
