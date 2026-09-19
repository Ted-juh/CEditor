import test from 'node:test';
import assert from 'node:assert/strict';
import { gaiaArpGrid } from '../../../tools/scripts/gaia-panel/components.mjs';
import { seedCustomValues, resolveCustomInteractionPatch } from '../src/CE_Application/utils/customComponentInteraction.js';
import { customNumericFields, customNumericPatch, customArpeggiatorKeyPatch } from '../src/CE_Application/utils/customNumericEditing.js';
import { materializedCustomComponentSnapshot } from '../src/CE_Application/utils/customComponentMaterializer.js';
import { arpeggiatorInspectorLayout } from '../src/CE_Application/utils/customComponentArpeggiator.js';
import { buildGaiaPanel } from '../../../tools/scripts/gaia-panel/make-gaia-panel.mjs';
import { mountPanel, loadScript, controlNamed, idOf } from './support/gaiaScriptHarness.mjs';
import { updatePanelPreviewSession } from '../src/CE_Application/stores/interactionPreview.js';

const grid = gaiaArpGrid({ width: 1536, height: 240 });
function selected(index = 0) {
  const values = seedCustomValues(grid);
  values.__arpeggiator.selectedBlock = values.__arpeggiator.blocks[index].id;
  values.arpEndStep = 16;
  return values;
}
function edit(values, role, input) {
  return customNumericPatch(grid, values, role, input, values.__arpeggiator.selectedBlock)?.customValues;
}

test('pitch accepts note names, accidentals and MIDI numbers; invalid input and stale selection are rejected', () => {
  for (const [input, expected] of [['C#4',61], ['Db4',61], ['d♭4',61], ['C-1',0], ['G9',127], ['73',73], ['-5',0], ['999',127]]) {
    const before = selected();
    const after = edit(before, 'arpPitchField', input);
    assert.equal(after.arpPattern[0].note, expected, input);
    assert.deepEqual(after.arpPattern.slice(1), before.arpPattern.slice(1));
    assert.equal(after.arpPattern[0].length, before.arpPattern[0].length);
    assert.equal(after.arpEndStep, 16);
    assert.ok(after.__arpeggiator.viewNote <= expected && after.__arpeggiator.viewNote + 11 >= expected);
  }
  for (const invalid of ['', ' ', 'H4', 'C#', 'C4 junk', 'Infinity']) assert.equal(edit(selected(), 'arpPitchField', invalid), undefined);
  assert.equal(customNumericPatch(grid, selected(), 'arpPitchField', 'D4', 'old-selection'), null);
});

test('start is one-based and preserves duration, even at the right boundary and outside the loop', () => {
  const before = selected(7); // step 17, length 4
  for (const [input, step] of [['1',0], ['20',19], ['32',28], ['100',28], ['0',0]]) {
    const after = edit(before, 'arpStartField', input);
    assert.deepEqual(after.arpPattern[7], { ...before.arpPattern[7], step });
    assert.deepEqual(after.arpPattern.slice(0,7), before.arpPattern.slice(0,7));
    assert.equal(after.arpEndStep, 16);
  }
});

test('navigation is chronological, preserves notes/playhead/end step and reveals off-screen pitches', () => {
  let values = selected();
  const before = structuredClone(values);
  for (const key of [']', ']', ']', ']']) values = customArpeggiatorKeyPatch(grid, values, { key }).customValues;
  assert.equal(values.__arpeggiator.selectedBlock, 'arp_seed_4');
  assert.equal(values.__arpeggiator.viewNote, 61, 'C5 is brought into view');
  assert.deepEqual(values.arpPattern, before.arpPattern);
  assert.equal(values.arpCurrentStep, before.arpCurrentStep);
  assert.equal(values.arpEndStep, 16);
  values = customArpeggiatorKeyPatch(grid, values, { key: 'End' }).customValues;
  assert.equal(values.__arpeggiator.selectedBlock, 'arp_seed_7');
  const zone = { name: 'arp_select_previous', zone: { action: 'arpeggiatorSelect', payload: { direction: 'previous' } } };
  const patch = resolveCustomInteractionPatch(grid, { customValues: values }, zone);
  assert.equal(patch.customValues.__arpeggiator.selectedBlock, 'arp_seed_6');
  assert.deepEqual(patch.customValues.arpPattern, before.arpPattern);
});

test('grid arrows edit the selected note only; Shift transposes by an octave', () => {
  let values = selected();
  values = customArpeggiatorKeyPatch(grid, values, { key: 'ArrowRight' }).customValues;
  values = customArpeggiatorKeyPatch(grid, values, { key: 'ArrowUp', shiftKey: true }).customValues;
  assert.deepEqual(values.arpPattern[0], { ...selected().arpPattern[0], step: 1, note: 72 });
  assert.deepEqual(values.arpPattern.slice(1), selected().arpPattern.slice(1));
  assert.equal(values.arpCurrentStep, 0);
  assert.equal(customArpeggiatorKeyPatch(grid, values, { key: 'Tab' }), null);
  assert.equal(customArpeggiatorKeyPatch(grid, values, { key: 'ArrowRight', ctrlKey: true }), null);
  for (const field of Object.values(customNumericFields(grid, seedCustomValues(grid)))) assert.equal(field.disabled, true);
});

test('inspector fits narrow and wide grids and selected outside-loop notes retain an outline', () => {
  for (const width of [320, 500, 880, 1536]) {
    const control = gaiaArpGrid({ width, height: 300 });
    const result = materializedCustomComponentSnapshot(control, { arpeggiator: selected(7).__arpeggiator, customChannels: { 'channel.arpEndStep.raw': 16 } });
    const parts = result._children.Parts._children;
    for (const [name, part] of Object.entries(parts).filter(([name]) => name.startsWith('arp_numeric_'))) {
      const r = part._children.Layout;
      assert.ok(r.x >= 0 && r.x + r.width <= width, `${width}: ${name}`);
      assert.ok(r.y >= 300 - arpeggiatorInspectorLayout(width).height && r.y + r.height <= 300, name);
    }
    assert.ok(parts.arp_block_arp_seed_7_selected);
    if (width >= 1180) assert.equal(parts.arp_numeric_status._children.Text.content, 'OUTSIDE LOOP');
    assert.equal(result._children.HitZones._children.arp_select_next.action, 'arpeggiatorSelect');
  }
});

test('inspector edits reach the existing pattern bridge; selection alone sends nothing', () => {
  const panel = buildGaiaPanel();
  mountPanel(panel);
  const control = controlNamed(panel, 'arp_pattern_grid');
  let values = seedCustomValues(control);
  updatePanelPreviewSession(idOf(control), { customValues: values });
  const script = loadScript(panel.scripts.find(s => s.id === 'gaia_arp_pattern_bridge').source);
  script.onPanelLoad();
  for (const key of ['Home', ']', '[']) {
    const patch = customArpeggiatorKeyPatch(control, values, { key });
    values = patch.customValues;
    updatePanelPreviewSession(idOf(control), patch);
    script.settle();
  }
  assert.deepEqual(script.writes, [], 'selection and viewport changes are not pattern edits');
  const patch = customNumericPatch(control, values, 'arpPitchField', 'C#4', values.__arpeggiator.selectedBlock);
  updatePanelPreviewSession(idOf(control), patch);
  script.settle();
  assert.ok(script.writes.some(([id, value]) => id.endsWith('.originalNote') && value === 61));
  assert.ok(script.writes.every(([id]) => id.startsWith('arpPattern.')), 'must not change END STEP or unrelated parameters');
});
