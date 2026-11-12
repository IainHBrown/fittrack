// Lock-screen notifications. The phone subscribes with the browser's push
// service and gives that subscription to the Worker. After each change the
// phone uploads a small summary of what is done today; the Worker uses it to
// decide, at each notification's time, whether anything is still behind.

import { addDays } from './lib/dates.js';
import { settings } from './state.js';
import { kvGet, kvSet } from './db.js';
import { cloudCall, cloudConfig } from './cloud.js';
import { getGame } from './game-service.js';
import { dayHits } from './engine/game.js';
import { sessionsOn } from './plan-service.js';

/** Can this browser do push at all? On iPhone only the Home Screen app can. */
export function pushSupport() {
  const ok = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  return {
    ok,
    reason: ok ? '' : 'Notifications only work when the app is opened from its Home Screen icon (iOS 16.4 or later), not in a Safari tab.',
  };
}

export async function pushStatus() {
  const support = pushSupport();
  if (!support.ok) return { ...support, on: false, permission: 'unsupported' };
  let subscribed = false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    subscribed = !!(reg && await reg.pushManager.getSubscription());
  } catch { /* treated as not subscribed */ }
  return { ...support, permission: Notification.permission, on: subscribed && !!(await kvGet('pushOn')) };
}

function keyBytes(b64url) {
  const bin = atob(b64url.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** Ask permission, subscribe, and register the phone with the Worker. Must follow a tap. */
export async function enablePush() {
  const support = pushSupport();
  if (!support.ok) throw new Error(support.reason);
  if (!(await cloudConfig()).ready) throw new Error('Set up the Worker address and passphrase in Backup first.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications are blocked for this app. Allow them in iPhone Settings, Notifications, FitTrack.');
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription()
    || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(settings().cloud.vapidPublicKey) });
  await cloudCall('/push/subscribe', { method: 'PUT', body: JSON.stringify({ subscription: sub.toJSON() }) });
  await kvSet('pushOn', true);
  await syncPushState(true);
}

export async function disablePush() {
  await kvSet('pushOn', false);
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg && await reg.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();
  } catch { /* nothing to unsubscribe */ }
  try { await cloudCall('/push/subscribe', { method: 'DELETE' }); } catch { /* offline: the Worker drops it when a send fails */ }
}

export const sendTestPush = () => cloudCall('/push/test', { method: 'POST' });

/** The summary the Worker needs: today's goals, upcoming sessions, streaks, and the notification settings. */
export async function buildPushState() {
  const s = settings();
  const game = await getGame();
  const today = game.today;
  const hits = dayHits(game.days.find((d) => d.date === today), s, true);
  const workouts = {};
  for (let i = 0; i < 8; i++) {
    const date = addDays(today, i);
    const left = sessionsOn(game.plan, date).filter((x) => x.status === 'planned').map((x) => x.title);
    if (left.length) workouts[date] = left;
  }
  const streaks = {};
  for (const [name, st] of Object.entries(game.streaks)) streaks[name] = { current: st.current, hit: st.hitToday, atRisk: st.atRisk };
  return {
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    date: today,
    today: hits,
    workouts,
    streaks,
    notifications: s.notifications.map(({ id, enabled, time, title, body }) => ({ id, enabled, time, title, body })),
  };
}

let syncing = false;

/** Upload the summary if it changed since the last upload. Quietly does nothing when push is off or offline. */
export async function syncPushState(force = false) {
  if (syncing || !(await kvGet('pushOn'))) return;
  syncing = true;
  try {
    const text = JSON.stringify({ state: await buildPushState() });
    if (!force && text === (await kvGet('pushStateHash'))) return;
    await cloudCall('/push/state', { method: 'PUT', body: text });
    await kvSet('pushStateHash', text);
  } catch { /* retried after the next change */ } finally {
    syncing = false;
  }
}
