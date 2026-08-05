async function listNotifications(pool, user, { all = false } = {}) {
  const isAdmin = user.roles?.includes("admin");
  const params = [];
  const where = all && isAdmin ? "" : "WHERE n.user_id = $1";
  if (where) params.push(user.id);
  const result = await pool.query(
    `SELECT n.*, u.name AS user_name, u.email AS user_email
     FROM notifications n
     INNER JOIN users u ON u.id = n.user_id
     ${where}
     ORDER BY n.created_at DESC`,
    params
  );
  return result.rows;
}

async function markNotificationRead(pool, notificationId, userId) {
  const result = await pool.query(
    `UPDATE notifications SET read_at = COALESCE(read_at, NOW())
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    [notificationId, userId]
  );
  return result.rows[0] || null;
}

async function createNotification(pool, values) {
  const result = await pool.query(
    `INSERT INTO notifications
       (user_id, type, title, message, report_id, claim_id, match_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT DO NOTHING
     RETURNING *`,
    [
      values.userId,
      values.type,
      values.title,
      values.message,
      values.reportId || null,
      values.claimId || null,
      values.matchId || null,
    ]
  );
  return result.rows[0] || null;
}

module.exports = { createNotification, listNotifications, markNotificationRead };
