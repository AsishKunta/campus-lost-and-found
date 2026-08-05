const express = require("express");
const pool = require("../db");
const { getDescriptionAssistantConfig } = require("../config/descriptionAssistant");
const { improveDescription } = require("../controllers/descriptionAssistantController");
const { createAuthenticate } = require("../middleware/authenticate");
const { createFixedWindowRateLimiter } = require("../services/fixedWindowRateLimiter");

function createDescriptionAssistantRouter(options = {}) {
  const router = express.Router();
  const config = options.config || getDescriptionAssistantConfig();
  const limiter = options.limiter || createFixedWindowRateLimiter({
    maxRequests: config.rateLimitMax,
    windowMs: config.rateLimitWindowMs,
  });
  const authenticate = options.authenticate || createAuthenticate(options.pool || pool);
  const controller = options.improveDescription || improveDescription;

  router.use(authenticate);
  router.post("/improve", (req, res, next) => {
    const limit = limiter.consume(req.user.id);
    res.set("X-RateLimit-Remaining", String(limit.remaining));
    if (!limit.allowed) {
      res.set("Retry-After", String(limit.retryAfterSeconds));
      return res.status(429).json({
        error: "Too many description improvement requests. Please try again later.",
        code: "AI_RATE_LIMITED",
      });
    }
    return next();
  }, controller);
  return router;
}

module.exports = createDescriptionAssistantRouter();
module.exports.createDescriptionAssistantRouter = createDescriptionAssistantRouter;
