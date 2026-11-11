// Today: the screen the app opens on.

import { html, mount, onAction } from '../lib/dom.js';
import { dayKey, fmtDayLong, fmtDate, daysBetween } from '../lib/dates.js';
import { getDay, setOverride, getLogs } from '../db.js';
import { seedLifting, getExercises, getRoutines, getActiveWorkout, makeItem, targetText } from '../lift-service.js';
import { waterTotal, waterGoal, fmtLitres, suppsTicked, sleepLevel } from '../logic/day.js';
import { foodTotals, foodTargets } from '../logic/food.js';
import { getPlanState, sessionsOn, dayTypeOn, currentWeekIndex } from '../plan-service.js';
import { PHASE_LABEL, KIND_LABEL, SPORT_LABEL } from '../engine/plan.js';
import { targetFor } from '../engine/zones.js';
import { ringSVG } from '../ui/ring.js';
import { icon } from '../ui/icons.js';
import { sessionRow, sportTile, SPORT_COLOR } from '../ui/session.js';
import { openWaterSheet } from '../sheets/water.js';
import { openSuppsSheet } from '../sheets/supps.js';
import { openSleepSheet } from '../sheets/sleep.js';
import { openSessionSheet } from '../sheets/session.js';
import { openLogSheet } from '../sheets/log.js';

/** Ring centre text shrinks a little as the value gets longer. */
const valSize = (text) => (String(text).length <= 2 ? 32 : String(text).length <= 4 ? 28 : 25);

function ringButton({ id, action, label, value, ring, pulse }) {
  return html`
    <button class="ringbtn" data-action="${action}">
      <div class="ring ${pulse === id ? 'pulse' : ''}" style="width:78px;height:78px">
        ${ring}
        <div class="ring-val" style="font-size:${valSize(value.text || '')}px">${value.node || value.text}</div>
      </div>
      <span class="label">${label}</span>
    </button>`;
}

/** A plain panel with a headline, for days without a session to show. */
function messagePanel(tag, headline, text, color = 'var(--volt)') {
  return html`
    <section class="panel">
      <div class="tagrow">
        <div class="tile" style="--c:${color}">${icon('calendar', 22, 2.4)}</div>
        <span class="label-strong" style="color:${color}">${tag}</span>
      </div>
      <h2 class="hero">${headline}</h2>
      <p class="body-2">${text}</p>
    </section>`;
}

/** The big panel for the main session of the day. */
function heroSession(s, state, weekLabel, lift) {
  const t = targetFor(s.sport, s.zone, state.zones, state.settings.zoneEffort);
  const color = SPORT_COLOR[s.sport];
  const isLift = s.sport === 'lift' && lift && lift.items.length > 0;
  return html`
    <section class="panel">
      <div class="tagrow" style="justify-content:space-between">
        <div class="tagrow">
          ${sportTile(s)}
          <span class="label-strong" style="color:${color}">${SPORT_LABEL[s.sport]}</span>
        </div>
        <span class="label">${weekLabel}</span>
      </div>
      <button data-action="session" data-id="${s.id}" style="display:flex;justify-content:space-between;align-items:flex-end;gap:12px;width:100%" aria-label="Open ${s.title}">
        <h2 class="hero" style="font-size:${s.title.length > 11 ? 50 : 64}px">${s.title}</h2>
        ${s.kind === 'race' ? '' : html`
          <div style="text-align:right;flex-shrink:0">
            <div class="num" style="font-size:40px">${s.durationMin}</div>
            <div class="label">min</div>
          </div>`}
      </button>
      ${t ? html`<div class="target"><span class="label-strong" style="font-size:17px">${t.label}</span><span class="body-2">${t.detail}</span></div>` : ''}
      ${isLift ? html`
        <div>
          ${lift.items.map((it) => html`
            <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;padding:8px 0;border-top:1px solid var(--line)">
              <span style="font-size:15px;font-weight:500">${it.name}</span>
              <span class="label-strong" style="font-size:19px;letter-spacing:0.03em;white-space:nowrap">${it.text}</span>
            </div>`)}
        </div>
        ${s.easy ? html`<p class="body-2">Easy day: targets are about 10% lighter.</p>` : ''}
        <a class="btn" href="#/workout/${lift.key}/${encodeURIComponent(s.id)}">${icon('lift', 24, 2.6)} ${lift.active ? 'Resume workout' : 'Start workout'}</a>
      ` : html`
        <p class="body-2">${s.desc}</p>
        <button class="btn" data-action="log" data-id="${s.id}">${icon('check', 22, 3)} Log session</button>`}
    </section>`;
}

/** The session shown big: a long session, race or test first, then the first of the day. */
function mainSession(list) {
  const open = list.filter((x) => x.status === 'planned');
  return open.find((x) => ['bike-long', 'run-long', 'race'].includes(x.kind) || x.test) || open[0] || null;
}

/** For a lifting session: the routine's exercises with today's targets. */
async function liftPreview(s) {
  await seedLifting();
  const key = s.kind.split('-')[1];
  const [exercises, routines, logs, active] = await Promise.all([getExercises(), getRoutines(), getLogs(), getActiveWorkout()]);
  const routine = routines[key];
  const items = (routine ? routine.items : []).filter((it) => exercises.has(it.exId)).map((it) => {
    const ex = exercises.get(it.exId);
    const item = makeItem(ex, it, logs, s.easy);
    return { name: ex.name, text: targetText(ex, { ...item.target, sets: it.sets }) };
  });
  return { key, items, active: !!active };
}

function workoutArea(state, today, lift) {
  const { plan, settings: s } = state;
  if (!plan.weeks.length) {
    return messagePanel('Training plan', 'No goal set', 'Add a goal event with a future date in Me, then Settings, to build your plan.');
  }
  const untilStart = daysBetween(today, plan.start);
  if (untilStart > 0) {
    return messagePanel('Training plan', untilStart === 1 ? 'Starts tomorrow' : `Starts in ${untilStart} days`,
      `Your plan begins ${fmtDayLong(plan.start)} with ${s.plan.easyWeeks} easy weeks, then baseline tests. Open Train to look ahead.`);
  }

  const week = plan.weeks[currentWeekIndex(state)];
  const weekLabel = `Week ${week.index + 1} · ${KIND_LABEL[week.kind] || PHASE_LABEL[week.phase]}`;
  const list = sessionsOn(state, today);
  const main = mainSession(list);
  const rest = list.filter((x) => x !== main);

  let top;
  if (main) top = heroSession(main, state, weekLabel, lift);
  else if (list.some((x) => x.status === 'done')) top = messagePanel(weekLabel, 'Done for today', 'Everything planned for today is logged. Eat, drink, recover.');
  else if (list.length) top = messagePanel(weekLabel, 'Nothing left today', 'Today\'s sessions were skipped or dropped. Tomorrow is a new day.', 'var(--ash)');
  else top = messagePanel(weekLabel, 'Rest day', 'No training today. Recovery is when the fitness is built.', 'var(--ash)');

  return html`${top}${rest.length ? html`<div>${rest.map((x) => sessionRow(x, state))}</div>` : ''}`;
}

/** Phase bar under the countdown: Base / Build / Peak / Taper with progress. */
function phaseBar(state) {
  const { plan } = state;
  if (!plan.phases) return '';
  const now = state.today < plan.start ? -1 : currentWeekIndex(state);
  let startAt = 0;
  return html`
    <div class="phasebar">
      ${['base', 'build', 'peak', 'taper'].filter((ph) => plan.phases[ph] > 0).map((ph) => {
        const size = plan.phases[ph];
        const done = Math.max(0, Math.min(size, now + 1 - startAt));
        const current = now >= startAt && now < startAt + size;
        startAt += size;
        return html`
          <div style="flex-grow:${size}">
            <div class="bar"><i style="width:${(done / size) * 100}%"></i></div>
            <span class="label ${current ? 'on' : ''}">${size >= 4 ? PHASE_LABEL[ph] : PHASE_LABEL[ph].slice(0, 2)}</span>
          </div>`;
      })}
    </div>`;
}

export async function render(el, ctx) {
  const today = dayKey();
  const state = await getPlanState();
  const s = state.settings;
  const day = await getDay(today);
  day.dayType = dayTypeOn(state, today); // long training days get the higher water goal

  const water = waterTotal(day);
  const wGoal = waterGoal(s, day);
  const supps = suppsTicked(day, s.supplements);
  const food = foodTotals(day);
  const foodTarget = foodTargets(s, day.dayType);
  const level = sleepLevel(day.sleep, s);
  const goal = state.plan.goal;
  const todays = sessionsOn(state, today);
  const canEase = level === 'low' && todays.some((x) => x.status === 'planned' && !x.easy && x.sport !== 'race');
  const main = today >= (state.plan.start || '9999') ? mainSession(todays) : null;
  const lift = main && main.sport === 'lift' ? await liftPreview(main) : null;

  mount(el, html`
    <header class="head">
      <div class="head-stack">
        <span class="label" style="font-size:17px">${fmtDayLong(today)}</span>
        <h1 class="title">Today</h1>
      </div>
    </header>

    ${workoutArea(state, today, lift)}

    ${day.sleep == null ? html`
      <button class="rowlink" data-action="sleep">
        <div class="tile" style="--c:var(--track);color:var(--volt)">${icon('sleep', 22, 2.4)}</div>
        <div class="rowlink-main">
          <span class="label-strong" style="font-size:17px">Log last night's sleep</span>
          <span class="body-2">Enter your score from this morning</span>
        </div>
        <span style="color:var(--ash)">${icon('right', 18, 2.4)}</span>
      </button>` : ''}

    ${level === 'low' ? html`
      <div class="notice" role="note">
        <div class="tile" style="--c:var(--flare)">${icon('sleep', 22, 2.4)}</div>
        <div class="rowlink-main">
          <span class="label-strong flare" style="font-size:17px">Low sleep score</span>
          <span class="body-2">Under ${s.sleep.lowBelow}. ${canEase ? 'Consider an easy day.' : 'Keep today easy.'}</span>
        </div>
        ${canEase ? html`<button class="btn btn-quiet" data-action="easeAll">Make it easy</button>` : ''}
      </div>` : ''}

    <div class="rings">
      ${ringButton({
        id: 'sleep', action: 'sleep', label: 'Sleep', pulse: ctx.pulse,
        ring: ringSVG({
          frac: day.sleep == null ? 0 : day.sleep / s.sleep.goal,
          color: level === 'low' ? 'var(--flare)' : 'var(--volt)',
          label: day.sleep == null ? 'Sleep not logged' : `Sleep score ${day.sleep}, goal ${s.sleep.goal}`,
        }),
        value: day.sleep == null
          ? { node: html`<span style="color:var(--ash)">${icon('plus', 26, 2.6)}</span>` }
          : { text: day.sleep },
      })}
      ${ringButton({
        id: 'water', action: 'water', label: 'Water · L', pulse: ctx.pulse,
        ring: ringSVG({ frac: water / wGoal, label: `Water ${fmtLitres(water)} of ${fmtLitres(wGoal)} litres` }),
        value: { text: fmtLitres(water) },
      })}
      ${ringButton({
        id: 'supps', action: 'supps', label: 'Supps', pulse: ctx.pulse,
        ring: ringSVG({
          segments: s.supplements.length, lit: supps,
          frac: s.supplements.length === 1 ? supps : 0,
          label: `Supplements ${supps} of ${s.supplements.length}`,
        }),
        value: {
          text: `${supps}/${s.supplements.length}`,
          node: html`${supps}<span style="color:var(--ash);font-weight:600">/${s.supplements.length}</span>`,
        },
      })}
      ${ringButton({
        id: 'food', action: 'food', label: 'Food · cal', pulse: ctx.pulse,
        ring: ringSVG({ frac: food.cal / foodTarget.cal, label: `Food ${food.cal} of ${foodTarget.cal} calories` }),
        value: food.cal ? { text: food.cal.toLocaleString('en-CA') } : { node: html`<span style="color:var(--ash)">0</span>`, text: '0' },
      })}
    </div>

    ${goal ? html`
      <div style="display:flex;flex-direction:column;gap:10px">
        <div class="countdown">
          <span class="num">${Math.max(0, daysBetween(today, goal.date))}</span>
          <div class="head-stack" style="padding-bottom:2px">
            <span class="label">Days to</span>
            <span class="label-strong" style="font-size:24px;line-height:1;letter-spacing:0.04em">${goal.name}</span>
            <span class="small">${fmtDate(goal.date)}</span>
          </div>
        </div>
        <div style="padding:0 4px">${phaseBar(state)}</div>
      </div>` : ''}
  `);

  const changed = (pulse) => ctx.refresh({ pulse });
  const dayType = day.dayType;
  onAction(el, {
    sleep: () => openSleepSheet(today, changed),
    water: () => openWaterSheet(today, changed, dayType),
    supps: () => openSuppsSheet(today, changed),
    food: () => { location.hash = '#/food'; },
    session: (t) => openSessionSheet(t.dataset.id, changed),
    log: (t) => openLogSheet({ session: todays.find((x) => x.id === t.dataset.id), swimStage: state.swimStage }, changed),
    easeAll: async () => {
      for (const x of todays.filter((y) => y.status === 'planned' && y.sport !== 'race')) await setOverride(x.id, { easy: true });
      ctx.refresh();
    },
  });
}
