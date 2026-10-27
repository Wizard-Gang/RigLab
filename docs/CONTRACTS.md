# Consumer contracts

This page is normative for programs that read RigLab's exports, such as RenderLab's RigLab reader. It states what a
reader must do with each format and names, after every rule, the schema, validator or conformance case that holds it.
Where this page and [Architecture](ARCHITECTURE.md) differ, the schemas and validators win and this page is wrong. The
words "must" and "must not" are requirements; everything else is explanation.

Paths below are repository-relative. `schemas/<format>.v<N>.schema.json` is the published JSON Schema (2020-12) of a
format, and its `description` lists the rules the schema cannot express, which a reader checks itself.
`conformance/cases.json` indexes every fixture in `conformance/` with what a reader must find.

## Files and formats

| Format | Version | Schema | Validator or writer | Where it appears |
| --- | --- | --- | --- | --- |
| `riglab.export` | 2 | `schemas/riglab.export.v2.schema.json` | `src/export/bundle.ts` `buildBundle` | `riglab-export/manifest.json` |
| `riglab.rig` | 2 | `schemas/riglab.rig.v2.schema.json` | `src/format/rig.ts` `validateRig` | `riglab-export/<rig>.rig.json` |
| `riglab.anim` | 3 | `schemas/riglab.anim.v3.schema.json` | `src/format/animation.ts` `validateAnimation` | `riglab-export/animations/` |
| `riglab.weapon` | 1 | `schemas/riglab.weapon.v1.schema.json` | `src/format/weapon.ts` `validateWeapon` | `riglab-export/weapons/` |
| `riglab.hold` | 1 | `schemas/riglab.hold.v1.schema.json` | `src/format/hold.ts` `validateHold` | `riglab-export/weapons/` |
| `riglab.baked` | 1 | `schemas/riglab.baked.v1.schema.json` | `src/export/bake.ts` `bakeAnimation` | `riglab-export/baked/` |
| `riglab.skin` | 1 | `schemas/riglab.skin.v1.schema.json` | `src/export/skin.ts` `buildSkinBundle` | `riglab-skins/{skins,weapons}/<name>/manifest.json` |
| `riglab.palette` | 1 | `schemas/riglab.palette.v1.schema.json` | `src/format/palette.ts` `validatePalette` | each skin bundle's `palette.json` |
| `riglab.part` | 1 | `schemas/riglab.part.v1.schema.json` | `src/format/part.ts` `validatePart` | each skin bundle's `parts/` |

Each schema's `$id` is `urn:riglab:schema:<format>:<version>`.

- **R1. Closed documents.** A reader must refuse a document whose `format` or `version` is not one it implements, and
  any member its schema does not name. Every schema sets `additionalProperties: false` and pins `format` and
  `version` with `const`. Cases: `conformance/invalid/export-version.json` (`$.version`, `const`),
  `part-version.json` (`$.version`, `const`), `palette-format.json` (`$.format`, `const`),
  `export-unknown-member.json` (`$.extra`, `additionalProperties`), `anim-key-unknown-member.json`.
- **R2. Pinned files.** A reader must check each manifest entry's `bytes` and `sha256` against its file, and refuse a
  manifest that names a file its bundle lacks. Schemas: `riglab.export` v2 and `riglab.skin` v1 descriptions. Cases:
  `export-animation-bytes.json` (`bytes`), `export-rig-sha256.json` (`sha256`), `export-hold-file.json` (`file`),
  `skin-part-sha256.json` (`sha256`), `skin-palette-pin-member.json` (`required`).
- **R3. References.** A reader must check the cross-references each schema's `description` lists, such as a pose's
  bones, a pin's chain and a key's free bodies, against the bundle. Cases with reason `reference`:
  `anim-unknown-bone.json`, `anim-pin-gripped-chain.json`, `anim-free-body-missing.json`,
  `anim-riding-body-placed.json`, `weapon-grip-chain.json`.

## Space and units

- **R4. Rig space.** Coordinates are SVG units with x right, y down and rotation clockwise-positive. A rig's `space`
  must say exactly that: the schema pins `units: "svg"`, `x: "right"`, `y: "down"` and
  `rotation: "clockwise-positive"` with `const` (`$defs.space` of `riglab.rig.v2`), and `validateRig` refuses
  anything else. Fixture: `conformance/export/riglab-export/chibi.rig.json`.
- **R5. Parent-relative bones.** A bone's `offset` is its joint in its parent's frame and the root's offset is in rig
  space; `tip`, when present, is the bone's end in its own frame. A pose rotates every bone and translates only the
  root, so limbs keep their rest lengths; a reader must not scale or stretch bones. Schema: `riglab.anim` v3
  `$defs.root-channels` and the description's pose rule. Validator: `validateAnimation`. Case:
  `anim-unknown-bone.json`.
- **R6. Rotation units.** Poses, holds and key body placements give rotations in degrees; a baked transform is
  `[x, y, rotation]` in rig space with rotation in degrees, rounded to 1e-6. A world rotation is the parent's plus the
  bone's own. Schema: `riglab.baked` v1 description. Writer: `bakeAnimation` (`src/export/bake.ts`). Fixtures:
  `conformance/export/riglab-export/baked/`.

## Pixel grid and part origin

- **R7. One pixel is a 2 × 2 cell.** A `riglab.part` is a grid of pixels, each 2 × 2 rig units in its bone's frame
  (`PIXEL_UNITS` in `src/format/part.ts`). `origin` is the top-left pixel's position in the bone's frame and `size`
  is `[width, height]`, both counted in pixels. Schema: `riglab.part` v1 `origin` and `size`.
- **R8. Placing a pixel.** The pixel in row `r` and column `c` covers the cell whose top-left corner is
  `((origin[0] + c) × 2, (origin[1] + r) × 2)` in the bone's frame, `partPixels` in `src/format/part.ts`. A reader
  draws the part at its bone's world transform: translate to the bone's joint, then rotate by its rotation. Fixture:
  `conformance/export/riglab-skins/skins/pixel/parts/head.part.json` (`origin` `[-13, -24]`, `size` `[24, 23]`).
- **R9. Grid shape.** There must be exactly `size[1]` rows of exactly `size[0]` characters, each `.` (nothing) or a
  key of `keys`, and every key must be used. The schema's description lists these rules for the reader; `validatePart`
  enforces them. Fixtures: every `riglab.part` entry of `conformance/cases.json`.
- **R10. Pixel only.** Only pixel art sets export. A vector set, such as the editor's `chibi` skin, is left out of
  `riglab-skins/`, so a reader never receives vector art from RigLab. Writer: `buildSkinBundle`
  (`src/export/skin.ts`). Fixtures: `conformance/export/riglab-skins/`.

## Ticks and baked frames

- **R11. 60 Hz.** One frame is one tick of a fixed 60 Hz clock. `fps` is always 60: `riglab.anim` v3 and
  `riglab.baked` v1 pin it with `const`, and `ENGINE_FPS` (`src/format/timing.ts`) is 60. Case: `anim-fps.json`
  (`$.fps`, `const`).
- **R12. Kinds fix timing.** An animation's `kind` fixes its `length`, `loop` and key frames: `idle` 60 frames looping,
  `walk` 48 looping, `jump` 36 once, `attack` 24 once and `hit` 24 once. Schema: the per-kind branches of
  `riglab.anim` v3. Timing table: `KINDS` in `src/format/timing.ts`.
- **R13. Baked frame range.** A looping animation bakes ticks `0` to `length - 1`, `length` frames, because tick
  `length` is tick 0 again. A one-shot animation bakes ticks `0` to `length`, `length + 1` frames, the last being its
  final pose. Writer: `bakeAnimation` (`src/export/bake.ts`). Schema: `riglab.baked` v1 description. Fixtures:
  `baked/unarmed-walk.baked.json` (loop, 48 frames), `baked/daggers-idle.baked.json` (loop, 60),
  `baked/unarmed-attack.baked.json` and `baked/sword-attack.baked.json` (once, 25).
- **R14. Bone and body order.** A baked frame has one transform per bone in the file's `bones` order, which is the
  rig's bone order. `weapons`, when present, has one entry per frame: `null`, or the class weapon's `name` and every
  body's transform by name, riding bodies included. Schema: `riglab.baked` v1. Case: `baked-transform.json`
  (`$.frames[0][0]`, `minItems`). Fixture: `baked/sword-attack.baked.json`.

## Sampling

- **R15. Baked frames are authoritative.** A reader that draws must take bone and weapon transforms from the baked
  files, and must not re-solve pins, grips or IK. The baked frames are what RigLab's preview plays (`playAt`,
  `src/solve/engine.ts`). Writer: `bakeAnimation`. Fixtures: `conformance/export/riglab-export/baked/`, which the
  conformance suite proves equal to a fresh bake.
- **R16. Tick to frame.** At tick `t` from the animation's start, a looping animation shows baked frame
  `t mod length` and a one-shot shows frame `min(t, length)`, holding its final pose. Sampler: `sampleAnimation`
  (`src/format/sample.ts`) wraps a loop and clamps a one-shot the same way. Fixtures: R13's baked files.
- **R17. Between ticks.** A reader may interpolate presentation between two baked frames but must not change tick
  timing. One that evaluates keys instead must reproduce `engineOf` and `playAt` (`src/solve/engine.ts`): the 13
  poses at `i × length / 12`, each solved to its pins and grips, played `linear` between neighbours by Hexframe's
  vendored `sampleClip`, and is checked by matching the conformance baked files. Keys' `interpolation` is `hold`,
  `linear` or `smoothstep`. Case: `anim-interpolation.json` (`$.keys[0].interpolation`, `enum`).

## Paint order

- **R18. Resolved order.** A rig with depth profiles carries `paintOrder`: for every profile, every bone exactly once,
  back to front, for facing `right` and for facing `left`, resolved with Hexframe's `visualPaintOrder`. A reader must
  paint in that order and must not derive the left order by mirroring the right one. Schema: `riglab.rig` v2
  `$defs.paint-order` and `$defs.facing-orders`. Validator: `validatePaintOrder` (`src/format/paint.ts`). Fixture:
  `chibi.rig.json`, whose `anatomical` right and left orders differ.
- **R19. Choosing the profile.** An animation's profile is `paintOrder.byClip[<animation name>]`, else
  `paintOrder.byClip[<class>]`, else `depthProfiles.default`, as Hexframe's `depthProfileName`
  (`vendor/hexframe/src/rig/depth.ts`) picks it; `paintOrder.byClip` holds every `depthProfiles.byClip` entry, and in
  an export also maps each animation to its class's profile. Writer: `resolvePaintOrder` (`src/format/paint.ts`). Fixture: `chibi.rig.json`, where `sword-attack` maps to
  `both-front`.
- **R20. Held weapons.** `paintOrder.held` is the constant `{"bodies": "over-figure", "grippingForearms":
  "over-bodies"}` (`HELD_PAINT`, `src/format/paint.ts`). On a frame that holds a weapon, a reader paints the figure in
  profile order without the gripping forearms, then every weapon body in the weapon's body order, then the gripping
  forearms (the `lower` bone of each chain a grip names) in profile order. So every body paints over the whole figure,
  the head included, and each hand closes over its grip. Schema: `riglab.rig` v2 `$defs.paint-order`, member `held`. Code:
  `withWeaponArt` (`src/hexframe/art.ts`). Fixtures: `riglab-export/weapons/sword.weapon.json` (both hands on one free
  body), `riglab-export/weapons/daggers.weapon.json` (one riding body per hand).

## Palette binding

- **R21. Parts by slot.** A skin bundle lists one part per rig bone, in bone order, with that bone's `slot`; a weapon
  bundle lists one part per body, in body order, with the body's `name` and `slot`. Bodies that share a slot share a
  file, `parts/<slot after its first _>.part.json`. Schema: `riglab.skin` v1 description. Writer: `buildSkinBundle`.
  Fixtures: `riglab-skins/skins/pixel/manifest.json`, `riglab-skins/weapons/daggers/manifest.json`.
- **R22. Keys to classes to styles.** A part's `keys` map each row character to class tokens; the bundle's own
  `palette.json` maps each token to a style. A pixel's style is its tokens' styles cascaded in the palette's
  `classes` member order, a later token overriding an earlier one, so a reader must keep that order. Schemas:
  `riglab.part` v1 `keys`, `riglab.palette` v1 description. Validator: `validatePalette`. Fixture:
  `riglab-skins/skins/pixel/palette.json`.
- **R23. Pixel palettes.** A palette with `pixel: true` draws whole cells with crisp edges and no strokes: its styles
  carry no `strokeWidth` or `linecap`, and `stroke` only as `none`. A reader must not smooth or outline its cells.
  Schema: `riglab.palette` v1. Fixture: `riglab-skins/skins/pixel/palette.json`.

## Versioning policy

Each format carries its own `version`, and readers pin the versions they implement (R1).

- **V1. What bumps a version.** Any change after which a valid document could be refused or read differently by a
  reader of the current schema bumps that format's version: adding, removing or renaming a member; changing a type,
  `const`, `enum`, pattern or range; changing the meaning or units of a value (space, pixel size, tick rate, frame
  range, rotation units, paint or cascade order); or changing a rule a schema `description` lists. Precedents:
  `riglab.export` v2 (sizes and holds), `riglab.rig` v2 (`paintOrder`) and `riglab.anim` v3 (classes).
- **V2. What does not.** A change that leaves every valid document's bytes and meaning as they were, such as a
  clearer `description`, a new conformance case or a fix that makes a validator refuse what its schema already
  refuses, keeps the version.
- **V3. A bump ships whole.** A new version publishes `schemas/<format>.v<N>.schema.json` with a new `$id`, updates
  its validator or writer, regenerates `conformance/` with `npm run export:conformance` and updates this page in the
  same change. RigLab then writes only the new version, and refuses an older library version with a pointer to its
  migration, as it refuses `riglab.rig` v1 and points to `npm run migrate:rig`.
- **V4. Where a bump shows.** A bumped format's files in the bundle change, so their manifest `sha256` pins change
  (R2); a reader that pins `conformance/cases.json` digests sees every changed fixture.
