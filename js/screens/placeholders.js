// Train and Food are built in later stages. Until then each tab says
// plainly what is coming, in the app's own style.

import { html, mount } from '../lib/dom.js';
import { icon } from '../ui/icons.js';

function coming(title, stage, lines, sports) {
  return (el) => mount(el, html`
    <header class="head"><div class="head-stack">
      <span class="label" style="font-size:17px">${stage}</span>
      <h1 class="title">${title}</h1>
    </div></header>
    <div class="coming">
      <div class="tagrow">${sports.map(([name, color]) => html`<div class="tile" style="--c:var(--${color})">${icon(name, 22, 2.4)}</div>`)}</div>
      <h2 class="hero" style="font-size:52px">Not built yet</h2>
      ${lines.map((l) => html`<p class="body-2">${l}</p>`)}
    </div>`);
}

export const renderTrain = coming('Train', 'Coming in stages 2 and 3', [
  'Stage 2 adds your weekly plan, session logging, skip and move, and busy-week mode.',
  'Stage 3 adds lifting with automatic weight targets, and your stretch library.',
], [['swim', 'swim'], ['bike', 'bike'], ['run', 'run'], ['lift', 'lift']]);

export const renderFood = coming('Food', 'Coming in stage 4', [
  'Stage 4 adds calorie and macro tracking with a quick-add list for what you eat at Trent.',
  'Photo estimates come later, in Stage 7.',
], [['food', 'volt']]);
