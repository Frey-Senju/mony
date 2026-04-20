import { Page } from '@playwright/test'

/**
 * Authentication helpers for E2E tests
 */

export async function loginAs(
  page: Page,
  email: string,
  password: string
): Promise<void> {
  await page.goto('/auth/login', { waitUntil: 'networkidle' })

  // Wait for login form with increased timeout
  await page.waitForSelector('input[type="email"]', { timeout: 15000 })

  // Wait for form to be interactive
  await page.waitForFunction(() => {
    const input = document.querySelector('input[type="email"]')
    return input && !input.hasAttribute('disabled')
  }, { timeout: 10000 })

  // Fill email
  await page.fill('input[type="email"]', email)

  // Fill password
  await page.fill('input[type="password"]', password)

  // Click login button
  await page.click('button[type="submit"]')

  // Wait for redirect to dashboard
  await page.waitForURL('**/dashboard', { timeout: 15000 })
}

export async function logout(page: Page): Promise<void> {
  // Click user menu or logout button (adjust selector as needed)
  await page.click('button[title*="logout"], button[title*="Logout"]')

  // Wait for redirect to login
  await page.waitForURL('/auth/login', { timeout: 5000 })
}

export async function isLoggedIn(page: Page): Promise<boolean> {
  try {
    const response = await page.evaluate(() => {
      const tokens = localStorage.getItem('mony_tokens')
      return !!tokens
    })
    return response
  } catch {
    // If localStorage access fails, check URL instead
    return page.url().includes('/dashboard')
  }
}
