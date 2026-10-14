"use strict";

// Runtime providers do not all expose a commit SHA by default. Return null
// rather than guessing a deployed version when metadata was not configured.
function getReleaseRevision(env = process.env) {
  const candidates = [env.RELEASE_SHA, env.RENDER_GIT_COMMIT, env.GIT_COMMIT_SHA];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && /^[0-9a-f]{40}$/i.test(candidate)) {
      return candidate.toLowerCase();
    }
  }
  return null;
}

module.exports = { getReleaseRevision };
