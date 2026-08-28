const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createDatabasePoolConfig,
  isLocalDatabaseUrl,
} = require("../config/database");

test("local TCP and Unix-socket PostgreSQL URLs disable SSL", () => {
  assert.equal(isLocalDatabaseUrl("postgresql://localhost/campus"), true);
  assert.equal(isLocalDatabaseUrl("postgresql://127.0.0.1:5432/campus"), true);
  assert.equal(isLocalDatabaseUrl("postgresql:///campus"), true);
  assert.equal(createDatabasePoolConfig("postgresql:///campus").ssl, false);
});

test("remote PostgreSQL URLs retain TLS configuration", () => {
  const config = createDatabasePoolConfig(
    "postgresql://user:password@database.example.com:5432/campus"
  );
  assert.deepEqual(config.ssl, { rejectUnauthorized: false });
});

test("database configuration rejects a missing DATABASE_URL", () => {
  assert.throws(
    () => createDatabasePoolConfig(),
    /DATABASE_URL is required/
  );
});
