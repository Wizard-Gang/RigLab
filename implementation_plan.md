# Implementation plan

## Open tasks

### RL-022 — [FEAT] Export and bake weapon transforms, with an acceptance test per weapon

- Dependency: None; the editor holds, poses and draws all four weapons.
- Why: Consumers need the weapons along with the motion, and each weapon needs an end-to-end proof like the spear thrust.
- Scope: An export bundle writes each document weapon as `weapons/<name>.weapon.json` and lists it with its SHA-256 in an optional manifest `weapons` list. Import verifies those files like every other file and validates animations against the bundled weapons; bundles without weapons read as before. A baked file records each body's world `[x, y, rotation°]` by name, riding bodies included, on every frame that holds a weapon, next to the existing prop entries. The Hexframe clip export carries the held poses and reports that weapon transforms are left out, because Hexframe's clip has no channel for them. `tests/acceptance/weapons.test.ts` drives the editor's reducer once per weapon. The chibi holds the weapon with both feet pinned through an attack's four keys, then exports with baked frames, zips, unzips and reloads.
- Non-goals: Weapon support in Hexframe itself, formats beyond optional fields, and weapon physics.
- Acceptance: For each of the four weapons, the reloaded document equals the original and re-baking equals the exported bake. On every frame, every bone keeps its rest length and offset (to 1e-5), both feet stay on their pins, and each dagger stays on its hand along its forearm. Each free body's grips sit on their hands at the 13 pose frames to 1e-5, and within half a unit between them, where Hexframe interpolates joint angles rather than grips. Hexframe's sampler on the exported clip places every bone where RigLab baked it. Old bundles, and documents with props, still import and bake as before. `npm run check` passes.
- Validation: Pinned `npm ci`, focused export and acceptance tests, `npm run check`, `npm run audit:dependencies`, `check:patch`, `git diff --check`, a browser export and re-import, and exact-head CI.
- Authorities: `src/export/bundle.ts`, `src/export/bake.ts`, `src/hexframe/adapter.ts`, `tests/acceptance/spear-thrust.test.ts`, `docs/ARCHITECTURE.md`, and owner direction on 2026-10-13.
