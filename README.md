# RigLab

RigLab is an art-agnostic SVG skeleton and keyframe animation authoring tool. It authors skeletons and motion for consumers such as Hexframe, which bind their own artwork to the exported joints. Its rig model and its clock are Hexframe's own: Hexframe's rig engine (the rig contract, forward kinematics, paint order and clip sampler) is vendored byte-for-byte from [Wizard-Gang/Hexframe](https://github.com/Wizard-Gang/Hexframe) and pinned, so RigLab places every bone with the forward kinematics Hexframe draws with and plays every animation through Hexframe's own clip sampler.

RigLab's output is a versioned, artwork-independent contract: `riglab.rig` skeletons with angle limits and two-bone IK chains, and `riglab.anim` animations whose keys hold full poses, a `hold`, `linear` or `smoothstep` transition to the next key, and per-key pins and a held prop or weapon. `riglab.weapon` rigs give each weapon a fixed model and fixed grips on one or more rigid bodies, which the hands hold by IK without stretching. The chibi has four: a two-handed sword, spear and axe, and a pair of daggers in a reverse grip.

Every animation runs on Hexframe's engine timing. Hexframe ticks at a fixed 60 Hz and stores a clip as 13 evenly spaced poses over its length, so a RigLab frame is one Hexframe tick (60 fps), and an animation's kind fixes its length, its looping and its keys on that 13-pose grid:

| Kind | Keys at frames | Length | Plays |
| --- | --- | --- | --- |
| Idle | 0, 15, 30, 45 | 60 frames, 1.00 s | Loops |
| Walk | 0, 12, 24, 36 | 48 frames, 0.80 s | Loops |
| Jump | 0, 12, 24, 36 | 36 frames, 0.60 s | Once |
| Attack | 0, 8, 16, 24 | 24 frames, 0.40 s | Once |
| Hit | 0, 12, 24 | 24 frames, 0.40 s | Once |

The lengths come from Hexframe's own clips (labIdle 60, labWalk 48, jump 38, labStagger 24, labStrike 20), rounded to multiples of 12 so each of the 13 poses falls on a whole frame. A looping animation's last key runs back to its first. RigLab samples the keys into the 13 poses and plays every frame between two poses with Hexframe's sampler, as Hexframe will, so the canvas, the baked frames and the exported clip agree on every frame. Validation refuses any other rate, length, looping or key frame.

The editor edits the library folder (below), which is the only source of the rig and every animation: it opens on the folder's chibi (Hexframe's 11 bones and IK chains at about two heads tall, MapleStory-style, with its own original art) and the folder's animations, and Save (⌘S) writes them back into the folder, which the wardrobe then plays. There are no separate document files, and no New, Open or Save As. Add more animations of a kind from the Animations panel's New menu. The editor has undo and redo, Rig setup, Pose, Animation and Export modes, a zoomable and pannable gridded SVG canvas, the bone hierarchy, an animations list (new by kind, duplicate, rename, delete) and an inspector, in side panels that each collapse to a thin rail. Rig setup is the only mode that changes anatomy: drag joints on the snap grid or type offsets, tips, slots and names, add and delete joints, and set angle limits and chain bends. Pose mode poses the active animation's key at the current frame by rotation alone; a frame between keys has no key to pose. Drag a joint to swing its parent, a hand or foot to solve the limb with two-bone IK, or the pelvis to move the body. Lengths never change, limits and bend sides hold, and an out-of-reach target is reported instead of stretching a limb. Pin a foot and it stays planted while the body moves, on every one of Hexframe's poses. Pick a weapon for a key (a two-handed sword, spear or axe, or a pair of daggers): both hands take its fixed grips and stay on them while you move or turn it, and the daggers ride the hands. The timeline shows the kind's keys across its frames, ticked at Hexframe's 13 poses: play, scrub and step through frames and keys, choose hold, linear or smooth for each transition, and show onion skins of the neighbouring keys. Export mode writes a `riglab-export/` bundle, to a folder or as a zip: a manifest pinning every file by SHA-256, the rig, each animation, the weapons they hold and, optionally, every frame's solved world transforms, weapon bodies included. Importing a bundle verifies all of it before the document changes. For Hexframe itself, the Export panel also downloads the rig in Hexframe's rig file shape and the active animation as its 13-pose, 60 Hz clip, which Hexframe plays exactly as RigLab previews it. The Art toggle draws the chibi's art on its slots, so the motion can be checked on real art. RigLab is React and TypeScript only: it runs in the browser from `npm start` and needs no native toolchain, and the repository contract rejects Rust, Cargo and Tauri files, dependencies and scripts.

| Command | macOS | Windows and Linux |
| --- | --- | --- |
| Save to the library folder | ⌘S | Ctrl+S |
| Undo / Redo | ⌘Z / ⌘⇧Z | Ctrl+Z / Ctrl+Shift+Z or Ctrl+Y |
| Delete the selected animation, or the selected joint in Rig setup | Delete | Delete |
| Previous / next frame | ← / → | ← / → |
| Previous / next key | ⇧← / ⇧→ | Shift+← / Shift+→ |
| Play / pause (Animation mode) | Space | Space |
| Clear the selection | Escape | Escape |

Scroll to zoom about the cursor and drag empty canvas to pan.

Controlled changes use the `RL-###` namespace and the title/body format in [Change management](docs/CHANGE-MANAGEMENT.md). Required PR checks are `verify`, `change-id`, and `security` on the exact head. The committed [GitHub settings](config/github-repository-settings.json) require current-with-main status, squash-only merges, automatic completed-branch deletion, zero bypass actors, immutable Releases and immutable `v*` tags. [AGENTS.md](AGENTS.md) carries the shared work protocol, and the [implementation plan](implementation_plan.md) is the current/future queue.

## Run locally

Use Node 26.10.0 and npm 12.1.0, matching the repository pins.

```bash
npm ci
npm start
```

`npm start` runs `npm run dev`, a managed launcher (`scripts/dev.mjs`) that serves the editor at <http://localhost:5180> and opens it in the browser. Local development needs no account, credential or network service. Each run takes the same steps as SharkTank's and WizardGang's launchers:

1. **Teardown.** Stop the server this checkout last started, and any other RigLab Vite still on the port, from this checkout or one of its worktrees. A port held by anything else is refused, and the message names the process. RigLab never stops a process it cannot prove is its own.
2. **Reset.** Clear `dist/`, `node_modules/.vite/` and `tmp/dev/`.
3. **Install.** Run `npm ci` when `node_modules/` is missing or `package-lock.json` changed since the last install.
4. **Build.** Run `vite build` against the library the server reads, so a broken library or import fails here.
5. **Start.** Start Vite on the port, wait until it answers, then open the browser.

Ctrl-C, `SIGTERM` or closing the terminal stops the server. A second `npm start` replaces a running one, so `Port 5180 is already in use` never comes from a RigLab server. `RIGLAB_PORT=5190 npm start` serves on another port, for example a worktree beside the main checkout. `RIGLAB_NO_OPEN=1 npm start` (or `npm run dev -- --no-open`) skips the browser.

RigLab reads its rig, skins, weapons and animations from a library folder: the one `RIGLAB_LIBRARY` names, else `~/Documents/RigLab/` when it holds a `config.txt`, else the repository's `placeholder-library/`, which has the same layout with plain-box art. Each line of the folder's `config.txt` maps one thing, as `<kind> <name> = <path>`. The status bar names the folder in use, and `npm start` reloads when a mapped file changes. The toolbar's Wardrobe link opens <http://localhost:5180/wardrobe/>, which steps through every skin, puts any skin's part on any slot, and shows the library's weapons and animations on the rig. [Architecture](docs/ARCHITECTURE.md) (Library folders) describes the layout.

Save writes the editor's rig and animations into that folder through the dev server, so it needs `npm start`. A save maps new animations to `animations/<name>.anim.json`, updates only the `animation` lines of `config.txt`, and refuses anything the folder could not load, such as a rig edit the skins have no part for. It keeps every replaced or removed file under `backups/<time>/` in the folder, because the folder is not under Git. An open wardrobe reloads to show the save. The placeholder library is read-only.

## Command map

`npm run check` is the canonical credential-free acceptance gate. Network and provider checks stay separate.

| Purpose | Command | Boundary |
| --- | --- | --- |
| Install exact dependencies | `npm ci` | Local install from the committed lockfile |
| Start the editor | `npm start` | Runs `npm run dev`: teardown, reset, install, build, then the credential-free Vite dev server |
| Repository acceptance | `npm run check` | Plan queue, workflow shell, vendor pin, repository and delivery contracts, types, tests, build and change identity |
| Rig and editor tests | `npm test` | Vitest, node environment, against `placeholder-library/` |
| Validate a library folder | `npm run check:library [folder]` | Local only; defaults to the folder `npm start` reads |
| Dependency advisory gate | `npm run audit:dependencies` | Network-backed npm registry query; fails on high or critical advisories |
| Committed patch whitespace | `npm run check:patch` | Needs `PATCH_BASE_SHA` and `PATCH_HEAD_SHA` |
| Re-vendor Hexframe | `npm run vendor:hexframe -- <checkout> <commit>` | Copies the pinned paths from a Hexframe commit's Git objects and rewrites the lock |
| Live GitHub settings check | `npm run verify:github-settings` | Read-only provider comparison; needs an administration-readable `GH_ADMIN_TOKEN` or `GH_TOKEN` |
| Apply GitHub settings | `npm run apply:github-settings` | Bounded settings mutation with independent read-back; owner-authorized only |

## Hexframe provenance

`vendor/hexframe/` holds Hexframe's `src/rig/` modules, its rig engine, at the commit named in [`vendor/hexframe/lock.json`](vendor/hexframe/lock.json), each pinned by SHA-256. RigLab vendors no Hexframe characters, clips or art. Hexframe is MIT-licensed by the same owner. To confirm a pin against Hexframe itself:

```bash
git -C ../Hexframe show "$(node -p "require('./vendor/hexframe/lock.json').commit")":src/rig/fk.ts | shasum -a 256
```

The digest equals the `src/rig/fk.ts` entry in the lock. See [Architecture](docs/ARCHITECTURE.md) for the rig conventions that follow from the vendored code.

## Release

RigLab has no deployment target. Releases are immutable GitHub Releases of a reproduced, attested source archive, cut from a version change on `main`; see [Release management](docs/RELEASE-MANAGEMENT.md).

## License

MIT. The vendored Hexframe rig engine is MIT-licensed under the same owner; see [LICENSE](LICENSE).
