// Piece D4 of docs/design/changeable-control-sets.md: a set whose family names a library component,
// placed as linked copies. This checks which components can stand for a family and what an Apply
// would place, keep or put back (utils/setLibraryComponents.js), before any of it changes a panel.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { getControlSet, normalizeControlSetDefinition } from '../src/CE_Application/models/controlSets.js';
import { planComponentFromSelection } from '../src/CE_Application/utils/customComponentFromControls.js';
import { panelSetSummary } from '../src/CE_Application/utils/controlSetApply.js';
import {
  applySetComponentPlan, componentFit, fittingLibraryComponents, placedCopy, planSetComponents, repointSetComponentExports,
  resolveSetComponent, restoredControl, setComponentRef,
} from '../src/CE_Application/utils/setLibraryComponents.js';
import { createCustomComponentExportEnvelope } from '../src/CE_Application/utils/customComponentPackage.js';
import { diffCustomComponentAgainstSource, rebaseCustomComponentOnSource } from '../src/CE_Application/utils/customComponentSourceLink.js';
import { createControlSetEnvelope, normalizeControlSetEnvelope } from '../src/CE_Application/models/controlSetPackage.js';
import { scriptApiForTesting } from '../src/CE_Application/scripting/panelRuntime.js';
import { MODULES } from '../src/CE_Application/scripting/panelApi.js';
import { panels, activePanelId } from '../src/CE_Application/stores/panels.js';
import { panelPreviewSessions, syncPanelPreviewSessions } from '../src/CE_Application/stores/interactionPreview.js';

const set = getControlSet('tolex');

function control(type, name, props = {}) {
  const made = createControl(type);
  made._children.Core.id = `id_${name}`;
  made._children.Core.name = name;
  Object.assign(made._children.Transform, { x: 10, y: 10, width: 100, height: 120 });
  for (const [path, value] of Object.entries(props)) {
    const keys = path.split('.');
    let node = made._children;
    for (const key of keys.slice(0, -1)) node = node[key];
    node[keys.at(-1)] = value;
  }
  return made;
}

/** A component made from one control by Create Component from Selection, as layers or as one part. */
function componentFrom(type, as = 'layers') {
  const source = control(type, 'Source');
  const plan = planComponentFromSelection({ id: 'p', controls: [source], width: 400, height: 300 }, [source._children.Core.id], { set, name: 'T', valueControlsAs: as });
  assert.ok(plan.ok, `${type} as ${as} converts`);
  return plan.component;
}

function entry(name, version, component) {
  const slug = name.toLowerCase().replace(/\s+/g, '-');
  return { id: `${slug}@${version.replaceAll('.', '-')}`, name, version, fingerprint: `fp-${slug}-${version}`, component };
}

test('a component stands for a family when it has the right kind of value and draws it as travel', () => {
  const knob = componentFrom('Knob');
  assert.deepEqual(componentFit('Knob', knob), { ok: true, channel: 'Source', caption: '', reason: '' },
    'its readout is written by a binding, so it is not a caption');
  assert.equal(componentFit('Slider', knob).ok, true, 'a slider takes the same one moving value');
  assert.match(componentFit('Meter', knob).reason, /nothing that moves it/, 'a meter that could be dragged is not a meter');
  assert.match(componentFit('Button', knob).reason, /on\/off value a press holds/);

  // The knob as one exact part reads its value raw, through the knob's own range: a copy of
  // another range would turn its pointer past the end.
  const part = componentFrom('Knob', 'part');
  assert.equal(componentFit('Knob', part).ok, false);
  assert.match(componentFit('Knob', part).reason, /reads Source as a number from 0 to 1/);

  const button = componentFrom('Button');
  assert.equal(componentFit('Button', button).ok, true);
  assert.equal(componentFit('Button', button).caption, 'Parts.Source_caption.Text.content', 'a Tolex button is a device with a caption under it');
  assert.equal(componentFit('ToggleButton', button).ok, false, 'a momentary button does not flip');
  assert.equal(componentFit('ToggleButton', componentFrom('ToggleButton')).ok, true);
  assert.equal(componentFit('Meter', componentFrom('Meter')).ok, true);
  assert.match(componentFit('Label', knob).reason, /cannot name a library component/);
});

test('the list offers each package once, at its newest version, fitting ones first', () => {
  const knob = componentFrom('Knob');
  const rows = fittingLibraryComponents('Knob', [
    entry('Studio Knob', '1.0.0', knob), entry('Studio Knob', '1.2.0', knob), entry('Raw Knob', '1.0.0', componentFrom('Knob', 'part')),
  ]);
  assert.deepEqual(rows.map((row) => `${row.entry.name} ${row.entry.version} ${row.fit.ok}`), ['Studio Knob 1.2.0 true', 'Raw Knob 1.0.0 false']);
});

test('a set names the package; the exact version is used when the library has it, else the newest', () => {
  const knob = componentFrom('Knob');
  const old = entry('Studio Knob', '1.0.0', knob);
  const newer = entry('Studio Knob', '1.2.0', knob);
  const ref = setComponentRef(old);
  assert.deepEqual(ref, { id: 'studio-knob@1-0-0', name: 'Studio Knob', version: '1.0.0', fingerprint: 'fp-studio-knob-1.0.0' });
  assert.equal(resolveSetComponent(ref, [old, newer]).entry, old);
  assert.deepEqual(resolveSetComponent(ref, [newer]), { entry: newer, exact: false });
  assert.equal(resolveSetComponent(ref, []), null);
  // A set file keeps the reference, and drops one with no package id.
  const normal = normalizeControlSetDefinition({ ...set, id: 'mine', libraryComponents: { Knob: ref, Slider: { name: 'nothing' } } });
  assert.deepEqual(normal.libraryComponents, { Knob: ref });
});

test('applying a set that names a component places a copy per knob, and names the knobs that stay', () => {
  const knob = componentFrom('Knob');
  const studio = entry('Studio Knob', '1.0.0', knob);
  const mine = { ...set, id: 'mine', libraryComponents: { Knob: setComponentRef(studio) } };
  const panel = {
    controls: [
      control('Knob', 'Cutoff'),
      control('Knob', 'Resonance'),
      control('Knob', 'Depth', { 'Scripts.scripts': [{ name: 'depth', language: 'lua', code: '' }] }),
      control('Knob', 'Window', { 'Behavior.valueMode': 'range' }),
      control('Knob', 'Pinned', { 'Core.controlSetId': 'soft' }),
      control('Slider', 'Volume'),
    ],
  };
  const plan = planSetComponents(panel, mine, [studio]);
  assert.equal(plan.place.length, 1);
  const row = plan.place[0];
  assert.equal(row.family, 'Knobs');
  assert.equal(row.entry, studio);
  assert.deepEqual(row.controls.map((c) => c.name), ['Cutoff', 'Resonance']);
  assert.deepEqual(row.stays.map((c) => `${c.name}: ${c.reason}`), ['Depth: it has a script of its own', 'Window: it has more than one handle']);
  assert.deepEqual(plan.restore, []);

  // The Apply window's choices hold: knobs unticked, a selection, a pinned knob let in.
  assert.equal(planSetComponents(panel, mine, [studio], { families: new Set(['Sliders']) }).place.length, 0);
  assert.deepEqual(planSetComponents(panel, mine, [studio], { selected: new Set(['id_Cutoff']) }).place[0].controls.map((c) => c.name), ['Cutoff']);
  assert.ok(planSetComponents(panel, mine, [studio], { includePinned: true }).place[0].controls.some((c) => c.name === 'Pinned'));

  // Not in the library: listed, nothing placed.
  const absent = planSetComponents(panel, mine, []);
  assert.deepEqual(absent.place, []);
  assert.deepEqual(absent.missing.map((m) => `${m.family}: ${m.ref.name}`), ['Knobs: Studio Knob']);
});

test('copies a set placed go back when the next set names no component, and stay when it names the same one', () => {
  const knob = componentFrom('Knob');
  const studio = entry('Studio Knob', '1.0.0', knob);
  const original = control('Knob', 'Cutoff');
  const copy = {
    _type: 'CustomComponent',
    _children: {
      Core: { _type: 'Core', id: 'id_Cutoff', name: 'Cutoff', controlType: 'CustomComponent' },
      Designer: { packageName: 'Studio Knob', sourcePackage: { id: studio.id }, setPlacement: { setId: 'mine', type: 'Knob', channel: 'Source', replaced: original } },
    },
  };
  const own = { _type: 'CustomComponent', _children: { Core: { _type: 'Core', id: 'id_own', name: 'Own', controlType: 'CustomComponent' }, Designer: { sourcePackage: { id: studio.id } } } };
  const panel = { controls: [copy, own] };

  const back = planSetComponents(panel, set, [studio]);
  assert.deepEqual(back.restore.map((row) => `${row.from} → ${row.family}: ${row.controls.map((c) => c.name)}`), ['Studio Knob → Knobs: Cutoff'],
    'a copy made its own (no setPlacement) is never touched');
  assert.deepEqual(back.place, []);

  const same = planSetComponents(panel, { ...set, id: 'other', libraryComponents: { Knob: setComponentRef(entry('Studio Knob', '1.2.0', knob)) } }, [studio]);
  assert.deepEqual(same, { place: [], restore: [], missing: [] }, 'another version of the same package: the copy\'s own update decides');

  // The Apply window counts a placed copy as the knob it stands for.
  assert.deepEqual(panelSetSummary(panel).families, [{ label: 'Knobs', count: 1 }]);
});

/** A library entry as the library makes one, envelope and all. */
function packaged(name, version, component) {
  const envelope = createCustomComponentExportEnvelope(component, { name, version });
  return { ...entry(name, version, component), envelope, component: envelope.component, fingerprint: envelope.fingerprint };
}

function boundKnob(name, props = {}) {
  return control('Knob', name, {
    'Behavior.min': 20, 'Behavior.max': 20000, 'Behavior.step': 1, 'Behavior.defaultCurrentValue': 8000, 'Behavior.unit': 'Hz',
    'Core.layer': 'Synth', 'Transform.x': 140, 'Transform.y': 60,
    'DeviceBindings.enabled': true,
    'DeviceBindings.bindings': [{ kind: 'deviceParameter', parameterId: 'filter.cutoff' }],
    ...props,
  });
}

test('a copy stands where the knob was and carries what the knob was', () => {
  const studio = packaged('Studio Knob', '1.0.0', componentFrom('Knob'));
  const fit = componentFit('Knob', studio.component);
  const knob = boundKnob('Cutoff');
  const copy = placedCopy(knob, studio, fit, { setId: 'mine', type: 'Knob' });
  const c = copy._children;
  assert.equal(c.Core.controlType, 'CustomComponent');
  assert.equal(c.Core.id, 'id_Cutoff', 'the same id, so anything pointing at the knob finds the copy');
  assert.equal(c.Core.name, 'Cutoff');
  assert.equal(c.Core.layer, 'Synth');
  assert.deepEqual([c.Transform.x, c.Transform.y, c.Transform.width, c.Transform.height], [140, 60, 100, 120]);
  assert.equal(c.ExternalAPI.addressableName, 'Cutoff', 'not the package\'s id, which every copy would share');
  const channel = c.ValueChannels._children[fit.channel];
  assert.deepEqual([channel.min, channel.max, channel.step, channel.defaultValue, channel.format.unit], [20, 20000, 1, 8000, 'Hz']);
  assert.deepEqual(c.DeviceBindings.bindings, [{ kind: 'deviceParameter', parameterId: 'filter.cutoff', port: fit.channel }]);
  assert.deepEqual(c.Core.hostParameters, { [fit.channel]: { id: 'Cutoff.value', label: 'Cutoff' } }, 'the plug-in parameter keeps its id');
  assert.equal(c.Designer.setPlacement.type, 'Knob');
  assert.equal(c.Designer.setPlacement.replaced._children.Core.controlType, 'Knob');
  assert.equal(c.Designer.sourcePackage.id, studio.id, 'linked to the library, as any placed copy');
});

test('the knob comes back from its copy as the copy left it', () => {
  const studio = packaged('Studio Knob', '1.0.0', componentFrom('Knob'));
  const fit = componentFit('Knob', studio.component);
  const knob = boundKnob('Cutoff');
  const copy = placedCopy(knob, studio, fit, { setId: 'mine', type: 'Knob' });
  copy._children.Transform.x = 300;
  copy._children.Core.name = 'Brightness';
  copy._children.ValueChannels._children[fit.channel].max = 12000;
  copy._children.DeviceBindings.bindings.push({ kind: 'midiCc', cc: 74, port: fit.channel });
  const back = restoredControl(copy);
  const b = back._children;
  assert.equal(b.Core.controlType, 'Knob');
  assert.equal(b.Core.id, 'id_Cutoff');
  assert.equal(b.Core.name, 'Brightness');
  assert.equal(b.Transform.x, 300);
  assert.equal(b.Behavior.max, 12000);
  assert.equal(b.Behavior.min, 20);
  assert.deepEqual(b.DeviceBindings.bindings, [{ kind: 'deviceParameter', parameterId: 'filter.cutoff' }, { kind: 'midiCc', cc: 74 }],
    'on the knob\'s own value again');
  assert.equal(b.Designer, undefined, 'nothing of the copy left on it');
});

test('carrying out a plan: place, swap to another component, put back; the export list follows', () => {
  const studio = packaged('Studio Knob', '1.0.0', componentFrom('Knob'));
  const other = packaged('Other Knob', '1.0.0', componentFrom('Knob'));
  const panel = { controls: [boundKnob('Cutoff'), control('Slider', 'Volume')], exportParameters: [{ id: 'p1', controlName: 'Cutoff', path: 'Cutoff.value' }] };

  const toStudio = { ...set, id: 'studio-set', libraryComponents: { Knob: setComponentRef(studio) } };
  const placed = applySetComponentPlan(panel.controls, planSetComponents(panel, toStudio, [studio, other]), { setId: toStudio.id });
  assert.deepEqual(placed.changed.map((c) => `${c.name}:${c.type}:${c.from}>${c.to}`), ['Cutoff:Knob:>Source']);
  assert.equal(placed.controls[1], panel.controls[1], 'the slider is the same object: untouched');
  const exports = repointSetComponentExports(panel.exportParameters, placed.changed);
  assert.deepEqual(exports, [{ id: 'p1', controlName: 'Cutoff', path: 'Cutoff.Source' }], 'the id the DAW knows stays');

  const afterPlace = { controls: placed.controls };
  const toOther = { ...set, id: 'other-set', libraryComponents: { Knob: setComponentRef(other) } };
  const swapped = applySetComponentPlan(afterPlace.controls, planSetComponents(afterPlace, toOther, [studio, other]), { setId: toOther.id });
  const swappedCopy = swapped.controls[0]._children;
  assert.equal(swappedCopy.Designer.sourcePackage.id, other.id);
  assert.equal(swappedCopy.Designer.setPlacement.replaced._children.Core.controlType, 'Knob', 'placed from the knob, not from the first copy');

  const back = applySetComponentPlan(swapped.controls, planSetComponents({ controls: swapped.controls }, set, [studio, other]));
  assert.equal(back.controls[0]._children.Core.controlType, 'Knob');
  assert.deepEqual(repointSetComponentExports(exports, back.changed), [{ id: 'p1', controlName: 'Cutoff', path: 'Cutoff.value' }]);

  // An unticked row in the Apply window changes nothing.
  const skipped = applySetComponentPlan(panel.controls, planSetComponents(panel, toStudio, [studio]), { skip: new Set(['place:Knob']) });
  assert.deepEqual(skipped.changed, []);
});

test('a copy\'s range is its own: not a design edit, and kept by an update', () => {
  const component = componentFrom('Knob');
  const studio = packaged('Studio Knob', '1.0.0', component);
  const fit = componentFit('Knob', studio.component);
  const copy = placedCopy(boundKnob('Cutoff'), studio, fit, { type: 'Knob' });
  const report = diffCustomComponentAgainstSource(copy, [studio]);
  assert.equal(report.localEdits, 0, 'the knob\'s range and the placement record are this copy\'s, as its position is');
  assert.equal(report.status, 'current');

  const newer = packaged('Studio Knob', '1.1.0', component);
  const updated = rebaseCustomComponentOnSource(copy, newer, { report: diffCustomComponentAgainstSource(copy, [studio, newer]) });
  const channel = updated.control._children.ValueChannels._children[fit.channel];
  assert.deepEqual([channel.min, channel.max], [20, 20000]);
  assert.equal(updated.control._children.Designer.setPlacement.type, 'Knob');
  assert.equal(updated.control._children.Designer.sourcePackage.version, '1.1.0');
});

test('a script written for the knob reaches the copy\'s value', () => {
  const studio = packaged('Studio Knob', '1.0.0', componentFrom('Knob'));
  const fit = componentFit('Knob', studio.component);
  const copy = placedCopy(control('Knob', 'Cutoff', { 'Behavior.min': 0, 'Behavior.max': 127, 'Behavior.step': 1 }), studio, fit, { type: 'Knob' });
  try {
    panels.set([{ id: 'p', name: 'P', controls: [copy], scripting: { modules: MODULES.map((m) => m.id) } }]);
    activePanelId.set('p');
    panelPreviewSessions.set({});
    syncPanelPreviewSessions([copy]);
    const api = scriptApiForTesting('', 'set-placed-copy');
    api.set('Cutoff.value', 100);
    assert.equal(get(panelPreviewSessions).id_Cutoff?.customValues?.[fit.channel], 100);
    assert.equal(api.get('Cutoff.value'), 100);
    assert.equal(api.get('Cutoff'), 100, 'the bare name too');
  } finally { panels.set([]); panelPreviewSessions.set({}); }
});

test('a set file carries the components it names', () => {
  const studio = packaged('Studio Knob', '1.0.0', componentFrom('Knob'));
  const mine = { ...set, id: 'mine', name: 'Mine', libraryComponents: { Knob: setComponentRef(studio) } };
  const file = createControlSetEnvelope(mine, {}, [studio.envelope]);
  const read = normalizeControlSetEnvelope(JSON.stringify(file));
  assert.equal(read.set.libraryComponents.Knob.id, studio.id);
  assert.equal(read.components.length, 1);
  assert.equal(read.components[0].metadata.name, 'Studio Knob');
  assert.deepEqual(normalizeControlSetEnvelope(JSON.stringify(createControlSetEnvelope(set))).components, [], 'a set naming none carries none');
});
