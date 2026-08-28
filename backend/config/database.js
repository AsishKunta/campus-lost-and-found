function isLocalDatabaseUrl(connectionString) {
  const databaseUrl = new URL(connectionString);
  return (
    !databaseUrl.hostname ||
    databaseUrl.hostname === "localhost" ||
    databaseUrl.hostname === "127.0.0.1"
  );
}

function createDatabasePoolConfig(connectionString) {
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  return {
    connectionString,
    ssl: isLocalDatabaseUrl(connectionString)
      ? false
      : { rejectUnauthorized: false },
  };
}

module.exports = { createDatabasePoolConfig, isLocalDatabaseUrl };
