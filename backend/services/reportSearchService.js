const { dateDifferenceInDays } = require("./reportMatchingService");

const STOP_WORDS = new Set([
  "a", "about", "an", "and", "around", "at", "from", "had", "has", "i",
  "in", "inside", "it", "maybe", "my", "near", "of", "on", "or", "reported",
  "someone", "sometime", "the", "there", "this", "to", "was", "with",
]);

const SYNONYM_GROUPS = {
  phone: ["phone", "smartphone", "cellphone", "cell phone", "mobile", "iphone"],
  laptop: ["laptop", "notebook", "notebook computer", "macbook"],
  backpack: ["backpack", "back pack", "rucksack", "bookbag", "book bag"],
  bag: ["bag", "handbag", "tote", "purse"],
  wallet: ["wallet", "billfold"],
  charger: ["charger", "power adapter", "power supply", "ac adapter"],
  headphones: ["headphones", "headset", "earphones", "earbuds", "airpods"],
  keys: ["key", "keys", "keyring", "keychain"],
  jacket: ["jacket", "coat", "hoodie"],
  bottle: ["bottle", "water bottle", "flask"],
};

const CATEGORY_TERMS = {
  Electronics: ["phone", "laptop", "charger", "headphones", "tablet", "camera", "watch"],
  Bags: ["backpack", "bag", "wallet"],
  Clothing: ["jacket", "shirt", "pants", "shoes", "hat"],
  Documents: ["document", "license", "passport", "card", "id"],
  Keys: ["keys"],
  Accessories: ["glasses", "umbrella", "jewelry"],
};

const COLORS = new Set([
  "black", "white", "gray", "grey", "red", "orange", "yellow", "green",
  "blue", "purple", "pink", "brown", "silver", "gold", "beige", "navy",
]);
const BRANDS = new Set([
  "adidas", "apple", "dell", "hp", "lenovo", "nike", "samsung", "sony",
  "under armour", "north face",
]);

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(left, right) {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1)
      );
    }
    previous = current;
  }
  return previous[right.length];
}

function fuzzySimilarity(left, right) {
  const a = normalizeText(left);
  const b = normalizeText(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const longest = Math.max(a.length, b.length);
  if (longest < 5) return 0;
  const distance = levenshtein(a, b);
  const allowed = longest >= 9 ? 2 : 1;
  return distance <= allowed ? 1 - distance / longest : 0;
}

function canonicalTerm(token) {
  const normalized = normalizeText(token);
  for (const [canonical, variants] of Object.entries(SYNONYM_GROUPS)) {
    if (variants.some((variant) => normalizeText(variant) === normalized)) return canonical;
  }
  return normalized;
}

function containsPhrase(text, phrase) {
  const escaped = normalizeText(phrase).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return Boolean(escaped && new RegExp(`(?:^|\\s)${escaped}(?:$|\\s)`).test(text));
}

function tokens(value) {
  return normalizeText(value).split(" ").filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function expandedTokens(value) {
  const normalized = normalizeText(value);
  const result = tokens(normalized).map(canonicalTerm);
  for (const [canonical, variants] of Object.entries(SYNONYM_GROUPS)) {
    if (variants.some((variant) => containsPhrase(normalized, variant))) result.push(canonical);
  }
  return [...new Set(result)];
}

function tokenMatch(queryToken, candidateToken) {
  const left = canonicalTerm(queryToken);
  const right = canonicalTerm(candidateToken);
  return left === right ? 1 : fuzzySimilarity(left, right);
}

function overlap(queryTokens, value) {
  const candidateTokens = expandedTokens(value);
  if (!queryTokens.length || !candidateTokens.length) return { ratio: 0, matched: [] };
  const matched = queryTokens.filter((queryToken) =>
    candidateTokens.some((candidateToken) => tokenMatch(queryToken, candidateToken) >= 0.75)
  );
  return { ratio: matched.length / queryTokens.length, matched: [...new Set(matched)] };
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function dateRangeForQuery(normalizedQuery, now = new Date()) {
  const today = startOfDay(now);
  const year = today.getFullYear();
  const monthStart = new Date(year, today.getMonth(), 1);
  const ranges = [
    ["past 3 months", addDays(today, -90), today],
    ["past 30 days", addDays(today, -30), today],
    ["past 7 days", addDays(today, -7), today],
    ["last year", new Date(year - 1, 0, 1), new Date(year - 1, 11, 31)],
    ["this year", new Date(year, 0, 1), today],
    ["last month", new Date(year, today.getMonth() - 1, 1), new Date(year, today.getMonth(), 0)],
    ["this month", monthStart, today],
    ["last week", addDays(today, -13), addDays(today, -7)],
    ["this week", addDays(today, -6), today],
    ["yesterday", addDays(today, -1), addDays(today, -1)],
    ["today", today, today],
  ];
  for (const [label, start, end] of ranges) {
    if (normalizedQuery.includes(label)) return { label, start, end };
  }

  const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  const monthIndex = months.findIndex((month) => new RegExp(`\\b${month}\\b`).test(normalizedQuery));
  if (monthIndex >= 0) {
    const explicitYear = normalizedQuery.match(/\b(20\d{2})\b/);
    let selectedYear = explicitYear ? Number(explicitYear[1]) : year;
    if (!explicitYear && monthIndex > today.getMonth()) selectedYear -= 1;
    return {
      label: `${months[monthIndex]} ${selectedYear}`,
      start: new Date(selectedYear, monthIndex, 1),
      end: new Date(selectedYear, monthIndex + 1, 0),
    };
  }
  return null;
}

function parseSearchQuery(query, options = {}) {
  const normalized = normalizeText(query);
  const allTokens = expandedTokens(normalized);
  const reportType = /\b(found|someone found)\b/.test(normalized)
    ? "Found"
    : /\b(lost|missing|misplaced)\b/.test(normalized) ? "Lost" : null;
  const category = Object.entries(CATEGORY_TERMS).find(([, terms]) =>
    terms.some((term) => allTokens.includes(canonicalTerm(term)))
  )?.[0] || null;
  const colors = allTokens.filter((token) => COLORS.has(token === "grey" ? "gray" : token));
  const brands = [...BRANDS].filter((brand) => containsPhrase(normalized, brand));
  const dateRange = dateRangeForQuery(normalized, options.now);
  const ignoredDateTokens = dateRange ? new Set(tokens(dateRange.label)) : new Set();
  const meaningfulTokens = allTokens.filter((token) =>
    !["lost", "found", "missing", "misplaced"].includes(token) && !ignoredDateTokens.has(token) && !/^20\d{2}$/.test(token)
  );
  return { query: String(query || "").trim(), normalized, tokens: meaningfulTokens, reportType, category, colors, brands, dateRange };
}

function reportDate(report) {
  const value = report.dateFound || report.date_found || report.createdAt || report.created_at;
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? startOfDay(date) : null;
}

function inDateRange(report, range) {
  if (!range) return true;
  const date = reportDate(report);
  return Boolean(date && date >= range.start && date <= range.end);
}

function addEvidence(evidence, key, label, points, detail) {
  if (points <= 0) return;
  evidence.push({ key, label, points: Math.round(points), ...(detail ? { detail } : {}) });
}

function scoreReport(parsed, report) {
  if (!parsed.normalized || !inDateRange(report, parsed.dateRange)) return null;
  const evidence = [];
  let rawScore = 0;
  let possibleScore = 0;
  const itemName = report.itemName || report.item_name || "";
  const description = report.description || "";
  const location = report.location || "";
  const category = report.itemCategory || report.item_category || "";

  const nameOverlap = overlap(parsed.tokens, itemName);
  possibleScore += 34;
  const exactName = normalizeText(itemName) && parsed.normalized.includes(normalizeText(itemName));
  const namePoints = exactName ? 34 : 30 * nameOverlap.ratio;
  rawScore += namePoints;
  addEvidence(evidence, "itemName", "Item name", namePoints, nameOverlap.matched.join(", "));

  const descriptionOverlap = overlap(parsed.tokens, description);
  possibleScore += 22;
  const descriptionPoints = 22 * descriptionOverlap.ratio;
  rawScore += descriptionPoints;
  addEvidence(evidence, "description", "Description details", descriptionPoints, descriptionOverlap.matched.join(", "));

  const locationOverlap = overlap(parsed.tokens, location);
  possibleScore += 20;
  const locationPoints = 20 * locationOverlap.ratio;
  rawScore += locationPoints;
  addEvidence(evidence, "location", "Location", locationPoints, locationOverlap.matched.join(", "));

  if (parsed.category) {
    possibleScore += 16;
    const categoryMatch = normalizeText(category) === normalizeText(parsed.category);
    const categoryPoints = categoryMatch ? 16 : 0;
    rawScore += categoryPoints;
    addEvidence(evidence, "category", "Category", categoryPoints, parsed.category);
  }

  if (parsed.colors.length) {
    possibleScore += 8;
    const field = normalizeText(`${itemName} ${description}`);
    const matchedColors = parsed.colors.filter((color) => field.includes(color));
    const points = 8 * matchedColors.length / parsed.colors.length;
    rawScore += points;
    addEvidence(evidence, "color", "Color", points, matchedColors.join(", "));
  }

  if (parsed.brands.length) {
    possibleScore += 8;
    const field = normalizeText(`${itemName} ${description}`);
    const matchedBrands = parsed.brands.filter((brand) => field.includes(brand));
    const points = 8 * matchedBrands.length / parsed.brands.length;
    rawScore += points;
    addEvidence(evidence, "brand", "Brand or identifying phrase", points, matchedBrands.join(", "));
  }

  if (parsed.dateRange) {
    possibleScore += 12;
    rawScore += 12;
    addEvidence(evidence, "date", "Date range", 12, parsed.dateRange.label);
  }

  if (parsed.reportType) {
    possibleScore += 7;
    const type = normalizeText(report.category);
    const points = type === normalizeText(parsed.reportType) ? 7 : 0;
    rawScore += points;
    addEvidence(evidence, "reportType", "Report type", points, parsed.reportType);
  }

  if (normalizeText(report.lifecycleStatus || report.lifecycle_status) === "active") {
    possibleScore += 3;
    rawScore += 3;
    addEvidence(evidence, "lifecycle", "Currently active", 3);
  }

  const relevanceScore = Math.min(100, Math.round((rawScore / Math.max(possibleScore, 1)) * 100));
  const hasSpecificEvidence = evidence.some((item) =>
    ["itemName", "description", "location", "color", "brand"].includes(item.key)
  );
  if (relevanceScore < 18 || !hasSpecificEvidence) return null;
  return { ...report, relevanceScore, relevanceLabel: relevanceLabel(relevanceScore), searchEvidence: evidence.sort((a, b) => b.points - a.points) };
}

function relevanceLabel(score) {
  if (score >= 90) return "Very Strong Match";
  if (score >= 75) return "Strong Match";
  if (score >= 50) return "Possible Match";
  return "Weak Match";
}

function searchReports(query, reports, options = {}) {
  const parsed = parseSearchQuery(query, options);
  if (!parsed.normalized) return { parsed, results: [] };
  const results = reports
    .map((report) => scoreReport(parsed, report))
    .filter(Boolean)
    .sort((left, right) => right.relevanceScore - left.relevanceScore || dateDifferenceInDays(right.dateFound, options.now || new Date()) - dateDifferenceInDays(left.dateFound, options.now || new Date()));
  return { parsed, results };
}

module.exports = {
  SYNONYM_GROUPS,
  dateRangeForQuery,
  fuzzySimilarity,
  levenshtein,
  normalizeText,
  parseSearchQuery,
  relevanceLabel,
  scoreReport,
  searchReports,
};
