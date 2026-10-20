# Implementation plan

## Open tasks

### RL-054 — [DOCS] Make AGENTS.md the only required reading

- Dependency: None.
- Why: On 2026-10-20 the owner asked for a streamlined agent guide, because reading docs was eating session cost. Before editing, the current AGENTS.md has agents read README.md, CONTRIBUTING.md, SECURITY.md and the architecture, change-management and release-management documents. That is about 70,000 characters, 44,600 of them in `docs/ARCHITECTURE.md`. Each tool call re-sends the whole session, so that reading is paid for again on every later call. MapLab adopted the same lookup-first guide in ML-016.
- Scope: Rewrite AGENTS.md as the only required reading. It keeps every binding rule of the current contract:
  - authority and provider-state checks
  - the queue rules and what "do needful" means
  - controlled delivery and the merge gates
  - the forbidden history and protection changes
  - credentials, pins and the release boundary

  "Read before editing" becomes lookups: the first open task's block, the commit body format in `docs/CHANGE-MANAGEMENT.md`, README's command map, and `docs/ARCHITECTURE.md` sections by heading. The guide adds rules for keeping sessions cheap. Update the AGENTS.md hash in `scripts/check-portfolio-contract.mjs`; by owner direction, RigLab's guide then diverges from the shared portfolio template. Remove this task, leaving the permanent empty-queue template.
- Non-goals: CONTRIBUTING.md and its pinned hash, README.md, other docs, code, CI, settings and releases.
- Acceptance: AGENTS.md is under 5,000 characters, names no document as required reading, and states every binding rule listed in Scope. Each lookup command in it works on the delivering commit. `npm run check` passes with the new hash, and `implementation_plan.md` matches the pinned empty template again.
- Validation: Pinned `npm ci`, `npm run check`, `npm run audit:dependencies`, `check:patch`, `git diff --check`, and exact-head CI.
- Authorities: `AGENTS.md`, `scripts/check-portfolio-contract.mjs`, `docs/CHANGE-MANAGEMENT.md`, and the owner's direction on 2026-10-20.
