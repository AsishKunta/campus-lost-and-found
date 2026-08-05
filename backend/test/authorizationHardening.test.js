const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

process.env.DATABASE_URL ||= "postgresql:///authorization_hardening_test_unused";

const { createAuthenticate } = require("../middleware/authenticate");
const { hasRole, requireRole } = require("../middleware/authorize");
const { getUserForSession, updatePreferredWorkspace } = require("../services/authService");
const { studentClaimView } = require("../services/claimPolicy");
const { markNotificationRead } = require("../services/notificationService");

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function source(file) {
  return fs.readFileSync(path.join(__dirname, "..", file), "utf8");
}

test("unauthenticated and invalid-session protected requests are rejected", async () => {
  const authenticate = createAuthenticate({}, {
    config: { cookieName: "campus_session", developmentBypassEnabled: false },
    getUserForSession: async () => null,
  });
  for (const cookie of [undefined, "campus_session=invalid-token"]) {
    const res = response();
    let nextCalled = false;
    await authenticate({ headers: { cookie } }, res, () => { nextCalled = true; });
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.code, "AUTHENTICATION_REQUIRED");
    assert.equal(nextCalled, false);
  }
});

test("Student cannot call Admin middleware even with client-controlled role tampering", () => {
  const guard = requireRole("admin");
  const res = response();
  let nextCalled = false;
  guard({
    user: { id: 10, roles: ["student"], preferredWorkspace: "student" },
    body: { role: "admin", preferredWorkspace: "admin" },
    query: { role: "admin", workspace: "admin" },
    headers: { "x-role": "admin" },
  }, res, () => { nextCalled = true; });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, "AUTHORIZATION_DENIED");
  assert.equal(nextCalled, false);
});

test("persisted dual-role membership and active workspace permit legitimate Admin and Student operations", () => {
  const user = { id: 20, roles: ["student", "admin"], preferredWorkspace: "admin" };
  assert.equal(hasRole(user, "admin"), true);
  assert.equal(hasRole(user, "student"), false);
  user.preferredWorkspace = "student";
  assert.equal(hasRole(user, "student"), true);
  assert.equal(hasRole(user, "admin"), false);
});

test("workspace switching cannot create an unassigned role", async () => {
  const queries = [];
  const pool = {
    async query(sql, params) {
      queries.push({ sql, params });
      return { rows: [], rowCount: 0 };
    },
  };
  await assert.rejects(
    updatePreferredWorkspace(pool, 30, "admin"),
    (error) => error.status === 403 && error.code === "WORKSPACE_NOT_ASSIGNED"
  );
  assert.match(queries[0].sql, /EXISTS[\s\S]*FROM user_roles/);
  assert.deepEqual(queries[0].params, [30, "admin"]);
});

test("claim listing, cancellation, and verification are scoped to the authenticated Student", () => {
  const claimController = source("controllers/claimController.js");
  assert.match(claimController, /WHERE c\.user_id = \$1/);
  assert.match(claimController, /WHERE id = \$1 AND user_id = \$2 AND status = 'pending'/);
  assert.match(claimController, /WHERE id = \$1 AND user_id = \$2 FOR UPDATE/);
  assert.match(claimController, /WHERE id = \$1 AND user_id = \$2 RETURNING \*/);
});

test("Student claim projection excludes private Admin Notes", () => {
  const projected = studentClaimView({
    id: 1,
    user_id: 40,
    status: "pending",
    admin_notes: [{ note: "private" }],
    rejection_type: "manual",
  });
  assert.equal(projected.id, 1);
  assert.equal("admin_notes" in projected, false);
  assert.equal("rejection_type" in projected, false);
  assert.match(source("routes/claimRoutes.js"), /admin-notes", requireRole\("admin"\)/);
});

test("report detail, matching, and closure enforce Student ownership", () => {
  const reportController = source("controllers/reportController.js");
  assert.match(reportController, /id = \$1 AND user_id = \$2 AND category = 'Lost'/);
  assert.match(reportController, /WHERE id = \$1 AND user_id = \$2 AND category = 'Lost'[\s\S]*FOR UPDATE/);
  assert.match(reportController, /WHERE r\.user_id = \$1 AND r\.category = 'Lost'/);
});

test("Student conversations are claim-owner scoped while Admin scope is server-derived", () => {
  const messageController = source("controllers/messageController.js");
  assert.match(messageController, /c\.user_id = \$3/);
  assert.match(messageController, /WHERE c\.user_id = \$1/);
  assert.match(messageController, /const admin = hasRole\(req\.user, "admin"\)/);
  assert.doesNotMatch(messageController, /const admin = .*req\.(body|query|headers)/);
});

test("notification modification is scoped to the authenticated owner", async () => {
  const queries = [];
  const pool = {
    async query(sql, params) {
      queries.push({ sql, params });
      return { rows: [] };
    },
  };
  const result = await markNotificationRead(pool, 99, 50);
  assert.equal(result, null);
  assert.match(queries[0].sql, /WHERE id = \$1 AND user_id = \$2/);
  assert.deepEqual(queries[0].params, [99, 50]);
});

test("expired or revoked sessions cannot restore a user and tokens are hashed before lookup", async () => {
  const queries = [];
  const pool = {
    async query(sql, params) {
      queries.push({ sql, params });
      return { rows: [], rowCount: 0 };
    },
  };
  assert.equal(await getUserForSession(pool, "raw-session-token"), null);
  assert.match(queries[0].sql, /s\.revoked_at IS NULL/);
  assert.match(queries[0].sql, /s\.expires_at > NOW\(\)/);
  assert.notEqual(queries[0].params[0], "raw-session-token");
  assert.match(queries[0].params[0], /^[a-f0-9]{64}$/);
});
