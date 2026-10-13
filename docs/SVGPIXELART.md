# SVG pixel-art contract

RigLab's pixel skins are editable vector art made of unit pixels: not a bitmap, a CSS pixelation filter or a sprite
sheet. This document defines how to make or edit a skin that matches them. It came in with the red-and-gold armor,
blue mage and Tier 6 Warlord skins from draft PR 15, which now live in the owner's library folder
(`~/Documents/RigLab/skins/`), and RigLab's loader enforces it on every pixel skin.

## One shared grid

- The cell is exactly **2 × 2 SVG units** in every part: armor, cloth, outlines, faces, highlights and shadows alike.
- Each bone's local origin is `(0, 0)` and its lattice is `2ℤ × 2ℤ`. The top-left corner of every cell has even `x`
  and `y`, negative coordinates included.
- A cell is one closed subpath, `M{x} {y}h2v2h-2z`, such as `M-4 6h2v2h-2z`. A path joins any number of cells with
  single spaces. Never merge neighbouring cells into a rectangle or stretch one to make a highlight or border.
- Curves, diagonal segments, other sizes, fractional coordinates, raster images, gradients, fonts, masks, filters and
  strokes are not part of the art. The dark silhouette border is itself made of ordinary filled cells.
- Draw by filling cells, never by changing the skeleton, its offsets, joints, slots or proportions. Cells move and
  rotate with their bone, so a rotated joint may be antialiased on screen; that is display pixels, not art units.

## Where a skin lives

A skin is a directory in a library folder, mapped by a line of the folder's `config.txt`:

```text
skin tier6-warlord = skins/tier6-warlord
```

The directory holds one SVG per chibi slot, named after the slot without its `chibi_` prefix: `head.svg`, `torso.svg`,
`pelvis.svg`, `arm_upper_l.svg`, `arm_lower_l.svg`, `arm_upper_r.svg`, `arm_lower_r.svg`, `leg_upper_l.svg`,
`leg_lower_l.svg`, `leg_upper_r.svg` and `leg_lower_r.svg`. Next to them is a `palette.json`. Other files, such as a
`README.md`, are not read.

Each part is RigLab's strict part shape (`src/hexframe/parts.ts`): one `<svg>` root with only `xmlns` and
`data-bone`, holding only `<path class="…" d="…"/>` elements with no other attributes or text.

```svg
<svg xmlns="http://www.w3.org/2000/svg" data-bone="forearm-back"><path class="part part--armor" d="M-4 0h2v2h-2z M-2 0h2v2h-2z"/></svg>
```

`data-bone` must be the bone that owns the slot, as the rig names it: `forearm-back` for `arm_lower_l.svg`. Front and
back come from the rig, not from how the art looks.

## The palette

`palette.json` is a `riglab.palette` with `"pixel": true`. It defines every class token the parts use, in cascade
order, with flat fills:

```json
{
  "format": "riglab.palette",
  "version": 1,
  "pixel": true,
  "classes": {
    "part": {},
    "part--ink": { "fill": "#18121a" },
    "part--steel": { "fill": "#685253" }
  }
}
```

A pixel palette draws no strokes; a colored `stroke`, a `strokeWidth` or a `linecap` is refused. RigLab gives a pixel
set crisp edges. The skin's art set is its config name, so its colors never reach another skin.

## Workflow

1. Start from the chibi's part for the same slot and its exact `data-bone`. Build only from 2 × 2 cells, and cover all
   eleven slots.
2. Group cells of one color in one `<path>` with a class token, keeping every cell separate. Paint order is the order
   of the paths and cells: put the dark silhouette first, then materials, then small accents.
3. Define every token in `palette.json`.
4. Run `npm run check:library` in the RigLab repository. It reads the folder as `npm start` does and refuses, by file
   and path, a cell that is off the grid, merged or curved, a token the palette lacks, a wrong `data-bone`, and a
   missing or extra part.
5. Look at the skin at rest and with a few joints turned, to catch overlaps and clipping.

## Animation is separate

These files are art, not keyframes, and adding a skin changes no animation. For stepped, sprite-like playback, author
keys with `hold` interpolation on Hexframe's clock instead of drawing in-between art, and never draw a weapon into an
armor part.
