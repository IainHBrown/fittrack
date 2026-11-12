// Collecting and applying backups (used by file export/import and cloud backup).

import { dumpAll, restoreAll, kvGet } from './db.js';
import { makeBackup } from './logic/backup.js';
import { VERSION } from './version.js';

// These stay on this device: they are never put in a backup, and a restore
// never overwrites them. (The cloud passphrase must not travel in backups.)
export const LOCAL_ONLY = ['cloudSecret', 'lastCloudBackup', 'lastExport', 'cloudPending', 'pushOn', 'pushStateHash'];

/** Everything in the app as a backup object, minus device-only values. */
export async function collectBackup() {
  const stores = await dumpAll();
  stores.kv = stores.kv.filter((item) => !LOCAL_ONLY.includes(item.key));
  return makeBackup(stores, new Date(), VERSION);
}

/** Replace the app's data with a checked backup, keeping device-only values. */
export async function applyBackup(stores) {
  const keep = [];
  for (const key of LOCAL_ONLY) {
    const value = await kvGet(key);
    if (value != null) keep.push({ key, value });
  }
  const kv = (stores.kv || []).filter((item) => !LOCAL_ONLY.includes(item.key));
  await restoreAll({ ...stores, kv: [...kv, ...keep] });
}

/** A rough size of what is stored, to compare this device with a cloud backup. */
export function dataWeight(stores) {
  return (stores.days || []).length + (stores.logs || []).length;
}
