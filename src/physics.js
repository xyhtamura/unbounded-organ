/**
 * The Unbounded Organ — physics.
 *
 * Stamped vendored copy of planetary-organs/src/physics.js (2026-08-22).
 * Contract: see DEPENDENCIES.md. Both pieces compute H, f_a, L_crit, pipe
 * fundamentals and regimes identically, and neither may fork those formulas.
 *
 * Port of physics/projects/planetary-organs/numerics/thresholds.py, checked
 * against its committed output by test/physics.test.js.
 *
 * Pure functions. No DOM, no globals, no side effects.
 *
 * Derived in physics/projects/planetary-organs/derivations/acoustic_cutoff.py
 * (SymPy, output committed), for a hydrostatic isothermal background:
 *
 *     H       = c^2 / (gamma * g)              density scale height   [PORG-1]
 *     omega^2 = c^2 m^2 + gamma^2 g^2 / (4c^2) vertical dispersion    [PORG-2]
 *     omega_a = gamma * g / (2c)               acoustic cutoff        [PORG-3]
 *
 * Vertical propagation requires real m, so omega > omega_a.
 *
 * Pipe fundamentals are CONFIRMED as PORG-4 by two independent routes:
 * derivations/pipe_modes.py takes the end conditions from the linearised
 * momentum equation and reads the eigenvalues off a vanishing determinant,
 * numerics/pipe_modes_numeric.py takes the spectrum of the discretised
 * Helmholtz operator. They agree to 2e-7 over six modes.
 *
 * The end correction is omitted deliberately. Ignoring it shifts the
 * fundamental by exactly delta/L [PORG-9], which is under 0.01% at the critical
 * length and a few percent at organ-rank lengths [PORG-10] — so L_crit is
 * unaffected, and the pitches reported for short ranks are ideal-column
 * pitches rather than the pitch a bored pipe of that length would sound.
 *
 *     open pipe    f1 = c / (2L)
 *     stopped pipe f1 = c / (4L)
 *
 * Claim IDs in brackets refer to physics/CLAIMS.md.
 */

/** Ratio of specific heats for a diatomic ideal gas. */
export const GAMMA_DIATOMIC = 1.4;

/** Standard gravity, m s^-2. */
export const G_EARTH = 9.80665;

/** Speed of sound in dry air at 20 C, m s^-1. */
export const C_EARTH = 343.0;

/** Molar gas constant, J mol^-1 K^-1. Exact under the 2019 SI redefinition. */
export const R_GAS = 8.314462618;

/** Conventional bounds of human hearing, Hz. */
export const HEARING_FLOOR_HZ = 20;
export const HEARING_CEILING_HZ = 20000;

/** Metres per foot, exact. Organ stops are named in feet. */
export const FOOT_M = 0.3048;

/**
 * An atmosphere is {gamma, g, c}: ratio of specific heats, surface gravity in
 * m s^-2, and speed of sound in m s^-1. Everything else is derived from those
 * three.
 */

/** Density scale height, metres. [PORG-1] */
export function scaleHeight({ gamma, g, c }) {
  return (c * c) / (gamma * g);
}

/** Vertical acoustic cutoff, rad s^-1. [PORG-3] */
export function cutoffAngular({ gamma, g, c }) {
  return (gamma * g) / (2 * c);
}

/** Vertical acoustic cutoff, Hz. [PORG-3] */
export function cutoffHz(atm) {
  return cutoffAngular(atm) / (2 * Math.PI);
}

/**
 * Adiabatic speed of sound in an ideal gas, m s^-1, from the same relation the
 * derivation assumes: c^2 = gamma * p / rho = gamma * R * T / M.
 *
 * @param {number} gamma ratio of specific heats
 * @param {number} tempK temperature, kelvin
 * @param {number} molarMass mean molar mass, kg mol^-1
 */
export function soundSpeedFromGas(gamma, tempK, molarMass) {
  return Math.sqrt((gamma * R_GAS * tempK) / molarMass);
}

/** 2 for an open pipe, 4 for a stopped one. [PORG-4] */
export function pipeFactor(mode) {
  return mode === 'stopped' ? 4 : 2;
}

/** Fundamental of a pipe of length L, Hz. [PORG-4] */
export function pipeFundamentalHz(lengthM, { c }, mode = 'open') {
  return c / (pipeFactor(mode) * lengthM);
}

/** Length of the pipe whose fundamental is f, metres. [PORG-4] */
export function pipeLengthForHz(hz, { c }, mode = 'open') {
  return c / (pipeFactor(mode) * hz);
}

/**
 * The length past which the fundamental falls beneath the cutoff: 2*pi*H for
 * an open pipe, pi*H for a stopped one. [PORG-5]
 */
export function criticalLength(atm, mode = 'open') {
  return pipeLengthForHz(cutoffHz(atm), atm, mode);
}

/**
 * Harmonic numbers a pipe supports: all integers for an open pipe, odd
 * integers only for a stopped one.
 */
export function harmonicNumbers(mode, count) {
  const step = mode === 'stopped' ? 2 : 1;
  return Array.from({ length: count }, (_, i) => 1 + i * step);
}

/**
 * The lowest mode of this pipe whose frequency clears the cutoff.
 *
 * Arithmetic on top of PORG-3 and PORG-4 rather than new physics, and it
 * qualifies the "below cutoff" label: the regime names what the FUNDAMENTAL
 * does, and a pipe whose fundamental is forbidden may still have propagating
 * upper modes. Returns null when the fundamental itself propagates.
 */
export function lowestPropagatingMode(lengthM, atm, mode = 'open') {
  const f1 = pipeFundamentalHz(lengthM, atm, mode);
  const fa = cutoffHz(atm);
  if (f1 > fa) return null;
  const step = mode === 'stopped' ? 2 : 1;
  const nRaw = Math.ceil(fa / f1);
  // Round up to the next supported harmonic number, and clear equality.
  let n = mode === 'stopped' ? (nRaw % 2 === 0 ? nRaw + 1 : nRaw) : nRaw;
  while (n * f1 <= fa) n += step;
  return { n, hz: n * f1 };
}

/**
 * Which of the three regimes a frequency falls in.
 *
 * 'audible'      — heard
 * 'infrasonic'   — propagates, below hearing
 * 'below-cutoff' — does not propagate; no sound exists to detect
 *
 * 'ultrasonic' is included for completeness. No pipe in the tool's length
 * range reaches it in an Earth-like atmosphere.
 */
export function classify(hz, atm) {
  if (hz > HEARING_CEILING_HZ) return 'ultrasonic';
  if (hz >= HEARING_FLOOR_HZ) return 'audible';
  if (hz > cutoffHz(atm)) return 'infrasonic';
  return 'below-cutoff';
}

/** The two length thresholds that divide the regimes, metres. */
export function regimeBounds(atm, mode = 'open') {
  return {
    hearing: pipeLengthForHz(HEARING_FLOOR_HZ, atm, mode),
    cutoff: criticalLength(atm, mode),
  };
}

/** Everything the readouts need for one pipe. */
export function describePipe(lengthM, atm, mode = 'open') {
  const hz = pipeFundamentalHz(lengthM, atm, mode);
  return {
    lengthM,
    mode,
    hz,
    periodS: 1 / hz,
    regime: classify(hz, atm),
    scaleHeights: lengthM / scaleHeight(atm),
    lowestPropagating: lowestPropagatingMode(lengthM, atm, mode),
  };
}

/** Everything the readouts need for one atmosphere. */
export function describeAtmosphere(atm) {
  const fa = cutoffHz(atm);
  return {
    ...atm,
    scaleHeightM: scaleHeight(atm),
    cutoffHz: fa,
    cutoffPeriodS: 1 / fa,
    criticalOpenM: criticalLength(atm, 'open'),
    criticalStoppedM: criticalLength(atm, 'stopped'),
    hearingOpenM: pipeLengthForHz(HEARING_FLOOR_HZ, atm, 'open'),
    hearingStoppedM: pipeLengthForHz(HEARING_FLOOR_HZ, atm, 'stopped'),
  };
}

/**
 * The shift, in octaves, that brings `hz` up to `targetHz`. Positive means up.
 * Fractional by design: the transposition control applies one common shift to
 * everything so that intervals between ranks survive it.
 */
export function octaveShift(hz, targetHz) {
  return Math.log2(targetHz / hz);
}

/** Apply a shift in octaves. */
export function transpose(hz, octaves) {
  return hz * Math.pow(2, octaves);
}
