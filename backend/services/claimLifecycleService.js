const TRANSITIONS = Object.freeze({
  pending: new Set(["under_review", "action_required", "approved", "rejected", "cancelled", "expired"]),
  under_review: new Set(["action_required", "approved", "rejected"]),
  action_required: new Set(["pending"]),
  approved: new Set(["returned"]),
  returned: new Set(["closed"]),
  rejected: new Set(),
  automatically_rejected: new Set(),
  cancelled: new Set(),
  expired: new Set(),
  closed: new Set(),
});

const STUDENT_LABELS = Object.freeze({
  pending: "Pending Admin Review",
  under_review: "Pending Admin Review",
  action_required: "Action Required — Waiting for Your Response",
  approved: "Approved — Ready for Collection",
  rejected: "Rejected — Case Closed",
  automatically_rejected: "Closed — Item Returned to Another Claimant",
  cancelled: "Cancelled",
  expired: "Closed — Claim Expired",
  returned: "Returned — Awaiting Case Closure",
  closed: "Returned · Closed",
});

const ADMIN_LABELS = Object.freeze({
  pending: "Awaiting Review",
  under_review: "Ready for Decision",
  action_required: "Waiting for Student Response",
  approved: "Approved — Awaiting Return",
  rejected: "Rejected",
  automatically_rejected: "Closed Automatically",
  cancelled: "Cancelled",
  expired: "Expired",
  returned: "Returned — Ready to Close",
  closed: "Closed · Archived",
});

function canTransition(from, to) {
  return Boolean(TRANSITIONS[String(from || "").toLowerCase()]?.has(String(to || "").toLowerCase()));
}

function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    const error = new Error(`Claim cannot transition from ${from} to ${to}.`);
    error.code = "INVALID_CLAIM_TRANSITION";
    error.status = 409;
    throw error;
  }
}

function statusLabel(status, workspace) {
  const labels = workspace === "admin" ? ADMIN_LABELS : STUDENT_LABELS;
  return labels[status] || String(status || "Unknown");
}

module.exports = { ADMIN_LABELS, STUDENT_LABELS, TRANSITIONS, assertTransition, canTransition, statusLabel };
