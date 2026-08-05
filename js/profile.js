(function () {
  function escapeProfileText(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function initials(name) {
    const parts = String(name || "User").trim().split(/\s+/).filter(Boolean);
    return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2)).toUpperCase();
  }

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  }

  function renderSubmissions(reports) {
    const container = document.getElementById("submissionsContainer");
    if (!container) return;
    if (!reports.length) {
      container.innerHTML = `
        <div class="empty-state-card">
          <i class="fas fa-box-open" aria-hidden="true"></i>
          <div><strong>No reports yet</strong><p>Your Lost Reports will appear here.</p></div>
          <button type="button" class="primary-btn" onclick="navigate('report')">Report a lost item</button>
        </div>`;
      return;
    }
    container.innerHTML = reports.map((report) => `
      <article class="submission-card">
        <div>
          <div class="submission-title">${escapeProfileText(report.itemName || "Unnamed item")}</div>
          <div class="submission-meta">${escapeProfileText(report.location || "Unknown location")}</div>
        </div>
        <span class="status-badge ${(report.claimStatus || "pending").toLowerCase() === "claimed" ? "status-claimed" : "status-pending"}">
          ${escapeProfileText(report.status || "Pending")}
        </span>
      </article>`).join("");
  }

  async function initProfile() {
    const loading = document.getElementById("profileLoadingMessage");
    const error = document.getElementById("profileErrorMessage");
    if (loading) loading.hidden = false;
    if (error) error.hidden = true;

    try {
      const [meResponse, reportsResponse, claimsResponse] = await Promise.all([
        apiFetch(`${BASE_URL}/auth/me`),
        apiFetch(`${BASE_URL}/reports`),
        apiFetch(`${BASE_URL}/claims`),
      ]);
      if (!meResponse.ok || !reportsResponse.ok || !claimsResponse.ok) {
        throw new Error("Profile information is temporarily unavailable.");
      }
      const [{ user }, reports, claims] = await Promise.all([
        meResponse.json(), reportsResponse.json(), claimsResponse.json(),
      ]);
      const studentReports = (reports || []).filter((report) => report.category === "Lost");
      const recovered = studentReports.filter((report) =>
        report.lifecycleStatus === "returned" || (report.claimStatus || "").toLowerCase() === "claimed"
      );
      setText("profileName", user.name || "Campus user");
      setText("profileEmail", user.email || "—");
      setText("profileWorkspace", `${(user.preferredWorkspace || user.role || "student").replace(/^./, c => c.toUpperCase())} workspace`);
      setText("profileJoined", user.createdAt || user.created_at
        ? new Date(user.createdAt || user.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
        : "—");
      setText("profileInitials", initials(user.name));
      setText("statLost", String(studentReports.length));
      setText("statClaims", String((claims || []).length));
      setText("statRecovered", String(recovered.length));
      renderSubmissions(studentReports);
    } catch (profileError) {
      console.error("Profile load failed:", profileError);
      if (error) {
        error.textContent = profileError.message || "Profile information could not be loaded. Please try again.";
        error.hidden = false;
      }
    } finally {
      if (loading) loading.hidden = true;
    }
  }

  window.initProfile = initProfile;
})();
