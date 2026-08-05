const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  checksum,
  loadMigrationFiles,
  runMigrations,
  validateAppliedMigrations,
} = require("../scripts/migrate");

function makeTemporaryMigrations(files) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "campus-migrations-"));
  for (const [name, sql] of Object.entries(files)) {
    fs.writeFileSync(path.join(directory, name), sql);
  }
  return directory;
}

function makeFakePool(options = {}) {
  const queries = [];
  const applied = [...(options.applied || [])];
  const client = {
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, " ").trim();
      queries.push({ sql: normalized, params });

      if (normalized.startsWith("SELECT version, name, checksum")) {
        return { rows: applied };
      }
      if (normalized.startsWith("INSERT INTO schema_migrations")) {
        applied.push({
          version: params[0],
          name: params[1],
          checksum: params[2],
          execution_ms: params[3],
        });
      }
      if (options.failOn && normalized.includes(options.failOn)) {
        throw new Error("simulated migration failure");
      }
      return { rows: [] };
    },
    release() {
      queries.push({ sql: "RELEASE", params: [] });
    },
  };

  return {
    applied,
    queries,
    pool: {
      async connect() {
        return client;
      },
    },
  };
}

test("loads ordered migration files and calculates stable checksums", () => {
  const directory = makeTemporaryMigrations({
    "002_second.sql": "SELECT 2;",
    "001_first.sql": "SELECT 1;",
  });

  const files = loadMigrationFiles(directory);

  assert.deepEqual(files.map((file) => file.name), [
    "001_first.sql",
    "002_second.sql",
  ]);
  assert.equal(files[0].checksum, checksum("SELECT 1;"));
});

test("rejects invalid and duplicate migration versions", () => {
  const invalidDirectory = makeTemporaryMigrations({
    "first.sql": "SELECT 1;",
  });
  assert.throws(
    () => loadMigrationFiles(invalidDirectory),
    /Invalid migration filename/
  );

  const duplicateDirectory = makeTemporaryMigrations({
    "001_first.sql": "SELECT 1;",
    "001_second.sql": "SELECT 2;",
  });
  assert.throws(
    () => loadMigrationFiles(duplicateDirectory),
    /Duplicate migration version/
  );
});

test("detects edits to an already-applied migration", () => {
  const local = [{
    version: "001",
    name: "001_first.sql",
    checksum: checksum("SELECT 1;"),
  }];

  assert.throws(
    () => validateAppliedMigrations(local, [{
      version: "001",
      name: "001_first.sql",
      checksum: checksum("SELECT changed;"),
    }]),
    /Checksum mismatch/
  );
});

test("applies pending migrations transactionally and records them", async () => {
  const directory = makeTemporaryMigrations({
    "001_first.sql": "SELECT 1;",
    "002_second.sql": "SELECT 2;",
  });
  const fake = makeFakePool();

  const result = await runMigrations(fake.pool, {
    migrationsDir: directory,
    silent: true,
  });

  assert.deepEqual(result.applied, ["001_first.sql", "002_second.sql"]);
  assert.equal(fake.applied.length, 2);
  assert.equal(
    fake.queries.filter((query) => query.sql === "BEGIN").length,
    2
  );
  assert.equal(
    fake.queries.filter((query) => query.sql === "COMMIT").length,
    2
  );
  assert.ok(fake.queries.some((query) => query.sql.includes("pg_advisory_lock")));
  assert.ok(fake.queries.some((query) => query.sql.includes("pg_advisory_unlock")));
});

test("rolls back a failed migration and does not record it", async () => {
  const directory = makeTemporaryMigrations({
    "001_failure.sql": "SELECT force_failure;",
  });
  const fake = makeFakePool({ failOn: "force_failure" });

  await assert.rejects(
    runMigrations(fake.pool, {
      migrationsDir: directory,
      silent: true,
    }),
    /Migration 001_failure.sql failed/
  );

  assert.equal(fake.applied.length, 0);
  assert.ok(fake.queries.some((query) => query.sql === "ROLLBACK"));
  assert.ok(fake.queries.some((query) => query.sql.includes("pg_advisory_unlock")));
});

