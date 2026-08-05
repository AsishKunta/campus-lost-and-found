const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

process.env.DATABASE_URL ||= "postgresql:///description_assistant_test_unused";

const root = path.join(__dirname, "..", "..");
const { getDescriptionAssistantConfig } = require("../config/descriptionAssistant");
const { createDescriptionAssistantController } = require("../controllers/descriptionAssistantController");
const { createAuthenticate } = require("../middleware/authenticate");
const {
  DescriptionAssistantError,
  createDescriptionAssistant,
  createOpenAIProvider,
  validateFactualSafety,
  validateOriginalDescription,
  validateSuggestion,
} = require("../services/descriptionAssistantService");
const { createFixedWindowRateLimiter } = require("../services/fixedWindowRateLimiter");
const { createSuggestionState } = require(path.join(root, "js", "description-assistant.js"));

const testConfig = {
  provider: "disabled",
  apiKey: "",
  model: "test-model",
  endpoint: "https://provider.invalid/responses",
  maxDescriptionLength: 5000,
  rateLimitMax: 2,
  rateLimitWindowMs: 60_000,
};

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test("authenticated endpoint returns only a suggestion and unauthenticated access is rejected", async () => {
  const assistant = { improveDescription: async () => "I lost my black bottle near the Union." };
  const controller = createDescriptionAssistantController({ assistant });
  const authenticate = createAuthenticate({}, {
    config: { cookieName: "campus_session", developmentBypassEnabled: false },
    getUserForSession: async (_pool, token) => token === "valid"
      ? { user: { id: 7, role: "student" }, expiresAt: new Date(Date.now() + 60_000) }
      : null,
  });
  const deniedResponse = responseRecorder();
  let deniedNext = false;
  await authenticate({ headers: {} }, deniedResponse, () => { deniedNext = true; });
  assert.equal(deniedResponse.statusCode, 401);
  assert.equal(deniedNext, false);

  const request = {
    headers: { cookie: "campus_session=valid" },
    body: { description: "lost black bottle near union" },
  };
  const allowedResponse = responseRecorder();
  let allowedNext = false;
  await authenticate(request, allowedResponse, () => { allowedNext = true; });
  assert.equal(allowedNext, true);
  await controller(request, allowedResponse);
  assert.equal(allowedResponse.statusCode, 200);
  assert.deepEqual(allowedResponse.body, { suggestion: "I lost my black bottle near the Union." });
  const routeSource = fs.readFileSync(path.join(__dirname, "..", "routes", "descriptionAssistantRoutes.js"), "utf8");
  assert.match(routeSource, /router\.use\(authenticate\)/);
});

test("empty, whitespace-only, oversized, structured, and empty outputs are rejected", () => {
  assert.throws(() => validateOriginalDescription("   ", 5000), /Enter a description/);
  assert.throws(() => validateOriginalDescription("x".repeat(5001), 5000), /5000/);
  assert.throws(() => validateSuggestion("", 5000), /invalid suggestion/);
  assert.throws(() => validateSuggestion('{"suggestion":"text"}', 5000), /structured content/);
  assert.throws(() => validateSuggestion("x".repeat(5001), 5000), /too long/);
});

test("strict provider instructions preserve facts and reject introduced high-risk details", async () => {
  const original = "i think i lost my black water bottle near union yesterday evening it has red sticker";
  const suggestion = "I think I lost my black water bottle near the Union yesterday evening. It has a red sticker.";
  validateFactualSafety(original, suggestion);
  for (const fact of ["black", "bottle", "union", "yesterday", "red sticker"]) {
    assert.match(suggestion.toLowerCase(), new RegExp(fact));
  }
  assert.throws(
    () => validateFactualSafety("lost my phone near library", "I lost my black iPhone 17 near the library at 3:00."),
    (error) => error.code === "AI_UNSAFE_SUGGESTION"
  );
  assert.throws(
    () => validateFactualSafety("I think I left it near Victory Hall", "I left it at Victory Hall."),
    (error) => error.code === "AI_UNSAFE_SUGGESTION"
  );
});

test("provider receives only narrow description data and returns plain response text", async () => {
  let providerRequest;
  const config = { ...testConfig, provider: "openai", apiKey: "server-secret" };
  const provider = createOpenAIProvider(config, async (_url, request) => {
    providerRequest = request;
    return {
      ok: true,
      async json() { return { output_text: "I may have lost my bottle near the library." }; },
    };
  });
  const original = "I may have lost my bottle near the library";
  const result = await createDescriptionAssistant({ config, provider }).improveDescription(original);
  assert.equal(result, "I may have lost my bottle near the library.");
  const payload = JSON.parse(providerRequest.body);
  const serialized = JSON.stringify(payload);
  assert.match(serialized, /lost my bottle near the library/);
  assert.doesNotMatch(serialized, /studentId|email|password|session|admin notes|message/i);
  assert.equal(payload.store, false);
  assert.equal(providerRequest.headers.Authorization, "Bearer server-secret");
});

test("provider failures and malformed output fail safely without exposing description content", async () => {
  const sensitive = "private red sticker near Victory Hall";
  const assistant = createDescriptionAssistant({
    config: testConfig,
    provider: { async improveDescription() { throw new Error("provider offline"); } },
  });
  const controller = createDescriptionAssistantController({ assistant });
  const response = responseRecorder();
  const originalConsoleError = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args);
  try {
    await controller({ body: { description: sensitive }, user: { id: 1 } }, response);
  } finally {
    console.error = originalConsoleError;
  }
  assert.equal(response.statusCode, 503);
  assert.equal(response.body.code, "AI_DESCRIPTION_UNAVAILABLE");
  assert.doesNotMatch(JSON.stringify(logged), /private red sticker|Victory Hall/);

  const malformed = createDescriptionAssistant({
    config: testConfig,
    provider: { async improveDescription() { return { suggestion: "not text" }; } },
  });
  await assert.rejects(malformed.improveDescription("lost bottle"), DescriptionAssistantError);
});

test("missing provider configuration leaves ordinary reporting available", async () => {
  const assistant = createDescriptionAssistant({ config: testConfig });
  await assert.rejects(
    assistant.improveDescription("lost bottle"),
    (error) => error.code === "AI_DESCRIPTION_UNAVAILABLE" && error.status === 503
  );
  const reportSource = fs.readFileSync(path.join(root, "js", "report.js"), "utf8");
  assert.match(reportSource, /formData\.append\("description", description/);
  assert.match(reportSource, /POST/);
});

test("rate limiting bounds repeated provider requests", () => {
  let clock = 1000;
  const limiter = createFixedWindowRateLimiter({ maxRequests: 2, windowMs: 1000, now: () => clock });
  assert.equal(limiter.consume(5).allowed, true);
  assert.equal(limiter.consume(5).allowed, true);
  assert.equal(limiter.consume(5).allowed, false);
  assert.equal(limiter.consume(6).allowed, true);
  clock += 1001;
  assert.equal(limiter.consume(5).allowed, true);
});

test("suggestions remain reversible and editable until the user explicitly applies them", () => {
  const state = createSuggestionState("original words", "improved words");
  assert.equal(state.keepOriginal(), "original words");
  assert.equal(state.useSuggestion(), "improved words");
  state.updateSuggestion("manually edited suggestion");
  assert.equal(state.useSuggestion(), "manually edited suggestion");
  assert.equal(state.keepOriginal(), "original words");
});

test("frontend exposes one report-only preview flow, prevents duplicate requests, and contains no AI secret", () => {
  const html = fs.readFileSync(path.join(root, "dashboard.html"), "utf8");
  const frontend = fs.readFileSync(path.join(root, "js", "description-assistant.js"), "utf8");
  assert.match(html, /id="improveDescriptionBtn"/);
  assert.match(html, /AI suggestion/);
  assert.match(html, /Use Suggestion/);
  assert.match(html, /Edit Suggestion/);
  assert.match(html, /Keep Original/);
  assert.match(frontend, /if \(requestInFlight\) return/);
  assert.match(frontend, /description-assistant\/improve/);
  assert.doesNotMatch(`${html}\n${frontend}`, /OPENAI_API_KEY|Bearer server-secret/);
  assert.doesNotMatch(frontend, /claim-description|verification|admin.*notes/i);
});

test("description assistant configuration is disabled safely by default", () => {
  const config = getDescriptionAssistantConfig({});
  assert.equal(config.provider, "disabled");
  assert.equal(config.apiKey, "");
  assert.equal(config.maxDescriptionLength, 5000);
  assert.equal(config.rateLimitMax, 10);
});
