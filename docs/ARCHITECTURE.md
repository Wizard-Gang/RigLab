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

## RigLab formats

`src/format/` defines RigLab's portable, versioned contract. Both validators are closed: an unknown field, bone or value fails with the JSON path it names.

- **`riglab.rig` version 1** keeps Hexframe's rig contract fields (`space`, `root`, and bones with `name`, `parent`, `offset`, `tip`, `slot`, `artHeight` and `hand`) and adds a `format`/`version` header, a `name`, nullable per-bone angle `limits` (`min`/`max` local degrees) and two-bone `chains`. A chain's `lower` bone hangs off its `upper` bone: the upper segment is `lower.offset`, the lower segment is `lower.tip`, and `bend` (`1` or `-1`) is the sign of `lower`'s local rotation away from straight. The space must be SVG units, x right, y down and rotation clockwise-positive, because the FK math assumes it. `depthProfiles` is optional consumer layering data in Hexframe's shape. Every valid RigLab rig resolves through Hexframe's own `createRig`.
- **`riglab.anim` version 1** names its rig and carries an integer `fps` (default 14), a `length` in frames, `loop`, and sparse keys at integer frames from 0 to `length`. Each key holds a full Hexframe pose, with a rotation for every bone and `x`/`y` on the root only, so no pose can stretch a limb. Its `interpolation` (`hold`, `linear` or `smoothstep`) shapes the transition to the next key.
- **`sampleAnimation(animation, frame)`** is the single deterministic sampler. A looping animation samples `frame mod length`, and its last key runs to key 0 at `length`. A non-looping animation clamps to `[0, length]` and holds its last key. Blending uses Hexframe's `start + (end - start) * progress`.

`src/hexframe/import.ts` imports Hexframe data losslessly. Rig import finds the two-bone chains structurally (a tipped bone whose non-root parent has no other child) and takes their bends from the caller. `src/hexframe/humanoid.ts` gives arms `-1` and legs `+1`, because the fighter faces right. Clip import uses the smallest frame rate that puts all 13 poses on integer frames (`60 × 12 / gcd(duration, 12)`, at most 720). `tests/format/hexframe-import.test.ts` shows that every imported clip reproduces Hexframe's `sampleClip` on every frame, including loop wraps. A clip whose poses carry different channel sets, or that translates a non-root bone, is refused rather than approximated.

## Source layout

| Path | Responsibility |
| --- | --- |
| `vendor/hexframe/` | Pinned Hexframe rig core and fighter data. |
| `src/format/` | The `riglab.rig` and `riglab.anim` types, their closed validators and the shared sampler. |
| `src/hexframe/` | Loads the vendored rig and clips through Hexframe's own `createRig` and imports them as the RigLab `humanoid`. |
| `src/viewer/` | Skeleton geometry from FK placements, the SVG rig canvas with its grid, the bone hierarchy, and integer-frame playback. |
| `src/app/` | The application shell and its stylesheet. |
| `tests/rig/`, `tests/format/` | Vitest suites for the rig model, viewer geometry, formats, sampler and Hexframe import. |
| `tests/contracts/` | Node test suites for the repository's delivery contracts. |
| `scripts/` | Controlled-change, repository, vendor, settings and release contracts and their commands. |

The application is a React client rendered to native SVG and served by Vite. It needs no server, account or credential; `npm start` runs it locally.
