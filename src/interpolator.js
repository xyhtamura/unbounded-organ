/**
 * The Unbounded Organ — Interpolator & Fractional Delay Analysis.
 *
 * Spec §4.7:
 * An ideal fractional delay gives every frequency the same delay. A real
 * interpolator does not, so each mode sees a slightly different effective pipe
 * length, and the mode series comes out inharmonic by an amount the interpolator
 * decides.
 *
 * This module implements the fractional delay interpolators and directly
 * measures their frequency-dependent phase delay and the resulting mode
 * inharmonicity.
 */

import { pipeFundamentalHz } from './physics.js';

export const INTERPOLATOR_TYPES = [
  { id: 'linear', name: 'Linear (2-point FIR)', order: 1 },
  { id: 'lagrange3', name: 'Lagrange (4-point cubic FIR)', order: 3 },
  { id: 'thiran1', name: 'Thiran Allpass (1st-order IIR)', order: 1 },
  { id: 'none', name: 'Nearest integer (no interpolation, 0-order)', order: 0 },
];

/**
 * Compute the complex frequency response H(e^{j omega}) of the fractional part of an interpolator.
 * omega is normalized angular frequency in radians/sample: omega = 2 * pi * (f / fs).
 * d is the fractional delay in [0, 1).
 */
export function interpolatorResponse(type, d, omega) {
  if (omega === 0) return { re: 1, im: 0, mag: 1, phase: 0 };
  
  if (type === 'none') {
    const effD = Math.round(d);
    const phase = -effD * omega;
    return { re: Math.cos(phase), im: Math.sin(phase), mag: 1, phase };
  }

  if (type === 'linear') {
    // H(z) = (1 - d) + d * z^-1
    const re = (1 - d) + d * Math.cos(omega);
    const im = -d * Math.sin(omega);
    const mag = Math.hypot(re, im);
    const phase = Math.atan2(im, re);
    return { re, im, mag, phase };
  }

  if (type === 'lagrange3') {
    const h_m1 = (-d * (d - 1) * (d - 2)) / 6;
    const h_0  = ((d + 1) * (d - 1) * (d - 2)) / 2;
    const h_1  = (-(d + 1) * d * (d - 2)) / 2;
    const h_2  = ((d + 1) * d * (d - 1)) / 6;

    const re = h_m1 * Math.cos(omega) + h_0 + h_1 * Math.cos(omega) + h_2 * Math.cos(2 * omega);
    const im = h_m1 * Math.sin(omega) - h_1 * Math.sin(omega) - h_2 * Math.sin(2 * omega);
    const mag = Math.hypot(re, im);
    const phase = Math.atan2(im, re);
    return { re, im, mag, phase };
  }

  if (type === 'thiran1') {
    const a = (1 - d) / (1 + d);
    const numRe = a + Math.cos(omega);
    const numIm = -Math.sin(omega);
    const denRe = 1 + a * Math.cos(omega);
    const denIm = -a * Math.sin(omega);

    const numPhase = Math.atan2(numIm, numRe);
    const denPhase = Math.atan2(denIm, denRe);
    let phase = numPhase - denPhase;
    while (phase > 0) phase -= 2 * Math.PI;
    return { re: Math.cos(phase), im: Math.sin(phase), mag: 1, phase };
  }

  const phase = -d * omega;
  return { re: Math.cos(phase), im: Math.sin(phase), mag: 1, phase };
}

/**
 * Measure the realised phase delay (in samples) of the interpolator at normalized frequency f/fs.
 */
export function measurePhaseDelay(type, intDelaySamples, fracDelay, normFreq) {
  if (normFreq <= 1e-9) return intDelaySamples + fracDelay;
  const omega = 2 * Math.PI * normFreq;
  const resp = interpolatorResponse(type, fracDelay, omega);
  
  let tauFrac = -resp.phase / omega;
  while (tauFrac < 0) tauFrac += (2 * Math.PI) / omega;
  
  return intDelaySamples + tauFrac;
}

/**
 * Analyze mode series deviation (inharmonicity) for a pipe and sample rate under the active interpolator.
 */
export function analyzeModeDeviations({
  lengthM,
  atm,
  mode = 'open',
  sampleRate = 48000,
  interpolatorType = 'linear',
  maxModes = 16,
}) {
  const f1 = pipeFundamentalHz(lengthM, atm, mode);
  const roundTripTimeS = (2 * lengthM) / atm.c;
  const totalDelaySamples = roundTripTimeS * sampleRate;
  const intDelay = Math.floor(totalDelaySamples);
  const fracDelay = totalDelaySamples - intDelay;
  
  const nyquistHz = sampleRate / 2;
  const step = mode === 'stopped' ? 2 : 1;
  const maxAvailModes = f1 > 0 ? Math.floor(nyquistHz / f1) : 0;
  const count = Math.min(maxModes, Math.max(1, maxAvailModes));

  const modes = [];
  let sumSqDev = 0;
  let maxAbsDev = 0;

  for (let i = 0; i < count; i++) {
    const n = 1 + i * step;
    const targetHz = n * f1;
    if (targetHz >= nyquistHz) break;

    const normFreq = targetHz / sampleRate;
    const realisedDelaySamples = measurePhaseDelay(interpolatorType, intDelay, fracDelay, normFreq);
    
    // Mode frequency is inversely proportional to realised round-trip delay
    const realisedHz = targetHz * (totalDelaySamples / realisedDelaySamples);
    const fractionalDeviation = (realisedHz - targetHz) / targetHz;

    sumSqDev += fractionalDeviation * fractionalDeviation;
    if (Math.abs(fractionalDeviation) > maxAbsDev) {
      maxAbsDev = Math.abs(fractionalDeviation);
    }

    modes.push({
      n,
      targetHz,
      realisedHz,
      realisedDelaySamples,
      fractionalDeviation,
      percentDeviation: fractionalDeviation * 100,
    });
  }

  const rmsDeviation = modes.length > 0 ? Math.sqrt(sumSqDev / modes.length) : 0;

  return {
    interpolatorType,
    totalDelaySamples,
    intDelay,
    fracDelay,
    f1,
    modes,
    rmsDeviation,
    maxAbsDev,
    percentRms: rmsDeviation * 100,
    percentMax: maxAbsDev * 100,
  };
}
