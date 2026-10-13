# Blue mage — optional pixel-art chibi skin

Eleven SVG part files mapped to `characters/chibi/chibi.rig.json` and its native `chibi_*` art slots. The artwork represents platinum braided hair, blue eyes, a silver bodice, navy split-coat armor, asymmetric gold pauldrons and armored boots, based on the supplied character reference.

Each painted pixel, highlight and outline is an independent **2x2 SVG-unit square** aligned on the existing bone-local lattice, per [SVGPIXELART.md](../../../../SVGPIXELART.md). Every part has one parser-safe `<svg data-bone=...>` root containing only classed `<path d=.../>` elements.

Import `BLUE_MAGE_PARTS` from `src/chibi/blue-mage.ts` and use in place of `CHIBI_PARTS` with the unchanged `CHIBI_RIG`. Its isolated palette is in `src/chibi/blue-mage.css`. The default skin and original red/gold armor remain intact. No additional bones, weapons, floating crystal, animations, interpolation, or picker UI.
