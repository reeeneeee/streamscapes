import { test, expect } from '@playwright/test';

test('page loads and shows Start Synth button', async ({ page }) => {
  await page.goto('/');
  const button = page.getByRole('button', { name: 'Start Synth' });
  await expect(button).toBeVisible();
});

test('clicking Start Synth shows mixer', async ({ page }) => {
  await page.goto('/');

  // Clear any stale localStorage
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  const button = page.getByRole('button', { name: 'Start Synth' });
  await expect(button).toBeVisible();

  // Click start — this triggers Tone.start() + stream connections
  await button.click();

  // Mixer should appear with channel labels
  await expect(page.getByText('Weather')).toBeVisible({ timeout: 5000 });
  await expect(page.getByText('Flights')).toBeVisible();
  await expect(page.getByText('Wikipedia')).toBeVisible();
  await expect(page.getByText('Master')).toBeVisible();
});

test('mixer has mute and solo buttons', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await page.getByRole('button', { name: 'Start Synth' }).click();

  // Wait for mixer
  await expect(page.getByText('Master')).toBeVisible({ timeout: 5000 });

  // Should have M and S buttons (3 channels = 3 of each)
  const muteButtons = page.getByRole('button', { name: 'M' });
  const soloButtons = page.getByRole('button', { name: 'S', exact: true });
  await expect(muteButtons).toHaveCount(3);
  await expect(soloButtons).toHaveCount(3);
});

test('no console errors on page load', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/');
  await page.waitForTimeout(2000);

  // Filter out known non-critical errors
  const critical = errors.filter(
    (e) => !e.includes('ResizeObserver') && !e.includes('hydration')
  );
  expect(critical).toHaveLength(0);
});
