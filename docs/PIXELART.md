# Pixel-art contract

RigLab's pixel art is stored as pixels: each part is a `riglab.part` grid of palette keys (`src/format/part.ts`),
not SVG, a CSS filter or a sprite sheet. This document defines how to make or edit a pixel skin or pixel weapon. The
loader (`src/library/art.ts`) enforces it on every set whose palette is `pixel`. Vector art, such as the `chibi` skin
and the owner's four weapons, stays SVG in Hexframe's part format, and RigLab never exports it.

## One shared grid

- One pixel is a **2 × 2 cell in rig units**, in every part: armor, cloth, outlines, faces, highlights and shadows.
  The chibi stands 91 units, about 45 pixels, tall.
- A part's `origin` is its top-left pixel in its bone's frame, counted in pixels, so pixel `(x, y)` of the grid covers
  rig units `2 × (origin[0] + x)` to `2 × (origin[0] + x + 1)` across, and likewise down. Negative origins are normal:
  a bone's local origin is its joint.
- Pixels move and rotate with their bone, so a turned joint may be antialiased on screen; that is display pixels, not
  art. Draw by filling pixels, never by changing the skeleton, its offsets, joints, slots or proportions.

## The part file

A pixel set holds one `<stem>.part.json` per slot it draws, named after the slot without its first `_`-separated
prefix: `head.part.json`, `torso.part.json`, `pelvis.part.json`, `arm_upper_l.part.json`, `arm_lower_l.part.json`,
`arm_upper_r.part.json`, `arm_lower_r.part.json`, `leg_upper_l.part.json`, `leg_lower_l.part.json`,
`leg_upper_r.part.json` and `leg_lower_r.part.json` for the chibi. A pixel weapon holds one per body slot.

```json
{
  "format": "riglab.part",
  "version": 1,
  "bone": "forearm-back",
  "origin": [-2, -1],
  "size": [4, 5],
  "rows": [
    "iiii",
    "iffi",
    "iffi",
    "iffi",
    "iiii"
  ],
  "keys": {
    "i": "part part--ink",
    "f": "part part--fill"
  }
}
```

- `bone` is the bone that owns the slot, as the rig names it: `forearm-back` for `arm_lower_l.part.json`. Front and
  back come from the rig, not from how the art looks. A weapon part's bone is its slot's stem.
- `size` is the width and height in pixels, each from 1 to 256. `rows` holds exactly `size[1]` strings, top to bottom,
  each exactly `size[0]` characters.
- Each character is `.`, which draws nothing, or a key. A key is one printable ASCII character other than a space and
  `.`, and `keys` maps it to its class tokens in the palette's cascade order. Every key is used and every token is
  defined in the set's `palette.json`. A part draws at least one pixel.
- A pixel has exactly one key, so nothing overlaps inside a part and a part has no paint order of its own. Parts paint
  in the rig's paint order (see docs/ARCHITECTURE.md).
- Files are written canonically by `serializePart`: two-space JSON, each pair on one line, one line per row and key.

## The palette

`palette.json` is a `riglab.palette` with `"pixel": true` that defines every class token the keys use, in cascade
order, with flat fills. A pixel palette draws no strokes; a colored `stroke`, a `strokeWidth` or a `linecap` is refused,
and outlines are ordinary pixels. A set's art set is its config name, so its colors never reach another set.

## Converting SVG cell art

Pixel sets were once SVG with one `M{x} {y}h2v2h-2z` path cell per pixel. The loader now refuses SVG in a pixel set and
names the converter:

```bash
npm run convert:parts -- <library-folder>
```

It rewrites every SVG part of every pixel set the folder's `config.txt` maps as a grid, keeping the class each pixel
showed (later paths painted over earlier ones), and removes the SVG. It refuses cell art off the even grid, merged
cells, curves and an existing `.part.json`, and then changes nothing in the folder.

## Workflow

1. Start from the chibi's part for the same slot and its exact `bone`, and cover every slot the set draws.
2. Pick one readable key per color, such as `i` for `part--ink`, and draw the rows.
3. Define every token in `palette.json`.
4. Run `npm run check:library` on the folder. It refuses, by file and JSON path, a row of the wrong width, an unknown or
   unused key, an undefined token, a wrong `bone`, and a missing or extra part.
5. Look at the set at rest and with a few joints turned, to catch overlaps and clipping.

## Animation is separate

These files are art, not keyframes, and adding a skin changes no animation. For stepped, sprite-like playback, author
keys with `hold` interpolation on Hexframe's clock instead of drawing in-between art, and never draw a weapon into an
armor part.
