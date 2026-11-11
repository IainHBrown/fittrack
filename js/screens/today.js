// Today: the screen the app opens on.

import { html, mount, onAction } from '../lib/dom.js';
import { dayKey, fmtDayLong, fmtDate, daysBetween } from '../lib/dates.js';
import { getDay } from '../db.js';
import { settings } from '../state.js';
import { waterTotal, waterGoal, fmtLitres, suppsTicked, sleepLevel, nextGoal } from '../logic/day.js';
import { ringSVG } from '../ui/ring.js';
import { icon } from '../ui/icons.js';
import { openWaterSheet } from '../sheets/water.js';
import { openSuppsSheet } from '../sheets/supps.js';
import { openSleepSheet } from '../sheets/sleep.js';

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

/** The workout panel. Until the plan engine exists it shows when the plan starts. */
function workoutPanel(s, today) {
  const untilStart = daysBetween(today, s.plan.startDate);
  const headline = untilStart > 1 ? `Starts in ${untilStart} days`
    : untilStart === 1 ? 'Starts tomorrow'
    : untilStart === 0 ? 'Starts today' : 'Plan in progress';
  return html`
    <section class="panel">
      <div class="tagrow">
        <div class="tile">${icon('calendar', 22, 2.4)}</div>
        <span class="label-strong volt">Training plan</span>
      </div>
      <h2 class="hero">${headline}</h2>
      <p class="body-2">
        ${untilStart >= 0
          ? `Your plan begins ${fmtDayLong(s.plan.startDate)} with two easy weeks, then baseline tests.`
          : 'Your sessions will show here once the plan engine is added in Stage 2.'}
      </p>
    </section>`;
}

export async function render(el, ctx) {
  const today = dayKey();
  const s = settings();
  const day = await getDay(today);

  const water = waterTotal(day);
  const wGoal = waterGoal(s, day);
  const supps = suppsTicked(day, s.supplements);
  const level = sleepLevel(day.sleep, s);
  const goal = nextGoal(s.goals, today);

  mount(el, html`
    <header class="head">
      <div class="head-stack">
        <span class="label" style="font-size:17px">${fmtDayLong(today)}</span>
        <h1 class="title">Today</h1>
      </div>
    </header>

    ${workoutPanel(s, today)}

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
      <div class="rowlink" role="note">
        <div class="tile" style="--c:var(--flare)">${icon('sleep', 22, 2.4)}</div>
        <div class="rowlink-main">
          <span class="label-strong flare" style="font-size:17px">Low sleep score</span>
          <span class="body-2">Under ${s.sleep.lowBelow}. Keep today's training easy.</span>
        </div>
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
        ring: ringSVG({ frac: 0, label: 'Food tracking arrives in Stage 4' }),
        value: { node: html`<span style="color:var(--ash)">0</span>`, text: '0' },
      })}
    </div>

    ${goal ? html`
      <div class="countdown">
        <span class="num">${Math.max(0, daysBetween(today, goal.date))}</span>
        <div class="head-stack" style="padding-bottom:2px">
          <span class="label">Days to</span>
          <span class="label-strong" style="font-size:24px;line-height:1;letter-spacing:0.04em">${goal.name}</span>
          <span class="small">${fmtDate(goal.date)}</span>
        </div>
      </div>` : ''}
  `);

  const changed = (pulse) => ctx.refresh({ pulse });
  onAction(el, {
    sleep: () => openSleepSheet(today, changed),
    water: () => openWaterSheet(today, changed),
    supps: () => openSuppsSheet(today, changed),
    food: () => { location.hash = '#/food'; },
  });
}
