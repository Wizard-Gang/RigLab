# Implementation plan

## Open tasks

### RL-027 — [FEAT] Add a /wardrobe/ page that cycles every skin and part

- Dependency: RL-025 and RL-026.
- Why: The owner wants a `/wardrobe/` route to step through each skin and each part in the library.
- Scope: Add `wardrobe/index.html` and `src/wardrobe/` as a second Vite page, served at `/wardrobe/` by `npm start` and built to `dist/wardrobe/index.html`. The editor's toolbar links to it and it links back. The page draws the library's rig large with art on, read-only, reusing `RigCanvas` and the art layer without handles. Skin ‹ › puts one skin on every slot. Each of the rig's slots has its own ‹ › that cycles that slot's part through every skin and shows which skin it came from, so parts mix and match. Weapon ‹ › cycles None and each library weapon at its hold. Motion ‹ › cycles Rest and each library animation, played in a loop through the existing playback, so skins can be checked at rotated joints. Arrow keys step skins (←/→) and slots (↑/↓), `[` and `]` cycle the selected slot's part, and Reset puts the current skin back on every slot. All of this lives in a pure state module.
- Non-goals: Saving an outfit to documents or carrying it into the editor (the owner chose browse-only on 2026-10-13), editing art, export, and remembering the selection between visits.
- Acceptance: State tests cycle skins, slots, parts, weapons and motions with wraparound in both directions, keep every slot mapped to a library skin, and reset. On headless Chrome at `/wardrobe/`, against the placeholder library and then the real folder, every skin and every slot's parts are stepped through. At each step the drawn parts come from the expected art sets with one part per slot. Weapons and motions cycle, and there are no console errors. The editor at `/` is unchanged, and `npm run build` emits both pages. `npm run check` passes.
- Validation: Pinned `npm ci`, focused wardrobe state tests, `npm run check`, `npm run audit:dependencies`, `check:patch`, `git diff --check`, the headless Chrome pass on a worktree dev server, and exact-head CI.
- Authorities: `vite.config.ts`, `index.html`, `src/app/Toolbar.tsx`, `src/viewer/RigCanvas.tsx`, `src/viewer/ArtLayer.tsx`, `src/viewer/usePlayback.ts`, `docs/ARCHITECTURE.md`, and owner direction on 2026-10-13.
