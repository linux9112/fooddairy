/**
 * tests/test_helper.js
 * 
 * Shared test utilities, HTTP client, test lifecycle hooks,
 * date generators, and assertions for the Food Diary test suites.
 */

const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');

const DEFAULT_API_URL = process.env.API_URL || 'http://127.0.0.1:5000';
let activeBaseUrl = DEFAULT_API_URL;
let ephemeralServer = null;

/**
 * Checks whether an HTTP endpoint is reachable.
 */
async function isServerReachable(url) {
  try {
    const res = await fetch(`${url}/api/food/2099-01-01`, { signal: AbortSignal.timeout(1500) });
    // Accept 200, 404, or 400 as sign that the API service is listening
    return [200, 400, 404].includes(res.status);
  } catch (err) {
    return false;
  }
}

/**
 * Ensures backend server is ready for test execution.
 * 1. Checks if server is already running at activeBaseUrl.
 * 2. If not, checks if server/app.js exists and boots an ephemeral server on a dynamic port.
 * 3. Throws a helpful diagnostic if server is unavailable.
 */
async function setupTestServer() {
  if (await isServerReachable(activeBaseUrl)) {
    return activeBaseUrl;
  }

  // Look for Express app in server/app.js
  const appPath = path.resolve(__dirname, '../server/app.js');
  if (fs.existsSync(appPath)) {
    try {
      const expressApp = require(appPath);
      const app = expressApp.default || expressApp;
      if (typeof app === 'function') {
        await new Promise((resolve, reject) => {
          ephemeralServer = http.createServer(app);
          ephemeralServer.listen(0, '127.0.0.1', () => {
            const port = ephemeralServer.address().port;
            activeBaseUrl = `http://127.0.0.1:${port}`;
            resolve();
          });
          ephemeralServer.on('error', reject);
        });
        return activeBaseUrl;
      }
    } catch (err) {
      console.warn(`[test_helper] Could not boot ephemeral server from ${appPath}: ${err.message}`);
    }
  }

  throw new Error(
    `[test_helper] Backend server is not running at ${activeBaseUrl} and server/app.js is not yet available.\n` +
    `To run E2E tests against a live backend, ensure the backend is started:\n` +
    `  $ npm run server   (or node server/index.js)\n` +
    `Or set API_URL environment variable to your active backend URL.`
  );
}

/**
 * Shuts down ephemeral server if spawned.
 */
async function teardownTestServer() {
  if (ephemeralServer) {
    await new Promise((resolve) => ephemeralServer.close(resolve));
    ephemeralServer = null;
  }
}

/**
 * Returns the currently active base URL.
 */
function getBaseUrl() {
  return activeBaseUrl;
}

/**
 * Helper to make JSON HTTP requests to the API.
 */
async function request(method, pathName, body = null, headers = {}) {
  const url = `${activeBaseUrl}${pathName.startsWith('/') ? pathName : '/' + pathName}`;
  const options = {
    method,
    headers: {
      'Accept': 'application/json',
      ...headers
    }
  };

  if (body !== null && method !== 'GET' && method !== 'HEAD') {
    if (typeof body === 'string') {
      options.headers['Content-Type'] = options.headers['Content-Type'] || 'application/json';
      options.body = body;
    } else {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
  }

  const response = await fetch(url, options);
  let data = null;
  const text = await response.text();
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  return {
    status: response.status,
    headers: response.headers,
    data,
    rawText: text
  };
}

/**
 * Generates an isolated test date in future years (e.g. 2099)
 * to avoid colliding with real diary entries.
 */
function generateTestDate(offsetDays = 0) {
  const base = new Date('2099-05-15T00:00:00Z');
  base.setDate(base.getDate() + offsetDays);
  return base.toISOString().slice(0, 10);
}

/**
 * Cleans up records for a given date by resetting all 3 meals.
 */
async function cleanupDate(date) {
  try {
    await request('DELETE', `/api/food/${date}/breakfast`);
    await request('DELETE', `/api/food/${date}/lunch`);
    await request('DELETE', `/api/food/${date}/dinner`);
  } catch {
    // Ignore cleanup errors
  }
}

module.exports = {
  setupTestServer,
  teardownTestServer,
  getBaseUrl,
  request,
  generateTestDate,
  cleanupDate,
  isServerReachable
};
