/**
 * The Unbounded Organ — polyphonic budget.
 *
 * A rank is several pipes sounding at once. Each one needs its own delay line,
 * and the allocation ceiling in `digital_medium.js` is a ceiling on the sum,
 * not on each. So polyphony is paid for in range: the longer the pipes, the
 * fewer of them fit, and the exchange rate is exact.
 *
 * Pure arithmetic, no DOM and no audio. Spec §4.4 extended to several pipes.
 */

import { MAX_SAFE_DELAY_SAMPLES, WAV_MAX_BYTES } from './digital_medium.js';
import { RING_PADDING_SAMPLES } from './waveguide.js';
import { pipeFundamentalHz, cutoffHz, HEARING_FLOOR_HZ, HEARING_CEILING_HZ } from './physics.js';

/** Bytes per delay-line sample. The ring buffer is a Float64Array. */
export const STATE_BYTES_PER_SAMPLE = 8;

/** A voice with nothing filled in. Lengths are metres, times seconds. */
export const VOICE_DEFAULTS = { lengthM: 1, mode: 'open', startS: 0, durationS: Infinity, gain: 1 };

export const withVoiceDefaults = voice => ({ ...VOICE_DEFAULTS, ...voice });

/** Round-trip transit time, which is what the delay line stores. */
export const roundTripS = (lengthM, atm) => (2 * lengthM) / atm.c;

/** Delay-line length for one voice, in samples. Fractional, as the physics is. */
export function voiceDelaySamples(voice, atm, sampleRate) {
  return roundTripS(withVoiceDefaults(voice).lengthM, atm) * sampleRate;
}

/**
 * The ring buffer this voice will actually allocate.
 *
 * `createWaveguide` floors the delay and adds interpolator padding, so the
 * exact transit time is not the number to test the ceiling against. Asking the
 * fractional question instead makes the boundary a floating-point coin toss:
 * sixty-one voices summing to exactly the ceiling came out a part in 10^15
 * over it, and were refused a pool they fit in.
 */
export function voiceAllocationSamples(voice, atm, sampleRate) {
  const delaySamples = voiceDelaySamples(voice, atm, sampleRate);
  return Math.max(1, Math.floor(delaySamples)) + RING_PADDING_SAMPLES;
}

/**
 * What a set of voices asks of the allocation ceiling.
 *
 * `fits` is the whole question: the voices are built up front, so a rank that
 * overruns the pool fails at the first allocation rather than part way through
 * a render.
 */
export function poolUsage(voices, atm, sampleRate) {
  const perVoice = voices.map(v => {
    const delaySamples = voiceDelaySamples(v, atm, sampleRate);
    const allocatedSamples = voiceAllocationSamples(v, atm, sampleRate);
    return {
      voice: withVoiceDefaults(v),
      delaySamples,
      allocatedSamples,
      stateBytes: allocatedSamples * STATE_BYTES_PER_SAMPLE,
      shareOfPool: allocatedSamples / MAX_SAFE_DELAY_SAMPLES,
    };
  });
  const totalDelaySamples = perVoice.reduce((a, v) => a + v.delaySamples, 0);
  const allocatedSamples = perVoice.reduce((a, v) => a + v.allocatedSamples, 0);
  return {
    perVoice,
    voiceCount: voices.length,
    totalDelaySamples,
    allocatedSamples,
    totalStateBytes: allocatedSamples * STATE_BYTES_PER_SAMPLE,
    poolSamples: MAX_SAFE_DELAY_SAMPLES,
    fits: allocatedSamples <= MAX_SAFE_DELAY_SAMPLES,
    headroomSamples: MAX_SAFE_DELAY_SAMPLES - allocatedSamples,
    fractionUsed: allocatedSamples / MAX_SAFE_DELAY_SAMPLES,
  };
}

/** Pool left for delay after every voice has taken its interpolator padding. */
const delayBudget = voiceCount =>
  MAX_SAFE_DELAY_SAMPLES - voiceCount * RING_PADDING_SAMPLES;

/** The highest rate at which this whole rank still fits. */
export function maxSampleRateForVoices(voices, atm) {
  const totalRoundTripS = voices.reduce(
    (a, v) => a + roundTripS(withVoiceDefaults(v).lengthM, atm), 0);
  if (!(totalRoundTripS > 0)) return Infinity;
  return delayBudget(voices.length) / totalRoundTripS;
}

/**
 * The unison case, which is the expensive one: `count` pipes of equal length
 * each get a `count`-th of the pool. Mixed registers cost far less, because
 * the pool is spent on the sum and a short pipe is nearly free beside a long
 * one. This is the number to quote when someone asks what polyphony costs.
 */
export function equalLengthCeiling(count, atm, sampleRate) {
  if (count <= 0 || !(sampleRate > 0)) return Infinity;
  return (delayBudget(count) * atm.c) / (2 * count * sampleRate);
}

/**
 * How many equal-length pipes of this length fit at this rate. Counted against
 * the buffer each one allocates, so the answer is exact rather than cautious.
 */
export function voiceCeilingAtLength(lengthM, atm, sampleRate) {
  const one = voiceAllocationSamples({ lengthM }, atm, sampleRate);
  if (!(one > 0)) return Infinity;
  return Math.floor(MAX_SAFE_DELAY_SAMPLES / one);
}

/** Wall-clock span the rank occupies, ring-down excluded. */
export function rankSpanS(voices) {
  let end = 0;
  for (const raw of voices) {
    const v = withVoiceDefaults(raw);
    const stop = Number.isFinite(v.durationS) ? v.startS + v.durationS : v.startS;
    if (stop > end) end = stop;
  }
  return end;
}

/**
 * The set-level regime report.
 *
 * With one pipe the console can name which threshold the fundamental missed
 * and by how much. With a rank there are as many answers as voices, so the
 * report counts them instead and names the extremes. This is the argument
 * Planetary Organs was making, which needed polyphony to be sayable.
 */
export function describeRank(voices, atm) {
  const cutoff = cutoffHz(atm);
  const entries = voices.map((raw, index) => {
    const v = withVoiceDefaults(raw);
    const hz = pipeFundamentalHz(v.lengthM, atm, v.mode);
    return {
      index,
      voice: v,
      hz,
      audible: hz >= HEARING_FLOOR_HZ && hz <= HEARING_CEILING_HZ,
      propagates: hz >= cutoff,
      octavesBelowFloor: hz > 0 ? Math.log2(HEARING_FLOOR_HZ / hz) : Infinity,
    };
  });
  const audible = entries.filter(e => e.audible).length;
  const propagating = entries.filter(e => e.propagates).length;
  const sorted = [...entries].sort((a, b) => a.hz - b.hz);
  return {
    entries,
    cutoffHz: cutoff,
    voiceCount: entries.length,
    audible,
    inaudible: entries.length - audible,
    propagating,
    forced: entries.length - propagating,
    lowest: sorted[0] ?? null,
    highest: sorted[sorted.length - 1] ?? null,
  };
}

/**
 * Transpose every voice by a common ratio. On a logarithmic length axis this
 * is a rigid shift, and the count it returns is the point of the control: it
 * says how many voices the shift throws out of hearing.
 */
export function transposeRank(voices, ratio, atm) {
  const before = describeRank(voices, atm);
  const moved = voices.map(raw => {
    const v = withVoiceDefaults(raw);
    return { ...v, lengthM: v.lengthM * ratio };
  });
  const after = describeRank(moved, atm);
  return {
    voices: moved,
    lostAudible: Math.max(0, before.audible - after.audible),
    gainedAudible: Math.max(0, after.audible - before.audible),
    lostPropagating: Math.max(0, before.propagating - after.propagating),
    before,
    after,
  };
}

/**
 * Quote a polyphonic render before it starts: the pool, the file, and whether
 * both fit. Mirrors `quoteRenderCost` for the single-pipe path.
 */
export function quotePolyphonicRender({ voices, atm, sampleRate, bitDepth, durationSec }) {
  const pool = poolUsage(voices, atm, sampleRate);
  const bytesPerSample = bitDepth / 8;
  const totalSamples = Math.ceil(durationSec * sampleRate);
  const totalFileSizeBytes = 44 + totalSamples * bytesPerSample;
  const exceedsWavLimit = totalFileSizeBytes > WAV_MAX_BYTES + 44;
  return {
    pool,
    rank: describeRank(voices, atm),
    totalSamples,
    totalDurationS: durationSec,
    totalFileSizeBytes,
    exceedsWavLimit,
    canRender: pool.fits && !exceedsWavLimit && totalSamples > 0,
  };
}

/**
 * Find a rate and a duration that render this rank, and say what each step
 * cost. Same contract as `planRenderRoute`: degrade resolution or duration,
 * never substitute a different computation.
 */
export function planPolyphonicRoute(req) {
  const { voices, atm, bitDepth, durationSec } = req;
  const steps = [];
  let sampleRate = req.sampleRate;
  let duration = durationSec;

  const maxRate = maxSampleRateForVoices(voices, atm);
  if (sampleRate > maxRate) {
    const fitted = Math.max(1e-6, Math.floor(maxRate));
    steps.push({
      kind: 'sampleRate',
      from: sampleRate,
      to: fitted,
      why: `${voices.length} delay lines need `
        + `${MAX_SAFE_DELAY_SAMPLES.toLocaleString()} samples between them`,
      cost: `band drops to ${(fitted / 2).toLocaleString(undefined, { maximumFractionDigits: 1 })} Hz`,
    });
    sampleRate = fitted;
  }

  let quote = quotePolyphonicRender({ voices, atm, sampleRate, bitDepth, durationSec: duration });
  if (quote.exceedsWavLimit) {
    const safeDurationS = (WAV_MAX_BYTES / (sampleRate * (bitDepth / 8))) * 0.999;
    steps.push({
      kind: 'duration',
      from: duration,
      to: safeDurationS,
      why: 'the file exceeds the 4 GiB RIFF field',
      cost: `renders ${(safeDurationS / duration * 100).toFixed(2)}% of the rank`,
    });
    duration = safeDurationS;
    quote = quotePolyphonicRender({ voices, atm, sampleRate, bitDepth, durationSec: duration });
  }

  return {
    needed: steps.length > 0,
    canRender: quote.canRender,
    sampleRate,
    durationSec: duration,
    steps,
    quote,
  };
}
