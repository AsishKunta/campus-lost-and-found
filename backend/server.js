require("dotenv").config({ path: require("path").join(__dirname, ".env") });

const express = require("express");
const cors    = require("cors");
const path    = require("path");
const fs      = require("fs");
const pool    = require("./db");
const { assertMigrationsCurrent } = require("./scripts/migrate");

const reportRoutes  = require("./routes/reportRoutes");
const claimRoutes   = require("./routes/claimRoutes");
const authRoutes    = require("./routes/authRoutes");
const messageRoutes = require("./routes/messageRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const descriptionAssistantRoutes = require("./routes/descriptionAssistantRoutes");
const { expirePendingClaims } = require("./services/claimExpirationService");
const { createCorsOptions } = require("./config/cors");
const { logError, logInfo } = require("./utils/safeLogger");
const { securityHeaders } = require("./middleware/securityHeaders");
const { getAuthConfig } = require("./config/auth");

const app = express();
const authConfig = getAuthConfig();
if (authConfig.trustProxyHops > 0) app.set("trust proxy", authConfig.trustProxyHops);

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

const corsOptions = createCorsOptions();
app.use(securityHeaders);
// CORS and preflight must run before parsing, authentication, and every route.
app.options(/.*/, cors(corsOptions));
app.use(cors(corsOptions));
app.use(express.json());
// Serve uploaded images as static files
app.use("/uploads", express.static(uploadsDir));

app.use("/reports",  reportRoutes);
app.use("/claims",   claimRoutes);
app.use("/auth",     authRoutes);
app.use("/messages", messageRoutes);
app.use("/notifications", notificationRoutes);
app.use("/description-assistant", descriptionAssistantRoutes);

app.use((error, req, res, next) => {
  if (error?.message === "Origin is not allowed by CORS.") {
    return res.status(403).json({
      error: error.message,
      code: "CORS_ORIGIN_DENIED",
    });
  }
  if (error?.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      error: "Image must be 5 MB or smaller.",
      code: "IMAGE_TOO_LARGE",
    });
  }
  if (error?.code === "UNSUPPORTED_IMAGE_TYPE") {
    return res.status(415).json({
      error: error.message,
      code: error.code,
    });
  }
  return next(error);
});

const PORT = process.env.PORT || 3001;

async function startServer() {
  try {
    await pool.query("SELECT NOW()");
    await assertMigrationsCurrent(pool);
    logInfo("server.database_ready", { migrationsCurrent: true });

    const server = app.listen(PORT, () => {
      logInfo("server.listening", { port: Number(PORT) });
    });
    const expirationTimer = setInterval(() => {
      expirePendingClaims(pool).catch((error) => {
        logError("claims.expiration_sweep_failed", error);
      });
    }, 60 * 60 * 1000);
    expirationTimer.unref();
    expirePendingClaims(pool).catch((error) => {
      logError("claims.initial_expiration_sweep_failed", error);
    });
    server.on("close", () => clearInterval(expirationTimer));
    return server;
  } catch (err) {
    logError("server.startup_failed", err);
    throw err;
  }
}

if (require.main === module) {
  startServer().catch(async () => {
    await pool.end();
    process.exitCode = 1;
  });
}

module.exports = { app, startServer };
