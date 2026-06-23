import { expect, test } from '@playwright/test';

test('optional local Supabase smoke: app can reach the real local runtime', async ({ page }) => {
  test.skip(
    process.env.RUN_LOCAL_SUPABASE_SMOKE !== '1',
    'Set RUN_LOCAL_SUPABASE_SMOKE=1, VITE_BROWSER_TEST_MOCKS=0, VITE_SUPABASE_URL, and VITE_SUPABASE_PUBLISHABLE_KEY to run this optional local Supabase smoke test.',
  );

  await page.goto('/');
  await expect(page.locator('#loginScreen, #mainAppContainer')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('Testing v2 DEV');
});
