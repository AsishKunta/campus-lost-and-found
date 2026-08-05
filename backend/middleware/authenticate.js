const { getAuthConfig } = require("../config/auth");
const { getUserForSession } = require("../services/authService");
const { getDevelopmentSession } = require("../services/developmentAuthService");
const { logError } = require("../utils/safeLogger");

function parseCookies(headerValue) {
  if (!headerValue) return {};

  return headerValue.split(";").reduce((cookies, part) => {
    const separator = part.indexOf("=");
    if (separator < 0) return cookies;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!key) return cookies;
    try {
      cookies[key] = decodeURIComponent(value);
    } catch (_) {
      cookies[key] = value;
    }
    return cookies;
  }, {});
}

function createAuthenticate(pool, options = {}) {
  const config = options.config || getAuthConfig();
  const sessionLookup = options.getUserForSession || getUserForSession;
  const developmentSessionLookup =
    options.getDevelopmentSession || getDevelopmentSession;

  return async function authenticate(req, res, next) {
    try {
      const cookies = parseCookies(req.headers.cookie);
      const token = cookies[config.cookieName];
      let session = await sessionLookup(pool, token);
      if (!session && config.developmentBypassEnabled) {
        session = await developmentSessionLookup(pool, config);
      }

      if (!session) {
        return res.status(401).json({
          error: "Authentication required.",
          code: "AUTHENTICATION_REQUIRED",
        });
      }

      req.auth = session;
      req.user = session.user;
      return next();
    } catch (error) {
      logError("authentication.session_validation_failed", error);
      return res.status(500).json({
        error: "Unable to validate the current session.",
        code: "SESSION_VALIDATION_FAILED",
      });
    }
  };
}

module.exports = { createAuthenticate, parseCookies };
