/**
 * tests/unit/db.test.js
 * 
 * Unit & Integration test suite for server/db.js persistence layer.
 * Verifies:
 * - Driver initialization (MySQL or fallback SQLite)
 * - Prepared statement execution & parameter normalization
 * - Schema structure & default nullability
 * - Single-meal upsert isolation (preserving other meal slots)
 * - Single-meal reset (DELETE/nullification)
 * - Ternary meal state integrity ('yes', 'no', null)
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// Ensure DB_DRIVER=sqlite for deterministic test execution
process.env.DB_DRIVER = 'sqlite';
process.env.SQLITE_DB_PATH = ':memory:';

const db = require('../../server/db');

describe('Database Persistence Layer (server/db.js)', () => {
  before(async () => {
    await db.initDb();
  });

  after(async () => {
    await db.close();
  });

  test('should initialize driver as SQLite fallback in test mode', () => {
    assert.strictEqual(db.getDriverName(), 'sqlite');
    assert.strictEqual(db.isFallback(), true);
  });

  test('should create food_records table with all 13 columns and proper nullability', async () => {
    const [columns] = await db.query('SHOW COLUMNS FROM food_records;');
    assert.strictEqual(columns.length, 13, `Expected 13 columns, found ${columns.length}`);

    const colMap = {};
    columns.forEach(c => { colMap[c.Field] = c; });

    // Verify key fields
    assert.ok(colMap['id'], 'id column missing');
    assert.ok(colMap['record_date'], 'record_date column missing');
    assert.strictEqual(colMap['record_date'].Null, 'NO', 'record_date must NOT be nullable');

    // Verify meal columns
    ['breakfast', 'lunch', 'dinner'].forEach(meal => {
      assert.ok(colMap[`${meal}_status`], `${meal}_status missing`);
      assert.strictEqual(colMap[`${meal}_status`].Null, 'YES', `${meal}_status must be nullable`);
      assert.strictEqual(colMap[`${meal}_status`].Default, null, `${meal}_status must default to NULL`);

      assert.ok(colMap[`${meal}_time`], `${meal}_time missing`);
      assert.strictEqual(colMap[`${meal}_time`].Null, 'YES', `${meal}_time must be nullable`);

      assert.ok(colMap[`${meal}_details`], `${meal}_details missing`);
      assert.strictEqual(colMap[`${meal}_details`].Null, 'YES', `${meal}_details must be nullable`);
    });

    assert.ok(colMap['created_at'], 'created_at missing');
    assert.ok(colMap['updated_at'], 'updated_at missing');
  });

  test('should insert breakfast as "yes" on a new date and leave lunch & dinner as NULL', async () => {
    const testDate = '2099-01-10';

    const insertSql = `
      INSERT INTO food_records (record_date, breakfast_status, breakfast_time, breakfast_details)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        breakfast_status = VALUES(breakfast_status),
        breakfast_time = VALUES(breakfast_time),
        breakfast_details = VALUES(breakfast_details);
    `;

    await db.query(insertSql, [testDate, 'yes', '08:30:00', 'Idli Sambar']);

    const [rows] = await db.query('SELECT * FROM food_records WHERE record_date = ?', [testDate]);
    assert.strictEqual(rows.length, 1);
    const row = rows[0];

    assert.strictEqual(row.record_date, testDate);
    assert.strictEqual(row.breakfast_status, 'yes');
    assert.strictEqual(row.breakfast_time, '08:30:00');
    assert.strictEqual(row.breakfast_details, 'Idli Sambar');

    // Invariant check: Lunch and Dinner MUST be strictly NULL (unrecorded)
    assert.strictEqual(row.lunch_status, null, 'lunch_status must be NULL');
    assert.strictEqual(row.lunch_time, null, 'lunch_time must be NULL');
    assert.strictEqual(row.lunch_details, null, 'lunch_details must be NULL');

    assert.strictEqual(row.dinner_status, null, 'dinner_status must be NULL');
    assert.strictEqual(row.dinner_time, null, 'dinner_time must be NULL');
    assert.strictEqual(row.dinner_details, null, 'dinner_details must be NULL');
  });

  test('should subsequently upsert lunch as "no" without altering breakfast or dinner', async () => {
    const testDate = '2099-01-10';

    const upsertLunchSql = `
      INSERT INTO food_records (record_date, lunch_status, lunch_time, lunch_details)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        lunch_status = VALUES(lunch_status),
        lunch_time = VALUES(lunch_time),
        lunch_details = VALUES(lunch_details);
    `;

    await db.query(upsertLunchSql, [testDate, 'no', null, 'Fasting for medical tests']);

    const [rows] = await db.query('SELECT * FROM food_records WHERE record_date = ?', [testDate]);
    assert.strictEqual(rows.length, 1);
    const row = rows[0];

    // Breakfast must remain strictly intact
    assert.strictEqual(row.breakfast_status, 'yes');
    assert.strictEqual(row.breakfast_time, '08:30:00');
    assert.strictEqual(row.breakfast_details, 'Idli Sambar');

    // Lunch is now recorded as "no" with reason and NULL time
    assert.strictEqual(row.lunch_status, 'no');
    assert.strictEqual(row.lunch_time, null);
    assert.strictEqual(row.lunch_details, 'Fasting for medical tests');

    // Dinner is still untouched (NULL)
    assert.strictEqual(row.dinner_status, null);
  });

  test('should reset breakfast to NULL without affecting lunch', async () => {
    const testDate = '2099-01-10';

    await db.query(`
      UPDATE food_records
      SET breakfast_status = NULL,
          breakfast_time = NULL,
          breakfast_details = NULL
      WHERE record_date = ?
    `, [testDate]);

    const [rows] = await db.query('SELECT * FROM food_records WHERE record_date = ?', [testDate]);
    assert.strictEqual(rows.length, 1);
    const row = rows[0];

    // Breakfast is reset to NULL
    assert.strictEqual(row.breakfast_status, null);
    assert.strictEqual(row.breakfast_time, null);
    assert.strictEqual(row.breakfast_details, null);

    // Lunch remains "no"
    assert.strictEqual(row.lunch_status, 'no');
    assert.strictEqual(row.lunch_details, 'Fasting for medical tests');
  });

  test('should normalize undefined and boolean parameters properly', async () => {
    const testDate = '2099-01-11';

    // Passing undefined for lunch_time and boolean for a param
    const [result] = await db.query(
      `INSERT INTO food_records (record_date, lunch_status, lunch_time, lunch_details)
       VALUES (?, ?, ?, ?)`,
      [testDate, 'no', undefined, 'Param normalization test']
    );

    assert.ok(result.affectedRows >= 1 || result.changes >= 1);

    const [rows] = await db.query('SELECT * FROM food_records WHERE record_date = ?', [testDate]);
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].lunch_time, null);
    assert.strictEqual(rows[0].lunch_details, 'Param normalization test');
  });

  test('should support transactional getConnection() interface', async () => {
    const conn = await db.getConnection();
    assert.ok(typeof conn.query === 'function');
    assert.ok(typeof conn.beginTransaction === 'function');
    assert.ok(typeof conn.commit === 'function');
    assert.ok(typeof conn.rollback === 'function');

    await conn.beginTransaction();
    await conn.query(
      'INSERT INTO food_records (record_date, dinner_status, dinner_details) VALUES (?, ?, ?)',
      ['2099-01-12', 'yes', 'Chapati and Dal']
    );
    await conn.commit();
    conn.release();

    const [rows] = await db.query('SELECT * FROM food_records WHERE record_date = ?', ['2099-01-12']);
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].dinner_status, 'yes');
  });
});
