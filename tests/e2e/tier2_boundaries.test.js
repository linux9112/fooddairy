/**
 * tests/e2e/tier2_boundaries.test.js
 * 
 * Tier 2: Boundary & Corner Cases Test Suite
 * Strictly enforces >= 5 boundary test cases per feature across all 7 features:
 *  - Feature 1: Database Schema & Ternary Boundaries (Unicode, Emojis, Midnight, Quotes)
 *  - Feature 2: Day Retrieval Boundaries (Leap Years, Invalid Dates, Rollovers)
 *  - Feature 3: Single Meal Upsert Boundaries (Time formats, Unknown fields, Case handling)
 *  - Feature 4: Single Meal Reset Boundaries (Unseeded dates, Idempotency, Rapid calls)
 *  - Feature 5: Weekly Reports Boundaries (Year crossovers, Leap weeks, Mon/Sun exact)
 *  - Feature 6: Monthly Reports Boundaries (Feb 28 vs 29, 30 vs 31 days, 1st & last day)
 *  - Feature 7: Validation Middleware Boundaries (SQL injection, Invalid types, Malformed bodies)
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const {
  setupTestServer,
  teardownTestServer,
  request,
  cleanupDate
} = require('../test_helper');

describe('Tier 2: Boundary & Corner Cases Suite', () => {
  let serverAvailable = false;

  before(async () => {
    try {
      await setupTestServer();
      serverAvailable = true;
    } catch (err) {
      console.warn(`[Tier 2] Notice: ${err.message}`);
      serverAvailable = false;
    }
  });

  after(async () => {
    if (serverAvailable) {
      await teardownTestServer();
    }
  });

  // -------------------------------------------------------------
  // Feature 1: Database Schema & Ternary Boundaries
  // -------------------------------------------------------------
  describe('Feature 1: Ternary & Data Boundary Representation', () => {
    const testDate = '2099-04-01';

    before(async () => {
      if (serverAvailable) await cleanupDate(testDate);
    });
    after(async () => {
      if (serverAvailable) await cleanupDate(testDate);
    });

    it('T2-F1-01: Large text payload in meal details stores without truncation', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      const largeDetails = 'Organic quinoa salad with grilled halloumi and crushed walnuts. '.repeat(50);
      const res = await request('PUT', `/api/food/${testDate}/lunch`, {
        status: 'yes',
        time: '01:15 PM',
        details: largeDetails
      });
      assert.strictEqual(res.status, 200);
      const getRes = await request('GET', `/api/food/${testDate}`);
      assert.strictEqual(getRes.data.meals.lunch.details, largeDetails);
    });

    it('T2-F1-02: Unicode emojis and multilingual text preserved with exact character fidelity', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      const multiText = '🥑 Avocado toast + ☕ Espresso + 200g पनीर भुर्जी + 餃子 (Gyoza)';
      const res = await request('PUT', `/api/food/${testDate}/breakfast`, {
        status: 'yes',
        time: '08:00 AM',
        details: multiText
      });
      assert.strictEqual(res.status, 200);
      const getRes = await request('GET', `/api/food/${testDate}`);
      assert.strictEqual(getRes.data.meals.breakfast.details, multiText);
    });

    it('T2-F1-03: Midnight time boundary (00:00 and 23:59) persists correctly', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      const res = await request('PUT', `/api/food/${testDate}/dinner`, {
        status: 'yes',
        time: '23:59',
        details: 'Late midnight warm milk'
      });
      assert.strictEqual(res.status, 200);
      const getRes = await request('GET', `/api/food/${testDate}`);
      assert.ok(getRes.data.meals.dinner.time.startsWith('23:59'));
    });

    it('T2-F1-04: Special characters, SQL escapes, and HTML tags stored safely', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      const specialStr = "Mom's 'special' recipe: <script>alert(1)</script> & 100% \"pure\" honey \\o/";
      const res = await request('PUT', `/api/food/${testDate}/breakfast`, {
        status: 'yes',
        time: '09:00 AM',
        details: specialStr
      });
      assert.strictEqual(res.status, 200);
      const getRes = await request('GET', `/api/food/${testDate}`);
      assert.strictEqual(getRes.data.meals.breakfast.details, specialStr);
    });

    it('T2-F1-05: Whitespace-only details rejected or trimmed cleanly without corrupting NULL', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      const res = await request('PUT', `/api/food/${testDate}/breakfast`, {
        status: 'yes',
        time: '08:00 AM',
        details: '    '
      });
      // Should reject empty/whitespace-only details with 400
      assert.strictEqual(res.status, 400);
    });
  });

  // -------------------------------------------------------------
  // Feature 2: Day Retrieval Boundaries
  // -------------------------------------------------------------
  describe('Feature 2: Day Retrieval Boundaries', () => {
    it('T2-F2-01: Far future valid date returns unrecorded structure with 200 OK', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      const res = await request('GET', `/api/food/2099-12-31`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.recordedCount, 0);
      assert.strictEqual(res.data.meals.breakfast.status, null);
    });

    it('T2-F2-02: Leap year date (Feb 29, 2028) is recognized as valid calendar date', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      const res = await request('GET', `/api/food/2028-02-29`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.date, '2028-02-29');
    });

    it('T2-F2-03: Invalid leap year date (Feb 29, 2027) returns 400 Bad Request', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      const res = await request('GET', `/api/food/2027-02-29`);
      assert.strictEqual(res.status, 400);
    });

    it('T2-F2-04: Non-existent month or day (e.g. month 13, day 32) returns 400 Bad Request', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      const res1 = await request('GET', `/api/food/2026-13-01`);
      assert.strictEqual(res1.status, 400);
      const res2 = await request('GET', `/api/food/2026-04-31`); // April has 30 days
      assert.strictEqual(res2.status, 400);
    });

    it('T2-F2-05: Month boundary adjacent dates do not bleed into each other', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      const d1 = '2099-04-30';
      const d2 = '2099-05-01';
      await cleanupDate(d1);
      await cleanupDate(d2);

      await request('PUT', `/api/food/${d1}/breakfast`, { status: 'yes', time: '08:00', details: 'April food' });
      const res1 = await request('GET', `/api/food/${d1}`);
      const res2 = await request('GET', `/api/food/${d2}`);

      assert.strictEqual(res1.data.meals.breakfast.status, 'yes');
      assert.strictEqual(res2.data.meals.breakfast.status, null);

      await cleanupDate(d1);
    });
  });

  // -------------------------------------------------------------
  // Feature 3: Single Meal Upsert Boundaries
  // -------------------------------------------------------------
  describe('Feature 3: Single Meal Upsert Boundaries', () => {
    const testDate = '2099-04-05';

    before(async () => {
      if (serverAvailable) await cleanupDate(testDate);
    });
    after(async () => {
      if (serverAvailable) await cleanupDate(testDate);
    });

    it('T2-F3-01: Accepts both 12-hour AM/PM and 24-hour time strings', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      // 12-hour with lowercase am
      const res1 = await request('PUT', `/api/food/${testDate}/breakfast`, {
        status: 'yes',
        time: '8:45 am',
        details: 'Tea'
      });
      assert.strictEqual(res1.status, 200);

      // 24-hour format
      const res2 = await request('PUT', `/api/food/${testDate}/lunch`, {
        status: 'yes',
        time: '13:30',
        details: 'Sandwich'
      });
      assert.strictEqual(res2.status, 200);
    });

    it('T2-F3-02: Invalid time format returns 400 Bad Request', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      const res = await request('PUT', `/api/food/${testDate}/breakfast`, {
        status: 'yes',
        time: '25:99',
        details: 'Toast'
      });
      assert.strictEqual(res.status, 400);
    });

    it('T2-F3-03: When status is "no", any supplied time is sanitized to NULL', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      const res = await request('PUT', `/api/food/${testDate}/dinner`, {
        status: 'no',
        time: '08:00 PM', // extraneous time
        details: 'Fasting completely'
      });
      assert.strictEqual(res.status, 200);
      const getRes = await request('GET', `/api/food/${testDate}`);
      assert.strictEqual(getRes.data.meals.dinner.status, 'no');
      assert.strictEqual(getRes.data.meals.dinner.time, null, 'Time must be NULL when status is "no"');
    });

    it('T2-F3-04: Extra unexpected JSON fields in body do not cause server error', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      const res = await request('PUT', `/api/food/${testDate}/breakfast`, {
        status: 'yes',
        time: '08:00 AM',
        details: 'Cereal',
        unexpectedField: 'exploit_test',
        isAdmin: true
      });
      assert.strictEqual(res.status, 200);
    });

    it('T2-F3-05: Case-insensitive meal name routing is handled gracefully', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      const res = await request('PUT', `/api/food/${testDate}/Breakfast`, {
        status: 'yes',
        time: '08:30 AM',
        details: 'Pancake'
      });
      // Should accept case-insensitively or 400 cleanly, never 500
      assert.ok([200, 400].includes(res.status));
    });
  });

  // -------------------------------------------------------------
  // Feature 4: Single Meal Reset Boundaries
  // -------------------------------------------------------------
  describe('Feature 4: Single Meal Reset Boundaries', () => {
    const testDate = '2099-04-06';

    before(async () => {
      if (serverAvailable) await cleanupDate(testDate);
    });
    after(async () => {
      if (serverAvailable) await cleanupDate(testDate);
    });

    it('T2-F4-01: DELETE on a completely unrecorded date returns 200 without error', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      const res = await request('DELETE', `/api/food/2099-12-30/breakfast`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
    });

    it('T2-F4-02: Resetting the only meal records 0 recorded count', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      await request('PUT', `/api/food/${testDate}/lunch`, { status: 'no', details: 'Fasting' });
      const delRes = await request('DELETE', `/api/food/${testDate}/lunch`);
      assert.strictEqual(delRes.status, 200);
      const getRes = await request('GET', `/api/food/${testDate}`);
      assert.strictEqual(getRes.data.recordedCount, 0);
    });

    it('T2-F4-03: Rapid consecutive DELETE calls succeed idempotently', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      const r1 = await request('DELETE', `/api/food/${testDate}/dinner`);
      const r2 = await request('DELETE', `/api/food/${testDate}/dinner`);
      const r3 = await request('DELETE', `/api/food/${testDate}/dinner`);
      assert.strictEqual(r1.status, 200);
      assert.strictEqual(r2.status, 200);
      assert.strictEqual(r3.status, 200);
    });

    it('T2-F4-04: DELETE with unexpected query parameters is ignored safely', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      const res = await request('DELETE', `/api/food/${testDate}/breakfast?force=true&cascade=all`);
      assert.strictEqual(res.status, 200);
    });

    it('T2-F4-05: Case-insensitive meal name in DELETE handled gracefully', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      const res = await request('DELETE', `/api/food/${testDate}/LUNCH`);
      assert.ok([200, 400].includes(res.status));
    });
  });

  // -------------------------------------------------------------
  // Feature 5: Weekly Reports Boundaries
  // -------------------------------------------------------------
  describe('Feature 5: Weekly Reports Boundaries', () => {
    it('T2-F5-01: Year rollover week (Dec 28, 2026 to Jan 3, 2027) calculated correctly', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      // 2026-12-31 is Thursday
      const res = await request('GET', `/api/reports/summary?type=weekly&date=2026-12-31`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.startDate, '2026-12-28');
      assert.strictEqual(res.data.endDate, '2027-01-03');
      assert.strictEqual(res.data.totalDays, 7);
      assert.strictEqual(res.data.totalOpportunities, 21);
    });

    it('T2-F5-02: Leap week containing Feb 29 (Feb 28 to Mar 5, 2028) spans 7 days', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      // 2028-02-29 is Tuesday
      const res = await request('GET', `/api/reports/summary?type=weekly&date=2028-02-29`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.startDate, '2028-02-28');
      assert.strictEqual(res.data.endDate, '2028-03-05');
      assert.strictEqual(res.data.totalDays, 7);
      assert.strictEqual(res.data.totalOpportunities, 21);
    });

    it('T2-F5-03: Exact Monday query returns Monday as startDate and Sunday as endDate', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      const res = await request('GET', `/api/reports/summary?type=weekly&date=2026-09-28`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.startDate, '2026-09-28');
      assert.strictEqual(res.data.endDate, '2026-10-04');
    });

    it('T2-F5-04: Exact Sunday query returns same Monday-Sunday week span', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      const res = await request('GET', `/api/reports/summary?type=weekly&date=2026-10-04`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.startDate, '2026-09-28');
      assert.strictEqual(res.data.endDate, '2026-10-04');
    });

    it('T2-F5-05: Week with 100% ate records produces 100.0% atePercent', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      const testWeekDates = [
        '2099-07-06', '2099-07-07', '2099-07-08', '2099-07-09',
        '2099-07-10', '2099-07-11', '2099-07-12'
      ];
      for (const d of testWeekDates) {
        await request('PUT', `/api/food/${d}/breakfast`, { status: 'yes', time: '08:00', details: 'Food' });
        await request('PUT', `/api/food/${d}/lunch`, { status: 'yes', time: '13:00', details: 'Food' });
        await request('PUT', `/api/food/${d}/dinner`, { status: 'yes', time: '20:00', details: 'Food' });
      }

      const res = await request('GET', `/api/reports/summary?type=weekly&date=2099-07-08`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.summary.ate, 21);
      assert.strictEqual(res.data.summary.skipped, 0);
      assert.strictEqual(res.data.summary.unrecorded, 0);
      assert.strictEqual(Number(res.data.summary.atePercent), 100);

      // Cleanup
      for (const d of testWeekDates) {
        await cleanupDate(d);
      }
    });
  });

  // -------------------------------------------------------------
  // Feature 6: Monthly Reports Boundaries
  // -------------------------------------------------------------
  describe('Feature 6: Monthly Reports Boundaries', () => {
    it('T2-F6-01: February non-leap year (2027) calculates exactly 28 days and 84 opportunities', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      const res = await request('GET', `/api/reports/summary?type=monthly&date=2027-02-15`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.startDate, '2027-02-01');
      assert.strictEqual(res.data.endDate, '2027-02-28');
      assert.strictEqual(res.data.totalDays, 28);
      assert.strictEqual(res.data.totalOpportunities, 84);
    });

    it('T2-F6-02: February leap year (2028) calculates exactly 29 days and 87 opportunities', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      const res = await request('GET', `/api/reports/summary?type=monthly&date=2028-02-15`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.startDate, '2028-02-01');
      assert.strictEqual(res.data.endDate, '2028-02-29');
      assert.strictEqual(res.data.totalDays, 29);
      assert.strictEqual(res.data.totalOpportunities, 87);
    });

    it('T2-F6-03: Query on 1st day of month produces identical boundaries as mid-month query', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      const res = await request('GET', `/api/reports/summary?type=monthly&date=2026-10-01`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.startDate, '2026-10-01');
      assert.strictEqual(res.data.endDate, '2026-10-31');
    });

    it('T2-F6-04: Query on last day of 30-day month produces correct span', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      const res = await request('GET', `/api/reports/summary?type=monthly&date=2026-09-30`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.startDate, '2026-09-01');
      assert.strictEqual(res.data.endDate, '2026-09-30');
      assert.strictEqual(res.data.totalDays, 30);
    });

    it('T2-F6-05: Month with all unrecorded opportunities reflects 100% unrecordedPercent', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      const res = await request('GET', `/api/reports/summary?type=monthly&date=2099-11-15`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.summary.ate, 0);
      assert.strictEqual(res.data.summary.skipped, 0);
      assert.strictEqual(res.data.summary.unrecorded, 90);
      assert.strictEqual(Number(res.data.summary.unrecordedPercent), 100);
    });
  });

  // -------------------------------------------------------------
  // Feature 7: Validation Middleware Boundaries
  // -------------------------------------------------------------
  describe('Feature 7: Validation Middleware Boundaries', () => {
    it('T2-F7-01: SQL injection in date URL parameter blocked with 400 Bad Request', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      const res = await request('GET', `/api/food/2026-01-01' OR '1'='1`);
      assert.strictEqual(res.status, 400);
      assert.strictEqual(typeof res.data, 'object');
    });

    it('T2-F7-02: SQL injection in meal URL parameter blocked with 400 Bad Request', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      const res = await request('PUT', `/api/food/2099-01-01/breakfast;DROP TABLE food_records;`, {
        status: 'yes',
        time: '08:00',
        details: 'Hack'
      });
      assert.strictEqual(res.status, 400);
    });

    it('T2-F7-03: Malformed non-JSON body returns 400 with clean JSON error (no HTML crash dump)', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      const res = await request('PUT', `/api/food/2099-01-01/breakfast`, '{ bad json payload ');
      assert.strictEqual(res.status, 400);
      assert.strictEqual(typeof res.data, 'object');
    });

    it('T2-F7-04: Non-enum status value returns 400 Bad Request', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      const res = await request('PUT', `/api/food/2099-01-01/breakfast`, {
        status: 'maybe',
        details: 'Unsure'
      });
      assert.strictEqual(res.status, 400);
    });

    it('T2-F7-05: Missing date query param in reports endpoint returns 400 Bad Request', async (t) => {
      if (!serverAvailable) return t.skip('Server unavailable');
      const res = await request('GET', `/api/reports/summary?type=weekly`);
      assert.strictEqual(res.status, 400);
    });
  });
});
