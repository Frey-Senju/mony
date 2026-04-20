import { test, expect } from '@playwright/test'
import { loginAs } from './fixtures/auth'

/**
 * E2E Tests: Dashboard
 *
 * Story 1.5c: Test dashboard components and layout
 */

const TEST_EMAIL = 'testuser@example.com'
const TEST_PASSWORD = 'Test@123456'

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await loginAs(page, TEST_EMAIL, TEST_PASSWORD)
  })

  test('should display dashboard header', async ({ page }) => {
    // Verify page title
    await expect(page.locator('h1')).toContainText('Dashboard Financeiro')

    // Verify greeting with user name
    await expect(page.locator('text=/Bem-vindo/i')).toBeVisible()

    // Verify "Nova Transação" button exists
    await expect(page.locator('button:has-text("Nova Transação")')).toBeVisible()
  })

  test('should display summary cards', async ({ page }) => {
    // Check for summary card titles
    await expect(page.locator('text=Gastos este mês')).toBeVisible()
    await expect(page.locator('text=Renda este mês')).toBeVisible()
    await expect(page.locator('text=Saldo disponível')).toBeVisible()
    await expect(page.locator('text=Meta orçamentária')).toBeVisible()
  })

  test('should display charts section', async ({ page }) => {
    // Check for charts heading
    await expect(page.locator('text=Análise Financeira')).toBeVisible()

    // Wait for Recharts to render (ResponsiveContainer → .recharts-wrapper)
    await page.waitForSelector('.recharts-wrapper, .recharts-surface', {
      timeout: 10000,
    })
  })

  test('should display filters section', async ({ page }) => {
    // Check for filters heading (use heading role to avoid strict mode collisions)
    await expect(page.getByRole('heading', { name: 'Transações' })).toBeVisible()

    // Check for search bar
    await expect(
      page.locator('input[placeholder*="Buscar"]')
    ).toBeVisible()

    // Check for filters toggle
    await expect(page.locator('button:has-text("Mostrar filtros")')).toBeVisible()
  })

  test('should display transaction list', async ({ page }) => {
    // Wait for transaction table
    await page.waitForSelector('table', { timeout: 5000 })

    // Check for table headers
    await expect(page.locator('th:has-text("Descrição")')).toBeVisible()
    await expect(page.locator('th:has-text("Valor")')).toBeVisible()
    await expect(page.locator('th:has-text("Data")')).toBeVisible()
    await expect(page.locator('th:has-text("Status")')).toBeVisible()
    await expect(page.locator('th:has-text("Categoria")')).toBeVisible()
  })

  test('should load transactions with pagination', async ({ page }) => {
    // Wait for transaction table
    await page.waitForSelector('table tbody tr', { timeout: 5000 })

    // Check if any transactions are displayed
    const rows = await page.locator('table tbody tr').count()
    expect(rows).toBeGreaterThanOrEqual(0)

    // If there are transactions, check pagination info
    if (rows > 0) {
      await expect(
        page.locator('text=/Mostrando [0-9]+ a [0-9]+/')
      ).toBeVisible()
    }
  })

  test('should open transaction modal on "Nova Transação" click', async ({
    page,
  }) => {
    // Click "Nova Transação" button
    await page.click('button:has-text("Nova Transação")')

    // Modal should open
    await page.waitForSelector('h2:has-text("Nova Transação")', { timeout: 5000 })

    // Should show form fields
    await expect(page.locator('label:has-text("Descrição")')).toBeVisible()
    await expect(page.locator('label:has-text("Valor")')).toBeVisible()
  })
})
