import { expect, test, type Page } from '@playwright/test';

const SHOTS = 'docs/screenshots';

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

const seat = (page: Page, row: string, n: number) => page.locator(`button[aria-label^="Row ${row} seat ${n},"]`);
const continueBtn = (page: Page) => page.getByRole('button', { name: /^Continue$/ });

async function openSeat(page: Page, row: string, n: number) {
  // Picking a seat flies straight into its view (no Continue needed).
  await seat(page, row, n).click();
  await expect(page.getByText(`Row ${row} · Seat ${n}`)).toBeVisible();
  await expect(page.getByText(`View from ${row}${n}`)).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1600); // let the sheet spring + number count-ups settle
}

async function backToMap(page: Page, row: string, n: number) {
  await page.getByRole('button', { name: 'Change seat' }).click();
  await expect(continueBtn(page)).toBeEnabled({ timeout: 15_000 });
  await expect(seat(page, row, n)).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(400);
  // Coming back must NOT fly in again on its own (selection didn't change).
  await page.waitForTimeout(800);
  await expect(page.getByText(`View from ${row}${n}`)).toHaveCount(0);
}

test('reference loop: B4 → F8 → I12 → book', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/book/s-1945');

  await expect(page.getByText('Meridian')).toBeVisible();
  await expect(page.getByText('Choose your seat')).toBeVisible();
  await expect(continueBtn(page)).toBeDisabled();
  await page.waitForTimeout(1200); // 3D preloads after first paint
  await page.screenshot({ path: `${SHOTS}/01-map.png` });

  // ---- B4: UP CLOSE
  await seat(page, 'B', 4).click();
  await expect(page.getByText('Row B · Seat 4')).toBeVisible();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${SHOTS}/02-map-b4-selected.png` });

  // No Continue tap: the flight starts by itself ~0.55 s after picking the seat.
  await page.waitForTimeout(650);
  await page.screenshot({ path: `${SHOTS}/03a-overhead-3d.png` });
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${SHOTS}/03b-mid-flight.png` });
  await expect(page.getByText('View from B4')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1600);
  await expect(page.getByText('UP CLOSE', { exact: true })).toBeVisible();
  await expect(page.getByText('Row B, Seat 4', { exact: true })).toBeVisible();
  await expect(page.getByText('6.3 m to screen', { exact: true })).toBeAttached();
  await expect(page.getByText('86° field of view', { exact: true })).toBeAttached();
  await expect(page.getByText('2.2 m left of centre', { exact: true })).toBeAttached();
  await expect(page.locator('canvas')).toHaveCount(1);
  await page.screenshot({ path: `${SHOTS}/04-view-b4.png` });

  await backToMap(page, 'B', 4);
  await expect(page.getByText('Row B · Seat 4')).toBeVisible();

  // ---- F8: SWEET SPOT
  await openSeat(page, 'F', 8);
  await expect(page.getByText('SWEET SPOT', { exact: true })).toBeVisible();
  await expect(page.getByText('9.8 m to screen', { exact: true })).toBeAttached();
  await expect(page.getByText('62° field of view', { exact: true })).toBeAttached();
  await expect(page.getByText('0.3 m right of centre', { exact: true })).toBeAttached();
  await page.screenshot({ path: `${SHOTS}/05-view-f8.png` });
  await backToMap(page, 'F', 8);

  // ---- I12: FULL PICTURE, recliner
  await openSeat(page, 'I', 12);
  await expect(page.getByText('FULL PICTURE', { exact: true })).toBeVisible();
  await expect(page.getByText(/Recliner · €16\.00/)).toBeVisible();
  await expect(page.getByText('13.3 m to screen', { exact: true })).toBeAttached();
  await expect(page.getByText('3.3 m right of centre', { exact: true })).toBeAttached();
  await page.screenshot({ path: `${SHOTS}/06-view-i12.png` });

  // ---- Book
  await page.getByRole('button', { name: /Book Row I, Seat 12/ }).click();
  await expect(page.getByRole('button', { name: /Pay €16\.00/ })).toBeVisible();
  await page.getByLabel('Name').fill('Alex Doe');
  await page.getByLabel('Email').fill('alex@example.com');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/07-checkout.png` });
  await page.getByRole('button', { name: /Pay €16\.00/ }).click();
  await page.waitForURL(/\/book\/s-1945\/confirm\?ref=/, { timeout: 15_000 });
  await expect(page.getByLabel(/QR code for booking/)).toBeVisible();
  await expect(page.getByText('I12').first()).toBeVisible();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}/08-confirmation.png` });

  expect(errors, errors.join('\n')).toEqual([]);
});

test('sheet drag scrubs the camera and snaps', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/book/s-1945');
  await page.waitForTimeout(800);
  await openSeat(page, 'F', 8);

  const handle = page.getByRole('button', { name: 'Expand seat details' });
  const box = (await handle.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  // Short drag (< 50%) -> springs back to the seat view.
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(x, y + i * 10, { steps: 2 });
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${SHOTS}/09-scrub-partial.png` });
  await page.mouse.up();
  await page.waitForTimeout(1500);
  await expect(page.getByText('View from F8')).toBeVisible();

  // Long slow drag (> 50%) -> completes back to the map.
  const box2 = (await handle.boundingBox())!;
  const y2 = box2.y + box2.height / 2;
  await page.mouse.move(x, y2);
  await page.mouse.down();
  for (let i = 1; i <= 40; i++) {
    await page.mouse.move(x, y2 + i * 12, { steps: 2 });
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(200);
  await page.mouse.up();
  await expect(continueBtn(page)).toBeEnabled({ timeout: 15_000 });
  await expect(seat(page, 'F', 8)).toHaveAttribute('aria-pressed', 'true');

  // Deselect: tap the selected seat again.
  await page.waitForTimeout(500);
  await seat(page, 'F', 8).click();
  await expect(page.getByText('Choose your seat')).toBeVisible();
  await expect(continueBtn(page)).toBeDisabled();

  expect(errors, errors.join('\n')).toEqual([]);
});

test.describe('desktop', () => {
  test.use({ deviceScaleFactor: 1, isMobile: false, hasTouch: false });
test('landing page renders and links to booking', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}/10-landing-hero.png` });
  await page.mouse.wheel(0, 2200);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SHOTS}/11-landing-flythrough.png` });
  expect(errors, errors.join('\n')).toEqual([]);
});
});
