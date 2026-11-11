// Food entry sheet. One form, four uses:
//   mode 'custom'   - type rough numbers and log them (optionally save for re-use)
//   mode 'meal'     - edit or delete a meal already logged today
//   mode 'food'     - edit or delete an item in the quick-add list
//   mode 'newFood'  - add an item to the quick-add list without logging it

import { openSheet } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';
import { html, mount, onAction } from '../lib/dom.js';
import { settings } from '../state.js';
import { logMeal, updateMeal, removeMeal, saveFood, removeFood } from '../food-service.js';

// (a photo estimate opens the 'custom' form pre-filled, so it can be edited before saving)
const TITLES = { custom: 'Custom entry', meal: 'Edit meal', food: 'Edit quick-add', newFood: 'New quick-add' };

/**
 * @param {object} o
 * @param {'custom'|'meal'|'food'|'newFood'} o.mode
 * @param {string} o.date        the day being logged
 * @param {object} [o.item]      the meal or food being edited
 * @param {string} [o.group]     default group for a new quick-add
 * @param {() => void} onChange
 */
export function openFoodSheet({ mode, date, item = null, group = null, hint = '' }, onChange) {
  const groups = settings().food.groups;
  const isFood = mode === 'food' || mode === 'newFood';
  const f = {
    name: item ? item.name : '',
    note: item ? item.note || '' : '',
    cal: item ? item.cal : '', protein: item ? item.protein : '', carbs: item ? item.carbs : '', fat: item ? item.fat : '',
    group: item && item.group ? item.group : group && groups.includes(group) ? group : groups.at(-1),
    keep: false, // custom entry: also save to the quick-add list
  };

  openSheet(TITLES[mode], (body, close) => {
    const field = (key, label, unit) => html`
      <div class="form-field">
        <label class="label" for="fd-${key}">${label}${unit ? ` · ${unit}` : ''}</label>
        <input class="big-input" id="fd-${key}" type="number" inputmode="numeric" min="0" placeholder="0" value="${f[key]}">
      </div>`;

    function draw() {
      mount(body, html`
        ${hint ? html`<p class="body-2" role="note">${hint}</p>` : ''}
        <div class="form-field">
          <label class="label" for="fd-name">Name</label>
          <input class="input input-wide" style="height:52px" id="fd-name" type="text" maxlength="60" value="${f.name}" placeholder="e.g. Chicken and rice">
        </div>
        <div class="grid-2">
          ${field('cal', 'Calories', '')}
          ${field('protein', 'Protein', 'g')}
          ${field('carbs', 'Carbs', 'g')}
          ${field('fat', 'Fat', 'g')}
        </div>
        <p class="small" style="margin-top:-8px">Rough numbers are fine. Leave a box empty for zero.</p>

        ${isFood ? html`
          <div class="form-field">
            <label class="label" for="fd-note">What's in it · optional</label>
            <input class="input input-wide" style="height:48px" id="fd-note" type="text" maxlength="120" value="${f.note}">
          </div>` : ''}

        ${isFood || f.keep ? html`
          <div class="form-field">
            <span class="label">List</span>
            <div class="chips" style="--cols:${Math.min(4, groups.length)}" data-group="group">
              ${groups.map((g) => html`<button class="chip" style="font-size:15px" data-action="group" data-v="${g}" aria-pressed="${String(f.group === g)}">${g}</button>`)}
            </div>
          </div>` : ''}

        ${mode === 'custom' ? html`
          <button class="rowlink" data-action="keep" aria-pressed="${String(f.keep)}">
            <div class="rowlink-main">
              <span class="label-strong" style="font-size:17px">Save for one-tap logging</span>
              <span class="body-2">${f.keep ? 'It will be added to your quick-add list.' : 'Log it this once only.'}</span>
            </div>
            <span class="switch"></span>
          </button>` : ''}

        <button class="btn" data-action="save">${mode === 'custom' ? 'Log it' : 'Save'}</button>
        ${mode === 'meal' ? html`<button class="btn btn-ghost" data-action="delete">Remove from today</button>` : ''}
        ${mode === 'food' ? html`<button class="btn btn-ghost" data-action="delete">Delete from quick-add</button>` : ''}
        <div class="small flare" id="fd-error" role="alert"></div>`);
    }

    const read = () => {
      f.name = body.querySelector('#fd-name').value;
      for (const k of ['cal', 'protein', 'carbs', 'fat']) f[k] = body.querySelector(`#fd-${k}`).value;
      const note = body.querySelector('#fd-note');
      if (note) f.note = note.value;
    };

    onAction(body, {
      group: (t) => { read(); f.group = t.dataset.v; draw(); },
      keep: () => { read(); f.keep = !f.keep; draw(); },
      save: async () => {
        read();
        if (!f.name.trim()) { body.querySelector('#fd-error').textContent = 'Give it a name.'; return; }
        if (!(Number(f.cal) > 0)) { body.querySelector('#fd-error').textContent = 'Enter the calories (a rough number is fine).'; return; }
        if (mode === 'custom') {
          let foodId;
          if (f.keep) foodId = (await saveFood({ name: f.name, note: '', group: f.group, cal: f.cal, protein: f.protein, carbs: f.carbs, fat: f.fat, estimate: true, custom: true })).id;
          await logMeal(date, { ...f, foodId });
          toast(f.keep ? 'Logged and saved' : 'Logged');
        } else if (mode === 'meal') {
          await updateMeal(date, item.id, f);
        } else {
          await saveFood({ ...(item || { estimate: true, custom: true }), name: f.name, note: f.note.trim(), group: f.group, cal: f.cal, protein: f.protein, carbs: f.carbs, fat: f.fat });
          toast(mode === 'food' ? 'Quick-add updated' : 'Added to quick-add');
        }
        close();
        onChange();
      },
      delete: async () => {
        if (mode === 'meal') await removeMeal(date, item.id);
        else await removeFood(item.id);
        close();
        onChange();
      },
    });
    draw();
  });
}
