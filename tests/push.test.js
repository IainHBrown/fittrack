// Tests for push notifications: encryption, sender signature, and the rules
// that decide when a notification is due.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { encryptPayload, vapidAuthorization, sendPush, b64u } from '../worker/src/webpush.js';
import { dueNotifications, behind, localNow } from '../worker/src/rules.js';
import { handle, tick } from '../worker/src/index.js';

const enc = new TextEncoder();
const dec = new TextDecoder();
const concat = (...p) => { const o = new Uint8Array(p.reduce((n, x) => n + x.length, 0)); let a = 0; for (const x of p) { o.set(x, a); a += x.length; } return o; };
const hmac = async (k, d) => new Uint8Array(await crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', k, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), d));

/** What the phone does: decrypt an aes128gcm push body with its private key (RFC 8291). */
async function decrypt(body, uaKeys, uaPublicRaw, authSecret) {
  const salt = body.slice(0, 16);
  const idLen = body[20];
  const serverPublic = body.slice(21, 21 + idLen);
  const cipher = body.slice(21 + idLen);
  const serverKey = await crypto.subtle.importKey('raw', serverPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: serverKey }, uaKeys.privateKey, 256));
  const ikm = await hmac(await hmac(authSecret, shared), concat(enc.encode('WebPush: info\0'), uaPublicRaw, serverPublic, new Uint8Array([1])));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(enc.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, cipher));
  assert.equal(plain.at(-1), 2); // last-record marker
  return plain.slice(0, -1);
}

async function makePhone() {
  const keys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const publicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return { keys, publicRaw, auth, subscription: { endpoint: 'https://web.push.apple.com/abc123', keys: { p256dh: b64u.encode(publicRaw), auth: b64u.encode(auth) } } };
}

async function makeVapid() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  return {
    pair,
    vapid: {
      publicKey: b64u.encode(await crypto.subtle.exportKey('raw', pair.publicKey)),
      privateJwk: await crypto.subtle.exportKey('jwk', pair.privateKey),
      subject: 'https://iainhbrown.github.io/fittrack/',
    },
  };
}

test('matches the worked example in RFC 8291 (Appendix A)', async () => {
  // Published test vector: fixed keys and salt must give exactly this message.
  const jwkFrom = async (dB64, usages) => {
    // rebuild the public point from the private scalar via PKCS8-free JWK import is not possible,
    // so the vector's public keys are given explicitly
    return dB64 && usages;
  };
  void jwkFrom;
  const uaPublic = 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4';
  const authSecret = 'BTBZMqHH6r4Tts7J_aSIgg';
  const asPublic = 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8';
  const asPrivate = 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw';
  const salt = b64u.decode('DGv6ra1nlYgDCS1FRnbzlw');
  const pub = b64u.decode(asPublic);
  const jwk = { kty: 'EC', crv: 'P-256', d: asPrivate, x: b64u.encode(pub.slice(1, 33)), y: b64u.encode(pub.slice(33, 65)), ext: true };
  const serverKeys = {
    privateKey: await crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']),
    publicKey: await crypto.subtle.importKey('raw', pub, { name: 'ECDH', namedCurve: 'P-256' }, true, []),
  };
  const body = await encryptPayload(enc.encode('When I grow up, I want to be a watermelon'), { p256dh: uaPublic, auth: authSecret }, { salt, serverKeys });
  assert.equal(b64u.encode(body),
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN');
});

test('a message encrypted for a phone can be decrypted only with that phone\'s key', async () => {
  const phone = await makePhone();
  const text = JSON.stringify({ title: 'Fitness Tracker', body: 'Streak at risk: water' });
  const body = await encryptPayload(enc.encode(text), phone.subscription.keys);
  assert.equal(body[18], 16); // record size 4096
  assert.equal(body[20], 65); // an uncompressed P-256 public key follows
  assert.equal(dec.decode(await decrypt(body, phone.keys, phone.publicRaw, phone.auth)), text);
  // every message uses a fresh salt and key, so two encryptions differ
  assert.notDeepEqual(body, await encryptPayload(enc.encode(text), phone.subscription.keys));
  // a different phone cannot read it
  const other = await makePhone();
  await assert.rejects(decrypt(body, other.keys, other.publicRaw, other.auth));
});

test('the sender signature (VAPID) verifies and names the push service', async () => {
  const { pair, vapid } = await makeVapid();
  const now = Date.UTC(2026, 10, 12, 12, 0, 0);
  const header = await vapidAuthorization('https://web.push.apple.com/abc123', vapid, now);
  const m = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(header);
  assert.ok(m, header);
  assert.equal(m[4], vapid.publicKey);
  assert.deepEqual(JSON.parse(dec.decode(b64u.decode(m[1]))), { typ: 'JWT', alg: 'ES256' });
  const claims = JSON.parse(dec.decode(b64u.decode(m[2])));
  assert.equal(claims.aud, 'https://web.push.apple.com');
  assert.equal(claims.sub, 'https://iainhbrown.github.io/fittrack/');
  assert.equal(claims.exp, now / 1000 + 12 * 3600); // within the 24-hour limit
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey, b64u.decode(m[3]), enc.encode(`${m[1]}.${m[2]}`));
  assert.equal(ok, true);
});

test('sendPush posts an encrypted body with the right headers', async () => {
  const phone = await makePhone();
  const { vapid } = await makeVapid();
  let seen;
  const res = await sendPush(phone.subscription, { title: 'T', body: 'B' }, vapid, async (url, init) => { seen = { url, init }; return new Response(null, { status: 201 }); });
  assert.deepEqual(res, { ok: true, status: 201, gone: false });
  assert.equal(seen.url, phone.subscription.endpoint);
  assert.equal(seen.init.headers['Content-Encoding'], 'aes128gcm');
  assert.ok(Number(seen.init.headers.TTL) > 0);
  assert.equal(dec.decode(await decrypt(seen.init.body, phone.keys, phone.publicRaw, phone.auth)), '{"title":"T","body":"B"}');
  const gone = await sendPush(phone.subscription, {}, vapid, async () => new Response(null, { status: 410 }));
  assert.equal(gone.gone, true);
});

// ---------- rules ----------

const NOTES = [
  { id: 'sleep', enabled: true, time: '09:30', title: 'Sleep', body: 'Log last night\'s sleep score.' },
  { id: 'workout', enabled: true, time: '16:00', title: 'Workout', body: 'Still to do today: {workout}.' },
  { id: 'water', enabled: true, time: '18:00', title: 'Water', body: 'Behind on water.' },
  { id: 'supps', enabled: true, time: '20:00', title: 'Supplements', body: 'Not ticked yet.' },
  { id: 'streak', enabled: true, time: '21:00', title: 'Streak at risk', body: 'Do it today to keep your {streaks} streak.' },
];
const baseState = (over = {}) => ({
  tz: 'America/Toronto', date: '2026-11-12',
  today: { sleep: false, supps: false, water: false },
  workouts: { '2026-11-12': ['Easy run'], '2026-11-13': ['Long run'] },
  streaks: { sleep: { current: 5, hit: false, atRisk: false }, supps: { current: 3, hit: false, atRisk: true }, water: { current: 0, hit: false, atRisk: false } },
  notifications: NOTES, ...over,
});
// Toronto is UTC-5 in November
const at = (hhmm, day = 12) => new Date(`2026-11-${String(day).padStart(2, '0')}T${hhmm}:00-05:00`);
const ids = (state, time, sent = {}, day = 12) => dueNotifications(state, sent, at(time, day)).map((n) => n.id);

test('local time follows the phone\'s time zone, including across midnight UTC', () => {
  assert.deepEqual(localNow(at('09:30'), 'America/Toronto'), { date: '2026-11-12', minutes: 570 });
  assert.deepEqual(localNow(new Date('2026-11-13T03:10:00Z'), 'America/Toronto'), { date: '2026-11-12', minutes: 22 * 60 + 10 });
  assert.equal(localNow(at('09:30'), 'Not/AZone').date, '2026-11-12'); // bad zone falls back to UTC
});

test('a notification is sent at its time only if the thing is still not done', () => {
  assert.deepEqual(ids(baseState(), '09:30'), ['sleep']);
  assert.deepEqual(ids(baseState(), '09:44'), ['sleep']);       // a late check still catches it
  assert.deepEqual(ids(baseState(), '09:29'), []);              // not before its time
  assert.deepEqual(ids(baseState(), '10:01'), []);              // not long after
  assert.deepEqual(ids(baseState({ today: { sleep: true, supps: false, water: false } }), '09:30'), []); // already logged
  assert.deepEqual(ids(baseState(), '18:00'), ['water']);
  assert.deepEqual(ids(baseState({ today: { sleep: true, supps: true, water: true } }), '18:00'), []);
  assert.deepEqual(ids(baseState(), '20:10'), ['supps']);
});

test('each notification is sent at most once a day, and switches work', () => {
  assert.deepEqual(ids(baseState(), '09:35', { sleep: '2026-11-12' }), []);
  assert.deepEqual(ids(baseState(), '09:35', { sleep: '2026-11-11' }), ['sleep']);
  const off = baseState({ notifications: NOTES.map((n) => (n.id === 'sleep' ? { ...n, enabled: false } : n)) });
  assert.deepEqual(ids(off, '09:30'), []);
  const moved = baseState({ notifications: NOTES.map((n) => (n.id === 'sleep' ? { ...n, time: '07:15' } : n)) });
  assert.deepEqual(ids(moved, '07:20'), ['sleep']);
});

test('workout reminder names what is left, and stays quiet when nothing is', () => {
  const due = dueNotifications(baseState({ workouts: { '2026-11-12': ['Full body A', 'Swim · Stage 2'] } }), {}, at('16:00'));
  assert.equal(due[0].body, 'Still to do today: Full body A and Swim · Stage 2.');
  assert.deepEqual(ids(baseState({ workouts: {} }), '16:00'), []);        // rest day, or all done
});

test('streak warning: only when yesterday was the one allowed miss', () => {
  const due = dueNotifications(baseState(), {}, at('21:00'));
  assert.equal(due.length, 1);
  assert.equal(due[0].body, 'Do it today to keep your supplements streak.');
  // once it is done today, no warning
  const done = baseState({ streaks: { supps: { current: 4, hit: true, atRisk: false } } });
  assert.deepEqual(ids(done, '21:00'), []);
  // a streak of 0 has nothing to lose
  assert.deepEqual(behind(baseState({ streaks: { water: { current: 0, hit: false, atRisk: true } } }), '2026-11-12').streaks, []);
});

test('if the app was not opened today, the Worker assumes nothing is done yet', () => {
  // state last uploaded on the 12th; it is now the 13th
  const s = baseState({ today: { sleep: true, supps: true, water: true } });
  assert.deepEqual(ids(s, '09:30', {}, 13), ['sleep']);
  assert.equal(dueNotifications(s, {}, at('16:00', 13))[0].body, 'Still to do today: Long run.');
  // streaks: sleep was not hit on the 12th (first miss) -> at risk on the 13th;
  // supps was already at risk and still not hit -> it has reset, nothing to warn about
  assert.deepEqual(behind(s, '2026-11-13').streaks, ['sleep']);
  // two days later there is no streak information left to act on
  assert.deepEqual(behind(s, '2026-11-14').streaks, []);
});

// ---------- the Worker's scheduled check ----------

function fakeKV() {
  const data = new Map();
  return {
    data,
    async get(k) { return data.has(k) ? data.get(k) : null; },
    async put(k, v) { data.set(k, v); },
    async delete(k) { data.delete(k); },
    async list() { return { keys: [] }; },
  };
}

test('the scheduled check sends what is due, records it, and does not repeat', async () => {
  const phone = await makePhone();
  const { vapid } = await makeVapid();
  const pushes = [];
  const env = {
    APP_SECRET: 'test-secret', KV: fakeKV(),
    VAPID_PUBLIC_KEY: vapid.publicKey, VAPID_PRIVATE_JWK: JSON.stringify(vapid.privateJwk),
    FETCH: async (url, init) => { pushes.push(JSON.parse(dec.decode(await decrypt(init.body, phone.keys, phone.publicRaw, phone.auth)))); return new Response(null, { status: 201 }); },
  };
  const call = (method, path, body) => handle(new Request(`https://w.example${path}`, { method, headers: { Authorization: 'Bearer test-secret', 'content-type': 'application/json' }, body: body && JSON.stringify(body) }), env);

  assert.equal((await call('PUT', '/push/subscribe', { subscription: { endpoint: 'http://insecure' } })).status, 400);
  assert.equal((await call('PUT', '/push/subscribe', { subscription: phone.subscription })).status, 200);
  assert.equal((await call('PUT', '/push/state', { state: baseState() })).status, 200);
  assert.equal((await call('PUT', '/push/state', { state: { nope: 1 } })).status, 400);

  assert.deepEqual(await tick(env, at('09:00')), []);
  assert.deepEqual(await tick(env, at('09:30')), ['sleep']);
  assert.deepEqual(await tick(env, at('09:45')), []); // already sent today
  assert.deepEqual(pushes, [{ title: 'Sleep', body: 'Log last night\'s sleep score.', tag: 'sleep' }]);

  // test button
  assert.equal((await call('POST', '/push/test')).status, 200);
  assert.equal(pushes.at(-1).tag, 'test');

  // the push service says the phone is gone: forget it, and report clearly
  env.FETCH = async () => new Response(null, { status: 410 });
  const gone = await call('POST', '/push/test');
  assert.equal(gone.status, 502);
  assert.match((await gone.json()).error, /no longer subscribed/);
  assert.equal(env.KV.data.has('push:sub'), false);
  assert.match((await (await call('POST', '/push/test')).json()).error, /not turned on/);

  assert.equal((await call('DELETE', '/push/subscribe')).status, 200);
});
