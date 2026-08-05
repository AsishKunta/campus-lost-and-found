const test = require("node:test");
const assert = require("node:assert/strict");

process.env.DATABASE_URL ||= "postgresql:///phase3_test_unused";

const { requireRole, hasRole } = require("../middleware/authorize");
const { getWorkflowConfig } = require("../config/workflow");
const { isEligible } = require("../services/matchingWorkflowService");
const {
  createNotification,
  listNotifications,
  markNotificationRead,
} = require("../services/notificationService");
const { expirePendingClaims } = require("../services/claimExpirationService");
const {
  MANUAL_REJECTION_REASON,
  AUTOMATIC_REJECTION_REASON,
} = require("../controllers/claimController");
const {
  canStudentCancel,
  hasClaimCapacity,
  relatedClaimsForApproval,
  studentClaimView,
} = require("../services/claimPolicy");
const { updatePreferredWorkspace } = require("../services/authService");
const {
  MAX_UPLOAD_BYTES,
  imageUploadOptions,
} = require("../config/upload");
const {
  canCloseLostReport,
  canCreateReportType,
} = require("../services/reportPolicy");

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test("role middleware allows assigned roles and denies privilege escalation", () => {
  const authorizeAdmin = requireRole("admin");
  const denied = response();
  let deniedNext = false;
  authorizeAdmin(
    { user: { id: 1, roles: ["student"] } },
    denied,
    () => { deniedNext = true; }
  );
  assert.equal(denied.statusCode, 403);
  assert.equal(deniedNext, false);

  const allowed = response();
  let allowedNext = false;
  authorizeAdmin(
    { user: { id: 2, roles: ["student", "admin"], preferredWorkspace: "admin" } },
    allowed,
    () => { allowedNext = true; }
  );
  assert.equal(allowedNext, true);
  assert.equal(hasRole({ roles: ["student", "admin"], preferredWorkspace: "admin" }, "admin"), true);
  assert.equal(hasRole({ roles: ["student", "admin"], preferredWorkspace: "student" }, "admin"), false);
});

test("claim expiration defaults to 60 days and remains configurable", () => {
  assert.equal(getWorkflowConfig({}).claimExpiryDays, 60);
  assert.equal(getWorkflowConfig({ CLAIM_EXPIRY_DAYS: "45" }).claimExpiryDays, 45);
  assert.equal(getWorkflowConfig({ CLAIM_EXPIRY_DAYS: "invalid" }).claimExpiryDays, 60);
});

test("matching excludes returned, closed, and archived reports", () => {
  assert.equal(isEligible({ lifecycleStatus: "active" }), true);
  assert.equal(isEligible({ lifecycleStatus: "returned" }), false);
  assert.equal(isEligible({ lifecycle_status: "closed_by_student" }), false);
  assert.equal(isEligible({ lifecycleStatus: "archived" }), false);
});

test("notification reads are ownership scoped and admin listing is explicit", async () => {
  const calls = [];
  const pool = {
    async query(sql, params) {
      calls.push({ sql: String(sql), params });
      if (String(sql).startsWith("UPDATE notifications")) {
        return { rows: params[1] === 7 ? [{ id: params[0], user_id: 7 }] : [] };
      }
      return { rows: [{ id: 1, user_id: 7 }] };
    },
  };
  await listNotifications(pool, { id: 7, roles: ["student"] });
  assert.match(calls[0].sql, /WHERE n\.user_id = \$1/);
  assert.deepEqual(calls[0].params, [7]);
  assert.equal((await markNotificationRead(pool, 1, 7)).user_id, 7);
  assert.equal(await markNotificationRead(pool, 1, 8), null);
});

test("notification creation uses conflict-safe persistence for deduplication", async () => {
  let captured;
  const pool = {
    async query(sql, params) {
      captured = { sql: String(sql), params };
      return { rows: [{ id: 10 }] };
    },
  };
  const created = await createNotification(pool, {
    userId: 3,
    type: "new_match",
    title: "Potential item match found",
    message: "A match was found.",
    reportId: 9,
    matchId: 11,
  });
  assert.equal(created.id, 10);
  assert.match(captured.sql, /ON CONFLICT DO NOTHING/);
  assert.deepEqual(captured.params.slice(0, 4), [
    3, "new_match", "Potential item match found", "A match was found.",
  ]);
});

test("expiration closes pending claims, records history, and notifies owners", async () => {
  const queries = [];
  const client = {
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, " ").trim();
      queries.push(normalized);
      if (normalized.startsWith("UPDATE claims")) {
        return { rows: [{ id: 21, user_id: 4 }] };
      }
      if (normalized.startsWith("INSERT INTO notifications")) {
        return { rows: [{ id: 31 }] };
      }
      return { rows: [] };
    },
    release() {},
  };
  const expired = await expirePendingClaims({ connect: async () => client });
  assert.deepEqual(expired, [{ id: 21, user_id: 4 }]);
  assert.ok(queries.some((sql) => sql.includes("status = 'expired'")));
  assert.ok(queries.some((sql) => sql.startsWith("INSERT INTO claim_history")));
  assert.ok(queries.some((sql) => sql.startsWith("INSERT INTO notifications")));
});

test("manual and automatic rejection reasons are exact business constants", () => {
  assert.equal(MANUAL_REJECTION_REASON, "Ownership could not be verified.");
  assert.equal(
    AUTOMATIC_REJECTION_REASON,
    "This claim was automatically closed because the item has already been returned to another verified claimant."
  );
});

test("three-active-claims policy is per Lost Report and closed statuses reopen slots", () => {
  assert.equal(hasClaimCapacity([
    { status: "pending" },
    { status: "under_review" },
    { status: "approved" },
  ]), false);
  assert.equal(hasClaimCapacity([
    { status: "pending" },
    { status: "rejected" },
    { status: "cancelled" },
    { status: "expired" },
  ]), true);
});

test("student cancellation requires ownership, pending status, and no review", () => {
  assert.equal(canStudentCancel({ user_id: 4, status: "pending", reviewed_at: null }, 4), true);
  assert.equal(canStudentCancel({ user_id: 5, status: "pending", reviewed_at: null }, 4), false);
  assert.equal(canStudentCancel({ user_id: 4, status: "under_review", reviewed_at: new Date() }, 4), false);
});

test("related-claim suggestions stay within one Lost Report", () => {
  const target = { id: 1, lost_report_id: 20 };
  assert.deepEqual(
    relatedClaimsForApproval(target, [
      target,
      { id: 2, lost_report_id: 20, status: "pending" },
      { id: 3, lost_report_id: 20, status: "rejected" },
      { id: 4, lost_report_id: 99, status: "pending" },
    ]).map((claim) => claim.id),
    [2]
  );
});

test("student claim DTO removes private administrator data", () => {
  assert.deepEqual(
    studentClaimView({
      id: 1,
      status: "rejected",
      rejection_reason: MANUAL_REJECTION_REASON,
      rejection_type: "manual",
      admin_notes: [{ note: "Verified serial number" }],
    }),
    { id: 1, status: "rejected", rejection_reason: MANUAL_REJECTION_REASON }
  );
});

test("preferred workspace must be one of the user's database roles", async () => {
  const pool = {
    async query(sql, params) {
      const normalized = String(sql).replace(/\s+/g, " ").trim();
      if (normalized.startsWith("UPDATE users")) {
        return params[1] === "admin"
          ? { rows: [{ id: 8, name: "Dual User", email: "dual@example.com",
              role: "student", preferred_workspace: "admin", created_at: new Date() }] }
          : { rows: [] };
      }
      return { rows: [{ role: "admin" }, { role: "student" }] };
    },
  };
  const user = await updatePreferredWorkspace(pool, 8, "admin");
  assert.equal(user.preferredWorkspace, "admin");
  assert.deepEqual(user.roles, ["admin", "student"]);
  await assert.rejects(
    updatePreferredWorkspace(pool, 8, "student"),
    (error) => error.status === 403 && error.code === "WORKSPACE_NOT_ASSIGNED"
  );
});

test("image uploads enforce size and MIME-type policy", () => {
  const options = imageUploadOptions({});
  assert.equal(options.limits.fileSize, MAX_UPLOAD_BYTES);
  options.fileFilter({}, { mimetype: "image/png" }, (error, accepted) => {
    assert.equal(error, null);
    assert.equal(accepted, true);
  });
  options.fileFilter({}, { mimetype: "text/html" }, (error) => {
    assert.equal(error.code, "UNSUPPORTED_IMAGE_TYPE");
  });
});

test("authenticated Student and Admin workspaces can create either report type", () => {
  assert.equal(canCreateReportType({ roles: ["student"], preferredWorkspace: "student" }, "Lost"), true);
  assert.equal(canCreateReportType({ roles: ["student"], preferredWorkspace: "student" }, "Found"), true);
  assert.equal(canCreateReportType({ roles: ["admin"], preferredWorkspace: "admin" }, "Found"), true);
  assert.equal(canCreateReportType({ roles: ["admin"], preferredWorkspace: "admin" }, "Lost"), true);
  assert.equal(
    canCreateReportType({ roles: ["student", "admin"], preferredWorkspace: "student" }, "Found"),
    true
  );
  assert.equal(
    canCloseLostReport(
      { user_id: 4, category: "Lost", lifecycle_status: "active" },
      4
    ),
    true
  );
  assert.equal(
    canCloseLostReport(
      { user_id: 5, category: "Lost", lifecycle_status: "active" },
      4
    ),
    false
  );
});

test("a dual-role account authorizes only through its active workspace", () => {
  const dualRoleStudent = {
    roles: ["student", "admin"],
    preferredWorkspace: "student",
  };
  assert.equal(hasRole(dualRoleStudent, "student"), true);
  assert.equal(hasRole(dualRoleStudent, "admin"), false);
  dualRoleStudent.preferredWorkspace = "admin";
  assert.equal(hasRole(dualRoleStudent, "student"), false);
  assert.equal(hasRole(dualRoleStudent, "admin"), true);
});
