/**
 * database/setup.js
 * 
 * Standalone Database Initializer and Migration Runner.
 * Executes MySQL schema DDL (database/schema.sql) against configured MySQL database,
 * or gracefully initializes local SQLite fallback via Node 24 native node:sqlite.
 * 
 * Usage:
 *   node database/setup.js           # Auto-detect (MySQL first, SQLite fallback)
 *   node database/setup.js --mysql   # Force MySQL (fails if unreachable)
 *   node database/setup.js --sqlite  # Force local SQLite
 *   node database/setup.js --verify  # Run schema integrity sanity tests
 */

const fs = require('node:fs');
const path = require('node:path');

// Safe dotenv loading (does not crash if dotenv is not yet installed)
try {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
} catch {
  // Use existing process.env
}

const args = process.argv.slice(2);
const FORCE_MYSQL = args.includes('--mysql');
const FORCE_SQLITE = args.includes('--sqlite') || process.env.DB_DRIVER === 'sqlite' || process.env.DB_FALLBACK === 'true';
const RUN_VERIFY = args.includes('--verify');

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'u199400152_fooddairy',
  password: process.env.DB_PASSWORD || '#Rajarani1',
  database: process.env.DB_NAME || 'u199400152_fooddairy',
  connectTimeout: parseInt(process.env.DB_CONNECT_TIMEOUT || '3000', 10),
  multipleStatements: true
};

const SQLITE_FILE = process.env.SQLITE_DB_PATH
  ? (process.env.SQLITE_DB_PATH === ':memory:' ? ':memory:' : path.resolve(process.cwd(), process.env.SQLITE_DB_PATH))
  : path.resolve(__dirname, 'food_records_dev.sqlite');

function log(msg) {
  console.log(`[setup] ${msg}`);
}

function warn(msg) {
  console.warn(`[setup] ⚠ ${msg}`);
}

function error(msg) {
  console.error(`[setup] ✖ ${msg}`);
}

async function runMySQLSetup() {
  let mysql;
  try {
    mysql = require('mysql2/promise');
  } catch (err) {
    throw new Error('mysql2 package is not installed. Run npm install or use SQLite fallback.');
  }

  log(`Attempting MySQL connection to ${config.user}@${config.host}:${config.port}/${config.database}...`);
  
  let connection;
  try {
    connection = await mysql.createConnection(config);
  } catch (connErr) {
    // If database does not exist on local dev server, attempt to create it
    if (connErr.code === 'ER_BAD_DB_ERROR') {
      log(`Database '${config.database}' not found. Attempting creation...`);
      const rootConn = await mysql.createConnection({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        connectTimeout: config.connectTimeout
      });
      await rootConn.query(`CREATE DATABASE IF NOT EXISTS \`${config.database}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
      await rootConn.end();
      connection = await mysql.createConnection(config);
    } else {
      throw connErr;
    }
  }

  log('MySQL connection established.');
  
  // Read and execute schema.sql
  const schemaPath = path.resolve(__dirname, 'schema.sql');
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Schema file not found at ${schemaPath}`);
  }

  const sql = fs.readFileSync(schemaPath, 'utf8');
  log('Executing schema.sql DDL...');
  await connection.query(sql);

  // Verify columns
  const [columns] = await connection.query('SHOW COLUMNS FROM food_records;');
  log(`Table 'food_records' verified with ${columns.length} columns:`);
  columns.forEach(col => {
    log(`  - ${col.Field} (${col.Type}, Null: ${col.Null}, Default: ${col.Default})`);
  });

  if (RUN_VERIFY) {
    log('Running verification sanity test (insert/select/delete)...');
    const testDate = '2099-12-31';
    await connection.query(
      `INSERT INTO food_records (record_date, breakfast_status, breakfast_time, breakfast_details)
       VALUES (?, 'yes', '08:00:00', 'Sanity test food')
       ON DUPLICATE KEY UPDATE breakfast_details = VALUES(breakfast_details)`,
      [testDate]
    );
    const [rows] = await connection.query('SELECT * FROM food_records WHERE record_date = ?', [testDate]);
    if (rows.length === 0) throw new Error('Verification query failed: row not found');
    await connection.query('DELETE FROM food_records WHERE record_date = ?', [testDate]);
    log('Verification sanity test passed.');
  }

  await connection.end();
  log('MySQL setup completed successfully.');
}

function runSQLiteSetup() {
  log(`Initializing Node 24 native SQLite at ${SQLITE_FILE}...`);
  if (SQLITE_FILE !== ':memory:') {
    fs.mkdirSync(path.dirname(SQLITE_FILE), { recursive: true });
  }

  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(SQLITE_FILE);

  const sqliteDdl = `
  CREATE TABLE IF NOT EXISTS food_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    record_date TEXT NOT NULL UNIQUE,
    breakfast_status TEXT CHECK(breakfast_status IN ('yes', 'no') OR breakfast_status IS NULL) DEFAULT NULL,
    breakfast_time TEXT DEFAULT NULL,
    breakfast_details TEXT DEFAULT NULL,
    lunch_status TEXT CHECK(lunch_status IN ('yes', 'no') OR lunch_status IS NULL) DEFAULT NULL,
    lunch_time TEXT DEFAULT NULL,
    lunch_details TEXT DEFAULT NULL,
    dinner_status TEXT CHECK(dinner_status IN ('yes', 'no') OR dinner_status IS NULL) DEFAULT NULL,
    dinner_time TEXT DEFAULT NULL,
    dinner_details TEXT DEFAULT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_food_records_date ON food_records(record_date);
  `;

  db.exec(sqliteDdl);

  const columns = db.prepare('PRAGMA table_info(food_records)').all();
  log(`SQLite table 'food_records' verified with ${columns.length} columns:`);
  columns.forEach(col => {
    log(`  - ${col.name} (${col.type}, pk: ${col.pk}, notnull: ${col.notnull}, dflt_value: ${col.dflt_value})`);
  });

  if (RUN_VERIFY) {
    log('Running SQLite verification sanity test...');
    const testDate = '2099-12-31';
    db.prepare(`
      INSERT INTO food_records (record_date, breakfast_status, breakfast_time, breakfast_details)
      VALUES (?, 'yes', '08:00:00', 'Sanity test food')
      ON CONFLICT(record_date) DO UPDATE SET breakfast_details = excluded.breakfast_details
    `).run(testDate);

    const row = db.prepare('SELECT * FROM food_records WHERE record_date = ?').get(testDate);
    if (!row) throw new Error('SQLite sanity verification failed: row not found');
    db.prepare('DELETE FROM food_records WHERE record_date = ?').run(testDate);
    log('SQLite verification sanity test passed.');
  }

  log('SQLite setup completed successfully.');
}

async function main() {
  log('Starting database setup...');

  if (FORCE_SQLITE) {
    log('SQLite mode requested.');
    runSQLiteSetup();
    process.exit(0);
  }

  try {
    await runMySQLSetup();
    process.exit(0);
  } catch (err) {
    if (FORCE_MYSQL) {
      error(`MySQL setup failed: ${err.message}`);
      process.exit(1);
    }

    warn(`MySQL connection unavailable (${err.code || err.message}).`);
    warn('Activating automated SQLite fallback for local development / testing...');
    try {
      runSQLiteSetup();
      log('Database setup completed with SQLite fallback.');
      process.exit(0);
    } catch (fallbackErr) {
      error(`Fallback SQLite setup failed: ${fallbackErr.message}`);
      process.exit(1);
    }
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  runMySQLSetup,
  runSQLiteSetup,
  main
};
