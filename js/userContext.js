// =============================================================
//  userContext.js — single source of truth for user identity
//
//  Load this BEFORE common.js and any page-specific scripts.
//  Provides the global getCurrentUser() function.
//  Role is persisted in localStorage under the key "role".
//  Default role is "student".
// =============================================================

/**
 * Returns the current user object based on localStorage "role".
 *
 * @returns {{ role: string, email: string, id: string }}
 */
function getCurrentUser() {
  let storedUser = null;
  try {
    storedUser = JSON.parse(localStorage.getItem("currentUser"));
  } catch (_) {}
  const roles = Array.isArray(storedUser?.roles) ? storedUser.roles : [storedUser?.role || "student"];
  const requestedRole = localStorage.getItem("role") || storedUser?.preferredWorkspace || storedUser?.role;
  const role = roles.includes(requestedRole) ? requestedRole : roles[0];

  // For student, prefer a real logged-in email when available
  let email = "student@test.com";
  try {
    if (storedUser?.email) email = storedUser.email.toLowerCase();
  } catch (_) {}

  if (email === "student@test.com") {
    const session = localStorage.getItem("sessionEmail");
    if (session) email = session.toLowerCase();
  }

  return {
    role,
    roles,
    preferredWorkspace: storedUser?.preferredWorkspace || role,
    email: email,
    name: storedUser?.name || storedUser?.displayName || "",
    displayName: storedUser?.displayName || storedUser?.name || "",
    id:    storedUser?.id || email,
  };
}
