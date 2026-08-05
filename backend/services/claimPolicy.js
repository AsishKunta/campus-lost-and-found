const ACTIVE_CLAIM_STATUSES = new Set(["pending", "under_review", "approved"]);
const MAX_ACTIVE_CLAIMS_PER_LOST_REPORT = 3;

function isActiveClaim(status) {
  return ACTIVE_CLAIM_STATUSES.has(String(status || "").toLowerCase());
}

function hasClaimCapacity(claims) {
  return claims.filter((claim) => isActiveClaim(claim.status)).length <
    MAX_ACTIVE_CLAIMS_PER_LOST_REPORT;
}

function canStudentCancel(claim, userId) {
  return Boolean(
    claim &&
    claim.user_id === userId &&
    claim.status === "pending" &&
    !claim.reviewed_at
  );
}

function relatedClaimsForApproval(target, claims) {
  return claims.filter((claim) =>
    claim.id !== target.id &&
    claim.lost_report_id === target.lost_report_id &&
    ["pending", "under_review"].includes(claim.status)
  );
}

function studentClaimView(claim) {
  const { admin_notes, rejection_type, ...safe } = claim;
  return safe;
}

module.exports = {
  MAX_ACTIVE_CLAIMS_PER_LOST_REPORT,
  canStudentCancel,
  hasClaimCapacity,
  isActiveClaim,
  relatedClaimsForApproval,
  studentClaimView,
};
