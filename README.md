# 📖 Food Diary Web App

A minimalist, private personal food diary built from scratch with **React + Vite**, **Node.js + Express**, and **MySQL** database persistence.

Designed with a warm paper-diary aesthetic:
- **Background**: `#FAF7F0` (warm cream)
- **Card**: `#FFFDF8` (soft paper)
- **Text**: `#3D342F` (dark warm brown)
- **Muted text**: `#8A7B72` (warm earth)
- **Accent**: `#E9A8B8` (soft dusty rose)
- **Border**: `#E5DDD2` (subtle beige)

---

## 🌟 Key Features

1. **Today Page**:
   - Opens on local date (no UTC timezone shift).
   - Three collapsible meal cards: 🌅 Breakfast, ☀️ Lunch, 🌙 Dinner.
   - Independent saving: Record morning breakfast, afternoon lunch, and dinner at different times without overwriting or requiring all three at once.
   - Natural Hindi/English prompts:
     - **If Ate (YES)**: *"Kitna baje?"* (friendly 12-hour time) & *"Kya khae?"* (food description).
     - **If Skipped (NO)**: *"Kyu nahi khae?"* (reason for skipping).
   - Progress indicator: `1 / 3 recorded`, `2 / 3 recorded`, `3 / 3 recorded ✓`.
   - Subtle edit & reset options: Edit meal in place or reset to unrecorded (`NULL`).

2. **Diary Page**:
   - Elegant reader card view that feels like turning pages in a paper journal.
   - Day-by-day navigation: `‹ [Date] ›` with quick "Today" shortcut.
   - Displays all three meal states accurately:
     - ✓ **Ate**: Formatted time & details.
     - ✕ **Didn't eat**: Reason for skipping.
     - — **Not recorded**: Unlogged slot (never counted as skipped).
   - `[ Edit Day ]` button opens the selected date in the meal editor.
   - Clean empty state: *"No food record for this day."* with `[ Record This Day ]` without prematurely creating blank rows in the database.

3. **Reports Page**:
   - **Weekly Report**: Monday to Sunday breakdown.
   - **Monthly Report**: 1st to last day of the calendar month.
   - Distinct counts & clean horizontal progress bars for **Ate**, **Skipped**, and **Not Recorded**.
   - Important rule strictly enforced: *Unrecorded meals (`NULL`) are never counted as skipped (`NO`)*.

---

## 🛠 Tech Stack

- **Frontend**: React 18, Vite, Lucide Icons, pure custom CSS.
- **Backend**: Node.js, Express, `mysql2/promise` with prepared statements, `dotenv`, `cors`.
- **Database**: MySQL (`food_records` table).
  - *Resilient Fallback*: Integrated Node 24 native SQLite engine for zero-dependency local development and CI testing.

---

## 🚀 Quick Start

### 1. Database Setup

The database schema is defined in `database/schema.sql`.

To automatically create the table in MySQL or initialize the database, run:
```bash
npm run db:setup
```

### 2. Environment Variables (.env)

Database credentials and server port are configured in `.env` (a template is provided in `.env.example`):

```env
PORT=5000
NODE_ENV=development

# MySQL Credentials (cPanel / Hostinger)
DB_HOST=localhost
DB_PORT=3306
DB_NAME=u199400152_fooddairy
DB_USER=u199400152_fooddairy
DB_PASSWORD=#Rajarani1

# Driver options: 'mysql' (default) or 'sqlite' (local embedded file)
DB_DRIVER=mysql
```

> **Security Note**: `.env` is included in `.gitignore` and never committed to source control.

### 3. Run in Development Mode

Run backend and Vite frontend with hot-reload concurrently:
```bash
npm run dev
```
- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:5000`

### 4. Build and Run in Production

```bash
# Build React frontend
npm run build

# Start Express server (serves API + built frontend)
npm start
```
Open `http://localhost:5000` in your browser.

---

## 🧪 Automated Testing & Verification

To run the complete automated API acceptance verification:
```bash
npm test
```

To run unit and edge case suites:
```bash
npm run test:unit
```

All 7 core feature tiers and acceptance criteria verify:
- ✅ Independent meal upserts on a new date.
- ✅ Preserving sister meals without accidental overwrites.
- ✅ Meal resets via DELETE preserving remaining day records.
- ✅ Weekly and Monthly reports keeping `NULL` vs `NO` strictly separated.
- ✅ Protection against SQL injection via prepared statements.

---

## 📡 REST API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/food/:date` | Get complete meal record for YYYY-MM-DD |
| `PUT` | `/api/food/:date/:meal` | Upsert single meal (`breakfast`, `lunch`, `dinner`) |
| `DELETE` | `/api/food/:date/:meal` | Reset a meal to unrecorded (`NULL`) |
| `GET` | `/api/reports/summary?type=weekly&date=YYYY-MM-DD` | Get weekly Monday-Sunday breakdown |
| `GET` | `/api/reports/summary?type=monthly&date=YYYY-MM-DD` | Get monthly 1st-to-last day breakdown |
| `GET` | `/api/health` | Health check endpoint |
