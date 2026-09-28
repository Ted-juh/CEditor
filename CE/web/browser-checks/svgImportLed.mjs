/**
 * An LED from New Panel from SVG Artwork is a real indicator, in the running editor.
 *
 * utils/svgPanelImport.js builds it from existing pieces — a display-only ToggleButton showing only
 * its lamp — so what needs proving is behaviour, not structure: it draws dark, a click does not light
 * it (display-only), and feedback does (what a device binding on its `state` port delivers).
 *
 * Run: node browser-checks/svgImportLed.mjs  (starts the dev server, like the behaviour checks)
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { boot } from './behaviourKit.mjs';

const svg = readFileSync(fileURLToPath(new URL('../test/fixtures/svg-panel-illustrator.svg', import.meta.url)), 'utf8');
const kit = await boot();
const check = (name, fn) => { fn(); console.log(`  ok  ${name}`); };

try {
  await kit.preview(true);
  const ledId = await kit.page.evaluate(async (text) => {
    const { importSvgPanelText } = await import('/src/CE_Application/stores/svgPanelImportActions.js');
    const panel = importSvgPanelText(text, 'illustrator.svg');
    return panel.controls.find((c) => c._children.ContentLayout?.lamp === 'led')?._children.Core.id;
  }, svg);
  await kit.preview(true);
  await kit.settle(800);
  assert.ok(ledId, 'the import placed no LED');

  const lamp = () => kit.page.evaluate(() => {
    const el = document.querySelector('.lamp-indicator');
    if (!el) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return { lit: el.classList.contains('lit'), background: cs.backgroundColor, glow: cs.boxShadow, w: r.width, h: r.height };
  });

  const off = await lamp();
  check('it draws as a dark lamp the size of its placeholder', () => {
    assert.equal(off?.lit, false);
    assert.equal(off.background, 'rgb(58, 22, 20)');
    assert.match(off.glow, /inset/);
    assert.deepEqual([off.w, off.h], [10, 10]);
  });

  const box = await kit.box(ledId);
  await kit.click({ x: box.x + box.w / 2, y: box.y + box.h / 2 });
  check('a click does not light it — it is display-only', () => {});
  assert.notEqual((await kit.session(ledId))?.checked, true);
  assert.equal((await lamp()).lit, false);

  await kit.page.evaluate(async (id) => {
    const { updatePanelPreviewSession } = await import('/src/CE_Application/stores/interactionPreview.js');
    updatePanelPreviewSession(id, { checked: true });
  }, ledId);
  await kit.settle(300);
  const on = await lamp();
  check('feedback lights it, glowing', () => {
    assert.equal(on.lit, true);
    assert.equal(on.background, 'rgb(224, 68, 58)');
    assert.match(on.glow, /rgb\(224, 68, 58\) 0px 0px 8px/);
  });

  assert.deepEqual(kit.failures, []);
  console.log('svg import LED: all checks passed');
} finally {
  await kit.close();
}
