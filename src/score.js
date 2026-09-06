/**
 * The Unbounded Organ — Markdown Score Exporter.
 *
 * Spec §4.8:
 * At the long end the score is the primary form the composition can take,
 * since the render is in places unlistenable and unstorable.
 */

import {
  describeAtmosphere, describePipe,
} from './physics.js';
import { describeDigitalMedium, classifyCategory } from './digital_medium.js';
import { analyzeModeDeviations } from './interpolator.js';
import {
  describeRank, poolUsage, planPolyphonicRoute, equalLengthCeiling,
  rankSpanS, withVoiceDefaults,
} from './polyphony.js';
import { fmtFreq, fmtPeriod, fmtBytes, fmtLength, fmtInt } from './format.js';

/**
 * What the fundamental did against the two thresholds, for the score.
 *
 * The same report the console shows, kept here because the score is the
 * durable artifact and a regime name alone does not say which threshold was
 * missed or what still carries. Folded in from Planetary Organs on 2026-09-03;
 * shared-physics contract in DEPENDENCIES.md.
 */
function scoreRegimeReport(pipeDesc, atmDesc) {
  if (pipeDesc.regime === 'audible') {
    return `Clears the ${fmtFreq(atmDesc.cutoffHz)} cutoff; inside 20 Hz–20 kHz.`;
  }
  if (pipeDesc.regime === 'ultrasonic') {
    return 'Failed the 20 kHz hearing ceiling. Propagates; hearing is what stops.';
  }
  if (pipeDesc.regime === 'infrasonic') {
    return `Failed the 20 Hz hearing floor. Propagates: ${fmtFreq(pipeDesc.hz)} `
      + `is above the ${fmtFreq(atmDesc.cutoffHz)} cutoff.`;
  }
  const carried = pipeDesc.lowestPropagating
    ? ` Mode n = ${pipeDesc.lowestPropagating.n} clears it, at `
      + `${fmtFreq(pipeDesc.lowestPropagating.hz)}.`
    : '';
  return `Failed the acoustic cutoff. ${fmtFreq(pipeDesc.hz)} is below `
    + `${fmtFreq(atmDesc.cutoffHz)}; the fundamental is evanescent rather than `
    + `radiating.${carried}`;
}

/**
 * Generate a Markdown score document for a specified configuration or rank collection.
 */
export function generateScore({
  title = 'The Unbounded Organ — Specification Score',
  date = new Date().toISOString().slice(0, 10),
  pipe, // { lengthM, mode }
  atm,
  digitalMedium, // { sampleRate, bitDepth, interpolatorType, excitationType }
  renderConfig, // { renderMode, durationSec, cycleCount }
}) {
  const atmDesc = describeAtmosphere(atm);
  const pipeDesc = describePipe(pipe.lengthM, atm, pipe.mode);
  const medDesc = describeDigitalMedium(
    pipe.lengthM,
    atm,
    pipe.mode,
    digitalMedium.sampleRate,
    digitalMedium.bitDepth
  );
  const interpDesc = analyzeModeDeviations({
    lengthM: pipe.lengthM,
    atm,
    mode: pipe.mode,
    sampleRate: digitalMedium.sampleRate,
    interpolatorType: digitalMedium.interpolatorType,
    maxModes: 8,
  });

  const totalDurationS =
    renderConfig.renderMode === 'cycles'
      ? renderConfig.cycleCount * pipeDesc.periodS
      : renderConfig.durationSec;
  const totalCycles =
    renderConfig.renderMode === 'cycles'
      ? renderConfig.cycleCount
      : renderConfig.durationSec / pipeDesc.periodS;

  return `# ${title}

*Generated: ${date}*
*Mechanism: 1D digital waveguide evaluated across the unbounded length axis.*

---

## 1. Categorical State & Regime

| Metric | Value |
|---|---|
| **Categorical Kind** | **${medDesc.category.toUpperCase()}** (${medDesc.category === 'note' ? 'Sparse mode spectrum; distinct pitch percept' : medDesc.category === 'echo' ? 'Dense harmonic modes; discrete round-trip reflections' : 'Ultra-low frequency; continuous slow drift'}) |
| **Pipe Length** | ${fmtLength(pipe.lengthM)} (${pipe.lengthM.toExponential(4)} m) |
| **Pipe Boundary** | ${pipe.mode} (${pipe.mode === 'open' ? 'pressure-release at both ends; all integer harmonics' : 'rigid closed end, open mouth; odd harmonics only'}) |
| **Fundamental Frequency (f₁)** | ${fmtFreq(pipeDesc.hz)} |
| **Fundamental Period (T)** | ${fmtPeriod(pipeDesc.periodS)} |
| **Acoustic Regime** | ${pipeDesc.regime} |
| **Threshold report** | ${scoreRegimeReport(pipeDesc, atmDesc)} |
| **Modes below 20 Hz** | ${fmtInt(medDesc.modesBelow20Hz)} |
| **Modes below Nyquist** | ${fmtInt(medDesc.highestMode)} |

---

## 2. The Mediums (Two Atmospheres)

### Physical Atmosphere
- **Ratio of specific heats (γ)**: ${atm.gamma}
- **Surface gravity (g)**: ${atm.g.toFixed(4)} m s⁻²
- **Speed of sound (c)**: ${atm.c.toFixed(2)} m s⁻¹
- **Density scale height (H)**: ${fmtLength(atmDesc.scaleHeightM)}
- **Vertical acoustic cutoff (f_a)**: ${fmtFreq(atmDesc.cutoffHz)} (Period: ${fmtPeriod(atmDesc.cutoffPeriodS)})
- **Critical length (L_crit)**: Open: ${fmtLength(atmDesc.criticalOpenM)} | Stopped: ${fmtLength(atmDesc.criticalStoppedM)}
- **Vacuum note**: Above ~100 km (Kármán line), the atmosphere ceases to be a continuum medium.

### Digital Medium (The Apparatus)
- **Sample Rate (f_s)**: ${fmtFreq(digitalMedium.sampleRate)}
- **Bit Depth**: ${digitalMedium.bitDepth}-bit
- **Nyquist Limit**: ${fmtFreq(medDesc.nyquistHz)}
- **Delay Line State**: ${fmtInt(medDesc.delaySamples)} samples (${fmtBytes(medDesc.stateSizeBytes)})
- **WAV RIFF Container Ceiling**: Max ${fmtPeriod(medDesc.wavMaxDurationS)} before 4 GiB boundary

---

## 3. Resonator & Interpolator Realisation

- **Excitation Source**: ${digitalMedium.excitationType}
- **Fractional Delay Interpolator**: ${digitalMedium.interpolatorType}
- **Measured RMS Inharmonicity (Δf/f)**: ${(interpDesc.percentRms).toFixed(4)}%
- **Max Inharmonicity**: ${(interpDesc.percentMax).toFixed(4)}%

### Mode Series Sample (First ${interpDesc.modes.length} Modes)

| Harmonic (n) | Target f (Hz) | Realised f (Hz) | Realised Delay (samples) | Deviation (Δf/nf₁) |
|---|---|---|---|---|
${interpDesc.modes
  .map(
    (m) =>
      `| ${m.n} | ${fmtFreq(m.targetHz)} | ${fmtFreq(m.realisedHz)} | ${m.realisedDelaySamples.toFixed(3)} | ${m.percentDeviation >= 0 ? '+' : ''}${m.percentDeviation.toFixed(4)}% |`
  )
  .join('\n')}

---

## 4. Realisation Duration & Render Profile

- **Specified Duration**: ${fmtPeriod(totalDurationS)} (${totalCycles.toFixed(4)} cycles of fundamental)
- **Render Samples**: ${fmtInt(Math.ceil(totalDurationS * digitalMedium.sampleRate))}
- **Estimated File Size**: ${fmtBytes(44 + Math.ceil(totalDurationS * digitalMedium.sampleRate) * (digitalMedium.bitDepth / 8))}

---
*The Unbounded Organ — f:\\xyh\\unbounded-organ\\*
`;
}

/**
 * What one voice failed, in a phrase. The single-pipe score can spend a
 * sentence on this; a rank has one line per voice and needs it to fit.
 */
const fmtTime = seconds => (seconds === 0 ? '0.00 s' : fmtPeriod(seconds));

function voiceVerdict(entry, cutoffHz) {
  if (!entry.propagates) {
    return `evanescent; below the ${fmtFreq(cutoffHz)} cutoff`;
  }
  if (entry.hz > 20000) return 'above the 20 kHz ceiling; propagates, unheard';
  if (entry.audible) return 'audible';
  return `${entry.octavesBelowFloor.toFixed(1)} octaves under the 20 Hz floor`;
}

/**
 * Generate a Markdown score for a rank.
 *
 * Same reason as the single-pipe score, more so: a rank holding a planetary
 * pipe cannot be rendered at any useful rate, so the score is the only form
 * the composition has. It carries the voices, what the set does against the
 * two thresholds, and what the rank asks of the allocation ceiling — that last
 * one because it decides whether the piece is renderable at all, which is not
 * a fact to leave outside the durable artifact.
 */
export function generateRankScore({
  title = 'The Unbounded Organ — Rank Score',
  date = new Date().toISOString().slice(0, 10),
  voices: rawVoices,
  atm,
  digitalMedium, // { sampleRate, bitDepth, interpolatorType, excitationType }
  durationSec,
}) {
  const voices = rawVoices.map(withVoiceDefaults);
  const atmDesc = describeAtmosphere(atm);
  const rank = describeRank(voices, atm);
  const pool = poolUsage(voices, atm, digitalMedium.sampleRate);
  const span = durationSec ?? rankSpanS(voices);
  const route = planPolyphonicRoute({
    voices, atm, sampleRate: digitalMedium.sampleRate,
    bitDepth: digitalMedium.bitDepth, durationSec: Math.max(0.001, span),
  });
  const ceiling = equalLengthCeiling(Math.max(1, voices.length), atm, digitalMedium.sampleRate);

  const byLength = rank.entries.map((entry, i) => ({ entry, alloc: pool.perVoice[i] }))
    .sort((a, b) => a.entry.voice.lengthM - b.entry.voice.lengthM);
  const byOnset = [...rank.entries].sort((a, b) => a.voice.startS - b.voice.startS);

  const release = v => (Number.isFinite(v.durationS)
    ? fmtTime(v.startS + v.durationS)
    : 'held');

  const voiceRows = byLength.map(({ entry, alloc }) => {
    const v = entry.voice;
    return `| ${fmtLength(v.lengthM)} | ${v.mode} | ${fmtFreq(entry.hz)} | `
      + `${fmtPeriod(1 / entry.hz)} | ${classifyCategory(entry.hz)} | `
      + `${fmtTime(v.startS)} | ${release(v)} | ${v.gain.toFixed(2)} | `
      + `${voiceVerdict(entry, rank.cutoffHz)} |`;
  }).join('\n');

  const timelineRows = byOnset.map(entry => {
    const v = entry.voice;
    return `- **${fmtTime(v.startS)}** — ${fmtLength(v.lengthM)} ${v.mode} `
      + `(${fmtFreq(entry.hz)}) opens, ${Number.isFinite(v.durationS)
        ? `closes at ${fmtTime(v.startS + v.durationS)}`
        : 'held to the end'}.`;
  }).join('\n');

  const allocRows = byLength.map(({ entry, alloc }) =>
    `| ${fmtLength(entry.voice.lengthM)} | ${fmtInt(Math.round(alloc.delaySamples))} | `
    + `${fmtInt(alloc.allocatedSamples)} | ${fmtBytes(alloc.stateBytes)} | `
    + `${(alloc.shareOfPool * 100).toFixed(3)}% |`).join('\n');

  const routeSection = route.needed
    ? route.steps.map(s => `- **${s.kind}**: ${s.from.toLocaleString()} → `
        + `${typeof s.to === 'number' ? s.to.toLocaleString() : s.to}. `
        + `${s.why[0].toUpperCase()}${s.why.slice(1)}; ${s.cost}.`).join('\n')
    : '- None. The rank renders as specified.';

  const machine = JSON.stringify({
    atmosphere: { gamma: atm.gamma, g: atm.g, c: atm.c },
    sampleRate: digitalMedium.sampleRate,
    bitDepth: digitalMedium.bitDepth,
    durationSec: span,
    voices: voices.map(v => ({
      lengthM: v.lengthM,
      mode: v.mode,
      startS: v.startS,
      durationS: Number.isFinite(v.durationS) ? v.durationS : null,
      gain: v.gain,
    })),
  }, null, 2);

  return `# ${title}

*Generated: ${date}*
*Mechanism: ${fmtInt(voices.length)} pipes, each a 1D digital waveguide, summed. One specification, evaluated at ${fmtInt(voices.length)} lengths.*

---

## 1. The Rank

| Length | Boundary | f₁ | Period | Kind | Opens | Closes | Gain | Against the thresholds |
|---|---|---|---|---|---|---|---|---|
${voiceRows}

Sorted by length, shortest first.

## 2. The Set

A single pipe can be told which threshold it missed and by how much. A rank has
one answer per voice, so this counts them instead.

| Metric | Value |
|---|---|
| **Voices** | ${fmtInt(rank.voiceCount)} |
| **Audible** | ${fmtInt(rank.audible)} of ${fmtInt(rank.voiceCount)} inside 20 Hz–20 kHz |
| **Inaudible** | ${fmtInt(rank.inaudible)} |
| **Below the acoustic cutoff** | ${fmtInt(rank.forced)} (the medium would not carry them; the instrument renders them anyway) |
| **Range** | ${fmtFreq(rank.lowest.hz)} to ${fmtFreq(rank.highest.hz)} |
| **Longest pipe** | ${fmtLength(rank.lowest.voice.lengthM)} |
| **Shortest pipe** | ${fmtLength(rank.highest.voice.lengthM)} |
| **Span** | ${fmtPeriod(span)}, ring-down excluded |

## 3. Timeline

${timelineRows}

---

## 4. The Atmosphere

- **Ratio of specific heats (γ)**: ${atm.gamma}
- **Surface gravity (g)**: ${atm.g.toFixed(4)} m s⁻²
- **Speed of sound (c)**: ${atm.c.toFixed(2)} m s⁻¹
- **Density scale height (H)**: ${fmtLength(atmDesc.scaleHeightM)}
- **Vertical acoustic cutoff (f_a)**: ${fmtFreq(atmDesc.cutoffHz)} (Period: ${fmtPeriod(atmDesc.cutoffPeriodS)})
- **Critical length (L_crit)**: Open: ${fmtLength(atmDesc.criticalOpenM)} | Stopped: ${fmtLength(atmDesc.criticalStoppedM)}

---

## 5. The Pool

Every voice carries its own delay line, and the allocation ceiling bounds their
sum rather than each of them. Polyphony is therefore paid for in range, at a
rate this section states.

- **Sample rate**: ${fmtFreq(digitalMedium.sampleRate)} · **Bit depth**: ${digitalMedium.bitDepth}-bit
- **Excitation**: ${digitalMedium.excitationType} · **Interpolator**: ${digitalMedium.interpolatorType}, shared by every voice
- **Allocated**: ${fmtBytes(pool.totalStateBytes)} of ${fmtBytes(pool.poolSamples * 8)}, ${(pool.fractionUsed * 100).toFixed(3)}% used
- **Fits**: ${pool.fits ? 'yes' : `no — over by ${fmtInt(-pool.headroomSamples)} samples`}
- **Exchange rate**: at this rate, ${fmtInt(Math.max(1, voices.length))} pipes of equal length reach ${fmtLength(ceiling)} each. One pipe alone would reach ${fmtLength(equalLengthCeiling(1, atm, digitalMedium.sampleRate))}.

| Length | Delay (samples) | Allocated | State | Share of pool |
|---|---|---|---|---|
${allocRows}

## 6. Route

What the instrument would degrade to render this rank. It lowers resolution or
shortens the file; it never substitutes a different computation.

${routeSection}

- **Rate used**: ${fmtFreq(route.sampleRate)} · **Duration**: ${fmtPeriod(route.durationSec)}
- **Render samples**: ${fmtInt(route.quote.totalSamples)} · **File**: ${fmtBytes(route.quote.totalFileSizeBytes)}
- **Renderable**: ${route.canRender ? 'yes' : 'no'}

---

## 7. The Rank, Machine-Readable

\`\`\`json
${machine}
\`\`\`

---
*The Unbounded Organ — f:\\xyh\\unbounded-organ\\*
`;
}
