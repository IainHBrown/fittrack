// Me: level, streaks, badges, progress charts, and the way into Settings.

import { html, mount, onAction } from '../lib/dom.js';
import { parseKey, monthName, addDays } from '../lib/dates.js';
import { icon } from '../ui/icons.js';
import { medal } from '../ui/medal.js';
import { streakStrip } from '../ui/game.js';
import { lineChart, stackedBars } from '../ui/chart.js';
import { SPORT_COLOR } from '../ui/session.js';
import { getGame, fmtValue } from '../game-service.js';
import { weeklyHours, paceSeries, TIER_NAME } from '../engine/game.js';
import { historyFor, bests } from '../engine/overload.js';
import { fmtClock } from '../engine/zones.js';
import { getExercises, seedLifting } from '../lift-service.js';
import { VERSION } from '../version.js';

let paceSport = 'run';
let liftEx = null;

const fmt = (n) => Math.round(n).toLocaleString('en-CA');
const short = (key) => `${parseKey(key).getDate()} ${monthName(key).slice(0, 3)}`;
const PACE = {
  run: { label: 'Run pace', note: 'min per km (lower is faster)', format: (v) => `${fmtClock(v * 60)} /km` },
  bike: { label: 'Bike speed', note: 'km/h', format: (v) => `${v.toFixed(1)} km/h` },
  swim: { label: 'Swim pace', note: 'min per 100 m (lower is faster)', format: (v) => `${fmtClock(v * 60)} /100 m` },
};

/** Monday (or the plan's first weekday) of the current week, for the weekly chart. */
function thisWeekStart(game) {
  const { plan } = game.plan;
  const today = game.today;
  if (plan.start && today >= plan.start) {
    const days = Math.floor((parseKey(today) - parseKey(plan.start)) / 86400000);
    return addDays(plan.start, Math.floor(days / 7) * 7);
  }
  const dow = parseKey(today).getDay();
  return addDays(today, -((dow + 6) % 7));
}

export async function render(el, ctx) {
  await seedLifting();
  const [game, exercises] = await Promise.all([getGame(), getExercises()]);
  const { level, xp, badges, metrics: m, logs } = game;

  // strength chart: exercises with at least two sessions, most-logged first
  const lifts = [...exercises.values()]
    .map((ex) => ({ ex, h: historyFor(ex.id, logs, { includeEasy: true }) }))
    .filter((x) => x.h.length >= 2 && x.ex.type !== 'bodyweight')
    .sort((a, b) => b.h.length - a.h.length)
    .slice(0, 6);
  if (!lifts.some((x) => x.ex.id === liftEx)) liftEx = lifts[0] ? lifts[0].ex.id : null;
  const lift = lifts.find((x) => x.ex.id === liftEx);

  const weeks = weeklyHours(logs, thisWeekStart(game), 8);
  const pace = paceSeries(logs, paceSport);
  const earned = badges.reduce((n, b) => n + b.tier, 0);

  let persisted = false;
  try { persisted = await navigator.storage.persisted(); } catch { /* unsupported */ }

  mount(el, html`
    <header class="head"><div class="head-stack">
      <span class="label" style="font-size:17px">Fitness Tracker</span>
      <h1 class="title">Me</h1>
    </div></header>

    <section class="panel">
      <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:12px">
        <div>
          <div class="label" style="color:var(--volt)">Level ${level.number}</div>
          <div class="hero" style="font-size:${level.name.length > 8 ? 60 : 76}px">${level.name}</div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div class="num" style="font-size:36px">${fmt(xp.total)}</div>
          <div class="label">XP</div>
        </div>
      </div>
      <div class="xpbar" style="height:12px" role="img" aria-label="Progress to the next level"><i style="width:${level.frac * 100}%"></i></div>
      <div style="display:flex;justify-content:space-between;gap:10px">
        <span class="body-2">${level.next ? `${fmt(level.toGo)} XP to ${level.nextName}` : 'Top level reached'}</span>
        <span class="small">Training ${fmt(xp.training)} · Daily ${fmt(xp.daily)} · Badges ${fmt(xp.badges)}</span>
      </div>
    </section>

    ${streakStrip(game.streaks)}

    <section style="display:flex;flex-direction:column;gap:14px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;padding:8px 4px 0">
        <h2 class="label-strong">Badges</h2>
        <span class="small">${earned} of ${badges.length * 3} tiers earned</span>
      </div>
      <div class="badges">
        ${badges.map((b) => html`
          <div class="badge" data-tier="${b.tier}" role="img" aria-label="${b.name}: ${TIER_NAME[b.tier]}. ${fmtValue(b.value)} ${b.unit}${b.next ? `, next at ${b.next}` : ''}">
            ${medal(b.tier, 58)}
            <span class="badge-name">${b.name}</span>
            <span class="small">${fmtValue(b.value)}${b.next ? ` / ${fmtValue(b.next)}` : ''}${b.unit ? ` ${b.unit}` : ''}</span>
            <span class="xpbar"><i style="width:${b.frac * 100}%;background:${b.tier === 3 ? 'var(--gold)' : 'var(--volt)'}"></i></span>
          </div>`)}
      </div>
    </section>

    <section style="display:flex;flex-direction:column;gap:8px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;padding:8px 4px 0">
        <h2 class="label-strong">Weekly hours</h2>
        <span class="small">last 8 weeks</span>
      </div>
      ${stackedBars({
        title: 'Hours trained per week by sport', unit: 'hours',
        bars: weeks.map((w) => ({ label: short(w.start), parts: w })),
        keys: [['lift', SPORT_COLOR.lift], ['swim', SPORT_COLOR.swim], ['bike', SPORT_COLOR.bike], ['run', SPORT_COLOR.run], ['other', 'var(--text-2)']],
      })}
      <div class="legend" style="padding:0 4px">
        ${['swim', 'bike', 'run', 'lift'].map((sp) => html`<span class="legend-item"><span class="swatch" style="background:${SPORT_COLOR[sp]}"></span>${sp[0].toUpperCase() + sp.slice(1)}</span>`)}
        <span class="legend-item"><span class="swatch" style="background:var(--text-2)"></span>Other</span>
      </div>
    </section>

    <section class="panel panel-tight totals" aria-label="Distance totals">
      <div class="stat"><span class="label" style="color:var(--swim)">Swim</span><span class="num">${fmtValue(m.swimKm)}</span><span class="small">km</span></div>
      <div class="stat"><span class="label" style="color:var(--bike)">Bike</span><span class="num">${fmtValue(m.bikeKm)}</span><span class="small">km</span></div>
      <div class="stat"><span class="label" style="color:var(--run)">Run</span><span class="num">${fmtValue(m.runKm)}</span><span class="small">km</span></div>
      <div class="stat"><span class="label">Sessions</span><span class="num">${fmt(m.sessions)}</span><span class="small">done</span></div>
    </section>

    <section style="display:flex;flex-direction:column;gap:10px">
      <h2 class="label-strong section-title">Pace trend</h2>
      <div class="fchips" role="group" aria-label="Sport">
        ${Object.entries(PACE).map(([sp, p]) => html`<button class="fchip" data-action="pace" data-v="${sp}" aria-pressed="${String(paceSport === sp)}">${p.label}</button>`)}
      </div>
      ${pace.length >= 2 ? html`
        <div style="padding:0 4px">
          ${lineChart({
            title: PACE[paceSport].label, format: PACE[paceSport].format,
            labels: pace.map((p) => short(p.date)),
            series: [{ label: PACE[paceSport].label, color: SPORT_COLOR[paceSport], values: pace.map((p) => p.value) }],
          })}
          <p class="small">${PACE[paceSport].note}</p>
        </div>` : html`<p class="body-2" style="padding:0 4px">Log at least two ${paceSport === 'bike' ? 'rides' : paceSport + 's'} with a distance to see the trend.</p>`}
    </section>

    <section style="display:flex;flex-direction:column;gap:10px">
      <h2 class="label-strong section-title">Strength</h2>
      ${lift ? html`
        <div class="fchips" role="group" aria-label="Exercise">
          ${lifts.map((x) => html`<button class="fchip" data-action="lift" data-v="${x.ex.id}" aria-pressed="${String(liftEx === x.ex.id)}">${x.ex.name}</button>`)}
        </div>
        <div style="padding:0 4px">
          ${lineChart({
            title: `${lift.ex.name} progress`, unit: 'lb',
            labels: lift.h.map((p) => short(p.date)),
            series: [
              { label: 'Est. 1RM', color: 'var(--text)', values: lift.h.map((p) => bests(p).e1rm) },
              { label: 'Top weight', color: 'var(--lift)', values: lift.h.map((p) => bests(p).top) },
            ],
          })}
          <div class="legend">
            <span class="legend-item"><span class="swatch" style="background:var(--lift)"></span>Top weight</span>
            <span class="legend-item"><span class="swatch" style="background:var(--text)"></span>Estimated 1-rep max</span>
          </div>
        </div>` : html`<p class="body-2" style="padding:0 4px">Log an exercise in two workouts to see its strength trend.</p>`}
    </section>

    <div style="margin-top:8px">
      <a class="rowlink" href="#/me/settings">
        <div class="tile" style="--c:var(--track);color:var(--text)">${icon('gear', 22)}</div>
        <div class="rowlink-main">
          <span class="label-strong" style="font-size:17px">Settings</span>
          <span class="body-2">Goals, plan, lifting, food, sleep, water, XP</span>
        </div>
        <span style="color:var(--ash)">${icon('right', 18, 2.4)}</span>
      </a>
      <button class="rowlink" data-action="update">
        <div class="tile" style="--c:var(--track);color:var(--text)">${icon('refresh', 22)}</div>
        <div class="rowlink-main">
          <span class="label-strong" style="font-size:17px">Update app</span>
          <span class="body-2">Fetch the newest version. Your data is not touched.</span>
        </div>
      </button>
    </div>
    <div style="padding:0 4px;display:flex;flex-direction:column;gap:6px">
      <p class="small">Version ${VERSION}</p>
      <p class="small">${persisted
        ? 'Storage is protected: iOS will not clear your data to free space.'
        : 'Data is saved on this device. Add the app to your Home Screen so iOS keeps it.'}</p>
    </div>
  `);

  onAction(el, {
    pace: (t) => { paceSport = t.dataset.v; ctx.refresh(); },
    lift: (t) => { liftEx = t.dataset.v; ctx.refresh(); },
    // Clear the offline file cache (not the data) and reload from the network.
    update: async (t) => {
      t.querySelector('.body-2').textContent = 'Updating...';
      try {
        if (window.caches) for (const k of await caches.keys()) await caches.delete(k);
        const reg = await navigator.serviceWorker?.getRegistration();
        if (reg) await reg.update();
      } catch { /* offline: just reload */ }
      location.reload();
    },
  });
}
