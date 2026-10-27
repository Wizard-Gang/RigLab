# Implementation plan

## Open tasks

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
