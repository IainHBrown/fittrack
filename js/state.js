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

/** Save one value by path, e.g. setSetting('sleep.goal', 85). */
export async function setSetting(path, value) {
  const keys = path.split('.');
  let node = saved;
  for (const k of keys.slice(0, -1)) {
    if (!isObj(node[k])) node[k] = {};
    node = node[k];
  }
  node[keys.at(-1)] = value;
  merged = mergeSettings(DEFAULTS, saved);
  await kvSet('settings', saved);
}
