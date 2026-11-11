// Sleep: today's score, a month calendar coloured by score, stats, trend.

import { html, raw, mount, onAction } from '../lib/dom.js';
import { dayKey, addDays, addMonths, monthRange, monthKey, monthName, parseKey } from '../lib/dates.js';
import { getDay, getDays } from '../db.js';
import { settings } from '../state.js';
import { sleepLevel, sleepStats } from '../logic/day.js';
import { icon } from '../ui/icons.js';
import { openSleepSheet } from '../sheets/sleep.js';

// which month the calendar shows (kept while the app is open)
let viewMonth = null;

const LEVEL_COLOR = { good: 'var(--volt)', ok: 'var(--volt-dim)', low: 'var(--flare)' };
const LEVEL_TEXT = { good: 'Good night', ok: 'Below goal', low: 'Low. Keep today easy.' };

function calendar(range, byDate, today, s) {
  const cells = [];
  for (let i = 0; i < range.startDow; i++) cells.push(html`<div class="cal-blank"></div>`);
  for (let d = 1; d <= range.days; d++) {
    const key = addDays(range.first, d - 1);
    const score = byDate.get(key);
    if (key > today) {
      cells.push(html`<div class="cal-day" data-future style="font-size:15px;font-weight:600">${d}</div>`);
    } else if (score == null) {
      cells.push(html`
        <button class="cal-day" style="font-size:15px;font-weight:600" data-action="edit" data-date="${key}"
          ${key === today ? raw('data-today') : ''} aria-label="${d} ${monthName(key)}, no score. Tap to add.">${d}</button>`);
    } else {
      cells.push(html`
        <button class="cal-day" data-level="${sleepLevel(score, s)}" data-action="edit" data-date="${key}"
          ${key === today ? raw('data-today') : ''} aria-label="${d} ${monthName(key)}, score ${score}">
          <span class="cal-date">${d}</span>${score}
        </button>`);
    }
  }
  return html`
    <div class="cal">
      ${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d) => html`<div class="cal-dow label">${d}</div>`)}
      ${cells}
    </div>`;
}

/** Bar per day for the last 30 days, with a dashed goal line. */
function trendChart(days30, byDate, s) {
  const W = 300, H = 92, bw = 7, gap = 3, top = 6, base = 80;
  // the scale starts at 40 so night-to-night differences are visible
  const floor = 40;
  const y = (score) => base - (Math.max(score - floor, 3) / (100 - floor)) * (base - top);
  const bars = days30.map((key, i) => {
    const score = byDate.get(key);
    const x = i * (bw + gap);
    if (score == null) return `<rect x="${x}" y="${base - 2}" width="${bw}" height="2" fill="var(--track)"/>`;
    const yy = y(score);
    return `<rect x="${x}" y="${yy.toFixed(1)}" width="${bw}" height="${(base - yy).toFixed(1)}" fill="${LEVEL_COLOR[sleepLevel(score, s)]}"/>`;
  }).join('');
  const gy = y(s.sleep.goal).toFixed(1);
  return raw(`
    <svg role="img" aria-label="Sleep scores for the last 30 days" viewBox="0 0 ${W} ${H}" width="100%">
      ${bars}
      <line x1="0" x2="${W}" y1="${gy}" y2="${gy}" stroke="var(--text)" stroke-width="1" stroke-dasharray="3 4" opacity="0.55"/>
    </svg>`);
}

export async function render(el, ctx) {
  const today = dayKey();
  const s = settings();
  if (!viewMonth) viewMonth = monthRange(today).first;
  const range = monthRange(viewMonth);
  const isCurrentMonth = monthKey(viewMonth) === monthKey(today);

  const from30 = addDays(today, -29);
  const prevRange = monthRange(addMonths(viewMonth, -1));
  const [todayRec, monthDays, prevDays, lastDays] = await Promise.all([
    getDay(today),
    getDays(range.first, range.last),
    getDays(prevRange.first, prevRange.last),
    getDays(from30, today),
  ]);

  const byDate = new Map([...monthDays, ...lastDays].map((d) => [d.date, d.sleep]));
  const stats = sleepStats(monthDays, s);
  const prev = sleepStats(prevDays, s);
  const level = sleepLevel(todayRec.sleep, s);
  const days30 = Array.from({ length: 30 }, (_, i) => addDays(from30, i));
  const delta = stats.average != null && prev.average != null ? stats.average - prev.average : null;

  mount(el, html`
    <header class="head">
      <div class="head-stack">
        <span class="label" style="font-size:17px">Goal ${s.sleep.goal}</span>
        <h1 class="title">Sleep</h1>
      </div>
    </header>

    ${todayRec.sleep == null ? html`
      <button class="btn" data-action="edit" data-date="${today}">${icon('plus', 22, 3)} Log sleep score</button>
    ` : html`
      <button class="countdown" data-action="edit" data-date="${today}" aria-label="Edit last night's score">
        <span class="num" style="font-size:128px;color:${level === 'good' ? 'var(--volt)' : level === 'low' ? 'var(--flare)' : 'var(--text)'}">${todayRec.sleep}</span>
        <div class="head-stack" style="padding-bottom:8px">
          <span class="label">Last night</span>
          <span class="label-strong">${LEVEL_TEXT[level]}</span>
          <span class="small">Tap to edit</span>
        </div>
      </button>`}

    <section style="display:flex;flex-direction:column;gap:10px">
      <div class="cal-nav">
        <button class="iconbtn" data-action="prev" aria-label="Previous month">${icon('left')}</button>
        <span class="label-strong">${monthName(viewMonth)} ${parseKey(viewMonth).getFullYear()}</span>
        <button class="iconbtn" data-action="next" aria-label="Next month" ${isCurrentMonth ? 'disabled' : ''}>${icon('right')}</button>
      </div>
      ${calendar(range, byDate, today, s)}
      <div class="legend">
        <span class="legend-item"><span class="swatch" style="background:var(--volt)"></span>${s.sleep.goal}+ good night</span>
        <span class="legend-item"><span class="swatch" style="background:var(--volt-dim)"></span>${s.sleep.lowBelow} to ${s.sleep.goal - 1}</span>
        <span class="legend-item"><span class="swatch" style="background:var(--flare-dim)"></span>under ${s.sleep.lowBelow}</span>
      </div>
    </section>

    <section class="panel panel-tight stats">
      <div class="stat">
        <span class="label">Good nights</span>
        <span class="num">${stats.good}<span class="unit"> / ${stats.logged}</span></span>
        <span class="small">this month</span>
      </div>
      <div class="stat">
        <span class="label">Hit rate</span>
        <span class="num">${stats.hitRate == null ? '--' : stats.hitRate}<span class="unit"> %</span></span>
        <span class="small">of logged</span>
      </div>
      <div class="stat">
        <span class="label">Average</span>
        <span class="num">${stats.average == null ? '--' : stats.average}</span>
        <span class="small">${delta == null ? 'no earlier month yet' : `${delta >= 0 ? '+' : ''}${delta} vs ${monthName(prevRange.first).slice(0, 3)}`}</span>
      </div>
    </section>

    <section style="display:flex;flex-direction:column;gap:8px;padding:0 4px">
      <div style="display:flex;justify-content:space-between;align-items:baseline">
        <span class="label">Last 30 days</span>
        <span class="small">dashed line = goal</span>
      </div>
      ${trendChart(days30, byDate, s)}
    </section>
  `);

  const changed = () => ctx.refresh();
  onAction(el, {
    edit: (t) => openSleepSheet(t.dataset.date, changed),
    prev: () => { viewMonth = addMonths(viewMonth, -1); ctx.refresh(); },
    next: () => { if (!isCurrentMonth) { viewMonth = addMonths(viewMonth, 1); ctx.refresh(); } },
  });
}
