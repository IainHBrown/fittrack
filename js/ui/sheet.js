// Bottom sheet: slides up over the current screen. Close by tapping the
// backdrop, the close button, or dragging the sheet down.

import { icon } from './icons.js';
import { html, mount } from '../lib/dom.js';

let current = null;

/**
 * @param {string} title
 * @param {(body: HTMLElement, close: () => void) => void} render  fills the sheet body
 * @param {() => void} [onClose]
 */
export function openSheet(title, render, onClose) {
  if (current) current.close(true);

  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop';
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', title);
  mount(sheet, html`
    <div class="sheet-inner">
      <div class="sheet-grab"></div>
      <div class="sheet-head">
        <h2 class="sheet-title">${title}</h2>
        <button class="iconbtn" data-sheet-close aria-label="Close">${icon('close')}</button>
      </div>
      <div class="sheet-body sheet-inner"></div>
    </div>`);
  document.body.append(backdrop, sheet);

  let closed = false;
  function close(instant = false) {
    if (closed) return;
    closed = true;
    current = null;
    backdrop.classList.remove('open');
    sheet.classList.remove('open');
    sheet.style.transform = '';
    const remove = () => { backdrop.remove(); sheet.remove(); };
    if (instant) remove(); else setTimeout(remove, 280);
    if (onClose) onClose();
  }

  backdrop.addEventListener('click', () => close());
  sheet.querySelector('[data-sheet-close]').addEventListener('click', () => close());

  // drag down to dismiss (only when the sheet itself is scrolled to the top)
  let startY = null;
  sheet.addEventListener('touchstart', (e) => {
    startY = sheet.scrollTop <= 0 ? e.touches[0].clientY : null;
  }, { passive: true });
  sheet.addEventListener('touchmove', (e) => {
    if (startY == null) return;
    const dy = e.touches[0].clientY - startY;
    if (dy > 0) {
      sheet.style.transition = 'none';
      sheet.style.transform = `translateY(${dy}px)`;
    }
  }, { passive: true });
  sheet.addEventListener('touchend', (e) => {
    if (startY == null) return;
    const dy = e.changedTouches[0].clientY - startY;
    sheet.style.transition = '';
    if (dy > 110) close(); else sheet.style.transform = '';
    startY = null;
  });

  render(sheet.querySelector('.sheet-body'), close);
  // next frame so the slide-in transition runs
  requestAnimationFrame(() => requestAnimationFrame(() => {
    backdrop.classList.add('open');
    sheet.classList.add('open');
  }));

  current = { close };
  return current;
}
