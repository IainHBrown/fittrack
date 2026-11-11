// Two sheets used while lifting:
//   openExercisePicker - choose an exercise from the library, or create one
//   openItemSheet      - change sets and reps, swap, reorder or remove one line

import { openSheet } from '../ui/sheet.js';
import { icon } from '../ui/icons.js';
import { html, mount, onAction } from '../lib/dom.js';
import { getExercises, addExercise } from '../lift-service.js';

const GROUPS = [['lower', 'Lower body'], ['upper', 'Upper body'], ['core', 'Core']];
const TYPES = [['weight', 'Weight'], ['bodyweight', 'Bodyweight reps'], ['hold', 'Timed hold']];

/**
 * @param {object} o
 * @param {string[]} [o.exclude]  exercise ids already in the routine
 * @param {string} [o.title]
 * @param {(ex: object) => void} onPick
 */
export function openExercisePicker({ exclude = [], title = 'Add exercise' }, onPick) {
  let creating = false;
  const form = { name: '', group: 'upper', type: 'weight' };

  openSheet(title, async (body, close) => {
    const all = [...(await getExercises()).values()].filter((e) => !e.archived && !exclude.includes(e.id))
      .sort((a, b) => a.name.localeCompare(b.name));

    function draw() {
      if (creating) {
        mount(body, html`
          <div class="form-field">
            <label class="label" for="nx-name">Exercise name</label>
            <input class="input input-wide" style="height:52px" id="nx-name" type="text" maxlength="40" value="${form.name}" placeholder="e.g. Goblet squat">
          </div>
          <div class="form-field">
            <span class="label">Body area (sets the weight jump)</span>
            <div class="chips" style="--cols:3" data-group="group">
              ${GROUPS.map(([id, label]) => html`<button class="chip" style="font-size:17px" data-action="chip" data-v="${id}" aria-pressed="${String(form.group === id)}">${label}</button>`)}
            </div>
          </div>
          <div class="form-field">
            <span class="label">Tracked by</span>
            <div class="chips" style="--cols:3" data-group="type">
              ${TYPES.map(([id, label]) => html`<button class="chip" style="font-size:16px" data-action="chip" data-v="${id}" aria-pressed="${String(form.type === id)}">${label}</button>`)}
            </div>
          </div>
          <button class="btn" data-action="create">Add exercise</button>
          <button class="btn btn-ghost" data-action="cancel">Back to list</button>
          <div class="small flare" id="nx-error" role="alert"></div>`);
        return;
      }
      mount(body, html`
        <button class="btn btn-quiet" data-action="new">${icon('plus', 20, 2.6)} New exercise</button>
        ${GROUPS.map(([id, label]) => {
          const list = all.filter((e) => e.group === id);
          return list.length ? html`
            <div>
              <div class="label" style="padding:4px 6px">${label}</div>
              ${list.map((e) => html`
                <button class="rowlink" data-action="pick" data-id="${e.id}">
                  <div class="rowlink-main"><span style="font-size:17px;font-weight:600">${e.name}</span></div>
                  <span style="color:var(--ash)">${icon('plus', 18, 2.4)}</span>
                </button>`)}
            </div>` : '';
        })}`);
    }

    onAction(body, {
      new: () => { creating = true; draw(); },
      cancel: () => { creating = false; draw(); },
      chip: (t) => {
        form.name = body.querySelector('#nx-name').value;
        form[t.parentElement.dataset.group] = t.dataset.v;
        draw();
      },
      pick: (t) => { close(); onPick(all.find((e) => e.id === t.dataset.id)); },
      create: async () => {
        form.name = body.querySelector('#nx-name').value.trim();
        if (!form.name) { body.querySelector('#nx-error').textContent = 'Give the exercise a name.'; return; }
        const ex = await addExercise({
          name: form.name, group: form.group,
          type: form.type === 'weight' ? 'weight' : 'bodyweight',
          repUnit: form.type === 'hold' ? 'sec' : undefined,
        });
        close();
        onPick(ex);
      },
    });
    draw();
  });
}

/**
 * Edit one line of a routine or workout.
 * @param {object} o
 * @param {object} o.ex            the exercise
 * @param {number} o.sets
 * @param {number} o.reps
 * @param {boolean} o.canUp
 * @param {boolean} o.canDown
 * @param {boolean} [o.askRoutine] show the "also change my routine" switch (mid-workout)
 * @param {(change: object, alsoRoutine: boolean) => void} onChange
 *   change is one of { sets }, { reps }, { move: -1|1 }, { remove: true }, { swap: true }, { history: true }
 */
export function openItemSheet({ ex, sets, reps, canUp, canDown, askRoutine = false }, onChange) {
  let alsoRoutine = true;
  const cur = { sets, reps };
  const step = ex.repUnit === 'sec' ? 5 : 1;

  openSheet(ex.name, (body, close) => {
    function draw() {
      mount(body, html`
        <div>
          <div class="stepper">
            <span class="field-label">Sets</span>
            <div class="stepper-ctl">
              <button class="iconbtn" data-action="sets" data-d="-1" aria-label="One set fewer">${icon('left', 22, 2.6)}</button>
              <span class="num">${cur.sets}</span>
              <button class="iconbtn" data-action="sets" data-d="1" aria-label="One set more">${icon('right', 22, 2.6)}</button>
            </div>
          </div>
          <div class="stepper">
            <span class="field-label">${ex.repUnit === 'sec' ? 'Seconds per set' : 'Reps per set'}</span>
            <div class="stepper-ctl">
              <button class="iconbtn" data-action="reps" data-d="${-step}" aria-label="Fewer">${icon('left', 22, 2.6)}</button>
              <span class="num">${cur.reps}</span>
              <button class="iconbtn" data-action="reps" data-d="${step}" aria-label="More">${icon('right', 22, 2.6)}</button>
            </div>
          </div>
        </div>
        ${askRoutine ? html`
          <button class="rowlink" data-action="toggle" aria-pressed="${String(alsoRoutine)}">
            <div class="rowlink-main">
              <span class="label-strong" style="font-size:17px">Also change my routine</span>
              <span class="body-2">${alsoRoutine ? 'Changes here are kept for next time.' : 'Changes apply to this workout only.'}</span>
            </div>
            <span class="switch"></span>
          </button>` : ''}
        <div class="btn-row">
          <button class="btn btn-ghost" data-action="move" data-d="-1" ${canUp ? '' : 'disabled'}>Move up</button>
          <button class="btn btn-ghost" data-action="move" data-d="1" ${canDown ? '' : 'disabled'}>Move down</button>
        </div>
        <div class="btn-row">
          <button class="btn btn-quiet" data-action="swap">Swap</button>
          <button class="btn btn-quiet" data-action="history">History</button>
        </div>
        <button class="btn btn-ghost" style="color:var(--flare)" data-action="remove">Remove from ${askRoutine ? 'workout' : 'routine'}</button>
        <p class="small">Swapping or removing never deletes an exercise's history.</p>`);
    }

    onAction(body, {
      sets: (t) => { cur.sets = Math.min(10, Math.max(1, cur.sets + Number(t.dataset.d))); onChange({ sets: cur.sets }, alsoRoutine); draw(); },
      reps: (t) => { cur.reps = Math.min(600, Math.max(step, cur.reps + Number(t.dataset.d))); onChange({ reps: cur.reps }, alsoRoutine); draw(); },
      toggle: () => { alsoRoutine = !alsoRoutine; draw(); },
      move: (t) => { close(); onChange({ move: Number(t.dataset.d) }, alsoRoutine); },
      swap: () => { close(); onChange({ swap: true }, alsoRoutine); },
      history: () => { close(); onChange({ history: true }, alsoRoutine); },
      remove: () => { close(); onChange({ remove: true }, alsoRoutine); },
    });
    draw();
  });
}
