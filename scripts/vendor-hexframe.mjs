#!/usr/bin/env node
// Re-vendor the Hexframe rig core and fighter data from one exact commit of a local Hexframe checkout:
//   npm run vendor:hexframe -- <hexframe-checkout> <full-commit-sha>
// Files come from the commit's Git objects, never the checkout's working tree.
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCK_FILE, VENDOR_DIR, VENDORED_PATHS, makeLock, validateVendorAt } from './hexframe-vendor.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [checkout, commit] = process.argv.slice(2);
if (!checkout || !/^[0-9a-f]{40}$/.test(commit ?? '')) {
  console.error('usage: npm run vendor:hexframe -- <hexframe-checkout> <full-commit-sha>');
  process.exit(2);
}
const show = (path) => execFileSync('git', ['-C', checkout, 'show', `${commit}:${path}`], { maxBuffer: 1 << 24 });
const files = Object.fromEntries(VENDORED_PATHS.map((path) => [path, show(path)]));
const dir = join(root, VENDOR_DIR);
rmSync(dir, { recursive: true, force: true });
for (const [path, bytes] of Object.entries(files)) {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), bytes);
}
writeFileSync(join(dir, LOCK_FILE), `${JSON.stringify(makeLock(commit, files), null, 2)}\n`);
const failures = validateVendorAt(root);
if (failures.length) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exit(1);
}
console.log(`Vendored ${VENDORED_PATHS.length} Hexframe files from ${commit}.`);
