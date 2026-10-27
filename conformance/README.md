# Conformance fixtures

Golden inputs for consumers of RigLab's formats, such as RenderLab's RigLab reader, after MapLab's `conformance/`.
Every file here is this repository's own, under its [license](../LICENSE). The schemas they are checked against are in
[`schemas/`](../schemas).

## Index

`cases.json` lists every file here but itself and this README, in path order. Each entry gives its repository-relative
`file`, its SHA-256, its `format` (none for `library/config.txt`), the `bundle` directory a manifest's pins name, and
what a reader must find: `{"valid": true}`, or exactly one `{"jsonPath", "reason"}`. The suite fails when a file is
unlisted, changed without its digest, or no longer what `npm run export:conformance` writes.

## `library/`

A RigLab library folder, apart from `placeholder-library/`, whose animations move. It holds the chibi rig, the `pixel`
skin, the `sword` (one free body gripped by both hands, placed by `hold.json`) and the `daggers` (two bodies that ride
the hands), and four animations:

- `unarmed-walk` loops over 48 frames.
- `unarmed-attack` plays once over 24 frames, its back foot pinned where it stands on every key.
- `sword-attack` plays once, swinging the sword's free body through four placements in both hands.
- `daggers-idle` loops over 60 frames, moving the arms the daggers ride.

Every key pose is solved to its pins and grips, and every frame holds them. `npm run check:library -- conformance/library`
loads it; RigLab can open it with `RIGLAB_LIBRARY=conformance/library`.

## `export/`

What export writes for the library with the generator `RigLab conformance`: `riglab-export/` is the baked animation
bundle (`riglab.export` v2) and `riglab-skins/` the `riglab.skin` bundles of the pixel skin and both weapons' art. The
suite proves both equal a fresh export byte for byte.

## `invalid/`

Each file is one file of `export/` with exactly one defect, and its `expect` names the path and reason:

- a JSON Schema keyword (`const`, `enum`, `required`, `additionalProperties`, `type`, `pattern`, `minItems`) where the
  published schema refuses it;
- `bytes`, `sha256` or `file` where a manifest that conforms pins a file of its `bundle` by the wrong size or digest, or
  names a file the bundle lacks;
- `reference` where the document conforms but names what its bundle does not hold: an unknown bone, a chain the weapon
  grips, a missing free-body placement, a riding body placed, or an unknown chain.

Each case's base finds no defect, and for the library formats RigLab's own validator refuses the case at the same path
or its parent.
