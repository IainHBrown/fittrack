// The app's own icon set: heavy square-ended strokes on a 24px grid.

import { raw } from '../lib/dom.js';

const PATHS = {
  // tabs
  today: '<circle cx="12" cy="12" r="8.500"/><circle cx="12" cy="12" r="2.500" fill="currentColor"/>',
  train: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
  food: '<path d="M3 11h18a9 9 0 0 1-18 0zM8 7V4M12 7V3M16 7V4"/>',
  sleep: '<path d="M20 14.500A8.500 8.500 0 0 1 9.500 4 8.500 8.500 0 1 0 20 14.500z" stroke-linejoin="round"/>',
  me: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.500 3.500-7 8-7s8 2.500 8 7"/>',
  // sports
  swim: '<path d="M2 9c2.500-3 5-3 7.500 0s5 3 7.500 0 3.500-2 5-1M2 16c2.500-3 5-3 7.500 0s5 3 7.500 0 3.500-2 5-1" stroke-linejoin="round"/>',
  bike: '<circle cx="5.500" cy="16" r="3.500"/><circle cx="18.500" cy="16" r="3.500"/><path d="M5.500 16l4-8h6l3 8M9.500 8l3.500 8M8 6h3M15 5h2"/>',
  run: '<path d="M4 6l7 6-7 6M12 6l7 6-7 6"/>',
  lift: '<path d="M8 12h8M5 7v10M19 7v10M2 10v4M22 10v4"/>',
  // actions
  right: '<path d="M9 5l7 7-7 7"/>',
  left: '<path d="M15 5l-7 7 7 7"/>',
  check: '<path d="M5 12.500l5 5L19 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  undo: '<path d="M4 9h10a5 5 0 0 1 0 10H8M4 9l4-4M4 9l4 4"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l2.800 2.800M16.200 16.200L19 19M19 5l-2.800 2.800M7.800 16.200L5 19"/>',
  flag: '<path d="M5 21V4h13l-3 4.500 3 4.500H5"/>',
  calendar: '<path d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4"/>',
  camera: '<path d="M3 8h4l2-3h6l2 3h4v11H3z"/><circle cx="12" cy="13" r="3.500"/>',
  cloud: '<path d="M7 18a4 4 0 0 1-.500-7.970A6 6 0 0 1 18 9.500a4.250 4.250 0 0 1-.500 8.500z" stroke-linejoin="round"/>',
  refresh:'<path d="M20 5v5h-5M4 19v-5h5M19.500 10A8 8 0 0 0 5.500 7.500M4.500 14a8 8 0 0 0 14 2.500"/>',
};

/** Returns inline SVG markup for use inside an `html` template. */
export function icon(name, size = 24, strokeWidth = 2.2) {
  return raw(
    `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" ` +
    `stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="square" stroke-linejoin="miter">${PATHS[name] || ''}</svg>`
  );
}
