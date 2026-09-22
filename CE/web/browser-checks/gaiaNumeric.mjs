import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const server = await createServer({ configFile: fileURLToPath(new URL('./vite.config.mjs', import.meta.url)), server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1600, height: 2000 } });
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
try {
  await page.route('**/gaia-panel.json', async route => route.fulfill({ contentType: 'application/json', body: await readFile(new URL('../../panels/Roland GAIA SH-01.cepanel', import.meta.url), 'utf8') }));
  await page.goto(`${server.resolvedUrls.local[0]}gaiaPages.html`);
  await page.waitForFunction(() => !!window.__gaia, null, { timeout: 90000 });
  await page.evaluate(() => window.__gaia.load('/gaia-panel.json'));
  await page.waitForTimeout(1200);
  async function control(name) {
    const id = await page.evaluate(n => window.__gaia.id(n), name);
    return page.locator(`[data-control-id="${id}"]`).first();
  }
  for (const name of ['common.patchTempo', 'arp.velocity', 'arp.octaveRange', 'arp.accentRate', 'arp.endStep']) {
    assert.equal(await page.getByRole('textbox', { name: `${name} value`, exact: true }).count(), 0, 'no duplicate numeric entry');
  }
  const grid = await control('arp_pattern_grid');
  const ruler = await grid.boundingBox();
  await page.mouse.click(ruler.x + 44 + 15.5 * (ruler.width - 184) / 32, ruler.y + 12);
  await grid.getByText('END 16', { exact: true }).waitFor();
  const length = page.getByRole('textbox', { name: 'Selected note length in steps', exact: true });
  assert.equal(await length.isDisabled(), true);
  const box = await grid.boundingBox();
  const first = await page.evaluate(() => window.__gaia.session('arp_pattern_grid').customValues.__arpeggiator.blocks[0]);
  await page.mouse.click(box.x + 44 + first.step * (box.width - 184) / 32 + 3,
    box.y + 24 + (71 - first.note + 0.5) * (box.height - 56) / 12);
  await length.waitFor();
  assert.equal(await length.isDisabled(), false);
  const before = await page.evaluate(() => window.__gaia.session('arp_pattern_grid').customValues.arpPattern);
  const pitch = page.getByRole('textbox', { name: 'Selected note pitch (note name or MIDI number)', exact: true });
  const start = page.getByRole('textbox', { name: 'Selected note start step', exact: true });
  await pitch.fill('Db4'); await pitch.press('Tab');
  assert.equal(await start.evaluate(el => el === document.activeElement), true, 'Tab from pitch to start');
  await start.fill('20'); await start.press('Tab');
  assert.equal(await length.evaluate(el => el === document.activeElement), true, 'Tab from start to length');
  await length.fill('6'); await length.press('Tab');
  const velocity = page.getByRole('textbox', { name: 'Selected note velocity', exact: true });
  assert.equal(await velocity.evaluate(el => el === document.activeElement), true, 'Tab from length to velocity');
  await velocity.fill('87'); await velocity.press('Enter');
  const after = await page.evaluate(() => window.__gaia.session('arp_pattern_grid').customValues.arpPattern);
  assert.equal(after[0].note, 61); assert.equal(after[0].step, 19);
  assert.equal(after[0].length, 6); assert.equal(after[0].velocity, 87);
  assert.deepEqual(after.slice(1), before.slice(1));
  await grid.getByText('OUTSIDE LOOP', { exact: true }).waitFor();
  assert.equal(await grid.evaluate(el => el === document.activeElement), true, 'Enter returns focus to the grid');
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Shift+ArrowUp');
  let live = await page.evaluate(() => window.__gaia.session('arp_pattern_grid').customValues);
  assert.equal(live.arpPattern[0].step, 20); assert.equal(live.arpPattern[0].note, 74);
  assert.equal(live.arpCurrentStep, 0, 'keyboard must not change the playhead');
  assert.equal(live.arpEndStep, 16);
  assert.ok(live.__arpeggiator.viewNote <= 74 && live.__arpeggiator.viewNote + 11 >= 74);
  const editResult = live.arpPattern;
  await page.keyboard.press('[');
  assert.equal(await page.evaluate(() => window.__gaia.session('arp_pattern_grid').customValues.__arpeggiator.selectedBlock), 'arp_seed_7');
  await page.keyboard.press(']');
  assert.equal(await page.evaluate(() => window.__gaia.session('arp_pattern_grid').customValues.__arpeggiator.selectedBlock), 'arp_seed_0');
  // Footer arrows are single selection operations, never repeated drag edits.
  await page.mouse.click(box.x + 222, box.y + box.height - 43);
  assert.equal(await page.evaluate(() => window.__gaia.session('arp_pattern_grid').customValues.__arpeggiator.selectedBlock), 'arp_seed_7');
  await page.mouse.click(box.x + 258, box.y + box.height - 43);
  assert.equal(await page.evaluate(() => window.__gaia.session('arp_pattern_grid').customValues.__arpeggiator.selectedBlock), 'arp_seed_0');
  await page.keyboard.press('Home');
  assert.equal(await page.evaluate(() => window.__gaia.session('arp_pattern_grid').customValues.__arpeggiator.selectedBlock), 'arp_seed_1');
  await page.keyboard.press('End');
  live = await page.evaluate(() => window.__gaia.session('arp_pattern_grid').customValues);
  assert.equal(live.__arpeggiator.selectedBlock, 'arp_seed_0');
  assert.deepEqual(live.arpPattern, editResult, 'navigation never alters notes');
  await pitch.fill('C2'); await pitch.press('Escape');
  assert.equal(await pitch.inputValue(), 'D5', 'Escape cancels');
  await pitch.fill('invalid'); await pitch.press('Enter');
  assert.equal(await pitch.inputValue(), 'D5', 'invalid pitch leaves the note unchanged');
  await pitch.fill('C#4'); await pitch.press('Enter');
  await start.fill('32'); await start.press('Enter');
  assert.equal(await start.inputValue(), '27', 'start clamps without truncating the six-step note');
  await start.fill('20'); await start.press('Enter');
  if (process.env.GAIA_PAGES_OUT) {
    await mkdir(process.env.GAIA_PAGES_OUT, { recursive: true });
    await page.screenshot({ path: join(process.env.GAIA_PAGES_OUT, 'GAIA-note-inspector.png'), clip: box });
    const arp = await (await control('arp.velocity')).boundingBox();
    await page.screenshot({ path: join(process.env.GAIA_PAGES_OUT, 'GAIA-ruler-arpeggio-controls.png'), clip: { x: 18, y: arp.y - 100, width: 530, height: 198 } });
  }
  assert.deepEqual(errors, []);
  console.log('Inspector: pitch/start/length/velocity, Tab order, Enter/Escape, boundary clamps, selection arrows, keyboard movement and outside-loop feedback passed.');
} finally { await browser.close(); await server.close(); }
