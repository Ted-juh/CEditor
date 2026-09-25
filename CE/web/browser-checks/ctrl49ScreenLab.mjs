// CTRL49 screen lab (tools/ctrl49/screen-lab): both Lua pages render every page from payloads
// shaped as Ctrl49ScreenLab.h builds them, the JS ports of those payloads match the C++ golden,
// and nothing throws. CTRL49_LAB_SHOTS=<dir> also writes a PNG of every page.
import { createServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const here = fileURLToPath(new URL('.', import.meta.url));
const repo = path.resolve(here, '../../..');
const shots = process.env.CTRL49_LAB_SHOTS;

// The golden lives in the C++ test; read it from there so there is exactly one copy.
const cppTest = fs.readFileSync(path.join(repo, 'CE/tests/Ctrl49ScreenLabTests.cpp'), 'utf8');
const golden = cppTest.match(/kGoldenEnvelope \{([^}]*)\}/)[1].split(',').map((s) => s.trim()).filter(Boolean).map(Number);

const server = await createServer({ configFile: false, plugins: [svelte()], root: here,
  cacheDir: fileURLToPath(new URL('../node_modules/.vite-ctrl49-lab', import.meta.url)),
  optimizeDeps: { entries: ['ctrl49ScreenLab.html'] },
  server: { host: '127.0.0.1', port: 18766, fs: { allow: [repo] } }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH
  ?? (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
    : '/opt/pw-browsers/chromium-1194/chrome-linux/chrome') });
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/ctrl49ScreenLab.html`);
  await page.waitForFunction(() => window.ready === true, null, { timeout: 60000 });

  assert.deepEqual(await page.evaluate(() => window.lab.envelope(32, 64, 80, 40)), golden,
    'the preview builds the same envelope bytes the tool sends');

  const shot = async (name) => { if (shots) await page.locator('#screen').screenshot({ path: path.join(shots, `${name}.png`) }); };
  const names = ['faders', 'pads', 'sequencer', 'envelope', 'meters'];
  for (let p = 0; p < names.length; p++) {
    const calls = await page.evaluate((p) => {
      const lab = window.lab;
      lab.showcase.call('set_envelope', lab.envelope(20, 70, 90, 60));
      lab.showcase.call('set_frame', lab.showcaseFrame(p, 12, [70, 30, 110, 64, 96, 50, 0, 88], 1, 6, 30, 26, 0b00010001));
      return lab.showcase.draw();
    }, p);
    const colours = await page.evaluate(() => window.lab.colours());
    assert.ok(calls.rect + calls.image + calls.text > 10, `${names[p]} draws`);
    assert.ok(colours > 20, `${names[p]} is a picture, not a flat fill (${colours} colours)`);
    await shot(`showcase-${p + 1}-${names[p]}`);
    console.log(`  ${names[p].padEnd(10)} ${calls.rect} rects, ${calls.image} images, ${calls.text} texts`);
  }

  // The stress page at a middling load: it draws what it is asked, and decodes memory blocks
  // one per redraw until it has as many as asked.
  const stress = await page.evaluate(() => {
    const lab = window.lab;
    const frame = [10, 12, 20, 1, 3, 9, 0, 42];      // 160 rects, 96 sprites, 20 texts, 1 full, 3 MB
    let calls;
    for (let i = 0; i < 4; i++) { lab.stress.call('set_load', frame); calls = lab.stress.draw(); }
    return calls;
  });
  assert.equal(stress.rect >= 160 && stress.text >= 20, true, 'the stress page draws the asked-for load');
  assert.equal(stress.image, 96 + 1 + 3, 'sprites, the full-screen blit and one swatch per decoded block');
  await shot('stress');
  console.log(`  stress     ${stress.rect} rects, ${stress.image} images, ${stress.text} texts`);

  assert.deepEqual(errors, []);
  console.log('CTRL49 screen lab checks passed: payload ports match the C++ golden, all six pages render.');
} finally { await browser.close(); await server.close(); }
