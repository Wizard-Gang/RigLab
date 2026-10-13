# Implementation plan

## Open tasks

### RL-008 — [FEAT] Export, validate and re-import riglab-export bundles

- Dependency: None.
- Why: Consumers need versioned files they can trust. Some will evaluate keys themselves; others only draw solved transforms.
- Scope: An Export mode beside Rig setup, Pose and Animation. A `riglab-export/` bundle holding `manifest.json` (format, version, generator, and every file with its SHA-256), `<rig>.rig.json`, `animations/<name>.anim.json`, and optional `baked/<name>.baked.json` with per-frame world transforms from `samplePose` and FK. Export writes a directory through the File System Access API when available, and otherwise a store-only zip built without a new dependency. Import verifies the manifest, the hashes, the rig and animation references, and the format versions before replacing the document.
- Non-goals: Rendered SVG or video output, a Hexframe-specific format (RL-010).
- Acceptance: An export followed by an import is deep-equal. Baked frames equal `samplePose` plus FK. A tampered hash, an unknown version or a missing reference is refused with its path. `npm run check` passes.
- Validation: Pinned `npm ci`, focused export and import tests, `npm run check`, `npm run audit:dependencies`, `check:patch`, `git diff --check`, a local browser pass, and exact-head CI.
- Authorities: `src/format/`, `docs/ARCHITECTURE.md`.

### RL-009 — [TEST] Prove the spear-thrust acceptance path

- Dependency: RL-008.
- Why: This is the recommendation's first end-to-end acceptance test, and it should stay executable.
- Scope: One automated test. It imports Hexframe's humanoid, lengthens the forearms in Rig Setup, and authors a three-key spear thrust: a wind-up with the elbows back, a transition with the elbows centered, and an extension with the hands pushed forward. It exports the bundle, reloads it, and checks that every joint stays connected, every limb length is identical on every frame, and the reloaded playback matches the original.
- Non-goals: New editor features.
- Acceptance: The test passes in `npm run check` and fails if lengths drift, a joint disconnects or playback differs.
- Validation: Pinned `npm ci`, the acceptance test, `npm run check`, `npm run audit:dependencies`, `check:patch`, `git diff --check` and exact-head CI.
- Authorities: The RigLab recommendation's acceptance test, `src/format/`, `src/solve/`.

### RL-010 — [FEAT] Add the Hexframe consumer adapter and art overlay

- Dependency: RL-009.
- Why: Hexframe stays a consumer. The same humanoid motion should drive its fighter without reauthoring, and SVG art should attach at exported pivots instead of defining the skeleton.
- Scope: An adapter that turns a RigLab rig and animation into Hexframe's `fighter.rig.json` shape and 13-pose clip at its 60 Hz duration. Hold transitions are approximated, and the frames that differ are reported. The output is validated with the vendored `createRig` and `sampleClip`. A canvas overlay draws Hexframe's 11 part SVGs on their slots: the lock is extended to vendor the parts, which are parsed as data with no markup injection.
- Non-goals: Changing Hexframe. Hexframe adopts the adapter through its own HF task.
- Acceptance: A Hexframe clip round-trips through import and the adapter, and Hexframe's sampler matches the original within 1e-9. A three-key hold animation reports its approximated frames. The overlay places each part at its bone's FK transform. `npm run check` passes.
- Validation: Pinned `npm ci`, focused adapter tests, `npm run check`, `npm run audit:dependencies`, `check:patch`, `git diff --check`, a local browser pass, and exact-head CI.
- Authorities: `vendor/hexframe/`, `src/format/`, Hexframe's `docs/ARCHITECTURE.md`.

### RL-011 — [BUILD] Release v0.2.0

- Dependency: RL-010.
- Why: The editor, constraints, timeline, export bundle and Hexframe adapter form the first complete authoring release.
- Scope: Set `package.json` and `package-lock.json` to 0.2.0. Merging lets Release Cutter tag `v0.2.0` and dispatch the reproduced, attested, immutable Release.
- Non-goals: Desktop packaging, deployment.
- Acceptance: The tag `v0.2.0` is annotated at the accepted commit, and the Release has `riglab-v0.2.0.tar.gz`, `SHA256SUMS` and a verified attestation. `npm run check` passes.
- Validation: Pinned `npm ci`, `npm run check`, `npm run audit:dependencies`, `npm run verify:github-settings`, `check:patch`, `git diff --check`, exact-head CI, and the post-merge Release Cutter and Release runs.
- Authorities: `docs/RELEASE-MANAGEMENT.md`, `config/github-repository-settings.json`.

### RL-012 — [BUILD] Package RigLab as a Tauri 2 desktop app

- Dependency: RL-011. The owner installs a pinned Rust toolchain on the Mac first; none is installed today.
- Why: Native open, save and folder dialogs and direct filesystem access fit the Paint-style workflow better than browser fallbacks.
- Scope: A `src-tauri/` Tauri 2 shell around the same Vite client, with native dialogs and filesystem access behind the existing file-command interface. `npm run desktop` for development and `npm run desktop:build` for a local bundle. CI typechecks the shell with a pinned toolchain. The repository contract admits the shell and keeps the no-deploy boundary.
- Non-goals: Code signing, notarization, auto-update, store distribution.
- Acceptance: `npm start` still runs the browser editor. `npm run desktop` opens the same editor with native dialogs. Every RL-008 file still round-trips. `npm run check` passes.
- Validation: Pinned `npm ci`, the pinned Rust toolchain, `npm run check`, `npm run audit:dependencies`, `check:patch`, `git diff --check`, a local desktop pass, and exact-head CI.
- Authorities: `docs/ARCHITECTURE.md`, `scripts/repository-contract.mjs`.
