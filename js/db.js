// IndexedDB wrapper. All data lives on the phone.
// Stores so far:
//   kv    - single values by key (settings live under "settings")
//   days  - one record per local date: { date, sleep, water[], supps{}, ... }

//   logs  - every logged session or other activity: { id, date, sessionId, sport, ... }
//   overrides - changes to planned sessions by session id: { id, status, movedTo, easy, swap }

const DB_NAME = 'fittrack';
//   exercises - the exercise library: { id, name, group, type, increment?, repUnit?, archived? }
//   stretches - your stretches: { id, name, category, notes, photo (compressed JPEG data URL) }

//   foods - the quick-add food list: { id, group, name, note, cal, protein, carbs, fat }
// Meals you log are stored on the day record (days[date].meals).

const DB_VERSION = 4;

let dbPromise = null;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if (!db.objectStoreNames.contains('days')) db.createObjectStore('days', { keyPath: 'date' });
        if (!db.objectStoreNames.contains('logs')) db.createObjectStore('logs', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('overrides')) db.createObjectStore('overrides', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('exercises')) db.createObjectStore('exercises', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('stretches')) db.createObjectStore('stretches', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('foods')) db.createObjectStore('foods', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function request(store, mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}

export const kvGet = (key) => request('kv', 'readonly', (s) => s.get(key));
export const kvSet = (key, value) => request('kv', 'readwrite', (s) => s.put(value, key));

/** A blank day record. */
export function emptyDay(date) {
  return { date, sleep: null, water: [], supps: {}, suppList: null, meals: [] };
}

export async function getDay(date) {
  const rec = await request('days', 'readonly', (s) => s.get(date));
  return { ...emptyDay(date), ...(rec || {}) };
}

export const putDay = (day) => request('days', 'readwrite', (s) => s.put(day));

/** All saved days with from <= date <= to, oldest first. */
export const getDays = (from, to) =>
  request('days', 'readonly', (s) => s.getAll(IDBKeyRange.bound(from, to)));

/** Read, change and save one day in a single step. */
export async function updateDay(date, change) {
  const day = await getDay(date);
  change(day);
  await putDay(day);
  return day;
}

// ---------- training logs ----------

export const getLogs = () => request('logs', 'readonly', (s) => s.getAll());
export const putLog = (log) => request('logs', 'readwrite', (s) => s.put(log));
export const deleteLog = (id) => request('logs', 'readwrite', (s) => s.delete(id));
export const newId = (prefix) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// ---------- generic helpers for simple keyed stores (exercises, stretches) ----------

export const getAll = (store) => request(store, 'readonly', (s) => s.getAll());
export const putItem = (store, item) => request(store, 'readwrite', (s) => s.put(item));
export const deleteItem = (store, id) => request(store, 'readwrite', (s) => s.delete(id));

// ---------- plan overrides (skip, move, make easy, swap) ----------

/** All overrides as an object keyed by session id. */
export async function getOverrides() {
  const all = await request('overrides', 'readonly', (s) => s.getAll());
  return Object.fromEntries(all.map((o) => [o.id, o]));
}

/** Merge a change into one session's override; null values remove that key. */
export async function setOverride(id, patch) {
  const cur = (await request('overrides', 'readonly', (s) => s.get(id))) || { id };
  for (const [k, v] of Object.entries(patch)) {
    if (v == null) delete cur[k]; else cur[k] = v;
  }
  if (Object.keys(cur).length <= 1) return request('overrides', 'readwrite', (s) => s.delete(id));
  return request('overrides', 'readwrite', (s) => s.put(cur));
}

/** Ask the browser not to evict our data when storage is tight. */
export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist();
  } catch { /* not supported */ }
  return false;
}
