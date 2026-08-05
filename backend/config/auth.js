const SESSION_COOKIE_NAME = "campus_session";
const DEFAULT_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const DEFAULT_REMEMBERED_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_LOGIN_RATE_LIMIT_MAX = 10;
const DEFAULT_LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function sessionSameSite(environment, secureCookies) {
  const requested = String(environment.SESSION_COOKIE_SAME_SITE || "lax").toLowerCase();
  if (!["lax", "strict", "none"].includes(requested)) return "lax";
  return requested === "none" && !secureCookies ? "lax" : requested;
}

function getAuthConfig(environment = process.env) {
  const production = environment.NODE_ENV === "production";
  const secureCookies = production;
  const developmentBypassEnabled =
    !production &&
    String(environment.DEV_AUTH_BYPASS || "").toLowerCase() === "true";
  const demoDomainRolesEnabled =
    !production &&
    String(environment.DEMO_DOMAIN_ROLES || "true").toLowerCase() === "true";
  return {
    cookieName: environment.SESSION_COOKIE_NAME ||
      (production ? `__Host-${SESSION_COOKIE_NAME}` : SESSION_COOKIE_NAME),
    sessionTtlMs: parsePositiveInteger(
      environment.SESSION_TTL_MS,
      DEFAULT_SESSION_TTL_MS
    ),
    rememberedSessionTtlMs: parsePositiveInteger(
      environment.REMEMBERED_SESSION_TTL_MS,
      DEFAULT_REMEMBERED_SESSION_TTL_MS
    ),
    secureCookies,
    sameSite: sessionSameSite(environment, secureCookies),
    loginRateLimitMax: parsePositiveInteger(
      environment.LOGIN_RATE_LIMIT_MAX,
      DEFAULT_LOGIN_RATE_LIMIT_MAX
    ),
    loginRateLimitWindowMs: parsePositiveInteger(
      environment.LOGIN_RATE_LIMIT_WINDOW_MS,
      DEFAULT_LOGIN_RATE_LIMIT_WINDOW_MS
    ),
    trustProxyHops: parsePositiveInteger(environment.TRUST_PROXY_HOPS, 0),
    developmentBypassEnabled,
    demoDomainRolesEnabled,
    developmentUserEmail:
      environment.DEV_AUTH_EMAIL || "development-user@campus.local",
    developmentUserName:
      environment.DEV_AUTH_NAME || "Local Development User",
  };
}

module.exports = {
  DEFAULT_LOGIN_RATE_LIMIT_MAX,
  DEFAULT_LOGIN_RATE_LIMIT_WINDOW_MS,
  DEFAULT_REMEMBERED_SESSION_TTL_MS,
  DEFAULT_SESSION_TTL_MS,
  SESSION_COOKIE_NAME,
  getAuthConfig,
  sessionSameSite,
};
