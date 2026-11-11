// Food: rough tracking of calories, protein, carbs and fat against a target
// that depends on the day (rest, training, or long). One tap logs a quick-add.

import { html, mount, onAction } from '../lib/dom.js';
import { dayKey, fmtTime } from '../lib/dates.js';
import { getDay } from '../db.js';
import { settings } from '../state.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/toast.js';
import { getPlanState, dayTypeOn } from '../plan-service.js';
import { foodTotals, foodTargets, rangeStatus, rangeText, DAY_TYPE_LABEL } from '../logic/food.js';
import { seedFoods, getFoods, logMeal } from '../food-service.js';
import { openFoodSheet } from '../sheets/food.js';
import { compressPhoto } from '../lib/photo.js';
import { estimatePhoto, CloudError } from '../cloud.js';

let group = null; // quick-add list being shown

const fmt = (n) => Math.round(n).toLocaleString('en-CA');

/** A macro with one target number (carbs). */
function targetBar(label, value, target) {
  const frac = Math.min(1, value / target);
  return html`
    <div class="macro">
      <div class="macro-head">
        <span class="label-strong" style="font-size:18px">${label}</span>
        <span><span class="num" style="font-size:24px">${fmt(value)}</span><span class="label"> / ${fmt(target)} g</span></span>
      </div>
      <div class="mbar ${value >= target ? 'hit' : ''}" role="img" aria-label="${label} ${value} of ${target} grams"><i style="width:${frac * 100}%"></i></div>
    </div>`;
}

/** A macro with a min-max range (protein, fat): the band marks the range. */
function rangeBar(label, value, range, overIsBad) {
  const scale = range.max * 1.3;
  const status = rangeStatus(value, range);
  const cls = status === 'hit' ? 'hit' : status === 'over' && overIsBad ? 'over' : status === 'over' ? 'hit' : '';
  return html`
    <div class="macro">
      <div class="macro-head">
        <span class="label-strong" style="font-size:18px">${label} <span class="label" style="font-size:14px">${range.min}–${range.max} g</span></span>
        <span><span class="num" style="font-size:24px">${fmt(value)}</span><span class="label"> g · ${rangeText(value, range)}</span></span>
      </div>
      <div class="mbar ${cls}" role="img" aria-label="${label} ${value} grams, target ${range.min} to ${range.max}">
        <i style="width:${Math.min(1, value / scale) * 100}%"></i>
        <b style="left:${(range.min / scale) * 100}%;width:${((range.max - range.min) / scale) * 100}%"></b>
      </div>
    </div>`;
}

export async function render(el, ctx) {
  await seedFoods();
  const today = dayKey();
  const s = settings();
  const [state, day, foods] = await Promise.all([getPlanState(), getDay(today), getFoods()]);
  const type = dayTypeOn(state, today);
  const target = foodTargets(s, type);
  const total = foodTotals(day);
  const groups = s.food.groups;
  if (!group || !groups.includes(group)) group = groups[0];
  const shown = foods.filter((f) => f.group === group);
  const orphans = foods.filter((f) => !groups.includes(f.group));
  const left = target.cal - total.cal;

  mount(el, html`
    <header class="head">
      <div class="head-stack">
        <span class="label" style="font-size:17px">${DAY_TYPE_LABEL[type]} target</span>
        <h1 class="title">Food</h1>
      </div>
    </header>

    <section class="panel">
      <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:10px">
        <div><span class="num" style="font-size:76px;font-style:italic;line-height:0.85">${fmt(total.cal)}</span><span class="unit" style="font-size:20px"> cal</span></div>
        <div style="text-align:right">
          <div class="label">of ${fmt(target.cal)}</div>
          <div class="label-strong" style="font-size:18px;${left <= 0 ? 'color:var(--volt)' : ''}">${left > 0 ? `${fmt(left)} to go` : left === 0 ? 'Target hit' : `${fmt(-left)} over`}</div>
        </div>
      </div>
      <div class="mbar ${total.cal >= target.cal ? 'hit' : ''}" style="height:16px" role="img" aria-label="Calories ${total.cal} of ${target.cal}"><i style="width:${Math.min(1, total.cal / target.cal) * 100}%"></i></div>
      ${rangeBar('Protein', total.protein, target.protein, false)}
      ${targetBar('Carbs', total.carbs, target.carbs)}
      ${rangeBar('Fat', total.fat, target.fat, true)}
    </section>

    ${day.meals.length ? html`
      <section>
        <h2 class="label-strong section-title" style="padding-bottom:4px">Today</h2>
        ${[...day.meals].reverse().map((m) => html`
          <div class="food-row">
            <button class="rowlink" data-action="meal" data-id="${m.id}">
              <div class="rowlink-main">
                <span style="font-size:16px;font-weight:600">${m.name}</span>
                <span class="body-2">${fmtTime(m.t)} · P ${m.protein} · C ${m.carbs} · F ${m.fat}</span>
              </div>
              <span class="food-num"><span class="num" style="font-size:24px">${fmt(m.cal)}</span></span>
            </button>
          </div>`)}
      </section>` : ''}

    <div class="btn-row">
      <label class="btn" style="position:relative;overflow:hidden;font-size:22px" id="photo-btn">
        ${icon('camera', 24, 2.4)} <span id="photo-label">Photo</span>
        <input type="file" accept="image/*" capture="environment" data-photo style="position:absolute;inset:0;opacity:0;width:100%;height:100%" aria-label="Take a photo of your meal for a rough estimate">
      </label>
      <button class="btn btn-quiet" style="min-height:58px;border-radius:var(--r-btn)" data-action="custom">${icon('plus', 20, 2.6)} Custom</button>
    </div>
    <p class="small flare" id="photo-error" role="alert" style="padding:0 4px;margin-top:-8px"></p>

    <section style="display:flex;flex-direction:column;gap:10px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;padding:8px 4px 0">
        <h2 class="label-strong">Quick add</h2>
        <span class="small">Tap to log. All values are estimates.</span>
      </div>
      <div class="fchips" role="group" aria-label="Quick-add lists">
        ${groups.map((g) => html`<button class="fchip" data-action="group" data-v="${g}" aria-pressed="${String(group === g)}">${g}</button>`)}
      </div>
      <div>
        ${shown.length === 0 ? html`<p class="body-2" style="padding:12px 4px">Nothing here yet. ${group === groups.at(-1) ? 'Meals you save from Custom entry appear in this list.' : 'Add one below.'}</p>` : ''}
        ${[...shown, ...(group === groups.at(-1) ? orphans : [])].map((f) => html`
          <div class="food-row">
            <button class="rowlink" data-action="quick" data-id="${f.id}" aria-label="Log ${f.name}, ${f.cal} calories">
              <div class="rowlink-main">
                <span style="font-size:16px;font-weight:600">${f.name}</span>
                <span class="body-2">P ${f.protein} · C ${f.carbs} · F ${f.fat}${f.note ? ` · ${f.note}` : ''}</span>
              </div>
              <span class="food-num"><span class="num" style="font-size:24px">${fmt(f.cal)}</span><span class="est">est</span></span>
            </button>
            <button class="iconbtn" data-action="editFood" data-id="${f.id}" aria-label="Edit ${f.name}">${icon('gear', 20)}</button>
          </div>`)}
      </div>
      <button class="btn btn-ghost" data-action="newFood">${icon('plus', 20, 2.6)} Add to ${group}</button>
    </section>

  `);

  const changed = () => ctx.refresh();

  // Photo estimate: shrink the photo, ask the Worker, then open the entry
  // form filled in so the numbers can be corrected before saving.
  el.onchange = async (e) => {
    if (!('photo' in e.target.dataset) || !e.target.files[0]) return;
    const label = el.querySelector('#photo-label');
    const error = el.querySelector('#photo-error');
    error.textContent = '';
    label.textContent = 'Estimating...';
    el.querySelector('#photo-btn').style.opacity = '0.6';
    try {
      const photo = await compressPhoto(e.target.files[0], 1024, 0.7);
      const est = await estimatePhoto(photo);
      openFoodSheet({
        mode: 'custom', date: today, item: est,
        hint: `Estimate from your photo (${est.confidence} confidence). ${est.note} Check the numbers before saving.`,
      }, changed);
    } catch (err) {
      error.textContent = err instanceof CloudError ? err.message : 'The photo could not be used. Enter the meal by hand.';
    }
    await ctx.refresh();
    const again = el.querySelector('#photo-error');
    if (again && error.textContent) again.textContent = error.textContent;
  };
  onAction(el, {
    group: (t) => { group = t.dataset.v; ctx.refresh(); },
    quick: async (t) => {
      const f = foods.find((x) => x.id === t.dataset.id);
      await logMeal(today, { ...f, foodId: f.id });
      toast(`Logged · ${fmt(f.cal)} cal`);
      await ctx.refresh();
    },
    custom: () => openFoodSheet({ mode: 'custom', date: today }, changed),
    meal: (t) => openFoodSheet({ mode: 'meal', date: today, item: day.meals.find((m) => m.id === t.dataset.id) }, changed),
    editFood: (t) => openFoodSheet({ mode: 'food', date: today, item: foods.find((x) => x.id === t.dataset.id) }, changed),
    newFood: () => openFoodSheet({ mode: 'newFood', date: today, group }, changed),
  });
}
