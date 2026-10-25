# Implementation plan

## Open tasks

### RL-058 — [OPS] Batch tasks on release branches with one full CI run per release

- Dependency: RL-057 queued this task. Owner rulings of 2026-10-25 in `~/Documents/handoffs/labs-release-protocol.md`: "Fast gate + on-demand", "Rebase, one per task", "Owner calls it", "All three labs".
- Why: Every task pays full CI on its PR and again on push to main. Tasks should land fast on an open `release/rNNN` branch behind a non-test gate, and the full suite should run once, on the release PR into main.
- Scope: Replace `ci.yml` with `verify.yml` (full suite on PRs to main and on `workflow_dispatch`), `gate.yml` (`gate`, the non-test checks, on PRs to `release/**`) and `change.yml` (`change-id` on both bases), with no push-to-main CI. Add `npm run check:gate`. Teach `check:change` task PRs into the release branch named by `config/release.json`, release PRs `[RELEASE] rNNN: RL-0xx..RL-0yy` whose commits are exactly the listed tasks, and the `docs/releases.json` ledger with tree-equality evidence. Re-trigger Release Cutter on push to main and make it prove the pushed tree equals the merged PR's tested head, with green `verify` there, before it cuts. Commit settings for rebase-only, linear main and a squash-only `release/*` ruleset that requires `gate` and `change-id` and has no deletion rule. Update the repository, workflow-shell and portfolio pins, their tests, AGENTS.md, CONTRIBUTING.md, README.md and the change and release docs.
- Non-goals: No application, format or library change. No version, tag or Release. No live settings change before the owner approves it; this task merges under the current squash-only rules.
- Acceptance: CI on the exact head passes `verify`, `change-id` and `security`. Once the owner approves, `apply:github-settings` applies the committed settings and reads them back, and `release/r001` is cut from the new main.
- Validation: Pinned npm ci, typecheck, placeholder build, check:gate, check:change, audit:dependencies and check:patch locally; contract and Vitest suites in CI.
- Authorities: docs/CHANGE-MANAGEMENT.md, docs/RELEASE-MANAGEMENT.md, AGENTS.md, scripts/change-contract.mjs, scripts/repository-contract.mjs, config/github-repository-settings.json.
