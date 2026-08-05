const { findPotentialMatches } = require("./reportMatchingService");
const { createNotification } = require("./notificationService");

function isEligible(report) {
  return !["returned", "closed_by_student", "archived"].includes(
    String(report.lifecycleStatus || report.lifecycle_status || "active").toLowerCase()
  );
}

function isEligibleFoundReport(report) {
  return String(report?.category || "").toLowerCase() === "found"
    && String(report.lifecycleStatus || report.lifecycle_status || "active").toLowerCase() === "active";
}

async function persistMatchesAndNotify(client, submittedReport, candidates) {
  if (String(submittedReport?.category || "").toLowerCase() !== "lost") {
    return [];
  }
  const matches = findPotentialMatches(
    submittedReport,
    candidates.filter(isEligibleFoundReport)
  );

  for (const match of matches) {
    const lost = submittedReport;
    const found = match;
    if (!lost.userId && !lost.user_id) continue;

    const matchResult = await client.query(
      `INSERT INTO report_matches (lost_report_id, found_report_id, score, evidence)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (lost_report_id, found_report_id)
       DO UPDATE SET score = EXCLUDED.score, evidence = EXCLUDED.evidence
       RETURNING id`,
      [lost.id, found.id, match.matchScore, JSON.stringify(match.matchEvidence)]
    );
    const matchId = matchResult.rows[0].id;
    await createNotification(client, {
      userId: lost.userId || lost.user_id,
      type: "new_match",
      title: "Potential item match found",
      message: `A Found report may match your Lost report for ${lost.itemName || "your item"}.`,
      reportId: lost.id,
      matchId,
    });
  }
  return matches;
}

module.exports = { isEligible, isEligibleFoundReport, persistMatchesAndNotify };
