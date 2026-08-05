const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Student Dashboard first load settles reports and claims independently", () => {
  const source = read("js/dashboard.js");
  assert.match(source, /Promise\.allSettled\(\[\s*apiFetchWithTimeout\(`\$\{BASE_URL\}\/reports\/discover`\)/);
  assert.match(source, /discoveryResult\.status !== "fulfilled"/);
  assert.match(source, /claimsResult\.status === "fulfilled"/);
  assert.match(source, /allReports = fresh;[\s\S]*renderCards\(\)/);
  assert.doesNotMatch(source, /JSON\.stringify\(fresh\) !== JSON\.stringify\(allReports\)/);
});

test("Admin Dashboard first load settles reports and claims independently", () => {
  const source = read("js/admin-dashboard.js");
  assert.match(source, /Promise\.allSettled\(\[[\s\S]*apiFetchWithTimeout\(BASE_URL \+ '\/reports'\)/);
  assert.match(source, /reportsResult\.status !== 'fulfilled'/);
  assert.match(source, /claimsResult\.status === 'fulfilled'/);
  assert.match(source, /renderAdminCards\(\)/);
});

test("Dashboard loading paths terminate in success, cached warning, or retryable error", () => {
  const student = read("js/dashboard.js");
  const admin = read("js/admin-dashboard.js");
  assert.match(student, /retryDashboardLoad/);
  assert.match(student, /Could not refresh Found items\. Showing saved data/);
  assert.match(admin, /retryAdminDashboardLoad/);
  assert.match(admin, /Could not refresh Admin reports\. Showing saved data/);
});

test("session restoration and Dashboard fetches have a bounded request lifetime", () => {
  const common = read("js/common.js");
  const router = read("js/router.js");
  assert.match(common, /apiFetchWithTimeout\(`\$\{BASE_URL\}\/auth\/me`\)/);
  assert.match(common, /timeoutMs = 10000/);
  assert.match(common, /controller\.abort\(\)/);
  assert.match(common, /clearTimeout\(timeoutId\)/);
  assert.match(router, /if \(window\.authReady\) await window\.authReady/);
});

test("Student and Admin initialization coalesce accidental concurrent Dashboard loads", () => {
  const student = read("js/dashboard.js");
  const admin = read("js/admin-dashboard.js");
  assert.match(student, /if \(dashboardLoadPromise\) return dashboardLoadPromise/);
  assert.match(student, /dashboardLoadPromise = performDashboardLoad\(\)\.finally/);
  assert.match(admin, /if \(_adLoadPromise\) return _adLoadPromise/);
  assert.match(admin, /_adLoadPromise = performAdminLoad\(\)\.finally/);
});

test("corrected Lost matching and Found submission behavior remain frozen", () => {
  const controller = read("backend/controllers/reportController.js");
  const reportUi = read("js/report.js");
  assert.match(controller, /newReport\.category === "Lost"/);
  assert.match(controller, /category = 'Found'[\s\S]*lifecycle_status = 'active'/);
  assert.match(reportUi, /body\.report\?\.category === "Lost"[\s\S]*showMatchResults/);
  assert.match(reportUi, /Found Report submitted[\s\S]*navigate\("dashboard"\)/);
});

test("active HTTP entry documents declare an existing local favicon", () => {
  const login = read("login.html");
  const dashboard = read("dashboard.html");
  const iconPath = path.join(root, "assets/profile.png");
  assert.equal(fs.existsSync(iconPath), true);
  assert.match(login, /rel="icon"[^>]+href="assets\/profile\.png"/);
  assert.match(dashboard, /rel="icon"[^>]+href="assets\/profile\.png"/);
});
