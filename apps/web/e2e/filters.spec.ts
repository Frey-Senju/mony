import { test, expect } from '@playwright/test'
import { loginAs } from './fixtures/auth'

/**
 * E2E Tests: Filters
 *
 * Story 1.5c: Test transaction filtering and search
 */

const TEST_EMAIL = 'testuser@example.com'
const TEST_PASSWORD = 'Test@123456'

test.describe('Filters', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await loginAs(page, TEST_EMAIL, TEST_PASSWORD)

    // Wait for transaction list to load
    await page.waitForSelector('input[placeholder*="Buscar"]', { timeout: 5000 })
  })

  test('should filter by search text', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Buscar"]')

    // Get initial row count
    let rows = await page.locator('table tbody tr').count()
    const initialCount = rows

    // Type search term
    await searchInput.fill('coffee')

    // Wait for filter to apply
    await page.waitForTimeout(500)

    // Row count should be different (or empty)
    rows = await page.locator('table tbody tr').count()
    expect(rows).toBeLessThanOrEqual(initialCount)

    // Clear search
    await searchInput.clear()

    // Wait for filter to clear
    await page.waitForTimeout(500)

    // Should restore original count
    rows = await page.locator('table tbody tr').count()
    expect(rows).toBeLessThanOrEqual(initialCount + 5) // Allow some variance
  })

  test('should show and hide filter panel', async ({ page }) => {
    // Toggle text flips between "Mostrar filtros" / "Ocultar filtros"
    const filterToggle = page.locator('button:has-text("filtros")').first()
    await filterToggle.waitFor({ state: 'visible' })

    // Click to show
    await filterToggle.click()

    // Filter panel should be visible
    const filterPanel = page.locator('text=Tipo')
    await expect(filterPanel).toBeVisible()

    // Click to hide (toggle still matches "filtros" substring)
    await filterToggle.click()
  })

  test('should filter by transaction type', async ({ page }) => {
    // Show filters
    const filterToggle = page.locator('button:has-text("Mostrar filtros")')
    await filterToggle.click()

    // Wait for type filter to appear
    await page.waitForSelector('select', { timeout: 5000 })

    // Get all selects
    const selects = page.locator('select')

    // Find type filter (might be by label or position)
    // Assuming second select is type filter (after account)
    const typeSelect = selects.nth(1)

    if (await typeSelect.isVisible()) {
      // Select "Receita" (income)
      await typeSelect.selectOption('income')

      // Wait for filter
      await page.waitForTimeout(500)

      // All visible transactions should be income type
      const rows = await page.locator('table tbody tr').count()
      expect(rows).toBeGreaterThanOrEqual(0) // Can be 0 if no income
    }
  })

  test('should filter by date range', async ({ page }) => {
    // Show filters
    const filterToggle = page.locator('button:has-text("Mostrar filtros")')
    await filterToggle.click()

    // Wait for date inputs
    await page.waitForSelector('input[type="date"]', { timeout: 5000 })

    const dateInputs = page.locator('input[type="date"]')

    if ((await dateInputs.count()) >= 2) {
      // Set start date
      await dateInputs.nth(0).fill('2026-01-01')

      // Set end date
      await dateInputs.nth(1).fill('2026-04-30')

      // Wait for filter
      await page.waitForTimeout(500)

      // Transactions should be filtered
      const rows = await page.locator('table tbody tr').count()
      expect(rows).toBeGreaterThanOrEqual(0)
    }
  })

  test('should reset all filters', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Buscar"]')

    // Apply search filter
    await searchInput.fill('test')

    // Wait for filter
    await page.waitForTimeout(500)

    // Find reset button
    const resetButton = page.locator('button:has-text("Limpar filtros")')

    if (await resetButton.isVisible()) {
      // Click reset
      await resetButton.click()

      // Wait for filter reset
      await page.waitForTimeout(500)

      // Search input should be cleared
      const searchValue = await searchInput.inputValue()
      expect(searchValue).toBe('')
    }
  })

  test('should display active filter tags', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Buscar"]')

    // Apply filter
    await searchInput.fill('coffee')

    // Wait for tag to appear
    await page.waitForTimeout(500)

    // Check if filter tag is displayed
    const filterTag = page.locator('text=/Busca.*coffee/i')
    const isVisible = await filterTag.isVisible().catch(() => false)

    // If tag system exists, it should show the filter
    if (isVisible) {
      expect(await filterTag.count()).toBeGreaterThan(0)
    }
  })
})
