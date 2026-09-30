/**
 * inspectorDrawn.mjs — the inspector shows what is drawn, and an edit back to the factory value sticks.
 *
 * Under the default control set a slider has no ticks and a label has its own tracking, although both
 * controls hold the factory values (ticks on, tracking 0). The inspector used to show those stored
 * values — a Ticks flag lit over a slider with none — and setting one back to the factory value was
 * overridden by the set again. This checks, through the real Properties panel:
 *
 *   slider   the Ticks flag reads what is drawn (off), and turning it on draws ticks and stays on
 *   label    the Letter field reads the set's tracking; typing 0 draws the label untracked, pinned
 *
 * Run: CE_BEHAVIOUR_URL=http://127.0.0.1:5199/ node browser-checks/inspectorDrawn.mjs
 */
import assert from 'node:assert/strict';
import { boot } from './behaviourKit.mjs';

const kit = await boot();
const page = kit.page;
const props = page.locator('.properties-panel');
const failures = [];
const check = (name, fn) => {
  try { fn(); console.log(`  ok  ${name}`); } catch (error) { failures.push(name); console.log(`  FAIL ${name}\n       ${error.message}`); }
};
async function tab(name) {
  await props.locator(`.tab-icon[title="${name}"]`).click();
  const collapsed = props.locator('.header-toggle[aria-expanded="false"]');
  while (await collapsed.count()) await collapsed.first().click();
  await kit.settle(300);
}
async function select(id) {
  const box = await kit.box(id);
  await page.mouse.click(box.x + box.w / 2, box.y + 4);
  await kit.settle(500);
}

try {
  await kit.fresh();
  await kit.preview(false);

  // --- Slider: the Ticks flag ------------------------------------------------------------------------
  const slider = await kit.make('Slider', { 'Transform.x': 40, 'Transform.y': 40, 'Transform.width': 300, 'Transform.height': 80 });
  await select(slider);
  await tab('Slider');
  const ticksFlag = props.locator('button.flag[title^="Ticks"]').first();
  const tickCount = () => page.locator(`.canvas-control[data-control-id="${slider}"] .slider-svg [data-tick]`).count();
  const flagBefore = await ticksFlag.getAttribute('aria-pressed');
  const ticksBefore = await tickCount();
  await ticksFlag.click();
  await kit.settle(500);
  const flagAfter = await ticksFlag.getAttribute('aria-pressed');
  const ticksAfter = await tickCount();
  const stored = await kit.read(slider, 'Core');
  check('the Ticks flag shows the ticks the set hides, and turning it on draws them and stays on', () => {
    assert.equal(ticksBefore, 0, 'the default set draws no ticks');
    assert.equal(flagBefore, 'false', 'so the flag reads off, though the control stores the factory "on"');
    assert.ok(ticksAfter > 0, `turned on, ticks are drawn: ${ticksAfter}`);
    assert.equal(flagAfter, 'true');
    assert.deepEqual(stored.setOverrides, ['Behavior.showTicks'], 'pinned against the set');
  });

  // --- Label: letter spacing ------------------------------------------------------------------------
  const label = await kit.make('Label', { 'Transform.x': 40, 'Transform.y': 200, 'Transform.width': 300, 'Transform.height': 60, 'Text.content': 'abcd' });
  await select(label);
  await tab('Text');
  const letter = props.getByRole('textbox', { name: 'Letter', exact: true });
  const drawnSpacing = () => page.evaluate((id) => {
    const glyphs = document.querySelector(`.canvas-control[data-control-id="${id}"] .text-glyphs`);
    return glyphs ? parseFloat(getComputedStyle(glyphs).letterSpacing) || 0 : null;
  }, label);
  const shownBefore = Number(await letter.inputValue());
  const drawnBefore = await drawnSpacing();
  await letter.fill('0');
  await letter.press('Enter');
  await kit.settle(500);
  const shownAfter = Number(await letter.inputValue());
  const drawnAfter = await drawnSpacing();
  const labelCore = await kit.read(label, 'Core');
  check('the Letter field shows the set\'s tracking, and 0 typed there is drawn and kept', () => {
    assert.notEqual(drawnBefore, 0, 'the default set tracks a label');
    assert.ok(Math.abs(shownBefore - drawnBefore) < 0.05, `the field shows what is drawn: ${shownBefore} vs ${drawnBefore}`);
    assert.equal(shownAfter, 0);
    assert.equal(drawnAfter, 0, 'drawn untracked');
    assert.ok(labelCore.setOverrides?.includes('Text.Font.letterSpacing'), JSON.stringify(labelCore.setOverrides));
  });

  check('no page errors', () => assert.deepEqual([...kit.failures], []));
} finally {
  await kit.close();
}

assert.equal(failures.length, 0, `${failures.length} check(s) failed`);
console.log('inspector drawn: all checks passed');
