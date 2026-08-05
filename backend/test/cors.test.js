const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_DEVELOPMENT_ORIGINS,
  allowedOrigins,
  createCorsOptions,
} = require("../config/cors");

function checkOrigin(options, origin) {
  return new Promise((resolve) => {
    options.origin(origin, (error, accepted) => resolve({ error, accepted }));
  });
}

test("default local CORS origins include localhost and 127.0.0.1 on port 5500", () => {
  assert.ok(DEFAULT_DEVELOPMENT_ORIGINS.includes("http://127.0.0.1:5500"));
  assert.ok(DEFAULT_DEVELOPMENT_ORIGINS.includes("http://localhost:5500"));
  assert.ok(allowedOrigins({}).has("http://127.0.0.1:5500"));
});

test("CORS accepts configured origins with credentials and rejects unknown origins", async () => {
  const options = createCorsOptions({
    FRONTEND_ORIGINS: "http://127.0.0.1:5500,http://localhost:5500",
  });
  assert.equal(options.credentials, true);
  assert.ok(options.methods.includes("OPTIONS"));
  assert.equal((await checkOrigin(options, "http://127.0.0.1:5500")).accepted, true);
  assert.equal((await checkOrigin(options, "http://localhost:5500")).accepted, true);
  assert.match(
    (await checkOrigin(options, "https://untrusted.example")).error.message,
    /not allowed/
  );
});

test("production CORS fails closed without configured origins and rejects wildcards", async () => {
  const options = createCorsOptions({ NODE_ENV: "production" });
  assert.equal(allowedOrigins({ NODE_ENV: "production" }).size, 0);
  assert.match(
    (await checkOrigin(options, "http://localhost:5500")).error.message,
    /not allowed/
  );
  assert.throws(
    () => createCorsOptions({ NODE_ENV: "production", FRONTEND_ORIGINS: "*" }),
    /does not allow a wildcard/
  );
});
