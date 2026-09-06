/**
 * The Unbounded Organ — Application State & UI Coordinator.
 */

import {
  pipeFundamentalHz,
  pipeLengthForHz,
  describePipe,
  describeAtmosphere,
  criticalLength,
  cutoffHz,
  HEARING_FLOOR_HZ,
  FOOT_M,
} from './physics.js';
import { PRESETS, presetById, toAtmosphere } from './atmospheres.js';
import { applySkin, kindClassFor } from './skin.js';
import { createScaleView } from './scale-view.js';
import { createRankPanel } from './rank-panel.js';
import {
  describeDigitalMedium,
  quoteRenderCost,
  planRenderRoute,
  isForced,
  SAMPLE_RATE_PRESETS,
  BIT_DEPTH_OPTIONS,
} from './digital_medium.js';
import {
  INTERPOLATOR_TYPES,
  analyzeModeDeviations,
} from './interpolator.js';
import { EXCITATION_TYPES } from './waveguide.js';
import { renderOffline } from './render.js';
import { generateScore } from './score.js';
import {
  fmtFreq,
  fmtPeriod,
  fmtBytes,
  fmtLength,
  fmtInt,
  fmtNum,
} from './format.js';

// Range constants
const MIN_LENGTH_M = 0.008575; // 8.575 mm (20 kHz)
const MAX_LENGTH_M = 4.0075e7; // 40,075 km (Earth circumference)
const LOG_MIN = Math.log(MIN_LENGTH_M);
const LOG_MAX = Math.log(MAX_LENGTH_M);
const scaleView = createScaleView(document.getElementById('pipe-scale'));
// The rank view reads the atmosphere from this module, so a change here has to
// reach it. Assigned once the DOM exists; null until then.
let rankPanel = null;

// Application state
const state = {
  lengthM: 2.4384, // 8 ft (2.4384 m)
  mode: 'open',
  atmPresetId: 'earth',
  atm: toAtmosphere(PRESETS[0]),
  sampleRate: 48000,
  bitDepth: 16,
  interpolatorType: 'linear',
  excitationType: 'impulse',
  excitationGain: 0.8,
  lossFactor: 0.9995,
  renderMode: 'duration', // 'duration' or 'cycles'
  durationSec: 2.0,
  cycleCount: 1.0,
  isRendering: false,
  abortController: null,
  lastRenderResult: null,
};

// DOM element references
let els = {};

function initDom() {
  els = {
    // Pipe controls
    slider: document.getElementById('length-slider'),
    numInput: document.getElementById('length-number'),
    unitSelect: document.getElementById('length-unit'),
    modeRadios: document.querySelectorAll('input[name="pipe-mode"]'),
    scaleNote: document.getElementById('length-scale-note'),
    pitchLead: document.getElementById('pitch-lead'),
    pitchTrail: document.getElementById('pitch-trail'),
    categoryChip: document.getElementById('category-chip'),
    categoryNote: document.getElementById('category-note'),
    regimeChip: document.getElementById('regime-chip'),
    regimeNote: document.getElementById('regime-note'),
    modesInfo: document.getElementById('modes-info'),
    validityNote: document.getElementById('validity-note'),
    quickJumps: document.getElementById('quick-jumps'),

    // Digital medium
    sampleRateSelect: document.getElementById('sr-preset'),
    customSrInput: document.getElementById('sr-custom'),
    bitDepthSelect: document.getElementById('bit-depth-select'),
    nyquistReadout: document.getElementById('nyquist-readout'),
    highestModeReadout: document.getElementById('highest-mode-readout'),
    delaySamplesReadout: document.getElementById('delay-samples-readout'),
    stateMemReadout: document.getElementById('state-mem-readout'),
    wavCapReadout: document.getElementById('wav-cap-readout'),

    // Waveguide & Interpolator
    excitationSelect: document.getElementById('excitation-select'),
    excitationDesc: document.getElementById('excitation-desc'),
    interpolatorSelect: document.getElementById('interpolator-select'),
    inharmonicityRms: document.getElementById('inharmonicity-rms'),
    modesTableBody: document.getElementById('modes-table-body'),

    // Atmosphere
    atmPresetSelect: document.getElementById('atm-preset'),
    atmPresetNote: document.getElementById('atm-preset-note'),
    atmGamma: document.getElementById('atm-gamma'),
    atmG: document.getElementById('atm-g'),
    atmC: document.getElementById('atm-c'),
    atmScaleHeight: document.getElementById('atm-scale-height'),
    atmCutoff: document.getElementById('atm-cutoff'),
    atmCriticalOpen: document.getElementById('atm-crit-open'),
    atmCriticalStopped: document.getElementById('atm-crit-stopped'),

    // Limits grid chips
    limitAtm: document.getElementById('limit-atm-chip'),
    limitNyquist: document.getElementById('limit-nyquist-chip'),
    limitDelay: document.getElementById('limit-delay-chip'),
    limitWav: document.getElementById('limit-wav-chip'),

    // Render panel
    renderModeRadios: document.querySelectorAll('input[name="render-mode"]'),
    renderDurationSec: document.getElementById('render-duration-sec'),
    renderCycleCount: document.getElementById('render-cycle-count'),
    durationGroup: document.getElementById('render-duration-group'),
    cycleGroup: document.getElementById('render-cycle-group'),
    quoteSamples: document.getElementById('quote-samples'),
    quoteDuration: document.getElementById('quote-duration'),
    quoteSize: document.getElementById('quote-size'),
    quoteWarning: document.getElementById('quote-warning'),
    btnRender: document.getElementById('btn-render'),
    btnRoute: document.getElementById('btn-route'),
    btnCancelRender: document.getElementById('btn-cancel-render'),
    renderProgressBox: document.getElementById('render-progress-box'),
    progressBar: document.getElementById('render-progress-bar'),
    progressText: document.getElementById('render-progress-text'),
    renderResultBox: document.getElementById('render-result-box'),
    btnDownloadWav: document.getElementById('btn-download-wav'),
    audioPreviewContainer: document.getElementById('audio-preview-container'),
    audioPreview: document.getElementById('audio-preview'),

    // Score
    scorePre: document.getElementById('score-output'),
    btnCopyScore: document.getElementById('btn-copy-score'),
    btnDownloadScore: document.getElementById('btn-download-score'),
  };
}

// Length slider conversions
function lengthToSlider(m) {
  const clamped = Math.max(MIN_LENGTH_M, Math.min(MAX_LENGTH_M, m));
  return ((Math.log(clamped) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * 1000;
}

function sliderToLength(val) {
  const norm = val / 1000;
  return Math.exp(LOG_MIN + norm * (LOG_MAX - LOG_MIN));
}

// Quick jump targets
const JUMP_TARGETS = [
  { label: '8.575 mm (20 kHz ceiling)', length: 0.008575, unit: 'mm' },
  { label: '2.44 m (8′ rank ~70 Hz)', length: 2.4384, unit: 'm' },
  { label: '9.75 m (32′ rank ~17 Hz)', length: 9.7536, unit: 'm' },
  { label: '1 km (0.17 Hz infrasound)', length: 1000, unit: 'km' },
  { label: '53.84 km (Earth L_crit)', length: 53840, unit: 'km' },
  { label: '100 km (Kármán line)', length: 100000, unit: 'km' },
  { label: '6,371 km', length: 6.371e6, unit: 'km' },
  { label: '40,075 km (maximum)', length: 4.0075e7, unit: 'km' },
];

function populateQuickJumps() {
  els.quickJumps.innerHTML = '';
  JUMP_TARGETS.forEach((target) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-jump';
    btn.textContent = target.label;
    btn.addEventListener('click', () => {
      setLength(target.length);
    });
    els.quickJumps.appendChild(btn);
  });
}

function populateDropdowns() {
  // Atmosphere presets
  els.atmPresetSelect.innerHTML = '';
  PRESETS.forEach((p) => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    els.atmPresetSelect.appendChild(opt);
  });

  // Sample rate presets
  els.sampleRateSelect.innerHTML = '';
  SAMPLE_RATE_PRESETS.forEach((sr) => {
    const opt = document.createElement('option');
    opt.value = sr.value;
    opt.textContent = sr.label;
    els.sampleRateSelect.appendChild(opt);
  });
  const customOpt = document.createElement('option');
  customOpt.value = 'custom';
  customOpt.textContent = 'Custom sample rate...';
  els.sampleRateSelect.appendChild(customOpt);

  // Bit depth
  els.bitDepthSelect.innerHTML = '';
  BIT_DEPTH_OPTIONS.forEach((bd) => {
    const opt = document.createElement('option');
    opt.value = bd.value;
    opt.textContent = bd.label;
    els.bitDepthSelect.appendChild(opt);
  });

  // Excitations
  els.excitationSelect.innerHTML = '';
  EXCITATION_TYPES.forEach((ex) => {
    const opt = document.createElement('option');
    opt.value = ex.id;
    opt.textContent = ex.name;
    els.excitationSelect.appendChild(opt);
  });

  // Interpolators
  els.interpolatorSelect.innerHTML = '';
  INTERPOLATOR_TYPES.forEach((it) => {
    const opt = document.createElement('option');
    opt.value = it.id;
    opt.textContent = it.name;
    els.interpolatorSelect.appendChild(opt);
  });
}

function setLength(newM) {
  state.lengthM = Math.max(MIN_LENGTH_M, Math.min(MAX_LENGTH_M, newM));
  updateUi();
}

function updateUi() {
  const { lengthM, mode, atm, sampleRate, bitDepth, interpolatorType, excitationType } = state;

  // 1. Update Pipe Controls
  const sliderVal = lengthToSlider(lengthM);
  els.slider.value = sliderVal;

  const unitFactor = parseFloat(els.unitSelect.value) || 1;
  els.numInput.value = (lengthM / unitFactor).toPrecision(5);

  const pipeDesc = describePipe(lengthM, atm, mode);
  scaleView.update({ lengthM, mode, hz: pipeDesc.hz });
  rankPanel?.refresh();
  document.getElementById('frequency-number').value = pipeDesc.hz.toPrecision(7);
  const medDesc = describeDigitalMedium(lengthM, atm, mode, sampleRate, bitDepth);
  const atmDesc = describeAtmosphere(atm);
  const interpDesc = analyzeModeDeviations({
    lengthM,
    atm,
    mode,
    sampleRate,
    interpolatorType,
    maxModes: 6,
  });

  // Pitch & Period
  els.pitchLead.textContent = fmtFreq(pipeDesc.hz);
  els.pitchTrail.textContent = `Period: ${fmtPeriod(pipeDesc.periodS)}`;

  // Categorical State
  const cat = medDesc.category;
  els.categoryChip.textContent = cat.toUpperCase();
  els.categoryChip.className = kindClassFor(cat);

  applySkin({ lengthM, category: cat });
  if (cat === 'note') {
    els.categoryNote.textContent = 'Sparse harmonic modes in the audible band. Distinct pitch percept.';
  } else if (cat === 'echo') {
    els.categoryNote.textContent = 'Dense harmonic modes. Round-trip reflections separate into a diffuse echo.';
  } else {
    els.categoryNote.textContent = `Single cycle spans ${fmtPeriod(pipeDesc.periodS)}. Mode density is continuous; output resolves as ultra-slow drift.`;
  }

  // Regime
  els.regimeChip.textContent = pipeDesc.regime.toUpperCase();
  els.regimeChip.className = `chip chip-regime chip-${pipeDesc.regime}`;
  els.regimeNote.textContent = regimeReport(pipeDesc, atmDesc);

  // Modes information
  els.modesInfo.textContent = `${fmtInt(medDesc.modesBelow20Hz)} modes below 20 Hz · ${fmtInt(medDesc.highestMode)} modes below Nyquist`;

  // Physical validity caveats
  if (lengthM < 0.05) {
    const errPct = (0.001 / lengthM) * 100;
    els.validityNote.textContent = `Physical caveat: Short pipe length (${fmtLength(lengthM)}). End-correction error (δ/L) is ~${errPct.toFixed(1)}% for a 1 mm bore. Ideal column arithmetic reported.`;
    els.validityNote.style.display = 'block';
  } else if (lengthM > 100000) {
    const atmFraction = (100000 / lengthM) * 100;
    els.validityNote.textContent = `Physical caveat: Column extends into space. Only ${atmFraction.toFixed(2)}% of length sits within the continuum atmosphere (Kármán line ~100 km).`;
    els.validityNote.style.display = 'block';
  } else {
    els.validityNote.style.display = 'none';
  }

  // Scale note
  els.scaleNote.textContent = `${fmtLength(lengthM)} · ${lengthM.toExponential(4)} m · ${fmtNum(pipeDesc.scaleHeights, 3)} scale heights H`;

  // 2. Digital Medium Panel
  els.nyquistReadout.textContent = fmtFreq(medDesc.nyquistHz);
  els.highestModeReadout.textContent = fmtInt(medDesc.highestMode);
  els.delaySamplesReadout.textContent = `${fmtInt(medDesc.delaySamples)} samples (${medDesc.roundTripTimeS.toFixed(4)} s round-trip)`;
  els.stateMemReadout.textContent = `${fmtBytes(medDesc.stateSizeBytes)} (${medDesc.stateAllocatable ? 'Allocatable' : 'EXCEEDS SAFE BROWSER MEMORY'})`;
  els.stateMemReadout.className = medDesc.stateAllocatable ? 'val-good' : 'val-bad';
  els.wavCapReadout.textContent = `Max duration: ${fmtPeriod(medDesc.wavMaxDurationS)} (${fmtNum(medDesc.wavMaxCycles, 2)} cycles)`;

  // 3. Resonator & Interpolator
  const activeEx = EXCITATION_TYPES.find((e) => e.id === excitationType);
  els.excitationDesc.textContent = activeEx ? activeEx.description : '';
  els.inharmonicityRms.textContent = `RMS deviation ${interpDesc.percentRms.toFixed(4)}% · maximum ${interpDesc.percentMax.toFixed(4)}%`;
  els.modesTableBody.innerHTML = '';
  interpDesc.modes.forEach((m) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${m.n}</td>
      <td>${fmtFreq(m.targetHz)}</td>
      <td>${fmtFreq(m.realisedHz)}</td>
      <td>${m.realisedDelaySamples.toFixed(3)}</td>
      <td class="${Math.abs(m.percentDeviation) > 0.1 ? 'warn-cell' : ''}">${m.percentDeviation >= 0 ? '+' : ''}${m.percentDeviation.toFixed(4)}%</td>
    `;
    els.modesTableBody.appendChild(tr);
  });

  // 4. Atmosphere Panel
  els.atmGamma.value = atm.gamma;
  els.atmG.value = atm.g;
  els.atmC.value = atm.c;
  els.atmScaleHeight.textContent = fmtLength(atmDesc.scaleHeightM);
  els.atmCutoff.textContent = `${fmtFreq(atmDesc.cutoffHz)} (${fmtPeriod(atmDesc.cutoffPeriodS)})`;
  els.atmCriticalOpen.textContent = fmtLength(atmDesc.criticalOpenM);
  els.atmCriticalStopped.textContent = fmtLength(atmDesc.criticalStoppedM);

  // 5. Five Limits Grid
  updateLimitsGrid(pipeDesc, medDesc, atmDesc);

  // 6. Quotation for Render
  updateRenderQuote();

  // 7. Live Score
  updateScore();
}

function updateLimitsGrid(pipeDesc, medDesc, atmDesc) {
  // 1. Atmosphere limit (f1 < fa)
  const isBelowCutoff = pipeDesc.hz <= atmDesc.cutoffHz;
  els.limitAtm.className = `chip ${isBelowCutoff ? 'chip-limit-active' : 'chip-limit-idle'}`;
  if (!isBelowCutoff) {
    els.limitAtm.textContent = 'Clear (Propagating)';
  } else if (pipeDesc.lowestPropagating) {
    els.limitAtm.textContent =
      `ACTIVE (Evanescent — mode n = ${pipeDesc.lowestPropagating.n} carries)`;
  } else {
    els.limitAtm.textContent = 'ACTIVE (Evanescent wave)';
  }

  // 2. Nyquist limit
  const isNearNyquist = pipeDesc.hz > medDesc.nyquistHz * 0.5;
  els.limitNyquist.className = `chip ${isNearNyquist ? 'chip-limit-active' : 'chip-limit-idle'}`;
  els.limitNyquist.textContent = isNearNyquist ? 'ACTIVE (Approaching Nyquist)' : 'Clear (Well below Nyquist)';

  // 3. Delay line memory state
  els.limitDelay.className = `chip ${!medDesc.stateAllocatable ? 'chip-limit-active' : 'chip-limit-idle'}`;
  els.limitDelay.textContent = !medDesc.stateAllocatable ? 'ACTIVE (Exceeds heap memory)' : `Allocatable (${fmtBytes(medDesc.stateSizeBytes)})`;

  // 4. WAV 4GiB limit
  const quote = quoteRenderCost({
    lengthM: state.lengthM,
    atm: state.atm,
    mode: state.mode,
    sampleRate: state.sampleRate,
    bitDepth: state.bitDepth,
    renderMode: state.renderMode,
    durationSec: state.durationSec,
    cycleCount: state.cycleCount,
  });
  els.limitWav.className = `chip ${quote.exceedsWavLimit ? 'chip-limit-active' : 'chip-limit-idle'}`;
  els.limitWav.textContent = quote.exceedsWavLimit ? 'ACTIVE (Exceeds 4 GiB WAV RIFF)' : `Clear (${fmtBytes(quote.totalFileSizeBytes)})`;
}

function updateRenderQuote() {
  const quote = quoteRenderCost({
    lengthM: state.lengthM,
    atm: state.atm,
    mode: state.mode,
    sampleRate: state.sampleRate,
    bitDepth: state.bitDepth,
    renderMode: state.renderMode,
    durationSec: state.durationSec,
    cycleCount: state.cycleCount,
  });

  els.quoteSamples.textContent = `${fmtInt(quote.totalSamples)} samples`;
  els.quoteDuration.textContent = `${fmtPeriod(quote.totalDurationS)} (${quote.totalCycles.toFixed(4)} cycles)`;
  els.quoteSize.textContent = fmtBytes(quote.totalFileSizeBytes);

  // The instrument never dead-ends. When the requested settings cannot run,
  // it finds a route that can and offers it, naming what the route costs.
  const req = {
    lengthM: state.lengthM, atm: state.atm, mode: state.mode,
    sampleRate: state.sampleRate, bitDepth: state.bitDepth,
    renderMode: state.renderMode, durationSec: state.durationSec,
    cycleCount: state.cycleCount,
  };
  const route = planRenderRoute(req);
  state.route = route;

  if (route.needed && route.canRender) {
    const costs = route.steps.map((st) => st.cost).join('; ');
    els.quoteWarning.textContent =
      `These settings will not run: ${route.steps.map((st) => st.why).join('; ')}. `
      + `There is a route that does — ${costs}. The waveguide still runs; only its resolution changes.`;
    els.quoteWarning.style.display = 'block';
    els.btnRoute.style.display = '';
    els.btnRoute.textContent = route.steps.some((st) => st.kind === 'sampleRate')
      ? `Render at ${fmtRate(route.sampleRate)}`
      : 'Render the part that fits';
    els.btnRoute.disabled = state.isRendering;
    els.btnRender.disabled = true;
  } else if (!route.canRender) {
    els.quoteWarning.textContent =
      'No route found for these settings. Lower the sample rate or shorten the render.';
    els.quoteWarning.style.display = 'block';
    els.btnRoute.style.display = 'none';
    els.btnRender.disabled = true;
  } else {
    els.quoteWarning.style.display = 'none';
    els.btnRoute.style.display = 'none';
    els.btnRender.disabled = state.isRendering;
  }

  // Below the cutoff, rendering is a decision to proceed past a limit the
  // instrument has just stated. Name the gesture; do not obstruct it.
  const forced = isForced(state.lengthM, state.atm, state.mode);
  els.btnRender.textContent = forced ? 'Force through — render anyway' : 'Render WAV';
  els.btnRender.classList.toggle('is-forced', forced);
}

/**
 * A frequency ratio as octaves, for saying how far a threshold was missed.
 */
function fmtOctaves(ratio) {
  const oct = Math.log2(ratio);
  return `${fmtNum(oct, oct >= 10 ? 0 : 1)} octaves`;
}

/**
 * What the fundamental did against the two thresholds, and — when the
 * atmosphere forbids it — which mode carries instead.
 *
 * Folded in from Planetary Organs on 2026-09-03. That piece refuses to sound
 * below 20 Hz and names the threshold each rank failed; this one renders every
 * length, so the refusal cannot be the content and the report has to be. The
 * regime labels the FUNDAMENTAL: a pipe whose fundamental is evanescent may
 * still have propagating upper modes, and `lowestPropagating` is which.
 * Shared-physics contract: DEPENDENCIES.md.
 */
function regimeReport(pipe, atm) {
  if (pipe.regime === 'audible') {
    return `Propagates and is heard. ${fmtFreq(pipe.hz)} clears the `
      + `${fmtFreq(atm.cutoffHz)} cutoff and falls inside 20 Hz–20 kHz.`;
  }

  if (pipe.regime === 'ultrasonic') {
    return `Failed the 20 kHz hearing ceiling by ${fmtOctaves(pipe.hz / 20000)}. `
      + 'It propagates; hearing is what stops.';
  }

  if (pipe.regime === 'infrasonic') {
    return `Failed the ${HEARING_FLOOR_HZ} Hz hearing floor by `
      + `${fmtOctaves(HEARING_FLOOR_HZ / pipe.hz)}. It still propagates: `
      + `${fmtFreq(pipe.hz)} is above the ${fmtFreq(atm.cutoffHz)} cutoff.`;
  }

  let report = `Failed the acoustic cutoff. ${fmtFreq(pipe.hz)} is below `
    + `${fmtFreq(atm.cutoffHz)}, so the fundamental is evanescent rather than `
    + 'radiating.';
  if (pipe.lowestPropagating) {
    report += ` The pipe's mode n = ${pipe.lowestPropagating.n} clears it, at `
      + `${fmtFreq(pipe.lowestPropagating.hz)}.`;
  }
  return report;
}

function fmtRate(hz) {
  if (hz >= 1000) return `${(hz / 1000).toFixed(hz >= 10000 ? 1 : 2)} kHz`;
  return `${hz.toLocaleString(undefined, { maximumFractionDigits: 2 })} Hz`;
}

function updateScore() {
  const scoreMd = generateScore({
    pipe: { lengthM: state.lengthM, mode: state.mode },
    atm: state.atm,
    digitalMedium: {
      sampleRate: state.sampleRate,
      bitDepth: state.bitDepth,
      interpolatorType: state.interpolatorType,
      excitationType: state.excitationType,
    },
    renderConfig: {
      renderMode: state.renderMode,
      durationSec: state.durationSec,
      cycleCount: state.cycleCount,
    },
  });
  els.scorePre.textContent = scoreMd;
}

async function handleStartRender() {
  if (state.isRendering) return;

  state.isRendering = true;
  state.abortController = new AbortController();

  els.btnRender.disabled = true;
  els.btnCancelRender.disabled = false;
  els.renderProgressBox.style.display = 'block';
  els.renderResultBox.style.display = 'none';
  els.progressBar.style.width = '0%';
  els.progressText.textContent = 'Starting waveguide simulation…';

  // Even a routed rate can fail to allocate on a machine with less headroom
  // than the one the ceiling was measured on. An allocation failure is not a
  // dead end either: halve the rate and try again, saying so each time.
  let attempt = 0;
  const MAX_RETRIES = 6;

  try {
    /* eslint-disable no-constant-condition */
    const result = await (async function run() {
      while (true) {
        try {
          return await startOnce();
        } catch (err) {
          const isAlloc = err instanceof RangeError
            || /allocation failed|Invalid (typed )?array length|exceeds memory/i.test(String(err && err.message));
          if (!isAlloc || attempt >= MAX_RETRIES) throw err;
          attempt += 1;
          state.sampleRate = Math.max(1e-6, state.sampleRate / 2);
          els.sampleRateSelect.value = 'custom';
          els.customSrInput.style.display = 'inline-block';
          els.customSrInput.value = state.sampleRate;
          els.progressText.textContent =
            `Delay line would not allocate. Retrying at ${fmtRate(state.sampleRate)} `
            + `(attempt ${attempt} of ${MAX_RETRIES}) — the waveguide still runs, at lower resolution.`;
        }
      }
    })();

    function startOnce() {
      return renderOffline(
      {
        lengthM: state.lengthM,
        atm: state.atm,
        mode: state.mode,
        sampleRate: state.sampleRate,
        bitDepth: state.bitDepth,
        excitationType: state.excitationType,
        interpolatorType: state.interpolatorType,
        lossFactor: state.lossFactor,
        renderMode: state.renderMode,
        durationSec: state.durationSec,
        cycleCount: state.cycleCount,
        normalize: true,
      },
      (prog) => {
        els.progressBar.style.width = `${prog.percent.toFixed(1)}%`;
        els.progressText.textContent = `${fmtInt(prog.renderedSamples)} of ${fmtInt(prog.totalSamples)} samples · ${prog.percent.toFixed(1)}% · about ${(prog.estimatedRemainingMs / 1000).toFixed(1)} s remaining`;
      },
      state.abortController.signal
      );
    }

    state.lastRenderResult = result;
    showRenderResult(result);
    if (attempt > 0) {
      els.progressText.textContent =
        `Rendered at ${fmtRate(state.sampleRate)} after ${attempt} `
        + `${attempt === 1 ? 'reduction' : 'reductions'}; the delay line would not allocate above that.`;
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      els.progressText.textContent = 'Render cancelled.';
    } else {
      els.progressText.textContent = `Render failed: ${err.message}`;
      console.error(err);
    }
  } finally {
    state.isRendering = false;
    state.abortController = null;
    els.btnRender.disabled = false;
    els.btnCancelRender.disabled = true;
    updateRenderQuote();
  }
}

function showRenderResult(result) {
  els.renderProgressBox.style.display = 'none';
  els.renderResultBox.style.display = 'block';

  els.btnDownloadWav.textContent = `Download WAV (${fmtBytes(result.wavBytes.length)})`;
  els.btnDownloadWav.onclick = () => {
    const a = document.createElement('a');
    a.href = result.downloadUrl;
    a.download = result.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // If audible and short enough for browser audio element preview
  if (result.sampleRate >= 8000 && result.totalDurationS <= 30) {
    els.audioPreviewContainer.style.display = 'block';
    els.audioPreview.src = result.downloadUrl;
  } else {
    els.audioPreviewContainer.style.display = 'none';
    els.audioPreview.src = '';
  }
}

function setupEventListeners() {
  // Slider & Number Input
  els.slider.addEventListener('input', () => {
    setLength(sliderToLength(parseFloat(els.slider.value)));
  });

  els.numInput.addEventListener('change', () => {
    const val = parseFloat(els.numInput.value);
    const unitFactor = parseFloat(els.unitSelect.value) || 1;
    if (Number.isFinite(val) && val > 0) {
      setLength(val * unitFactor);
    }
  });

  document.getElementById('frequency-number').addEventListener('change', (event) => {
    const hz = Number(event.target.value);
    if (Number.isFinite(hz) && hz > 0) setLength(pipeLengthForHz(hz, state.atm, state.mode));
    else updateUi();
  });

  els.unitSelect.addEventListener('change', () => {
    const unitFactor = parseFloat(els.unitSelect.value) || 1;
    els.numInput.value = (state.lengthM / unitFactor).toPrecision(5);
  });

  // Pipe Mode
  els.modeRadios.forEach((radio) => {
    radio.addEventListener('change', () => {
      if (radio.checked) {
        state.mode = radio.value;
        updateUi();
      }
    });
  });

  // Sample Rate
  els.sampleRateSelect.addEventListener('change', () => {
    const val = els.sampleRateSelect.value;
    if (val === 'custom') {
      els.customSrInput.style.display = 'inline-block';
      state.sampleRate = parseFloat(els.customSrInput.value) || 48000;
    } else {
      els.customSrInput.style.display = 'none';
      state.sampleRate = parseFloat(val);
    }
    updateUi();
  });

  els.customSrInput.addEventListener('change', () => {
    const val = parseFloat(els.customSrInput.value);
    if (Number.isFinite(val) && val > 0) {
      state.sampleRate = val;
      updateUi();
    }
  });

  // Bit Depth
  els.bitDepthSelect.addEventListener('change', () => {
    state.bitDepth = parseInt(els.bitDepthSelect.value, 10);
    updateUi();
  });

  // Excitation
  els.excitationSelect.addEventListener('change', () => {
    state.excitationType = els.excitationSelect.value;
    updateUi();
  });

  // Interpolator
  els.interpolatorSelect.addEventListener('change', () => {
    state.interpolatorType = els.interpolatorSelect.value;
    updateUi();
  });

  // Atmosphere Presets
  els.atmPresetSelect.addEventListener('change', () => {
    state.atmPresetId = els.atmPresetSelect.value;
    const preset = presetById(state.atmPresetId);
    state.atm = toAtmosphere(preset);
    els.atmPresetNote.textContent = preset.note || '';
    updateUi();
  });

  // Atmosphere Custom inputs
  ['atmGamma', 'atmG', 'atmC'].forEach((key) => {
    els[key].addEventListener('change', () => {
      state.atm = {
        gamma: parseFloat(els.atmGamma.value) || 1.4,
        g: parseFloat(els.atmG.value) || 9.80665,
        c: parseFloat(els.atmC.value) || 343.0,
      };
      els.atmPresetSelect.value = 'custom';
      updateUi();
    });
  });

  // Render Mode
  els.renderModeRadios.forEach((r) => {
    r.addEventListener('change', () => {
      if (r.checked) {
        state.renderMode = r.value;
        if (state.renderMode === 'duration') {
          els.durationGroup.style.display = 'block';
          els.cycleGroup.style.display = 'none';
        } else {
          els.durationGroup.style.display = 'none';
          els.cycleGroup.style.display = 'block';
        }
        updateRenderQuote();
        updateScore();
      }
    });
  });

  els.renderDurationSec.addEventListener('input', () => {
    const val = parseFloat(els.renderDurationSec.value);
    if (Number.isFinite(val) && val > 0) {
      state.durationSec = val;
      updateRenderQuote();
      updateScore();
    }
  });

  els.renderCycleCount.addEventListener('input', () => {
    const val = parseFloat(els.renderCycleCount.value);
    if (Number.isFinite(val) && val > 0) {
      state.cycleCount = val;
      updateRenderQuote();
      updateScore();
    }
  });

  // Render Buttons
  els.btnRender.addEventListener('click', handleStartRender);

  // Take the route: apply the degradations the plan named, then render. The
  // controls move visibly, so what was changed is on screen rather than hidden.
  els.btnRoute.addEventListener('click', () => {
    const route = state.route;
    if (!route || !route.canRender) return;
    state.sampleRate = route.sampleRate;
    state.renderMode = route.renderMode;
    state.durationSec = route.durationSec;
    state.cycleCount = route.cycleCount;

    // Move the controls so the change is visible rather than applied behind
    // the interface. The user should be able to see what the route cost.
    els.sampleRateSelect.value = 'custom';
    els.customSrInput.style.display = 'inline-block';
    els.customSrInput.value = route.sampleRate;
    els.renderDurationSec.value = route.durationSec;
    els.renderCycleCount.value = route.cycleCount;
    els.renderModeRadios.forEach((r) => { r.checked = (r.value === route.renderMode); });

    updateUi();
    handleStartRender();
  });
  els.btnCancelRender.addEventListener('click', () => {
    if (state.abortController) {
      state.abortController.abort();
    }
  });

  // Score Copy & Download
  els.btnCopyScore.addEventListener('click', async () => {
    const text = els.scorePre.textContent;
    try {
      await navigator.clipboard.writeText(text);
      els.btnCopyScore.textContent = 'Copied';
      setTimeout(() => {
        els.btnCopyScore.textContent = 'Copy score';
      }, 2000);
    } catch (e) {
      console.error(e);
    }
  });

  els.btnDownloadScore.addEventListener('click', () => {
    const text = els.scorePre.textContent;
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `unbounded-organ_score_${state.mode}_${state.lengthM}m.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
}

// Initialization on DOMContentLoaded
/**
 * The two views are one instrument. The rank view reads the atmosphere from
 * here and owns everything else, so switching tabs changes what is being
 * composed rather than what the model is.
 */
function setupViewTabs() {
  const rank = createRankPanel(document.getElementById('view-rank'), {
    getAtmosphere: () => state.atm,
  });
  const views = {
    pipe: document.getElementById('view-pipe'),
    rank: document.getElementById('view-rank'),
  };
  const tabs = [...document.querySelectorAll('.view-tab')];
  const show = (name) => {
    for (const [key, node] of Object.entries(views)) node.hidden = key !== name;
    for (const tab of tabs) tab.setAttribute('aria-pressed', String(tab.dataset.view === name));
    if (name === 'rank') rank.refresh();
  };
  for (const tab of tabs) tab.addEventListener('click', () => show(tab.dataset.view));
  return rank;
}

// Initialization on DOMContentLoaded
window.addEventListener('DOMContentLoaded', () => {
  initDom();
  populateDropdowns();
  populateQuickJumps();
  setupEventListeners();
  updateUi();
  rankPanel = setupViewTabs();
});
