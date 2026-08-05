const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL is not set. Make sure backend/.env exists with DATABASE_URL defined.");
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
const isLocalDatabase =
  connectionString.includes("localhost") ||
  connectionString.includes("127.0.0.1") ||
  connectionString.startsWith("postgresql:///");

const pool = new Pool({
  connectionString,
  ssl: isLocalDatabase ? false : { rejectUnauthorized: false }
});

module.exports = pool;
