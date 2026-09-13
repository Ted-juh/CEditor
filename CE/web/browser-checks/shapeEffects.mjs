/** Compact Effects dock: real document edits, state scope, history and layout. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const server = process.env.CE_SHAPE_EFFECTS_URL ? null : await createServer({ root, configFile: join(root, 'vite.config.js'), server: { host: '127.0.0.1', port: 0, strictPort: false } });
if (server) await server.listen();
const url = process.env.CE_SHAPE_EFFECTS_URL || `http://127.0.0.1:${server.httpServer.address().port}/`;
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
  const id = await page.evaluate(async () => {
    const p = await import('/src/CE_Application/stores/panels.js');
    const c = await import('/src/CE_Application/stores/controls.js');
    p.addPanel();
    const label = c.addControl('Label');
    const id = label._children.Core.id;
    c.applyControlPatch(id, { 'Core.name': 'Rounded label', 'Text.content': 'Rounded label', 'Text.Font.size': 24,
      'Transform.x': 110, 'Transform.y': 80, 'Transform.width': 240, 'Transform.height': 160,
      'Background.Fill.colour': 'FF805016', 'Background.Border.enabled': false,
      'Background.Corners.radius': 40,
      'States': { _type: 'States', enabled: true, _children: {
        Hover: { _type: 'State', name: 'Hover', enabled: true, when: { hover: true }, patches: { component: {}, parts: {} } },
      } },
      'Effects.Shadows.items': [{ enabled: false, type: 'outer-glow', colour: 'FF00DDEE', blur: 14, spread: 1, offsetX: 0, offsetY: 0 }],
    });
    (await import('/src/CE_Application/stores/panelVisibility.js')).showDisplayPanel.set(true);
    return id;
  });
  await target(id, 'component');
  assert.equal(await dock.getByRole('tab', { name: 'Component', exact: true }).count(), 1);
  assert.equal(await dock.getByLabel('Effect target', { exact: true }).locator('option').count(), 7);
  await dock.getByRole('button', { name: 'Follow selection', exact: true }).click();
  await page.evaluate(async () => (await import('/src/CE_Application/stores/panels.js')).clearSelection());
  const control = page.locator(`.canvas-control[data-control-id="${id}"]`).first();
  const patch = async (values) => {
    await page.evaluate(async ({ id, values }) => (await import('/src/CE_Application/stores/controls.js')).applyControlPatch(id, values), { id, values });
    await settle();
  };
  const samples = async (points = { corner: [27, 27], side: [22, 105] }) => {
    const box = await control.boundingBox();
    const clip = { x: Math.floor(box.x - 25), y: Math.floor(box.y - 25), width: Math.ceil(box.width + 50), height: Math.ceil(box.height + 50) };
    const png = await page.screenshot({ clip });
    return page.evaluate(async ({ base64, points }) => {
      const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
      const pixel = (x, y) => [...ctx.getImageData(x, y, 1, 1).data].slice(0, 3);
      return { corner: pixel(...points.corner), side: pixel(...points.side) };
    }, { base64: png.toString('base64'), points });
  };
  for (const style of ['rounded', 'chamfer', 'notch']) {
    await patch({ 'Background.Corners.style': style, 'Effects.Shadows.items.0.enabled': false });
    const before = await samples();
    await settings.getByRole('switch', { name: 'Shadow enabled', exact: true }).click(); await settle();
    const after = await samples();
    const sideGlow = after.side[1] - before.side[1], cornerGlow = after.corner[1] - before.corner[1];
    assert.ok(sideGlow > 15, `${style}: visible glow along the shape edge ${JSON.stringify({ before, after })}`);
    assert.ok(cornerGlow < sideGlow * 0.35, `${style}: empty square corner has no rectangular glow ${JSON.stringify({ before, after })}`);
    assert.equal(await control.evaluate((el) => getComputedStyle(el).boxShadow), 'none');
  }
  console.log('ok pixel checks: rounded, chamfered and notched shapes glow along their contours');
  await patch({ 'Background.Corners.style': 'rounded', 'Effects.Shadows.items.0.enabled': false });
  const selectSurface = async (surface) => { await dock.getByLabel('Effect target', { exact: true }).selectOption(surface); await settle(); };
  for (const [surface, root] of [['background', 'Background.Effects'], ['solid', 'Background.Fill.SolidEffects'], ['gradient', 'Background.Fill.GradientEffects'], ['image', 'Background.Fill.ImageEffects'], ['overlay', 'Background.Fill.OverlayEffects'], ['border', 'Background.Border.Effects']]) {
    await selectSurface(surface);
    await dock.locator('.looks').getByRole('radio', { name: 'Halo', exact: true }).click(); await settle();
    assert.equal(await read(id, `${root}.Shadows.items.0.type`), 'outer-glow');
    assert.equal(await read(id, 'Effects.Shadows.items.0.enabled'), false, 'whole-component effects remain untouched');
    await choose('Shadow'); await writeNumber('Blur', 18);
    assert.equal(await read(id, `${root}.Shadows.items.0.blur`), 18);
    await settings.locator('.mini-swatch').click();
    await page.evaluate(async () => (await import('/src/CE_Application/stores/colorTarget.js')).applyColorToTarget('CC00DDEE'));
    await page.locator('.studio-rail').getByRole('button', { name: 'Effects', exact: true }).click(); await dock.waitFor(); await settle();
    assert.equal(await read(id, `${root}.Shadows.items.0.colour`), 'CC00DDEE');
    assert.equal(await dock.getByLabel('Effect target', { exact: true }).inputValue(), surface, 'target survives shared colour editor');
    await dock.locator('.looks').getByRole('radio', { name: 'Flat', exact: true }).click(); await settle();
  }
  console.log('ok all six independent surface targets, presets, parameters and colour routing');

  // An image target follows actual transparent artwork, even inside the component box.
  await patch({ 'Background.Fill.solidEnabled': false, 'Background.Fill.imageEnabled': true,
    'Background.Fill.imageSrc': 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160"><circle cx="120" cy="80" r="60" fill="#805016"/></svg>') });
  await selectSurface('image');
  const imagePoints = { corner: [27, 27], side: [83, 105] };
  const imageBefore = await samples(imagePoints);
  await dock.locator('.looks').getByRole('radio', { name: 'Halo', exact: true }).click(); await settle();
  const imageAfter = await samples(imagePoints);
  assert.ok(imageAfter.side[1] - imageBefore.side[1] > 5, 'image glow follows the circle alpha, not its rectangular file bounds');
  assert.ok(Math.abs(imageAfter.corner[1] - imageBefore.corner[1]) < 3);
  await dock.locator('.looks').getByRole('radio', { name: 'Flat', exact: true }).click();
  await patch({ 'Background.Fill.solidEnabled': true, 'Background.Fill.imageEnabled': false, 'Background.Border.enabled': true });
  await selectSurface('border');
  const borderBefore = await samples();
  await dock.locator('.looks').getByRole('radio', { name: 'Halo', exact: true }).click(); await settle();
  const borderAfter = await samples();
  assert.ok(borderAfter.side[1] - borderBefore.side[1] > 5, 'border-only glow renders outside the actual border');
  await dock.locator('.looks').getByRole('radio', { name: 'Flat', exact: true }).click();
  await patch({ 'Background.Border.enabled': false });
  console.log('ok image transparency and border-only glow pixel checks');

  await selectSurface('background');
  await dock.locator('.looks').getByRole('radio', { name: 'Halo', exact: true }).click(); await settle();
  assert.equal(await control.locator('.control-background [data-effect-surface="background"]').count(), 1);
  assert.equal(await control.locator('.control-content [data-effect-surface="background"]').count(), 0, 'background glow is outside the text clip');
  const root = 'Background.Effects';
  await page.evaluate(async (id) => (await import('/src/CE_Application/stores/panels.js')).selectComponent(id), id);
  await settle();
  await dock.getByLabel('Edit state', { exact: true }).selectOption('Hover');
  await choose('Shadow'); await writeNumber('Blur', 23);
  assert.equal((await read(id, 'States.Hover.patches')).component[`${root}.Shadows.items.0.blur`], 23);
  assert.equal(await read(id, `${root}.Shadows.items.0.blur`), 12);
  await dock.getByLabel('Edit state', { exact: true }).selectOption('');
  await page.evaluate(async () => (await import('/src/CE_Application/stores/history.js')).flushHistory());
  await writeNumber('Blur', 20);
  await page.evaluate(async () => (await import('/src/CE_Application/stores/history.js')).undo());
  assert.equal(await read(id, `${root}.Shadows.items.0.blur`), 12);
  await page.evaluate(async () => (await import('/src/CE_Application/stores/history.js')).redo());
  assert.equal(await read(id, `${root}.Shadows.items.0.blur`), 20);
  console.log('ok background-only rendering, state overrides and undo/redo');
  if (process.env.CE_SHAPE_EFFECTS_SCREENSHOT) {
    await page.evaluate(async () => (await import('/src/CE_Application/stores/panels.js')).clearSelection());
    await settle();
    await page.screenshot({ path: process.env.CE_SHAPE_EFFECTS_SCREENSHOT });
  }
  assert.deepEqual(failures, []);
} finally {
  await browser.close();
  if (server) await server.close();
}
