// The pure, provider-independent rules for a controlled RL change.
export const CONTROLLED_TYPES = Object.freeze([
  'INIT', 'FEAT', 'FIX', 'SEC', 'API', 'A11Y', 'I18N', 'AI', 'DB',
  'OPS', 'TEST', 'DOCS', 'REFACTOR', 'PERF', 'BUILD', 'REVERT', 'CHORE',
]);

export const REQUIRED_BODY_FIELDS = Object.freeze([
  'Change', 'Reason', 'Impact', 'Risk', 'Controls', 'Validation',
  'Evidence', 'Source', 'Release',
]);

export const REQUIRED_PLAN_FIELDS = Object.freeze([
  'Dependency', 'Why', 'Scope', 'Non-goals', 'Acceptance', 'Validation', 'Authorities',
]);

// Tasks through RL-058 merged straight into main. Later tasks squash into the open release/rNNN branch, and
// main changes only by a release PR that rebase-merges one commit per task.
export const LAST_DIRECT_TASK = 58;

const titlePattern = /^\[RL-(\d{3,})\] \[([A-Z][A-Z0-9]*)\] (\S[^\r\n]*)$/;
const planTitlePattern = /^\[PLAN\] (\S[^\r\n]*)$/;
const planBranchPattern = /^plan-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const plannedIdPattern = /^[+-]### RL-(\d{3,}) /gm;
const releaseBranchPattern = /^release\/r(\d{3,})$/;
const shaPattern = /^[0-9a-f]{40}$/;
const runUrlPattern = /^https:\/\/github\.com\/Wizard-Gang\/RigLab\/actions\/runs\/\d+(?:\/job\/\d+)?$/;
const branchPattern = /^rl-(\d{3,})-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const taskPattern = /^### RL-(\d{3,}) — \[([A-Z][A-Z0-9]*)\] (\S[^\r\n]*)$/gm;

const id = (number) => `RL-${String(number).padStart(3, '0')}`;
const normalizeBody = (value) => value.replaceAll('\r\n', '\n').replace(/\n+$/, '');
const releaseId = (number) => `r${String(number).padStart(3, '0')}`;
const sameList = (actual, expected) => Array.isArray(actual) && actual.length === expected.length
  && expected.every((value, index) => actual[index] === value);
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export function parseTitle(subject) {
  const match = titlePattern.exec(subject);
  if (!match || match[1] !== String(Number(match[1])).padStart(3, '0')
    || !CONTROLLED_TYPES.includes(match[2]) || /\[[A-Z][A-Z0-9]*\]/.test(match[3])) return null;
  return { id: id(Number(match[1])), number: Number(match[1]), type: match[2], summary: match[3] };
}

/** A plan-only change, `[PLAN] Imperative summary`, edits only implementation_plan.md and takes no RL ID. */
export function parsePlanTitle(subject) {
  const match = planTitlePattern.exec(subject);
  return match && !/\[[A-Z][A-Z0-9]*\]/.test(match[1]) ? { summary: match[1] } : null;
}

/** The highest RL ID any `git log -p -- implementation_plan.md` ever added or removed: removed IDs stay retired. */
export function highestPlannedId(planLog) {
  return Math.max(0, ...[...(planLog ?? '').matchAll(plannedIdPattern)].map((match) => Number(match[1])));
}

export function parseBranch(branch) {
  const match = branchPattern.exec(branch);
  return match && match[1] === String(Number(match[1])).padStart(3, '0')
    ? { id: id(Number(match[1])), number: Number(match[1]) } : null;
}

export function validateBody(body, label = 'commit') {
  const failures = [];
  const lines = body.replaceAll('\r\n', '\n').split('\n');
  const positions = new Map();
  for (const field of REQUIRED_BODY_FIELDS) {
    const matches = lines.flatMap((line, index) => line === `${field}:` ? [index] : []);
    if (matches.length !== 1) failures.push(`${label}: expected exactly one ${field}: field`);
    else positions.set(field, matches[0]);
  }
  let previous = -1;
  for (const [index, field] of REQUIRED_BODY_FIELDS.entries()) {
    const position = positions.get(field);
    if (position === undefined) continue;
    if (position <= previous) failures.push(`${label}: ${field}: is out of order`);
    previous = position;
    const next = REQUIRED_BODY_FIELDS.slice(index + 1)
      .map((name) => positions.get(name))
      .find((candidate) => candidate !== undefined && candidate > position) ?? lines.length;
    if (!lines.slice(position + 1, next).some((line) => line.trim())) {
      failures.push(`${label}: ${field}: has no value`);
    }
  }
  const riskPosition = positions.get('Risk');
  if (riskPosition !== undefined && !/^(Low|Medium|High)$/.test(lines[riskPosition + 1]?.trim() ?? '')) {
    failures.push(`${label}: Risk: must start with Low, Medium, or High`);
  }
  return failures;
}

/** Main and release history: RL-001 first, then task commits with unique IDs and [PLAN] commits in any order. */
export function validateHistory(records) {
  const failures = [];
  const ids = new Set();
  if (records.length === 0) failures.push('controlled history is empty');
  records.forEach((record, index) => {
    const label = record.sha || `commit ${index + 1}`;
    const expectedParents = index === 0 ? 0 : 1;
    if (record.parents.length !== expectedParents || (index > 0 && record.parents[0] !== records[index - 1].sha)) {
      failures.push(`${label}: controlled main must be a single first-parent chain without merge commits`);
    }
    const title = parseTitle(record.subject);
    if (index > 0 && parsePlanTitle(record.subject)) {
      failures.push(...validateBody(record.body, `${label} [PLAN]`));
      return;
    }
    if (!title) {
      failures.push(`${label}: invalid controlled title`);
      return;
    }
    if (index === 0 && title.number !== 1) failures.push(`${label}: history must begin at RL-001, found ${title.id}`);
    if (ids.has(title.id)) failures.push(`${label}: ${title.id} is already used; IDs are never recycled`);
    ids.add(title.id);
    failures.push(...validateBody(record.body, title.id));
  });
  const maxId = Math.max(0, ...[...ids].map((taskId) => Number(taskId.slice(3))));
  return { failures, ids, maxId };
}

/** The queue's shape: any number of unique RL tasks in any order, each with every plan field. */
export function validatePlan(markdown) {
  if (markdown === null || markdown === undefined) {
    return { failures: ['permanent implementation_plan.md is missing'], tasks: [] };
  }
  const failures = [];
  if (!markdown.startsWith('# Implementation plan\n\n## Open tasks\n')) {
    failures.push('implementation_plan.md must retain the common permanent queue heading');
  }
  const headings = [...markdown.matchAll(/^### .+$/gm)];
  const tasks = [...markdown.matchAll(taskPattern)].map((match) => ({
    id: `RL-${match[1]}`, number: Number(match[1]), type: match[2], summary: match[3],
    start: match.index, end: match.index + match[0].length,
  }));
  if (!tasks.length && !markdown.includes('The queue is empty. Select no implementation task.')) {
    failures.push('empty implementation_plan.md must instruct the next change to fill the queue');
  }
  if (headings.length !== tasks.length) failures.push('every ### heading must be an RL task');
  if (/^#{1,6}\s+(?:Done|Completed|History|Retrospective|Release notes)\b/im.test(markdown)) {
    failures.push('active implementation_plan.md cannot retain completed or historical sections');
  }
  tasks.forEach((task, index) => {
    if (tasks.findIndex((other) => other.number === task.number) !== index) failures.push(`${task.id}: queued more than once`);
    if (task.id !== id(task.number)) failures.push(`${task.id}: use canonical numeric padding ${id(task.number)}`);
    if (!CONTROLLED_TYPES.includes(task.type)) failures.push(`${task.id}: invalid primary type ${task.type}`);
    const section = markdown.slice(task.end, tasks[index + 1]?.start ?? markdown.length);
    for (const field of REQUIRED_PLAN_FIELDS) {
      if (!new RegExp(`^(?:- )?${field}:\\s*\\S`, 'm').test(section)) failures.push(`${task.id}: missing nonempty ${field} field`);
    }
    if (/^\s*- (?:Status|Merged|Completed|PR|Merge SHA):/im.test(section)) {
      failures.push(`${task.id}: completed-task metadata belongs in Git/GitHub`);
    }
  });
  return { failures, tasks: tasks.map(({ id: taskId, number, type, summary }) => ({ id: taskId, number, type, summary })) };
}

/** A queued task must not reuse an ID that history already delivered. */
export function validateQueue(markdown, history) {
  const plan = validatePlan(markdown);
  const failures = [...plan.failures];
  for (const task of plan.tasks) if (history.ids.has(task.id)) failures.push(`${task.id}: already delivered; queue a new ID`);
  return { failures, tasks: plan.tasks };
}

export function parseReleaseBranch(ref) {
  const match = releaseBranchPattern.exec(ref ?? '');
  return match && match[1] === String(Number(match[1])).padStart(3, '0') && Number(match[1]) > 0
    ? { id: releaseId(Number(match[1])), number: Number(match[1]) } : null;
}

/** config/release.json names the open release: `{ id: "r001", branch: "release/r001", tasks: ["RL-059", ...] }`. */
export function validateReleaseConfig(config, label = 'config/release.json') {
  if (!isObject(config)) return [`${label} must be an {id, branch, tasks} object`];
  const failures = [];
  if (Object.keys(config).sort().join() !== 'branch,id,tasks') failures.push(`${label} must hold only id, branch and tasks`);
  if (parseReleaseBranch(config.branch)?.id !== config.id) failures.push(`${label}: branch must be release/${config.id} for id ${config.id}`);
  const tasks = Array.isArray(config.tasks) ? config.tasks : [];
  if (!tasks.length) failures.push(`${label}: tasks must list the release's RL IDs`);
  tasks.forEach((task, index) => {
    if (task !== id(Number(String(task).slice(3))) || tasks.indexOf(task) !== index) {
      failures.push(`${label}: tasks must be unique canonical RL IDs`);
    }
  });
  return [...new Set(failures)];
}

/** A docs/releases.json entry proves main's tree after a release equals the tree its release PR tested. */
export function validateReleaseEntry(entry, release, { history, treeOf }) {
  const label = `docs/releases.json ${release.id}`;
  if (!isObject(entry)) return [`${label}: entry is missing`];
  const failures = [];
  if (Object.keys(entry).sort().join() !== 'ci,id,mainHead,pr,tasks,testedHead') {
    failures.push(`${label} must hold only id, pr, testedHead, ci, mainHead and tasks`);
  }
  if (entry.id !== release.id) failures.push(`${label}: id must be ${release.id}`);
  if (!sameList(entry.tasks, release.tasks)) failures.push(`${label}: tasks must be ${release.tasks.join(', ')}`);
  if (!Number.isInteger(entry.pr) || entry.pr < 1) failures.push(`${label}: pr must be the release PR number`);
  if (entry.ci?.conclusion !== 'success' || !runUrlPattern.test(entry.ci?.url ?? '')) {
    failures.push(`${label}: ci must be the release PR's successful verify run {conclusion, url}`);
  }
  for (const field of ['testedHead', 'mainHead']) {
    if (!shaPattern.test(entry[field] ?? '')) failures.push(`${label}: ${field} must be a full commit SHA`);
  }
  if (failures.length) return failures;
  // A [PLAN] commit may follow the last task, so mainHead is main's release tip: that task's commit or a later plan commit.
  const at = history.findIndex((record) => record.sha === entry.mainHead);
  const lastTask = history.slice(0, at + 1).findLast((record) => parseTitle(record.subject));
  if (at < 0 || parseTitle(lastTask.subject).id !== release.tasks.at(-1)) {
    failures.push(`${label}: mainHead must be the ${release.tasks.at(-1)} commit on main or a [PLAN] commit after it`);
  }
  const testedTree = treeOf(entry.testedHead);
  if (!testedTree) failures.push(`${label}: tested head ${entry.testedHead} is not in this checkout; fetch refs/pull/${entry.pr}/head`);
  else if (testedTree !== treeOf(entry.mainHead)) failures.push(`${label}: mainHead tree must equal the tested head tree`);
  return failures;
}

function validateReleaseTask(context, title, failures) {
  const head = context.headRelease;
  const configFailures = validateReleaseConfig(head, 'head config/release.json');
  failures.push(...configFailures);
  if (configFailures.length || !title) return;
  if (head.branch !== context.targetBranch) failures.push(`PR must target the config/release.json branch ${head.branch}`);
  const base = isObject(context.baseRelease) ? context.baseRelease : null;
  const continuing = base?.id === head.id;
  const tasks = continuing ? [...base.tasks, title.id] : [title.id];
  if (!sameList(head.tasks, tasks)) failures.push(`config/release.json tasks must be ${tasks.join(', ')}`);
  const baseLedger = context.baseReleases ?? [];
  const headLedger = context.headReleases;
  if (!Array.isArray(baseLedger) || !Array.isArray(headLedger)) {
    failures.push('docs/releases.json must be a JSON array');
    return;
  }
  const appends = !continuing && base !== null;
  if (headLedger.length !== baseLedger.length + (appends ? 1 : 0)
      || baseLedger.some((entry, index) => JSON.stringify(entry) !== JSON.stringify(headLedger[index]))) {
    failures.push(appends
      ? `docs/releases.json must keep its entries and append ${base.id}`
      : 'docs/releases.json changes only in the first task of a release that follows another');
  }
  if (continuing) return;
  const next = releaseId((base ? parseReleaseBranch(base.branch)?.number ?? 0 : 0) + 1);
  if (head.id !== next) failures.push(`the first task of a release must open ${next}`);
  if (appends && headLedger.length === baseLedger.length + 1) {
    failures.push(...validateReleaseEntry(headLedger.at(-1), base, { history: context.baseHistory, treeOf: context.treeOf }));
  }
}

/** The release PR, release/rNNN into main: exactly one task commit per config/release.json task, oldest first, plus any [PLAN] commits. */
export function validateReleasePullRequest(context) {
  const failures = [];
  const release = parseReleaseBranch(context.branch);
  const head = context.headRelease;
  const configFailures = validateReleaseConfig(head, 'head config/release.json');
  failures.push(...configFailures);
  const tasks = configFailures.length ? [] : head.tasks;
  if (!configFailures.length) {
    if (head.branch !== context.branch) failures.push(`release PR head must be the config/release.json branch ${head.branch}`);
    const expectedTitle = `[RELEASE] ${release.id}: ${tasks[0]}${tasks.length > 1 ? `..${tasks.at(-1)}` : ''}`;
    if (context.title !== expectedTitle) failures.push(`release PR title must be ${expectedTitle}`);
  }
  const base = validateHistory(context.baseHistory);
  const history = validateHistory([...context.baseHistory, ...context.rangeRecords]);
  failures.push(...history.failures);
  if (context.mergeBaseSha !== context.baseSha || context.rangeRecords[0]?.parents[0] !== context.baseSha) {
    failures.push('release branch must be current with main');
  }
  if (context.commitRangeCount !== context.rangeRecords.length) failures.push('release range must be one first-parent chain');
  const ids = context.rangeRecords.filter((record) => !parsePlanTitle(record.subject))
    .map((record) => parseTitle(record.subject)?.id ?? record.sha);
  if (!sameList(ids, tasks)) {
    failures.push(`release commits must be one per listed task (${tasks.join(', ')}); found ${ids.join(', ') || 'none'}`);
  }
  failures.push(...validateQueue(context.basePlan, base).failures.map((failure) => `base plan: ${failure}`));
  failures.push(...validateQueue(context.headPlan, history).failures.map((failure) => `head plan: ${failure}`));
  return { failures, change: release.id };
}

/** A [PLAN] PR changes only the queue and targets the open release branch, or the next one before its first task. */
function validatePlanChange(context, failures) {
  if (!planBranchPattern.test(context.branch ?? '')) failures.push('plan branch must be plan-imperative-summary');
  if (!sameList(context.changedFiles, ['implementation_plan.md'])) failures.push('a [PLAN] PR changes only implementation_plan.md');
  const base = isObject(context.baseRelease) ? context.baseRelease : null;
  const next = `release/${releaseId((parseReleaseBranch(base?.branch)?.number ?? 0) + 1)}`;
  if (![base?.branch, next].includes(context.targetBranch)) {
    failures.push(`a [PLAN] PR targets the open release branch (${[base?.branch, next].filter(Boolean).join(' or ')})`);
  }
}

export function validatePullRequest(context) {
  if (context.targetBranch === 'main' && parseReleaseBranch(context.branch)) return validateReleasePullRequest(context);
  const failures = [];
  const release = parseReleaseBranch(context.targetBranch);
  if (context.targetBranch !== 'main' && !release) failures.push('controlled PR must target main or a release/rNNN branch');
  const baseHistory = validateHistory(context.baseHistory);
  failures.push(...baseHistory.failures);
  const planOnly = parsePlanTitle(context.title);
  const title = parseTitle(context.title);
  if (planOnly) validatePlanChange(context, failures);
  else {
    const branch = parseBranch(context.branch);
    if (!title) failures.push('PR title must be [RL-###] [TYPE] Imperative summary or [PLAN] Imperative summary');
    if (!branch) failures.push('branch must be rl-###-imperative-summary');
    if (title && branch && title.id !== branch.id) failures.push(`branch ${branch.id} does not match PR ${title.id}`);
    if (title && !release && title.number > LAST_DIRECT_TASK) {
      failures.push(`${title.id} must target the open release/rNNN branch; main changes only by release PR`);
    }
  }
  if (context.title !== context.head.subject) failures.push('PR title must exactly equal the head commit subject');
  if (typeof context.prBody !== 'string') failures.push('PR body must contain the controlled commit body');
  else if (normalizeBody(context.prBody) !== normalizeBody(context.head.body)) {
    failures.push('PR body must exactly equal the head commit body (ignoring line endings and trailing newlines)');
  }
  if (context.mergeBaseSha !== context.baseSha || context.head.parents.length !== 1 || context.head.parents[0] !== context.baseSha) {
    failures.push('PR head must be a direct child of the current base commit');
  }
  if (context.commitRangeCount !== 1) failures.push(`PR range must contain one controlled commit; found ${context.commitRangeCount}`);
  failures.push(...validateBody(context.head.body, title?.id ?? 'head commit'));

  // Any PR may add, edit, reorder or remove queued tasks. A new ID, the PR's own or a queued one, must exceed every
  // ID history or the queue ever used, so a removed task's ID stays retired.
  const basePlan = validateQueue(context.basePlan, baseHistory);
  failures.push(...basePlan.failures.map((failure) => `base plan: ${failure}`));
  const headPlan = validatePlan(context.headPlan);
  failures.push(...headPlan.failures.map((failure) => `head plan: ${failure}`));
  const queued = new Map(basePlan.tasks.map((task) => [task.id, task]));
  const ceiling = Math.max(baseHistory.maxId, highestPlannedId(context.basePlanLog), ...basePlan.tasks.map((task) => task.number));
  for (const task of headPlan.tasks) {
    if (!queued.has(task.id) && task.number <= ceiling) failures.push(`head plan: ${task.id} is used or retired; a new task takes an ID above ${id(ceiling)}`);
  }
  if (planOnly && context.basePlan === context.headPlan) failures.push('a [PLAN] PR must change implementation_plan.md');
  if (title) {
    const own = queued.get(title.id);
    if (own && own.type !== title.type) failures.push(`${title.id}: queued type ${own.type} must match PR type`);
    if (!own && title.number <= ceiling) failures.push(`${title.id} is used or retired; deliver a queued task or take an ID above ${id(ceiling)}`);
    if (headPlan.tasks.some((task) => task.id === title.id)) failures.push(`${title.id}: delivering a task removes it from the queue`);
    if (release) validateReleaseTask(context, title, failures);
  }
  return { failures, change: title?.id ?? '[PLAN]' };
}
