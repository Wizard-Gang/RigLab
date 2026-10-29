# Implementation plan

## Open tasks

### RL-068 — [OPS] Adopt baseline's shared delivery contract

- Dependency: baseline release r002 (BASE-045 and BASE-046) merged to baseline `main`. Owner ruling of 2026-10-29: "queue up the not planned tasks in the corresponding pr after the releases".
- Why: On `origin/main` on 2026-10-29, RigLab's delivery scripts, launcher and workflows had drifted into a copy that differs from baseline's and the other labs', which exist in two to four versions each. Baseline's `AGENTS.md` says every repository carries it byte for byte, yet RigLab's `scripts/check-portfolio-contract.mjs` pins its own `AGENTS.md` and `CONTRIBUTING.md` hashes. BASE-045 and BASE-046 host one shared copy of the scripts under a pinned `contract/` lock.
- Scope:
  - Vendor `contract/` from the merged baseline commit with its `contract/vendor.lock.json`. Replace RigLab's forked copies of the scripts that lock lists (in `scripts/` today: `change-contract`, `check-change`, `check-patch`, `check-portfolio-contract`, `check-release`, `release-contract`, `publish-release`, `repository-contract`, `check-repository`, `check-workflow-shell`, `workflow-yaml`, `github-repository-settings` and the apply and verify settings scripts) with it.
  - RigLab's values live in `config/`: ID prefix `RL`, last direct-to-main task RL-058, the seven plan fields, the release workflow, and the repository name, in the file the shared scripts read (`config/delivery.json` in BASE-046's PR #50). `config/release.json` and `config/github-repository-settings.json` keep their shape and values.
  - Package script names stay (`check:gate`, `check:change`, `check:patch`, `check:release`, `check:repository`, `check:workflow-shell`, `test:plan-queue`, `verify:github-settings`, `apply:github-settings`) and point at `contract/`. `release.yml`'s paths to `check-release.mjs` and `publish-release.mjs` follow the move, and nothing else in any workflow changes.
  - Carry baseline's `AGENTS.md` and `CONTRIBUTING.md` byte for byte. Move RigLab's invariants out of `AGENTS.md` into `README.md`: the library folder is the only source of the rig and animations, tests use `placeholder-library/`, a worktree's dev server takes its own `RIGLAB_PORT` and `RIGLAB_LIBRARY`, and RigLab stays local-only with no production. Drop RigLab's "Keep sessions cheap" section, because the owner rulebook covers it.
  - Tests that cover only shared scripts follow baseline's choice for where they live. RigLab keeps tests of its config and its own rules.
  - The Hexframe pin (`vendor/hexframe/lock.json`, `check:vendor`, `vendor:hexframe`) is a different lock and stays as it is. `check:gate` runs both.
- Non-goals: No change to any rule RigLab enforces, to required check names, to rulesets or to the strict current-with-base policy. A RigLab rule the shared scripts cannot express in config is named for an owner ruling, not forked again. No launcher, `.gitignore` or `.claude/` change (RL-069) and no workflow-file change beyond `release.yml`'s two script paths (RL-070). No release is cut by this task.
- Acceptance: The conformance `pin` check passes against `contract/vendor.lock.json`. RigLab's gate, change-id and verify decide as before on its own history and config. `AGENTS.md` and `CONTRIBUTING.md` match baseline's hashes. `config/github-repository-settings.json` is unchanged.
- Validation: Pinned `npm ci`, `npm run check:gate`, `check:change`, `check:repository`, `check:patch`, `npm run audit:dependencies` and `git diff --check`. One dispatched `verify.yml` run for the moved contract tests. No local test runs.
- Authorities: baseline's `contract/`, `contract/vendor.lock.json`, `AGENTS.md` and `CONTRIBUTING.md` at the merged commit, and BASE-046's task block. In RigLab: the scripts above, `config/`, `tests/contracts/`, `package.json`, `.github/workflows/release.yml`, `docs/CHANGE-MANAGEMENT.md` and `docs/RELEASE-MANAGEMENT.md`.

### RL-069 — [OPS] Adopt baseline's dev launcher and track the launch config

- Dependency: RL-068, and BASE-047 released to baseline `main`.
- Why: `scripts/dev.mjs` and `scripts/dev-lifecycle.mjs` are one of three differing copies of the `npm start` launcher across the labs. `.gitignore` ignores all of `.claude/`, so `.claude/launch.json` cannot be tracked. The owner's untracked copy puts Node on `PATH` from `/private/tmp` and an absolute checkout path, so it breaks when macOS clears `/private/tmp`.
- Scope:
  - Re-vendor `contract/` from the baseline commit that carries BASE-047 and update `contract/vendor.lock.json`. Replace `scripts/dev.mjs`, `scripts/dev-lifecycle.mjs` and `tests/contracts/dev-lifecycle.test.mjs` with the vendored launcher. `npm start` and `npm run dev` keep working.
  - RigLab's launcher values go in `config/`: repository name, `RIGLAB_PORT` with default 5180, `RIGLAB_NO_OPEN`, and the build against the library folder (`RIGLAB_LIBRARY`). The reset paths (`dist/`, `node_modules/.vite/`, `tmp/dev/`) and the install and build steps the README lists must be expressible there or named for an owner ruling.
  - `.gitignore` ignores only `.claude/worktrees/` and `.claude/settings.local.json`. Track a `.claude/launch.json` whose `riglab` entry runs `npm start` on port 5180 with no absolute or `/tmp` path.
  - The README's "Run locally" section describes the vendored launcher and gives the owner-run steps for the pinned Node outside `/tmp`, as BASE-047 specifies.
- Non-goals: No change to the default port, the library folder resolution, the Vite config or the library plugin's restart behavior. No toolchain beyond the pinned Node and npm. The owner's workspace `~/Documents/.claude/launch.json` is theirs to fix.
- Acceptance: The launcher replaces a running server on its port, honors `RIGLAB_PORT` and `RIGLAB_NO_OPEN`, and stops what it started on Ctrl-C or `SIGTERM`. `git check-ignore` ignores `.claude/worktrees/` and `.claude/settings.local.json` but not `.claude/launch.json`. The shared repository contract and `pin` pass.
- Validation: The RL-068 set. One `npm start` run in a scratch worktree on a spare `RIGLAB_PORT` with `RIGLAB_NO_OPEN=1` serves the editor and stops cleanly. One dispatched `verify.yml` run.
- Authorities: BASE-047's task block and baseline's vendored launcher; in RigLab, `scripts/dev.mjs`, `scripts/dev-lifecycle.mjs`, `.gitignore`, `.claude/launch.json` and README "Run locally" and "Command map".

### RL-070 — [OPS] Adopt baseline's CI shape

- Dependency: RL-068, and BASE-048 released to baseline `main`.
- Why: RigLab's `gate.yml`, `change.yml` and `verify.yml` are the same shape as RenderLab's and differ from MapLab's and baseline's (BASE-048), so three shapes carry the same required checks.
- Scope: Replace RigLab's gate, change-id, verify and security workflow files with baseline's pinned files under the lock, with required check names `gate`, `change-id`, `verify` and `security` unchanged. RigLab-specific steps (library fixtures, build) run through package scripts, not workflow edits. `check:workflow-shell` accepts the shared files.
- Non-goals: No change to `release.yml` or `release-cutter.yml`, to required checks, rulesets or the strict current-with-base policy, or to any other repository.
- Acceptance: A RigLab task PR into the release branch and the release PR into `main` pass on the new files with the same required check names. A workflow that differs from its lock fails `pin`. `npm run verify:github-settings`, when a token is supplied at runtime, reads back unchanged settings.
- Validation: The RL-068 set plus `check:workflow-shell`, exact-head CI, and the `verify:github-settings` read-back.
- Authorities: BASE-048's task block, baseline's `.github/workflows/` at the merged commit; in RigLab, `.github/workflows/`, `config/github-repository-settings.json` and `docs/RELEASE-MANAGEMENT.md`.
