import { test, expect } from 'ui.test.e2e.auth';

test('Has top menu', async ({ page }) => {
	await page.goto('/online');

	await expect(page.locator('.app__header')).toBeVisible();
});

test('Check online page', async ({ page }) => {
	await page.goto('/online');

	await expect(page.locator('#messenger-embedded-application')).toBeVisible();
});
