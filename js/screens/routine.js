// One routine (Day A, B or C): reorder, swap, add or remove exercises and
// change sets and reps. Shows the weight the app will ask for next time.

import { html, mount, onAction } from '../lib/dom.js';
import { getLogs } from '../db.js';
import { settings } from '../state.js';
import { icon } from '../ui/icons.js';
import { nextTarget, historyFor } from '../engine/overload.js';
import { seedLifting, getExercises, getRoutines, saveRoutines, getActiveWorkout, targetText } from '../lift-service.js';
import { openExercisePicker, openItemSheet } from '../sheets/exercise.js';

export async function render(el, ctx) {
  await seedLifting();
  const key = (ctx.params || [])[0];
  const [exercises, routines, logs, active] = await Promise.all([getExercises(), getRoutines(), getLogs(), getActiveWorkout()]);
  const routine = routines[key];
  if (!routine) { location.hash = '#/train/lifting'; return; }
  const cfg = settings().lifting;
  const items = routine.items.filter((it) => exercises.has(it.exId));

  mount(el, html`
    <header class="head"><div class="head-stack">
      <a class="backlink label" href="#/train/lifting">${icon('left', 18, 2.4)} Lifting</a>
      <h1 class="title">Day ${key}</h1>
    </div></header>

    <input class="input input-wide" style="height:52px;font-size:18px" type="text" maxlength="30" data-name value="${routine.name}" aria-label="Routine name">

    <section>
      ${items.length === 0 ? html`<p class="body-2" style="padding:8px 4px">No exercises yet. Add one below.</p>` : ''}
      ${items.map((it, i) => {
        const ex = exercises.get(it.exId);
        const t = nextTarget(ex, it, historyFor(ex.id, logs), cfg);
        if (t.kind === 'first' && ex.startWeight > 0 && ex.type !== 'bodyweight') t.weight = ex.startWeight;
        return html`
          <button class="rowlink" data-action="edit" data-i="${i}">
            <div class="tile tile-ghost"><span class="num" style="font-size:20px">${i + 1}</span></div>
            <div class="rowlink-main">
              <span class="label-strong" style="font-size:18px">${ex.name}</span>
              <span class="body-2">Next: ${t.weight == null && ex.type !== 'bodyweight' ? `your choice of weight × ${t.reps} × ${t.sets}` : targetText(ex, t)}</span>
            </div>
            <span style="color:var(--ash)">${icon('gear', 20)}</span>
          </button>`;
      })}
    </section>

    <button class="btn btn-ghost" data-action="add">${icon('plus', 20, 2.6)} Add exercise</button>
    <a class="btn" href="#/workout/${key}">${icon('lift', 24, 2.6)} ${active ? 'Resume workout' : 'Start this workout'}</a>
    <p class="small" style="padding:0 4px">Planned lifting days start this routine from Today. Starting it here logs an extra, unplanned workout.</p>
  `);

  const persist = async () => { routine.items = items; await saveRoutines(routines); ctx.refresh(); };

  el.onchange = async (e) => {
    if (!('name' in e.target.dataset)) return;
    routine.name = e.target.value.trim() || routine.name;
    await saveRoutines(routines);
    ctx.refresh();
  };

  onAction(el, {
    add: () => openExercisePicker({ exclude: items.map((x) => x.exId) }, (ex) => {
      items.push({ exId: ex.id, sets: 3, reps: ex.repUnit === 'sec' ? 30 : 8 });
      persist();
    }),
    edit: (t) => {
      const i = Number(t.dataset.i);
      const it = items[i];
      const ex = exercises.get(it.exId);
      openItemSheet({ ex, sets: it.sets, reps: it.reps, canUp: i > 0, canDown: i < items.length - 1 }, (change) => {
        if (change.sets) { it.sets = change.sets; routine.items = items; saveRoutines(routines).then(() => ctx.refresh()); return; }
        if (change.reps) { it.reps = change.reps; routine.items = items; saveRoutines(routines).then(() => ctx.refresh()); return; }
        if (change.move) { const j = i + change.move; [items[i], items[j]] = [items[j], items[i]]; persist(); return; }
        if (change.remove) { items.splice(i, 1); persist(); return; }
        if (change.history) { location.hash = `#/exercise/${it.exId}`; return; }
        if (change.swap) {
          openExercisePicker({ exclude: items.map((x) => x.exId), title: `Swap ${ex.name}` }, (picked) => {
            it.exId = picked.id;
            if (picked.repUnit === 'sec') it.reps = 30; else if (it.reps > 30) it.reps = 8;
            persist();
          });
        }
      });
    },
  });
}
