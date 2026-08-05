const pool = require("../db");
const { hasRole } = require("../middleware/authorize");
const {
  listNotifications,
  markNotificationRead,
} = require("../services/notificationService");
const { logError } = require("../utils/safeLogger");

exports.getNotifications = async (req, res) => {
  try {
    const all = String(req.query.scope || "").toLowerCase() === "all";
    if (all && !hasRole(req.user, "admin")) {
      return res.status(403).json({ error: "Admin role required.", code: "ADMIN_REQUIRED" });
    }
    return res.json(await listNotifications(pool, req.user, { all }));
  } catch (error) {
    logError("notifications.list_failed", error);
    return res.status(500).json({ error: "Failed to fetch notifications." });
  }
};

exports.markRead = async (req, res) => {
  try {
    const notification = await markNotificationRead(pool, req.params.id, req.user.id);
    if (!notification) {
      return res.status(404).json({ error: "Notification not found." });
    }
    return res.json(notification);
  } catch (error) {
    logError("notifications.mark_read_failed", error);
    return res.status(500).json({ error: "Failed to update notification." });
  }
};
