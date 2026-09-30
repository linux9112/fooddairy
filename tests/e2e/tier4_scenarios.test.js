/**
 * tests/e2e/tier4_scenarios.test.js
 * 
 * Tier 4: Real-World Application Scenarios Test Suite
 * Simulates complete end-to-end user workflows and real-world diary usage:
 *  - Scenario 1: Complete Day in the Life of a User
 *  - Scenario 2: Change of Mind / Evening Snack Correction
 *  - Scenario 3: Accidental Entry & Reset on Future Date
 *  - Scenario 4: Historical Diary Backfill (Traveler catching up 3 days)
 *  - Scenario 5: Full 7-Day Habit Analytics & Exact Percentages
 *  - Scenario 6: Month-End Leap Year & Calendar Transition
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const {
  setupTestServer,
  teardownTestServer,
  request,
  cleanupDate
} = require('../test_helper');

describe('Tier 4: Real-World Application Scenarios Suite', () => {
  let serverAvailable = false;

  before(async () => {
    try {
      await setupTestServer();
      serverAvailable = true;
    } catch (err) {
      console.warn(`[Tier 4] Notice: ${err.message}`);
      serverAvailable = false;
    }
  });

  after(async () => {
    if (serverAvailable) {
      await teardownTestServer();
    }
  });

  // -------------------------------------------------------------
  // Scenario 1: Complete Day in the Life of a User
  // -------------------------------------------------------------
  it('Scenario 1: Complete Day in the Life of a User', async (t) => {
    if (!serverAvailable) return t.skip('Server unavailable');
    const day = '2099-08-10';
    await cleanupDate(day);

    // Morning 08:30 AM: Log breakfast
    const bRes = await request('PUT', `/api/food/${day}/breakfast`, {
      status: 'yes',
      time: '08:30 AM',
      details: 'Poha and Ginger Tea'
    });
    assert.strictEqual(bRes.status, 200);

    let currentDay = await request('GET', `/api/food/${day}`);
    assert.strictEqual(currentDay.data.recordedCount, 1);
    assert.strictEqual(currentDay.data.meals.breakfast.status, 'yes');

    // Afternoon 02:00 PM: Skip lunch
    const lRes = await request('PUT', `/api/food/${day}/lunch`, {
      status: 'no',
      details: 'Too busy with product launch'
    });
    assert.strictEqual(lRes.status, 200);

    currentDay = await request('GET', `/api/food/${day}`);
    assert.strictEqual(currentDay.data.recordedCount, 2);
    assert.strictEqual(currentDay.data.meals.breakfast.status, 'yes');
    assert.strictEqual(currentDay.data.meals.lunch.status, 'no');
    assert.strictEqual(currentDay.data.meals.lunch.time, null);

    // Evening 08:45 PM: Log dinner
    const dRes = await request('PUT', `/api/food/${day}/dinner`, {
      status: 'yes',
      time: '08:45 PM',
      details: 'Paneer Tikka & Roti'
    });
    assert.strictEqual(dRes.status, 200);

    currentDay = await request('GET', `/api/food/${day}`);
    assert.strictEqual(currentDay.data.recordedCount, 3);
    assert.strictEqual(currentDay.data.meals.dinner.status, 'yes');

    await cleanupDate(day);
  });

  // -------------------------------------------------------------
  // Scenario 2: Change of Mind / Evening Snack Correction
  // -------------------------------------------------------------
  it('Scenario 2: Change of Mind / Evening Snack Correction', async (t) => {
    if (!serverAvailable) return t.skip('Server unavailable');
    const day = '2099-08-11';
    await cleanupDate(day);

    // 07:00 PM: Marked dinner as skipped
    await request('PUT', `/api/food/${day}/dinner`, {
      status: 'no',
      details: 'Not feeling hungry'
    });
    let dayRes = await request('GET', `/api/food/${day}`);
    assert.strictEqual(dayRes.data.meals.dinner.status, 'no');

    // 10:30 PM: Friends invited for pizza, user updates dinner to eaten
    await request('PUT', `/api/food/${day}/dinner`, {
      status: 'yes',
      time: '10:30 PM',
      details: 'Late night Margherita Pizza with friends'
    });

    dayRes = await request('GET', `/api/food/${day}`);
    assert.strictEqual(dayRes.data.meals.dinner.status, 'yes');
    assert.strictEqual(dayRes.data.meals.dinner.details, 'Late night Margherita Pizza with friends');
    assert.ok(dayRes.data.meals.dinner.time !== null);

    await cleanupDate(day);
  });

  // -------------------------------------------------------------
  // Scenario 3: Accidental Entry & Reset on Future Date
  // -------------------------------------------------------------
  it('Scenario 3: Accidental Entry & Reset on Future Date', async (t) => {
    if (!serverAvailable) return t.skip('Server unavailable');
    const today = '2099-08-12';
    const tomorrow = '2099-08-13';
    await cleanupDate(today);
    await cleanupDate(tomorrow);

    // Today has breakfast logged
    await request('PUT', `/api/food/${today}/breakfast`, { status: 'yes', time: '08:00 AM', details: 'Oats' });

    // Accidental entry tomorrow
    await request('PUT', `/api/food/${tomorrow}/lunch`, { status: 'yes', time: '13:00', details: 'Accidental sandwich' });
    let tomorrowRes = await request('GET', `/api/food/${tomorrow}`);
    assert.strictEqual(tomorrowRes.data.recordedCount, 1);

    // User realizes mistake and resets tomorrow's lunch
    const delRes = await request('DELETE', `/api/food/${tomorrow}/lunch`);
    assert.strictEqual(delRes.status, 200);

    tomorrowRes = await request('GET', `/api/food/${tomorrow}`);
    assert.strictEqual(tomorrowRes.data.recordedCount, 0);

    // Verify today was unaffected
    const todayRes = await request('GET', `/api/food/${today}`);
    assert.strictEqual(todayRes.data.recordedCount, 1);
    assert.strictEqual(todayRes.data.meals.breakfast.details, 'Oats');

    await cleanupDate(today);
    await cleanupDate(tomorrow);
  });

  // -------------------------------------------------------------
  // Scenario 4: Historical Diary Backfill (Catching Up 3 Days)
  // -------------------------------------------------------------
  it('Scenario 4: Historical Diary Backfill (Catching Up 3 Days)', async (t) => {
    if (!serverAvailable) return t.skip('Server unavailable');
    // Fri, Sat, Sun of a known week
    const fri = '2099-08-14';
    const sat = '2099-08-15';
    const sun = '2099-08-16';

    await cleanupDate(fri);
    await cleanupDate(sat);
    await cleanupDate(sun);

    // Backfill Friday (3 eaten)
    await request('PUT', `/api/food/${fri}/breakfast`, { status: 'yes', time: '08:00', details: 'Fri B' });
    await request('PUT', `/api/food/${fri}/lunch`, { status: 'yes', time: '13:00', details: 'Fri L' });
    await request('PUT', `/api/food/${fri}/dinner`, { status: 'yes', time: '20:00', details: 'Fri D' });

    // Backfill Saturday (1 skipped, 2 eaten)
    await request('PUT', `/api/food/${sat}/breakfast`, { status: 'no', details: 'Slept in' });
    await request('PUT', `/api/food/${sat}/lunch`, { status: 'yes', time: '14:00', details: 'Brunch' });
    await request('PUT', `/api/food/${sat}/dinner`, { status: 'yes', time: '21:00', details: 'BBQ' });

    // Backfill Sunday (1 eaten, 2 skipped)
    await request('PUT', `/api/food/${sun}/breakfast`, { status: 'yes', time: '09:00', details: 'Waffles' });
    await request('PUT', `/api/food/${sun}/lunch`, { status: 'no', details: 'Long flight' });
    await request('PUT', `/api/food/${sun}/dinner`, { status: 'no', details: 'Jet lag' });

    // Verify all 3 days display accurately
    const friRes = await request('GET', `/api/food/${fri}`);
    const satRes = await request('GET', `/api/food/${sat}`);
    const sunRes = await request('GET', `/api/food/${sun}`);

    assert.strictEqual(friRes.data.recordedCount, 3);
    assert.strictEqual(satRes.data.recordedCount, 3);
    assert.strictEqual(sunRes.data.recordedCount, 3);

    await cleanupDate(fri);
    await cleanupDate(sat);
    await cleanupDate(sun);
  });

  // -------------------------------------------------------------
  // Scenario 5: Full 7-Day Habit Analytics & Exact Percentages
  // -------------------------------------------------------------
  it('Scenario 5: Full 7-Day Habit Analytics & Exact Percentages', async (t) => {
    if (!serverAvailable) return t.skip('Server unavailable');
    // Week: 2099-08-17 (Mon) to 2099-08-23 (Sun)
    const weekDays = [
      '2099-08-17', '2099-08-18', '2099-08-19', '2099-08-20',
      '2099-08-21', '2099-08-22', '2099-08-23'
    ];

    for (const d of weekDays) await cleanupDate(d);

    // Goal: 15 Ate, 3 Skipped, 3 Unrecorded (Total 21)
    // Day 1 (Mon): 3 Ate
    await request('PUT', `/api/food/${weekDays[0]}/breakfast`, { status: 'yes', time: '08:00', details: 'Meal' });
    await request('PUT', `/api/food/${weekDays[0]}/lunch`, { status: 'yes', time: '13:00', details: 'Meal' });
    await request('PUT', `/api/food/${weekDays[0]}/dinner`, { status: 'yes', time: '20:00', details: 'Meal' });

    // Day 2 (Tue): 3 Ate
    await request('PUT', `/api/food/${weekDays[1]}/breakfast`, { status: 'yes', time: '08:00', details: 'Meal' });
    await request('PUT', `/api/food/${weekDays[1]}/lunch`, { status: 'yes', time: '13:00', details: 'Meal' });
    await request('PUT', `/api/food/${weekDays[1]}/dinner`, { status: 'yes', time: '20:00', details: 'Meal' });

    // Day 3 (Wed): 3 Ate
    await request('PUT', `/api/food/${weekDays[2]}/breakfast`, { status: 'yes', time: '08:00', details: 'Meal' });
    await request('PUT', `/api/food/${weekDays[2]}/lunch`, { status: 'yes', time: '13:00', details: 'Meal' });
    await request('PUT', `/api/food/${weekDays[2]}/dinner`, { status: 'yes', time: '20:00', details: 'Meal' });

    // Day 4 (Thu): 3 Ate
    await request('PUT', `/api/food/${weekDays[3]}/breakfast`, { status: 'yes', time: '08:00', details: 'Meal' });
    await request('PUT', `/api/food/${weekDays[3]}/lunch`, { status: 'yes', time: '13:00', details: 'Meal' });
    await request('PUT', `/api/food/${weekDays[3]}/dinner`, { status: 'yes', time: '20:00', details: 'Meal' });

    // Day 5 (Fri): 2 Ate, 1 Skipped (14 Ate, 1 Skipped so far)
    await request('PUT', `/api/food/${weekDays[4]}/breakfast`, { status: 'yes', time: '08:00', details: 'Meal' });
    await request('PUT', `/api/food/${weekDays[4]}/lunch`, { status: 'yes', time: '13:00', details: 'Meal' });
    await request('PUT', `/api/food/${weekDays[4]}/dinner`, { status: 'no', details: 'Skipped dinner' });

    // Day 6 (Sat): 1 Ate, 1 Skipped, 1 Unrecorded (15 Ate, 2 Skipped, 1 Unrecorded)
    await request('PUT', `/api/food/${weekDays[5]}/breakfast`, { status: 'yes', time: '09:00', details: 'Brunch' });
    await request('PUT', `/api/food/${weekDays[5]}/lunch`, { status: 'no', details: 'Busy' });
    // dinner left unrecorded (NULL)

    // Day 7 (Sun): 0 Ate, 1 Skipped, 2 Unrecorded (15 Ate, 3 Skipped, 3 Unrecorded)
    await request('PUT', `/api/food/${weekDays[6]}/breakfast`, { status: 'no', details: 'Fasting day' });
    // lunch and dinner left unrecorded (NULL)

    // Query weekly summary
    const rep = await request('GET', `/api/reports/summary?type=weekly&date=${weekDays[2]}`);
    assert.strictEqual(rep.status, 200);
    assert.strictEqual(rep.data.totalOpportunities, 21);
    assert.strictEqual(rep.data.summary.ate, 15);
    assert.strictEqual(rep.data.summary.skipped, 3);
    assert.strictEqual(rep.data.summary.unrecorded, 3);

    // Check percentages: 15/21 = 71.4%, 3/21 = 14.3%
    assert.ok(Math.abs(Number(rep.data.summary.atePercent) - 71.4) <= 0.2);
    assert.ok(Math.abs(Number(rep.data.summary.skippedPercent) - 14.3) <= 0.2);
    assert.ok(Math.abs(Number(rep.data.summary.unrecordedPercent) - 14.3) <= 0.2);

    for (const d of weekDays) await cleanupDate(d);
  });

  // -------------------------------------------------------------
  // Scenario 6: Month-End Leap Year & Calendar Transition
  // -------------------------------------------------------------
  it('Scenario 6: Month-End Leap Year & Calendar Transition', async (t) => {
    if (!serverAvailable) return t.skip('Server unavailable');
    // February 2028 (leap year has 29 days)
    const feb1 = '2028-02-01';
    const feb15 = '2028-02-15';
    const feb29 = '2028-02-29';

    await cleanupDate(feb1);
    await cleanupDate(feb15);
    await cleanupDate(feb29);

    await request('PUT', `/api/food/${feb1}/breakfast`, { status: 'yes', time: '08:00', details: 'Feb 1' });
    await request('PUT', `/api/food/${feb15}/lunch`, { status: 'yes', time: '13:00', details: 'Feb 15' });
    await request('PUT', `/api/food/${feb29}/dinner`, { status: 'yes', time: '20:00', details: 'Feb 29' });

    const rep = await request('GET', `/api/reports/summary?type=monthly&date=${feb15}`);
    assert.strictEqual(rep.status, 200);
    assert.strictEqual(rep.data.startDate, '2028-02-01');
    assert.strictEqual(rep.data.endDate, '2028-02-29');
    assert.strictEqual(rep.data.totalDays, 29);
    assert.strictEqual(rep.data.totalOpportunities, 87);
    assert.strictEqual(rep.data.summary.ate, 3);
    assert.strictEqual(rep.data.summary.unrecorded, 84);

    await cleanupDate(feb1);
    await cleanupDate(feb15);
    await cleanupDate(feb29);
  });
});
