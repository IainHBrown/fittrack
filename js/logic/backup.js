// Backup file format and checks. Pure, so it is covered by tests.

export const BACKUP_APP = 'fittrack';
export const BACKUP_FORMAT = 1;
const STORES = ['kv', 'days', 'logs', 'overrides', 'exercises', 'stretches', 'foods'];
const KEYED = { days: 'date', logs: 'id', overrides: 'id', exercises: 'id', stretches: 'id', foods: 'id' };

/** Wrap a dump of the stores as a backup file. */
export function makeBackup(stores, now = new Date(), version = '') {
  return { app: BACKUP_APP, format: BACKUP_FORMAT, appVersion: version, exportedAt: now.toISOString(), stores };
}

/**
 * Check a parsed backup file.
 * @returns {{ok:true, stores:object, summary:object} | {ok:false, error:string}}
 */
export function checkBackup(data) {
  if (!data || typeof data !== 'object' || data.app !== BACKUP_APP) {
    return { ok: false, error: 'This is not a Fitness Tracker backup file.' };
  }
  if (!(data.format >= 1) || data.format > BACKUP_FORMAT) {
    return { ok: false, error: 'This backup was made by a newer version of the app. Update the app, then try again.' };
  }
  const src = data.stores;
  if (!src || typeof src !== 'object') return { ok: false, error: 'The backup file has no data in it.' };

  const stores = {};
  for (const name of STORES) {
    const list = src[name] == null ? [] : src[name];
    if (!Array.isArray(list)) return { ok: false, error: `The backup file is damaged (${name}).` };
    for (const item of list) {
      const good = item && typeof item === 'object'
        && (name === 'kv' ? typeof item.key === 'string' : typeof item[KEYED[name]] === 'string' && item[KEYED[name]] !== '');
      if (!good) return { ok: false, error: `The backup file is damaged (${name}).` };
    }
    stores[name] = list;
  }
  return {
    ok: true,
    stores,
    summary: {
      exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : null,
      days: stores.days.length,
      logs: stores.logs.length,
      exercises: stores.exercises.length,
      stretches: stores.stretches.length,
      foods: stores.foods.length,
    },
  };
}

/** "fittrack-backup-2026-11-11.json" */
export const backupFileName = (dayKey) => `fittrack-backup-${dayKey}.json`;
