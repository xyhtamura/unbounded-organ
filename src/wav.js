/**
 * The Unbounded Organ — Pure JavaScript WAV/RIFF builder.
 *
 * Supports 16-bit PCM, 24-bit PCM, and 32-bit IEEE float formats.
 * Enforces the 4 GiB RIFF 32-bit container boundary.
 */

import { WAV_MAX_BYTES } from './digital_medium.js';

/**
 * Encode an audio buffer of Float64 or Float32 samples into a standard WAV Uint8Array.
 *
 * @param {ArrayLike<number>} samples Float samples in [-1.0, 1.0]
 * @param {number} sampleRate Sample rate in Hz
 * @param {number} bitDepth 16, 24, or 32 (32 = IEEE float)
 * @param {boolean} normalize If true, scale peak to 0.95
 * @returns {Uint8Array} Binary WAV buffer
 */
export function encodeWAV(samples, sampleRate, bitDepth = 16, normalize = true) {
  const numSamples = samples.length;
  const numChannels = 1;
  const bytesPerSample = bitDepth / 8;
  const dataSize = numSamples * numChannels * bytesPerSample;

  if (dataSize > WAV_MAX_BYTES) {
    throw new Error(
      `WAV data size (${(dataSize / (1024 * 1024 * 1024)).toFixed(2)} GiB) exceeds the 4 GiB 32-bit RIFF field limit.`
    );
  }

  const isFloat = bitDepth === 32;
  const audioFormat = isFloat ? 3 : 1; // 1 = PCM, 3 = IEEE Float
  const headerSize = 44;
  const totalFileSize = headerSize + dataSize;

  const buffer = new ArrayBuffer(totalFileSize);
  const view = new DataView(buffer);

  // RIFF Chunk Descriptor
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true); // ChunkSize
  writeString(view, 8, 'WAVE');

  // fmt sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for standard PCM/float)
  view.setUint16(20, audioFormat, true); // AudioFormat
  view.setUint16(22, numChannels, true); // NumChannels
  view.setUint32(24, Math.round(sampleRate), true); // SampleRate
  view.setUint32(28, Math.round(sampleRate * numChannels * bytesPerSample), true); // ByteRate
  view.setUint16(32, numChannels * bytesPerSample, true); // BlockAlign
  view.setUint16(34, bitDepth, true); // BitsPerSample

  // data sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true); // Subchunk2Size

  // Peak detection for normalization
  let peak = 0;
  for (let i = 0; i < numSamples; i++) {
    const abs = Math.abs(samples[i]);
    if (abs > peak) peak = abs;
  }

  const scale = normalize && peak > 1e-6 ? 0.95 / peak : 1.0;

  let offset = headerSize;

  if (bitDepth === 16) {
    for (let i = 0; i < numSamples; i++) {
      let s = samples[i] * scale;
      if (s < -1) s = -1;
      if (s > 1) s = 1;
      const intVal = s < 0 ? Math.round(s * 32768) : Math.round(s * 32767);
      view.setInt16(offset, intVal, true);
      offset += 2;
    }
  } else if (bitDepth === 24) {
    for (let i = 0; i < numSamples; i++) {
      let s = samples[i] * scale;
      if (s < -1) s = -1;
      if (s > 1) s = 1;
      const intVal = s < 0 ? Math.round(s * 8388608) : Math.round(s * 8388607);
      // 24-bit little endian: low, mid, high byte
      view.setUint8(offset, intVal & 0xff);
      view.setUint8(offset + 1, (intVal >> 8) & 0xff);
      view.setUint8(offset + 2, (intVal >> 16) & 0xff);
      offset += 3;
    }
  } else if (bitDepth === 32) {
    for (let i = 0; i < numSamples; i++) {
      view.setFloat32(offset, samples[i] * scale, true);
      offset += 4;
    }
  } else {
    throw new Error(`Unsupported bit depth: ${bitDepth}`);
  }

  return new Uint8Array(buffer);
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}
