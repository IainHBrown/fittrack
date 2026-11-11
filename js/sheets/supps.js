// Supplements sheet: tap a row to tick it off for the day.

import { openSheet } from '../ui/sheet.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/toast.js';
import { html, mount, onAction } from '../lib/dom.js';
import { getDay, updateDay } from '../db.js';
import { settings } from '../state.js';
import { suppsAllDone } from '../logic/day.js';

export function openSuppsSheet(date, onChange) {
  openSheet('Supplements', (body) => {
    async function draw() {
      const list = settings().supplements;
      const day = await getDay(date);
      mount(body, html`
        <div>
          ${list.length === 0 ? html`<p class="body-2">No supplements yet. Add them in Me, then Settings.</p>` : ''}
          ${list.map((s) => html`
            <button class="check-row" data-action="toggle" data-id="${s.id}" aria-pressed="${day.supps[s.id] ? 'true' : 'false'}">
              <span class="check-box">${icon('check', 24, 3)}</span>
              <span class="check-name">${s.name}</span>
              <span class="label">${s.dose}</span>
            </button>`)}
        </div>`);
    }

    onAction(body, {
      toggle: async (t) => {
        const list = settings().supplements;
        let wasDone = false;
        const day = await updateDay(date, (d) => {
          wasDone = suppsAllDone(d, list);
          if (d.supps[t.dataset.id]) delete d.supps[t.dataset.id];
          else d.supps[t.dataset.id] = true;
          d.suppList = list.map((s) => s.id); // the list that applied on this day
        });
        const nowDone = suppsAllDone(day, list);
        if (!wasDone && nowDone) toast('Supplements done');
        await draw();
        onChange(nowDone ? 'supps' : undefined);
      },
    });

    draw();
  });
}
