/**
 * The Unbounded Organ — atmospheres.
 *
 * An atmosphere is three numbers: gamma, g, c. Everything the instrument
 * reports is derived from them.
 */

import { GAMMA_DIATOMIC, G_EARTH, C_EARTH, soundSpeedFromGas } from './physics.js';

/** Mean molar mass of dry air, kg mol^-1. */
export const M_AIR = 0.0289647;

export const EARTH = {
  id: 'earth',
  name: 'Earth',
  real: true,
  gamma: GAMMA_DIATOMIC,
  g: G_EARTH,
  c: C_EARTH,
  note: 'Dry air at 20 °C. The three values committed in thresholds.py.',
};

/**
 * Atmospheres stated as a gas — gamma, gravity, temperature, molar mass —
 * where c is derived via c^2 = gamma * R * T / M.
 */
const HYPOTHETICAL = [
  {
    id: 'heavy-cold',
    name: 'Heavy, cold, low gravity',
    gamma: 1.3,
    g: 1.35,
    tempK: 94,
    molarMass: 0.028,
    note: 'A cold nitrogen-like gas under weak gravity. Low c and low g pull in opposite directions on H.',
  },
  {
    id: 'dense-hot',
    name: 'Heavy, hot, Earth gravity',
    gamma: 1.3,
    g: 8.87,
    tempK: 737,
    molarMass: 0.0435,
    note: 'A hot, heavy gas. High temperature raises c faster than the heavy molecule lowers it.',
  },
  {
    id: 'thin-cold',
    name: 'Light, cold, weak gravity',
    gamma: 1.29,
    g: 3.72,
    tempK: 210,
    molarMass: 0.0434,
    note: 'Cold and weakly held. The shortest silence threshold of the four.',
  },
];

/** Presets, with c derived for the hypothetical ones. */
export const PRESETS = [
  EARTH,
  ...HYPOTHETICAL.map((h) => ({
    ...h,
    real: false,
    c: soundSpeedFromGas(h.gamma, h.tempK, h.molarMass),
  })),
];

export function presetById(id) {
  return PRESETS.find((p) => p.id === id) || EARTH;
}

/** Strip a preset down to { gamma, g, c }. */
export function toAtmosphere({ gamma, g, c }) {
  return { gamma, g, c };
}
