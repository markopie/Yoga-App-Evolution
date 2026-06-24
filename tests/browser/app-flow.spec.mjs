import { expect, test } from '@playwright/test';

async function openAsGuest(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto('/');
  await expect(page.getByRole('button', { name: /continue as guest/i })).toBeVisible();
  await page.getByRole('button', { name: /continue as guest/i }).click();
  await expect(page.locator('#mainAppContainer')).toBeVisible();
  await expect(page.locator('#startTodayPracticeBtn')).toBeVisible();

  return errors;
}

test('app loads, guest sign-in reaches the main app, and normal UI has no dev label', async ({ page }) => {
  const errors = await openAsGuest(page);

  await expect(page.locator('#loginScreen')).toBeHidden();
  await expect(page.locator('#mainAppContainer')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('Testing v2 DEV');
  await expect(page.locator('body')).not.toContainText(/Integrated Iyengar Practice Path - Testing/i);
  expect(errors).toEqual([]);
});

test('login screen keeps email actions tucked behind one simple option', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /continue as guest/i })).toBeVisible();

  const emailPanel = page.locator('#emailAuthDetails');
  await expect(emailPanel).toBeVisible();
  await expect(emailPanel).not.toHaveAttribute('open', '');
  await expect(page.locator('#authEmailInput')).toBeHidden();
  await expect(page.getByRole('button', { name: /^create email account$/i })).toBeHidden();
  await expect(page.getByRole('button', { name: /^reset password$/i })).toBeHidden();

  await emailPanel.locator('summary').click();
  await expect(page.locator('#authEmailInput')).toBeVisible();
  await expect(page.getByRole('button', { name: /^continue$/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /^create email account$/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /^reset password$/i })).toBeVisible();
});

test('Start Today loads a playable practice and rating advances to the next node', async ({ page }) => {
  await openAsGuest(page);

  await page.getByRole('button', { name: /start today's practice/i }).click();
  await expect(page.locator('#curriculumPracticeSummary')).toContainText('Week 1, Day 1');
  await expect(page.locator('#poseName')).not.toContainText('Select a sequence');

  await page.evaluate(() => window.markCurrentCurriculumNodeCompleteForTesting());
  await expect(page.locator('#ratingOverlay')).toBeVisible();
  await page.getByRole('button', { name: /good/i }).click();

  await expect(page.locator('#ratingOverlay')).toBeHidden();
  await expect(page.locator('#curriculumPracticeSummary')).toContainText('Week 1, Day 2');
});

test('low completion rating repeats the same curriculum node', async ({ page }) => {
  await openAsGuest(page);

  await page.getByRole('button', { name: /start today's practice/i }).click();
  await expect(page.locator('#curriculumPracticeSummary')).toContainText('Week 1, Day 1');

  await page.evaluate(() => window.markCurrentCurriculumNodeCompleteForTesting());
  await expect(page.locator('#ratingOverlay')).toBeVisible();
  await page.getByRole('button', { name: /hard/i }).click();

  await expect(page.locator('#ratingOverlay')).toBeHidden();
  await expect(page.locator('#curriculumPracticeSummary')).toContainText('Week 1, Day 1');
});

test('Start Today can load composed and recovery curriculum nodes', async ({ page }) => {
  await openAsGuest(page);

  await page.evaluate(() => window.startTodayPractice(9004));
  await expect(page.locator('#curriculumPracticeSummary')).toContainText('Part 1');
  await expect(page.locator('#curriculumPracticeSummary')).toContainText('Part 2');
  await expect(page.locator('#poseName')).not.toContainText('Select a sequence');

  await page.evaluate(() => window.startTodayPractice(9007));
  await expect(page.locator('#curriculumPracticeSummary')).toContainText(/Rest|Savasana/i);
  await expect(page.locator('#poseName')).toContainText(/Recovery|Rest/i);
});

test('Curriculum Map opens, renders summary/counts, and stations have forgiving hit targets', async ({ page }) => {
  await openAsGuest(page);

  await page.locator('#curriculumMapBtn').click();
  await expect(page.getByTestId('curriculum-map')).toBeVisible();
  await expect(page.getByTestId('curriculum-detail')).toBeVisible();
  await expect(page.locator('.cr-summary')).toContainText(/of 9/);

  const visibleStation = page.getByTestId('curriculum-station').first();
  const hitTarget = page.getByTestId('curriculum-station-hit-target').first();
  await expect(visibleStation).toBeVisible();
  await expect(hitTarget).toBeVisible();

  const sizes = await Promise.all([
    visibleStation.getAttribute('r').then(Number),
    hitTarget.getAttribute('r').then(Number),
  ]);
  expect(sizes[1]).toBeGreaterThan(sizes[0] + 8);
  await expect(hitTarget).toHaveCSS('fill', 'rgba(0, 0, 0, 0)');

  const secondTarget = page.getByTestId('curriculum-station-hit-target').nth(1);
  const box = await secondTarget.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box.x + (box.width / 2) + 11, box.y + (box.height / 2));
  await expect(page.getByTestId('curriculum-detail')).toContainText('Week 1');
  await expect(page.getByTestId('curriculum-detail')).toContainText('Day 2');
});

test('Curriculum Map stations support keyboard activation', async ({ page }) => {
  await openAsGuest(page);

  await page.locator('#curriculumMapBtn').click();
  await expect(page.getByTestId('curriculum-map')).toBeVisible();

  const thirdTarget = page.getByTestId('curriculum-station-hit-target').nth(2);
  await thirdTarget.focus();
  await page.keyboard.press('Enter');

  await expect(page.getByTestId('curriculum-detail')).toContainText('Week 1');
  await expect(page.getByTestId('curriculum-detail')).toContainText('Day 3');
});
