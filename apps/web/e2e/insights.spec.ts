import { test, expect } from '@playwright/test'
import { loginAs } from './fixtures/auth'

const TEST_EMAIL = 'testuser@example.com'
const TEST_PASSWORD = 'Test@123456'

test.describe('Insights', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, TEST_EMAIL, TEST_PASSWORD)
  })

  test('nav link "Insights" is visible and navigates correctly', async ({ page }) => {
    await expect(page.getByTestId('nav-insights')).toBeVisible()
    await page.getByTestId('nav-insights').click()
    await page.waitForURL('**/dashboard/insights')
    await expect(page.getByRole('heading', { name: 'Insights' })).toBeVisible()
  })

  test('renders insight cards section', async ({ page }) => {
    await page.goto('/dashboard/insights')
    await expect(page.getByText(/Top Categorias este mês/i)).toBeVisible()
    await expect(page.getByText(/Tendência Mensal/i)).toBeVisible()
    await expect(page.getByText(/Anomalias/i)).toBeVisible()
    await expect(page.getByText(/Despesas — últimos 6 meses/i)).toBeVisible()
  })

  test('shows descriptive subtitle', async ({ page }) => {
    await page.goto('/dashboard/insights')
    await expect(page.getByText(/Padrões de gasto e análise automática/i)).toBeVisible()
  })
})
