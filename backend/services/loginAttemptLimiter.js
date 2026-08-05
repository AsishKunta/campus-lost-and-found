const crypto = require("crypto");

function createLoginAttemptLimiter(options = {}) {
  const maxAttempts = Number.isSafeInteger(options.maxAttempts) && options.maxAttempts > 0
    ? options.maxAttempts
    : 10;
  const windowMs = Number.isSafeInteger(options.windowMs) && options.windowMs > 0
    ? options.windowMs
    : 15 * 60 * 1000;
  const now = options.now || Date.now;
  const attempts = new Map();

  function keyFor(req, email) {
    const source = `${String(req?.ip || "unknown")}|${String(email || "").trim().toLowerCase()}`;
    return crypto.createHash("sha256").update(source).digest("hex");
  }

  function currentEntry(key) {
    const entry = attempts.get(key);
    if (entry && entry.resetAt > now()) return entry;
    if (entry) attempts.delete(key);
    return null;
  }

  function check(req, email) {
    const entry = currentEntry(keyFor(req, email));
    if (!entry || entry.count < maxAttempts) return { allowed: true, retryAfterSeconds: 0 };
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now()) / 1000)),
    };
  }

  function recordFailure(req, email) {
    const key = keyFor(req, email);
    const entry = currentEntry(key) || { count: 0, resetAt: now() + windowMs };
    entry.count += 1;
    attempts.set(key, entry);
    return entry.count;
  }

  function recordSuccess(req, email) {
    attempts.delete(keyFor(req, email));
  }

  return { check, recordFailure, recordSuccess };
}

module.exports = { createLoginAttemptLimiter };
