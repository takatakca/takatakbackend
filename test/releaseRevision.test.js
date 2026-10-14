"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { getReleaseRevision } = require("../utils/releaseRevision");
const { app } = require("../index");

const sha = "a".repeat(40);
test("release revision never guesses or exposes arbitrary environment strings", () => {
  assert.equal(getReleaseRevision({}), null);
  assert.equal(getReleaseRevision({ RELEASE_SHA: "main" }), null);
  assert.equal(getReleaseRevision({ RELEASE_SHA: "secret-value" }), null);
  assert.equal(getReleaseRevision({ RELEASE_SHA: sha.toUpperCase() }), sha);
  assert.equal(getReleaseRevision({ RENDER_GIT_COMMIT: sha }), sha);
  assert.equal(getReleaseRevision({ GIT_COMMIT_SHA: sha }), sha);
  assert.equal(getReleaseRevision({ RELEASE_SHA: "untrusted", RENDER_GIT_COMMIT: sha }), sha);
});

test("health/version returns runtime revision with no-cache, or null if unknown", async t => {
  const old = process.env.RELEASE_SHA;
  const oldRender = process.env.RENDER_GIT_COMMIT;
  const oldGit = process.env.GIT_COMMIT_SHA;
  process.env.RELEASE_SHA = sha;
  delete process.env.RENDER_GIT_COMMIT;
  delete process.env.GIT_COMMIT_SHA;

  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(async () => {
    if (old === undefined) delete process.env.RELEASE_SHA;
    else process.env.RELEASE_SHA = old;
    if (oldRender === undefined) delete process.env.RENDER_GIT_COMMIT;
    else process.env.RENDER_GIT_COMMIT = oldRender;
    if (oldGit === undefined) delete process.env.GIT_COMMIT_SHA;
    else process.env.GIT_COMMIT_SHA = oldGit;
    await new Promise(resolve => server.close(resolve));
  });

  const base = "http://127.0.0.1:" + server.address().port;
  const result = await fetch(base + "/health/version");
  assert.equal(result.status, 200);
  assert.equal(result.headers.get("cache-control"), "no-store");
  assert.deepEqual(await result.json(), { revision: sha });

  process.env.RELEASE_SHA = "unknown";
  const missing = await fetch(base + "/health/version");
  assert.deepEqual(await missing.json(), { revision: null });
});
