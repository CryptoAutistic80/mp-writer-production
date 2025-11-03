import { test, expect } from '@playwright/test';

test('has title', async ({ page }) => {
  await page.goto('/');

  const heading = await page.locator('h1').innerText();
  expect(heading).toMatch(/Your voice,\s*clearly heard\./);
});
