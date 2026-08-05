function notificationEscape(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function loadNotifications() {
  const list = document.getElementById("notificationList");
  const status = document.getElementById("notificationStatus");
  const user = getCurrentUser();
  const scope = user.role === "admin" ? "?scope=all" : "";
  try {
    const response = await window.apiFetch(`${window.BASE_URL}/notifications${scope}`);
    const notifications = await response.json();
    if (!response.ok) throw new Error(notifications.error);
    status.textContent = notifications.length
      ? `${notifications.length} notification${notifications.length === 1 ? "" : "s"}`
      : "No notifications yet.";
    list.innerHTML = notifications.map((notification) => `
      <article class="report-card ${notification.read_at ? "" : "notification-unread"}">
        <h3>${notificationEscape(notification.title)}</h3>
        <p>${notificationEscape(notification.message)}</p>
        <small>${new Date(notification.created_at).toLocaleString()}</small>
        ${!notification.read_at && notification.user_id === user.id
          ? `<button type="button" data-read-id="${notification.id}">Mark read</button>`
          : ""}
      </article>`).join("");
    list.querySelectorAll("[data-read-id]").forEach((button) => {
      button.addEventListener("click", async () => {
        const response = await window.apiFetch(
          `${window.BASE_URL}/notifications/${button.dataset.readId}/read`,
          { method: "PATCH" }
        );
        if (response.ok) await loadNotifications();
      });
    });
  } catch (error) {
    status.textContent = error.message || "Notifications could not be loaded.";
    list.innerHTML = "";
  }
}

document.addEventListener("DOMContentLoaded", loadNotifications);
