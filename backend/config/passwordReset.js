const DEFAULT_PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;
const DEFAULT_PASSWORD_RESET_RATE_LIMIT_MAX = 5;
const DEFAULT_PASSWORD_RESET_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getPasswordResetConfig(environment = process.env) {
  return {
    ttlMs: positiveInteger(environment.PASSWORD_RESET_TTL_MS, DEFAULT_PASSWORD_RESET_TTL_MS),
    rateLimitMax: positiveInteger(
      environment.PASSWORD_RESET_RATE_LIMIT_MAX,
      DEFAULT_PASSWORD_RESET_RATE_LIMIT_MAX
    ),
    rateLimitWindowMs: positiveInteger(
      environment.PASSWORD_RESET_RATE_LIMIT_WINDOW_MS,
      DEFAULT_PASSWORD_RESET_RATE_LIMIT_WINDOW_MS
    ),
    frontendUrl: String(environment.PASSWORD_RESET_FRONTEND_URL || "").replace(/\/$/, ""),
    emailProvider: String(environment.PASSWORD_RESET_EMAIL_PROVIDER || "disabled").toLowerCase(),
    resendApiKey: environment.RESEND_API_KEY || "",
    fromEmail: environment.PASSWORD_RESET_FROM_EMAIL || "",
  };
}

module.exports = {
  DEFAULT_PASSWORD_RESET_RATE_LIMIT_MAX,
  DEFAULT_PASSWORD_RESET_RATE_LIMIT_WINDOW_MS,
  DEFAULT_PASSWORD_RESET_TTL_MS,
  getPasswordResetConfig,
};
