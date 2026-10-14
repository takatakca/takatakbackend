"use strict";

// A small cookie reader avoids adding a parser dependency to the legacy API.
// Cookie values from HTTP headers are decoded individually and never trusted.
function getCookie(req, name) {
  const parsed = req.cookies?.[name];
  if (typeof parsed === "string" && parsed.length > 0) return parsed;
  const header = req.headers?.cookie;
  if (typeof header !== "string") return undefined;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0 || part.slice(0, index).trim() !== name) continue;
    const value = part.slice(index + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function getCredential(req, name) {
  const cookie = getCookie(req, name);
  if (cookie !== undefined) return cookie;
  const field = req.body?.[name];
  return typeof field === "string" ? field : undefined;
}

module.exports = { getCookie, getCredential };
