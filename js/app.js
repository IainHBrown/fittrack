// App entry: loads settings, draws the tab bar, routes between screens,
// and re-draws when the local date changes (the "midnight reset").

import { html, mount } from './lib/dom.js';
import { dayKey } from './lib/dates.js';
import { loadSettings } from './state.js';
import { requestPersistence } from './db.js';
import { icon } from './ui/icons.js';
import { celebrate } from './ui/celebrate.js';
import { maybeAutoBackup } from './cloud.js';
import { syncPushState } from './push.js';
import { syncHealth } from './health-service.js';
import { getGame, newMoments } from './game-service.js';
import { render as renderToday } from './screens/today.js';
import { render as renderSleep } from './screens/sleep.js';
import { render as renderMe } from './screens/me.js';
import { render as renderSettings } from './screens/settings.js';
import { render as renderTrain } from './screens/train.js';
import { render as renderLifting } from './screens/lifting.js';
import { render as renderRoutine } from './screens/routine.js';
import { render as renderExercise } from './screens/exercise.js';
import { render as renderWorkout } from './screens/workout.js';
import { render as renderStretches } from './screens/stretches.js';
import { render as renderFood } from './screens/food.js';

const TABS = [
  ['today', 'Today'],
  ['train', 'Train'],
  ['food', 'Food'],
  ['sleep', 'Sleep'],
  ['me', 'Me'],
];

// A route is matched by its longest prefix; anything after it is passed to
// the screen as ctx.params (e.g. "#/exercise/bench" -> params ["bench"]).
const ROUTES = {
  today: renderToday,
  train: renderTrain,
  'train/lifting': renderLifting,
  'train/stretches': renderStretches,
  routine: renderRoutine,
  exercise: renderExercise,
  workout: renderWorkout,
  food: renderFood,
  sleep: renderSleep,
  me: renderMe,
  'me/settings': renderSettings,
};
// which tab is lit for routes that are not tabs themselves
const TAB_OF = { routine: 'train', exercise: 'train', workout: 'train' };

const screenEl = document.getElementById('screen');
const tabbarEl = document.getElementById('tabbar');
let view = null;      // the current screen's container
let renderFn = null;  // the current screen's render function
let shownDay = dayKey();

let params = [];      // the current route's parameters

function currentRoute() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  for (let n = Math.min(2, parts.length); n >= 1; n--) {
    const path = parts.slice(0, n).join('/');
    if (ROUTES[path]) return { path, params: parts.slice(n) };
  }
  return { path: 'today', params: [] };
}

/** Re-draw the current screen in place (no entry animation). */
async function refresh(extra = {}) {
  if (view && renderFn) await renderFn(view, { refresh, params, ...extra });
  checkMoments();
}

/** After anything changes, see whether a level-up or new badge should be celebrated. */
let checking = false;
async function checkMoments() {
  if (checking) return;
  checking = true;
  try {
    const moments = await newMoments(await getGame());
    // let the "logged" banner land first, then celebrate
    if (moments.length) setTimeout(() => celebrate(moments), 700);
  } catch { /* never let a celebration break the app */ }
  checking = false;
  maybeAutoBackup(); // uploads only when one is due and cloud is set up
  syncPushState();   // tells the Worker what is done today (only if notifications are on)
  // pick up anything the Apple Watch shortcut uploaded, and re-draw if it brought something new
  syncHealth().then((h) => { if (h && h.changed) refresh(); }).catch(() => {});
}

async function navigate() {
  const route = currentRoute();
  const path = route.path;
  params = route.params;
  renderFn = ROUTES[path];
  const first = path.split('/')[0];
  const tab = TAB_OF[first] || first;
  for (const a of tabbarEl.querySelectorAll('.tab')) {
    if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  const next = document.createElement('div');
  next.className = 'screen';
  await renderFn(next, { refresh, params });
  screenEl.replaceChildren(next);
  screenEl.scrollTop = 0;
  view = next;
  checkMoments();
}

/** If the date has rolled over since we last drew, start the new day. */
function checkDayChange() {
  const now = dayKey();
  if (now !== shownDay) {
    shownDay = now;
    refresh();
  }
}

async function start() {
  mount(tabbarEl, html`${TABS.map(([id, name]) => html`
    <a class="tab" href="#/${id}" data-tab="${id}">${icon(id, 26)}<span>${name}</span></a>`)}`);

  await loadSettings();
  await navigate();

  window.addEventListener('hashchange', navigate);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    checkDayChange();
    // The shortcut runs when the app opens, so its upload lands a few seconds later.
    for (const wait of [1500, 12000, 30000]) {
      setTimeout(() => syncHealth(true).then((h) => { if (h && h.changed) refresh(); }).catch(() => {}), wait);
    }
  });
  window.addEventListener('pageshow', checkDayChange);
  setInterval(checkDayChange, 20000);

  // Keep sheets above the iPhone keyboard: publish its height as --kb.
  const vv = window.visualViewport;
  if (vv) {
    const setKeyboard = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty('--kb', `${kb > 80 ? Math.round(kb) : 0}px`);
    };
    vv.addEventListener('resize', setKeyboard);
    vv.addEventListener('scroll', setKeyboard);
  }
  // When a field in a sheet gets focus, bring it into view above the keyboard.
  document.addEventListener('focusin', (e) => {
    if (e.target.matches('input, textarea, select') && e.target.closest('.sheet')) {
      setTimeout(() => e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 320);
    }
  });

  requestPersistence();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* offline support unavailable */ });
  }
}

start();
