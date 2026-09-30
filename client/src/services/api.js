/**
 * client/src/services/api.js
 * 
 * Central API communication layer connecting React to Express REST API.
 * Uses relative `/api` paths proxied by Vite in dev and served by Express in prod.
 */

const BASE_URL = '/api';

/**
 * Format Date object to YYYY-MM-DD using local calendar (never UTC).
 */
export function formatLocalDateString(dateObj) {
  const d = dateObj || new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns today's local date string.
 */
export function getTodayString() {
  return formatLocalDateString(new Date());
}

/**
 * Friendly readable date label (e.g., "29 September 2026")
 */
export function formatDisplayDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d, 12, 0, 0);
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

/**
 * Friendly day of week (e.g., "Monday")
 */
export function formatDayOfWeek(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d, 12, 0, 0);
  return date.toLocaleDateString('en-GB', { weekday: 'long' });
}

/**
 * Friendly time formatter (e.g. 08:30 -> 08:30 AM)
 */
export function formatDisplayTime(timeStr) {
  if (!timeStr) return '';
  // If already formatted with AM/PM
  if (/am|pm/i.test(timeStr)) return timeStr;
  
  const [hStr, mStr] = timeStr.split(':');
  let hours = parseInt(hStr, 10);
  const minutes = mStr || '00';
  const period = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return `${String(hours).padStart(2, '0')}:${minutes} ${period}`;
}

/**
 * Generic fetch wrapper with error handling.
 */
async function request(endpoint, options = {}) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...options.headers
    },
    ...options
  });

  let data;
  try {
    data = await res.json();
  } catch (err) {
    throw new Error('Unable to communicate with the server. Please check your connection.');
  }

  if (!res.ok) {
    throw new Error(data?.error || `Request failed with status ${res.status}`);
  }

  return data;
}

/**
 * Fetch complete meal record for a specific date.
 */
export async function getFoodRecord(dateStr) {
  return request(`/food/${dateStr}`);
}

/**
 * Save or update a single meal (isolated).
 */
export async function saveMealRecord(dateStr, mealName, { status, time, details }) {
  return request(`/food/${dateStr}/${mealName}`, {
    method: 'PUT',
    body: JSON.stringify({ status, time, details })
  });
}

/**
 * Reset a meal back to unrecorded (NULL).
 */
export async function resetMealRecord(dateStr, mealName) {
  return request(`/food/${dateStr}/${mealName}`, {
    method: 'DELETE'
  });
}

/**
 * Fetch report summary for weekly or monthly view.
 */
export async function getReportSummary(type, dateStr) {
  return request(`/reports/summary?type=${type}&date=${dateStr}`);
}
