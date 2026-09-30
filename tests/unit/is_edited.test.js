const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const app = require('../../server/app');
const db = require('../../server/db');

test('is_edited tracking and status alias tests', async (t) => {
  const testDate = '2099-05-20';

  // Boot server on ephemeral port
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  // Clean test date before starting
  await db.query('DELETE FROM food_records WHERE record_date = ?', [testDate]);

  try {
    await t.test('1. First-time save for date sets is_edited = false', async () => {
      const res = await fetch(`${baseUrl}/api/food/${testDate}/breakfast`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'ha', // test Hindi alias
          time: '08:30',
          details: 'Initial breakfast food'
        })
      });

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.equal(body.status, 'yes');
      assert.equal(body.isEdited, false);

      const getRes = await fetch(`${baseUrl}/api/food/${testDate}`);
      assert.equal(getRes.status, 200);
      const getBody = await getRes.json();
      assert.equal(getBody.isEdited, false);
      assert.equal(getBody.meals.breakfast.status, 'yes');
      assert.equal(getBody.meals.breakfast.details, 'Initial breakfast food');
    });

    await t.test('2. First-time save of another meal on same day leaves is_edited = false', async () => {
      const res = await fetch(`${baseUrl}/api/food/${testDate}/lunch`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'nahi', // test Hindi alias
          details: 'Not hungry today'
        })
      });

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.isEdited, false);

      const getRes = await fetch(`${baseUrl}/api/food/${testDate}`);
      assert.equal(getRes.status, 200);
      const getBody = await getRes.json();
      assert.equal(getBody.isEdited, false);
      assert.equal(getBody.meals.lunch.status, 'no');
    });

    await t.test('3. Resaving without changing values leaves is_edited = false', async () => {
      const res = await fetch(`${baseUrl}/api/food/${testDate}/breakfast`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'yes',
          time: '08:30',
          details: 'Initial breakfast food'
        })
      });

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.isEdited, false);

      const getRes = await fetch(`${baseUrl}/api/food/${testDate}`);
      assert.equal(getRes.status, 200);
      const getBody = await getRes.json();
      assert.equal(getBody.isEdited, false);
    });

    await t.test('4. Modifying an existing meal value sets is_edited = true', async () => {
      const res = await fetch(`${baseUrl}/api/food/${testDate}/breakfast`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'yes',
          time: '09:00', // Changed time!
          details: 'Updated breakfast food'
        })
      });

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.isEdited, true);

      const getRes = await fetch(`${baseUrl}/api/food/${testDate}`);
      assert.equal(getRes.status, 200);
      const getBody = await getRes.json();
      assert.equal(getBody.isEdited, true);
    });

    await t.test('5. Once is_edited is true, it remains true permanently', async () => {
      const res = await fetch(`${baseUrl}/api/food/${testDate}/dinner`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'yes',
          time: '20:00',
          details: 'Dinner meal'
        })
      });

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.isEdited, true);

      const getRes = await fetch(`${baseUrl}/api/food/${testDate}`);
      assert.equal(getRes.status, 200);
      const getBody = await getRes.json();
      assert.equal(getBody.isEdited, true);
    });
  } finally {
    // Clean up
    await db.query('DELETE FROM food_records WHERE record_date = ?', [testDate]);
    await new Promise((resolve) => server.close(resolve));
  }
});
