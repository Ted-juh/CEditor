// Piece D4 of docs/design/changeable-control-sets.md: a set whose family names a library component,
// placed as linked copies. This checks which components can stand for a family and what an Apply
// would place, keep or put back (utils/setLibraryComponents.js), before any of it changes a panel.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { getControlSet, normalizeControlSetDefinition } from '../src/CE_Application/models/controlSets.js';
import { planComponentFromSelection } from '../src/CE_Application/utils/customComponentFromControls.js';
import { panelSetSummary } from '../src/CE_Application/utils/controlSetApply.js';
import {
  componentFit, fittingLibraryComponents, planSetComponents, resolveSetComponent, setComponentRef,
} from '../src/CE_Application/utils/setLibraryComponents.js';

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
