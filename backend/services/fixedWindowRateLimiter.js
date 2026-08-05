function createFixedWindowRateLimiter(options = {}) {
  const maxRequests = options.maxRequests || 10;
  const windowMs = options.windowMs || 15 * 60 * 1000;
  const now = options.now || Date.now;
  const requests = new Map();

  function consume(keyValue) {
    const key = String(keyValue || "anonymous");
    const currentTime = now();
    let entry = requests.get(key);
    if (!entry || entry.resetAt <= currentTime) {
      entry = { count: 0, resetAt: currentTime + windowMs };
    }
    entry.count += 1;
    requests.set(key, entry);
    return {
      allowed: entry.count <= maxRequests,
      remaining: Math.max(0, maxRequests - entry.count),
      retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - currentTime) / 1000)),
    };
  }

  return { consume };
}

module.exports = { createFixedWindowRateLimiter };
