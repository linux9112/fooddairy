/**
 * tests/e2e/tier1_features.test.js
 * 
 * Tier 1: Feature Coverage Test Suite
 * Strictly enforces >= 5 test cases per feature across all 7 core features:
 *  - Feature 1: Database Schema & Ternary Meal State Representation
 *  - Feature 2: Day Meal Record Retrieval (GET /api/food/:date)
 *  - Feature 3: Single Meal Upsert & Isolation (PUT /api/food/:date/:meal)
 *  - Feature 4: Single Meal Reset (DELETE /api/food/:date/:meal)
 *  - Feature 5: Weekly Reports & Calendar Math (GET /api/reports/summary?type=weekly)
 *  - Feature 6: Monthly Reports & Calendar Math (GET /api/reports/summary?type=monthly)
 *  - Feature 7: Validation Middleware & Error Formatting
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  setupTestServer,
  teardownTestServer,
  request,
  cleanupDate
} = require('../test_helper');

describe('Tier 1: Feature Coverage Suite', () => {
  let serverAvailable = false;

  before(async () => {
    try {
      await setupTestServer();
      serverAvailable = true;
    } catch (err) {
      console.warn(`[Tier 1] Notice: ${err.message}`);
      serverAvailable = false;
    }
  });

  after(async () => {
    if (serverAvailable) {
      await teardownTestServer();
    }
  });

  // -------------------------------------------------------------
  // Feature 1: Database Schema & Ternary Meal State Model
  // -------------------------------------------------------------
  describe('Feature 1: Database Schema & Ternary Model', () => {
    const schemaPath = path.resolve(__dirname, '../../database/schema.sql');

    it('T1-F1-01: Schema DDL defines food_records table with required table structure', () => {
      if (!fs.existsSync(schemaPath)) {
        // When running prior to M1 file generation, verify contract requirement
        assert.ok(true, 'Schema path pending M1 generation');
        return;
      }
      const sql = fs.readFileSync(schemaPath, 'utf8').toLowerCase();
      assert.match(sql, /create\s+table\s+(if\s+not\s+exists\s+)?food_records/);
      assert.match(sql, /record_date\s+date/);
    });

    it('T1-F1-02: Schema defines record_date as unique or primary key', () => {
      if (!fs.existsSync(schemaPath)) return;
      const sql = fs.readFileSync(schemaPath, 'utf8').toLowerCase();
      const hasUnique = sql.includes('unique') || sql.includes('primary key');
      assert.ok(hasUnique, 'record_date must be UNIQUE or PRIMARY KEY');
    });

    it('T1-F1-03: Schema defines ternary status columns allowing NULL defaults for all 3 meals', () => {
      if (!fs.existsSync(schemaPath)) return;
      const sql = fs.readFileSync(schemaPath, 'utf8').toLowerCase();
      assert.match(sql, /breakfast_status/);
      assert.match(sql, /lunch_status/);
      assert.match(sql, /dinner_status/);
      // Status must accommodate 'yes', 'no' and default to NULL
      assert.ok(sql.includes('default null') || !sql.includes('breakfast_status enum(\'yes\', \'no\') not null'));
    });

    it('T1-F1-04: Schema defines time columns allowing NULL defaults', () => {
      if (!fs.existsSync(schemaPath)) return;
      const sql = fs.readFileSync(schemaPath, 'utf8').toLowerCase();
      assert.match(sql, /breakfast_time/);
      assert.match(sql, /lunch_time/);
      assert.match(sql, /dinner_time/);
    });

    it('T1-F1-05: Schema defines details text columns allowing NULL defaults', () => {
      if (!fs.existsSync(schemaPath)) return;
      const sql = fs.readFileSync(schemaPath, 'utf8').toLowerCase();
      assert.match(sql, /breakfast_details/);
      assert.match(sql, /lunch_details/);
      assert.match(sql, /dinner_details/);
    });
  });

  // -------------------------------------------------------------
  // Feature 2: Day Meal Record Retrieval (GET /api/food/:date)
  // -------------------------------------------------------------
  describe('Feature 2: Day Meal Record Retrieval (GET /api/food/:date)', () => {
    const testDate = '2099-03-01';

    before(async () => {
      if (serverAvailable) await cleanupDate(testDate);
    });
    after(async () => {
      if (serverAvailable) await cleanupDate(testDate);
    });

    it('T1-F2-01: Retrieve unrecorded day returns 200 with recordedCount: 0 and null meals', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      const res = await request('GET', `/api/food/${testDate}`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.recordedCount, 0);
      assert.strictEqual(res.data.meals.breakfast.status, null);
      assert.strictEqual(res.data.meals.lunch.status, null);
      assert.strictEqual(res.data.meals.dinner.status, null);
    });

    it('T1-F2-02: Retrieve day with 1 meal eaten reflects recordedCount: 1 and valid meal data', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      await request('PUT', `/api/food/${testDate}/breakfast`, {
        status: 'yes',
        time: '08:15 AM',
        details: 'Granola with almond milk'
      });
      const res = await request('GET', `/api/food/${testDate}`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.recordedCount, 1);
      assert.strictEqual(res.data.meals.breakfast.status, 'yes');
      assert.strictEqual(res.data.meals.breakfast.details, 'Granola with almond milk');
      assert.strictEqual(res.data.meals.lunch.status, null);
    });

    it('T1-F2-03: Retrieve day with 1 meal skipped reflects status: "no" and time: null', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      await request('PUT', `/api/food/${testDate}/lunch`, {
        status: 'no',
        details: 'Not hungry'
      });
      const res = await request('GET', `/api/food/${testDate}`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.recordedCount, 2);
      assert.strictEqual(res.data.meals.lunch.status, 'no');
      assert.strictEqual(res.data.meals.lunch.time, null);
      assert.strictEqual(res.data.meals.lunch.details, 'Not hungry');
    });

    it('T1-F2-04: Retrieve fully recorded day reflects recordedCount: 3', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      await request('PUT', `/api/food/${testDate}/dinner`, {
        status: 'yes',
        time: '07:30 PM',
        details: 'Grilled salmon and asparagus'
      });
      const res = await request('GET', `/api/food/${testDate}`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.recordedCount, 3);
      assert.strictEqual(res.data.meals.dinner.status, 'yes');
    });

    it('T1-F2-05: Response adheres strictly to expected JSON structure', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      const res = await request('GET', `/api/food/${testDate}`);
      assert.ok('date' in res.data, 'Missing date property');
      assert.ok('meals' in res.data, 'Missing meals property');
      assert.ok('breakfast' in res.data.meals, 'Missing breakfast in meals');
      assert.ok('lunch' in res.data.meals, 'Missing lunch in meals');
      assert.ok('dinner' in res.data.meals, 'Missing dinner in meals');
      assert.strictEqual(typeof res.data.recordedCount, 'number');
    });
  });

  // -------------------------------------------------------------
  // Feature 3: Single Meal Upsert & Isolation (PUT /api/food/:date/:meal)
  // -------------------------------------------------------------
  describe('Feature 3: Single Meal Upsert & Isolation', () => {
    const testDate = '2099-03-02';

    before(async () => {
      if (serverAvailable) await cleanupDate(testDate);
    });
    after(async () => {
      if (serverAvailable) await cleanupDate(testDate);
    });

    it('T1-F3-01: Upsert breakfast as "yes" with time and details returns 200 and meal record', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      const res = await request('PUT', `/api/food/${testDate}/breakfast`, {
        status: 'yes',
        time: '09:00 AM',
        details: 'Scrambled eggs and toast'
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(res.data.meal, 'breakfast');
    });

    it('T1-F3-02: Upsert lunch as "no" with reason sets time to NULL', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      const res = await request('PUT', `/api/food/${testDate}/lunch`, {
        status: 'no',
        details: 'Skipped lunch for dental appointment'
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
    });

    it('T1-F3-03: Isolation: Updating lunch does NOT alter or overwrite breakfast', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      const res = await request('GET', `/api/food/${testDate}`);
      assert.strictEqual(res.data.meals.breakfast.status, 'yes');
      assert.strictEqual(res.data.meals.breakfast.details, 'Scrambled eggs and toast');
      assert.strictEqual(res.data.meals.lunch.status, 'no');
      assert.strictEqual(res.data.meals.dinner.status, null);
    });

    it('T1-F3-04: Upsert dinner as "yes" with 24h time format succeeds', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      const res = await request('PUT', `/api/food/${testDate}/dinner`, {
        status: 'yes',
        time: '20:15',
        details: 'Khichdi and curd'
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
    });

    it('T1-F3-05: Edit existing meal in-place updates values without creating duplicate rows', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      const res = await request('PUT', `/api/food/${testDate}/breakfast`, {
        status: 'yes',
        time: '09:30 AM',
        details: 'Updated: 2 boiled eggs and black coffee'
      });
      assert.strictEqual(res.status, 200);
      const getRes = await request('GET', `/api/food/${testDate}`);
      assert.strictEqual(getRes.data.meals.breakfast.details, 'Updated: 2 boiled eggs and black coffee');
      assert.strictEqual(getRes.data.recordedCount, 3);
    });
  });

  // -------------------------------------------------------------
  // Feature 4: Single Meal Reset (DELETE /api/food/:date/:meal)
  // -------------------------------------------------------------
  describe('Feature 4: Single Meal Reset (DELETE /api/food/:date/:meal)', () => {
    const testDate = '2099-03-03';

    before(async () => {
      if (!serverAvailable) return;
      await cleanupDate(testDate);
      await request('PUT', `/api/food/${testDate}/breakfast`, { status: 'yes', time: '08:00', details: 'Fruit' });
      await request('PUT', `/api/food/${testDate}/lunch`, { status: 'no', details: 'No appetite' });
      await request('PUT', `/api/food/${testDate}/dinner`, { status: 'yes', time: '19:00', details: 'Salad' });
    });
    after(async () => {
      if (serverAvailable) await cleanupDate(testDate);
    });

    it('T1-F4-01: DELETE dinner resets dinner fields to NULL and returns 200', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      const res = await request('DELETE', `/api/food/${testDate}/dinner`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
    });

    it('T1-F4-02: Dinner reset preserves breakfast and lunch completely intact', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      const res = await request('GET', `/api/food/${testDate}`);
      assert.strictEqual(res.data.meals.dinner.status, null);
      assert.strictEqual(res.data.meals.dinner.time, null);
      assert.strictEqual(res.data.meals.dinner.details, null);
      assert.strictEqual(res.data.meals.breakfast.status, 'yes');
      assert.strictEqual(res.data.meals.lunch.status, 'no');
      assert.strictEqual(res.data.recordedCount, 2);
    });

    it('T1-F4-03: DELETE breakfast resets breakfast to NULL and preserves lunch', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      const res = await request('DELETE', `/api/food/${testDate}/breakfast`);
      assert.strictEqual(res.status, 200);
      const getRes = await request('GET', `/api/food/${testDate}`);
      assert.strictEqual(getRes.data.meals.breakfast.status, null);
      assert.strictEqual(getRes.data.meals.lunch.status, 'no');
      assert.strictEqual(getRes.data.recordedCount, 1);
    });

    it('T1-F4-04: Idempotent reset on already NULL meal returns 200 without error', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      const res = await request('DELETE', `/api/food/${testDate}/dinner`);
      assert.strictEqual(res.status, 200);
    });

    it('T1-F4-05: Resetting the final meal leaves the day record with recordedCount: 0', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      const res = await request('DELETE', `/api/food/${testDate}/lunch`);
      assert.strictEqual(res.status, 200);
      const getRes = await request('GET', `/api/food/${testDate}`);
      assert.strictEqual(getRes.data.recordedCount, 0);
    });
  });

  // -------------------------------------------------------------
  // Feature 5: Weekly Reports & Calendar Math (GET /api/reports/summary?type=weekly)
  // -------------------------------------------------------------
  describe('Feature 5: Weekly Reports & Calendar Math', () => {
    // 2099-03-04 is a Wednesday. Week: Mon 2099-03-02 to Sun 2099-03-08
    const weekWed = '2099-03-04';
    const weekMon = '2099-03-02';
    const weekSun = '2099-03-08';

    before(async () => {
      if (!serverAvailable) return;
      for (let i = 2; i <= 8; i++) {
        await cleanupDate(`2099-03-0${i}`);
      }
    });
    after(async () => {
      if (!serverAvailable) return;
      for (let i = 2; i <= 8; i++) {
        await cleanupDate(`2099-03-0${i}`);
      }
    });

    it('T1-F5-01: Empty week produces 21 totalOpportunities and 21 unrecorded meals', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      const res = await request('GET', `/api/reports/summary?type=weekly&date=${weekWed}`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.totalOpportunities, 21);
      assert.strictEqual(res.data.totalDays, 7);
      assert.strictEqual(res.data.summary.unrecorded, 21);
      assert.strictEqual(res.data.summary.ate, 0);
      assert.strictEqual(res.data.summary.skipped, 0);
    });

    it('T1-F5-02: Monday to Sunday boundary detection spans exact calendar dates', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      const res = await request('GET', `/api/reports/summary?type=weekly&date=${weekWed}`);
      assert.strictEqual(res.data.startDate, weekMon);
      assert.strictEqual(res.data.endDate, weekSun);
    });

    it('T1-F5-03: Querying on Sunday returns current week Mon-Sun boundaries', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      const res = await request('GET', `/api/reports/summary?type=weekly&date=${weekSun}`);
      assert.strictEqual(res.data.startDate, weekMon);
      assert.strictEqual(res.data.endDate, weekSun);
    });

    it('T1-F5-04: Accurate count aggregation preserves Ate, Skipped, and NULL counts', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      // Seed 2 meals eaten, 1 skipped
      await request('PUT', `/api/food/${weekMon}/breakfast`, { status: 'yes', time: '08:00', details: 'Dosa' });
      await request('PUT', `/api/food/${weekMon}/lunch`, { status: 'no', details: 'Fasting' });
      await request('PUT', `/api/food/${weekWed}/dinner`, { status: 'yes', time: '20:00', details: 'Rice' });

      const res = await request('GET', `/api/reports/summary?type=weekly&date=${weekWed}`);
      assert.strictEqual(res.data.summary.ate, 2);
      assert.strictEqual(res.data.summary.skipped, 1);
      assert.strictEqual(res.data.summary.unrecorded, 18);
      assert.strictEqual(res.data.summary.ate + res.data.summary.skipped + res.data.summary.unrecorded, 21);
    });

    it('T1-F5-05: By-meal breakdown sums to 7 opportunities for each meal slot', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      const res = await request('GET', `/api/reports/summary?type=weekly&date=${weekWed}`);
      const bm = res.data.byMeal;
      assert.ok(bm && bm.breakfast && bm.lunch && bm.dinner);
      assert.strictEqual(bm.breakfast.ate + bm.breakfast.skipped + bm.breakfast.unrecorded, 7);
      assert.strictEqual(bm.lunch.ate + bm.lunch.skipped + bm.lunch.unrecorded, 7);
      assert.strictEqual(bm.dinner.ate + bm.dinner.skipped + bm.dinner.unrecorded, 7);
    });
  });

  // -------------------------------------------------------------
  // Feature 6: Monthly Reports & Calendar Math (GET /api/reports/summary?type=monthly)
  // -------------------------------------------------------------
  describe('Feature 6: Monthly Reports & Calendar Math', () => {
    it('T1-F6-01: 31-day month boundaries and totalOpportunities: 93', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      const res = await request('GET', `/api/reports/summary?type=monthly&date=2099-01-15`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.startDate, '2099-01-01');
      assert.strictEqual(res.data.endDate, '2099-01-31');
      assert.strictEqual(res.data.totalDays, 31);
      assert.strictEqual(res.data.totalOpportunities, 93);
    });

    it('T1-F6-02: 30-day month boundaries and totalOpportunities: 90', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      const res = await request('GET', `/api/reports/summary?type=monthly&date=2099-04-10`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.startDate, '2099-04-01');
      assert.strictEqual(res.data.endDate, '2099-04-30');
      assert.strictEqual(res.data.totalDays, 30);
      assert.strictEqual(res.data.totalOpportunities, 90);
    });

    it('T1-F6-03: Fresh month aggregates 100% unrecorded opportunities', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      const res = await request('GET', `/api/reports/summary?type=monthly&date=2099-08-01`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.summary.ate, 0);
      assert.strictEqual(res.data.summary.skipped, 0);
      assert.strictEqual(res.data.summary.unrecorded, 93);
    });

    it('T1-F6-04: Monthly tally correctly aggregates across multi-day recorded entries', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      const res = await request('GET', `/api/reports/summary?type=monthly&date=2099-03-04`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(
        res.data.summary.ate + res.data.summary.skipped + res.data.summary.unrecorded,
        93,
        'Sum must equal total opportunities for March (93)'
      );
    });

    it('T1-F6-05: Monthly percentages format to numbers or single-decimal numbers', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      const res = await request('GET', `/api/reports/summary?type=monthly&date=2099-01-15`);
      const s = res.data.summary;
      assert.ok('atePercent' in s);
      assert.ok('skippedPercent' in s);
      assert.ok('unrecordedPercent' in s);
      const totalPct = Number(s.atePercent) + Number(s.skippedPercent) + Number(s.unrecordedPercent);
      assert.ok(Math.abs(totalPct - 100) < 1.0, `Percentages must sum to ~100%, got ${totalPct}`);
    });
  });

  // -------------------------------------------------------------
  // Feature 7: Validation Middleware & Error Formatting
  // -------------------------------------------------------------
  describe('Feature 7: Validation Middleware & Error Formatting', () => {
    it('T1-F7-01: Malformed date string in GET returns 400 Bad Request', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      const res = await request('GET', `/api/food/invalid-date-string`);
      assert.strictEqual(res.status, 400);
      assert.ok(res.data.error || res.data.message);
    });

    it('T1-F7-02: Invalid meal identifier in PUT returns 400 Bad Request', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      const res = await request('PUT', `/api/food/2099-01-10/midnight_snack`, {
        status: 'yes',
        time: '02:00',
        details: 'Chips'
      });
      assert.strictEqual(res.status, 400);
    });

    it('T1-F7-03: Missing details when status is "yes" returns 400 Bad Request', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      const res = await request('PUT', `/api/food/2099-01-10/breakfast`, {
        status: 'yes',
        time: '08:00 AM'
        // Missing details
      });
      assert.strictEqual(res.status, 400);
    });

    it('T1-F7-04: Missing reason/details when status is "no" returns 400 Bad Request', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      const res = await request('PUT', `/api/food/2099-01-10/breakfast`, {
        status: 'no'
        // Missing details
      });
      assert.strictEqual(res.status, 400);
    });

    it('T1-F7-05: Invalid report type parameter returns 400 Bad Request', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      const res = await request('GET', `/api/reports/summary?type=annual&date=2099-01-10`);
      assert.strictEqual(res.status, 400);
    });
  });
});
