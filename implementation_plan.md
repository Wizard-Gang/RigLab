# Implementation plan

## Open tasks

### RL-044 — [FEAT] Merge Pose and Animation into one Animate mode

- Dependency: None.
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
