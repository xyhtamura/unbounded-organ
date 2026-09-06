/**
 * The Unbounded Organ — rank view.
 *
 * The polyphonic half of the instrument. It owns its own state and reads only
 * the atmosphere from the pipe view, so switching tabs changes what is being
 * composed and not what the model is.
 *
 * The pipe view explains one pipe against two thresholds. A rank has as many
 * answers as voices, so this view counts them instead of repeating the
 * explanation once per voice.
 */

import { createRollView, MIN_LENGTH_M, MAX_LENGTH_M } from './roll-view.js';
import {
  describeRank, poolUsage, planPolyphonicRoute, transposeRank,
  equalLengthCeiling, rankSpanS, withVoiceDefaults,
} from './polyphony.js';
import { renderRank } from './render.js';
import { SAMPLE_RATE_PRESETS, BIT_DEPTH_OPTIONS } from './digital_medium.js';
import { FOOT_M } from './physics.js';
import { fmtLength, fmtFreq, fmtBytes, fmtInt } from './format.js';

/** A principal chorus, in the feet the stops are named for. */
const PRINCIPAL_FEET = [16, 8, 4, 8 / 3, 2, 8 / 5, 4 / 3, 1];

export const RANK_PRESETS = [
  {
    id: 'principal',
    name: 'Principal chorus',
    note: 'Eight stops of one manual. Every voice is audible; the pool is barely touched.',
    voices: PRINCIPAL_FEET.map((ft, i) => ({
      lengthM: ft * FOOT_M, startS: 0, durationS: 3 + i * 0.1, mode: 'open',
    })),
  },
  {
    id: 'straddle',
    name: 'Straddling rank',
    note: 'Six pipes spread across both thresholds, so the set report has something to count.',
    voices: [
      { lengthM: 2.4384, startS: 0, durationS: 6 },
      { lengthM: 8.575, startS: 0.5, durationS: 5.5 },
      { lengthM: 100, startS: 1, durationS: 5 },
      { lengthM: 1000, startS: 1.5, durationS: 4.5 },
      { lengthM: 100000, startS: 2, durationS: 4 },
      { lengthM: 6371000, startS: 2.5, durationS: 3.5 },
    ],
  },
  {
    id: 'cascade',
    name: 'Octave cascade',
    note: 'One pipe doubling every half second, walking out of hearing as it goes.',
    voices: Array.from({ length: 10 }, (_, i) => ({
      lengthM: 0.6096 * 2 ** i, startS: i * 0.5, durationS: 6 - i * 0.5,
    })),
  },
];

const el = (root, sel) => root.querySelector(sel);

export function createRankPanel(root, { getAtmosphere }) {
  const canvas = el(root, '[data-roll]');
  const state = {
    voices: RANK_PRESETS[0].voices.map(withVoiceDefaults),
    spanS: 8,
    sampleRate: 48000,
    bitDepth: 16,
    excitationType: 'impulse',
    selected: -1,
    rendering: false,
    abort: null,
  };

  const roll = createRollView(canvas, {
    onChange(voices) { state.voices = voices; report(); },
    onSelect(index) { state.selected = index; report(); },
  });

  const presetSelect = el(root, '[data-preset]');
  for (const p of RANK_PRESETS) {
    presetSelect.add(new Option(p.name, p.id));
  }
  const rateSelect = el(root, '[data-rate]');
  for (const r of SAMPLE_RATE_PRESETS) rateSelect.add(new Option(r.label, String(r.value)));
  rateSelect.value = '48000';
  const depthSelect = el(root, '[data-depth]');
  for (const b of BIT_DEPTH_OPTIONS) depthSelect.add(new Option(b.label, String(b.value)));
  depthSelect.value = '16';

  const spanInput = el(root, '[data-span]');
  const transposeInput = el(root, '[data-transpose]');
  const transposeNote = el(root, '[data-transpose-note]');
  const summary = el(root, '[data-rank-summary]');
  const poolLine = el(root, '[data-pool]');
  const voiceLine = el(root, '[data-voice]');
  const renderBtn = el(root, '[data-render]');
  const routeNote = el(root, '[data-route]');
  const progress = el(root, '[data-progress]');
  const output = el(root, '[data-output]');

  /** Everything the view says about the rank, recomputed in one place. */
  function report() {
    const atm = getAtmosphere();
    const rank = describeRank(state.voices, atm);
    const pool = poolUsage(state.voices, atm, state.sampleRate);
    roll.update({
      voices: state.voices, atm, spanS: state.spanS,
      sampleRate: state.sampleRate, selected: state.selected,
    });

    if (rank.voiceCount === 0) {
      summary.textContent = 'No pipes. Click the roll to place one.';
    } else {
      const parts = [`${fmtInt(rank.voiceCount)} pipes`];
      parts.push(`${fmtInt(rank.audible)} audible, ${fmtInt(rank.inaudible)} not`);
      if (rank.forced > 0) {
        parts.push(`${fmtInt(rank.forced)} below the ${fmtFreq(rank.cutoffHz)} cutoff`);
      }
      parts.push(`${fmtFreq(rank.lowest.hz)} to ${fmtFreq(rank.highest.hz)}`);
      summary.textContent = `${parts.join(' · ')}.`;
    }

    const ceiling = equalLengthCeiling(Math.max(1, rank.voiceCount), atm, state.sampleRate);
    poolLine.textContent = pool.fits
      ? `Delay lines: ${fmtBytes(pool.totalStateBytes)} of `
        + `${fmtBytes(pool.poolSamples * 8)}, ${(pool.fractionUsed * 100).toFixed(2)}% used. `
        + `At this rate ${fmtInt(Math.max(1, rank.voiceCount))} pipes of equal length reach `
        + `${fmtLength(ceiling)} each.`
      : `Delay lines need ${fmtBytes(pool.totalStateBytes)}, over the `
        + `${fmtBytes(pool.poolSamples * 8)} ceiling. Lower the sample rate or shorten the pipes.`;
    poolLine.dataset.over = String(!pool.fits);

    if (state.selected >= 0 && state.selected < state.voices.length) {
      const v = state.voices[state.selected];
      const entry = rank.entries[state.selected];
      voiceLine.textContent = `Selected: ${fmtLength(v.lengthM)} ${v.mode}, `
        + `${fmtFreq(entry.hz)}, from ${v.startS.toFixed(2)} s for ${v.durationS.toFixed(2)} s.`;
    } else {
      voiceLine.textContent = 'No pipe selected. Click one to change or remove it.';
    }

    const span = rankSpanS(state.voices);
    if (span > state.spanS) {
      state.spanS = Math.ceil(span);
      spanInput.value = String(state.spanS);
    }
  }

  presetSelect.addEventListener('change', () => {
    const preset = RANK_PRESETS.find(p => p.id === presetSelect.value);
    if (!preset) return;
    state.voices = preset.voices.map(withVoiceDefaults);
    state.selected = -1;
    el(root, '[data-preset-note]').textContent = preset.note;
    report();
  });
  el(root, '[data-preset-note]').textContent = RANK_PRESETS[0].note;

  spanInput.addEventListener('change', () => {
    const next = Number(spanInput.value);
    if (Number.isFinite(next) && next > 0) state.spanS = next;
    spanInput.value = String(state.spanS);
    report();
  });

  rateSelect.addEventListener('change', () => {
    state.sampleRate = Number(rateSelect.value);
    report();
  });
  depthSelect.addEventListener('change', () => {
    state.bitDepth = Number(depthSelect.value);
    report();
  });

  // Transposition is a rigid shift on a logarithmic length axis. The count it
  // reports — how many voices the shift throws out of hearing — is the point
  // of the control, not a side effect of it.
  //
  // The slider is in octaves of pitch, so up is up. Length runs the other way:
  // an octave higher is half the pipe, which is why the ratio is negated.
  const lengthRatio = octaves => 2 ** -octaves;

  transposeInput.addEventListener('input', () => {
    const octaves = Number(transposeInput.value);
    const atm = getAtmosphere();
    const preview = transposeRank(state.voices, lengthRatio(octaves), atm);
    const clipped = preview.voices.some(
      v => v.lengthM < MIN_LENGTH_M || v.lengthM > MAX_LENGTH_M);
    transposeNote.textContent = octaves === 0
      ? 'No shift.'
      : `${octaves > 0 ? '+' : ''}${octaves} octave${Math.abs(octaves) === 1 ? '' : 's'}: `
        + `${preview.lostAudible} out of hearing, ${preview.gainedAudible} into it`
        + (preview.lostPropagating > 0 ? `, ${preview.lostPropagating} below the cutoff` : '')
        + (clipped ? '. Some pipes leave the range and will be clamped.' : '.');
  });

  el(root, '[data-transpose-apply]').addEventListener('click', () => {
    const octaves = Number(transposeInput.value);
    if (octaves === 0) return;
    const atm = getAtmosphere();
    state.voices = transposeRank(state.voices, lengthRatio(octaves), atm).voices.map(v => ({
      ...v, lengthM: Math.max(MIN_LENGTH_M, Math.min(MAX_LENGTH_M, v.lengthM)),
    }));
    transposeInput.value = '0';
    transposeNote.textContent = 'No shift.';
    report();
  });

  el(root, '[data-toggle-mode]').addEventListener('click', () => {
    if (state.selected < 0) return;
    state.voices = state.voices.map((v, i) => (
      i === state.selected ? { ...v, mode: v.mode === 'open' ? 'stopped' : 'open' } : v));
    report();
  });

  el(root, '[data-remove]').addEventListener('click', () => {
    if (state.selected < 0) return;
    state.voices = state.voices.filter((_, i) => i !== state.selected);
    state.selected = -1;
    roll.setSelected(-1);
    report();
  });

  el(root, '[data-clear]').addEventListener('click', () => {
    state.voices = [];
    state.selected = -1;
    roll.setSelected(-1);
    report();
  });

  root.addEventListener('keydown', e => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && state.selected >= 0
        && e.target === canvas) {
      e.preventDefault();
      el(root, '[data-remove]').click();
    }
  });
  canvas.tabIndex = 0;

  renderBtn.addEventListener('click', async () => {
    if (state.rendering) {
      state.abort?.abort();
      return;
    }
    const atm = getAtmosphere();
    if (state.voices.length === 0) {
      routeNote.textContent = 'Nothing to render. Place a pipe first.';
      return;
    }
    const durationSec = Math.max(0.1, rankSpanS(state.voices));
    const route = planPolyphonicRoute({
      voices: state.voices, atm, sampleRate: state.sampleRate,
      bitDepth: state.bitDepth, durationSec,
    });
    routeNote.textContent = route.needed
      ? route.steps.map(s => `${s.why} — ${s.cost}`).join(' Then: ')
      : '';
    if (!route.canRender) {
      routeNote.textContent = 'No route renders this rank. Shorten the pipes.';
      return;
    }

    state.rendering = true;
    state.abort = new AbortController();
    renderBtn.textContent = 'Cancel';
    output.innerHTML = '';
    try {
      const result = await renderRank({
        voices: state.voices, atm, sampleRate: route.sampleRate,
        bitDepth: state.bitDepth, excitationType: state.excitationType,
        durationSec: route.durationSec, normalize: true,
      }, p => {
        progress.textContent = `${p.percent.toFixed(1)}% · `
          + `${fmtInt(p.renderedSamples)} of ${fmtInt(p.totalSamples)} samples`;
      }, state.abort.signal);

      progress.textContent = `Rendered ${result.totalDurationS.toFixed(2)} s of `
        + `${fmtInt(result.rank.voiceCount)} pipes at ${fmtInt(result.sampleRate)} Hz. `
        + `Peak ${result.peakAmplitude.toFixed(3)}.`;
      const link = document.createElement('a');
      link.href = result.downloadUrl;
      link.download = result.filename;
      link.className = 'btn btn-sm';
      link.textContent = `Download ${result.filename}`;
      const audio = document.createElement('audio');
      audio.controls = true;
      audio.src = result.downloadUrl;
      output.append(link, audio);
    } catch (err) {
      progress.textContent = err.name === 'AbortError'
        ? 'Render cancelled.'
        : `Render failed: ${err.message}`;
    } finally {
      state.rendering = false;
      state.abort = null;
      renderBtn.textContent = 'Render rank';
    }
  });

  return {
    refresh: report,
    getVoices: () => state.voices,
  };
}
