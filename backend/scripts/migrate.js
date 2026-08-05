const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const MIGRATION_FILE_PATTERN = /^(\d{3})_[a-z0-9_]+\.sql$/;
const MIGRATION_LOCK_ID = 742091;
const DEFAULT_MIGRATIONS_DIR = path.join(__dirname, "..", "migrations");

function checksum(contents) {
  return crypto.createHash("sha256").update(contents).digest("hex");
}

function loadMigrationFiles(migrationsDir = DEFAULT_MIGRATIONS_DIR) {
  const entries = fs.readdirSync(migrationsDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort();

  const invalid = files.filter((name) => !MIGRATION_FILE_PATTERN.test(name));
  if (invalid.length > 0) {
    throw new Error(`Invalid migration filename(s): ${invalid.join(", ")}`);
  }

  const versions = new Set();
  return files.map((name) => {
    const version = MIGRATION_FILE_PATTERN.exec(name)[1];
    if (versions.has(version)) {
      throw new Error(`Duplicate migration version: ${version}`);
    }
    versions.add(version);

    const fullPath = path.join(migrationsDir, name);
    const sql = fs.readFileSync(fullPath, "utf8");
    if (!sql.trim()) {
      throw new Error(`Migration is empty: ${name}`);
    }

    return {
      name,
      version,
      sql,
      checksum: checksum(sql),
    };
  });
}

async function ensureMigrationLedger(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version      VARCHAR(3) PRIMARY KEY,
      name         TEXT NOT NULL UNIQUE,
      checksum     CHAR(64) NOT NULL,
      applied_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      execution_ms INTEGER NOT NULL CHECK (execution_ms >= 0)
    )
  `);
}

async function getAppliedMigrations(client) {
  const result = await client.query(
    `SELECT version, name, checksum, applied_at, execution_ms
     FROM schema_migrations
     ORDER BY version`
  );
  return result.rows;
}

function validateAppliedMigrations(files, appliedRows) {
  const filesByVersion = new Map(files.map((file) => [file.version, file]));

  for (const applied of appliedRows) {
    const local = filesByVersion.get(applied.version);
    if (!local) {
      throw new Error(
        `Applied migration ${applied.version} (${applied.name}) is missing locally.`
      );
    }
    if (local.name !== applied.name) {
      throw new Error(
        `Migration ${applied.version} was renamed from ${applied.name} to ${local.name}.`
      );
    }
    if (local.checksum !== applied.checksum.trim()) {
      throw new Error(
        `Checksum mismatch for applied migration ${local.name}. Applied migrations are immutable.`
      );
    }
  }
}

async function runMigrations(pool, options = {}) {
  const files = loadMigrationFiles(options.migrationsDir);
  const client = await pool.connect();

  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_ID]);
    await ensureMigrationLedger(client);

    const appliedRows = await getAppliedMigrations(client);
    validateAppliedMigrations(files, appliedRows);
    const appliedVersions = new Set(appliedRows.map((row) => row.version));
    const pending = files.filter((file) => !appliedVersions.has(file.version));

    for (const migration of pending) {
      const startedAt = Date.now();
      await client.query("BEGIN");
      try {
        await client.query(migration.sql);
        await client.query(
          `INSERT INTO schema_migrations
             (version, name, checksum, execution_ms)
           VALUES ($1, $2, $3, $4)`,
          [
            migration.version,
            migration.name,
            migration.checksum,
            Date.now() - startedAt,
          ]
        );
        await client.query("COMMIT");
        if (!options.silent) {
          console.log(`Applied migration ${migration.name}`);
        }
      } catch (error) {
        await client.query("ROLLBACK");
        error.message = `Migration ${migration.name} failed: ${error.message}`;
        throw error;
      }
    }

    return {
      applied: pending.map((file) => file.name),
      current: files.length,
      total: files.length,
    };
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_ID]);
    } finally {
      client.release();
    }
  }
}

async function getMigrationStatus(pool, options = {}) {
  const files = loadMigrationFiles(options.migrationsDir);
  const result = await pool.query(`SELECT to_regclass('public.schema_migrations') AS ledger`);
  if (!result.rows[0].ledger) {
    return files.map((file) => ({ ...file, status: "pending" }));
  }

  const appliedRows = await getAppliedMigrations(pool);
  validateAppliedMigrations(files, appliedRows);
  const appliedVersions = new Set(appliedRows.map((row) => row.version));
  return files.map((file) => ({
    name: file.name,
    version: file.version,
    checksum: file.checksum,
    status: appliedVersions.has(file.version) ? "applied" : "pending",
  }));
}

async function assertMigrationsCurrent(pool, options = {}) {
  const status = await getMigrationStatus(pool, options);
  const pending = status.filter((migration) => migration.status === "pending");
  if (pending.length > 0) {
    throw new Error(
      `Database has ${pending.length} pending migration(s): ${pending
        .map((migration) => migration.name)
        .join(", ")}. Run "npm run migrate" before starting the API.`
    );
  }
  return status;
}

async function runCli() {
  require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
  const pool = require("../db");
  const statusOnly = process.argv.includes("--status");

  try {
    if (statusOnly) {
      const status = await getMigrationStatus(pool);
      status.forEach((migration) => {
        console.log(`${migration.status.padEnd(7)} ${migration.name}`);
      });
      if (status.some((migration) => migration.status === "pending")) {
        process.exitCode = 1;
      }
    } else {
      const result = await runMigrations(pool);
      console.log(
        result.applied.length > 0
          ? `Migration complete: ${result.applied.length} applied.`
          : "Migration complete: database is current."
      );
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  runCli();
}

module.exports = {
  DEFAULT_MIGRATIONS_DIR,
  MIGRATION_FILE_PATTERN,
  assertMigrationsCurrent,
  checksum,
  getMigrationStatus,
  loadMigrationFiles,
  runMigrations,
  validateAppliedMigrations,
};
