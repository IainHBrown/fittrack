// Talks to the Cloudflare Worker: photo food estimates and cloud backup.
// The Worker address is a setting; the passphrase is stored only on this
// device and sent as a Bearer token. Nothing here works offline, by design.

import { settings } from './state.js';
import { kvGet, kvSet, dumpAll } from './db.js';
import { collectBackup, dataWeight } from './backup-service.js';
import { checkBackup } from './logic/backup.js';

export class CloudError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

export async function cloudConfig() {
  const c = settings().cloud;
  const secret = (await kvGet('cloudSecret')) || '';
  const url = (c.url || '').trim().replace(/\/+$/, '');
  return { url, secret, ready: !!(url && secret) };
}

export async function cloudCall(path, { method = 'GET', body = null, raw = false } = {}) {
  const cfg = await cloudConfig();
  if (!cfg.ready) throw new CloudError('setup', 'Cloud features are not set up yet. Add the Worker address and passphrase in Me, Settings, Backup.');
  if (navigator.onLine === false) throw new CloudError('offline', "You're offline. This needs an internet connection.");
  let res;
  try {
    res = await fetch(cfg.url + path, {
      method, body,
      headers: { Authorization: `Bearer ${cfg.secret}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    });
  } catch {
    throw new CloudError('network', 'Could not reach the Worker. Check the address and your connection.');
  }
  if (res.ok && raw) return res.text();
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new CloudError(res.status === 401 ? 'secret' : 'server',
      res.status === 401 ? 'The passphrase does not match the Worker.' : data.error || `The Worker answered with error ${res.status}.`);
  }
  return data;
}

const call = cloudCall;

export const ping = () => call('/ping');

/** Rough nutrition for a meal photo (a JPEG data URL). */
export const estimatePhoto = (dataUrl) => call('/estimate', { method: 'POST', body: JSON.stringify({ image: dataUrl }) });

/** { latest: {savedAt, bytes} | null, previous: ... } */
export const cloudInfo = () => call('/backup/info');

export async function backupNow() {
  const res = await call('/backup', { method: 'PUT', body: JSON.stringify(await collectBackup()) });
  await kvSet('lastCloudBackup', { at: res.savedAt, bytes: res.bytes });
  await kvSet('cloudPending', null);
  return res;
}

/** Download and check the latest cloud backup (does not apply it). */
export async function fetchCloudBackup() {
  let data;
  try { data = JSON.parse(await call('/backup', { raw: true })); } catch (e) {
    if (e instanceof CloudError) throw e;
    throw new CloudError('server', 'The cloud backup could not be read.');
  }
  const res = checkBackup(data);
  if (!res.ok) throw new CloudError('server', res.error);
  return res;
}

let lastCheck = 0;
let running = false;

/**
 * Called after the app changes data. Uploads a backup when one is due.
 * Safety: the first time this device is connected, if the cloud already holds
 * a backup, nothing is uploaded until you choose to restore it or to replace
 * it. That stops a fresh install from overwriting a good backup.
 */
export async function maybeAutoBackup() {
  const c = settings().cloud;
  if (!c.autoBackup || running || Date.now() - lastCheck < 60000) return;
  lastCheck = Date.now();
  running = true;
  try {
    const cfg = await cloudConfig();
    if (!cfg.ready || navigator.onLine === false) return;
    if (await kvGet('cloudPending')) return;
    const last = await kvGet('lastCloudBackup');
    if (!last) {
      const info = await cloudInfo();
      if (info.latest) { await kvSet('cloudPending', info.latest); return; }
      if (dataWeight(await dumpAll()) === 0) return; // nothing worth saving yet
      await backupNow();
      return;
    }
    if (Date.now() - new Date(last.at).getTime() >= c.backupEveryHours * 3600000) await backupNow();
  } catch { /* try again next time; the Backup page shows the last success */ } finally {
    running = false;
  }
}
