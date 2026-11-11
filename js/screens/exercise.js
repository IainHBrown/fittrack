// One exercise: personal records, top weight and estimated 1-rep max over
// time, recent sessions, and its settings.

import { html, mount, onAction } from '../lib/dom.js';
import { parseKey, monthName } from '../lib/dates.js';
import { getLogs } from '../db.js';
import { settings } from '../state.js';
import { icon } from '../ui/icons.js';
import { lineChart } from '../ui/chart.js';
import { historyFor, records, bests } from '../engine/overload.js';
import { seedLifting, getExercises, saveExercise, perfText } from '../lift-service.js';

const short = (key) => `${parseKey(key).getDate()} ${monthName(key).slice(0, 3)}`;

export async function render(el, ctx) {
  await seedLifting();
  const id = (ctx.params || [])[0];
  const [exercises, logs] = await Promise.all([getExercises(), getLogs()]);
  const ex = exercises.get(id);
  if (!ex) { location.hash = '#/train/lifting'; return; }
  const cfg = settings().lifting;
  const history = historyFor(id, logs, { includeEasy: true });
  const rec = records(history);
  const bw = ex.type === 'bodyweight';
  const unit = ex.repUnit === 'sec' ? 's' : 'reps';
  const bestReps = Math.max(0, ...history.flatMap((p) => p.sets.map((s) => s.reps)));
  const defaultInc = ex.group === 'lower' ? cfg.incLower : cfg.incUpper;

  mount(el, html`
    <header class="head"><div class="head-stack">
      <a class="backlink label" href="#/train/lifting">${icon('left', 18, 2.4)} Lifting</a>
      <h1 class="title" style="font-size:${ex.name.length > 16 ? 34 : 44}px">${ex.name}</h1>
    </div></header>

    <section class="panel panel-tight stats">
      ${bw ? html`
        <div class="stat"><span class="label">Best set</span><span class="num">${bestReps || '--'}<span class="unit"> ${unit}</span></span><span class="small">personal record</span></div>
      ` : html`
        <div class="stat"><span class="label">Top weight</span><span class="num">${rec.top.value || '--'}<span class="unit"> lb</span></span><span class="small">${rec.top.date ? short(rec.top.date) : 'personal record'}</span></div>
        <div class="stat"><span class="label">Est. 1RM</span><span class="num">${rec.e1rm.value || '--'}<span class="unit"> lb</span></span><span class="small">${rec.e1rm.date ? short(rec.e1rm.date) : 'personal record'}</span></div>`}
      <div class="stat"><span class="label">Sessions</span><span class="num">${history.length}</span><span class="small">logged</span></div>
    </section>

    ${history.length >= 2 ? html`
      <section style="display:flex;flex-direction:column;gap:8px;padding:0 4px">
        <div class="legend">
          ${bw ? html`<span class="legend-item"><span class="swatch" style="background:var(--lift)"></span>Best set (${unit})</span>` : html`
            <span class="legend-item"><span class="swatch" style="background:var(--lift)"></span>Top weight</span>
            <span class="legend-item"><span class="swatch" style="background:var(--text)"></span>Estimated 1-rep max</span>`}
        </div>
        ${lineChart({
          title: `${ex.name} progress`,
          unit: bw ? unit : 'lb',
          labels: history.map((p) => short(p.date)),
          series: bw
            ? [{ label: 'Best set', color: 'var(--lift)', values: history.map((p) => Math.max(...p.sets.map((s) => s.reps))) }]
            : [
              { label: 'Est. 1RM', color: 'var(--text)', values: history.map((p) => bests(p).e1rm) },
              { label: 'Top weight', color: 'var(--lift)', values: history.map((p) => bests(p).top) },
            ],
        })}
      </section>` : html`<p class="body-2" style="padding:0 4px">${history.length ? 'One session logged. The chart appears after the second.' : 'No sessions yet. History and records build up as you log workouts.'}</p>`}

    ${history.length ? html`
      <section>
        <h2 class="label-strong section-title" style="padding-bottom:6px">Recent sessions</h2>
        ${history.slice(-8).reverse().map((p) => html`
          <div class="field">
            <span class="field-label">${short(p.date)} ${parseKey(p.date).getFullYear()}</span>
            <span class="label-strong" style="font-size:18px">${perfText(ex, p)}</span>
          </div>`)}
      </section>` : ''}

    <h2 class="label-strong section-title">Settings</h2>
    <section class="panel" style="gap:0;padding:8px 20px">
      <label class="field">
        <span class="field-label">Name</span>
        <input class="input" style="width:190px;text-align:left" type="text" maxlength="40" data-f="name" value="${ex.name}">
      </label>
      <label class="field">
        <span class="field-label">Body area</span>
        <select class="input" data-f="group">
          ${[['lower', 'Lower body'], ['upper', 'Upper body'], ['core', 'Core']].map(([v, l]) => html`<option value="${v}" ${v === ex.group ? html`selected` : ''}>${l}</option>`)}
        </select>
      </label>
      ${bw ? '' : html`
        <label class="field">
          <span class="field-label">Weight jump<span class="field-hint">Blank uses the default (+${defaultInc} lb)</span></span>
          <input class="input" type="number" inputmode="decimal" step="any" min="0" data-f="increment" value="${ex.increment ?? ''}" placeholder="${defaultInc}">
          <span class="field-unit">lb</span>
        </label>
        <label class="field">
          <span class="field-label">Starting weight<span class="field-hint">Used as the first target, before any history</span></span>
          <input class="input" type="number" inputmode="decimal" step="any" min="0" data-f="startWeight" value="${ex.startWeight ?? ''}" placeholder="--">
          <span class="field-unit">lb</span>
        </label>`}
    </section>
    <button class="btn btn-ghost" data-action="archive">${ex.archived ? 'Restore to library' : 'Archive exercise'}</button>
    <p class="small" style="padding:0 4px">Archiving hides the exercise from the picker. Its history and records are always kept.</p>
  `);

  el.onchange = async (e) => {
    const f = e.target.dataset.f;
    if (!f) return;
    const v = e.target.value.trim();
    if (f === 'name') { if (v) ex.name = v; }
    else if (f === 'group') ex.group = v;
    else if (v === '' || !(Number(v) > 0)) delete ex[f];
    else ex[f] = Number(v);
    await saveExercise(ex);
    ctx.refresh();
  };

  onAction(el, {
    archive: async () => { ex.archived = !ex.archived; await saveExercise(ex); ctx.refresh(); },
  });
}
