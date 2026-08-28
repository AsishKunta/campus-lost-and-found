const { Pool } = require("pg");
const { createDatabasePoolConfig } = require("./config/database");

const connectionString = process.env.DATABASE_URL;
const pool = new Pool(createDatabasePoolConfig(connectionString));

module.exports = pool;
