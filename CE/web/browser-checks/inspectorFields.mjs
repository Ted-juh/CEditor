/**
 * inspectorFields.mjs — inspector sections drawn from data, driven in the running editor.
 *
 * test/inspectorFields.test.js renders the editor on the server, which proves what it draws but not
 * that its sliders and switches write. The acceptance harness's properties mode opens the Kinetic tab
 * but only fills text and number inputs, so it edits none of these fields. This does: the Run switch,
 * a plain slider, a percent slider, and the editor's own Sync snippet in its slot.
 *
 * Crossfader is the second section, for the number and select kinds: a select, a clamped number, and
 * the Rest and Time fields that appear only once "On release" asks for them.
 *
 * Chord Pad, Meter and Mod Matrix bring whole numbers (rounded and clamped, or rounded with only a
 * floor) and a clamped fraction; one of each is typed here. A NumberCell holds what is typed to its
 * own min..max before a field sees it, which the Meter's Segments shows.
 *
 * Run: node browser-checks/inspectorFields.mjs
 */
import assert from 'node:assert/strict';
import { boot } from './behaviourKit.mjs';

const kit = await boot();
const failures = [];
const check = (name, fn) => {
  try { fn(); console.log(`  ok  ${name}`); } catch (error) { failures.push(name); console.log(`  FAIL ${name}\n       ${error.message}`); }
};

/** Move a slider the way a drag ends: set its value and fire `input`. */
const slide = (cell, value) => cell.locator('input[type="range"]').evaluate((input, v) => {
  input.value = String(v);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}, value);
const cellOf = (props, label) => props.locator('.property-cell', { has: props.page().locator(`.property-label:text-is("${label}")`) });

try {
  await kit.fresh();
  await kit.preview(false);
  const id = await kit.make('Kinetic', { 'Transform.x': 60, 'Transform.y': 60 });
  await kit.page.evaluate(async (id) => {
    const { selectedComponentIds } = await import('/src/CE_Application/stores/panels.js');
    selectedComponentIds.set(new Set([id]));
  }, id);
  await kit.settle(400);
  const props = kit.page.locator('.properties-panel');
  await props.locator('.tab-icon[title="Kinetic"]').click();
  await kit.settle(400);

  const before = await kit.read(id, 'Kinetic.running');
  await cellOf(props, 'Run').locator('button[role="switch"]').click();
  await kit.settle(200);
  const run = await kit.read(id, 'Kinetic.running');
  check('the Run switch flips the stored value', () => {
    assert.notEqual(before, false, 'it starts on (missing or true)');
    assert.equal(run, false);
  });

  await slide(cellOf(props, 'Gravity'), 2.5);
  await slide(cellOf(props, 'Bounce'), 40);
  await kit.settle(200);
  const written = { gravity: await kit.read(id, 'Kinetic.gravity'), restitution: await kit.read(id, 'Kinetic.restitution') };
  const shown = {
    gravity: await cellOf(props, 'Gravity').locator('.lbl').textContent(),
    bounce: await cellOf(props, 'Bounce').locator('.lbl').textContent(),
  };
  check('a plain slider stores what it shows; a percent slider stores a fraction', () => {
    assert.deepEqual(written, { gravity: 2.5, restitution: 0.4 });
    assert.deepEqual(shown, { gravity: '2.50', bounce: '40%' });
  });

  await cellOf(props, 'Sync to transport').locator('button[role="switch"]').click();
  await kit.settle(200);
  const sync = await kit.read(id, 'Kinetic.syncToTransport');
  check('the Sync snippet in its slot still writes', () => assert.equal(sync, true));

  // --- Crossfader: selects, numbers and fields that come and go ---------------------------------
  const xf = await kit.make('Crossfader', { 'Transform.x': 60, 'Transform.y': 260 });
  await kit.page.evaluate(async (id) => {
    const { selectedComponentIds } = await import('/src/CE_Application/stores/panels.js');
    selectedComponentIds.set(new Set([id]));
  }, xf);
  await kit.settle(400);
  await props.locator('.tab-icon[title="Crossfader"]').click();
  await kit.settle(400);

  await cellOf(props, 'Law').locator('select').selectOption('sharp');
  await kit.settle(200);
  const law = await kit.read(xf, 'Crossfader.law');
  check('a select writes the value chosen', () => assert.equal(law, 'sharp'));

  const mix = props.locator('input.nc-value[aria-label="Mix"]');
  await mix.fill('5');
  await mix.press('Enter');
  await kit.settle(200);
  const mixed = await kit.read(xf, 'Crossfader.mix');
  check('a number field writes what is typed, clamped to its range', () => assert.equal(mixed, 1));

  const restBefore = await props.locator('input.nc-value[aria-label="Rest"]').count();
  const timeBefore = await props.locator('input.nc-value[aria-label="Time (ms)"]').count();
  await cellOf(props, 'On release').locator('select').selectOption('rest');
  await kit.settle(300);
  const rest = props.locator('input.nc-value[aria-label="Rest"]');
  const shownAfter = { rest: await rest.count(), time: await props.locator('input.nc-value[aria-label="Time (ms)"]').count() };
  await rest.fill('0.8');
  await rest.press('Enter');
  const time = props.locator('input.nc-value[aria-label="Time (ms)"]');
  await time.fill('600');
  await time.press('Enter');
  await kit.settle(200);
  const spring = { mode: await kit.read(xf, 'Crossfader.returnMode'), value: await kit.read(xf, 'Crossfader.returnValue'), time: await kit.read(xf, 'Crossfader.returnTime') };
  check('choosing "A set value" brings in Rest and Time, and both write', () => {
    assert.deepEqual([restBefore, timeBefore], [0, 0], 'hidden while the handle latches');
    assert.deepEqual(shownAfter, { rest: 1, time: 1 });
    assert.deepEqual(spring, { mode: 'rest', value: 0.8, time: 600 });
  });

  // --- Chord Pad, Meter, Mod Matrix: whole numbers and a clamped fraction -------------------------
  const select = async (type, y, tab) => {
    const made = await kit.make(type, { 'Transform.x': 60, 'Transform.y': y });
    await kit.page.evaluate(async (id) => {
      const { selectedComponentIds } = await import('/src/CE_Application/stores/panels.js');
      selectedComponentIds.set(new Set([id]));
    }, made);
    await kit.settle(400);
    await props.locator(`.tab-icon[title="${tab}"]`).click();
    await kit.settle(400);
    return made;
  };
  const type = async (label, text) => {
    const input = props.locator(`input.nc-value[aria-label="${label}"]`).first();
    await input.fill(text);
    await input.press('Enter');
    await kit.settle(200);
  };

  const pad = await select('ChordPad', 460, 'Chord Pad');
  await type('Vel', '63.6');
  const vel = await kit.read(pad, 'ChordPad.velocity');
  await type('Vel', '400');
  const velHigh = await kit.read(pad, 'ChordPad.velocity');
  const invBefore = await props.locator('input.nc-value[aria-label="Inv"]').count();
  await cellOf(props, 'Mode').locator('select').selectOption('notes');
  await kit.settle(300);
  const swapped = { inv: await props.locator('input.nc-value[aria-label="Inv"]').count(), oct: await props.locator('input.nc-value[aria-label="Oct"]').count() };
  check('a whole-number field writes rounded and clamped, and Mode swaps Inversion for Octaves', () => {
    assert.deepEqual([vel, velHigh], [64, 127]);
    assert.equal(invBefore, 1);
    assert.deepEqual(swapped, { inv: 0, oct: 2 }, 'Octaves (span) and Octave (transpose) both read "Oct"');
  });

  const meter = await select('Meter', 660, 'Meter');
  await type('Seg', '7.4');
  const seg = await kit.read(meter, 'Meter.segments');
  await type('Seg', '100');
  const segHigh = await kit.read(meter, 'Meter.segments');
  // The NumberCell holds a typed value to its min..max before the field sees it, whatever `clamp` says.
  check('a rounded field writes a whole number, held to the cell\'s range', () => assert.deepEqual([seg, segHigh], [7, 64]));

  const matrix = await select('Matrix', 860, 'Matrix');
  await type('Snap', '0.25');
  const snap = await kit.read(matrix, 'Matrix.step');
  await type('Snap', '3');
  const snapHigh = await kit.read(matrix, 'Matrix.step');
  check('Snap keeps a fraction and clamps to 1', () => assert.deepEqual([snap, snapHigh], [0.25, 1]));

  check('no page errors', () => assert.deepEqual([...kit.failures], []));
} finally {
  await kit.close();
}

assert.equal(failures.length, 0, `${failures.length} inspector field check(s) failed`);
console.log('inspector fields: all checks passed');
