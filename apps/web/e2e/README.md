# E2E Tests — Mony Dashboard

End-to-end tests for the Mony financial dashboard using Playwright.

## Test Coverage

| File | Tests | Coverage |
|------|-------|----------|
| `auth.spec.ts` | 4 | Login, invalid credentials, persistence, form validation |
| `dashboard.spec.ts` | 7 | Header, summary cards, charts, filters, list, pagination, modal |
| `transactions.spec.ts` | 6 | Create, edit, delete, reconcile, validation, search |
| `filters.spec.ts` | 6 | Search, filter toggle, type filter, date range, reset, tags |
| `bulk-actions.spec.ts` | 8 | Select/deselect, export (CSV/JSON), delete, categorize |

**Total: 31 tests** covering all major dashboard flows.

## Prerequisites

1. **Install Playwright:**
   ```bash
   npm install -D @playwright/test
   npx playwright install chromium
   ```

2. **Start backend API:**
   ```bash
   # From project root, start the FastAPI backend
   cd apps/api && python main.py
   ```

3. **Start frontend dev server:**
   ```bash
   # From apps/web directory
   npm run dev
   ```
   Server should be running on `http://localhost:3000`

## Running Tests

### Headless (CI/CD)
```bash
npm run test:e2e
```

### With UI Inspector
```bash
npm run test:e2e:ui
```

### With Visible Browser
```bash
npm run test:e2e:headed
```

### Single Test File
```bash
npx playwright test e2e/auth.spec.ts
```

### Specific Test
```bash
npx playwright test -g "should login with valid credentials"
```

## Test Fixtures

### Auth Helper
Located in `fixtures/auth.ts`, provides:

- `loginAs(page, email, password)` — Helper to log in via UI
- `logout(page)` — Helper to log out
- `isLoggedIn(page)` — Check if user is authenticated

### Test Data

Uses placeholder credentials:
- Email: `testuser@example.com`
- Password: `Test@123456`

**Note:** For these tests to pass, ensure the backend has a test user with these credentials, or modify the tests to use valid credentials from your test environment.

## Results & Reports

After running tests:
- **HTML Report:** `playwright-report/index.html`
- **Screenshots:** `test-results/` (on failure)
- **Traces:** Available in HTML report

To view results:
```bash
npx playwright show-report
```

## CI/CD Integration

For automated runs in CI/CD:

1. Install dependencies:
   ```bash
   npm ci
   npx playwright install --with-deps chromium
   ```

2. Run tests:
   ```bash
   npm run test:e2e
   ```

Set `CI=true` environment variable for stricter settings (retries, fewer workers).

## Debugging

### Debug Mode
```bash
npx playwright test --debug
```

### Trace Viewer
```bash
npx playwright show-trace trace.zip
```

### Step Through with Inspector
```bash
PWDEBUG=1 npx playwright test
```

## Known Issues & Fixes

1. **localStorage access error** — Now catches security errors and falls back to URL checking
2. **Dev server not running** — Tests auto-start dev server via `webServer` config, or pass `reuseExistingServer=true` if already running

## Best Practices

- ✅ Tests use realistic user flows (click, type, submit forms)
- ✅ Proper waits and timeouts to avoid flakiness
- ✅ Screenshots/traces captured on failure
- ✅ Auth fixtures prevent code duplication
- ✅ Descriptive test names explain what's being tested

## Contributing

When adding new tests:

1. Use descriptive `test()` names
2. Follow the `Arrange → Act → Assert` pattern
3. Add `await page.waitForTimeout()` between actions if needed
4. Use `expect()` assertions for verification
5. Document complex selectors with comments

Example:
```typescript
test('should create transaction', async ({ page }) => {
  // Arrange: Login
  await loginAs(page, TEST_EMAIL, TEST_PASSWORD)
  
  // Act: Click button and fill form
  await page.click('button:has-text("Nova Transação")')
  await page.fill('input[placeholder*="Descrição"]', 'Test')
  
  // Assert: Verify result
  await expect(page.locator('text=Test')).toBeVisible()
})
```

---

**Story:** 1.5c — Dashboard E2E Testing
**Created:** April 2026
