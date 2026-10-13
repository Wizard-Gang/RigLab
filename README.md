# RigLab

RigLab is an art-agnostic SVG skeleton and keyframe animation authoring tool. It authors skeletons and motion for consumers such as Hexframe, which bind their own artwork to the exported joints. Its rig model is Hexframe's own: the rig core and the 11-bone humanoid are vendored byte-for-byte from [Wizard-Gang/Hexframe](https://github.com/Wizard-Gang/Hexframe) and pinned, so RigLab places every bone with the same forward kinematics Hexframe draws with.

Today RigLab opens Hexframe's humanoid on a gridded SVG canvas, shows the bone hierarchy and an inspector for the selected joint, and plays all 13 Hexframe clips through Hexframe's sampler at its 60 Hz clock. The editing, constraint, timeline and export work is queued in [implementation_plan.md](implementation_plan.md).

Controlled changes use the `RL-###` namespace and the title/body format in [Change management](docs/CHANGE-MANAGEMENT.md). Required PR checks are `verify`, `change-id`, and `security` on the exact head. The committed [GitHub settings](config/github-repository-settings.json) require current-with-main status, squash-only merges, automatic completed-branch deletion, zero bypass actors, immutable Releases and immutable `v*` tags. [AGENTS.md](AGENTS.md) carries the shared work protocol, and the [implementation plan](implementation_plan.md) is the current/future queue.

## Run locally

Use Node 26.10.0 and npm 12.1.0, matching the repository pins.

```bash
npm ci
npm start
```

`npm start` runs `npm run dev`, the Vite dev server at <http://localhost:5180>. Local development needs no account, credential or network service.

## Command map

`npm run check` is the canonical credential-free acceptance gate. Network and provider checks stay separate.

| Purpose | Command | Boundary |
| --- | --- | --- |
| Install exact dependencies | `npm ci` | Local install from the committed lockfile |
| Start the editor | `npm start` | Runs `npm run dev`, the credential-free Vite dev server |
| Repository acceptance | `npm run check` | Plan queue, workflow shell, vendor pin, repository and delivery contracts, types, tests, build and change identity |
| Rig and editor tests | `npm test` | Vitest, node environment |
| Dependency advisory gate | `npm run audit:dependencies` | Network-backed npm registry query; fails on high or critical advisories |
| Committed patch whitespace | `npm run check:patch` | Needs `PATCH_BASE_SHA` and `PATCH_HEAD_SHA` |
| Re-vendor Hexframe | `npm run vendor:hexframe -- <checkout> <commit>` | Copies the pinned paths from a Hexframe commit's Git objects and rewrites the lock |
| Live GitHub settings check | `npm run verify:github-settings` | Read-only provider comparison; needs an administration-readable `GH_ADMIN_TOKEN` or `GH_TOKEN` |
| Apply GitHub settings | `npm run apply:github-settings` | Bounded settings mutation with independent read-back; owner-authorized only |

## Hexframe provenance

`vendor/hexframe/` holds Hexframe's `src/rig/` modules, `characters/fighter/fighter.rig.json` and its 13 clips at the commit named in [`vendor/hexframe/lock.json`](vendor/hexframe/lock.json), each pinned by SHA-256. Hexframe is MIT-licensed by the same owner. To confirm a pin against Hexframe itself:

```bash
git -C ../Hexframe show "$(node -p "require('./vendor/hexframe/lock.json').commit")":src/rig/fk.ts | shasum -a 256
```

The digest equals the `src/rig/fk.ts` entry in the lock. See [Architecture](docs/ARCHITECTURE.md) for the rig conventions that follow from the vendored code.

## Release

RigLab has no deployment target. Releases are immutable GitHub Releases of a reproduced, attested source archive, cut from a version change on `main`; see [Release management](docs/RELEASE-MANAGEMENT.md).

## License

MIT. The vendored Hexframe rig core and fighter data are MIT-licensed under the same owner; see [LICENSE](LICENSE).
