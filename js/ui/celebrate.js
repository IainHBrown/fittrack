// Full-screen "level up" / "badge earned" moment. Short and punchy: it
// appears, holds for about two seconds, and goes. Tap to dismiss sooner.

import { html, mount } from '../lib/dom.js';
import { medal } from './medal.js';

const queue = [];
let showing = false;

export function celebrate(moments) {
  queue.push(...moments);
  if (!showing) next();
}

function next() {
  const m = queue.shift();
  if (!m) { showing = false; return; }
  showing = true;

  const el = document.createElement('div');
  el.className = 'celebrate';
  el.setAttribute('role', 'status');
  mount(el, html`
    <div class="celebrate-burst"></div>
    <div class="celebrate-card">
      ${m.kind === 'badge' ? html`<div class="celebrate-medal">${medal(m.tier, 120)}</div>` : ''}
      <div class="label-strong" style="color:var(--volt);font-size:22px">${m.title}</div>
      <div class="hero" style="font-size:${m.name.length > 10 ? 56 : 76}px;text-align:center">${m.name}</div>
      <div class="label" style="font-size:17px">${m.sub}</div>
    </div>`);
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add('open'));

  let done = false;
  const close = () => {
    if (done) return;
    done = true;
    el.classList.remove('open');
    setTimeout(() => { el.remove(); next(); }, 220);
  };
  el.addEventListener('click', close);
  setTimeout(close, 2200);
}
