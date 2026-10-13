# Security policy

Report a vulnerability privately using GitHub's **Report a vulnerability** entry in the repository Security tab, when enabled. If that feature is unavailable, contact the repository owner through a private channel. Do not put exploit details or credentials in a public issue or pull request.

RigLab is a local-first authoring tool. It runs no service, holds no account or secret, and makes no network request at runtime; documents stay on the author's machine. Its security surface is the files it reads and writes, the dependency graph, GitHub Actions, repository permissions, merge controls, tag and Release identity, and published artifacts.

Every imported rig or animation is untrusted data. Loaders validate it against the closed, versioned format and fail with a precise message; they never evaluate it, inject it as markup, or follow paths it names outside the document. The vendored Hexframe files under `vendor/hexframe/` are pinned byte-for-byte by `vendor/hexframe/lock.json`, and `npm run check` fails on any edit.

CI uses read-only permissions except the bounded release publication job. Actions are GitHub-owned and pinned to full commit SHAs. `npm audit --audit-level=high` is a network-backed required check; a vulnerable dependency is updated or removed in a controlled change, never bypassed with an ignore rule. Dependency and workflow update suggestions are inputs to a controlled `SEC` or `BUILD` change; they do not bypass IDs, review, or exact-head CI. Settings commands read a runtime `GH_ADMIN_TOKEN` or `GH_TOKEN`; keep tokens in process or provider secret state, never in source, PR text, test fixtures, or logs. The repository contract fails any tracked credential-bearing file.
