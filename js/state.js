// Settings: saved values layered over DEFAULTS, cached in memory.

import { DEFAULTS } from './defaults.js';
import { kvGet, kvSet } from './db.js';

let saved = {};
let merged = structuredClone(DEFAULTS);

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

/** Deep-merge saved values over defaults. Arrays are replaced whole. */
export function mergeSettings(defaults, over) {
  const out = structuredClone(defaults);
  for (const [k, v] of Object.entries(over || {})) {
    out[k] = isObj(v) && isObj(out[k]) ? mergeSettings(out[k], v) : structuredClone(v);
  }
  return out;
}

export async function loadSettings() {
  saved = (await kvGet('settings')) || {};
  merged = mergeSettings(DEFAULTS, saved);
  return merged;
}

/** Current settings (read-only; change them with setSetting). */
export const settings = () => merged;

// ---------- dotted paths, e.g. "plan.knee.painThreshold" ----------

export function pathGet(obj, path) {
  let node = obj;
  for (const k of path.split('.')) {
    if (node == null) return undefined;
    node = node[k];
  }
  return node;
}

export function pathSet(obj, path, value) {
  const keys = path.split('.');
  let node = obj;
  for (const k of keys.slice(0, -1)) {
    if (!isObj(node[k])) node[k] = {};
    node = node[k];
  }
  node[keys.at(-1)] = value;
}

/** Remove a value, and any parent objects left empty by removing it. */
export function pathDelete(obj, path) {
  const keys = path.split('.');
  const chain = [obj];
  for (const k of keys.slice(0, -1)) {
    const next = chain.at(-1)[k];
    if (!isObj(next)) return;
    chain.push(next);
  }
  delete chain.at(-1)[keys.at(-1)];
  for (let i = chain.length - 1; i > 0; i--) {
    if (Object.keys(chain[i]).length === 0) delete chain[i - 1][keys[i - 1]];
  }
}

/** Save one value by path, e.g. setSetting('sleep.goal', 85). */
export async function setSetting(path, value) {
  pathSet(saved, path, value);
  merged = mergeSettings(DEFAULTS, saved);
  await kvSet('settings', saved);
}

/** Put one or more values back to their defaults. */
export async function resetSettings(paths) {
  for (const p of paths) pathDelete(saved, p);
  merged = mergeSettings(DEFAULTS, saved);
  await kvSet('settings', saved);
}

/** The built-in default for a path (shown as a hint, and used by "reset"). */
export const defaultFor = (path) => pathGet(DEFAULTS, path);
