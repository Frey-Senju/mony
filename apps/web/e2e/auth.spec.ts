import { test, expect } from '@playwright/test'
import { loginAs, isLoggedIn } from './fixtures/auth'

/**
 * E2E Tests: Authentication
 *
 * Story 1.5c: Test login, registration, and auth flows
 */

const TEST_EMAIL = 'testuser@example.com'
const TEST_PASSWORD = 'Test@123456'

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage before each test (if accessible)
    await page.goto('/auth/login')
    try {
      await page.evaluate(() => localStorage.clear())
    } catch {
      // localStorage might not be accessible in some contexts
    }
  })

  test('should login with valid credentials', async ({ page }) => {
    await loginAs(page, TEST_EMAIL, TEST_PASSWORD)

    // Verify we're on dashboard
    expect(page.url()).toContain('/dashboard')

    // Verify we're logged in
    const loggedIn = await isLoggedIn(page)
    expect(loggedIn).toBe(true)

    // Verify user greeting appears
    await expect(page.locator('text=Dashboard Financeiro')).toBeVisible()
  })

  test('should show error with invalid credentials', async ({ page }) => {
    await page.goto('/auth/login')

    // Fill with invalid credentials
    await page.fill('input[type="email"]', 'wrong@example.com')
    await page.fill('input[type="password"]', 'wrongpassword')

    // Submit
    await page.click('button[type="submit"]')

    // Wait for error message
    await expect(
      page.locator('text=/failed|invalid|incorrect/i')
    ).toBeVisible({ timeout: 5000 })

    // Should still be on login page
    expect(page.url()).toContain('/auth/login')
  })

  test('should persist login across page reloads', async ({ page }) => {
    await loginAs(page, TEST_EMAIL, TEST_PASSWORD)

    // Reload page
    await page.reload()

    // Should still be on dashboard
    expect(page.url()).toContain('/dashboard')

    // Should still be logged in
    const loggedIn = await isLoggedIn(page)
    expect(loggedIn).toBe(true)
  })

  test('should require email and password fields', async ({ page }) => {
    await page.goto('/auth/login')

    // Try to submit empty form
    await page.click('button[type="submit"]')

    // JS validation blocks submit + shows error message
    await page.waitForTimeout(500)
    expect(page.url()).toContain('/auth/login')
    await expect(page.locator('text=/email.*required/i').first()).toBeVisible()
  })
})
