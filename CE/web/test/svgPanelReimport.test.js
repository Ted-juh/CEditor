// svgPanelReimport.test.js — a revised drawing updates the panel it made, and keeps the panel's work.
//
// The panel is built from test/fixtures/svg-panel-inkscape.svg, then worked on the way a real one is:
// a control renamed, one nudged, one deleted, one bound. The revised drawing moves one knob, adds one
// and drops the LED. Every rule in utils/svgPanelReimport.js's header gets a case.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { get } from 'svelte/store';

import { buildSvgImportControls, planSvgPanelImport } from '../src/CE_Application/utils/svgPanelImport.js';
import {
  artworkRecord, describeSvgReimport, linksForNewImport, planSvgPanelReimport,
} from '../src/CE_Application/utils/svgPanelReimport.js';
import { panels, activePanelId } from '../src/CE_Application/stores/panels.js';
import { updatePanelFromSvgText } from '../src/CE_Application/stores/svgPanelImportActions.js';

const here = dirname(fileURLToPath(import.meta.url));
const original = readFileSync(resolve(here, 'fixtures', 'svg-panel-inkscape.svg'), 'utf8');
const illustrator = readFileSync(resolve(here, 'fixtures', 'svg-panel-illustrator.svg'), 'utf8');
const MM = 96 / 25.4;

/** The drawing, revised: cutoff moved 10 mm right, a drive knob added, the clip LED gone. */
const revised = original
  .replace('inkscape:label="knob-cutoff" cx="20"', 'inkscape:label="knob-cutoff" cx="30"')
  .replace('<ellipse style="fill:#888888" id="ellipse1" inkscape:label="led clip" cx="100" cy="12" rx="2" ry="2" />',
    '<circle style="fill:#888888" id="circle9" inkscape:label="knob-drive" cx="100" cy="12" r="6" />');

function imported(text, name = 'Voice') {
  const plan = planSvgPanelImport(text);
  const controls = buildSvgImportControls(plan);
  return {
    id: 'p1', name, width: plan.width, height: plan.height, controls,
    artworkImport: artworkRecord(plan, linksForNewImport(plan, controls), name),
  };
}

const byName = (panel, name) => panel.controls.find((c) => c._children.Core.name === name);
const clone = (value) => JSON.parse(JSON.stringify(value));

test('a revised drawing moves what moved, adds what is new, and keeps what lost its placeholder', () => {
  const panel = imported(original);
  const update = planSvgPanelReimport(panel, planSvgPanelImport(revised));
  assert.deepEqual(update.moves.map((m) => m.name), ['cutoff']);
  assert.equal(update.moves[0].to.x, Math.round(22 * MM));
  assert.deepEqual(update.added.map((c) => c._children.Core.name), ['drive']);
  assert.deepEqual(update.kept.map((k) => k.name), ['clip'], 'the LED control is kept, not deleted');
  assert.equal(update.unchanged, 4);
  assert.equal(update.size, null);
});

test('an unchanged drawing changes nothing', () => {
  const panel = imported(original);
  const update = planSvgPanelReimport(panel, planSvgPanelImport(original));
  assert.equal(update.moves.length + update.added.length + update.kept.length, 0);
  assert.equal(update.unchanged, 6);
});

test('a control renamed in CEditor is still matched, by the placeholder it came from', () => {
  const panel = imported(original);
  byName(panel, 'cutoff')._children.Core.name = 'FilterCutoff';
  const update = planSvgPanelReimport(panel, planSvgPanelImport(revised));
  assert.deepEqual(update.moves.map((m) => m.name), ['FilterCutoff']);
  assert.ok(!update.added.some((c) => /cutoff/i.test(c._children.Core.name)), 'and not added a second time');
});

test('a control nudged in CEditor keeps the nudge while the artwork leaves it alone', () => {
  const panel = imported(original);
  byName(panel, 'Resonance')._children.Transform.x += 7;
  const update = planSvgPanelReimport(panel, planSvgPanelImport(revised));
  assert.ok(!update.moves.some((m) => m.name === 'Resonance'));
});

test('when both moved, the artwork wins and the report says so', () => {
  const panel = imported(original);
  byName(panel, 'cutoff')._children.Transform.y += 5;
  const update = planSvgPanelReimport(panel, planSvgPanelImport(revised));
  assert.equal(update.moves[0].overrodeLocal, true);
  assert.ok(describeSvgReimport(update).some((line) => /cutoff was moved in CEditor .* the artwork wins/.test(line)));
});

test('a control deleted from the panel stays deleted', () => {
  const panel = imported(original);
  panel.controls = panel.controls.filter((c) => c._children.Core.name !== 'env_amount');
  const update = planSvgPanelReimport(panel, planSvgPanelImport(revised));
  assert.ok(!update.added.some((c) => c._children.Core.name.startsWith('env_amount')));
  assert.equal(update.notReadded.length, 1);
  assert.ok(update.record.links.some((link) => link.key === 'slider-env amount'), 'and the record still remembers the deletion');
});

test('renaming a placeholder in the drawing makes it a new placeholder, and says so', () => {
  // The key IS the name. A renamed object cannot be told from a deleted one plus a new one, so the old
  // control is kept (with its bindings) and reported, and the new name gets a control of its own.
  const panel = imported(original);
  const renamed = revised.replace('inkscape:label="knob-cutoff"', 'inkscape:label="slider-cutoff"');
  const update = planSvgPanelReimport(panel, planSvgPanelImport(renamed));
  assert.deepEqual(update.kept.map((k) => k.name), ['cutoff', 'clip']);
  assert.ok(update.added.some((c) => c._children.Core.name === 'cutoff_2' && c._children.Core.controlType === 'Slider'));
});

test('a placeholder that now says another type is reported, and the control keeps its own', () => {
  const panel = imported(original);
  byName(panel, 'mode')._children.Core.controlType = 'ToggleButton';
  const update = planSvgPanelReimport(panel, planSvgPanelImport(original));
  assert.deepEqual(update.retyped.map((r) => `${r.name}:${r.type}->${r.wanted}`), ['mode:ToggleButton->Button']);
});

test('unnamed placeholders are followed by where they were', () => {
  const panel = imported(illustrator, 'Illu');
  const nudged = illustrator.replace('<circle fill="#FF0000" cx="60" cy="80" r="25"/>', '<circle fill="#FF0000" cx="66" cy="84" r="25"/>');
  const update = planSvgPanelReimport(panel, planSvgPanelImport(nudged));
  assert.equal(update.moves.length, 1, 'the knob moved');
  assert.equal(update.added.length, 0, 'and was not taken for a new one');
  assert.equal(update.moves[0].to.x, 41);
});

test('a panel with no record adopts controls named like the placeholders', () => {
  const panel = imported(original);
  delete panel.artworkImport;
  const update = planSvgPanelReimport(panel, planSvgPanelImport(revised));
  assert.deepEqual(update.moves.map((m) => m.name), ['cutoff']);
  assert.deepEqual(update.added.map((c) => c._children.Core.name), ['drive']);
  assert.equal(update.record.links.length, 6, 'and leaves a record for next time, one link per placeholder');
});

test('a resized drawing resizes the panel', () => {
  const panel = imported(original);
  const wider = revised.replace('width="120mm"', 'width="140mm"').replace('viewBox="0 0 120 60"', 'viewBox="0 0 140 60"');
  const update = planSvgPanelReimport(panel, planSvgPanelImport(wider));
  assert.equal(update.size.to.width, Math.round(140 * MM));
});

// --- The command -------------------------------------------------------------------------------------

test('the command asks first, and does nothing when told no', () => {
  const panel = imported(original);
  panels.set([clone(panel)]);
  activePanelId.set('p1');
  let asked = '';
  const result = updatePanelFromSvgText(revised, 'voice-v2.svg', { confirm: (text) => { asked = text; return false; } });
  assert.equal(result, null);
  assert.match(asked, /Update "Voice" from voice-v2\.svg\?/);
  assert.match(asked, /move 1 control, add 1 control/);
  assert.match(asked, /not the previous background image/);
  assert.equal(get(panels)[0].controls.length, 6);
});

test('the command applies the update to the open panel', () => {
  const panel = imported(original);
  byName(panel, 'cutoff')._children.DeviceBindings = { _type: 'DeviceBindings', bindings: [{ kind: 'deviceParameter', parameterId: 'vcf.cutoff' }] };
  panels.set([clone(panel)]);
  activePanelId.set('p1');
  updatePanelFromSvgText(revised, 'voice-v2.svg', { confirm: () => true });
  const after = get(panels)[0];
  assert.equal(after.controls.length, 7);
  const cutoff = byName(after, 'cutoff');
  assert.equal(cutoff._children.Transform.x, Math.round(22 * MM));
  assert.equal(cutoff._children.DeviceBindings.bindings[0].parameterId, 'vcf.cutoff', 'its binding survives');
  assert.ok(byName(after, 'clip'), 'the LED control is still there');
  assert.match(after.bgImage, /^data:image\/svg\+xml;base64,/);
  assert.equal(after.artworkImport.file, 'voice-v2');
  assert.equal(after.modified, true);
});
