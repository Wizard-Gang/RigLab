# Architecture

RigLab authors skeletons and motion, not character artwork. Its rig model is Hexframe's: RigLab vendors Hexframe's rig core and fighter data byte-for-byte and builds on them, so a skeleton or pose authored here is placed by exactly the code Hexframe draws with.

## The Hexframe rig model

`vendor/hexframe/` mirrors these Hexframe repository paths at the commit pinned in `vendor/hexframe/lock.json`:

- `src/rig/` — rig contract types, `createRig` (single root, no cycles, every bone reached), `hierarchyOrder`, `forwardKinematics`, `inBone`, the 13-pose clip type and `sampleClip`, depth profiles and paint order.
- `characters/fighter/fighter.rig.json` — the 11-bone humanoid.
- `characters/fighter/clips/` — the 13 clips Hexframe plays.

The conventions that follow from that code:

- **Space.** SVG units, x right, y down, rotation clockwise-positive. The humanoid stands 104 units tall with its feet near y = 0.
- **Parent-relative transforms.** Each bone's `offset` is its joint position in its parent's frame; the root's offset is in rig space. `tip`, when present, is the bone's end point in its own frame.
- **Forward kinematics.** A bone's world rotation is its parent's world rotation plus its local rotation (degrees in a pose, radians once placed). Its world position is the parent's position plus the parent-rotated sum of its offset and any local translation.
- **Proportions.** Limb and segment lengths are the lengths of child offsets and tips. Hexframe's clips translate only the root (`pelvis.y`), so every limb keeps its rest length on every frame; `tests/rig/hexframe-rig.test.ts` proves that for all 13 clips.
- **Clips.** A Hexframe clip is 13 evenly spaced poses over `duration` frames of Hexframe's 60 Hz clock, eased `linear` or `smoothstep` between neighbours.

Nothing under `vendor/` is edited in place. `npm run vendor:hexframe -- <hexframe-checkout> <commit>` re-vendors from a commit's Git objects and rewrites the lock; `npm run check:vendor` (part of `npm run check`) fails on any edited, missing or unpinned file.

## Source layout

| Path | Responsibility |
| --- | --- |
| `vendor/hexframe/` | Pinned Hexframe rig core and fighter data. |
| `src/hexframe/` | Loads the vendored rig and clips through Hexframe's own `createRig`. |
| `src/viewer/` | Skeleton geometry from FK placements, the SVG rig canvas with its grid, the bone hierarchy, and integer-frame playback. |
| `src/app/` | The application shell and its stylesheet. |
| `tests/rig/` | Vitest suites for the rig model and viewer geometry. |
| `tests/contracts/` | Node test suites for the repository's delivery contracts. |
| `scripts/` | Controlled-change, repository, vendor, settings and release contracts and their commands. |

The application is a React client rendered to native SVG and served by Vite. It needs no server, account or credential; `npm start` runs it locally.
