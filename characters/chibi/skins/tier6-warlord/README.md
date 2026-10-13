# Tier 6 Warlord — optional 11-part chibi skin

Bald, bearded dark-crimson and gold plate warrior inspired by the supplied Tier 6 reference. The spiked shoulder pauldrons are attached to `torso.svg`, not to the rotating upper arms. The latter are trimmed to bicep-only armor.

This is an **optional artwork set**, not a new rig. Its 11 separate SVG parts use the exact existing `characters/chibi/chibi.rig.json` bone names, offsets, tips and `chibi_*` slots. Default chibi, red armor and blue-mage skins remain unchanged.

Each SVG contains only classed `<path>` elements with **2×2, even-grid** square subpaths; colors are specified by `src/chibi/tier6-warlord.css`. No weapon, prop, joint, animation, raster asset or interpolation is added. Follows [`SVGPIXELART.md`](../../../../SVGPIXELART.md).

Import `TIER6_WARLORD_PARTS` from `src/chibi/tier6-warlord.ts` and use it with the unchanged `CHIBI_RIG` when a consumer explicitly selects this skin. Skin selection UI remains out of scope.
