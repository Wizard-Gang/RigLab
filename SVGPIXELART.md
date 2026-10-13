# SVG pixel-art contract

RigLab's optional chibi armor is **editable vector art made of unit pixels**, not a bitmap, CSS pixelation filter, or animated sprite sheet. This document defines how to create or edit additional art that matches the current set.

## One shared grid

- The canonical cell is exactly **2 × 2 SVG units** in every part, including armor, undercloth, outlines, facial features, highlights and shadows.
- Each bone's local origin is `(0, 0)` and its pixel lattice is `2ℤ × 2ℤ`. Both X and Y of every painted cell's top-left corner must be integer multiples of 2, including negative coordinates.
- A pixel uses one closed SVG subpath, e.g. `M-4 6h2v2h-2z`. A path may join many such cells separated by one space. Do not merge adjacent cells into rectangles or stretch a pixel to achieve a highlight, contour or border.
- Curves, diagonal SVG line segments, arbitrary-sized squares, fractional coordinates, raster images, gradients, embedded fonts, masks, filters, CSS strokes and foreign elements are not part of the pixel-art source. The dark silhouette border is itself made of ordinary 2 × 2 filled cells.
- Draw by filling grid cells, not by changing the skeleton, its offsets, joints, art slots or proportions. Bone-local cells move and rotate together with their bone: a transformed 2×2 cell is still one source pixel, although rotated joints may be antialiased by browsers on a display. Do not confuse display pixels with SVG art units.

## Parser-safe file format

Follow RigLab's existing `src/hexframe/parts.ts` parser, which intentionally accepts only a minimal SVG subset. Put each new skin at:

`characters/chibi/skins/<skin>/parts/<native-bone-part>.svg`

Exactly 11 filenames are expected for the current chibi skeleton: `head.svg`, `torso.svg`, `pelvis.svg`, `arm_upper_l.svg`, `arm_lower_l.svg`, `arm_upper_r.svg`, `arm_lower_r.svg`, `leg_upper_l.svg`, `leg_lower_l.svg`, `leg_upper_r.svg`, `leg_lower_r.svg`.

A complete part's shape is:

```svg
<svg xmlns="http://www.w3.org/2000/svg" data-bone="forearm-back"><path class="part part--armor" d="M-4 0h2v2h-2z M-2 0h2v2h-2z"/></svg>
```

- Preserve the native `data-bone` name for each filename. Bone names and `chibi_*` slots must match `characters/chibi/chibi.rig.json` exactly; front/back is defined by the rig, not by the artist's visual guess.
- Use a single `<svg>` root with **only** `xmlns` and `data-bone`; children may be **only** `<path class="..." d="..."/>` with no extra attributes or text. Paths use RigLab's class-token convention; no inline fill/stroke or SVG `style` attribute.
- Every `d` value must be one or more space-separated `M{even-x} {even-y}h2v2h-2z` subpaths. Layering/order of subpaths and `<path>` elements determines appearance. Prefer a dark outer silhouette path first, then colored materials and small accent cells.
- Map each part to its existing art slot through `parsePart(markup, "chibi-armor")`. Add any new set's colors only under its dedicated `.art-set--<name>` CSS class; define flat fills and `stroke:none` to avoid fractional pixel outlines. Preserve other art sets unchanged.

## Repeatable workflow

1. Start with the existing chibi bone-local part and its exact `data-bone` value. Build geometry only from the canonical 2×2 cell grid; keep all eleven bone slots covered.
2. Group identically colored cells in a `<path>` with approved class tokens. Keep each cell separate rather than combining into a larger subpath.
3. Add palette classes in the skin's namespaced stylesheet; the current armor example is `src/chibi/armor.css`.
4. Validate **every** path by splitting it into closed cells, checking exact syntax and even-aligned X/Y. Check the root and child parser restrictions, slot ↔ bone matching, and that no image/weapon/prop or extra joint was introduced.
5. Run `npm run test -- tests/chibi/armor-skin.test.ts`, then the repository's pinned `npm run check` and `npm run audit:dependencies`. Require exact-head CI and all governance gates for any PR. Browser-inspect the rig at rest and a few posed joint rotations to catch unwanted overlap or clipping.

## Animation is separate

These 11 files are art, not keyframes. Existing RigLab animations remain unchanged. For stepped sprite-like playback, keys use `interpolation: "hold"` at the document's chosen FPS (14 by default); do not create interpolated art frames or include a weapon in an armor part.

**Current reference:** `characters/chibi/skins/armor/parts/*.svg` and `tests/chibi/armor-skin.test.ts`.
