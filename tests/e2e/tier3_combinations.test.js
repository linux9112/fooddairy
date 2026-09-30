/**
 * tests/e2e/tier3_combinations.test.js
 * 
 * Tier 3: Cross-Feature Combinations & State Transitions Test Suite
 * Validates pairwise interactions, state transitions, isolation invariants,
 * and cross-endpoint consistency between meal logging, deletions, and report calculations.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const {
  setupTestServer,
  teardownTestServer,
  request,
  cleanupDate
} = require('../test_helper');

describe('Tier 3: Cross-Feature Combinations & State Transitions Suite', () => {
  let serverAvailable = false;

  before(async () => {
    try {
      await setupTestServer();
      serverAvailable = true;
    } catch (err) {
      console.warn(`[Tier 3] Notice: ${err.message}`);
      serverAvailable = false;
    }
  });

  after(async () => {
    if (serverAvailable) {
      await teardownTestServer();
    }
  });

  const testDate = '2099-05-10';

  before(async () => {
    if (serverAvailable) await cleanupDate(testDate);
  });
  after(async () => {
    if (serverAvailable) await cleanupDate(testDate);
  });

  it('T3-COMB-01: Sequential Meal Upserts & Read Isolation', async (t) => {
    if (!serverAvailable) return t.skip('Server unavailable');
    // Step 1: Save Breakfast
    await request('PUT', `/api/food/${testDate}/breakfast`, {
      status: 'yes',
      time: '08:00 AM',
      details: 'Poha and chai'
    });
    let day = await request('GET', `/api/food/${testDate}`);
    assert.strictEqual(day.data.recordedCount, 1);
    assert.strictEqual(day.data.meals.breakfast.status, 'yes');
    assert.strictEqual(day.data.meals.lunch.status, null);

    // Step 2: Save Lunch as 'no'
    await request('PUT', `/api/food/${testDate}/lunch`, {
      status: 'no',
      details: 'Busy with meetings'
    });
    day = await request('GET', `/api/food/${testDate}`);
    assert.strictEqual(day.data.recordedCount, 2);
    assert.strictEqual(day.data.meals.breakfast.status, 'yes');
    assert.strictEqual(day.data.meals.lunch.status, 'no');
    assert.strictEqual(day.data.meals.lunch.time, null);
    assert.strictEqual(day.data.meals.dinner.status, null);

    // Step 3: Save Dinner
    await request('PUT', `/api/food/${testDate}/dinner`, {
      status: 'yes',
      time: '08:30 PM',
      details: 'Dal and rice'
    });
    day = await request('GET', `/api/food/${testDate}`);
    assert.strictEqual(day.data.recordedCount, 3);
    assert.strictEqual(day.data.meals.dinner.status, 'yes');
  });

  it('T3-COMB-02: Reset & Preservation of Siblings', async (t) => {
    if (!serverAvailable) return t.skip('Server unavailable');
    // Delete dinner
    const delRes = await request('DELETE', `/api/food/${testDate}/dinner`);
    assert.strictEqual(delRes.status, 200);

    const day = await request('GET', `/api/food/${testDate}`);
    assert.strictEqual(day.data.recordedCount, 2);
    assert.strictEqual(day.data.meals.dinner.status, null);
    // Breakfast and Lunch must remain preserved
    assert.strictEqual(day.data.meals.breakfast.status, 'yes');
    assert.strictEqual(day.data.meals.breakfast.details, 'Poha and chai');
    assert.strictEqual(day.data.meals.lunch.status, 'no');
    assert.strictEqual(day.data.meals.lunch.details, 'Busy with meetings');
  });

  it('T3-COMB-03: Inversion of Meal State ("yes" -> "no")', async (t) => {
    if (!serverAvailable) return t.skip('Server unavailable');
    // Invert breakfast from 'yes' to 'no'
    await request('PUT', `/api/food/${testDate}/breakfast`, {
      status: 'no',
      details: 'Decided to fast after all'
    });
    const day = await request('GET', `/api/food/${testDate}`);
    assert.strictEqual(day.data.meals.breakfast.status, 'no');
    assert.strictEqual(day.data.meals.breakfast.time, null, 'Time must be wiped to NULL');
    assert.strictEqual(day.data.meals.breakfast.details, 'Decided to fast after all');
  });

  it('T3-COMB-04: Reversion of Meal State ("no" -> "yes")', async (t) => {
    if (!serverAvailable) return t.skip('Server unavailable');
    // Revert breakfast from 'no' back to 'yes'
    await request('PUT', `/api/food/${testDate}/breakfast`, {
      status: 'yes',
      time: '09:15 AM',
      details: 'Ended fast with fruits'
    });
    const day = await request('GET', `/api/food/${testDate}`);
    assert.strictEqual(day.data.meals.breakfast.status, 'yes');
    assert.ok(day.data.meals.breakfast.time !== null);
    assert.strictEqual(day.data.meals.breakfast.details, 'Ended fast with fruits');
  });

  it('T3-COMB-05: Total Day Reset Cycle', async (t) => {
    if (!serverAvailable) return t.skip('Server unavailable');
    await request('DELETE', `/api/food/${testDate}/breakfast`);
    await request('DELETE', `/api/food/${testDate}/lunch`);
    await request('DELETE', `/api/food/${testDate}/dinner`);

    const day = await request('GET', `/api/food/${testDate}`);
    assert.strictEqual(day.data.recordedCount, 0);
    assert.strictEqual(day.data.meals.breakfast.status, null);
    assert.strictEqual(day.data.meals.lunch.status, null);
    assert.strictEqual(day.data.meals.dinner.status, null);
  });

  it('T3-COMB-06: Weekly Boundary Separation (Sunday vs Monday)', async (t) => {
    if (!serverAvailable) return t.skip('Server unavailable');
    // Sunday 2026-10-04 vs Monday 2026-10-05
    const sun = '2026-10-04';
    const mon = '2026-10-05';
    await cleanupDate(sun);
    await cleanupDate(mon);

    await request('PUT', `/api/food/${sun}/breakfast`, { status: 'yes', time: '09:00', details: 'Sunday breakfast' });
    await request('PUT', `/api/food/${mon}/breakfast`, { status: 'yes', time: '09:00', details: 'Monday breakfast' });

    // Week 1 (ending Sun Oct 4)
    const w1 = await request('GET', `/api/reports/summary?type=weekly&date=${sun}`);
    assert.strictEqual(w1.data.endDate, sun);
    // Week 2 (starting Mon Oct 5)
    const w2 = await request('GET', `/api/reports/summary?type=weekly&date=${mon}`);
    assert.strictEqual(w2.data.startDate, mon);

    // Verify separation
    assert.strictEqual(w1.data.startDate, '2026-09-28');
    assert.strictEqual(w2.data.endDate, '2026-10-11');

    await cleanupDate(sun);
    await cleanupDate(mon);
  });

  it('T3-COMB-07: Monthly Boundary Separation (Sep 30 vs Oct 1)', async (t) => {
    if (!serverAvailable) return t.skip('Server unavailable');
    const sep30 = '2026-09-30';
    const oct1 = '2026-10-01';
    await cleanupDate(sep30);
    await cleanupDate(oct1);

    await request('PUT', `/api/food/${sep30}/dinner`, { status: 'yes', time: '20:00', details: 'September dinner' });
    await request('PUT', `/api/food/${oct1}/breakfast`, { status: 'yes', time: '08:00', details: 'October breakfast' });

    const sepRep = await request('GET', `/api/reports/summary?type=monthly&date=${sep30}`);
    const octRep = await request('GET', `/api/reports/summary?type=monthly&date=${oct1}`);

    assert.strictEqual(sepRep.data.endDate, '2026-09-30');
    assert.strictEqual(octRep.data.startDate, '2026-10-01');

    await cleanupDate(sep30);
    await cleanupDate(oct1);
  });

  it('T3-COMB-08: Upsert-Then-Report Consistency', async (t) => {
    if (!serverAvailable) return t.skip('Server unavailable');
    const targetDate = '2099-06-15'; // A Monday in June 2099
    await cleanupDate(targetDate);

    // Log 1 ate and 1 skipped
    await request('PUT', `/api/food/${targetDate}/breakfast`, { status: 'yes', time: '08:30 AM', details: 'Smoothie' });
    await request('PUT', `/api/food/${targetDate}/lunch`, { status: 'no', details: 'Intermittent fasting' });

    const rep = await request('GET', `/api/reports/summary?type=weekly&date=${targetDate}`);
    assert.strictEqual(rep.status, 200);
    assert.ok(rep.data.summary.ate >= 1);
    assert.ok(rep.data.summary.skipped >= 1);
    assert.strictEqual(
      rep.data.summary.ate + rep.data.summary.skipped + rep.data.summary.unrecorded,
      21
    );

    await cleanupDate(targetDate);
  });

  it('T3-COMB-09: Reset-Then-Report Consistency', async (t) => {
    if (!serverAvailable) return t.skip('Server unavailable');
    const targetDate = '2099-06-16';
    await cleanupDate(targetDate);

    await request('PUT', `/api/food/${targetDate}/breakfast`, { status: 'yes', time: '08:00', details: 'Pancake' });
    const beforeRep = await request('GET', `/api/reports/summary?type=weekly&date=${targetDate}`);
    const ateBefore = beforeRep.data.summary.ate;
    const unrecordedBefore = beforeRep.data.summary.unrecorded;

    // Reset the meal
    await request('DELETE', `/api/food/${targetDate}/breakfast`);

    const afterRep = await request('GET', `/api/reports/summary?type=weekly&date=${targetDate}`);
    assert.strictEqual(afterRep.data.summary.ate, ateBefore - 1);
    assert.strictEqual(afterRep.data.summary.unrecorded, unrecordedBefore + 1);

    await cleanupDate(targetDate);
  });

  it('T3-COMB-10: Rapid Sequential Updates on Different Meals', async (t) => {
    if (!serverAvailable) return t.skip('Server unavailable');
    const targetDate = '2099-06-17';
    await cleanupDate(targetDate);

    // Concurrently or rapidly send 3 PUT requests
    await Promise.all([
      request('PUT', `/api/food/${targetDate}/breakfast`, { status: 'yes', time: '07:30', details: 'Idli' }),
      request('PUT', `/api/food/${targetDate}/lunch`, { status: 'no', details: 'Meeting' }),
      request('PUT', `/api/food/${targetDate}/dinner`, { status: 'yes', time: '19:45', details: 'Salad' })
    ]);

    const res = await request('GET', `/api/food/${targetDate}`);
    assert.strictEqual(res.data.recordedCount, 3);
    assert.strictEqual(res.data.meals.breakfast.status, 'yes');
    assert.strictEqual(res.data.meals.lunch.status, 'no');
    assert.strictEqual(res.data.meals.dinner.status, 'yes');

    await cleanupDate(targetDate);
  });
});
