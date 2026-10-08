const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const yaml = fs.readFileSync(
  path.join(__dirname, "../workflows/dependabot-auto-merge.yml"),
  "utf8",
);
const script = yaml
  .split("          script: |\n")[1]
  .split("\n")
  .map((line) => line.slice(12))
  .join("\n");
const execute = new (Object.getPrototypeOf(async function () {}).constructor)(
  "github",
  "context",
  "core",
  script,
);

const check = (
  name,
  conclusion = "success",
  started = "2026-10-08T00:00:00Z",
  completed = started,
) => ({
  name,
  conclusion,
  status: "completed",
  started_at: started,
  completed_at: completed,
  app: { slug: "github-actions" },
});
const required = JSON.parse(yaml.match(/const requiredCheckNames = (.*);/)[1]);
async function run(checks, mergeError, includeRequired = true) {
  if (includeRequired)
    checks = [
      ...required
        .filter((name) => !checks.some((c) => c.name === name))
        .map((name) => check(name)),
      ...checks,
    ];
  const merged = [],
    failures = [];
  const pr = {
    number: 1,
    user: { login: "dependabot[bot]" },
    state: "open",
    draft: false,
    mergeable: true,
    head: {
      sha: "tested-head",
      ref: "dependabot/npm/package",
      repo: { full_name: "owner/repo" },
    },
  };
  const pulls = {
    list() {},
    get: async () => ({ data: pr }),
    merge: async (input) => {
      if (mergeError)
        throw Object.assign(new Error(mergeError), { status: 403 });
      merged.push(input);
    },
  };
  const checksAPI = { listForRef() {} },
    repos = {
      listCommitStatusesForRef() {},
      get: async () => ({ data: { allow_merge_commit: true } }),
    };
  const github = {
    rest: {
      pulls,
      checks: checksAPI,
      repos,
      git: { deleteRef: async () => {} },
    },
    paginate: async (fn) =>
      fn === pulls.list ? [pr] : fn === checksAPI.listForRef ? checks : [],
  };
  await execute(
    github,
    { repo: { owner: "owner", repo: "repo" } },
    { info() {}, error() {}, setFailed: (message) => failures.push(message) },
  );
  return { merged, failures };
}

test("failed and pending validation checks block merging", async () => {
  for (const c of [
    check("Validate", "failure"),
    { ...check("Validate"), status: "in_progress" },
  ]) {
    assert.equal((await run([c])).merged.length, 0);
  }
});
test("an old automation failure does not block successful validation", async () => {
  const result = await run([
    check("Validate"),
    check("Enable auto-merge for dependency PRs", "failure"),
  ]);
  assert.equal(result.merged.length, 1);
  assert.equal(result.merged[0].sha, "tested-head");
});
test("a delayed older run cannot replace a newer failed run", async () => {
  const result = await run([
    check("Validate", "failure", "2026-10-08T02:00:00Z"),
    check(
      "Validate",
      "success",
      "2026-10-08T01:00:00Z",
      "2026-10-08T03:00:00Z",
    ),
  ]);
  assert.equal(result.merged.length, 0);
});
test("permission rejection fails the workflow and names the required secret", async () => {
  const result = await run(
    [check("Validate")],
    "Workflows permission required",
  );
  assert.equal(result.merged.length, 0);
  assert.match(result.failures[0], /DEPENDABOT_AUTO_MERGE_TOKEN/);
});

test("missing validation cannot be replaced by a green third-party report", async () => {
  assert.equal(
    (await run([check("Socket Security")], undefined, false)).merged.length,
    0,
  );
});
