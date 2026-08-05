const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  fuzzySimilarity,
  parseSearchQuery,
  scoreReport,
  searchReports,
} = require("../services/reportSearchService");

const NOW = new Date("2026-08-03T12:00:00-05:00");
const fixture = [
  {
    id: 1, itemName: "Black Nike backpack", itemCategory: "Bags", category: "Lost",
    location: "Victory Hall", dateFound: "2026-07-25",
    description: "Black backpack with a small Nike logo and laptop charger inside",
    lifecycleStatus: "active", userId: 10,
  },
  {
    id: 2, itemName: "Black backpack", itemCategory: "Bags", category: "Lost",
    location: "Maple Hall", dateFound: "2026-07-25",
    description: "Plain black school bag", lifecycleStatus: "active", userId: 10,
  },
  {
    id: 3, itemName: "Nike running shoes", itemCategory: "Clothing", category: "Found",
    location: "Victory Hall", dateFound: "2026-07-25",
    description: "Black Nike shoes", lifecycleStatus: "active", userId: 20,
  },
  {
    id: 4, itemName: "Laptop charger", itemCategory: "Electronics", category: "Found",
    location: "Willis Library", dateFound: "2026-04-15",
    description: "Dell power adapter", lifecycleStatus: "archived", userId: 20,
  },
  {
    id: 5, itemName: "Orange iPhone", itemCategory: "Electronics", category: "Found",
    location: "Dining Hall", dateFound: "2026-08-01",
    description: "Orange smartphone turned in at the front desk", lifecycleStatus: "active", userId: 20,
  },
  {
    id: 6, itemName: "Blue backpack", itemCategory: "Bags", category: "Found",
    location: "Willis Library", dateFound: "2026-07-05",
    description: "Blue bookbag near the library entrance", lifecycleStatus: "active", userId: 20,
  },
];

test("natural-language parsing extracts type, category, color, brand, and date", () => {
  const parsed = parseSearchQuery("I lost my black Nike backpack near Victory Hall last week", { now: NOW });
  assert.equal(parsed.reportType, "Lost");
  assert.equal(parsed.category, "Bags");
  assert.deepEqual(parsed.colors, ["black"]);
  assert.deepEqual(parsed.brands, ["nike"]);
  assert.equal(parsed.dateRange.label, "last week");
});

test("the genuinely matching backpack ranks above partial and unrelated matches", () => {
  const results = searchReports("black Nike backpack Victory Hall last week", fixture, { now: NOW }).results;
  assert.deepEqual(results.slice(0, 3).map((report) => report.id), [1, 2, 3]);
  assert.ok(results[0].relevanceScore > results[1].relevanceScore);
});

test("phone synonyms rank a relevant iPhone above unrelated electronics", () => {
  const results = searchReports("I lost my orange mobile near the dining hall", fixture, { now: NOW }).results;
  assert.equal(results[0].id, 5);
  assert.ok(results[0].searchEvidence.some((item) => item.key === "color"));
  assert.equal(searchReports("phone", fixture, { now: NOW }).results.some((report) => /headphones/i.test(report.itemName)), false);
});

test("charger synonym and month phrase retrieve an archived historical report", () => {
  const results = searchReports("laptop power adapter library April", fixture, { now: NOW }).results;
  assert.equal(results[0].id, 4);
  assert.equal(results[0].lifecycleStatus, "archived");
  assert.ok(results[0].searchEvidence.some((item) => item.key === "date"));
});

test("reasonable typos remain discoverable without broad fuzzy matching", () => {
  assert.ok(fuzzySimilarity("bakpack", "backpack") >= 0.75);
  assert.ok(fuzzySimilarity("libary", "library") >= 0.75);
  assert.equal(fuzzySimilarity("bag", "hat"), 0);
  const results = searchReports("bakpack libary", fixture, { now: NOW }).results;
  assert.equal(results[0].id, 6);
});

test("all required relative date phrases are recognized", () => {
  const phrases = [
    "today", "yesterday", "this week", "last week", "this month", "last month",
    "this year", "last year", "past 7 days", "past 30 days", "past 3 months",
  ];
  for (const phrase of phrases) {
    assert.equal(parseSearchQuery(`backpack ${phrase}`, { now: NOW }).dateRange.label, phrase);
  }
});

test("month names select the latest non-future occurrence unless a year is supplied", () => {
  assert.equal(parseSearchQuery("charger April", { now: NOW }).dateRange.label, "april 2026");
  assert.equal(parseSearchQuery("charger December", { now: NOW }).dateRange.label, "december 2025");
  assert.equal(parseSearchQuery("charger April 2024", { now: NOW }).dateRange.label, "april 2024");
});

test("explicit date phrases constrain results while no date searches all retained history", () => {
  assert.equal(searchReports("charger last week", fixture, { now: NOW }).results.some((report) => report.id === 4), false);
  assert.equal(searchReports("charger", fixture, { now: NOW }).results.some((report) => report.id === 4), true);
});

test("scores remain honest for weak partial matches", () => {
  const result = scoreReport(parseSearchQuery("black backpack Victory Hall", { now: NOW }), fixture[2]);
  assert.ok(result);
  assert.ok(result.relevanceScore < 60);
  assert.equal(result.relevanceLabel, "Weak Match");
});

test("empty searches preserve default behavior instead of returning a global ranking", () => {
  assert.deepEqual(searchReports("   ", fixture, { now: NOW }).results, []);
});

test("search evidence explains the contributing fields", () => {
  const result = searchReports("black Nike backpack Victory Hall last week", fixture, { now: NOW }).results[0];
  const keys = result.searchEvidence.map((item) => item.key);
  for (const key of ["itemName", "location", "category", "color", "brand", "date"]) assert.ok(keys.includes(key));
});

test("search endpoint is authenticated and candidate SQL enforces role-aware scope", () => {
  const routes = fs.readFileSync(path.join(__dirname, "../routes/reportRoutes.js"), "utf8");
  const controller = fs.readFileSync(path.join(__dirname, "../controllers/reportController.js"), "utf8");
  assert.match(routes, /router\.use\(authenticate\)[\s\S]*router\.get\("\/search", searchReports\)/);
  assert.match(controller, /r\.category = 'Found' AND r\.lifecycle_status = 'active'/);
  assert.match(controller, /OR \(r\.user_id = \$1\)/);
  assert.match(controller, /isAdmin[\s\S]*FROM reports r ORDER BY r\.created_at DESC LIMIT 5000/);
  assert.match(controller, /name: "", email: "", phone: "", userId: null/);
});

test("frontend sends the natural-language query to the shared backend endpoint", () => {
  const student = fs.readFileSync(path.join(__dirname, "../../js/dashboard.js"), "utf8");
  const admin = fs.readFileSync(path.join(__dirname, "../../js/admin-dashboard.js"), "utf8");
  assert.match(student, /\/reports\/search\?q=/);
  assert.match(admin, /\/reports\/search\?q=/);
  assert.match(student, /AbortController/);
  assert.match(admin, /AbortController/);
});

test("ranking remains bounded on a practical 5,000-report candidate set", () => {
  const reports = Array.from({ length: 5000 }, (_, index) => ({
    ...fixture[index % fixture.length], id: index + 100,
  }));
  const started = process.hrtime.bigint();
  const results = searchReports("black backpack library last month", reports, { now: NOW }).results;
  const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
  assert.ok(Array.isArray(results));
  assert.ok(durationMs < 2000, `ranking took ${durationMs.toFixed(1)}ms`);
});
