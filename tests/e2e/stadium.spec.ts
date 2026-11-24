import { expect, test, type Page } from '@playwright/test';

const SHOTS = 'docs/screenshots/stadium';

test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false });

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

/** Runs `fn(handle)` in the page; handle = { nav, geo, useStadium }. */
async function arena<T>(page: Page, fn: string): Promise<T> {
  return page.evaluate(`(async () => { const A = window.__arenaTest; return (${fn})(A); })()`) as Promise<T>;
}

async function settle(page: Page, extra = 500) {
  await page.waitForFunction(() => {
    const A = (window as unknown as { __arenaTest?: { useStadium: { getState(): { transitioning: boolean } } } }).__arenaTest;
    return !!A && !A.useStadium.getState().transitioning;
  }, undefined, { timeout: 20_000 });
  await page.waitForTimeout(extra);
}

const level = (page: Page) => arena<string>(page, 'A => A.useStadium.getState().level');

test('stadium: aerial → North Stand → Block 232 → R10 S8 → VIP Skybox 12 Seat 5 → confirm', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = collectErrors(page);
  await page.goto('/stadium/city-derby?e2e');
  await page.waitForFunction(() => !!(window as unknown as { __arenaTest?: unknown }).__arenaTest, undefined, { timeout: 30_000 });
  await expect(page.locator('canvas').first()).toBeVisible();
  await page.waitForTimeout(3500);

  // ---- Aerial: real mouse sweep must hover all 8 stands.
  const seen = new Set<string>();
  for (let y = 250; y <= 700; y += 18) {
    for (let x = 450; x <= 1000; x += 18) {
      await page.mouse.move(x, y);
      const h = await arena<{ type: string; standId?: string } | null>(page, 'A => A.useStadium.getState().hover');
      if (h?.type === 'stand' && h.standId) seen.add(h.standId);
    }
    if (seen.size === 8) break;
  }
  expect([...seen].sort()).toEqual(['E', 'N', 'NE', 'NW', 'S', 'SE', 'SW', 'W']);

  await arena(page, `A => A.nav.pointer({ type: 'stand', standId: 'SW' }, 'over')`);
  await expect(page.getByText('South-West Corner')).toBeVisible();
  await expect(page.getByText('79 left')).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/01-aerial-hover.png` });
  await arena(page, `A => A.nav.pointer({ type: 'stand', standId: 'NW' }, 'over')`);
  await expect(page.getByText('12 left')).toBeVisible();

  // ---- Stand level
  await arena(page, `A => A.nav.selectStand('N')`);
  await settle(page, 800);
  expect(await level(page)).toBe('stand');
  await arena(page, `A => A.nav.pointer({ type: 'block', blockId: 234 }, 'over')`);
  await expect(page.getByText('Block 234')).toBeVisible();
  await expect(page.getByText('Sold out')).toBeVisible();
  await arena(page, `A => A.nav.pointer({ type: 'block', blockId: 331 }, 'over')`);
  await expect(page.getByText('Block 331')).toBeVisible();
  await expect(page.getByText('73 left')).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/02-stand-level.png` });
  // Sold-out block can't be entered.
  await arena(page, `A => A.nav.selectBlock(234)`);
  await page.waitForTimeout(300);
  expect(await level(page)).toBe('stand');

  // ---- Block level + seat hovers
  await arena(page, `A => A.nav.selectBlock(232)`);
  await settle(page, 800);
  expect(await level(page)).toBe('block');
  await arena(page, `A => A.nav.pointer({ type: 'seat', seatIndex: A.geo.seatIndexOf(232, 11, 12) }, 'over')`);
  await expect(page.getByText('Taken', { exact: true })).toBeVisible();
  await arena(page, `A => A.nav.pointer({ type: 'seat', seatIndex: A.geo.seatIndexOf(232, 10, 8) }, 'over')`);
  await expect(page.getByText('Row 10 · Seat 8')).toBeVisible();
  await page.waitForTimeout(1200); // live-rendered thumbnail
  await page.screenshot({ path: `${SHOTS}/03-block-seat-hover.png` });

  // ---- Ticket
  await arena(page, `A => A.nav.selectSeat(A.geo.seatIndexOf(232, 10, 8))`);
  await settle(page, 1800);
  expect(await level(page)).toBe('ticket');
  await expect(page.getByText('Block 232').first()).toBeVisible();
  await expect(page.getByText('N3', { exact: true })).toBeVisible();
  await expect(page.getByText(/Upgrade · \+2,500 AED/)).toBeVisible();
  // The "Your view" image is a real render (blob/data URL), not a placeholder.
  const viewImg = page.locator('[role="img"][aria-busy="false"]').first();
  await expect(viewImg).toBeVisible({ timeout: 15_000 });
  await expect(viewImg.locator('[style*="blob:"], [style*="data:image"]').first()).toBeAttached();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/04-ticket.png` });

  // ---- VIP card
  await page.getByRole('button', { name: /Upgrade/ }).click();
  await expect(page.getByText('Skybox 12').first()).toBeVisible();
  await expect(page.getByText('3,750', { exact: true }).first()).toBeAttached();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/05-vip-card.png` });

  // ---- Skybox ring
  await page.getByRole('button', { name: /Choose your VIP seat/ }).click();
  await settle(page, 800);
  expect(await level(page)).toBe('skyboxes');
  await arena(page, `A => A.nav.pointer({ type: 'skybox', skyboxId: 11 }, 'over')`);
  await expect(page.getByText('Skybox 11')).toBeVisible();
  await expect(page.getByText('Sold out')).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/06-skyboxes.png` });

  // ---- Inside Skybox 12
  await arena(page, `A => A.nav.enterSkybox(12)`);
  await settle(page, 800);
  expect(await level(page)).toBe('box');
  await arena(page, `A => A.nav.pointer({ type: 'chair', skyboxId: 12, chair: 5 }, 'over')`);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/07-inside-skybox.png` });

  // ---- Pitch view from Skybox 12 Seat 5
  await arena(page, `A => A.nav.selectChair(5)`);
  await settle(page, 1000);
  expect(await level(page)).toBe('boxView');
  await expect(page.getByText('Another view')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirm ticket' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose another seat' })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/08-pitch-view.png` });

  // ---- Back with Esc all the way to aerial (each step flies)
  for (let i = 0; i < 8 && (await level(page)) !== 'aerial'; i++) {
    await page.keyboard.press('Escape');
    await settle(page, 200);
  }
  expect(await level(page)).toBe('aerial');

  // ---- Breadcrumb-free deep path again, then confirm the VIP ticket
  await arena(page, `async A => { await A.nav.selectStand('N'); await A.nav.selectBlock(232); await A.nav.selectSeat(A.geo.seatIndexOf(232, 10, 8)); A.nav.showUpgrade(); await A.nav.chooseVipSeat(); await A.nav.enterSkybox(12); await A.nav.selectChair(5); }`);
  await settle(page, 800);
  await page.getByRole('button', { name: 'Confirm ticket' }).click();
  await expect(page.getByRole('button', { name: /Pay AED 3,750/ })).toBeVisible({ timeout: 10_000 });
  await page.getByLabel('Name').fill('Alex Doe');
  await page.getByLabel('Email').fill('alex@example.com');
  await page.screenshot({ path: `${SHOTS}/09-checkout.png` });
  await page.getByRole('button', { name: /Pay AED 3,750/ }).click();
  await page.waitForURL(/\/stadium\/city-derby\/confirm\?ref=/, { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Ticket confirmed' })).toBeVisible();
  await expect(page.getByRole('article', { name: /Skybox 12 · Seat 5/ })).toBeVisible();
  await expect(page.getByLabel(/QR code for booking/)).toBeVisible();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${SHOTS}/10-confirmation.png` });

  expect(errors, errors.join('\n')).toEqual([]);
});

test('stadium: aerial fps and landing page', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await page.goto('/stadium/city-derby?e2e');
  await page.waitForTimeout(6000);
  const fps = await page.evaluate(
    () =>
      new Promise<number>((res) => {
        let n = 0;
        const s = performance.now();
        const f = () => {
          n++;
          if (performance.now() - s < 3000) requestAnimationFrame(f);
          else res(n / 3);
        };
        requestAnimationFrame(f);
      }),
  );
  console.log('aerial fps (headless):', fps.toFixed(1));

  await page.goto('/stadium');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOTS}/11-landing-hero.png` });
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/13-landing-closing.png` });
  expect(errors, errors.join('\n')).toEqual([]);
});
