# Implementation plan

## Open tasks

### RL-003 — [FEAT] Add the editor document, canvas and file commands

- Dependency: None.
- Why: Authoring needs a document with undo history and Paint-style file handling before any editing tool can land.
- Scope:
  - A document holding one `riglab.rig` and its `riglab.anim` set, plus editor state: mode (Rig setup, Pose, Animation, Export), selection, active animation and frame, grid spacing, snap toggle and rotation-snap increment. Edits go through a pure reducer with bounded undo and redo.
  - New (from the imported Hexframe humanoid), Open, Save and Save As with the File System Access API when the browser offers it, and file input and download otherwise. Opening validates with `validateRig` and `validateAnimation` and reports the first failing path.
  - Canvas zoom and pan, adjustable grid spacing and snap toggle, joint selection on the canvas and in the hierarchy, a read-only inspector and a status bar.
  - Keyboard shortcuts: New, Open, Save, Save As, Undo, Redo, Delete and Escape, using Cmd on macOS and Ctrl elsewhere.
- Non-goals: Changing bones or poses (RL-004 to RL-006), timeline editing (RL-007), export bundles (RL-008).
- Acceptance: Reducer tests cover every command and undo/redo depth. A saved document reopens deep-equal. An invalid file is refused with its failing path and leaves the open document untouched. `npm run check` passes.
- Validation: Pinned `npm ci`, focused reducer and file tests, `npm run check`, `npm run audit:dependencies`, `check:patch`, `git diff --check`, a local browser pass of every command, and exact-head CI.
- Authorities: `docs/ARCHITECTURE.md`, `src/format/`.

### RL-004 — [FEAT] Edit anatomy in Rig Setup mode

- Dependency: RL-003.
- Why: Proportions belong to the rig, not to poses. Only Rig Setup may change them.
- Scope: Drag a joint to move its rest offset (snapped to the grid when snap is on). Edit offsets, tips, slots and names numerically. Add a child joint, and delete a joint with its subtree. Set per-bone angle limits and per-chain bend direction, and define chains. Every edit is validated by `validateRig` and Hexframe's `createRig` before it is committed to the document.
- Non-goals: Pose editing, IK, a parent-change tool.
- Acceptance: Tests show that setup edits change only rest data, that invalid edits are refused with a message, and that undo restores the exact prior rig. Pose and Animation modes expose no control that changes an offset or tip. `npm run check` passes.
- Validation: Pinned `npm ci`, focused setup-reducer tests, `npm run check`, `npm run audit:dependencies`, `check:patch`, `git diff --check`, a local browser pass, and exact-head CI.
- Authorities: `src/format/`, `docs/ARCHITECTURE.md`.

### RL-005 — [FEAT] Pose joints with fixed lengths, angle limits and two-bone IK

- Dependency: RL-004.
- Why: Dragging a wrist or ankle must bend the elbow or knee naturally without stretching a limb. This is the constraint gap that Hexframe's pose overrides leave open.
- Scope:
  - A pure solver under `src/solve/`. Rotation-only FK posing for every non-root bone, and root translation. An analytic two-bone IK for each chain that keeps both segment lengths, honors the chain's bend direction, and clamps to the bones' angle limits. Rotation snapping.
  - Constraint priority: connectivity and fixed lengths, then angle limits and bend direction, then grid snap of the drag target where feasible. An unreachable target leaves the limb at its closest reach and is reported in the status bar, never by stretching.
  - Canvas dragging in Pose mode: rotate about the parent for FK joints, solve IK when a chain end is dragged, translate the root.
- Non-goals: Pins and grips (RL-006), keyframes (RL-007).
- Acceptance: Property tests over random targets show segment lengths unchanged to 1e-9, limits never exceeded, and bend sign preserved. Reachable targets are hit to 1e-6; unreachable ones are flagged. `npm run check` passes.
- Validation: Pinned `npm ci`, focused solver tests, `npm run check`, `npm run audit:dependencies`, `check:patch`, `git diff --check`, a local browser pass, and exact-head CI.
- Authorities: `src/format/`, `docs/ARCHITECTURE.md`.

### RL-006 — [FEAT] Plant feet and hold two-handed grips

- Dependency: RL-005.
- Why: Lunges need planted feet and deliberate pelvis movement instead of collapsing. Two-handed axe swings need both hands to stay on one rigid weapon.
- Scope: Pins that lock a chain end to a world point and re-solve that chain whenever the root or an ancestor moves. A rigid weapon attachment with two grip points that both arm chains solve to, moved and rotated as one body. Violations are reported when a pin or grip cannot be held within limits. Pins and grips are stored with the pose and the animation key.
- Non-goals: Physics, collision, more than two hands on one prop.
- Acceptance: Moving the pelvis with both feet pinned keeps each foot within 1e-6 while it is reachable and reports it when not. Moving the weapon keeps both grips solved or reports which arm cannot reach. `npm run check` passes.
- Validation: Pinned `npm ci`, focused constraint tests, `npm run check`, `npm run audit:dependencies`, `check:patch`, `git diff --check`, a local browser pass, and exact-head CI.
- Authorities: `src/solve/`, `src/format/`.

### RL-007 — [FEAT] Author animations on a variable keyframe timeline

- Dependency: RL-006.
- Why: A spear thrust may need only three poses. The author decides how long each pose holds, without a 13-pose requirement or forced interpolation.
- Scope: A timeline panel with integer frames at the animation's fps (default 14), clip length and loop. Add a key from the current pose, duplicate the frame, delete and move keys, and set each transition to hold (default), linear or smoothstep. Playback and scrubbing through `sampleAnimation`. Optional onion skins of the previous and next keys. A key is edited with the RL-005 and RL-006 tools.
- Non-goals: Per-bone curve editing, audio.
- Acceptance: Timeline reducer tests for every command. A three-key animation plays over its full length exactly as `sampleAnimation` samples it. Undo covers timeline edits. `npm run check` passes.
- Validation: Pinned `npm ci`, focused timeline tests, `npm run check`, `npm run audit:dependencies`, `check:patch`, `git diff --check`, a local browser pass, and exact-head CI.
- Authorities: `src/format/`, `docs/ARCHITECTURE.md`.

### RL-008 — [FEAT] Export, validate and re-import riglab-export bundles

- Dependency: RL-007.
- Why: Consumers need versioned files they can trust. Some will evaluate keys themselves; others only draw solved transforms.
- Scope: A `riglab-export/` bundle holding `manifest.json` (format, version, generator, and every file with its SHA-256), `<rig>.rig.json`, `animations/<name>.anim.json`, and optional `baked/<name>.baked.json` with per-frame world transforms from the same sampler and FK. Export writes a directory through the File System Access API when available, and otherwise a store-only zip built without a new dependency. Import verifies the manifest, the hashes, the rig and animation references, and the format versions before replacing the document.
- Non-goals: Rendered SVG or video output, a Hexframe-specific format (RL-010).
- Acceptance: An export followed by an import is deep-equal. Baked frames equal sampler plus FK. A tampered hash, an unknown version or a missing reference is refused with its path. `npm run check` passes.
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
