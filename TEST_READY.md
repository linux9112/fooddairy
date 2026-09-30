# Test Suite Readiness Report (TEST_READY.md)

**Project**: Food Diary Web Application  
**Test Track**: E2E Testing Architecture & Test Automation  
**Date**: 2026-09-30  
**Test Framework**: Zero-Dependency Native Node.js Test Runner (`node:test`, `node:assert/strict`, Native `fetch`)  
**Status**: **READY FOR EXECUTION**

---

## 1. Test Suite Summary

The Food Diary test architecture implements a comprehensive 4-Tier opaque-box testing methodology adhering strictly to `ORIGINAL_REQUEST.md` and `PROJECT.md`.

| Test Suite / Script | Location | Tiers / Focus | Test Count | Status |
|---|---|---|---|---|
| **Acceptance Verifier** | `tests/verify_api.js` | Milestone Acceptance Criteria | 4 Core Criteria / 9 Steps | **READY** |
| **Tier 1: Feature Coverage** | `tests/e2e/tier1_features.test.js` | Happy path & API contracts (>=5 per feature) | 35 Tests | **READY** |
| **Tier 2: Boundary & Corner Cases** | `tests/e2e/tier2_boundaries.test.js` | Edge cases, leap years, midnight, injection | 35 Tests | **READY** |
| **Tier 3: Cross-Feature Combinations**| `tests/e2e/tier3_combinations.test.js`| Pairwise meal transitions & report syncing | 10 Tests | **READY** |
| **Tier 4: Real-World Scenarios** | `tests/e2e/tier4_scenarios.test.js` | Full user daily lifecycles & backfills | 6 Tests | **READY** |
| **Total Test Suite** | `tests/` | **All 4 Tiers + Acceptance Verifier** | **86 Tests + Verifier** | **READY** |

---

## 2. Test Execution Instructions

### A. Standalone Acceptance Criteria Verification
Run the standalone verification script to test all core criteria (Breakfast yes -> Lunch no isolation -> Dinner reset to NULL -> Weekly & Monthly aggregations with NULL vs NO preservation):
```bash
node tests/verify_api.js
```
*Custom Port / Remote Server:*
```bash
API_URL=http://localhost:5000 node tests/verify_api.js
```

### B. Run Complete 4-Tier Test Suite
Run all 86 automated test cases across Tiers 1–4 using Node's native test runner:
```bash
node --test tests/e2e/*.test.js
```

### C. Run Specific Test Tiers
- **Tier 1 (Feature Coverage — 35 tests)**:
  ```bash
  node --test tests/e2e/tier1_features.test.js
  ```
- **Tier 2 (Boundary & Corner Cases — 35 tests)**:
  ```bash
  node --test tests/e2e/tier2_boundaries.test.js
  ```
- **Tier 3 (Cross-Feature Combinations — 10 tests)**:
  ```bash
  node --test tests/e2e/tier3_combinations.test.js
  ```
- **Tier 4 (Real-World Scenarios — 6 tests)**:
  ```bash
  node --test tests/e2e/tier4_scenarios.test.js
  ```

---

## 3. Test Harness Architecture (`tests/test_helper.js`)

1. **Live Server Auto-Detection**: Connects to `process.env.API_URL || 'http://127.0.0.1:5000'`.
2. **Ephemeral Bootstrapping**: If no server is running on the default port but `server/app.js` is present, `test_helper.js` automatically spawns an ephemeral test listener on a dynamic random port (`port 0`), runs the suite, and terminates cleanly upon completion.
3. **Date Isolation**: Test cases execute on isolated test dates (e.g. `2099-XX-XX` or dynamically zoned calendar dates) with automated `cleanupDate()` hooks to guarantee zero side-effects on real diary entries.
4. **Diagnostic Fallback**: When tests are executed before backend server routes are implemented (e.g. during initial milestone setup), tests report actionable diagnostic notices rather than obscure network crashes.

---

## 4. Acceptance Criteria Verification Checklist

- [x] **Criterion 1**: Can save breakfast as 'yes' with time and details on a new date.
  - *Covered by*: `tests/verify_api.js` (Step 1), `T1-F3-01`, `T3-COMB-01`, `Scenario 1`.
- [x] **Criterion 2**: Can subsequently save lunch as 'no' with details without altering breakfast.
  - *Covered by*: `tests/verify_api.js` (Step 2), `T1-F3-02..03`, `T3-COMB-01`, `Scenario 1`.
- [x] **Criterion 3**: Can reset dinner or breakfast to NULL via DELETE without removing other meal data.
  - *Covered by*: `tests/verify_api.js` (Step 3), `T1-F4-01..03`, `T3-COMB-02`, `Scenario 3`.
- [x] **Criterion 4**: Weekly and Monthly report endpoints correctly aggregate counts and preserve NULL vs NO distinction.
  - *Covered by*: `tests/verify_api.js` (Step 4), `T1-F5-01..05`, `T1-F6-01..05`, `T2-F5-05`, `Scenario 5`.
- [x] **Schema & Boundary Invariants**: Unique date, ternary NULL defaults, leap year calendar math, midnight boundaries, Unicode/emoji preservation, and SQL injection sanitization.
  - *Covered by*: Tier 1 (Feature 1) and Tier 2 (Features 1–7).
