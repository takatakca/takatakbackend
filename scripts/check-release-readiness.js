"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

// Production-only offline preflight: validates configuration without printing
// secret values or contacting customers, MongoDB, Twilio or Upmind.
function inspectReleaseEnvironment(env = process.env, root = path.resolve(__dirname, "..")) {
  const errors = [];
  const needed = ["MONGO_URI", "PRIVATE_KEY_PATH", "PUBLIC_KEY_PATH", "JWT_KEY_ID", "ISSUER", "CORS_ORIGINS"];
  for (const name of needed) {
    if (!env[name] || !String(env[name]).trim()) errors.push(name + " is missing");
  }
  if (env.NODE_ENV !== "production") errors.push("NODE_ENV must be production");
  if (env.JWT_KEY_ID === "takatak-key") {
    errors.push("JWT_KEY_ID still uses the known legacy signing key identifier");
  }
  if (env.MONGO_URI && !/^mongodb(?:\+srv)?:\/\//.test(env.MONGO_URI)) {
    errors.push("MONGO_URI must be a MongoDB URI");
  }
  if (env.ISSUER) {
    try {
      const issuer = new URL(env.ISSUER);
      if (issuer.protocol !== "https:" || !issuer.hostname) errors.push("ISSUER must be HTTPS");
    } catch {
      errors.push("ISSUER must be a valid URL");
    }
  }
  if (env.CORS_ORIGINS) {
    const origins = env.CORS_ORIGINS.split(",").map(s => s.trim());
    for (const origin of origins) {
      try {
        const parsed = new URL(origin);
        if (parsed.protocol !== "https:" || parsed.origin !== origin) {
          errors.push("CORS_ORIGINS must contain exact HTTPS origins without paths");
          break;
        }
      } catch {
        errors.push("CORS_ORIGINS has an invalid origin");
        break;
      }
    }
  }

  const privatePath = env.PRIVATE_KEY_PATH ? path.resolve(root, env.PRIVATE_KEY_PATH) : null;
  const publicPath = env.PUBLIC_KEY_PATH ? path.resolve(root, env.PUBLIC_KEY_PATH) : null;
  const bundledPrivate = path.resolve(root, "keys/private.pem");
  const bundledPublic = path.resolve(root, "keys/public.pem");
  if (privatePath && privatePath === bundledPrivate) {
    errors.push("PRIVATE_KEY_PATH references the publicly committed legacy private key");
  }

  if (privatePath && publicPath) {
    try {
      const privateKey = crypto.createPrivateKey(fs.readFileSync(privatePath));
      const publicKey = crypto.createPublicKey(fs.readFileSync(publicPath));
      if (privateKey.asymmetricKeyType !== "rsa" || (privateKey.asymmetricKeyDetails?.modulusLength || 0) < 2048) {
        errors.push("Private key must be RSA with at least 2048 bits");
      }
      const derived = crypto.createPublicKey(privateKey).export({ format: "der", type: "spki" });
      const provided = publicKey.export({ format: "der", type: "spki" });
      if (!derived.equals(provided)) errors.push("Private and public signing keys do not match");

      if (fs.existsSync(bundledPublic)) {
        const exposed = crypto.createPublicKey(fs.readFileSync(bundledPublic))
          .export({ format: "der", type: "spki" });
        if (provided.equals(exposed)) errors.push("PUBLIC_KEY_PATH still matches publicly exposed legacy signing key");
      }
    } catch {
      errors.push("Signing keys cannot be read and parsed at configured paths");
    }
  }
  return { ok: errors.length === 0, errors };
}

if (require.main === module) {
  const result = inspectReleaseEnvironment();
  if (result.ok) {
    console.log("Release preflight passed (configuration only; no deployment or external API health verified).");
  } else {
    for (const error of result.errors) console.error("Preflight:", error);
    process.exitCode = 1;
  }
}
module.exports = { inspectReleaseEnvironment };
