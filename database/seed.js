/**
 * database/seed.js
 * 
 * Development seed script for Food Diary.
 * Populates sample realistic diary entries across recent calendar dates
 * demonstrating all 3 meal states (Ate, Skipped, and Unrecorded NULL).
 * 
 * Works identically on MySQL and SQLite via server/db.js persistence layer.
 * 
 * Usage:
 *   node database/seed.js
 */

const path = require('node:path');

// Safe dotenv loading
try {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
} catch {
  // Use existing process.env
}

const db = require('../server/db');

function formatLocalDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function seed() {
  console.log('[seed] Initializing database connection...');
  await db.initDb();

  const now = new Date();
  
  // Dates: today, yesterday, 2 days ago, 3 days ago, 4 days ago
  const dates = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dates.push(formatLocalDate(d));
  }

  console.log(`[seed] Seeding sample data for dates: ${dates.join(', ')}`);

  const sampleEntries = [
    // Today (Day 0): Breakfast recorded (Ate), Lunch recorded (Skipped), Dinner unrecorded (NULL)
    {
      date: dates[0],
      breakfast_status: 'yes',
      breakfast_time: '08:30:00',
      breakfast_details: 'Oatmeal with fresh blueberries, chia seeds, and hot almond milk',
      lunch_status: 'no',
      lunch_time: null,
      lunch_details: 'Back-to-back project meetings, took a matcha green tea instead',
      dinner_status: null,
      dinner_time: null,
      dinner_details: null
    },
    // Yesterday (Day 1): All 3 meals recorded
    {
      date: dates[1],
      breakfast_status: 'yes',
      breakfast_time: '08:15:00',
      breakfast_details: '2 poached eggs on sourdough toast with avocado slices',
      lunch_status: 'yes',
      lunch_time: '13:00:00',
      lunch_details: 'Warm quinoa bowl with roasted chickpeas, tahini dressing, and cucumber',
      dinner_status: 'yes',
      dinner_time: '20:00:00',
      dinner_details: 'Lentil soup with steamed broccoli and brown rice'
    },
    // 2 days ago (Day 2): Breakfast ate, Lunch ate, Dinner skipped
    {
      date: dates[2],
      breakfast_status: 'yes',
      breakfast_time: '09:00:00',
      breakfast_details: 'Greek yogurt with raw honey, walnuts, and sliced banana',
      lunch_status: 'yes',
      lunch_time: '13:30:00',
      lunch_details: 'Paneer tikka wrap with mint chutney and mixed greens',
      dinner_status: 'no',
      dinner_time: null,
      dinner_details: 'Late heavy lunch, not feeling hungry at night'
    },
    // 3 days ago (Day 3): Only Dinner recorded
    {
      date: dates[3],
      breakfast_status: null,
      breakfast_time: null,
      breakfast_details: null,
      lunch_status: null,
      lunch_time: null,
      lunch_details: null,
      dinner_status: 'yes',
      dinner_time: '19:45:00',
      dinner_details: 'Grilled tofu with stir-fried bell peppers and jasmine rice'
    },
    // 4 days ago (Day 4): Breakfast skipped, Lunch ate, Dinner ate
    {
      date: dates[4],
      breakfast_status: 'no',
      breakfast_time: null,
      breakfast_details: 'Intermittent fasting until 12 PM',
      lunch_status: 'yes',
      lunch_time: '12:30:00',
      lunch_details: 'Rajma chawal with sliced onions and cucumber salad',
      dinner_status: 'yes',
      dinner_time: '20:15:00',
      dinner_details: 'Vegetable khichdi with roasted papad and curd'
    }
  ];

  for (const entry of sampleEntries) {
    const sql = `
      INSERT INTO food_records (
        record_date,
        breakfast_status, breakfast_time, breakfast_details,
        lunch_status, lunch_time, lunch_details,
        dinner_status, dinner_time, dinner_details
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        breakfast_status = VALUES(breakfast_status),
        breakfast_time = VALUES(breakfast_time),
        breakfast_details = VALUES(breakfast_details),
        lunch_status = VALUES(lunch_status),
        lunch_time = VALUES(lunch_time),
        lunch_details = VALUES(lunch_details),
        dinner_status = VALUES(dinner_status),
        dinner_time = VALUES(dinner_time),
        dinner_details = VALUES(dinner_details);
    `;

    const params = [
      entry.date,
      entry.breakfast_status, entry.breakfast_time, entry.breakfast_details,
      entry.lunch_status, entry.lunch_time, entry.lunch_details,
      entry.dinner_status, entry.dinner_time, entry.dinner_details
    ];

    await db.query(sql, params);
    console.log(`[seed] Successfully seeded record for ${entry.date}`);
  }

  const [rows] = await db.query('SELECT record_date, breakfast_status, lunch_status, dinner_status FROM food_records ORDER BY record_date DESC');
  console.log(`[seed] Total records now in database: ${rows.length}`);
  await db.close();
  console.log('[seed] Seeding completed successfully.');
}

if (require.main === module) {
  seed().catch(err => {
    console.error('[seed] Error seeding database:', err);
    process.exit(1);
  });
}

module.exports = { seed };
