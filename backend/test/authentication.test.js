const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcrypt");

process.env.DATABASE_URL ||= "postgresql:///authentication_test_unused";

const { createAuthController } = require("../controllers/authController");
const { createAuthenticate } = require("../middleware/authenticate");
const {
  createSession,
  getUserForSession,
  hashSessionToken,
  inferDevelopmentRole,
  registerUser,
  verifyCredentials,
} = require("../services/authService");
const { getAuthConfig } = require("../config/auth");

function createMemoryPool() {
  const users = [];
  const sessions = [];
  let nextUserId = 1;
  let nextSessionId = 1;

  return {
    users,
    sessions,
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, " ").trim();

      if (normalized.startsWith("INSERT INTO users")) {
        if (users.some((user) => user.email === params[1])) {
          const error = new Error("duplicate");
          error.code = "23505";
          throw error;
        }
        const user = {
          id: nextUserId++,
          name: params[0],
          email: params[1],
          password: params[2],
          role: params[3] || "student",
          roles: [params[3] || "student"],
          preferred_workspace: params[3] || "student",
          created_at: new Date(),
        };
        users.push(user);
        return { rows: [user], rowCount: 1 };
      }

      if (normalized.startsWith("INSERT INTO user_roles")) {
        const user = users.find((candidate) => candidate.id === params[0]);
        const role = params[1] || "student";
        if (user && !user.roles.includes(role)) user.roles.push(role);
        return { rows: [], rowCount: user ? 1 : 0 };
      }

      if (normalized.includes("FROM users u") && normalized.includes("WHERE u.email = $1")) {
        const user = users.find((candidate) => candidate.email === params[0]);
        return { rows: user ? [user] : [], rowCount: user ? 1 : 0 };
      }

      if (normalized.startsWith("INSERT INTO sessions")) {
        sessions.push({
          id: `session-${nextSessionId++}`,
          user_id: params[0],
          token_hash: params[1],
          expires_at: params[2],
          user_agent: params[3],
          ip_address: params[4],
          revoked_at: null,
          last_seen_at: new Date(),
        });
        return { rows: [], rowCount: 1 };
      }

      if (normalized.includes("FROM sessions s") && normalized.includes("INNER JOIN users")) {
        const session = sessions.find((candidate) =>
          candidate.token_hash === params[0] &&
          !candidate.revoked_at &&
          candidate.expires_at > new Date()
        );
        if (!session) return { rows: [], rowCount: 0 };
        const user = users.find((candidate) => candidate.id === session.user_id);
        return {
          rows: [{
            session_id: session.id,
            expires_at: session.expires_at,
            ...user,
          }],
          rowCount: 1,
        };
      }

      if (normalized.startsWith("UPDATE sessions SET last_seen_at")) {
        const session = sessions.find((candidate) => candidate.id === params[0]);
        if (session) session.last_seen_at = new Date();
        return { rows: [], rowCount: session ? 1 : 0 };
      }

      if (normalized.startsWith("UPDATE sessions") && normalized.includes("revoked_at")) {
        const session = sessions.find((candidate) =>
          candidate.token_hash === params[0] && !candidate.revoked_at
        );
        if (session) session.revoked_at = new Date();
        return { rows: [], rowCount: session ? 1 : 0 };
      }

      throw new Error(`Unhandled test query: ${normalized}`);
    },
  };
}

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    cookieRecord: null,
    clearedCookie: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    cookie(name, value, options) {
      this.cookieRecord = { name, value, options };
      return this;
    },
    clearCookie(name, options) {
      this.clearedCookie = { name, options };
      return this;
    },
  };
}

function createRequest(overrides = {}) {
  return {
    body: {},
    params: {},
    headers: {},
    ip: "127.0.0.1",
    get(name) {
      return name.toLowerCase() === "user-agent" ? "node-test" : undefined;
    },
    ...overrides,
  };
}

const testConfig = {
  cookieName: "campus_session",
  sessionTtlMs: 60_000,
  rememberedSessionTtlMs: 600_000,
  secureCookies: false,
};

test("registers a user with a bcrypt password hash", async () => {
  const pool = createMemoryPool();
  const user = await registerUser(pool, bcrypt, {
    name: "Test Student",
    email: "STUDENT@example.com",
    password: "correct horse battery staple",
  });

  assert.equal(user.email, "student@example.com");
  assert.equal(user.role, "student");
  assert.notEqual(pool.users[0].password, "correct horse battery staple");
  assert.equal(
    await bcrypt.compare("correct horse battery staple", pool.users[0].password),
    true
  );
});

test("logs in with valid credentials and rejects invalid credentials", async () => {
  const pool = createMemoryPool();
  await registerUser(pool, bcrypt, {
    name: "Login Student",
    email: "login@example.com",
    password: "valid-password",
  });

  const user = await verifyCredentials(pool, bcrypt, {
    email: "login@example.com",
    password: "valid-password",
  });
  assert.equal(user.email, "login@example.com");

  await assert.rejects(
    verifyCredentials(pool, bcrypt, {
      email: "login@example.com",
      password: "wrong-password",
    }),
    (error) => error.status === 401 && error.code === "INVALID_CREDENTIALS"
  );
});

test("creates, hashes, validates, expires, and revokes server sessions", async () => {
  const pool = createMemoryPool();
  const user = await registerUser(pool, bcrypt, {
    name: "Session Student",
    email: "session@example.com",
    password: "valid-password",
  });
  const session = await createSession(pool, user.id, {
    ttlMs: 60_000,
    userAgent: "node-test",
    ipAddress: "127.0.0.1",
  });

  assert.notEqual(pool.sessions[0].token_hash, session.token);
  assert.equal(pool.sessions[0].token_hash, hashSessionToken(session.token));

  const validated = await getUserForSession(pool, session.token);
  assert.equal(validated.user.id, user.id);

  pool.sessions[0].expires_at = new Date(Date.now() - 1);
  assert.equal(await getUserForSession(pool, session.token), null);
});

test("login sets an HTTP-only cookie and /auth/me returns the session user", async () => {
  const pool = createMemoryPool();
  await registerUser(pool, bcrypt, {
    name: "Cookie Student",
    email: "cookie@example.com",
    password: "valid-password",
  });
  const controller = createAuthController({ pool, bcrypt, config: testConfig });
  const loginResponse = createResponse();

  await controller.login(
    createRequest({
      body: { email: "cookie@example.com", password: "valid-password" },
    }),
    loginResponse
  );

  assert.equal(loginResponse.statusCode, 200);
  assert.equal(loginResponse.cookieRecord.name, "campus_session");
  assert.equal(loginResponse.cookieRecord.options.httpOnly, true);
  assert.equal(loginResponse.cookieRecord.options.sameSite, "lax");
  assert.equal(loginResponse.cookieRecord.options.secure, false);

  const session = await getUserForSession(
    pool,
    loginResponse.cookieRecord.value
  );
  const meResponse = createResponse();
  controller.me(
    createRequest({ user: session.user, auth: session }),
    meResponse
  );
  assert.equal(meResponse.statusCode, 200);
  assert.equal(meResponse.body.user.email, "cookie@example.com");
});

test("Remember Me selects only server-controlled normal or extended durations", async () => {
  const pool = createMemoryPool();
  await registerUser(pool, bcrypt, {
    name: "Remembered Student",
    email: "remembered@example.com",
    password: "valid-password",
  });
  const controller = createAuthController({ pool, bcrypt, config: testConfig });

  const normalResponse = createResponse();
  await controller.login(createRequest({
    body: {
      email: "remembered@example.com",
      password: "valid-password",
      rememberMe: false,
      sessionDays: 9999,
      expiresAt: "2999-01-01T00:00:00.000Z",
    },
  }), normalResponse);
  const normalLifetime = pool.sessions[0].expires_at.getTime() - Date.now();
  assert.ok(normalLifetime > 55_000 && normalLifetime <= testConfig.sessionTtlMs);

  const rememberedResponse = createResponse();
  await controller.login(createRequest({
    body: {
      email: "remembered@example.com",
      password: "valid-password",
      rememberMe: true,
    },
  }), rememberedResponse);
  const rememberedLifetime = pool.sessions[1].expires_at.getTime() - Date.now();
  assert.ok(rememberedLifetime > 595_000 && rememberedLifetime <= testConfig.rememberedSessionTtlMs);
  assert.ok(rememberedResponse.cookieRecord.options.maxAge > normalResponse.cookieRecord.options.maxAge);

  const invalidTypeResponse = createResponse();
  await controller.login(createRequest({
    body: {
      email: "remembered@example.com",
      password: "valid-password",
      rememberMe: "true",
    },
  }), invalidTypeResponse);
  assert.equal(invalidTypeResponse.statusCode, 400);
  assert.equal(invalidTypeResponse.body.code, "INVALID_REMEMBER_ME");
  assert.equal(pool.sessions.length, 2);
});

test("invalid credentials cannot create a Remember Me session", async () => {
  const pool = createMemoryPool();
  await registerUser(pool, bcrypt, {
    name: "Remembered Student",
    email: "remembered-invalid@example.com",
    password: "valid-password",
  });
  const controller = createAuthController({ pool, bcrypt, config: testConfig });
  const response = createResponse();
  await controller.login(createRequest({
    body: {
      email: "remembered-invalid@example.com",
      password: "wrong-password",
      rememberMe: true,
    },
  }), response);
  assert.equal(response.statusCode, 401);
  assert.equal(pool.sessions.length, 0);
});

test("logout revokes an extended Remember Me session", async () => {
  const pool = createMemoryPool();
  const user = await registerUser(pool, bcrypt, {
    name: "Remembered Logout Student",
    email: "remembered-logout@example.com",
    password: "valid-password",
  });
  const session = await createSession(pool, user.id, {
    ttlMs: testConfig.rememberedSessionTtlMs,
  });
  const controller = createAuthController({ pool, bcrypt, config: testConfig });
  const response = createResponse();
  await controller.logout(createRequest({
    headers: { cookie: `campus_session=${session.token}` },
  }), response);
  assert.equal(response.statusCode, 200);
  assert.equal(await getUserForSession(pool, session.token), null);
});

test("an expired Remember Me session cannot authenticate", async () => {
  const pool = createMemoryPool();
  const user = await registerUser(pool, bcrypt, {
    name: "Expired Remembered Student",
    email: "remembered-expired@example.com",
    password: "valid-password",
  });
  const session = await createSession(pool, user.id, {
    ttlMs: testConfig.rememberedSessionTtlMs,
  });
  pool.sessions[0].expires_at = new Date(Date.now() - 1);
  assert.equal(await getUserForSession(pool, session.token), null);
});

test("authentication middleware protects routes and accepts a valid session", async () => {
  const pool = createMemoryPool();
  const user = await registerUser(pool, bcrypt, {
    name: "Protected Student",
    email: "protected@example.com",
    password: "valid-password",
  });
  const session = await createSession(pool, user.id, { ttlMs: 60_000 });
  const authenticate = createAuthenticate(pool, { config: testConfig });

  const deniedResponse = createResponse();
  let deniedNext = false;
  await authenticate(
    createRequest(),
    deniedResponse,
    () => { deniedNext = true; }
  );
  assert.equal(deniedResponse.statusCode, 401);
  assert.equal(deniedNext, false);

  const allowedRequest = createRequest({
    headers: { cookie: `campus_session=${session.token}` },
  });
  const allowedResponse = createResponse();
  let allowedNext = false;
  await authenticate(
    allowedRequest,
    allowedResponse,
    () => { allowedNext = true; }
  );
  assert.equal(allowedNext, true);
  assert.equal(allowedRequest.user.email, "protected@example.com");
});

test("logout revokes the session and clears the cookie", async () => {
  const pool = createMemoryPool();
  const user = await registerUser(pool, bcrypt, {
    name: "Logout Student",
    email: "logout@example.com",
    password: "valid-password",
  });
  const session = await createSession(pool, user.id, { ttlMs: 60_000 });
  const controller = createAuthController({ pool, bcrypt, config: testConfig });
  const response = createResponse();

  await controller.logout(
    createRequest({
      headers: { cookie: `campus_session=${session.token}` },
    }),
    response
  );

  assert.equal(response.statusCode, 200);
  assert.equal(response.clearedCookie.name, "campus_session");
  assert.equal(await getUserForSession(pool, session.token), null);
});

test("development bypass is explicit and always disabled in production", () => {
  assert.equal(getAuthConfig({ DEV_AUTH_BYPASS: "true" }).developmentBypassEnabled, true);
  assert.equal(
    getAuthConfig({ DEV_AUTH_BYPASS: "true", NODE_ENV: "production" }).developmentBypassEnabled,
    false
  );
  assert.equal(getAuthConfig({}).developmentBypassEnabled, false);
});

test("development domain roles use exact normalized domains and fail closed in production", async () => {
  assert.equal(inferDevelopmentRole("sunny@student.com", true), "student");
  assert.equal(inferDevelopmentRole("Sunny@ADMIN.COM", true), "admin");
  assert.equal(inferDevelopmentRole("someone@admin.com.fake", true), null);
  assert.equal(inferDevelopmentRole("someone@student.com.fake", true), null);
  assert.equal(getAuthConfig({ NODE_ENV: "production", DEMO_DOMAIN_ROLES: "true" }).demoDomainRolesEnabled, false);

  const pool = createMemoryPool();
  const admin = await registerUser(pool, bcrypt, {
    name: "Sunny Admin",
    email: "sunny@admin.com",
    password: "valid-password",
  }, { demoDomainRolesEnabled: true });
  assert.equal(admin.role, "admin");
  assert.deepEqual(admin.roles, ["admin"]);

  await assert.rejects(
    registerUser(pool, bcrypt, {
      name: "Spoofed Admin",
      email: "someone@admin.com.fake",
      password: "valid-password",
    }, { demoDomainRolesEnabled: true }),
    (error) => error.code === "UNSUPPORTED_DEVELOPMENT_DOMAIN"
  );
});

test("development registration is open to arbitrary usernames while preserving credentials and uniqueness", async () => {
  const pool = createMemoryPool();
  const options = { demoDomainRolesEnabled: true };

  const student = await registerUser(pool, bcrypt, {
    name: "New Student",
    email: "newstudent@student.com",
    password: "student-password",
  }, options);
  const admin = await registerUser(pool, bcrypt, {
    name: "New Admin",
    email: "newadmin@admin.com",
    password: "admin-password",
  }, options);

  assert.equal(student.name, "New Student");
  assert.equal(student.role, "student");
  assert.deepEqual(student.roles, ["student"]);
  assert.equal(admin.name, "New Admin");
  assert.equal(admin.role, "admin");
  assert.deepEqual(admin.roles, ["admin"]);

  for (const email of [
    "test@gmail.com",
    "test@yahoo.com",
    "test@student.com.fake",
    "test@admin.com.fake",
    "test@fakeadmin.com",
    "test@student.com@example.com",
  ]) {
    await assert.rejects(
      registerUser(pool, bcrypt, {
        name: "Invalid Domain",
        email,
        password: "valid-password",
      }, options),
      (error) => error.status === 400 && [
        "AUTH_ERROR",
        "UNSUPPORTED_DEVELOPMENT_DOMAIN",
      ].includes(error.code)
    );
  }

  await assert.rejects(
    registerUser(pool, bcrypt, {
      name: "Duplicate Student",
      email: "newstudent@student.com",
      password: "different-password",
    }, options),
    (error) => error.code === "EMAIL_IN_USE" && error.status === 409
  );

  await assert.rejects(
    verifyCredentials(pool, bcrypt, {
      email: "newadmin@admin.com",
      password: "wrong-password",
    }),
    (error) => error.code === "INVALID_CREDENTIALS" && error.status === 401
  );

  const authenticatedAdmin = await verifyCredentials(pool, bcrypt, {
    email: "newadmin@admin.com",
    password: "admin-password",
  });
  assert.equal(authenticatedAdmin.name, "New Admin");
  assert.equal(authenticatedAdmin.preferredWorkspace, "admin");
});

test("development bypass supplies a database-backed identity only when enabled", async () => {
  let bypassLookups = 0;
  const authenticate = createAuthenticate({}, {
    config: {
      ...testConfig,
      developmentBypassEnabled: true,
      developmentUserEmail: "development-user@campus.local",
    },
    getUserForSession: async () => null,
    getDevelopmentSession: async () => {
      bypassLookups += 1;
      return {
        user: {
          id: 99,
          email: "development-user@campus.local",
          roles: ["student", "admin"],
        },
        expiresAt: null,
        developmentBypass: true,
      };
    },
  });
  const req = createRequest();
  const res = createResponse();
  let nextCalled = false;
  await authenticate(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(bypassLookups, 1);
  assert.deepEqual(req.user.roles, ["student", "admin"]);
});
