/** The compact Text dock in the full application: real fields, selection, history and layout. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const server = process.env.CE_TEXT_DOCK_URL ? null : await createServer({
  root, configFile: join(root, 'vite.config.js'),
  server: { host: '127.0.0.1', port: 0, strictPort: false },
});
if (server) await server.listen();
const url = process.env.CE_TEXT_DOCK_URL || `http://127.0.0.1:${server.httpServer.address().port}/`;
const browser = await chromium.launch(process.env.CHROMIUM_PATH
  ? { executablePath: process.env.CHROMIUM_PATH }
  : process.platform === 'win32' ? { channel: 'msedge' }
    : { executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1700, height: 1000 } });
const failures = [];
page.on('pageerror', (error) => failures.push(String(error)));
const dock = page.locator('.text-dock');
const settle = () => page.waitForTimeout(120);
const group = async (name) => { await dock.getByRole('tab', { name, exact: true }).click(); await settle(); };
const cell = (label, parent = dock) => parent.locator('.property-cell').filter({ has: page.locator('.property-label', { hasText: new RegExp(`^${label}$`, 'i') }) });
const number = (label, parent = dock) => parent.locator('.number-cell').filter({ has: page.locator('.nc-label', { hasText: new RegExp(`^${label}$`, 'i') }) }).locator('input');
const read = (id, path) => page.evaluate(async ({ id, path }) => {
  const get = (store) => { let value; store.subscribe((next) => { value = next; })(); return value; };
  const { panels } = await import('/src/CE_Application/stores/panels.js');
  let node = get(panels).flatMap((panel) => panel.controls).find((c) => c._children.Core.id === id);
  const parts = path.split('.');
  for (let i = 0; i < parts.length - 1; i++) node = node?._children?.[parts[i]];
  return node?.[parts.at(-1)];
}, { id, path });
const writeNumber = async (label, value, parent = dock) => {
  const input = number(label, parent); await input.fill(String(value)); await input.press('Enter'); await settle();
};

try {
  await page.goto(url);
  await page.locator('.app').waitFor();
  const ids = await page.evaluate(async () => {
    const p = await import('/src/CE_Application/stores/panels.js');
    const c = await import('/src/CE_Application/stores/controls.js');
    p.addPanel();
    const a = c.addControl('Label'), b = c.addControl('Label');
    for (const [control, name] of [[a, 'Alpha'], [b, 'Beta']]) c.updateControlProperty(control._children.Core.id, 'Core.name', name);
    p.selectComponent(a._children.Core.id);
    const visibility = await import('/src/CE_Application/stores/panelVisibility.js');
    visibility.showDisplayPanel.set(true);
    (await import('/src/CE_Application/stores/displayTab.js')).displayTabRequest.set({ tab: 'type' });
    return [a._children.Core.id, b._children.Core.id];
  });
  await dock.waitFor();
  await settle();
  assert.deepEqual(await dock.getByRole('tab').allTextContents(), ['type', 'layout', 'fill', 'flow', 'lines', 'effects']);
  assert.equal(await dock.locator('canvas, .spec, .speccol, .famcol, .effect-preview').count(), 0, 'the editor canvas is the only preview');
  await dock.locator('textarea').fill('FILTER CUTOFF');
  await dock.getByRole('button', { name: 'OK', exact: true }).click();
  assert.equal(await read(ids[0], 'Text.content'), 'FILTER CUTOFF');
  await writeNumber('Size', 24, dock.locator('.dock-basics'));
  assert.equal(await read(ids[0], 'Text.Font.size'), 24);
  await cell('Case').locator('select').selectOption('uppercase');
  await writeNumber('Word', 3);
  assert.equal(await read(ids[0], 'Text.Font.caseMode'), 'uppercase');
  assert.equal(await read(ids[0], 'Text.Font.wordSpacing'), 3);
  assert.equal(await dock.locator('.effect-toggle-grid button').count(), 6, 'all OpenType switches remain available');
  console.log('ok content, font, spacing, and OpenType fields');

  await group('layout');
  for (const label of ['Wrap', 'Align', 'Paragraph', 'Overflow', 'Justify Last', 'Last Line', 'Fit', 'Position', 'Orientation']) assert.equal(await cell(label).count(), 1, label);
  await cell('Wrap').locator('select').selectOption('character');
  await writeNumber('Lines', 3);
  assert.equal(await read(ids[0], 'Text.Multiline.wrapMode'), 'character');
  assert.equal(await read(ids[0], 'Text.Multiline.maxLines'), 3);
  await cell('Orientation').locator('select').selectOption('rotate90');
  assert.equal(await read(ids[0], 'Text.Position.flowAngle'), 90);
  console.log('ok paragraph, bounds and placement');

  await group('fill');
  for (const kind of ['Solid', 'Gradient', 'Image', 'Texture']) {
    await dock.getByTitle(`Activate ${kind} text fill`, { exact: true }).click();
    assert.equal(await read(ids[0], 'Text.Fill.mode'), kind.toLowerCase());
  }
  await writeNumber('Scale', 2);
  assert.equal(await read(ids[0], 'Text.Fill.textureTileScale'), 2);
  console.log('ok all four fill modes and their existing editors');

  await group('flow');
  const mode = cell('Mode').locator('select');
  assert.equal(await mode.locator('option').count(), 13);
  for (const [kind, label, value, key] of [['wave', 'Amp', 21, 'flowAmplitude'], ['spiral', 'Turns', 3, 'flowTurns'], ['bezier', 'C1 X', 42, 'flowPathC1X']]) {
    await mode.selectOption(kind); await writeNumber(label, value);
    assert.equal(await read(ids[0], `Text.Position.${key}`), value);
  }
  assert.equal(await cell('Path presets').count(), 1);
  console.log('ok all 13 flow modes, exact path coordinates and presets');

  await group('lines');
  for (const kind of ['underline', 'strikethrough', 'overline']) {
    await cell('Edit line').getByRole('button', { name: kind, exact: true }).click();
    const label = kind === 'underline' ? 'Underline Thickness' : kind === 'strikethrough' ? 'Strike Thickness' : 'Overline Thickness';
    const input = cell(label).locator('input'); await input.fill('2.5'); await input.press('Enter');
    assert.equal(await read(ids[0], `Text.Font.${kind}Thickness`), 2.5);
  }
  console.log('ok independent settings for all three decorations, including disabled lines');

  await group('effects');
  assert.equal(await dock.locator('.effect-picker button').count(), 12);
  await dock.locator('.effect-picker').getByRole('button', { name: 'Outline', exact: false }).click();
  await writeNumber('Thickness', 2);
  await writeNumber('Order', 47);
  assert.equal(await read(ids[0], 'Text.Effects.outlineThickness'), 2);
  assert.equal(await read(ids[0], 'Text.Effects.outlineOrder'), 47);
  await dock.locator('.effect-picker').getByRole('button', { name: 'Hollow' }).click();
  await cell('Enabled').locator('button').click();
  assert.equal(await read(ids[0], 'Text.Effects.knockout'), true);
  await dock.locator('.effect-picker').getByRole('button', { name: 'Reflection' }).click();
  await dock.getByLabel('Reflection Fade', { exact: true }).selectOption('out');
  assert.equal(await read(ids[0], 'Text.Effects.reflectionFadeMode'), 'out');
  console.log('ok effect parameters, numeric draw order, and Hollow');

  // Colour and gradient editors temporarily unmount the dock; its sub-editor must survive.
  await page.evaluate(async () => (await import('/src/CE_Application/stores/displayTab.js')).displayTabRequest.set({ tab: 'colors' }));
  await settle();
  await page.evaluate(async () => (await import('/src/CE_Application/stores/displayTab.js')).displayTabRequest.set({ tab: 'type' }));
  await dock.waitFor();
  assert.match(await dock.locator('.effect-picker button.active').innerText(), /Reflection$/);

  await dock.getByRole('button', { name: 'Follow selection', exact: true }).click();
  await page.evaluate(async (ids) => {
    const p = await import('/src/CE_Application/stores/panels.js');
    p.selectComponent(ids[1]); p.selectComponent(ids[0], true);
  }, ids);
  await dock.locator('textarea').fill('PINNED ALPHA'); await dock.getByRole('button', { name: 'OK', exact: true }).click();
  assert.equal(await read(ids[0], 'Text.content'), 'PINNED ALPHA');
  assert.notEqual(await read(ids[1], 'Text.content'), 'PINNED ALPHA');
  await dock.getByRole('button', { name: 'Pinned', exact: true }).click();
  await dock.locator('textarea').fill('BOTH LABELS'); await dock.getByRole('button', { name: 'OK', exact: true }).click();
  for (const id of ids) assert.equal(await read(id, 'Text.content'), 'BOTH LABELS');
  console.log('ok pinned edits cannot leak into a different multi-selection; follow mode edits the selection');

  const button = await page.evaluate(async () => {
    const c = await import('/src/CE_Application/stores/controls.js');
    const button = c.addControl('Button');
    return button._children.Core.id;
  });
  await settle();
  await page.evaluate(async () => (await import('/src/CE_Application/stores/stateEditScope.js')).setStateEditScopeState('Hover'));
  await writeNumber('Size', 31, dock.locator('.dock-basics'));
  const state = await read(button, 'States.Hover.patches');
  assert.equal(state.component['Text.Font.size'], 31);
  assert.notEqual(await read(button, 'Text.Font.size'), 31, 'state edit leaves the base font unchanged');
  await page.evaluate(async () => (await import('/src/CE_Application/stores/stateEditScope.js')).setStateEditScopeBase());
  await page.evaluate(async () => { const h = await import('/src/CE_Application/stores/history.js'); h.flushHistory(); });
  const oldSize = await read(button, 'Text.Font.size');
  await writeNumber('Size', 35, dock.locator('.dock-basics'));
  await page.evaluate(async () => (await import('/src/CE_Application/stores/history.js')).undo());
  assert.equal(await read(button, 'Text.Font.size'), oldSize);
  await page.evaluate(async () => (await import('/src/CE_Application/stores/history.js')).redo());
  assert.equal(await read(button, 'Text.Font.size'), 35);
  console.log('ok state overrides, undo/redo and sub-editor restoration');

  await group('type');
  await page.evaluate(async () => (await import('/src/CE_Application/stores/propertyFilter.js')).propertyFilter.set('no-match-here'));
  assert.equal(await cell('Case').isVisible(), true);
  await page.evaluate(async () => (await import('/src/CE_Application/stores/propertyFilter.js')).propertyFilter.set(''));
  const geometry = await dock.evaluate((el) => {
    const fields = el.querySelector('.dock-fields');
    return { height: el.getBoundingClientRect().height, overflow: fields.scrollHeight - fields.clientHeight,
      theme: getComputedStyle(el).getPropertyValue('--pp-field-height'),
      sideTheme: getComputedStyle(document.querySelector('.properties-panel')).getPropertyValue('--pp-field-height'),
      font: getComputedStyle(el).fontFamily, sideFont: getComputedStyle(document.querySelector('.properties-panel')).fontFamily };
  });
  assert.equal(geometry.theme, geometry.sideTheme);
  assert.equal(geometry.font, geometry.sideFont);
  assert.ok(geometry.height <= 300, JSON.stringify(geometry));
  assert.ok(geometry.overflow <= 1, `default Type group needs no vertical scroll: ${JSON.stringify(geometry)}`);
  if (process.env.CE_TEXT_DOCK_SCREENSHOT) await page.screenshot({ path: process.env.CE_TEXT_DOCK_SCREENSHOT });
  await page.setViewportSize({ width: 1000, height: 800 }); await settle();
  assert.ok(await dock.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), 'dock fits a narrow editor');
  assert.equal(await dock.getByRole('tab').count(), 6);
  console.log('ok property-panel styling, isolated search and compact/narrow layouts');
  assert.deepEqual(failures, []);
} finally {
  await browser.close();
  if (server) await server.close();
}
