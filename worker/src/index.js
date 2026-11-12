// Fitness Tracker Worker (Cloudflare, free plan).
//
//   POST /estimate      { image: "<base64 JPEG or data URL>" } -> rough calories and macros
//   PUT  /backup        body = the app's backup JSON            -> saved in KV
//   GET  /backup                                               -> the latest backup
//   GET  /backup/info                                          -> when it was saved, and its size
//   GET  /ping                                                 -> checks the secret and bindings
//   PUT  /push/subscribe { subscription }                      -> remember this phone for notifications
//   DELETE /push/subscribe                                     -> forget it
//   PUT  /push/state     { state }                             -> what is done today, and the notification settings
//   POST /push/test                                            -> send a test notification now
//
// Every 15 minutes (cron) the Worker checks whether a notification is due and
// its goal is still not done, and only then sends it.
//
// Every request must carry "Authorization: Bearer <APP_SECRET>". APP_SECRET is
// a Worker secret (set with `wrangler secret put APP_SECRET`); it is never in
// the app's code. There is no login, so this secret is the only lock.

const MAX_IMAGE_CHARS = 2_000_000;      // about 1.5 MB of JPEG as base64
const MAX_BACKUP_BYTES = 24 * 1024 * 1024; // KV values can be up to 25 MiB

const DEFAULT_ORIGINS = 'https://iainhbrown.github.io,http://localhost:8080,http://localhost:8081';
const DEFAULT_MODELS = '@cf/meta/llama-4-scout-17b-16e-instruct,@cf/meta/llama-3.2-11b-vision-instruct';

import { sendPush } from './webpush.js';
import { dueNotifications, localDate } from './rules.js';

const SYSTEM = 'You estimate the nutrition of a meal from one photo for a rough personal food log. '
  + 'Assume typical restaurant or dining-hall portions unless the photo clearly shows otherwise. '
  + 'Reply with ONLY a JSON object, no other text, in exactly this shape: '
  + '{"name": "short name of the meal", "cal": 0, "protein": 0, "carbs": 0, "fat": 0, "confidence": "low|medium|high", "note": "one short sentence on what you assumed"}. '
  + 'cal is total calories; protein, carbs and fat are grams. Use whole numbers. '
  + 'If the photo does not show food, reply {"error": "no food"}.';
const USER = 'Estimate the total calories, protein, carbs and fat for everything on the plate.';

export default {
  fetch(request, env) {
    return handle(request, env);
  },
  scheduled(event, env, ctx) {
    ctx.waitUntil(tick(env, new Date()));
  },
};

export async function handle(request, env) {
  const url = new URL(request.url);
  const cors = corsHeaders(request, env);
  const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...cors } });

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (!env.APP_SECRET) return json({ error: 'The Worker has no APP_SECRET set yet.' }, 500);
  if (!(await authorised(request, env))) return json({ error: 'Wrong or missing secret.' }, 401);

  try {
    const route = `${request.method} ${url.pathname.replace(/\/+$/, '') || '/'}`;
    if (route === 'GET /ping') return json({ ok: true, ai: !!env.AI, storage: !!env.KV });
    if (route === 'POST /estimate') return json(...(await estimate(request, env)));
    if (route === 'PUT /backup') return json(...(await saveBackup(request, env)));
    if (route === 'GET /backup/info') return json(await backupInfo(env));
    if (route === 'GET /backup') {
      const value = await env.KV.get('backup:latest', { type: 'stream' });
      if (!value) return json({ error: 'No backup has been saved yet.' }, 404);
      return new Response(value, { headers: { 'content-type': 'application/json', ...cors } });
    }
    if (route === 'PUT /push/subscribe') return json(...(await pushSubscribe(request, env)));
    if (route === 'DELETE /push/subscribe') { await env.KV.delete('push:sub'); return json({ ok: true }); }
    if (route === 'PUT /push/state') return json(...(await pushState(request, env)));
    if (route === 'POST /push/test') return json(...(await pushTest(env)));
    return json({ error: 'Not found.' }, 404);
  } catch (err) {
    return json({ error: `Worker error: ${err && err.message ? err.message : 'unknown'}` }, 500);
  }
}

// ---------- access ----------

function corsHeaders(request, env) {
  const allowed = (env.ALLOWED_ORIGINS || DEFAULT_ORIGINS).split(',').map((s) => s.trim());
  const origin = request.headers.get('Origin');
  const headers = {
    'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (origin && allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

/** Compare the bearer token with the secret without leaking timing. */
async function authorised(request, env) {
  const header = request.headers.get('Authorization') || '';
  const given = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!given) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(given)),
    crypto.subtle.digest('SHA-256', enc.encode(env.APP_SECRET)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

// ---------- photo estimate ----------

async function estimate(request, env) {
  if (!env.AI) return [{ error: 'The Worker has no AI binding.' }, 500];
  const body = await request.json().catch(() => null);
  let b64 = body && typeof body.image === 'string' ? body.image : '';
  b64 = b64.replace(/^data:image\/\w+;base64,/, '');
  if (!b64) return [{ error: 'No photo was sent.' }, 400];
  if (b64.length > MAX_IMAGE_CHARS) return [{ error: 'The photo is too large.' }, 413];

  // A daily cap keeps a bug or a leaked secret from using up the free allowance.
  const cap = Number(env.DAILY_ESTIMATES || 80);
  const dayKey = `estimates:${new Date().toISOString().slice(0, 10)}`;
  const used = Number((await env.KV.get(dayKey)) || 0);
  if (used >= cap) return [{ error: `Daily limit of ${cap} photo estimates reached. It resets at midnight UTC.` }, 429];
  await env.KV.put(dayKey, String(used + 1), { expirationTtl: 172800 });

  const models = (env.VISION_MODELS || DEFAULT_MODELS).split(',').map((s) => s.trim()).filter(Boolean);
  let lastError = 'no model answered';
  for (const model of models) {
    try {
      const text = await askVision(env, model, b64);
      const result = parseEstimate(text);
      if (result.error === 'no food') return [{ error: "That doesn't look like food. Try another photo, or enter it by hand." }, 422];
      if (result.ok) return [{ ...result.value, model, usedToday: used + 1, dailyLimit: cap }, 200];
      lastError = `${model} gave an answer that could not be read`;
    } catch (err) {
      lastError = `${model}: ${err && err.message ? err.message : 'failed'}`;
    }
  }
  return [{ error: `The estimate failed (${lastError}). Enter the meal by hand instead.` }, 502];
}

/** Ask one model. Tries the chat format first, then the older prompt + image-bytes format. */
async function askVision(env, model, b64) {
  const chat = {
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: [
        { type: 'text', text: USER },
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } },
      ] },
    ],
    max_tokens: 300,
    temperature: 0.2,
  };
  const legacy = () => ({ prompt: `${SYSTEM}\n\n${USER}`, image: [...base64ToBytes(b64)], max_tokens: 300, temperature: 0.2 });

  const run = async (input) => textOf(await env.AI.run(model, input));
  try {
    return await run(chat);
  } catch (err) {
    const message = String(err && err.message);
    // Some Meta models need their licence accepted once per account.
    if (/agree|licen[sc]e/i.test(message)) {
      await env.AI.run(model, { prompt: 'agree' }).catch(() => {});
      try { return await run(chat); } catch { /* fall through to the older format */ }
    }
    return run(legacy());
  }
}

function textOf(res) {
  if (!res) return '';
  if (typeof res === 'string') return res;
  if (res.response && typeof res.response === 'object') return JSON.stringify(res.response);
  if (typeof res.response === 'string') return res.response;
  const choice = res.choices && res.choices[0];
  if (choice && choice.message && typeof choice.message.content === 'string') return choice.message.content;
  return typeof res.result === 'string' ? res.result : '';
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Pull the JSON object out of a model reply and tidy the numbers. */
export function parseEstimate(text) {
  const start = String(text).indexOf('{');
  const end = String(text).lastIndexOf('}');
  if (start < 0 || end <= start) return { ok: false };
  let data;
  try { data = JSON.parse(String(text).slice(start, end + 1)); } catch { return { ok: false }; }
  if (data && data.error) return { ok: false, error: 'no food' };
  const num = (v) => {
    const n = Math.round(Number(String(v).replace(/[^\d.]/g, '')));
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const value = { cal: num(data.cal ?? data.calories), protein: num(data.protein), carbs: num(data.carbs ?? data.carbohydrates), fat: num(data.fat) };
  if (value.cal == null || value.cal === 0 || value.cal > 6000) return { ok: false };
  for (const k of ['protein', 'carbs', 'fat']) if (value[k] == null) value[k] = 0;
  value.name = String(data.name || 'Meal').slice(0, 60);
  value.note = String(data.note || '').slice(0, 160);
  value.confidence = ['low', 'medium', 'high'].includes(data.confidence) ? data.confidence : 'low';
  return { ok: true, value };
}

// ---------- cloud backup ----------

async function saveBackup(request, env) {
  const text = await request.text();
  if (text.length > MAX_BACKUP_BYTES) return [{ error: 'The backup is too large for free storage (24 MB). Remove some stretch photos and try again.' }, 413];
  let app;
  try { app = JSON.parse(text).app; } catch { app = null; }
  if (app !== 'fittrack') return [{ error: 'That is not a Fitness Tracker backup.' }, 400];

  // keep the previous backup as a safety copy before overwriting
  const previous = await env.KV.getWithMetadata('backup:latest', { type: 'stream' });
  if (previous && previous.value) await env.KV.put('backup:previous', previous.value, { metadata: previous.metadata || {} });

  const meta = { savedAt: new Date().toISOString(), bytes: text.length };
  await env.KV.put('backup:latest', text, { metadata: meta });
  return [{ ok: true, ...meta }, 200];
}

async function backupInfo(env) {
  const list = await env.KV.list({ prefix: 'backup:' });
  const find = (name) => {
    const k = list.keys.find((x) => x.name === name);
    return k ? (k.metadata || {}) : null;
  };
  return { latest: find('backup:latest'), previous: find('backup:previous') };
}

// ---------- push notifications ----------

function vapid(env) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_JWK) return null;
  return { publicKey: env.VAPID_PUBLIC_KEY, privateJwk: JSON.parse(env.VAPID_PRIVATE_JWK), subject: env.VAPID_SUBJECT || 'https://iainhbrown.github.io/fittrack/' };
}

async function pushSubscribe(request, env) {
  const body = await request.json().catch(() => null);
  const sub = body && body.subscription;
  const good = sub && typeof sub.endpoint === 'string' && sub.endpoint.startsWith('https://') && sub.keys && sub.keys.p256dh && sub.keys.auth;
  if (!good) return [{ error: 'That is not a push subscription.' }, 400];
  await env.KV.put('push:sub', JSON.stringify({ endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } }));
  return [{ ok: true }, 200];
}

async function pushState(request, env) {
  const body = await request.json().catch(() => null);
  const state = body && body.state;
  if (!state || typeof state !== 'object' || !Array.isArray(state.notifications)) return [{ error: 'Bad state.' }, 400];
  const text = JSON.stringify(state);
  if (text.length > 20000) return [{ error: 'State too large.' }, 413];
  await env.KV.put('push:state', text);
  return [{ ok: true }, 200];
}

/** Send to the saved phone. Forgets the subscription if the push service says it is gone. */
async function deliver(env, message) {
  const keys = vapid(env);
  if (!keys) return { ok: false, status: 0, error: 'The Worker has no notification keys yet.' };
  const sub = JSON.parse((await env.KV.get('push:sub')) || 'null');
  if (!sub) return { ok: false, status: 0, error: 'Notifications are not turned on for any phone yet.' };
  const res = await sendPush(sub, message, keys, env.FETCH || fetch);
  if (res.gone) await env.KV.delete('push:sub');
  return res;
}

async function pushTest(env) {
  const res = await deliver(env, { title: 'Fitness Tracker', body: 'Test notification. If you can read this, it works.', tag: 'test' });
  if (res.ok) return [{ ok: true }, 200];
  return [{ error: res.error || (res.gone ? 'This phone is no longer subscribed. Turn notifications on again.' : `The push service answered ${res.status}.`) }, 502];
}

/** One scheduled check: send whatever is due and still not done. */
export async function tick(env, now) {
  const state = JSON.parse((await env.KV.get('push:state')) || 'null');
  if (!state) return [];
  const sent = JSON.parse((await env.KV.get('push:sent')) || '{}');
  const due = dueNotifications(state, sent, now);
  if (!due.length) return [];
  const today = localDate(now, state.tz || 'UTC');
  const delivered = [];
  for (const n of due) {
    const res = await deliver(env, { title: n.title, body: n.body, tag: n.id });
    if (res.ok) { sent[n.id] = today; delivered.push(n.id); }
    else if (!res.status) break; // no keys or no phone: nothing more to try
  }
  if (delivered.length) await env.KV.put('push:sent', JSON.stringify(sent));
  return delivered;
}
