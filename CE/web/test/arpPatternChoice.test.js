// arpPatternChoice.test.js — an author marks an arpeggio grid for a synth, on the Device tab.
//
// `Designer.patternEditing.kind` decides whose user pattern a grid reads and sends (arpPatternLayouts.js),
// and only a generator could set it: there was no control for it anywhere in the editor. It is set
// on the Device tab now, and it is a setting of the copy, like its bindings — so marking a placed
// grid for the SH-201 does not make it an edited copy of its package, an update from the library
// keeps the mark, and saving a design edit back to the library does not hand the mark to every
// other copy.

import test from 'node:test';
import assert from 'node:assert/strict';
import { render } from 'svelte/server';

import DeviceBindingsEditor from '../src/CE_Application/sections/DeviceBindingsEditor.svelte';
import { gaiaArpGrid } from '../../../tools/scripts/gaia-panel/components.mjs';
import {
  createCustomComponentExportEnvelope, customComponentPackageId, instantiateCustomComponentPackageControl,
} from '../src/CE_Application/utils/customComponentPackage.js';
import {
  diffCustomComponentAgainstSource, pushCustomComponentToSource, rebaseCustomComponentOnSource,
} from '../src/CE_Application/utils/customComponentSourceLink.js';
import {
  hasPatternEditing, isPatternGrid, patternEditingChoice, patternEditingPatch, patternLayoutOf,
} from '../src/CE_Application/utils/arpPatternLayouts.js';

const clone = (value) => JSON.parse(JSON.stringify(value));

function entryFor(control, metadata) {
  const envelope = createCustomComponentExportEnvelope(control, { name: 'Arp Grid', ...metadata });
  return { id: customComponentPackageId(envelope), savedAt: '2026-01-01T00:00:00.000Z', name: envelope.metadata.name,
    version: envelope.metadata.version, fingerprint: envelope.fingerprint, component: envelope.component, envelope };
}

const grid = () => gaiaArpGrid({ width: 600, height: 200, steps: 32 });
const place = (entry) => instantiateCustomComponentPackageControl(entry.envelope, { id: 'grid_copy', Transform: { x: 10, y: 10 } });

function markFor(control, kind) {
  const next = clone(control);
  next._children.Designer.patternEditing = patternEditingPatch(kind)['Designer.patternEditing'];
  return next;
}

test('a grid is offered every synth layout, and its mark says which and what it is bound to', () => {
  const unmarked = place(entryFor(grid(), { version: '1.0.0' }));
  assert.ok(isPatternGrid(unmarked));
  const choice = patternEditingChoice(unmarked);
  assert.deepEqual(choice.options.map((o) => o.label), ['None', 'Roland GAIA SH-01', 'Roland SH-201']);
  assert.equal(choice.kind, '');

  const sh201 = markFor(unmarked, 'sh201');
  assert.equal(patternLayoutOf(sh201).synth, 'SH-201');
  assert.deepEqual([patternEditingChoice(sh201).kind, patternEditingChoice(sh201).endStep, patternEditingChoice(sh201).deviceRole],
    ['sh201', 'arpeggio.endStep', ''], 'marked, End Step not bound yet');
  sh201._children.DeviceBindings = { bindings: [{ kind: 'deviceParameter', port: 'arpEndStep', deviceRole: 'Roland SH-201', parameterId: 'arpeggio.endStep' }] };
  assert.equal(patternEditingChoice(sh201).deviceRole, 'Roland SH-201');

  assert.equal(hasPatternEditing(markFor(sh201, '')), false, 'None clears the mark');
  assert.equal(hasPatternEditing(markFor(sh201, 'nonsense')), false);
  assert.equal(patternEditingChoice({ _children: { Core: { controlType: 'Knob' } } }), null, 'not offered on a knob');
});

test('the mark is the copy\'s: not a design edit, kept by an update, not pushed to the library', () => {
  const v1 = entryFor(grid(), { version: '1.0.0' });
  const copy = markFor(place(v1), 'sh201');
  assert.equal(diffCustomComponentAgainstSource(copy, [v1]).status, 'current', 'marking a copy does not edit it');

  // A new version of the package, which the copy can update to and keeps its mark through.
  const redesigned = clone(v1.component);
  redesigned._children.Core.description = 'redrawn';
  const v2 = entryFor(redesigned, { version: '1.1.0' });
  const report = diffCustomComponentAgainstSource(copy, [v1, v2]);
  assert.equal(report.status, 'update');
  const updated = rebaseCustomComponentOnSource(copy, report.latest, { report }).control;
  assert.equal(updated._children.Designer.patternEditing.kind, 'sh201');
  assert.equal(diffCustomComponentAgainstSource(updated, [v1, v2]).status, 'current');

  // A design edit saved back to the library takes the design and leaves the mark where it was.
  const edited = clone(copy);
  edited._children.Core.description = 'my own drawing';
  const editedReport = diffCustomComponentAgainstSource(edited, [v1]);
  assert.equal(editedReport.status, 'edited');
  const plan = pushCustomComponentToSource(edited, editedReport);
  assert.ok(!plan.refused, plan.refused);
  assert.equal(plan.component._children.Designer.patternEditing, undefined, 'the package carries no copy\'s synth');
});

test('the Device tab shows the setting on a grid, and only on a grid', () => {
  const v1 = entryFor(grid(), { version: '1.0.0' });
  const copy = markFor(place(v1), 'sh201');
  const body = render(DeviceBindingsEditor, { props: { control: copy } }).body;
  assert.match(body, /Arpeggio Pattern/);
  assert.match(body, /Roland SH-201/);
  assert.match(body, /Bind the Loop End Step port to arpeggio\.endStep/);

  const knob = { _children: { Core: { id: 'k', controlType: 'Knob', name: 'k' }, DeviceBindings: { bindings: [] } } };
  assert.doesNotMatch(render(DeviceBindingsEditor, { props: { control: knob } }).body, /Arpeggio Pattern/);
});
