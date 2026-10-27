# Implementation plan

## Open tasks

### RL-061 — [API] Version the export for consumers: rig paint order and file sizes

- Dependency: RL-060. Owner rulings of 2026-10-27: bump the export to version 2 now, before RenderLab writes its reader, and carry the resolved paint order in the rig file.
- Why: RenderLab must draw in RigLab's paint order for both facings (RLDR-012), but the order exists only as code that resolves Hexframe's depth profiles for facing right. Its manifest reader also notes that RigLab lists no file sizes.
- Scope: `riglab.rig` version 2 adds `paintOrder`: for every depth profile, the bone order for `right` and `left`, resolved with Hexframe's `visualPaintOrder`, and the clip-to-profile map the export already writes. The validator refuses an order that disagrees with the rig's depth profiles, so the profiles stay the single source. Migrate both libraries' rigs with a script. `riglab.export` version 2 adds `bytes` to every file entry and lists each held weapon's `hold` file. Document the held-weapon rule as data: weapon bodies paint over the whole figure, and the forearms that grip a body paint over it.
- Non-goals: No facing-left preview in the editor. No change to `riglab.anim` v3 or `riglab.baked` v1. No art in this bundle (RL-062). Version 1 bundles are not written or read.
- Acceptance: Exported rigs carry a paint order equal to Hexframe's for every profile and facing. Each manifest entry's bytes and SHA-256 match its file. The export tests in `tests/export/written.ts` cover version 2.
- Validation: The standard set; one dispatched `verify.yml` run.
- Authorities: docs/ARCHITECTURE.md (RigLab formats; Export bundles; Hexframe consumer adapter and art), src/format/rig.ts, src/export/bundle.ts, src/hexframe/art.ts, vendor/hexframe/src/rig/paint-order.ts.

### RL-062 — [API] Export pixel skins as riglab.skin bundles

- Dependency: RL-060 and RL-061.
- Why: RenderLab binds art imported separately from the animation export (RLDR-013), and RigLab exports no art today.
- Scope: Add a `riglab.skin` version 1 bundle, written by Export mode beside `riglab-export/`: a manifest naming the rig it fits, the skin or weapon art set, its `riglab.palette` and one `riglab.part` per slot (or per weapon body), each with bytes and SHA-256. Only pixel sets export; a vector set is refused with its name. Folder and ZIP output use the existing deterministic writer.
- Non-goals: No vector or SVG export. No change to the animation bundle. No equipment layering beyond slots and weapon bodies.
- Acceptance: The placeholder pixel skin and pixel weapons export, and the written-bundle tests read them back and match the library's grids exactly.
- Validation: The standard set; one dispatched `verify.yml` run.
- Authorities: docs/ARCHITECTURE.md (Export bundles; Weapons; Library folders), src/export/bundle.ts, src/export/zip.ts.

### RL-063 — [API] Publish JSON Schemas for every consumer format

- Dependency: RL-062.
- Why: RenderLab's specification (§3.3) requires independent readers against published schemas. RigLab's formats exist only as TypeScript validators.
- Scope: Add `schemas/` with one JSON Schema per format: `riglab.export` v2, `riglab.skin` v1, `riglab.rig` v2, `riglab.anim` v3, `riglab.weapon` v1, `riglab.hold` v1, `riglab.palette` v1, `riglab.part` v1 and `riglab.baked` v1. Each is closed, as the validators are. Tests prove that every library and conformance document the validators accept, the schemas accept, and every invalid case is refused by both. Rules a schema cannot express, such as cross-references, key frames and grid widths, are listed in each schema's description.
- Non-goals: No change to any format. No schema-generated code in `src/`.
- Acceptance: Validators and schemas agree on every valid and invalid case in CI.
- Validation: The standard set; one dispatched `verify.yml` run.
- Authorities: src/format/, src/export/, docs/ARCHITECTURE.md (RigLab formats). MapLab's `schemas/` as the portfolio pattern.

### RL-064 — [TEST] Commit conformance exports from a dedicated conformance library

- Dependency: RL-063. Owner ruling of 2026-10-27: a dedicated `conformance/library`, not more motion in `placeholder-library/`.
- Why: RenderLab fakes RigLab bundles in test helpers because RigLab commits no export, and the placeholder animations stand still, so they cannot prove pins, weapon bodies or one-shot timing.
- Scope: Add `conformance/library/`: the chibi rig, the pixel skin, a free-body weapon and the daggers, and a few animations with real motion covering a loop, a one-shot, a planted-foot pin, a two-handed grip and riding daggers. Commit its `riglab-export/` and `riglab.skin` bundles under `conformance/export/`, plus `conformance/invalid/` cases, each with exactly one defect and its expected `{jsonPath, reason}`, indexed by SHA-256 as MapLab's `conformance/` is. A test proves the committed bundles equal a fresh export byte for byte.
- Non-goals: No change to the owner's library or `placeholder-library/`. No format change.
- Acceptance: CI regenerates both bundles identically. Every invalid case fails with its expected path and reason. The conformance library passes `check:library`.
- Validation: The standard set; one dispatched `verify.yml` run.
- Authorities: docs/ARCHITECTURE.md (Engine timing; Posing and constraints; Export bundles), tests/export/written.ts, MapLab's `conformance/README.md`.

### RL-065 — [DOCS] Write the consumer contract and versioning policy

- Dependency: RL-064.
- Why: RenderLab's adapter tasks (RLDR-011 to RLDR-014) need one normative page to pin, instead of reading RigLab's architecture prose.
- Scope: Add `docs/CONTRACTS.md`: the normative rules for consumers (space and units, the pixel grid and part origin, 60 Hz ticks and the baked frame range for looping and one-shot animations, sampling, paint order for both facings and the held-weapon rule, palette binding), the schema and conformance paths, and a versioning policy saying which changes bump a format's version. Point README.md and docs/ARCHITECTURE.md at it.
- Non-goals: No code, format or fixture change.
- Acceptance: Every rule in the page names its schema, validator or conformance case.
- Validation: check:gate, check:change, git diff --check and check:patch.
- Authorities: schemas/, conformance/, docs/ARCHITECTURE.md, RenderLab's specification §3.2, §9 and §10 on Wizard-Gang/RenderLab main.
