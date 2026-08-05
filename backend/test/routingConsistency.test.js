const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("the shared dashboard shell is the canonical routing architecture", () => {
  const architecture = read("ARCHITECTURE.md");
  const router = read("js/router.js");
  assert.match(architecture, /### Primary application[\s\S]*`dashboard\.html`/i);
  assert.match(router, /history\.pushState/);
  assert.match(router, /history\.replaceState/);
  assert.match(router, /page: page, params: params/);
});

test("active navigation uses SPA routes instead of standalone feature pages", () => {
  for (const file of ["js/router.js", "js/dashboard.js", "js/report.js",
    "js/report-workspaces.js", "js/claim.js", "js/admin-dashboard.js"]) {
    const source = read(file);
    assert.doesNotMatch(source, /(?:claim|report|my-claims|student-messages|admin-claims)\.html/);
  }
});

test("legacy feature URLs redirect immediately into canonical hashes", () => {
  const redirects = {
    "claim.html": "#new-claim",
    "report.html": "#report",
    "my-claims.html": "#my-claims",
    "student-messages.html": "#conversations",
    "admin-dashboard.html": "#dashboard",
    "admin-claims.html": "#claim-requests",
    "admin-messages.html": "#conversations",
    "profile.html": "#profile",
    "notifications.html": "#dashboard",
  };
  for (const [file, hash] of Object.entries(redirects)) {
    assert.match(read(file).slice(0, 300), new RegExp(`dashboard\\.html${hash}`));
  }
});

test("messages alias and route parameters survive navigation history", () => {
  const router = read("js/router.js");
  assert.match(router, /messages: 'conversations'/);
  assert.match(router, /navigate\(page, e\.state && e\.state\.params\)/);
  assert.match(router, /history\.state && history\.state\.page === hash/);
});
