"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");

// Known PRE-EXISTING public-repository exposure; not an exception for new keys.
// The exact Git blob is pinned so it cannot be silently changed or replaced.
// Rotation is separately tracked in issue #2.
const LEGACY_EXPOSED_PATH = "keys/private.pem";
const LEGACY_EXPOSED_GIT_BLOB_SHA = "81e7abd68ccd10f39717825e33442e35364dfa61";

function gitBlobSha(buffer) {
  const prefix = Buffer.from("blob " + buffer.length + "\0", "utf8");
  return crypto.createHash("sha1").update(prefix).update(buffer).digest("hex");
}

function inspectTrackedFile(filename, data) {
  const normalized = filename.replace(/\\/g, "/");
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(String(data));
  if (normalized === LEGACY_EXPOSED_PATH) {
    return gitBlobSha(buffer) === LEGACY_EXPOSED_GIT_BLOB_SHA
      ? []
      : ["Previously exposed private key was modified; no new key may be committed at this path"];
  }

  const base = path.posix.basename(normalized).toLowerCase();
  if ((base === ".env" || base.startsWith(".env.")) &&
      base !== ".env.example" && base !== ".env.sample") {
    return ["Tracked environment configuration is forbidden"];
  }
  if (/\.(?:p12|pfx)$/i.test(normalized)) {
    return ["Tracked binary private-key container is forbidden"];
  }

  // Most non-source assets contain NULs; do not decode large binary blobs.
  if (buffer.subarray(0, 4096).includes(0)) return [];
  const text = buffer.toString("utf8");
  const failures = [];
  if (/-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/.test(text)) {
    failures.push("Private-key PEM material is forbidden");
  }
  if (/(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,}|sk_live_[A-Za-z0-9]{20,})/.test(text)) {
    failures.push("Likely live access token is forbidden");
  }
  return failures;
}

function scanTrackedFiles(root = path.resolve(__dirname, "..")) {
  const names = execFileSync("git", ["ls-files", "-z"], { cwd: root })
    .toString("utf8").split("\0").filter(Boolean);
  const findings = [];
  let legacyExposureSeen = false;
  for (const name of names) {
    if (name === LEGACY_EXPOSED_PATH) legacyExposureSeen = true;
    const data = fs.readFileSync(path.join(root, name));
    for (const error of inspectTrackedFile(name, data)) {
      findings.push({ path: name, reason: error });
    }
  }
  return { findings, legacyExposureSeen, inspectedCount: names.length };
}

if (require.main === module) {
  try {
    const result = scanTrackedFiles();
    if (result.legacyExposureSeen) {
      console.warn("Known publicly exposed legacy private key remains tracked: issue #2 (rotation not completed).");
    }
    for (const finding of result.findings) {
      console.error("Tracked secret check: " + finding.path + ": " + finding.reason);
    }
    if (result.findings.length) process.exitCode = 1;
    else console.log("Tracked-secret prevention check passed (" + result.inspectedCount + " files inspected).");
  } catch (error) {
    console.error("Tracked-secret prevention check failed:", error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  inspectTrackedFile, gitBlobSha, scanTrackedFiles, LEGACY_EXPOSED_GIT_BLOB_SHA,
};
