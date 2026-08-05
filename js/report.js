console.log("REPORT JS LOADED");
// Matching is now handled server-side in reportController.js

let reportForm;
let submitBtn;
let buttonText;
let _reportInitialized = false;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setButtonState(state) {
  submitBtn.classList.remove("loading", "success");
  submitBtn.disabled = state !== "default";

  if (state === "loading") {
    submitBtn.classList.add("loading");
    buttonText.textContent = "Submitting & checking matches...";
  } else if (state === "success") {
    submitBtn.classList.add("success");
    buttonText.textContent = "Submitted ✓";
  } else {
    buttonText.textContent = "Submit Report →";
  }
}

function markSuccessFields() {
  const fields = reportForm.querySelectorAll("input, textarea, select");
  fields.forEach((el) => el.classList.add("success-field"));
  setTimeout(() => fields.forEach((el) => el.classList.remove("success-field")), 1100);
}

function configureReportWorkspace() {
  const heading = document.getElementById("reportFormHeading");
  const categorySelect = document.getElementById("category");
  if (heading) heading.textContent = "Report Item";
  if (categorySelect) {
    categorySelect.disabled = false;
    categorySelect.value = "";
  }
  const locationLabel = document.querySelector('label[for="location"]');
  if (locationLabel) locationLabel.textContent = "Location";
}

function initReport(context = {}) {
  if (_reportInitialized) {
    resetReportExperience();
    configureReportWorkspace();
    return;
  }
  _reportInitialized = true;
  requireLogin();
  console.log("[SPA] initReport");

  reportForm = document.getElementById("reportForm");
  submitBtn  = reportForm ? reportForm.querySelector(".submit-btn") : document.querySelector(".submit-btn");

  if (!reportForm) {
    console.error("❌ reportForm NOT FOUND");
    return;
  }

  console.log("✅ Form found");

  if (!submitBtn) {
    console.error("❌ submitBtn NOT FOUND");
    return;
  }

  buttonText = submitBtn.querySelector(".button-text");
  configureReportWorkspace();
  if (typeof initDescriptionAssistant === "function") initDescriptionAssistant();

  // Image preview wiring
  const itemImageInput = document.getElementById("itemImage");
  const imagePreview   = document.getElementById("imagePreview");
  const fileNameSpan   = document.getElementById("fileName");
  if (itemImageInput) {
    itemImageInput.addEventListener("change", () => {
      const files = [...itemImageInput.files];
      const file = files[0];
      if (file) {
        fileNameSpan.textContent = files.length === 1 ? file.name : `${files.length} photos selected`;
        const reader = new FileReader();
        reader.onload = (e) => {
          imagePreview.src = e.target.result;
          imagePreview.style.display = "block";
        };
        reader.readAsDataURL(file);
      } else {
        fileNameSpan.textContent = "No file chosen";
        imagePreview.src = "";
        imagePreview.style.display = "none";
      }
    });
  }

  reportForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    console.log("[report submit] Submit event fired");
    if (submitBtn.disabled) return;

    const itemName    = (document.getElementById("itemName")?.value    || "").trim();
    const category    = (document.getElementById("category")?.value    || "").trim();
    const itemCategory = (document.getElementById("itemCategory")?.value || "").trim();
    const location    = (document.getElementById("location")?.value    || "").trim();
    const dateFound   = (document.getElementById("date")?.value        || "").trim();
    const timeFound   = (document.getElementById("time")?.value        || "").trim();
    const name        = (document.getElementById("name")?.value        || "").trim();
    const email       = (document.getElementById("email")?.value       || "").trim();
    const phone       = (document.getElementById("phone")?.value       || "").trim();
    const description = (document.getElementById("description")?.value || "").trim();

    if (!itemName || !category || !itemCategory || !location) {
      showErrorToast("Please fill all required fields.");
      return;
    }

    if (!dateFound) {
      showErrorToast("Please select a date.");
      return;
    }

    setButtonState("loading");

    const imageInput = document.getElementById("itemImage");
    const imageFiles = [...(imageInput?.files || [])];

    const formData = new FormData();
    formData.append("itemName", itemName);
    formData.append("category", category || "General");
    formData.append("itemCategory", itemCategory);
    formData.append("location", location);
    formData.append("dateFound", dateFound || "");
    formData.append("timeFound", timeFound || "");
    formData.append("name", name || "");
    formData.append("email", email || "");
    formData.append("phone", phone || "");
    formData.append("description", description || "");
    formData.append("status", "Pending");
    imageFiles.forEach((imageFile) => formData.append("images", imageFile));

    console.log("[report submit] FormData created", {
      itemName,
      category: category || "General",
      itemCategory,
      location,
      dateFound,
      timeFound,
      name,
      email,
      phone,
      description,
      imageCount: imageFiles.length,
    });

    try {
      const res = await apiFetch(`${BASE_URL}/reports`, {
        method:  "POST",
        body:    formData,
      });

      const body = await res.json().catch(() => ({}));
      console.log("[report submit] Server response", { status: res.status, ok: res.ok, body });

      if (!res.ok) {
        throw new Error(body.error || `Server error (${res.status})`);
      }

      setButtonState("success");
      markSuccessFields();
      await delay(600);
      if (body.report?.category === "Lost") {
        showMatchResults(body.report, body.matches || []);
      } else {
        localStorage.removeItem("lf_reports_cache_v2");
        resetReportExperience();
        showSuccessToast("Found Report submitted. It is now available for future Lost Report matching.");
        navigate("dashboard");
      }
    } catch (err) {
      console.error("[report submit] Error submitting report:", err);
      setButtonState("default");
      showErrorToast(`Could not submit the report: ${err.message}`);
    }
  }); // end submit listener

  console.log("FORM HANDLER ATTACHED");
}

window.initReport = initReport;

// =============================================================
// MATCH RESULTS UI
// Hides the report form card and renders the ranked matches and
// score evidence returned by the backend matching service.
// =============================================================

/**
 * Safely escape HTML to prevent XSS in rendered card content.
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Builds and returns a side-by-side report comparison.
 */
function reportComparisonPanel(report, heading, modifier) {
  return `
    <section class="match-report match-report--${modifier}" aria-label="${escapeHtml(heading)}">
      <div class="match-report-heading">
        <span class="match-report-kicker">${escapeHtml(heading)}</span>
        <span class="match-type match-type--${String(report.category || "").toLowerCase()}">
          ${escapeHtml(report.category || "Report")}
        </span>
      </div>
      <h4>${escapeHtml(report.itemName || "Unnamed item")}</h4>
      ${report.itemCategory ? `<p class="match-item-category"><i class="fa-solid fa-tag" aria-hidden="true"></i> ${escapeHtml(report.itemCategory)}</p>` : ""}
      <dl class="match-report-meta">
        <div><dt><i class="fa-solid fa-location-dot" aria-hidden="true"></i><span class="sr-only">Location</span></dt><dd>${escapeHtml(report.location || "Not provided")}</dd></div>
        <div><dt><i class="fa-solid fa-calendar-days" aria-hidden="true"></i><span class="sr-only">Date</span></dt><dd>${escapeHtml(report.dateFound || "Not provided")}</dd></div>
      </dl>
      <p class="match-report-description">${escapeHtml(report.description || "No description provided.")}</p>
    </section>`;
}

function createMatchCard(submittedReport, match, index) {
  const card = document.createElement("article");
  const detailsId = `match-details-${match.id}-${index}`;
  const evidence = Array.isArray(match.matchEvidence) ? match.matchEvidence : [];
  const submittedType = String(submittedReport.category || "Submitted").toLowerCase();
  const matchType = String(match.category || "Potential").toLowerCase();

  card.className = "match-card";
  card.dataset.matchId = match.id;
  card.innerHTML = `
    <header class="match-card-header">
      <div>
        <p class="match-eyebrow">Potential ${escapeHtml(match.category || "")} report</p>
        <h3>Possible match #${index + 1}</h3>
      </div>
      <div class="match-score" aria-label="Match Score ${match.matchScore || 0}">
        <strong>${match.matchScore || 0}</strong>
        <span>Match Score</span>
      </div>
    </header>

    <div class="match-comparison">
      ${reportComparisonPanel(submittedReport, `Your ${submittedType} report`, "submitted")}
      <div class="match-connector" aria-hidden="true">
        <i class="fa-solid fa-arrow-right-arrow-left"></i>
      </div>
      ${reportComparisonPanel(match, `Potential ${matchType} report`, "candidate")}
    </div>

    <section class="match-evidence" aria-labelledby="evidence-title-${detailsId}">
      <div class="match-evidence-heading">
        <div>
          <p class="match-eyebrow">Score explanation</p>
          <h4 id="evidence-title-${detailsId}">Why this report was suggested</h4>
        </div>
        <p class="match-score-note">A Match Score ranks shared evidence. It is not an AI confidence or probability.</p>
      </div>
      <ul>
        ${evidence.map((item) => `
          <li>
            <span class="evidence-check"><i class="fa-solid fa-check" aria-hidden="true"></i></span>
            <span><strong>${escapeHtml(item.label)}</strong>${item.detail ? `<small>${escapeHtml(item.detail)}</small>` : ""}</span>
            <b>+${Number(item.points) || 0}</b>
          </li>`).join("")}
      </ul>
    </section>

    <div id="${detailsId}" class="match-more-details" hidden>
      <h4>Full potential-match details</h4>
      <p><strong>Status:</strong> ${escapeHtml(match.status || "Pending")}</p>
      <p><strong>Report reference:</strong> #${escapeHtml(String(match.id))}</p>
    </div>

    <footer class="match-actions">
      <button type="button" class="match-action match-action--secondary" data-action="view"
              aria-expanded="false" aria-controls="${detailsId}">
        <i class="fa-regular fa-eye" aria-hidden="true"></i>
        <span>View potential match</span>
      </button>
      <button type="button" class="match-action match-action--primary" data-action="claim">
        <i class="fa-solid fa-shield-halved" aria-hidden="true"></i>
        Start claim or verification
      </button>
      <button type="button" class="match-action match-action--quiet" data-action="dismiss">
        <i class="fa-solid fa-xmark" aria-hidden="true"></i>
        Not a match
      </button>
    </footer>`;

  const viewButton = card.querySelector('[data-action="view"]');
  viewButton.addEventListener("click", () => {
    const details = card.querySelector(`#${detailsId}`);
    const willOpen = details.hidden;
    details.hidden = !willOpen;
    viewButton.setAttribute("aria-expanded", String(willOpen));
    viewButton.querySelector("span").textContent = willOpen
      ? "Hide match details"
      : "View potential match";
  });

  card.querySelector('[data-action="claim"]').addEventListener("click", () => {
    if (typeof navigate === "function") {
      navigate("claim", {
        foundReportId: match.id,
        lostReportId: submittedReport.id,
        foundReport: match,
      });
    } else {
      window.location.href = "dashboard.html#new-claim";
    }
  });

  card.querySelector('[data-action="dismiss"]').addEventListener("click", () => {
    card.classList.add("match-card--dismissed");
    window.setTimeout(() => {
      card.remove();
      updateVisibleMatchSummary();
    }, 220);
  });

  return card;
}

/**
 * Hides the report form section, populates match results,
 * and reveals the #matchResultSection.
 *
 * @param {Object} submittedReport - Report that was just created.
 * @param {Object[]} matches - Ranked candidates returned by the backend.
 */
function showMatchResults(submittedReport, matches) {
  // Hide the form section
  const formSection    = document.getElementById("reportFormSection");
  const resultSection  = document.getElementById("matchResultSection");
  const matchesContainer = document.getElementById("matchesContainer");
  const noMatchMsg     = document.getElementById("noMatchMsg");
  const summaryText    = document.getElementById("matchSummaryText");

  if (!resultSection || !matchesContainer || !noMatchMsg) {
    console.error("showMatchResults: required DOM elements missing");
    return;
  }

  if (formSection) formSection.style.display = "none";

  // Clear any previous render
  matchesContainer.innerHTML = "";

  if (matches.length === 0) {
    // Empty state
    if (summaryText) summaryText.textContent = "Your report is live. No strong complementary reports were found yet.";
    noMatchMsg.style.display       = "block";
    matchesContainer.style.display = "none";
  } else {
    // Render match cards
    if (summaryText) {
      summaryText.textContent =
        `Found ${matches.length} potential match${matches.length > 1 ? "es" : ""}. Review the evidence before starting a claim.`;
    }
    noMatchMsg.style.display       = "none";
    matchesContainer.style.display = "block";
    matches.forEach((item, index) => {
      matchesContainer.appendChild(createMatchCard(submittedReport, item, index));
    });
  }

  resultSection.style.display = "block";
  resultSection.setAttribute("tabindex", "-1");
  resultSection.focus();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function updateVisibleMatchSummary() {
  const matchesContainer = document.getElementById("matchesContainer");
  const noMatchMsg = document.getElementById("noMatchMsg");
  const summaryText = document.getElementById("matchSummaryText");
  const count = matchesContainer?.querySelectorAll(".match-card").length || 0;

  if (count === 0) {
    if (matchesContainer) matchesContainer.style.display = "none";
    if (noMatchMsg) noMatchMsg.style.display = "block";
    if (summaryText) summaryText.textContent = "All current suggestions were dismissed. Your report remains active.";
    return;
  }

  if (summaryText) {
    summaryText.textContent = `${count} potential match${count === 1 ? "" : "es"} remaining.`;
  }
}

function resetReportExperience() {
  const formSection = document.getElementById("reportFormSection");
  const resultSection = document.getElementById("matchResultSection");
  const matchesContainer = document.getElementById("matchesContainer");
  const noMatchMsg = document.getElementById("noMatchMsg");

  if (formSection) formSection.style.display = "";
  if (resultSection) resultSection.style.display = "none";
  if (matchesContainer) {
    matchesContainer.innerHTML = "";
    matchesContainer.style.display = "";
  }
  if (noMatchMsg) noMatchMsg.style.display = "none";
  if (reportForm) reportForm.reset();
  if (typeof resetDescriptionAssistant === "function") resetDescriptionAssistant();
  configureReportWorkspace({});
  if (submitBtn && buttonText) setButtonState("default");

  const preview = document.getElementById("imagePreview");
  const filename = document.getElementById("fileName");
  if (preview) {
    preview.src = "";
    preview.style.display = "none";
  }
  if (filename) filename.textContent = "No file chosen";
}

function returnToDashboard() {
  resetReportExperience();
  if (typeof navigate === "function") {
    navigate("dashboard");
  } else {
    window.location.href = "dashboard.html#dashboard";
  }
}

window.returnToDashboard = returnToDashboard;
