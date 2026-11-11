// Settings for everything built so far. Each field saves as soon as it changes.

import { html, mount, onAction } from '../lib/dom.js';
import { icon } from '../ui/icons.js';
import { settings, setSetting } from '../state.js';

function numField(label, hint, path, value, unit, min, max) {
  return html`
    <label class="field">
      <span class="field-label">${label}<span class="field-hint">${hint}</span></span>
      <input class="input" type="number" inputmode="numeric" data-path="${path}" data-min="${min}" data-max="${max}" value="${value}">
      <span class="field-unit">${unit}</span>
    </label>`;
}

export async function render(el, ctx) {
  const s = settings();

  mount(el, html`
    <header class="head"><div class="head-stack">
      <a class="backlink label" href="#/me">${icon('left', 18, 2.4)} Me</a>
      <h1 class="title">Settings</h1>
    </div></header>

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
    if (t.dataset.path) {
      const n = Math.round(Number(t.value));
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
