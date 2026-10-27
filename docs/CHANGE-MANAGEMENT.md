# Change management

This is the canonical way RigLab accepts and merges a change. Every accepted repository change gets one permanent `RL-###` ID. The root `RL-001` bootstrap commit precedes provider protection; every later change follows the controlled PR path. GitHub history is the permanent record of accepted changes.

## Authority and sequence

Fetch `main`, inspect open PRs and current CI, then reconcile `implementation_plan.md` with first-parent history. The first open task is next. A delivering PR removes its own task, and the last one leaves the tracked queue empty. Do not start a duplicate PR. The plan is free to change: any PR may add, edit, reorder or remove queued tasks at any time and with any queue state, including a task PR that also edits other tasks. A task PR delivers a queued task (matching its type) or a new ID.

A plan-only PR is titled and committed `[PLAN] Imperative summary` on a `plan-imperative-summary` branch, changes only `implementation_plan.md`, carries the same body fields, and takes no ID. It squashes into the open release branch (or the next one, cut from main, before that release's first task) and is not listed in `config/release.json` `tasks`.

IDs start at `RL-001` and are unique, permanent, and never recycled. A new task takes an ID above every ID ever used in history or the queue (`check:change` reads the plan's whole first-parent log); a removed queued ID is retired, so IDs need not be contiguous. A correction or revert receives a new ID and cites the affected change in its body. Branches are `rl-NNN-imperative-summary`. PR titles and commit subjects are exactly `[RL-NNN] [TYPE] Imperative summary`, with the same ID, type, and subject. Types: `INIT`, `FEAT`, `FIX`, `SEC`, `API`, `A11Y`, `I18N`, `AI`, `DB`, `OPS`, `TEST`, `DOCS`, `REFACTOR`, `PERF`, `BUILD`, `REVERT`, `CHORE`.

The one commit in the PR range carries ordered, nonempty fields:

```text
[RL-###] [TYPE] Imperative summary

Change:
What changed.

Reason:
Why it changed.

Impact:
What boundary or behavior is affected.

Risk:
Low
Concrete exposure. Use Medium or High when appropriate.

Controls:
How the risk is constrained or reversed.

Validation:
Checks actually run and their results.

Evidence:
Relevant paths, run URLs, or exact provider observations.

Source:
Direct work or the source commit/issue used.

Release:
The intended version or Unreleased.
```

Risk is low for policy prose with no control change, medium for build and process behavior, and high for authentication, permissions, secrets, protected history, release publication, or destructive effects. High-risk changes name a rollback or forward correction and its authority. Do not backfill unobserved validation.

## Acceptance path

1. Start from the exact tip of the open `release/rNNN` branch (current `main` through RL-058) on an isolated branch, implement one task, and update its plan block in the same patch. Keep one controlled commit in the PR range.
2. Agents do not run tests or `npm run check` locally; CI's `verify` runs `npm run check` on the release PR's exact head, or on any branch through `gh workflow run verify.yml --ref <branch>`. Run pinned `npm ci`, `npm run check:gate` (the plan queue, workflow shell, vendor and repository checks, typecheck and the placeholder build: exactly the `gate` job), `npm run check:change`, `npm run audit:dependencies`, and `PATCH_BASE_SHA=<full-base> PATCH_HEAD_SHA=<full-head> npm run check:patch`. The patch check uses the committed range; a working-tree `git diff --check` alone does not prove the PR range. Verify live settings when provider policy is touched. Record future CI/provider observations in the PR timeline or delivery report; the immutable commit and matching PR body contain only evidence known at authoring time or explicitly marked pending.
3. Open a PR targeting the release branch. Its body must equal the controlled commit body. Set the squash subject and body explicitly to that controlled record when merging. CI checks out the event's exact `pull_request.head.sha`; `change-id` validates the PR title, branch, subject, body, one-commit range, ID uniqueness, task retirement and `config/release.json`. `gate` runs the non-test checks and the patch check. The release ruleset requires both with the branch current with its base.
4. Before merging, re-fetch `main` and the PR, record the exact current head SHA, the required check run IDs and conclusions for that SHA, and mergeability. Re-read the live ruleset and repository settings. A changed base or head requires a fresh exact-head check. Diagnose failed jobs from their complete logs for the exact run attempt.
5. Squash merge only the validated head into the release branch. Set the squash subject and body to the controlled commit record. Merge commits are disabled, task PRs never rebase-merge, and no direct push, force push, or deletion of `main` is permitted.
6. Re-fetch the release branch, confirm its expected first-parent controlled commit and tree, plan retirement, branch deletion, and a clean worktree. Report a missing check as missing, even if the PR merge succeeded.

## Release branches (from RL-059)

The owner's 2026-10-25 rulings batch tasks so the full suite runs once per release. Tasks through RL-058 merged straight into `main`; `check:change` refuses a later task PR into `main`.

- `release/rNNN` (r001, r002, …) is cut from main's tip with `git push origin main:refs/heads/release/rNNN`. One is open at a time. `config/release.json` names it as `{id, branch, tasks}`; each task PR appends its ID, and a release's first task rewrites the file.
- The release PR, `release/rNNN` into `main`, opens only when the owner says "release". Its title is `[RELEASE] rNNN: RL-0xx..RL-0yy` (one ID for a one-task release). Its commits are exactly one controlled commit per listed task, oldest first, plus any `[PLAN]` commits. `verify`, `change-id` and `security` must pass on its exact head with the branch current with `main`, and it rebase-merges, so main gains one commit per task. A red release is fixed forward by a task PR into the release branch.
- [docs/releases.json](releases.json) records each merged release as `{id, pr, testedHead, ci: {conclusion, url}, mainHead, tasks}`, appended by the next release's first task. `change-id` fetches merged PR heads and requires `mainHead`, main's release tip (the last task's commit or a `[PLAN]` commit after it), to have the tree of `testedHead`. A rebase rewrites SHAs, so tree equality is the evidence.
- Main has no push CI. On each push to main, Release Cutter finds the PR merged as that exact commit and fails unless main's tree equals that PR's tested head tree and `verify` passed there.

The provider contract is committed in `config/github-repository-settings.json`. `npm run verify:github-settings` reads live repository merge settings and rulesets; `npm run apply:github-settings` changes only those committed controls and independently reads them back. CI has read-only repository permissions. The release job alone receives scoped write and OIDC/attestation permissions when a release is explicitly authorized. The rulesets have no bypass actors. The repository's actual plan or provider capability must be checked live before asserting enforcement.

`npm run test:contracts` (`node --test tests/contracts/*.test.mjs`) guards release-branch identity, history/plan/PR identity, repository workflow structure and permissions, the no-deploy boundary, the Hexframe vendor pin, provider policy comparison, and release identity/publication. `npm run test` (Vitest) guards the rig, format and editor behavior. CI's `verify` runs both on the exact head; agents do not run them locally.
