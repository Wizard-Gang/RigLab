# Optional uniform pixel-art chibi armor

11 independent, parser-compatible red/gold SVG armor parts matching the **existing** `chibi.rig.json` skeleton. They use the native filenames, bone-local pivots and `chibi_*` slots, but don't replace RigLab's default chibi art.

**Grid:** Every visible cell is an independent 2 × 2 SVG-unit square (`M x yh2v2h-2z`, even X/Y), including dark exterior outlines and highlights. See the repository's [SVGPIXELART.md](../../../../SVGPIXELART.md) for the repeatable authoring and validation rules.

**Integration:** `src/chibi/armor.ts` exposes `CHIBI_ARMOR_PARTS` to substitute for `CHIBI_PARTS` in `artPlacements` against the same `CHIBI_RIG`; `src/chibi/armor.css` provides separately namespaced flat colors. There is no skin-picker UI in this assets-only change.

**Tests:** `tests/chibi/armor-skin.test.ts` verifies all 11 slots and parser contract, identical 2×2 cells, and a weapon-free art registry. No spear, additional bones, rig edits, interpolation, timeline changes, or gameplay assets.
