import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CUSTOM_COMPONENT_STARTERS,
  createCustomComponentSections,
  createCustomComponentStarterPatch,
} from '../src/CE_Application/utils/customComponentFactory.js';
import { materializedCustomComponentSnapshot } from '../src/CE_Application/utils/customComponentMaterializer.js';
import { validateCustomComponentPackage } from '../src/CE_Application/utils/customComponentPackage.js';
import { deepClone } from '../src/CE_Application/utils/deepClone.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { applyPatchObject } from '../src/CE_Application/stores/controlTreeUtils.js';

function setPatchValue(control, path, value) {
  const segments = String(path).split('.').filter(Boolean);
  if (!segments.length) return;

  let target = control._children;
  while (segments.length > 1) {
    const segment = segments.shift();
    if (!target[segment] || typeof target[segment] !== 'object') target[segment] = {};
    target = target[segment]._children ?? target[segment];
  }
  target[segments[0]] = deepClone(value);
}

function makeBaseCustomComponent() {
  return {
    _children: {
      Core: { id: 'starter_test', name: 'Starter Test', controlType: 'CustomComponent', enabled: true },
      Transform: { x: 0, y: 0, width: 160, height: 120 },
      Parts: { _type: 'Parts', _children: {} },
      ...createCustomComponentSections(),
    },
  };
}

function applyStarter(starterId) {
  const control = makeBaseCustomComponent();
  const patch = createCustomComponentStarterPatch(starterId);
  for (const [path, value] of Object.entries(patch)) {
    setPatchValue(control, path, value);
  }
  return control;
}

function applyStarterToRuntimeControl(starterId) {
  const control = createControl('CustomComponent');
  applyPatchObject(control, createCustomComponentStarterPatch(starterId));
  return control;
}

test('custom component starters create valid package-ready controls', () => {
  assert.ok(CUSTOM_COMPONENT_STARTERS.length >= 4);
  assert.ok(CUSTOM_COMPONENT_STARTERS.some((starter) => starter.id === 'starter.circularTickSlider'));
  assert.ok(CUSTOM_COMPONENT_STARTERS.some((starter) => starter.id === 'starter.circularLedRing'));

  for (const starter of CUSTOM_COMPONENT_STARTERS) {
    const control = applyStarter(starter.id);
    const validation = validateCustomComponentPackage(control);

    assert.equal(validation.ok, true, `${starter.id}: ${validation.issues.join(', ')}`);
    assert.ok(Object.keys(control._children.ValueChannels._children).length >= 1);
    assert.ok(Object.keys(control._children.PublishedProperties.outputs).length >= 1);
  }
});

test('custom component starters replace stale default runtime targets', () => {
  for (const starter of CUSTOM_COMPONENT_STARTERS) {
    const control = applyStarterToRuntimeControl(starter.id);
    const validation = validateCustomComponentPackage(control);

    assert.equal(validation.ok, true, `${starter.id}: ${validation.issues.join(', ')}`);
    assert.ok(control._children.ExternalAPI.addressableName, `${starter.id}: missing public API name`);
  }
});

test('custom component starters replace stale public API identity when loaded sequentially', () => {
  const control = createControl('CustomComponent');
  applyPatchObject(control, createCustomComponentStarterPatch('starter.macroRings'));
  assert.equal(control._children.ExternalAPI.addressableName, 'threeRingMacro');

  applyPatchObject(control, createCustomComponentStarterPatch('starter.filmstripKnob'));
  assert.equal(control._children.ExternalAPI.addressableName, 'filmstripKnob');
  assert.deepEqual(control._children.ExternalAPI.events.map((event) => event.id), ['valueChange', 'modeChange']);
});

test('starter generators materialize expected editable runtime structures', () => {
  const grid = materializedCustomComponentSnapshot(applyStarter('starter.xyGridPad'));
  const piano = materializedCustomComponentSnapshot(applyStarter('starter.scrollPianoBar'));
  const rings = materializedCustomComponentSnapshot(applyStarter('starter.macroRings'));
  const circular = materializedCustomComponentSnapshot(applyStarter('starter.circularTickSlider'));
  const ledRing = materializedCustomComponentSnapshot(applyStarter('starter.circularLedRing'));
  const filmstrip = materializedCustomComponentSnapshot(applyStarter('starter.filmstripKnob'));

  assert.ok(Object.keys(grid._children.Parts._children).some((name) => name.startsWith('xyGrid_')));
  assert.ok(Object.keys(grid._children.HitZones._children).some((name) => name.startsWith('xyGrid_cell_')));
  assert.ok(Object.keys(piano._children.Parts._children).some((name) => name.startsWith('piano_key_')));
  assert.ok(Object.keys(piano._children.HitZones._children).some((name) => name.startsWith('piano_keyZone_')));
  assert.ok(Object.keys(rings._children.Parts._children).some((name) => name.startsWith('ringTick_')));
  assert.ok(Object.keys(circular._children.Parts._children).some((name) => name.startsWith('dialTick_major_')));
  assert.ok(Object.keys(circular._children.Parts._children).some((name) => name.startsWith('dialTick_minor_')));
  assert.equal(circular._children.Parts._children.dialTrack.kind, 'arcTrack');
  assert.equal(circular._children.Parts._children.dialTrack.meta.arcTrack.startAngle, -135);
  assert.equal(circular._children.Parts._children.dialTrack.meta.arcTrack.sweepAngle, 270);
  assert.equal(circular._children.Parts._children.dialArc.kind, 'valueArc');
  assert.equal(circular._children.Parts._children.dialArc.meta.valueArc.sweepAngle, 270);
  assert.equal(circular._children.Bindings._children.arcValue.target, 'Parts.dialArc.meta.valueArc.value');
  assert.equal(circular._children.Behaviors._children.circularSlider.geometry, 'circular');
  assert.equal(circular._children.HitZones._children.dialZone.shape, 'ring');
  assert.equal(rings._children.Parts._children.outerRing.kind, 'arcTrack');
  assert.equal(rings._children.Parts._children.outerRing.meta.arcTrack.sweepAngle, 270);
  assert.equal(ledRing._children.Generators._children.ledRing.type, 'repeated-leds');
  assert.equal(ledRing._children.Generators._children.ledRing.activationMode, 'cumulative');
  assert.ok(Object.keys(ledRing._children.Parts._children).some((name) => name.startsWith('led_')));
  assert.equal(ledRing._children.HitZones._children.ledRingZone.shape, 'ring');
  assert.ok(Object.keys(filmstrip._children.Parts._children).some((name) => name.startsWith('filmstrip_')));
});
