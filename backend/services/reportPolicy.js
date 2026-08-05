const { hasRole } = require("../middleware/authorize");

function canCreateReportType(user, category) {
  return ["Lost", "Found"].includes(category)
    && (hasRole(user, "student") || hasRole(user, "admin"));
}

function canCloseLostReport(report, userId) {
  return Boolean(
    report &&
    report.user_id === userId &&
    report.category === "Lost" &&
    report.lifecycle_status === "active"
  );
}

module.exports = { canCloseLostReport, canCreateReportType };
