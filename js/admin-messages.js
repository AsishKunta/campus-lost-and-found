(function () {
// =========================================================
//  admin-messages.js — Admin conversation messaging UI
//  Shows only conversations (claims that have messages).
//  Unread indicators for messages from students.
//
//  REQUIRED SQL (run once in Supabase):
//    ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_read boolean DEFAULT false;
// =========================================================

// ---------------------------------------------------------
//  State
// ---------------------------------------------------------

let currentClaimId   = null; // currently open claim id
let _adminAllClaims  = [];   // conversations list
let _adminFiltered   = [];   // after search filter
let _adminMsgChannel = null; // real-time for open conversation
let _adminGlobal     = null; // real-time for sidebar highlights
let _adminUnreadMap  = {};   // { [claimId]: unread count }

function groupMessagesByClaim(messages) {
  const grouped = new Map();

  (messages || []).forEach((row) => {
    const claimId = row?.claim_id;
    if (!claimId) return;

    const createdAt = row.created_at || row.last_message_at || null;
    const existing = grouped.get(claimId);

    if (!existing) {
      grouped.set(claimId, {
        id: claimId,
        claim_id: claimId,
        item_name: row.item_name,
        student_email: row.student_email,
        student_id: row.student_id,
        location: row.location,
        status: row.status,
        latest_message_preview: row.message || row.latest_message_preview || "",
        latest_timestamp: createdAt,
        last_message_at: createdAt,
        created_at: row.created_at,
        message_count: 1,
      });
      return;
    }

    existing.message_count += 1;
    const oldTs = new Date(existing.latest_timestamp || 0).getTime();
    const newTs = new Date(createdAt || 0).getTime();
    if (newTs >= oldTs) {
      existing.latest_message_preview = row.message || existing.latest_message_preview || "";
      existing.latest_timestamp = createdAt;
      existing.last_message_at = createdAt;
    }
  });

  return Array.from(grouped.values()).sort((a, b) => {
    const ta = new Date(a.latest_timestamp || a.last_message_at || a.created_at || 0).getTime();
    const tb = new Date(b.latest_timestamp || b.last_message_at || b.created_at || 0).getTime();
    return tb - ta;
  });
}

function parseConversationsPayload(payload) {
  if (!payload) return { allMessages: [], conversations: [] };

  if (Array.isArray(payload)) {
    const looksLikeMessages = payload.some((row) => row && row.claim_id && row.message);
    return {
      allMessages: looksLikeMessages ? payload : [],
      conversations: looksLikeMessages ? groupMessagesByClaim(payload) : payload,
    };
  }

  const allMessages = Array.isArray(payload.messages) ? payload.messages : [];
  const conversations = Array.isArray(payload.conversations)
    ? payload.conversations
    : (allMessages.length ? groupMessagesByClaim(allMessages) : []);

  return { allMessages, conversations };
}

// ---------------------------------------------------------
//  Load conversations: all claims that have at least one message
// ---------------------------------------------------------

async function loadClaims() {
  try {
    const res = await apiFetch(`${BASE_URL}/messages/conversations?scope=all&includeAllMessages=true`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    console.log("[admin-messages] fetched admin conversations response (raw):", payload);

    const { allMessages, conversations } = parseConversationsPayload(payload);
    const claimData = conversations;

    console.log("[admin-messages] all messages loaded for admin:", {
      count: allMessages.length,
      rows: allMessages,
    });

    const groupedDebug = (claimData || []).map((c) => ({
      claim_id: c.claim_id || c.id,
      item_name: c.item_name,
      student_email: c.student_email,
      student_id: c.student_id,
      latest_message_preview: c.latest_message_preview,
      latest_timestamp: c.latest_timestamp,
      message_count: c.message_count,
    }));
    console.log("[admin-messages] grouped conversations by claim_id:", groupedDebug);

    _adminAllClaims = claimData || [];
    _adminFiltered  = _adminAllClaims;

    await loadAdminUnreadCounts();
    renderClaimList(_adminFiltered);
  } catch (err) {
    console.error("[admin-messages] loadClaims error:", err);
    renderClaimList([]);
  }
}

// ---------------------------------------------------------
//  Load unread counts (student messages not yet read by admin)
// ---------------------------------------------------------

async function loadAdminUnreadCounts() {
  _adminUnreadMap = {};
}

// ---------------------------------------------------------
//  Search / filter
// ---------------------------------------------------------

function filterClaims(query) {
  const q = (query || "").toLowerCase();
  _adminFiltered = _adminAllClaims.filter(
    (c) =>
      (c.item_name     || "").toLowerCase().includes(q) ||
      (c.student_email || "").toLowerCase().includes(q) ||
      String(c.student_id || "").toLowerCase().includes(q) ||
      String(c.id || c.claim_id || "").toLowerCase().includes(q)
  );
  renderClaimList(_adminFiltered);
}

// ---------------------------------------------------------
//  Left panel — render conversation list
// ---------------------------------------------------------

function renderClaimList(claims) {
  const panel = document.getElementById("claimsPanel");
  if (!panel) {
    console.log("[admin-messages] target DOM container is null: #claimsPanel");
    return;
  }

  Array.from(panel.children).forEach((child) => {
    if (!child.classList.contains("claims-panel-header")) child.remove();
  });

  if (!claims || claims.length === 0) {
    const empty = document.createElement("div");
    empty.style.cssText = "padding:16px;font-size:13px;color:#9ca3af;text-align:center;";
    empty.textContent   = "No conversations yet.";
    panel.appendChild(empty);
    return;
  }

  claims.forEach((claim) => {
    const claimId = claim.claim_id || claim.id;
    const status      = (claim.status || "pending").toLowerCase();
    const isActive    = String(claimId) === String(currentClaimId);
    const unreadCount = _adminUnreadMap[claimId] || 0;
    const hasUnread   = unreadCount > 0 && !isActive;
    const latestPreview = String(claim.latest_message_preview || "").trim();
    const latestTimestamp = claim.latest_timestamp || claim.last_message_at || null;
    const studentIdentity = claim.student_email || claim.student_id || "—";

    const item = document.createElement("div");
    item.className  = "claim-list-item"
      + (isActive  ? " active"  : "")
      + (hasUnread ? " unread"  : "");
    item.dataset.id = claimId;

    item.innerHTML =
      '<div class="claim-list-row">' +
        '<div class="claim-list-id">Claim #' + String(claimId).slice(0, 8) + "</div>" +
        (hasUnread ? '<span class="unread-dot">' + unreadCount + "</span>" : "") +
      "</div>" +
      '<div class="claim-list-name">'  + escapeHtml(claim.item_name     || "Unnamed Item") + "</div>" +
      '<div class="claim-list-email">' + escapeHtml(studentIdentity) + "</div>" +
      '<div class="claim-list-email">' + escapeHtml(latestPreview ? truncateText(latestPreview, 48) : "No messages yet") + "</div>" +
      '<div class="claim-list-id">' + escapeHtml(formatListTimestamp(latestTimestamp)) + "</div>" +
      '<span class="list-status-badge badge-' + status + '">' + capitalize(status) + "</span>";

    item.addEventListener("click", () => openClaim({ ...claim, id: claimId }));
    panel.appendChild(item);
  });

  console.log(
    "[admin-messages] final conversation list items rendered:",
    claims.map((c) => ({
      claim_id: c.claim_id || c.id,
      item_name: c.item_name,
      student_email: c.student_email,
      student_id: c.student_id,
      latest_message_preview: c.latest_message_preview,
      latest_timestamp: c.latest_timestamp || c.last_message_at,
      status: c.status,
    }))
  );
  console.log("[admin-messages] number of rendered conversation rows:", claims.length);
}

// ---------------------------------------------------------
//  Open a conversation
// ---------------------------------------------------------

async function openClaim(claim) {
  if (_adminMsgChannel) _adminMsgChannel = null;

  currentClaimId = claim.id;
  console.log("Selected claim:", currentClaimId);

  // Mark student messages as read and clear badge
  await markAdminMessagesRead(claim.id);
  renderClaimList(_adminFiltered);

  const status   = (claim.status || "pending").toLowerCase();
  const isClosed = status === "approved" || status === "rejected";

  document.getElementById("headerClaimId").textContent  = "Claim #" + String(claim.id).slice(0, 8);
  document.getElementById("headerItemName").textContent = claim.item_name     || "Unnamed Item";
  document.getElementById("headerEmail").textContent    = claim.student_email || "\u2014";
  document.getElementById("headerLocation").textContent = claim.location      || "\u2014";

  const statusEl = document.getElementById("headerStatus");
  statusEl.textContent = capitalize(status);
  statusEl.className   = "hdr-badge badge-" + status;

  document.getElementById("closedBanner").style.display = isClosed ? "flex" : "none";

  const input   = document.getElementById("msgInput");
  const sendBtn = document.getElementById("sendBtn");
  input.disabled    = isClosed;
  sendBtn.disabled  = isClosed;
  input.placeholder = isClosed ? "This claim is closed." : "Type a message\u2026";
  input.value = "";

  document.getElementById("emptyState").style.display       = "none";
  document.getElementById("conversationView").style.display = "flex";

  loadMessages(currentClaimId);
}

// ---------------------------------------------------------
//  Mark student messages as read (Supabase + local map)
// ---------------------------------------------------------

async function markAdminMessagesRead(claimId) {
  _adminUnreadMap[claimId] = 0;
}

// ---------------------------------------------------------
//  Load messages from Supabase
// ---------------------------------------------------------

async function loadMessages(claimId) {
  console.log("Loading messages for:", claimId);

  const history = document.getElementById("messageHistory");
  if (!history) {
    console.log("[admin-messages] target DOM container is null: #messageHistory");
    return;
  }
  history.innerHTML = '<p class="no-messages-hint">Loading\u2026</p>';

  try {
    const res = await apiFetch(`${BASE_URL}/messages/${claimId}?viewer=admin`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    console.log("[admin-messages loadMessages] messages loaded for claim in admin view:", {
      claim_id: claimId,
      count: data?.length ?? 0,
      rows: data,
    });

    renderMessages(data || []);
    subscribeToMessages(claimId);
  } catch (error) {
    console.error("[admin-messages loadMessages] FETCH FAILED:", error.message);
    history.innerHTML = '<p class="no-messages-hint" style="color:#ef4444;">Failed to load messages.</p>';
  }
}

// ---------------------------------------------------------
//  Render all messages
// ---------------------------------------------------------

function renderMessages(messages) {
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
  const isAdmin = (m.sender_role || m.sender_type) === "admin";
  const bubble  = document.createElement("div");
  bubble.className = "msg-bubble " + (isAdmin ? "from-admin" : "from-student");
  bubble.innerHTML =
    escapeHtml(m.message) +
    '<span class="msg-meta">' +
      (isAdmin ? "You" : "Student") +
      " \u00b7 " + formatTimestamp(m.created_at) +
    "</span>";
  return bubble;
}

// ---------------------------------------------------------
//  Append a new bubble (real-time handler)
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
  _adminMsgChannel = null;
}

// ---------------------------------------------------------
//  Real-time: global channel — sidebar unread highlights
// ---------------------------------------------------------

function subscribeAdminGlobal() {
  _adminGlobal = null;
}

// ---------------------------------------------------------
//  Send admin message
// ---------------------------------------------------------

async function sendAdminMessage() {
  console.log("\ud83d\udd25 Send button clicked");

  if (!currentClaimId) {
    console.error("\u274c currentClaimId is missing");
    alert("Select a claim first");
    return;
  }

  const input = document.getElementById("msgInput");
  const text  = input.value.trim();
  if (!text) return;

  console.log("Sending message — claim_id:", currentClaimId, "(type:", typeof currentClaimId, ")", "text:", text);

  input.disabled = true;

  const insertPayload = {
    claim_id:    currentClaimId,
    sender_role: "admin",
    recipient_role: "student",
    sender_id:   "admin",
    message:     text,
  };

  console.log("[admin send] outgoing admin message payload:", insertPayload);

  try {
    const res = await apiFetch(`${BASE_URL}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(insertPayload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    console.log("[admin send] saved message record:", data);
  } catch (error) {
    console.error("INSERT FAILED:", error.message);
    alert("Insert failed: " + error.message);
    input.disabled = false;
    return;
  }

  input.value    = "";
  input.disabled = false;
  input.focus();

  await loadMessages(currentClaimId);
}

// ---------------------------------------------------------
//  Helpers
// ---------------------------------------------------------

function capitalize(str) {
  if (!str) return "Pending";
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function formatTimestamp(iso) {
  if (!iso) return "";
  const now     = new Date();
  const d       = new Date(iso);
  const diffSec = Math.floor((now - d) / 1000);

  if (diffSec < 10)  return "Just now";
  if (diffSec < 60)  return diffSec + "s ago";

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60)  return diffMin + " min ago";

  const timeStr = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

  const isToday =
    d.getDate()     === now.getDate()     &&
    d.getMonth()    === now.getMonth()    &&
    d.getFullYear() === now.getFullYear();
  if (isToday) return "Today at " + timeStr;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    d.getDate()     === yesterday.getDate()     &&
    d.getMonth()    === yesterday.getMonth()    &&
    d.getFullYear() === yesterday.getFullYear();
  if (isYesterday) return "Yesterday at " + timeStr;

  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " at " + timeStr;
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g,  "&amp;")
    .replace(/</g,  "&lt;")
    .replace(/>/g,  "&gt;")
    .replace(/"/g,  "&quot;")
    .replace(/'/g,  "&#39;");
}

function truncateText(value, maxLen) {
  const text = String(value || "");
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + "…";
}

function formatListTimestamp(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------
//  Init
// ---------------------------------------------------------
  var _amInitialized = false;

  async function initAdminMessages() {
    console.log("[admin-messages] initAdminMessages called");
    if (!document.getElementById("claimsPanel")) {
      console.log("[admin-messages] target DOM container is null during init: #claimsPanel");
    }
    if (!document.getElementById("conversationView")) {
      console.log("[admin-messages] target DOM container is null during init: #conversationView");
    }

    if (!_amInitialized) {
      _amInitialized = true;

      var _sendBtn = document.getElementById("sendBtn");
      if (_sendBtn && !_sendBtn._amBound) {
        _sendBtn._amBound = true;
        _sendBtn.addEventListener("click", sendAdminMessage);
      }

      var _msgInput = document.getElementById("msgInput");
      if (_msgInput && !_msgInput._amBound) {
        _msgInput._amBound = true;
        _msgInput.addEventListener("keydown", function (e) {
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendAdminMessage(); }
        });
      }

      subscribeAdminGlobal();
    }

    await loadClaims();
  }

  window.initAdminMessages = initAdminMessages;
  window.sendAdminMessage  = sendAdminMessage;
  window.filterClaims      = filterClaims;

})();
