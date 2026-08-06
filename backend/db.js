const { Pool } = require("pg");

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const dbUrl = new URL(connectionString);

const isLocalDatabase =
  dbUrl.hostname === "localhost" ||
  dbUrl.hostname === "127.0.0.1";

const pool = new Pool({
  connectionString,
  ssl: isLocalDatabase
    ? false
    : {
        rejectUnauthorized: false,
      },
});

module.exports = pool;
