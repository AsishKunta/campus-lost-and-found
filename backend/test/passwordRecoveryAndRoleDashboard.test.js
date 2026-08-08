const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcrypt");
const fs = require("node:fs");
const path = require("node:path");

process.env.DATABASE_URL ||= "postgresql:///password_recovery_test_unused";

const {
  hashResetToken,
  requestPasswordReset,
  resetPassword,
} = require("../services/passwordResetService");

const root = path.resolve(__dirname, "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function createRecoveryPool() {
  const state = {
    users: [{ id: 1, email: "student@student.com", password: "old-hash" }],
    tokens: [],
    sessions: [{ user_id: 1, revoked_at: null }],
    nextTokenId: 1,
  };

  async function query(sql, params = []) {
    const normalized = String(sql).replace(/\s+/g, " ").trim();
    if (normalized === "BEGIN" || normalized === "COMMIT" || normalized === "ROLLBACK") {
      return { rows: [], rowCount: 0 };
    }
    if (normalized.startsWith("SELECT id, email FROM users")) {
      const user = state.users.find((entry) => entry.email === params[0]);
      return { rows: user ? [user] : [] };
    }
    if (normalized.startsWith("UPDATE password_reset_tokens") && normalized.includes("WHERE user_id")) {
      state.tokens.filter((entry) => entry.user_id === params[0] && !entry.used_at)
        .forEach((entry) => { entry.used_at = new Date(); });
      return { rows: [] };
    }
    if (normalized.startsWith("INSERT INTO password_reset_tokens")) {
      const record = {
        id: `token-${state.nextTokenId++}`,
        user_id: params[0],
        token_hash: params[1],
        expires_at: params[2],
        used_at: null,
      };
      state.tokens.push(record);
      return { rows: [{ id: record.id }] };
    }
    if (normalized.startsWith("DELETE FROM password_reset_tokens")) {
      state.tokens = state.tokens.filter((entry) => entry.id !== params[0]);
      return { rows: [] };
    }
    if (normalized.includes("FROM password_reset_tokens prt") && normalized.includes("FOR UPDATE")) {
      const record = state.tokens.find((entry) =>
        entry.token_hash === params[0] && !entry.used_at && entry.expires_at > new Date()
      );
      return { rows: record ? [{ id: record.id, user_id: record.user_id }] : [] };
    }
    if (normalized.startsWith("UPDATE users SET password")) {
      state.users.find((entry) => entry.id === params[0]).password = params[1];
      return { rows: [] };
    }
    if (normalized.startsWith("UPDATE password_reset_tokens SET used_at")) {
      state.tokens.find((entry) => entry.id === params[0]).used_at = new Date();
      return { rows: [] };
    }
    if (normalized.startsWith("UPDATE sessions SET revoked_at")) {
      state.sessions.filter((entry) => entry.user_id === params[0] && !entry.revoked_at)
        .forEach((entry) => { entry.revoked_at = new Date(); });
      return { rows: [] };
    }
    throw new Error(`Unhandled recovery query: ${normalized}`);
  }

  return {
    state,
    query,
    async connect() { return { query, release() {} }; },
  };
}

test("password reset request is generic and stores only a hashed expiring token", async () => {
  const pool = createRecoveryPool();
  let delivered;
  const existing = await requestPasswordReset(pool, "student@student.com", {
    ttlMs: 60_000,
    deliver: async (payload) => { delivered = payload; return true; },
  });
  const missing = await requestPasswordReset(pool, "missing@student.com", {
    ttlMs: 60_000,
    deliver: async () => { throw new Error("must not deliver"); },
  });
  assert.deepEqual(existing, missing);
  assert.equal(pool.state.tokens.length, 1);
  assert.notEqual(pool.state.tokens[0].token_hash, delivered.token);
  assert.equal(pool.state.tokens[0].token_hash, hashResetToken(delivered.token));
  assert.ok(pool.state.tokens[0].expires_at > new Date());
});

test("valid reset changes the bcrypt password, consumes its token, and revokes sessions", async () => {
  const pool = createRecoveryPool();
  let rawToken;
  await requestPasswordReset(pool, "student@student.com", {
    ttlMs: 60_000,
    deliver: async ({ token }) => { rawToken = token; return true; },
  });
  await resetPassword(pool, bcrypt, {
    token: rawToken,
    password: "new-secure-password",
    passwordConfirm: "new-secure-password",
  });
  assert.equal(await bcrypt.compare("new-secure-password", pool.state.users[0].password), true);
  assert.ok(pool.state.tokens[0].used_at);
  assert.ok(pool.state.sessions[0].revoked_at);
  await assert.rejects(
    resetPassword(pool, bcrypt, {
      token: rawToken,
      password: "another-secure-password",
      passwordConfirm: "another-secure-password",
    }),
    (error) => error.code === "RESET_TOKEN_INVALID"
  );
});

test("expired reset token is rejected", async () => {
  const pool = createRecoveryPool();
  pool.state.tokens.push({
    id: "expired",
    user_id: 1,
    token_hash: hashResetToken("expired-token"),
    expires_at: new Date(Date.now() - 1),
    used_at: null,
  });
  await assert.rejects(
    resetPassword(pool, bcrypt, {
      token: "expired-token",
      password: "new-secure-password",
      passwordConfirm: "new-secure-password",
    }),
    (error) => error.code === "RESET_TOKEN_INVALID"
  );
});

test("public entry targets login and protected Dashboard cannot flash before server auth", () => {
  assert.match(read("index.html"), /url=login\.html/);
  assert.match(read("vercel.json"), /"destination": "\/login\.html"/);
  assert.match(read("dashboard.html"), /<html lang="en" class="auth-pending">/);
  assert.match(read("dashboard.html"), /html\.auth-pending body \{ visibility: hidden; \}/);
  assert.match(read("js/common.js"), /auth\/me[\s\S]*classList\.remove\("auth-pending"\)/);
});

test("login trusts the backend session role rather than deriving authorization from email", () => {
  const login = read("js/login.js");
  assert.doesNotMatch(login, /desiredWorkspace/);
  assert.doesNotMatch(login, /auth\/workspace/);
  assert.match(login, /cacheUser\(data\.user\)/);
});

test("Student discovery is activity-scoped while Admin active Found inventory is server-protected", () => {
  const controller = read("backend/controllers/reportController.js");
  const routes = read("backend/routes/reportRoutes.js");
  const adminUi = read("js/admin-dashboard.js");
  assert.match(controller, /r\.user_id = \$1[\s\S]*matched\.lost_report_id IS NOT NULL[\s\S]*FROM claims c/);
  assert.match(controller, /getActiveFoundReports[\s\S]*r\.category = 'Found' AND r\.lifecycle_status = 'active'/);
  assert.match(routes, /\/active-found", requireRole\("admin"\)/);
  assert.match(adminUi, /\/reports\/active-found/);
  assert.match(read("js/dashboard.js"), /No reports yet\./);
  assert.match(read("js/dashboard.js"), /REPORTS_CACHE_KEY}:\$\{getCurrentUser\(\)\.id}/);
  assert.match(adminUi, /ADMIN_CACHE_KEY \+ ':' \+ getCurrentUser\(\)\.id/);
});

test("password recovery migration and UI enforce expiration, single use, and user confirmation", () => {
  const migration = read("backend/migrations/007_password_recovery.sql");
  assert.match(migration, /token_hash TEXT NOT NULL UNIQUE/);
  assert.match(migration, /expires_at TIMESTAMPTZ NOT NULL/);
  assert.match(migration, /used_at\s+TIMESTAMPTZ/);
  assert.match(read("login.html"), /Forgot password\?/);
  assert.match(read("reset-password.html"), /Confirm New Password/);
  assert.doesNotMatch(read("js/reset-password.js"), /localStorage|sessionStorage/);
});

test("Vercel runtime configuration exposes only the configured non-secret backend URL", () => {
  const previous = process.env.BACKEND_API_URL;
  process.env.BACKEND_API_URL = "https://campus-api.onrender.com/";
  delete require.cache[require.resolve("../../api/runtime-config")];
  const handler = require("../../api/runtime-config");
  const response = {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    send(body) { this.body = body; return this; },
  };
  handler({}, response);
  assert.equal(response.statusCode, 200);
  assert.match(response.body, /https:\/\/campus-api\.onrender\.com/);
  assert.doesNotMatch(response.body, /DATABASE_URL|SESSION|RESEND_API_KEY/);
  if (previous === undefined) delete process.env.BACKEND_API_URL;
  else process.env.BACKEND_API_URL = previous;
});
