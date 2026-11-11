// Train > Lifting: your routines and the exercise library.

import { html, mount, onAction } from '../lib/dom.js';
import { getLogs } from '../db.js';
import { icon } from '../ui/icons.js';
import { trainNav } from '../ui/trainnav.js';
import { historyFor, records } from '../engine/overload.js';
import { seedLifting, getExercises, getRoutines, getActiveWorkout } from '../lift-service.js';
import { openExercisePicker } from '../sheets/exercise.js';

let showArchived = false;

export async function render(el, ctx) {
  await seedLifting();
  const [exercises, routines, logs, active] = await Promise.all([getExercises(), getRoutines(), getLogs(), getActiveWorkout()]);
  const list = [...exercises.values()].sort((a, b) => a.name.localeCompare(b.name));
  const shown = list.filter((e) => !e.archived || showArchived);
  const archivedCount = list.filter((e) => e.archived).length;

  mount(el, html`
    <header class="head"><div class="head-stack">
      <span class="label" style="font-size:17px">Routines and exercises</span>
      <h1 class="title">Train</h1>
    </div></header>
    ${trainNav('lifting')}

    ${active ? html`
      <a class="banner" href="#/workout">
        <div class="tile" style="--c:var(--lift)">${icon('lift', 22, 2.4)}</div>
        <div class="rowlink-main">
          <span class="label-strong" style="font-size:18px;color:var(--lift)">Workout in progress</span>
          <span class="body-2">${active.name}. Tap to carry on.</span>
        </div>
        <span style="color:var(--ash)">${icon('right', 18, 2.4)}</span>
      </a>` : ''}

    <section>
      <h2 class="label-strong section-title" style="padding-bottom:6px">Routines</h2>
      ${Object.entries(routines).map(([key, r]) => html`
        <a class="rowlink" href="#/routine/${key}">
          <div class="tile" style="--c:var(--lift)"><span class="num" style="font-size:22px">${key}</span></div>
          <div class="rowlink-main">
            <span class="label-strong" style="font-size:18px">${r.name}</span>
            <span class="body-2">${r.items.map((it) => exercises.get(it.exId)?.name).filter(Boolean).join(', ')}</span>
          </div>
          <span style="color:var(--ash)">${icon('right', 18, 2.4)}</span>
        </a>`)}
    </section>

    <section>
      <h2 class="label-strong section-title" style="padding-bottom:6px">Exercises</h2>
      ${shown.map((e) => {
        const h = historyFor(e.id, logs, { includeEasy: true });
        const rec = records(h);
        const sub = !h.length ? 'Not logged yet'
          : e.type === 'bodyweight' ? `${h.length} session${h.length === 1 ? '' : 's'}`
          : `Top ${rec.top.value} lb · est. 1RM ${rec.e1rm.value} lb`;
        return html`
          <a class="rowlink" href="#/exercise/${e.id}" style="${e.archived ? 'opacity:0.55' : ''}">
            <div class="rowlink-main">
              <span style="font-size:17px;font-weight:600">${e.name}${e.archived ? ' (archived)' : ''}</span>
              <span class="body-2">${sub}</span>
            </div>
            <span style="color:var(--ash)">${icon('right', 18, 2.4)}</span>
          </a>`;
      })}
    </section>

    <button class="btn btn-ghost" data-action="new">${icon('plus', 20, 2.6)} New exercise</button>
    ${archivedCount ? html`<button class="btn btn-ghost" style="border:0;color:var(--ash)" data-action="archived">${showArchived ? 'Hide' : 'Show'} ${archivedCount} archived</button>` : ''}
  `);

  onAction(el, {
    new: () => openExercisePicker({ exclude: [...exercises.keys()], title: 'New exercise' }, (ex) => { location.hash = `#/exercise/${ex.id}`; }),
    archived: () => { showArchived = !showArchived; ctx.refresh(); },
  });
}
