// Settings. Every number, schedule and piece of wording that drives the app
// can be changed here. Fields save as soon as they change, and each page has
// a "reset to defaults" button.
//
// Route: #/me/settings (index) and #/me/settings/<page>.

import { html, mount, onAction } from '../lib/dom.js';
import { dayKey } from '../lib/dates.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/toast.js';
import { settings, setSetting, resetSettings, pathGet, loadSettings } from '../state.js';
import { getAll, putItem, dumpAll, restoreAll, kvGet, kvSet } from '../db.js';
import { makeBackup, checkBackup, backupFileName } from '../logic/backup.js';
import { VERSION } from '../version.js';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// ---------- field builders (all read their value from the path) ----------

function num(s, label, hint, path, { unit = '', min = 0, max = 100000, kind = 'int' } = {}) {
  const raw = pathGet(s, path);
  const value = kind === 'pct' ? Math.round(raw * 1000) / 10 : raw;
  return html`
    <label class="field">
      <span class="field-label">${label}${hint ? html`<span class="field-hint">${hint}</span>` : ''}</span>
      <input class="input" type="number" inputmode="${kind === 'int' ? 'numeric' : 'decimal'}" step="any"
        data-path="${path}" data-kind="${kind}" data-min="${min}" data-max="${max}" value="${value}">
      <span class="field-unit">${kind === 'pct' ? '%' : unit}</span>
    </label>`;
}

function date(s, label, hint, path) {
  return html`
    <label class="field">
      <span class="field-label">${label}${hint ? html`<span class="field-hint">${hint}</span>` : ''}</span>
      <input class="input" type="date" data-path="${path}" data-kind="date" value="${pathGet(s, path)}">
    </label>`;
}

function weekday(s, label, hint, path) {
  const value = pathGet(s, path);
  return html`
    <label class="field">
      <span class="field-label">${label}${hint ? html`<span class="field-hint">${hint}</span>` : ''}</span>
      <select class="input" data-path="${path}" data-kind="day">
        ${DAYS.map((d, i) => html`<option value="${i}" ${i === value ? html`selected` : ''}>${d}</option>`)}
      </select>
    </label>`;
}

/** A stacked label + full-width text box (or multi-line box). */
function text(s, label, path, { area = false, max = 60 } = {}) {
  const value = pathGet(s, path);
  return html`
    <label class="form-field" style="padding:8px 0">
      <span class="label">${label}</span>
      ${area
        ? html`<textarea class="input" style="height:104px" maxlength="${max}" data-path="${path}" data-kind="text">${value}</textarea>`
        : html`<input class="input input-wide" type="text" maxlength="${max}" data-path="${path}" data-kind="text" value="${value}">`}
    </label>`;
}

const panel = (title, body, pad = '8px 20px') => html`
  <h2 class="label-strong section-title">${title}</h2>
  <section class="panel" style="gap:0;padding:${pad}">${body}</section>`;

const note = (t) => html`<p class="small" style="padding:8px 0 10px">${t}</p>`;

const resetButton = (paths) => html`
  <button class="btn btn-ghost" style="border:0;color:var(--ash)" data-action="reset" data-paths="${paths.join(',')}">Reset this page to defaults</button>`;

/** One editable input inside a list: saves list[i][key] (or list[i] when there is no key). */
function cell(listPath, i, key, value, { kind = 'text', label = '', style = '', max = 40, placeholder = '' } = {}) {
  return html`<input class="input input-wide" style="${style}" type="${kind === 'text' ? 'text' : 'number'}"
    ${kind === 'text' ? html`maxlength="${max}"` : html`inputmode="decimal" step="any" min="0"`}
    data-list="${listPath}" data-i="${i}" ${key ? html`data-key="${key}"` : ''} data-kind="${kind}"
    value="${value}" placeholder="${placeholder}" aria-label="${label}">`;
}

const removeBtn = (listPath, i, label, min = 0) => html`
  <button class="iconbtn" data-action="remove" data-list="${listPath}" data-i="${i}" data-min="${min}" aria-label="Remove ${label}">${icon('trash', 20)}</button>`;

const addBtn = (listPath, label) => html`
  <button class="btn btn-ghost" style="margin-top:10px" data-action="add" data-list="${listPath}">${icon('plus', 20, 2.6)} ${label}</button>`;

// What "add" appends to each list.
const NEW_ITEM = {
  supplements: () => ({ id: `s${Date.now().toString(36)}`, name: 'New supplement', dose: '' }),
  stretchCategories: (list) => uniqueName('New category', list),
  'food.groups': (list) => uniqueName('New list', list),
  levels: (list) => ({ name: 'New level', xp: Math.max(0, ...list.map((l) => l.xp)) + 10000 }),
  swimStages: (list) => ({ main: 'New set', rest: '', m: (list.at(-1) ? list.at(-1).m : 0) + 100 }),
};
function uniqueName(base, list) {
  let name = base;
  for (let n = 2; list.includes(name); n++) name = `${base} ${n}`;
  return name;
}

// ---------- pages ----------

const PAGES = {
  plan: {
    title: 'Goals and plan',
    sub: 'Events, schedule, weekly hours, knee rules',
    reset: ['goals', 'plan', 'eventTypes'],
    body: (s) => html`
      ${panel('Goal events', html`
        ${s.goals.map((g, i) => html`
          <div class="field" style="flex-direction:column;align-items:stretch;gap:8px;padding:12px 0">
            ${cell('goals', i, 'name', g.name, { label: `Event ${i + 1} name` })}
            <div style="display:flex;gap:8px">
              <select class="input" style="flex:1 1 0;min-width:0;max-width:none" data-list="goals" data-i="${i}" data-key="type" data-kind="text" aria-label="Event ${i + 1} type">
                ${Object.entries(s.eventTypes).map(([id, t]) => html`<option value="${id}" ${id === g.type ? html`selected` : ''}>${t.label}</option>`)}
              </select>
              <input class="input" style="flex:1 1 0;min-width:0;max-width:none" type="date" data-list="goals" data-i="${i}" data-key="date" data-kind="date" value="${g.date}" aria-label="Event ${i + 1} date">
            </div>
          </div>`)}
        ${note('Changing a type or date rebuilds the training plan around it. Logged sessions are kept.')}`)}

      ${panel('Schedule', html`
        ${date(s, 'Plan start', 'First day of week 1', 'plan.startDate')}
        ${weekday(s, 'Rest day', 'No sessions are planned', 'plan.restDow')}
        ${weekday(s, 'Long ride day', '', 'plan.longRideDow')}
        ${weekday(s, 'Long run day', '', 'plan.longRunDow')}
        ${num(s, 'Lifts a week, at first', '', 'plan.lifts.before', { max: 3 })}
        ${date(s, 'Lifting changes on', '', 'plan.lifts.switchDate')}
        ${num(s, 'Lifts a week, after', '', 'plan.lifts.after', { max: 3 })}
        ${num(s, 'Lift length', '', 'plan.lifts.minutes', { unit: 'min', min: 15, max: 120 })}`)}

      ${panel('Weekly volume', html`
        ${num(s, 'Starting hours', 'Weekly total in week 1, lifting included', 'plan.startHours', { unit: 'h', min: 2, max: 20, kind: 'float' })}
        ${num(s, 'Peak hours', 'Weekly total at the top of the build', 'plan.peakHours', { unit: 'h', min: 2, max: 25, kind: 'float' })}
        ${date(s, 'Reach peak by', 'Volume builds until this date', 'plan.peakBy')}
        ${num(s, 'Biggest weekly increase', 'Total volume never rises faster', 'plan.maxWeeklyIncrease', { kind: 'pct', min: 1, max: 30 })}
        ${num(s, 'Easy weeks at the start', 'Before the first test week', 'plan.easyWeeks', { max: 6 })}
        ${num(s, 'Recovery week every', 'Every Nth week is lighter', 'plan.recoveryEvery', { unit: 'wk', min: 2, max: 8 })}
        ${num(s, 'Recovery week size', 'Share of a normal week', 'plan.recoveryFactor', { kind: 'pct', min: 30, max: 100 })}
        ${num(s, 'Retest after at least', 'Tests fall on recovery weeks', 'plan.retestMinWeeks', { unit: 'wk', min: 3, max: 20 })}`)}

      ${panel('Running and swimming', html`
        ${num(s, 'Starting run time', 'Minutes a week in week 1', 'plan.run.startMin', { unit: 'min', max: 600 })}
        ${num(s, 'Biggest weekly run increase', '', 'plan.run.maxWeeklyIncrease', { kind: 'pct', min: 1, max: 30 })}
        ${num(s, 'Most swim time a week', '', 'plan.swim.maxMinPerWeek', { unit: 'min', max: 600 })}`)}

      ${panel('Knee and easy days', html`
        ${num(s, 'Knee pain trigger', 'At or above this, upcoming runs are eased', 'plan.knee.painThreshold', { min: 1, max: 10 })}
        ${num(s, 'Ease runs for', 'Days after a flagged knee log', 'plan.knee.reduceDays', { unit: 'd', min: 1, max: 30 })}
        ${num(s, 'Eased run length', 'Share of the planned run', 'plan.knee.runFactor', { kind: 'pct', min: 10, max: 100 })}
        ${num(s, '"Make it easy" length', 'Share of the planned session', 'plan.easyDayFactor', { kind: 'pct', min: 30, max: 100 })}`)}

      ${panel('Event types', html`
        ${Object.entries(s.eventTypes).map(([id, t]) => html`
          <div class="field" style="flex-direction:column;align-items:stretch;gap:8px;padding:12px 0">
            <input class="input input-wide" type="text" maxlength="30" data-path="eventTypes.${id}.label" data-kind="text" value="${t.label}" aria-label="Event type name">
            <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px">
              ${[['taperWeeks', 'Taper wk', 'int', 1, 6], ['shares.swim', 'Swim %', 'pct', 0, 100], ['shares.bike', 'Bike %', 'pct', 0, 100], ['shares.run', 'Run %', 'pct', 0, 100]].map(([key, label, kind, min, max]) => html`
                <label class="form-field" style="gap:3px">
                  <span class="small">${label}</span>
                  <input class="input input-wide" style="text-align:center;padding:0 4px" type="number" inputmode="decimal" step="any"
                    data-path="eventTypes.${id}.${key}" data-kind="${kind}" data-min="${min}" data-max="${max}"
                    value="${kind === 'pct' ? Math.round(pathGet(t, key) * 100) : pathGet(t, key)}">
                </label>`)}
            </div>
          </div>`)}
        ${note('The percentages share out endurance time between sports. Running is also held back by its own weekly limit.')}`)}`,
  },

  daily: {
    title: 'Sleep, water, supplements',
    sub: 'Daily goals and the supplement list',
    reset: ['sleep', 'water', 'supplements'],
    body: (s) => html`
      ${panel('Sleep', html`
        ${num(s, 'Good night score', 'At or above this counts as a good night', 'sleep.goal', { min: 1, max: 100 })}
        ${num(s, 'Low score', 'Below this the app suggests an easy day', 'sleep.lowBelow', { max: 100 })}`)}
      ${panel('Water', html`
        ${num(s, 'Daily goal', 'Normal days', 'water.goalMl', { unit: 'ml', min: 250, max: 10000 })}
        ${num(s, 'Long-day goal', 'Days with a long ride or long run', 'water.longDayGoalMl', { unit: 'ml', min: 250, max: 10000 })}
        ${s.water.quickAdds.map((q, i) => html`
          <div class="field">
            <span class="field-label" style="flex:0 0 auto">Button ${i + 1}</span>
            ${cell('water.quickAdds', i, 'label', q.label, { label: `Button ${i + 1} label`, style: 'flex:1 1 0;min-width:0', max: 12 })}
            ${cell('water.quickAdds', i, 'ml', q.ml, { kind: 'num', label: `Button ${i + 1} amount in ml`, style: 'width:80px;flex:0 0 auto;text-align:right' })}
            <span class="field-unit">ml</span>
          </div>`)}`)}
      ${panel('Supplements', html`
        ${s.supplements.map((p, i) => html`
          <div class="supp-edit">
            ${cell('supplements', i, 'name', p.name, { label: 'Supplement name', max: 24 })}
            ${cell('supplements', i, 'dose', p.dose, { label: 'Dose', max: 12, placeholder: 'dose' })}
            ${removeBtn('supplements', i, p.name)}
          </div>`)}
        ${addBtn('supplements', 'Add supplement')}`, '8px 20px 16px')}`,
  },

  lifting: {
    title: 'Lifting',
    sub: 'Weight jumps, deload, rounding',
    reset: ['lifting'],
    body: (s) => html`
      ${panel('Progression', html`
        ${num(s, 'Upper-body jump', 'Added after hitting every rep', 'lifting.incUpper', { unit: 'lb', min: 1, max: 50, kind: 'float' })}
        ${num(s, 'Lower-body jump', 'Added after hitting every rep', 'lifting.incLower', { unit: 'lb', min: 1, max: 50, kind: 'float' })}
        ${num(s, 'Deload', 'Drop after missing the same weight twice', 'lifting.deloadPct', { unit: '%', min: 1, max: 50 })}
        ${num(s, 'Round weights to', '', 'lifting.round', { unit: 'lb', min: 1, max: 25, kind: 'float' })}
        ${note('Routines, exercises, starting weights and per-exercise jumps are edited in Train, then Lifting.')}`)}`,
  },

  food: {
    title: 'Food',
    sub: 'Targets by day type, quick-add lists',
    reset: ['food'],
    body: (s) => html`
      ${panel('Daily targets', html`
        ${num(s, 'Rest day calories', '', 'food.targets.rest.cal', { unit: 'cal', min: 500, max: 8000 })}
        ${num(s, 'Rest day carbs', '', 'food.targets.rest.carbs', { unit: 'g', max: 1500 })}
        ${num(s, 'Training day calories', '', 'food.targets.training.cal', { unit: 'cal', min: 500, max: 8000 })}
        ${num(s, 'Training day carbs', '', 'food.targets.training.carbs', { unit: 'g', max: 1500 })}
        ${num(s, 'Long day calories', 'Days with a long ride or long run', 'food.targets.long.cal', { unit: 'cal', min: 500, max: 8000 })}
        ${num(s, 'Long day carbs', '', 'food.targets.long.carbs', { unit: 'g', max: 1500 })}
        ${num(s, 'Protein, from', 'Counts as hit inside the range', 'food.protein.min', { unit: 'g', max: 500 })}
        ${num(s, 'Protein, to', '', 'food.protein.max', { unit: 'g', max: 500 })}
        ${num(s, 'Fat, from', '', 'food.fat.min', { unit: 'g', max: 500 })}
        ${num(s, 'Fat, to', '', 'food.fat.max', { unit: 'g', max: 500 })}`)}
      ${panel('Quick-add lists', html`
        ${s.food.groups.map((g, i) => html`
          <div class="supp-edit" style="grid-template-columns:minmax(0,1fr) 44px">
            ${cell('food.groups', i, null, g, { label: 'List name', max: 16 })}
            ${removeBtn('food.groups', i, g, 1)}
          </div>`)}
        ${addBtn('food.groups', 'Add list')}
        ${note('Meals saved from Custom entry go in the last list. Items in a removed list move to the last list. The foods themselves are edited on the Food tab.')}`, '8px 20px 16px')}`,
  },

  game: {
    title: 'XP, levels, badges',
    sub: 'What earns XP, level names, badge targets',
    reset: ['xp', 'levels', 'badges'],
    body: (s) => html`
      ${panel('XP earned', html`
        ${num(s, 'Session', 'Any planned session or lift', 'xp.session', { unit: 'XP', max: 5000 })}
        ${num(s, 'Long ride or run', '', 'xp.keySession', { unit: 'XP', max: 5000 })}
        ${num(s, 'Baseline test', '', 'xp.test', { unit: 'XP', max: 5000 })}
        ${num(s, 'Race day', '', 'xp.race', { unit: 'XP', max: 50000 })}
        ${num(s, 'Other activity', '', 'xp.other', { unit: 'XP', max: 5000 })}
        ${num(s, 'Lifting PR', 'Each new record', 'xp.pr', { unit: 'XP', max: 5000 })}
        ${num(s, 'Sleep logged', 'Per day', 'xp.sleep', { unit: 'XP', max: 1000 })}
        ${num(s, 'Supplements done', 'Per day', 'xp.supps', { unit: 'XP', max: 1000 })}
        ${num(s, 'Water goal hit', 'Per day', 'xp.water', { unit: 'XP', max: 1000 })}
        ${['Bronze', 'Silver', 'Gold'].map((t, i) => html`
          <div class="field">
            <span class="field-label">${t} badge</span>
            ${cell('xp.badge', i, null, s.xp.badge[i], { kind: 'num', label: `${t} badge XP`, style: 'width:96px;flex:0 0 auto;text-align:right' })}
            <span class="field-unit">XP</span>
          </div>`)}
        ${note('XP is recalculated from your whole history, so a change here updates your total straight away.')}`)}

      ${panel('Levels', html`
        ${s.levels.map((l, i) => html`
          <div class="supp-edit" style="grid-template-columns:minmax(0,1.3fr) minmax(0,1fr) 44px">
            ${cell('levels', i, 'name', l.name, { label: `Level ${i + 1} name`, max: 16 })}
            ${cell('levels', i, 'xp', l.xp, { kind: 'num', label: `XP needed for ${l.name}`, style: 'text-align:right' })}
            ${removeBtn('levels', i, l.name, 2)}
          </div>`)}
        ${addBtn('levels', 'Add level')}
        ${note('Each level needs this much total XP. The lowest one is where you start.')}`, '8px 20px 16px')}

      ${panel('Badges', html`
        <div class="supp-edit" style="grid-template-columns:minmax(0,1.5fr) repeat(3,minmax(0,1fr));padding-bottom:0">
          <span class="small">Badge</span><span class="small" style="text-align:center">Bronze</span><span class="small" style="text-align:center">Silver</span><span class="small" style="text-align:center">Gold</span>
        </div>
        ${s.badges.map((b, i) => html`
          <div class="supp-edit" style="grid-template-columns:minmax(0,1.5fr) repeat(3,minmax(0,1fr))">
            <span class="field-label" style="font-size:14px">${b.name}${b.unit ? html`<span class="field-hint">${b.unit}</span>` : ''}</span>
            ${[0, 1, 2].map((t) => html`<input class="input input-wide" style="text-align:center;padding:0 2px;font-size:15px" type="number" inputmode="decimal" step="any" min="0"
              data-badge="${i}" data-tier="${t}" value="${b.tiers[t]}" aria-label="${b.name} ${['bronze', 'silver', 'gold'][t]} target">`)}
          </div>`)}`)}`,
  },

  stretch: {
    title: 'Stretch categories',
    sub: 'The filter chips on the Stretches screen',
    reset: ['stretchCategories'],
    body: (s) => html`
      ${panel('Categories', html`
        ${s.stretchCategories.map((c, i) => html`
          <div class="supp-edit" style="grid-template-columns:minmax(0,1fr) 44px">
            ${cell('stretchCategories', i, null, c, { label: 'Category name', max: 20 })}
            ${removeBtn('stretchCategories', i, c, 1)}
          </div>`)}
        ${addBtn('stretchCategories', 'Add category')}
        ${note('Renaming a category renames it on every stretch that uses it.')}`, '8px 20px 16px')}`,
  },

  wording: {
    title: 'Session wording',
    sub: 'Session names, instructions, zones, swim stages',
    reset: ['library', 'zoneEffort', 'swimStages'],
    body: (s) => html`
      ${panel('Effort wording', html`
        ${['z1', 'z2', 'z3', 'z4', 'z5'].map((z) => text(s, `Zone ${z.slice(1)}`, `zoneEffort.${z}`, { max: 80 }))}
        ${note('Shown as the target until a baseline test gives you heart-rate or pace zones.')}`)}

      ${panel('Swim stages', html`
        ${s.swimStages.map((st, i) => html`
          <div class="field" style="flex-direction:column;align-items:stretch;gap:6px;padding:10px 0">
            <div style="display:flex;align-items:center;gap:8px">
              <span class="label-strong" style="font-size:17px;flex:1 1 0">Stage ${i + 1}</span>
              ${cell('swimStages', i, 'm', st.m, { kind: 'num', label: `Stage ${i + 1} distance in metres`, style: 'width:84px;flex:0 0 auto;text-align:right' })}
              <span class="field-unit">m</span>
              ${removeBtn('swimStages', i, `stage ${i + 1}`, 1)}
            </div>
            ${cell('swimStages', i, 'main', st.main, { label: `Stage ${i + 1} main set`, max: 60 })}
            ${cell('swimStages', i, 'rest', st.rest, { label: `Stage ${i + 1} rest`, max: 40, placeholder: 'rest between (optional)' })}
          </div>`)}
        ${addBtn('swimStages', 'Add stage')}`, '8px 20px 16px')}

      ${panel('Sessions', html`
        ${Object.keys(s.library).map((k) => html`
          <div style="padding:6px 0;border-top:1px solid var(--line)">
            ${text(s, `${k} · name`, `library.${k}.title`, { max: 30 })}
            ${text(s, 'Instructions', `library.${k}.desc`, { area: true, max: 400 })}
          </div>`)}
        ${note('Words in {curly brackets} are filled in by the plan: {reps}, {knee}, {warm}, {main}, {rest}.')}`)}`,
  },
};

// ---------- backup page (export / import) ----------

let pendingImport = null; // a checked backup waiting for confirmation
let importError = '';

async function dataPage(s) {
  const last = await kvGet('lastExport');
  const fmt = (iso) => new Date(iso).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
  return html`
    ${panel('Export', html`
      <p class="body-2" style="padding:10px 0">Saves everything (settings, plan changes, logs, lifts, food, sleep, stretches and their photos) as one file. Keep a copy somewhere other than this phone.</p>
      <button class="btn" data-action="export">Export all data</button>
      ${note(last ? `Last export: ${fmt(last)}.` : 'You have not exported yet.')}`, '8px 20px 12px')}

    ${panel('Import', html`
      <p class="body-2" style="padding:10px 0">Loads a backup file. This replaces everything currently in the app.</p>
      ${pendingImport ? html`
        <div class="panel" style="background:var(--surface-2);border-radius:var(--r-card);gap:4px;padding:14px;margin-bottom:12px">
          <span class="label">Backup${pendingImport.summary.exportedAt ? ` from ${fmt(pendingImport.summary.exportedAt)}` : ''}</span>
          <span class="body-2">${pendingImport.summary.days} days · ${pendingImport.summary.logs} logged sessions · ${pendingImport.summary.exercises} exercises · ${pendingImport.summary.foods} foods · ${pendingImport.summary.stretches} stretches</span>
        </div>
        <button class="btn" style="background:var(--flare)" data-action="confirmImport">Replace everything with this backup</button>
        <button class="btn btn-ghost" style="margin-top:10px" data-action="cancelImport">Cancel</button>
      ` : html`
        <label class="btn btn-quiet" style="position:relative;overflow:hidden">
          Choose a backup file
          <input type="file" accept="application/json,.json" data-import style="position:absolute;inset:0;opacity:0;width:100%;height:100%" aria-label="Choose a backup file">
        </label>`}
      ${importError ? html`<p class="small flare" role="alert" style="padding-top:10px">${importError}</p>` : ''}
      ${note('Export first if there is anything here you want to keep.')}`, '8px 20px 12px')}`;
}

async function exportAll() {
  const data = makeBackup(await dumpAll(), new Date(), VERSION);
  const name = backupFileName(dayKey());
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  await kvSet('lastExport', new Date().toISOString());
  // On iPhone the share sheet offers "Save to Files"; elsewhere it downloads.
  try {
    const file = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Fitness Tracker backup' });
      return;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return; // closed the share sheet
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

// ---------- screen ----------

export async function render(el, ctx) {
  const s = settings();
  const pageId = (ctx.params || [])[0];
  const page = PAGES[pageId];

  if (!page && pageId !== 'data') {
    mount(el, html`
      <header class="head"><div class="head-stack">
        <a class="backlink label" href="#/me">${icon('left', 18, 2.4)} Me</a>
        <h1 class="title">Settings</h1>
      </div></header>
      <div>
        ${[...Object.entries(PAGES), ['data', { title: 'Backup', sub: 'Export or import all your data' }]].map(([id, p]) => html`
          <a class="rowlink" href="#/me/settings/${id}">
            <div class="rowlink-main">
              <span class="label-strong" style="font-size:19px">${p.title}</span>
              <span class="body-2">${p.sub}</span>
            </div>
            <span style="color:var(--ash)">${icon('right', 18, 2.4)}</span>
          </a>`)}
      </div>
      <p class="small" style="padding:0 4px">Changes save automatically. Version ${VERSION}.</p>`);
    return;
  }

  mount(el, html`
    <header class="head"><div class="head-stack">
      <a class="backlink label" href="#/me/settings">${icon('left', 18, 2.4)} Settings</a>
      <h1 class="title" style="font-size:${(page ? page.title : 'Backup').length > 16 ? 32 : 40}px">${page ? page.title : 'Backup'}</h1>
    </div></header>
    ${page ? page.body(s) : await dataPage(s)}
    ${page ? resetButton(page.reset) : ''}`);

  const again = () => ctx.refresh();

  el.onchange = async (e) => {
    const t = e.target;
    const kind = t.dataset.kind;

    // ---- backup file chosen ----
    if ('import' in t.dataset) {
      importError = '';
      pendingImport = null;
      try {
        const res = checkBackup(JSON.parse(await t.files[0].text()));
        if (res.ok) pendingImport = res; else importError = res.error;
      } catch { importError = 'That file could not be read as a backup.'; }
      return again();
    }

    // ---- a badge tier ----
    if (t.dataset.badge != null) {
      const list = structuredClone(settings().badges);
      const n = Number(t.value);
      if (t.value === '' || !(n > 0)) return again();
      list[Number(t.dataset.badge)].tiers[Number(t.dataset.tier)] = n;
      list[Number(t.dataset.badge)].tiers.sort((a, b) => a - b); // bronze <= silver <= gold
      await setSetting('badges', list);
      return again();
    }

    // ---- a value inside a list ----
    if (t.dataset.list) {
      const path = t.dataset.list;
      const list = structuredClone(pathGet(settings(), path));
      const i = Number(t.dataset.i);
      const key = t.dataset.key;
      let v = t.value.trim();
      if (kind === 'num') {
        if (v === '' || !(Number(v) >= 0)) return again();
        v = Number(v);
      } else if (kind === 'date') {
        if (!ISO_DATE.test(v)) return again();
      } else if (v === '' && key !== 'dose' && key !== 'rest') {
        return again(); // names cannot be blank: put the old one back
      }
      if (key) list[i][key] = v;
      else {
        if (kind !== 'num' && list.includes(v)) return again(); // no duplicate names
        const old = list[i];
        list[i] = v;
        // renaming a category or food list carries over to the items in it
        if (path === 'stretchCategories') for (const st of await getAll('stretches')) if (st.category === old) await putItem('stretches', { ...st, category: v });
        if (path === 'food.groups') for (const f of await getAll('foods')) if (f.group === old) await putItem('foods', { ...f, group: v });
      }
      await setSetting(path, list);
      return again();
    }

    // ---- a single value ----
    if (!t.dataset.path) return;
    const path = t.dataset.path;
    if (kind === 'text') {
      const v = t.value.trim();
      if (!v) return again();
      await setSetting(path, v);
    } else if (kind === 'date') {
      if (!ISO_DATE.test(t.value)) return again();
      await setSetting(path, t.value);
    } else if (kind === 'day') {
      await setSetting(path, Number(t.value));
    } else {
      if (t.value === '' || Number.isNaN(Number(t.value))) return again();
      const min = Number(t.dataset.min), max = Number(t.dataset.max);
      let n = Math.min(max, Math.max(min, Number(t.value)));
      if (kind === 'int') n = Math.round(n);
      else if (kind === 'float') n = Math.round(n * 2) / 2;
      else if (kind === 'pct') n = Math.round(n * 10) / 1000;
      await setSetting(path, n);
    }
    again();
  };

  onAction(el, {
    add: async (t) => {
      const path = t.dataset.list;
      const list = structuredClone(pathGet(settings(), path));
      list.push(NEW_ITEM[path](list));
      await setSetting(path, list);
      await ctx.refresh();
      const inputs = el.querySelectorAll(`[data-list="${path}"][data-i="${list.length - 1}"]`);
      if (inputs[0]) { inputs[0].focus(); inputs[0].select(); }
    },
    remove: async (t) => {
      const path = t.dataset.list;
      const list = structuredClone(pathGet(settings(), path));
      if (list.length <= Number(t.dataset.min || 0)) { toast('At least one is needed'); return; }
      const [gone] = list.splice(Number(t.dataset.i), 1); // history is never deleted with it
      if (path === 'food.groups') for (const f of await getAll('foods')) if (f.group === gone) await putItem('foods', { ...f, group: list.at(-1) });
      await setSetting(path, list);
      again();
    },
    reset: async (t) => {
      // two taps, so defaults are never restored by accident
      if (!t.dataset.armed) { t.dataset.armed = '1'; t.textContent = 'Tap again to reset this page'; t.style.color = 'var(--flare)'; return; }
      await resetSettings(t.dataset.paths.split(','));
      toast('Back to defaults');
      again();
    },
    export: async () => { await exportAll(); again(); },
    cancelImport: () => { pendingImport = null; importError = ''; again(); },
    confirmImport: async () => {
      try {
        await restoreAll(pendingImport.stores);
        pendingImport = null;
        await loadSettings();
        location.hash = '#/today';
        location.reload();
      } catch {
        importError = 'The backup could not be loaded. Nothing was changed.';
        again();
      }
    },
  });
}
