# Architecture

RigLab authors skeletons and motion, not character artwork. Its rig model and its clock are Hexframe's: RigLab vendors Hexframe's rig engine byte-for-byte and builds on it, so a skeleton or pose authored here is placed by exactly the code Hexframe draws with, and an animation plays through exactly the sampler Hexframe plays its clips with.

## The Hexframe rig model

`vendor/hexframe/` mirrors these Hexframe repository paths at the commit pinned in `vendor/hexframe/lock.json`:

- `src/rig/` — rig contract types, `createRig` (single root, no cycles, every bone reached), `hierarchyOrder`, `forwardKinematics`, `inBone`, the 13-pose clip type and `sampleClip`, depth profiles and paint order.

RigLab vendors no Hexframe character, clip or part art. The chibi is RigLab's own, and `tests/chibi/` pins it to Hexframe's 11-bone tree, chains and bend sides.

The conventions that follow from that code:

- **Space.** SVG units, x right, y down, rotation clockwise-positive. The chibi stands 91 units tall with its feet at y = 0.
- **Parent-relative transforms.** Each bone's `offset` is its joint position in its parent's frame; the root's offset is in rig space. `tip`, when present, is the bone's end point in its own frame.
- **Forward kinematics.** A bone's world rotation is its parent's world rotation plus its local rotation (degrees in a pose, radians once placed). Its world position is the parent's position plus the parent-rotated sum of its offset and any local translation.
- **Proportions.** Limb and segment lengths are the lengths of child offsets and tips. Poses translate only the root, so every limb keeps its rest length on every frame; `tests/rig/hexframe-rig.test.ts` proves that for every frame the engine plays, for every kind.
- **Clips.** A Hexframe clip is 13 evenly spaced poses (`POSE_INTERVALS` = 12) over `duration` frames of Hexframe's fixed 60 Hz simulation clock, eased `linear` or `smoothstep` between neighbours.

Nothing under `vendor/` is edited in place. `npm run vendor:hexframe -- <hexframe-checkout> <commit>` re-vendors from a commit's Git objects and rewrites the lock; `npm run check:vendor` (part of `npm run check`) fails on any edited, missing or unpinned file.

## RigLab formats

`src/format/` defines RigLab's portable, versioned contract. Both validators are closed: an unknown field, bone or value fails with the JSON path it names.

- **`riglab.rig` version 1** keeps Hexframe's rig contract fields (`space`, `root`, and bones with `name`, `parent`, `offset`, `tip`, `slot`, `artHeight` and `hand`) and adds a `format`/`version` header, a `name`, nullable per-bone angle `limits` (`min`/`max` local degrees) and two-bone `chains`. A chain's `lower` bone hangs off its `upper` bone: the upper segment is `lower.offset`, the lower segment is `lower.tip`, and `bend` (`1` or `-1`) is the sign of `lower`'s local rotation away from straight. The space must be SVG units, x right, y down and rotation clockwise-positive, because the FK math assumes it. `depthProfiles` is optional consumer layering data in Hexframe's shape. Every valid RigLab rig resolves through Hexframe's own `createRig`.
- **`riglab.anim` version 2** names its rig and its `kind`, and carries `fps`, `length`, `loop` and its keys. The kind fixes all of them (see Engine timing): `fps` is always 60, and the keys sit exactly at the kind's frames, so validation refuses any other rate, length, looping or key frame. Each key holds a full Hexframe pose, with a rotation for every bone and `x`/`y` on the root only, so no pose can stretch a limb. Its `interpolation` (`hold`, `linear` or `smoothstep`) shapes the transition to the next key.
- **`riglab.weapon` version 1** (`src/format/weapon.ts`) is a weapon rig: a `name` and one or more rigid `bodies`, each with a `name`, an art `slot`, an `axis` (its butt and tip in its own frame, for its line and turn handle) and one or two `grips`. A grip is a fixed point `at` in the body's frame, held by the end of a hand `chain`, and a chain grips at most once per weapon. A body with two grips is free: a key places it, and both hands solve to its grips. A body with one grip rides that hand: its grip also carries an `angle`, the body's rotation relative to the chain's lower bone, so the body follows the hand and nothing else places it. Dual daggers are two one-grip bodies; a two-handed sword is one free body.
- **Key constraints.** A key may carry `pins` (a chain end held at a world point, such as a planted foot) and either one `prop` (a rigid body with a name, position, rotation and one or two `grips`, each holding a chain end at a point in the prop's frame) or one `weapon` (the name of one of the document's weapons, and `bodies` placing each of its free bodies with `body`, `x`, `y` and `rotation`). A key never holds both, a chain end is pinned, on the prop or on the weapon, never two of them, and every chain must exist in the rig. The prop is the older, ad hoc hold, whose grip spacing comes from where the hands were; documents that use it validate and play as before.
- **`sampleAnimation(animation, frame)`** interpolates key poses deterministically. A looping animation samples `frame mod length`, and its last key runs to key 0 at `length`. A non-looping animation clamps to `[0, length]` and holds its last key. Blending uses Hexframe's `start + (end - start) * progress`.
- **`samplePose(rig, animation, frame, weapons)`** (in `src/solve/constraints.ts`) samples the key poses, then holds the frame's constraints, re-solving every pinned or gripped chain by IK: pins, then the prop's grips, then the grips of the weapon's free bodies. Bodies that ride a hand need no solve; `bodyTransforms` (in `src/solve/weapons.ts`) places them on the solved hands. Pins, the prop and free bodies move between keys with the same segment and easing as the pose (a free body only to a key holding the same weapon), and hold still when only the key in force has them. An animation with no constraints samples exactly as `sampleAnimation` does. This is how each of Hexframe's 13 poses is made.

## Engine timing

Every animation runs on Hexframe's engine timing (`src/format/timing.ts`, `src/solve/engine.ts`), so what RigLab previews, bakes and exports is what Hexframe plays.

- **Rate.** Hexframe advances on a fixed 60 Hz simulation clock (`FPS = 60` in its combat constants). One RigLab frame is one Hexframe tick, so `ENGINE_FPS` is 60 and an animation's `length` is its Hexframe clip `duration`. Nothing is converted or rounded on export.
- **Kinds.** An animation's kind fixes its length, looping and keys. The lengths come from Hexframe's own clips, rounded to multiples of 12 so each of the 13 poses falls on a whole frame. Keys are evenly spaced on that pose grid from frame 0; a looping animation's last key runs back to its first at `length`.

| Kind | Keys at frames | Length | Plays | From Hexframe's |
| --- | --- | --- | --- | --- |
| `idle` | 0, 15, 30, 45 | 60 | Loops | `labIdle` (60, looping) |
| `walk` | 0, 12, 24, 36 | 48 | Loops | `labWalk` (48, looping) |
| `jump` | 0, 12, 24, 36 | 36 | Once | `jump` (38) |
| `attack` | 0, 8, 16, 24 | 24 | Once | `labStrike` (20) |
| `hit` | 0, 12, 24 | 24 | Once | `labStagger` (24) |

- **Playback.** `engineOf(rig, animation)` makes the animation's Hexframe clip: `samplePose` at each of the 13 pose frames (`i × length / 12`), with `linear` easing between poses, as most of Hexframe's own clips use. `playAt(engine, frame)` returns that pose exactly on a pose frame, and Hexframe's vendored `sampleClip` between two of them. Pins and the prop move linearly between the same two poses. A key's interpolation therefore shapes the poses between keys, and Hexframe's sampler moves between those poses: a `hold` keeps its pose until the pose before the next key, then moves to it over one pose interval, and a `smoothstep` eases across the poses. The canvas, playback, onion skins, the baked frames and the Hexframe clip export all play through `playAt`, and `tests/solve/engine.test.ts` shows that Hexframe's sampler on the exported clip matches it on every frame of every kind.
- **Why.** Before this, animations had any rate and any key frames. 24 frames at 14 fps is 102.86 Hexframe frames, which export had to round, and keys between Hexframe's poses played differently in RigLab and in Hexframe. Engine timing makes that impossible: the rate is Hexframe's, every length is a whole number of ticks, and every key is one of Hexframe's poses.

## Editor

The editor is a pure state machine in `src/editor/state.ts`. Its document is a `riglab.document` (version 1): one `riglab.rig`, the `riglab.anim` animations authored against it and, when its keys hold any, a copy of each `riglab.weapon` they hold in `weapons`, so the document stays self-contained. It is validated as a whole by `validateDocument`, with every nested message re-rooted at its document path. Document edits go through a bounded snapshot history (`src/editor/history.ts`, 100 steps); selection, mode, frame, view, grid and snap stay outside it. The editor tracks the document as last created, opened or saved, so it is unsaved exactly when the present snapshot differs.

- **Modes.** Rig setup shows the rest pose. Pose scrubs the active animation without playing it. Animation plays it at 60 fps. Export plays it too, beside the export panel.
- **Selection.** One selection: a bone, an animation or a key. Delete removes a selected animation, or the selected joint and its subtree in Rig setup. Keys stay: an animation keeps every key its kind gives it. Escape clears the selection.
- **Animations.** The Animations panel's New menu adds an animation of a kind, named after it (`idle`, `idle-2`, …): the kind's keys, all at the rest pose and `smoothstep`. Duplicate, rename and delete work on any animation.
- **Timeline.** In Pose and Animation modes the timeline (`src/editor/timeline.ts`, `src/app/Timeline.tsx`) shows the active animation's frames, ticked at Hexframe's 13 poses, its keys and a playhead. Its only edit sets a key's transition to hold, linear or smooth, as one undo step; the kind fixes the keys, rate, length and looping, and the timeline shows them. Arrows step frames, Shift+arrows step keys and Space plays. Onion skins draw the previous and next keys as faint skeletons. Preview and playback show `playAt`, so what plays is exactly what Hexframe plays.
- **Rig setup.** Only Rig setup changes anatomy: the reducer refuses a rig edit in any other mode. `src/editor/rigEdits.ts` moves a joint (dragged on the canvas, snapped in rest space and stored as an offset in its parent's frame, or typed), sets tips, slots and names, adds a child joint, deletes a joint with its subtree, sets angle limits and adds, removes or re-bends chains. Every edit must leave the whole document valid. Renaming a bone renames it in parents, chains, depth profiles and every animation key; deleting one drops it from chains and keys, and drops depth profiles that would name a deleted bone. Pose values never change.
- **Files.** `src/editor/files.ts` (documents) and `src/editor/bundleFiles.ts` (export bundles) use the File System Access API when the browser offers it, and a file input and a download otherwise. Opening parses and validates before anything changes, and a refusal names the first failing path. New starts the chibi with no animations.
- **View.** `src/editor/view.ts` keeps zoom and pan in rig units. The wheel zooms about the cursor, dragging empty canvas pans, and zoom 1 fits the rig's viewBox plus a margin. Grid lines sit on multiples of the spacing, and minor lines drop out when they would crowd the screen.
- **Panels.** The left panel holds the bone hierarchy and the animations; the right panel is the mode's inspector. Each fits its width: long bone and animation names end in an ellipsis and show in full as a tooltip, labels, code names and button labels never wrap mid-word, and bundle paths break only after a `/`. Each panel's header has a collapse button that shrinks it to a thin rail with its name, and the canvas takes the width; the rail's button opens it again. Which panels are collapsed (`src/editor/panels.ts`) is a per-viewer convenience kept in browser storage when the browser allows it, never in the document or its history. On screens 860 px wide or less the panels stack under the canvas, and a collapsed one keeps only its header row.
- **Shortcuts.** `src/editor/shortcuts.ts` maps Mod (⌘ on macOS, Ctrl elsewhere) plus O, S, Shift+S, Z, Shift+Z and Y, and Delete and Escape. New is Mod+Alt+N, because browsers reserve Mod+N. Keys typed into a field stay with the field.

## Posing and constraints

`src/solve/` poses the rig by rotation alone, so every limb keeps its length by construction: no solve can translate a bone other than the root. Its priorities are fixed lengths and connectivity first, then angle limits and the chain's bend side, then grid snap of the drag target where the limb can reach it.

- **FK posing.** Dragging a joint swings its parent bone about the parent's joint, so the joint points at the cursor. Dragging the end of a tipped bone that is not a chain end aims that bone itself. Dragging the root translates it. Rotation snaps to the chosen increment (free, 1°, 5°, 15° or 45°) and is then held inside the bone's limits. Every new rotation is the equivalent nearest the current one, so a keyed rotation never spins a full turn on its way between keys.
- **Two-bone IK.** Dragging a chain's end (the lower bone's tip) solves the chain analytically with the law of cosines. Both segment lengths are kept and the bend stays on the chain's `bend` side. If an angle limit caps the bend, the capped chain is aimed so that its end still points at the target. A target beyond full extension, or inside the folded reach, leaves the limb at its closest reach and reports the shortfall.
- **Grid snap.** The drag target snaps to the grid when the limb can reach the grid point. Otherwise the exact pointer position is used if it is reachable, and the status bar says so.

- **Pins and grips.** Pin end holds a chain's end where it is. Weapons replace the ad hoc prop: the editor no longer creates one, and a prop in an older document still draws, moves and turns, and Let go of prop drops it. After any body move every pin and grip is re-solved, so lowering the pelvis with both feet pinned bends the knees instead of sinking the feet. Dragging a pinned end moves its pin. Dragging a gripped hand, or the prop's move handle, carries the prop, and its turn handle rotates it, with both hands following. A pin or grip that cannot be held is reported, and the limb is never stretched.
- **Weapons.** A key that holds a weapon keeps it through pose drops, timeline edits and undo. Its hands solve to the free bodies' grips by rotation alone, inside angle limits and on each chain's bend side. A grip a hand cannot reach is reported with its weapon, grip and shortfall, such as `staff grip 'far': arm-front cannot reach: the target is 15.25 beyond full extension`, and the limb stays at its closest reach. A hand that holds the weapon cannot also be pinned, and a key with a weapon cannot hold a prop.
- **Weapon picker.** In Pose mode the right panel's Weapon picker (None, Sword, Spear, Axe, Daggers) sets the weapon of the key at the current frame, with or without a selected bone, as one undo step (`src/editor/weaponEdits.ts`). A free body starts at its ready hold, carried with the torso when the body has moved, and the hands solve to its grips. The pick releases a pin on a gripping hand, replaces an old prop, and reports any grip out of reach. The document gains a copy of the weapon and drops copies no key holds. None lets go, and a frame between keys is refused like a pose drop there. On the canvas a free body has a move handle at its grips' midpoint and a turn handle at its tip. Dragging a hand that grips it carries it, and bodies that ride a hand follow it. With Art off each body draws as a line along its axis.

In Pose mode a drop writes the solved pose and its pins and prop into the active animation's key at the current frame. A frame between keys has no key, so a drop there is refused with the frames that do. The pose inspector types a rotation, or the root's position, and toggles pins and grips the same way. Each drop is one undo step, and poses change only in Pose mode.

## Export bundles

Export mode builds a `riglab-export/` bundle (`src/export/bundle.ts`) for consumers. Some will evaluate keys and constraints themselves; others only draw solved transforms.

- `manifest.json` (`riglab.export`, version 1) names the generator and lists the rig, every animation and any baked files, each with its SHA-256. File names follow from validated names: `<rig>.rig.json`, `animations/<name>.anim.json` and `baked/<name>.baked.json`.
- A baked file (`riglab.baked`, version 1, `src/export/bake.ts`) holds, for every Hexframe tick (0 to `length - 1` when looping, 0 to `length` otherwise), each bone's world `[x, y, rotation°]` in rig order, computed with `playAt` and Hexframe's FK, plus the held prop's transform when there is one.
- Export writes the bundle into a `riglab-export` folder through the File System Access API when the browser offers it. It can also download `riglab-export.zip`, built by a dependency-free ZIP writer (`src/export/zip.ts`) whose stored entries and fixed timestamps make the same bundle produce the same bytes.
- Import reads a folder or a zip (stored or deflated entries, every CRC checked) and verifies the whole bundle before the document changes: the manifest is closed and versioned, every listed file exists and matches its SHA-256, and every file validates against the rig and agrees with the manifest's names. Baked files must name a bundled animation and match its rate, looping, frame count and the rig's bones. Any failure is refused with its file and JSON path, such as `manifest.json $.animations[1].sha256: does not match animations/walk.anim.json`.

## Hexframe consumer adapter and art

Hexframe stays a consumer; RigLab hands it the shapes it already loads (`src/hexframe/adapter.ts`).

- `toHexframeRig` returns the rig in Hexframe's rig file shape, with no format header, limits or chains, and its depth profiles; Hexframe's own `createRig` loads it. Hexframe paints by depth profile, so a rig without depth profiles is refused, and the left-out limits and chains are reported.
- `toHexframeClip` writes the clip RigLab's engine playback already plays (`engineOf`): the animation's 13 poses, constraints held, over `duration` = `length` ticks, `linear` between poses, with Hexframe's `key` and `note`. Hexframe's `sampleClip` plays it exactly as RigLab previews and bakes it, to 1e-9 on every frame.

Art attaches at slots, not the other way round. `src/hexframe/parts.ts` parses part SVGs (the chibi parts) as data: one `<svg>` root naming its bone, holding only `<path class d/>` elements with conservative values. Anything else (scripts, other elements or attributes, `url()` data) is refused, and nothing is injected as markup. `src/hexframe/art.ts` places each bone's part, found by the bone's `slot`, at that bone's FK transform, in Hexframe's paint order for facing right when the rig's depth profiles still fit it, and in bone order otherwise. A held weapon's parts draw at each body's transform: `withWeaponArt` paints each body just under the last-painted lower bone of the chains that grip it, so the near hand covers a two-handed grip and each dagger sits under its own hand. The Art toggle draws it under the skeleton in every mode. The Export panel downloads the Hexframe rig and the active animation's clip.

## The chibi

New starts the chibi (`src/editor/templates.ts`) with no animations. It is RigLab's only rig template.

- **Chibi rig.** `characters/chibi/chibi.rig.json` is a `riglab.rig` with Hexframe's 11 bone names, parents, chains, bend sides and depth profiles at chibi proportions. It stands 91 units tall, and the head bone is 44 of them, so it is about two heads tall. The pelvis sits 25 units up, the legs are 12 + 13 units, the arms 10 + 11, and both feet rest at y = 0. Its bones use their own `chibi_*` slots.
- **Chibi art.** `characters/chibi/parts/` holds 11 original part SVGs in Hexframe's part format, read by the same strict parser. The style is MapleStory-like: a big round head with hair, bangs, big eyes and blush, a short tunic with a gold collar and belt, puffy sleeves, mitten hands, shorts and big shoes. It copies no MapleStory asset. Following Hexframe's depth profile, which paints `arm-front` and `leg-front` behind the body when facing right, those limbs use the darker shades.
- **Art set.** Parts are keyed by slot and belong to the `chibi` art set. The art layer tags each part with its set, and the set keeps its own palette in the stylesheet.

## Weapons

`characters/weapons/` holds the chibi's four weapons as `riglab.weapon` files, and `src/weapons/weapons.ts` validates them against the chibi and parses their parts into the `weapons` art set. The parts are original, drawn in the strict part format, and their palette reuses the chibi's outline, gold, wood and cloth with a steel tone.

| Weapon | Bodies | Grips | Shape |
| --- | --- | --- | --- |
| `sword` | One free body | `upper` (`arm-front`) and `lower` (`arm-back`), 7 apart on the hilt | Blade up from a gold crossguard, 51 units long |
| `spear` | One free body | `front` (`arm-front`) and `rear` (`arm-back`), 16 apart on the shaft | Leaf point toward +x, the facing direction, 70 units long |
| `axe` | One free body | `upper` (`arm-front`) and `lower` (`arm-back`), 10 apart on the haft | Crescent head up, its edge toward +x, 53 units long |
| `daggers` | `dagger-front` and `dagger-back`, one per hand | `fist` on `arm-front` and on `arm-back`, at 180° | Reverse grip: the blade leaves the pinky side of the fist and lies back along the forearm |

At chibi scale (91 units tall, arms 10 + 11, mitten fists about 7.6 units across) the grips fit two fists and stay reachable. `readyHold` gives each free body a ready placement in front of the chibi at the waist, tilted toward the facing side, so both hands reach their grips and the big head never hides the blade. `tests/weapons/` holds each two-handed weapon there with both feet planted and proves that both hands reach their grips without stretching. It also shows that in a raised guard each dagger's blade points down along its forearm.

## Acceptance

`tests/acceptance/spear-thrust.test.ts` drives the editor's own reducer through the RigLab recommendation's first acceptance path. It starts the chibi and lengthens both forearms in Rig setup. It then adds an attack (keys at 0, 8, 16 and 24) and authors a spear thrust in Pose mode: both feet pinned, both hands on one spear, a wind-up with the elbows back, a linear transition with them centered, an extension with the hands pushed forward, and the recovery. It exports the bundle with baked frames, zips and unzips it, and reloads it. The reloaded document must equal the original, and re-baking must equal the exported bake. On every frame, every joint must sit at its offset from its parent and every tip must keep its length (to 1e-5), both feet must stay on their pins, the reloaded playback must equal the original, and Hexframe's own sampler on the exported clip must place every bone where RigLab baked it. Breaking connectivity by 0.01 units, or letting a non-root bone translate, fails it.

## Source layout

| Path | Responsibility |
| --- | --- |
| `vendor/hexframe/` | Hexframe's pinned rig engine: rig contract, FK, paint order and clip sampler. |
| `src/format/` | The `riglab.rig`, `riglab.anim`, `riglab.weapon` and `riglab.document` types, their closed validators, engine timing and kinds, and the key sampler. |
| `characters/chibi/` | The chibi rig and its 11 original part SVGs. |
| `src/chibi/` | Loads the chibi rig and parses its art as the `chibi` set. |
| `characters/weapons/` | The sword, spear, axe and daggers as `riglab.weapon` files, with their original part SVGs. |
| `src/weapons/` | Loads the weapons, parses their art as the `weapons` set, and gives each its ready hold. |
| `src/hexframe/` | Adapts RigLab rigs and animations to Hexframe's shapes, parses part art and places it. |
| `src/editor/` | The editor's pure state (`types.ts`, `core.ts`, `documentEdits.ts`, `state.ts`), undo history, rig setup, pose, weapon and timeline edits, view math, shortcuts, document helpers and browser file access. |
| `src/export/` | Bundle building and verified reading, baking, and the ZIP writer and reader. |
| `src/solve/` | Rotation-only posing, two-bone IK, angle limits, rotation snap, grid-snapped targets, pins, the held prop and weapon, `samplePose` and engine playback. |
| `src/viewer/` | Skeleton geometry from FK placements, the zoomable SVG rig canvas and its grid, pins, prop, weapon, onion-skin and art layers, the bone hierarchy, and integer-frame playback. |
| `src/app/` | The application shell: toolbar, side panels, the mode panel with the inspector and weapon picker, transport, status bar, file and shortcut wiring, and the stylesheets. |
| `tests/rig/`, `tests/format/`, `tests/editor/`, `tests/solve/`, `tests/export/`, `tests/hexframe/` | Vitest suites for the rig engine, viewer geometry, formats and engine timing, the sampler and engine playback, editor state, the solver, export bundles and the Hexframe adapter. |
| `tests/acceptance/` | The end-to-end spear-thrust acceptance test. |
| `tests/chibi/` | The chibi rig, art and template. |
| `tests/weapons/` | The four weapons, their art and their two-hand and guard holds. |
| `tests/contracts/` | Node test suites for the repository's delivery contracts. |
| `scripts/` | Controlled-change, repository, vendor, settings and release contracts and their commands. |

The application is a React and TypeScript client rendered to native SVG and served by Vite. It needs no server, account, credential or native toolchain; `npm start` runs it locally. The repository contract keeps it that way: it rejects Rust, Cargo and Tauri files, `@tauri-apps` dependencies and package scripts that run `tauri`, `cargo`, `rustc` or `rustup`.
