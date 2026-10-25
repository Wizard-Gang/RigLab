# Implementation plan

## Open tasks

### RL-056 — [DOCS] Align the agent guide with the no-tests and context-budget hooks

- Dependency: None.
- Why: On 2026-10-25 the owner installed two machine-level hooks for Claude Code and Codex. `no-tests` blocks agent test runs in RigLab: vitest, `node --test`, `npm test`, any `test*` script and `npm run check`. CI's required checks are now the only test runner. `context-budget` warns at 200k tokens of context and blocks work tools at 300k. AGENTS.md still has agents validate with focused tests and `npm run check`, and step 2 of the acceptance path in `docs/CHANGE-MANAGEMENT.md` runs `npm run check`, so an agent that follows either one hits the hook.
- Scope:
  - AGENTS.md says agents do not run tests or `npm run check` locally, because CI's required checks run them on the exact head. Local validation is pinned `npm ci`, `npm run typecheck`, `npm run build -- --mode placeholder`, the non-test `check:*` scripts, `npm run audit:dependencies`, `git diff --check` and `check:patch`. "Keep sessions cheap" adds the 200k and 300k limits and the hand-off of 25 lines or fewer to `~/Documents/handoffs/`.
  - Step 2 of the acceptance path and the closing test paragraph in `docs/CHANGE-MANAGEMENT.md` say the same.
  - The Validation hint in `.github/pull_request_template.md` lists those local checks instead of `npm run check`.
  - Update the AGENTS.md hash in `scripts/check-portfolio-contract.mjs`. Remove this task, leaving the permanent empty-queue template.
- Non-goals: CONTRIBUTING.md and its pinned hash, CI, the `check` script, tests, code, settings and releases. CI still runs `npm run check` and every test on every PR.
- Acceptance: AGENTS.md stays under 5,000 characters and keeps every binding rule. Neither it nor the acceptance path tells agents to run tests or `npm run check` locally. Exact-head CI passes with the new hash, and `implementation_plan.md` matches the pinned empty template again.
- Validation: Pinned `npm ci`, `npm run typecheck`, `npm run build -- --mode placeholder`, the non-test `check:*` scripts, `npm run audit:dependencies`, `git diff --check`, `check:patch` and exact-head CI.
- Authorities: `AGENTS.md`, `docs/CHANGE-MANAGEMENT.md`, `scripts/check-portfolio-contract.mjs` and the owner's direction on 2026-10-25.
