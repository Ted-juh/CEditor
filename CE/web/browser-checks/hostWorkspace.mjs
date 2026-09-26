// The HoSTage workspace itself, in a real browser: the dock between the rack and the part editor
// has a visible grip that resizes it, and every text field selects all its text on click.
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromiumLaunchOptions } from './chromiumLaunch.mjs';

const server = await createServer({
  configFile: fileURLToPath(new URL('../vite.config.js', import.meta.url)),
  root: fileURLToPath(new URL('..', import.meta.url)),
  cacheDir: fileURLToPath(new URL('../node_modules/.vite-host-workspace-check', import.meta.url)),
  optimizeDeps: { entries: ['host.html'] },
  server: { host: '127.0.0.1', port: 18773, strictPort: true },
  logLevel: 'error',
});
await server.listen();
const browser = await chromium.launch(chromiumLaunchOptions({ channel: 'msedge' }));

try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1400 } });
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/host.html`);
  await page.getByRole('button', { name: 'Rack', exact: true }).first().click();

  // The dock: a grip you can see, which drags the editor taller.
  const dock = page.getByTestId('host-dock');
  const grip = dock.getByRole('separator', { name: 'Resize the dock' });
  const gripBg = await grip.evaluate((el) => getComputedStyle(el).backgroundColor);
  assert.notEqual(gripBg, 'rgba(0, 0, 0, 0)', 'the grip is visible, not a transparent strip');
  await page.getByTestId('dock-tab-zone').click();
  const before = (await dock.boundingBox()).height;
  const g = await grip.boundingBox();
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  await page.mouse.move(g.x + g.width / 2, g.y - 500, { steps: 10 });
  await page.mouse.up();
  const after = (await dock.boundingBox()).height;
  assert.ok(after > before + 300, `dragging the grip up gives the editor room (${before} -> ${after})`);
  assert.ok(after > 600, 'past the old 520 px cap, in a tall window');

  // Select all on click, anywhere in HoSTage.
  await page.getByTestId('dock-tab-sounds').click();
  const search = page.getByPlaceholder(/Search sounds/);
  await search.fill('warm pad');
  await page.getByTestId('dock-tab-zone').click();
  await page.getByTestId('dock-tab-sounds').click();
  await search.click();
  const selected = await search.evaluate((el) => [el.selectionStart, el.selectionEnd, el.value.length]);
  assert.deepEqual(selected, [0, 8, 8], 'clicking a text field selects all of it');
  await search.click();
  const caret = await search.evaluate((el) => el.selectionEnd - el.selectionStart);
  assert.equal(caret, 0, 'a second click places the caret, as usual');

  assert.deepEqual(errors, [], 'no uncaught page errors');
  console.log('hostWorkspace: the dock grip resizes the editor, and fields select all on click');
} finally {
  await browser.close();
  await server.close();
}
