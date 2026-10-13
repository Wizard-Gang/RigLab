# Implementation plan

## Open tasks

### RL-016 — [FEAT] Start new animations with five keys at 0, 6, 12, 18 and 24

- Dependency: None.
- Why: The owner wants every new animation to start as five evenly spaced keys at 14 fps, ready to pose, instead of a single key.
- Scope: A new animation (Animations, New) has five rest-pose keys at frames 0, 6, 12, 18 and 24, each holding until the next, at 14 fps, 24 frames long and not looping. The spear-thrust acceptance test builds on that default: it poses keys 0, 6 and 12 and deletes 18 and 24. Docs say what a new animation starts with.
- Non-goals: Changing the template documents, the 14 fps default, or other timeline behavior.
- Acceptance: Adding an animation produces keys at exactly 0, 6, 12, 18 and 24, all holding the rest pose, at 14 fps with a length of 24. The document still validates, and undo removes the animation. `npm run check` passes.
- Validation: Pinned `npm ci`, focused document and acceptance tests, `npm run check`, `npm run audit:dependencies`, `check:patch`, `git diff --check`, a browser pass, and exact-head CI.
- Authorities: `src/editor/animations.ts`, `docs/ARCHITECTURE.md`, and owner direction on 2026-10-13.
