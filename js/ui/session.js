// Shared pieces for showing a planned or logged session.

import { html } from '../lib/dom.js';
import { icon } from './icons.js';
import { targetFor, paceText } from '../engine/zones.js';

export const SPORT_COLOR = {
  swim: 'var(--swim)', bike: 'var(--bike)', run: 'var(--run)', lift: 'var(--lift)',
  race: 'var(--volt)', other: 'var(--text-2)',
};
export const SPORT_ICON = { swim: 'swim', bike: 'bike', run: 'run', lift: 'lift', race: 'flag', other: 'plus' };

/** "45 min" or "2 h 10" */
export function fmtMin(min) {
  const m = Math.round(min);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${String(m % 60).padStart(2, '0')}` : ''}`;
}

/** "5.2 km" / "400 m" for a logged distance. */
export function fmtDistance(sport, distance) {
  if (!(distance > 0)) return '';
  return sport === 'swim' ? `${Math.round(distance)} m` : `${Math.round(distance * 100) / 100} km`;
}

/** One-line summary of a log: "52 min · 21.4 km · 24.7 km/h" */
export function logSummary(log) {
  return [fmtMin(log.durationMin), fmtDistance(log.sport, log.distance), paceText(log.sport, log.durationMin, log.distance)]
    .filter(Boolean).join(' · ');
}

/** The line under a session title, depending on its status. */
export function sessionSub(s, state) {
  if (s.status === 'done') return `Done · ${logSummary(s.log)}`;
  if (s.status === 'skipped') return 'Skipped';
  if (s.status === 'dropped') return 'Dropped for busy week';
  const t = targetFor(s.sport, s.zone, state.zones, state.settings.zoneEffort);
  const parts = [s.kind === 'race' ? '' : fmtMin(s.durationMin), s.distanceM && !s.swapped ? `${s.distanceM} m` : '', t ? t.label : ''];
  if (s.kneeAdjusted) parts.push('eased for knee');
  if (s.easy) parts.push('made easy');
  if (s.moved) parts.push('moved');
  const text = parts.filter(Boolean).join(' · ');
  return s.status === 'missed' ? `Missed · ${text}` : text;
}

export function sportTile(s) {
  const color = SPORT_COLOR[s.sport];
  if (s.status === 'done') return html`<div class="tile tile-done" style="--c:${color}">${icon('check', 22, 3)}</div>`;
  if (s.status === 'skipped' || s.status === 'dropped' || s.status === 'missed') {
    return html`<div class="tile tile-ghost">${icon(SPORT_ICON[s.sport], 22, 2.4)}</div>`;
  }
  return html`<div class="tile" style="--c:${color}">${icon(SPORT_ICON[s.sport], 22, 2.4)}</div>`;
}

/** A tappable session row; the screen handles data-action="session". */
export function sessionRow(s, state) {
  return html`
    <button class="rowlink sess" data-action="session" data-id="${s.id}" data-status="${s.status}">
      ${sportTile(s)}
      <div class="rowlink-main">
        <span class="label-strong" style="font-size:18px;${s.status === 'planned' ? `color:${SPORT_COLOR[s.sport]}` : ''}">${s.log ? s.log.title : s.title}</span>
        <span class="body-2">${sessionSub(s, state)}</span>
      </div>
      <span style="color:var(--ash)">${icon('right', 18, 2.4)}</span>
    </button>`;
}

/** Row for an activity logged outside the plan. */
export function otherRow(log) {
  return html`
    <button class="rowlink sess" data-action="other-log" data-id="${log.id}" data-status="done">
      <div class="tile tile-done" style="--c:var(--text-2)">${icon('check', 22, 3)}</div>
      <div class="rowlink-main">
        <span class="label-strong" style="font-size:18px">${log.title || 'Other activity'}</span>
        <span class="body-2">${logSummary(log)}</span>
      </div>
      <span style="color:var(--ash)">${icon('right', 18, 2.4)}</span>
    </button>`;
}
