const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { canCreateReportType } = require("../services/reportPolicy");

const root = path.resolve(__dirname, "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("both authenticated workspaces may submit Lost and Found reports", () => {
  for (const role of ["student", "admin"]) {
    for (const type of ["Lost", "Found"]) {
      assert.equal(canCreateReportType({ roles: [role], preferredWorkspace: role }, type), true);
    }
  }
  assert.equal(canCreateReportType({ roles: [], preferredWorkspace: "student" }, "Found"), false);
  assert.equal(canCreateReportType({ roles: ["student"], preferredWorkspace: "student" }, "Invalid"), false);
});

test("New Claim and My Claims are separate student navigation destinations", () => {
  const router = read("js/router.js");
  assert.match(router, /page: 'new-claim'.*label: 'New Claim'/);
  assert.match(router, /page: 'my-claims'.*label: 'My Claims'/);
  assert.match(router, /sectionPage = page === 'new-claim' \? 'claim' : page/);
  assert.match(router, /initClaim\(\{ manual: true \}\)/);
});

test("both claim entry paths reuse the same form and POST endpoint", () => {
  const html = read("dashboard.html");
  const claim = read("js/claim.js");
  assert.equal((html.match(/id="claimForm"/g) || []).length, 1);
  assert.match(claim, /claimContext\?\.manual === true/);
  assert.match(claim, /formData\.append\("manual_entry", "true"\)/);
  assert.match(claim, /apiFetch\(`\$\{BASE_URL\}\/claims`/);
});

test("manual claim migration and controller persist durable item context", () => {
  const migration = read("backend/migrations/006_manual_claim_entry.sql");
  const controller = read("backend/controllers/claimController.js");
  for (const field of ["item_category", "item_date", "manual_entry"]) {
    assert.match(migration, new RegExp(field));
  }
  assert.match(controller, /manualEntry/);
  assert.match(controller, /'created', 'pending'/);
  assert.match(controller, /new_claim_submitted/);
  assert.match(controller, /isValidIsoDate/);
  assert.match(read("js/admin-claims.js"), /Claim Source:<\/strong> Manual Entry/);
});

test("eligible Found reports restore Claim This Item after reclaimable outcomes", () => {
  const dashboard = read("js/dashboard.js");
  assert.match(dashboard, /RECLAIMABLE_CLAIM_STATUSES/);
  assert.match(dashboard, /"cancelled", "expired", "automatically_rejected"/);
  assert.match(dashboard, /const canClaim = report\.lifecycleStatus === "active" && !blockingClaim/);
  assert.match(dashboard, /id="claimThisItemBtn"/);
});
