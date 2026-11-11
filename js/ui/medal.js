// Badge medal: a hexagon with forward chevrons (the app-icon motif),
// coloured by tier. Tier 0 is an empty outline.

import { raw } from '../lib/dom.js';

export const TIER_COLOR = ['var(--line-strong)', 'var(--bronze)', 'var(--silver)', 'var(--gold)'];

export function medal(tier, size = 56) {
  const c = TIER_COLOR[tier] || TIER_COLOR[0];
  const hex = 'M32 3l25 14.500v29L32 61 7 46.500v-29z';
  const body = tier === 0
    ? `<path d="${hex}" fill="none" stroke="${c}" stroke-width="3" stroke-linejoin="miter"/>
       <path d="M25 23l9 9-9 9M35 23l9 9-9 9" fill="none" stroke="${c}" stroke-width="4" stroke-linecap="square" transform="translate(-3 0)"/>`
    : `<path d="${hex}" fill="${c}"/>
       <path d="M32 9.500l19.500 11.300v22.400L32 54.500 12.500 43.200V20.800z" fill="none" stroke="var(--bg)" stroke-width="2" opacity="0.45"/>
       <path d="M25 23l9 9-9 9M35 23l9 9-9 9" fill="none" stroke="var(--bg)" stroke-width="4.500" stroke-linecap="square" transform="translate(-3 0)"/>`;
  return raw(`<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 64 64">${body}</svg>`);
}
