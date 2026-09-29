/**
 * variants.mjs — the variant a placed custom component picks is the look it draws with.
 *
 * Until 2026-09-29 picking a variant changed the document and nothing on screen. The unit tests
 * (test/customComponentVariants.test.js) pin the resolver; this reads the colour actually drawn,
 * in the editor and in preview mode (PanelPreviewSurface, the surface the exported plug-in's
 * player mounts), then the States × sizes sheet's own variant picker.
 *
 * Run: node browser-checks/variants.mjs
 */
import assert from 'node:assert/strict';
import { boot } from './behaviourKit.mjs';

const kit = await boot();
const failures = [];
const check = (name, fn) => {
  try { fn(); console.log(`  ok  ${name}`); } catch (error) { failures.push(name); console.log(`  FAIL ${name}\n       ${error.message}`); }
};

const DARK = { _type: 'Variant', name: 'dark', label: 'Dark', enabled: true,
  patches: { 'Parts.background.Background.Fill.colour': 'FF15171A' } };

/** The first painted background colour inside a part of the control, as the browser computed it. */
const partColour = (id, part) => kit.page.evaluate(({ id, part }) => {
  const root = document.querySelector(`[data-control-id="${id}"] [data-part-name="${part}"]`);
  if (!root) return null;
  for (const el of [root, ...root.querySelectorAll('*')]) {
    const colour = getComputedStyle(el).backgroundColor;
    if (colour && colour !== 'rgba(0, 0, 0, 0)' && colour !== 'transparent') return colour;
  }
  return 'none';
}, { id, part });

try {
  await kit.fresh();
  await kit.preview(false);
  const id = await kit.make('CustomComponent', { 'Transform.x': 80, 'Transform.y': 100, 'Transform.width': 200, 'Transform.height': 90 });
  // A fresh component starts blank; give it the factory's default parts, which have a background.
  await kit.page.evaluate(async (id) => {
    const { createCustomComponentPartsDefaults } = await import('/src/CE_Application/utils/customComponentFactory.js');
    const { applyControlPatch } = await import('/src/CE_Application/stores/controls.js');
    applyControlPatch(id, { 'Parts._children': createCustomComponentPartsDefaults()._children });
  }, id);
  await kit.set(id, { 'Variants.dark': DARK });
  await kit.settle(400);

  const base = await partColour(id, 'background');
  await kit.set(id, { 'Variants.active': 'dark', 'Designer.activeVariant': 'dark' });   // what the Properties picker writes
  await kit.settle(400);
  const picked = await partColour(id, 'background');
  check('picking a variant on a placed copy changes what the editor draws', () => {
    assert.ok(base && base !== 'none', `base look drawn: ${base}`);
    assert.equal(picked, 'rgb(21, 23, 26)', `base was ${base}`);
  });

  await kit.preview(true);
  await kit.settle(600);
  const previewed = await partColour(id, 'background');
  check('and what preview mode — the player\'s surface — draws', () => {
    assert.equal(previewed, 'rgb(21, 23, 26)');
  });
  await kit.preview(false);

  await kit.set(id, { 'Variants.active': 'default', 'Designer.activeVariant': 'default' });
  await kit.settle(400);
  const restored = await partColour(id, 'background');
  check('back to default is back to the base look', () => assert.equal(restored, base));

  // The sheet: opens on the copy's variant, and its picker redraws every cell.
  const box = await kit.box(id);
  await kit.page.mouse.click(box.x + box.w / 2, box.y + box.h / 2);
  await kit.settle(700);
  await kit.page.locator('[data-testid="component-designer-launch"]').click();
  await kit.settle(2500);
  await kit.page.locator('.contact-sheet-btn').click();
  await kit.page.locator('[data-testid="contact-sheet"]').waitFor({ state: 'visible', timeout: 10000 });
  const sheetColours = () => kit.page.evaluate(() => [...document.querySelectorAll('[data-testid="contact-sheet"] [data-cell] [data-part-name="background"]')]
    .map((root) => {
      for (const el of [root, ...root.querySelectorAll('*')]) {
        const colour = getComputedStyle(el).backgroundColor;
        if (colour && colour !== 'rgba(0, 0, 0, 0)') return colour;
      }
      return 'none';
    }));
  const before = await sheetColours();
  await kit.page.locator('[data-testid="contact-sheet-variant"]').selectOption('dark');
  await kit.settle(400);
  const after = await sheetColours();
  check('the sheet draws every cell in the variant picked there', () => {
    assert.ok(before.length >= 5 && before.every((c) => c === base), JSON.stringify(before));
    assert.ok(after.length === before.length && after.every((c) => c === 'rgb(21, 23, 26)'), JSON.stringify(after));
  });

  check('no page errors', () => assert.deepEqual([...kit.failures], []));
} finally {
  await kit.close();
}

assert.equal(failures.length, 0, `${failures.length} variant check(s) failed`);
console.log('variants: all checks passed');
