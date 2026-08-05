const test = require("node:test");
const assert = require("node:assert/strict");

const {
  findPotentialMatches,
  scoreCandidate,
} = require("../services/reportMatchingService");

const lostReport = {
  id: 101,
  itemName: "Black Sony headphones",
  category: "Lost",
  itemCategory: "Electronics",
  location: "Willis Library second floor",
  dateFound: "2026-07-20",
  description: "Black headphones with red tape on the left earcup",
};

test("matches a lost report only with a complementary found report", () => {
  const foundReport = {
    id: 202,
    itemName: "Sony wireless headphones",
    category: "Found",
    itemCategory: "Electronics",
    location: "Willis Library front desk",
    dateFound: "2026-07-21",
    description: "Black headset with red tape near the left side",
  };

  const result = scoreCandidate(lostReport, foundReport);

  assert.ok(result);
  assert.equal(result.id, 202);
  assert.equal(result.matchScore, 95);
  assert.deepEqual(
    result.matchEvidence.map((evidence) => evidence.key),
    ["itemCategory", "itemName", "location", "description", "date"]
  );
});

test("does not match two reports of the same type", () => {
  const anotherLostReport = {
    ...lostReport,
    id: 303,
  };

  assert.equal(scoreCandidate(lostReport, anotherLostReport), null);
});

test("does not match a report with itself", () => {
  const foundSubmission = { ...lostReport, category: "Found" };
  assert.equal(scoreCandidate(lostReport, foundSubmission), null);
});

test("sorts qualifying candidates by Match Score", () => {
  const matches = findPotentialMatches(lostReport, [
    {
      id: 201,
      itemName: "Sony headphones",
      category: "Found",
      itemCategory: "Accessories",
      location: "Music building",
      dateFound: "2026-07-20",
      description: "Headphones",
    },
    {
      id: 202,
      itemName: "Sony headphones",
      category: "Found",
      itemCategory: "Electronics",
      location: "Willis Library",
      dateFound: "2026-07-20",
      description: "Black headphones with red tape",
    },
  ]);

  assert.deepEqual(matches.map((match) => match.id), [202, 201]);
  assert.ok(matches[0].matchScore > matches[1].matchScore);
});

test("rejects weak candidates below the minimum score", () => {
  const weakCandidate = {
    id: 204,
    itemName: "Water bottle",
    category: "Found",
    location: "Gym",
    dateFound: "2026-06-01",
    description: "Blue metal bottle",
  };

  assert.equal(scoreCandidate(lostReport, weakCandidate), null);
});
