/**
 * server/utils/dateUtils.js
 * 
 * Robust date and time utilities for Food Diary.
 * Enforces local date formatting (YYYY-MM-DD) avoiding UTC conversion shifts,
 * and handles time formatting between 24-hour HH:mm:ss and friendly 12-hour hh:mm A.
 */

/**
 * Validates whether a string is a valid YYYY-MM-DD date.
 */
function isValidDateString(dateStr) {
  if (typeof dateStr !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (m < 1 || m > 12) return false;
  const daysInMonth = new Date(y, m, 0).getDate();
  return d >= 1 && d <= daysInMonth;
}

/**
 * Formats a Date object or components to YYYY-MM-DD using local calendar values.
 */
function formatLocalDate(year, month, day) {
  const y = String(year).padStart(4, '0');
  const m = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Returns today's date in local YYYY-MM-DD format.
 */
function getTodayLocalDate() {
  const now = new Date();
  return formatLocalDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/**
 * Computes Monday-to-Sunday boundaries for a given date string (YYYY-MM-DD).
 */
function getWeekRange(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  // Construct date in local noon to avoid midnight daylight savings boundary issues
  const current = new Date(y, m - 1, d, 12, 0, 0);
  
  // getDay(): 0 is Sunday, 1 is Monday, ..., 6 is Saturday
  const dayOfWeek = current.getDay();
  // We want Monday as start (offset 0), Sunday as end (offset 6)
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  
  const monday = new Date(current);
  monday.setDate(current.getDate() + mondayOffset);
  
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const startDate = formatLocalDate(monday.getFullYear(), monday.getMonth() + 1, monday.getDate());
  const endDate = formatLocalDate(sunday.getFullYear(), sunday.getMonth() + 1, sunday.getDate());

  return { startDate, endDate, totalDays: 7 };
}

/**
 * Computes 1st to last day boundaries for a given date string (YYYY-MM-DD).
 */
function getMonthRange(dateStr) {
  const [y, m] = dateStr.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  
  const startDate = formatLocalDate(y, m, 1);
  const endDate = formatLocalDate(y, m, daysInMonth);

  return { startDate, endDate, totalDays: daysInMonth };
}

/**
 * Normalizes user-supplied time string (e.g. "08:30", "8:30 AM", "14:45", "08:30 PM")
 * into MySQL TIME format "HH:mm:ss" or "HH:mm".
 */
function normalizeTimeTo24h(timeInput) {
  if (!timeInput) return null;
  const str = String(timeInput).trim();
  
  // Check for 12-hour format with AM/PM (e.g. "08:30 AM", "8:30 pm", "12:15 PM")
  const match12 = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (match12) {
    let hours = parseInt(match12[1], 10);
    const minutes = match12[2];
    const seconds = match12[3] || '00';
    const period = match12[4].toUpperCase();

    if (hours < 1 || hours > 12) return null;
    if (period === 'PM' && hours < 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;

    return `${String(hours).padStart(2, '0')}:${minutes}:${seconds}`;
  }

  // Check for 24-hour format (e.g. "08:30", "14:45:00")
  const match24 = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (match24) {
    const hours = parseInt(match24[1], 10);
    const minutes = parseInt(match24[2], 10);
    const seconds = match24[3] ? parseInt(match24[3], 10) : 0;

    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) {
      return null;
    }

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return null;
}

/**
 * Formats a 24-hour time or MySQL TIME string ("08:30:00") into friendly 12-hour format:
 * "08:30 AM", "01:45 PM"
 */
function formatTime12h(timeStr) {
  if (!timeStr) return null;
  const normalized = normalizeTimeTo24h(timeStr);
  if (!normalized) return timeStr;

  const [hStr, mStr] = normalized.split(':');
  let hours = parseInt(hStr, 10);
  const minutes = mStr;
  const period = hours >= 12 ? 'PM' : 'AM';

  hours = hours % 12;
  if (hours === 0) hours = 12;

  return `${String(hours).padStart(2, '0')}:${minutes} ${period}`;
}

module.exports = {
  isValidDateString,
  formatLocalDate,
  getTodayLocalDate,
  getWeekRange,
  getMonthRange,
  normalizeTimeTo24h,
  formatTime12h
};
