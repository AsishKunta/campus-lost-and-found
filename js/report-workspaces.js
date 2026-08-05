(function () {
  var studentReports = [];
  var adminReports = [];

  function escapeHtml(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  function imageUrl(report) {
    if (!report.imageUrl) return "";
    return report.imageUrl.startsWith("http") ? report.imageUrl : BASE_URL + report.imageUrl;
  }

  function reportCard(report, canClose) {
    var image = imageUrl(report);
    var article = document.createElement("article");
    article.className = "workflow-record-card";
    article.innerHTML = `
      <div class="workflow-record-image">
        ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(report.itemName)}" loading="lazy">`
          : `<i class="fas fa-image" aria-hidden="true"></i><span>No photo</span>`}
      </div>
      <div class="workflow-record-content">
        <div class="workflow-record-heading">
          <h3>${escapeHtml(report.itemName || "Unnamed item")}</h3>
          <span class="workflow-pill">${escapeHtml(report.workflowStatus || "Submitted")}</span>
        </div>
        <p>${escapeHtml(report.description || "No description provided.")}</p>
        <div class="workflow-meta">
          <span><i class="fas fa-location-dot"></i>${escapeHtml(report.location || "Not provided")}</span>
          <span><i class="fas fa-calendar"></i>${escapeHtml(String(report.createdAt || report.dateFound || "").slice(0, 10))}</span>
        </div>
        <div class="workflow-actions">
          <button type="button" class="back-btn view-details">View Details</button>
          ${canClose && report.lifecycleStatus === "active"
            ? `<button type="button" class="close-report-btn">Close Lost Report</button>` : ""}
        </div>
      </div>`;
    article.querySelector(".view-details").addEventListener("click", function () {
      showReportDetails(report);
    });
    article.querySelector(".close-report-btn")?.addEventListener("click", async function () {
      await closeOwnedReport(report.id);
    });
    return article;
  }

  function showReportDetails(report) {
    var image = imageUrl(report);
    var images = (Array.isArray(report.imageUrls) && report.imageUrls.length ? report.imageUrls : [report.imageUrl]).filter(Boolean);
    var body = document.getElementById("detailBody");
    var modal = document.getElementById("detailModal");
    if (!body || !modal) return;
    body.innerHTML = `<h2>Lost Report Details</h2>
      ${images.length ? `<div class="detail-photo-grid">${images.map(function (url, index) {
        var src = String(url).startsWith("http") ? url : BASE_URL + url;
        return `<img src="${escapeHtml(src)}" alt="Item photo ${index + 1}">`;
      }).join("")}</div>` : ""}
      <div class="detail-row"><strong>Item:</strong>&nbsp;${escapeHtml(report.itemName)}</div>
      <div class="detail-row"><strong>Description:</strong>&nbsp;${escapeHtml(report.description || "Not provided")}</div>
      <div class="detail-row"><strong>Location:</strong>&nbsp;${escapeHtml(report.location || "Not provided")}</div>
      <div class="detail-row"><strong>Date submitted:</strong>&nbsp;${escapeHtml(String(report.createdAt || "").slice(0, 10))}</div>
      <div class="detail-row"><strong>Status:</strong>&nbsp;${escapeHtml(report.workflowStatus || "Submitted")}</div>
      <div class="modal-actions"><button class="print-btn" onclick="window.print()">Print Report</button>
      <button class="back-btn" onclick="document.getElementById('detailModal').classList.remove('show')">Back</button></div>`;
    modal.classList.add("show");
  }

  function renderReports(containerId, reports, canClose) {
    var container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = "";
    if (!reports.length) {
      container.innerHTML = `<div class="rc-empty"><i class="fas fa-box-open"></i><p>No Lost Reports found.</p></div>`;
      return;
    }
    reports.forEach(function (report) { container.appendChild(reportCard(report, canClose)); });
  }

  async function closeOwnedReport(reportId) {
    var confirmed = await showConfirmationDialog({
      title: "Close Lost Report?",
      message: "Closing this report cancels all pending claims and stops future matching.",
      cancelLabel: "Keep Report Open", confirmLabel: "Close Report",
    });
    if (!confirmed) return;
    var foundItem = window.confirm("Select OK if you found the item yourself, or Cancel if you are no longer searching.");
    var response = await apiFetch(`${BASE_URL}/reports/${reportId}/close`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: foundItem ? "found_item" : "no_longer_searching" }),
    });
    var body = await response.json().catch(function () { return {}; });
    if (!response.ok) return showErrorToast(body.error || "Report could not be closed.");
    showSuccessToast("Lost Report closed.");
    await initMyReports();
  }

  async function initMyReports() {
    var container = document.getElementById("myReportsList");
    if (container) container.innerHTML = `<div class="loading-state">Loading your Lost Reports…</div>`;
    try {
      var response = await apiFetch(BASE_URL + "/reports/mine");
      if (!response.ok) throw new Error("Your reports could not be loaded.");
      studentReports = await response.json();
      renderReports("myReportsList", studentReports, true);
    } catch (error) {
      if (container) container.innerHTML = `<div class="inline-error">${escapeHtml(error.message)}</div>`;
    }
  }

  function filterAdminReports() {
    var query = (document.getElementById("studentLostSearch")?.value || "").toLowerCase();
    var status = document.getElementById("studentLostStatus")?.value || "";
    var filtered = adminReports.filter(function (report) {
      return (!query || [report.itemName, report.description, report.location].some(function (value) {
        return String(value || "").toLowerCase().includes(query);
      })) && (!status || report.workflowStatus === status);
    });
    renderReports("studentLostReportsList", filtered, false);
  }

  async function initStudentLostReports() {
    var container = document.getElementById("studentLostReportsList");
    if (container) container.innerHTML = `<div class="loading-state">Loading Student Lost Reports…</div>`;
    try {
      var response = await apiFetch(BASE_URL + "/reports/student-lost");
      if (!response.ok) throw new Error("Student Lost Reports could not be loaded.");
      adminReports = await response.json();
      filterAdminReports();
    } catch (error) {
      if (container) container.innerHTML = `<div class="inline-error">${escapeHtml(error.message)}</div>`;
    }
  }

  function claimLabel(status) {
    return ({pending:"Pending Admin Review",under_review:"Pending Admin Review",action_required:"Action Required",
      approved:"Approved — Ready for Collection",rejected:"Rejected",returned:"Returned",closed:"Closed",
      cancelled:"Cancelled",expired:"Expired",automatically_rejected:"Closed"})[status] || status;
  }

  async function initMyClaims() {
    var container = document.getElementById("myClaimsList");
    if (!container) return;
    container.innerHTML = `<div class="loading-state">Loading your claims…</div>`;
    try {
      var response = await apiFetch(BASE_URL + "/claims");
      if (!response.ok) throw new Error("Your claims could not be loaded.");
      var claims = await response.json();
      container.innerHTML = "";
      if (!claims.length) {
        container.innerHTML = `<div class="rc-empty"><i class="fas fa-shield-halved"></i><p>You have not claimed an item yet.</p></div>`;
        return;
      }
      claims.forEach(function (claim) {
        var card = document.createElement("article");
        card.className = "workflow-record-card workflow-claim-card";
        var timeline = Array.isArray(claim.timeline) ? claim.timeline : [];
        card.innerHTML = `<div class="workflow-record-content">
          <div class="workflow-record-heading"><h3>${escapeHtml(claim.found_item_name || claim.item_name || "Claim")}</h3>
          <span class="workflow-pill">${escapeHtml(claimLabel(claim.status))}</span></div>
          ${claim.rejection_reason ? `<p class="inline-error">${escapeHtml(claim.rejection_reason)}</p>` : ""}
          ${claim.verification_request ? `<p><strong>Additional proof requested:</strong> ${escapeHtml(claim.verification_request)}</p>` : ""}
          <p><strong>Ownership verification:</strong> ${escapeHtml(claim.ownership_verification || "Not provided")}</p>
          <ol class="claim-timeline">${timeline.map(function (event) {
            return `<li><strong>${escapeHtml(String(event.eventType || "Status updated").replace(/_/g, " "))}</strong>
              <span>${escapeHtml(String(event.createdAt || "").slice(0, 10))}</span></li>`;
          }).join("")}</ol>
          ${claim.status === "action_required" ? `<button type="button" class="claim-btn update-verification">Update Verification</button>` : ""}
        </div>`;
        card.querySelector(".update-verification")?.addEventListener("click", function () { navigate("claim", { claim: claim }); });
        container.appendChild(card);
      });
    } catch (error) {
      container.innerHTML = `<div class="inline-error">${escapeHtml(error.message)}</div>`;
    }
  }

  document.getElementById("studentLostSearch")?.addEventListener("input", filterAdminReports);
  document.getElementById("studentLostStatus")?.addEventListener("change", filterAdminReports);
  window.initMyReports = initMyReports;
  window.initStudentLostReports = initStudentLostReports;
  window.initMyClaims = initMyClaims;
})();
