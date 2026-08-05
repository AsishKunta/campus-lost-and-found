const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

process.env.DATABASE_URL ||= "postgresql:///session_security_test_unused";

const { getAuthConfig } = require("../config/auth");
const { securityHeaders } = require("../middleware/securityHeaders");
const { createLoginAttemptLimiter } = require("../services/loginAttemptLimiter");
const { clearSessionCookieOptions, sessionCookieOptions } = require("../utils/sessionCookie");

test("production cookie defaults are host-bound, secure, HTTP-only, and explicitly expiring", () => {
  const config = getAuthConfig({ NODE_ENV: "production" });
  const expiresAt = new Date(Date.now() + 60_000);
  const options = sessionCookieOptions(config, expiresAt);

  assert.equal(config.cookieName, "__Host-campus_session");
  assert.equal(options.httpOnly, true);
  assert.equal(options.secure, true);
  assert.equal(options.sameSite, "lax");
  assert.equal(options.path, "/");
  assert.equal(options.expires, expiresAt);
  assert.ok(options.maxAge > 0 && options.maxAge <= 60_000);
  assert.equal("domain" in options, false);
  assert.deepEqual(clearSessionCookieOptions(config), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
  });
});

test("development cookies remain localhost compatible and SameSite=None requires Secure", () => {
  const development = getAuthConfig({
    NODE_ENV: "development",
    SESSION_COOKIE_SAME_SITE: "none",
  });
  assert.equal(development.cookieName, "campus_session");
  assert.equal(development.secureCookies, false);
  assert.equal(development.sameSite, "lax");

  const production = getAuthConfig({
    NODE_ENV: "production",
    SESSION_COOKIE_SAME_SITE: "none",
  });
  assert.equal(production.sameSite, "none");
  assert.equal(production.secureCookies, true);
});

test("Remember Me retains production cookie security while extending server expiry", () => {
  const config = getAuthConfig({ NODE_ENV: "production" });
  const expiresAt = new Date(Date.now() + config.rememberedSessionTtlMs);
  const options = sessionCookieOptions(config, expiresAt);

  assert.equal(config.sessionTtlMs, 8 * 60 * 60 * 1000);
  assert.equal(config.rememberedSessionTtlMs, 30 * 24 * 60 * 60 * 1000);
  assert.equal(options.httpOnly, true);
  assert.equal(options.secure, true);
  assert.equal(options.sameSite, "lax");
  assert.equal(options.path, "/");
  assert.equal("domain" in options, false);
  assert.ok(options.maxAge > 29 * 24 * 60 * 60 * 1000);
});

test("security header middleware sets restrained production-safe defaults", () => {
  const headers = {};
  let nextCalled = false;
  securityHeaders({}, {
    setHeader(name, value) { headers[name] = value; },
  }, () => { nextCalled = true; });

  assert.equal(headers["X-Content-Type-Options"], "nosniff");
  assert.equal(headers["X-Frame-Options"], "DENY");
  assert.equal(headers["Referrer-Policy"], "no-referrer");
  assert.match(headers["Permissions-Policy"], /camera=\(\)/);
  assert.equal(nextCalled, true);
});

test("login limiter blocks repeated failures, resets on success, and expires safely", () => {
  let clock = 1_000;
  const limiter = createLoginAttemptLimiter({
    maxAttempts: 3,
    windowMs: 10_000,
    now: () => clock,
  });
  const req = { ip: "192.0.2.10" };
  const email = "student@student.com";

  assert.equal(limiter.check(req, email).allowed, true);
  limiter.recordFailure(req, email);
  limiter.recordFailure(req, email);
  limiter.recordFailure(req, email);
  assert.equal(limiter.check(req, email).allowed, false);
  assert.equal(limiter.check({ ip: "192.0.2.11" }, email).allowed, true);

  limiter.recordSuccess(req, email);
  assert.equal(limiter.check(req, email).allowed, true);
  limiter.recordFailure(req, email);
  limiter.recordFailure(req, email);
  limiter.recordFailure(req, email);
  clock += 10_001;
  assert.equal(limiter.check(req, email).allowed, true);
});

test("login controller applies failure-only throttling and auth responses disable caching", () => {
  const controllerSource = fs.readFileSync(
    path.join(__dirname, "..", "controllers", "authController.js"),
    "utf8"
  );
  const routesSource = fs.readFileSync(
    path.join(__dirname, "..", "routes", "authRoutes.js"),
    "utf8"
  );

  assert.match(controllerSource, /loginLimiter\.check/);
  assert.match(controllerSource, /LOGIN_RATE_LIMITED/);
  assert.match(controllerSource, /error\.code === "INVALID_CREDENTIALS"/);
  assert.match(controllerSource, /loginLimiter\.recordFailure/);
  assert.match(controllerSource, /loginLimiter\.recordSuccess/);
  assert.match(routesSource, /Cache-Control", "no-store"/);
});
