const bcrypt = require("bcrypt");
const pool = require("../db");
const { getAuthConfig } = require("../config/auth");
const {
  AuthError,
  createSession,
  registerUser,
  revokeSession,
  updatePreferredWorkspace,
  verifyCredentials,
} = require("../services/authService");
const { parseCookies } = require("../middleware/authenticate");
const {
  clearSessionCookieOptions,
  sessionCookieOptions,
} = require("../utils/sessionCookie");
const { logError } = require("../utils/safeLogger");
const { createLoginAttemptLimiter } = require("../services/loginAttemptLimiter");

function requestMetadata(req) {
  return {
    userAgent: String(req.get("user-agent") || "").slice(0, 1000) || null,
    ipAddress: req.ip || null,
  };
}

function sendAuthError(res, error) {
  if (error instanceof AuthError) {
    return res.status(error.status).json({
      error: error.message,
      code: error.code,
    });
  }

  logError("authentication.request_failed", error);
  return res.status(500).json({
    error: "Authentication service unavailable.",
    code: "AUTH_SERVICE_ERROR",
  });
}

function requestedSessionTtl(body, config) {
  const rememberMe = body?.rememberMe;
  if (rememberMe !== undefined && typeof rememberMe !== "boolean") {
    throw new AuthError(
      "Remember me must be true or false.",
      400,
      "INVALID_REMEMBER_ME"
    );
  }
  return rememberMe === true
    ? config.rememberedSessionTtlMs
    : config.sessionTtlMs;
}

function createAuthController(dependencies = {}) {
  const database = dependencies.pool || pool;
  const passwordHasher = dependencies.bcrypt || bcrypt;
  const config = dependencies.config || getAuthConfig();
  const loginLimiter = dependencies.loginLimiter || createLoginAttemptLimiter({
    maxAttempts: config.loginRateLimitMax,
    windowMs: config.loginRateLimitWindowMs,
  });

  async function signup(req, res) {
    try {
      const user = await registerUser(database, passwordHasher, req.body || {}, {
        demoDomainRolesEnabled: config.demoDomainRolesEnabled,
      });
      return res.status(201).json({
        message: "Account created successfully.",
        user,
      });
    } catch (error) {
      return sendAuthError(res, error);
    }
  }

  async function login(req, res) {
    const email = req.body?.email;
    const limit = loginLimiter.check(req, email);
    if (!limit.allowed) {
      res.set?.("Retry-After", String(limit.retryAfterSeconds));
      return res.status(429).json({
        error: "Too many failed login attempts. Please try again later.",
        code: "LOGIN_RATE_LIMITED",
      });
    }
    try {
      const sessionTtlMs = requestedSessionTtl(req.body, config);
      const user = await verifyCredentials(
        database,
        passwordHasher,
        req.body || {}
      );
      const session = await createSession(database, user.id, {
        ttlMs: sessionTtlMs,
        ...requestMetadata(req),
      });

      loginLimiter.recordSuccess(req, email);

      res.cookie(
        config.cookieName,
        session.token,
        sessionCookieOptions(config, session.expiresAt)
      );
      return res.status(200).json({
        message: "Login successful.",
        user,
        expiresAt: session.expiresAt,
      });
    } catch (error) {
      if (error instanceof AuthError && error.code === "INVALID_CREDENTIALS") {
        loginLimiter.recordFailure(req, email);
      }
      return sendAuthError(res, error);
    }
  }

  async function logout(req, res) {
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies[config.cookieName];

    try {
      await revokeSession(database, token);
      res.clearCookie(config.cookieName, clearSessionCookieOptions(config));
      return res.status(200).json({ message: "Logged out successfully." });
    } catch (error) {
      return sendAuthError(res, error);
    }
  }

  function me(req, res) {
    return res.status(200).json({
      user: req.user,
      expiresAt: req.auth.expiresAt,
    });
  }

  function getProfile(req, res) {
    const requestedEmail = String(req.params.email || "").trim().toLowerCase();
    if (requestedEmail !== req.user.email) {
      return res.status(403).json({
        error: "You can only access your own profile.",
        code: "PROFILE_ACCESS_DENIED",
      });
    }
    return res.status(200).json({ user: req.user });
  }

  async function setWorkspace(req, res) {
    try {
      const user = await updatePreferredWorkspace(
        database,
        req.user.id,
        req.body?.workspace
      );
      req.user = user;
      return res.status(200).json({ user });
    } catch (error) {
      return sendAuthError(res, error);
    }
  }

  function developmentStatus(req, res) {
    return res.status(200).json({
      enabled: config.developmentBypassEnabled,
      mode: config.developmentBypassEnabled ? "development-bypass" : "authentication",
    });
  }

  return { developmentStatus, getProfile, login, logout, me, setWorkspace, signup };
}

module.exports = {
  ...createAuthController(),
  createAuthController,
  requestedSessionTtl,
  sendAuthError,
};
