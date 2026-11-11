// Progress rings: thick, square-ended. A counted goal (like supplements)
// is drawn as separate segments instead of one continuous arc.

import { raw, esc } from '../lib/dom.js';

/**
 * @param {object} o
 * @param {number} o.size      outer size in px
 * @param {number} [o.stroke]  ring thickness
 * @param {number} [o.frac]    0..1 for a continuous ring
 * @param {number} [o.segments] total segments (segmented ring)
 * @param {number} [o.lit]     lit segments
 * @param {string} [o.color]   CSS colour of the filled part
 * @param {string} o.label     accessible description
 */
export function ringSVG({ size = 78, stroke = 10, frac = 0, segments = 0, lit = 0, color = 'var(--volt)', label = '' }) {
  const c = size / 2;
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const base = `cx="${c}" cy="${c}" r="${r}" fill="none" stroke-width="${stroke}"`;
  let body;

  if (segments > 1) {
    const gap = Math.min(6, C / segments / 3);
    const seg = C / segments - gap;
    const rot = -90 + (gap / 2 / C) * 360;
    const t = `transform="rotate(${rot.toFixed(2)} ${c} ${c})"`;
    body = `<circle ${base} stroke="var(--track)" stroke-dasharray="${seg.toFixed(2)} ${gap.toFixed(2)}" ${t}/>`;
    if (lit > 0) {
      const n = Math.min(lit, segments);
      const parts = [];
      for (let i = 0; i < n; i++) parts.push(seg.toFixed(2), gap.toFixed(2));
      // stretch the final gap so the pattern never repeats around the circle
      parts[parts.length - 1] = (C - n * (seg + gap) + gap).toFixed(2);
      body += `<circle class="ring-arc" ${base} stroke="${color}" stroke-dasharray="${parts.join(' ')}" ${t}/>`;
    }
  } else {
    const f = Math.max(0, Math.min(1, frac));
    body = `<circle ${base} stroke="var(--track)"/>`;
    if (f >= 1) body += `<circle ${base} stroke="${color}"/>`;
    else if (f > 0) {
      body += `<circle class="ring-arc" ${base} stroke="${color}" stroke-dasharray="${(C * f).toFixed(2)} ${C.toFixed(2)}" transform="rotate(-90 ${c} ${c})"/>`;
    }
  }
  return raw(`<svg role="img" aria-label="${esc(label)}" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${body}</svg>`);
}
