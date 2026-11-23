/**
 * File → Export Picture, held to the screen.
 *
 * The GAIA panel, drawn by the editor's own surface, is pictured by the export's own code
 * (stores/pictureExport.js → utils/domPicture.js) and the picture compared with Chromium's
 * screenshot of the same surface, at 1× and at 2×. Then what the export promises beyond a
 * screenshot: a selected control's outline is not in the picture, a selection on its own comes out
 * on transparency, and a filmstrip moves from frame to frame.
 *
 * Chromium is WebView2's engine, so this is the renderer the app's export runs on.
 * PICTURE_OUT=<dir> keeps the pictures.
 */
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromiumLaunchOptions } from './chromiumLaunch.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../dist-scenery');
const PANEL = process.env.PICTURE_PANEL || join(HERE, '../../panels/Roland GAIA SH-01.cepanel');
const OUT = process.env.PICTURE_OUT ?? '';
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2',
  '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf',
};

const server = createServer(async (req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  try {
    const body = url === '/panel.json' ? await readFile(PANEL) : await readFile(join(ROOT, url));
    res.writeHead(200, { 'content-type': url === '/panel.json' ? 'application/json' : (TYPES[extname(url)] ?? 'application/octet-stream') });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});
await new Promise((resolve) => server.listen(0, resolve));
const base = `http://127.0.0.1:${server.address().port}`;

// LCD (subpixel) text off: on Windows the page's own text is drawn with ClearType's coloured edges,
// and text drawn inside an image never is, so a screenshot and a picture of the same words differ at
// every glyph edge for a reason that has nothing to do with the picture.
const browser = await chromium.launch({ ...chromiumLaunchOptions(), args: ['--disable-lcd-text'] });
const errors = [];

async function openAt(deviceScaleFactor) {
  const page = await browser.newPage({ viewport: { width: 1960, height: 1040 }, deviceScaleFactor });
  page.on('pageerror', (error) => errors.push(String(error).slice(0, 300)));
  await page.goto(`${base}/pictureExport.html`);
  await page.waitForFunction(() => !!window.__picture, null, { timeout: 30000 });
  const panel = await page.evaluate(() => window.__picture.load('/panel.json'));
  await page.waitForFunction(() => !document.querySelector('.panel-surface')?.hasAttribute('data-mount-pending'), null, { timeout: 120000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(2500);
  return { page, panel };
}

// The editor marks every component on the canvas with a dashed outline and a "component" tab. The
// picture leaves those out by design, so the screen it is held to has them hidden too.
const HIDE_EDITOR_HINTS = '.canvas-control.custom-component-hint::before, .canvas-control.custom-component-hint::after { display: none !important; }';

async function screenshotUrl(page) {
  await page.addStyleTag({ content: HIDE_EDITOR_HINTS });
  const box = await page.evaluate(() => window.__picture.box());
  const png = await page.screenshot({ clip: box });
  return `data:image/png;base64,${png.toString('base64')}`;
}

async function keep(page, name) {
  if (!OUT) return;
  await mkdir(OUT, { recursive: true });
  const url = await page.evaluate(() => window.__picture.lastPictureUrl());
  await writeFile(join(OUT, name), Buffer.from(url.split(',')[1], 'base64'));
}

try {
  // --- 1×: the picture against the screen ---------------------------------------------------------
  const { page, panel } = await openAt(1);
  const shot = await screenshotUrl(page);
  if (OUT) { await mkdir(OUT, { recursive: true }); await writeFile(join(OUT, 'screen-1x.png'), Buffer.from(shot.split(',')[1], 'base64')); }
  const first = await page.evaluate(() => window.__picture.picture({ scale: 1 }));
  console.log('1×:', JSON.stringify(first));
  assert.equal(first.ok, true, first.reason);
  assert.equal(first.width, panel.width);
  assert.equal(first.height, panel.height);
  assert.deepEqual(first.missing, [], 'every file the panel uses travels with the picture');
  const one = await page.evaluate((url) => window.__picture.compareWith(url), shot);
  console.log('1× against the screenshot:', JSON.stringify(one));
  await keep(page, 'panel-1x.png');
  assert.ok(!one.sizeMismatch, `same size as the screenshot: ${one.sizeMismatch}`);
  assert.ok(one.far < 0.004, `at most 0.4% of pixels far from the screen (got ${(one.far * 100).toFixed(3)}%, most at x,y:count ${one.cells.join(' ')})`);
  assert.ok(one.mean < 1.5, `mean difference under 1.5 levels (got ${one.mean.toFixed(2)})`);

  // --- The editor's marks stay out ----------------------------------------------------------------
  const buttonId = await page.evaluate(() => window.__picture.firstOfType('Button'));
  await page.evaluate((id) => window.__picture.select([id]), buttonId);
  await page.waitForTimeout(300);
  const selectedShot = await screenshotUrl(page);
  const withSelection = await page.evaluate(() => window.__picture.picture({ scale: 1 }));
  assert.equal(withSelection.ok, true);
  await keep(page, 'panel-selected-1x.png');
  if (OUT) await writeFile(join(OUT, 'screen-selected-1x.png'), Buffer.from(selectedShot.split(',')[1], 'base64'));
  const unmarked = await page.evaluate((url) => window.__picture.compareWith(url), shot);
  const marked = await page.evaluate((url) => window.__picture.compareWith(url), selectedShot);
  console.log('selected: picture vs unselected screen', JSON.stringify(unmarked), '| vs selected screen', JSON.stringify(marked));
  assert.ok(unmarked.far <= one.far + 0.0002, 'a selected control is pictured as if nothing were selected');
  assert.ok(marked.far > 0, 'and the comparison does see the handles on the screen, so it would see them in a picture');

  // --- The selection, alone on transparency ---------------------------------------------------------
  const knob = await page.evaluate(() => window.__picture.firstComponentWithRange());
  console.log('component:', JSON.stringify(knob));
  const knobId = knob.id;
  const alone = await page.evaluate((id) => window.__picture.picture({ what: 'selection', ids: [id], alone: true, scale: 2 }), knobId);
  console.log('selection alone:', JSON.stringify(alone));
  assert.equal(alone.ok, true, alone.reason);
  assert.ok(alone.width < panel.width && alone.height < panel.height, 'cropped to the control');
  const cover = await page.evaluate(() => window.__picture.coverage());
  console.log('coverage:', JSON.stringify(cover));
  assert.ok(cover.solid > 0.05, 'the control is drawn');
  // It sits in a container with a dark plate; alone, the plate is not drawn and the picture shows
  // through where the control draws nothing.
  assert.ok(cover.clear > 0.2, 'what is behind the control is left out');
  await keep(page, 'selection-alone-2x.png');

  // --- Filmstrips ---------------------------------------------------------------------------------
  const toggleId = await page.evaluate(() => window.__picture.firstOfType('ToggleButton'));
  const toggleStrip = await page.evaluate((id) => window.__picture.filmstrip(id, { scale: 1 }), toggleId);
  console.log('switch filmstrip:', JSON.stringify(toggleStrip));
  assert.equal(toggleStrip.ok, true, toggleStrip.reason);
  assert.equal(toggleStrip.count, 2);
  assert.ok(toggleStrip.changes[0] > 0, 'on looks different from off');
  await keep(page, 'switch-strip.png');

  const knobStrip = await page.evaluate((id) => window.__picture.filmstrip(id, { frames: 5, scale: 2, margin: 4 }), knobId);
  console.log('component filmstrip:', JSON.stringify(knobStrip));
  assert.equal(knobStrip.ok, true, knobStrip.reason);
  assert.equal(knobStrip.count, 5);
  assert.equal(knobStrip.height, knobStrip.frameHeight * 5);
  await keep(page, 'component-strip.png');
  await page.close();

  // --- 2×: text re-rendered at the size, not enlarged -----------------------------------------------
  const { page: page2 } = await openAt(2);
  const shot2 = await screenshotUrl(page2);
  if (OUT) await writeFile(join(OUT, 'screen-2x.png'), Buffer.from(shot2.split(',')[1], 'base64'));
  const second = await page2.evaluate(() => window.__picture.picture({ scale: 2 }));
  assert.equal(second.ok, true, second.reason);
  const two = await page2.evaluate((url) => window.__picture.compareWith(url), shot2);
  console.log('2× against a 2× screenshot:', JSON.stringify(two), `${second.ms} ms`);
  await keep(page2, 'panel-2x.png');
  assert.ok(!two.sizeMismatch, `same size as the screenshot: ${two.sizeMismatch}`);
  assert.ok(two.far < 0.004, `at most 0.4% of pixels far from the 2× screen (got ${(two.far * 100).toFixed(3)}%, most at x,y:count ${two.cells.join(' ')})`);
  await page2.close();

  assert.deepEqual(errors, [], 'the page must not throw');
  console.log('pictureExport: ok');
} finally {
  await browser.close();
  server.close();
}
