import { test, expect } from '@playwright/test'
import { loginAs } from './fixtures/auth'

/**
 * E2E Tests: Reports Page (Story 1.6)
 *
 * Covers AC1-AC8 via Playwright:
 *  - T1: page renders
 *  - T2: monthly summary values visible
 *  - T3: category breakdown chart OR empty state
 *  - T4: month selector updates data
 *  - T5: unauthenticated access redirects to login
 *  - T6: unauthenticated API returns 401
 *  - T7: zero-transaction month shows empty-state message
 *  - T8: "Relatórios" nav link navigates correctly
 */

const TEST_EMAIL = 'testuser@example.com'
const TEST_PASSWORD = 'Test@123456'
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

test.describe('Reports', () => {
  test.describe('authenticated', () => {
    test.beforeEach(async ({ page }) => {
      await loginAs(page, TEST_EMAIL, TEST_PASSWORD)
    })

    test('T1: navigates to /dashboard/reports and renders page header', async ({
      page,
    }) => {
      await page.goto('/dashboard/reports')

      await expect(page.getByTestId('reports-title')).toBeVisible()
      await expect(page.getByTestId('reports-title')).toContainText(
        'Relatórios'
      )
      await expect(page.getByTestId('month-selector')).toBeVisible()
    })

    test('T2: monthly summary section renders for current month', async ({
      page,
    }) => {
      await page.goto('/dashboard/reports')

      // Three summary cards (income, expenses, net balance).
      await expect(page.getByTestId('summary-income')).toBeVisible({
        timeout: 10_000,
      })
      await expect(page.getByTestId('summary-expenses')).toBeVisible()
      await expect(page.getByTestId('summary-net-balance')).toBeVisible()

      // BRL currency indicator must appear at least once.
      await expect(page.locator('text=R$').first()).toBeVisible()
    })

    test('T3: category breakdown renders (chart or empty state)', async ({
      page,
    }) => {
      await page.goto('/dashboard/reports')

      // Either the chart container or the empty-state panel must be visible.
      const chart = page.getByTestId('breakdown-chart')
      const empty = page.getByTestId('breakdown-empty')

      await expect(chart.or(empty)).toBeVisible({ timeout: 10_000 })
    })

    test('T4: changing month via selector triggers data refresh without reload', async ({
      page,
    }) => {
      await page.goto('/dashboard/reports')
      await page.waitForSelector('[data-testid="month-selector"]')

      const initialLabel = await page
        .getByTestId('selected-month-label')
        .textContent()

      // Click "previous month" and verify the label changes
      // without a full-page reload (same navigation id).
      const navPromise = page.waitForLoadState('networkidle').catch(() => null)
      await page.getByTestId('month-prev').click()
      await navPromise

      const newLabel = await page
        .getByTestId('selected-month-label')
        .textContent()

      expect(newLabel).not.toEqual(initialLabel)
      // Page must still be on /reports (no navigation).
      expect(page.url()).toContain('/dashboard/reports')
    })

    test('T8: "Relatórios" nav link navigates from dashboard to reports', async ({
      page,
    }) => {
      // Start on the main dashboard (loginAs redirects there).
      await page.waitForURL('**/dashboard', { timeout: 15_000 })

      const reportsLink = page.getByTestId('nav-reports')
      await expect(reportsLink).toBeVisible()
      await reportsLink.click()

      await page.waitForURL('**/dashboard/reports', { timeout: 10_000 })
      await expect(page.getByTestId('reports-title')).toBeVisible()
    })

    test('T7: zero-transaction month shows empty-state message', async ({
      page,
    }) => {
      await page.goto('/dashboard/reports')
      await page.waitForSelector('[data-testid="month-input"]')

      // Pick a far-future month that almost certainly has no transactions.
      await page
        .getByTestId('month-input')
        .fill('2099-01')

      // Either the summary empty-state banner or the breakdown empty-state
      // panel must appear (both are valid zero-transaction indicators).
      const summaryEmpty = page.getByTestId('reports-empty-state')
      const breakdownEmpty = page.getByTestId('breakdown-empty')
      await expect(summaryEmpty.or(breakdownEmpty)).toBeVisible({
        timeout: 10_000,
      })
    })
  })

  test.describe('unauthenticated', () => {
    test.beforeEach(async ({ page }) => {
      // Hit login page and clear any token so we're definitely signed out.
      await page.goto('/auth/login')
      try {
        await page.evaluate(() => localStorage.clear())
      } catch {
        // localStorage may be inaccessible in some contexts.
      }
    })

    test('T5: visiting /dashboard/reports while signed out redirects to login', async ({
      page,
    }) => {
      await page.goto('/dashboard/reports')
      await page.waitForURL('**/auth/login', { timeout: 10_000 })
      expect(page.url()).toContain('/auth/login')
    })

    test('T6: unauthenticated request to /reports/monthly-summary returns 401', async ({
      request,
    }) => {
      const resp = await request.get(
        `${API_BASE}/reports/monthly-summary?year=2026&month=4`
      )
      expect(resp.status()).toBe(401)
    })
  })
})
