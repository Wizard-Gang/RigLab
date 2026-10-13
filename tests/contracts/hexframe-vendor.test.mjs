import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { VENDOR_DIR, VENDORED_PATHS, makeLock, sha256, validateVendorAt } from '../../scripts/hexframe-vendor.mjs';

const root = new URL('../../', import.meta.url).pathname;
const fixtures = [];

function copy() {
  const dir = mkdtempSync(join(tmpdir(), 'riglab-vendor-'));
  fixtures.push(dir);
  cpSync(join(root, VENDOR_DIR), join(dir, VENDOR_DIR), { recursive: true });
  return dir;
}

test('the committed vendor tree matches its Hexframe pin', () => {
  assert.deepEqual(validateVendorAt(root), []);
  const lock = JSON.parse(readFileSync(join(root, VENDOR_DIR, 'lock.json'), 'utf8'));
  assert.equal(lock.source, 'Wizard-Gang/Hexframe');
  assert.match(lock.commit, /^[0-9a-f]{40}$/);
  assert.deepEqual(Object.keys(lock.files), [...VENDORED_PATHS]);
  assert.ok(VENDORED_PATHS.every((path) => path.startsWith('src/rig/')), 'only the rig engine is vendored: no characters, clips or art');
});

test('an edited, missing or unpinned vendored file fails', () => {
  const edited = copy();
  writeFileSync(join(edited, VENDOR_DIR, 'src/rig/fk.ts'), '// local fork\n', { flag: 'a' });
  assert.match(validateVendorAt(edited).join('\n'), /differs from its pin: src\/rig\/fk\.ts/);

  const missing = copy();
  rmSync(join(missing, VENDOR_DIR, 'src/rig/sample.ts'));
  assert.match(validateVendorAt(missing).join('\n'), /pinned vendored file is missing/);

  const extra = copy();
  writeFileSync(join(extra, VENDOR_DIR, 'src/rig/ik.ts'), 'export {};\n');
  assert.match(validateVendorAt(extra).join('\n'), /unpinned vendored file: src\/rig\/ik\.ts/);
});

test('the lock names its full source commit and exact path set', () => {
  const dir = copy();
  const lockPath = join(dir, VENDOR_DIR, 'lock.json');
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  writeFileSync(lockPath, JSON.stringify({ ...lock, commit: '5b6e4f1' }));
  assert.match(validateVendorAt(dir).join('\n'), /full Hexframe commit SHA/);
  const files = Object.fromEntries(VENDORED_PATHS.slice(1).map((path) => [path, Buffer.from(path)]));
  assert.match(validateVendorAt(dir).join('\n'), /full Hexframe commit SHA/);
  assert.equal(makeLock('a'.repeat(40), files).files[VENDORED_PATHS[1]], sha256(Buffer.from(VENDORED_PATHS[1])));
});

after(() => { for (const dir of fixtures) rmSync(dir, { recursive: true, force: true }); });
