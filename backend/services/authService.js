const crypto = require("crypto");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_BYTES = 72;
const SALT_ROUNDS = 12;
const DEVELOPMENT_ROLE_DOMAINS = Object.freeze({
  "student.com": "student",
  "admin.com": "admin",
});

class AuthError extends Error {
  constructor(message, status = 400, code = "AUTH_ERROR") {
    super(message);
    this.name = "AuthError";
    this.status = status;
    this.code = code;
  }
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function inferDevelopmentRole(email, enabled = false) {
  if (!enabled) return "student";
  const normalizedEmail = normalizeEmail(email);
  if (!EMAIL_PATTERN.test(normalizedEmail)) return null;
  return DEVELOPMENT_ROLE_DOMAINS[normalizedEmail.split("@").pop()] || null;
}

function validateRegistrationInput({ name, email, password }) {
  const normalizedName = String(name || "").trim();
  const normalizedEmail = normalizeEmail(email);
  const passwordValue = String(password || "");

  if (!normalizedName || !normalizedEmail || !passwordValue) {
    throw new AuthError("Name, email, and password are required.");
  }
  if (normalizedName.length > 255) {
    throw new AuthError("Name must be 255 characters or fewer.");
  }
  if (normalizedEmail.length > 254 || !EMAIL_PATTERN.test(normalizedEmail)) {
    throw new AuthError("Enter a valid email address.");
  }
  if (passwordValue.length < MIN_PASSWORD_LENGTH) {
    throw new AuthError(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
    );
  }
  if (Buffer.byteLength(passwordValue, "utf8") > MAX_PASSWORD_BYTES) {
    throw new AuthError("Password is too long.");
  }

  return {
    name: normalizedName,
    email: normalizedEmail,
    password: passwordValue,
  };
}

function validateLoginInput({ email, password }) {
  const normalizedEmail = normalizeEmail(email);
  const passwordValue = String(password || "");

  if (!normalizedEmail || !passwordValue) {
    throw new AuthError("Email and password are required.");
  }
  if (normalizedEmail.length > 254 || !EMAIL_PATTERN.test(normalizedEmail)) {
    throw new AuthError("Invalid email or password.", 401, "INVALID_CREDENTIALS");
  }

  return { email: normalizedEmail, password: passwordValue };
}

function publicUser(row) {
  const createdAt = row.created_at;
  const roles = Array.isArray(row.roles) && row.roles.length
    ? row.roles
    : [row.role || "student"];
  const preferredWorkspace = roles.includes(row.preferred_workspace)
    ? row.preferred_workspace
    : roles[0];
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    studentId: row.student_id,
    role: preferredWorkspace,
    roles,
    preferredWorkspace,
    createdAt,
    created_at: createdAt,
  };
}

function hashSessionToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function createRawSessionToken() {
  return crypto.randomBytes(32).toString("base64url");
}

async function registerUser(pool, bcrypt, input, options = {}) {
  const validated = validateRegistrationInput(input);
  const passwordHash = await bcrypt.hash(validated.password, SALT_ROUNDS);
  const assignedRole = inferDevelopmentRole(
    validated.email,
    options.demoDomainRolesEnabled === true
  );
  if (!assignedRole) {
    throw new AuthError(
      "Please use a @student.com or @admin.com email for this development environment.",
      400,
      "UNSUPPORTED_DEVELOPMENT_DOMAIN"
    );
  }

  try {
    const result = await pool.query(
      `INSERT INTO users (name, email, password, role, preferred_workspace)
       VALUES ($1, $2, $3, $4, $4)
       RETURNING id, name, email, student_id, role, preferred_workspace, created_at`,
      [validated.name, validated.email, passwordHash, assignedRole]
    );
    await pool.query(
      `INSERT INTO user_roles (user_id, role)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [result.rows[0].id, assignedRole]
    );
    return publicUser({ ...result.rows[0], roles: [assignedRole] });
  } catch (error) {
    if (error.code === "23505") {
      throw new AuthError(
        "An account with this email already exists.",
        409,
        "EMAIL_IN_USE"
      );
    }
    throw error;
  }
}

async function verifyCredentials(pool, bcrypt, input) {
  const validated = validateLoginInput(input);
  const result = await pool.query(
    `SELECT u.id, u.name, u.email, u.student_id, u.role, u.password, u.preferred_workspace,
            u.created_at,
            COALESCE(
              ARRAY_AGG(ur.role ORDER BY ur.role) FILTER (WHERE ur.role IS NOT NULL),
              ARRAY[u.role]
            ) AS roles
     FROM users u
     LEFT JOIN user_roles ur ON ur.user_id = u.id
     WHERE u.email = $1
     GROUP BY u.id`,
    [validated.email]
  );

  const row = result.rows[0];
  if (!row || !(await bcrypt.compare(validated.password, row.password))) {
    throw new AuthError(
      "Invalid email or password.",
      401,
      "INVALID_CREDENTIALS"
    );
  }

  return publicUser(row);
}

async function createSession(pool, userId, options = {}) {
  const token = createRawSessionToken();
  const tokenHash = hashSessionToken(token);
  const ttlMs = options.ttlMs;
  const expiresAt = new Date(Date.now() + ttlMs);

  await pool.query(
    `INSERT INTO sessions
       (user_id, token_hash, expires_at, user_agent, ip_address)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      userId,
      tokenHash,
      expiresAt,
      options.userAgent || null,
      options.ipAddress || null,
    ]
  );

  return { token, expiresAt };
}

async function getUserForSession(pool, token) {
  if (!token) return null;

  const tokenHash = hashSessionToken(token);
  const result = await pool.query(
    `SELECT
       s.id AS session_id,
       s.expires_at,
       u.id,
       u.name,
       u.email,
       u.student_id,
       u.role,
       u.preferred_workspace,
       COALESCE(
         ARRAY_AGG(ur.role ORDER BY ur.role) FILTER (WHERE ur.role IS NOT NULL),
         ARRAY[u.role]
       ) AS roles,
       u.created_at
     FROM sessions s
     INNER JOIN users u ON u.id = s.user_id
     LEFT JOIN user_roles ur ON ur.user_id = u.id
     WHERE s.token_hash = $1
       AND s.revoked_at IS NULL
       AND s.expires_at > NOW()
     GROUP BY s.id, u.id
     LIMIT 1`,
    [tokenHash]
  );

  const row = result.rows[0];
  if (!row) return null;

  await pool.query(
    "UPDATE sessions SET last_seen_at = NOW() WHERE id = $1",
    [row.session_id]
  );

  return {
    sessionId: row.session_id,
    user: publicUser(row),
    expiresAt: row.expires_at,
  };
}

async function revokeSession(pool, token) {
  if (!token) return false;
  const result = await pool.query(
    `UPDATE sessions
     SET revoked_at = NOW()
     WHERE token_hash = $1 AND revoked_at IS NULL`,
    [hashSessionToken(token)]
  );
  return result.rowCount > 0;
}

async function updatePreferredWorkspace(pool, userId, workspace) {
  const normalized = String(workspace || "").toLowerCase();
  if (!["student", "admin"].includes(normalized)) {
    throw new AuthError("Workspace must be student or admin.");
  }
  const result = await pool.query(
    `UPDATE users u
     SET preferred_workspace = $2
     WHERE u.id = $1
       AND EXISTS (
         SELECT 1 FROM user_roles ur
         WHERE ur.user_id = u.id AND ur.role = $2
       )
     RETURNING u.id, u.name, u.email, u.student_id, u.role, u.preferred_workspace, u.created_at`,
    [userId, normalized]
  );
  if (!result.rows[0]) {
    throw new AuthError(
      "That workspace is not assigned to your account.",
      403,
      "WORKSPACE_NOT_ASSIGNED"
    );
  }
  const roleResult = await pool.query(
    "SELECT role FROM user_roles WHERE user_id = $1 ORDER BY role",
    [userId]
  );
  return publicUser({
    ...result.rows[0],
    roles: roleResult.rows.map((row) => row.role),
  });
}

module.exports = {
  AuthError,
  MAX_PASSWORD_BYTES,
  MIN_PASSWORD_LENGTH,
  SALT_ROUNDS,
  createSession,
  getUserForSession,
  hashSessionToken,
  inferDevelopmentRole,
  normalizeEmail,
  publicUser,
  registerUser,
  revokeSession,
  validateLoginInput,
  validateRegistrationInput,
  verifyCredentials,
  updatePreferredWorkspace,
};
