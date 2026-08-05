const DEFAULT_DEVELOPMENT_ORIGINS = [
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
];

function allowedOrigins(environment = process.env) {
  const configured = environment.FRONTEND_ORIGINS || environment.FRONTEND_ORIGIN;
  if (!configured && environment.NODE_ENV === "production") return new Set();
  return new Set(
    String(
      configured ||
      DEFAULT_DEVELOPMENT_ORIGINS.join(",")
    )
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  );
}

function createCorsOptions(environment = process.env) {
  const origins = allowedOrigins(environment);
  if (origins.has("*")) {
    throw new Error("Credentialed CORS does not allow a wildcard origin.");
  }
  return {
    credentials: true,
    origin(origin, callback) {
      if (!origin || origins.has(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Origin is not allowed by CORS."));
    },
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 204,
  };
}

module.exports = {
  DEFAULT_DEVELOPMENT_ORIGINS,
  allowedOrigins,
  createCorsOptions,
};
