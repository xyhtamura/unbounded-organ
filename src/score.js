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
import { describeDigitalMedium } from './digital_medium.js';
import { analyzeModeDeviations } from './interpolator.js';
import { fmtFreq, fmtPeriod, fmtBytes, fmtLength, fmtInt } from './format.js';

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
