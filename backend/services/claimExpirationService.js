const { createNotification } = require("./notificationService");

async function expirePendingClaims(pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `UPDATE claims
       SET status = 'expired', closed_at = NOW()
       WHERE status = 'pending' AND expires_at <= NOW()
       RETURNING id, user_id`
    );
    for (const claim of result.rows) {
      await client.query(
        `INSERT INTO claim_history
           (claim_id, event_type, from_status, to_status, reason)
         VALUES ($1, 'expired', 'pending', 'expired',
                 'No administrator action occurred before the claim expiration date.')`,
        [claim.id]
      );
      await createNotification(client, {
        userId: claim.user_id,
        type: "claim_expired",
        title: "Claim expired",
        message: "Your claim was closed because no administrator action occurred before its expiration date.",
        claimId: claim.id,
      });
    }
    await client.query("COMMIT");
    return result.rows;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { expirePendingClaims };
