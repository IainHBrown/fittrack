// Shared level and streak displays (used on Today and Me).

import { html } from '../lib/dom.js';

const fmt = (n) => Math.round(n).toLocaleString('en-CA');

/** Small level block for the Today header: "LV 2 TRAINEE", bar, XP. Links to Me. */
export function levelBox(game) {
  const { level, xp } = game;
  return html`
    <a class="levelbox" href="#/me" aria-label="Level ${level.number}, ${level.name}. ${fmt(xp.total)} XP.">
      <span class="label-strong">LV ${level.number} <span style="color:var(--ash)">${level.name}</span></span>
      <span class="xpbar" style="width:118px"><i style="width:${level.frac * 100}%"></i></span>
      <span class="small" style="font-size:11px">${level.next ? `${fmt(xp.total)} / ${fmt(level.next)} XP` : `${fmt(xp.total)} XP`}</span>
    </a>`;
}

function one(label, s) {
  const cls = s.atRisk ? 'risk' : s.current === 0 ? 'zero' : '';
  const note = s.atRisk ? 'At risk · do it today'
    : s.hitToday ? `Done today · best ${s.best}`
    : `Best ${s.best}`;
  return html`
    <div class="stat ${cls}">
      <span class="label">${label}</span>
      <span class="num streak-num">${s.current}<span class="unit"> ${s.current === 1 ? 'day' : 'days'}</span></span>
      <span class="small ${s.atRisk ? 'risk-text' : ''}" style="${s.atRisk ? 'font-weight:600' : ''}">${note}</span>
    </div>`;
}

/** The three streaks side by side. */
export function streakStrip(streaks) {
  return html`
    <section class="panel panel-tight stats" aria-label="Streaks">
      ${one('Sleep streak', streaks.sleep)}
      ${one('Supps streak', streaks.supps)}
      ${one('Water streak', streaks.water)}
    </section>`;
}
