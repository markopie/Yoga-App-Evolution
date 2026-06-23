/**
 * Auth UI browser tests.
 *
 * All tests run with VITE_BROWSER_TEST_MOCKS=1 (default for test:browser).
 * No real Supabase credentials are required.
 *
 * Cloud-only scenarios (real sign-in against cloud) are explicitly skipped
 * unless VITE_BROWSER_TEST_MOCKS=0 and cloud credentials are provided via env.
 */
import { expect, test } from '@playwright/test';

const USE_MOCKS = (process.env.VITE_BROWSER_TEST_MOCKS ?? '1') === '1';

test('login screen renders all expected auth controls', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('#loginScreen')).toBeVisible();
  await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /continue as guest/i })).toBeVisible();
  await expect(page.locator('#emailAuthDetails')).toBeVisible();

  // Email panel is collapsed by default
  await expect(page.locator('#authEmailInput')).toBeHidden();

  // Expand the email panel and verify controls
  await page.locator('#emailAuthDetails summary').click();
  await expect(page.locator('#authEmailInput')).toBeVisible();
  await expect(page.locator('#authPasswordInput')).toBeVisible();
  await expect(page.getByRole('button', { name: /^continue$/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /^create email account$/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /^reset password$/i })).toBeVisible();
});

test('guest login reaches the main app', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /continue as guest/i }).click();
  await expect(page.locator('#mainAppContainer')).toBeVisible();
  await expect(page.locator('#loginScreen')).toBeHidden();
});

test.describe('mock-only auth tests', () => {
  test.skip(!USE_MOCKS, 'Requires VITE_BROWSER_TEST_MOCKS=1');

  test('bad password shows a friendly error message', async ({ page }) => {
    await page.goto('/');

    // Arm the mock to return an invalid-credentials error on the next sign-in attempt
    await page.evaluate(() => window.__mockNextSignInFailure?.());

    await page.locator('#emailAuthDetails summary').click();
    await page.locator('#authEmailInput').fill('test@example.com');
    await page.locator('#authPasswordInput').fill('wrongpassword');
    await page.getByRole('button', { name: /^continue$/i }).click();

    const errorEl = page.locator('#loginError');
    await expect(errorEl).toBeVisible();
    const errorText = await errorEl.textContent();
    expect(errorText).toMatch(/incorrect|did not work|wrong/i);

    // Login screen must still be showing — app should not be stuck
    await expect(page.locator('#loginScreen')).toBeVisible();
    await expect(page.locator('#mainAppContainer')).toBeHidden();
  });

  test('error message clears when user edits email or password', async ({ page }) => {
    await page.goto('/');

    await page.evaluate(() => window.__mockNextSignInFailure?.());

    await page.locator('#emailAuthDetails summary').click();
    await page.locator('#authEmailInput').fill('test@example.com');
    await page.locator('#authPasswordInput').fill('wrongpassword');
    await page.getByRole('button', { name: /^continue$/i }).click();

    await expect(page.locator('#loginError')).toBeVisible();

    // Typing in the password field should clear the error
    await page.locator('#authPasswordInput').fill('');
    await page.locator('#authPasswordInput').type('x');
    await expect(page.locator('#loginError')).toBeHidden();
  });

  test('mock sign-in with password succeeds and shows main app', async ({ page }) => {
    await page.goto('/');

    await page.locator('#emailAuthDetails summary').click();
    await page.locator('#authEmailInput').fill('test@example.com');
    await page.locator('#authPasswordInput').fill('correctpassword');
    await page.getByRole('button', { name: /^continue$/i }).click();

    await expect(page.locator('#mainAppContainer')).toBeVisible();
    await expect(page.locator('#loginScreen')).toBeHidden();
  });
});

test.describe('missing Supabase config', () => {
  // This scenario requires a build without Supabase env vars.
  // Skip unless explicitly enabled via env var.
  test.skip(
    !process.env.TEST_AUTH_NO_SUPABASE,
    'Set TEST_AUTH_NO_SUPABASE=1 to run config-missing tests against a build with no Supabase env vars',
  );

  test('shows a useful message when Supabase is not configured', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#loginScreen')).toBeVisible();
    await expect(page.locator('#loginConfigNotice')).toBeVisible();
    const noticeText = await page.locator('#loginConfigNotice').textContent();
    expect(noticeText).toMatch(/VITE_SUPABASE_URL/i);
  });
});
