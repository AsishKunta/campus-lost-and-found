const crypto = require("crypto");
const {
  AuthError,
  SALT_ROUNDS,
  normalizeEmail,
  validatePassword,
} = require("./authService");

function hashResetToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function createRawResetToken() {
  return crypto.randomBytes(32).toString("base64url");
}

async function requestPasswordReset(pool, email, options) {
  const normalizedEmail = normalizeEmail(email);
  const genericResult = {
    message: "If an account exists for that email, a password reset link will be sent.",
  };
  if (!normalizedEmail) return genericResult;

  const userResult = await pool.query("SELECT id, email FROM users WHERE email = $1", [normalizedEmail]);
  const user = userResult.rows[0];
  if (!user) return genericResult;

  const token = createRawResetToken();
  const tokenHash = hashResetToken(token);
  const expiresAt = new Date(Date.now() + options.ttlMs);
  await pool.query(
    `UPDATE password_reset_tokens
     SET used_at = NOW()
     WHERE user_id = $1 AND used_at IS NULL`,
    [user.id]
  );
  const inserted = await pool.query(
    `INSERT INTO password_reset_tokens
       (user_id, token_hash, expires_at, requested_ip)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [user.id, tokenHash, expiresAt, options.ipAddress || null]
  );

  try {
    const delivered = await options.deliver({ email: user.email, token });
    if (!delivered) {
      await pool.query("DELETE FROM password_reset_tokens WHERE id = $1", [inserted.rows[0].id]);
    }
  } catch (error) {
    await pool.query("DELETE FROM password_reset_tokens WHERE id = $1", [inserted.rows[0].id]);
    throw error;
  }
  return genericResult;
}

async function resetPassword(pool, bcrypt, input) {
  const token = String(input?.token || "").trim();
  const password = validatePassword(input?.password);
  if (password !== String(input?.passwordConfirm || "")) {
    throw new AuthError("Passwords do not match.", 400, "PASSWORD_CONFIRMATION_MISMATCH");
  }
  if (!token || token.length > 256) {
    throw new AuthError("This password reset link is invalid or expired.", 400, "RESET_TOKEN_INVALID");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const tokenResult = await client.query(
      `SELECT prt.id, prt.user_id
       FROM password_reset_tokens prt
       WHERE prt.token_hash = $1
         AND prt.used_at IS NULL
         AND prt.expires_at > NOW()
       FOR UPDATE`,
      [hashResetToken(token)]
    );
    const resetRecord = tokenResult.rows[0];
    if (!resetRecord) {
      await client.query("ROLLBACK");
      throw new AuthError("This password reset link is invalid or expired.", 400, "RESET_TOKEN_INVALID");
    }
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    await client.query("UPDATE users SET password = $2 WHERE id = $1", [resetRecord.user_id, passwordHash]);
    await client.query("UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1", [resetRecord.id]);
    await client.query(
      "UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL",
      [resetRecord.user_id]
    );
    await client.query("COMMIT");
    return { message: "Password reset successful. Sign in with your new password." };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  createRawResetToken,
  hashResetToken,
  requestPasswordReset,
  resetPassword,
};
