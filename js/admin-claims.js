(function () {
// =========================================================
//  Admin Claims — fetches live data from GET /claims
// =========================================================

// In-memory cache of the last fetched claims list
let _claims = [];

// Currently open claim in detail modal
let _currentClaimId = null;
let _activeActionOverlay = null;
let _activeActionResolver = null;
let _actionDialogToken = 0;

function closeAdminActionOverlay(result = null) {
  _actionDialogToken += 1;
  document.querySelectorAll("[data-admin-action-overlay]").forEach((overlay) => overlay.remove());
  _activeActionOverlay = null;
  const resolve = _activeActionResolver;
  _activeActionResolver = null;
  if (resolve) resolve(result);
}

function mountAdminActionOverlay(overlay, resolve = null) {
  closeAdminActionOverlay(null);
  overlay.dataset.adminActionOverlay = "true";
  _activeActionOverlay = overlay;
  _activeActionResolver = resolve;
  document.body.appendChild(overlay);
}

async function completeAdminAction(successMessage = "") {
  closeAdminActionOverlay(null);
  closeClaimModal();
  if (successMessage) showSuccessToast(successMessage);
  await loadClaims();
}

// Real-time message channel
let _msgChannel = null;

// ---------------------------------------------------------
//  Helpers
// ---------------------------------------------------------

function badgeClass(status) {
  const s = (status || "").toLowerCase();
  if (s === "approved") return "badge-approved";
  if (s === "rejected") return "badge-rejected";
  return "badge-pending";
}

function capitalize(str) {
  if (!str) return "Pending";
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function adminStatusLabel(status) {
  return ({ pending:"Awaiting Review", under_review:"Ready for Decision",
    action_required:"Waiting for Student Response", approved:"Approved — Awaiting Return",
    rejected:"Rejected", automatically_rejected:"Closed Automatically",
    returned:"Returned — Ready to Close", closed:"Closed · Archived",
    cancelled:"Cancelled", expired:"Expired" })[status] || capitalize(status);
}

function claimActions(claim) {
  if (["pending", "under_review"].includes(claim.status)) return `
    <button class="verify" data-action="verify"><i class="fas fa-search-plus"></i> Request Verification</button>
    <button class="approve" data-action="approve"><i class="fas fa-check"></i> Approve</button>
    <button class="reject" data-action="reject"><i class="fas fa-times"></i> Reject</button>`;
  if (claim.status === "approved") return `<button class="approve" data-action="return"><i class="fas fa-box"></i> Mark Item Returned</button>`;
  if (claim.status === "returned") return `<button class="approve" data-action="close"><i class="fas fa-archive"></i> Close Case</button>`;
  return `<span class="claim-next-step">${escapeHtml(adminStatusLabel(claim.status))}</span>`;
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function resolveImageSrc(rawImage) {
  if (!rawImage) return "assets/no-image.png";
  if (/^https?:\/\//i.test(rawImage) || rawImage.startsWith("data:")) return rawImage;
  if (rawImage.startsWith("/")) return `${BASE_URL}${rawImage}`;
  return rawImage;
}

// ---------------------------------------------------------
//  Build a single claim card element
// ---------------------------------------------------------

function buildClaimCard(claim) {
  const card = document.createElement("div");
  const attention = ["pending", "under_review", "returned"].includes((claim.status || "pending").toLowerCase());
  card.className = `claim-card${attention ? " claim-card--attention" : ""}`;
  card.dataset.id = claim.id;
  card.tabIndex = 0;
  card.setAttribute("aria-label", `Open claim ${claim.id} review details`);

  // Normalise API fields (snake_case from DB join)
  const itemName  = claim.item_name  || claim.itemName  || "Unknown Item";
  const status    = claim.status     || "pending";
  const email     = claim.student_email || claim.email || claim.studentEmail || "";
  const studentId = claim.student_id || "";
  const rawImage  = claim.image || claim.image_url || claim.imageUrl || "";
  const imgSrc    = resolveImageSrc(rawImage);

  card.innerHTML = `
    <div class="rc-img-wrap">
      ${
        rawImage
          ? `<img src="${escapeHtml(imgSrc)}" class="rc-img" loading="lazy"
            onerror="this.style.display='none'" />`
          : `<div class="rc-img-placeholder"><i class="fas fa-image"></i><span>No image</span></div>`
      }
      <span class="rc-badge rc-badge-${escapeHtml(status)}">${escapeHtml(adminStatusLabel(status))}</span>
    </div>

    <div class="claim-body">
      <div class="claim-queue-kicker">Claim #${escapeHtml(String(claim.id))} · ${claim.manual_entry ? "Manual entry" : `Found Report #${escapeHtml(String(claim.report_id || "—"))}`}</div>
      <h3 class="claim-title">${escapeHtml(itemName)}</h3>

      <p class="claim-desc">
        <strong>Description:</strong>
        ${claim.description
          ? escapeHtml(claim.description.substring(0, 100)) + (claim.description.length > 100 ? "\u2026" : "")
          : "No description"}
      </p>

      <div class="claim-meta">
        ${studentId ? `<p><strong>Student ID:</strong> ${escapeHtml(String(studentId))}</p>` : ""}
        ${email     ? `<p><strong>Email:</strong> ${escapeHtml(email)}</p>`     : ""}
        ${claim.verification_version ? `<p><strong>Verification:</strong> Version ${escapeHtml(String(claim.verification_version))}</p>` : ""}
      </div>

      <hr class="claim-divider" />

      <div class="actions">
        <span class="claim-turn-label"><i class="fas fa-circle-arrow-right" aria-hidden="true"></i>${escapeHtml(adminStatusLabel(status))}</span>
        ${email ? `
        <button class="msg-btn" data-action="msg">
          <i class="fas fa-envelope"></i> Message Student
        </button>` : ""}
        ${claimActions(claim)}
      </div>
    </div>
  `;

  // Action buttons — stop propagation so card click doesn't also fire
  card.querySelector(".approve")?.addEventListener("click", (e) => {
    e.stopPropagation();
    handleAction(claim.id, "approved");
  });
  card.querySelector(".reject")?.addEventListener("click", (e) => {
    e.stopPropagation();
    handleAction(claim.id, "rejected");
  });
  card.querySelector('[data-action="verify"]')?.addEventListener("click", (e) => {
    e.stopPropagation(); requestVerification(claim.id);
  });
  card.querySelector('[data-action="return"]')?.addEventListener("click", async (e) => {
    e.stopPropagation(); await transitionClaim(claim.id, "return", "Item return confirmed.");
  });
  card.querySelector('[data-action="close"]')?.addEventListener("click", async (e) => {
    e.stopPropagation(); await transitionClaim(claim.id, "close", "Recovery case closed and archived.");
  });
  card.querySelector(".msg-btn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    openMessageModal(claim.id, email);
  });

  // Click anywhere on card → open detail modal
  card.addEventListener("click", () => openClaimModal(claim));
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.target === card) openClaimModal(claim);
  });

  return card;
}

// ---------------------------------------------------------
//  Render claims into #claimsList
// ---------------------------------------------------------

function renderClaims(claims) {
  const container = document.getElementById("claimsList");
  container.innerHTML = "";

  if (!claims || claims.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-inbox"></i>
        <p>No claims require review.</p>
        <small>New and updated claims will appear here automatically.</small>
      </div>`;
    return;
  }

  claims.forEach((claim) => {
    container.appendChild(buildClaimCard(claim));
  });
}

// ---------------------------------------------------------
//  Claim detail modal
// ---------------------------------------------------------

function openClaimModal(claim) {
  const rawImage  = claim.image || claim.image_url || claim.imageUrl || "";
  const imgSrc    = resolveImageSrc(rawImage);
  const itemName  = claim.item_name || claim.itemName || "Unknown Item";
  const studentId = claim.student_id || "";
  const email     = claim.student_email || claim.email || "";
  const location  = claim.location || "";
  const status    = claim.status   || "pending";

  _currentClaimId = claim.id;

  // Image at top with fallback
  const wrap = document.getElementById("modalImageWrap");
  wrap.innerHTML = `
    <div class="modal-img-wrap">
      <img src="${escapeHtml(imgSrc)}" class="modal-img" alt="Claim image" onerror="this.onerror=null;this.src='assets/no-image.png';" />
    </div>`;

  document.getElementById("modalTitle").textContent = itemName;
  document.getElementById("modalDetails").innerHTML = `
    <strong>Claim ID:</strong> #${escapeHtml(String(claim.id))}<br>
    <strong>Status:</strong> ${escapeHtml(adminStatusLabel(status))}<br>
    ${claim.manual_entry
      ? `<strong>Claim Source:</strong> Manual Entry<br>
         <strong>Item Category:</strong> ${escapeHtml(claim.item_category || "—")}<br>
         <strong>Item Date:</strong> ${formatDate(claim.item_date)}<br>`
      : `<strong>Original Found Report:</strong> #${escapeHtml(String(claim.report_id))} — ${escapeHtml(claim.found_item_name || itemName)}<br>`}
    <strong>Item Description:</strong> ${escapeHtml(claim.found_description || claim.description || "—")}<br>
    ${studentId ? `<strong>Student ID:</strong> ${escapeHtml(String(studentId))}<br>` : ""}
    ${email     ? `<strong>Email:</strong> ${escapeHtml(email)}<br>`     : ""}
    ${location  ? `<strong>Location:</strong> ${escapeHtml(location)}<br>` : ""}
    ${claim.created_at ? `<strong>Submitted:</strong> ${formatDate(claim.created_at)}<br>` : ""}
    <br>
    <p class="modal-desc"><strong>Ownership Verification:</strong> ${escapeHtml(claim.ownership_verification || "No verification supplied")}</p>
    <p class="modal-desc"><strong>Supporting Information:</strong> ${escapeHtml(claim.supporting_information || "None")}</p>
    <p class="modal-desc"><strong>Student Comments:</strong> ${escapeHtml(claim.student_comments || "None")}</p>
    ${claim.verification_request ? `<p class="modal-desc"><strong>Requested Proof:</strong> ${escapeHtml(claim.verification_request)}</p>` : ""}
    <h4>Timeline</h4>
    <ol class="claim-timeline">${(claim.timeline || []).map((event) => `<li><strong>${escapeHtml(timelineLabel(event.eventType))}</strong><span>${formatDate(event.createdAt)}</span>${event.reason ? `<p>${escapeHtml(event.reason)}</p>` : ""}</li>`).join("") || "<li>No timeline events.</li>"}</ol>
  `;

  document.getElementById("claimDetailOverlay").classList.add("open");
  loadMessages(claim.id);
}

function closeClaimModal() {
  document.getElementById("claimDetailOverlay").classList.remove("open");
  _currentClaimId = null;
  if (_msgChannel) _msgChannel = null;
}

// ---------------------------------------------------------
//  Chat / messaging
// ---------------------------------------------------------

async function loadMessages(claimId) {
  const chatBox = document.getElementById("chatBox");
  if (!chatBox) return;
  chatBox.innerHTML = `<p style="color:#aaa;font-size:13px;text-align:center;">Loading…</p>`;

  console.log("[loadMessages] Fetching for claim_id:", claimId);

  try {
    const res = await apiFetch(`${BASE_URL}/messages/${claimId}?viewer=admin`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    console.log("[admin-claims loadMessages] messages loaded for claim in admin view:", {
      claim_id: claimId,
      count: data?.length ?? 0,
      rows: data,
    });

    renderMessages(data || []);
    subscribeToMessages(claimId);
  } catch (error) {
    console.error("[loadMessages] FETCH FAILED:", error.message);
    chatBox.innerHTML = `<p style="color:#ef4444;font-size:13px;text-align:center;">Failed to load messages. Check console for details.</p>`;
  }
}

function renderMessages(messages) {
  const chatBox = document.getElementById("chatBox");
  if (!chatBox) return;

  if (!messages || messages.length === 0) {
    chatBox.innerHTML = `<p style="color:#aaa;font-size:13px;text-align:center;">No messages yet.</p>`;
    return;
  }

  chatBox.innerHTML = messages.map((m) => messageBubble(m, "admin")).join("");
  chatBox.scrollTop = chatBox.scrollHeight;
}

function messageBubble(m, viewerRole) {
  const user  = getCurrentUser();
  const isOwn = (m.sender_role || m.sender_type) === user.role;
  const side  = isOwn ? "admin" : "student";
  const label = isOwn ? "You" : escapeHtml(m.sender_id || "Student");
  const time  = m.created_at
    ? new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";
  return `
    <div class="chat-msg chat-msg--${side}">
      <span class="chat-sender">${label}</span>
      <div class="chat-bubble">${escapeHtml(m.message)}</div>
      ${time ? `<span class="chat-time">${time}</span>` : ""}
    </div>`;
}

function appendMessageToUI(m) {
  const chatBox = document.getElementById("chatBox");
  if (!chatBox) return;
  // Remove "no messages" placeholder if present
  const placeholder = chatBox.querySelector("p");
  if (placeholder) placeholder.remove();
  chatBox.insertAdjacentHTML("beforeend", messageBubble(m, "admin"));
  chatBox.scrollTop = chatBox.scrollHeight;
}

function subscribeToMessages(claimId) {
  _msgChannel = null;
}

async function sendAdminMessage() {
  if (!_currentClaimId) return;
  const input = document.getElementById("adminMsgInput");
  const text  = (input?.value || "").trim();
  if (!text) return;

  input.value    = "";
  input.disabled = true;

  const _cu = getCurrentUser();
  const payload = {
    claim_id:    _currentClaimId,
    sender_role: _cu.role,
    recipient_role: "student",
    sender_id:   _cu.email,
    message:     text,
  };

  console.log("[admin-claims send] outgoing admin message payload:", payload);

  try {
    const res = await apiFetch(`${BASE_URL}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    console.log("[admin-claims send] saved message record:", data);
  } catch (error) {
    console.error("[sendAdminMessage] INSERT FAILED:", error.message);
    alert("Failed to send message: " + error.message);
    input.value    = text;
    input.disabled = false;
    return;
  }

  // Always reload from DB to confirm the row persisted (don't rely solely on real-time)
  input.disabled = false;
  input.focus();
  await loadMessages(_currentClaimId);
}

// ---------------------------------------------------------
//  Message modal state
// ---------------------------------------------------------

let _activeMsgClaimId = null;
let _activeMsgEmail = null;

function openMessageModal(claimId, studentEmail) {
  _activeMsgClaimId = claimId;
  _activeMsgEmail = studentEmail;

  document.getElementById("msgRecipient").textContent = studentEmail;
  document.getElementById("msgTextarea").value = "";
  document.getElementById("msgOverlay").classList.add("open");
  document.getElementById("msgTextarea").focus();
}

function closeMessageModal() {
  _activeMsgClaimId = null;
  _activeMsgEmail = null;
  document.getElementById("msgTextarea").value = "";
  document.getElementById("msgOverlay").classList.remove("open");
}

async function sendMessage() {
  const text = document.getElementById("msgTextarea").value.trim();

  if (!text) {
    alert("Please enter a message before sending.");
    return;
  }

  const payload = {
    claim_id: _activeMsgClaimId,
    sender_role: "admin",
    recipient_role: "student",
    sender_id: getCurrentUser().email,
    message: text,
  };
  const claimIdForRefresh = _activeMsgClaimId;

  console.log("[admin-claims modal send] outgoing admin message payload:", payload);

  try {
    const res = await apiFetch(`${BASE_URL}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    console.log("[admin-claims modal send] saved message record:", data);
    closeMessageModal();
    alert("Message sent");
    if (claimIdForRefresh) await loadMessages(claimIdForRefresh);
  } catch (error) {
    console.error("[admin-claims modal send] INSERT FAILED:", error.message);
    alert("Failed to send message: " + error.message);
  }
}

// ---------------------------------------------------------
//  Fetch all claims from the backend
// ---------------------------------------------------------

async function loadClaims() {
  const container = document.getElementById("claimsList");
  if (!container) return;
  container.innerHTML = `<p style="text-align:center;color:#888;" role="status">Loading claims…</p>`;
  try {
    const res = await apiFetch(`${BASE_URL}/claims`);
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error || `Claims could not be loaded (${res.status}).`);
    _claims = Array.isArray(body) ? body : [];
    renderClaims(_claims);
    const reviewClaimId = sessionStorage.getItem("phase3ReviewClaimId");
    if (reviewClaimId) {
      sessionStorage.removeItem("phase3ReviewClaimId");
      await openApprovalDialog(Number(reviewClaimId));
    }
  } catch (err) {
    console.error("loadClaims error:", err);
    container.innerHTML = `<div class="empty-state" role="alert"><i class="fas fa-exclamation-circle"></i><p>${escapeHtml(err.message || "Claims could not be loaded. Please try again.")}</p><button type="button" class="secondary-btn" id="retryClaims">Try again</button></div>`;
    document.getElementById("retryClaims")?.addEventListener("click", loadClaims);
  }
}

// ---------------------------------------------------------
//  Handle transactional approve/reject decisions.
// ---------------------------------------------------------

async function handleAction(claimId, newStatus) {
  if (newStatus === "approved") {
    return openApprovalDialog(claimId);
  }
  const reason = await textActionDialog({ title: "Reject Claim", label: "Rejection reason", confirmLabel: "Reject Claim" });
  if (!reason) return;
  try {
    const res = await apiFetch(`${BASE_URL}/claims/${claimId}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "reject", reason }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const msg = data.error || `HTTP ${res.status}`;
      console.error("[handleAction] Error:", msg);
      alert(`Could not update claim: ${msg}`);
      return;
    }

    console.log(`[handleAction] Claim ${claimId} → ${newStatus}`, data);
    await completeAdminAction();
  } catch (err) {
    console.error("handleAction error:", err);
    alert("Failed to update claim status. Please try again.");
  }
}

function timelineLabel(type) {
  return ({ created:"Claim Submitted", admin_reviewing:"Admin Reviewing",
    additional_verification_requested:"Additional Verification Requested",
    student_resubmitted:"Student Resubmitted", approved:"Approved",
    manual_rejected:"Rejected", item_returned:"Item Returned", case_closed:"Case Closed" })[type] || String(type || "Update").replaceAll("_", " ");
}

function textActionDialog({ title, label, confirmLabel }) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "claim-modal-overlay open";
    overlay.innerHTML = `<div class="claim-modal-box" role="dialog" aria-modal="true"><div class="claim-modal-body">
      <h2>${escapeHtml(title)}</h2><label>${escapeHtml(label)}<textarea rows="4" required></textarea></label>
      <div class="modal-actions"><button data-action="cancel">Cancel</button><button class="approve" data-action="confirm">${escapeHtml(confirmLabel)}</button></div>
    </div></div>`;
    mountAdminActionOverlay(overlay, resolve);
    const textarea = overlay.querySelector("textarea"); textarea.focus();
    overlay.querySelector('[data-action="cancel"]').addEventListener("click", () => closeAdminActionOverlay(null));
    overlay.querySelector('[data-action="confirm"]').addEventListener("click", () => {
      const result = textarea.value.trim();
      if (!result) return showErrorToast(`${label} is required.`);
      closeAdminActionOverlay(result);
    });
  });
}

async function requestVerification(claimId) {
  const explanation = await textActionDialog({ title:"Request More Verification", label:"Additional proof required", confirmLabel:"Send Request" });
  if (!explanation) return;
  const response = await apiFetch(`${BASE_URL}/claims/${claimId}/request-verification`, {
    method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ explanation }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) return showErrorToast(body.error || "Request failed.");
  await completeAdminAction("Verification request sent to the student.");
}

async function transitionClaim(claimId, action, successMessage) {
  const response = await apiFetch(`${BASE_URL}/claims/${claimId}/${action}`, { method:"POST" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) return showErrorToast(body.error || "Claim could not be updated.");
  await completeAdminAction(successMessage);
}

async function openApprovalDialog(claimId) {
  closeAdminActionOverlay(null);
  const dialogToken = _actionDialogToken;
  await apiFetch(`${BASE_URL}/claims/${claimId}/review`, { method: "POST" });
  const relatedResponse = await apiFetch(`${BASE_URL}/claims/${claimId}/related`);
  const related = relatedResponse.ok ? await relatedResponse.json() : [];
  if (dialogToken !== _actionDialogToken) return;
  const overlay = document.createElement("div");
  overlay.className = "claim-modal-overlay open";
  overlay.innerHTML = `
    <div class="claim-modal-box" role="dialog" aria-modal="true" aria-labelledby="approvalTitle">
      <div class="claim-modal-body">
        <h2 id="approvalTitle">Approve Claim #${escapeHtml(String(claimId))}</h2>
        <p>Related claims from the same Lost Report are pre-selected. Uncheck any claim that should remain open.</p>
        <div class="related-claim-list">
          ${related.length ? related.map((claim) => `
            <label>
              <input type="checkbox" name="relatedClaim" value="${claim.id}" checked>
              Close Claim #${claim.id} — ${escapeHtml(claim.found_item_name || claim.item_name || "Item")}
            </label>`).join("") : "<p>No other active related claims.</p>"}
        </div>
        <label for="phase3AdminNotes"><strong>Internal Verification Notes</strong> (optional, admins only)</label>
        <textarea id="phase3AdminNotes" rows="4" placeholder="Internal verification notes"></textarea>
        <div class="modal-actions">
          <button type="button" data-action="cancel">Cancel</button>
          <button type="button" class="approve" data-action="approve">Approve Claim</button>
        </div>
      </div>
    </div>`;
  mountAdminActionOverlay(overlay);
  overlay.querySelector("#phase3AdminNotes")?.focus();
  overlay.querySelector('[data-action="cancel"]').addEventListener("click", () => closeAdminActionOverlay(null));
  overlay.querySelector('[data-action="approve"]').addEventListener("click", async () => {
    const approveButton = overlay.querySelector('[data-action="approve"]');
    approveButton.disabled = true;
    const closeClaimIds = [...overlay.querySelectorAll('input[name="relatedClaim"]:checked')]
      .map((input) => Number(input.value));
    const adminNotes = overlay.querySelector("#phase3AdminNotes").value.trim();
    const response = await apiFetch(`${BASE_URL}/claims/${claimId}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "approve", closeClaimIds, adminNotes }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      approveButton.disabled = false;
      return showErrorToast(body.error || "Approval failed.");
    }
    await completeAdminAction("Claim approved and selected related claims closed.");
  });
}

// ---------------------------------------------------------
//  Tiny XSS guard
// ---------------------------------------------------------

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ---------------------------------------------------------
//  Init
// ---------------------------------------------------------
  var _acInitialized = false;

  function initAdminClaims() {
    loadClaims();
    if (_acInitialized) return;
    _acInitialized = true;

    var _msgOverlay = document.getElementById("msgOverlay");
    if (_msgOverlay) _msgOverlay.addEventListener("click", function (e) {
      if (e.target === e.currentTarget) closeClaimModal();
    });

    var _closeClaimBtn = document.getElementById("closeClaimModal");
    if (_closeClaimBtn) _closeClaimBtn.addEventListener("click", closeClaimModal);

    var _detailOverlay = document.getElementById("claimDetailOverlay");
    if (_detailOverlay) _detailOverlay.addEventListener("click", function (e) {
      if (e.target === e.currentTarget) closeClaimModal();
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey && document.activeElement && document.activeElement.id === "adminMsgInput") {
        e.preventDefault();
        sendAdminMessage();
      }
    });

    var _srch = document.getElementById("claimRequestSearch");
    var _status = document.getElementById("claimRequestStatus");
    var filterQueue = function () {
      var value = (_srch?.value || "").toLowerCase().trim();
      var status = _status?.value || "";
      var filtered = _claims.filter(function (claim) {
        var matchesText = !value ||
          (claim.item_name || claim.itemName || "").toLowerCase().includes(value) ||
          (claim.student_email || claim.email || "").toLowerCase().includes(value) ||
          String(claim.student_id || "").includes(value);
        return matchesText && (!status || claim.status === status);
      });
      renderClaims(filtered);
    };
    if (_srch) _srch.addEventListener("input", filterQueue);
    if (_status) _status.addEventListener("change", filterQueue);
  }

  window.initAdminClaims = initAdminClaims;
  window.closeClaimModal   = closeClaimModal;
  window.closeMessageModal = closeMessageModal;
  window.sendMessage       = sendMessage;
  window.sendAdminMessage  = sendAdminMessage;

})();
