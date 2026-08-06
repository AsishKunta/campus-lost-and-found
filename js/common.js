// ===========================
// Login / Session Management
// ===========================
function cacheAuthenticatedUser(user) {
  const canonicalUser = {
    ...user,
    email: String(user?.email || "").trim().toLowerCase(),
    displayName: String(user?.name || user?.displayName || "").trim(),
  };
  const workspace = canonicalUser.preferredWorkspace || canonicalUser.role || "student";
  localStorage.setItem("currentUser", JSON.stringify(canonicalUser));
  localStorage.setItem("sessionEmail", canonicalUser.email);
  localStorage.setItem("role", workspace);
  return canonicalUser;
}
window.cacheAuthenticatedUser = cacheAuthenticatedUser;

async function requireLogin() {
  const publicPages = ["login.html", "index.html", "detail.html", "matches.html"];
  const currentPage = window.location.pathname.split("/").pop();

  if (publicPages.includes(currentPage)) return true;

  try {
    const response = await apiFetchWithTimeout(`${BASE_URL}/auth/me`);
    if (!response.ok) throw new Error("Session unavailable");
    const data = await response.json();
    if (data.user?.developmentBypass) throw new Error("Interactive authentication required");
    cacheAuthenticatedUser(data.user);
    return true;
  } catch (_) {
    clearBrowserIdentity();
    window.location.href = "login.html";
    return false;
  }
}

function clearBrowserIdentity() {
  localStorage.removeItem("sessionEmail");
  localStorage.removeItem("currentUser");
  localStorage.removeItem("role");
}

async function logout() {
  try {
    await apiFetch(`${BASE_URL}/auth/logout`, { method: "POST" });
  } catch (_) {
    // Clear local display state even if the server cannot be reached.
  }
  clearBrowserIdentity();
  window.location.href = "login.html";
}

document.addEventListener("DOMContentLoaded", async () => {
  window.authReady = requireLogin();
  await window.authReady;

  // Set role label dynamically
  const roleLabel = document.getElementById("avatarRoleLabel");
  if (roleLabel) {
    const role = localStorage.getItem("role") || "student";
    roleLabel.textContent = role.charAt(0).toUpperCase() + role.slice(1);
  }

  // Wire logout button
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", function (e) {
      e.preventDefault();
      logout();
    });
  }

  // Wire role-switch <select>
  const roleSelect = document.getElementById("roleSwitch");
  if (roleSelect) {
    const currentUser = getCurrentUser();
    [...roleSelect.options].forEach((option) => {
      option.hidden = !currentUser.roles.includes(option.value);
      option.disabled = !currentUser.roles.includes(option.value);
    });
    roleSelect.value = currentUser.role;
    roleSelect.addEventListener("change", async () => {
      const newRole = roleSelect.value;
      roleSelect.disabled = true;
      try {
        const response = await apiFetch(`${BASE_URL}/auth/workspace`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspace: newRole }),
        });
        if (!response.ok) throw new Error("That workspace is not assigned to your account.");
        const data = await response.json();
        cacheAuthenticatedUser(data.user);
        if (typeof window.refreshWorkspace === "function") {
          window.refreshWorkspace(newRole);
        } else {
          window.location.href = "dashboard.html#dashboard";
        }
        showSuccessToast(`${newRole === "admin" ? "Admin" : "Student"} workspace loaded.`);
      } catch (workspaceError) {
        roleSelect.value = getCurrentUser().role;
        showErrorToast(workspaceError.message || "Workspace could not be changed.");
      } finally {
        roleSelect.disabled = false;
      }
    });
  }

  // Profile avatar dropdown (works for both .avatar-wrapper and legacy #profileAvatar)
  const avatar = document.getElementById("profileAvatar");
  const menu = document.querySelector(".profile-menu");

  if (avatar && menu) {
    avatar.addEventListener("click", (e) => {
      e.stopPropagation();
      menu.classList.toggle("active");
    });

    // Close dropdown when clicking outside
    document.addEventListener("click", (e) => {
      if (!menu.contains(e.target)) {
        menu.classList.remove("active");
      }
    });
  }
});


// Keep local frontend/API requests on the same loopback hostname so the
// HTTP-only SameSite session cookie survives navigation and refresh.
const LOCAL_API_HOSTS = ["localhost", "127.0.0.1"];
const API_HOST = LOCAL_API_HOSTS.includes(window.location.hostname)
  ? window.location.hostname
    : null;
const BASE_URL = API_HOST ? `http://${API_HOST}:3001` : "/api";

function apiFetch(url, options = {}) {
  return window.fetch(url, {
    ...options,
    credentials: "include",
  });
}

function apiFetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const upstreamSignal = options.signal;
  const abortFromUpstream = () => controller.abort(upstreamSignal?.reason);
  if (upstreamSignal) {
    if (upstreamSignal.aborted) abortFromUpstream();
    else upstreamSignal.addEventListener("abort", abortFromUpstream, { once: true });
  }
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  return apiFetch(url, { ...options, signal: controller.signal }).finally(() => {
    window.clearTimeout(timeoutId);
    upstreamSignal?.removeEventListener("abort", abortFromUpstream);
  });
}
window.BASE_URL = BASE_URL;
window.apiFetch = apiFetch;
window.apiFetchWithTimeout = apiFetchWithTimeout;

// ===========================
// Role Switching
// ===========================
async function switchRole(targetRole) {
  const response = await apiFetch(`${BASE_URL}/auth/workspace`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspace: targetRole }),
  });
  if (!response.ok) return showErrorToast("Workspace access denied.");
  const data = await response.json();
  cacheAuthenticatedUser(data.user);
  if (typeof window.refreshWorkspace === "function") {
    window.refreshWorkspace(targetRole);
  } else {
    window.location.href = "dashboard.html#dashboard";
  }
}

// Redirect to the correct dashboard based on stored role
(function checkRoleRedirect() {
  const user = typeof getCurrentUser === "function" ? getCurrentUser() : { role: "student", roles: ["student"] };
  const role = user.role;
  const page = window.location.pathname.split("/").pop();
  if (page.startsWith("admin-") && !user.roles.includes("admin")) {
    window.location.replace("dashboard.html");
  }
})();

const toastState = {
  currentToast: null,
  timeoutId: null,
  lastMessage: "",
  lastType: ""
};

function getToastContainer() {
  let container = document.getElementById("toastContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "toastContainer";
    container.className = "toast-container";
    container.setAttribute("aria-live", "polite");
    document.body.appendChild(container);
  }
  return container;
}

function dismissToast(toast) {
  if (!toast || toast.classList.contains("hide")) return;
  toast.classList.add("hide");
  clearTimeout(toastState.timeoutId);
  toast.addEventListener("transitionend", () => {
    if (toast.parentElement) toast.remove();
    if (toastState.currentToast === toast) {
      toastState.currentToast = null;
      toastState.lastMessage = "";
      toastState.lastType = "";
    }
  }, { once: true });
}

function showToast(message, type = "success") {
  if (toastState.currentToast && toastState.lastMessage === message && toastState.lastType === type) {
    return;
  }

  const container = getToastContainer();
  if (toastState.currentToast) {
    dismissToast(toastState.currentToast);
  }

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-message">${message}</span>
    <button type="button" class="toast-close" aria-label="Close">&times;</button>
  `;

  toast.querySelector(".toast-close").addEventListener("click", () => dismissToast(toast));
  container.appendChild(toast);
  toastState.currentToast = toast;
  toastState.lastMessage = message;
  toastState.lastType = type;

  requestAnimationFrame(() => toast.classList.add("visible"));
  toastState.timeoutId = setTimeout(() => dismissToast(toast), 3000);
  return toast;
}

function showSuccessToast(message) {
  showToast(message, "success");
}

function showErrorToast(message) {
  showToast(message, "error");
}

window.Toast = {
  showToast,
  showSuccessToast,
  showErrorToast,
  dismissToast
};

function showConfirmationDialog({
  title,
  message,
  cancelLabel,
  confirmLabel,
}) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "workflow-confirm-overlay";
    overlay.innerHTML = `
      <div class="workflow-confirm" role="alertdialog" aria-modal="true" aria-labelledby="workflowConfirmTitle">
        <h2 id="workflowConfirmTitle">${escapeConfirmationText(title)}</h2>
        <p>${escapeConfirmationText(message)}</p>
        <div>
          <button type="button" data-result="false">${escapeConfirmationText(cancelLabel)}</button>
          <button type="button" class="confirm-danger" data-result="true">${escapeConfirmationText(confirmLabel)}</button>
        </div>
      </div>`;
    const finish = (result) => {
      overlay.remove();
      resolve(result);
    };
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) finish(false);
    });
    overlay.querySelectorAll("[data-result]").forEach((button) => {
      button.addEventListener("click", () => finish(button.dataset.result === "true"));
    });
    document.body.appendChild(overlay);
    overlay.querySelector('[data-result="false"]').focus();
  });
}

function escapeConfirmationText(value) {
  return String(value || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

window.showConfirmationDialog = showConfirmationDialog;

window.apiFetch = apiFetch;
window.requireLogin = requireLogin;
