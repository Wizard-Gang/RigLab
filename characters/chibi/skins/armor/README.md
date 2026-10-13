# Optional chibi armor skin (11 SVG parts)

Alternate red-and-gold armor for RigLab's **existing** 11-bone chibi rig.
All 11 source files retain the original `<svg xmlns=... data-bone=...>` root,
classed `<path>`-only format, native artwork, bone pivots and local coordinates.
No spear, weapon, animation, extra joint, IK change, or timeline behavior.

## Layout

- `parts/*.svg` — the 11 original-filename vector skins, one per chibi bone.
- `src/chibi/armor.ts` — independently exported `CHIBI_ARMOR_PARTS` art
  registry, keyed by RigLab's existing `chibi_*` slots.
- `src/chibi/armor.css` — independent namespaced palette, imported by the
  optional armor module. Native chibi styling remains untouched.
- `tests/chibi/armor-skin.test.ts` — parse, slot, and path-preservation checks.

## Using the skin

Pass `CHIBI_ARMOR_PARTS` in place of `CHIBI_PARTS` when rendering
the same `CHIBI_RIG`, e.g.:
`artPlacements(CHIBI_RIG, runtimeRig, placed, CHIBI_ARMOR_PARTS, animationName)`.

RigLab's existing chibi template and default skin continue unchanged.
An editor skin picker is separate feature work; this patch only adds the
alternative assets and a reusable art registry. Do not modify
`characters/chibi/parts/*.svg` or the vendored Hexframe sources.
