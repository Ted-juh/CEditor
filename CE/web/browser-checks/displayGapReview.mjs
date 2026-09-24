/** Full-editor checks for the Align and Viewer dock tabs. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { chromiumLaunchOptions } from './chromiumLaunch.mjs';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const server = await createServer({ root, configFile: join(root, 'vite.config.js'),
  server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch(chromiumLaunchOptions({ channel: 'msedge' }));
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
const settle = () => page.waitForTimeout(180);
const readPanel = () => page.evaluate(async () => {
  const { activePanel } = await import('/src/CE_Application/stores/panels.js');
  let panel; activePanel.subscribe((value) => { panel = value; })();
  return panel;
});

try {
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`, { waitUntil: 'networkidle' });
  await page.locator('.app').waitFor();
  const ids = await page.evaluate(async () => {
    const { createControl } = await import('/src/CE_Application/models/componentTypes.js');
    const { createPanel } = await import('/src/CE_Application/stores/panelModel.js');
    const { addPanel, selectedComponentIds, keyObjectId } = await import('/src/CE_Application/stores/panels.js');
    const panel = createPanel('Align and Viewer QA');
    panel.width = 900; panel.height = 600;
    panel.controls = [[50, 50], [170, 80], [350, 60]].map(([x, width], index) => {
      const control = createControl('Label');
      Object.assign(control._children.Core, { name: `Align ${index + 1}` });
      Object.assign(control._children.Transform, { x, y: 80 + index * 80, width, height: 40 });
      return control;
    });
    addPanel(panel);
    const ids = panel.controls.map((control) => control._children.Core.id);
    selectedComponentIds.set(new Set(ids));
    keyObjectId.set(ids[0]);
    return ids;
  });
  if (!await page.getByRole('tab', { name: 'Align', exact: true }).count()) {
    await page.getByTitle('Display dock — colours, gradients, align, device, console', { exact: true }).click();
  }
  await page.getByRole('tab', { name: 'Align', exact: true }).click();
  const align = page.locator('.align-panel');
  await align.waitFor();
  await align.getByTitle('Equal H-Spacing').click();
  await settle();
  let panel = await readPanel();
  assert.deepEqual(panel.controls.map((control) => control._children.Transform.x), [50, 185, 350]);
  await align.getByTitle('Align Left Edges').click();
  await settle();
  panel = await readPanel();
  assert.deepEqual(panel.controls.map((control) => control._children.Transform.x), [50, 50, 50]);
  await page.keyboard.press('Control+z');
  await settle();
  panel = await readPanel();
  assert.deepEqual(panel.controls.map((control) => control._children.Transform.x), [50, 185, 350]);
  await align.getByTitle('Match Width').click();
  await settle();
  panel = await readPanel();
  assert.deepEqual(panel.controls.map((control) => control._children.Transform.width), [50, 50, 50]);
  console.log('PASS Align spacing, left edges, match width, and Undo');

  await page.getByRole('tab', { name: 'Viewer', exact: true }).click();
  const viewer = page.locator('.viewer-layout');
  await viewer.waitFor();
  const addImage = async (name, colour) => {
    const base64 = await page.evaluate((fill) => {
      const canvas = document.createElement('canvas');
      canvas.width = 8; canvas.height = 8;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = fill; ctx.fillRect(0, 0, 8, 8);
      return canvas.toDataURL('image/png').split(',')[1];
    }, colour);
    const picker = page.waitForEvent('filechooser');
    await viewer.getByRole('button', { name: 'Load Image' }).first().click();
    await (await picker).setFiles({ name, mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') });
    await viewer.getByRole('tab', { name }).waitFor();
  };
  await addImage('red.png', '#ff0000');
  await addImage('blue.png', '#0000ff');
  panel = await readPanel();
  assert.deepEqual(panel.viewer.images.map((image) => image.name), ['red.png', 'blue.png']);
  assert.equal(panel.viewer.activeImageIndex, 1);
  await page.evaluate(async () => {
    const { panels, activePanelId } = await import('/src/CE_Application/stores/panels.js');
    let id; activePanelId.subscribe((value) => { id = value; })();
    panels.update((list) => list.map((panel) => panel.id === id ? { ...panel, modified: false } : panel));
  });
  await viewer.getByRole('tab', { name: 'red.png' }).click();
  await settle();
  panel = await readPanel();
  assert.equal(panel.viewer.activeImageIndex, 0);
  assert.equal(panel.modified, false, 'switching Viewer images is workspace navigation');
  await viewer.getByTitle('Zoom In').click();
  assert.match(await viewer.locator('.zoom-input input').inputValue(), /^\d+$/);
  page.once('dialog', (dialog) => dialog.accept('renamed-red'));
  await viewer.getByRole('tab', { name: 'red.png' }).dblclick();
  await viewer.getByRole('tab', { name: 'renamed-red' }).waitFor();
  panel = await readPanel();
  assert.equal(panel.viewer.images[0].name, 'renamed-red');
  await page.evaluate(() => {
    const OriginalImage = window.Image;
    window.Image = new Proxy(OriginalImage, {
      construct(Target, args) {
        const image = new Target(...args);
        Object.defineProperty(image, 'src', {
          configurable: true,
          get() { return image.getAttribute('src') ?? ''; },
          set(value) { setTimeout(() => image.setAttribute('src', value), 500); },
        });
        return image;
      },
    });
    window.__restoreImage = () => { window.Image = OriginalImage; };
  });
  await viewer.getByRole('button', { name: 'Eyedropper' }).click();
  const imageBounds = await viewer.locator('.viewer-image').boundingBox();
  await page.mouse.click(imageBounds.x + imageBounds.width / 2,
    imageBounds.y + imageBounds.height / 2);
  assert.equal(await viewer.getByRole('button', { name: 'Eyedropper' })
    .evaluate((button) => button.classList.contains('active')), true,
    'a click before image pixels load must leave the eyedropper ready');
  await page.waitForTimeout(600);
  await page.mouse.move(imageBounds.x + imageBounds.width / 2,
    imageBounds.y + imageBounds.height / 2);
  await viewer.locator('.color-preview-hex').getByText('#FF0000').waitFor();
  await page.mouse.click(imageBounds.x + imageBounds.width / 2,
    imageBounds.y + imageBounds.height / 2);
  await page.evaluate(() => window.__restoreImage());
  await settle();
  assert.match(await viewer.locator('.status-box').inputValue(), /#FF0000/);
  assert.equal(await viewer.getByRole('button', { name: 'Eyedropper' })
    .evaluate((button) => button.classList.contains('active')), false);
  const serialized = await page.evaluate(async () => {
    const { activePanel } = await import('/src/CE_Application/stores/panels.js');
    const { serializePanel, deserializePanel } = await import('/src/CE_Application/stores/panelModel.js');
    let panel; activePanel.subscribe((value) => { panel = value; })();
    return deserializePanel(serializePanel(panel), 'Viewer QA.cepanel');
  });
  assert.deepEqual(serialized.viewer.images.map((image) => image.name), ['renamed-red', 'blue.png']);
  console.log('PASS Viewer image import, tab navigation, zoom, rename, eyedropper, and panel serialization');
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await server.close();
}
