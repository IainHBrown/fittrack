// IndexedDB wrapper. All data lives on the phone.
// Stores so far:
//   kv    - single values by key (settings live under "settings")
//   days  - one record per local date: { date, sleep, water[], supps{}, ... }

const DB_NAME = 'fittrack';
const DB_VERSION = 1;

let dbPromise = null;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if (!db.objectStoreNames.contains('days')) db.createObjectStore('days', { keyPath: 'date' });
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
  return { date, sleep: null, water: [], supps: {}, suppList: null };
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

/** Ask the browser not to evict our data when storage is tight. */
export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist();
  } catch { /* not supported */ }
  return false;
}
