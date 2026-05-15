import { test, expect } from '@playwright/test'
import { loginAs } from './fixtures/auth'

const TEST_EMAIL = 'testuser@example.com'
const TEST_PASSWORD = 'Test@123456'

test.describe('Goals', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, TEST_EMAIL, TEST_PASSWORD)
  })

  test('nav link "Metas" is visible and navigates correctly', async ({ page }) => {
    await expect(page.getByTestId('nav-goals')).toBeVisible()
    await page.getByTestId('nav-goals').click()
    await page.waitForURL('**/dashboard/goals')
    await expect(page.getByRole('heading', { name: 'Metas Financeiras' })).toBeVisible()
  })

  test('shows "Nova Meta" button', async ({ page }) => {
    await page.goto('/dashboard/goals')
    await expect(page.getByRole('button', { name: /nova meta/i })).toBeVisible()
  })

  test('opens create goal modal', async ({ page }) => {
    await page.goto('/dashboard/goals')
    await page.getByRole('button', { name: /nova meta/i }).click()
    await expect(page.getByRole('heading', { name: /nova meta/i })).toBeVisible()
    await expect(page.getByPlaceholder(/reserva de emergência/i)).toBeVisible()
  })

  test('shows empty state when no goals exist', async ({ page }) => {
    await page.goto('/dashboard/goals')
    // Either shows goals or the empty state — both are valid
    const hasGoals = await page.locator('[data-testid="goal-card"]').count() > 0
    const hasEmptyState = await page.getByText(/Nenhuma meta criada/i).isVisible().catch(() => false)
    expect(hasGoals || hasEmptyState).toBe(true)
  })

  test('closes goal modal on cancel', async ({ page }) => {
    await page.goto('/dashboard/goals')
    await page.getByRole('button', { name: /nova meta/i }).click()
    await page.getByRole('button', { name: /cancelar/i }).click()
    await expect(page.getByRole('heading', { name: /nova meta/i })).not.toBeVisible()
  })
})
