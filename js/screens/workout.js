// The lifting workout in progress. Each exercise shows today's target, why,
// and what you did last time; tick sets off as you go. Everything is saved
// as you tap, so closing the app mid-workout loses nothing.

import { html, mount, onAction } from '../lib/dom.js';
import { fmtDayLong, fmtTime } from '../lib/dates.js';
import { getLogs, putLog, newId } from '../db.js';
import { settings } from '../state.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/toast.js';
import { openSheet } from '../ui/sheet.js';
import { getPlanState, resolvedWeek } from '../plan-service.js';
import { weekIndexOf } from '../engine/plan.js';
import { historyFor, newRecords } from '../engine/overload.js';
import {
  seedLifting, getExercises, getRoutines, saveRoutines, getActiveWorkout, saveActiveWorkout,
  clearActiveWorkout, startWorkout, makeItem, targetText,
} from '../lift-service.js';
import { openExercisePicker, openItemSheet } from '../sheets/exercise.js';

const num = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? 0 : Number(v));

async function findSession(sessionId) {
  const state = await getPlanState();
  const wi = weekIndexOf(state.plan, sessionId.split('|')[0]);
  return wi < 0 ? null : resolvedWeek(state, wi).find((s) => s.id === sessionId) || null;
}

/** Apply a change to the saved routine as well as the current workout. */
async function updateRoutine(key, change) {
  const routines = await getRoutines();
  if (!routines[key]) return;
  change(routines[key].items);
  await saveRoutines(routines);
}

export async function render(el, ctx) {
  await seedLifting();
  let w = await getActiveWorkout();
  if (!w) {
    const [key, sessionId] = ctx.params || [];
    if (!key) {
      mount(el, html`
        <header class="head"><div class="head-stack">
          <a class="backlink label" href="#/train/lifting">${icon('left', 18, 2.4)} Lifting</a>
          <h1 class="title">Workout</h1>
        </div></header>
        <p class="body-2" style="padding:0 4px">No workout in progress. Start one from Today or from the Lifting screen.</p>`);
      return;
    }
    w = await startWorkout(key, sessionId ? await findSession(sessionId) : null);
  }

  const exercises = await getExercises();
  const doneSets = w.items.reduce((n, it) => n + it.rows.filter((r) => r.done).length, 0);
  const totalSets = w.items.reduce((n, it) => n + it.rows.length, 0);

  mount(el, html`
    <header class="head">
      <div class="head-stack">
        <span class="label" style="font-size:17px;color:var(--lift)">Lift · started ${fmtTime(w.startedAt)}${w.easy ? ' · easy day' : ''}</span>
        <h1 class="title">${w.name}</h1>
      </div>
      <span class="label" id="wk-progress" style="padding-bottom:4px">${doneSets} / ${totalSets} sets</span>
    </header>

    ${w.items.map((it, i) => {
      const ex = exercises.get(it.exId);
      const bw = ex.type === 'bodyweight';
      const unit = ex.repUnit === 'sec' ? 'sec' : 'reps';
      return html`
        <section class="panel ex">
          <div class="ex-head">
            <div class="head-stack" style="gap:6px">
              <h2 class="ex-name">${ex.name}</h2>
              <div class="ex-target">${it.target.weight == null && !bw ? html`Pick a weight<span class="unit"> × ${it.target.reps} × ${it.sets}</span>` : targetText(ex, { ...it.target, sets: it.sets })}</div>
            </div>
            <button class="iconbtn" data-action="edit" data-i="${i}" aria-label="Edit ${ex.name}">${icon('gear', 22)}</button>
          </div>
          <p class="body-2">${it.target.reason}</p>
          ${it.last ? html`<p class="small">Last time (${fmtDayLong(it.last.date).split(' ').slice(1).join(' ')}): ${it.last.text}</p>` : ''}
          <div style="display:flex;flex-direction:column;gap:8px;margin-top:4px">
            ${it.rows.map((r, j) => html`
              <div class="setrow ${bw ? 'bw' : ''}" ${r.done ? html`data-done` : ''} data-i="${i}" data-r="${j}">
                <span class="label">${j + 1}</span>
                ${bw ? '' : html`
                  <input class="set-input" type="number" inputmode="decimal" step="any" min="0" data-f="weight" value="${r.weight}" placeholder="lb" aria-label="${ex.name} set ${j + 1} weight in pounds">
                  <span class="label">lb ×</span>`}
                <input class="set-input" type="number" inputmode="numeric" min="0" data-f="reps" value="${r.reps}" aria-label="${ex.name} set ${j + 1} ${unit}">
                ${bw ? html`<span class="label">${unit}</span>` : html`<span class="label">${unit}</span>`}
                <button class="set-check" data-action="check" aria-label="Set ${j + 1} done" aria-pressed="${String(!!r.done)}">${icon('check', 26, 3)}</button>
              </div>`)}
          </div>
        </section>`;
    })}

    <button class="btn btn-ghost" data-action="add">${icon('plus', 20, 2.6)} Add exercise</button>
    <button class="btn" data-action="finish">${icon('check', 22, 3)} Finish workout</button>
    <button class="btn btn-ghost" style="border:0;color:var(--ash)" data-action="discard">Discard workout</button>
  `);

  const save = () => saveActiveWorkout(w);
  const rowOf = (node) => {
    const rowEl = node.closest('.setrow');
    const it = w.items[Number(rowEl.dataset.i)];
    return { rowEl, it, row: it.rows[Number(rowEl.dataset.r)], r: Number(rowEl.dataset.r) };
  };

  // typing a weight carries it down to the sets not yet done
  el.onchange = (e) => {
    const t = e.target;
    if (!t.dataset.f) return;
    const { rowEl, it, row, r } = rowOf(t);
    row[t.dataset.f] = t.value === '' ? '' : num(t.value);
    if (t.dataset.f === 'weight') {
      it.rows.forEach((other, k) => {
        if (k > r && !other.done) {
          other.weight = row.weight;
          const input = el.querySelector(`.setrow[data-i="${rowEl.dataset.i}"][data-r="${k}"] [data-f="weight"]`);
          if (input) input.value = row.weight;
        }
      });
    }
    save();
  };

  onAction(el, {
    check: (t) => {
      const { rowEl, row } = rowOf(t);
      for (const input of rowEl.querySelectorAll('.set-input')) row[input.dataset.f] = num(input.value);
      row.done = !row.done;
      rowEl.toggleAttribute('data-done', row.done);
      t.setAttribute('aria-pressed', String(row.done));
      const done = w.items.reduce((n, it) => n + it.rows.filter((x) => x.done).length, 0);
      el.querySelector('#wk-progress').textContent = `${done} / ${totalSets} sets`;
      save();
    },

    edit: (t) => {
      const i = Number(t.dataset.i);
      const it = w.items[i];
      const ex = exercises.get(it.exId);
      openItemSheet({ ex, sets: it.sets, reps: it.reps, canUp: i > 0, canDown: i < w.items.length - 1, askRoutine: true }, async (change, alsoRoutine) => {
        const inRoutine = (fn) => (alsoRoutine ? updateRoutine(w.routineKey, fn) : null);
        if (change.sets) {
          while (it.rows.length < change.sets) it.rows.push({ ...it.rows.at(-1), done: false });
          while (it.rows.length > change.sets) it.rows.pop();
          it.sets = change.sets;
          await inRoutine((items) => { const x = items.find((y) => y.exId === it.exId); if (x) x.sets = change.sets; });
        } else if (change.reps) {
          it.reps = change.reps;
          it.target.reps = change.reps;
          for (const r of it.rows) if (!r.done) r.reps = change.reps;
          await inRoutine((items) => { const x = items.find((y) => y.exId === it.exId); if (x) x.reps = change.reps; });
        } else if (change.move) {
          const j = i + change.move;
          [w.items[i], w.items[j]] = [w.items[j], w.items[i]];
          await inRoutine((items) => {
            const a = items.findIndex((y) => y.exId === it.exId);
            const b = items.findIndex((y) => y.exId === w.items[i].exId);
            if (a >= 0 && b >= 0) [items[a], items[b]] = [items[b], items[a]];
          });
        } else if (change.remove) {
          w.items.splice(i, 1);
          await inRoutine((items) => { const a = items.findIndex((y) => y.exId === it.exId); if (a >= 0) items.splice(a, 1); });
        } else if (change.history) {
          location.hash = `#/exercise/${it.exId}`;
          return;
        } else if (change.swap) {
          openExercisePicker({ exclude: w.items.map((x) => x.exId), title: `Swap ${ex.name}` }, async (picked) => {
            w.items[i] = makeItem(picked, { sets: it.sets, reps: picked.repUnit === 'sec' ? 30 : it.reps > 30 ? 8 : it.reps }, await getLogs(), w.easy);
            await inRoutine((items) => { const x = items.find((y) => y.exId === it.exId); if (x) { x.exId = picked.id; x.reps = w.items[i].reps; } });
            await save();
            ctx.refresh();
          });
          return;
        }
        await save();
        ctx.refresh();
      });
    },

    add: () => {
      openExercisePicker({ exclude: w.items.map((x) => x.exId) }, async (picked) => {
        const scheme = { sets: 3, reps: picked.repUnit === 'sec' ? 30 : 8 };
        w.items.push(makeItem(picked, scheme, await getLogs(), w.easy));
        await updateRoutine(w.routineKey, (items) => { if (!items.some((y) => y.exId === picked.id)) items.push({ exId: picked.id, ...scheme }); });
        await save();
        toast(`Added to ${w.name}`);
        ctx.refresh();
      });
    },

    discard: (t) => {
      // two taps, so a slip of the thumb cannot throw a workout away
      if (t.dataset.armed) { clearActiveWorkout().then(() => { location.hash = '#/train'; }); return; }
      t.dataset.armed = '1';
      t.textContent = 'Tap again to discard';
      t.style.color = 'var(--flare)';
    },

    finish: () => openFinishSheet(w, exercises),
  });
}

/** Last step: minutes, effort and knee, then the workout is written to the log. */
function openFinishSheet(w, exercises) {
  const f = { effort: null, knee: 0 };
  const elapsed = Math.max(1, Math.round((Date.now() - w.startedAt) / 60000));
  const done = w.items.reduce((n, it) => n + it.rows.filter((r) => r.done).length, 0);

  openSheet('Finish workout', (body, close) => {
    mount(body, html`
      ${done === 0 ? html`<p class="body-2 flare">No sets are ticked yet. Tick the sets you did first, or discard the workout.</p>` : html`
        <div class="label">${w.name} · ${done} sets done</div>
        <div class="form-row">
          <div class="form-field">
            <label class="label" for="fw-min">Minutes</label>
            <input class="big-input" id="fw-min" type="number" inputmode="numeric" min="1" value="${Math.min(elapsed, 240)}">
          </div>
        </div>
        <div class="form-field">
          <span class="label">Effort · 1 easy to 10 all-out</span>
          <div class="chips" style="--cols:5" data-group="effort">
            ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => html`<button class="chip" data-action="chip" data-v="${n}" aria-pressed="false">${n}</button>`)}
          </div>
        </div>
        <div class="form-field">
          <span class="label">Knee pain · 0 none to 10 severe</span>
          <div class="chips" style="--cols:6" data-group="knee">
            ${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => html`<button class="chip ${n >= settings().plan.knee.painThreshold ? 'warn' : ''}" data-action="chip" data-v="${n}" aria-pressed="${String(n === 0)}">${n}</button>`)}
          </div>
        </div>
        <div class="form-field">
          <label class="label" for="fw-notes">Notes · optional</label>
          <textarea class="input" id="fw-notes" maxlength="400"></textarea>
        </div>
        <button class="btn" data-action="save">Save workout</button>`}`);

    onAction(body, {
      chip: (t) => {
        f[t.parentElement.dataset.group] = Number(t.dataset.v);
        for (const c of t.parentElement.children) c.setAttribute('aria-pressed', String(c === t));
      },
      save: async () => {
        const logs = await getLogs();
        const prs = [];
        const done = [];
        for (const it of w.items) {
          const ex = exercises.get(it.exId);
          const sets = it.rows.filter((r) => r.done).map((r) => ({ weight: num(r.weight), reps: num(r.reps) }));
          if (!sets.length) continue;
          const perf = { target: { weight: it.target.weight, reps: it.target.reps, sets: it.sets }, sets };
          for (const pr of newRecords(historyFor(it.exId, logs, { includeEasy: true }), perf)) {
            if (pr.type === 'top' && ex.type !== 'bodyweight') prs.push(`${ex.name} ${pr.value} lb`);
          }
          const rec = { exId: it.exId, name: ex.name, type: ex.type, ...perf };
          if (w.easy) rec.easy = true;
          done.push(rec);
        }
        await putLog({
          id: newId('l'), createdAt: Date.now(),
          sessionId: w.sessionId, date: w.date, sport: 'lift', kind: w.sessionKind,
          title: w.name, plannedMin: w.plannedMin, test: null,
          durationMin: Math.max(1, num(body.querySelector('#fw-min').value)),
          distance: null, effort: f.effort, hr: null, knee: f.knee,
          notes: body.querySelector('#fw-notes').value.trim(),
          exercises: done, prs,
        });
        await clearActiveWorkout();
        close();
        toast(prs.length ? `PR · ${prs[0]}` : `${w.name} done`);
        location.hash = '#/train';
      },
    });
  });
}
