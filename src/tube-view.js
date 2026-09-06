/**
 * Shaded tube for the audible regime. Decorative: every dimension the panel
 * reports is carried by scale-view's text and flat drawing, not by this.
 *
 * The length axis stays orthographic and vertical, so the panel's shared
 * metre-to-pixel scale survives rotation. Depth is applied to the cross
 * section and the ground plane only.
 */

export const TILT_MIN = 0.06;
export const TILT_MAX = 0.5;

// Supersample factor. The audio path renders offline, so the drawing has the
// machine to itself; thin ticks and the envelope alias badly without this.
export const SUPERSAMPLE = 2;

export const clampTilt = t => Math.max(TILT_MIN, Math.min(TILT_MAX, t));

/**
 * Half-wavelengths spanned by mode n. The mouth is a pressure node in both
 * boundary conditions; a stopped cap is a pressure antinode, which lands the
 * series on the odd half-integers.
 */
export function modeWavenumber(mode, n = 1) {
  return mode === 'stopped' ? (2 * n - 1) / 2 : n;
}

/** Signed pressure envelope along the pipe, t = 0 at the mouth, 1 at the cap. */
export function modeEnvelope(mode, n, t) {
  return Math.sin(modeWavenumber(mode, n) * Math.PI * t);
}

/** Pressure nodes strictly inside the pipe, mouth excluded. */
export function nodePositions(mode, n = 1) {
  const k = modeWavenumber(mode, n);
  const out = [];
  for (let m = 1; m / k < 1 - 1e-9; m++) out.push(m / k);
  return out;
}

/**
 * A point on a circle of the given radius, seen at `tilt`. `angle` is the
 * material angle; `spin` turns the pipe. `front` is true on the near half.
 */
export function ringPoint(angle, radius, tilt, spin = 0) {
  const a = angle + spin;
  return {
    x: radius * Math.cos(a),
    y: radius * Math.sin(a) * Math.sin(tilt),
    front: Math.sin(a) > 0,
    /** Tangential foreshortening: a feature edge-on has no width. */
    face: Math.sin(a),
  };
}

const ellipse = (ctx, x, y, rx, ry) => {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.abs(rx), Math.abs(ry), 0, 0, Math.PI * 2);
};

function contactShadow(ctx, x, y, rx, ry) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, 1));
  g.addColorStop(0, 'rgba(4,10,10,.55)');
  g.addColorStop(1, 'rgba(4,10,10,0)');
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, Math.max(ry / Math.max(rx, 1), .08));
  ctx.translate(-x, -y);
  ctx.fillStyle = g;
  ellipse(ctx, x, y, rx, rx);
  ctx.fill();
  ctx.restore();
}

export { contactShadow };

function meridians(ctx, o, front) {
  const { x, base, height, radius, mode, harmonic, tilt, spin, envelopeRadius } = o;
  const steps = 72;
  for (let m = 0; m < 16; m++) {
    const phi = (m / 16) * Math.PI * 2;
    if ((Math.sin(phi + spin) > 0) !== front) continue;
    ctx.beginPath();
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const r = envelopeRadius * Math.abs(modeEnvelope(mode, harmonic, t));
      const p = ringPoint(phi, Math.max(r, radius * .04), tilt, spin);
      const px = x + p.x;
      const py = base - t * height + p.y;
      s ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.strokeStyle = front ? 'rgba(191,214,190,.5)' : 'rgba(120,150,146,.2)';
    ctx.lineWidth = front ? 1 : .75;
    ctx.stroke();
  }
  // Rings sample the same surface across its width.
  for (let s = 1; s < 12; s++) {
    const t = s / 12;
    const r = envelopeRadius * Math.abs(modeEnvelope(mode, harmonic, t));
    if (r < radius * .12) continue;
    const y = base - t * height;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * Math.sin(tilt), 0,
      front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2);
    ctx.strokeStyle = front ? 'rgba(214,229,208,.34)' : 'rgba(120,150,146,.14)';
    ctx.lineWidth = .75;
    ctx.stroke();
  }
}

/**
 * Draw the pipe as a shaded cylinder with its fundamental's pressure envelope
 * as a surface of revolution. Returns nothing; the caller owns the transform.
 */
export function drawTube(ctx, o) {
  const { x, base, height, radius, mode, harmonic = 1, tilt, spin } = o;
  const top = base - height;
  const capRy = radius * Math.sin(tilt);
  const envelopeRadius = o.envelopeRadius ?? radius * 2.4;
  const opts = { ...o, harmonic, envelopeRadius };

  contactShadow(ctx, x, base, envelopeRadius * 1.5, envelopeRadius * .5 * Math.sin(tilt) + 3);
  meridians(ctx, opts, false);

  // Body. The gradient stays fixed to the screen; the seam and highlight move
  // with the spin, which is what makes the rotation legible on a bare tube.
  const body = ctx.createLinearGradient(x - radius, 0, x + radius, 0);
  body.addColorStop(0, '#5f5940');
  body.addColorStop(.28, '#cebf8f');
  body.addColorStop(.52, '#e6d9a9');
  body.addColorStop(.78, '#9d9068');
  body.addColorStop(1, '#514d3a');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(x - radius, top);
  ctx.lineTo(x + radius, top);
  ctx.lineTo(x + radius, base);
  ctx.ellipse(x, base, radius, capRy, 0, 0, Math.PI);
  ctx.lineTo(x - radius, top);
  ctx.fill();

  const spec = ringPoint(Math.PI / 2, radius, tilt, spin);
  if (spec.face > 0) {
    const gloss = ctx.createLinearGradient(x + spec.x - radius * .3, 0, x + spec.x + radius * .3, 0);
    gloss.addColorStop(0, 'rgba(255,248,214,0)');
    gloss.addColorStop(.5, `rgba(255,248,214,${.4 * spec.face})`);
    gloss.addColorStop(1, 'rgba(255,248,214,0)');
    ctx.fillStyle = gloss;
    ctx.fillRect(x + spec.x - radius * .3, top, radius * .6, height);
  }

  const seam = ringPoint(Math.PI, radius, tilt, spin);
  if (seam.face > 0) {
    ctx.strokeStyle = 'rgba(60,54,36,.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + seam.x, top);
    ctx.lineTo(x + seam.x, base);
    ctx.stroke();
  }

  // Node rings sit on the tube surface, so they read as belts, not as chords.
  for (const t of nodePositions(mode, harmonic)) {
    const y = base - t * height;
    ctx.strokeStyle = 'rgba(23,33,30,.55)';
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.ellipse(x, y, radius, capRy, 0, 0, Math.PI);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(214,229,208,.3)';
    ctx.beginPath();
    ctx.ellipse(x, y, radius, capRy, 0, Math.PI, Math.PI * 2);
    ctx.stroke();
  }

  // Mouth. Its width is the tangential foreshortening of a feature at spin.
  const mouth = ringPoint(0, radius, tilt, spin);
  if (mouth.face > 0 && height > 26) {
    const mw = radius * 1.2 * mouth.face;
    ctx.fillStyle = '#141d1a';
    ctx.beginPath();
    ctx.ellipse(x + mouth.x * (1 - mouth.face * .1), base - 16 + mouth.y * .5,
      mw / 2, Math.max(2.2, radius * .16), 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Cap. Open reads as a bore; stopped reads as a lid.
  ctx.fillStyle = mode === 'open' ? '#141d1a' : '#d8cca0';
  ellipse(ctx, x, top, radius, capRy);
  ctx.fill();
  if (mode === 'open') {
    const bore = ctx.createLinearGradient(x - radius, 0, x + radius, 0);
    bore.addColorStop(0, 'rgba(120,110,80,.55)');
    bore.addColorStop(1, 'rgba(10,16,14,0)');
    ctx.fillStyle = bore;
    ctx.fill();
  }
  ctx.strokeStyle = '#cfc292';
  ctx.lineWidth = 1;
  ellipse(ctx, x, top, radius, capRy);
  ctx.stroke();

  meridians(ctx, opts, true);
}
