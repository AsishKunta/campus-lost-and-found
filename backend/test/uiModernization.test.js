const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("shared modern design system is loaded after legacy styles", () => {
  const html = read("dashboard.html");
  assert.match(html, /<link rel="stylesheet" href="css\/modern\.css"/);
  assert.ok(html.indexOf("css/modern.css") > html.indexOf("css/style.css"));
  const css = read("css/modern.css");
  assert.match(css, /--ui-sidebar:/);
  assert.match(css, /--ui-content:/);
  assert.match(css, /@media \(max-width: 390px\)/);
  assert.match(css, /prefers-reduced-motion/);
});

test("dashboard uses real role-specific metrics and contains no fake trends", () => {
  const html = read("dashboard.html");
  const student = read("js/dashboard.js");
  const admin = read("js/admin-dashboard.js");
  assert.doesNotMatch(html, /[+-]\d+ (this week|today)/);
  for (let i = 1; i <= 4; i += 1) assert.match(html, new RegExp(`id="metricValue${i}"`));
  assert.match(student, /allClaims\.filter/);
  assert.match(student, /action_required/);
  assert.match(admin, /Claims Awaiting Review/);
  assert.match(admin, /approved.*returned/);
});

test("compact search filters and sorting preserve dashboard hooks", () => {
  const html = read("dashboard.html");
  const student = read("js/dashboard.js");
  for (const id of ["globalSearch", "categoryFilter", "statusFilter", "sortReports", "filterCount", "activeFilterChips", "reportCards"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(student, /activeSort/);
  assert.match(student, /matchScore/);
  assert.match(student, /data-clear-filter/);
});

test("Admin Claim Requests retains every lifecycle action in the modern queue", () => {
  const html = read("dashboard.html");
  const claims = read("js/admin-claims.js");
  assert.match(html, /id="claimRequestStatus"/);
  for (const action of ["Request Verification", "Approve", "Reject", "Message Student", "Mark Item Returned", "Close Case"]) {
    assert.match(claims, new RegExp(action));
  }
  assert.match(claims, /claim-card--attention/);
  assert.match(claims, /verification_version/);
});
