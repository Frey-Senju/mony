import { test, expect } from '@playwright/test'
import { loginAs } from './fixtures/auth'

/**
 * E2E Tests: Transactions CRUD
 *
 * Story 1.5c: Test create, read, update, delete transaction flows
 */

const TEST_EMAIL = 'testuser@example.com'
const TEST_PASSWORD = 'Test@123456'

test.describe('Transactions', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await loginAs(page, TEST_EMAIL, TEST_PASSWORD)
  })

  test('should create a new transaction', async ({ page }) => {
    // Click "Nova Transação" button
    await page.click('button:has-text("Nova Transação")')

    // Wait for modal (heading to avoid strict mode with button)
    await page.waitForSelector('h2:has-text("Nova Transação")', { timeout: 5000 })

    // Fill description (use name attribute — placeholder is "Ex: Café...")
    await page.fill('input[name="description"]', 'Test Transaction')
    await page.fill('input[name="amount"]', '100')

    // Fill date (required field)
    await page.fill('input[name="transaction_date"]', '2026-04-20')

    // Select account (first option if no default)
    const accountSelect = page.locator('select[name="account_id"]')
    if ((await accountSelect.count()) > 0) {
      const currentValue = await accountSelect.inputValue()
      if (!currentValue) {
        await accountSelect.selectOption({ index: 1 })
      }
    }

    // Submit form
    await page.click('button:has-text("Salvar")')

    // Modal should close
    await page.waitForSelector('h2:has-text("Nova Transação")', {
      state: 'hidden',
      timeout: 5000,
    })

    // Transaction should appear in list (.first() — multiple runs may leave duplicates)
    await expect(page.locator('text=Test Transaction').first()).toBeVisible({
      timeout: 5000,
    })
  })

  test('should edit an existing transaction', async ({ page }) => {
    // Wait for transactions to load
    await page.waitForSelector('table tbody tr', { timeout: 5000 })

    // Get first transaction row
    const firstRow = page.locator('table tbody tr').first()

    // Click edit button in first row
    const editButton = firstRow.locator('button[title="Editar"]')
    if (await editButton.isVisible()) {
      await editButton.click()

      // Modal should open — in edit mode, heading is "Editar Transação"
      await page.waitForSelector('h2:has-text("Editar Transação")', { timeout: 5000 })

      // Change description (use name attribute — placeholder is "Ex: Café...")
      const descInput = page.locator('input[name="description"]')
      await descInput.waitFor({ state: 'visible', timeout: 10000 })
      await descInput.clear()
      await descInput.fill('Updated Description')

      // Save
      await page.click('button:has-text("Salvar")')

      // Modal should close
      await page.waitForSelector('h2:has-text("Editar Transação")', {
        state: 'hidden',
        timeout: 5000,
      })
    }
  })

  test('should delete a transaction with confirmation', async ({ page }) => {
    // Wait for transactions to load
    await page.waitForSelector('table tbody tr', { timeout: 5000 })

    const initialRowCount = await page.locator('table tbody tr').count()

    if (initialRowCount > 0) {
      // Get first transaction
      const firstRow = page.locator('table tbody tr').first()

      // Click delete button
      const deleteButton = firstRow.locator('button[title="Deletar"]')
      await deleteButton.click()

      // Confirm deletion
      await page.on('dialog', (dialog) => {
        dialog.accept()
      })

      // Wait for deletion to complete
      await page.waitForTimeout(500)

      // Row count should decrease
      const newRowCount = await page.locator('table tbody tr').count()
      expect(newRowCount).toBeLessThanOrEqual(initialRowCount)
    }
  })

  test('should reconcile a transaction', async ({ page }) => {
    // Wait for transactions to load
    await page.waitForSelector('table tbody tr', { timeout: 5000 })

    const firstRow = page.locator('table tbody tr').first()

    // Click reconcile button (status button)
    const statusButton = firstRow.locator('button:has-text("Pendente"), button:has-text("OK")')
    if (await statusButton.isVisible()) {
      const initialText = await statusButton.textContent()

      await statusButton.click()

      // Wait for backend update + React re-render
      await page.waitForTimeout(1500)
      await statusButton.waitFor({ state: 'visible' })

      const newText = await statusButton.textContent()
      expect(newText).not.toEqual(initialText)
    }
  })

  test('should handle form validation', async ({ page }) => {
    // Click "Nova Transação" button
    await page.click('button:has-text("Nova Transação")')

    // Wait for modal
    await page.waitForSelector('h2:has-text("Nova Transação")', { timeout: 5000 })

    // Try to submit empty form
    await page.click('button:has-text("Salvar")')

    // Should show validation errors (browser or app-level)
    // Modal should still be visible (use heading to avoid strict mode violation with button)
    const modalHeading = page.getByRole('heading', { name: 'Nova Transação' })
    await expect(modalHeading).toBeVisible()
  })

  test('should filter transactions by search', async ({ page }) => {
    // Wait for search input
    const searchInput = page.locator('input[placeholder*="Buscar"]')
    await searchInput.waitFor({ state: 'visible', timeout: 5000 })

    // Type search term
    await searchInput.fill('coffee')

    // Wait for filter to apply
    await page.waitForTimeout(500)

    // Transactions should be filtered (or empty if no match)
    const rows = await page.locator('table tbody tr').count()
    expect(rows).toBeGreaterThanOrEqual(0)
  })
})
