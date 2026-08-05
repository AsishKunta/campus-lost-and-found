const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Student Dashboard uses Found discovery only and ranks personalized matches first", () => {
  const dashboard = read("js/dashboard.js");
  const controller = read("backend/controllers/reportController.js");
  assert.match(dashboard, /reports\/discover/);
  assert.match(dashboard, /filter\(\(report\) => report\.category === "Found"\)/);
  assert.doesNotMatch(dashboard, /ownedReports/);
  assert.match(controller, /matched\.score IS NOT NULL/);
  assert.match(controller, /matched\.score DESC NULLS LAST/);
});

test("shared router exposes dedicated tracking and one unified report workspace", () => {
  const router = read("js/router.js");
  for (const page of ["my-reports", "my-claims", "student-lost-reports"]) {
    assert.match(router, new RegExp(page));
  }
  assert.match(router, /Report Item/);
  assert.match(router, /Student Lost Reports/);
  assert.equal((router.match(/page: 'report'/g) || []).length, 2);
});

test("Lost Report APIs preserve Student ownership and Admin authorization", () => {
  const routes = read("backend/routes/reportRoutes.js");
  const controller = read("backend/controllers/reportController.js");
  assert.match(routes, /\/mine", requireRole\("student"\)/);
  assert.match(routes, /\/student-lost", requireRole\("admin"\)/);
  assert.match(controller, /listLostReports\(req\.user\.id\)/);
  assert.match(controller, /workflowStatus/);
});

test("dashboard claims require a Found Report while manual claims use the shared endpoint", () => {
  const controller = read("backend/controllers/claimController.js");
  const claimUi = read("js/claim.js");
  assert.match(controller, /if \(!manualEntry && !foundReportId\)/);
  assert.match(controller, /if \(!manualEntry && lostReportId\)/);
  assert.match(claimUi, /if \(lostReportId\) formData\.append\("lost_report_id"/);
  assert.match(claimUi, /formData\.append\("manual_entry", "true"\)/);
});

test("Found item entry supports up to five normalized report photos", () => {
  const migration = read("backend/migrations/005_report_workspace_refinement.sql");
  const routes = read("backend/routes/reportRoutes.js");
  const html = read("dashboard.html");
  assert.match(migration, /CREATE TABLE report_images/);
  assert.match(migration, /REFERENCES reports\(id\) ON DELETE CASCADE/);
  assert.match(routes, /upload\.array\("images", 5\)/);
  assert.match(html, /id="itemImage"[^>]*multiple/);
});

test("dedicated tracking modules expose loading, empty, detail, status, and verification states", () => {
  const module = read("js/report-workspaces.js");
  const controller = read("backend/controllers/reportController.js");
  assert.match(module, /Loading your Lost Reports/);
  assert.match(module, /No Lost Reports found/);
  assert.match(module, /View Details/);
  assert.match(controller, /Potential Match Found/);
  assert.match(module, /Update Verification/);
  assert.match(module, /reports\/student-lost/);
});
