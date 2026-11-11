// Session sheet: what to do, plus log / skip / move / make easy / swap.

import { openSheet } from '../ui/sheet.js';
import { icon } from '../ui/icons.js';
import { html, mount, onAction } from '../lib/dom.js';
import { addDays, parseKey, fmtDayLong } from '../lib/dates.js';
import { getDay, setOverride } from '../db.js';
import { getPlanState, resolvedWeek } from '../plan-service.js';
import { weekIndexOf, SPORT_LABEL } from '../engine/plan.js';
import { moveWarnings } from '../engine/schedule.js';
import { targetFor } from '../engine/zones.js';
import { SPORT_COLOR, SPORT_ICON, fmtMin, logSummary, sportTile } from '../ui/session.js';
import { openLogSheet } from './log.js';

const STATUS_TEXT = { done: 'Done', skipped: 'Skipped', dropped: 'Dropped for busy week', missed: 'Missed' };

export function openSessionSheet(sessionId, onChange) {
  let mode = 'detail';

  openSheet('Session', (body, close) => {
    async function load() {
      const state = await getPlanState();
      const wi = weekIndexOf(state.plan, sessionId.split('|')[0]);
      const week = resolvedWeek(state, wi);
      return { state, week, s: week.find((x) => x.id === sessionId), plannedWeek: state.plan.weeks[wi] };
    }

    async function draw() {
      const { state, week, s, plannedWeek } = await load();
      if (!s) { close(); return; }
      const today = state.today;
      const p = state.settings.plan;

      if (mode === 'move') {
        const others = week.filter((x) => x.id !== s.id && x.status !== 'skipped' && x.status !== 'dropped')
          .map((x) => ({ kind: x.kind, date: x.date, title: x.title }));
        const days = Array.from({ length: 7 }, (_, i) => addDays(plannedWeek.start, i)).filter((d) => d >= today && d !== s.date);
        mount(body, html`
          <p class="body-2">Move <b>${s.title}</b> to another day this week.</p>
          <div>
            ${days.length === 0 ? html`<p class="body-2">No days left in this week to move it to.</p>` : ''}
            ${days.map((d) => {
              const warn = moveWarnings(s.kind, d, parseKey(d).getDay(), others, p, addDays);
              const there = others.filter((o) => o.date === d).map((o) => o.title).join(', ');
              return html`
                <button class="rowlink" data-action="moveTo" data-date="${d}">
                  <div class="rowlink-main">
                    <span class="label-strong" style="font-size:18px">${fmtDayLong(d)}${d === s.plannedDate ? ' · original day' : ''}</span>
                    <span class="body-2">${there || 'Nothing planned'}</span>
                    ${warn.map((w) => html`<span class="small flare">${w}</span>`)}
                  </div>
                  <span style="color:var(--ash)">${icon('right', 18, 2.4)}</span>
                </button>`;
            })}
          </div>
          <button class="btn btn-ghost" data-action="back">Cancel</button>`);
        return;
      }

      const t = targetFor(s.sport, s.zone, state.zones, state.settings.zoneEffort);
      const day = await getDay(today);
      const lowSleep = day.sleep != null && day.sleep < state.settings.sleep.lowBelow;
      const open = s.status === 'planned' || s.status === 'missed';

      mount(body, html`
        <div class="tagrow" style="justify-content:space-between">
          <div class="tagrow">
            ${sportTile({ ...s, status: 'planned' })}
            <span class="label-strong" style="color:${SPORT_COLOR[s.sport]}">${SPORT_LABEL[s.sport]}</span>
          </div>
          <span class="label">${fmtDayLong(s.date)}${STATUS_TEXT[s.status] ? ` · ${STATUS_TEXT[s.status]}` : ''}</span>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:12px">
          <h3 class="hero" style="font-size:52px">${s.title}</h3>
          ${s.kind === 'race' ? '' : html`
            <div style="text-align:right;flex-shrink:0">
              <div class="num" style="font-size:44px">${s.durationMin}</div>
              <div class="label">min</div>
            </div>`}
        </div>

        ${t ? html`
          <div class="target">
            <span class="label-strong">${t.label}</span>
            <span class="body-2">${t.detail}</span>
          </div>` : ''}
        ${s.distanceM && !s.swapped ? html`<div class="label">About ${s.distanceM} m in total</div>` : ''}
        <p class="body-2" style="font-size:15px;line-height:1.45">${s.desc}</p>

        ${s.kneeAdjusted ? html`
          <div class="notice" role="note">
            <div class="tile" style="--c:var(--flare)">${icon('run', 22, 2.4)}</div>
            <div class="rowlink-main"><span class="body-2">Shortened because you logged knee pain. A bike session is the safer choice.</span></div>
            <button class="btn btn-quiet" data-action="swap">Swap to bike</button>
          </div>` : ''}
        ${s.moved ? html`<p class="small">Moved from ${fmtDayLong(s.plannedDate)}.</p>` : ''}

        ${s.status === 'done' ? html`
          <div class="panel" style="background:var(--surface-2);border-radius:var(--r-card);gap:6px;padding:16px">
            <span class="label">You did</span>
            <span class="label-strong">${logSummary(s.log)}</span>
            <span class="body-2">${[
              s.log.effort != null ? `Effort ${s.log.effort}/10` : '',
              s.log.hr ? `${s.log.hr} bpm` : '',
              `Knee ${s.log.knee ?? 0}/10`,
            ].filter(Boolean).join(' · ')}</span>
            ${(s.log.exercises || []).map((e) => html`
              <span class="body-2">${e.name}: ${e.sets.map((x) => (e.type === 'bodyweight' ? x.reps : `${x.weight}×${x.reps}`)).join(', ')}</span>`)}
            ${(s.log.prs || []).length ? html`<span class="label-strong" style="color:var(--lift);font-size:17px">PR: ${s.log.prs.join(', ')}</span>` : ''}
            ${s.log.notes ? html`<span class="body-2">${s.log.notes}</span>` : ''}
          </div>
          <button class="btn btn-quiet" data-action="editLog">Edit log</button>` : ''}

        ${s.sport === 'lift' && s.status !== 'done' ? html`
          <a class="btn" data-action="start" href="#/workout/${s.kind.split('-')[1]}/${encodeURIComponent(s.id)}">${icon('lift', 24, 2.6)} Start workout</a>
          <button class="btn btn-ghost" data-action="log">Mark done without details</button>
        ` : open || s.status === 'skipped' || s.status === 'dropped' ? html`
          <button class="btn" data-action="log">${icon('check', 22, 3)} ${open ? 'Log session' : 'Log it anyway'}</button>` : ''}

        ${open ? html`
          <div class="btn-row">
            <button class="btn btn-ghost" data-action="skip">Skip</button>
            <button class="btn btn-ghost" data-action="move">Move</button>
          </div>
          ${s.swapped ? html`<button class="btn btn-ghost" data-action="unswap">Change back to a run</button>` : ''}
          ${s.easy ? html`<button class="btn btn-ghost" data-action="uneasy">Undo "make it easy"</button>`
            : lowSleep && s.date === today && s.sport !== 'race' ? html`
              <button class="btn btn-quiet" data-action="easy">Low sleep: make it easy</button>` : ''}` : ''}

        ${s.status === 'skipped' ? html`<button class="btn btn-ghost" data-action="unskip">Undo skip</button>` : ''}
        ${s.status === 'missed' ? html`<p class="small">A missed session is not added to another day. Skip it, or move it yourself if you want to make it up.</p>` : ''}
      `);
    }

    const act = async (patch) => { await setOverride(sessionId, patch); mode = 'detail'; await draw(); onChange(); };

    onAction(body, {
      start: () => close(), // the link itself opens the workout
      log: async () => {
        const { state, s } = await load();
        openLogSheet({ session: s, swimStage: state.swimStage }, onChange);
      },
      editLog: async () => {
        const { state, s } = await load();
        openLogSheet({ session: s, log: s.log, swimStage: state.swimStage }, onChange);
      },
      skip: () => act({ status: 'skipped' }),
      unskip: () => act({ status: null }),
      easy: () => act({ easy: true }),
      uneasy: () => act({ easy: null }),
      swap: () => act({ swap: 'bike' }),
      unswap: () => act({ swap: null }),
      move: () => { mode = 'move'; draw(); },
      back: () => { mode = 'detail'; draw(); },
      moveTo: async (t) => {
        const { s } = await load();
        await act({ movedTo: t.dataset.date === s.plannedDate ? null : t.dataset.date });
      },
    });

    draw();
  });
}

export { SPORT_ICON };
