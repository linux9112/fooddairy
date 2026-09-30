/**
 * server/routes/reports.js
 * 
 * Aggregation and reporting routes:
 * - GET /api/reports/summary?type=weekly&date=YYYY-MM-DD
 * - GET /api/reports/summary?type=monthly&date=YYYY-MM-DD
 * 
 * Strict Invariants:
 * - Weekly: Monday through Sunday
 * - Monthly: 1st to last day of the calendar month
 * - Unrecorded (NULL) is NEVER counted as skipped (NO).
 * - ate + skipped + unrecorded strictly equals totalOpportunities.
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const {
  isValidDateString,
  getTodayLocalDate,
  getWeekRange,
  getMonthRange,
  formatLocalDate
} = require('../utils/dateUtils');

/**
 * GET /api/reports/summary
 * Query params:
 *   type: 'weekly' | 'monthly' (default: 'weekly')
 *   date: YYYY-MM-DD (default: today)
 */
router.get('/summary', async (req, res, next) => {
  try {
    const type = (req.query.type || 'weekly').toLowerCase().trim();
    const date = req.query.date;

    if (!date || !isValidDateString(date)) {
      return res.status(400).json({
        success: false,
        error: 'Query parameter "date" is required and must be in YYYY-MM-DD format.'
      });
    }

    if (type !== 'weekly' && type !== 'monthly') {
      return res.status(400).json({
        success: false,
        error: 'Invalid report type. Allowed values: "weekly" or "monthly".'
      });
    }

    let range;
    let prevDate;
    let nextDate;

    if (type === 'weekly') {
      range = getWeekRange(date);
      // Navigation: prev week = Monday - 7 days, next week = Monday + 7 days
      const [sy, sm, sd] = range.startDate.split('-').map(Number);
      const startObj = new Date(sy, sm - 1, sd, 12, 0, 0);
      
      const prevWeekMon = new Date(startObj);
      prevWeekMon.setDate(startObj.getDate() - 7);
      prevDate = formatLocalDate(prevWeekMon.getFullYear(), prevWeekMon.getMonth() + 1, prevWeekMon.getDate());

      const nextWeekMon = new Date(startObj);
      nextWeekMon.setDate(startObj.getDate() + 7);
      nextDate = formatLocalDate(nextWeekMon.getFullYear(), nextWeekMon.getMonth() + 1, nextWeekMon.getDate());
    } else {
      range = getMonthRange(date);
      // Navigation: prev month = 1st of prev month, next month = 1st of next month
      const [sy, sm] = range.startDate.split('-').map(Number);
      const prevMonthObj = new Date(sy, sm - 2, 1, 12, 0, 0);
      prevDate = formatLocalDate(prevMonthObj.getFullYear(), prevMonthObj.getMonth() + 1, 1);

      const nextMonthObj = new Date(sy, sm, 1, 12, 0, 0);
      nextDate = formatLocalDate(nextMonthObj.getFullYear(), nextMonthObj.getMonth() + 1, 1);
    }

    const { startDate, endDate, totalDays } = range;
    const totalOpportunities = totalDays * 3;

    // Fetch all recorded days within the window
    const [rows] = await db.query(
      `SELECT record_date,
              breakfast_status, breakfast_time, breakfast_details,
              lunch_status, lunch_time, lunch_details,
              dinner_status, dinner_time, dinner_details
       FROM food_records
       WHERE record_date >= ? AND record_date <= ?
       ORDER BY record_date ASC`,
      [startDate, endDate]
    );

    // Initialize counters
    const meals = {
      breakfast: { ate: 0, skipped: 0, unrecorded: totalDays },
      lunch: { ate: 0, skipped: 0, unrecorded: totalDays },
      dinner: { ate: 0, skipped: 0, unrecorded: totalDays }
    };

    // Aggregate counts from recorded rows
    for (const row of rows) {
      // Breakfast
      if (row.breakfast_status === 'yes') {
        meals.breakfast.ate++;
      } else if (row.breakfast_status === 'no') {
        meals.breakfast.skipped++;
      }

      // Lunch
      if (row.lunch_status === 'yes') {
        meals.lunch.ate++;
      } else if (row.lunch_status === 'no') {
        meals.lunch.skipped++;
      }

      // Dinner
      if (row.dinner_status === 'yes') {
        meals.dinner.ate++;
      } else if (row.dinner_status === 'no') {
        meals.dinner.skipped++;
      }
    }

    // Unrecorded is calculated as totalDays - ate - skipped
    meals.breakfast.unrecorded = totalDays - meals.breakfast.ate - meals.breakfast.skipped;
    meals.lunch.unrecorded = totalDays - meals.lunch.ate - meals.lunch.skipped;
    meals.dinner.unrecorded = totalDays - meals.dinner.ate - meals.dinner.skipped;

    // Compute meal-level percentages
    for (const m of ['breakfast', 'lunch', 'dinner']) {
      meals[m].atePercent = totalDays > 0 ? Number(((meals[m].ate / totalDays) * 100).toFixed(1)) : 0;
      meals[m].skippedPercent = totalDays > 0 ? Number(((meals[m].skipped / totalDays) * 100).toFixed(1)) : 0;
      meals[m].unrecordedPercent = totalDays > 0 ? Number(((meals[m].unrecorded / totalDays) * 100).toFixed(1)) : 0;
    }

    const summary = {
      ate: meals.breakfast.ate + meals.lunch.ate + meals.dinner.ate,
      skipped: meals.breakfast.skipped + meals.lunch.skipped + meals.dinner.skipped,
      unrecorded: meals.breakfast.unrecorded + meals.lunch.unrecorded + meals.dinner.unrecorded
    };

    summary.atePercent = totalOpportunities > 0 ? Number(((summary.ate / totalOpportunities) * 100).toFixed(1)) : 0;
    summary.skippedPercent = totalOpportunities > 0 ? Number(((summary.skipped / totalOpportunities) * 100).toFixed(1)) : 0;
    summary.unrecordedPercent = totalOpportunities > 0 ? Number(((summary.unrecorded / totalOpportunities) * 100).toFixed(1)) : 0;

    return res.json({
      success: true,
      type,
      referenceDate: date,
      startDate,
      endDate,
      prevDate,
      nextDate,
      totalDays,
      totalOpportunities,
      summary,
      meals,
      byMeal: meals,
      recordCount: rows.length
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
