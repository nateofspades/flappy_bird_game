import { test, expect } from '@playwright/test';

const viewports = [
  [1920, 1080], [1366, 768], [768, 1024], [390, 844], [320, 568], [844, 390],
];

async function begin(page) {
  await page.goto('/?test=1');
  await page.getByRole('button', { name: 'Start game' }).click();
  await page.evaluate(() => { window.__flappy.game.advance(3); window.__flappy.render(); });
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'playing');
}

test('loads without console errors or failed requests', async ({ page }) => {
  const errors = [], failures = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => failures.push(request.url()));
  await page.goto('/');
  await expect(page).toHaveTitle(/Flappy Bird/);
  await expect(page.locator('canvas')).toBeVisible();
  expect(errors).toEqual([]); expect(failures).toEqual([]);
});

for (const [width, height] of viewports) {
  test(`essential game board fits ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    const fit = await page.evaluate(() => {
      const board = document.querySelector('.game-shell').getBoundingClientRect();
      const start = document.querySelector('#start-button').getBoundingClientRect();
      return { board, start, sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, vw: innerWidth, vh: innerHeight };
    });
    expect(fit.board.top).toBeGreaterThanOrEqual(0); expect(fit.board.bottom).toBeLessThanOrEqual(height);
    expect(fit.start.bottom).toBeLessThanOrEqual(height); expect(fit.sw).toBeLessThanOrEqual(width); expect(fit.sh).toBeLessThanOrEqual(height);
  });
}

test('continues when browser storage access is denied', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() { throw new DOMException('storage denied', 'SecurityError'); },
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'countdown');
  expect(await page.evaluate(() => Boolean(window.__flappy))).toBe(true);
  expect(errors).toEqual([]);
});

test('continues when Web Audio construction fails', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    class DeniedAudioContext { constructor() { throw new Error('audio unavailable'); } }
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: DeniedAudioContext });
    Object.defineProperty(window, 'webkitAudioContext', { configurable: true, value: undefined });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'countdown');
  expect(errors).toEqual([]);
});

test('keyboard and mouse flap during play', async ({ page }) => {
  await begin(page);
  await page.keyboard.press('Space');
  expect(await page.evaluate(() => window.__flappy.game.bird.vy)).toBeLessThan(0);
  await page.evaluate(() => { window.__flappy.game.bird.vy = 50; });
  await page.locator('canvas').click({ position: { x: 180, y: 250 } });
  expect(await page.evaluate(() => window.__flappy.game.bird.vy)).toBeLessThan(0);
});

test('real touchscreen tap flaps and page does not scroll', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage(); await begin(page);
  await page.evaluate(() => { window.__flappy.game.bird.vy = 50; });
  await page.touchscreen.tap(195, 350);
  expect(await page.evaluate(() => window.__flappy.game.bird.vy)).toBeLessThan(0);
  expect(await page.evaluate(() => ({ x: scrollX, y: scrollY }))).toEqual({ x: 0, y: 0 });
  await context.close();
});

test('controls cover countdown, pause, resume, sound and restart states', async ({ page }) => {
  await page.goto('/?test=1');
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'countdown');
  await page.evaluate(() => { window.__flappy.game.advance(3); window.__flappy.render(); });
  await page.getByRole('button', { name: 'Pause game' }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'paused');
  await page.locator('#start-button').click();
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'playing');
  await page.getByRole('button', { name: 'Mute sound' }).click();
  await expect(page.getByRole('button', { name: 'Enable sound' })).toHaveAttribute('aria-pressed', 'false');
  await page.evaluate(() => { window.__flappy.game.gameOver(); window.__flappy.render(); });
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'gameover');
  await page.getByRole('button', { name: 'Restart game' }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'countdown');
});

test('visibility loss pauses an active game', async ({ page }) => {
  await begin(page);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'playing');
  await page.evaluate(() => window.__flappy.handleVisibility(true));
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'paused');
});

test('deterministic loss fixture reaches game over', async ({ page }) => {
  await page.goto('/?fixture=loss');
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'gameover');
  await expect(page.getByText('Game Over')).toBeVisible();
});
