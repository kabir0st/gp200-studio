// Regenerate the guide/README screenshots in public/guide/, light and dark.
//
// Every surface is captured twice: `NN-name.png` (light) and `NN-name-dark.png`.
// Run the dev server first (`npm run dev`), then `node scripts/capture-guide-shots.mjs`.
// Chromium comes from playwright-core's browser cache; the fake capture device
// flags let the loop station record without a real GP-200 attached.
//
// The board itself is seeded from a real .prst under dumps/ (gitignored) so the
// shots show an actual patch rather than a blank INIT. Set GUIDE_FIXTURE to
// pick a different one; if the file is missing the run still works, it just
// photographs the default preset.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const ORIGIN = process.env.GUIDE_ORIGIN ?? 'http://localhost:5173/';
const OUT = join(process.cwd(), 'public/guide');
const FIXTURE = join(
  process.cwd(),
  process.env.GUIDE_FIXTURE ?? 'dumps/prts/07-D Scotland Kiss.prst',
);
// 1920x1000 at 1.25x → 2400x1250: the same 2400px width the guide shots have
// always had, but at a viewport wide enough that useBoardFit leaves the board
// at zoom 1. Anything narrower shrinks the pedals to make the chain fit, which
// is correct behaviour and a poor photograph of it.
const VIEWPORT = { width: 1920, height: 1000 };
const SCALE = 1.25;

const results = [];

function suffix(theme) {
  if (theme === 'dark') return '-dark';
  return '';
}

/** Capture one surface, logging rather than aborting the run when it fails. */
async function shot(page, theme, name, prepare, options = {}) {
  const file = join(OUT, `${name}${suffix(theme)}.png`);
  try {
    await prepare();
    await page.waitForTimeout(options.settle ?? 400);
    await page.screenshot({ path: file, clip: options.clip });
    results.push(`  ok   ${name}${suffix(theme)}`);
  } catch (error) {
    results.push(`  FAIL ${name}${suffix(theme)} , ${error.message.split('\n')[0]}`);
  }
}

/** Close whatever dialog/drawer is open, so the next surface starts clean. */
async function closeOverlays(page) {
  for (let attempt = 0; attempt < 4; attempt++) {
    if ((await page.locator('[role="dialog"]').count()) === 0) return;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
  }
}

async function captureTheme(browser, theme) {
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: SCALE });
  page.on('pageerror', (error) => console.log(`PAGEERROR(${theme}):`, error.message));
  await page.addInitScript((mode) => {
    localStorage.setItem('gp200:theme', mode);
    localStorage.setItem('gp200-studio.looper.mode', 'simple');
    // index.html stamps data-theme before first paint; documentElement may not
    // exist yet this early, so only help it along when it does.
    if (document.documentElement) document.documentElement.dataset.theme = mode;
  }, theme);

  await page.goto(ORIGIN, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  await shot(page, theme, '01-landing', async () => {});

  await page.getByRole('button', { name: /open without connecting/i }).click();
  await page.waitForTimeout(800);

  // Seed a real patch so the board is photographed with actual pedals in it.
  if (existsSync(FIXTURE)) {
    await page.getByRole('button', { name: /^patches$/i }).first().click();
    await page.waitForTimeout(500);
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: /import \.prst/i }).click();
    await (await chooser).setFiles(FIXTURE);
    await page.waitForTimeout(900);
    await closeOverlays(page);
    // useBoardFit binary-searches the zoom from a ResizeObserver callback, so
    // the layout is still moving for a beat after the pedals change.
    await page.waitForTimeout(1500);
  }

  await shot(page, theme, '02-editor-board', async () => {});

  // The chain strip + info line as their own strip, the way the guide crops it.
  await shot(page, theme, '04-info-bar-chain', async () => {}, {
    clip: await (async () => {
      const strip = await page.locator('.chain-strip').boundingBox();
      const info = await page.locator('.info-bar').boundingBox();
      return {
        x: 0,
        y: strip.y,
        width: VIEWPORT.width,
        height: info.y + info.height - strip.y,
      };
    })(),
  });

  await shot(page, theme, '03-effect-picker', async () => {
    await page.getByRole('button', { name: /^Change .* effect:/ }).nth(3).click();
  }, { settle: 700 });
  await closeOverlays(page);

  await shot(page, theme, '05-deck-fxloop', async () => {
    await page.getByRole('button', { name: /fx loop/i }).first().click();
  }, { settle: 600 });
  await closeOverlays(page);

  await shot(page, theme, '06-deck-exp', async () => {
    await page.getByRole('button', { name: /^settings$/i }).first().click();
    await page.waitForTimeout(400);
    await page.getByRole('tab', { name: /expression/i }).click();
  }, { settle: 600 });

  await shot(page, theme, '07-deck-ctrl', async () => {
    await page.getByRole('tab', { name: /footswitches/i }).click();
  }, { settle: 600 });
  await closeOverlays(page);

  await shot(page, theme, '11-drums', async () => {
    await page.getByRole('button', { name: /^drums$/i }).first().click();
  }, { settle: 700 });
  await closeOverlays(page);

  await shot(page, theme, '10-patch-manager', async () => {
    await page.getByRole('button', { name: /^patches$/i }).first().click();
  }, { settle: 600 });

  await shot(page, theme, '09-export-dialog', async () => {
    await page.getByRole('button', { name: /export \.prst/i }).click();
  }, { settle: 700 });
  await closeOverlays(page);

  // Loop station last: recording two takes costs ~12s of wall clock.
  await page.getByRole('button', { name: /^loop$/i }).first().click();
  await page.waitForTimeout(1200);
  const enable = page.getByRole('button', { name: /enable audio in/i });
  if (await enable.count()) {
    await enable.click();
    await page.waitForTimeout(2000);
  }
  const rec = page.locator('[role="dialog"] button')
    .filter({ hasText: /RECORD|STOP|LISTENING|ARMED|ADD A TAKE/ }).first();
  await rec.click();
  await page.waitForTimeout(3200);
  await rec.click();
  await page.waitForTimeout(1500);
  await rec.click();
  await page.waitForTimeout(4200);
  await rec.click();
  await page.waitForTimeout(1800);

  await shot(page, theme, '08-deck-loop', async () => {});

  await shot(page, theme, '12-loop-advanced', async () => {
    await page.getByRole('button', { name: /^advanced$/i }).click();
    await page.waitForTimeout(400);
    // Takes exist, so RECORD SETUP defaults shut , open it, since it is the
    // thing this face exists to show.
    const setup = page.locator('[role="dialog"] summary').filter({ hasText: /Record setup/i });
    if (await setup.count()) await setup.first().click();
  }, { settle: 700 });

  await page.close();
}

const browser = await chromium.launch({
  args: [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
  ],
});
for (const theme of ['light', 'dark']) {
  results.push(`${theme}:`);
  await captureTheme(browser, theme);
}
await browser.close();
console.log(results.join('\n'));
