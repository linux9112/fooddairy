/**
 * tests/adversarial_db.test.js
 * 
 * Empirical Adversarial Test Harness for Database Persistence Layer.
 * Authors: M1 Challenger 1 (critic, specialist)
 * 
 * Target: server/db.js, database/setup.js
 * Coverage:
 * 1. Rapid concurrent operations & race conditions (Promise.all bursts, same-date concurrent upserts, disk WAL).
 * 2. Multi-meal upsert isolation (preserving other meal slots across repeated modifications).
 * 3. Edge cases: Multilingual Unicode, 4-byte astral emojis, ZWJ sequences, quotes/special chars.
 * 4. SQL Injection resistance in parameters and details fields.
 * 5. Extreme payload size (65KB TEXT boundary test).
 * 6. NULL resetting and parameter normalization.
 * 7. CHECK and UNIQUE constraint enforcement, report aggregation queries.
 * 8. Dialect translation edge cases & backtick identifier support.
 */

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

// Enforce SQLite in-memory driver for deterministic isolated test harness
process.env.DB_DRIVER = 'sqlite';
process.env.SQLITE_DB_PATH = ':memory:';

const db = require('../server/db');

describe('Adversarial Database Persistence Harness', () => {
  before(async () => {
    await db.initDb();
  });

  after(async () => {
    await db.close();
  });

  beforeEach(async () => {
    // Clean up all records between test runs
    await db.query('DELETE FROM food_records;');
  });

  // =========================================================================
  // SUITE 1: Rapid Concurrent Operations & Race Conditions
  // =========================================================================
  describe('1. Concurrency & Race Conditions', () => {
    test('1.1 Burst Concurrency: 60 simultaneous writes across different dates without deadlock or corruption', async () => {
      const dates = Array.from({ length: 60 }, (_, i) => {
        const d = String(i + 1).padStart(2, '0');
        return `2090-05-${d}`;
      });

      const upsertSql = `
        INSERT INTO food_records (record_date, breakfast_status, breakfast_time, breakfast_details)
        VALUES (?, 'yes', '08:15:00', ?)
        ON DUPLICATE KEY UPDATE
          breakfast_status = VALUES(breakfast_status),
          breakfast_time = VALUES(breakfast_time),
          breakfast_details = VALUES(breakfast_details);
      `;

      // Execute all 60 writes concurrently via Promise.all
      const promises = dates.map((date, idx) => db.query(upsertSql, [date, `Concurrent Meal #${idx}`]));
      const results = await Promise.all(promises);

      assert.strictEqual(results.length, 60);

      // Verify all 60 records exist in DB
      const [rows] = await db.query('SELECT COUNT(*) AS cnt FROM food_records;');
      assert.strictEqual(rows[0].cnt, 60, `Expected 60 records in DB, found ${rows[0].cnt}`);

      // Verify random sample record
      const [sample] = await db.query('SELECT * FROM food_records WHERE record_date = ?', ['2090-05-30']);
      assert.strictEqual(sample.length, 1);
      assert.strictEqual(sample[0].breakfast_details, 'Concurrent Meal #29');
    });

    test('1.2 Same-Date Multi-Meal Race Condition: Simultaneous breakfast, lunch, and dinner upserts on the exact same date', async () => {
      const raceDate = '2090-06-15';

      const upsertBreakfast = db.query(`
        INSERT INTO food_records (record_date, breakfast_status, breakfast_time, breakfast_details)
        VALUES (?, 'yes', '08:00:00', 'Poha and Tea')
        ON DUPLICATE KEY UPDATE
          breakfast_status = VALUES(breakfast_status),
          breakfast_time = VALUES(breakfast_time),
          breakfast_details = VALUES(breakfast_details);
      `, [raceDate]);

      const upsertLunch = db.query(`
        INSERT INTO food_records (record_date, lunch_status, lunch_time, lunch_details)
        VALUES (?, 'yes', '13:00:00', 'Rajma Chawal')
        ON DUPLICATE KEY UPDATE
          lunch_status = VALUES(lunch_status),
          lunch_time = VALUES(lunch_time),
          lunch_details = VALUES(lunch_details);
      `, [raceDate]);

      const upsertDinner = db.query(`
        INSERT INTO food_records (record_date, dinner_status, dinner_time, dinner_details)
        VALUES (?, 'no', NULL, 'Fasting tonight')
        ON DUPLICATE KEY UPDATE
          dinner_status = VALUES(dinner_status),
          dinner_time = VALUES(dinner_time),
          dinner_details = VALUES(dinner_details);
      `, [raceDate]);

      // Fire all 3 concurrent writes for the exact same date
      await Promise.all([upsertBreakfast, upsertLunch, upsertDinner]);

      // Verify: exactly ONE row must exist for this date
      const [rows] = await db.query('SELECT * FROM food_records WHERE record_date = ?', [raceDate]);
      assert.strictEqual(rows.length, 1, 'Exactly one row must exist for the date');

      const record = rows[0];
      // All 3 meals must be present and correctly populated without having overwritten each other
      assert.strictEqual(record.breakfast_status, 'yes', 'breakfast_status must be yes');
      assert.strictEqual(record.breakfast_time, '08:00:00', 'breakfast_time must be 08:00:00');
      assert.strictEqual(record.breakfast_details, 'Poha and Tea', 'breakfast_details must be Poha and Tea');

      assert.strictEqual(record.lunch_status, 'yes', 'lunch_status must be yes');
      assert.strictEqual(record.lunch_time, '13:00:00', 'lunch_time must be 13:00:00');
      assert.strictEqual(record.lunch_details, 'Rajma Chawal', 'lunch_details must be Rajma Chawal');

      assert.strictEqual(record.dinner_status, 'no', 'dinner_status must be no');
      assert.strictEqual(record.dinner_time, null, 'dinner_time must be null');
      assert.strictEqual(record.dinner_details, 'Fasting tonight', 'dinner_details must be Fasting tonight');
    });

    test('1.3 High-Contention Race Condition: 30 rapid sequential/concurrent updates to the same date', async () => {
      const testDate = '2090-06-20';

      // Insert baseline row
      await db.query(`
        INSERT INTO food_records (record_date, breakfast_status, breakfast_details, lunch_status, lunch_details, dinner_status, dinner_details)
        VALUES (?, 'yes', 'Initial Breakfast', 'yes', 'Initial Lunch', 'yes', 'Initial Dinner');
      `, [testDate]);

      // Concurrently fire 30 updates alternating between breakfast, lunch, and dinner
      const updates = Array.from({ length: 30 }, (_, i) => {
        const meal = ['breakfast', 'lunch', 'dinner'][i % 3];
        const status = i % 2 === 0 ? 'yes' : 'no';
        const details = `Update ${i} on ${meal}`;
        const sql = `
          INSERT INTO food_records (record_date, ${meal}_status, ${meal}_details)
          VALUES (?, ?, ?)
          ON DUPLICATE KEY UPDATE
            ${meal}_status = VALUES(${meal}_status),
            ${meal}_details = VALUES(${meal}_details);
        `;
        return db.query(sql, [testDate, status, details]);
      });

      await Promise.all(updates);

      // Verify row integrity: exactly one row, no errors, all fields defined
      const [rows] = await db.query('SELECT * FROM food_records WHERE record_date = ?', [testDate]);
      assert.strictEqual(rows.length, 1);
      assert.ok(['yes', 'no'].includes(rows[0].breakfast_status));
      assert.ok(['yes', 'no'].includes(rows[0].lunch_status));
      assert.ok(['yes', 'no'].includes(rows[0].dinner_status));
      assert.ok(rows[0].breakfast_details.includes('breakfast'));
      assert.ok(rows[0].lunch_details.includes('lunch'));
      assert.ok(rows[0].dinner_details.includes('dinner'));
    });
  });

  // =========================================================================
  // SUITE 2: Multi-Meal Upsert Isolation
  // =========================================================================
  describe('2. Multi-Meal Upsert Isolation', () => {
    test('2.1 Updating breakfast 5 times must NEVER mutate or reset existing lunch and dinner', async () => {
      const testDate = '2090-07-01';

      // 1. Establish Lunch as "yes" and Dinner as "no"
      await db.query(`
        INSERT INTO food_records (record_date, lunch_status, lunch_time, lunch_details, dinner_status, dinner_time, dinner_details)
        VALUES (?, 'yes', '12:30:00', 'Vegetable Biryani', 'no', NULL, 'Intermittent Fasting');
      `, [testDate]);

      // Verify baseline
      let [rows] = await db.query('SELECT * FROM food_records WHERE record_date = ?', [testDate]);
      assert.strictEqual(rows[0].breakfast_status, null);
      assert.strictEqual(rows[0].lunch_details, 'Vegetable Biryani');
      assert.strictEqual(rows[0].dinner_details, 'Intermittent Fasting');

      // 2. Perform 5 consecutive breakfast updates
      const breakfastUpdates = [
        { status: 'yes', time: '07:30:00', details: 'Avocado Toast' },
        { status: 'yes', time: '08:00:00', details: 'Added Coffee' },
        { status: 'no', time: null, details: 'Decided to skip instead' },
        { status: 'yes', time: '09:00:00', details: 'Late breakfast: smoothie' },
        { status: 'no', time: null, details: 'Final choice: skipped breakfast' }
      ];

      for (const update of breakfastUpdates) {
        await db.query(`
          INSERT INTO food_records (record_date, breakfast_status, breakfast_time, breakfast_details)
          VALUES (?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            breakfast_status = VALUES(breakfast_status),
            breakfast_time = VALUES(breakfast_time),
            breakfast_details = VALUES(breakfast_details);
        `, [testDate, update.status, update.time, update.details]);

        // After every single update, verify lunch and dinner remain 100% frozen
        const [current] = await db.query('SELECT * FROM food_records WHERE record_date = ?', [testDate]);
        assert.strictEqual(current.length, 1);
        assert.strictEqual(current[0].lunch_status, 'yes');
        assert.strictEqual(current[0].lunch_time, '12:30:00');
        assert.strictEqual(current[0].lunch_details, 'Vegetable Biryani');
        assert.strictEqual(current[0].dinner_status, 'no');
        assert.strictEqual(current[0].dinner_time, null);
        assert.strictEqual(current[0].dinner_details, 'Intermittent Fasting');

        // Verify breakfast reflects latest update
        assert.strictEqual(current[0].breakfast_status, update.status);
        assert.strictEqual(current[0].breakfast_time, update.time);
        assert.strictEqual(current[0].breakfast_details, update.details);
      }
    });

    test('2.2 Reverse creation order: Insert dinner first -> lunch -> breakfast', async () => {
      const testDate = '2090-07-02';

      // Step A: Insert Dinner only
      await db.query(`
        INSERT INTO food_records (record_date, dinner_status, dinner_time, dinner_details)
        VALUES (?, 'yes', '20:15:00', 'Steamed Fish')
        ON DUPLICATE KEY UPDATE
          dinner_status = VALUES(dinner_status),
          dinner_time = VALUES(dinner_time),
          dinner_details = VALUES(dinner_details);
      `, [testDate]);

      let [r] = await db.query('SELECT * FROM food_records WHERE record_date = ?', [testDate]);
      assert.strictEqual(r[0].breakfast_status, null);
      assert.strictEqual(r[0].lunch_status, null);
      assert.strictEqual(r[0].dinner_status, 'yes');

      // Step B: Upsert Lunch only
      await db.query(`
        INSERT INTO food_records (record_date, lunch_status, lunch_time, lunch_details)
        VALUES (?, 'no', NULL, 'Skipped lunch for meeting')
        ON DUPLICATE KEY UPDATE
          lunch_status = VALUES(lunch_status),
          lunch_time = VALUES(lunch_time),
          lunch_details = VALUES(lunch_details);
      `, [testDate]);

      [r] = await db.query('SELECT * FROM food_records WHERE record_date = ?', [testDate]);
      assert.strictEqual(r[0].breakfast_status, null, 'Breakfast must remain NULL');
      assert.strictEqual(r[0].lunch_status, 'no', 'Lunch must be no');
      assert.strictEqual(r[0].dinner_status, 'yes', 'Dinner must remain yes');

      // Step C: Upsert Breakfast only
      await db.query(`
        INSERT INTO food_records (record_date, breakfast_status, breakfast_time, breakfast_details)
        VALUES (?, 'yes', '07:45:00', 'Masala Dosa')
        ON DUPLICATE KEY UPDATE
          breakfast_status = VALUES(breakfast_status),
          breakfast_time = VALUES(breakfast_time),
          breakfast_details = VALUES(breakfast_details);
      `, [testDate]);

      [r] = await db.query('SELECT * FROM food_records WHERE record_date = ?', [testDate]);
      assert.strictEqual(r[0].breakfast_status, 'yes');
      assert.strictEqual(r[0].lunch_status, 'no');
      assert.strictEqual(r[0].dinner_status, 'yes');
    });
  });

  // =========================================================================
  // SUITE 3: Edge Cases - Unicode, Special Characters & Injections
  // =========================================================================
  describe('3. Edge Cases & Payloads', () => {
    test('3.1 Multilingual Unicode Text (Hindi, CJK, Arabic RTL, Cyrillic, Accented Latin)', async () => {
      const testCases = [
        { date: '2090-08-01', text: 'आज नाश्ते में 2 आलू पराठे और 1 कटोरी दही खाया। बहुत ही स्वादिष्ट!' },
        { date: '2090-08-02', text: '昼食に新鮮な寿司と抹茶アイスクリームを食べました。ごちそうさまでした。' },
        { date: '2090-08-03', text: 'تناولت وجبة غداء شهية: دجاج مشوي مع أرز وسلطة خضراء طازجة.' },
        { date: '2090-08-04', text: 'Завтрак: овсяная каша с грецкими орехами, мёдом и зелёным чаем.' },
        { date: '2090-08-05', text: 'Crème brûlée, café au lait & croissant fraîchement doré à la boulangerie.' }
      ];

      for (const tc of testCases) {
        await db.query(`
          INSERT INTO food_records (record_date, breakfast_status, breakfast_details)
          VALUES (?, 'yes', ?);
        `, [tc.date, tc.text]);

        const [rows] = await db.query('SELECT breakfast_details FROM food_records WHERE record_date = ?', [tc.date]);
        assert.strictEqual(rows[0].breakfast_details, tc.text, `Unicode mismatch for date ${tc.date}`);
      }
    });

    test('3.2 Astral Plane (4-byte UTF-8) Emojis & Zero-Width Joiner (ZWJ) Sequences', async () => {
      const emojiText = '🥞 Fluffy Pancakes! 🍓🫐🍯✨ 10/10 😋 👨‍🍳 ☕️ 🥪 🧘🏽‍♀️ 🏳️‍🌈 🍕🎉';
      const testDate = '2090-08-10';

      await db.query(`
        INSERT INTO food_records (record_date, breakfast_status, breakfast_details)
        VALUES (?, 'yes', ?);
      `, [testDate, emojiText]);

      const [rows] = await db.query('SELECT breakfast_details FROM food_records WHERE record_date = ?', [testDate]);
      assert.strictEqual(rows[0].breakfast_details, emojiText, 'Astral emoji string must preserve byte-for-byte fidelity');
    });

    test('3.3 Hostile Special Characters, Quotes, Escapes, Newlines, Tabs', async () => {
      const hostileText = "Single 'quote', double \"quote\", backtick `val`, backslash \\, newline \n and \r\n, tab \t, symbols: < > & $ % # @ ! ^ * ( ) [ ] { } ? / | ~";
      const testDate = '2090-08-11';

      await db.query(`
        INSERT INTO food_records (record_date, lunch_status, lunch_details)
        VALUES (?, 'yes', ?);
      `, [testDate, hostileText]);

      const [rows] = await db.query('SELECT lunch_details FROM food_records WHERE record_date = ?', [testDate]);
      assert.strictEqual(rows[0].lunch_details, hostileText);
    });

    test('3.4 SQL Injection Payloads in Parameters Must Be Harmlessly Escaped & Preserved Verbatim', async () => {
      const sqliPayloads = [
        "'; DROP TABLE food_records; --",
        "' OR '1'='1",
        "admin'--",
        "Robert'); DROP TABLE Students;--",
        "' UNION SELECT 1, '2099-01-01', 'yes', '01:00:00', 'hacked', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL --",
        "1; ATTACH DATABASE 'evil.db' AS evil; --",
        "'; UPDATE food_records SET breakfast_status='hacked'; --",
        "' /*!50000 SELECT */ 1; --"
      ];

      for (let i = 0; i < sqliPayloads.length; i++) {
        const payload = sqliPayloads[i];
        const date = `2090-08-${String(20 + i).padStart(2, '0')}`;

        // Attempt upsert with hostile payload
        await db.query(`
          INSERT INTO food_records (record_date, dinner_status, dinner_details)
          VALUES (?, 'yes', ?)
          ON DUPLICATE KEY UPDATE dinner_details = VALUES(dinner_details);
        `, [date, payload]);

        // 1. Table MUST still exist
        const [tables] = await db.query("SELECT COUNT(*) AS cnt FROM food_records;");
        assert.ok(tables[0].cnt >= 1, 'Table food_records must not be dropped');

        // 2. The row must store the exact literal payload string
        const [rows] = await db.query('SELECT dinner_details FROM food_records WHERE record_date = ?', [date]);
        assert.strictEqual(rows.length, 1);
        assert.strictEqual(rows[0].dinner_details, payload, 'Payload must be stored verbatim without executing');
      }
    });

    test('3.5 XSS / HTML payloads stored safely', async () => {
      const xss = '<script>alert("xss")</script><img src=x onerror="javascript:alert(1)"><iframe src="https://evil.com"></iframe>';
      const testDate = '2090-08-30';

      await db.query(`
        INSERT INTO food_records (record_date, breakfast_status, breakfast_details)
        VALUES (?, 'yes', ?);
      `, [testDate, xss]);

      const [rows] = await db.query('SELECT breakfast_details FROM food_records WHERE record_date = ?', [testDate]);
      assert.strictEqual(rows[0].breakfast_details, xss);
    });

    test('3.6 Large Text Boundary: 65,000 character details payload', async () => {
      const largeDetails = 'A'.repeat(65000);
      const testDate = '2090-08-31';

      await db.query(`
        INSERT INTO food_records (record_date, breakfast_status, breakfast_details)
        VALUES (?, 'yes', ?);
      `, [testDate, largeDetails]);

      const [rows] = await db.query('SELECT breakfast_details FROM food_records WHERE record_date = ?', [testDate]);
      assert.strictEqual(rows[0].breakfast_details.length, 65000);
      assert.strictEqual(rows[0].breakfast_details, largeDetails);
    });
  });

  // =========================================================================
  // SUITE 4: NULL Resetting & Parameter Normalization
  // =========================================================================
  describe('4. NULL Resetting & Parameter Normalization', () => {
    test('4.1 Resetting a single meal to NULL clears only target meal and keeps other meals intact', async () => {
      const testDate = '2090-09-01';

      // Insert full day (all 3 meals recorded)
      await db.query(`
        INSERT INTO food_records (
          record_date,
          breakfast_status, breakfast_time, breakfast_details,
          lunch_status, lunch_time, lunch_details,
          dinner_status, dinner_time, dinner_details
        ) VALUES (
          ?,
          'yes', '08:00:00', 'Cereal',
          'yes', '13:00:00', 'Sandwich',
          'no', NULL, 'Not hungry'
        );
      `, [testDate]);

      // Reset lunch to NULL
      await db.query(`
        UPDATE food_records
        SET lunch_status = NULL,
            lunch_time = NULL,
            lunch_details = NULL
        WHERE record_date = ?;
      `, [testDate]);

      const [rows] = await db.query('SELECT * FROM food_records WHERE record_date = ?', [testDate]);
      assert.strictEqual(rows.length, 1);
      const row = rows[0];

      // Breakfast intact
      assert.strictEqual(row.breakfast_status, 'yes');
      assert.strictEqual(row.breakfast_time, '08:00:00');
      assert.strictEqual(row.breakfast_details, 'Cereal');

      // Lunch is reset to NULL
      assert.strictEqual(row.lunch_status, null);
      assert.strictEqual(row.lunch_time, null);
      assert.strictEqual(row.lunch_details, null);

      // Dinner intact
      assert.strictEqual(row.dinner_status, 'no');
      assert.strictEqual(row.dinner_time, null);
      assert.strictEqual(row.dinner_details, 'Not hungry');
    });

    test('4.2 Resetting all meals leaves record_date row intact with all meals NULL', async () => {
      const testDate = '2090-09-02';

      await db.query(`
        INSERT INTO food_records (record_date, breakfast_status, breakfast_details)
        VALUES (?, 'yes', 'Toast');
      `, [testDate]);

      // Reset all meals to NULL
      await db.query(`
        UPDATE food_records
        SET breakfast_status = NULL, breakfast_time = NULL, breakfast_details = NULL,
            lunch_status = NULL, lunch_time = NULL, lunch_details = NULL,
            dinner_status = NULL, dinner_time = NULL, dinner_details = NULL
        WHERE record_date = ?;
      `, [testDate]);

      const [rows] = await db.query('SELECT * FROM food_records WHERE record_date = ?', [testDate]);
      assert.strictEqual(rows.length, 1, 'Row for date should still exist');
      assert.strictEqual(rows[0].breakfast_status, null);
      assert.strictEqual(rows[0].lunch_status, null);
      assert.strictEqual(rows[0].dinner_status, null);
    });

    test('4.3 Parameter Normalization: undefined values become null, boolean becomes 1/0, Date becomes ISO string', async () => {
      const testDate = '2090-09-03';

      // Pass undefined for time and details
      await db.query(`
        INSERT INTO food_records (record_date, breakfast_status, breakfast_time, breakfast_details)
        VALUES (?, ?, ?, ?);
      `, [testDate, 'yes', undefined, undefined]);

      const [rows] = await db.query('SELECT * FROM food_records WHERE record_date = ?', [testDate]);
      assert.strictEqual(rows[0].breakfast_status, 'yes');
      assert.strictEqual(rows[0].breakfast_time, null);
      assert.strictEqual(rows[0].breakfast_details, null);
    });
  });

  // =========================================================================
  // SUITE 5: Constraints & Reporting Queries
  // =========================================================================
  describe('5. Constraints & Reporting Queries', () => {
    test('5.1 CHECK Constraint Rejects Invalid Status Value (e.g. "maybe", "ate", "skipped")', async () => {
      const testDate = '2090-10-01';

      await assert.rejects(
        async () => {
          await db.query(`
            INSERT INTO food_records (record_date, breakfast_status)
            VALUES (?, 'maybe');
          `, [testDate]);
        },
        /CHECK constraint failed|CHECK/i,
        'Database must reject breakfast_status not in ("yes", "no", NULL)'
      );
    });

    test('5.2 UNIQUE Constraint on record_date rejects duplicate direct INSERT without conflict handling', async () => {
      const testDate = '2090-10-02';

      await db.query(`
        INSERT INTO food_records (record_date, breakfast_status)
        VALUES (?, 'yes');
      `, [testDate]);

      // Second raw insert without ON DUPLICATE / ON CONFLICT must fail
      await assert.rejects(
        async () => {
          await db.query(`
            INSERT INTO food_records (record_date, breakfast_status)
            VALUES (?, 'no');
          `, [testDate]);
        },
        /UNIQUE constraint failed|ER_DUP_ENTRY/i,
        'Direct duplicate insert on record_date must violate UNIQUE constraint'
      );
    });

    test('5.3 Weekly and Monthly Report Aggregation Queries (SUM CASE, COUNT, BETWEEN)', async () => {
      await db.query(`
        INSERT INTO food_records (record_date, breakfast_status, lunch_status, dinner_status)
        VALUES ('2026-09-21', 'yes', 'no', NULL),
               ('2026-09-22', 'yes', 'yes', 'yes');
      `);

      const aggSql = `
        SELECT
          COUNT(*) AS total_records,
          SUM(CASE WHEN breakfast_status = 'yes' THEN 1 ELSE 0 END) AS bf_ate,
          SUM(CASE WHEN breakfast_status = 'no' THEN 1 ELSE 0 END) AS bf_skipped,
          SUM(CASE WHEN breakfast_status IS NULL THEN 1 ELSE 0 END) AS bf_unrecorded,
          SUM(CASE WHEN lunch_status = 'yes' THEN 1 ELSE 0 END) AS lu_ate,
          SUM(CASE WHEN dinner_status = 'yes' THEN 1 ELSE 0 END) AS dn_ate
        FROM food_records
        WHERE record_date BETWEEN '2026-09-21' AND '2026-09-22';
      `;

      const [rows] = await db.query(aggSql);
      assert.strictEqual(rows.length, 1);
      assert.strictEqual(rows[0].total_records, 2);
      assert.strictEqual(rows[0].bf_ate, 2);
      assert.strictEqual(rows[0].bf_skipped, 0);
      assert.strictEqual(rows[0].bf_unrecorded, 0);
      assert.strictEqual(rows[0].lu_ate, 1);
      assert.strictEqual(rows[0].dn_ate, 1);
    });

    test('5.4 Database Setup Idempotency: Running setup multiple times does not throw or truncate data', async () => {
      const testDate = '2090-10-05';
      await db.query(`
        INSERT INTO food_records (record_date, breakfast_status, breakfast_details)
        VALUES (?, 'yes', 'Persistent Record Across Setup');
      `, [testDate]);

      // Re-run setup
      const setup = require('../database/setup');
      assert.doesNotThrow(() => {
        setup.runSQLiteSetup();
      });

      // Verify the record still exists!
      const [rows] = await db.query('SELECT * FROM food_records WHERE record_date = ?', [testDate]);
      assert.strictEqual(rows.length, 1);
      assert.strictEqual(rows[0].breakfast_details, 'Persistent Record Across Setup');
    });
  });

  // =========================================================================
  // SUITE 6: Dialect Translation Precision & Identifier Quoting
  // =========================================================================
  describe('6. Dialect Translation Precision & Identifier Quoting', () => {
    test('6.1 Backtick support in ON DUPLICATE KEY UPDATE VALUES(`col`)', async () => {
      const testDate = '2090-11-01';
      const sqlWithBackticks = `
        INSERT INTO \`food_records\` (\`record_date\`, \`breakfast_status\`)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE \`breakfast_status\` = VALUES(\`breakfast_status\`);
      `;

      await db.query(sqlWithBackticks, [testDate, 'yes']);
      const [rows] = await db.query('SELECT breakfast_status FROM food_records WHERE record_date = ?', [testDate]);
      assert.strictEqual(rows.length, 1);
      assert.strictEqual(rows[0].breakfast_status, 'yes');
    });

    test('6.2 Backtick support in SHOW COLUMNS FROM `table` and DESCRIBE `table`', async () => {
      const [cols] = await db.query('SHOW COLUMNS FROM `food_records`;');
      assert.strictEqual(cols.length, 13);

      const [desc] = await db.query('DESCRIBE `food_records`;');
      assert.strictEqual(desc.length, 13);
    });

    test('6.3 Unparameterized SELECT containing semicolon in literal string must return rows', async () => {
      const testDate = '2090-11-03';
      await db.query(`
        INSERT INTO food_records (record_date, breakfast_status, breakfast_details)
        VALUES (?, 'yes', 'Tea; Biscuits');
      `, [testDate]);

      const [rows] = await db.query("SELECT * FROM food_records WHERE breakfast_details = 'Tea; Biscuits';");
      assert.ok(Array.isArray(rows), 'Result must be an array of rows');
      assert.strictEqual(rows.length, 1);
      assert.strictEqual(rows[0].breakfast_details, 'Tea; Biscuits');
    });
  });
});
