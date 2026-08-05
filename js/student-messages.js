// =============================================================
//  student-messages.js — Student conversation messaging UI
//  Shows only conversations (claims that have messages).
//  Unread indicators via is_read field in messages table.
//
//  REQUIRED SQL (run once in Supabase):
//    ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_read boolean DEFAULT false;
// =============================================================

// ---------------------------------------------------------
//  State
// ---------------------------------------------------------

let _allClaims      = [];   // conversations loaded
let _filteredClaims = [];   // after search filter
let _selectedId     = null; // currently open claim id
let _msgChannel     = null; // real-time channel for open conversation
let _globalChannel  = null; // real-time channel for sidebar unread updates
let _studentEmail   = null;
let _unreadMap      = {};   // { [claimId]: unread count }

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

function formatTimestamp(iso) {
  if (!iso) return "";
  const now     = new Date();
  const d       = new Date(iso);
  const diffSec = Math.floor((now - d) / 1000);

  if (diffSec < 10)  return "Just now";
  if (diffSec < 60)  return diffSec + "s ago";

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60)  return diffMin + "m ago";

  const timeStr = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const isToday =
    d.getDate()     === now.getDate() &&
    d.getMonth()    === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (isToday) return "Today " + timeStr;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    d.getDate()     === yesterday.getDate() &&
    d.getMonth()    === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear();
  if (isYesterday) return "Yesterday " + timeStr;

  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " + timeStr;
}

function _smFormatDate(dateStr) {
  if (!dateStr) return "\u2014";
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  });
}

function capitalize(str) {
  if (!str) return "Pending";
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

// ---------------------------------------------------------
//  Load conversations: student claims that actually have messages
// ---------------------------------------------------------

async function loadConversations() {
  if (!_studentEmail) {
    renderClaimList([]);
    return;
  }

  try {
    const res = await apiFetch(
      `${BASE_URL}/messages/conversations?role=student&email=${encodeURIComponent(_studentEmail)}`
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const claimData = await res.json();
    _allClaims      = claimData || [];
    _filteredClaims = _allClaims;

    await loadUnreadCounts();
    renderClaimList(_filteredClaims);
  } catch (error) {
    console.error("[student-messages] loadConversations error:", error);
    renderClaimList([]);
  }
}

// ---------------------------------------------------------
//  Load unread counts (admin messages not yet read by student)
// ---------------------------------------------------------

async function loadUnreadCounts() {
  _unreadMap = {};
}

// ---------------------------------------------------------
//  Search filter
// ---------------------------------------------------------

function filterClaims(query) {
  const q = (query || "").toLowerCase();
  _filteredClaims = _allClaims.filter(
    (c) =>
      (c.item_name   || "").toLowerCase().includes(q) ||
      (c.description || "").toLowerCase().includes(q)
  );
  renderClaimList(_filteredClaims);
}

// ---------------------------------------------------------
//  Left panel — render conversation list
// ---------------------------------------------------------

function renderClaimList(claims) {
  const panel = document.getElementById("claimsPanel");

  Array.from(panel.children).forEach((child) => {
    if (!child.classList.contains("claims-panel-header")) child.remove();
  });

  if (!claims || claims.length === 0) {
    const empty = document.createElement("div");
    empty.className   = "panel-empty";
    empty.textContent = "No conversations yet.";
    panel.appendChild(empty);
    return;
  }

  claims.forEach((claim) => {
    const status      = (claim.status || "pending").toLowerCase();
    const isActive    = String(claim.id) === String(_selectedId);
    const unreadCount = _unreadMap[claim.id] || 0;
    const hasUnread   = unreadCount > 0 && !isActive;

    const item = document.createElement("div");
    item.className  = "claim-list-item"
      + (isActive  ? " active"  : "")
      + (hasUnread ? " unread"  : "");
    item.dataset.id = claim.id;

    item.innerHTML =
      '<div class="claim-list-row">' +
        '<div class="claim-list-id">Claim #' + String(claim.id).slice(0, 8) + "</div>" +
        (hasUnread ? '<span class="unread-dot">' + unreadCount + "</span>" : "") +
      "</div>" +
      '<div class="claim-list-name">' + escapeHtml(claim.item_name || "Unnamed Item") + "</div>" +
      '<div class="claim-list-sub">'  + escapeHtml(claim.location  || "\u2014")       + "</div>" +
      '<span class="list-status-badge badge-' + status + '">' + capitalize(status) + "</span>";

    item.addEventListener("click", () => selectClaim(claim));
    panel.appendChild(item);
  });
}

// ---------------------------------------------------------
//  Select a conversation
// ---------------------------------------------------------

async function selectClaim(claim) {
  if (_msgChannel) { _msgChannel = null; }

  _selectedId = claim.id;

  // Mark admin messages as read and clear badge immediately
  await markMessagesRead(claim.id);
  renderClaimList(_filteredClaims);

  const status = (claim.status || "pending").toLowerCase();

  document.getElementById("headerClaimId").textContent  = "Claim #" + String(claim.id).slice(0, 8);
  document.getElementById("headerItemName").textContent = claim.item_name || "Unnamed Item";
  document.getElementById("headerLocation").textContent = claim.location  || "\u2014";
  document.getElementById("headerDate").textContent     = _smFormatDate(claim.created_at);

  const statusEl = document.getElementById("headerStatus");
  statusEl.textContent = capitalize(status);
  statusEl.className   = "hdr-badge badge-" + status;

  document.getElementById("emptyState").style.display       = "none";
  document.getElementById("conversationView").style.display = "flex";

  loadMessages(claim.id);
}

// ---------------------------------------------------------
//  Mark admin messages as read (Supabase + local map)
// ---------------------------------------------------------

async function markMessagesRead(claimId) {
  _unreadMap[claimId] = 0;
}

// ---------------------------------------------------------
//  Load messages for selected conversation
// ---------------------------------------------------------

async function loadMessages(claimId) {
  const history = document.getElementById("messageHistory");
  history.innerHTML = '<p class="no-messages-hint">Loading\u2026</p>';

  console.log("[student-messages loadMessages] claim_id:", claimId, "(type:", typeof claimId, ")");

  try {
    const res = await apiFetch(`${BASE_URL}/messages/${claimId}?viewer=student`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();

    console.log("[student-messages loadMessages] messages loaded for a claim in student view:", {
      claim_id: claimId,
      count: data?.length ?? 0,
      rows: data,
    });

    renderMessageHistory(data || []);
    subscribeToMessages(claimId);
  } catch (error) {
    console.error("[student-messages loadMessages] FETCH FAILED:", error.message);
    history.innerHTML = '<p class="no-messages-hint" style="color:#ef4444;">Failed to load messages.</p>';
  }
}

// ---------------------------------------------------------
//  Render all messages
// ---------------------------------------------------------

function renderMessageHistory(messages) {
  const history = document.getElementById("messageHistory");
  history.innerHTML = "";

  if (!messages || messages.length === 0) {
    history.innerHTML = '<p class="no-messages-hint">No messages yet. Start the conversation!</p>';
    return;
  }

  messages.forEach((m) => history.appendChild(buildBubble(m)));
  history.scrollTop = history.scrollHeight;
}

// ---------------------------------------------------------
//  Build a single message bubble
// ---------------------------------------------------------

function buildBubble(m) {
  // On the student page, the viewer is always "student".
  // Do NOT rely on localStorage role switch — it can be flipped to "admin"
  // which would cause all messages to align on the same side.
  const isOwn = (m.sender_role || m.sender_type) === "student";
  const side  = isOwn ? "from-student" : "from-admin";

  console.log("[student-messages buildBubble] sender_type:", m.sender_type, "→ side:", side, "| msg:", m.message);

  const bubble = document.createElement("div");
  bubble.className = "msg-bubble " + side;
  bubble.innerHTML =
    escapeHtml(m.message) +
    '<span class="msg-meta">' +
      (isOwn ? "" : "Admin &middot; ") +
      formatTimestamp(m.created_at) +
    "</span>";
  return bubble;
}

// ---------------------------------------------------------
//  Append a new bubble (called by real-time handler)
// ---------------------------------------------------------

function appendBubble(m) {
  const history = document.getElementById("messageHistory");
  if (!history) return;
  const hint = history.querySelector(".no-messages-hint");
  if (hint) hint.remove();
  history.appendChild(buildBubble(m));
  history.scrollTop = history.scrollHeight;
}

// ---------------------------------------------------------
//  Real-time: subscribe to the currently open conversation
// ---------------------------------------------------------

function subscribeToMessages(claimId) {
  _msgChannel = null;
}

// ---------------------------------------------------------
//  Real-time: global channel — unread sidebar highlights
// ---------------------------------------------------------

function subscribeGlobal() {
  _globalChannel = null;
}

// ---------------------------------------------------------
//  Send message
// ---------------------------------------------------------

async function sendMessage() {
  if (!_selectedId) return;

  const input = document.getElementById("msgInput");
  const text  = (input?.value || "").trim();
  if (!text) { input?.focus(); return; }

  input.value    = "";
  input.disabled = true;

  const cu = getCurrentUser();
  const payload = {
    claim_id:    _selectedId,
    sender_role: cu.role,
    recipient_role: "admin",
    sender_id:   cu.email,
    message:     text,
  };

  console.log("[student-messages sendMessage] Inserting:", payload);

  try {
    const res = await apiFetch(`${BASE_URL}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    console.log("[student-messages sendMessage] saved message record:", data);
  } catch (error) {
    console.error("[student-messages sendMessage] INSERT FAILED:", error.message);
    alert("Failed to send: " + error.message);
    input.value    = text;
    input.disabled = false;
    return;
  }

  input.disabled = false;
  input.focus();
  await loadMessages(_selectedId);
}

// ---------------------------------------------------------
//  Init
// ---------------------------------------------------------

let _conversationsInitialized = false;

async function initConversations() {
  if (_conversationsInitialized) {
    await loadConversations(); // refresh sidebar on every visit
    return;
  }
  _conversationsInitialized = true;
  _studentEmail = getCurrentUser().email;

  document.getElementById("sendBtn").addEventListener("click", sendMessage);

  document.getElementById("msgInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  await loadConversations();
  subscribeGlobal();
}

// router.js handles registerPage('conversations', ...) with role dispatch
window.initStudentMessages = initConversations;
