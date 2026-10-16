import { test, expect } from '@playwright/test';
import { MASTER_MUSIC_VOLUME } from '../../src/music.js';

const viewports = [
  [1920, 1080],
  [1366, 768],
  [768, 1024],
  [390, 844],
  [320, 568],
  [844, 390],
];

function watchRuntime(page) {
  const errors = [];
  const failures = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => failures.push(`${request.method()} ${request.url()}`));
  return { errors, failures };
}

async function expectNoOverflow(page, width, height) {
  const layout = await page.evaluate(() => {
    const board = document.querySelector('.game-shell').getBoundingClientRect();
    const music = document.querySelector('#music-button').getBoundingClientRect();
    return {
      board: { top: board.top, right: board.right, bottom: board.bottom, left: board.left },
      music: { top: music.top, right: music.right, bottom: music.bottom, left: music.left },
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
    };
  });
  expect(layout.board.top).toBeGreaterThanOrEqual(0);
  expect(layout.board.left).toBeGreaterThanOrEqual(0);
  expect(layout.board.right).toBeLessThanOrEqual(width);
  expect(layout.board.bottom).toBeLessThanOrEqual(height);
  expect(layout.music.left).toBeGreaterThanOrEqual(layout.board.left);
  expect(layout.music.right).toBeLessThanOrEqual(layout.board.right);
  expect(layout.scrollWidth).toBeLessThanOrEqual(width);
  expect(layout.scrollHeight).toBeLessThanOrEqual(height);
}

async function begin(page) {
  await page.getByRole('button', { name: 'Start game' }).click();
  await page.evaluate(() => { window.__flappy.game.advance(3); window.__flappy.render(); });
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'playing');
}

for (const [width, height] of viewports) {
  test(`gameplay, music continuity, and layout hold at ${width}x${height}`, async ({ page }) => {
    const runtime = watchRuntime(page);
    await page.setViewportSize({ width, height });
    await page.goto('/?test=1');

    await expect(page).toHaveTitle(/Flappy Bird/);
    await expect(page.getByRole('button', { name: 'Turn music off' })).toHaveText('Music On');
    expect(await page.evaluate(() => window.__flappy.music.context)).toBeNull();
    await expectNoOverflow(page, width, height);

    await begin(page);
    await expect.poll(() => page.evaluate(() => window.__flappy.music.started)).toBe(true);
    await page.evaluate(() => {
      window.__initialMusicContext = window.__flappy.music.context;
      window.__initialMusicTimer = window.__flappy.music.timer;
      window.__initialMusicPosition = window.__flappy.music.nextStepAt;
    });

    await page.keyboard.press('Space');
    expect(await page.evaluate(() => window.__flappy.game.bird.vy)).toBeLessThan(0);
    await page.evaluate(() => { window.__flappy.game.bird.vy = 50; });
    await page.locator('canvas').click({ position: { x: 100, y: 260 } });
    expect(await page.evaluate(() => window.__flappy.game.bird.vy)).toBeLessThan(0);

    await page.getByRole('button', { name: 'Pause game' }).click();
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'paused');
    await page.locator('#start-button').click();
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'playing');
    await page.evaluate(() => { window.__flappy.game.gameOver(); window.__flappy.render(); });
    await page.getByRole('button', { name: 'Restart game' }).click();
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'countdown');

    const resized = { width: Math.max(300, width - 17), height: Math.max(360, height - 13) };
    await page.setViewportSize(resized);
    await expectNoOverflow(page, resized.width, resized.height);
    await page.setViewportSize({ width, height });
    await expectNoOverflow(page, width, height);

    const continuity = await page.evaluate(() => ({
      sameContext: window.__flappy.music.context === window.__initialMusicContext,
      sameTimer: window.__flappy.music.timer === window.__initialMusicTimer,
      contexts: window.__flappy.music.context ? 1 : 0,
      positionDidNotReset: window.__flappy.music.nextStepAt >= window.__initialMusicPosition,
    }));
    expect(continuity).toEqual({ sameContext: true, sameTimer: true, contexts: 1, positionDidNotReset: true });
    expect(runtime.errors).toEqual([]);
    expect(runtime.failures).toEqual([]);
  });
}

test('touch starts, flaps, and leaves the mobile page fixed', async ({ browser, baseURL }) => {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  const runtime = watchRuntime(page);
  await page.goto('/?test=1');
  const start = await page.getByRole('button', { name: 'Start game' }).boundingBox();
  await page.touchscreen.tap(start.x + start.width / 2, start.y + start.height / 2);
  await page.evaluate(() => { window.__flappy.game.advance(3); window.__flappy.render(); });
  await page.evaluate(() => { window.__flappy.game.bird.vy = 50; });
  await page.touchscreen.tap(195, 350);
  expect(await page.evaluate(() => window.__flappy.game.bird.vy)).toBeLessThan(0);
  expect(await page.evaluate(() => ({ x: scrollX, y: scrollY }))).toEqual({ x: 0, y: 0 });
  await expect.poll(() => page.evaluate(() => window.__flappy.music.started)).toBe(true);
  expect(await page.evaluate(() => window.__flappy.music.master.gain.value)).toBeCloseTo(MASTER_MUSIC_VOLUME);

  const musicOff = await page.getByRole('button', { name: 'Turn music off' }).boundingBox();
  await page.touchscreen.tap(musicOff.x + musicOff.width / 2, musicOff.y + musicOff.height / 2);
  await expect.poll(() => page.evaluate(() => window.__flappy.music.master.gain.value)).toBe(0);
  const musicOn = await page.getByRole('button', { name: 'Turn music on' }).boundingBox();
  await page.touchscreen.tap(musicOn.x + musicOn.width / 2, musicOn.y + musicOn.height / 2);
  await expect.poll(() => page.evaluate(() => window.__flappy.music.master.gain.value)).toBeCloseTo(MASTER_MUSIC_VOLUME);
  expect(runtime.errors).toEqual([]);
  expect(runtime.failures).toEqual([]);
  await context.close();
});

test('music toggle persists and starts later without duplicate instances', async ({ page }) => {
  await page.goto('/?test=1');
  await begin(page);
  await page.evaluate(() => { window.__musicContext = window.__flappy.music.context; });
  expect(await page.evaluate(() => window.__flappy.music.master.gain.value)).toBeCloseTo(MASTER_MUSIC_VOLUME);

  await page.getByRole('button', { name: 'Turn music off' }).click();
  await expect(page.getByRole('button', { name: 'Turn music on' })).toHaveText('Music Off');
  await expect(page.getByRole('button', { name: 'Turn music on' })).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => localStorage.getItem('flappy-music-enabled'))).toBe('off');
  expect(await page.evaluate(() => window.__flappy.music.context === window.__musicContext)).toBe(true);
  expect(await page.evaluate(() => window.__flappy.music.master.gain.value)).toBe(0);

  await page.reload();
  await expect(page.getByRole('button', { name: 'Turn music on' })).toHaveText('Music Off');
  expect(await page.evaluate(() => window.__flappy.music.context)).toBeNull();
  await page.getByRole('button', { name: 'Turn music on' }).click();
  await expect.poll(() => page.evaluate(() => window.__flappy.music.started)).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem('flappy-music-enabled'))).toBe('on');
  expect(await page.evaluate(() => window.__flappy.music.master.gain.value)).toBeCloseTo(MASTER_MUSIC_VOLUME);

  await page.getByRole('button', { name: 'Turn music off' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Start game' }).click();
  expect(await page.evaluate(() => window.__flappy.music.context)).toBeNull();
});

test('visibility and browser audio interruptions resume the same loop', async ({ page }) => {
  await page.goto('/?test=1');
  await begin(page);
  await page.evaluate(() => { window.__musicContext = window.__flappy.music.context; });

  await page.evaluate(async () => {
    await window.__flappy.music.context.suspend();
    window.__flappy.handleVisibility(false);
  });
  await expect.poll(() => page.evaluate(() => window.__flappy.music.context.state)).toBe('running');
  expect(await page.evaluate(() => window.__flappy.music.context === window.__musicContext)).toBe(true);

  await page.evaluate(() => window.__flappy.handleVisibility(true));
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'paused');
  await expect.poll(() => page.evaluate(() => window.__flappy.music.context.state)).toBe('suspended');
  await page.evaluate(() => window.__flappy.handleVisibility(false));
  await expect.poll(() => page.evaluate(() => window.__flappy.music.context.state)).toBe('running');
  expect(await page.evaluate(() => window.__flappy.music.context === window.__musicContext)).toBe(true);
});

test('storage and audio denial never prevent gameplay', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() { throw new DOMException('storage denied', 'SecurityError'); },
    });
    class DeniedAudioContext { constructor() { throw new Error('audio unavailable'); } }
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: DeniedAudioContext });
    Object.defineProperty(window, 'webkitAudioContext', { configurable: true, value: undefined });
  });
  await page.goto('/?test=1');
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'countdown');
  expect(await page.evaluate(() => Boolean(window.__flappy))).toBe(true);
  expect(errors).toEqual([]);
});

test('deterministic loss fixture reaches game over', async ({ page }) => {
  await page.goto('/?fixture=loss');
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'gameover');
  await expect(page.getByText('Game Over')).toBeVisible();
});
