const bcrypt = require("bcrypt");
const crypto = require("crypto");

async function loadOrCreateDevelopmentUser(pool, config) {
  if (!config.developmentBypassEnabled) return null;
  return (async () => {
    let result = await pool.query(
      "SELECT id, name, email, student_id, role, preferred_workspace, created_at FROM users WHERE email = $1",
      [config.developmentUserEmail]
    );
    if (!result.rows[0]) {
      const unusablePassword = await bcrypt.hash(
        crypto.randomBytes(32).toString("hex"),
        12
      );
      result = await pool.query(
        `INSERT INTO users (name, email, password, preferred_workspace)
         VALUES ($1, $2, $3, 'student')
         ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
         RETURNING id, name, email, student_id, role, preferred_workspace, created_at`,
        [config.developmentUserName, config.developmentUserEmail, unusablePassword]
      );
    }
    const user = result.rows[0];
    await pool.query(
      `INSERT INTO user_roles (user_id, role)
       VALUES ($1, 'student'), ($1, 'admin')
       ON CONFLICT DO NOTHING`,
      [user.id]
    );
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      studentId: user.student_id,
      role: user.preferred_workspace || "student",
      roles: ["student", "admin"],
      preferredWorkspace: user.preferred_workspace || "student",
      createdAt: user.created_at,
      created_at: user.created_at,
      developmentBypass: true,
    };
  })();
}

async function getDevelopmentSession(pool, config) {
  const user = await loadOrCreateDevelopmentUser(pool, config);
  if (!user) return null;
  return {
    sessionId: null,
    user,
    expiresAt: null,
    developmentBypass: true,
  };
}

module.exports = { getDevelopmentSession, loadOrCreateDevelopmentUser };
