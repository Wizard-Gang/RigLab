import assert from "node:assert/strict";
import test from "node:test";
import {
  compareGithubSettings,
  githubApi,
  loadExpectedSettings,
  rulesetPayload,
} from "../../scripts/github-repository-settings.mjs";

const expected = await loadExpectedSettings();

function actual() {
  return {
    repository: {
      full_name: expected.repository,
      default_branch: expected.defaultBranch,
      allow_merge_commit: expected.mergeMethods.mergeCommit,
      allow_squash_merge: expected.mergeMethods.squash,
      allow_rebase_merge: expected.mergeMethods.rebase,
      allow_auto_merge: expected.allowAutoMerge,
      delete_branch_on_merge: expected.deleteBranchOnMerge,
    },
    immutableReleases: { enabled: expected.immutableReleases },
    rulesets: expected.rulesets.map((ruleset) => ({
      name: ruleset.name,
      target: ruleset.target,
      enforcement: ruleset.enforcement,
      bypass_actors: structuredClone(ruleset.bypassActors),
      conditions: { ref_name: { include: ruleset.include, exclude: [] } },
      rules: ruleset.rules.map((type) => {
        if (type === "pull_request") {
          return { type, parameters: { allowed_merge_methods: ruleset.allowedMergeMethods } };
        }
        if (type === "required_status_checks") {
          return {
            type,
            parameters: {
              required_status_checks: ruleset.requiredStatusChecks.map((context) => ({ context })),
              strict_required_status_checks_policy: ruleset.requireBranchUpToDate === true,
            },
          };
        }
        return { type };
      }),
    })),
  };
}

function failuresFor(mutator) {
  const state = structuredClone(actual());
  mutator(state);
  return compareGithubSettings(expected, state).join("\n");
}

test("matching configuration passes", () => {
  assert.deepEqual(compareGithubSettings(expected, actual()), []);
});

test("disabled squash or rebase, or enabled merge commits, fail", () => {
  assert.match(failuresFor((state) => { state.repository.allow_squash_merge = false; }), /squash merges/);
  assert.match(failuresFor((state) => { state.repository.allow_merge_commit = true; }), /merge commits/);
  assert.match(failuresFor((state) => { state.repository.allow_rebase_merge = false; }), /rebase merges/);
});

test("repository identity and automatic branch deletion cannot drift", () => {
  assert.match(failuresFor((state) => { state.repository.full_name = "Other/repository"; }), /repository identity/);
  assert.match(failuresFor((state) => { state.repository.delete_branch_on_merge = false; }), /delete branch on merge/);
});

test("auto-merge availability cannot drift", () => {
  assert.match(failuresFor((state) => { state.repository.allow_auto_merge = false; }), /auto-merge availability/);
});

test("disabled immutable Releases fail the provider contract", () => {
  assert.match(failuresFor((state) => { state.immutableReleases.enabled = false; }), /immutable Releases: expected true, got false/);
  assert.match(failuresFor((state) => { delete state.immutableReleases; }), /immutable Releases: expected true/);
});

test("disabled immutable Releases may be reported as HTTP 404", async () => {
  const result = await githubApi("/repos/Wizard-Gang/RigLab/immutable-releases", {
    token: "fixture-token",
    notFoundAsNull: true,
    fetchImpl: async () => ({ status: 404, ok: false }),
  });
  assert.equal(result, null);
});

test("ruleset merge methods must match each branch ruleset's authority", () => {
  assert.match(
    failuresFor((state) => {
      const branch = state.rulesets.find((ruleset) => ruleset.target === "branch");
      const pull = branch.rules.find((rule) => rule.type === "pull_request");
      pull.parameters.allowed_merge_methods = ["merge"];
    }),
    /main-protection: pull request merge methods must match the committed contract \(rebase\)/,
  );
  assert.match(
    failuresFor((state) => {
      const release = state.rulesets.find((ruleset) => ruleset.name === "release-branch-protection");
      release.rules.find((rule) => rule.type === "pull_request").parameters.allowed_merge_methods = ["rebase"];
    }),
    /release-branch-protection: pull request merge methods must match the committed contract \(squash\)/,
  );
});

test("release branch ruleset requires gate and change-id, current, with no deletion rule", () => {
  assert.match(
    failuresFor((state) => { state.rulesets = state.rulesets.filter((ruleset) => ruleset.name !== "release-branch-protection"); }),
    /missing ruleset: release-branch-protection/,
  );
  assert.match(
    failuresFor((state) => {
      const release = state.rulesets.find((ruleset) => ruleset.name === "release-branch-protection");
      release.rules.find((rule) => rule.type === "required_status_checks").parameters.required_status_checks = [{ context: "verify" }];
    }),
    /release-branch-protection: required status checks do not match gate, change-id/,
  );
  assert.match(
    failuresFor((state) => {
      const release = state.rulesets.find((ruleset) => ruleset.name === "release-branch-protection");
      release.rules.push({ type: "deletion" });
    }),
    /release-branch-protection: rules differ from the committed contract/,
  );
  const release = expected.rulesets.find((ruleset) => ruleset.name === "release-branch-protection");
  assert.deepEqual(release.include, ["refs/heads/release/*"]);
  assert.equal(release.rules.includes("deletion"), false);
});

test("missing main protection ruleset fails", () => {
  assert.match(
    failuresFor((state) => { state.rulesets = state.rulesets.filter((ruleset) => ruleset.target !== "branch"); }),
    /missing ruleset: main-protection/,
  );
});

test("missing required CI check fails", () => {
  assert.match(
    failuresFor((state) => {
      const branch = state.rulesets.find((ruleset) => ruleset.target === "branch");
      const checks = branch.rules.find((rule) => rule.type === "required_status_checks");
      checks.parameters.required_status_checks = checks.parameters.required_status_checks.slice(1);
    }),
    /required status checks do not match/,
  );
});

test("unexpected ruleset bypass actor fails", () => {
  assert.match(
    failuresFor((state) => {
      const branch = state.rulesets.find((ruleset) => ruleset.target === "branch");
      branch.bypass_actors = [{ actor_id: 1, actor_type: "OrganizationAdmin", bypass_mode: "always" }];
    }),
    /bypass actors do not match/,
  );
});

test("main protection requires the branch to be current with main", () => {
  assert.match(
    failuresFor((state) => {
      const branch = state.rulesets.find((ruleset) => ruleset.target === "branch");
      const checks = branch.rules.find((rule) => rule.type === "required_status_checks");
      checks.parameters.strict_required_status_checks_policy = false;
    }),
    /must be current with the base branch/,
  );
});

test("main ruleset payload requires PRs, rebase-only merges, linear history, CI, and no bypass actors", () => {
  const main = expected.rulesets.find((ruleset) => ruleset.name === "main-protection");
  const payload = rulesetPayload(main);
  const pull = payload.rules.find((rule) => rule.type === "pull_request");
  const checks = payload.rules.find((rule) => rule.type === "required_status_checks");
  assert.deepEqual(payload.bypass_actors, main.bypassActors);
  assert.equal(checks.parameters.strict_required_status_checks_policy, true);
  assert.deepEqual(pull.parameters.allowed_merge_methods, ["rebase"]);
  assert.deepEqual(checks.parameters.required_status_checks, [{ context: "verify" }, { context: "change-id" }, { context: "security" }]);
  assert.ok(payload.rules.some((rule) => rule.type === "required_linear_history"));
  assert.ok(payload.rules.some((rule) => rule.type === "deletion"));
  assert.ok(payload.rules.some((rule) => rule.type === "non_fast_forward"));
});

test("release tag payload blocks updates and deletion", () => {
  const tags = expected.rulesets.find((ruleset) => ruleset.target === "tag");
  const payload = rulesetPayload(tags);
  assert.deepEqual(payload.rules.map((rule) => rule.type).sort(), ["deletion", "update"]);
});

test("missing or weakened release tag ruleset fails", () => {
  assert.match(failuresFor((state) => { state.rulesets = state.rulesets.filter((ruleset) => ruleset.target !== "tag"); }), /missing ruleset: release-tag-immutability/);
  assert.match(failuresFor((state) => {
    const tag = state.rulesets.find((ruleset) => ruleset.target === "tag");
    tag.rules = tag.rules.filter((rule) => rule.type !== "update");
  }), /missing update rule/);
});

test("authentication failures fail closed without reflecting token or provider response text", async () => {
  await assert.rejects(githubApi("/repos/Wizard-Gang/RigLab"), (error) => error.code === "GITHUB_AUTH_REQUIRED");
  const token = "fixture-token-never-print";
  const fetchImpl = async () => ({ status: 403, text: async () => `denied ${token}` });
  await assert.rejects(
    githubApi("/repos/Wizard-Gang/RigLab/rulesets", { token, fetchImpl }),
    (error) => error.code === "GITHUB_ADMIN_INACCESSIBLE"
      && /Administration read access/.test(error.message)
      && !error.message.includes(token),
  );
  await assert.rejects(
    githubApi("/repos/Wizard-Gang/RigLab", { token, method: "PATCH", fetchImpl }),
    (error) => error.code === "GITHUB_ADMIN_INACCESSIBLE"
      && /Administration write access/.test(error.message)
      && !error.message.includes(token),
  );
});
