// The Plan / Lifting / Stretches switch at the top of the Train tab.

import { html } from '../lib/dom.js';

const ITEMS = [['plan', 'Plan', '#/train'], ['lifting', 'Lifting', '#/train/lifting'], ['stretches', 'Stretches', '#/train/stretches']];

export function trainNav(active) {
  return html`
    <nav class="segment" aria-label="Train sections">
      ${ITEMS.map(([id, label, href]) => html`<a href="${href}" ${id === active ? html`aria-current="page"` : ''}>${label}</a>`)}
    </nav>`;
}
