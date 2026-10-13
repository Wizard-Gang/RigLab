# Placeholder library

RigLab reads its rig, skins, weapons and starting animations from a library folder that lives outside this
repository. This folder has the same layout and the same `config.txt` as a real one, so tests and CI load it through
the same path. The rig and the weapon rigs are the real ones. The skin and weapon art are plain boxes.

`config.txt` has one line per thing: `<kind> <name> = <path>`, where `kind` is `rig`, `skin`, `weapon` or
`animation`, and `path` is relative to this folder. Line order is list order.

- `rig` names a `riglab.rig` file. A library has one.
- `skin` names a directory with one part SVG per rig slot, named after the slot without its first `_`-separated
  prefix (`chibi_arm_lower_l` → `arm_lower_l.svg`), plus a `palette.json` (`riglab.palette`) that defines every class
  token the parts use.
- `weapon` names a directory with `weapon.json` (`riglab.weapon`), one part SVG per body slot under the same naming
  rule, a `palette.json`, and a `hold.json` (`riglab.hold`) placing each free body when the weapon has any.
- `animation` names a `riglab.anim` file for the rig.
