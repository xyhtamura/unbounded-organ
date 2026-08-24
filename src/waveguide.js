/**
 * The Unbounded Organ — Digital Waveguide Resonator Engine.
 *
 * Spec §4.3:
 * A 1D digital delay line of physical transit round-trip tau_loop = 2L/c.
 * Boundary reflections:
 *   - Open pipe: r1 = -1, r2 = -1 => loop feedback is (+1)
 *     Resonates at all integer harmonics n * (c / 2L) for n = 1, 2, 3, 4...
 *   - Stopped pipe: r1 = +1, r2 = -1 => loop feedback is (-1)
 *     Resonates at odd harmonics (2n - 1) * (c / 4L) for n = 1, 2, 3, 4...
 *
 * Labelled excitations (impulse, noise burst, step).
 */

import { pipeFundamentalHz } from './physics.js';
import { MAX_SAFE_DELAY_SAMPLES } from './digital_medium.js';

export const EXCITATION_TYPES = [
  { id: 'impulse', name: 'Impulse (Unit delta at t=0)', description: 'Excites all modes uniformly with zero phase spread.' },
  { id: 'noise_burst', name: 'Noise burst (Broadband stochastic pulse)', description: 'Excites all modes randomly; realistic transient burst.' },
  { id: 'step', name: 'Step pulse (Heaviside step input)', description: 'Constant displacement step excitation.' },
];

/**
 * Create a Digital Waveguide instance.
 */
export function createWaveguide({
  lengthM,
  atm,
  mode = 'open',
  sampleRate = 48000,
  excitationType = 'impulse',
  excitationDurationS = 0.005, // for noise burst
  excitationGain = 0.8,
  interpolatorType = 'linear',
  lossFactor = 0.9995, // slight damping per round trip for acoustic decay
}) {
  const f1 = pipeFundamentalHz(lengthM, atm, mode);
  // Physical round-trip transit time in a pipe of length L is 2L/c
  const roundTripTimeS = (2 * lengthM) / atm.c;
  const totalDelaySamples = roundTripTimeS * sampleRate;

  if (totalDelaySamples > MAX_SAFE_DELAY_SAMPLES) {
    throw new Error(
      `Delay line length (${Math.round(totalDelaySamples).toLocaleString()} samples) exceeds memory limit (${MAX_SAFE_DELAY_SAMPLES.toLocaleString()}). Lower the sample rate.`
    );
  }

  const intDelay = Math.max(1, Math.floor(totalDelaySamples));
  const fracDelay = totalDelaySamples - intDelay;
  const bufferSize = intDelay + 4; // safety padding for interpolator taps

  const ringBuffer = new Float64Array(bufferSize);
  let writePtr = 0;

  // Reflection sign multiplier for the physical 2L/c loop:
  // Open pipe: (-1) * (-1) = +1
  // Stopped pipe: (+1) * (-1) = -1 (inverting loop feedback produces fundamental c/4L with odd harmonics)
  const loopSign = mode === 'stopped' ? -1 : 1;
  const loopGain = loopSign * lossFactor;

  // Thiran state if used
  let thiranState = 0;
  const thiranCoeff = (1 - fracDelay) / (1 + fracDelay);

  // Excitation generator state
  let sampleIndex = 0;
  const noiseBurstSamples = Math.max(1, Math.round(excitationDurationS * sampleRate));

  /** Read delayed sample with fractional interpolation. */
  function readDelayed() {
    if (interpolatorType === 'none' || fracDelay === 0) {
      const readIdx = (writePtr - intDelay + bufferSize) % bufferSize;
      return ringBuffer[readIdx];
    }

    if (interpolatorType === 'linear') {
      const idx0 = (writePtr - intDelay + bufferSize) % bufferSize;
      const idx1 = (writePtr - intDelay - 1 + bufferSize) % bufferSize;
      const s0 = ringBuffer[idx0];
      const s1 = ringBuffer[idx1];
      return (1 - fracDelay) * s0 + fracDelay * s1;
    }

    if (interpolatorType === 'lagrange3') {
      const idx_m1 = (writePtr - intDelay + 1 + bufferSize) % bufferSize;
      const idx_0  = (writePtr - intDelay + bufferSize) % bufferSize;
      const idx_1  = (writePtr - intDelay - 1 + bufferSize) % bufferSize;
      const idx_2  = (writePtr - intDelay - 2 + bufferSize) % bufferSize;

      const d = fracDelay;
      const h_m1 = (-d * (d - 1) * (d - 2)) / 6;
      const h_0  = ((d + 1) * (d - 1) * (d - 2)) / 2;
      const h_1  = (-(d + 1) * d * (d - 2)) / 2;
      const h_2  = ((d + 1) * d * (d - 1)) / 6;

      return (
        h_m1 * ringBuffer[idx_m1] +
        h_0  * ringBuffer[idx_0] +
        h_1  * ringBuffer[idx_1] +
        h_2  * ringBuffer[idx_2]
      );
    }

    if (interpolatorType === 'thiran1') {
      const idx = (writePtr - intDelay + bufferSize) % bufferSize;
      const x = ringBuffer[idx];
      const y = thiranCoeff * x + thiranState;
      thiranState = x - thiranCoeff * y;
      return y;
    }

    // Default linear fallback
    const idx0 = (writePtr - intDelay + bufferSize) % bufferSize;
    const idx1 = (writePtr - intDelay - 1 + bufferSize) % bufferSize;
    return (1 - fracDelay) * ringBuffer[idx0] + fracDelay * ringBuffer[idx1];
  }

  /** Generate one excitation sample. */
  function getExcitation() {
    let ex = 0;
    if (excitationType === 'impulse') {
      if (sampleIndex === 0) ex = 1.0;
    } else if (excitationType === 'noise_burst') {
      if (sampleIndex < noiseBurstSamples) {
        // Windowed white noise with Hann taper
        const noise = (Math.random() * 2 - 1);
        const window = 0.5 * (1 + Math.cos((Math.PI * sampleIndex) / noiseBurstSamples));
        ex = noise * window;
      }
    } else if (excitationType === 'step') {
      ex = 1.0;
    }
    return ex * excitationGain;
  }

  /** Compute and return the next audio sample. */
  function step() {
    const delayed = readDelayed();
    const input = getExcitation();

    // Waveguide injection: input is summed into the recirculating delay line
    const state = input + delayed * loopGain;

    ringBuffer[writePtr] = state;
    writePtr = (writePtr + 1) % bufferSize;
    sampleIndex++;

    // Output is the acoustic pressure wave at the observation end
    return state;
  }

  /** Fill an output buffer array. */
  function processBlock(outArray, startIdx = 0, count = outArray.length) {
    const end = startIdx + count;
    for (let i = startIdx; i < end; i++) {
      outArray[i] = step();
    }
  }

  return {
    lengthM,
    atm,
    mode,
    sampleRate,
    f1,
    roundTripTimeS,
    totalDelaySamples,
    intDelay,
    fracDelay,
    step,
    processBlock,
    getSampleIndex: () => sampleIndex,
  };
}
