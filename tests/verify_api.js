#!/usr/bin/env node
/**
 * tests/verify_api.js
 * 
 * Standalone Automated Verification Script for Food Diary REST API.
 * Adheres strictly to the project Acceptance Criteria in ORIGINAL_REQUEST.md:
 *  - Save breakfast as 'yes' with time and details on a new date.
 *  - Subsequently save lunch as 'no' with details without altering breakfast.
 *  - Reset dinner or breakfast to NULL via DELETE without removing other meal data.
 *  - Verify Weekly and Monthly report endpoints correctly aggregate counts and preserve NULL vs NO distinction.
 * 
 * Usage:
 *   node tests/verify_api.js
 *   API_URL=http://localhost:5000 node tests/verify_api.js
 */

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const API_URL = process.env.API_URL || 'http://127.0.0.1:5000';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

function logPass(msg) {
  console.log(`${colors.green}✔ [PASS]${colors.reset} ${msg}`);
}

function logFail(msg, err) {
  console.error(`${colors.red}✖ [FAIL]${colors.reset} ${msg}`);
  if (err) {
    console.error(`${colors.yellow}${err.stack || err.message}${colors.reset}`);
  }
}

function logInfo(msg) {
  console.log(`${colors.cyan}ℹ [INFO]${colors.reset} ${msg}`);
}

function logHeader(title) {
  console.log(`\n${colors.bold}${colors.blue}=== ${title} ===${colors.reset}`);
}

let activeBaseUrl = API_URL;
let ephemeralServer = null;

async function checkServer(url) {
  try {
    const res = await fetch(`${url}/api/food/2099-01-01`, { signal: AbortSignal.timeout(2000) });
    return [200, 400, 404].includes(res.status);
  } catch {
    return false;
  }
}

async function apiRequest(method, endpoint, body = null) {
  const url = `${activeBaseUrl}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
  const options = {
    method,
    headers: {
      'Accept': 'application/json'
    }
  };
  if (body) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const res = await fetch(url, options);
  let json = null;
  const text = await res.text();
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, data: json, raw: text };
}

async function runVerification() {
  logHeader('Food Diary API Automated Verification');
  logInfo(`Target API Base URL: ${activeBaseUrl}`);

  // 1. Ensure server is available or attempt ephemeral start if server/app.js exists
  let isUp = await checkServer(activeBaseUrl);
  if (!isUp) {
    const appPath = path.resolve(__dirname, '../server/app.js');
    if (fs.existsSync(appPath)) {
      logInfo(`Server not detected on ${activeBaseUrl}. Attempting ephemeral boot from ${appPath}...`);
      try {
        const app = require(appPath);
        const serverApp = app.default || app;
        if (typeof serverApp === 'function') {
          await new Promise((resolve, reject) => {
            ephemeralServer = http.createServer(serverApp);
            ephemeralServer.listen(0, '127.0.0.1', () => {
              const port = ephemeralServer.address().port;
              activeBaseUrl = `http://127.0.0.1:${port}`;
              resolve();
            });
            ephemeralServer.on('error', reject);
          });
          logPass(`Ephemeral test server booted on ${activeBaseUrl}`);
        }
      } catch (err) {
        logFail(`Could not launch ephemeral server: ${err.message}`);
      }
    }
  }

  isUp = await checkServer(activeBaseUrl);
  if (!isUp) {
    console.error(`\n${colors.red}${colors.bold}ERROR: Backend server is not reachable at ${activeBaseUrl}.${colors.reset}`);
    console.error(`Please ensure the Food Diary backend server is running before executing verify_api.js:`);
    console.error(`  1. Start server: node server/index.js (or npm run server)`);
    console.error(`  2. Set API_URL if running on a custom port: API_URL=http://localhost:XXXX node tests/verify_api.js\n`);
    process.exit(1);
  }

  logPass(`Connected to backend server at ${activeBaseUrl}`);

  // Test Date selection: Pick a deterministic future date for isolation
  const TEST_DATE = '2099-10-14'; // A Wednesday in October 2099
  const TEST_DATE_2 = '2099-10-15'; // Thursday

  let passedTests = 0;
  let totalTests = 0;

  async function step(name, fn) {
    totalTests++;
    try {
      await fn();
      logPass(name);
      passedTests++;
    } catch (err) {
      logFail(name, err);
      throw err;
    }
  }

  try {
    // -------------------------------------------------------------
    // Criterion 1: Save breakfast as 'yes' with time and details on a new date
    // -------------------------------------------------------------
    logHeader('Step 1: Save Breakfast as "yes" on New Date');
    await step('Clean initial state for test date', async () => {
      await apiRequest('DELETE', `/api/food/${TEST_DATE}/breakfast`);
      await apiRequest('DELETE', `/api/food/${TEST_DATE}/lunch`);
      await apiRequest('DELETE', `/api/food/${TEST_DATE}/dinner`);
    });

    await step('Save breakfast as "yes" with time and details', async () => {
      const res = await apiRequest('PUT', `/api/food/${TEST_DATE}/breakfast`, {
        status: 'yes',
        time: '08:30 AM',
        details: 'Masala Dosa and Filter Coffee'
      });
      assert.strictEqual(res.status, 200, `Expected 200, received ${res.status}: ${JSON.stringify(res.data)}`);
      assert.ok(res.data, 'Expected response body');
      assert.strictEqual(res.data.success, true, 'Expected success: true');
      if (res.data.record) {
        assert.strictEqual(res.data.record.status, 'yes', 'Expected record.status == "yes"');
        assert.strictEqual(res.data.record.details, 'Masala Dosa and Filter Coffee');
      }
    });

    await step('Verify GET /api/food/:date has breakfast recorded and others unrecorded (NULL)', async () => {
      const res = await apiRequest('GET', `/api/food/${TEST_DATE}`);
      assert.strictEqual(res.status, 200, `Expected 200, received ${res.status}`);
      assert.strictEqual(res.data.date, TEST_DATE);
      assert.strictEqual(res.data.recordedCount, 1, 'Expected recordedCount == 1');
      assert.ok(res.data.meals, 'Expected meals object');
      assert.strictEqual(res.data.meals.breakfast.status, 'yes');
      assert.strictEqual(res.data.meals.breakfast.details, 'Masala Dosa and Filter Coffee');
      assert.ok(res.data.meals.breakfast.time !== null, 'Expected breakfast time to be non-null');
      assert.strictEqual(res.data.meals.lunch.status, null, 'Expected lunch status to be NULL');
      assert.strictEqual(res.data.meals.dinner.status, null, 'Expected dinner status to be NULL');
    });

    // -------------------------------------------------------------
    // Criterion 2: Subsequently save lunch as 'no' with details without altering breakfast
    // -------------------------------------------------------------
    logHeader('Step 2: Save Lunch as "no" with Reason (Verify Isolation)');
    await step('Save lunch as "no" with reason', async () => {
      const res = await apiRequest('PUT', `/api/food/${TEST_DATE}/lunch`, {
        status: 'no',
        details: 'Back-to-back architecture syncs, fasting until dinner'
      });
      assert.strictEqual(res.status, 200, `Expected 200, received ${res.status}: ${JSON.stringify(res.data)}`);
      assert.strictEqual(res.data.success, true);
      if (res.data.record) {
        assert.strictEqual(res.data.record.status, 'no');
        assert.strictEqual(res.data.record.time, null, 'Lunch time must be NULL when status is "no"');
      }
    });

    await step('Verify lunch is saved as "no" while breakfast remains strictly unaltered', async () => {
      const res = await apiRequest('GET', `/api/food/${TEST_DATE}`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.recordedCount, 2, 'Expected recordedCount == 2');
      // Verify Breakfast is strictly unaltered
      assert.strictEqual(res.data.meals.breakfast.status, 'yes', 'Breakfast must remain "yes"');
      assert.strictEqual(res.data.meals.breakfast.details, 'Masala Dosa and Filter Coffee', 'Breakfast details unaltered');
      assert.ok(res.data.meals.breakfast.time !== null, 'Breakfast time unaltered');
      // Verify Lunch is "no" with reason and NULL time
      assert.strictEqual(res.data.meals.lunch.status, 'no', 'Lunch must be "no"');
      assert.strictEqual(res.data.meals.lunch.time, null, 'Lunch time must be NULL');
      assert.strictEqual(res.data.meals.lunch.details, 'Back-to-back architecture syncs, fasting until dinner');
      // Verify Dinner remains untouched (NULL)
      assert.strictEqual(res.data.meals.dinner.status, null, 'Dinner must remain NULL');
    });

    // -------------------------------------------------------------
    // Criterion 3: Reset dinner or breakfast to NULL via DELETE without removing other meal data
    // -------------------------------------------------------------
    logHeader('Step 3: Reset Meal via DELETE (Preserve Other Meals)');
    await step('Save dinner as "yes" so all three meals exist', async () => {
      const res = await apiRequest('PUT', `/api/food/${TEST_DATE}/dinner`, {
        status: 'yes',
        time: '08:45 PM',
        details: 'Paneer Curry with 2 Chapatis'
      });
      assert.strictEqual(res.status, 200);
      const getRes = await apiRequest('GET', `/api/food/${TEST_DATE}`);
      assert.strictEqual(getRes.data.recordedCount, 3, 'Expected 3 recorded meals');
    });

    await step('Reset dinner to NULL via DELETE /api/food/:date/dinner', async () => {
      const delRes = await apiRequest('DELETE', `/api/food/${TEST_DATE}/dinner`);
      assert.strictEqual(delRes.status, 200, `Expected 200, received ${delRes.status}: ${JSON.stringify(delRes.data)}`);
      assert.strictEqual(delRes.data.success, true);
    });

    await step('Verify dinner is NULL while breakfast ("yes") and lunch ("no") remain untouched', async () => {
      const res = await apiRequest('GET', `/api/food/${TEST_DATE}`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.recordedCount, 2, 'Expected recordedCount == 2 after dinner reset');
      // Dinner is now reset to NULL
      assert.strictEqual(res.data.meals.dinner.status, null, 'Dinner status must be reset to NULL');
      assert.strictEqual(res.data.meals.dinner.time, null, 'Dinner time must be reset to NULL');
      assert.strictEqual(res.data.meals.dinner.details, null, 'Dinner details must be reset to NULL');
      // Breakfast and lunch are still completely intact
      assert.strictEqual(res.data.meals.breakfast.status, 'yes', 'Breakfast must still be "yes"');
      assert.strictEqual(res.data.meals.breakfast.details, 'Masala Dosa and Filter Coffee');
      assert.strictEqual(res.data.meals.lunch.status, 'no', 'Lunch must still be "no"');
      assert.strictEqual(res.data.meals.lunch.details, 'Back-to-back architecture syncs, fasting until dinner');
    });

    await step('Reset breakfast to NULL via DELETE /api/food/:date/breakfast', async () => {
      const delRes = await apiRequest('DELETE', `/api/food/${TEST_DATE}/breakfast`);
      assert.strictEqual(delRes.status, 200);
      const res = await apiRequest('GET', `/api/food/${TEST_DATE}`);
      assert.strictEqual(res.data.recordedCount, 1, 'Expected recordedCount == 1');
      assert.strictEqual(res.data.meals.breakfast.status, null, 'Breakfast must now be reset to NULL');
      assert.strictEqual(res.data.meals.lunch.status, 'no', 'Lunch must remain "no"');
    });

    // -------------------------------------------------------------
    // Criterion 4: Weekly and Monthly reports aggregate counts and preserve NULL vs NO distinction
    // -------------------------------------------------------------
    logHeader('Step 4: Weekly & Monthly Report Aggregations & NULL vs NO Preservation');

    // Clean week for 2099-10-12 (Mon) to 2099-10-18 (Sun)
    const weekDates = [
      '2099-10-12', '2099-10-13', '2099-10-14', '2099-10-15',
      '2099-10-16', '2099-10-17', '2099-10-18'
    ];
    for (const d of weekDates) {
      await apiRequest('DELETE', `/api/food/${d}/breakfast`);
      await apiRequest('DELETE', `/api/food/${d}/lunch`);
      await apiRequest('DELETE', `/api/food/${d}/dinner`);
    }

    // Seed specific known records in the week:
    // Day 1 (Mon): Breakfast YES, Lunch NO, Dinner NULL (1 ate, 1 skipped, 1 unrecorded)
    // Day 2 (Tue): Breakfast YES, Lunch YES, Dinner YES (3 ate, 0 skipped, 0 unrecorded)
    // Day 3-7: All NULL (0 ate, 0 skipped, 15 unrecorded)
    // Expected Week Total: Ate = 4, Skipped = 1, Unrecorded = 16 (Total = 21)
    await step('Seed deterministic week records (1 Skipped, 4 Ate, 16 Unrecorded)', async () => {
      await apiRequest('PUT', `/api/food/2099-10-12/breakfast`, { status: 'yes', time: '08:00', details: 'Fruit bowl' });
      await apiRequest('PUT', `/api/food/2099-10-12/lunch`, { status: 'no', details: 'Fasting' });
      await apiRequest('PUT', `/api/food/2099-10-13/breakfast`, { status: 'yes', time: '08:00', details: 'Eggs' });
      await apiRequest('PUT', `/api/food/2099-10-13/lunch`, { status: 'yes', time: '13:00', details: 'Rice' });
      await apiRequest('PUT', `/api/food/2099-10-13/dinner`, { status: 'yes', time: '20:00', details: 'Soup' });
    });

    await step('Verify Weekly Report aggregates exact counts and preserves NULL vs NO', async () => {
      const res = await apiRequest('GET', `/api/reports/summary?type=weekly&date=2099-10-14`);
      assert.strictEqual(res.status, 200, `Expected 200, received ${res.status}`);
      const rep = res.data;
      assert.strictEqual(rep.type, 'weekly');
      assert.strictEqual(rep.startDate, '2099-10-12', 'Week start must be Monday 2099-10-12');
      assert.strictEqual(rep.endDate, '2099-10-18', 'Week end must be Sunday 2099-10-18');
      assert.strictEqual(rep.totalDays, 7);
      assert.strictEqual(rep.totalOpportunities, 21);

      assert.ok(rep.summary, 'Summary object must exist');
      assert.strictEqual(rep.summary.ate, 4, 'Summary ate count must be 4');
      assert.strictEqual(rep.summary.skipped, 1, 'Summary skipped count must be 1');
      assert.strictEqual(rep.summary.unrecorded, 16, 'Summary unrecorded count must be 16 (NULL preserved)');
      assert.strictEqual(
        rep.summary.ate + rep.summary.skipped + rep.summary.unrecorded,
        21,
        'Sum of Ate + Skipped + Unrecorded must strictly equal 21'
      );

      // Verify unrecorded (NULL) is NOT treated as skipped (NO)
      assert.notStrictEqual(
        rep.summary.skipped,
        17,
        'CRITICAL: NULL unrecorded meals must NEVER be counted as skipped/no'
      );
    });

    await step('Verify Monthly Report boundaries and total opportunities (October 2099)', async () => {
      const res = await apiRequest('GET', `/api/reports/summary?type=monthly&date=2099-10-14`);
      assert.strictEqual(res.status, 200, `Expected 200, received ${res.status}`);
      const rep = res.data;
      assert.strictEqual(rep.type, 'monthly');
      assert.strictEqual(rep.startDate, '2099-10-01', 'Month start must be 1st of October');
      assert.strictEqual(rep.endDate, '2099-10-31', 'Month end must be 31st of October');
      assert.strictEqual(rep.totalDays, 31, 'October has 31 days');
      assert.strictEqual(rep.totalOpportunities, 93, '31 days * 3 meals = 93 opportunities');

      assert.strictEqual(rep.summary.ate, 4);
      assert.strictEqual(rep.summary.skipped, 1);
      assert.strictEqual(rep.summary.unrecorded, 88, 'Unrecorded must be 93 - 4 - 1 = 88');
      assert.strictEqual(rep.summary.ate + rep.summary.skipped + rep.summary.unrecorded, 93);
    });

    // Teardown
    for (const d of weekDates) {
      await apiRequest('DELETE', `/api/food/${d}/breakfast`);
      await apiRequest('DELETE', `/api/food/${d}/lunch`);
      await apiRequest('DELETE', `/api/food/${d}/dinner`);
    }

    logHeader('Verification Result');
    console.log(`\n${colors.bold}${colors.green}=======================================================`);
    console.log(`  🎉 ALL ACCEPTANCE CRITERIA VERIFIED SUCCESSFULLY!`);
    console.log(`  Passed: ${passedTests} / ${totalTests} checks`);
    console.log(`=======================================================${colors.reset}\n`);

  } catch (err) {
    logHeader('Verification Failed');
    console.error(`\n${colors.bold}${colors.red}=======================================================`);
    console.error(`  ❌ VERIFICATION ENCOUNTERED AN ERROR`);
    console.error(`  Passed: ${passedTests} / ${totalTests} checks`);
    console.error(`  Error: ${err.message}`);
    console.error(`=======================================================${colors.reset}\n`);
    process.exit(1);
  } finally {
    if (ephemeralServer) {
      ephemeralServer.close();
    }
  }
}

runVerification();
