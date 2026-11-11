// Tests for the Cloudflare Worker, run against stand-in AI and storage.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { handle, parseEstimate } from '../worker/src/index.js';

/** A minimal in-memory stand-in for Workers KV. */
function fakeKV() {
  const data = new Map();
  const read = async (v) => (v && typeof v.getReader === 'function' ? new Response(v).text() : v);
  return {
    data,
    async get(key, opts) {
      if (!data.has(key)) return null;
      const { value } = data.get(key);
      return opts && opts.type === 'stream' ? new Response(value).body : value;
    },
    async getWithMetadata(key, opts) {
      if (!data.has(key)) return { value: null, metadata: null };
      const { value, metadata } = data.get(key);
      return { value: opts && opts.type === 'stream' ? new Response(value).body : value, metadata };
    },
    async put(key, value, opts = {}) { data.set(key, { value: await read(value), metadata: opts.metadata || null }); },
    async list({ prefix }) {
      return { keys: [...data.entries()].filter(([k]) => k.startsWith(prefix)).map(([name, v]) => ({ name, metadata: v.metadata })) };
    },
  };
}

const SECRET = 'correct horse battery staple';
const makeEnv = (ai) => ({ APP_SECRET: SECRET, KV: fakeKV(), AI: ai || { run: async () => ({ response: '{"name":"Burger and fries","cal":950,"protein":40,"carbs":90,"fat":48,"confidence":"medium","note":"Assumed a double patty."}' }) } });
const call = (env, method, path, { body, secret = SECRET, origin = 'https://iainhbrown.github.io' } = {}) => handle(new Request(`https://w.example${path}`, {
  method,
  headers: { ...(secret ? { Authorization: `Bearer ${secret}` } : {}), ...(origin ? { Origin: origin } : {}), 'content-type': 'application/json' },
  body,
}), env);
const IMG = 'data:image/jpeg;base64,' + Buffer.from('fake jpeg bytes').toString('base64');

test('requests without the right secret are refused', async () => {
  const env = makeEnv();
  assert.equal((await call(env, 'GET', '/ping', { secret: null })).status, 401);
  assert.equal((await call(env, 'GET', '/ping', { secret: 'wrong' })).status, 401);
  assert.equal((await call(env, 'GET', '/backup', { secret: 'correct horse battery stapl' })).status, 401);
  const ok = await call(env, 'GET', '/ping');
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { ok: true, ai: true, storage: true });
  // a Worker with no secret configured never lets anyone in
  assert.equal((await call({ ...env, APP_SECRET: undefined }, 'GET', '/ping')).status, 500);
});

test('only the app\'s own web addresses get browser access', async () => {
  const env = makeEnv();
  const good = await call(env, 'OPTIONS', '/estimate', { secret: null });
  assert.equal(good.status, 204);
  assert.equal(good.headers.get('Access-Control-Allow-Origin'), 'https://iainhbrown.github.io');
  const bad = await call(env, 'OPTIONS', '/estimate', { secret: null, origin: 'https://evil.example' });
  assert.equal(bad.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal((await call(env, 'GET', '/ping')).headers.get('Access-Control-Allow-Origin'), 'https://iainhbrown.github.io');
});

test('a photo comes back as rough calories and macros', async () => {
  const calls = [];
  const env = makeEnv({ run: async (model, input) => { calls.push({ model, input }); return { response: 'Here you go: {"name":"Chicken teriyaki bowl","cal":"720 kcal","protein":41,"carbs":"98g","fat":15.4,"confidence":"high","note":"Rice bowl."}' }; } });
  const res = await call(env, 'POST', '/estimate', { body: JSON.stringify({ image: IMG }) });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.deepEqual({ name: data.name, cal: data.cal, protein: data.protein, carbs: data.carbs, fat: data.fat, confidence: data.confidence },
    { name: 'Chicken teriyaki bowl', cal: 720, protein: 41, carbs: 98, fat: 15, confidence: 'high' });
  assert.equal(data.usedToday, 1);
  // the image went to the first model as a data URL
  assert.equal(calls[0].model, '@cf/meta/llama-4-scout-17b-16e-instruct');
  assert.match(calls[0].input.messages[1].content[1].image_url.url, /^data:image\/jpeg;base64,/);
});

test('falls back to the older image format, then to the next model', async () => {
  const seen = [];
  const env = makeEnv({ run: async (model, input) => {
    seen.push(`${model.split('/').pop()}:${input.messages ? 'chat' : input.prompt === 'agree' ? 'agree' : 'legacy'}`);
    if (model.includes('llama-4')) throw new Error('model unavailable');
    if (input.messages) throw new Error('You must agree to the license first');
    if (input.prompt === 'agree') return { response: 'ok' };
    assert.ok(Array.isArray(input.image) && input.image.length > 0);
    return { response: '{"name":"Pasta","cal":700,"protein":25,"carbs":95,"fat":20}' };
  } });
  const res = await call(env, 'POST', '/estimate', { body: JSON.stringify({ image: IMG }) });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).name, 'Pasta');
  assert.deepEqual(seen, [
    'llama-4-scout-17b-16e-instruct:chat', 'llama-4-scout-17b-16e-instruct:legacy',
    'llama-3.2-11b-vision-instruct:chat', 'llama-3.2-11b-vision-instruct:agree', 'llama-3.2-11b-vision-instruct:chat', 'llama-3.2-11b-vision-instruct:legacy',
  ]);
});

test('bad photos and unreadable answers give a clear error, never made-up numbers', async () => {
  assert.equal((await call(makeEnv(), 'POST', '/estimate', { body: '{}' })).status, 400);
  assert.equal((await call(makeEnv(), 'POST', '/estimate', { body: JSON.stringify({ image: 'A'.repeat(2_000_001) }) })).status, 413);
  const noFood = await call(makeEnv({ run: async () => ({ response: '{"error":"no food"}' }) }), 'POST', '/estimate', { body: JSON.stringify({ image: IMG }) });
  assert.equal(noFood.status, 422);
  const junk = await call(makeEnv({ run: async () => ({ response: 'I cannot tell.' }) }), 'POST', '/estimate', { body: JSON.stringify({ image: IMG }) });
  assert.equal(junk.status, 502);
  assert.match((await junk.json()).error, /Enter the meal by hand/);
});

test('the daily cap stops estimates once reached', async () => {
  const env = { ...makeEnv(), DAILY_ESTIMATES: '2' };
  const go = () => call(env, 'POST', '/estimate', { body: JSON.stringify({ image: IMG }) });
  assert.equal((await go()).status, 200);
  assert.equal((await go()).status, 200);
  const third = await go();
  assert.equal(third.status, 429);
  assert.match((await third.json()).error, /Daily limit of 2/);
});

test('parseEstimate handles messy model replies', () => {
  assert.deepEqual(parseEstimate('```json\n{"name":"Eggs","calories":300,"protein":"20 g","carbohydrates":2,"fat":22}\n```').value,
    { cal: 300, protein: 20, carbs: 2, fat: 22, name: 'Eggs', note: '', confidence: 'low' });
  assert.equal(parseEstimate('no json here').ok, false);
  assert.equal(parseEstimate('{"name":"x","cal":0}').ok, false);      // zero calories is not an estimate
  assert.equal(parseEstimate('{"name":"x","cal":99999}').ok, false);  // absurd values are rejected
  assert.equal(parseEstimate('{"cal":500}').value.name, 'Meal');
  assert.equal(parseEstimate('{broken').ok, false);
});

test('cloud backup: save, read back, and keep the previous copy', async () => {
  const env = makeEnv();
  assert.equal((await call(env, 'GET', '/backup')).status, 404);
  const first = JSON.stringify({ app: 'fittrack', format: 1, stores: { days: [{ date: '2026-11-10' }] } });
  const second = JSON.stringify({ app: 'fittrack', format: 1, stores: { days: [{ date: '2026-11-10' }, { date: '2026-11-11' }] } });

  const put = await call(env, 'PUT', '/backup', { body: first });
  assert.equal(put.status, 200);
  assert.equal((await put.json()).bytes, first.length);
  assert.equal(await (await call(env, 'GET', '/backup')).text(), first);

  await call(env, 'PUT', '/backup', { body: second });
  assert.equal(await (await call(env, 'GET', '/backup')).text(), second);
  assert.equal(env.KV.data.get('backup:previous').value, first);

  const info = await (await call(env, 'GET', '/backup/info')).json();
  assert.equal(info.latest.bytes, second.length);
  assert.equal(info.previous.bytes, first.length);
  assert.match(info.latest.savedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('anything that is not a Fitness Tracker backup is refused', async () => {
  const env = makeEnv();
  assert.equal((await call(env, 'PUT', '/backup', { body: 'not json' })).status, 400);
  assert.equal((await call(env, 'PUT', '/backup', { body: '{"app":"other"}' })).status, 400);
  assert.equal(env.KV.data.has('backup:latest'), false);
  assert.equal((await call(env, 'GET', '/nope')).status, 404);
});
