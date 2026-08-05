const DEFAULT_MAX_DESCRIPTION_LENGTH = 5000;
const DEFAULT_AI_RATE_LIMIT_MAX = 10;
const DEFAULT_AI_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getDescriptionAssistantConfig(environment = process.env) {
  return {
    provider: String(environment.AI_DESCRIPTION_PROVIDER || "disabled").toLowerCase(),
    apiKey: environment.OPENAI_API_KEY || "",
    model: environment.AI_DESCRIPTION_MODEL || "gpt-5.6-luna",
    endpoint: environment.AI_DESCRIPTION_ENDPOINT || "https://api.openai.com/v1/responses",
    maxDescriptionLength: positiveInteger(
      environment.AI_DESCRIPTION_MAX_LENGTH,
      DEFAULT_MAX_DESCRIPTION_LENGTH
    ),
    rateLimitMax: positiveInteger(
      environment.AI_DESCRIPTION_RATE_LIMIT_MAX,
      DEFAULT_AI_RATE_LIMIT_MAX
    ),
    rateLimitWindowMs: positiveInteger(
      environment.AI_DESCRIPTION_RATE_LIMIT_WINDOW_MS,
      DEFAULT_AI_RATE_LIMIT_WINDOW_MS
    ),
  };
}

module.exports = {
  DEFAULT_AI_RATE_LIMIT_MAX,
  DEFAULT_AI_RATE_LIMIT_WINDOW_MS,
  DEFAULT_MAX_DESCRIPTION_LENGTH,
  getDescriptionAssistantConfig,
};
