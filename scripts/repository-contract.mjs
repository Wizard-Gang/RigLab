import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { block, keys } from './workflow-yaml.mjs';

function requireMatch(failures, name, source, pattern) {
  if (!pattern.test(source ?? '')) failures.push(name);
}

function sameSet(actual, expected) {
  return actual.length === expected.length && expected.every((entry) => actual.includes(entry));
}

export const REPOSITORY = 'Wizard-Gang/RigLab';

// RigLab is a local-first authoring application: CI, a release cutter and a source release, never a deployment.
export const WORKFLOWS = Object.freeze(['ci.yml', 'release-cutter.yml', 'release.yml']);

export const REQUIRED_SCRIPTS = Object.freeze([
  'start', 'dev', 'build', 'typecheck', 'test', 'check', 'check:change', 'check:release', 'check:patch',
  'check:repository', 'check:vendor', 'check:workflow-shell', 'test:contracts', 'test:plan-queue',
  'test:github-settings', 'verify:github-settings', 'apply:github-settings', 'audit:dependencies',
]);

// Provider, network and mutation commands stay outside the credential-free acceptance gate.
const OUTSIDE_CHECK = /audit|verify:github-settings|apply:github-settings|GH_ADMIN_TOKEN|GH_TOKEN/;

// A public repository never tracks credential-bearing files.
const CREDENTIAL_FILE = /(^|\/)(\.env(\..*)?|\.dev\.vars(\..*)?|id_rsa|id_ed25519)$|\.(pem|key|p12|pfx)$/;

// RigLab is React and TypeScript only: no Rust, Cargo or Tauri sources, toolchains or shells.
const NATIVE_TOOLCHAIN_FILE = /(^|\/)(src-tauri\/.*|Cargo\.(toml|lock)|rust-toolchain(\.toml)?|tauri\.conf\.json5?)$|\.rs$/;
const NATIVE_TOOLCHAIN_PACKAGE = /^@tauri-apps\/|^tauri$/;

export function validateTrackedFiles(paths) {
  return [
    ...paths.filter((path) => CREDENTIAL_FILE.test(path) && !path.endsWith('.env.example'))
      .map((path) => `credential-bearing file is tracked: ${path}`),
    ...paths.filter((path) => NATIVE_TOOLCHAIN_FILE.test(path))
      .map((path) => `RigLab is React and TypeScript only; native toolchain file is tracked: ${path}`),
  ];
}

export function validatePackage(pkg, lock) {
  const failures = [];
  if (!/^\d+\.\d+\.\d+$/.test(pkg.version ?? '')) failures.push('package.json owns a semantic version');
  if (pkg.private !== true) failures.push('application package must be private to npm publication');
  if (pkg.packageManager !== 'npm@12.1.0' || pkg.engines?.node !== '26.x' || pkg.engines?.npm !== '12.x') {
    failures.push('packageManager and engines must match the shared Node 26/npm 12 baseline');
  }
  if (lock?.version !== pkg.version || lock?.packages?.['']?.version !== pkg.version) {
    failures.push('package-lock version must match package.json');
  }
  for (const name of REQUIRED_SCRIPTS) {
    if (!pkg.scripts?.[name]) failures.push(`missing package script ${name}`);
  }
  if (pkg.scripts?.start !== 'npm run dev') failures.push('npm start must run the local dev server through npm run dev');
  if (pkg.scripts?.dev !== 'node scripts/dev.mjs') {
    failures.push('npm run dev must run the managed local development lifecycle, node scripts/dev.mjs');
  }
  if (pkg.scripts?.['audit:dependencies'] !== 'npm audit --audit-level=high') {
    failures.push('dependency advisory gate must fail on high-severity advisories');
  }
  if (OUTSIDE_CHECK.test(pkg.scripts?.check ?? '')) {
    failures.push('npm run check must stay credential-free and offline');
  }
  for (const [name, script] of Object.entries(pkg.scripts ?? {})) {
    if (/wrangler|deploy/.test(script)) failures.push(`package script ${name} must never deploy`);
    if (/\b(tauri|cargo|rustc|rustup)\b/.test(script)) failures.push(`RigLab is React and TypeScript only; package script ${name} must not run a native toolchain`);
  }
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    if (pkg[field]?.wrangler) failures.push('RigLab must not depend on wrangler');
    for (const [name, version] of Object.entries(pkg[field] ?? {})) {
      if (!/^\d+\.\d+\.\d+$/.test(version)) failures.push(`${field} ${name} must pin an exact version`);
      if (NATIVE_TOOLCHAIN_PACKAGE.test(name)) failures.push(`RigLab is React and TypeScript only; ${field} must not include ${name}`);
    }
  }
  return failures;
}

function validateCi(ci, failures) {
  const ciEvents = keys(block(ci, 'on'), 2);
  if (!sameSet(ciEvents, ['pull_request', 'push'])) failures.push('CI must trigger only on PR and main push');
  requireMatch(failures, 'CI must rerun when PR title or body is edited', block(ci, 'pull_request', 2), /types: \[[^\]]*edited[^\]]*\]/);
  requireMatch(failures, 'CI push target must be main', block(ci, 'push', 2), /^    branches: \[main\]$/m);
  if (block(ci, 'permissions')?.trim() !== 'contents: read') failures.push('CI default token must be read-only');
  requireMatch(failures, 'CI must cancel only in-progress PR runs', block(ci, 'concurrency'), /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/);
  const ciJobs = keys(block(ci, 'jobs'), 2);
  if (!sameSet(ciJobs, ['verify', 'change-id', 'security'])) failures.push('CI must expose verify, change-id, security required jobs');
  for (const job of ciJobs) {
    const contents = block(ci, job, 2);
    requireMatch(failures, `${job} must check out the exact PR head`, contents,
      /ref: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
    if (block(contents, 'permissions', 4)) failures.push(`${job} must not broaden token permissions`);
  }
  requireMatch(failures, 'verify must run the complete local contract', block(ci, 'verify', 2), /run: npm run check/);
  requireMatch(failures, 'verify must check the committed PR patch', block(ci, 'verify', 2), /run: npm run check:patch/);
  requireMatch(failures, 'change-id must validate exact PR identity', block(ci, 'change-id', 2), /run: npm run check:change/);
  requireMatch(failures, 'security must run the dependency advisory gate', block(ci, 'security', 2), /run: npm run audit:dependencies/);
  return ciJobs;
}

function validateRelease(release, failures) {
  const releaseEvents = keys(block(release, 'on'), 2);
  if (!sameSet(releaseEvents, ['push', 'workflow_dispatch'])) failures.push('Release must trigger from tag pushes or explicit cutter dispatch');
  requireMatch(failures, 'Release must use tag push trigger', block(release, 'push', 2), /tags: \['v\*'\]/);
  requireMatch(failures, 'Release dispatch must bind accepted commit', block(release, 'workflow_dispatch', 2), /expected_sha:/);
  requireMatch(failures, 'Release must preserve tag ref for attestation', release, /\[\[ "\$GITHUB_REF" == "refs\/tags\/\$GITHUB_REF_NAME" \]\]/);
  requireMatch(failures, 'Release must compare dispatched commit', release, /\[ "\$\(git rev-parse HEAD\)" = "\$EXPECTED_SHA" \]/);
  if (block(release, 'permissions')?.trim() !== 'contents: read') failures.push('Release default token must be read-only');
  requireMatch(failures, 'Release must serialize by tag', block(release, 'concurrency'), /group: release-\$\{\{ github\.ref \}\}/);
  requireMatch(failures, 'Release must not cancel publication', block(release, 'concurrency'), /cancel-in-progress: false/);
  if (!sameSet(keys(block(release, 'jobs'), 2), ['reproduce', 'publish'])) failures.push('Release must reproduce before publication');
  const reproduce = block(release, 'reproduce', 2);
  const publish = block(release, 'publish', 2);
  requireMatch(failures, 'Release verification must test source and advisories', reproduce,
    /run: npm run check[\s\S]*run: npm run audit:dependencies/);
  requireMatch(failures, 'Release verification must check annotated tag', reproduce, /check:release -- identity --tag/);
  requireMatch(failures, 'Release archive must omit gzip timestamp', reproduce, /git archive[^\n]+\| gzip -n/);
  requireMatch(failures, 'Release archive must be named riglab-vX.Y.Z', reproduce, /archive="dist\/riglab-\$GITHUB_REF_NAME\.tar\.gz"/);
  requireMatch(failures, 'Publication must depend on reproduction', publish, /needs: reproduce/);
  for (const permission of ['contents: write', 'id-token: write', 'attestations: write']) {
    if (!block(publish, 'permissions', 4)?.includes(permission)) failures.push(`publication requires scoped ${permission}`);
  }
  requireMatch(failures, 'Publication must compare clean-job archive digests', publish, /EXPECTED_SHA256[\s\S]*test "\$actual" = "\$EXPECTED_SHA256"/);
  requireMatch(failures, 'Publication must generate a GitHub attestation', publish, /uses: actions\/attest@[0-9a-f]{40}/);
  requireMatch(failures, 'Publication must verify artifact attestation', publish, /check-release\.mjs attestation/);
  requireMatch(failures, 'Publication must reconcile release state', publish, /scripts\/publish-release\.mjs/);
}

function validateCutter(cutter, failures) {
  if (!sameSet(keys(block(cutter, 'on'), 2), ['workflow_run'])) failures.push('Release Cutter must follow CI workflow_run only');
  requireMatch(failures, 'Release Cutter must require successful main push CI', cutter,
    /workflow_run\.conclusion == 'success'[\s\S]*workflow_run\.event == 'push'[\s\S]*workflow_run\.head_branch == 'main'/);
  requireMatch(failures, 'Release Cutter must check exact current main', cutter, /git rev-parse origin\/main/);
  requireMatch(failures, 'Release Cutter must create an annotated exact-head tag', cutter, /git tag -a "\$tag" "\$VALIDATED_SHA"/);
  requireMatch(failures, 'Release Cutter must leave older same-version tags untouched', cutter, /\[ "\$release_sha" != "\$VALIDATED_SHA" \]/);
  requireMatch(failures, 'Release Cutter must dispatch the exact tag and commit', cutter,
    /gh workflow run release\.yml --ref "\$RELEASE_TAG" -f expected_sha="\$EXPECTED_SHA"/);
  for (const permission of ['contents: write', 'actions: write']) {
    if (!block(cutter, 'permissions')?.includes(permission)) failures.push(`Release Cutter requires scoped ${permission}`);
  }
}

function validateProvider(provider, ciJobs, failures) {
  if (!sameSet(provider?.requiredStatusChecks ?? [], ciJobs)) failures.push('provider required checks must match CI job names');
  if (provider?.repository !== REPOSITORY || provider?.defaultBranch !== 'main'
      || provider?.mergeMethods?.mergeCommit !== false || provider?.mergeMethods?.squash !== true
      || provider?.mergeMethods?.rebase !== false || provider?.deleteBranchOnMerge !== true
      || provider?.allowAutoMerge !== true || provider?.immutableReleases !== true) {
    failures.push('provider must enforce the committed squash-only baseline with immutable Releases');
  }
  const main = provider?.rulesets?.find((rule) => rule.target === 'branch');
  const tags = provider?.rulesets?.find((rule) => rule.target === 'tag');
  if (main?.enforcement !== 'active' || main?.requireBranchUpToDate !== true
      || main?.bypassActors?.length !== 0 || !sameSet(main?.include ?? [], ['refs/heads/main'])
      || !sameSet(main?.rules ?? [], ['deletion', 'non_fast_forward', 'pull_request', 'required_status_checks'])) {
    failures.push('main ruleset must protect current main with no bypass actors');
  }
  if (tags?.enforcement !== 'active' || tags?.bypassActors?.length !== 0
      || !sameSet(tags?.include ?? [], ['refs/tags/v*']) || !sameSet(tags?.rules ?? [], ['deletion', 'update'])) {
    failures.push('release tag ruleset must make v* tags immutable');
  }
}

export function validateRepositoryContract({ ci, release, cutter, pkg, lock, provider }) {
  const failures = validatePackage(pkg, lock);
  const ciJobs = validateCi(ci, failures);
  validateRelease(release, failures);
  validateCutter(cutter, failures);
  const workflows = `${ci}\n${release}\n${cutter}`;
  if (/deploy-worker|wrangler|^\s*environment:/m.test(workflows)) failures.push('workflows must never deploy');
  const uses = [...workflows.matchAll(/^\s*-?\s*uses:\s*([^\s#]+)/gm)].map((match) => match[1]);
  if (!uses.length || uses.some((use) => !/^actions\/[a-z0-9-]+@[0-9a-f]{40}$/.test(use))) {
    failures.push('every action must be GitHub-owned and pinned to a full commit SHA');
  }
  for (const match of workflows.matchAll(/\bnpm run ([\w:-]+)/g)) {
    if (!pkg.scripts?.[match[1]]) failures.push(`workflow references missing package script ${match[1]}`);
  }
  validateProvider(provider, ciJobs, failures);
  return failures;
}

export const REQUIRED_AUTHORITIES = Object.freeze([
  'README.md', 'AGENTS.md', 'CONTRIBUTING.md', 'LICENSE', 'SECURITY.md', 'implementation_plan.md',
  'docs/ARCHITECTURE.md', 'docs/CHANGE-MANAGEMENT.md', 'docs/RELEASE-MANAGEMENT.md',
  '.node-version', '.npmrc', 'package.json', 'package-lock.json', '.github/pull_request_template.md',
  'config/github-repository-settings.json', 'vendor/hexframe/lock.json',
  ...WORKFLOWS.map((file) => `.github/workflows/${file}`),
]);

export function validateRepositoryAt(root, trackedPaths = []) {
  const failures = [];
  for (const path of REQUIRED_AUTHORITIES) {
    if (!existsSync(join(root, path)) || !readFileSync(join(root, path), 'utf8').trim()) {
      failures.push(`missing or empty repository authority: ${path}`);
    }
  }
  if (failures.length) return failures;
  const read = (path) => readFileSync(join(root, path), 'utf8');
  const workflows = readdirSync(join(root, '.github/workflows')).sort();
  if (workflows.join() !== WORKFLOWS.join()) failures.push(`workflows must be exactly ${WORKFLOWS.join(', ')}`);
  for (const config of ['wrangler.json', 'wrangler.jsonc', 'wrangler.toml']) {
    if (existsSync(join(root, config))) failures.push(`RigLab never deploys and must not carry ${config}`);
  }
  failures.push(...validateTrackedFiles(trackedPaths));
  return [...failures, ...validateRepositoryContract({
    ci: read('.github/workflows/ci.yml'),
    release: read('.github/workflows/release.yml'),
    cutter: read('.github/workflows/release-cutter.yml'),
    pkg: JSON.parse(read('package.json')),
    lock: JSON.parse(read('package-lock.json')),
    provider: JSON.parse(read('config/github-repository-settings.json')),
  })];
}
