import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, test } from 'node:test';
import {
  CONTROLLED_TYPES, LAST_DIRECT_TASK, highestPlannedId, parseBranch, parsePlanTitle, parseTitle,
  validateBody, validateHistory, validatePlan, validatePullRequest, validateQueue,
} from '../../scripts/change-contract.mjs';

const scriptRoot = resolve(import.meta.dirname, '../..');
const fixtures = [];

const body = (risk = 'Low') => [
  'Change:', 'Implement the selected contract.', '',
  'Reason:', 'Keep accepted changes traceable.', '',
  'Impact:', 'Repository process only.', '',
  'Risk:', risk, '',
  'Controls:', 'Preserve one controlled commit.', '',
  'Validation:', 'node --test tests/change-contract.test.mjs', '',
  'Evidence:', 'Focused test results.', '',
  'Source:', 'Current main and active task.', '',
  'Release:', 'Unreleased',
].join('\n');

const task = (number, type = 'TEST') => `### RL-${String(number).padStart(3, '0')} — [${type}] Prove process contract

- Dependency: Previous controlled change.
- Why: The process needs a deterministic guard.
- Scope: Add one process test.
- Non-goals: No application behavior.
- Acceptance: The test catches a regression.
- Validation: node --test tests/change-contract.test.mjs.
- Authorities: scripts/change-contract.mjs.
`;

const plan = (...numbers) => `# Implementation plan\n\n## Open tasks\n\n${numbers.map((n) => task(n)).join('\n')}`;
const emptyPlan = `# Implementation plan

## Open tasks

The queue is empty. Select no implementation task.

Any PR may add, edit, reorder or remove queued tasks at any time; a plan-only PR is titled \`[PLAN] Imperative summary\` and takes no ID. A new task takes an RL ID above every ID ever used in history or this queue, and a removed task's ID stays retired. Keep this file tracked; do not delete it when the queue is empty.
`;

const record = (number, parent = null, type = 'TEST') => ({
  sha: `sha-${number}`,
  parents: parent === null ? [] : [parent],
  subject: `[RL-${String(number).padStart(3, '0')}] [${type}] Prove process contract`,
  body: body(),
});

function candidate(overrides = {}) {
  const initial = record(1);
  const head = record(2, initial.sha);
  return {
    baseSha: initial.sha,
    targetBranch: 'main',
    mergeBaseSha: initial.sha,
    commitRangeCount: 1,
    baseHistory: [initial],
    head,
    branch: 'rl-002-prove-process-contract',
    title: head.subject,
    prBody: head.body,
    basePlan: plan(2, 3),
    headPlan: plan(3),
    ...overrides,
  };
}

test('RL title and branch use one canonical number and primary type', () => {
  assert.deepEqual(parseTitle('[RL-001] [INIT] Establish riglab'), {
    id: 'RL-001', number: 1, type: 'INIT', summary: 'Establish riglab',
  });
  assert.equal(parseTitle('[RL-001] [FEATURE] Establish riglab'), null);
  assert.equal(parseTitle('[RL-001] [TEST] [BUILD] Add second type'), null);
  assert.equal(parseTitle('[RL-0001] [TEST] Padded identity'), null);
  assert.equal(parseBranch('rl-001-establish-riglab')?.id, 'RL-001');
  assert.equal(parseBranch('rl-0001-padded'), null);
  assert.equal(parseBranch('feature/rl-001-establish'), null);
  assert.deepEqual(parsePlanTitle('[PLAN] Queue the export tasks'), { summary: 'Queue the export tasks' });
  assert.equal(parsePlanTitle('[PLAN] [DOCS] Queue the export tasks'), null);
  assert.equal(parsePlanTitle('[RL-002] [PLAN] Queue the export tasks'), null);
  assert.ok(CONTROLLED_TYPES.includes('REVERT'));
});

test('controlled body requires ordered, unique, nonempty fields and classified risk', () => {
  assert.deepEqual(validateBody(body(), 'RL-001'), []);
  assert.match(validateBody(body().replace('Evidence:\nFocused test results.', ''), 'RL-001').join(' '), /exactly one Evidence:/);
  assert.match(validateBody(`${body()}\nChange:\nDuplicate`, 'RL-001').join(' '), /exactly one Change:/);
  assert.match(validateBody(body().replace('Controls:\nPreserve one controlled commit.', 'Controls:\n'), 'RL-001').join(' '), /Controls: has no value/);
  assert.match(validateBody(body().replace('Risk:\nLow', 'Risk:\nUnknown'), 'RL-001').join(' '), /Risk: must start with/);
  assert.match(validateBody(body().replace('Reason:', 'Temporary:').replace('Impact:', 'Reason:').replace('Temporary:', 'Impact:'), 'RL-001').join(' '), /out of order/);
});

test('first-parent main history begins at controlled RL-001 and never reuses an ID', () => {
  const first = record(1);
  const second = record(2, first.sha);
  const planned = { ...record(0, second.sha), subject: '[PLAN] Queue the next tasks' };
  assert.deepEqual(validateHistory([first, second]).failures, []);
  assert.equal(validateHistory([first, second]).maxId, 2);
  assert.deepEqual(validateHistory([first, record(5, first.sha), { ...record(3), parents: ['sha-5'] }]).failures, []);
  assert.deepEqual(validateHistory([first, second, planned]).failures, []);
  assert.equal(validateHistory([first, second, planned]).maxId, 2);
  assert.match(validateHistory([record(2)]).failures.join(' '), /must begin at RL-001/);
  assert.match(validateHistory([first, second, { ...planned, body: '' }]).failures.join(' '), /\[PLAN\]: expected exactly one Change:/);

  assert.match(validateHistory([{ ...first, subject: 'Bootstrap riglab repository' }]).failures.join(' '), /invalid controlled title/);
  assert.match(validateHistory([first, { ...second, subject: first.subject }]).failures.join(' '), /RL-001 is already used/);
  assert.match(validateHistory([first, { ...second, parents: [first.sha, 'other'] }]).failures.join(' '), /without merge commits/);
  assert.match(validateHistory([first, { ...second, body: '' }]).failures.join(' '), /exactly one Change:/);
});

test('active plan holds unique future tasks in any order and no completed ledger', () => {
  assert.match(validatePlan(null).failures.join(' '), /permanent implementation_plan.md is missing/);
  assert.deepEqual(validatePlan(emptyPlan).failures, []);
  assert.deepEqual(validatePlan(plan(2, 3)).failures, []);
  assert.deepEqual(validatePlan(plan(7, 3, 12)).failures, []);
  assert.deepEqual(validatePlan(plan(2).replaceAll(/^- /gm, '')).failures, []);
  assert.match(validatePlan(plan(2, 4, 2)).failures.join(' '), /RL-002: queued more than once/);
  assert.match(validatePlan('# Plan\n\n## Completed\n\n' + task(2)).failures.join(' '), /historical sections/);
  assert.match(validatePlan(plan(2).replace('- Validation: node --test tests/change-contract.test.mjs.', '')).failures.join(' '), /missing nonempty Validation/);
  assert.match(validateQueue(plan(1, 2), validateHistory([record(1)])).failures.join(' '), /RL-001: already delivered/);
  assert.equal(highestPlannedId('+### RL-007 — [TEST] A\n-### RL-012 — [TEST] B\n ### RL-099 — [TEST] C\n'), 12);
  assert.equal(highestPlannedId(''), 0);
});

test('PR binds exact head, branch, single commit, and its own task retirement', () => {
  assert.deepEqual(validatePullRequest(candidate()).failures, []);
  assert.match(validatePullRequest(candidate({ title: '[RL-002] [BUILD] Different title' })).failures.join(' '), /exactly equal/);
  assert.match(validatePullRequest(candidate({ prBody: `${body()}\nChanged` })).failures.join(' '), /PR body must exactly equal/);
  assert.deepEqual(validatePullRequest(candidate({ prBody: body().replaceAll('\n', '\r\n') + '\r\n' })).failures, []);
  assert.match(validatePullRequest(candidate({ branch: 'rl-003-wrong-id' })).failures.join(' '), /does not match PR/);
  assert.match(validatePullRequest(candidate({ targetBranch: 'develop' })).failures.join(' '), /must target main/);
  assert.match(validatePullRequest(candidate({ commitRangeCount: 2 })).failures.join(' '), /one controlled commit/);
  assert.match(validatePullRequest(candidate({ mergeBaseSha: 'stale-base' })).failures.join(' '), /direct child/);
  assert.match(validatePullRequest(candidate({ headPlan: plan(2, 3) })).failures.join(' '), /RL-002: delivering a task removes it from the queue/);
  assert.match(validatePullRequest(candidate({ basePlan: plan(1, 2) })).failures.join(' '), /base plan: RL-001: already delivered/);
  assert.match(validatePullRequest(candidate({ headPlan: null })).failures.join(' '), /head plan: permanent implementation_plan.md is missing/);
  const build = record(2, 'sha-1', 'BUILD');
  assert.match(validatePullRequest(candidate({ head: build, title: build.subject })).failures.join(' '), /RL-002: queued type TEST must match PR type/);
});

test('any PR may add, edit, reorder or remove queued tasks, and new IDs exceed every ID ever used', () => {
  const ok = (overrides) => assert.deepEqual(validatePullRequest(candidate(overrides)).failures, []);
  ok({ basePlan: plan(2), headPlan: emptyPlan });
  ok({ basePlan: emptyPlan, headPlan: emptyPlan });
  ok({ basePlan: emptyPlan, headPlan: plan(3) });
  ok({ basePlan: plan(3, 2), headPlan: plan(3) });
  ok({ basePlan: plan(2, 3, 4), headPlan: plan(9, 4) });
  ok({ basePlan: plan(2, 3), headPlan: plan(5).replace('Prove process contract', 'Prove a rewritten contract') });
  const fail = (overrides) => validatePullRequest(candidate(overrides)).failures.join(' ');
  assert.match(fail({ basePlan: plan(3), headPlan: plan(3) }), /RL-002 is used or retired; deliver a queued task or take an ID above RL-003/);
  assert.match(fail({ basePlan: plan(2, 3), headPlan: plan(1) }), /head plan: RL-001 is used or retired/);
  const retired = '+### RL-004 — [TEST] Dropped\n-### RL-004 — [TEST] Dropped\n';
  assert.match(fail({ basePlan: plan(2), headPlan: plan(4), basePlanLog: retired }), /head plan: RL-004 is used or retired; a new task takes an ID above RL-004/);
  ok({ basePlan: plan(2), headPlan: plan(5), basePlanLog: retired });
});

const r001 = (...tasks) => ({ id: 'r001', branch: 'release/r001', tasks });
const intoRelease = (overrides = {}) => candidate({
  targetBranch: 'release/r001', baseRelease: null, headRelease: r001('RL-002'),
  ...overrides,
});

test('a task PR into the open release branch extends config/release.json', () => {
  assert.deepEqual(validatePullRequest(intoRelease()).failures, []);
  assert.deepEqual(validatePullRequest(intoRelease({ baseRelease: r001('RL-001'), headRelease: r001('RL-001', 'RL-002') })).failures, []);
  assert.match(validatePullRequest(intoRelease({ targetBranch: 'release/r002' })).failures.join(' '), /must target the config\/release.json branch release\/r001/);
  assert.match(validatePullRequest(intoRelease({ headRelease: r001('RL-001', 'RL-002') })).failures.join(' '), /tasks must be RL-002/);
  assert.match(validatePullRequest(intoRelease({ headRelease: null })).failures.join(' '), /must be an \{id, branch, tasks\} object/);
  assert.match(validatePullRequest(intoRelease({ headRelease: { ...r001('RL-002'), id: 'r002' } })).failures.join(' '), /branch must be release\/r002/);
  assert.match(validatePullRequest(intoRelease({ targetBranch: 'release/r1' })).failures.join(' '), /must target main or a release\/rNNN branch/);
  assert.match(validatePullRequest(intoRelease({ baseRelease: r001('RL-002'), headRelease: r001('RL-002', 'RL-002') })).failures.join(' '), /unique canonical RL IDs/);
});

test('a [PLAN] PR changes only the queue, takes no ID and lands on the open or next release branch', () => {
  const head = { ...record(2, 'sha-1'), subject: '[PLAN] Queue the next tasks' };
  const planPr = (overrides = {}) => validatePullRequest(candidate({
    head, title: head.subject, branch: 'plan-queue-the-next-tasks', targetBranch: 'release/r001', baseRelease: r001('RL-001'),
    changedFiles: ['implementation_plan.md'], basePlan: plan(2, 3), headPlan: plan(3, 2, 4), ...overrides,
  }));
  assert.deepEqual(planPr().failures, []);
  assert.equal(planPr().change, '[PLAN]');
  assert.deepEqual(planPr({ basePlan: emptyPlan, headPlan: plan(2) }).failures, []);
  assert.deepEqual(planPr({ headPlan: emptyPlan }).failures, []);
  assert.deepEqual(planPr({ targetBranch: 'release/r002' }).failures, []);
  assert.deepEqual(planPr({ baseRelease: null }).failures, []);
  const fail = (overrides) => planPr(overrides).failures.join(' ');
  assert.match(fail({ targetBranch: 'release/r003' }), /targets the open release branch \(release\/r001 or release\/r002\)/);
  assert.match(fail({ targetBranch: 'main' }), /targets the open release branch/);
  assert.match(fail({ changedFiles: ['config/release.json', 'implementation_plan.md'] }), /changes only implementation_plan.md/);
  assert.match(fail({ branch: 'rl-002-queue-the-next-tasks' }), /plan branch must be plan-imperative-summary/);
  assert.match(fail({ headPlan: plan(2, 3) }), /must change implementation_plan.md/);
  assert.match(fail({ headPlan: plan(1) }), /head plan: RL-001 is used or retired/);
  assert.match(fail({ head: { ...head, body: '' }, prBody: '' }), /head commit: expected exactly one Change:/);
});

test(`tasks after RL-${LAST_DIRECT_TASK} target a release branch, never main`, () => {
  const history = Array.from({ length: LAST_DIRECT_TASK }, (_, index) => record(index + 1, index ? `sha-${index}` : null));
  const head = record(LAST_DIRECT_TASK + 1, history.at(-1).sha);
  const late = {
    baseSha: head.parents[0], mergeBaseSha: head.parents[0], baseHistory: history, head,
    branch: `rl-0${LAST_DIRECT_TASK + 1}-prove-process-contract`, title: head.subject, prBody: head.body,
    basePlan: plan(LAST_DIRECT_TASK + 1), headPlan: emptyPlan,
  };
  assert.match(validatePullRequest(candidate(late)).failures.join(' '), /must target the open release\/rNNN branch/);
  assert.deepEqual(validatePullRequest(intoRelease({ ...late, headRelease: r001(head.subject.slice(1, 7)) })).failures, []);
});

test('a release PR carries exactly one commit per listed task under a derived title', () => {
  const main = record(1);
  const first = record(2, main.sha);
  const second = record(3, first.sha);
  const release = (overrides = {}) => validatePullRequest({
    baseSha: main.sha, mergeBaseSha: main.sha, targetBranch: 'main', branch: 'release/r001',
    title: '[RELEASE] r001: RL-002..RL-003', prBody: '', baseHistory: [main], rangeRecords: [first, second],
    commitRangeCount: 2, head: second, headRelease: r001('RL-002', 'RL-003'), basePlan: plan(2, 3), headPlan: emptyPlan,
    ...overrides,
  }).failures.join(' ');
  assert.equal(release(), '');
  assert.match(release({ title: '[RELEASE] r001: RL-002' }), /title must be \[RELEASE\] r001: RL-002\.\.RL-003/);
  assert.match(release({ rangeRecords: [first], commitRangeCount: 1 }), /one per listed task \(RL-002, RL-003\); found RL-002/);
  assert.match(release({ mergeBaseSha: 'stale-base' }), /current with main/);
  assert.match(release({ commitRangeCount: 3 }), /one first-parent chain/);
  assert.match(release({ headPlan: plan(3) }), /head plan: RL-003: already delivered/);
  const planned = { ...record(0, first.sha), sha: 'sha-plan', subject: '[PLAN] Queue more' };
  assert.equal(release({ rangeRecords: [first, planned, { ...second, parents: [planned.sha] }], commitRangeCount: 3 }), '');
  assert.match(release({ branch: 'release/r002' }), /head must be the config\/release.json branch release\/r001/);
  assert.match(release({ rangeRecords: [first, { ...second, body: '' }] }), /exactly one Change:/);
});


function command(cwd, program, args, env = {}) {
  const childEnv = { ...process.env };
  for (const name of [
    'GITHUB_EVENT_NAME', 'GITHUB_EVENT_PATH', 'GITHUB_SHA',
    'CHANGE_BASE_SHA', 'CHANGE_HEAD_SHA', 'CHANGE_HEAD_REF',
    'CHANGE_PR_TITLE', 'CHANGE_PR_BODY', 'CHANGE_BASE_REF',
  ]) delete childEnv[name];
  const result = spawnSync(program, args, { cwd, encoding: 'utf8', env: { ...childEnv, ...env } });
  if (result.error) throw result.error;
  return result;
}

function git(cwd, ...args) {
  const result = command(cwd, 'git', args);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function commit(cwd, title, content) {
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-q', '-m', title, '-m', content);
  return git(cwd, 'rev-parse', 'HEAD');
}

test('CLI reads committed Git state and GitHub PR metadata at the exact head', () => {
  const root = mkdtempSync(join(tmpdir(), 'riglab-change-'));
  fixtures.push(root);
  mkdirSync(join(root, 'scripts'));
  for (const name of ['change-contract.mjs', 'check-change.mjs', 'release-contract.mjs']) {
    copyFileSync(join(scriptRoot, 'scripts', name), join(root, 'scripts', name));
  }
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.name', 'RigLab Test');
  git(root, 'config', 'user.email', 'riglab@example.invalid');
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'riglab', version: '0.1.0', private: true }) + '\n');
  writeFileSync(join(root, 'implementation_plan.md'), plan(2, 3));
  const baseSha = commit(root, '[RL-001] [INIT] Establish riglab', body());
  assert.equal(command(root, process.execPath, ['scripts/check-change.mjs']).status, 0);

  git(root, 'switch', '-q', '-c', 'rl-002-prove-process-contract');
  writeFileSync(join(root, 'implementation_plan.md'), plan(3));
  const title = '[RL-002] [TEST] Prove process contract';
  const headSha = commit(root, title, body());
  const local = command(root, process.execPath, ['scripts/check-change.mjs']);
  assert.equal(local.status, 0, local.stderr);

  const eventPath = join(root, 'event.json');
  const event = {
    pull_request: { title, body: body(), base: { sha: baseSha, ref: 'main' }, head: { sha: headSha, ref: 'rl-002-prove-process-contract' } },
  };
  writeFileSync(eventPath, JSON.stringify(event));
  const env = { GITHUB_EVENT_NAME: 'pull_request', GITHUB_EVENT_PATH: eventPath };
  assert.equal(command(root, process.execPath, ['scripts/check-change.mjs'], env).status, 0);
  event.pull_request.title = '[RL-002] [TEST] Another title';
  writeFileSync(eventPath, JSON.stringify(event));
  const wrong = command(root, process.execPath, ['scripts/check-change.mjs'], env);
  assert.equal(wrong.status, 1);
  assert.match(wrong.stderr, /exactly equal/);
  event.pull_request.title = title;
  event.pull_request.body = `${body()}\nDifferent evidence`;
  writeFileSync(eventPath, JSON.stringify(event));
  const wrongBody = command(root, process.execPath, ['scripts/check-change.mjs'], env);
  assert.equal(wrongBody.status, 1);
  assert.match(wrongBody.stderr, /PR body must exactly equal/);

  rmSync(eventPath);
  git(root, 'switch', '-q', 'main');
  writeFileSync(join(root, 'implementation_plan.md'), emptyPlan);
  commit(root, title, body());
  assert.equal(command(root, process.execPath, ['scripts/check-change.mjs']).status, 0);

  git(root, 'tag', '-a', 'v0.1.0', '-m', 'Release v0.1.0');
  git(root, 'switch', '-q', '--detach', 'v0.1.0');
  assert.equal(command(root, process.execPath, ['scripts/check-change.mjs']).status, 0);

  git(root, 'switch', '-q', 'main');
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'riglab', version: '0.2.0', private: true }) + '\n');
  commit(root, '[RL-003] [BUILD] Advance release version', body());
  git(root, 'switch', '-q', '--detach', 'HEAD');
  assert.match(command(root, process.execPath, ['scripts/check-change.mjs']).stderr, /exact annotated semantic release tag/);
  git(root, 'tag', 'v0.2.0');
  assert.match(command(root, process.execPath, ['scripts/check-change.mjs']).stderr, /requires an annotated tag/);
  git(root, 'tag', '-d', 'v0.2.0');
  git(root, 'tag', '-a', 'v0.3.0', '-m', 'Mismatched version');
  assert.match(command(root, process.execPath, ['scripts/check-change.mjs']).stderr, /does not match package.json version/);
});

test('CLI checks a task PR and a [PLAN] PR into the release branch, and a local release branch as its release PR', () => {
  const root = mkdtempSync(join(tmpdir(), 'riglab-release-'));
  fixtures.push(root);
  for (const dir of ['scripts', 'docs', 'config']) mkdirSync(join(root, dir));
  for (const name of ['change-contract.mjs', 'check-change.mjs', 'release-contract.mjs']) {
    copyFileSync(join(scriptRoot, 'scripts', name), join(root, 'scripts', name));
  }
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.name', 'RigLab Test');
  git(root, 'config', 'user.email', 'riglab@example.invalid');
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'riglab', version: '0.1.0', private: true }) + '\n');
  writeFileSync(join(root, 'implementation_plan.md'), plan(2, 3));
  const mainSha = commit(root, '[RL-001] [INIT] Establish riglab', body());
  git(root, 'branch', 'release/r001');

  git(root, 'switch', '-q', '-c', 'rl-002-prove-process-contract');
  writeFileSync(join(root, 'implementation_plan.md'), plan(3));
  writeFileSync(join(root, 'config/release.json'), JSON.stringify(r001('RL-002'), null, 2) + '\n');
  const title = '[RL-002] [TEST] Prove process contract';
  const taskSha = commit(root, title, body());
  const local = command(root, process.execPath, ['scripts/check-change.mjs']);
  assert.equal(local.status, 0, local.stderr);
  assert.match(local.stdout, /Controlled RL-002 candidate/);

  const eventPath = join(root, 'event.json');
  const event = {
    pull_request: { title, body: body(), base: { sha: mainSha, ref: 'release/r001' }, head: { sha: taskSha, ref: 'rl-002-prove-process-contract' } },
  };
  writeFileSync(eventPath, JSON.stringify(event));
  const env = { GITHUB_EVENT_NAME: 'pull_request', GITHUB_EVENT_PATH: eventPath };
  assert.equal(command(root, process.execPath, ['scripts/check-change.mjs'], env).status, 0);
  event.pull_request.base.ref = 'main';
  writeFileSync(eventPath, JSON.stringify(event));
  assert.equal(command(root, process.execPath, ['scripts/check-change.mjs'], env).status, 0, 'RL-002 predates the cut-over');
  event.pull_request.base.ref = 'release/r002';
  writeFileSync(eventPath, JSON.stringify(event));
  const wrong = command(root, process.execPath, ['scripts/check-change.mjs'], env);
  assert.equal(wrong.status, 1);
  assert.match(wrong.stderr, /must target the config\/release.json branch release\/r001/);
  rmSync(eventPath);

  git(root, 'switch', '-q', 'release/r001');
  git(root, 'merge', '-q', '--ff-only', 'rl-002-prove-process-contract');
  const release = command(root, process.execPath, ['scripts/check-change.mjs']);
  assert.equal(release.status, 0, release.stderr);
  assert.match(release.stdout, /Controlled r001 candidate/);

  git(root, 'switch', '-q', '-c', 'plan-queue-more');
  writeFileSync(join(root, 'implementation_plan.md'), plan(3, 2));
  commit(root, '[PLAN] Queue more', body());
  assert.match(command(root, process.execPath, ['scripts/check-change.mjs']).stderr, /head plan: RL-002 is used or retired/);
  git(root, 'reset', '-q', '--hard', 'release/r001');
  writeFileSync(join(root, 'implementation_plan.md'), plan(4, 3));
  commit(root, '[PLAN] Queue more', body());
  const planned = command(root, process.execPath, ['scripts/check-change.mjs']);
  assert.equal(planned.status, 0, planned.stderr);
  assert.match(planned.stdout, /Controlled \[PLAN\] candidate/);
});

after(() => { for (const root of fixtures) rmSync(root, { recursive: true, force: true }); });
