// Settings for everything built so far. Each field saves as soon as it changes.

import { html, mount, onAction } from '../lib/dom.js';
import { icon } from '../ui/icons.js';
import { settings, setSetting } from '../state.js';
import { getAll, putItem } from '../db.js';

function numField(label, hint, path, value, unit, min, max, float = false) {
  return html`
    <label class="field">
      <span class="field-label">${label}<span class="field-hint">${hint}</span></span>
      <input class="input" type="number" inputmode="${float ? 'decimal' : 'numeric'}" step="${float ? '0.5' : '1'}" data-path="${path}" data-min="${min}" data-max="${max}" ${float ? html`data-float` : ''} value="${value}">
      <span class="field-unit">${unit}</span>
    </label>`;
}

function dateField(label, hint, path, value) {
  return html`
    <label class="field">
      <span class="field-label">${label}<span class="field-hint">${hint}</span></span>
      <input class="input" type="date" data-date-path="${path}" value="${value}">
    </label>`;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function dayField(label, hint, path, value) {
  return html`
    <label class="field">
      <span class="field-label">${label}<span class="field-hint">${hint}</span></span>
      <select class="input" data-day-path="${path}">
        ${DAYS.map((d, i) => html`<option value="${i}" ${i === value ? html`selected` : ''}>${d}</option>`)}
      </select>
    </label>`;
}

export async function render(el, ctx) {
  const s = settings();

  mount(el, html`
    <header class="head"><div class="head-stack">
      <a class="backlink label" href="#/me">${icon('left', 18, 2.4)} Me</a>
      <h1 class="title">Settings</h1>
    </div></header>

    <h2 class="label-strong section-title">Goal events</h2>
    <section class="panel" style="gap:0;padding:8px 20px">
      ${s.goals.map((g, i) => html`
        <div class="field" style="flex-direction:column;align-items:stretch;gap:8px;padding:12px 0">
          <input class="input input-wide" type="text" maxlength="40" data-goal="${i}" data-key="name" value="${g.name}" aria-label="Event ${i + 1} name">
          <div style="display:flex;gap:8px">
            <select class="input" style="flex:1 1 0;min-width:0;max-width:none" data-goal="${i}" data-key="type" aria-label="Event ${i + 1} type">
              ${Object.entries(s.eventTypes).map(([id, t]) => html`<option value="${id}" ${id === g.type ? html`selected` : ''}>${t.label}</option>`)}
            </select>
            <input class="input" style="flex:1 1 0;min-width:0;max-width:none" type="date" data-goal="${i}" data-key="date" value="${g.date}" aria-label="Event ${i + 1} date">
          </div>
        </div>`)}
      <p class="small" style="padding:8px 0 10px">Changing a type or date rebuilds the training plan around it. Logged sessions are kept.</p>
    </section>

    <h2 class="label-strong section-title">Training plan</h2>
    <section class="panel" style="gap:0;padding:8px 20px">
      ${dateField('Plan start', 'First day of week 1', 'plan.startDate', s.plan.startDate)}
      ${dayField('Rest day', 'No sessions are planned', 'plan.restDow', s.plan.restDow)}
      ${dayField('Long ride day', '', 'plan.longRideDow', s.plan.longRideDow)}
      ${dayField('Long run day', '', 'plan.longRunDow', s.plan.longRunDow)}
      ${numField('Starting hours', 'Weekly total in week 1, lifting included', 'plan.startHours', s.plan.startHours, 'h', 2, 20, true)}
      ${numField('Peak hours', 'Weekly total at the top of the build', 'plan.peakHours', s.plan.peakHours, 'h', 2, 25, true)}
      ${dateField('Reach peak by', 'Volume builds until this date', 'plan.peakBy', s.plan.peakBy)}
      ${numField('Lifts a week, at first', '', 'plan.lifts.before', s.plan.lifts.before, '', 0, 3)}
      ${dateField('Lifting changes on', '', 'plan.lifts.switchDate', s.plan.lifts.switchDate)}
      ${numField('Lifts a week, after', '', 'plan.lifts.after', s.plan.lifts.after, '', 0, 3)}
      ${numField('Lift length', '', 'plan.lifts.minutes', s.plan.lifts.minutes, 'min', 15, 120)}
      ${numField('Knee pain trigger', 'At or above this, upcoming runs are eased', 'plan.knee.painThreshold', s.plan.knee.painThreshold, '', 1, 10)}
      ${numField('Ease runs for', 'Days after a flagged knee log', 'plan.knee.reduceDays', s.plan.knee.reduceDays, 'd', 1, 30)}
    </section>

    <h2 class="label-strong section-title">Lifting</h2>
    <section class="panel" style="gap:0;padding:8px 20px">
      ${numField('Upper-body jump', 'Added after hitting every rep', 'lifting.incUpper', s.lifting.incUpper, 'lb', 1, 50, true)}
      ${numField('Lower-body jump', 'Added after hitting every rep', 'lifting.incLower', s.lifting.incLower, 'lb', 1, 50, true)}
      ${numField('Deload', 'Drop after missing the same weight twice', 'lifting.deloadPct', s.lifting.deloadPct, '%', 1, 50)}
      ${numField('Round weights to', '', 'lifting.round', s.lifting.round, 'lb', 1, 25, true)}
      <p class="small" style="padding:8px 0 10px">Routines, exercises and per-exercise jumps are edited in Train, then Lifting.</p>
    </section>

    <h2 class="label-strong section-title">Food targets</h2>
    <section class="panel" style="gap:0;padding:8px 20px">
      ${numField('Rest day calories', '', 'food.targets.rest.cal', s.food.targets.rest.cal, 'cal', 500, 8000)}
      ${numField('Rest day carbs', '', 'food.targets.rest.carbs', s.food.targets.rest.carbs, 'g', 0, 1500)}
      ${numField('Training day calories', '', 'food.targets.training.cal', s.food.targets.training.cal, 'cal', 500, 8000)}
      ${numField('Training day carbs', '', 'food.targets.training.carbs', s.food.targets.training.carbs, 'g', 0, 1500)}
      ${numField('Long day calories', 'Days with a long ride or long run', 'food.targets.long.cal', s.food.targets.long.cal, 'cal', 500, 8000)}
      ${numField('Long day carbs', '', 'food.targets.long.carbs', s.food.targets.long.carbs, 'g', 0, 1500)}
      ${numField('Protein, from', 'Counts as hit inside the range', 'food.protein.min', s.food.protein.min, 'g', 0, 500)}
      ${numField('Protein, to', '', 'food.protein.max', s.food.protein.max, 'g', 0, 500)}
      ${numField('Fat, from', '', 'food.fat.min', s.food.fat.min, 'g', 0, 500)}
      ${numField('Fat, to', '', 'food.fat.max', s.food.fat.max, 'g', 0, 500)}
      <p class="small" style="padding:8px 0 10px">The quick-add list is edited on the Food tab with the gear beside each item.</p>
    </section>

    <h2 class="label-strong section-title">Stretch categories</h2>
    <section class="panel" style="gap:0;padding:8px 20px 16px">
      ${s.stretchCategories.map((c, i) => html`
        <div class="supp-edit" style="grid-template-columns:minmax(0,1fr) 44px">
          <input class="input input-wide" type="text" maxlength="20" data-cat="${i}" value="${c}" aria-label="Category name">
          <button class="iconbtn" data-action="removeCat" data-i="${i}" aria-label="Remove ${c}">${icon('trash', 20)}</button>
        </div>`)}
      <button class="btn btn-ghost" style="margin-top:10px" data-action="addCat">${icon('plus', 20, 2.6)} Add category</button>
    </section>

    <h2 class="label-strong section-title">Sleep</h2>
    <section class="panel" style="gap:0;padding:8px 20px">
      ${numField('Good night score', 'At or above this counts as a good night', 'sleep.goal', s.sleep.goal, '', 1, 100)}
      ${numField('Low score', 'Below this the app suggests an easy day', 'sleep.lowBelow', s.sleep.lowBelow, '', 0, 100)}
    </section>

    <h2 class="label-strong section-title">Water</h2>
    <section class="panel" style="gap:0;padding:8px 20px">
      ${numField('Daily goal', 'Normal days', 'water.goalMl', s.water.goalMl, 'ml', 250, 10000)}
      ${numField('Long-day goal', 'Used on long training days', 'water.longDayGoalMl', s.water.longDayGoalMl, 'ml', 250, 10000)}
      ${s.water.quickAdds.map((q, i) => html`
        <div class="field">
          <span class="field-label" style="flex:0 0 auto">Button ${i + 1}</span>
          <input class="input input-wide" style="flex:1 1 0;min-width:0" type="text" maxlength="12" data-quick="${i}" data-key="label" value="${q.label}" aria-label="Button ${i + 1} label">
          <input class="input" style="width:80px" type="number" inputmode="numeric" data-quick="${i}" data-key="ml" value="${q.ml}" aria-label="Button ${i + 1} amount in ml">
          <span class="field-unit">ml</span>
        </div>`)}
    </section>

    <h2 class="label-strong section-title">Supplements</h2>
    <section class="panel" style="gap:0;padding:8px 20px 16px">
      ${s.supplements.map((p, i) => html`
        <div class="supp-edit">
          <input class="input input-wide" type="text" maxlength="24" data-supp="${i}" data-key="name" value="${p.name}" aria-label="Supplement name">
          <input class="input input-wide" type="text" maxlength="12" data-supp="${i}" data-key="dose" value="${p.dose}" placeholder="dose" aria-label="Dose">
          <button class="iconbtn" data-action="removeSupp" data-i="${i}" aria-label="Remove ${p.name}">${icon('trash', 20)}</button>
        </div>`)}
      <button class="btn btn-ghost" style="margin-top:10px" data-action="addSupp">${icon('plus', 20, 2.6)} Add supplement</button>
    </section>

    <p class="small" style="padding:0 4px">Changes save automatically. More settings arrive with each stage.</p>
  `);

  // Save on change (fires when a field loses focus or Done is tapped).
  el.onchange = async (e) => {
    const t = e.target;
    if (t.dataset.datePath) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(t.value)) { ctx.refresh(); return; } // cleared: put the old date back
      await setSetting(t.dataset.datePath, t.value);
      ctx.refresh();
    } else if (t.dataset.dayPath) {
      await setSetting(t.dataset.dayPath, Number(t.value));
      ctx.refresh();
    } else if (t.dataset.cat != null) {
      // renaming a category also renames it on the stretches that use it
      const list = [...settings().stretchCategories];
      const i = Number(t.dataset.cat);
      const v = t.value.trim();
      if (!v || list.includes(v)) { ctx.refresh(); return; }
      const old = list[i];
      list[i] = v;
      for (const st of await getAll('stretches')) if (st.category === old) await putItem('stretches', { ...st, category: v });
      await setSetting('stretchCategories', list);
      ctx.refresh();
    } else if (t.dataset.goal != null) {
      const list = structuredClone(settings().goals);
      const g = list[Number(t.dataset.goal)];
      const v = t.value.trim();
      if (!v || (t.dataset.key === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(v))) { ctx.refresh(); return; }
      g[t.dataset.key] = v;
      await setSetting('goals', list);
      ctx.refresh();
    } else if (t.dataset.path) {
      const n = 'float' in t.dataset ? Math.round(Number(t.value) * 2) / 2 : Math.round(Number(t.value));
      const min = Number(t.dataset.min), max = Number(t.dataset.max);
      if (t.value === '' || Number.isNaN(n)) { ctx.refresh(); return; } // put the old value back
      await setSetting(t.dataset.path, Math.min(max, Math.max(min, n)));
      ctx.refresh();
    } else if (t.dataset.quick != null) {
      const list = structuredClone(settings().water.quickAdds);
      const item = list[Number(t.dataset.quick)];
      if (t.dataset.key === 'ml') {
        const n = Math.round(Number(t.value));
        if (!(n > 0)) { ctx.refresh(); return; }
        item.ml = Math.min(5000, n);
      } else {
        item.label = t.value.trim() || `+${item.ml} ml`;
      }
      await setSetting('water.quickAdds', list);
      ctx.refresh();
    } else if (t.dataset.supp != null) {
      const list = structuredClone(settings().supplements);
      const item = list[Number(t.dataset.supp)];
      const v = t.value.trim();
      if (t.dataset.key === 'name' && !v) { ctx.refresh(); return; }
      item[t.dataset.key] = v;
      await setSetting('supplements', list);
    }
  };

  onAction(el, {
    addCat: async () => {
      const list = [...settings().stretchCategories];
      let name = 'New category';
      for (let n = 2; list.includes(name); n++) name = `New category ${n}`;
      list.push(name);
      await setSetting('stretchCategories', list);
      await ctx.refresh();
      const inputs = el.querySelectorAll('[data-cat]');
      const last = inputs[inputs.length - 1];
      if (last) { last.focus(); last.select(); }
    },
    removeCat: async (t) => {
      const list = [...settings().stretchCategories];
      if (list.length <= 1) return; // keep at least one
      list.splice(Number(t.dataset.i), 1); // stretches keep their old label until re-filed
      await setSetting('stretchCategories', list);
      ctx.refresh();
    },
    addSupp: async () => {
      const list = structuredClone(settings().supplements);
      list.push({ id: `s${Date.now().toString(36)}`, name: 'New supplement', dose: '' });
      await setSetting('supplements', list);
      await ctx.refresh();
      const inputs = el.querySelectorAll('[data-key="name"][data-supp]');
      const last = inputs[inputs.length - 1];
      if (last) { last.focus(); last.select(); }
    },
    removeSupp: async (t) => {
      const list = structuredClone(settings().supplements);
      list.splice(Number(t.dataset.i), 1); // past days keep their ticks
      await setSetting('supplements', list);
      ctx.refresh();
    },
  });
}
