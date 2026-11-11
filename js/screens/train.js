// Train: the weekly plan. Lifting detail and stretches arrive in Stage 3.

import { html, mount, onAction } from '../lib/dom.js';
import { addDays, parseKey, weekdayName, monthName } from '../lib/dates.js';
import { getPlanState, resolvedWeek, currentWeekIndex, setBusyWeek } from '../plan-service.js';
import { weekTotals } from '../engine/adjust.js';
import { PHASE_LABEL, KIND_LABEL, SPORT_LABEL } from '../engine/plan.js';
import { icon } from '../ui/icons.js';
import { sessionRow, otherRow, SPORT_COLOR, fmtMin } from '../ui/session.js';
import { openSessionSheet } from '../sheets/session.js';
import { openLogSheet } from '../sheets/log.js';

let viewWeek = null; // index of the week shown; null = follow the current week

const hours = (min) => (Math.round(min / 6) / 10).toFixed(1);
const shortDate = (key) => `${parseKey(key).getDate()} ${monthName(key).slice(0, 3)}`;

export async function render(el, ctx) {
  const state = await getPlanState();
  const { plan, today } = state;

  if (!plan.weeks.length) {
    mount(el, html`
      <header class="head"><div class="head-stack">
        <span class="label" style="font-size:17px">No upcoming goal event</span>
        <h1 class="title">Train</h1>
      </div></header>
      <div class="coming">
        <p class="body-2">The plan is built around your next goal event. Add an event with a future date in Me, then Settings, and the plan will appear here.</p>
        <a class="btn btn-quiet" href="#/me/settings">Open settings</a>
      </div>`);
    return;
  }

  const nowIdx = currentWeekIndex(state);
  if (viewWeek == null || viewWeek >= plan.weeks.length) viewWeek = nowIdx;
  const week = plan.weeks[viewWeek];
  const sessions = resolvedWeek(state, viewWeek);
  const busy = state.busyWeeks.includes(week.start);
  const others = state.logs.filter((l) => !l.sessionId && l.date >= week.start && l.date <= week.end);
  const totals = weekTotals(sessions, others);
  const sports = ['swim', 'bike', 'run', 'lift'].filter((sp) => totals.bySport[sp]);
  const kindLabel = busy ? 'Busy week' : KIND_LABEL[week.kind];

  mount(el, html`
    <header class="head">
      <div class="head-stack">
        <span class="label" style="font-size:17px">Week ${week.index + 1} of ${plan.weeks.length} · ${PHASE_LABEL[week.phase]}</span>
        <h1 class="title">Train</h1>
      </div>
    </header>

    <div class="cal-nav">
      <button class="iconbtn" data-action="prev" aria-label="Previous week" ${viewWeek === 0 ? 'disabled' : ''}>${icon('left')}</button>
      <button data-action="thisWeek" style="text-align:center" aria-label="Jump to the current week">
        <span class="label-strong">${shortDate(week.start)} to ${shortDate(week.end)}</span>
        <span class="label" style="display:block;${viewWeek === nowIdx ? 'color:var(--volt)' : ''}">${[viewWeek === nowIdx ? 'This week' : '', kindLabel].filter(Boolean).join(' · ') || 'Tap for this week'}</span>
      </button>
      <button class="iconbtn" data-action="next" aria-label="Next week" ${viewWeek >= plan.weeks.length - 1 ? 'disabled' : ''}>${icon('right')}</button>
    </div>

    <section class="panel" style="gap:12px">
      <div style="display:flex;justify-content:space-between;align-items:flex-end">
        <div>
          <span class="num" style="font-size:56px">${hours(totals.planned)}<span class="unit"> h planned</span></span>
        </div>
        <div style="text-align:right">
          <span class="num" style="font-size:30px;${totals.done ? 'color:var(--volt)' : 'color:var(--ash)'}">${hours(totals.done)}<span class="unit"> h done</span></span>
        </div>
      </div>
      <div class="stack" role="img" aria-label="Planned time by sport">
        ${sports.map((sp) => html`<span style="--c:${SPORT_COLOR[sp]};flex:${totals.bySport[sp]} 1 0"></span>`)}
      </div>
      <div class="stack-legend">
        ${sports.map((sp) => html`<span class="legend-item"><span class="swatch" style="background:${SPORT_COLOR[sp]}"></span>${SPORT_LABEL[sp]} ${fmtMin(totals.bySport[sp])}</span>`)}
      </div>
      ${week.test ? html`<p class="body-2">Baseline tests this week. Log them and your heart-rate and pace zones update automatically.</p>` : ''}
    </section>

    <button class="rowlink" data-action="busy" aria-pressed="${String(busy)}">
      <div class="rowlink-main">
        <span class="label-strong" style="font-size:18px">Busy week</span>
        <span class="body-2">${busy ? 'Showing only the long ride, long run and one swim.' : 'Exams? Cut this week to the three key sessions.'}</span>
      </div>
      <span class="switch"></span>
    </button>

    <section>
      ${Array.from({ length: 7 }, (_, i) => addDays(week.start, i)).map((date) => {
        const list = sessions.filter((s) => s.date === date);
        const extra = others.filter((l) => l.date === date);
        const isRest = parseKey(date).getDay() === state.settings.plan.restDow;
        return html`
          <div class="daygroup">
            <div class="dayhead" ${date === today ? html`data-today` : ''}>
              <span class="label" style="font-size:16px">${weekdayName(date)} ${parseKey(date).getDate()}${date === today ? ' · today' : ''}</span>
              ${list.length === 0 && extra.length === 0 ? html`<span class="small">${isRest ? 'Rest day' : 'Nothing planned'}</span>` : ''}
            </div>
            ${list.map((s) => sessionRow(s, state))}
            ${extra.map((l) => otherRow(l))}
          </div>`;
      })}
    </section>

    <button class="btn btn-ghost" data-action="other">${icon('plus', 20, 2.6)} Log other activity</button>
    <p class="small" style="padding:0 4px">Lifting workouts with weight targets, and your stretch library, arrive in Stage 3.</p>
  `);

  const changed = () => ctx.refresh();
  onAction(el, {
    prev: () => { if (viewWeek > 0) { viewWeek--; ctx.refresh(); } },
    next: () => { if (viewWeek < plan.weeks.length - 1) { viewWeek++; ctx.refresh(); } },
    thisWeek: () => { viewWeek = nowIdx; ctx.refresh(); },
    busy: async () => { await setBusyWeek(week.start, !busy); ctx.refresh(); },
    session: (t) => openSessionSheet(t.dataset.id, changed),
    other: () => openLogSheet({}, changed),
    'other-log': (t) => openLogSheet({ log: state.logs.find((l) => l.id === t.dataset.id) }, changed),
  });
}
