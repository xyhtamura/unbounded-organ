/**
 * The Unbounded Organ — the surface drifts with the pipe.
 *
 * The instrument's subject is that one unchanging specification produces
 * different kinds of thing as length grows. The interface does the same, and
 * it does it continuously rather than in states: there are no theme switches
 * here, only two numbers pushed onto the root element that everything else in
 * the stylesheet reads.
 *
 *   --drift   0 → 1 with the log of pipe length. Thins the console's chroma
 *             as the pipe outgrows the air it was supposed to sound in.
 *
 *   --breath  the pipe's own period, clamped into a range an eye can see.
 *             The console breathes at it. A short pipe breathes fast; a
 *             planetary one barely moves.
 *
 *   --kind    the hue of the current category, so the readout window is
 *             tinted by what it is rather than by how bad it is. NOTE, ECHO
 *             and DRIFT are three species, not three severities — nothing
 *             here may ramp green → amber → red.
 *
 * Nothing in this module touches the audio path or the physics. It reads
 * state and writes CSS custom properties; deleting it leaves a working, plain
 * instrument.
 */

const MIN_M = 0.008575;
const MAX_M = 4.0075e7;

/* The period spans twelve orders of magnitude across this range — 50 microseconds
 * at 8.575 mm, 2.7 days at Earth's circumference — and an eye follows about one.
 * So the breath is the period LOG-COMPRESSED, which is the same compression the
 * length axis already applies to length.
 *
 * Clamping the raw period instead was tried and is wrong: it pins at the ceiling
 * from about 4.5 km onward, so the breath stops tracking the pipe across almost
 * the whole instrument. Since period = 2L/c, log-period is log-length shifted by
 * a constant, so mapping drift onto this range IS a linear map of log-period. */
const BREATH_MIN_S = 2.6;
const BREATH_MAX_S = 26;

const LOG_MIN = Math.log10(MIN_M);
const LOG_MAX = Math.log10(MAX_M);

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Where this pipe sits on the log length axis, 0 → 1. */
export function driftFor(lengthM) {
  if (!(lengthM > 0)) return 0;
  return clamp01((Math.log10(lengthM) - LOG_MIN) / (LOG_MAX - LOG_MIN));
}

/** The pipe's period, log-compressed into something an eye can follow. */
export function breathSecondsFor(lengthM) {
  return BREATH_MIN_S + driftFor(lengthM) * (BREATH_MAX_S - BREATH_MIN_S);
}

/** CSS variable carrying the hue of a category. No ordering among them. */
export function kindVarFor(category) {
  switch (category) {
    case 'note': return 'var(--note)';
    case 'echo': return 'var(--echo)';
    case 'drift': return 'var(--drift-c)';
    default: return 'var(--metal)';
  }
}

/** Chip class for a category — used by the readout window. */
export function kindClassFor(category) {
  return `chip category-${category}`;
}

/**
 * Push the current pipe onto the root element.
 *
 * @param {object} o
 * @param {number} o.lengthM  pipe length, metres
 * @param {string} o.category 'note' | 'echo' | 'drift'
 */
export function applySkin({ lengthM, category }) {
  const root = document.documentElement;
  if (!root) return;
  root.style.setProperty('--drift', driftFor(lengthM).toFixed(4));
  root.style.setProperty('--breath', `${breathSecondsFor(lengthM).toFixed(2)}s`);
  root.style.setProperty('--kind', kindVarFor(category));
}
