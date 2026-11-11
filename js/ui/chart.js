// Small hand-drawn SVG line chart, styled to match the app.

import { raw, esc } from '../lib/dom.js';

/**
 * @param {object} o
 * @param {{label:string,color:string,values:(number|null)[]}[]} o.series  same length as o.labels
 * @param {string[]} o.labels   x-axis labels (first and last are shown)
 * @param {string} o.unit       e.g. 'lb'
 * @param {string} o.title      accessible description
 */
export function lineChart({ series, labels, unit = '', title = '' }) {
  const W = 320, H = 150, padL = 6, padR = 6, top = 12, bottom = 124;
  const all = series.flatMap((s) => s.values).filter((v) => v != null);
  if (all.length === 0) return raw('');
  let min = Math.min(...all);
  let max = Math.max(...all);
  if (min === max) { min -= 5; max += 5; }
  const pad = (max - min) * 0.12;
  min -= pad; max += pad;
  const n = labels.length;
  const x = (i) => (n === 1 ? W / 2 : padL + (i / (n - 1)) * (W - padL - padR));
  const y = (v) => bottom - ((v - min) / (max - min)) * (bottom - top);

  const lines = series.map((s) => {
    const pts = s.values.map((v, i) => (v == null ? null : [x(i), y(v)])).filter(Boolean);
    const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
    const dots = pts.map((p) => `<rect x="${(p[0] - 3).toFixed(1)}" y="${(p[1] - 3).toFixed(1)}" width="6" height="6" fill="${s.color}"/>`).join('');
    return `<path d="${path}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linejoin="miter"/>${dots}`;
  }).join('');

  const hi = Math.round(Math.max(...all));
  const lo = Math.round(Math.min(...all));
  return raw(`
    <svg role="img" aria-label="${esc(title)}" viewBox="0 0 ${W} ${H}" width="100%">
      <line x1="0" x2="${W}" y1="${y(hi).toFixed(1)}" y2="${y(hi).toFixed(1)}" stroke="var(--line)" stroke-width="1"/>
      <line x1="0" x2="${W}" y1="${y(lo).toFixed(1)}" y2="${y(lo).toFixed(1)}" stroke="var(--line)" stroke-width="1"/>
      <text x="${W}" y="${(y(hi) - 4).toFixed(1)}" text-anchor="end" fill="var(--ash)" font-size="10" font-family="var(--font-text)">${hi} ${esc(unit)}</text>
      <text x="${W}" y="${(y(lo) + 12).toFixed(1)}" text-anchor="end" fill="var(--ash)" font-size="10" font-family="var(--font-text)">${lo} ${esc(unit)}</text>
      ${lines}
      <text x="0" y="${H - 4}" fill="var(--ash)" font-size="10" font-family="var(--font-text)">${esc(labels[0])}</text>
      ${n > 1 ? `<text x="${W}" y="${H - 4}" text-anchor="end" fill="var(--ash)" font-size="10" font-family="var(--font-text)">${esc(labels[n - 1])}</text>` : ''}
    </svg>`);
}
