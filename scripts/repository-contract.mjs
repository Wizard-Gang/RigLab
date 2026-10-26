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

// RigLab is a local-first authoring application: delivery gates, a release cutter and a source release, never a deployment.
export const WORKFLOWS = Object.freeze(['change.yml', 'gate.yml', 'release-cutter.yml', 'release.yml', 'verify.yml']);

export const REQUIRED_SCRIPTS = Object.freeze([
  'start', 'dev', 'build', 'typecheck', 'test', 'check', 'check:gate', 'check:change', 'check:release', 'check:patch',
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
  if (OUTSIDE_CHECK.test(pkg.scripts?.check ?? '') || OUTSIDE_CHECK.test(pkg.scripts?.['check:gate'] ?? '')) {
    failures.push('npm run check must stay credential-free and offline');
  }
  if (/vitest|--test|\bnpm (?:run )?test\b|npm run check(?:\s|$)/.test(pkg.scripts?.['check:gate'] ?? '')) {
    failures.push('npm run check:gate must run only the non-test checks');
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

// Each delivery workflow: its PR bases, whether it can be dispatched, and its job names. None runs on push.
const DELIVERY = Object.freeze({
  verify: { branches: /^    branches: \[main\]$/m, bases: 'main', dispatch: true, jobs: ['verify', 'security'] },
  gate: { branches: /^    branches: \['release\/\*\*'\]$/m, bases: 'release/**', dispatch: false, jobs: ['gate'] },
  change: { branches: /^    branches: \[main, 'release\/\*\*'\]$/m, bases: 'main and release/**', dispatch: false, jobs: ['change-id'] },
});

function validateDelivery(name, workflow, failures) {
  const { branches, bases, dispatch, jobs } = DELIVERY[name];
  const events = keys(block(workflow, 'on'), 2);
  if (!sameSet(events, dispatch ? ['pull_request', 'workflow_dispatch'] : ['pull_request'])) {
    failures.push(`${name}.yml must trigger only on ${dispatch ? 'PRs and workflow_dispatch' : 'PRs'}, never on push`);
  }
  const pullRequest = block(workflow, 'pull_request', 2);
  requireMatch(failures, `${name}.yml must run on PRs into ${bases}`, pullRequest, branches);
  requireMatch(failures, `${name}.yml must rerun when PR title or body is edited`, pullRequest, /types: \[[^\]]*edited[^\]]*\]/);
  if (block(workflow, 'permissions')?.trim() !== 'contents: read') failures.push(`${name}.yml default token must be read-only`);
  requireMatch(failures, `${name}.yml must cancel only in-progress PR runs`, block(workflow, 'concurrency'), /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/);
  const actual = keys(block(workflow, 'jobs'), 2);
  if (!sameSet(actual, jobs)) failures.push(`${name}.yml must expose exactly the ${jobs.join(', ')} jobs`);
  for (const job of actual) {
    const contents = block(workflow, job, 2);
    requireMatch(failures, `${job} must check out the exact PR head`, contents,
      /ref: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
    if (block(contents, 'permissions', 4)) failures.push(`${job} must not broaden token permissions`);
    if (/^    if:/m.test(contents ?? '')) failures.push(`${job} must always run; a skipped job cannot gate a merge`);
  }
  return actual;
}

function validateDeliveryCommands({ verify, gate, change }, failures) {
  requireMatch(failures, 'verify must run the complete local contract', block(verify, 'verify', 2), /run: npm run check$/m);
  requireMatch(failures, 'verify must check the committed PR patch', block(verify, 'verify', 2), /run: npm run check:patch/);
  requireMatch(failures, 'security must run the dependency advisory gate', block(verify, 'security', 2), /run: npm run audit:dependencies/);
  const gateJob = block(gate, 'gate', 2);
  requireMatch(failures, 'gate must run the non-test checks', gateJob, /run: npm run check:gate$/m);
  requireMatch(failures, 'gate must check the committed PR patch', gateJob, /run: npm run check:patch/);
  if (/vitest|--test|\bnpm (?:run )?test\b|npm run check$/m.test(gateJob ?? '')) failures.push('gate must not run tests');
  const changeJob = block(change, 'change-id', 2);
  requireMatch(failures, 'change-id must validate exact PR identity', changeJob, /run: npm run check:change/);
  requireMatch(failures, 'change-id must fetch merged PR heads for the release ledger', changeJob, /git fetch [^\n]*refs\/pull\/\*\/head/);
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
  if (!sameSet(keys(block(cutter, 'on'), 2), ['push'])) failures.push('Release Cutter must follow pushes to main only');
  requireMatch(failures, 'Release Cutter push target must be main', block(cutter, 'push', 2), /^    branches: \[main\]$/m);
  if (/^    if:/m.test(block(cutter, 'cut', 2) ?? '')) failures.push('Release Cutter must prove every push to main');
  requireMatch(failures, 'Release Cutter must check exact current main', cutter, /git rev-parse origin\/main/);
  requireMatch(failures, 'Release Cutter must find the PR merged as exactly this main commit', cutter,
    /commits\/\$VALIDATED_SHA\/pulls[\s\S]*merge_commit_sha == \\"\$VALIDATED_SHA\\"/);
  requireMatch(failures, 'Release Cutter must prove main carries the tested head tree', cutter,
    /"\$VALIDATED_SHA\^\{tree\}"[\s\S]*"\$tested_head\^\{tree\}"/);
  requireMatch(failures, 'Release Cutter must require green verify on the tested head', cutter,
    /commits\/\$tested_head\/check-runs\?check_name=verify[\s\S]*\[ "\$verify" = success \]/);
  requireMatch(failures, 'Release Cutter must create an annotated exact-head tag', cutter, /git tag -a "\$tag" "\$VALIDATED_SHA"/);
  requireMatch(failures, 'Release Cutter must leave older same-version tags untouched', cutter, /\[ "\$release_sha" != "\$VALIDATED_SHA" \]/);
  requireMatch(failures, 'Release Cutter must dispatch the exact tag and commit', cutter,
    /gh workflow run release\.yml --ref "\$RELEASE_TAG" -f expected_sha="\$EXPECTED_SHA"/);
  for (const permission of ['contents: write', 'actions: write', 'checks: read', 'pull-requests: read']) {
    if (!block(cutter, 'permissions')?.includes(permission)) failures.push(`Release Cutter requires scoped ${permission}`);
  }
}

const MAIN_RULES = Object.freeze(['deletion', 'non_fast_forward', 'pull_request', 'required_linear_history', 'required_status_checks']);
// No deletion rule: automatic branch deletion removes a release branch once its release PR merges.
const RELEASE_RULES = Object.freeze(['non_fast_forward', 'pull_request', 'required_status_checks']);

function validateBranchRuleset(ruleset, label, { rules, mergeMethod, checks, checkSource }, failures) {
  if (ruleset?.enforcement !== 'active' || ruleset?.requireBranchUpToDate !== true
      || ruleset?.bypassActors?.length !== 0 || !sameSet(ruleset?.rules ?? [], rules)) {
    failures.push(`${label} ruleset must enforce ${rules.join(', ')} on current branches with no bypass actors`);
  }
  if (!sameSet(ruleset?.allowedMergeMethods ?? [], [mergeMethod])) failures.push(`${label} must accept PRs by ${mergeMethod} merge only`);
  if (!sameSet(ruleset?.requiredStatusChecks ?? [], checks)) failures.push(`${label} required checks must match the ${checkSource} jobs`);
}

function validateProvider(provider, { mainChecks, releaseChecks }, failures) {
  if (provider?.repository !== REPOSITORY || provider?.defaultBranch !== 'main'
      || provider?.mergeMethods?.mergeCommit !== false || provider?.mergeMethods?.squash !== true
      || provider?.mergeMethods?.rebase !== true || provider?.deleteBranchOnMerge !== true
      || provider?.allowAutoMerge !== true || provider?.immutableReleases !== true) {
    failures.push('provider must allow only squash and rebase merges, delete merged branches and keep immutable Releases');
  }
  const branches = provider?.rulesets?.filter((rule) => rule.target === 'branch') ?? [];
  const main = branches.find((rule) => sameSet(rule.include ?? [], ['refs/heads/main']));
  const release = branches.find((rule) => sameSet(rule.include ?? [], ['refs/heads/release/*']));
  if (branches.length !== 2 || !main || !release) failures.push('provider must have exactly the main and release/* branch rulesets');
  validateBranchRuleset(main, 'main', {
    rules: MAIN_RULES, mergeMethod: 'rebase', checks: mainChecks, checkSource: 'verify.yml and change.yml',
  }, failures);
  validateBranchRuleset(release, 'release/*', {
    rules: RELEASE_RULES, mergeMethod: 'squash', checks: releaseChecks, checkSource: 'gate.yml and change.yml',
  }, failures);
  const tags = provider?.rulesets?.find((rule) => rule.target === 'tag');
  if (tags?.enforcement !== 'active' || tags?.bypassActors?.length !== 0
      || !sameSet(tags?.include ?? [], ['refs/tags/v*']) || !sameSet(tags?.rules ?? [], ['deletion', 'update'])) {
    failures.push('release tag ruleset must make v* tags immutable');
  }
}

export function validateRepositoryContract({ verify, gate, change, release, cutter, pkg, lock, provider }) {
  const failures = validatePackage(pkg, lock);
  const verifyJobs = validateDelivery('verify', verify, failures);
  const gateJobs = validateDelivery('gate', gate, failures);
  const changeJobs = validateDelivery('change', change, failures);
  validateDeliveryCommands({ verify, gate, change }, failures);
  validateRelease(release, failures);
  validateCutter(cutter, failures);
  const workflows = [verify, gate, change, release, cutter].join('\n');
  if (/deploy-worker|wrangler|^\s*environment:/m.test(workflows)) failures.push('workflows must never deploy');
  const uses = [...workflows.matchAll(/^\s*-?\s*uses:\s*([^\s#]+)/gm)].map((match) => match[1]);
  if (!uses.length || uses.some((use) => !/^actions\/[a-z0-9-]+@[0-9a-f]{40}$/.test(use))) {
    failures.push('every action must be GitHub-owned and pinned to a full commit SHA');
  }
  for (const match of workflows.matchAll(/\bnpm run ([\w:-]+)/g)) {
    if (!pkg.scripts?.[match[1]]) failures.push(`workflow references missing package script ${match[1]}`);
  }
  validateProvider(provider, {
    mainChecks: [...verifyJobs, ...changeJobs], releaseChecks: [...gateJobs, ...changeJobs],
  }, failures);
  return failures;
}

export const REQUIRED_AUTHORITIES = Object.freeze([
  'README.md', 'AGENTS.md', 'CONTRIBUTING.md', 'LICENSE', 'SECURITY.md', 'implementation_plan.md',
  'docs/ARCHITECTURE.md', 'docs/CHANGE-MANAGEMENT.md', 'docs/RELEASE-MANAGEMENT.md',
  '.node-version', '.npmrc', 'package.json', 'package-lock.json', '.github/pull_request_template.md',
  'config/github-repository-settings.json', 'docs/releases.json', 'vendor/hexframe/lock.json',
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
    verify: read('.github/workflows/verify.yml'),
    gate: read('.github/workflows/gate.yml'),
    change: read('.github/workflows/change.yml'),
    release: read('.github/workflows/release.yml'),
    cutter: read('.github/workflows/release-cutter.yml'),
    pkg: JSON.parse(read('package.json')),
    lock: JSON.parse(read('package-lock.json')),
    provider: JSON.parse(read('config/github-repository-settings.json')),
  })];
}
