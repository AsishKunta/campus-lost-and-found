const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.resolve(__dirname, "../../js/admin-claims.js"), "utf8");

test("admin action overlays have one centralized mount and cleanup lifecycle", () => {
  assert.match(source, /function closeAdminActionOverlay/);
  assert.match(source, /querySelectorAll\("\[data-admin-action-overlay\]"\)/);
  assert.match(source, /function mountAdminActionOverlay/);
  assert.match(source, /overlay\.dataset\.adminActionOverlay = "true"/);
});

test("every successful admin action cleans UI then refreshes exactly once", () => {
  assert.match(source, /async function completeAdminAction[\s\S]*closeAdminActionOverlay[\s\S]*closeClaimModal\(\)[\s\S]*await loadClaims\(\)/);
  assert.match(source, /await completeAdminAction\("Verification request sent to the student\."\)/);
  assert.match(source, /await completeAdminAction\(successMessage\)/);
  assert.match(source, /await completeAdminAction\("Claim approved and selected related claims closed\."\)/);
  assert.match(source, /await completeAdminAction\(\);/);
});

test("approval prevents duplicate submission and stale asynchronous dialogs", () => {
  assert.match(source, /const dialogToken = _actionDialogToken/);
  assert.match(source, /if \(dialogToken !== _actionDialogToken\) return/);
  assert.match(source, /approveButton\.disabled = true/);
  assert.match(source, /approveButton\.disabled = false/);
});

test("approval uses the shared centered modal presentation and notes field", () => {
  const css = fs.readFileSync(path.resolve(__dirname, "../../css/modern.css"), "utf8");
  assert.match(css, /\.claim-modal-overlay\s*\{[\s\S]*position:\s*fixed;[\s\S]*inset:\s*0;[\s\S]*place-items:\s*center;/);
  assert.match(css, /\.claim-modal-box\s*\{[\s\S]*width:\s*min\(100%, 560px\);[\s\S]*max-height:/);
  assert.match(source, /Internal Verification Notes/);
  assert.match(source, /querySelector\("#phase3AdminNotes"\)\?\.focus\(\)/);
});
