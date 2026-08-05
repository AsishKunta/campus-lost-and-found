const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  assertTransition,
  canTransition,
  statusLabel,
} = require("../services/claimLifecycleService");

const root = path.resolve(__dirname, "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("claim lifecycle permits the complete review and return path", () => {
  assert.equal(canTransition("pending", "under_review"), true);
  assert.equal(canTransition("under_review", "action_required"), true);
  assert.equal(canTransition("action_required", "pending"), true);
  assert.equal(canTransition("pending", "approved"), true);
  assert.equal(canTransition("approved", "returned"), true);
  assert.equal(canTransition("returned", "closed"), true);
});

test("terminal and out-of-order claim transitions are rejected", () => {
  for (const status of ["rejected", "closed", "cancelled", "expired", "automatically_rejected"]) {
    assert.equal(canTransition(status, "pending"), false);
  }
  assert.equal(canTransition("pending", "returned"), false);
  assert.throws(() => assertTransition("approved", "pending"), (error) =>
    error.code === "INVALID_CLAIM_TRANSITION" && error.status === 409
  );
});

test("student and admin status labels state whose action is required", () => {
  assert.equal(statusLabel("pending", "student"), "Pending Admin Review");
  assert.equal(statusLabel("action_required", "student"), "Action Required — Waiting for Your Response");
  assert.equal(statusLabel("action_required", "admin"), "Waiting for Student Response");
  assert.equal(statusLabel("closed", "admin"), "Closed · Archived");
});

test("Phase 4 migration adds verification, return, archive, and student identity fields", () => {
  const migration = read("backend/migrations/004_transactional_recovery_lifecycle.sql");
  for (const field of ["student_id", "ownership_verification", "verification_request",
    "verification_version", "approved_at", "returned_at", "archived_at"]) {
    assert.match(migration, new RegExp(field));
  }
});

test("smart claim form derives trusted identity and report details", () => {
  const html = read("dashboard.html");
  for (const id of ["studentName", "studentEmail", "studentId", "claim-itemName",
    "claim-location", "claim-date", "claim-foundReportId", "claim-relatedReportId"]) {
    assert.match(html, new RegExp(`id="${id}"[^>]*readonly`));
  }
  assert.match(html, /id="claim-category" disabled/);
});

test("student re-verification updates the existing claim rather than posting a new claim", () => {
  const script = read("js/claim.js");
  assert.match(script, /claims\/\$\{editClaim\.id\}\/verification/);
  assert.match(script, /method:\s*"PATCH"/);
});

test("admin UI exposes verification, decision, return, and close actions", () => {
  const script = read("js/admin-claims.js");
  assert.match(script, /Request Verification/);
  assert.match(script, /Mark Item Returned/);
  assert.match(script, /Close Case/);
  assert.match(script, /Rejection reason/);
});

test("dashboard discovery provides the primary Claim This Item path", () => {
  const script = read("js/dashboard.js");
  assert.match(script, /reports\/discover/);
  assert.match(script, /Claim This Item/);
  assert.match(script, /relatedLostReportId/);
});
