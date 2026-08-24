/**
 * Checks src/wav.js for correct WAV/RIFF headers and sample encodings.
 * Run: node test/wav.test.js
 */

import { encodeWAV } from '../src/wav.js';

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

function readString(bytes, offset, length) {
  let str = '';
  for (let i = 0; i < length; i++) {
    str += String.fromCharCode(bytes[offset + i]);
  }
  return str;
}

console.log('--- WAV 16-bit PCM Header & Encoding ---');
{
  const samples = new Float64Array([0.0, 0.5, -0.5, 1.0, -1.0]);
  const sampleRate = 48000;
  const wavBytes = encodeWAV(samples, sampleRate, 16, false);
  const view = new DataView(wavBytes.buffer);

  assert('RIFF header magic', readString(wavBytes, 0, 4) === 'RIFF');
  assert('Total chunk size matches file', view.getUint32(4, true) === 36 + samples.length * 2);
  assert('WAVE format tag', readString(wavBytes, 8, 4) === 'WAVE');
  assert('fmt chunk tag', readString(wavBytes, 12, 4) === 'fmt ');
  assert('fmt size is 16', view.getUint32(16, true) === 16);
  assert('AudioFormat is 1 (PCM)', view.getUint16(20, true) === 1);
  assert('NumChannels is 1', view.getUint16(22, true) === 1);
  assert('SampleRate is 48000', view.getUint32(24, true) === 48000);
  assert('ByteRate is 96000', view.getUint32(28, true) === 48000 * 2);
  assert('BlockAlign is 2', view.getUint16(32, true) === 2);
  assert('BitsPerSample is 16', view.getUint16(34, true) === 16);
  assert('data chunk tag', readString(wavBytes, 36, 4) === 'data');
  assert('data size is 10 bytes', view.getUint32(40, true) === 10);
  assert('sample 0 encoded as 0', view.getInt16(44, true) === 0);
  assert('sample 1 (0.5) encoded near 16384', Math.abs(view.getInt16(46, true) - 16384) <= 1);
}

console.log('\n--- WAV 24-bit PCM Header & Encoding ---');
{
  const samples = new Float64Array([0.0, 0.5, -0.5]);
  const sampleRate = 44100;
  const wavBytes = encodeWAV(samples, sampleRate, 24, false);
  const view = new DataView(wavBytes.buffer);

  assert('24-bit AudioFormat is 1 (PCM)', view.getUint16(20, true) === 1);
  assert('24-bit BitsPerSample is 24', view.getUint16(34, true) === 24);
  assert('24-bit BlockAlign is 3', view.getUint16(32, true) === 3);
  assert('24-bit data size is 9 bytes', view.getUint32(40, true) === 9);
}

console.log('\n--- WAV 32-bit Float Header & Encoding ---');
{
  const samples = new Float64Array([0.0, 0.75, -0.25]);
  const sampleRate = 8000;
  const wavBytes = encodeWAV(samples, sampleRate, 32, false);
  const view = new DataView(wavBytes.buffer);

  assert('32-bit Float AudioFormat is 3 (IEEE Float)', view.getUint16(20, true) === 3);
  assert('32-bit BitsPerSample is 32', view.getUint16(34, true) === 32);
  assert('32-bit BlockAlign is 4', view.getUint16(32, true) === 4);
  assert('32-bit data size is 12 bytes', view.getUint32(40, true) === 12);
  assert('sample 1 float value exact 0.75', Math.abs(view.getFloat32(48, true) - 0.75) < 1e-6);
}

console.log(`\n${ran - failed}/${ran} passed`);
process.exit(failed === 0 ? 0 : 1);
