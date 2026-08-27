/**
 * The Unbounded Organ — Digital Medium analysis.
 *
 * The digital medium is a second atmosphere with its own parameters:
 * sample rate (fs) and bit depth.
 *
 * Spec §4.4, §5, §5.1.
 */

import { pipeFundamentalHz, cutoffHz } from './physics.js';

export const WAV_MAX_BYTES = 4294967252; // 4 GiB - 44 bytes header
// 2^27 samples = 1 GiB as Float64Array, which is the ring buffer's type.
// NOT 2^28: measured in-browser, a 2 GB Float64Array throws RangeError
// ("Array buffer allocation failed") on a 16 GB machine, so the old ceiling
// named a size the instrument could never actually reach — it would have
// offered a route that then failed to allocate. 2^27 allocates in ~2 ms.
export const MAX_SAFE_DELAY_SAMPLES = 134217728;

/** Standard sample rate presets. */
export const SAMPLE_RATE_PRESETS = [
  { value: 48000, label: '48 kHz (Standard audio)' },
  { value: 44100, label: '44.1 kHz (CD)' },
  { value: 8000, label: '8 kHz (Telephony)' },
  { value: 1000, label: '1 kHz (Audio band to 500 Hz)' },
  { value: 100, label: '100 Hz (Infrasound band to 50 Hz)' },
  { value: 10, label: '10 Hz (Sub-audio band to 5 Hz)' },
  { value: 1, label: '1 Hz (Ultra-low frequency to 0.5 Hz)' },
  { value: 0.1, label: '0.1 Hz (Ultra-low band to 0.05 Hz)' },
];

/** Bit depth choices. */
export const BIT_DEPTH_OPTIONS = [
  { value: 16, label: '16-bit PCM (Standard CD dynamic range)' },
  { value: 24, label: '24-bit PCM (Studio resolution)' },
  { value: 32, label: '32-bit Float (IEEE 754 float)' },
];

/**
 * Classify the categorical state of the output.
 * Spec §0, §3.
 *
 * - 'note': f1 >= 20 Hz. Modes are sparse and in the audible range; distinct pitch percept.
 * - 'echo': f1 < 20 Hz and period < 1 hour. Dense mode structure, diffuse echo response.
 * - 'drift': period >= 1 hour (f1 <= 2.77e-4 Hz). Single cycle takes hours; continuous slow drift.
 */
export function classifyCategory(f1Hz) {
  if (f1Hz >= 20) return 'note';
  const periodS = 1 / f1Hz;
  if (periodS < 3600) return 'echo';
  return 'drift';
}

/**
 * Compute digital medium and representation metrics for a pipe and medium settings.
 */
export function describeDigitalMedium(lengthM, atm, mode, sampleRate, bitDepth) {
  const f1 = pipeFundamentalHz(lengthM, atm, mode);
  const periodS = 1 / f1;
  const roundTripTimeS = (2 * lengthM) / atm.c;
  const delaySamples = roundTripTimeS * sampleRate;
  
  const nyquistHz = sampleRate / 2;
  const bytesPerSample = bitDepth / 8;
  
  // Highest harmonic mode within Nyquist
  const highestMode = f1 > 0 ? Math.floor(nyquistHz / f1) : 0;
  
  // Modes below 20 Hz
  const modesBelow20Hz = f1 > 0 ? Math.floor(20 / f1) : 0;
  
  // State memory required for the delay line (Float64 internal simulation)
  const stateSizeBytes = delaySamples * 8;
  const stateAllocatable = delaySamples <= MAX_SAFE_DELAY_SAMPLES;
  
  // WAV file capacity
  const wavMaxDurationS = WAV_MAX_BYTES / (sampleRate * bytesPerSample);
  const wavMaxCycles = f1 > 0 ? wavMaxDurationS * f1 : 0;
  
  const category = classifyCategory(f1);

  return {
    sampleRate,
    bitDepth,
    bytesPerSample,
    nyquistHz,
    roundTripTimeS,
    delaySamples,
    delayIntSamples: Math.floor(delaySamples),
    delayFraction: delaySamples - Math.floor(delaySamples),
    highestMode,
    modesBelow20Hz,
    stateSizeBytes,
    stateAllocatable,
    wavMaxDurationS,
    wavMaxCycles,
    category,
  };
}

/**
 * Quotation of render cost and limits before starting an offline run.
 */
export function quoteRenderCost({
  lengthM,
  atm,
  mode,
  sampleRate,
  bitDepth,
  renderMode, // 'duration' or 'cycles'
  durationSec,
  cycleCount,
}) {
  const medium = describeDigitalMedium(lengthM, atm, mode, sampleRate, bitDepth);
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
  const payloadBytes = totalSamples * medium.bytesPerSample;
  const totalFileSizeBytes = 44 + payloadBytes;
  const exceedsWavLimit = totalFileSizeBytes > (WAV_MAX_BYTES + 44);

  // Playback feasibility check:
  // Playback hardware is AC-coupled (HPF ~2-20 Hz) and Web Audio context default sample rates are 44.1/48 kHz.
  const isAudibleBand = f1 >= 20 && f1 <= 20000;
  const playbackFeasible = isAudibleBand && sampleRate >= 8000 && totalDurationS < 60;

  return {
    medium,
    totalDurationS,
    totalCycles,
    totalSamples,
    totalFileSizeBytes,
    exceedsWavLimit,
    stateAllocatable: medium.stateAllocatable,
    playbackFeasible,
    canRender: medium.stateAllocatable && !exceedsWavLimit,
  };
}

/**
 * The highest sample rate whose delay line still fits in the allocation
 * ceiling, for this pipe. Spec: the sample rate is a control, not a constant.
 */
export function maxSampleRateFor(lengthM, atm) {
  const roundTripTimeS = (2 * lengthM) / atm.c;
  if (!(roundTripTimeS > 0)) return Infinity;
  return MAX_SAFE_DELAY_SAMPLES / roundTripTimeS;
}

/**
 * Is rendering this pipe an override?
 *
 * True when the fundamental falls below the atmosphere's acoustic cutoff, so
 * the medium would not carry it. The instrument still renders — forcing the
 * boundary exhibits it rather than defeating it — but the control says so.
 */
export function isForced(lengthM, atm, mode) {
  return pipeFundamentalHz(lengthM, atm, mode) < cutoffHz(atm);
}

/**
 * Find a route that renders, when the requested settings cannot.
 *
 * The instrument never dead-ends: it degrades **resolution** (sample rate) or
 * **duration** (fraction of a cycle) and says what that cost, because both
 * leave the waveguide running. It never substitutes a different computation —
 * a sine at c/2L would produce a plausible file and is the one forbidden move.
 *
 * Returns { needed, sampleRate, renderMode, durationSec, cycleCount, steps }
 * where `steps` names each degradation applied, in order.
 */
export function planRenderRoute(req) {
  const { lengthM, atm, mode } = req;
  const steps = [];
  let sampleRate = req.sampleRate;
  let renderMode = req.renderMode;
  let durationSec = req.durationSec;
  let cycleCount = req.cycleCount;

  // 1. Make the delay line fit by lowering the rate.
  const maxRate = maxSampleRateFor(lengthM, atm);
  if (sampleRate > maxRate) {
    const fitted = Math.max(1e-6, Math.floor(maxRate));
    steps.push({
      kind: 'sampleRate',
      from: sampleRate,
      to: fitted,
      why: `the delay line needs ${MAX_SAFE_DELAY_SAMPLES.toLocaleString()} samples or fewer`,
      cost: `band drops to ${(fitted / 2).toLocaleString(undefined, { maximumFractionDigits: 1 })} Hz`,
    });
    sampleRate = fitted;
  }

  // 2. Make the file fit by shortening it.
  let quote = quoteRenderCost({ ...req, sampleRate, renderMode, durationSec, cycleCount });
  if (quote.exceedsWavLimit) {
    const f1 = pipeFundamentalHz(lengthM, atm, mode);
    const maxDurationS = WAV_MAX_BYTES / (sampleRate * (req.bitDepth / 8));
    const safeDurationS = maxDurationS * 0.999;
    const fractionOfCycle = f1 > 0 ? safeDurationS * f1 : 0;
    steps.push({
      kind: 'duration',
      from: quote.totalDurationS,
      to: safeDurationS,
      why: 'the file exceeds the 4 GiB RIFF field',
      cost: `renders ${fractionOfCycle.toFixed(4)} of one cycle`,
    });
    renderMode = 'duration';
    durationSec = safeDurationS;
    quote = quoteRenderCost({ ...req, sampleRate, renderMode, durationSec, cycleCount });
  }

  return {
    needed: steps.length > 0,
    canRender: quote.canRender,
    sampleRate,
    renderMode,
    durationSec,
    cycleCount,
    steps,
    quote,
  };
}
