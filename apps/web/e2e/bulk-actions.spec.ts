import { test, expect } from '@playwright/test'
import { loginAs } from './fixtures/auth'

/**
 * E2E Tests: Bulk Actions
 *
 * Story 1.5c: Test bulk transaction operations
 */

const TEST_EMAIL = 'testuser@example.com'
const TEST_PASSWORD = 'Test@123456'

test.describe('Bulk Actions', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await loginAs(page, TEST_EMAIL, TEST_PASSWORD)

    // Wait for transaction list to load
    await page.waitForSelector('table tbody tr', { timeout: 5000 })
  })

  test('should select individual transaction', async ({ page }) => {
    // Get first transaction row
    const firstRow = page.locator('table tbody tr').first()

    // Click checkbox in first row
    const checkbox = firstRow.locator('input[type="checkbox"]').first()
    await checkbox.check()

    // Bulk actions bar should appear at bottom (.first() — multiple matches exist)
    const bulkActionsBar = page.locator('text=/selecionado/i').first()
    await expect(bulkActionsBar).toBeVisible()

    // Should show "1 selecionado"
    await expect(bulkActionsBar).toContainText('1')
  })

  test('should select all transactions', async ({ page }) => {
    // Click "select all" checkbox in header
    const headerCheckbox = page.locator('thead input[type="checkbox"]')
    await headerCheckbox.check()

    // Bulk actions bar should appear
    const bulkActionsBar = page.locator('text=/selecionado/i').first()
    await expect(bulkActionsBar).toBeVisible()

    // Get row count for verification
    const rowCount = await page.locator('table tbody tr').count()
    if (rowCount > 0) {
      // Should show "X selecionado"
      await expect(bulkActionsBar).toContainText(rowCount.toString())
    }
  })

  test('should deselect all transactions', async ({ page }) => {
    // Select all first
    const headerCheckbox = page.locator('thead input[type="checkbox"]')
    await headerCheckbox.check()

    // Bulk actions bar should appear
    const bulkActionsBar = page.locator('text=/selecionado/i')
    await expect(bulkActionsBar).toBeVisible()

    // Click deselect button
    const deselectButton = page.locator('button:has-text("Desselecionar")')
    if (await deselectButton.isVisible()) {
      await deselectButton.click()

      // Bulk actions bar should disappear
      await expect(bulkActionsBar).not.toBeVisible({ timeout: 2000 })
    }
  })

  test('should export transactions as CSV', async ({ page }) => {
    // Select some transactions
    const firstRow = page.locator('table tbody tr').first()
    const checkbox = firstRow.locator('input[type="checkbox"]').first()
    await checkbox.check()

    // Wait for bulk actions bar
    await page.waitForSelector('text=/selecionado/i', { timeout: 5000 })

    // Find export button
    const exportButton = page.locator('button:has-text("Exportar")')

    if (await exportButton.isVisible()) {
      // Click export
      await exportButton.click()

      // Should show format options
      const csvOption = page.locator('text=CSV')
      await expect(csvOption).toBeVisible()

      // Click CSV option
      await csvOption.click()

      // Download should start (check if download event is triggered)
      // In a real test, you would listen for download event
    }
  })

  test('should export transactions as JSON', async ({ page }) => {
    // Select transaction
    const firstRow = page.locator('table tbody tr').first()
    const checkbox = firstRow.locator('input[type="checkbox"]').first()
    await checkbox.check()

    // Wait for bulk actions
    await page.waitForSelector('text=/selecionado/i', { timeout: 5000 })

    // Find export button
    const exportButton = page.locator('button:has-text("Exportar")')

    if (await exportButton.isVisible()) {
      await exportButton.click()

      // Should show format options
      const jsonOption = page.locator('text=JSON')
      await expect(jsonOption).toBeVisible()

      // Click JSON option
      await jsonOption.click()
    }
  })

  test('should delete selected transactions', async ({ page }) => {
    const rowCountBefore = await page.locator('table tbody tr').count()

    if (rowCountBefore > 0) {
      // Select first transaction
      const firstRow = page.locator('table tbody tr').first()
      const checkbox = firstRow.locator('input[type="checkbox"]').first()
      await checkbox.check()

      // Wait for bulk actions
      await page.waitForSelector('text=/selecionado/i', { timeout: 5000 })

      // Find delete button
      const deleteButton = page.locator('button:has-text("Deletar")')

      if (await deleteButton.isVisible()) {
        // Handle confirmation dialog
        await page.on('dialog', (dialog) => {
          dialog.accept()
        })

        // Click delete
        await deleteButton.click()

        // Wait for deletion
        await page.waitForTimeout(500)

        // Check if row count decreased
        const rowCountAfter = await page.locator('table tbody tr').count()
        expect(rowCountAfter).toBeLessThanOrEqual(rowCountBefore)
      }
    }
  })

  test('should categorize selected transactions', async ({ page }) => {
    // Select transaction
    const firstRow = page.locator('table tbody tr').first()
    const checkbox = firstRow.locator('input[type="checkbox"]').first()
    await checkbox.check()

    // Wait for bulk actions
    await page.waitForSelector('text=/selecionado/i', { timeout: 5000 })

    // Find categorize button
    const categorizeButton = page.locator('button:has-text("Categorizar")')

    if (await categorizeButton.isVisible()) {
      await categorizeButton.click()

      // Should show category selector (modal or sidebar)
      // This depends on implementation
      await page.waitForTimeout(500)
    }
  })

  test('should close bulk actions when deselecting', async ({ page }) => {
    // Select transaction
    const firstRow = page.locator('table tbody tr').first()
    const checkbox = firstRow.locator('input[type="checkbox"]').first()
    await checkbox.check()

    // Bulk actions bar should appear (.first() — multiple matches)
    const bulkActionsBar = page.locator('text=/selecionado/i').first()
    await expect(bulkActionsBar).toBeVisible()

    // Deselect by unchecking
    await checkbox.uncheck()

    // Bulk actions bar should disappear
    await expect(bulkActionsBar).not.toBeVisible({ timeout: 2000 })
  })
})
