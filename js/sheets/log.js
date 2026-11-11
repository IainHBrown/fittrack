// Log sheet: record what you actually did for a planned session, or an
// "other activity" outside the plan. Also used to edit an existing log.

import { openSheet } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';
import { html, mount, onAction } from '../lib/dom.js';
import { dayKey } from '../lib/dates.js';
import { putLog, deleteLog, newId } from '../db.js';
import { settings } from '../state.js';
import { paceText, stageFromSwimTest } from '../engine/zones.js';
import { fmtMin } from '../ui/session.js';
import { setSwimStage } from '../plan-service.js';
import { logXp } from '../engine/game.js';

const UNIT = { swim: 'm', bike: 'km', run: 'km' };
const num = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v));

/**
 * @param {object} o
 * @param {object} [o.session]   the planned session being logged
 * @param {object} [o.log]       an existing log to edit
 * @param {number} [o.swimStage] current swim stage (for moving up)
 * @param {(what?: string) => void} onChange
 */
export function openLogSheet({ session = null, log = null, swimStage = 1 }, onChange) {
  const other = !session && (!log || !log.sessionId);
  const sport = log ? log.sport : session ? session.sport : 'other';
  const unit = UNIT[sport] || null;
  const today = dayKey();
  const isTest = session && session.test;

  // field values (kept in memory so tapping chips never clears what you typed)
  const f = {
    title: log ? log.title : session ? session.title : '',
    date: log ? log.date : session ? (session.date < today ? session.date : today) : today,
    duration: log ? log.durationMin : session ? (session.kind === 'bike-test' ? 20 : session.kind === 'run-test' ? 30 : session.kind === 'swim-test' ? '' : session.durationMin) : '',
    distance: log && log.distance != null ? log.distance : '',
    effort: log ? log.effort : null,
    knee: log ? log.knee : 0,
    hr: log && log.hr != null ? log.hr : '',
    notes: log ? log.notes || '' : '',
  };

  openSheet(log ? 'Edit log' : other ? 'Other activity' : 'Log session', (body, close) => {
    const hint = session && session.kind === 'bike-test' ? 'Enter the 20-minute test only: its distance and average heart rate.'
      : session && session.kind === 'run-test' ? 'Enter the 30-minute test only: its distance and average heart rate.'
      : session && session.kind === 'swim-test' ? 'Enter the distance you swam without stopping, and the time it took.'
      : '';

    mount(body, html`
      ${other ? html`
        <div class="form-field">
          <label class="label" for="lg-title">What did you do?</label>
          <input class="input input-wide" style="height:52px" id="lg-title" type="text" maxlength="40" placeholder="e.g. Intramural volleyball" value="${f.title}">
        </div>
        <div class="form-field">
          <label class="label" for="lg-date">Date</label>
          <input class="input" style="max-width:none;width:100%;height:52px" id="lg-date" type="date" max="${today}" value="${f.date}">
        </div>` : html`
        <div class="label">${session ? session.title : f.title}${session && !isTest ? ` · planned ${fmtMin(session.durationMin)}` : ''}</div>`}
      ${hint ? html`<p class="body-2">${hint}</p>` : ''}

      <div class="form-row">
        <div class="form-field">
          <label class="label" for="lg-duration">Minutes</label>
          <input class="big-input" id="lg-duration" type="number" inputmode="decimal" min="0" step="any" placeholder="0" value="${f.duration}">
        </div>
        ${unit ? html`
          <div class="form-field">
            <label class="label" for="lg-distance">Distance · ${unit}</label>
            <input class="big-input" id="lg-distance" type="number" inputmode="decimal" min="0" step="any" placeholder="0" value="${f.distance}">
          </div>` : ''}
        <div class="form-field">
          <label class="label" for="lg-hr">Avg HR</label>
          <input class="big-input" id="lg-hr" type="number" inputmode="numeric" min="0" placeholder="--" value="${f.hr}">
        </div>
      </div>
      ${unit ? html`<div class="label volt" id="lg-pace" style="min-height:18px;margin-top:-8px"></div>` : ''}

      <div class="form-field">
        <span class="label">Effort · 1 easy to 10 all-out</span>
        <div class="chips" style="--cols:5" data-group="effort">
          ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => html`<button class="chip" data-action="chip" data-v="${n}" aria-pressed="${String(f.effort === n)}">${n}</button>`)}
        </div>
      </div>

      <div class="form-field">
        <span class="label">Knee pain · 0 none to 10 severe</span>
        <div class="chips" style="--cols:6" data-group="knee">
          ${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => html`<button class="chip ${n >= settings().plan.knee.painThreshold ? 'warn' : ''}" data-action="chip" data-v="${n}" aria-pressed="${String(f.knee === n)}">${n}</button>`)}
        </div>
      </div>

      <div class="form-field">
        <label class="label" for="lg-notes">Notes · optional</label>
        <textarea class="input" id="lg-notes" maxlength="400">${f.notes}</textarea>
      </div>

      <button class="btn" data-action="save">${log ? 'Save changes' : 'Save'}</button>
      ${log ? html`<button class="btn btn-ghost" data-action="delete">Delete this log</button>` : ''}
      <div class="small flare" id="lg-error" role="alert"></div>`);

    const $ = (id) => body.querySelector(`#${id}`);
    const read = () => {
      f.duration = $('lg-duration').value;
      if (unit) f.distance = $('lg-distance').value;
      f.hr = $('lg-hr').value;
      f.notes = $('lg-notes').value;
      if (other) { f.title = $('lg-title').value; f.date = $('lg-date').value || today; }
    };
    const showPace = () => {
      if (!unit) return;
      read();
      $('lg-pace').textContent = paceText(sport, num(f.duration), num(f.distance));
    };
    body.oninput = showPace;
    showPace();

    onAction(body, {
      chip: (t) => {
        const group = t.parentElement.dataset.group;
        f[group] = Number(t.dataset.v);
        for (const c of t.parentElement.children) c.setAttribute('aria-pressed', String(c === t));
      },
      save: async () => {
        read();
        const duration = num(f.duration);
        if (!(duration > 0)) { $('lg-error').textContent = 'Enter how many minutes it took.'; return; }
        if (other && !f.title.trim()) { $('lg-error').textContent = 'Give the activity a name.'; return; }
        const s = settings();
        const rec = {
          id: log ? log.id : newId('l'),
          createdAt: log ? log.createdAt : Date.now(),
          sessionId: log ? log.sessionId : session ? session.id : null,
          date: f.date,
          sport,
          kind: log ? log.kind : session ? session.kind : 'other',
          title: other ? f.title.trim() : (session ? session.title : log.title),
          plannedMin: log ? log.plannedMin : session ? session.durationMin : null,
          test: log ? log.test : session ? session.test : null,
          durationMin: duration,
          distance: unit ? num(f.distance) : null,
          effort: f.effort,
          hr: num(f.hr),
          knee: f.knee,
          notes: f.notes.trim(),
        };
        await putLog(rec);
        close();

        // what the log changes, most important message first
        let message = `${rec.title} done · +${logXp(rec, s.xp)} XP`;
        if (!log && session) {
          const stages = s.swimStages.length;
          if (session.kind === 'swim-test' && rec.distance > 0) {
            const next = Math.max(swimStage, Math.min(stages, stageFromSwimTest(rec.distance)));
            if (next !== swimStage) { await setSwimStage(next); message = `Swim stage ${next} set`; }
          } else if (session.kind === 'swim' && rec.effort != null && rec.effort <= 6
            && rec.distance >= (session.distanceM || 0) * 0.9 && swimStage < stages) {
            await setSwimStage(swimStage + 1);
            message = `Swim stage ${swimStage + 1} unlocked`;
          }
          if (session.test) message = 'Test logged · zones updated';
        }
        if (rec.knee >= s.plan.knee.painThreshold) message = 'Knee flagged · runs eased';
        if (log) message = 'Log updated';
        toast(message);
        onChange('log');
      },
      delete: async () => {
        await deleteLog(log.id);
        close();
        onChange();
      },
    });
  });
}
