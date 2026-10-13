# Architecture

RigLab authors skeletons and motion, not character artwork. Its rig model is Hexframe's: RigLab vendors Hexframe's rig core and fighter data byte-for-byte and builds on them, so a skeleton or pose authored here is placed by exactly the code Hexframe draws with.

## The Hexframe rig model

`vendor/hexframe/` mirrors these Hexframe repository paths at the commit pinned in `vendor/hexframe/lock.json`:

- `src/rig/` — rig contract types, `createRig` (single root, no cycles, every bone reached), `hierarchyOrder`, `forwardKinematics`, `inBone`, the 13-pose clip type and `sampleClip`, depth profiles and paint order.
- `characters/fighter/fighter.rig.json` — the 11-bone humanoid.
- `characters/fighter/clips/` — the 13 clips Hexframe plays.
- `characters/fighter/parts/` — the fighter's 11 machine-generated part SVGs.

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
- **Key constraints.** A key may carry `pins` (a chain end held at a world point, such as a planted foot) and one `prop` (a rigid body with a name, position, rotation and one or two `grips`, each holding a chain end at a point in the prop's frame). A chain end is pinned or gripped, never both, and every chain must exist in the rig.
- **`sampleAnimation(animation, frame)`** interpolates key poses deterministically. A looping animation samples `frame mod length`, and its last key runs to key 0 at `length`. A non-looping animation clamps to `[0, length]` and holds its last key. Blending uses Hexframe's `start + (end - start) * progress`.
- **`samplePose(rig, animation, frame)`** (in `src/solve/constraints.ts`) is what preview and bake use. It samples the key poses, then holds the frame's constraints, re-solving every pinned or gripped chain by IK. Pins and the prop move between keys with the same segment and easing as the pose, and hold still when only the key in force has them. An animation with no constraints samples exactly as `sampleAnimation` does.

`src/hexframe/import.ts` imports Hexframe data losslessly. Rig import finds the two-bone chains structurally (a tipped bone whose non-root parent has no other child) and takes their bends from the caller. `src/hexframe/humanoid.ts` gives arms `-1` and legs `+1`, because the fighter faces right. Clip import uses the smallest frame rate that puts all 13 poses on integer frames (`60 × 12 / gcd(duration, 12)`, at most 720). `tests/format/hexframe-import.test.ts` shows that every imported clip reproduces Hexframe's `sampleClip` on every frame, including loop wraps. A clip whose poses carry different channel sets, or that translates a non-root bone, is refused rather than approximated.

## Editor

The editor is a pure state machine in `src/editor/state.ts`. Its document is a `riglab.document` (version 1): one `riglab.rig` and the `riglab.anim` animations authored against it, validated as a whole by `validateDocument`, with every nested message re-rooted at its document path. Document edits go through a bounded snapshot history (`src/editor/history.ts`, 100 steps); selection, mode, frame, view, grid and snap stay outside it. The editor tracks the document as last created, opened or saved, so it is unsaved exactly when the present snapshot differs.

- **Modes.** Rig setup shows the rest pose. Pose scrubs the active animation without playing it. Animation plays it at its own frame rate. Export plays it too, beside the export panel.
- **Selection.** One selection: a bone, an animation or a key. Delete removes a selected animation, a selected key (never the first), or the selected joint and its subtree in Rig setup. Escape clears the selection.
- **Timeline.** In Pose and Animation modes the timeline (`src/editor/timeline.ts`, `src/app/Timeline.tsx`) shows the active animation's integer frames at its own rate (14 fps by default), its keys and a playhead. It adds a key holding what the frame shows (pose, pins and prop), duplicates the key in force onto the next frame, deletes keys, and moves a key by dragging it to a free frame (the first key stays at frame 0). It sets each key's transition to hold (the default for new animations), linear or smooth, and sets the rate, the length (never before the last key) and looping. Each of these is one undo step. Arrows step frames, Shift+arrows step keys and Space plays. Onion skins draw the previous and next keys as faint skeletons. Preview and playback show `samplePose`, so what plays is exactly what the sampler produces.
- **Rig setup.** Only Rig setup changes anatomy: the reducer refuses a rig edit in any other mode. `src/editor/rigEdits.ts` moves a joint (dragged on the canvas, snapped in rest space and stored as an offset in its parent's frame, or typed), sets tips, slots and names, adds a child joint, deletes a joint with its subtree, sets angle limits and adds, removes or re-bends chains. Every edit must leave the whole document valid. Renaming a bone renames it in parents, chains, depth profiles and every animation key; deleting one drops it from chains and keys, and drops depth profiles that would name a deleted bone. Pose values never change.
- **Files.** `src/editor/files.ts` (documents) and `src/editor/bundleFiles.ts` (export bundles) use the File System Access API when the browser offers it, and a file input and a download otherwise. Opening parses and validates before anything changes, and a refusal names the first failing path. New starts from the humanoid with its 13 reference animations.
- **View.** `src/editor/view.ts` keeps zoom and pan in rig units. The wheel zooms about the cursor, dragging empty canvas pans, and zoom 1 fits the rig's viewBox plus a margin. Grid lines sit on multiples of the spacing, and minor lines drop out when they would crowd the screen.
- **Shortcuts.** `src/editor/shortcuts.ts` maps Mod (⌘ on macOS, Ctrl elsewhere) plus O, S, Shift+S, Z, Shift+Z and Y, and Delete and Escape. New is Mod+Alt+N, because browsers reserve Mod+N. Keys typed into a field stay with the field.

## Posing and constraints

`src/solve/` poses the rig by rotation alone, so every limb keeps its length by construction: no solve can translate a bone other than the root. Its priorities are fixed lengths and connectivity first, then angle limits and the chain's bend side, then grid snap of the drag target where the limb can reach it.

- **FK posing.** Dragging a joint swings its parent bone about the parent's joint, so the joint points at the cursor. Dragging the end of a tipped bone that is not a chain end aims that bone itself. Dragging the root translates it. Rotation snaps to the chosen increment (free, 1°, 5°, 15° or 45°) and is then held inside the bone's limits. Every new rotation is the equivalent nearest the current one, so a keyed rotation never spins a full turn on its way between keys.
- **Two-bone IK.** Dragging a chain's end (the lower bone's tip) solves the chain analytically with the law of cosines. Both segment lengths are kept and the bend stays on the chain's `bend` side. If an angle limit caps the bend, the capped chain is aimed so that its end still points at the target. A target beyond full extension, or inside the folded reach, leaves the limb at its closest reach and reports the shortfall.
- **Grid snap.** The drag target snaps to the grid when the limb can reach the grid point. Otherwise the exact pointer position is used if it is reachable, and the status bar says so.

- **Pins and grips.** Pin end holds a chain's end where it is. Hold a prop creates a prop at that hand, and Grip prop with a second hand turns the prop into a straight shaft through both hands, keeping their spacing as its rigid grip. After any body move every pin and grip is re-solved, so lowering the pelvis with both feet pinned bends the knees instead of sinking the feet. Dragging a pinned end moves its pin. Dragging a gripped hand, or the prop's move handle, carries the prop, and its turn handle rotates it, with both hands following. A pin or grip that cannot be held is reported, and the limb is never stretched.

In Pose mode a drop writes the solved pose and its pins and prop into the active animation's key at the current frame. If no key is there, it inserts one that continues the interpolation in force and the constraints in force. The pose inspector types a rotation, or the root's position, and toggles pins and grips the same way. Each drop is one undo step, and poses change only in Pose mode.

## Export bundles

Export mode builds a `riglab-export/` bundle (`src/export/bundle.ts`) for consumers. Some will evaluate keys and constraints themselves; others only draw solved transforms.

- `manifest.json` (`riglab.export`, version 1) names the generator and lists the rig, every animation and any baked files, each with its SHA-256. File names follow from validated names: `<rig>.rig.json`, `animations/<name>.anim.json` and `baked/<name>.baked.json`.
- A baked file (`riglab.baked`, version 1, `src/export/bake.ts`) holds, for every output frame (0 to `length - 1` when looping, 0 to `length` otherwise), each bone's world `[x, y, rotation°]` in rig order, computed with `samplePose` and Hexframe's FK, plus the held prop's transform when there is one.
- Export writes the bundle into a `riglab-export` folder through the File System Access API when the browser offers it. It can also download `riglab-export.zip`, built by a dependency-free ZIP writer (`src/export/zip.ts`) whose stored entries and fixed timestamps make the same bundle produce the same bytes.
- Import reads a folder or a zip (stored or deflated entries, every CRC checked) and verifies the whole bundle before the document changes: the manifest is closed and versioned, every listed file exists and matches its SHA-256, and every file validates against the rig and agrees with the manifest's names. Baked files must name a bundled animation and match its rate, looping, frame count and the rig's bones. Any failure is refused with its file and JSON path, such as `manifest.json $.animations[1].sha256: does not match animations/labWalk.anim.json`.

## Hexframe consumer adapter and art

Hexframe stays a consumer; RigLab hands it the shapes it already loads (`src/hexframe/adapter.ts`).

- `toHexframeRig` returns the rig in `fighter.rig.json`'s shape, with no format header, limits or chains, and its depth profiles. For the imported humanoid it equals the vendored `fighter.rig.json`. Hexframe paints by depth profile, so a rig without depth profiles is refused, and the left-out limits and chains are reported.
- `toHexframeClip` resamples an animation, constraints held, into Hexframe's 13 evenly spaced poses over a 60 Hz duration of `length × 60 / fps`. A non-integer duration is rounded and reported. Easing is `smoothstep` when every key is smooth, and `linear` otherwise. Hexframe's vendored `sampleClip` then plays the result. Every Hexframe frame that differs from RigLab's playback by more than 1e-6 is reported, which is how hold transitions show up. Each of the 13 Hexframe clips round-trips through import and this adapter with Hexframe's sampler unchanged to 1e-9.

Art attaches at slots, not the other way round. `src/hexframe/parts.ts` parses the vendored part SVGs as data: one `<svg>` root naming its bone, holding only `<path class d/>` elements with conservative values. Anything else (scripts, other elements or attributes, `url()` data) is refused, and nothing is injected as markup. `src/hexframe/art.ts` places each bone's part, found by the bone's `slot`, at that bone's FK transform, in Hexframe's paint order for facing right when the rig's depth profiles still fit it, and in bone order otherwise. The Art toggle draws it under the skeleton in every mode. The Export panel downloads the Hexframe rig and the active animation's clip.

## Acceptance

`tests/acceptance/spear-thrust.test.ts` drives the editor's own reducer through the RigLab recommendation's first acceptance path. It starts from the imported Hexframe humanoid and lengthens both forearms in Rig setup. It then authors a three-key spear thrust in Pose mode: both feet pinned, both hands on one spear, a wind-up with the elbows back, a linear transition with them centered, and an extension with the hands pushed forward. It exports the bundle with baked frames, zips and unzips it, and reloads it. The reloaded document must equal the original, and re-baking must equal the exported bake. On every frame, every joint must sit at its offset from its parent and every tip must keep its length (to 1e-5), both feet must stay on their pins, and the reloaded playback must sample exactly as the original. Breaking connectivity by 0.01 units, or letting a non-root bone translate, fails it.

## Source layout

| Path | Responsibility |
| --- | --- |
| `vendor/hexframe/` | Pinned Hexframe rig core, fighter data and part art. |
| `src/format/` | The `riglab.rig`, `riglab.anim` and `riglab.document` types, their closed validators and the shared sampler. |
| `src/hexframe/` | Loads the vendored rig, clips and parts; imports them as the RigLab `humanoid`; adapts RigLab rigs and animations back to Hexframe's shapes; places part art. |
| `src/editor/` | The editor's pure state (`types.ts`, `core.ts`, `documentEdits.ts`, `state.ts`), undo history, rig setup, pose and timeline edits, view math, shortcuts, document helpers and browser file access. |
| `src/export/` | Bundle building and verified reading, baking, and the ZIP writer and reader. |
| `src/solve/` | Rotation-only posing, two-bone IK, angle limits, rotation snap, grid-snapped targets, pins, the held prop and `samplePose`. |
| `src/viewer/` | Skeleton geometry from FK placements, the zoomable SVG rig canvas and its grid, pins, prop, onion-skin and art layers, the bone hierarchy, and integer-frame playback. |
| `src/app/` | The application shell: toolbar, panels, inspector, transport, status bar, file and shortcut wiring, and the stylesheet. |
| `tests/rig/`, `tests/format/`, `tests/editor/`, `tests/solve/`, `tests/export/` | Vitest suites for the rig model, viewer geometry, formats, sampler, Hexframe import, editor state, the solver and export bundles. |
| `tests/acceptance/` | The end-to-end spear-thrust acceptance test. |
| `tests/contracts/` | Node test suites for the repository's delivery contracts. |
| `scripts/` | Controlled-change, repository, vendor, settings and release contracts and their commands. |

The application is a React client rendered to native SVG and served by Vite. It needs no server, account or credential; `npm start` runs it locally.
