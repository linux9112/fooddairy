# Project: Food Diary Web Application

## Architecture
A full-stack, responsive, minimalist personal food logging web application structured into a clear separation of concerns:
- **Client (`client/`)**: Single-Page Application (SPA) built with React 18 / 19 and Vite. Uses custom CSS variables & Tailwind utility tokens to deliver a bespoke warm linen/cream personal diary aesthetic. Features three primary views: Today (`/today`), Diary (`/diary`), and Reports (`/reports`).
- **Server (`server/`)**: Modular Node.js + Express REST API service providing JSON endpoints mounted at `/api`. Implements strict parameter validation, prepared SQL statements, date sanitization with local calendar arithmetic, and clean error formatting without stack traces.
- **Database & Persistence (`database/`)**: Idempotent MySQL schema (`database/schema.sql`) and setup script (`database/setup.js`). The connection layer (`server/db.js`) uses `mysql2/promise` with environment variables for Hostinger cPanel MySQL (`u199400152_fooddairy`), paired with an automated zero-dependency local SQLite driver fallback (`node:sqlite` in Node 24) when remote MySQL is offline or firewalled.
- **Tests (`tests/`)**: Independent opaque-box test suite covering Tiers 1-4 (unit, API integration, schema validation, scenario testing) and automated verification script (`tests/verify_api.js`).

Data flow:
`User Interaction (React UI) -> API Service (`client/src/services/api.js`) -> Express Router (`/api/*`) -> Validation Middleware -> Controller/Model -> db.js (MySQL/SQLite Pool) -> Database`

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | MySQL Schema DDL | Idempotent `food_records` table with unique date & ternary meal columns | M1 | ORIGINAL_REQUEST §R1 |
| 2 | DB Setup & Migration Runner | Node script `database/setup.js` running DDL cleanly | M1 | ORIGINAL_REQUEST §R1 |
| 3 | Ternary Meal State Representation | Explicit `NULL` (unrecorded), `'yes'` (ate), `'no'` (skipped) with invariant rules | M1 | ORIGINAL_REQUEST §R1 |
| 4 | Connection Pool & Resilient Fallback | `mysql2` pool with `.env` credentials & automatic zero-dependency `node:sqlite` fallback | M1 | ORIGINAL_REQUEST §R1 & survey |
| 5 | Environment Configuration & Security | `.env`, `.env.example`, `.gitignore` ensuring credentials are never committed | M1 | ORIGINAL_REQUEST §R1 |
| 6 | Get Day Meal Record Endpoint | `GET /api/food/:date` returning normalized meal states or 404/null representation | M2 | ORIGINAL_REQUEST §R2 |
| 7 | Single Meal Upsert Endpoint | `PUT /api/food/:date/:meal` updating only target meal, preserving other two | M2 | ORIGINAL_REQUEST §R2 |
| 8 | Single Meal Reset/Delete Endpoint | `DELETE /api/food/:date/:meal` resetting target meal fields to NULL | M2 | ORIGINAL_REQUEST §R2 |
| 9 | Strict Validation Middleware | Validates date format `YYYY-MM-DD`, meal type, time format, and required details | M2 | ORIGINAL_REQUEST §R2 |
| 10 | Weekly Reports Endpoint | `GET /api/reports/summary?type=weekly&date=YYYY-MM-DD` aggregating Mon-Sun with unrecorded math | M2 | ORIGINAL_REQUEST §R2 |
| 11 | Monthly Reports Endpoint | `GET /api/reports/summary?type=monthly&date=YYYY-MM-DD` aggregating 1st-end of month | M2 | ORIGINAL_REQUEST §R2 |
| 12 | Zero Timezone Drift Engine | Calendar date math avoiding UTC offset shift across dates and week boundaries | M2 | ORIGINAL_REQUEST §R2 |
| 13 | Design Tokens & Minimalist Palette | Cream linen `#FAF7F0`, Paper `#FFFDF8`, Espresso `#3D342F`, Taupe `#8A7B72`, Rose `#E9A8B8`, Oat `#E5DDD2` | M3 | ORIGINAL_REQUEST §R6 |
| 14 | Responsive App Shell & Navigation | Centered 700-850px container, mobile-first touch targets (>=44px), header tabs | M3 | ORIGINAL_REQUEST §R6 |
| 15 | Toast Feedback & Error Notice | Graceful notification toasts without raw database error dumps or stack traces | M3 | ORIGINAL_REQUEST §R6 |
| 16 | Client API Integration Service | Centralized fetch service with error handling and date formatting | M3 | ORIGINAL_REQUEST §R6 |
| 17 | Today Page Local Date Header | Displays friendly current local date (e.g. Wednesday, Sep 30) | M4 | ORIGINAL_REQUEST §R3 |
| 18 | Progress Counter ("X / 3 recorded") | Dynamic counter reflecting count of recorded non-null meals (0-3) | M4 | ORIGINAL_REQUEST §R3 |
| 19 | Three Meal Cards (Collapsed State) | 🌅 Breakfast, ☀️ Lunch, 🌙 Dinner cards with expand/collapse chevron | M4 | ORIGINAL_REQUEST §R3 |
| 20 | "Did you eat?" Question & Yes/No Toggle | Interactive button selection for Ate vs Skipped | M4 | ORIGINAL_REQUEST §R3 |
| 21 | Ate Flow Prompts | "Kitna baje?" friendly time picker and "Kya khae?" text input | M4 | ORIGINAL_REQUEST §R3 |
| 22 | Skipped Flow Prompt | "Kyu nahi khae?" reason text input (clears time to NULL) | M4 | ORIGINAL_REQUEST §R3 |
| 23 | Independent Saving & Editing | Save or edit each meal independently without requiring other meals | M4 | ORIGINAL_REQUEST §R3 |
| 24 | Saved Meal Summary Presentation | Soft positive styling for Ate, soft muted pink/red for Skipped, and [ Edit ] button | M4 | ORIGINAL_REQUEST §R3 |
| 25 | Reset Meal Control | Optional reset to clear recorded meal back to unrecorded (`NULL`) | M4 | ORIGINAL_REQUEST §R3 |
| 26 | Diary Reader View Header & Navigator | `‹ [Date] ›` day-by-day stepping with date picker and "Today" quick jump | M5 | ORIGINAL_REQUEST §R4 |
| 27 | Diary Three Meal Display Cards | Elegant cream paper cards rendering Ate (time + food), Skipped (reason), or Unrecorded | M5 | ORIGINAL_REQUEST §R4 |
| 28 | Unrecorded State Badge | Subtle muted indicator `— Not recorded —` for missing meals | M5 | ORIGINAL_REQUEST §R4 |
| 29 | Diary Empty State Display | Friendly message with `[ Record This Day ]` without prematurely creating blank DB rows | M5 | ORIGINAL_REQUEST §R4 |
| 30 | Past Date Edit Day Navigation | `[ Edit Day ]` button jumping to Today/Editor for the selected date | M5 | ORIGINAL_REQUEST §R4 |
| 31 | Reports Weekly & Monthly Tabs | Toggle for Weekly (Monday-Sunday) and Monthly (1st to last day) | M6 | ORIGINAL_REQUEST §R5 |
| 32 | Reports Date Navigator | Minimal navigation `‹ Previous Week/Month`, `Current`, `Next ›` | M6 | ORIGINAL_REQUEST §R5 |
| 33 | Horizontal Stacked Progress Bars | Visual comparison of Ate vs Skipped vs Not Recorded for Breakfast, Lunch, Dinner | M6 | ORIGINAL_REQUEST §R5 |
| 34 | Summary Metrics Dashboard | Total meal opportunities, total eaten, total skipped, total unrecorded & percentages | M6 | ORIGINAL_REQUEST §R5 |
| 35 | E2E Test Suite & Test Runner | Requirement-driven automated tests (Tiers 1-4) with pass/fail exit code | E2E_TRACK | ORIGINAL_REQUEST §Acceptance |
| 36 | Automated API Verification Script | Standalone script `tests/verify_api.js` testing upsert isolation, reset, & aggregation | E2E_TRACK | ORIGINAL_REQUEST §Acceptance |
| 37 | Build & Production Checks | Clean `npm run build` and zero runtime crash validation | M7 | ORIGINAL_REQUEST §Acceptance |
| 38 | Adversarial Coverage Hardening | White-box stress testing, boundary condition verification (Tier 5) | M7 | Project Orchestrator Pattern |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| E2E | E2E Testing Track | Design test infra (`TEST_INFRA.md`), create test suites (Tiers 1-4), verification script (`tests/verify_api.js`), publish `TEST_READY.md` | none | IN_PROGRESS |
| M1 | Database Architecture & Persistence (R1) | `database/schema.sql`, `database/setup.js`, `server/db.js`, `.env`, `.env.example`, `.gitignore` | none | IN_PROGRESS |
| M2 | RESTful Backend API (R2) | Express app, routes (`/api/food/:date`, `/api/food/:date/:meal`, `/api/reports/summary`), validation, error handling | M1 | PLANNED |
| M3 | Frontend Core & Aesthetic Shell (R6) | Vite + React setup, Tailwind/CSS design tokens, responsive layout, App shell, nav header, toast alerts, API service | none | PLANNED |
| M4 | Today Page & Interactive Meal Recording (R3) | Today view, progress counter, 3 meal cards, Yes/No flows, prompt inputs, independent saving | M2, M3 | PLANNED |
| M5 | Minimalist Diary View with Date Navigation (R4) | Diary page, day navigator, 3 meal display cards, empty state, `[ Edit Day ]` navigation | M2, M3 | PLANNED |
| M6 | Visual Reports (R5) | Reports page, weekly/monthly tabs, date navigation, stacked progress bars, metrics cards | M2, M3 | PLANNED |
| M7 | Final Verification & Hardening | 100% pass of E2E test suite (Tiers 1-4), Tier 5 adversarial stress testing, production build check | M4, M5, M6, E2E | PLANNED |

## Interface Contracts

### Backend API ↔ Database Layer (`server/db.js`)
- `query(sql, params)` -> Promise resolving to `[rows, fields]` (compatible with `mysql2` and `node:sqlite` adapter).
- Data types:
  - `record_date`: String in `YYYY-MM-DD` format.
  - `_status`: `'yes' | 'no' | null`.
  - `_time`: `'HH:MM:SS' | 'HH:MM' | null`.
  - `_details`: `string | null`.

### Frontend ↔ RESTful API Endpoints (`server/routes/`)
1. **GET `/api/food/:date`**:
   - Parameter: `:date` matching `/^\d{4}-\d{2}-\d{2}$/`.
   - Response 200:
     ```json
     {
       "date": "2026-09-30",
       "meals": {
         "breakfast": { "status": "yes" | "no" | null, "time": string | null, "details": string | null },
         "lunch": { "status": "yes" | "no" | null, "time": string | null, "details": string | null },
         "dinner": { "status": "yes" | "no" | null, "time": string | null, "details": string | null }
       },
       "recordedCount": 0 | 1 | 2 | 3
     }
     ```
2. **PUT `/api/food/:date/:meal`**:
   - Parameters: `:date` (`YYYY-MM-DD`), `:meal` (`breakfast` | `lunch` | `dinner`).
   - Request Body:
     - If `status === 'yes'`: `{ "status": "yes", "time": "08:30 AM" | "08:30", "details": "Oatmeal and berries" }`
     - If `status === 'no'`: `{ "status": "no", "details": "Not hungry" }`
   - Response 200:
     ```json
     {
       "success": true,
       "date": "2026-09-30",
       "meal": "breakfast",
       "record": { "status": "yes", "time": "08:30:00", "details": "Oatmeal and berries" }
     }
     ```
   - Response 400: `{ "error": "BAD_REQUEST", "message": "Reason is required when skipping a meal" }`
3. **DELETE `/api/food/:date/:meal`**:
   - Parameters: `:date`, `:meal`.
   - Response 200: `{ "success": true, "date": "2026-09-30", "meal": "breakfast", "message": "Meal reset to unrecorded" }`
4. **GET `/api/reports/summary?type=weekly|monthly&date=YYYY-MM-DD`**:
   - Query Parameters: `type` (`weekly` | `monthly`), `date` (`YYYY-MM-DD`).
   - Response 200:
     ```json
     {
       "type": "weekly",
       "startDate": "2026-09-28",
       "endDate": "2026-10-04",
       "totalDays": 7,
       "totalOpportunities": 21,
       "summary": {
         "ate": 14,
         "skipped": 3,
         "unrecorded": 4,
         "atePercent": 66.7,
         "skippedPercent": 14.3,
         "unrecordedPercent": 19.0
       },
       "byMeal": {
         "breakfast": { "ate": 5, "skipped": 1, "unrecorded": 1 },
         "lunch": { "ate": 4, "skipped": 2, "unrecorded": 1 },
         "dinner": { "ate": 5, "skipped": 0, "unrecorded": 2 }
       }
     }
     ```

## Code Layout
```
d:\My projects\food dairy nodejs\
├── .agents/                    # Agent orchestration metadata (DO NOT place code here)
├── .env                        # Local environment credentials (gitignored)
├── .env.example                # Example configuration template
├── .gitignore                  # Git ignore rules (.env, node_modules, dist, sqlite)
├── package.json                # Root package with monorepo/orchestration scripts
├── database/                   # Database scripts and migrations
│   ├── schema.sql              # Idempotent MySQL DDL
│   ├── setup.js                # Database initialization script
│   └── seed.js                 # Sample seed data for visual testing
├── server/                     # Backend Node.js & Express REST API
│   ├── package.json            # Backend package configuration
│   ├── index.js                # Server entry point
│   ├── app.js                  # Express app setup & middleware
│   ├── db.js                   # mysql2 connection pool with sqlite fallback
│   ├── routes/
│   │   ├── food.js             # /api/food routes
│   │   └── reports.js          # /api/reports routes
│   ├── controllers/
│   │   ├── foodController.js   # Food endpoints business logic
│   │   └── reportsController.js# Reports aggregation logic
│   └── utils/
│       ├── dateUtils.js        # Timezone-safe calendar math & validation
│       └── validator.js        # Input validation rules
├── client/                     # Frontend React + Vite application
│   ├── package.json            # Frontend package configuration
│   ├── vite.config.js          # Vite configuration
│   ├── index.html              # HTML entry point with fonts & meta
│   ├── tailwind.config.js      # Tailwind configuration with palette tokens
│   └── src/
│       ├── main.jsx            # React root mount
│       ├── App.jsx             # Main router & app shell
│       ├── index.css           # Global typography & palette CSS variables
│       ├── services/
│       │   └── api.js          # Centralized API fetcher
│       ├── components/
│       │   ├── Header.jsx      # Navigation bar & brand title
│       │   ├── MealCard.jsx    # Expandable meal recording card
│       │   ├── TimePicker.jsx  # 12-hour friendly time selector
│       │   ├── Toast.jsx       # Floating notification alert
│       │   ├── ProgressBar.jsx # Stacked horizontal progress bar
│       │   └── DateNav.jsx     # Date stepper with calendar jump
│       └── views/
│           ├── TodayView.jsx   # Today meal logging page
│           ├── DiaryView.jsx   # Day-by-day historical reader
│           └── ReportsView.jsx # Weekly & monthly visual reports
└── tests/                      # Verification and test suites
    ├── verify_api.js           # Automated verification script per acceptance criteria
    ├── unit/                   # Unit tests (validators, date math)
    └── e2e/                    # Opaque-box E2E test suites (Tiers 1-4)
```
