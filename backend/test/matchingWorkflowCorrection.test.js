const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

process.env.DATABASE_URL ||= "postgresql:///matching_workflow_test_unused";

const {
  isEligibleFoundReport,
  persistMatchesAndNotify,
} = require("../services/matchingWorkflowService");

const lostReport = {
  id: 101,
  userId: 7,
  itemName: "Black Sony headphones",
  category: "Lost",
  itemCategory: "Electronics",
  location: "Willis Library second floor",
  dateFound: "2026-07-21",
  description: "Black headphones with red tape",
};

const matchingFoundReport = {
  id: 202,
  itemName: "Sony wireless headphones",
  category: "Found",
  itemCategory: "Electronics",
  location: "Willis Library front desk",
  dateFound: "2026-07-20",
  description: "Black headphones with red tape",
  lifecycleStatus: "active",
};

function recordingClient() {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql: String(sql), params });
      if (String(sql).includes("INSERT INTO report_matches")) return { rows: [{ id: 301 }] };
      if (String(sql).includes("INSERT INTO notifications")) return { rows: [{ id: 401 }] };
      return { rows: [] };
    },
  };
}

test("Found Report submission never initiates or persists immediate matches", async () => {
  const client = recordingClient();
  const matches = await persistMatchesAndNotify(client, matchingFoundReport, [lostReport]);
  assert.deepEqual(matches, []);
  assert.equal(client.calls.length, 0);
});

test("Lost Report matches and persists an eligible existing Found Report", async () => {
  const client = recordingClient();
  const matches = await persistMatchesAndNotify(client, lostReport, [matchingFoundReport]);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, matchingFoundReport.id);
  const insert = client.calls.find((call) => call.sql.includes("INSERT INTO report_matches"));
  assert.deepEqual(insert.params.slice(0, 2), [lostReport.id, matchingFoundReport.id]);
  assert.ok(client.calls.some((call) => call.sql.includes("INSERT INTO notifications")));
});

test("Lost Report with no eligible Found Reports succeeds with zero matches", async () => {
  const client = recordingClient();
  assert.deepEqual(await persistMatchesAndNotify(client, lostReport, []), []);
  assert.equal(client.calls.length, 0);
});

test("only active Found Reports are eligible candidates", () => {
  assert.equal(isEligibleFoundReport(matchingFoundReport), true);
  for (const lifecycleStatus of ["returned", "closed_by_student", "archived"]) {
    assert.equal(isEligibleFoundReport({ ...matchingFoundReport, lifecycleStatus }), false);
  }
  assert.equal(isEligibleFoundReport({ ...matchingFoundReport, category: "Lost" }), false);
});

test("closed Found and same-type Lost candidates are excluded before scoring", async () => {
  const client = recordingClient();
  const matches = await persistMatchesAndNotify(client, lostReport, [
    { ...matchingFoundReport, id: 203, lifecycleStatus: "returned" },
    { ...lostReport, id: 102, userId: 8 },
  ]);
  assert.deepEqual(matches, []);
  assert.equal(client.calls.length, 0);
});

test("controller queries canonical active Found candidates only for new Lost Reports", () => {
  const controller = fs.readFileSync(path.join(__dirname, "../controllers/reportController.js"), "utf8");
  assert.match(controller, /if \(newReport\.category === "Lost"\)/);
  assert.match(controller, /category = 'Found'[\s\S]*lifecycle_status = 'active'/);
  assert.doesNotMatch(controller, /LOWER\(category\) <> LOWER\(\$2\)/);
});

test("frontend shows Potential Matches only for Lost and returns Found to Dashboard", () => {
  const frontend = fs.readFileSync(path.join(__dirname, "../../js/report.js"), "utf8");
  assert.match(frontend, /body\.report\?\.category === "Lost"[\s\S]*showMatchResults/);
  assert.match(frontend, /Found Report submitted[\s\S]*navigate\("dashboard"\)/);
});

test("existing deterministic scoring weights and claim lifecycle remain unchanged", () => {
  const matching = fs.readFileSync(path.join(__dirname, "../services/reportMatchingService.js"), "utf8");
  const lifecycle = fs.readFileSync(path.join(__dirname, "../services/claimLifecycleService.js"), "utf8");
  for (const points of [25, 20, 15, 10, 30]) assert.match(matching, new RegExp(String(points)));
  for (const state of ["pending", "under_review", "action_required", "approved", "returned", "closed"]) {
    assert.match(lifecycle, new RegExp(state));
  }
});
