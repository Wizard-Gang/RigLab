# Implementation plan

## Open tasks

### RL-021 — [FEAT] Pick, pose and draw weapons in the editor

- Dependency: None; the weapon format, the four weapons and their ready holds are in place.
- Why: Holding a weapon has to be an editor action, and the canvas has to show and move what is held.
- Scope: In Pose mode the right panel offers a Weapon picker (None, Sword, Spear, Axe, Daggers) for the key at the current frame, with or without a selected bone. Picking a weapon binds the hands to its grips and places each free body at its ready hold (`readyHold` in `src/weapons/weapons.ts`), carried with the body when the pelvis has moved. It also copies the weapon rig into the document's `weapons`, drops copies no key holds, re-solves, and reports in the status bar any grip out of reach. None lets go. A free body gets move and turn handles on the canvas, and dragging a hand that grips it carries it, as the prop does today. Riding bodies follow their hands. The weapon picker replaces Hold a prop and Grip prop in the pose inspector. An old document's prop still draws, moves and turns, and can be let go. The art layer draws weapon parts from the `weapons` set at each body's transform. Each body paints just under the topmost forearm that grips it, in Hexframe's paint order. With Art off, each body draws as a line along its axis. Undo restores the previous hold in one step. Docs describe it.
- Non-goals: Export and bake (RL-022), editing weapon rigs in the app, and depth profiles beyond facing right.
- Acceptance: Reducer tests pick each weapon on a key and undo it, refuse a pick between keys the same way a pose drop there is refused, keep the document valid, and drop unused weapon copies. A canvas-drag test moves and turns a free body with both hands following, and an out-of-reach move is reported without stretching. A browser pass shows the chibi holding each weapon with Art on and off, with no console errors. `npm run check` passes.
- Validation: Pinned `npm ci`, focused editor and viewer tests, `npm run check`, `npm run audit:dependencies`, `check:patch`, `git diff --check`, a headless Chrome pass on a worktree dev server, and exact-head CI.
- Authorities: `src/app/PoseInspector.tsx`, `src/app/useCanvasDrags.ts`, `src/viewer/RigCanvas.tsx`, `src/viewer/ArtLayer.tsx`, `src/hexframe/art.ts`, `src/editor/poseEdits.ts`, `docs/ARCHITECTURE.md`, and owner direction on 2026-10-13.

### RL-022 — [FEAT] Export and bake weapon transforms, with an acceptance test per weapon

- Dependency: RL-021.
- Why: Consumers need the weapons along with the motion, and each weapon needs an end-to-end proof like the spear thrust.
- Scope: An export bundle writes each document weapon as `weapons/<name>.weapon.json` and lists it with its SHA-256 in an optional manifest `weapons` list. Import verifies those files like every other file and validates animations against the bundled weapons; bundles without weapons read as before. A baked file records each body's world `[x, y, rotation°]` by name, riding bodies included, on every frame that holds a weapon, next to the existing prop entries. The Hexframe clip export carries the held poses and reports that weapon transforms are left out, because Hexframe's clip has no channel for them. `tests/acceptance/weapons.test.ts` drives the editor's reducer once per weapon. The chibi holds the weapon with both feet pinned through an attack's four keys, then exports with baked frames, zips, unzips and reloads.
- Non-goals: Weapon support in Hexframe itself, formats beyond optional fields, and weapon physics.
- Acceptance: For each of the four weapons, the reloaded document equals the original and re-baking equals the exported bake. On every frame, every bone keeps its rest length and offset (to 1e-5), both feet stay on their pins, and each dagger stays on its hand along its forearm. Each free body's grips sit on their hands at the 13 pose frames to 1e-5, and within half a unit between them, where Hexframe interpolates joint angles rather than grips. Hexframe's sampler on the exported clip places every bone where RigLab baked it. Old bundles, and documents with props, still import and bake as before. `npm run check` passes.
- Validation: Pinned `npm ci`, focused export and acceptance tests, `npm run check`, `npm run audit:dependencies`, `check:patch`, `git diff --check`, a browser export and re-import, and exact-head CI.
- Authorities: `src/export/bundle.ts`, `src/export/bake.ts`, `src/hexframe/adapter.ts`, `tests/acceptance/spear-thrust.test.ts`, `docs/ARCHITECTURE.md`, and owner direction on 2026-10-13.
