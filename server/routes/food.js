/**
 * server/routes/food.js
 * 
 * REST API routes for food diary entries:
 * - GET    /api/food/:date       -> Retrieve full record for a specific date
 * - PUT    /api/food/:date/:meal -> Record or update a single meal (isolated)
 * - DELETE /api/food/:date/:meal -> Reset a meal to unrecorded (NULL)
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { isValidDateString, normalizeTimeTo24h, formatTime12h } = require('../utils/dateUtils');

const VALID_MEALS = ['breakfast', 'lunch', 'dinner'];

/**
 * GET /api/food/:date
 * Retrieve the complete meal record for the specified date.
 */
router.get('/:date', async (req, res, next) => {
  try {
    const { date } = req.params;

    if (!isValidDateString(date)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid date format. Expected YYYY-MM-DD.'
      });
    }

    const [rows] = await db.query(
      `SELECT record_date,
              breakfast_status, breakfast_time, breakfast_details,
              lunch_status, lunch_time, lunch_details,
              dinner_status, dinner_time, dinner_details,
              created_at, updated_at
       FROM food_records
       WHERE record_date = ?`,
      [date]
    );

    if (!rows || rows.length === 0) {
      return res.json({
        success: true,
        date,
        recordedCount: 0,
        meals: {
          breakfast: { status: null, time: null, details: null },
          lunch: { status: null, time: null, details: null },
          dinner: { status: null, time: null, details: null }
        }
      });
    }

    const row = rows[0];
    
    // Calculate how many of the 3 meals are recorded (status !== null)
    let recordedCount = 0;
    if (row.breakfast_status !== null) recordedCount++;
    if (row.lunch_status !== null) recordedCount++;
    if (row.dinner_status !== null) recordedCount++;

    return res.json({
      success: true,
      date: row.record_date,
      recordedCount,
      meals: {
        breakfast: {
          status: row.breakfast_status,
          time: row.breakfast_time ? row.breakfast_time.slice(0, 5) : null,
          formattedTime: row.breakfast_time ? formatTime12h(row.breakfast_time) : null,
          rawTime: row.breakfast_time,
          details: row.breakfast_details
        },
        lunch: {
          status: row.lunch_status,
          time: row.lunch_time ? row.lunch_time.slice(0, 5) : null,
          formattedTime: row.lunch_time ? formatTime12h(row.lunch_time) : null,
          rawTime: row.lunch_time,
          details: row.lunch_details
        },
        dinner: {
          status: row.dinner_status,
          time: row.dinner_time ? row.dinner_time.slice(0, 5) : null,
          formattedTime: row.dinner_time ? formatTime12h(row.dinner_time) : null,
          rawTime: row.dinner_time,
          details: row.dinner_details
        }
      },
      createdAt: row.created_at,
      updatedAt: row.updated_at
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/food/:date/:meal
 * Record or update only the specified meal slot for that date.
 */
router.put('/:date/:meal', async (req, res, next) => {
  try {
    const { date, meal } = req.params;
    const mealLower = (meal || '').toLowerCase().trim();

    if (!isValidDateString(date)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid date format. Expected YYYY-MM-DD.'
      });
    }

    if (!VALID_MEALS.includes(mealLower)) {
      return res.status(400).json({
        success: false,
        error: `Invalid meal name. Allowed values: ${VALID_MEALS.join(', ')}.`
      });
    }

    const { status, time, details } = req.body;
    const statusLower = (status || '').toLowerCase().trim();

    if (statusLower !== 'yes' && statusLower !== 'no') {
      return res.status(400).json({
        success: false,
        error: 'Meal status must be either "yes" or "no".'
      });
    }

    let normalizedTime = null;
    const rawDetails = typeof details === 'string' ? details : '';

    if (statusLower === 'yes') {
      if (!time) {
        return res.status(400).json({
          success: false,
          error: 'Time is required when status is "yes" (Kitna baje?).'
        });
      }
      normalizedTime = normalizeTimeTo24h(time);
      if (!normalizedTime) {
        return res.status(400).json({
          success: false,
          error: 'Invalid time format. Please provide a valid time (e.g. "08:30" or "08:30 AM").'
        });
      }
      if (!rawDetails.trim()) {
        return res.status(400).json({
          success: false,
          error: 'Food description is required when status is "yes" (Kya khae?).'
        });
      }
    } else {
      // status === 'no'
      normalizedTime = null; // Time must always be NULL when meal is skipped
      if (!rawDetails.trim()) {
        return res.status(400).json({
          success: false,
          error: 'Reason is required when meal was not eaten (Kyu nahi khae?).'
        });
      }
    }

    // Atomic Upsert: Inserts if date doesn't exist, updates ONLY this meal if it exists
    const statusCol = `${mealLower}_status`;
    const timeCol = `${mealLower}_time`;
    const detailsCol = `${mealLower}_details`;

    const sql = `
      INSERT INTO food_records (record_date, ${statusCol}, ${timeCol}, ${detailsCol})
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        ${statusCol} = VALUES(${statusCol}),
        ${timeCol} = VALUES(${timeCol}),
        ${detailsCol} = VALUES(${detailsCol})
    `;

    await db.query(sql, [date, statusLower, normalizedTime, rawDetails]);

    const formattedTime = normalizedTime ? formatTime12h(normalizedTime) : null;
    const shortTime = normalizedTime ? normalizedTime.slice(0, 5) : null;

    return res.json({
      success: true,
      message: `${mealLower.charAt(0).toUpperCase() + mealLower.slice(1)} saved successfully.`,
      meal: mealLower,
      status: statusLower,
      time: shortTime,
      formattedTime: formattedTime,
      details: rawDetails,
      record: {
        date,
        meal: mealLower,
        status: statusLower,
        time: shortTime,
        formattedTime: formattedTime,
        rawTime: normalizedTime,
        details: rawDetails
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/food/:date/:meal
 * Reset a specific meal slot to NULL (unrecorded) without altering other meals.
 */
router.delete('/:date/:meal', async (req, res, next) => {
  try {
    const { date, meal } = req.params;
    const mealLower = (meal || '').toLowerCase().trim();

    if (!isValidDateString(date)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid date format. Expected YYYY-MM-DD.'
      });
    }

    if (!VALID_MEALS.includes(mealLower)) {
      return res.status(400).json({
        success: false,
        error: `Invalid meal name. Allowed values: ${VALID_MEALS.join(', ')}.`
      });
    }

    const statusCol = `${mealLower}_status`;
    const timeCol = `${mealLower}_time`;
    const detailsCol = `${mealLower}_details`;

    await db.query(
      `UPDATE food_records
       SET ${statusCol} = NULL,
           ${timeCol} = NULL,
           ${detailsCol} = NULL
       WHERE record_date = ?`,
      [date]
    );

    return res.json({
      success: true,
      message: `${mealLower.charAt(0).toUpperCase() + mealLower.slice(1)} reset to unrecorded.`
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
