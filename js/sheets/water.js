// Water sheet: big progress ring, quick-add buttons, undo.

import { openSheet } from '../ui/sheet.js';
import { ringSVG } from '../ui/ring.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/toast.js';
import { html, mount, onAction } from '../lib/dom.js';
import { fmtTime } from '../lib/dates.js';
import { getDay, updateDay } from '../db.js';
import { settings } from '../state.js';
import { waterTotal, waterGoal, fmtLitres } from '../logic/day.js';

/** `dayType` ('long' on long training days) selects the higher water goal. */
export function openWaterSheet(date, onChange, dayType = null) {
  openSheet('Water', (body) => {
    async function draw(pulse = false) {
      const s = settings();
      const day = await getDay(date);
      if (dayType) day.dayType = dayType;
      const total = waterTotal(day);
      const goal = waterGoal(s, day);
      const last = day.water.at(-1);
      mount(body, html`
        <div style="display:flex;justify-content:center;padding:4px 0">
          <div class="ring ${pulse ? 'pulse' : ''}" style="width:200px;height:200px">
            ${ringSVG({ size: 200, stroke: 22, frac: total / goal, label: `${fmtLitres(total)} of ${fmtLitres(goal)} litres` })}
            <div class="ring-val" style="flex-direction:column;gap:2px">
              <span style="font-size:68px;line-height:0.85">${fmtLitres(total)}</span>
              <span class="label">of ${fmtLitres(goal)} L</span>
            </div>
          </div>
        </div>
        <div class="btn-row">
          ${s.water.quickAdds.map((q) => html`
            <button class="btn btn-quiet" data-action="add" data-ml="${q.ml}">${q.label}</button>`)}
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:48px">
          <span class="small">${last ? `Last: ${last.ml} ml at ${fmtTime(last.t)}` : 'Nothing logged yet today'}</span>
          <button class="btn btn-ghost" style="width:auto;padding:0 16px" data-action="undo" ${last ? '' : 'disabled'}>
            ${icon('undo', 20)} Undo
          </button>
        </div>`);
    }

    onAction(body, {
      add: async (t) => {
        const ml = Number(t.dataset.ml);
        const s = settings();
        let before = 0;
        let goal = 0;
        const day = await updateDay(date, (d) => {
          if (dayType) d.dayType = dayType;
          before = waterTotal(d);
          goal = waterGoal(s, d);
          d.water.push({ t: Date.now(), ml });
          d.waterGoal = goal; // remember the goal that applied on this day
        });
        if (before < goal && waterTotal(day) >= goal) toast('Water goal hit');
        await draw(true);
        onChange('water');
      },
      undo: async () => {
        await updateDay(date, (d) => { d.water.pop(); });
        await draw();
        onChange();
      },
    });

    draw();
  });
}
