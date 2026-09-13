/** Compact Effects dock: real document edits, state scope, history and layout. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const server = process.env.CE_EFFECTS_DOCK_URL ? null : await createServer({ root, configFile: join(root, 'vite.config.js'), server: { host: '127.0.0.1', port: 0, strictPort: false } });
if (server) await server.listen();
const url = process.env.CE_EFFECTS_DOCK_URL || `http://127.0.0.1:${server.httpServer.address().port}/`;
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH }
  : process.platform === 'win32' ? { channel: 'msedge' }
    : { executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1700, height: 1000 } });
const failures = [];
page.on('pageerror', (error) => failures.push(String(error)));
const dock = page.locator('.effects-tab');
const settings = dock.locator('.effect-settings');
const settle = () => page.waitForTimeout(100);
const number = (label) => settings.locator('.number-cell').filter({ has: page.locator('.nc-label', { hasText: new RegExp(`^${label}$`, 'i') }) }).locator('input');
const row = (label) => dock.locator('.srow').filter({ has: page.locator('.snm', { hasText: new RegExp(`^${label}(?:\\s*—|\\s*$)`) }) });
const choose = async (label) => { await row(label).click(); await settle(); };
const writeNumber = async (label, value) => { await number(label).fill(String(value)); await number(label).press('Enter'); await settle(); };
const read = (id, path) => page.evaluate(async ({ id, path }) => {
  const get = (store) => { let value; store.subscribe((v) => { value = v; })(); return value; };
  const { panels } = await import('/src/CE_Application/stores/panels.js');
  const { readSection } = await import('/src/CE_Application/utils/effectStack.js');
  return readSection(get(panels).flatMap((p) => p.controls).find((c) => c._children.Core.id === id), path);
}, { id, path });
const target = async (id, domain) => {
  await page.evaluate(async ({ id, domain }) => {
    (await import('/src/CE_Application/stores/panels.js')).selectComponent(id);
    (await import('/src/CE_Application/stores/editorTarget.js')).activateEditorTarget('effects', id, domain);
    (await import('/src/CE_Application/stores/displayTab.js')).displayTabRequest.set({ tab: 'effects' });
  }, { id, domain });
  await dock.waitFor(); await settle();
};

try {
  await page.goto(url); await page.locator('.app').waitFor();
  const ids = await page.evaluate(async () => {
    const p = await import('/src/CE_Application/stores/panels.js');
    const c = await import('/src/CE_Application/stores/controls.js');
    p.addPanel();
    const button = c.addControl('Button'), display = c.addControl('LcdDisplay');
    c.applyControlPatch(button._children.Core.id, {
      'Core.name': 'Effects example', 'Text.content': 'FILTER CUTOFF', 'Text.Font.size': 32,
      'Transform.x': 70, 'Transform.y': 60, 'Transform.width': 440, 'Transform.height': 90,
      'Text.Effects.outlineEnabled': true,
      'Effects.Shadows.items': [
        { enabled: true, type: 'drop', colour: '80123456', offsetX: -12, offsetY: 9, blur: 13, spread: 2 },
        { enabled: false, type: 'inner', colour: 'FF665544', offsetX: 5, offsetY: 3, blur: 7, spread: 0 },
      ],
    });
    c.applyControlPatch(display._children.Core.id, { 'Transform.x': 70, 'Transform.y': 220 });
    (await import('/src/CE_Application/stores/panelVisibility.js')).showDisplayPanel.set(true);
    return [button._children.Core.id, display._children.Core.id];
  });
  // Reproduce the reported path: open Text first, then click Effects with a selection.
  await page.evaluate(async (id) => {
    (await import('/src/CE_Application/stores/panels.js')).selectComponent(id);
    (await import('/src/CE_Application/stores/editorTarget.js')).activateEditorTarget('typography', id, 'type');
    (await import('/src/CE_Application/stores/displayTab.js')).displayTabRequest.set({ tab: 'type' });
  }, ids[0]);
  await page.locator('.text-dock').waitFor();
  await page.locator('.studio-rail').getByRole('button', { name: 'Effects', exact: true }).click();
  await dock.waitFor(); await settle();
  assert.equal(await dock.locator('.target-bar strong').innerText(), 'Effects example');
  assert.equal(await dock.getByRole('button', { name: 'Use selection', exact: true }).count(), 0);
  await dock.getByRole('tab', { name: 'Component', exact: true }).click();
  await choose('Shadow 1');
  assert.equal(await number('Blur').inputValue(), '13', 'domain switches work while Text owns the global target');
  await page.evaluate(async (id) => (await import('/src/CE_Application/stores/panels.js')).selectComponent(id), ids[1]);
  await settle();
  assert.match(await dock.locator('.target-bar strong').innerText(), /Display/);
  await page.evaluate(async () => (await import('/src/CE_Application/stores/panels.js')).clearSelection());
  await settle();
  assert.equal(await dock.locator('.effect-settings').count(), 0, 'deselecting leaves no stale write target');
  await page.evaluate(async (id) => (await import('/src/CE_Application/stores/panels.js')).selectComponent(id), ids[0]);
  await settle();
  assert.equal(await dock.locator('.target-bar strong').innerText(), 'Effects example');
  await page.locator('.studio-rail').getByRole('button', { name: 'Text', exact: true }).click();
  await page.locator('.text-dock').waitFor();
  await page.locator('.studio-rail').getByRole('button', { name: 'Effects', exact: true }).click();
  await dock.waitFor(); await settle();
  assert.equal(await dock.locator('.target-bar strong').innerText(), 'Effects example');
  console.log('ok direct tab clicks follow selection, including after Text, deselection, and reopening');
  await target(ids[0], 'text');
  assert.equal(await dock.locator('.spec, .speccol, .sm').count(), 0, 'no separate preview');
  assert.equal(await dock.locator('.stack .effect-icon').count(), 12, 'each effect has a semantic icon');
  assert.equal(await dock.locator('.thumb, .effect-preview, canvas').count(), 0, 'icons replace component previews');
  assert.equal(await dock.locator('.srow').count(), 12);

  // Audit every existing descriptor, including conditionally disabled fields.
  for (const [id, domain] of [[ids[0], 'text'], [ids[0], 'component'], [ids[1], 'lighting']]) {
    await target(id, domain);
    const descriptors = await page.evaluate(async ({ id, domain }) => {
      const get = (store) => { let value; store.subscribe((v) => { value = v; })(); return value; };
      const { panels } = await import('/src/CE_Application/stores/panels.js');
      const { buildDomain } = await import('/src/CE_Application/utils/effectStack.js');
      const control = get(panels).flatMap((p) => p.controls).find((c) => c._children.Core.id === id);
      const built = buildDomain(control, domain);
      return [...built.rows, ...built.unordered].map((r) => ({ label: r.label, fields: r.fields.map((f) => ({ label: f.label, kind: f.kind })) }));
    }, { id, domain });
    assert.ok(descriptors.length, domain);
    for (const descriptor of descriptors) {
      await choose(descriptor.label);
      for (const field of descriptor.fields) {
        const locator = field.kind === 'number' ? number(field.label)
          : settings.locator('.property-label', { hasText: new RegExp(`^${field.label}$`, 'i') });
        assert.equal(await locator.count(), 1, `${domain}/${descriptor.label}/${field.label}`);
      }
    }
  }
  console.log('ok every Text, Layer and Screen effect property remains available');

  await target(ids[0], 'text'); await choose('Outline');
  await writeNumber('Thickness', 3); await writeNumber('Order', 48);
  assert.equal(await read(ids[0], 'Text.Effects.outlineThickness'), 3);
  assert.equal(await read(ids[0], 'Text.Effects.outlineOrder'), 48);
  const hex = settings.locator('.color-hex');
  await hex.fill('804488CC'); await hex.press('Enter'); await hex.blur(); await settle();
  assert.equal(await read(ids[0], 'Text.Effects.outlineColour'), '804488CC');
  await settings.locator('.mini-swatch').click();
  await page.evaluate(async () => (await import('/src/CE_Application/stores/colorTarget.js')).applyColorToTarget('C0123456'));
  await page.evaluate(async () => (await import('/src/CE_Application/stores/displayTab.js')).displayTabRequest.set({ tab: 'effects' }));
  await dock.waitFor(); await settle();
  assert.match(await row('Outline').getAttribute('class'), /sel/);
  assert.equal(await hex.inputValue(), 'C0123456');
  await dock.getByLabel('Edit state', { exact: true }).selectOption('Hover');
  await writeNumber('Thickness', 6);
  assert.equal((await read(ids[0], 'States.Hover.patches')).component['Text.Effects.outlineThickness'], 6);
  assert.equal(await read(ids[0], 'Text.Effects.outlineThickness'), 3);
  await dock.getByLabel('Edit state', { exact: true }).selectOption('');
  assert.equal(await number('Thickness').inputValue(), '3');
  console.log('ok immediate edits, alpha colours, shared colour picker, and state overrides');

  await page.evaluate(async () => (await import('/src/CE_Application/stores/history.js')).flushHistory());
  await writeNumber('Thickness', 4);
  await page.evaluate(async () => (await import('/src/CE_Application/stores/history.js')).undo());
  assert.equal(await read(ids[0], 'Text.Effects.outlineThickness'), 3);
  await page.evaluate(async () => (await import('/src/CE_Application/stores/history.js')).redo());
  assert.equal(await read(ids[0], 'Text.Effects.outlineThickness'), 4);
  const before = await dock.locator('.stack > .srow .snm').allTextContents();
  await settings.getByRole('button', { name: 'Move effect forward', exact: true }).click(); await settle();
  const after = await dock.locator('.stack > .srow .snm').allTextContents();
  assert.equal(after.findIndex((s) => s.trim() === 'Outline'), before.findIndex((s) => s.trim() === 'Outline') - 1);
  await row('Outline').press('Alt+ArrowDown'); await settle();
  assert.deepEqual(await dock.locator('.stack > .srow .snm').allTextContents(), before);
  // Pointer reorder uses the same measured rows as the compact stack.
  await choose('Inner Glow');
  const grip = await row('Inner Glow').locator('.grip').boundingBox();
  const next = await row('Bevel').boundingBox();
  await page.mouse.move(grip.x + 4, grip.y + 4); await page.mouse.down();
  await page.mouse.move(next.x + 30, next.y + 3, { steps: 5 }); await page.mouse.up(); await settle();
  assert.equal((await dock.locator('.stack > .srow .snm').allTextContents())[1].trim(), 'Inner Glow');
  console.log('ok undo/redo and stack ordering by button, keyboard, and pointer');

  await target(ids[0], 'component'); await choose('Shadow 1');
  assert.equal(await number('Offset X').inputValue(), '-12');
  assert.equal(await number('Blur').inputValue(), '13');
  await writeNumber('Blur', 19);
  assert.equal(await read(ids[0], 'Effects.Shadows.items.0.blur'), 19);
  assert.equal(await read(ids[0], 'Effects.Shadows.items.1.blur'), 7);
  await settings.getByRole('button', { name: 'Move effect backward', exact: true }).click(); await settle();
  assert.equal(await read(ids[0], 'Effects.Shadows.items.1.blur'), 19);
  assert.equal(await number('Blur').inputValue(), '19', 'settings follow the reordered shadow');
  await dock.getByLabel('Edit state', { exact: true }).selectOption('Hover');
  await writeNumber('Blur', 24);
  assert.equal(await number('Blur').inputValue(), '24');
  assert.equal(await read(ids[0], 'Effects.Shadows.items.1.blur'), 19);
  await dock.getByLabel('Edit state', { exact: true }).selectOption('');
  assert.equal(await number('Blur').inputValue(), '19');
  console.log('ok shadow array values, independent writes, ordering, and state edits');

  for (const domain of ['text', 'component']) {
    await target(ids[0], domain);
    const presets = await page.evaluate(async (domain) => (await import('/src/CE_Application/utils/effectLooks.js')).looksFor(domain), domain);
    assert.equal(await dock.locator('.looks').getByRole('radio').count(), presets.length);
    assert.equal(await dock.locator('.looks .effect-icon').count(), presets.length, 'each quick selection has an icon');
    for (const preset of presets) {
      await dock.locator('.looks').getByRole('radio', { name: preset.label, exact: true }).click(); await settle();
      for (const [path, value] of Object.entries(preset.patch)) assert.deepEqual(await read(ids[0], path), value, `${preset.id}: ${path}`);
    }
  }
  console.log('ok all existing presets apply their complete patches');
  await target(ids[1], 'lighting'); await choose('Dot Matrix');
  await writeNumber('Dot pitch', 3.5);
  await settings.getByLabel('Dot Matrix Dot shape', { exact: true }).selectOption('square');
  assert.equal(await read(ids[1], 'Display.dotPitch'), 3.5);
  assert.equal(await read(ids[1], 'Display.dotShape'), 'square');

  await target(ids[0], 'text'); await choose('Outline');
  await page.evaluate(async () => (await import('/src/CE_Application/stores/propertyFilter.js')).propertyFilter.set('no-match-here'));
  assert.equal(await number('Thickness').isVisible(), true);
  await page.evaluate(async () => (await import('/src/CE_Application/stores/propertyFilter.js')).propertyFilter.set(''));
  await dock.getByRole('button', { name: 'Follow selection', exact: true }).click();
  await page.evaluate(async (id) => (await import('/src/CE_Application/stores/panels.js')).selectComponent(id), ids[1]);
  await writeNumber('Thickness', 5);
  assert.equal(await read(ids[0], 'Text.Effects.outlineThickness'), 5, 'pinned target survives selection change');
  await dock.getByRole('button', { name: 'Pinned', exact: true }).click(); await settle();
  assert.match(await dock.locator('.target-bar strong').innerText(), /Display/);
  await target(ids[0], 'text'); await choose('Reflection');
  const geometry = await dock.evaluate((el) => ({ height: el.getBoundingClientRect().height,
    theme: getComputedStyle(el).getPropertyValue('--pp-field-height'),
    sideTheme: getComputedStyle(document.querySelector('.properties-panel')).getPropertyValue('--pp-field-height'),
    font: getComputedStyle(el).fontFamily, sideFont: getComputedStyle(document.querySelector('.properties-panel')).fontFamily }));
  assert.equal(geometry.theme, geometry.sideTheme); assert.equal(geometry.font, geometry.sideFont);
  assert.ok(geometry.height <= 300, JSON.stringify(geometry));
  if (process.env.CE_EFFECTS_DOCK_SCREENSHOT) {
    await choose('Outline');
    await dock.locator('.stackcol, .lookcol').evaluateAll((elements) => elements.forEach((el) => { el.scrollTop = 0; }));
    await page.screenshot({ path: process.env.CE_EFFECTS_DOCK_SCREENSHOT });
    await choose('Reflection');
  }
  await page.setViewportSize({ width: 1000, height: 800 }); await settle();
  assert.ok(await dock.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), 'dock fits a narrow editor');
  assert.ok(await settings.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), 'fields do not overflow');
  assert.equal(await number('Intensity').isVisible(), true);
  console.log('ok Screen edits, pinned targets, isolated search, matching theme, and compact/narrow layout');
  assert.deepEqual(failures, []);
} finally {
  await browser.close();
  if (server) await server.close();
}
