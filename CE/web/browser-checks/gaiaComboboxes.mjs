import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const server = process.env.PREVIEW_URL
  ? { resolvedUrls: { local: [process.env.PREVIEW_URL] }, async listen() {}, async close() {} }
  : await createServer({ configFile: fileURLToPath(new URL('./vite.config.mjs', import.meta.url)), server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.route('**/gaia-panel.json', async route => {
    const document = JSON.parse(await readFile(process.env.GAIA_PANEL_PATH || new URL('../../panels/Roland GAIA SH-01.cepanel', import.meta.url), 'utf8'));
    // Authored row IDs can duplicate independently of semantic values. Keep a
    // regression for that rendering crash after the GAIA note migration runs.
    function duplicateDBeamIds(controls) {
      for (const control of controls) {
        if (control._children?.Core?.name === 'common.dBeamAssign') {
          for (const row of control._children.Value.rows) row.id = '';
        }
        duplicateDBeamIds(Object.values(control._children?.Children?._children ?? {}));
      }
    }
    duplicateDBeamIds(document.controls);
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(document) });
  });
  await page.goto(`${server.resolvedUrls.local[0]}gaiaPages.html`);
  await page.waitForFunction(() => !!window.__gaia, null, { timeout: 90000 });
  await page.evaluate(() => window.__gaia.load('/gaia-panel.json'));
  const menus = await page.evaluate(() => window.__gaia.controls
    .filter(c => c._children?.Behavior?.buttonType === 'combobox')
    .map(c => ({ name: c._children.Core.name, id: c._children.Core.id,
      rows: c._children.Value.rows.filter(r => r.enabled !== false && !r.isHeader)
        .map(r => ({ id: r.id, value: r.internalValue ?? r.id ?? '', label: r.displayText ?? r.label ?? r.internalValue ?? r.id ?? '' })) })));
  assert.ok(menus.some(m => m.name === 'common.dBeamAssign'));
  assert.equal(menus.filter(m => /^(tone[123])\.(modLfo|lfo)\.tempoSyncNote$/.test(m.name)).length, 6);
  // Which bottom_pages page holds a control, read from the document rather than guessed from its
  // name: D BEAM ASSIGN is common.* and lives on System, so a name prefix picks the wrong page.
  const bottomPage = id => page.evaluate(id => {
    const bottom = window.__gaia.controls.find(c => c._children.Core.name === 'bottom_pages')._children;
    const contains = c => c._children.Core.id === id
      || Object.values(c._children.Children?._children ?? {}).some(contains);
    const child = Object.values(bottom.Children._children).find(contains);
    return child ? bottom.TabContainer.pages.findIndex(p => p.id === child._children.Core.tabPageId) : -1;
  }, id);
  async function showBottomPage(id) {
    const index = await bottomPage(id);
    if (index < 0) return;
    const tabsId = await page.evaluate(() => window.__gaia.id('bottom_pages'));
    const pages = await page.evaluate(() => window.__gaia.controls.find(c => c._children.Core.name === 'bottom_pages')._children.TabContainer.pages.length);
    const rect = await page.locator(`.canvas-control[data-control-id="${tabsId}"]`).boundingBox();
    await page.mouse.click(rect.x + rect.width * (index + .5) / pages, rect.y + 10);
  }
  let checked = 0;
  for (const combo of menus) {
    const control = page.locator(`.canvas-control[data-control-id="${combo.id}"]`);
    if (!(await control.isVisible())) {
      await showBottomPage(combo.id);
      await control.waitFor({ state: 'visible' });
    }
    assert.ok(await control.isVisible(), `${combo.name} must be exercised`);
    await control.click();
    const menu = page.locator(`.panel-combobox-menu[data-control-id="${combo.id}"]`);
    await menu.waitFor({ state: 'visible', timeout: 3000 });
    const options = menu.getByRole('option');
    assert.equal(await options.count(), combo.rows.length, combo.name);
    const controlBox = await control.boundingBox(), menuBox = await menu.boundingBox();
    assert.ok(Math.abs(menuBox.x - controlBox.x) < 1, `${combo.name}: menu is anchored to the rendered control`);
    assert.ok(Math.abs(menuBox.y - controlBox.y - controlBox.height - 4) < 1, `${combo.name}: menu is below the control: ${JSON.stringify({ controlBox, menuBox })}`);
    const choice = combo.rows.at(-1);
    await options.last().click();
    assert.equal(String(await page.evaluate(name => window.__gaia.session(name).valueOverride, combo.name)), String(choice.value), combo.name);
    await menu.waitFor({ state: 'detached' });
    await control.click();
    await menu.waitFor({ state: 'visible' });
    assert.equal(await menu.getByRole('option', { selected: true }).innerText(), String(choice.label));
    await options.first().click();
    if (/^tone[123]\.(modLfo|lfo)\.tempoSyncNote$/.test(combo.name)) {
      assert.equal(new Set(combo.rows.map(row => row.value)).size, combo.rows.length);
      for (const label of ['12', '1/2', '16', '1/6']) {
        await control.click();
        await menu.getByRole('option', { name: label, exact: true }).click();
        assert.equal(String(await page.evaluate(name => window.__gaia.session(name).valueOverride, combo.name)),
          String(combo.rows.find(row => row.label === label).value));
        await control.click();
        assert.equal(await menu.getByRole('option', { selected: true }).innerText(), label);
        await menu.getByRole('option', { name: label, exact: true }).click();
      }
    }
    checked++;
  }
  // The nested D Beam popup must keep its anchor at non-100% zoom too.
  const dbeam = menus.find(m => m.name === 'common.dBeamAssign');
  await showBottomPage(dbeam.id);
  await page.locator('.panel-surface.preview-surface').evaluate(node => node.style.transform = 'scale(0.75)');
  const dbeamControl = page.locator(`.canvas-control[data-control-id="${dbeam.id}"]`);
  await dbeamControl.focus();
  await dbeamControl.press('Enter');
  const popup = page.locator(`.panel-combobox-menu[data-control-id="${dbeam.id}"]`);
  await popup.waitFor();
  const box = await dbeamControl.boundingBox(), popupBox = await popup.boundingBox();
  assert.ok(Math.abs(box.x - popupBox.x) < 1);
  assert.ok(Math.abs(popupBox.y - box.y - box.height - 3) < 1);
  await popup.getByRole('option').last().click();
  assert.deepEqual(errors, []);
  assert.equal(checked, menus.length);
  console.log(JSON.stringify({ checked, menus: menus.map(m => ({ name: m.name, rows: m.rows.length,
    duplicatedRows: m.rows.filter(row => m.rows.filter(other => other.id === row.id).length > 1) })), errors }, null, 2));
} finally { await browser.close(); await server.close(); }
