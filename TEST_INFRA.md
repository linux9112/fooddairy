# Food Diary — Test Infrastructure & 4-Tier Test Specification (TEST_INFRA.md)

## 1. Overview & Testing Philosophy

This document defines the comprehensive test infrastructure, methodology, and test catalog for the **Food Diary** web application. 

### Testing Principles
1. **Opaque-Box Testing**: Tests interact strictly through external contracts (REST HTTP endpoints `/api/food/*` and `/api/reports/*`, and database schema DDL contracts) without asserting on internal implementation details.
2. **Explicit Output Derivation**: Every expected outcome is directly derived from authoritative specifications in `ORIGINAL_REQUEST.md` and `PROJECT.md`.
3. **Zero-Dependency Native Execution**: The test suite runs on Node.js 24 using native `node:test` and `node:assert/strict` with native `fetch`, eliminating flaky external test dependencies.
4. **Resilient Ephemeral & Live Harnessing**: Tests can run against a live running backend server (e.g. `http://localhost:5000` or `API_URL`) or automatically spin up an ephemeral test instance with an isolated database/memory store.
5. **Strict Isolation & Idempotence**: Test runs utilize uniquely zoned calendar dates (e.g., in future years `2099-XX-XX` or dynamically randomized test dates) and perform deterministic teardown, ensuring test independence.

---

## 2. Test Architecture & Directory Layout

```
tests/
├── verify_api.js                 # Standalone Acceptance Criteria verification script
├── test_helper.js                # Common harness: HTTP client, server launcher, date helpers, assertions
└── e2e/
    ├── tier1_features.test.js    # Tier 1: Feature Coverage (>=5 test cases per feature)
    ├── tier2_boundaries.test.js  # Tier 2: Boundary & Corner Cases (>=5 test cases per feature)
    ├── tier3_combinations.test.js# Tier 3: Cross-Feature Combinations & State Transitions
    └── tier4_scenarios.test.js   # Tier 4: Real-World Application Scenarios
```

### Execution Commands
- **Acceptance Verification**: `node tests/verify_api.js`
- **Complete Test Suite**: `node --test tests/e2e/*.test.js`
- **Tier 1 Only**: `node --test tests/e2e/tier1_features.test.js`
- **Tier 2 Only**: `node --test tests/e2e/tier2_boundaries.test.js`
- **Tier 3 Only**: `node --test tests/e2e/tier3_combinations.test.js`
- **Tier 4 Only**: `node --test tests/e2e/tier4_scenarios.test.js`

---

## 3. The 4-Tier Testing Methodology

The test suite is structured into four progressive tiers:

```
┌───────────────────────────────────────────────────────────┐
│        Tier 4: Real-World Application Scenarios           │
│   (Multi-day diary life, backfills, habit analytics)      │
├───────────────────────────────────────────────────────────┤
│        Tier 3: Cross-Feature Combinations                 │
│   (Pairwise meal interactions, report state transitions)  │
├───────────────────────────────────────────────────────────┤
│        Tier 2: Boundary & Corner Cases                    │
│   (>=5 per feature: leap years, midnight, special chars) │
├───────────────────────────────────────────────────────────┤
│        Tier 1: Feature Coverage                           │
│   (>=5 per feature: happy path, basic status, contracts)  │
└───────────────────────────────────────────────────────────┘
```

---

## 4. Tier 1: Feature Coverage (>= 5 Tests Per Feature)

### Feature 1: Database Schema & Ternary Meal State Model (MySQL/SQLite)
*Contract*: `record_date` DATE UNIQUE; `_status` ENUM('yes', 'no') NULL; `_time` TIME NULL; `_details` TEXT NULL. `NULL` explicitly means unrecorded; `'no'` means skipped; `'yes'` means eaten.

| Test ID | Test Case | Target / Input | Expected Output | Derivation Source |
|---|---|---|---|---|
| T1-F1-01 | Schema columns existence & types | DDL inspection / Table metadata query | `record_date`, `breakfast_status`, `breakfast_time`, `breakfast_details`, `lunch_*`, `dinner_*`, `created_at`, `updated_at` exist with exact types | R1 §20-21 |
| T1-F1-02 | Unique constraint on `record_date` | Attempt duplicate row insertion on same date | Database rejects duplicate insert with unique violation code | R1 §20-21 |
| T1-F1-03 | Ternary state `NULL` default | Insert row specifying only `record_date` | All `_status`, `_time`, `_details` columns default to `NULL` | R1 §20-21 |
| T1-F1-04 | Ternary state `'yes'` validation | Row with status `'yes'` | Persists `'yes'`, valid time string, non-empty details | R1 §20-21 |
| T1-F1-05 | Ternary state `'no'` with NULL time | Row with status `'no'` | Persists `'no'`, `_time` is NULL, `_details` contains reason | R1 §20-21 |

### Feature 2: Day Meal Record Retrieval (`GET /api/food/:date`)
*Contract*: Returns 200 with `{ date, meals: { breakfast, lunch, dinner }, recordedCount }` where each meal has `{ status, time, details }`. If no records exist, returns 200 with all meals `NULL` and `recordedCount: 0` (or 404 cleanly).

| Test ID | Test Case | Target / Input | Expected Output | Derivation Source |
|---|---|---|---|---|
| T1-F2-01 | Retrieve unrecorded day | `GET /api/food/2099-01-01` (fresh date) | 200 OK with `recordedCount: 0`, all 3 meal statuses `null` | R2 §25, PROJECT §80-90 |
| T1-F2-02 | Retrieve day with 1 meal eaten | `GET /api/food/2099-01-02` after breakfast saved | 200 OK with `recordedCount: 1`, breakfast `status: 'yes'`, others `null` | R2 §25 |
| T1-F2-03 | Retrieve day with 1 meal skipped | `GET /api/food/2099-01-03` after lunch skipped | 200 OK with `recordedCount: 1`, lunch `status: 'no'`, `time: null`, details present | R2 §25 |
| T1-F2-04 | Retrieve fully recorded day | `GET /api/food/2099-01-04` after all 3 meals saved | 200 OK with `recordedCount: 3`, all meals populated with correct data | R2 §25 |
| T1-F2-05 | Response schema adherence | `GET /api/food/2099-01-05` | Matches JSON schema with top-level keys `date`, `meals`, `recordedCount` | PROJECT §80-90 |

### Feature 3: Single Meal Upsert & Isolation (`PUT /api/food/:date/:meal`)
*Contract*: Updates or creates record for target meal only. Validates status (`yes` requires time & details; `no` requires details and sets time to NULL). Does not alter other meals.

| Test ID | Test Case | Target / Input | Expected Output | Derivation Source |
|---|---|---|---|---|
| T1-F3-01 | Upsert Breakfast as 'yes' | `PUT /api/food/2099-01-10/breakfast` `{ status: "yes", time: "08:30 AM", details: "Poha and tea" }` | 200 OK, `record.status: "yes"`, `record.details: "Poha and tea"`, `record.time` populated | R2 §26 |
| T1-F3-02 | Upsert Lunch as 'no' with reason | `PUT /api/food/2099-01-10/lunch` `{ status: "no", details: "Intermittent fasting" }` | 200 OK, `record.status: "no"`, `record.time: null`, `record.details: "Intermittent fasting"` | R2 §26 |
| T1-F3-03 | Isolation: Lunch update preserves Breakfast | After T1-F3-01 and T1-F3-02, `GET /api/food/2099-01-10` | Breakfast remains intact as 'yes' with original time/details; Dinner remains `null` | R2 §26, Acceptance §65 |
| T1-F3-04 | Upsert Dinner as 'yes' (24hr time) | `PUT /api/food/2099-01-10/dinner` `{ status: "yes", time: "20:45", details: "Roti and dal" }` | 200 OK, dinner saved without affecting breakfast or lunch | R2 §26 |
| T1-F3-05 | Edit existing meal in-place | `PUT /api/food/2099-01-10/breakfast` `{ status: "yes", time: "09:00 AM", details: "Updated oats" }` | 200 OK, breakfast updated to new values, other meals unchanged | R3 §36-37 |

### Feature 4: Single Meal Reset (`DELETE /api/food/:date/:meal`)
*Contract*: Resets target meal (`status`, `time`, `details`) to `NULL`. Does NOT delete other meals in the same day record.

| Test ID | Test Case | Target / Input | Expected Output | Derivation Source |
|---|---|---|---|---|
| T1-F4-01 | Reset Dinner to NULL | `DELETE /api/food/2099-01-10/dinner` | 200 OK `{ success: true, meal: "dinner" }`; dinner is now `null` | R2 §27, Acceptance §66 |
| T1-F4-02 | Isolation: Dinner reset preserves Breakfast & Lunch | `GET /api/food/2099-01-10` following T1-F4-01 | Breakfast ('yes') and Lunch ('no') completely preserved; recordedCount is 2 | R2 §27, Acceptance §66 |
| T1-F4-03 | Reset Breakfast to NULL | `DELETE /api/food/2099-01-10/breakfast` | 200 OK; breakfast fields are reset to NULL; Lunch remains intact | R2 §27, Acceptance §66 |
| T1-F4-04 | Reset already unrecorded meal | `DELETE /api/food/2099-01-10/dinner` when already NULL | 200 OK (idempotent reset) without throwing 500 error | R2 §27 |
| T1-F4-05 | Reset last remaining meal | `DELETE /api/food/2099-01-10/lunch` | 200 OK; day now has 0 recorded meals; GET returns 0 recordedCount | R2 §27 |

### Feature 5: Weekly Reports & Calendar Math (`GET /api/reports/summary?type=weekly&date=YYYY-MM-DD`)
*Contract*: Calculates Monday–Sunday boundaries for the week containing `date`. Total days = 7, total opportunities = 21 (7 * 3). Accurately aggregates ate, skipped, and unrecorded counts.

| Test ID | Test Case | Target / Input | Expected Output | Derivation Source |
|---|---|---|---|---|
| T1-F5-01 | Empty week aggregation | `GET /api/reports/summary?type=weekly&date=2099-02-04` (Wed in empty week) | `totalOpportunities: 21`, `summary: { ate: 0, skipped: 0, unrecorded: 21 }` | R2 §28, PROJECT §114-133 |
| T1-F5-02 | Week date boundary detection (Mon-Sun) | `GET /api/reports/summary?type=weekly&date=2099-02-04` (Wed) | `startDate: "2099-02-02"` (Mon), `endDate: "2099-02-08"` (Sun) | R2 §28 |
| T1-F5-03 | Query on Sunday returns current Mon-Sun | `GET /api/reports/summary?type=weekly&date=2099-02-08` (Sun) | `startDate: "2099-02-02"`, `endDate: "2099-02-08"` | R2 §28 |
| T1-F5-04 | Accurate counting of Ate vs Skipped vs NULL | Seed 3 days with known meals, query week | `ate`, `skipped`, `unrecorded` match exact seed numbers; sum = 21 | R2 §28, Acceptance §67 |
| T1-F5-05 | By-meal breakdown accuracy | Query week summary | `byMeal.breakfast`, `byMeal.lunch`, `byMeal.dinner` sum to 7 opportunities each | PROJECT §128-132 |

### Feature 6: Monthly Reports & Calendar Math (`GET /api/reports/summary?type=monthly&date=YYYY-MM-DD`)
*Contract*: Calculates 1st to last day of month. Total opportunities = days_in_month * 3. Accurately tabulates Ate, Skipped, and Unrecorded.

| Test ID | Test Case | Target / Input | Expected Output | Derivation Source |
|---|---|---|---|---|
| T1-F6-01 | 31-day month boundaries | `GET /api/reports/summary?type=monthly&date=2099-01-15` | `startDate: "2099-01-01"`, `endDate: "2099-01-31"`, `totalDays: 31`, `totalOpportunities: 93` | R2 §28 |
| T1-F6-02 | 30-day month boundaries | `GET /api/reports/summary?type=monthly&date=2099-04-10` | `startDate: "2099-04-01"`, `endDate: "2099-04-30"`, `totalDays: 30`, `totalOpportunities: 90` | R2 §28 |
| T1-F6-03 | Empty month aggregation | `GET /api/reports/summary?type=monthly&date=2099-03-01` (fresh month) | `unrecorded: 93`, `ate: 0`, `skipped: 0`, `unrecordedPercent: 100` | R2 §28 |
| T1-F6-04 | Monthly Ate / Skipped / Unrecorded tally | Seed 10 meals in month, query summary | Counts match seeded entries; unrecorded = totalOpportunities - ate - skipped | R2 §28, Acceptance §67 |
| T1-F6-05 | Monthly percentage calculations | Compare count / totalOpportunities | Percentages formatted to 1 decimal place; atePercent + skippedPercent + unrecordedPercent ~= 100% | PROJECT §120-126 |

### Feature 7: Validation Middleware & Error Formatting
*Contract*: Strict validation on date format (`YYYY-MM-DD`), meal name (`breakfast`, `lunch`, `dinner`), status (`yes`, `no`), required fields. Returns 400 Bad Request with structured JSON `{ error, message }`. Never exposes stack traces or SQL dumps.

| Test ID | Test Case | Target / Input | Expected Output | Derivation Source |
|---|---|---|---|---|
| T1-F7-01 | Invalid date format in GET | `GET /api/food/20-01-2099` | 400 Bad Request, JSON error format, no stack trace | R2 §24-25 |
| T1-F7-02 | Invalid meal name in PUT | `PUT /api/food/2099-01-10/midnight_snack` | 400 Bad Request, message specifying valid meal names | R2 §24, §26 |
| T1-F7-03 | Missing details when status is 'yes' | `PUT /api/food/2099-01-10/breakfast` `{ status: "yes", time: "08:00 AM" }` | 400 Bad Request, message indicates details required | R2 §26 |
| T1-F7-04 | Missing details/reason when status is 'no'| `PUT /api/food/2099-01-10/breakfast` `{ status: "no" }` | 400 Bad Request, message indicates reason required | R2 §26 |
| T1-F7-05 | Invalid report type | `GET /api/reports/summary?type=yearly&date=2099-01-10` | 400 Bad Request, indicates type must be 'weekly' or 'monthly' | R2 §28 |

---

## 5. Tier 2: Boundary & Corner Cases (>= 5 Tests Per Feature)

### Feature 1: Database Schema & Ternary Boundaries
| Test ID | Test Case | Condition / Input | Expected Behavior |
|---|---|---|---|
| T2-F1-01 | Maximum TEXT length in details | 10,000 characters of UTF-8 text in `_details` | Stored and retrieved without truncation or error |
| T2-F1-02 | Multi-byte Unicode & emojis in food description | "🥑 Avocado Toast with ☕ & ₹200 Paneer Bhurji" | Stored and retrieved with exact character fidelity |
| T2-F1-03 | Midnight boundary in TIME column | Time `00:00:00` and `23:59:59` | Handled properly without date rollover |
| T2-F1-04 | Special characters and quotes in reason | Details: `Didn't eat: "mom's cooking" & <alert>test</alert>` | Escaped safely via prepared statements; exact string retrieved |
| T2-F1-05 | Nullable vs Empty String distinction | Details sent as empty or whitespace-only | Rejected by validation or treated as empty without corrupting NULL |

### Feature 2: Day Retrieval Boundaries (`GET /api/food/:date`)
| Test ID | Test Case | Condition / Input | Expected Behavior |
|---|---|---|---|
| T2-F2-01 | Far future date | `GET /api/food/2099-12-31` | 200 OK with unrecorded structure; no crash |
| T2-F2-02 | Leap year February 29 | `GET /api/food/2028-02-29` | Valid calendar date; 200 OK |
| T2-F2-03 | Non-existent leap day in non-leap year | `GET /api/food/2027-02-29` | 400 Bad Request (invalid date) |
| T2-F2-04 | Month boundary transition | `GET /api/food/2026-10-31` vs `GET /api/food/2026-11-01` | Returns respective day records without cross-talk |
| T2-F2-05 | Trailing/leading whitespace in URL | `GET /api/food/%202026-10-15%20` | Handled cleanly (trimmed or 400, never crash) |

### Feature 3: Single Meal Upsert Boundaries (`PUT /api/food/:date/:meal`)
| Test ID | Test Case | Condition / Input | Expected Behavior |
|---|---|---|---|
| T2-F3-01 | Time formats acceptance (12h AM/PM vs 24h) | Time: `"8:30 am"`, `"08:30:00"`, `"23:15"` | Accepted and normalized to standard time format |
| T2-F3-02 | Invalid time string for 'yes' | Time: `"25:00"`, `"abc"`, `"12:61 PM"` | 400 Bad Request with descriptive message |
| T2-F3-03 | Status 'no' ignores supplied time | Status `'no'`, Details: `"Fasting"`, Time: `"09:00 AM"` | 200 OK, but stored time is explicitly forced to `NULL` |
| T2-F3-04 | Huge payload stress test | Payload with 50KB reason string | Accepted or rejected with 413/400 gracefully (no process crash) |
| T2-F3-05 | Extra unknown JSON body fields | Body containing `{ status: "yes", time: "08:00", details: "Egg", extra: "hack" }`| 200 OK, extra fields stripped/ignored safely |

### Feature 4: Single Meal Reset Boundaries (`DELETE /api/food/:date/:meal`)
| Test ID | Test Case | Condition / Input | Expected Behavior |
|---|---|---|---|
| T2-F4-01 | Reset non-existent date | `DELETE /api/food/2099-12-31/breakfast` on unseeded date | 200 OK idempotent (safe no-op, no 500 error) |
| T2-F4-02 | Reset when all other meals are already NULL | Delete last remaining recorded meal | Row updated to all NULLs or remains unrecorded; no orphan state |
| T2-F4-03 | Case insensitivity of meal param | `DELETE /api/food/2099-01-10/BREAKFAST` or `Lunch` | Normalized or 400, consistent with API conventions |
| T2-F4-04 | Rapid successive DELETE calls | Send 3 consecutive DELETE requests on same meal | All return 200 OK; no race condition or crash |
| T2-F4-05 | Reset with unexpected query params | `DELETE /api/food/2099-01-10/breakfast?force=true` | Ignores extraneous query params and executes reset |

### Feature 5: Weekly Reports Boundaries (`GET /api/reports/summary?type=weekly`)
| Test ID | Test Case | Condition / Input | Expected Behavior |
|---|---|---|---|
| T2-F5-01 | Year rollover week (Dec 31 -> Jan 1) | `date=2026-12-31` (Thursday) | Mon = `2026-12-28`, Sun = `2027-01-03`; accurately spans 2 calendar years |
| T2-F5-02 | Leap week (Feb 29 inside week) | `date=2028-02-29` (Tuesday) | Mon = `2028-02-28`, Sun = `2028-03-05`; totalDays is 7, no skipped day |
| T2-F5-03 | Monday exact boundary | `date=2026-09-28` (Monday) | startDate is `2026-09-28`, endDate is `2026-10-04` |
| T2-F5-04 | Sunday exact boundary | `date=2026-10-04` (Sunday) | startDate is `2026-09-28`, endDate is `2026-10-04` |
| T2-F5-05 | Week with all 21 meals recorded (100% ate) | 21 meals recorded as 'yes' | ate: 21, skipped: 0, unrecorded: 0, atePercent: 100.0% |

### Feature 6: Monthly Reports Boundaries (`GET /api/reports/summary?type=monthly`)
| Test ID | Test Case | Condition / Input | Expected Behavior |
|---|---|---|---|
| T2-F6-01 | February non-leap year (28 days) | `date=2027-02-15` | `totalDays: 28`, `totalOpportunities: 84` |
| T2-F6-02 | February leap year (29 days) | `date=2028-02-15` | `totalDays: 29`, `totalOpportunities: 87` |
| T2-F6-03 | 1st day of month query | `date=2026-10-01` | startDate: `2026-10-01`, endDate: `2026-10-31`, totalDays: 31 |
| T2-F6-04 | Last day of month query | `date=2026-09-30` | startDate: `2026-09-01`, endDate: `2026-09-30`, totalDays: 30 |
| T2-F6-05 | Month with all 93 meals unrecorded | Fresh future month (e.g. 2099-07) | unrecorded: 93, unrecordedPercent: 100.0%, ate: 0, skipped: 0 |

### Feature 7: Validation Middleware Boundaries
| Test ID | Test Case | Condition / Input | Expected Behavior |
|---|---|---|---|
| T2-F7-01 | SQL Injection attempt in date parameter | `GET /api/food/2026-01-01' OR '1'='1` | 400 Bad Request (rejected by date regex validator before DB query) |
| T2-F7-02 | SQL Injection attempt in meal parameter | `PUT /api/food/2026-01-01/breakfast;DROP TABLE food_records;` | 400 Bad Request (rejected by meal enum validator) |
| T2-F7-03 | Malformed JSON body in PUT | Raw body `"{ invalid json "` with `application/json` header | 400 Bad Request with clean JSON error, no crash |
| T2-F7-04 | Status value other than 'yes' or 'no' | Body `{ status: "maybe", details: "test" }` | 400 Bad Request (status must be 'yes' or 'no') |
| T2-F7-05 | Missing query parameter `date` in reports | `GET /api/reports/summary?type=weekly` | 400 Bad Request (missing required date parameter) |

---

## 6. Tier 3: Cross-Feature Combinations & State Transitions

Tier 3 validates pairwise feature interactions, sequential CRUD operations, and multi-endpoint data consistency.

```
Initial State: [All 3 Meals NULL]
    │
    ├─► Step 1: PUT Breakfast ('yes') ───────► Breakfast: ATE, Lunch: NULL, Dinner: NULL
    │                                          (Verify isolation & recordedCount = 1)
    │
    ├─► Step 2: PUT Lunch ('no') ────────────► Breakfast: ATE, Lunch: SKIPPED, Dinner: NULL
    │                                          (Verify Breakfast unchanged, recordedCount = 2)
    │
    ├─► Step 3: PUT Dinner ('yes') ──────────► Breakfast: ATE, Lunch: SKIPPED, Dinner: ATE
    │                                          (Verify all 3 distinct, recordedCount = 3)
    │
    ├─► Step 4: DELETE Dinner (Reset) ───────► Breakfast: ATE, Lunch: SKIPPED, Dinner: NULL
    │                                          (Verify Dinner reset to NULL, Lunch/Breakfast intact)
    │
    └─► Step 5: Query Weekly Report ─────────► Week contains exact tally: +1 Ate, +1 Skipped, +19 NULL
                                               (Verify reports engine reflects meal mutations)
```

### Tier 3 Test Matrix

| Test ID | Sequence / Interaction | Validation Check |
|---|---|---|
| T3-COMB-01 | **Sequential Meal Upserts & Read Isolation**: Save breakfast as 'yes' -> save lunch as 'no' -> save dinner as 'yes' -> GET day | Breakfast has time & food details; Lunch has reason and NULL time; Dinner has time & food details; recordedCount = 3 |
| T3-COMB-02 | **Reset & Preservation of Siblings**: Complete day -> DELETE dinner -> GET day | Dinner fields are all NULL; Breakfast and Lunch values remain identical byte-for-byte; recordedCount = 2 |
| T3-COMB-03 | **Inversion of Meal State**: Save meal as 'yes' -> update same meal to 'no' with reason | Meal status becomes 'no'; old time is wiped to NULL; new reason stored |
| T3-COMB-04 | **Reversion of Meal State**: Save meal as 'no' -> update same meal to 'yes' with time & details | Meal status becomes 'yes'; time is restored to new value; new details stored |
| T3-COMB-05 | **Total Day Reset Cycle**: Save all 3 meals -> DELETE breakfast -> DELETE lunch -> DELETE dinner -> GET day | All meals return NULL; recordedCount = 0; no orphaned rows or phantom counts |
| T3-COMB-06 | **Weekly Boundary Interaction**: Record Sunday meal (`2026-10-04`) and Monday meal (`2026-10-05`) | Sunday meal counts in Week 1; Monday meal counts in Week 2; zero spillover across Monday 00:00 boundary |
| T3-COMB-07 | **Monthly Boundary Interaction**: Record Sep 30 meal and Oct 1 meal | Sep 30 appears in September report; Oct 1 appears in October report; zero spillover across month end |
| T3-COMB-08 | **Upsert-Then-Report Consistency**: In a blank week, record 1 Ate, 1 Skipped -> query report | Report shows `ate: 1`, `skipped: 1`, `unrecorded: 19`, `totalOpportunities: 21` |
| T3-COMB-09 | **Reset-Then-Report Consistency**: Reset one Ate meal -> re-query weekly report | `ate` decrements by 1; `unrecorded` increments by 1; `skipped` stays constant |
| T3-COMB-10 | **Concurrent/Rapid Meal Updates**: Issue rapid sequential PUTs to different meals on the same date | All updates succeed without locking conflicts; final GET shows all updates applied |

---

## 7. Tier 4: Real-World Application Scenarios

Tier 4 simulates realistic, end-to-end user journeys through the application lifecycle.

### Scenario 1: A Complete Day in the Life of a User
- **Story**: User wakes up at 8:30 AM, logs breakfast (Poha & Tea). At 2:00 PM, user had a busy meeting and skipped lunch (reason: "Too busy with product launch"). At 8:45 PM, user enjoys dinner with family (Paneer Tikka & Roti).
- **Verification**:
  1. `PUT /breakfast` with `status: 'yes'`, `time: '08:30 AM'`, `details: 'Poha and Ginger Tea'`.
  2. `GET` verifies breakfast is logged, recordedCount = 1.
  3. `PUT /lunch` with `status: 'no'`, `details: 'Too busy with product launch'`.
  4. `GET` verifies lunch is skipped (time is NULL), breakfast unchanged, recordedCount = 2.
  5. `PUT /dinner` with `status: 'yes'`, `time: '08:45 PM'`, `details: 'Paneer Tikka & Roti'`.
  6. `GET` verifies full day is recorded (recordedCount = 3).
  7. Weekly report increments Ate by 2, Skipped by 1, Unrecorded decrements by 3.

### Scenario 2: Change of Mind / Evening Snack Correction
- **Story**: User initially marked dinner as skipped at 7:00 PM because they weren't hungry. Later at 10:30 PM, they ordered pizza with friends and decided to update dinner to eaten.
- **Verification**:
  1. `PUT /dinner` with `status: 'no'`, `details: 'Not feeling hungry'`.
  2. Verify dinner status is 'no' and time is NULL.
  3. `PUT /dinner` with `status: 'yes'`, `time: '10:30 PM'`, `details: 'Late night Margherita Pizza with friends'`.
  4. `GET` verifies status transitioned from 'no' to 'yes', time is populated, details updated.
  5. Weekly report accurately converts 1 Skipped into 1 Ate.

### Scenario 3: Accidental Entry & Reset on Wrong Date
- **Story**: User accidentally logged lunch on tomorrow's date while planning ahead. Realizing the mistake, user resets lunch to unrecorded.
- **Verification**:
  1. `PUT /tomorrow/lunch` with `status: 'yes'`.
  2. Verify tomorrow has 1 recorded meal.
  3. `DELETE /tomorrow/lunch`.
  4. Verify tomorrow's lunch is reset to `NULL` (recordedCount = 0).
  5. Today's meals remain completely untouched.

### Scenario 4: Historical Diary Backfill (Forgot to Log for 3 Days)
- **Story**: User was traveling over the weekend (Friday, Saturday, Sunday) without internet access. On Monday, user navigates back and logs all meals for the past 3 days.
- **Verification**:
  1. Query Friday, Saturday, Sunday — all show 0 recorded meals.
  2. Submit entries for Friday (Breakfast: Ate, Lunch: Ate, Dinner: Ate).
  3. Submit entries for Saturday (Breakfast: Skipped, Lunch: Ate, Dinner: Ate).
  4. Submit entries for Sunday (Breakfast: Ate, Lunch: Skipped, Dinner: Skipped).
  5. Weekly report for that past week recalculates: Ate = 6, Skipped = 3, Unrecorded = 12 (sum = 21).

### Scenario 5: Full 7-Day Habit Analysis
- **Story**: User logs every meal for an entire Monday-Sunday week. 
  - Breakfast: 5 Ate, 2 Skipped, 0 Unrecorded.
  - Lunch: 6 Ate, 0 Skipped, 1 Unrecorded.
  - Dinner: 4 Ate, 1 Skipped, 2 Unrecorded.
  - Total: 15 Ate, 3 Skipped, 3 Unrecorded (sum = 21).
- **Verification**:
  1. Seed all 7 days with the above pattern.
  2. Call `GET /api/reports/summary?type=weekly&date=YYYY-MM-DD`.
  3. Assert `summary.ate == 15`, `summary.skipped == 3`, `summary.unrecorded == 3`.
  4. Assert `summary.atePercent == 71.4%` (15/21), `skippedPercent == 14.3%` (3/21), `unrecordedPercent == 14.3%` (3/21).
  5. Assert `byMeal.breakfast.ate == 5`, `byMeal.lunch.ate == 6`, `byMeal.dinner.ate == 4`.

### Scenario 6: Month-End Leap Year & Calendar Transition
- **Story**: Verify month report transitions smoothly across February in a leap year (2028-02-01 to 2028-02-29, 29 days, 87 opportunities).
- **Verification**:
  1. Record meal on Feb 1, Feb 15, and Feb 29.
  2. Query `GET /api/reports/summary?type=monthly&date=2028-02-15`.
  3. Verify `totalDays == 29`, `totalOpportunities == 87`.
  4. Verify `ate == 3`, `skipped == 0`, `unrecorded == 84`.

---

## 8. Standalone Verification Script (`tests/verify_api.js`)

Per the project Acceptance Criteria, `tests/verify_api.js` serves as a lightweight, zero-dependency, standalone verification tool that directly validates:
1. Saving breakfast as 'yes' with time and details on a new date.
2. Subsequently saving lunch as 'no' with details without altering breakfast.
3. Resetting dinner or breakfast to NULL via DELETE without removing other meal data.
4. Verifying Weekly and Monthly report endpoints correctly aggregate counts and preserve NULL vs NO distinction.

The script exits with code `0` on 100% success or code `1` on failure with clear diagnostics.

---

## 9. Traceability Matrix

| Requirement / Criterion | Source Document | Test Cases Covering |
|---|---|---|
| R1: Schema & Data Types (Date, Ternary columns) | ORIGINAL_REQUEST §20-21 | T1-F1-01..05, T2-F1-01..05 |
| R1: NULL vs 'no' vs 'yes' distinction | ORIGINAL_REQUEST §21 | T1-F1-03..05, T1-F3-02, T3-COMB-01..05 |
| R2: GET /api/food/:date | ORIGINAL_REQUEST §25 | T1-F2-01..05, T2-F2-01..05, T3-COMB-01 |
| R2: PUT /api/food/:date/:meal & Isolation | ORIGINAL_REQUEST §26 | T1-F3-01..05, T2-F3-01..05, T3-COMB-01, verify_api.js |
| R2: DELETE /api/food/:date/:meal (Reset to NULL) | ORIGINAL_REQUEST §27 | T1-F4-01..05, T2-F4-01..05, T3-COMB-02, verify_api.js |
| R2: Weekly Report & Mon-Sun boundaries | ORIGINAL_REQUEST §28 | T1-F5-01..05, T2-F5-01..05, T4-Scenario 5, verify_api.js |
| R2: Monthly Report & 1st-end boundaries | ORIGINAL_REQUEST §28 | T1-F6-01..05, T2-F6-01..05, T4-Scenario 6, verify_api.js |
| R2: Strict validation & error handling | ORIGINAL_REQUEST §24 | T1-F7-01..05, T2-F7-01..05 |
| Acceptance: Breakfast yes -> Lunch no isolation | ORIGINAL_REQUEST §64-65 | T1-F3-03, T3-COMB-01, verify_api.js Step 1 & 2 |
| Acceptance: Reset dinner/breakfast via DELETE | ORIGINAL_REQUEST §66 | T1-F4-01..03, T3-COMB-02, verify_api.js Step 3 |
| Acceptance: Reports aggregate counts & preserve NULL | ORIGINAL_REQUEST §67 | T1-F5-04, T1-F6-04, T4-Scenario 5, verify_api.js Step 4 & 5 |
