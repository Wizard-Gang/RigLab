# Implementation plan

## Open tasks

### RL-065 — [DOCS] Write the consumer contract and versioning policy

- Dependency: RL-064.
- Why: RenderLab's adapter tasks (RLDR-011 to RLDR-014) need one normative page to pin, instead of reading RigLab's architecture prose.
- Scope: Add `docs/CONTRACTS.md`: the normative rules for consumers (space and units, the pixel grid and part origin, 60 Hz ticks and the baked frame range for looping and one-shot animations, sampling, paint order for both facings and the held-weapon rule, palette binding), the schema and conformance paths, and a versioning policy saying which changes bump a format's version. Point README.md and docs/ARCHITECTURE.md at it.
- Non-goals: No code, format or fixture change.
- Acceptance: Every rule in the page names its schema, validator or conformance case.
- Validation: check:gate, check:change, git diff --check and check:patch.
- Authorities: schemas/, conformance/, docs/ARCHITECTURE.md, RenderLab's specification §3.2, §9 and §10 on Wizard-Gang/RenderLab main.
