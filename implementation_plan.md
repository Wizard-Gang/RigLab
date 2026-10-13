# Implementation plan

## Open tasks

### RL-012 — [BUILD] Package RigLab as a Tauri 2 desktop app

- Dependency: The owner installs a pinned Rust toolchain on the Mac first; none is installed today.
- Why: Native open, save and folder dialogs and direct filesystem access fit the Paint-style workflow better than browser fallbacks.
- Scope: A `src-tauri/` Tauri 2 shell around the same Vite client, with native dialogs and filesystem access behind the existing file-command interface. `npm run desktop` for development and `npm run desktop:build` for a local bundle. CI typechecks the shell with a pinned toolchain. The repository contract admits the shell and keeps the no-deploy boundary.
- Non-goals: Code signing, notarization, auto-update, store distribution.
- Acceptance: `npm start` still runs the browser editor. `npm run desktop` opens the same editor with native dialogs. Every RL-008 file still round-trips. `npm run check` passes.
- Validation: Pinned `npm ci`, the pinned Rust toolchain, `npm run check`, `npm run audit:dependencies`, `check:patch`, `git diff --check`, a local desktop pass, and exact-head CI.
- Authorities: `docs/ARCHITECTURE.md`, `scripts/repository-contract.mjs`.
