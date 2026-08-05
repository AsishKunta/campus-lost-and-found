// =============================================================
//  my-claims.js — student's personal claims + chat
// =============================================================

// ---------------------------------------------------------
//  Helpers
// ---------------------------------------------------------

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g,  "&amp;")
    .replace(/</g,  "&lt;")
    .replace(/>/g,  "&gt;")
    .replace(/"/g,  "&quot;")
    .replace(/'/g,  "&#39;");
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function capitalize(str) {
  if (!str) return "Pending";
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

// ---------------------------------------------------------
//  Resolve logged-in student email
// ---------------------------------------------------------

function getStudentEmail() {
  try {
    const user = JSON.parse(localStorage.getItem("currentUser"));
    if (user?.email) return user.email.toLowerCase();
  } catch (_) {}
  const session = localStorage.getItem("sessionEmail");
  if (session) return session.toLowerCase();
  return null;
}

// ---------------------------------------------------------
//  State
// ---------------------------------------------------------

let _allClaims      = [];
let _currentClaimId = null;
let _studentEmail   = null;
let _msgChannel     = null;

// ---------------------------------------------------------
//  Render the claims list
// ---------------------------------------------------------

function renderClaims(claims) {
  const container = document.getElementById("claimsList");
  container.innerHTML = "";

  if (!claims || claims.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-inbox"></i>
        <p>You haven't submitted any claims yet.</p>
      </div>`;
    return;
  }

  claims.forEach((claim) => {
    const card = document.createElement("div");
    card.className = "my-claim-card";

    const status = (claim.status || "pending").toLowerCase();
    const itemName = claim.item_name || "Unknown Item";
    const location = claim.location  || "—";
    const date     = formatDate(claim.created_at);

    card.innerHTML = `
      <h3>${escapeHtml(itemName)}</h3>
      <div class="card-meta">
        <span><i class="fas fa-map-marker-alt" style="color:#1e5faf;margin-right:4px;"></i>${escapeHtml(location)}</span>
        <span><i class="fas fa-calendar-alt" style="color:#1e5faf;margin-right:4px;"></i>${date}</span>
        <span class="card-status ${status}">${capitalize(status)}</span>
      </div>
      ${status === "pending" ? `
        <button type="button" class="cancel-claim-btn" data-claim-id="${claim.id}">
          Cancel Claim
        </button>` : ""}
    `;

    card.addEventListener("click", () => openModal(claim));
    card.querySelector(".cancel-claim-btn")?.addEventListener("click", (event) => {
      event.stopPropagation();
      cancelClaim(claim.id);
    });
    container.appendChild(card);
  });
}

async function cancelClaim(claimId) {
  const confirmed = await showConfirmationDialog({
    title: "Cancel Claim?",
    message: "Cancelling this claim removes only this claim. Your Lost Report remains active. You may claim another matching item later.",
    cancelLabel: "Keep Claim",
    confirmLabel: "Cancel Claim",
  });
  if (!confirmed) return;
  const response = await apiFetch(`${BASE_URL}/claims/${claimId}/cancel`, {
    method: "POST",
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    return showErrorToast(body.error || "Claim could not be cancelled.");
  }
  showSuccessToast("Claim cancelled. Your Lost Report remains active.");
  await loadClaims();
}

// ---------------------------------------------------------
//  Load claims from backend, filter by student email
// ---------------------------------------------------------

async function loadClaims() {
  const container = document.getElementById("claimsList");
  container.innerHTML = `<p style="text-align:center;color:#888;">Loading…</p>`;

  try {
    const res = await apiFetch(`${BASE_URL}/claims`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const all = await res.json();

    // Filter to only this student's claims
    if (_studentEmail) {
      _allClaims = all.filter(c =>
        (c.student_email || "").toLowerCase() === _studentEmail
      );
    } else {
      _allClaims = all; // fallback: show all if no email found
    }

    renderClaims(_allClaims);
  } catch (err) {
    console.error("loadClaims error:", err);
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-exclamation-circle"></i>
        <p>Failed to load claims. Is the backend running?</p>
      </div>`;
  }
}

// ---------------------------------------------------------
//  Open claim detail modal
// ---------------------------------------------------------

function openModal(claim) {
  _currentClaimId = claim.id;

  const imgSrc    = claim.image_url || "";
  const itemName  = claim.item_name || "Unknown Item";
  const studentId = claim.student_id || "";
  const location  = claim.location || "";
  const status    = claim.status   || "pending";

  // Image
  const imgWrap = document.getElementById("mcImgWrap");
  if (imgSrc) {
    imgWrap.innerHTML = `
      <div class="mc-img-wrap">
        <img src="${escapeHtml(imgSrc)}" class="mc-img" alt="Claim image" />
      </div>`;
  } else {
    imgWrap.innerHTML = `
      <div class="mc-img-placeholder">
        <i class="fas fa-image" style="font-size:2rem;margin-right:8px;"></i>No image
      </div>`;
  }

  document.getElementById("mcTitle").textContent = itemName;
  document.getElementById("mcDetails").innerHTML = `
    <strong>Claim ID:</strong> #${escapeHtml(String(claim.id))}<br>
    <strong>Status:</strong> ${capitalize(status)}<br>
    ${studentId ? `<strong>Student ID:</strong> ${escapeHtml(String(studentId))}<br>` : ""}
    ${location  ? `<strong>Location:</strong> ${escapeHtml(location)}<br>` : ""}
    ${claim.created_at ? `<strong>Submitted:</strong> ${formatDate(claim.created_at)}<br>` : ""}
    <br>
    <strong>Description:</strong> ${escapeHtml(claim.description || "No description")}
  `;

  document.getElementById("mcOverlay").classList.add("open");

  // Clear previous messages and load fresh
  document.getElementById("chatBox").innerHTML = "";
  loadMessages(claim.id);
}

function closeModal() {
  document.getElementById("mcOverlay").classList.remove("open");
  _currentClaimId = null;
  // Tear down real-time subscription
  _msgChannel = null;
}

// ---------------------------------------------------------
//  Load messages through the authorized backend.
// ---------------------------------------------------------

async function loadMessages(claimId) {
  const chatBox = document.getElementById("chatBox");
  if (!chatBox) return;
  chatBox.innerHTML = `<p style="color:#aaa;font-size:13px;text-align:center;">Loading…</p>`;

  console.log("[my-claims loadMessages] Fetching for claim_id:", claimId);

  const response = await apiFetch(`${BASE_URL}/messages/${claimId}`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    console.error("[my-claims loadMessages] FETCH FAILED:", error.error);
    chatBox.innerHTML = `<p style="color:#ef4444;font-size:13px;text-align:center;">Failed to load messages. Check console.</p>`;
    return;
  }
  renderMessages(await response.json());
}

function messageBubble(m) {
  // Own messages = right/blue; other side = left/gray (role-aware)
  const user  = getCurrentUser();
  const isOwn = m.sender_type === user.role;
  const side  = isOwn ? "student" : "admin";
  const label = isOwn ? "You" : "Admin";
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

function renderMessages(messages) {
  const chatBox = document.getElementById("chatBox");
  if (!chatBox) return;

  if (!messages || messages.length === 0) {
    chatBox.innerHTML = `<p style="color:#aaa;font-size:13px;text-align:center;">No messages yet.</p>`;
    return;
  }

  chatBox.innerHTML = messages.map(messageBubble).join("");
  chatBox.scrollTop = chatBox.scrollHeight;
}

function appendMessageToUI(m) {
  const chatBox = document.getElementById("chatBox");
  if (!chatBox) return;
  const placeholder = chatBox.querySelector("p");
  if (placeholder) placeholder.remove();
  chatBox.insertAdjacentHTML("beforeend", messageBubble(m));
  chatBox.scrollTop = chatBox.scrollHeight;
}

function subscribeToMessages(claimId) {
  _msgChannel = claimId;
}

// ---------------------------------------------------------
//  Send a student message
// ---------------------------------------------------------

async function sendStudentMessage() {
  if (!_currentClaimId) return;
  const input = document.getElementById("studentMsgInput");
  const text  = (input?.value || "").trim();
  if (!text) return;

  input.value    = "";
  input.disabled = true;

  const _cu = getCurrentUser();
  const payload = { claim_id: _currentClaimId, recipient_role: "admin", message: text };

  console.log("[sendStudentMessage] Inserting:", payload);

  const response = await apiFetch(`${BASE_URL}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    showErrorToast(error.error || "Failed to send message.");
    input.value    = text;
    input.disabled = false;
    return;
  }

  // Reload to confirm persistence; real-time also appends if active
  input.disabled = false;
  input.focus();
  await loadMessages(_currentClaimId);
}

// ---------------------------------------------------------
//  Init
// ---------------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  _studentEmail = getCurrentUser().email;

  loadClaims();

  // Close modal
  document.getElementById("mcClose").addEventListener("click", closeModal);
  document.getElementById("mcOverlay").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeModal();
  });

  // Send button
  document.getElementById("studentSendBtn").addEventListener("click", sendStudentMessage);

  // Enter key to send
  document.getElementById("studentMsgInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendStudentMessage(); }
  });

  // Search filter
  const searchInput = document.getElementById("claimSearch");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      const value = searchInput.value.toLowerCase().trim();
      if (!value) { renderClaims(_allClaims); return; }
      const filtered = _allClaims.filter(c =>
        (c.item_name || "").toLowerCase().includes(value) ||
        (c.location  || "").toLowerCase().includes(value)
      );
      renderClaims(filtered);
    });
  }
});
