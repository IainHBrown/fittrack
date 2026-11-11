// Small hand-drawn SVG line chart, styled to match the app.

import { raw, esc } from '../lib/dom.js';

/**
 * Stacked bars, one per week.
 * @param {object} o
 * @param {object[]} o.bars     each: { label, parts: { key: value } }
 * @param {[string,string][]} o.keys   [key, colour] in stacking order (bottom first)
 * @param {string} o.unit
 * @param {string} o.title
 */
export function stackedBars({ bars, keys, unit = '', title = '' }) {
  const W = 320, H = 150, top = 14, bottom = 124;
  const totals = bars.map((b) => keys.reduce((sum, [k]) => sum + (b.parts[k] || 0), 0));
  const max = Math.max(1, ...totals);
  const slot = W / bars.length;
  const bw = Math.min(30, slot - 8);
  const body = bars.map((b, i) => {
    const x = i * slot + (slot - bw) / 2;
    let y = bottom;
    const rects = keys.map(([k, color]) => {
      const h = ((b.parts[k] || 0) / max) * (bottom - top);
      if (h <= 0) return '';
      y -= h;
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, h - 1.500).toFixed(1)}" fill="${color}"/>`;
    }).join('');
    const empty = totals[i] === 0 ? `<rect x="${x.toFixed(1)}" y="${bottom - 2}" width="${bw.toFixed(1)}" height="2" fill="var(--track)"/>` : '';
    const value = totals[i] > 0 ? `<text x="${(x + bw / 2).toFixed(1)}" y="${(y - 4).toFixed(1)}" text-anchor="middle" fill="var(--text-2)" font-size="10" font-family="var(--font-text)">${totals[i].toFixed(1)}</text>` : '';
    const label = `<text x="${(x + bw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" fill="var(--ash)" font-size="9.500" font-family="var(--font-text)">${esc(b.label)}</text>`;
    return rects + empty + value + label;
  }).join('');
  return raw(`<svg role="img" aria-label="${esc(title)}${unit ? ` (${esc(unit)})` : ''}" viewBox="0 0 ${W} ${H}" width="100%">${body}</svg>`);
}

/**
 * @param {object} o
 * @param {{label:string,color:string,values:(number|null)[]}[]} o.series  same length as o.labels
 * @param {string[]} o.labels   x-axis labels (first and last are shown)
 * @param {string} o.unit       e.g. 'lb'
 * @param {string} o.title      accessible description
 */
export function lineChart({ series, labels, unit = '', title = '', format = null }) {
  const show = format || ((v) => `${Math.round(v)} ${unit}`.trim());
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

  const hi = Math.max(...all);
  const lo = Math.min(...all);
  return raw(`
    <svg role="img" aria-label="${esc(title)}" viewBox="0 0 ${W} ${H}" width="100%">
      <line x1="0" x2="${W}" y1="${y(hi).toFixed(1)}" y2="${y(hi).toFixed(1)}" stroke="var(--line)" stroke-width="1"/>
      <line x1="0" x2="${W}" y1="${y(lo).toFixed(1)}" y2="${y(lo).toFixed(1)}" stroke="var(--line)" stroke-width="1"/>
      <text x="${W}" y="${(y(hi) - 4).toFixed(1)}" text-anchor="end" fill="var(--ash)" font-size="10" font-family="var(--font-text)">${esc(show(hi))}</text>
      <text x="${W}" y="${(y(lo) + 12).toFixed(1)}" text-anchor="end" fill="var(--ash)" font-size="10" font-family="var(--font-text)">${esc(show(lo))}</text>
      ${lines}
      <text x="0" y="${H - 4}" fill="var(--ash)" font-size="10" font-family="var(--font-text)">${esc(labels[0])}</text>
      ${n > 1 ? `<text x="${W}" y="${H - 4}" text-anchor="end" fill="var(--ash)" font-size="10" font-family="var(--font-text)">${esc(labels[n - 1])}</text>` : ''}
    </svg>`);
}
