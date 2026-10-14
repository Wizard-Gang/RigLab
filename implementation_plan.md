# Implementation plan

## Open tasks

### RL-041 — [FEAT] Save weapon rigs and holds into the library folder

- Dependency: None.
- Why: The owner reported on 2026-10-13: "i dont see the prop (weapon) rigs at all". The library's `weapon.json` and `hold.json` change only by hand, because the RL-031 save endpoint writes only the rig and animations. Editing weapons in the editor (RL-043) first needs a write path, proven safe without UI as RL-031 was for animations.
- Scope: The save body gains `weapons`: one `{ weapon, hold }` per library weapon, in config order. `planLibrarySave` writes `weapon.json` in the directory the weapon's line maps, and `hold.json` for a weapon with free bodies, each only when its text changes. It refuses a weapon that no `weapon` line maps, a weapon named unlike its line, and a hold for a weapon without free bodies. It never writes or removes part SVGs or palettes, or changes `config.txt`'s `weapon` lines. The merged library must still load, so a body slot without a part is refused. Backups, atomic writes and the `riglab:library-saved` event work as they do for animations. The editor's Save sends the model's weapons and holds, and an unchanged weapon writes nothing. Update README and ARCHITECTURE (Library folders, Saving).
- Non-goals: Weapon editing UI (RL-043), creating, renaming or deleting weapons, and writing art or palettes.
- Acceptance: Plan tests check the writes: an edited grip writes only `weapon.json`, an edited hold writes only `hold.json`, and an unchanged weapon writes nothing. They refuse an unmapped weapon, a renamed weapon, a hold for the daggers and a slot without a part, writing nothing. Endpoint tests on a temporary folder back up the previous `weapon.json` and `hold.json`. A live `curl` save to a worktree dev server over a temporary `RIGLAB_LIBRARY` copy changes the sword's hold on disk, and that server's wardrobe shows it. `npm run check` passes.
- Validation: Pinned `npm ci`, focused library tests, `npm run check`, `npm run audit:dependencies`, `check:patch`, `git diff --check`, the live `curl` save, and exact-head CI.
- Authorities: `src/library/save.ts`, `src/library/write.ts`, `src/library/endpoint.ts`, `src/library/load.ts`, `src/format/weapon.ts`, `src/format/hold.ts`, `src/editor/librarySave.ts`, `src/editor/model.ts`, `README.md`, `docs/ARCHITECTURE.md`, and the owner's report on 2026-10-13.

### RL-042 — [FEAT] Browse animations by class in the editor and the wardrobe

- Dependency: None.
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
- Authorities: `src/editor/types.ts`, `src/editor/state.ts`, `src/editor/modelEdits.ts`, `src/app/App.tsx`, `src/app/ModePanel.tsx`, `src/app/Toolbar.tsx`, `src/app/Timeline.tsx`, `src/app/useCanvasDrags.ts`, `src/viewer/usePlayback.ts`, `README.md`, `docs/ARCHITECTURE.md`, and the owner's answers on 2026-10-13.

### RL-045 — [FEAT] Polish the editor and the wardrobe in a UX pass

- Dependency: RL-044.
- Why: The owner asked on 2026-10-13 for "a ux pass / cleanup pass". With classes, weapon editing and Animate in place, one pass over the whole flow can fix what the feature tasks leave behind. Some rough edges already exist:
  - The editor opens with Art off, so it shows a stick figure and no weapon art.
  - The library label appears twice, in the toolbar and in the status bar.
  - Some text still speaks of "seed animations" and "starting animations".
  - Rig setup, Pose and Animation give the same generic hint when nothing is selected.
- Scope: Open the editor with Art on, and show the library label once. Give each mode's empty panel its own next step. Rig setup asks to select a joint or a weapon part. Animate asks to select a joint on a key. Export says what it writes. Remove stale text from the app and `placeholder-library/README.md`, and from the owner's `~/Documents/RigLab/README.md`, backing that file up first. Walk through every mode, class and kind, and the wardrobe, in headless Chrome at 1440 × 900 and at 860 px wide. Fix every overflow, clipped label, focus or contrast problem the walkthrough finds. Then sweep README and ARCHITECTURE for anything the earlier tasks left stale.
- Non-goals: New features or modes, format changes, and a new visual theme.
- Acceptance: Tests pin Art on at start and the single library label. The walkthrough finds no horizontal overflow, clipped labels or console errors, and its screenshots go in the delivery report. No user-facing text mentions seed or starting animations, documents, New, Open or Pose mode. `npm run check` passes.
- Validation: Pinned `npm ci`, focused app tests, `npm run check`, `npm run audit:dependencies`, `check:patch`, `git diff --check`, the headless walkthrough, and exact-head CI.
- Authorities: `src/app/`, `src/wardrobe/`, `placeholder-library/README.md`, `~/Documents/RigLab/README.md`, `README.md`, `docs/ARCHITECTURE.md`, and the owner's direction on 2026-10-13.
