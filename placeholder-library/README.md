# Placeholder library

RigLab reads its rig, skins, weapons and animations from a library folder that lives outside this
repository. This folder has the same layout and the same `config.txt` as a real one, so tests and CI load it through
the same path. The rig and the weapon rigs are the real ones. The `plain` and `block` skins are plain vector boxes, the `pixel` skin redraws them as `riglab.part` grids, and the
weapons are pixel-box grids, all under the pixel-art contract (`docs/PIXELART.md`).

`config.txt` has one line per thing: `<kind> <name> = <path>`, where `kind` is `rig`, `skin`, `weapon` or
`animation`, and `path` is relative to this folder. Line order is list order.

- `rig` names a `riglab.rig` file. A library has one.
- `skin` names a directory with one part per rig slot, named after the slot without its first `_`-separated
  prefix (`chibi_arm_lower_l` → `arm_lower_l`), plus a `palette.json` (`riglab.palette`) that defines every class
  token the parts use. A `pixel` palette's parts are `riglab.part` grids (`arm_lower_l.part.json`); any other
  palette's are part SVGs (`arm_lower_l.svg`).
- `weapon` names a directory with `weapon.json` (`riglab.weapon`), one part per body slot under the same naming
  and pixel rules, a `palette.json`, and a `hold.json` (`riglab.hold`) placing each free body when the weapon has any.
- `animation` names a `riglab.anim` version 3 file for the rig, named `<class>-<kind>`: its class is `unarmed` or a
  `weapon` line's name, and a library holds one animation of each class and kind. This folder holds the five unarmed
  ones; the editor adds the rest, at rest or from the unarmed motion, when it opens on a library that lacks them.
