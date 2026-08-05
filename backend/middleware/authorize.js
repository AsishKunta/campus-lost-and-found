function normalizeRoles(user) {
  const roles = Array.isArray(user?.roles) ? user.roles : [user?.role];
  return [...new Set(roles.map((role) => String(role || "").toLowerCase()).filter(Boolean))];
}

function activeWorkspace(user) {
  return String(
    user?.preferredWorkspace || user?.preferred_workspace || user?.role || ""
  ).toLowerCase();
}

function hasRole(user, role) {
  const normalizedRole = String(role).toLowerCase();
  return normalizeRoles(user).includes(normalizedRole) && activeWorkspace(user) === normalizedRole;
}

function requireRole(...allowedRoles) {
  const allowed = allowedRoles.map((role) => String(role).toLowerCase());
  return function authorize(req, res, next) {
    if (!req.user) {
      return res.status(401).json({
        error: "Authentication required.",
        code: "AUTHENTICATION_REQUIRED",
      });
    }
    if (!allowed.some((role) => hasRole(req.user, role))) {
      return res.status(403).json({
        error: "You are not authorized to perform this action.",
        code: "AUTHORIZATION_DENIED",
      });
    }
    return next();
  };
}

module.exports = { activeWorkspace, hasRole, normalizeRoles, requireRole };
