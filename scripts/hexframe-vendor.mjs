// The Hexframe rig core, fighter data and part art that RigLab vendors byte-for-byte, and the lock that pins them.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export const VENDOR_DIR = 'vendor/hexframe';
export const LOCK_FILE = 'lock.json';
export const SOURCE_REPOSITORY = 'Wizard-Gang/Hexframe';

const CLIPS = [
  'crouch', 'crouchGuard', 'jump', 'labGuard', 'labIdle', 'labOverhead', 'labStagger',
  'labStrike', 'labWalk', 'labWave', 'launched', 'sweep', 'uppercut',
];

const PARTS = [
  'arm_lower_l', 'arm_lower_r', 'arm_upper_l', 'arm_upper_r', 'head', 'leg_lower_l',
  'leg_lower_r', 'leg_upper_l', 'leg_upper_r', 'pelvis', 'torso',
];

// Paths are Hexframe repository paths; the vendored copy mirrors them under vendor/hexframe/.
export const VENDORED_PATHS = Object.freeze([
  ...['clip-types', 'depth', 'fk', 'index', 'paint-order', 'rig', 'sample', 'types'].map((name) => `src/rig/${name}.ts`),
  'characters/fighter/fighter.rig.json',
  ...CLIPS.map((name) => `characters/fighter/clips/${name}.json`),
  ...PARTS.map((name) => `characters/fighter/parts/${name}.svg`),
].sort());

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function makeLock(commit, files) {
  return {
    source: SOURCE_REPOSITORY,
    commit,
    files: Object.fromEntries(Object.keys(files).sort().map((path) => [path, sha256(files[path])])),
  };
}

function listFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

/** Compare the vendored tree with its lock: exact path set, exact bytes, and a full source commit. */
export function validateVendorAt(root) {
  const dir = join(root, VENDOR_DIR);
  const lockPath = join(dir, LOCK_FILE);
  if (!existsSync(lockPath)) return [`${VENDOR_DIR}/${LOCK_FILE} is missing`];
  let lock;
  try {
    lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  } catch {
    return [`${VENDOR_DIR}/${LOCK_FILE} is not valid JSON`];
  }
  const failures = [];
  if (lock.source !== SOURCE_REPOSITORY) failures.push(`lock source must be ${SOURCE_REPOSITORY}`);
  if (!/^[0-9a-f]{40}$/.test(lock.commit ?? '')) failures.push('lock commit must be a full Hexframe commit SHA');
  const locked = Object.keys(lock.files ?? {}).sort();
  if (locked.join('\n') !== VENDORED_PATHS.join('\n')) failures.push('lock must pin exactly the vendored Hexframe paths');
  const present = listFiles(dir).map((path) => relative(dir, path)).filter((path) => path !== LOCK_FILE).sort();
  for (const path of present) {
    if (!Object.hasOwn(lock.files ?? {}, path)) failures.push(`unpinned vendored file: ${path}`);
  }
  for (const path of locked) {
    const file = join(dir, path);
    if (!existsSync(file)) failures.push(`pinned vendored file is missing: ${path}`);
    else if (sha256(readFileSync(file)) !== lock.files[path]) failures.push(`vendored file differs from its pin: ${path}`);
  }
  return failures;
}
