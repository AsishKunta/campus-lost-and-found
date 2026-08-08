// Cache fetched reports so filters re-render without re-fetching
let allReports       = [];
let activeCategory   = "";
let activeStatus     = "";
let activeSort       = "relevance";
let _dashInitialized = false;
let allClaims = [];
let smartSearchTimer = null;
let smartSearchRequest = null;
let smartSearchActive = false;
let dashboardLoadPromise = null;

function initDashboard() {
  const heading = document.getElementById("dashboardHeading");
  if (heading) heading.textContent = "Found Items";
  const eyebrow = document.getElementById("dashboardEyebrow");
  const intro = document.getElementById("dashboardIntro");
  if (eyebrow) eyebrow.textContent = "Student workspace";
  if (intro) intro.textContent = "Browse items handed in across campus and start a secure recovery claim.";
  const titles = ["Available Found Items", "My Active Claims", "Action Required", "Ready for Collection"];
  const contexts = ["Ready to explore", "In progress", "Needs your response", "Approved claims"];
  titles.forEach((label, index) => {
    const title = document.getElementById(`metricTitle${index + 1}`);
    const context = document.getElementById(`metricContext${index + 1}`);
    if (title) title.textContent = label;
    if (context) context.textContent = contexts[index];
  });
  wireFilters();
  if (_dashInitialized) {
    loadReports(); // refresh data on every visit
    return;
  }
  _dashInitialized = true;
  wireDetailModal();
  loadReports();
}

// router.js handles registerPage('dashboard', ...) with role dispatch
window.initStudentDashboard = initDashboard;

/* -------------------------
   Modal Wiring
------------------------- */
function wireDetailModal() {
  const detailModal = document.getElementById("detailModal");
  const closeBtn = document.getElementById("closeDetailBtn");

  if (closeBtn) closeBtn.addEventListener("click", hideDetailModal);

  if (detailModal) {
    detailModal.addEventListener("click", (e) => {
      if (e.target === detailModal) hideDetailModal();
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hideDetailModal();
  });
}

function showDetailModal(html) {
  const body = document.getElementById("detailBody");
  const modal = document.getElementById("detailModal");
  if (body) body.innerHTML = html;
  if (modal) modal.classList.add("show");
}

function hideDetailModal() {
  const modal = document.getElementById("detailModal");
  if (modal) modal.classList.remove("show");
}

/* -------------------------
   Helpers
------------------------- */
function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(dateString) {
  if (!dateString) return "N/A";
  
  // Assuming dateString is in YYYY-MM-DD format
  const parts = dateString.split("-");
  if (parts.length === 3) {
    const [year, month, day] = parts;
    return `${month}-${day}-${year}`;
  }
  
  return dateString; // fallback to original if format is unexpected
}

const RECLAIMABLE_CLAIM_STATUSES = new Set(["cancelled", "expired", "automatically_rejected"]);

function blocksNewClaim(claim) {
  return Boolean(claim && !RECLAIMABLE_CLAIM_STATUSES.has(claim.status));
}

/* -------------------------
   Wire Filters
------------------------- */
function wireFilters() {
  let searchInput = document.getElementById("globalSearch");
  const clearBtn    = document.getElementById("searchClearBtn");
  if (searchInput) {
    const fresh = searchInput.cloneNode(true);
    searchInput.replaceWith(fresh);
    searchInput = fresh;
    searchInput.addEventListener("input", () => {
      if (clearBtn) clearBtn.style.display = searchInput.value ? "flex" : "none";
      clearTimeout(smartSearchTimer);
      const query = searchInput.value.trim();
      if (!query) {
        smartSearchActive = false;
        setSmartSearchStatus("");
        loadReports();
        return;
      }
      setSmartSearchStatus("Searching reports…", true);
      smartSearchTimer = setTimeout(() => runSmartSearch(query), 300);
    });
  }
  const category = document.getElementById("categoryFilter");
  const status = document.getElementById("statusFilter");
  const sort = document.getElementById("sortReports");
  if (category) { category.value = activeCategory; category.onchange = () => { activeCategory = category.value; updateFilterUi(); renderCards(); }; }
  if (status) { status.value = activeStatus; status.onchange = () => { activeStatus = status.value; updateFilterUi(); renderCards(); }; }
  if (sort) { sort.value = activeSort; sort.onchange = () => { activeSort = sort.value; renderCards(); }; }
  const clearFilters = document.getElementById("clearFiltersBtn");
  if (clearFilters) clearFilters.onclick = () => {
    activeCategory = ""; activeStatus = "";
    if (category) category.value = "";
    if (status) status.value = "";
    updateFilterUi(); renderCards();
  };
  updateFilterUi();
}

function updateFilterUi() {
  const filters = [
    activeCategory && { key: "category", label: activeCategory },
    activeStatus && { key: "status", label: activeStatus === "claimed" ? "Unavailable" : "Available" },
  ].filter(Boolean);
  const count = document.getElementById("filterCount");
  if (count) { count.textContent = filters.length; count.hidden = filters.length === 0; }
  const chips = document.getElementById("activeFilterChips");
  if (!chips) return;
  chips.innerHTML = filters.map((filter) => `<span class="filter-chip">${escapeHtml(filter.label)}<button type="button" data-clear-filter="${filter.key}" aria-label="Remove ${escapeHtml(filter.label)} filter">&times;</button></span>`).join("");
  chips.querySelectorAll("[data-clear-filter]").forEach((button) => button.addEventListener("click", () => {
    if (button.dataset.clearFilter === "category") activeCategory = "";
    if (button.dataset.clearFilter === "status") activeStatus = "";
    const category = document.getElementById("categoryFilter");
    const status = document.getElementById("statusFilter");
    if (category) category.value = activeCategory;
    if (status) status.value = activeStatus;
    updateFilterUi(); renderCards();
  }));
}

/* -------------------------
   Update Statistics
------------------------- */
function updateStats(reports) {
  const activeStatuses = new Set(["pending", "under_review", "action_required", "approved", "returned"]);
  const values = [
    reports.filter((report) => report.lifecycleStatus === "active" && (report.claimStatus || "").toLowerCase() !== "claimed").length,
    allClaims.filter((claim) => activeStatuses.has((claim.status || "").toLowerCase())).length,
    allClaims.filter((claim) => (claim.status || "").toLowerCase() === "action_required").length,
    allClaims.filter((claim) => (claim.status || "").toLowerCase() === "approved").length,
  ];
  values.forEach((value, index) => {
    const element = document.getElementById(`metricValue${index + 1}`);
    if (element) element.textContent = value;
  });
}

/* -------------------------
   Load Reports from API (cache-first)
------------------------- */
const REPORTS_CACHE_KEY = "lf_reports_cache_v3";
function reportsCacheKey() {
  return `${REPORTS_CACHE_KEY}:${getCurrentUser().id}`;
}

function showSkeletonCards() {
  const grid = document.getElementById("reportCards");
  if (!grid) return;
  grid.innerHTML = Array.from({ length: 6 }).map(() => `
    <div class="rc-card rc-skeleton">
      <div class="rc-img-wrap skel-block"></div>
      <div class="rc-body">
        <div class="skel-line skel-title"></div>
        <div class="skel-line skel-meta"></div>
        <div class="skel-line skel-meta skel-meta--short"></div>
      </div>
    </div>`).join("");
}

function loadReports() {
  if (dashboardLoadPromise) return dashboardLoadPromise;
  dashboardLoadPromise = performDashboardLoad().finally(() => {
    dashboardLoadPromise = null;
  });
  return dashboardLoadPromise;
}

async function performDashboardLoad() {
  smartSearchActive = false;
  // ── Step 1: render cached data instantly if available ──────────────────
  const cacheKey = reportsCacheKey();
  const raw = localStorage.getItem(cacheKey);
  if (raw) {
    try {
      allReports = JSON.parse(raw);
      updateStats(allReports);
      renderCards();
    } catch (_) {
      localStorage.removeItem(cacheKey);
    }
  } else {
    // No cache yet — show skeleton so screen isn't blank
    showSkeletonCards();
  }

  // ── Step 2: always fetch fresh data in background ──────────────────────
  try {
    const [discoveryResult, claimsResult] = await Promise.allSettled([
      apiFetchWithTimeout(`${BASE_URL}/reports/discover`),
      apiFetchWithTimeout(`${BASE_URL}/claims`),
    ]);
    if (discoveryResult.status !== "fulfilled" || !discoveryResult.value.ok) {
      throw new Error("The Found Item dashboard could not be loaded.");
    }
    const foundReports = await discoveryResult.value.json();
    if (claimsResult.status === "fulfilled" && claimsResult.value.ok) {
      const claims = await claimsResult.value.json();
      allClaims = Array.isArray(claims) ? claims : [];
    } else {
      allClaims = [];
      setSmartSearchStatus("Found items loaded. Claim status is temporarily unavailable.");
    }
    const fresh = (foundReports || []).filter((report) => report.category === "Found");
    allReports = fresh;
    updateStats(allReports);
    renderCards();

    localStorage.setItem(cacheKey, JSON.stringify(fresh));
  } catch (err) {
    console.error("Error fetching reports:", err);
    if (!raw) {
      const grid = document.getElementById("reportCards");
      if (grid) {
        grid.innerHTML = `
          <div class="rc-empty">
            <i class="fas fa-wifi" style="color:#d1d5db;"></i>
            <p>Could not load Found items.</p>
            <button type="button" class="back-btn" id="retryDashboardLoad">Try again</button>
          </div>`;
        document.getElementById("retryDashboardLoad")?.addEventListener("click", loadReports, { once: true });
      }
    } else {
      setSmartSearchStatus("Could not refresh Found items. Showing saved data.");
    }
  }
}

function setSmartSearchStatus(message, loading = false) {
  const status = document.getElementById("smartSearchStatus");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("is-loading", loading);
}

async function runSmartSearch(query) {
  if (smartSearchRequest) smartSearchRequest.abort();
  smartSearchRequest = new AbortController();
  try {
    const response = await apiFetch(`${BASE_URL}/reports/search?q=${encodeURIComponent(query)}`, {
      signal: smartSearchRequest.signal,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "Search could not be completed.");
    if ((document.getElementById("globalSearch")?.value || "").trim() !== query) return;
    smartSearchActive = true;
    allReports = Array.isArray(body.results) ? body.results : [];
    const dateLabel = body.signals?.dateRange ? ` · Date: ${body.signals.dateRange}` : "";
    setSmartSearchStatus(`${allReports.length} ranked result${allReports.length === 1 ? "" : "s"}${dateLabel}`);
    renderCards();
  } catch (error) {
    if (error.name === "AbortError") return;
    setSmartSearchStatus(error.message || "Search could not be completed.");
  } finally {
    smartSearchRequest = null;
  }
}

/* -------------------------
   Render Cards with Filters
------------------------- */
function renderCards() {
  const searchVal = (document.getElementById("globalSearch")?.value || "").trim().toLowerCase();

  const filtered = allReports.filter((r) => {
    const matchesSearch = smartSearchActive || !searchVal
      || (r.itemName  || "").toLowerCase().includes(searchVal)
      || (r.location  || "").toLowerCase().includes(searchVal)
      || (r.itemCategory || "").toLowerCase().includes(searchVal);
    const categoryTargetsReportType = ["lost", "found"].includes(activeCategory.toLowerCase());
    const matchesCat    = !activeCategory
      || (categoryTargetsReportType
        ? (r.category || "").toLowerCase() === activeCategory.toLowerCase()
        : (r.itemCategory || "").toLowerCase() === activeCategory.toLowerCase());
    const matchesStatus = !activeStatus
      || (r.claimStatus || "").toLowerCase() === activeStatus.toLowerCase();
    return matchesSearch && matchesCat && matchesStatus;
  }).sort((a, b) => {
    if (activeSort === "name") return String(a.itemName || "").localeCompare(String(b.itemName || ""));
    const aDate = new Date(a.dateFound || a.createdAt || 0).getTime();
    const bDate = new Date(b.dateFound || b.createdAt || 0).getTime();
    if (activeSort === "oldest") return aDate - bDate;
    if (activeSort === "newest") return bDate - aDate;
    return Number(b.relevanceScore || b.matchScore || 0) - Number(a.relevanceScore || a.matchScore || 0) || bDate - aDate;
  });

  const grid = document.getElementById("reportCards");
  if (!grid) return;
  const resultsCount = document.getElementById("resultsCount");
  if (resultsCount) resultsCount.textContent = `${filtered.length} ${filtered.length === 1 ? "item" : "items"}`;
  grid.innerHTML = "";

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="rc-empty">
        <i class="fas fa-box-open"></i>
        <p>${allReports.length === 0 ? "No reports yet." : "No reports found"}</p>
        ${allReports.length === 0 ? '<button type="button" class="claim-btn" id="emptyReportAction">Report an Item</button>' : ""}
      </div>`;
    document.getElementById("emptyReportAction")?.addEventListener("click", () => navigate("report"), { once: true });
    return;
  }

  filtered.forEach((report) => {
    const relatedClaims = allClaims.filter((claim) => Number(claim.report_id) === Number(report.id));
    const blockingClaim = relatedClaims.find(blocksNewClaim);
    const relatedClaim = blockingClaim || relatedClaims[0];
    const canClaim = report.lifecycleStatus === "active" && !blockingClaim;
    const canClaimFoundReport = report.category === "Found" && canClaim;
    const claimLabel = relatedClaim ? studentClaimStatusLabel(relatedClaim.status) : "";
    const isClaimed   = (report.claimStatus || "").toLowerCase() === "claimed";
    const statusClass = isClaimed ? "claimed" : "pending";
    const statusLabel = isClaimed ? "Unavailable" : "Available";
    // imageUrl is a full URL for new Supabase uploads; old local paths need BASE_URL
    const imgSrc = report.imageUrl
      ? (report.imageUrl.startsWith("http") ? report.imageUrl : `${BASE_URL}${report.imageUrl}`)
      : "";
    console.log("[dashboard] report id:", report.id, "imageUrl:", report.imageUrl || "none");

    const card = document.createElement("div");
    card.className = "rc-card";
    card.tabIndex = 0;
    card.setAttribute("aria-label", `View ${report.itemName || "found item"} report details`);

    // Always render the placeholder behind; the <img> overlays it when it loads.
    // onerror hides the img – placeholder already visible underneath.
    const imgMarkup = imgSrc
      ? `<img class="rc-img" src="${imgSrc}" alt="${escapeHtml(report.itemName)}"
              loading="lazy" onerror="this.style.display='none'">`
      : "";

    card.innerHTML = `
      <div class="rc-img-wrap">
        <div class="rc-img-placeholder">
          <i class="fas fa-image"></i>
          <span>No image</span>
        </div>
        ${imgMarkup}
        <span class="rc-badge rc-badge--${statusClass}">${escapeHtml(statusLabel)}</span>
        ${report.relevanceScore ? `<span class="rc-badge-claim">Relevance ${Number(report.relevanceScore)}%</span>` : report.matchScore ? `<span class="rc-badge-claim">Match Score ${Number(report.matchScore)}</span>` : ""}
      </div>
      <div class="rc-body">
        <div class="rc-title">${escapeHtml(report.itemName || "Unknown Item")}</div>
        <p class="rc-description">${escapeHtml(report.description || "No description provided.")}</p>
        <div class="rc-meta"><i class="fas fa-tag"></i> ${escapeHtml(report.itemCategory || report.category || "Other")}</div>
        <div class="rc-meta"><i class="fas fa-map-marker-alt"></i> ${escapeHtml(report.location || "N/A")}</div>
        <div class="rc-meta"><i class="fas fa-calendar-alt"></i> ${escapeHtml(formatDate(report.dateFound))}</div>
        ${Array.isArray(report.searchEvidence) && report.searchEvidence.length ? `<div class="search-evidence"><strong>${escapeHtml(report.relevanceLabel || "Relevant result")}</strong><span>${escapeHtml(report.searchEvidence.slice(0, 3).map((item) => item.detail || item.label).filter(Boolean).join(" · "))}</span></div>` : ""}
        ${relatedClaim ? `<div class="claim-workflow-status status-${escapeHtml(relatedClaim.status)}"><strong>Claim Status:</strong> ${escapeHtml(claimLabel)}</div>` : ""}
        ${relatedClaim?.status === "action_required" ? `<button type="button" class="claim-btn update-verification-btn">Update Verification</button>` : ""}
        <div class="rc-card-actions">
          <button type="button" class="back-btn view-report-btn">View Report</button>
          ${canClaimFoundReport
            ? `<button type="button" class="claim-btn card-claim-btn">Claim This Item</button>` : ""}
        </div>
      </div>
    `;
    card.querySelector(".update-verification-btn")?.addEventListener("click", (event) => {
      event.stopPropagation();
      navigate("claim", { claim: relatedClaim });
    });

    const openDetails = () => {
      const photos = (Array.isArray(report.imageUrls) && report.imageUrls.length ? report.imageUrls : [report.imageUrl]).filter(Boolean);
      const imgDetail = photos.length ? `<div class="detail-photo-grid">${photos.map((url, index) => {
        const src = url.startsWith("http") ? url : `${BASE_URL}${url}`;
        return `<img src="${escapeHtml(src)}" alt="Item photo ${index + 1}" onerror="this.style.display='none'">`;
      }).join("")}</div>` : "";

      const detailsHtml = `
        <h2>Report Details</h2>
        ${imgDetail}
        <div class="detail-row"><i class="fas fa-box"></i> <strong>Item:</strong>&nbsp;<span>${escapeHtml(report.itemName || "N/A")}</span></div>
        <div class="detail-row"><i class="fas fa-arrows-left-right"></i> <strong>Report type:</strong>&nbsp;<span>${escapeHtml(report.category || "N/A")}</span></div>
        <div class="detail-row"><i class="fas fa-tag"></i> <strong>Item category:</strong>&nbsp;<span>${escapeHtml(report.itemCategory || "Other")}</span></div>
        <div class="detail-row"><i class="fas fa-map-marker-alt"></i> <strong>Location:</strong>&nbsp;<span>${escapeHtml(report.location || "N/A")}</span></div>
        <div class="detail-row"><i class="fas fa-calendar"></i> <strong>Date:</strong>&nbsp;<span>${escapeHtml(report.dateFound || "N/A")}</span></div>
        <div class="detail-row"><i class="fas fa-clock"></i> <strong>Status:</strong>&nbsp;<span class="status-badge status-${statusClass}">${escapeHtml(statusLabel)}</span></div>
        <div class="detail-row"><i class="fas fa-align-left"></i> <strong>Description:</strong>&nbsp;<span>${escapeHtml(report.description || "N/A")}</span></div>
        ${Array.isArray(report.searchEvidence) && report.searchEvidence.length ? `<div class="search-explanation"><strong>Relevance: ${Number(report.relevanceScore)}% — ${escapeHtml(report.relevanceLabel)}</strong><ul>${report.searchEvidence.map((item) => `<li>${escapeHtml(item.label)}${item.detail ? `: ${escapeHtml(item.detail)}` : ""}</li>`).join("")}</ul></div>` : ""}
        ${relatedClaim ? `<div class="claim-workflow-status status-${escapeHtml(relatedClaim.status)}"><strong>Claim Status:</strong> ${escapeHtml(claimLabel)}</div>` : ""}
        <div class="modal-actions">
          <button class="print-btn" onclick="window.print()"><i class="fa-solid fa-print"></i> Print Report</button>
          ${canClaimFoundReport
            ? `<button class="claim-btn" id="claimThisItemBtn"><i class="fa-solid fa-shield-halved"></i> Claim This Item</button>`
            : ""}
          <button class="back-btn" onclick="hideDetailModal()"><i class="fa-solid fa-arrow-left"></i> Back</button>
        </div>
      `;
      showDetailModal(detailsHtml);
      document.getElementById("claimThisItemBtn")?.addEventListener("click", () => {
        hideDetailModal();
        navigate("claim", {
          foundReportId: report.id,
          lostReportId: report.relatedLostReportId,
          foundReport: report,
        });
      });
    };
    const startClaim = () => navigate("claim", {
      foundReportId: report.id,
      lostReportId: report.relatedLostReportId,
      foundReport: report,
    });
    card.querySelector(".view-report-btn")?.addEventListener("click", (event) => {
      event.stopPropagation(); openDetails();
    });
    card.querySelector(".card-claim-btn")?.addEventListener("click", (event) => {
      event.stopPropagation(); startClaim();
    });
    card.addEventListener("click", openDetails);
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && event.target === card) openDetails();
    });

    grid.appendChild(card);
  });
}

function studentClaimStatusLabel(status) {
  return ({
    pending: "Pending Admin Review", under_review: "Pending Admin Review",
    action_required: "Action Required — Waiting for Your Response",
    approved: "Approved — Ready for Collection", rejected: "Rejected — Case Closed",
    automatically_rejected: "Closed — Item Returned to Another Claimant",
    returned: "Returned — Awaiting Case Closure", closed: "Returned · Closed",
    cancelled: "Cancelled", expired: "Closed — Claim Expired",
  })[status] || status;
}

async function closeLostReport(reportId) {
  const confirmed = await showConfirmationDialog({
    title: "Close Lost Report?",
    message: "Closing this report cancels all pending claims and stops future matching.",
    cancelLabel: "Keep Report Open",
    confirmLabel: "Close Report",
  });
  if (!confirmed) return;
  const foundItem = window.confirm(
    "Select OK if you found the item yourself, or Cancel if you are no longer searching."
  );
  const response = await apiFetch(`${BASE_URL}/reports/${reportId}/close`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      reason: foundItem ? "found_item" : "no_longer_searching",
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) return showErrorToast(body.error || "Report could not be closed.");
  localStorage.removeItem(reportsCacheKey());
  showSuccessToast("Lost Report closed. Pending claims were cancelled.");
  await loadReports();
}

/* -------------------------
   Clear Search
------------------------- */
function clearSearch() {
  const input  = document.getElementById("globalSearch");
  const clearBtn = document.getElementById("searchClearBtn");
  if (input)    { input.value = ""; input.focus(); }
  if (clearBtn) { clearBtn.style.display = "none"; }
  smartSearchActive = false;
  setSmartSearchStatus("");
  if (smartSearchRequest) smartSearchRequest.abort();
  loadReports();
}
