const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Student and Admin navigation share one Report Item page", () => {
  const router = read("js/router.js");
  assert.equal((router.match(/page: 'report'/g) || []).length, 2);
  assert.doesNotMatch(router, /label: 'Report Lost Item'/);
  assert.doesNotMatch(router, /label: 'Add Found Item'/);
  assert.match(router, /report:\s*'Report Item'/);
});

test("Report Item form requires an explicit Lost or Found selection", () => {
  const html = read("dashboard.html");
  const script = read("js/report.js");
  assert.match(html, /id="reportFormHeading">Report Item</);
  assert.match(html, /<select id="category" required>/);
  assert.match(html, /value="">Select report type/);
  assert.match(html, /value="Lost">Lost/);
  assert.match(html, /value="Found">Found/);
  assert.match(script, /categorySelect\.value = ""/);
  assert.match(script, /categorySelect\.disabled = false/);
});

test("unified form submits the selected report type through the existing API", () => {
  const script = read("js/report.js");
  assert.match(script, /formData\.append\("category", category/);
  assert.match(script, /apiFetch\(`\$\{BASE_URL\}\/reports`/);
  assert.match(script, /body\.report\?\.category === "Lost"[\s\S]*showMatchResults\(body\.report, body\.matches/);
});

test("backend accepts both report types from authenticated workspaces and preserves matching", () => {
  const policy = read("backend/services/reportPolicy.js");
  const controller = read("backend/controllers/reportController.js");
  assert.match(policy, /\["Lost", "Found"\]\.includes\(category\)/);
  assert.match(policy, /hasRole\(user, "student"\).*hasRole\(user, "admin"\)/s);
  assert.match(controller, /newReport\.category === "Lost"/);
  assert.match(controller, /persistMatchesAndNotify\(client, newReport, foundCandidates\)/);
});
