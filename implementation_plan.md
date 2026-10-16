# Implementation plan

## Open tasks

### RL-045 — [FEAT] Polish the editor and the wardrobe in a UX pass

- Dependency: None.
- Why: The owner asked on 2026-10-13 for "a ux pass / cleanup pass". With classes, weapon editing and Animate in place, one pass over the whole flow can fix what the feature tasks leave behind. Some rough edges already exist:
  - The editor opens with Art off, so it shows a stick figure and no weapon art.
  - The library label appears twice, in the toolbar and in the status bar.
  - Some text still speaks of "seed animations" and "starting animations".
  - Rig setup and Animate give the same generic hint when nothing is selected.
- Scope: Open the editor with Art on, and show the library label once. Give each mode's empty panel its own next step. Rig setup asks to select a joint or a weapon part. Animate asks to select a joint on a key. Export says what it writes. Remove stale text from the app and `placeholder-library/README.md`, and from the owner's `~/Documents/RigLab/README.md` and the comment at the top of its `config.txt`, backing both files up first. Walk through every mode, class and kind, and the wardrobe, in headless Chrome at 1440 × 900 and at 860 px wide. Fix every overflow, clipped label, focus or contrast problem the walkthrough finds. Then sweep README and ARCHITECTURE for anything the earlier tasks left stale.
- Non-goals: New features or modes, format changes, and a new visual theme.
- Acceptance: Tests pin Art on at start and the single library label. The walkthrough finds no horizontal overflow, clipped labels or console errors, and its screenshots go in the delivery report. No user-facing text mentions seed or starting animations, documents, New, Open or Pose mode. `npm run check` passes.
- Validation: Pinned `npm ci`, focused app tests, `npm run check`, `npm run audit:dependencies`, `check:patch`, `git diff --check`, the headless walkthrough, and exact-head CI.
- Authorities: `src/app/`, `src/wardrobe/`, `placeholder-library/README.md`, `~/Documents/RigLab/README.md`, `~/Documents/RigLab/config.txt`, `README.md`, `docs/ARCHITECTURE.md`, and the owner's direction on 2026-10-13.
