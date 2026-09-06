/**
 * The Unbounded Organ — Offline Non-Realtime Renderer.
 *
 * Spec §4.5:
 * The render must be the waveguide actually running.
 * Partial renders are first-class.
 * Non-blocking chunked processing with progress callbacks and cancellation.
 */

import { createWaveguide } from './waveguide.js';
import { encodeWAV } from './wav.js';
import { pipeFundamentalHz } from './physics.js';
import { withVoiceDefaults, poolUsage, describeRank, rankSpanS } from './polyphony.js';

/**
 * Render a waveguide offline into a WAV buffer.
 *
 * @param {Object} options Configuration options
 * @param {Function} [onProgress] Progress callback: (progressInfo) => void
 * @param {AbortSignal} [signal] Optional abort signal for cancellation
 * @returns {Promise<Object>} Render result with WAV blob, URL, and metadata
 */
export async function renderOffline(options, onProgress, signal) {
  const {
    lengthM,
    atm,
    mode = 'open',
    sampleRate = 48000,
    bitDepth = 16,
    excitationType = 'impulse',
    excitationDurationS = 0.005,
    excitationGain = 0.8,
    interpolatorType = 'linear',
    lossFactor = 0.9995,
    renderMode = 'duration', // 'duration' or 'cycles'
    durationSec = 2.0,
    cycleCount = 1.0,
    normalize = true,
  } = options;

  const f1 = pipeFundamentalHz(lengthM, atm, mode);
  const periodS = 1 / f1;

  let totalDurationS = 0;
  let totalCycles = 0;

  if (renderMode === 'cycles') {
    totalCycles = cycleCount;
    totalDurationS = cycleCount * periodS;
  } else {
    totalDurationS = durationSec;
    totalCycles = f1 > 0 ? durationSec / periodS : 0;
  }

  const totalSamples = Math.ceil(totalDurationS * sampleRate);
  if (totalSamples <= 0) {
    throw new Error('Total render samples must be greater than zero.');
  }

  // Instantiate the waveguide
  const waveguide = createWaveguide({
    lengthM,
    atm,
    mode,
    sampleRate,
    excitationType,
    excitationDurationS,
    excitationGain,
    interpolatorType,
    lossFactor,
  });

  const outputSamples = new Float64Array(totalSamples);
  const chunkSize = 131072; // 128k samples per chunk
  let renderedSamples = 0;
  const startTime = performance.now();

  while (renderedSamples < totalSamples) {
    if (signal && signal.aborted) {
      throw new DOMException('Render aborted by user', 'AbortError');
    }

    const currentCount = Math.min(chunkSize, totalSamples - renderedSamples);
    waveguide.processBlock(outputSamples, renderedSamples, currentCount);
    renderedSamples += currentCount;

    const elapsedMs = performance.now() - startTime;
    const progressFraction = renderedSamples / totalSamples;
    const estimatedTotalMs = progressFraction > 0 ? elapsedMs / progressFraction : 0;
    const estimatedRemainingMs = Math.max(0, estimatedTotalMs - elapsedMs);

    if (onProgress) {
      onProgress({
        renderedSamples,
        totalSamples,
        progressFraction,
        percent: progressFraction * 100,
        elapsedMs,
        estimatedRemainingMs,
      });
    }

    // Yield control to UI thread
    if (renderedSamples < totalSamples) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  // Peak amplitude measurement
  let peak = 0;
  for (let i = 0; i < totalSamples; i++) {
    const abs = Math.abs(outputSamples[i]);
    if (abs > peak) peak = abs;
  }

  // Encode to WAV binary
  const wavBytes = encodeWAV(outputSamples, sampleRate, bitDepth, normalize);
  const blob = new Blob([wavBytes], { type: 'audio/wav' });
  const downloadUrl = URL.createObjectURL(blob);

  const filename = `unbounded-organ_${mode}_${formatLengthForFilename(lengthM)}_${sampleRate}Hz_${bitDepth}bit.wav`;

  return {
    wavBytes,
    blob,
    downloadUrl,
    filename,
    samples: outputSamples,
    totalSamples,
    totalDurationS,
    totalCycles,
    f1,
    periodS,
    peakAmplitude: peak,
    sampleRate,
    bitDepth,
  };
}

/**
 * Render a rank of pipes offline into one WAV buffer.
 *
 * Every voice is a waveguide of its own, built before the first sample so a
 * rank that overruns the allocation ceiling fails here rather than part way
 * through. The pipes are summed, which is the only mixing there is: they share
 * one air. Same chunking, progress and cancellation contract as
 * `renderOffline`.
 */
export async function renderRank(options, onProgress, signal) {
  const {
    voices: rawVoices,
    atm,
    sampleRate = 48000,
    bitDepth = 16,
    excitationType = 'impulse',
    excitationDurationS = 0.005,
    excitationGain = 0.8,
    interpolatorType = 'linear',
    lossFactor = 0.9995,
    durationSec,
    normalize = true,
  } = options;

  const voices = rawVoices.map(withVoiceDefaults);
  if (voices.length === 0) throw new Error('A rank needs at least one voice.');

  const pool = poolUsage(voices, atm, sampleRate);
  if (!pool.fits) {
    throw new Error(
      `The rank's ${voices.length} delay lines need `
      + `${Math.round(pool.totalDelaySamples).toLocaleString()} samples between them, over the `
      + `${pool.poolSamples.toLocaleString()} sample ceiling. Lower the sample rate or shorten the pipes.`
    );
  }

  const totalDurationS = durationSec ?? rankSpanS(voices);
  const totalSamples = Math.ceil(totalDurationS * sampleRate);
  if (totalSamples <= 0) throw new Error('Total render samples must be greater than zero.');

  // Built up front, so the allocation the quote named is the allocation made.
  const built = voices.map(v => ({
    voice: v,
    startSample: Math.max(0, Math.round(v.startS * sampleRate)),
    waveguide: createWaveguide({
      lengthM: v.lengthM,
      atm,
      mode: v.mode,
      sampleRate,
      excitationType,
      excitationDurationS,
      excitationGain,
      interpolatorType,
      lossFactor,
      sustainSamples: Number.isFinite(v.durationS)
        ? Math.max(1, Math.round(v.durationS * sampleRate))
        : Infinity,
    }),
  }));

  const outputSamples = new Float64Array(totalSamples);
  const chunkSize = 131072;
  let renderedSamples = 0;
  const startTime = performance.now();

  while (renderedSamples < totalSamples) {
    if (signal && signal.aborted) {
      throw new DOMException('Render aborted by user', 'AbortError');
    }

    const chunkStart = renderedSamples;
    const currentCount = Math.min(chunkSize, totalSamples - renderedSamples);
    const chunkEnd = chunkStart + currentCount;

    for (const v of built) {
      // A voice contributes nothing before its onset, and is not stepped then
      // either, so its ring-down starts when the pallet opens and not before.
      const from = Math.max(chunkStart, v.startSample);
      if (from >= chunkEnd) continue;
      v.waveguide.mixBlock(outputSamples, from, chunkEnd - from, v.voice.gain);
    }

    renderedSamples = chunkEnd;

    const elapsedMs = performance.now() - startTime;
    const progressFraction = renderedSamples / totalSamples;
    if (onProgress) {
      onProgress({
        renderedSamples,
        totalSamples,
        progressFraction,
        percent: progressFraction * 100,
        elapsedMs,
        estimatedRemainingMs: Math.max(0, (elapsedMs / progressFraction) - elapsedMs),
      });
    }

    if (renderedSamples < totalSamples) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  let peak = 0;
  for (let i = 0; i < totalSamples; i++) {
    const abs = Math.abs(outputSamples[i]);
    if (abs > peak) peak = abs;
  }

  const wavBytes = encodeWAV(outputSamples, sampleRate, bitDepth, normalize);
  const blob = new Blob([wavBytes], { type: 'audio/wav' });
  const downloadUrl = URL.createObjectURL(blob);
  const filename = `unbounded-organ_rank${voices.length}_${sampleRate}Hz_${bitDepth}bit.wav`;

  return {
    wavBytes,
    blob,
    downloadUrl,
    filename,
    samples: outputSamples,
    totalSamples,
    totalDurationS,
    voices,
    pool,
    rank: describeRank(voices, atm),
    silentVoices: built.filter(v => v.startSample >= totalSamples).length,
    peakAmplitude: peak,
    sampleRate,
    bitDepth,
  };
}

function formatLengthForFilename(m) {
  if (m < 0.01) return `${(m * 1000).toFixed(1)}mm`;
  if (m < 1) return `${(m * 100).toFixed(1)}cm`;
  if (m < 1000) return `${m.toFixed(2)}m`;
  return `${(m / 1000).toFixed(2)}km`;
}
