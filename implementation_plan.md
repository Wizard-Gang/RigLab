# Implementation plan

## Open tasks

### RL-037 — [REFACTOR] Remove bundle import so motion enters only through the library folder

- Dependency: None.
- Why: The owner approved the cut on 2026-10-13. The library folder is the only source of motion ("we dont want multiple sources"), yet Export mode can still import a bundle and replace the editor's rig and animations. Only import needs the bundle reader and its manifest checks, a ZIP reader with deflate support, baked-file validation and the editor's `imported` action.
- Scope: Remove Import folder… and Import zip… from the Export panel. Remove the `imported` action, `readBundle` with its manifest and file checks, `validateBaked`, the ZIP reader `unzip`, and the folder and zip readers in `src/editor/bundleFiles.ts`. Export still writes the bundle to a folder or a zip, with optional baked frames, and still downloads the Hexframe rig and clip. Tests check what export writes, directly. Each manifest entry's SHA-256 matches its bytes. The rig, animation and weapon files parse back to the editor's own, and each baked file equals a fresh bake. The ZIP writer's test reads its stored entries with a few lines of test code. Both acceptance tests swap their zip-and-reload round trip for these checks. Update README and ARCHITECTURE (Export bundles).
- Non-goals: Changing the bundle, baked or Hexframe formats, and any other way into the library.
- Acceptance: The Export panel has no import controls, and nothing in `src/` reads a bundle or a zip. The export and acceptance tests pass with the direct checks. The zip of the placeholder library's bundle keeps the SHA-256 it has on main. Headless Chrome on a worktree dev server downloads a zip from the Export panel with no console errors. `npm run check` passes.
- Validation: Pinned `npm ci`, focused export and acceptance tests, `npm run check`, `npm run audit:dependencies`, `check:patch`, `git diff --check`, the headless pass, and exact-head CI.
- Authorities: `src/app/ExportPanel.tsx`, `src/app/ModePanel.tsx`, `src/export/bundle.ts`, `src/export/bake.ts`, `src/export/zip.ts`, `src/editor/bundleFiles.ts`, `src/editor/types.ts`, `src/editor/state.ts`, `tests/export/`, `tests/acceptance/`, `README.md`, `docs/ARCHITECTURE.md`, and the owner's approval on 2026-10-13.

### RL-038 — [REFACTOR] Make the editor's model the library itself

- Dependency: RL-037, so the model drops its code paths first.
- Why: The owner approved cutting the `riglab.document` leftovers and the re-export layers on 2026-10-13. Since RL-032 the editor's document is never a file. It still carries a format header, parse and serialize helpers that only tests call, and pruned copies of the weapons its keys hold, kept "so the document stays self-contained". `src/chibi/chibi.ts`, `src/weapons/weapons.ts` and `src/editor/templates.ts` only rename parts of `LIBRARY`. The weapon editing below needs a model that carries every weapon and its hold.
- Scope: Replace `RigLabDocument` (`src/format/document.ts`) with the editor's model of the library in `src/editor/model.ts`: `{ rig, weapons, animations }`. `weapons` lists every library weapon in config order, each with its rig and its hold. `validateModel` checks the model whole, as `validateDocument` did. Remove `DOCUMENT_FORMAT`, `DOCUMENT_VERSION`, `parseDocument`, `serializeDocument`, `pruneWeapons` and the weapon-copy bookkeeping of the weapon pick. Delete `src/chibi/`, `src/weapons/` and `src/editor/templates.ts`. The editor, wardrobe, export and tests read `LIBRARY` or the model directly, and one helper in `src/library/` gives art parts by slot. Save still posts only the rig and animations, and export still lists only the weapons the animations hold. Update README and ARCHITECTURE (Editor, The chibi, Weapons, Source layout).
- Non-goals: Saving weapons or holds (RL-041), the class model (RL-039), and any change a user can see. The editor, the wardrobe, saves and export bytes stay as they are.
- Acceptance: None of these names remain in `src/` or `tests/`: `RigLabDocument`, `riglab.document`, `CHIBI_RIG`, `CHIBI_SKIN`, `CHIBI_PARTS`, `WEAPONS`, `WEAPON_PARTS`, `readyHold`, `weaponNamed` and `libraryDocument`. The model holds all four weapons and their holds, whether or not a key holds them, and picking a weapon adds or prunes nothing. The placeholder library's export bundle is byte-identical to main's. Headless Chrome on a worktree dev server over a temporary library copy picks a weapon, poses a key and saves, with no console errors. `npm run check` passes.
- Validation: Pinned `npm ci`, the full Vitest suite, `npm run check`, `npm run audit:dependencies`, `check:patch`, `git diff --check`, the headless pass, and exact-head CI.
- Authorities: `src/format/document.ts`, `src/format/index.ts`, `src/editor/types.ts`, `src/editor/core.ts`, `src/editor/documentEdits.ts`, `src/editor/weaponEdits.ts`, `src/editor/templates.ts`, `src/chibi/chibi.ts`, `src/weapons/weapons.ts`, `src/library/active.ts`, `src/library/load.ts`, `src/app/`, `src/export/bundle.ts`, `src/wardrobe/`, `tests/`, `README.md`, `docs/ARCHITECTURE.md`, and the owner's approval on 2026-10-13.

### RL-039 — [FEAT] Give every animation a class

- Dependency: RL-038.
- Why: The owner said on 2026-10-13 that weapons are classes of animation: unarmed, 2h sword, 2h spear, 2h axe and daggers, with the spear kept as the fifth class. "Kind" already means idle, walk, jump, attack or hit. A class holds its weapon on every key, where today any key can pick or drop any weapon. The owner chose one animation of each kind per class, a fixed grid named `<class>-<kind>`.
- Scope: The change has four parts.
  - Format. `riglab.anim` version 3 adds `class`, which is `unarmed` or the name of a library weapon. Each key's `weapon` gives way to `bodies`, which place the class weapon's free bodies with `body`, `x`, `y` and `rotation`. Every key of a sword, spear or axe animation places its body. Unarmed and dagger keys place none. A pin may not hold a chain the class weapon grips. The name must be `<class>-<kind>`, so a library holds at most one animation per class and kind. No weapon may be named `unarmed`.
  - Playback and export. The solver, engine, bake, bundle and Hexframe clip take the weapon from the class. Paint order looks up the class instead of the held weapon, and the chibi rig's `byClip` entries for `sword`, `spear` and `axe` already use those names. The Hexframe rig export also maps each animation's clip key to its class's profile, so Hexframe paints exported clips the same way.
  - Editor. The class replaces the per-key Weapon picker: its keys always hold its weapon, and Pose mode still moves and turns free bodies per key. The Animations panel lists each animation by class and kind. The grid fixes the animations, so the panel's New, Duplicate and Delete controls and the inspector's rename field go away. The Delete key deletes only joints.
  - Migration. Both libraries' five animations become version 3 `unarmed-<kind>` files at `animations/unarmed-<kind>.anim.json`, with matching `config.txt` lines. Right after the merge, back up the owner's folder under `backups/`, migrate it, and run `check:library`.

  The acceptance tests hold their weapons through hand-built class animations. Update README and ARCHITECTURE (formats, editor, library).
- Non-goals: Making the armed classes' animations (RL-040), saving weapons (RL-041), the class switcher and the wardrobe's classes (RL-042), and reading version 2 files. Both libraries are migrated instead.
- Acceptance: Format tests accept a valid animation for each class. They refuse an unknown class, a missing or extra body placement, a pin on a gripping chain, a name other than `<class>-<kind>`, a second animation for one class and kind, and a weapon named `unarmed`. Engine, bake, bundle and Hexframe tests hold the sword through a hand-built `sword-attack` as a per-key sword did, and paint it with `both-front`. The Hexframe rig export maps its clip key. Both libraries load at version 3 with five unarmed animations, and the owner's backup holds the version 2 files. Headless Chrome on a worktree dev server over a copy of the migrated folder poses and saves `unarmed-idle` with no console errors. `npm run check` passes.
- Validation: Pinned `npm ci`, focused format, library, solve, export, Hexframe and editor tests, `npm run check`, `npm run audit:dependencies`, `check:patch`, `git diff --check`, `npm run check:library` on both libraries, the headless pass, and exact-head CI.
- Authorities: `src/format/animation.ts`, `src/format/constraints.ts`, `src/library/load.ts`, `src/solve/constraints.ts`, `src/solve/engine.ts`, `src/export/bake.ts`, `src/export/bundle.ts`, `src/hexframe/adapter.ts`, `src/hexframe/art.ts`, `src/editor/`, `src/app/AnimationsPanel.tsx`, `src/app/Inspector.tsx`, `src/app/ModePanel.tsx`, `src/app/WeaponPicker.tsx`, `placeholder-library/`, `~/Documents/RigLab/`, `README.md`, `docs/ARCHITECTURE.md`, and the owner's direction and answers on 2026-10-13.

### RL-040 — [FEAT] Start every class's five kinds from the unarmed motion

- Dependency: RL-039.
- Why: On 2026-10-13 the owner chose that every class has one animation of each kind, and that an armed class starts from the unarmed animation of the same kind with its weapon in hand. After RL-039 the libraries hold only the five unarmed animations, and the editor cannot create any.
- Scope: A pure `startClassAnimation` in `src/editor/classes.ts` builds `<class>-<kind>` from `unarmed-<kind>`. It keeps every key's frame, interpolation and pose, and the pins on chains the weapon does not grip. For a weapon with free bodies, each key places them at the weapon's hold, carried with the torso as `carryReady` does today, and both arms re-solve to the grips. A grip a hand cannot reach is reported, never stretched. Dagger keys keep the unarmed arms, and the daggers ride the hands. A missing unarmed kind starts at the rest pose, as New did. When the editor opens, it fills every missing class and kind in config and kind order, as unsaved changes. The status says how many it started, and Save writes them. Seed the owner's folder from a worktree dev server before fast-forwarding the owner's checkout. Back the folder up under `backups/` first, then save the 20 armed animations, so it opens clean with all 25. The weapons acceptance test builds its animations with `startClassAnimation` instead of the removed picker. Update README and ARCHITECTURE.
- Non-goals: Re-deriving an armed animation after its unarmed source changes, class UI beyond the status note (RL-042), and editing holds (RL-043).
- Acceptance: Unit tests check these points:
  - Each armed animation's legs, pelvis, torso and head match its unarmed source on every key.
  - Sword, spear and axe hands sit on their grips at every key and at Hexframe's 13 poses (to 1e-5), or the miss is reported.
  - The daggers' arms equal the unarmed arms.
  - Pins on gripping chains are dropped.
  - Filling is idempotent and never changes an existing animation.
  - A library of five unarmed animations opens with 20 started and unsaved.

  The owner's folder loads with 25 animations: `check:library` lists them all, and the wardrobe's Motion plays them all. Headless Chrome on a temporary copy plays `sword-walk`, `spear-attack` and `daggers-idle` with no console errors, and with both arms over the torso for the two-handed weapons. `npm run check` passes.
- Validation: Pinned `npm ci`, focused editor, solve and acceptance tests, `npm run check`, `npm run audit:dependencies`, `check:patch`, `git diff --check`, `npm run check:library` on the owner's folder, the headless pass, and exact-head CI.
- Authorities: `carryReady` (in `src/editor/weaponEdits.ts` on main), `src/editor/core.ts`, `src/editor/model.ts`, `src/editor/animations.ts`, `src/solve/constraints.ts`, `tests/acceptance/weapons.test.ts`, `~/Documents/RigLab/`, `README.md`, `docs/ARCHITECTURE.md`, and the owner's answers on 2026-10-13.

### RL-041 — [FEAT] Save weapon rigs and holds into the library folder

- Dependency: RL-038.
- Why: The owner reported on 2026-10-13: "i dont see the prop (weapon) rigs at all". The library's `weapon.json` and `hold.json` change only by hand, because the RL-031 save endpoint writes only the rig and animations. Editing weapons in the editor (RL-043) first needs a write path, proven safe without UI as RL-031 was for animations.
- Scope: The save body gains `weapons`: one `{ weapon, hold }` per library weapon, in config order. `planLibrarySave` writes `weapon.json` in the directory the weapon's line maps, and `hold.json` for a weapon with free bodies, each only when its text changes. It refuses a weapon that no `weapon` line maps, a weapon named unlike its line, and a hold for a weapon without free bodies. It never writes or removes part SVGs or palettes, or changes `config.txt`'s `weapon` lines. The merged library must still load, so a body slot without a part is refused. Backups, atomic writes and the `riglab:library-saved` event work as they do for animations. The editor's Save sends the model's weapons and holds, and an unchanged weapon writes nothing. Update README and ARCHITECTURE (Library folders, Saving).
- Non-goals: Weapon editing UI (RL-043), creating, renaming or deleting weapons, and writing art or palettes.
- Acceptance: Plan tests check the writes: an edited grip writes only `weapon.json`, an edited hold writes only `hold.json`, and an unchanged weapon writes nothing. They refuse an unmapped weapon, a renamed weapon, a hold for the daggers and a slot without a part, writing nothing. Endpoint tests on a temporary folder back up the previous `weapon.json` and `hold.json`. A live `curl` save to a worktree dev server over a temporary `RIGLAB_LIBRARY` copy changes the sword's hold on disk, and that server's wardrobe shows it. `npm run check` passes.
- Validation: Pinned `npm ci`, focused library tests, `npm run check`, `npm run audit:dependencies`, `check:patch`, `git diff --check`, the live `curl` save, and exact-head CI.
- Authorities: `src/library/save.ts`, `src/library/write.ts`, `src/library/endpoint.ts`, `src/library/load.ts`, `src/format/weapon.ts`, `src/format/hold.ts`, `src/editor/librarySave.ts`, `src/editor/model.ts`, `README.md`, `docs/ARCHITECTURE.md`, and the owner's report on 2026-10-13.

### RL-042 — [FEAT] Browse animations by class in the editor and the wardrobe

- Dependency: RL-040.
- Why: The owner asked for animations grouped by class ("props are classes of animation"). With 25 animations in a fixed grid, a flat list hides that structure. The wardrobe still pairs any weapon with any motion.
- Scope: The editor's left panel puts a class switcher above the animations: Unarmed, then each weapon in config order. Under it are the active class's five kinds, each with its keys, length and looping. Choosing another class keeps the kind, so `sword-attack` goes to `spear-attack`. The hierarchy section folds, so the classes stay in view. The timeline names the class and kind. In the wardrobe, the Weapon and Motion steppers become Class and Motion. Class cycles Unarmed and each weapon, and Motion cycles Rest and the five kinds. At Rest, an armed class holds its weapon at its hold. Update README and ARCHITECTURE (Editor, Wardrobe).
- Non-goals: Weapon editing (RL-043), mode changes (RL-044), new kinds, and the wardrobe's skin and part controls.
- Acceptance: Reducer tests switch class, keep the kind, and reconcile the selection and frame. Wardrobe state tests step and wrap Class and Motion. Headless Chrome at 1440 and 860 px wide steps through every class and kind in the editor and the wardrobe, with no overflow and no console errors. `npm run check` passes.
- Validation: Pinned `npm ci`, focused editor and wardrobe tests, `npm run check`, `npm run audit:dependencies`, `check:patch`, `git diff --check`, the headless pass, and exact-head CI.
- Authorities: `src/app/AnimationsPanel.tsx`, `src/app/App.tsx`, `src/app/Timeline.tsx`, `src/app/panels.css`, `src/editor/state.ts`, `src/viewer/Hierarchy.tsx`, `src/wardrobe/`, `tests/editor/`, `tests/wardrobe/`, `README.md`, `docs/ARCHITECTURE.md`, and the owner's answers on 2026-10-13.

### RL-043 — [FEAT] Edit the active class's weapon rig and hold in Rig setup

- Dependency: RL-041 and RL-042.
- Why: The owner said on 2026-10-13: "we need to be able to make the animations and adjust the props as well". They chose Spine-style modes, with Rig setup editing the chibi and the active class's weapon rig and hold at rest. Today a weapon's grips, axis and hold change only by hand-editing the library's JSON.
- Scope: With an armed class active, Rig setup draws the chibi at rest holding the class weapon at its hold. It shows the weapon's art, axis, grip points and handles, with the hands solved to the grips. The hierarchy lists the weapon's bodies and their grips after the bones. Selecting one opens an inspector with numeric fields for:
  - the hold (`x`, `y`, `rotation`)
  - each grip's `at`, and its `angle` for a one-grip body
  - the axis butt and tip

  The canvas edits the same values. A free body's move and turn handles set the hold. Dragging a grip point moves it in the body's frame, dragging the butt or tip moves the axis, and a one-grip body's turn handle sets its grip angle. Each weapon edit is one undo step and must leave the weapon and hold valid. A grip the hands cannot reach at rest is reported, never stretched. Keys place bodies and hands solve to grips, so a changed grip moves the hands on every key of that class, and the inspector says so. Save writes `weapon.json` and `hold.json` through RL-041. Update README and ARCHITECTURE.
- Non-goals: Adding or removing bodies or grips, binding a grip to another chain, adding, renaming or deleting weapons or classes, editing art or palettes, and moving existing keys' bodies when the hold changes.
- Acceptance: Reducer tests cover each weapon edit and its undo. They refuse two grips on one point, and any weapon edit outside Rig setup. Geometry tests move a dragged grip's `at` by the drag in the body's frame. Headless Chrome on a worktree dev server over a temporary library copy, in the sword class, drags the hold and a grip and saves. `weapon.json` and `hold.json` change on disk, with their previous versions in `backups/`. `sword-idle` plays with the hands on the new grips, and the wardrobe shows the new hold. There are no console errors. `npm run check` passes.
- Validation: Pinned `npm ci`, focused editor, solve and viewer tests, `npm run check`, `npm run audit:dependencies`, `check:patch`, `git diff --check`, the headless pass, and exact-head CI.
- Authorities: `src/editor/rigEdits.ts`, `src/editor/model.ts`, `src/app/BoneSetup.tsx`, `src/app/ModePanel.tsx`, `src/app/useCanvasDrags.ts`, `src/viewer/RigCanvas.tsx`, `src/viewer/Hierarchy.tsx`, `src/viewer/WeaponMarkers.tsx`, `src/solve/weaponDrags.ts`, `src/format/weapon.ts`, `src/format/hold.ts`, RL-041's save path, `README.md`, `docs/ARCHITECTURE.md`, and the owner's direction and answers on 2026-10-13.

### RL-044 — [FEAT] Merge Pose and Animation into one Animate mode

- Dependency: RL-043, because both change the mode panel.
- Why: The owner chose Spine-style modes on 2026-10-13: Rig setup and Animate, plus Export. Today Pose can edit but not play, and Animation can play but not edit. Authoring a key means switching modes between every change and every look at it.
- Scope: Modes become Rig setup, Animate and Export. Animate plays, scrubs and steps as Animation does. When paused, it poses the active animation's key at the current frame as Pose does. A drop between keys is still refused, with the key frames named. While playing, the canvas hides its drag handles and the pose inspector's fields are read-only. Space plays and pauses. The right panel shows the pose inspector for a selected bone, and otherwise the animation or key. Export keeps playing beside its panel. The reducer's `pose` and `animate` modes become one, and the editor opens in Animate. Update the shortcut help, README and ARCHITECTURE.
- Non-goals: Rig setup changes, timeline edits beyond interpolation, auto-key, and adding or moving keys.
- Acceptance: Reducer and playback tests show that a pose edit is one undo step, and that pose edits are refused while playing. Switching modes keeps the frame, and no `pose` mode remains. Headless Chrome plays, pauses on a key, drags a hand, plays the change and undoes it, with no console errors. `npm run check` passes.
- Validation: Pinned `npm ci`, focused editor and playback tests, `npm run check`, `npm run audit:dependencies`, `check:patch`, `git diff --check`, the headless pass, and exact-head CI.
- Authorities: `src/editor/types.ts`, `src/editor/state.ts`, `src/editor/documentEdits.ts`, `src/app/App.tsx`, `src/app/ModePanel.tsx`, `src/app/Toolbar.tsx`, `src/app/Timeline.tsx`, `src/app/useCanvasDrags.ts`, `src/viewer/usePlayback.ts`, `README.md`, `docs/ARCHITECTURE.md`, and the owner's answers on 2026-10-13.

### RL-045 — [FEAT] Polish the editor and the wardrobe in a UX pass

- Dependency: RL-044.
- Why: The owner asked on 2026-10-13 for "a ux pass / cleanup pass". With classes, weapon editing and Animate in place, one pass over the whole flow can fix what the feature tasks leave behind. Some rough edges already exist:
  - The editor opens with Art off, so it shows a stick figure and no weapon art.
  - The library label appears twice, in the toolbar and in the status bar.
  - Some text still speaks of "seed animations" and "starting animations".
  - Rig setup, Pose and Animation give the same generic hint when nothing is selected.
- Scope: Open the editor with Art on, and show the library label once. Give each mode's empty panel its own next step. Rig setup asks to select a joint or a weapon part. Animate asks to select a joint on a key. Export says what it writes. Remove stale text from the app, from `src/library/load.ts` and `placeholder-library/README.md`, and from the owner's `~/Documents/RigLab/README.md`, backing that file up first. Walk through every mode, class and kind, and the wardrobe, in headless Chrome at 1440 × 900 and at 860 px wide. Fix every overflow, clipped label, focus or contrast problem the walkthrough finds. Then sweep README and ARCHITECTURE for anything the earlier tasks left stale.
- Non-goals: New features or modes, format changes, and a new visual theme.
- Acceptance: Tests pin Art on at start and the single library label. The walkthrough finds no horizontal overflow, clipped labels or console errors, and its screenshots go in the delivery report. No user-facing text mentions seed or starting animations, documents, New, Open or Pose mode. `npm run check` passes.
- Validation: Pinned `npm ci`, focused app tests, `npm run check`, `npm run audit:dependencies`, `check:patch`, `git diff --check`, the headless walkthrough, and exact-head CI.
- Authorities: `src/app/`, `src/wardrobe/`, `src/library/load.ts`, `placeholder-library/README.md`, `~/Documents/RigLab/README.md`, `README.md`, `docs/ARCHITECTURE.md`, and the owner's direction on 2026-10-13.
