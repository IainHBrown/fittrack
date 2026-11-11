// A short, punchy banner for "goal hit" moments. Gone in about 1.6 seconds.

import { icon } from './icons.js';
import { html, mount } from '../lib/dom.js';

let el = null;
let timer = null;

export function toast(text) {
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.append(el);
  }
  mount(el, html`${icon('check', 26, 3)}<span>${text}</span>`);
  clearTimeout(timer);
  // force a layout so the slide-in runs, then open at once (a delayed open
  // could land after the hide timer and leave the banner stuck on screen)
  void el.offsetWidth;
  el.classList.add('open');
  timer = setTimeout(() => el.classList.remove('open'), 1600);
}
