/**
 * The Unbounded Organ — readout formatting helpers.
 * Pure functions.
 */

/** Format a frequency with appropriate units (µHz, mHz, Hz, kHz, MHz). */
export function fmtFreq(hz) {
  if (hz == null || !Number.isFinite(hz) || hz <= 0) return '—';
  if (hz < 1e-3) return `${(hz * 1e6).toFixed(3)} µHz`;
  if (hz < 1) return `${(hz * 1e3).toFixed(3)} mHz`;
  if (hz < 1e3) return `${hz.toFixed(2)} Hz`;
  if (hz < 1e6) return `${(hz / 1e3).toFixed(3)} kHz`;
  return `${(hz / 1e6).toFixed(3)} MHz`;
}

/** Format a time period with appropriate units (µs, ms, s, min, hr, days, yr). */
export function fmtPeriod(s) {
  if (s == null || !Number.isFinite(s) || s <= 0) return '—';
  if (s < 1e-3) return `${(s * 1e6).toFixed(2)} µs`;
  if (s < 1) return `${(s * 1e3).toFixed(2)} ms`;
  if (s < 60) return `${s.toFixed(2)} s`;
  if (s < 3600) return `${(s / 60).toFixed(2)} min`;
  if (s < 86400) return `${(s / 3600).toFixed(2)} hr`;
  if (s < 31557600) return `${(s / 86400).toFixed(2)} days`;
  return `${(s / 31557600).toFixed(2)} yr`;
}

/** Format a length with appropriate units (mm, cm, m, km). */
export function fmtLength(m) {
  if (m == null || !Number.isFinite(m) || m <= 0) return '—';
  if (m < 0.01) return `${(m * 1000).toFixed(3)} mm`;
  if (m < 1) return `${(m * 100).toFixed(2)} cm`;
  if (m < 1000) return `${m.toFixed(3)} m`;
  return `${(m / 1000).toFixed(3)} km`;
}

/** Format byte size in binary units (B, KiB, MiB, GiB, TiB). */
export function fmtBytes(bytes) {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const k = bytes / 1024;
  if (k < 1024) return `${k.toFixed(2)} KiB`;
  const m = k / 1024;
  if (m < 1024) return `${m.toFixed(2)} MiB`;
  const g = m / 1024;
  if (g < 1024) return `${g.toFixed(2)} GiB`;
  const t = g / 1024;
  return `${t.toFixed(2)} TiB`;
}

/** Format an integer or large number with digit grouping. */
export function fmtInt(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  return Math.round(n).toLocaleString('en-US');
}

/** Format a number to specified significant figures or decimal places. */
export function fmtNum(n, decimals = 3) {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toFixed(decimals);
}
