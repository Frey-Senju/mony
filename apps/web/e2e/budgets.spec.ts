import { test, expect } from '@playwright/test'
import { loginAs } from './fixtures/auth'

const TEST_EMAIL = 'testuser@example.com'
const TEST_PASSWORD = 'Test@123456'

test.describe('Budgets', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, TEST_EMAIL, TEST_PASSWORD)
  })

  test('nav link "Budgets" is visible and navigates correctly', async ({ page }) => {
    await expect(page.getByTestId('nav-budgets')).toBeVisible()
    await page.getByTestId('nav-budgets').click()
    await page.waitForURL('**/dashboard/budgets')
    await expect(page.getByRole('heading', { name: 'Budgets' })).toBeVisible()
  })

  test('shows "Nova Budget" button', async ({ page }) => {
    await page.goto('/dashboard/budgets')
    await expect(page.getByRole('button', { name: /nova budget/i })).toBeVisible()
  })

  test('opens create budget modal', async ({ page }) => {
    await page.goto('/dashboard/budgets')
    await page.getByRole('button', { name: /nova budget/i }).click()
    await expect(page.getByRole('heading', { name: /novo budget/i })).toBeVisible()
    await expect(page.getByPlaceholder(/alimentação/i)).toBeVisible()
  })

  test('closes modal on cancel', async ({ page }) => {
    await page.goto('/dashboard/budgets')
    await page.getByRole('button', { name: /nova budget/i }).click()
    await page.getByRole('button', { name: /cancelar/i }).click()
    await expect(page.getByRole('heading', { name: /novo budget/i })).not.toBeVisible()
  })
})
