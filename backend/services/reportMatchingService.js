const STOP_WORDS = new Set([
  "the", "and", "for", "with", "near", "this", "that", "from", "into",
  "lost", "found", "item",
]);

function normalizeReportType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "lost" || normalized === "found" ? normalized : "";
}

function tokenize(value) {
  return String(value || "")
    .toLowerCase()
    .split(/[\s,.\-_/]+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

function wordOverlap(left, right) {
  const rightWords = new Set(tokenize(right));
  return tokenize(left).some((word) => rightWords.has(word));
}

function dateDifferenceInDays(left, right) {
  const leftTime = new Date(left).getTime();
  const rightTime = new Date(right).getTime();
  if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) return Infinity;
  return Math.abs(leftTime - rightTime) / 86400000;
}

function scoreCandidate(submittedReport, candidate) {
  const submittedType = normalizeReportType(submittedReport.category);
  const candidateType = normalizeReportType(candidate.category);

  if (!submittedType || !candidateType || submittedType === candidateType) {
    return null;
  }

  if (String(submittedReport.id) === String(candidate.id)) {
    return null;
  }

  let matchScore = 0;
  const matchEvidence = [];

  if (
    submittedReport.itemCategory &&
    candidate.itemCategory &&
    String(submittedReport.itemCategory).toLowerCase() ===
      String(candidate.itemCategory).toLowerCase()
  ) {
    matchScore += 25;
    matchEvidence.push({
      key: "itemCategory",
      label: "Same item category",
      points: 25,
    });
  }

  if (wordOverlap(candidate.itemName, submittedReport.itemName)) {
    matchScore += 25;
    matchEvidence.push({
      key: "itemName",
      label: "Similar item name",
      points: 25,
    });
  }

  if (wordOverlap(candidate.location, submittedReport.location)) {
    matchScore += 20;
    matchEvidence.push({
      key: "location",
      label: "Similar location",
      points: 20,
    });
  }

  if (wordOverlap(candidate.description, submittedReport.description)) {
    matchScore += 15;
    matchEvidence.push({
      key: "description",
      label: "Similar description",
      points: 15,
    });
  }

  const dayDifference = dateDifferenceInDays(
    candidate.dateFound,
    submittedReport.dateFound
  );
  if (dayDifference === 0) {
    matchScore += 15;
    matchEvidence.push({
      key: "date",
      label: "Same report date",
      points: 15,
      detail: "Reported on the same date",
    });
  } else if (dayDifference <= 3) {
    matchScore += 10;
    matchEvidence.push({
      key: "date",
      label: "Nearby report date",
      points: 10,
      detail: `${Math.ceil(dayDifference)} day${Math.ceil(dayDifference) === 1 ? "" : "s"} apart`,
    });
  }

  if (matchScore < 30) return null;

  return {
    ...candidate,
    matchScore,
    matchEvidence,
  };
}

function findPotentialMatches(submittedReport, reports) {
  return reports
    .map((candidate) => scoreCandidate(submittedReport, candidate))
    .filter(Boolean)
    .sort((left, right) => right.matchScore - left.matchScore);
}

module.exports = {
  dateDifferenceInDays,
  findPotentialMatches,
  normalizeReportType,
  scoreCandidate,
  tokenize,
  wordOverlap,
};
