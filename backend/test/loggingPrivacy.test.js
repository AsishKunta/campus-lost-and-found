const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { safeErrorMetadata, logError } = require("../utils/safeLogger");

function source(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
}

test("safe error metadata excludes messages, details, stacks, and query parameters", () => {
  const sensitive = new Error("duplicate email private@student.com");
  sensitive.code = "23505";
  sensitive.constraint = "users_email_key";
  sensitive.detail = "Key (email)=(private@student.com) already exists.";
  sensitive.hint = "password=do-not-log";
  sensitive.query = "INSERT INTO users ...";
  sensitive.parameters = ["private@student.com", "password", "token"];

  assert.deepEqual(safeErrorMetadata(sensitive), {
    name: "Error",
    code: "23505",
    constraint: "users_email_key",
  });
});

test("safe logger emits operation context and metadata without sensitive error content", () => {
  const original = console.error;
  const calls = [];
  console.error = (...args) => calls.push(args);
  try {
    const error = new Error("ownership answer: hidden sticker");
    error.code = "TEST_FAILURE";
    error.detail = "admin note: verified serial number";
    logError("claims.test_failed", error);
  } finally {
    console.error = original;
  }

  const serialized = JSON.stringify(calls);
  assert.match(serialized, /claims\.test_failed/);
  assert.match(serialized, /TEST_FAILURE/);
  assert.doesNotMatch(serialized, /hidden sticker|verified serial number/);
});

test("report runtime logs only safe identifiers and returns a generic database error", () => {
  const reportSource = source("controllers/reportController.js");
  assert.doesNotMatch(reportSource, /console\.log\([^\n]*req\.body/);
  assert.doesNotMatch(reportSource, /Request body:|Insert values:|image_url received:/);
  assert.doesNotMatch(reportSource, /detail:\s*err\.message|stack:\s*err\.stack|hint:\s*err\.hint/);
  assert.match(reportSource, /reports\.creation_requested/);
  assert.match(reportSource, /userId: req\.user\.id/);
  assert.match(reportSource, /res\.status\(500\)\.json\(\{ error: "Failed to create report" \}\)/);
});

test("message runtime logs exclude message bodies and sender email", () => {
  const messageSource = source("controllers/messageController.js");
  assert.doesNotMatch(messageSource, /outgoing payload|saved record/);
  assert.match(messageSource, /messages\.creation_requested/);
  assert.match(messageSource, /senderUserId: req\.user\.id/);

  const loggingCalls = messageSource
    .split("\n")
    .filter((line) => /logInfo|logError/.test(line))
    .join("\n");
  assert.doesNotMatch(loggingCalls, /req\.user\.email|message\s*:/);
});

test("claim error paths do not expose unexpected database error messages", () => {
  const claimSource = source("controllers/claimController.js");
  assert.match(claimSource, /function sendClaimError/);
  assert.match(claimSource, /return res\.status\(500\)\.json\(\{ error: fallbackMessage \}\)/);
  assert.doesNotMatch(claimSource, /status\(error\.status \|\| 500\).*error\.message/);
});
