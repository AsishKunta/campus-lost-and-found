const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("legacy Admin and Profile entry points redirect into the shared workspace shell", () => {
  assert.match(read("admin-dashboard.html"), /dashboard\.html#dashboard/);
  assert.match(read("admin-claims.html"), /dashboard\.html#claim-requests/);
  assert.match(read("admin-messages.html"), /dashboard\.html#conversations/);
  assert.match(read("profile.html"), /dashboard\.html#profile/);
  assert.match(read("profile-detail.html"), /dashboard\.html#profile/);
});

test("claim submission preserves both sides of the matched report relationship", () => {
  const reportScript = read("js/report.js");
  const claimScript = read("js/claim.js");
  assert.match(reportScript, /foundReportId:\s*match\.id/);
  assert.match(reportScript, /lostReportId:\s*submittedReport\.id/);
  assert.match(claimScript, /formData\.append\("report_id"/);
  assert.match(claimScript, /formData\.append\("lost_report_id"/);
});

test("workspace switching refreshes the shared shell instead of opening legacy pages", () => {
  const common = read("js/common.js");
  assert.match(common, /refreshWorkspace\(newRole\)/);
  assert.doesNotMatch(common, /newRole === "admin" \? "admin-dashboard\.html"/);
});
