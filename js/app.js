// App entry: loads settings, draws the tab bar, routes between screens,
// and re-draws when the local date changes (the "midnight reset").

import { html, mount } from './lib/dom.js';
import { dayKey } from './lib/dates.js';
import { loadSettings } from './state.js';
import { requestPersistence } from './db.js';
import { icon } from './ui/icons.js';
import { render as renderToday } from './screens/today.js';
import { render as renderSleep } from './screens/sleep.js';
import { render as renderMe } from './screens/me.js';
import { render as renderSettings } from './screens/settings.js';
import { renderTrain, renderFood } from './screens/placeholders.js';

const TABS = [
  ['today', 'Today'],
  ['train', 'Train'],
  ['food', 'Food'],
  ['sleep', 'Sleep'],
  ['me', 'Me'],
];

const ROUTES = {
  today: renderToday,
  train: renderTrain,
  food: renderFood,
  sleep: renderSleep,
  me: renderMe,
  'me/settings': renderSettings,
};

const screenEl = document.getElementById('screen');
const tabbarEl = document.getElementById('tabbar');
let view = null;      // the current screen's container
let renderFn = null;  // the current screen's render function
let shownDay = dayKey();

function currentPath() {
  const path = location.hash.replace(/^#\/?/, '');
  return ROUTES[path] ? path : 'today';
}

/** Re-draw the current screen in place (no entry animation). */
async function refresh(extra = {}) {
  if (view && renderFn) await renderFn(view, { refresh, ...extra });
}

async function navigate() {
  const path = currentPath();
  renderFn = ROUTES[path];
  const tab = path.split('/')[0];
  for (const a of tabbarEl.querySelectorAll('.tab')) {
    if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  const next = document.createElement('div');
  next.className = 'screen';
  await renderFn(next, { refresh });
  screenEl.replaceChildren(next);
  screenEl.scrollTop = 0;
  view = next;
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
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDayChange(); });
  window.addEventListener('pageshow', checkDayChange);
  setInterval(checkDayChange, 20000);

  requestPersistence();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* offline support unavailable */ });
  }
}

start();
