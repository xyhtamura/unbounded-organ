/**
 * The Unbounded Organ — rank roll.
 *
 * A roll whose vertical axis is pipe length on a logarithmic scale, not pitch.
 * A pitch axis would quietly restore the range restriction the instrument is
 * named for: past the hearing floor there is no note to place on it. Length
 * stays meaningful across the whole 8.575 mm to 40,075 km range, so the same
 * roll holds a chord of organ pipes and a chord of continents.
 *
 * Geometry and hit testing are pure and exported; the drawing owns a canvas.
 */

import { pipeLengthForHz, criticalLength, HEARING_FLOOR_HZ, HEARING_CEILING_HZ } from './physics.js';
import { withVoiceDefaults, describeRank, poolUsage, equalLengthCeiling } from './polyphony.js';
import { fmtLength, fmtFreq } from './format.js';

export const MIN_LENGTH_M = 0.008575;
export const MAX_LENGTH_M = 4.0075e7;
const LOG_MIN = Math.log(MIN_LENGTH_M);
const LOG_MAX = Math.log(MAX_LENGTH_M);

/** Bar thickness and the grab margin on a bar's right edge, in CSS pixels. */
export const BAR_HEIGHT = 11;
export const EDGE_GRAB_PX = 7;

/** Short pipes at the top, so higher pitch reads upward as on any roll. */
export function lengthToUnit(lengthM) {
  const clamped = Math.max(MIN_LENGTH_M, Math.min(MAX_LENGTH_M, lengthM));
  return (Math.log(clamped) - LOG_MIN) / (LOG_MAX - LOG_MIN);
}

export function unitToLength(unit) {
  const clamped = Math.max(0, Math.min(1, unit));
  return Math.exp(LOG_MIN + clamped * (LOG_MAX - LOG_MIN));
}

/** Plot rectangle inside the canvas: left gutter for labels, bottom for time. */
export const plotBox = (width, height) => ({
  x: 74, y: 14, w: Math.max(1, width - 88), h: Math.max(1, height - 46),
});

export const lengthToY = (lengthM, box) => box.y + lengthToUnit(lengthM) * box.h;
export const yToLength = (y, box) => unitToLength((y - box.y) / box.h);
export const timeToX = (t, box, spanS) => box.x + (t / spanS) * box.w;
export const xToTime = (x, box, spanS) => ((x - box.x) / box.w) * spanS;

/**
 * Which voice is under a point, and which part of it.
 *
 * Later voices win, so a bar dropped on top of another is the one you grab.
 * Returns null outside every bar.
 */
export function hitTest(px, py, voices, box, spanS) {
  for (let i = voices.length - 1; i >= 0; i--) {
    const v = withVoiceDefaults(voices[i]);
    const y = lengthToY(v.lengthM, box);
    if (Math.abs(py - y) > BAR_HEIGHT / 2) continue;
    const x0 = timeToX(v.startS, box, spanS);
    const x1 = timeToX(v.startS + finiteDuration(v, spanS), box, spanS);
    if (px < x0 - 2 || px > x1 + 2) continue;
    return { index: i, part: px >= x1 - EDGE_GRAB_PX ? 'end' : 'body' };
  }
  return null;
}

/** A voice with no release still has to be drawn as something. */
export const finiteDuration = (voice, spanS) =>
  Number.isFinite(voice.durationS) ? voice.durationS : spanS - voice.startS;

/** Decade rules, which is the only grid that reads across ten orders of magnitude. */
export function decadeLines() {
  const out = [];
  for (let e = -2; e <= 7; e++) {
    const m = 10 ** e;
    if (m >= MIN_LENGTH_M && m <= MAX_LENGTH_M) out.push(m);
  }
  return out;
}

/**
 * The lines that mean something: the two hearing bounds and the atmosphere's
 * acoustic cutoff, as lengths rather than frequencies.
 */
export function thresholdLines(atm, mode = 'open') {
  return [
    { lengthM: pipeLengthForHz(HEARING_CEILING_HZ, atm, mode), label: '20 kHz ceiling' },
    { lengthM: pipeLengthForHz(HEARING_FLOOR_HZ, atm, mode), label: '20 Hz floor' },
    { lengthM: criticalLength(atm, mode), label: 'acoustic cutoff' },
  ].filter(l => l.lengthM >= MIN_LENGTH_M && l.lengthM <= MAX_LENGTH_M);
}

const COLOR = {
  ink: '#d7cbb0',
  dim: '#95a89e',
  rule: 'rgba(174,196,176,.10)',
  strongRule: 'rgba(174,196,176,.30)',
  audible: '#e2d5a5',
  infrasonic: '#8fb0a4',
  forced: '#b98a72',
  selected: '#fff6d2',
  budget: 'rgba(185,138,114,.16)',
};

const voiceColor = entry => {
  if (!entry.propagates) return COLOR.forced;
  return entry.audible ? COLOR.audible : COLOR.infrasonic;
};

export function createRollView(canvas, { onChange, onSelect }) {
  const ctx = canvas.getContext('2d');
  let voices = [];
  let atm = null;
  let spanS = 8;
  let sampleRate = 48000;
  let selected = -1;
  let drag = null;
  let frame = 0;

  const schedule = () => { if (!frame) frame = requestAnimationFrame(draw); };
  const commit = () => { onChange?.(voices.map(withVoiceDefaults)); schedule(); };

  function draw() {
    frame = 0;
    if (!atm) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    // Same supersampling the size comparison uses: the audio is offline, so
    // the drawing has the machine to itself.
    const res = Math.min(devicePixelRatio || 1, 2) * 2;
    if (canvas.width !== Math.round(w * res) || canvas.height !== Math.round(h * res)) {
      canvas.width = Math.round(w * res);
      canvas.height = Math.round(h * res);
    }
    ctx.setTransform(res, 0, 0, res, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const box = plotBox(w, h);

    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#152325');
    bg.addColorStop(1, '#26352e');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.font = `${w < 520 ? 9 : 10}px "IBM Plex Mono", monospace`;
    ctx.lineWidth = 1;

    // What the pool can no longer afford. Everything above this line fits;
    // a voice placed below it would overrun the delay-line ceiling.
    const headroom = poolUsage(voices, atm, sampleRate).headroomSamples;
    const affordableM = Math.max(0, headroom) * atm.c / (2 * sampleRate);
    if (affordableM < MAX_LENGTH_M) {
      const yLimit = lengthToY(Math.max(affordableM, MIN_LENGTH_M), box);
      ctx.fillStyle = COLOR.budget;
      ctx.fillRect(box.x, yLimit, box.w, box.y + box.h - yLimit);
      ctx.strokeStyle = COLOR.forced;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(box.x, yLimit);
      ctx.lineTo(box.x + box.w, yLimit);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = COLOR.forced;
      ctx.textAlign = 'right';
      ctx.fillText('pool exhausted', box.x + box.w - 4, yLimit + 11);
    }

    ctx.textAlign = 'right';
    for (const m of decadeLines()) {
      const y = lengthToY(m, box);
      ctx.strokeStyle = COLOR.rule;
      ctx.beginPath();
      ctx.moveTo(box.x, y);
      ctx.lineTo(box.x + box.w, y);
      ctx.stroke();
      ctx.fillStyle = COLOR.dim;
      ctx.fillText(fmtLength(m), box.x - 6, y + 3);
    }

    for (const line of thresholdLines(atm)) {
      const y = lengthToY(line.lengthM, box);
      ctx.strokeStyle = COLOR.strongRule;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(box.x, y);
      ctx.lineTo(box.x + box.w, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = COLOR.dim;
      ctx.textAlign = 'left';
      ctx.fillText(line.label, box.x + 4, y - 3);
      ctx.textAlign = 'right';
    }

    // Time ruler.
    const tickStep = 10 ** Math.floor(Math.log10(spanS / 4));
    ctx.textAlign = 'center';
    for (let t = 0; t <= spanS + 1e-9; t += tickStep) {
      const x = timeToX(t, box, spanS);
      ctx.strokeStyle = COLOR.rule;
      ctx.beginPath();
      ctx.moveTo(x, box.y);
      ctx.lineTo(x, box.y + box.h);
      ctx.stroke();
      ctx.fillStyle = COLOR.dim;
      ctx.fillText(`${+t.toFixed(3)}s`, x, box.y + box.h + 14);
    }
    ctx.strokeStyle = 'rgba(135,154,121,.45)';
    ctx.strokeRect(box.x, box.y, box.w, box.h);

    const report = describeRank(voices, atm);
    voices.forEach((raw, i) => {
      const v = withVoiceDefaults(raw);
      const y = lengthToY(v.lengthM, box);
      const x0 = timeToX(v.startS, box, spanS);
      const x1 = timeToX(v.startS + finiteDuration(v, spanS), box, spanS);
      ctx.fillStyle = voiceColor(report.entries[i]);
      ctx.fillRect(x0, y - BAR_HEIGHT / 2, Math.max(3, x1 - x0), BAR_HEIGHT);
      if (v.mode === 'stopped') {
        // A stopped pipe carries a cap, drawn the way the pipe drawing does.
        ctx.fillStyle = '#17211e';
        ctx.fillRect(x1 - 3, y - BAR_HEIGHT / 2, 3, BAR_HEIGHT);
      }
      if (i === selected) {
        ctx.strokeStyle = COLOR.selected;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x0 - 1.5, y - BAR_HEIGHT / 2 - 1.5, Math.max(3, x1 - x0) + 3, BAR_HEIGHT + 3);
        ctx.lineWidth = 1;
        ctx.fillStyle = COLOR.ink;
        ctx.textAlign = 'left';
        ctx.fillText(`${fmtLength(v.lengthM)} · ${fmtFreq(report.entries[i].hz)}`,
          x0, y - BAR_HEIGHT / 2 - 5);
      }
    });

    if (voices.length === 0) {
      ctx.fillStyle = COLOR.dim;
      ctx.textAlign = 'center';
      ctx.fillText('Click to place a pipe.', box.x + box.w / 2, box.y + box.h / 2);
    }
  }

  const pointerAt = e => {
    const r = canvas.getBoundingClientRect();
    return { px: e.clientX - r.left, py: e.clientY - r.top };
  };

  canvas.addEventListener('pointerdown', e => {
    const { px, py } = pointerAt(e);
    const box = plotBox(canvas.clientWidth, canvas.clientHeight);
    const hit = hitTest(px, py, voices, box, spanS);
    if (hit) {
      selected = hit.index;
      const v = withVoiceDefaults(voices[hit.index]);
      drag = { ...hit, grabX: px, grabY: py, startS: v.startS, lengthM: v.lengthM,
        durationS: finiteDuration(v, spanS) };
    } else {
      const startS = Math.max(0, Math.min(spanS, xToTime(px, box, spanS)));
      voices = voices.concat([withVoiceDefaults({
        lengthM: yToLength(py, box),
        startS,
        durationS: Math.min(spanS / 8, Math.max(0.05, spanS - startS)),
      })]);
      selected = voices.length - 1;
      drag = { index: selected, part: 'end', grabX: px, grabY: py, startS,
        lengthM: voices[selected].lengthM, durationS: voices[selected].durationS };
      commit();
    }
    onSelect?.(selected);
    try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
    schedule();
  });

  canvas.addEventListener('pointermove', e => {
    if (!drag) return;
    const { px, py } = pointerAt(e);
    const box = plotBox(canvas.clientWidth, canvas.clientHeight);
    const v = { ...withVoiceDefaults(voices[drag.index]) };
    if (drag.part === 'end') {
      const end = xToTime(px, box, spanS);
      v.durationS = Math.max(0.01, Math.min(spanS - v.startS, end - v.startS));
    } else {
      const dt = xToTime(px, box, spanS) - xToTime(drag.grabX, box, spanS);
      v.startS = Math.max(0, Math.min(spanS - drag.durationS, drag.startS + dt));
      v.lengthM = yToLength(drag.grabY + (py - drag.grabY), box);
    }
    voices = voices.map((old, i) => (i === drag.index ? v : old));
    commit();
  });

  for (const done of ['pointerup', 'pointercancel']) {
    canvas.addEventListener(done, e => {
      if (!drag) return;
      drag = null;
      try {
        if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      } catch { /* synthetic pointer */ }
      schedule();
    });
  }

  new ResizeObserver(schedule).observe(canvas);

  return {
    update(next) {
      if (next.voices) voices = next.voices.map(withVoiceDefaults);
      if (next.atm) atm = next.atm;
      if (next.spanS) spanS = next.spanS;
      if (next.sampleRate) sampleRate = next.sampleRate;
      if (next.selected !== undefined) selected = next.selected;
      schedule();
    },
    getVoices: () => voices.map(withVoiceDefaults),
    getSelected: () => selected,
    setSelected(i) { selected = i; schedule(); },
    redraw: schedule,
  };
}
