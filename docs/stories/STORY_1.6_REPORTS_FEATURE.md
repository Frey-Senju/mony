# Story 1.6 — Reports Feature

**Epic:** 1 — Core Platform
**Story ID:** 1.6
**Status:** Ready for Review
**Estimated:** M (6-8h)
**Created:** 2026-04-20
**Implemented:** 2026-04-23 by @dev Dex

---

## User Story

As a logged-in user,
I want to view a reports page with a monthly summary and category breakdown of my transactions,
so that I can understand my spending patterns and make informed financial decisions.

---

## Acceptance Criteria

- [x] AC1: A `GET /reports/monthly-summary` endpoint returns, for a given `year` and `month` (query params), the authenticated user's total income, total expenses, and net balance for that period. Requires valid JWT.
- [x] AC2: A `GET /reports/category-breakdown` endpoint returns, for a given `year` and `month`, a list of categories with the summed expense amount and percentage of total expenses per category. Requires valid JWT.
- [x] AC3: The `/dashboard/reports` page renders a "Monthly Summary" section displaying income, expenses, and net balance for the selected month, fetched from the backend.
- [x] AC4: The `/dashboard/reports` page renders a "Category Breakdown" section displaying a Recharts PieChart (or DonutChart) with category names, amounts, and percentages for the selected month.
- [x] AC5: A month/year selector control on the reports page allows the user to navigate between months; the charts and summary update accordingly without full page reload.
- [x] AC6: Authenticated requests are enforced on both endpoints: a missing or invalid token returns HTTP 401.
- [x] AC7: When a month has no transactions, the endpoints return valid empty/zero responses (no 500 errors), and the frontend displays an appropriate empty-state message.
- [x] AC8: The reports page is accessible from the existing dashboard navigation (sidebar link or top-nav tab).

---

## Technical Notes

### Backend (`apps/api`)

**New file:** `apps/api/routes/reports.py`

- `GET /reports/monthly-summary?year=2026&month=4`
  - Auth: `get_current_user_from_header` dependency (same pattern as `transactions.py`)
  - Query: filter `transactions` by user accounts, `transaction_date` in month range, not soft-deleted
  - Response:
    ```json
    { "year": 2026, "month": 4, "total_income": 5000.00, "total_expenses": 3200.00, "net_balance": 1800.00 }
    ```

- `GET /reports/category-breakdown?year=2026&month=4`
  - Auth: same
  - Query: JOIN `transactions` → `transaction_categories` → `categories`, filter expense type, group by category
  - Response:
    ```json
    { "year": 2026, "month": 4, "items": [{ "category_id": "...", "category_name": "Food", "total": 800.00, "percentage": 25.0 }] }
    ```

- Register router in `apps/api/main.py` with prefix `/reports`

**Tech-debt note:** Apply `parse_uuid()` helper (pending from Story 1.5c) to UUID parsing in new endpoints when available. For now, use the same inline `str(uuid)` pattern used in `transactions.py`.

### Frontend (`apps/web`)

**New files:**
- `apps/web/app/dashboard/reports/page.tsx` — Page component
- `apps/web/components/reports/MonthlySummaryCard.tsx` — Summary metrics display
- `apps/web/components/reports/CategoryBreakdownChart.tsx` — Recharts PieChart wrapper
- `apps/web/hooks/useReports.ts` — Data fetching hook for both endpoints

**Patterns to reuse from Story 1.5:**
- `SummaryCards` styling (card layout, Tailwind classes, color tokens)
- `useTransactions` fetch pattern (auth header, error handling, loading state)
- Recharts `PieChart` already installed — import directly

**Month selector:** Controlled `<select>` or `<input type="month">` bound to state; triggers re-fetch on change.

**Navigation:** Add "Reports" link to dashboard sidebar/nav (edit existing layout component).

---

## Tasks / Subtasks

### Backend
- [x] B1: Create `apps/api/routes/reports.py` with `monthly-summary` endpoint
- [x] B2: Implement `category-breakdown` endpoint in same file
- [x] B3: Register `/reports` router in `apps/api/main.py`
- [x] B4: Manual smoke test both endpoints with `curl` / Swagger UI — deferred to @qa (requires live stack)

### Frontend
- [x] F1: Create `useReports.ts` hook (fetch monthly-summary + category-breakdown)
- [x] F2: Create `MonthlySummaryCard.tsx` component
- [x] F3: Create `CategoryBreakdownChart.tsx` component (Recharts PieChart)
- [x] F4: Create `/dashboard/reports/page.tsx` composing above components + month selector
- [x] F5: Add "Reports" link to dashboard navigation layout (via new `DashboardNav` component)

### Tests
- [x] T1-T8: Playwright E2E suite authored in `apps/web/e2e/reports.spec.ts` — 8 tests cataloged (`playwright test --list` confirms). Execution requires running API + web + seeded DB; deferred to @qa/CI.
- [x] U1-U3: Unit tests for `useReports` hook + helpers — 11/11 pass (`apps/web/__tests__/useReports.test.ts`).
- [x] Backend unit: 12/12 pass (`apps/api/tests/test_reports.py`) — includes December rollover regression test per @po recommendation #2.

---

## File List

| File | Action | Notes |
|------|--------|-------|
| `apps/api/routes/reports.py` | CREATE | New reports router with `monthly-summary` + `category-breakdown` endpoints; December rollover handled in `month_range` helper. |
| `apps/api/main.py` | MODIFY | Imported and registered `reports_router`. |
| `apps/api/tests/test_reports.py` | CREATE | 12 unit tests: `month_range` edge cases (Dec rollover, leap year, invalid month) + percentage-rounding sanity. |
| `apps/web/app/dashboard/reports/page.tsx` | CREATE | Reports page: `PrivateRoute` wrapper, `<input type="month">` + prev/next buttons, parallel fetch on mount and change. |
| `apps/web/components/reports/MonthlySummaryCard.tsx` | CREATE | Three-card summary (Income, Expenses, Net Balance) with BRL formatting and loading skeleton. Visual tokens reused from `SummaryCards.tsx`. |
| `apps/web/components/reports/CategoryBreakdownChart.tsx` | CREATE | Recharts `PieChart` + colored legend list; empty-state panel mirrors transaction-list pattern. |
| `apps/web/hooks/useReports.ts` | CREATE | Fetch hook using `Promise.all` for parallel summary + breakdown calls (@po rec #3); exports `shiftMonth`, `isCurrentMonth` helpers. |
| `apps/web/components/dashboard/DashboardNav.tsx` | CREATE | [AUTO-DECISION] Top-nav component chosen (not sidebar) — reason: `layout.tsx` was empty with no existing nav structure, so a new top-nav is lower-risk than adding a sidebar shell. Includes `data-testid="nav-reports"` for E2E. |
| `apps/web/app/dashboard/layout.tsx` | MODIFY | Added `<DashboardNav />` above `{children}`. |
| `apps/web/__tests__/useReports.test.ts` | CREATE | 11 Jest tests: `shiftMonth` rollover, `toNumber` coercion, `useReports` U1/U2/U3 (loading/success/error) + no-token no-op. |
| `apps/web/e2e/reports.spec.ts` | CREATE | 8 Playwright tests (T1-T8) covering AC1-AC8 including 401 and empty-state. |

---

## Dev Notes

- **Auth pattern:** Follow `transactions.py` — use `get_current_user_from_header`, inject `db: Session = Depends(get_db)`. No new patterns needed.
- **Date filtering:** Use `and_(Transaction.transaction_date >= start_date, Transaction.transaction_date < end_date)` where `start_date = date(year, month, 1)` and `end_date = first day of next month`.
- **Category fallback:** Transactions with no category entry in `transaction_categories` should appear as "Uncategorized" in the breakdown — use LEFT JOIN.
- **Recharts reuse:** `PieChart` is already imported in `Charts.tsx` (Story 1.5). Import directly from `recharts` in the new component; do not duplicate Chart.tsx logic.
- **Tech debt dependency:** `parse_uuid()` helper is not yet implemented. Use `str(account_id)` pattern from `transactions.py` until Story 1.5c tech-debt is resolved.
- **Currency:** Format amounts as BRL (R$ X.XXX,XX) consistent with existing dashboard.

---

## Testing Section

### E2E (Playwright) — 8 tests

| # | Test | Expectation |
|---|------|-------------|
| T1 | Navigate to `/dashboard/reports` | Page renders without errors |
| T2 | Monthly summary — current month | Income, expenses, net balance values visible |
| T3 | Category breakdown chart | PieChart renders or empty state shown |
| T4 | Month selector change | Data updates without full reload |
| T5 | Unauthenticated access to reports page | Redirected to `/login` |
| T6 | Unauthenticated API call | HTTP 401 response |
| T7 | Month with zero transactions | Empty state message visible, no crash |
| T8 | Navigation link | "Reports" link in dashboard nav navigates correctly |

### Unit Tests

| # | Test | File |
|---|------|------|
| U1 | `useReports` — returns loading state on fetch | `hooks/useReports.test.ts` |
| U2 | `useReports` — returns data on success | `hooks/useReports.test.ts` |
| U3 | `useReports` — returns error on API failure | `hooks/useReports.test.ts` |

---

## Dependencies

| Dependency | Type | Status |
|-----------|------|--------|
| Story 1.4 (Transaction API) | Hard | Done |
| Story 1.5 (Dashboard UI + Recharts) | Hard | Done |
| `parse_uuid()` helper (tech-debt 1.5c) | Soft | Pending — workaround documented above |

---

*Story 1.6 drafted by @sm River — 2026-04-20*

---

## Validation (PO)

**Validated by:** @po Pax — 2026-04-20
**Decision:** GO (Score 10/10)

### Checklist

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | User story format (As a / I want / so that) | PASS | Lines 13-15 — full triplet, user-centric value |
| 2 | AC testable and unambiguous | PASS | 8 ACs; every one observable via HTTP call, UI render, or redirect |
| 3 | Scope appropriate | PASS | M (6-8h), 4 backend + 5 frontend + 8 E2E + 3 unit — within sweet spot |
| 4 | AC traces to epic objective | PASS | Satisfies EPIC-001 AC "Basic reports available (monthly summary, category breakdown)" |
| 5 | Technical Notes identify files/components | PASS | 8 files enumerated with CREATE/MODIFY action in File List; patterns to reuse called out |
| 6 | Tasks/Subtasks actionable | PASS | B1-B4, F1-F5, T1-T8 each map 1:1 to a file or test — no vague verbs |
| 7 | Testing strategy defined | PASS | 8 Playwright E2E + 3 unit (useReports hook); 401 and empty-state covered |
| 8 | Dependencies identified, not blocking | PASS | 1.4/1.5 Done; parse_uuid soft-dep has documented workaround |
| 9 | No conflict with in-flight stories | PASS | 1.5c merged (PR #1); no other stories touch reports/* paths |
| 10 | Definition of Done clear | PASS | AC checkboxes + File List + testing matrix = implicit DoD; all measurable |

### Verification of Technical Claims

- `get_current_user_from_header` exists in `apps/api/utils/auth.py` and is used in `transactions.py` — reuse pattern valid
- `recharts` already present in `apps/web/package.json` and `components/dashboard/Charts.tsx` — no new dependency
- `apps/web/app/dashboard/layout.tsx` exists — nav link integration path confirmed
- `SummaryCards.tsx` exists in `components/dashboard/` — styling reuse path valid

### Recommendations for @dev

1. **Empty-state consistency:** AC7 requires empty-state handling. Use the same empty-state visual pattern as `TransactionList.tsx` (if present) for UX consistency across dashboard pages.
2. **Month boundary bug prevention:** When computing `end_date = first day of next month`, handle December → January year rollover explicitly (`date(year+1, 1, 1)` when `month == 12`). Add an E2E or unit test for a December query.
3. **Category percentage rounding:** Percentages should sum to 100.0 within rounding tolerance. Compute last slice as `100 - sum(previous)` to avoid 99.9% / 100.1% rendering artifacts in the PieChart legend.
4. **Parallel fetching:** In `useReports.ts`, fire `monthly-summary` and `category-breakdown` with `Promise.all` — sequential awaits will double perceived latency on month change.
5. **Nav link placement:** Confirm with design whether "Reports" goes in sidebar or top-nav before editing `layout.tsx`; record the [AUTO-DECISION] in File List notes if proceeding solo.

### Constitutional Check (Article IV — No Invention)

All story content traces to EPIC-001 AC (reports), Story 1.5 patterns (Recharts, SummaryCards), or Story 1.4 patterns (auth, JWT, soft-delete filter). No invented features.

---

## QA Results

**Reviewed by:** @qa Quinn — 2026-04-23
**Branch:** feat/story-1.6-reports | **Commit:** 8c74116
**Gate Decision:** **CONCERNS** — code is sound, E2E execution blocked in this session (see note below).

### Execution Constraint (session-level)

Bash tool execution was blocked by a `.claude/hooks/enforce-git-push-authority.sh` hook parse failure for every attempted command (including non-git commands like `python -m pytest` and `npx playwright test`). Therefore this review is a **static review with unit-test evidence accepted from @dev's implementation report**; the 8 Playwright specs were **NOT executed** by QA. Downgrading from PASS to CONCERNS on this basis alone — the code itself is production-quality and all `@po` recommendations are verifiably applied in source.

**Required before merge:** @devops or another agent must run `bash run_e2e_tests.sh` (or `npm run test:e2e -- reports.spec.ts` with the stack up) and confirm 8/8 green. If all pass, upgrade CONCERNS → PASS without code changes.

### AC Traceability (AC1-AC8)

| AC | Requirement | Code Evidence | Test Evidence | Status |
|----|-------------|---------------|---------------|--------|
| AC1 | `GET /reports/monthly-summary?year&month` returns income/expense/net for JWT user | `routes/reports.py` L147-198 — Query groups by type, filters user + soft-delete + date range | `test_reports.py` L21-68 (month_range edge cases) + Playwright T2 (not run) | COVERED |
| AC2 | `GET /reports/category-breakdown` returns per-category expense + percentage | `routes/reports.py` L204-295 — LEFT JOIN, EXPENSE filter, group by category | `test_reports.py` L74-115 (rounding) + Playwright T3 (not run) | COVERED |
| AC3 | Reports page renders Monthly Summary section | `reports/page.tsx` L175-196 + `MonthlySummaryCard.tsx` | `useReports.test.ts` U2 + Playwright T2 (not run) | COVERED |
| AC4 | Reports page renders Recharts PieChart | `CategoryBreakdownChart.tsx` L97-152 — Pie + Legend + Cell | Playwright T3 (not run) | COVERED |
| AC5 | Month/year selector updates without reload | `reports/page.tsx` L60-81, L125-154 — prev/next + `<input type="month">` wired to state; useEffect refetches | Playwright T4 (not run) | COVERED |
| AC6 | Missing/invalid JWT → 401 on both endpoints | Both endpoints depend on `get_current_user_from_header` (`utils/auth.py` L161-186) which raises 401 | Playwright T6 (not run) | COVERED |
| AC7 | Empty month returns valid zero response + empty-state UI | Backend returns zeros (no 404) at L181-198 and `items=[]` at L269-294; FE renders `reports-empty-state` + `breakdown-empty` | Playwright T7 (not run) | COVERED |
| AC8 | Reports accessible from dashboard nav | `DashboardNav.tsx` L20-23 adds "Relatórios" link; `layout.tsx` wraps all /dashboard/* | Playwright T8 (not run) | COVERED |

### `@po` Recommendations Verification

| # | Recommendation | Applied? | Evidence |
|---|----------------|----------|----------|
| 1 | Empty-state consistency (match transaction-list pattern) | YES | `CategoryBreakdownChart.tsx` L70-89 blue panel with `data-testid="breakdown-empty"`; `reports/page.tsx` L189-195 mirrors pattern |
| 2 | December rollover explicit + test | YES | `routes/reports.py` L65-66 (`month == 12 → year+1, 1, 1`); regression test `test_reports.py` L34-44 |
| 3 | Percentages sum to exactly 100.0 | YES | `routes/reports.py` L273-280 "last slice absorbs drift"; test `test_reports.py` L74-97 asserts `[33.3, 33.3, 33.4]` |
| 4 | Parallel fetch via `Promise.all` | YES | `useReports.ts` L122-141 — both `fetch()` AND both `.json()` calls are in `Promise.all` |
| 5 | Nav placement AUTO-DECISION recorded | YES | File List line for `DashboardNav.tsx` contains `[AUTO-DECISION]` tag with reason |

### Backend Review (`routes/reports.py`)

| Area | Finding |
|------|---------|
| Auth enforcement | `Depends(get_current_user_from_header)` on both endpoints — 401 guaranteed on missing/invalid JWT. |
| UUID casting | Inline `UUID(user_id)` matches `transactions.py` pattern (tech-debt acknowledged pending `parse_uuid()` from 1.5c). No new divergence. |
| SQL correctness | Half-open `[start, end)` interval via `>= start AND < end` — correct. Soft-delete filter `deleted_at.is_(None)` applied. User scope correct. |
| Dec rollover | Handled explicitly (L65-66) — no implicit `month+1 → month=13` crash. |
| Empty month | Returns zeros + empty list, never 404/500. Query results are iterated safely (`total or 0`). |
| Input validation | `Query(ge=1970, le=9999)` for year and `ge=1, le=12)` for month — FastAPI returns 422 automatically on out-of-range. `_validate_year_month` is a belt-and-suspenders 400 for defensive consistency. |
| Percentage drift | Last-slice absorbs rounding — no 99.9% / 100.1% legend artifacts. |
| Uncategorized | LEFT JOIN + `cat_name or "Uncategorized"` collapses all category-less expense rows into one slice with `category_id=None`. |
| Issue flagged | **None blocking.** Minor: `datetime` import in L13 is unused (lint-level nit). |

### Frontend Review

| File | Finding |
|------|---------|
| `useReports.ts` | Correct `Promise.all` for fetches AND json-parse. `toNumber()` coerces Pydantic Decimal-strings safely. `shiftMonth` uses `new Date(year, month-1+delta, 1)` which correctly handles arbitrary rollovers. `isCurrentMonth` is exported but unused (dead code — LOW). |
| `MonthlySummaryCard.tsx` | BRL formatting correct; loading skeleton; green/red/blue color tokens consistent with Story 1.5. Negative balance prefixes `-` and uses `Math.abs()`. |
| `CategoryBreakdownChart.tsx` | Recharts PieChart renders pre-computed percentages; label function uses optional chaining (defensive). Accessible `<ul>` legend list renders same percentages (satisfies a11y and E2E scraping). 8-color palette wraps with modulo. Empty state consistent. |
| `reports/page.tsx` | `PrivateRoute` wraps content → AC6 FE redirect. `useEffect` refetches on `(token, year, month)` change → AC5 without reload. Empty-state banner shown only when both income and expenses are 0 (not during loading). |
| `DashboardNav.tsx` | Clean top-nav with `data-testid="nav-reports"` + active-state highlight via `usePathname()`. Correctly prefix-matches subroutes. |

### Security Findings

| Check | Result |
|-------|--------|
| JWT required on `/reports/monthly-summary` | PASS — `get_current_user_from_header` dep |
| JWT required on `/reports/category-breakdown` | PASS — `get_current_user_from_header` dep |
| User isolation (no cross-user leakage) | PASS — `Transaction.user_id == UUID(user_id)` filter on both queries |
| Soft-delete respected | PASS — `deleted_at.is_(None)` on both queries |
| SQL injection | PASS — SQLAlchemy ORM with bound parameters; no string interpolation |
| Input bounds | PASS — FastAPI `Query(ge=..., le=...)` + explicit `_validate_year_month` 400 |

### Issues Found

**None blocking.** Low-severity nits only:
1. `datetime` import unused in `routes/reports.py` line 13 — lint cleanup.
2. `isCurrentMonth` in `useReports.ts` exported but never imported — dead export, remove or consume.

These do not affect AC coverage, security, or runtime behavior. @dev can address in a follow-up tech-debt story.

### Recommendation for Next Steps

1. **@devops:** Re-run E2E in an unblocked environment (`bash run_e2e_tests.sh`). Expected: 8/8 pass. If any fail, return to @dev with logs.
2. **On green E2E:** Story upgrades CONCERNS → PASS; ready for commit/push by @devops.
3. **Tech-debt follow-up (non-blocking):** Remove unused `datetime` import + unused `isCurrentMonth` export; apply `parse_uuid()` helper when 1.5c lands.

**Clearance:** Pending E2E verification (CONCERNS). Code review, unit tests (12 backend + 11 frontend per @dev report), security scan, and all 5 @po recommendations — all PASS.

---

## QA Gate — Final (post-E2E)

**Verified by:** Main orchestrator — 2026-04-22
**Decision:** **PASS** (upgraded from CONCERNS)

### E2E Execution Result

```
Running 8 tests using 1 worker
  ok 1 T1: navigates to /dashboard/reports and renders page header (2.6s)
  ok 2 T2: monthly summary section renders for current month (2.5s)
  ok 3 T3: category breakdown renders (chart or empty state) (2.3s)
  ok 4 T4: changing month via selector triggers data refresh without reload (2.7s)
  ok 5 T8: "Relatórios" nav link navigates from dashboard to reports (2.0s)
  ok 6 T7: zero-transaction month shows empty-state message (2.3s)
  ok 7 T5: visiting /dashboard/reports while signed out redirects to login (1.2s)
  ok 8 T6: unauthenticated request to /reports/monthly-summary returns 401 (905ms)

  8 passed (18.8s)
```

### Fix Applied During Verification

First run: 7/8 (T7 strict mode violation — `.or()` matched both empty-state divs simultaneously).

Fix committed as `cc7d9fd`:
```diff
- await expect(summaryEmpty.or(breakdownEmpty)).toBeVisible({...})
+ await expect(summaryEmpty.or(breakdownEmpty).first()).toBeVisible({...})
```

### Backend Smoke Tests (curl)

| Endpoint | Auth | Result |
|----------|------|--------|
| GET /reports/monthly-summary?year=2026&month=4 | Bearer | 200 — `{income: 3000, expenses: 200, net: 2800}` |
| GET /reports/category-breakdown?year=2026&month=4 | Bearer | 200 — `[{Uncategorized: 200, 100%}]` |
| GET /reports/monthly-summary | none | 401 |

**Final clearance:** Ready for @devops to PR + merge.

