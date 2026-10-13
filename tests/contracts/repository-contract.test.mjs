import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  REPOSITORY, validatePackage, validateRepositoryAt, validateRepositoryContract, validateTrackedFiles,
} from '../../scripts/repository-contract.mjs';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const current = () => ({
  ci: read('.github/workflows/ci.yml'),
  release: read('.github/workflows/release.yml'),
  cutter: read('.github/workflows/release-cutter.yml'),
  pkg: JSON.parse(read('package.json')),
  lock: JSON.parse(read('package-lock.json')),
  provider: JSON.parse(read('config/github-repository-settings.json')),
});
const failuresWith = (change) => {
  const state = current();
  change(state);
  return validateRepositoryContract(state).join('\n');
};

test('the committed repository satisfies its own contract', () => {
  assert.deepEqual(validateRepositoryAt(new URL('.', root).pathname, ['README.md', '.env.example']), []);
  assert.equal(JSON.parse(read('config/github-repository-settings.json')).repository, REPOSITORY);
});

test('npm start runs the dev server and check stays credential-free and offline', () => {
  assert.match(failuresWith((state) => { state.pkg.scripts.start = 'vite'; }), /npm start must run the local dev server/);
  assert.match(failuresWith((state) => { state.pkg.scripts.check += ' && npm run audit:dependencies'; }), /credential-free and offline/);
  assert.match(failuresWith((state) => { state.pkg.scripts.check += ' && npm run verify:github-settings'; }), /credential-free and offline/);
  assert.match(failuresWith((state) => { delete state.pkg.scripts.dev; }), /missing package script dev/);
  assert.match(failuresWith((state) => { state.pkg.scripts.dev = 'vite'; }), /managed local development lifecycle/);
});

test('RigLab never deploys', () => {
  assert.match(failuresWith((state) => { state.pkg.scripts.ship = 'wrangler deploy'; }), /must never deploy/);
  assert.match(failuresWith((state) => { state.pkg.devDependencies.wrangler = '4.147.0'; }), /must not depend on wrangler/);
  assert.match(failuresWith((state) => {
    state.release = state.release.replace('    runs-on: ubuntu-latest', '    environment: production\n    runs-on: ubuntu-latest');
  }), /workflows must never deploy/);
});

test('dependencies are exact pins and versions agree', () => {
  assert.match(validatePackage({ ...current().pkg, dependencies: { react: '^19.3.0' } }, current().lock).join('\n'),
    /dependencies react must pin an exact version/);
  assert.match(failuresWith((state) => { state.lock.version = '9.9.9'; }), /package-lock version must match/);
  assert.match(failuresWith((state) => { state.pkg.packageManager = 'npm@11.0.0'; }), /Node 26\/npm 12 baseline/);
});

test('CI keeps the three required jobs on the exact head with a read-only token', () => {
  assert.match(failuresWith((state) => { state.ci = state.ci.replace('  security:', '  audit:'); }), /verify, change-id, security/);
  assert.match(failuresWith((state) => { state.ci = state.ci.replace('contents: read', 'contents: write'); }), /read-only/);
  assert.match(failuresWith((state) => {
    state.ci = state.ci.replace('run: npm run check:change', 'run: echo skipped');
  }), /change-id must validate exact PR identity/);
  assert.match(failuresWith((state) => {
    state.ci = state.ci.replace(/actions\/checkout@[0-9a-f]{40}/, 'actions/checkout@v7');
  }), /pinned to a full commit SHA/);
});

test('release path reproduces, attests and never moves a tag', () => {
  assert.match(failuresWith((state) => { state.release = state.release.replace('gzip -n', 'gzip'); }), /omit gzip timestamp/);
  assert.match(failuresWith((state) => { state.release = state.release.replaceAll('dist/riglab-', 'dist/other-'); }), /riglab-vX\.Y\.Z/);
  assert.match(failuresWith((state) => {
    state.cutter = state.cutter.replace('[ "$release_sha" != "$VALIDATED_SHA" ]', 'false');
  }), /older same-version tags untouched/);
});

test('provider policy is squash-only, current-with-main and bypass-free', () => {
  assert.match(failuresWith((state) => { state.provider.mergeMethods.rebase = true; }), /squash-only baseline/);
  assert.match(failuresWith((state) => { state.provider.immutableReleases = false; }), /immutable Releases/);
  assert.match(failuresWith((state) => { state.provider.rulesets[0].bypassActors = [{ actor_id: 1 }]; }), /no bypass actors/);
  assert.match(failuresWith((state) => { state.provider.requiredStatusChecks = ['verify']; }), /match CI job names/);
  assert.match(failuresWith((state) => { state.provider.repository = 'Wizard-Gang/baseline'; }), /squash-only baseline/);
});

test('RigLab stays React and TypeScript: no Rust, Cargo or Tauri files, dependencies or scripts', () => {
  assert.deepEqual(validateTrackedFiles(['src/app/App.tsx', 'scripts/check-vendor.mjs', 'docs/rust-free.md']), []);
  assert.equal(validateTrackedFiles([
    'src-tauri/src/main.rs', 'Cargo.toml', 'src-tauri/Cargo.lock', 'rust-toolchain.toml', 'tauri.conf.json', 'tools/build.rs',
  ]).length, 6);
  assert.match(validateTrackedFiles(['Cargo.toml']).join('\n'), /React and TypeScript only; native toolchain file is tracked: Cargo\.toml/);
  assert.match(failuresWith((state) => { state.pkg.devDependencies['@tauri-apps/cli'] = '2.9.0'; }), /must not include @tauri-apps\/cli/);
  assert.match(failuresWith((state) => { state.pkg.scripts.desktop = 'tauri dev'; }), /package script desktop must not run a native toolchain/);
});

test('credential-bearing files are never tracked', () => {
  assert.deepEqual(validateTrackedFiles(['.env.example', 'src/app/App.tsx']), []);
  assert.equal(validateTrackedFiles(['.env', 'config/.env.local', 'keys/signing.pem', 'id_rsa']).length, 4);
});
