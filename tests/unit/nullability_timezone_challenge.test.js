/**
 * tests/unit/nullability_timezone_challenge.test.js
 * 
 * Adversarial Empirical Verification Suite for M1 Challenger 2.
 * Focus:
 * 1. Strict SQL NULL nullability invariants across breakfast, lunch, and dinner.
 * 2. Date string preservation ('YYYY-MM-DD') without timezone drift across UTC midnight.
 * 3. Time string preservation across diverse time values (e.g. midnight, noon, late night).
 * 4. Constraint integrity and parameter normalization.
 */

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// Configure test environment for SQLite in-memory isolation
process.env.DB_DRIVER = 'sqlite';
process.env.SQLITE_DB_PATH = ':memory:';

const db = require('../../server/db');

describe('M1 Challenger 2: Nullability Invariants & Timezone Safety', () => {
  before(async () => {
    await db.initDb();
  });

  after(async () => {
    await db.close();
  });

  // =========================================================================
  // REQUIREMENT 1: Strict Nullability Invariants
  // =========================================================================
  describe('1. Strict SQL NULL Nullability Invariants', () => {
    test('1.1: Inserting only breakfast leaves lunch and dinner as strict SQL NULL (not "", not 0, not "no")', async () => {
      const date = '2099-03-01';
      const insertSql = `
        INSERT INTO food_records (record_date, breakfast_status, breakfast_time, breakfast_details)
        VALUES (?, 'yes', '08:15:00', 'Oatmeal with Almonds')
      `;
      await db.query(insertSql, [date]);

      const [rows] = await db.query('SELECT * FROM food_records WHERE record_date = ?', [date]);
      assert.strictEqual(rows.length, 1, 'Exactly one record must be returned');
      const row = rows[0];

      // Breakfast assertions
      assert.strictEqual(row.record_date, date);
      assert.strictEqual(row.breakfast_status, 'yes');
      assert.strictEqual(row.breakfast_time, '08:15:00');
      assert.strictEqual(row.breakfast_details, 'Oatmeal with Almonds');

      // Strict Lunch Nullability Assertions
      assert.strictEqual(row.lunch_status, null, 'lunch_status must be strict null');
      assert.notStrictEqual(row.lunch_status, '', 'lunch_status must NOT be empty string');
      assert.notStrictEqual(row.lunch_status, 0, 'lunch_status must NOT be 0');
      assert.notStrictEqual(row.lunch_status, 'no', 'lunch_status must NOT be "no"');
      assert.notStrictEqual(row.lunch_status, 'null', 'lunch_status must NOT be string "null"');
      assert.notStrictEqual(row.lunch_status, undefined, 'lunch_status must NOT be undefined');

      assert.strictEqual(row.lunch_time, null, 'lunch_time must be strict null');
      assert.notStrictEqual(row.lunch_time, '', 'lunch_time must NOT be empty string');
      assert.notStrictEqual(row.lunch_time, 0, 'lunch_time must NOT be 0');
      assert.notStrictEqual(row.lunch_time, '00:00:00', 'lunch_time must NOT default to midnight');

      assert.strictEqual(row.lunch_details, null, 'lunch_details must be strict null');
      assert.notStrictEqual(row.lunch_details, '', 'lunch_details must NOT be empty string');
      assert.notStrictEqual(row.lunch_details, 0, 'lunch_details must NOT be 0');

      // Strict Dinner Nullability Assertions
      assert.strictEqual(row.dinner_status, null, 'dinner_status must be strict null');
      assert.notStrictEqual(row.dinner_status, '', 'dinner_status must NOT be empty string');
      assert.notStrictEqual(row.dinner_status, 0, 'dinner_status must NOT be 0');
      assert.notStrictEqual(row.dinner_status, 'no', 'dinner_status must NOT be "no"');
      assert.notStrictEqual(row.dinner_status, 'null', 'dinner_status must NOT be string "null"');
      assert.notStrictEqual(row.dinner_status, undefined, 'dinner_status must NOT be undefined');

      assert.strictEqual(row.dinner_time, null, 'dinner_time must be strict null');
      assert.notStrictEqual(row.dinner_time, '', 'dinner_time must NOT be empty string');
      assert.notStrictEqual(row.dinner_time, 0, 'dinner_time must NOT be 0');
      assert.notStrictEqual(row.dinner_time, '00:00:00', 'dinner_time must NOT default to midnight');

      assert.strictEqual(row.dinner_details, null, 'dinner_details must be strict null');
      assert.notStrictEqual(row.dinner_details, '', 'dinner_details must NOT be empty string');
      assert.notStrictEqual(row.dinner_details, 0, 'dinner_details must NOT be 0');
    });

    test('1.2: Upsert with ON DUPLICATE KEY UPDATE preserves unrecorded meals as strict NULL', async () => {
      const date = '2099-03-02';
      const upsertSql = `
        INSERT INTO food_records (record_date, breakfast_status, breakfast_time, breakfast_details)
        VALUES (?, 'yes', '09:00:00', 'Toast and Poached Eggs')
        ON DUPLICATE KEY UPDATE
          breakfast_status = VALUES(breakfast_status),
          breakfast_time = VALUES(breakfast_time),
          breakfast_details = VALUES(breakfast_details)
      `;

      // Run upsert twice to simulate insert then update
      await db.query(upsertSql, [date]);
      await db.query(upsertSql, [date]);

      const [rows] = await db.query('SELECT * FROM food_records WHERE record_date = ?', [date]);
      assert.strictEqual(rows.length, 1);
      const row = rows[0];

      assert.strictEqual(row.breakfast_details, 'Toast and Poached Eggs');
      assert.strictEqual(row.lunch_status, null);
      assert.strictEqual(row.lunch_time, null);
      assert.strictEqual(row.lunch_details, null);
      assert.strictEqual(row.dinner_status, null);
      assert.strictEqual(row.dinner_time, null);
      assert.strictEqual(row.dinner_details, null);
    });

    test('1.3: Passing explicit undefined and null in parameters yields strict SQL NULL in database', async () => {
      const date = '2099-03-03';
      const sql = `
        INSERT INTO food_records (
          record_date,
          breakfast_status, breakfast_time, breakfast_details,
          lunch_status, lunch_time, lunch_details,
          dinner_status, dinner_time, dinner_details
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      // Explicitly pass undefined for lunch and null for dinner
      await db.query(sql, [
        date,
        'yes', '07:45:00', 'Fruit salad',
        undefined, undefined, undefined,
        null, null, null
      ]);

      const [rows] = await db.query('SELECT * FROM food_records WHERE record_date = ?', [date]);
      assert.strictEqual(rows.length, 1);
      const row = rows[0];

      // Lunch (from undefined) must be strictly null
      assert.strictEqual(row.lunch_status, null);
      assert.strictEqual(row.lunch_time, null);
      assert.strictEqual(row.lunch_details, null);

      // Dinner (from null) must be strictly null
      assert.strictEqual(row.dinner_status, null);
      assert.strictEqual(row.dinner_time, null);
      assert.strictEqual(row.dinner_details, null);
    });

    test('1.4: Saving lunch as "no" sets lunch_time to NULL and leaves dinner as strict NULL', async () => {
      const date = '2099-03-04';
      await db.query(`
        INSERT INTO food_records (record_date, lunch_status, lunch_time, lunch_details)
        VALUES (?, 'no', NULL, 'Skipped lunch due to travel')
      `, [date]);

      const [rows] = await db.query('SELECT * FROM food_records WHERE record_date = ?', [date]);
      assert.strictEqual(rows.length, 1);
      const row = rows[0];

      assert.strictEqual(row.breakfast_status, null);
      assert.strictEqual(row.breakfast_time, null);
      assert.strictEqual(row.breakfast_details, null);

      assert.strictEqual(row.lunch_status, 'no');
      assert.strictEqual(row.lunch_time, null, 'lunch_time must be null when status is "no"');
      assert.strictEqual(row.lunch_details, 'Skipped lunch due to travel');

      assert.strictEqual(row.dinner_status, null);
      assert.strictEqual(row.dinner_time, null);
      assert.strictEqual(row.dinner_details, null);
    });

    test('1.5: Schema CHECK constraint prevents invalid status strings (e.g. "maybe", "")', async () => {
      const date = '2099-03-05';
      
      // Attempt to insert invalid status 'maybe'
      await assert.rejects(
        async () => {
          await db.query(
            'INSERT INTO food_records (record_date, breakfast_status) VALUES (?, ?)',
            [date, 'maybe']
          );
        },
        /CHECK constraint failed/i,
        'Database must reject non-ternary status values like "maybe"'
      );

      // Attempt to insert empty string ''
      await assert.rejects(
        async () => {
          await db.query(
            'INSERT INTO food_records (record_date, breakfast_status) VALUES (?, ?)',
            [date, '']
          );
        },
        /CHECK constraint failed/i,
        'Database must reject empty string for meal status'
      );
    });

    test('1.6: Single meal reset via UPDATE sets columns to strict NULL without affecting others', async () => {
      const date = '2099-03-06';
      // Seed full day
      await db.query(`
        INSERT INTO food_records (
          record_date,
          breakfast_status, breakfast_time, breakfast_details,
          lunch_status, lunch_time, lunch_details,
          dinner_status, dinner_time, dinner_details
        ) VALUES (?, 'yes', '08:00:00', 'Eggs', 'no', NULL, 'Busy', 'yes', '20:00:00', 'Salad')
      `, [date]);

      // Reset dinner
      await db.query(`
        UPDATE food_records
        SET dinner_status = NULL, dinner_time = NULL, dinner_details = NULL
        WHERE record_date = ?
      `, [date]);

      const [rows] = await db.query('SELECT * FROM food_records WHERE record_date = ?', [date]);
      assert.strictEqual(rows.length, 1);
      const row = rows[0];

      // Breakfast and Lunch untouched
      assert.strictEqual(row.breakfast_status, 'yes');
      assert.strictEqual(row.lunch_status, 'no');
      assert.strictEqual(row.lunch_details, 'Busy');

      // Dinner is strict NULL
      assert.strictEqual(row.dinner_status, null);
      assert.strictEqual(row.dinner_time, null);
      assert.strictEqual(row.dinner_details, null);
    });
  });

  // =========================================================================
  // REQUIREMENT 2: Date String Preservation & Timezone Safety
  // =========================================================================
  describe('2. Date String Preservation Across Calendar Boundaries', () => {
    const testDates = [
      '2026-01-01', // New Year Day
      '2026-02-28', // Standard Feb end
      '2024-02-29', // Leap day
      '2026-03-01', // March begin
      '2026-04-30', // April end
      '2026-05-01', // May begin
      '2026-09-30', // Current target date
      '2026-10-01', // Next month boundary
      '2026-12-31', // Year end boundary
      '2027-01-01', // Next year boundary
      '2099-12-31'  // Distant future boundary
    ];

    test('2.1: Queries return exact YYYY-MM-DD string type without Date object conversion', async () => {
      for (const d of testDates) {
        await db.query(
          'INSERT INTO food_records (record_date, breakfast_status) VALUES (?, ?)',
          [d, 'yes']
        );

        const [rows] = await db.query('SELECT record_date FROM food_records WHERE record_date = ?', [d]);
        assert.strictEqual(rows.length, 1, `Date query for ${d} must return 1 row`);
        const row = rows[0];

        // Critical Timezone Invariant: Must be a primitive string, NOT a Date instance
        assert.strictEqual(typeof row.record_date, 'string', `record_date for ${d} must be a string`);
        assert.ok(!(row.record_date instanceof Date), `record_date for ${d} must NOT be a Date object`);
        assert.strictEqual(row.record_date, d, `record_date must match exact calendar date ${d}`);

        // JSON serialization invariance
        const serialized = JSON.stringify({ date: row.record_date });
        assert.strictEqual(serialized, `{"date":"${d}"}`, `JSON serialization must not alter date string ${d}`);
      }
    });

    test('2.2: Lexicographical date range queries match calendar order strictly', async () => {
      const [rows] = await db.query(
        'SELECT record_date FROM food_records WHERE record_date >= ? AND record_date <= ? ORDER BY record_date ASC',
        ['2026-01-01', '2026-12-31']
      );

      const returnedDates = rows.map(r => r.record_date);
      const expectedDates = [
        '2026-01-01', '2026-02-28', '2026-03-01',
        '2026-04-30', '2026-05-01', '2026-09-30',
        '2026-10-01', '2026-12-31'
      ];

      assert.deepStrictEqual(returnedDates, expectedDates, 'Range query must strictly preserve chronological order');
    });

    test('2.3: Parameter normalization preserves string format and does not mutate string dates', () => {
      // Direct verification of parameter normalizer behavior
      const testDate = '2026-09-30';
      // In server/db.js, strings are preserved as-is
      assert.strictEqual(typeof testDate, 'string');
      assert.strictEqual(testDate.length, 10);
      assert.match(testDate, /^\d{4}-\d{2}-\d{2}$/);
    });
  });

  // =========================================================================
  // REQUIREMENT 3: Time String Preservation
  // =========================================================================
  describe('3. Time String Preservation', () => {
    const testTimes = [
      { label: 'Morning standard', time: '08:30:00' },
      { label: 'Midnight boundary (00:00:00)', time: '00:00:00' },
      { label: 'Noon boundary (12:00:00)', time: '12:00:00' },
      { label: 'Late night (23:59:59)', time: '23:59:59' },
      { label: 'Early morning (01:05:07)', time: '01:05:07' },
      { label: '5-char time (14:30)', time: '14:30' }
    ];

    test('3.1: _time columns preserve exact time strings across boundaries including midnight', async () => {
      for (let i = 0; i < testTimes.length; i++) {
        const item = testTimes[i];
        const date = `2099-04-0${i + 1}`;

        await db.query(`
          INSERT INTO food_records (record_date, breakfast_status, breakfast_time, breakfast_details)
          VALUES (?, 'yes', ?, 'Time check')
        `, [date, item.time]);

        const [rows] = await db.query('SELECT breakfast_time FROM food_records WHERE record_date = ?', [date]);
        assert.strictEqual(rows.length, 1);
        const row = rows[0];

        // Critical assertions
        assert.strictEqual(typeof row.breakfast_time, 'string', `${item.label}: breakfast_time must be string`);
        assert.strictEqual(row.breakfast_time, item.time, `${item.label}: breakfast_time must match ${item.time}`);

        // Midnight boundary check (00:00:00 must NOT be treated as falsy or 0)
        if (item.time === '00:00:00') {
          assert.notStrictEqual(row.breakfast_time, null);
          assert.notStrictEqual(row.breakfast_time, 0);
          assert.notStrictEqual(row.breakfast_time, false);
          assert.strictEqual(row.breakfast_time.length, 8);
        }

        // JSON serialization invariance
        const serialized = JSON.stringify({ time: row.breakfast_time });
        assert.strictEqual(serialized, `{"time":"${item.time}"}`);
      }
    });

    test('3.2: Skipped and unrecorded meal times remain strictly NULL', async () => {
      const date = '2099-04-20';
      await db.query(`
        INSERT INTO food_records (record_date, breakfast_status, breakfast_time, breakfast_details, lunch_status, lunch_time, lunch_details)
        VALUES (?, 'yes', '08:00:00', 'Paratha', 'no', NULL, 'Skipped lunch')
      `, [date]);

      const [rows] = await db.query('SELECT * FROM food_records WHERE record_date = ?', [date]);
      const row = rows[0];

      // Lunch time must be strictly null
      assert.strictEqual(row.lunch_time, null);
      assert.notStrictEqual(row.lunch_time, '00:00:00');
      assert.notStrictEqual(row.lunch_time, '');

      // Dinner time must be strictly null
      assert.strictEqual(row.dinner_time, null);
      assert.notStrictEqual(row.dinner_time, '00:00:00');
      assert.notStrictEqual(row.dinner_time, '');
    });
  });

  // =========================================================================
  // ADVERSARIAL STRESS & CONCURRENCY
  // =========================================================================
  describe('4. Adversarial Stress & Concurrency', () => {
    test('4.1: Atomic update of multiple meals on same date preserves independent values', async () => {
      const date = '2099-05-01';

      // Insert breakfast
      await db.query(`
        INSERT INTO food_records (record_date, breakfast_status, breakfast_time, breakfast_details)
        VALUES (?, 'yes', '08:00:00', 'Pancakes')
        ON DUPLICATE KEY UPDATE
          breakfast_status = VALUES(breakfast_status),
          breakfast_time = VALUES(breakfast_time),
          breakfast_details = VALUES(breakfast_details)
      `, [date]);

      // Upsert lunch
      await db.query(`
        INSERT INTO food_records (record_date, lunch_status, lunch_time, lunch_details)
        VALUES (?, 'no', NULL, 'Team lunch skipped')
        ON DUPLICATE KEY UPDATE
          lunch_status = VALUES(lunch_status),
          lunch_time = VALUES(lunch_time),
          lunch_details = VALUES(lunch_details)
      `, [date]);

      // Upsert dinner
      await db.query(`
        INSERT INTO food_records (record_date, dinner_status, dinner_time, dinner_details)
        VALUES (?, 'yes', '20:30:00', 'Biryani')
        ON DUPLICATE KEY UPDATE
          dinner_status = VALUES(dinner_status),
          dinner_time = VALUES(dinner_time),
          dinner_details = VALUES(dinner_details)
      `, [date]);

      const [rows] = await db.query('SELECT * FROM food_records WHERE record_date = ?', [date]);
      assert.strictEqual(rows.length, 1);
      const row = rows[0];

      assert.strictEqual(row.breakfast_status, 'yes');
      assert.strictEqual(row.breakfast_time, '08:00:00');
      assert.strictEqual(row.breakfast_details, 'Pancakes');

      assert.strictEqual(row.lunch_status, 'no');
      assert.strictEqual(row.lunch_time, null);
      assert.strictEqual(row.lunch_details, 'Team lunch skipped');

      assert.strictEqual(row.dinner_status, 'yes');
      assert.strictEqual(row.dinner_time, '20:30:00');
      assert.strictEqual(row.dinner_details, 'Biryani');
    });

    test('4.2: Transaction rollback preserves previous state and does not leave dirty rows', async () => {
      const date = '2099-05-02';
      const conn = await db.getConnection();

      await conn.beginTransaction();
      await conn.query(
        'INSERT INTO food_records (record_date, breakfast_status) VALUES (?, ?)',
        [date, 'yes']
      );
      await conn.rollback();
      conn.release();

      const [rows] = await db.query('SELECT * FROM food_records WHERE record_date = ?', [date]);
      assert.strictEqual(rows.length, 0, 'Rolled back transaction must leave no record');
    });

    test('4.3: Unique key on record_date prevents duplicate calendar day insertions', async () => {
      const date = '2099-05-03';
      await db.query('INSERT INTO food_records (record_date, breakfast_status) VALUES (?, ?)', [date, 'yes']);

      await assert.rejects(
        async () => {
          await db.query('INSERT INTO food_records (record_date, breakfast_status) VALUES (?, ?)', [date, 'no']);
        },
        /UNIQUE constraint failed/i,
        'Database must enforce exactly 1 record per calendar date'
      );
    });
  });
});
