# Implementation plan

## Open tasks

### RL-014 — [FEAT] Add a chibi rig template with matching art

- Dependency: None.
- Why: The owner wants a second character on Hexframe's 11-bone rig: the same bones, chains and art style at chibi proportions (think MapleStory), with art of its own. It shows one rig contract driving several characters without reauthoring their motion.
- Scope:
  - `characters/chibi/chibi.rig.json`, a `riglab.rig` with Hexframe's 11 bone names, parents, chains, bend sides and depth profiles. It is about two heads tall: the head is roughly half the height, the torso is short and the limbs are stubby. Both feet rest at y = 0, and the bones use their own `chibi_*` art slots.
  - `characters/chibi/parts/`, 11 original part SVGs in Hexframe's part format (one svg root naming its bone, holding plain paths), so the existing strict part parser reads them. The style is MapleStory-like chibi: a big round head with hair, eyes and blush, puffy sleeves, mitten hands and big shoes. It copies no MapleStory asset.
  - Retargeting, so Hexframe's 13 reference animations play on the chibi: rotations are copied and root translation is scaled by the leg-length ratio.
  - New offers two templates, the Hexframe humanoid and the Chibi. Art binds by slot, so the Art toggle draws each rig's own art, and each art set has its own palette.
- Non-goals: Changing Hexframe's rig or art; new animation authoring; a skin picker that mixes art sets across rigs.
- Acceptance:
  - The chibi rig validates, resolves through Hexframe's `createRig`, keeps the humanoid's bone tree and chains, and stands with both feet at y = 0 and its head at least 45% of its height.
  - All 11 parts parse and bind to their bones by slot.
  - All 13 retargeted animations validate, keep every rotation, and keep limb lengths on every frame.
  - New from the Chibi template opens the chibi with its animations, and `toHexframeRig` accepts it.
  - `npm run check` passes.
- Validation: Pinned `npm ci`, focused chibi tests, `npm run check`, `npm run audit:dependencies`, `check:patch`, `git diff --check`, a browser pass with Art on, and exact-head CI.
- Authorities: `vendor/hexframe/characters/fighter/`, `src/hexframe/parts.ts`, `docs/ARCHITECTURE.md`, and owner direction on 2026-10-13.
