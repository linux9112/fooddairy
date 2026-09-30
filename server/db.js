/**
 * server/db.js
 * 
 * Resilient Database Connection Layer & Abstraction Interface.
 * 
 * Architecture:
 * - Primary Driver: MySQL connection pool using mysql2/promise with dateStrings: true.
 * - Resilient Fallback: Built-in Node 24 zero-dependency SQLite driver (node:sqlite)
 *   activated automatically if remote MySQL is unreachable, times out, is blocked,
 *   or if DB_DRIVER=sqlite is specified.
 * - Universal Interface: query(sql, params) and execute(sql, params) return identical
 *   [rows, fields] shapes and translate MySQL dialect (ON DUPLICATE KEY UPDATE, etc.)
 *   transparently for SQLite.
 */

const path = require('node:path');
const fs = require('node:fs');

// Attempt loading .env if dotenv is installed
try {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
} catch (e) {
  // Ignore if dotenv is not yet installed
}

let pool = null;
let sqliteDb = null;
let activeDriver = null; // 'mysql' | 'sqlite'
let initPromise = null;

/**
 * Translates MySQL-specific SQL statements into SQLite-compatible syntax.
 */
function translateSqlForSqlite(sql) {
  let s = sql;

  // 1. Upsert: ON DUPLICATE KEY UPDATE -> ON CONFLICT(record_date) DO UPDATE SET
  if (/ON\s+DUPLICATE\s+KEY\s+UPDATE/i.test(s)) {
    s = s.replace(/ON\s+DUPLICATE\s+KEY\s+UPDATE/i, 'ON CONFLICT(record_date) DO UPDATE SET');
    // Replace VALUES(col) or VALUES(`col`) with excluded.col
    s = s.replace(/VALUES\s*\(\s*`?([a-zA-Z0-9_]+)`?\s*\)/gi, (m, col) => `excluded.${col}`);
  }

  // 2. MySQL function translations
  s = s.replace(/\bNOW\s*\(\s*\)/gi, "datetime('now')");
  s = s.replace(/\bCURRENT_TIMESTAMP\s+ON\s+UPDATE\s+CURRENT_TIMESTAMP\b/gi, "datetime('now')");
  s = s.replace(/\bLAST_INSERT_ID\s*\(\s*\)/gi, 'last_insert_rowid()');

  // 3. MySQL schema / DDL translations
  if (/CREATE\s+TABLE/i.test(s)) {
    s = s.replace(/INT\s+UNSIGNED\s+AUTO_INCREMENT\s+PRIMARY\s+KEY/gi, 'INTEGER PRIMARY KEY AUTOINCREMENT');
    s = s.replace(/\bAUTO_INCREMENT\b/gi, 'AUTOINCREMENT');
    s = s.replace(/\bENUM\s*\([^)]+\)/gi, 'TEXT');
    s = s.replace(/\bON\s+UPDATE\s+CURRENT_TIMESTAMP\b/gi, '');
    s = s.replace(/\bENGINE\s*=\s*[a-zA-Z0-9_]+/gi, '');
    s = s.replace(/\bDEFAULT\s+CHARSET\s*=\s*[a-zA-Z0-9_]+/gi, '');
    s = s.replace(/\bCOLLATE\s*=\s*[a-zA-Z0-9_]+/gi, '');
  }

  // 4. Inspection query translations (supporting optional backticks)
  if (/^\s*SHOW\s+TABLES\b/i.test(s)) {
    s = "SELECT name AS Tables FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'";
  } else if (/^\s*(?:DESCRIBE|DESC)\s+`?([a-zA-Z0-9_]+)`?/i.test(s)) {
    const match = s.match(/^\s*(?:DESCRIBE|DESC)\s+`?([a-zA-Z0-9_]+)`?/i);
    if (match) {
      s = `PRAGMA table_info(${match[1]})`;
    }
  } else if (/^\s*SHOW\s+COLUMNS\s+FROM\s+`?([a-zA-Z0-9_]+)`?/i.test(s)) {
    const match = s.match(/^\s*SHOW\s+COLUMNS\s+FROM\s+`?([a-zA-Z0-9_]+)`?/i);
    if (match) {
      s = `PRAGMA table_info(${match[1]})`;
    }
  }

  return s;
}

/**
 * Normalizes parameter values for SQLite compatibility:
 * - undefined -> null
 * - boolean -> 1 / 0
 * - Date -> ISO string YYYY-MM-DD
 */
function normalizeParams(params) {
  if (!params) return [];
  const list = Array.isArray(params) ? params : [params];
  return list.map(val => {
    if (val === undefined) return null;
    if (typeof val === 'boolean') return val ? 1 : 0;
    if (val instanceof Date) return val.toISOString().slice(0, 10);
    return val;
  });
}

/**
 * Initializes local SQLite fallback using Node 24 built-in node:sqlite.
 */
function initSqlite() {
  const { DatabaseSync } = require('node:sqlite');
  const defaultPath = path.resolve(__dirname, '../database/food_records_dev.sqlite');
  const dbPath = process.env.SQLITE_DB_PATH
    ? (process.env.SQLITE_DB_PATH === ':memory:' ? ':memory:' : path.resolve(process.cwd(), process.env.SQLITE_DB_PATH))
    : defaultPath;

  if (dbPath !== ':memory:') {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  sqliteDb = new DatabaseSync(dbPath);

  // WAL mode for concurrency and performance
  try {
    sqliteDb.exec('PRAGMA journal_mode = WAL;');
    sqliteDb.exec('PRAGMA synchronous = NORMAL;');
    sqliteDb.exec('PRAGMA busy_timeout = 10000;');
  } catch (e) {
    // Ignore PRAGMA errors on memory or restricted filesystems
  }

  // Idempotent table definition matching MySQL schema
  const ddl = `
    CREATE TABLE IF NOT EXISTS food_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_date TEXT NOT NULL UNIQUE,
      breakfast_status TEXT NULL DEFAULT NULL CHECK(breakfast_status IN ('yes', 'no') OR breakfast_status IS NULL),
      breakfast_time TEXT NULL DEFAULT NULL,
      breakfast_details TEXT NULL DEFAULT NULL,
      lunch_status TEXT NULL DEFAULT NULL CHECK(lunch_status IN ('yes', 'no') OR lunch_status IS NULL),
      lunch_time TEXT NULL DEFAULT NULL,
      lunch_details TEXT NULL DEFAULT NULL,
      dinner_status TEXT NULL DEFAULT NULL CHECK(dinner_status IN ('yes', 'no') OR dinner_status IS NULL),
      dinner_time TEXT NULL DEFAULT NULL,
      dinner_details TEXT NULL DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_food_records_date ON food_records(record_date);
  `;
  sqliteDb.exec(ddl);
  activeDriver = 'sqlite';
  console.log(`[DB] Local SQLite fallback ready at: ${dbPath}`);
}

/**
 * Executes a query against the local SQLite database.
 */
function executeSqlite(sql, params = []) {
  const normParams = normalizeParams(params);
  const isShowColumns = /^\s*SHOW\s+COLUMNS\s+FROM\b/i.test(sql);
  const translatedSql = translateSqlForSqlite(sql);
  const trimmed = translatedSql.trim();

  const isSelect = /^(SELECT|PRAGMA|WITH|EXPLAIN)\b/i.test(trimmed);

  // Multi-statement script execution (e.g. DDL scripts with no params, not SELECT queries)
  if (!isSelect && normParams.length === 0 && (trimmed.includes(';') && trimmed.indexOf(';') < trimmed.length - 1)) {
    try {
      sqliteDb.exec(translatedSql);
      return Promise.resolve([{ affectedRows: 0, changedRows: 0, changes: 0, insertId: 0 }, []]);
    } catch (err) {
      return Promise.reject(err);
    }
  }

  try {
    const stmt = sqliteDb.prepare(translatedSql);
    if (isSelect) {
      const rows = stmt.all(...normParams);
      // Convert Object: null prototype to standard objects
      let sanitizedRows = rows.map(r => ({ ...r }));

      // If original was SHOW COLUMNS, map PRAGMA table_info output to MySQL format
      if (isShowColumns && sanitizedRows.length > 0 && 'name' in sanitizedRows[0]) {
        sanitizedRows = sanitizedRows.map(col => {
          let dflt = col.dflt_value;
          if (typeof dflt === 'string' && dflt.toUpperCase() === 'NULL') {
            dflt = null;
          }
          return {
            Field: col.name,
            Type: col.type,
            Null: col.notnull === 1 ? 'NO' : 'YES',
            Key: col.pk === 1 ? 'PRI' : '',
            Default: dflt,
            Extra: col.pk === 1 ? 'auto_increment' : ''
          };
        });
      }

      return Promise.resolve([sanitizedRows, []]);
    } else {
      const info = stmt.run(...normParams);
      const resultHeader = {
        affectedRows: info.changes,
        changedRows: info.changes,
        changes: info.changes,
        insertId: Number(info.lastInsertRowid),
        lastInsertRowid: info.lastInsertRowid,
        warningStatus: 0
      };
      return Promise.resolve([resultHeader, []]);
    }
  } catch (err) {
    const error = new Error(`[SQLite Error] ${err.message} (SQL: ${translatedSql})`);
    error.code = err.code || 'ERR_SQLITE_ERROR';
    error.originalError = err;
    return Promise.reject(error);
  }
}

/**
 * Initializes the database layer (connects to MySQL or falls back to SQLite).
 */
async function initDb() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const forcedDriver = (process.env.DB_DRIVER || '').toLowerCase().trim();

    if (forcedDriver === 'sqlite' || process.env.DB_FALLBACK === 'true') {
      console.log('[DB] DB_DRIVER=sqlite specified. Initializing local SQLite driver...');
      initSqlite();
      return;
    }

    try {
      const mysql = require('mysql2/promise');
      const config = {
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER || 'u199400152_fooddairy',
        password: process.env.DB_PASSWORD || '#Rajarani1',
        database: process.env.DB_NAME || 'u199400152_fooddairy',
        waitForConnections: true,
        connectionLimit: Number(process.env.DB_CONNECTION_LIMIT) || 10,
        queueLimit: 0,
        dateStrings: true, // Prevents timezone shifts on DATE/TIME
        connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT) || 3000,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0
      };

      const testPool = mysql.createPool(config);
      // Fast probe to verify connectivity
      await testPool.query('SELECT 1');
      pool = testPool;
      activeDriver = 'mysql';
      console.log(`[DB] Successfully connected to MySQL at ${config.host}:${config.port}/${config.database}`);
    } catch (err) {
      console.warn(`[DB] MySQL connection unreachable (${err.code || err.message}). Activating local SQLite fallback...`);
      initSqlite();
    }
  })();

  return initPromise;
}

/**
 * Universal query interface.
 */
async function query(sql, params = []) {
  if (!initPromise) await initDb();
  else await initPromise;

  if (activeDriver === 'mysql' && pool) {
    return pool.query(sql, params);
  } else {
    return executeSqlite(sql, params);
  }
}

/**
 * Universal execute interface (prepared statement execution).
 */
async function execute(sql, params = []) {
  if (!initPromise) await initDb();
  else await initPromise;

  if (activeDriver === 'mysql' && pool) {
    return pool.execute(sql, params);
  } else {
    return executeSqlite(sql, params);
  }
}

/**
 * Provides a connection object compatible with mysql2 pool.getConnection().
 */
async function getConnection() {
  if (!initPromise) await initDb();
  else await initPromise;

  if (activeDriver === 'mysql' && pool) {
    return pool.getConnection();
  }

  // SQLite virtual connection
  return {
    query: (s, p) => executeSqlite(s, p),
    execute: (s, p) => executeSqlite(s, p),
    release: () => {},
    beginTransaction: async () => { sqliteDb.exec('BEGIN TRANSACTION'); },
    commit: async () => { sqliteDb.exec('COMMIT'); },
    rollback: async () => { sqliteDb.exec('ROLLBACK'); }
  };
}

/**
 * Closes active pool or SQLite database cleanly.
 */
async function close() {
  if (pool) {
    await pool.end();
    pool = null;
  }
  if (sqliteDb) {
    sqliteDb.close();
    sqliteDb = null;
  }
  activeDriver = null;
  initPromise = null;
}

module.exports = {
  initDb,
  query,
  execute,
  getConnection,
  close,
  end: close,
  closePool: close,
  getActiveDriver: () => activeDriver,
  getDriverName: () => activeDriver,
  isFallback: () => activeDriver === 'sqlite'
};
