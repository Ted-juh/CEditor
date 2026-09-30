/**
 * fontWorker.mjs — the font worker runs in the WebView, and the page stays responsive while it works.
 *
 * Builds the glyph atlas of a variable panel face (Rubik at 650) twice, from cold each time: once on
 * the page (glyphAtlas) and once through the worker (glyphAtlasAsync), recording the longest task the
 * page ran meanwhile. On the page the build is one long task (200-300 ms in headless Chromium);
 * through the worker there is none. The two atlases must be identical, and a carried face must
 * subset the same through the worker as on the page.
 *
 * Run: CE_BEHAVIOUR_URL=http://127.0.0.1:5199/ node browser-checks/fontWorker.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const base = process.env.CE_BEHAVIOUR_URL ?? 'http://127.0.0.1:5199/';
const mono = `data:font/woff2;base64,${readFileSync(new URL('../src/assets/fonts/liberation-mono-regular.woff2', import.meta.url)).toString('base64')}`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const failures = [];
const check = (name, fn) => {
  try { fn(); console.log(`  ok  ${name}`); } catch (error) { failures.push(name); console.log(`  FAIL ${name}\n       ${error.message}`); }
};

const page = await browser.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
await page.goto(`${base}player.html`);
await page.waitForFunction(() => typeof window.__CE_LOAD_PANEL__ === 'function', null, { timeout: 30000 });

const result = await page.evaluate(async (mono) => {
  const fonts = await import('/src/CE_Application/utils/fontSources.js');
  const client = await import('/src/CE_Application/utils/fontWorkerClient.js');
  const spec = { family: 'Rubik', weight: 650, style: 'normal' };

  // The longest task the page ran while `work` did its job (the Long Tasks API: anything over 50 ms
  // that kept the main thread from drawing or answering input). 0 when there was none.
  async function stall(work) {
    let worst = 0;
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) worst = Math.max(worst, entry.duration);
    });
    observer.observe({ type: 'longtask', buffered: false });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const value = await work();
    await new Promise((resolve) => setTimeout(resolve, 100));
    observer.disconnect();
    return { value, worst: Math.round(worst) };
  }

  fonts.clearFontCache();
  const resolved = await fonts.resolveFont('Rubik', { weight: 650 });
  const onPage = await stall(async () => fonts.glyphAtlas(resolved, spec));

  fonts.clearFontCache();
  const again = await fonts.resolveFont('Rubik', { weight: 650 });
  const inWorker = await stall(() => fonts.glyphAtlasAsync(again, spec));

  const { panelCharacters, subsetFontDataUrl } = await import('/src/CE_Application/utils/fontSubset.js');
  const chars = panelCharacters({ controls: [{ _type: 'Label', _children: { Text: { content: 'Hello' } } }] });
  const subsetPage = await subsetFontDataUrl(mono, chars);
  const subsetWorker = await client.subsetFontInWorker(mono, chars);

  return {
    status: client.fontWorkerStatus(),
    same: JSON.stringify(onPage.value) === JSON.stringify(inWorker.value),
    kern: Object.keys(inWorker.value.kern).length,
    pageStall: onPage.worst,
    workerStall: inWorker.worst,
    subsetSame: subsetPage === subsetWorker,
    subsetShrank: subsetWorker.length < mono.length,
  };
}, mono);

console.log(`  atlas on the page: longest task ${result.pageStall} ms; through the worker: ${result.workerStall} ms`);
check('the worker started and did the work', () => assert.equal(result.status, 'worker'));
check('the worker\'s atlas is identical to the page\'s', () => assert.ok(result.same && result.kern > 0));
check('the page keeps drawing while the worker builds', () => {
  assert.ok(result.pageStall > 100, `building on the page should be one long task (${result.pageStall} ms)`);
  assert.ok(result.workerStall < result.pageStall / 3, `worker ${result.workerStall} ms vs page ${result.pageStall} ms`);
});
check('a carried face subsets the same in the worker as on the page', () => assert.ok(result.subsetSame && result.subsetShrank));
check('no page errors', () => assert.deepEqual(errors, []));

await browser.close();
if (failures.length) { console.log(`\n${failures.length} failure(s)`); process.exit(1); }
console.log('\nfont worker: all checks passed');
