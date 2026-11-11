// Sleep score sheet: a big number and an on-screen keypad, so logging a
// score is two or three taps with no system keyboard.

import { openSheet } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';
import { html, mount, onAction } from '../lib/dom.js';
import { fmtDayLong, dayKey } from '../lib/dates.js';
import { getDay, updateDay } from '../db.js';
import { settings } from '../state.js';

export function openSleepSheet(date, onChange) {
  openSheet('Sleep score', async (body, close) => {
    const day = await getDay(date);
    const had = day.sleep != null;
    let buf = had ? String(day.sleep) : '';
    let fresh = had; // first key press replaces an existing score

    function draw() {
      const goal = settings().sleep.goal;
      mount(body, html`
        <div class="label" style="text-align:center">${date === dayKey() ? 'Last night' : fmtDayLong(date)} · goal ${goal}</div>
        <div class="score-display">
          <span class="num ${buf === '' ? 'empty' : ''} ${buf !== '' && Number(buf) >= goal ? 'volt' : ''}">${buf === '' ? '--' : buf}</span>
        </div>
        <div class="keypad">
          ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => html`<button class="key" data-action="digit" data-d="${n}">${n}</button>`)}
          <button class="key key-quiet" data-action="clear">Clear</button>
          <button class="key" data-action="digit" data-d="0">0</button>
          <button class="key key-quiet" data-action="back" aria-label="Delete last digit">Del</button>
        </div>
        <button class="btn" data-action="save" ${buf === '' ? 'disabled' : ''}>Save score</button>
        ${had ? html`<button class="btn btn-ghost" data-action="remove">Remove score</button>` : ''}`);
    }

    onAction(body, {
      digit: (t) => {
        const next = (fresh || buf === '0' ? '' : buf) + t.dataset.d;
        fresh = false;
        if (Number(next) <= 100) buf = next; // scores run 0 to 100
        draw();
      },
      clear: () => { buf = ''; fresh = false; draw(); },
      back: () => { buf = buf.slice(0, -1); fresh = false; draw(); },
      save: async () => {
        const score = Number(buf);
        await updateDay(date, (d) => { d.sleep = score; });
        close();
        toast(score >= settings().sleep.goal ? `Good night · ${score}` : 'Sleep logged');
        onChange('sleep');
      },
      remove: async () => {
        await updateDay(date, (d) => { d.sleep = null; });
        close();
        onChange();
      },
    });

    draw();
  });
}
