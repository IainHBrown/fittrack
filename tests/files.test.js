// Guards the offline cache: if the service worker lists a file that does not
// exist, installation fails on the phone; if a file is missing from the list,
// it will not work offline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
const listed = [...sw.match(/const FILES = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);

function walk(dir) {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const rel = `${dir}/${name}`;
    return statSync(join(root, rel)).isDirectory() ? walk(rel) : [rel];
  });
}

test('every file the service worker caches exists', () => {
  for (const f of listed.filter((f) => f !== './')) assert.ok(existsSync(join(root, f)), `missing: ${f}`);
});

test('every app file is in the service worker cache list', () => {
  const needed = ['index.html', 'manifest.webmanifest', ...walk('css'), ...walk('js'), ...walk('assets')];
  for (const f of needed) assert.ok(listed.includes(f), `not cached for offline use: ${f}`);
});
