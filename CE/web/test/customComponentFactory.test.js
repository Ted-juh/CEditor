import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CUSTOM_COMPONENT_STARTERS,
  createCustomComponentSections,
  createCustomComponentStarterPatch,
} from '../src/CE_Application/utils/customComponentFactory.js';
import { materializedCustomComponentSnapshot } from '../src/CE_Application/utils/customComponentMaterializer.js';
import { validateCustomComponentPackage } from '../src/CE_Application/utils/customComponentPackage.js';
import { resolveInteractiveControl } from '../src/CE_Application/utils/interactionRuntime.js';
import {
  resolveCustomHitZoneAtPoint,
  resolveCustomInteractionPatch,
} from '../src/CE_Application/utils/customComponentInteraction.js';
import { createCustomComponentStressTest } from '../src/CE_Application/utils/customComponentStressTest.js';
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
  assert.equal(Object.keys(grid._children.HitZones._children).some((name) => name.startsWith('xyGrid_cell_')), false);
  assert.equal(grid._children.HitZones._children.padDragArea.action, 'dragValue');
  assert.equal(grid._children.HitZones._children.padDragArea.targetValueChannelY, 'yValue');
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

test('macro rings starter pointers rotate around the shared ring center', () => {
  const rings = applyStarter('starter.macroRings');
  const parts = rings._children.Parts._children;
  const center = { x: 84, y: 90.72 };

  for (const name of ['outerPointer', 'middlePointer', 'innerPointer']) {
    const layout = parts[name]._children.Layout;
    const x = layout.xUnit === 'percent' ? (rings._children.Transform.width * layout.x) / 100 : layout.x;
    const y = layout.yUnit === 'percent' ? (rings._children.Transform.height * layout.y) / 100 : layout.y;
    const pivotX = x + ((layout.pivotX - 50) / 100) * layout.width;
    const pivotY = y + (layout.pivotY / 100) * layout.height;

    assert.ok(Math.abs(pivotX - center.x) < 0.0001, `${name} pivot x`);
    assert.ok(Math.abs(pivotY - center.y) < 0.0001, `${name} pivot y`);
  }
});

test('labelled two-state button only changes button fill across states', () => {
  const base = applyStarter('starter.labelledTwoStateButton');
  const stateA = resolveInteractiveControl(base, { customValues: { mode: 'A' } }).control;
  const stateB = resolveInteractiveControl(base, { customValues: { mode: 'B' } }).control;

  const stateALabel = stateA._children.Parts._children.label;
  const stateBLabel = stateB._children.Parts._children.label;

  assert.equal(stateALabel._children.Text.content, 'Label');
  assert.equal(stateBLabel._children.Text.content, 'Label');
  assert.equal(
    stateALabel._children.Background._children.Border.colour,
    stateBLabel._children.Background._children.Border.colour,
  );
  assert.notEqual(
    stateA._children.Parts._children.button._children.Background._children.Fill.colour,
    stateB._children.Parts._children.button._children.Background._children.Fill.colour,
  );
  assert.equal(stateA._children.Parts._children.background._children.Background._children.Border.enabled, true);
});

test('stress preview grid generators stay inside authored bounds', () => {
  const xy = createCustomComponentStressTest().definitions.find((definition) => definition.slug === 'xy-pad').component;
  const materialized = materializedCustomComponentSnapshot(xy);
  const gridLine = materialized._children.Parts._children.xyGrid_v_0;

  assert.equal(gridLine._children.Layout.x, 9.5);
  assert.equal(gridLine._children.Layout.y, 54.25);
  assert.equal(materialized._children.HitZones._children.xyGrid_cell_1_1, undefined);
});

test('stress xy pad uses one free drag zone for both axes', () => {
  const xy = createCustomComponentStressTest().definitions.find((definition) => definition.slug === 'xy-pad').component;
  const hitZone = { name: 'padZone', zone: xy._children.HitZones._children.padZone };
  const patch = resolveCustomInteractionPatch(xy, { customValues: { x: 0.32, y: 0.68 } }, hitZone, {
    rect: { left: 0, top: 0, width: 210, height: 190 },
    clientX: 160,
    clientY: 70,
    startClientX: 100,
    startClientY: 100,
    startValues: { x: 0.32, y: 0.68 },
  });

  assert.ok(patch.customValues.x > 0.7);
  assert.ok(patch.customValues.y > 0.6);
});

test('stress preview enum hit zones select their authored values', () => {
  const transport = createCustomComponentStressTest().definitions.find((definition) => definition.slug === 'transport-cluster').component;
  const recZone = { name: 'recZone', zone: transport._children.HitZones._children.recZone };
  const patch = resolveCustomInteractionPatch(transport, { customValues: { transport: 'stop' } }, recZone, null);

  assert.equal(patch.customValues.transport, 'record');

  const wave = createCustomComponentStressTest().definitions.find((definition) => definition.slug === 'waveform-selector').component;
  const squareZone = { name: 'squareZone', zone: wave._children.HitZones._children.squareZone };
  const wavePatch = resolveCustomInteractionPatch(wave, { customValues: { waveform: 'sine' } }, squareZone, null);

  assert.equal(wavePatch.customValues.waveform, 'square');
});

test('stress waveform selector shows four readable pixel-positioned choices', () => {
  const wave = createCustomComponentStressTest().definitions.find((definition) => definition.slug === 'waveform-selector').component;
  const parts = wave._children.Parts._children;

  for (const name of ['sineIcon', 'sawIcon', 'squareIcon', 'noiseIcon']) {
    assert.equal(parts[name]._children.Layout.xUnit, 'px', `${name} x unit`);
    assert.equal(parts[name]._children.Layout.yUnit, 'px', `${name} y unit`);
    assert.equal(parts[name]._children.Layout.anchorX, 'left', `${name} anchor x`);
    assert.equal(parts[name]._children.Layout.x + parts[name]._children.Layout.width <= wave._children.Transform.width, true, `${name} inside width`);
  }

  assert.equal(parts.sineLabel._children.Text.content, 'SINE');
  assert.equal(parts.sawLabel._children.Text.content, 'SAW');
  assert.equal(parts.squareLabel._children.Text.content, 'SQR');
  assert.equal(parts.noiseLabel._children.Text.content, 'NOISE');

  const hoveredNoise = resolveInteractiveControl(wave, {
    hover: true,
    hoveredCustomHitZone: 'noiseZone',
    customValues: { waveform: 'saw' },
  }).control;
  assert.equal(hoveredNoise._children.Parts._children.noiseIcon.meta.waveformIcon.animate, true);
  assert.equal(hoveredNoise._children.Parts._children.noiseIcon.meta.waveformIcon.animationMode, 'scroll');
  assert.equal(hoveredNoise._children.Parts._children.sawIcon.meta.waveformIcon.animate, undefined);
});

test('stress preview readouts and value arcs are bound to runtime values', () => {
  const stress = createCustomComponentStressTest();
  const dial = stress.definitions.find((definition) => definition.slug === 'neon-dial').component;
  const dialResolved = resolveInteractiveControl(dial, { customValues: { cutoff: 20000 } }).control;

  assert.equal(dialResolved._children.Parts._children.readout._children.Text.content, '20000 Hz');
  assert.equal(dialResolved._children.Parts._children.title._children.Layout.y, 134);
  assert.equal(dialResolved._children.Parts._children.valueArc.meta.valueArc.value, 1);
  assert.equal(dialResolved._children.Parts._children.valueArc._children.Background, undefined);
  assert.equal(dialResolved._children.Parts._children.valueArc._children.Layout.x, 12);
  assert.equal(dialResolved._children.Parts._children.valueArc._children.Layout.width, 140);
  assert.equal(dialResolved._children.Parts._children.pointer._children.Layout.x, 82);
  assert.equal(dialResolved._children.Parts._children.pointer._children.Layout.y, 20);
  assert.equal(dialResolved._children.Parts._children.pointer._children.Layout.height, 64);
  assert.equal(dialResolved._children.Parts._children.pointer._children.Layout.pivotY, 100);
  assert.equal(dialResolved._children.Behaviors._children.cutoffDial.dragMode, 'vertical');

  const meter = stress.definitions.find((definition) => definition.slug === 'segment-meter').component;
  const meterResolved = resolveInteractiveControl(meter, { customValues: { level: 0.5 } }).control;

  assert.equal(meterResolved._children.Parts._children.readout._children.Text.content, '50%');

  const xy = stress.definitions.find((definition) => definition.slug === 'xy-pad').component;
  const xyResolved = resolveInteractiveControl(xy, { customValues: { x: 0.25, y: 0.75 } }).control;

  assert.equal(xyResolved._children.Parts._children.xReadout._children.Text.content, 'X 0.25');
  assert.equal(xyResolved._children.Parts._children.yReadout._children.Text.content, 'Y 0.75');
});

test('stress gain and balance scales keep labels clear of generated ticks', () => {
  const stress = createCustomComponentStressTest();
  const gain = stress.definitions.find((definition) => definition.slug === 'fine-horizontal-scale').component;
  const balance = stress.definitions.find((definition) => definition.slug === 'bipolar-horizontal-scale').component;
  const gainMaterialized = materializedCustomComponentSnapshot(gain);
  const balanceMaterialized = materializedCustomComponentSnapshot(balance);

  assert.equal(gain._children.Generators._children.scaleTicks.bounds.y, 48);
  assert.equal(gain._children.Parts._children.low._children.Layout.x, 7);
  assert.equal(gain._children.Parts._children.high._children.Layout.x, 226);
  assert.ok(gainMaterialized._children.Parts._children.gainTick_major_1._children.Layout.x > 20);

  assert.equal(balance._children.Behaviors._children.balanceSlide.geometry, 'linear');
  assert.equal(balance._children.Behaviors._children.balanceSlide.dragMode, 'horizontal');
  assert.equal(balance._children.Generators._children.balanceTicks.geometry, 'horizontal');
  assert.equal(balance._children.Parts._children.leftLabel._children.Text.content, 'L');
  assert.equal(balance._children.Parts._children.rightLabel._children.Text.content, 'R');
  assert.ok(balanceMaterialized._children.Parts._children.balanceTick_major_1._children.Layout.x > 20);
});

test('stress envelope uses generic points and keeps handles on the curve', () => {
  const envelope = createCustomComponentStressTest().definitions.find((definition) => definition.slug === 'adsr-envelope').component;
  const resolved = resolveInteractiveControl(envelope, {
    customValues: { attack: 0.5, decay: 0.25, sustain: 0.75, release: 0.4 },
  }).control;
  const parts = resolved._children.Parts._children;
  const points = parts.envelopeCurve.meta.envelopePath.points;

  assert.equal(parts.envelopeCurve._children.Layout.xUnit, 'px');
  assert.equal(parts.envelopeCurve._children.Layout.yUnit, 'px');
  assert.equal(parts.envelopeCurve.meta.envelopePath.mode, 'points');
  assert.equal(points.length, 5);
  assert.equal(points[0].id, 'start');
  assert.equal(points[4].id, 'end');
  assert.ok(points[1].x > points[0].x && points[2].x > points[1].x);
  assert.equal(points[2].y, 0.75);
  assert.equal(points[3].y, 0.75);

  const handleX = (normalized) => 33 + (224 * normalized);
  const handleY = (normalized) => 43 + (60 * (1 - normalized));
  assert.ok(Math.abs(parts.aDot._children.Layout.x - handleX(points[1].x)) < 0.001);
  assert.ok(Math.abs(parts.dDot._children.Layout.x - handleX(points[2].x)) < 0.001);
  assert.ok(Math.abs(parts.dDot._children.Layout.y - handleY(points[2].y)) < 0.001);
  assert.ok(Math.abs(parts.sDot._children.Layout.y - handleY(points[2].y)) < 0.001);
  assert.ok(Math.abs(parts.rDot._children.Layout.x - handleX(points[3].x)) < 0.001);
  assert.ok(Math.abs(parts.rDot._children.Layout.y - handleY(points[3].y)) < 0.001);
});

test('stress dial drag mode can use vertical movement with circular artwork', () => {
  const stress = createCustomComponentStressTest();
  const dial = stress.definitions.find((definition) => definition.slug === 'neon-dial').component;
  const hitZone = { name: 'dialZone', zone: dial._children.HitZones._children.dialZone };
  const patch = resolveCustomInteractionPatch(dial, { customValues: { cutoff: 9600 } }, hitZone, {
    rect: { left: 0, top: 0, width: 164, height: 164 },
    clientX: 82,
    clientY: 32,
    startClientX: 82,
    startClientY: 82,
    startValues: { cutoff: 9600 },
  });

  assert.ok(patch.customValues.cutoff > 9600);
});

test('stress range macro uses one filled arc with min max and sent value handles', () => {
  const stress = createCustomComponentStressTest();
  const macro = stress.definitions.find((definition) => definition.slug === 'range-macro-arc').component;
  const resolved = resolveInteractiveControl(macro, {
    customValues: { min: 0.2, max: 0.8, value: 0.5 },
  }).control;
  const parts = resolved._children.Parts._children;
  const center = { x: 89, y: 96 };

  assert.equal(Object.keys(resolved._children.Generators._children ?? {}).length, 0);
  assert.equal(parts.rangeArc.meta.valueArc.startValue, 0.2);
  assert.equal(parts.rangeArc.meta.valueArc.endValue, 0.8);
  assert.equal(parts.track.kind, 'arcTrack');
  assert.equal(parts.rangeArc.kind, 'valueArc');
  assert.equal(parts.lockText._children.Text.content, 'EDIT');
  assert.equal(macro._children.ValueChannels._children.min.constraints.normalizedMaxGap, 0.12);
  assert.equal(macro._children.ValueChannels._children.max.constraints.normalizedMinGap, 0.12);
  assert.equal(parts.minValue._children.Text.content, 'MIN 20%');
  assert.equal(parts.sentValue._children.Text.content, 'OUT 50%');
  assert.equal(parts.maxValue._children.Text.content, 'MAX 80%');

  for (const name of ['minHandle', 'valueHandle', 'maxHandle']) {
    const layout = parts[name]._children.Layout;
    const pivotX = layout.x + ((layout.pivotX - 50) / 100) * layout.width;
    const pivotY = layout.y + (layout.pivotY / 100) * layout.height;

    assert.equal(pivotX, center.x, `${name} pivot x`);
    assert.ok(Math.abs(pivotY - center.y) < 0.0001, `${name} pivot y`);
  }

  assert.equal(parts.minHandle._children.Layout.rotation, -81);
  assert.equal(parts.valueHandle._children.Layout.rotation, 0);
  assert.equal(parts.maxHandle._children.Layout.rotation, 81);

  const minPatch = resolveCustomInteractionPatch(
    macro,
    { customValues: { min: 0.2, value: 0.52, max: 0.8 } },
    { name: 'minZone', zone: macro._children.HitZones._children.minZone },
    {
      rect: { left: 0, top: 0, width: 178, height: 178 },
      clientX: 50,
      clientY: 0,
      startClientX: 50,
      startClientY: 150,
      startNormalized: 0.2,
      startValues: { min: 0.2, value: 0.52, max: 0.8 },
    },
  );
  assert.equal(minPatch.customValues.min, 0.68);
  assert.equal(minPatch.customValues.value, 0.68);
  assert.equal(minPatch.customValues.max, 0.8);

  const valuePatch = resolveCustomInteractionPatch(
    macro,
    { customValues: { min: 0.2, value: 0.52, max: 0.6 } },
    { name: 'valueZone', zone: macro._children.HitZones._children.valueZone },
    {
      rect: { left: 0, top: 0, width: 178, height: 178 },
      clientX: 89,
      clientY: 0,
      startClientX: 89,
      startClientY: 130,
      startNormalized: 0.52,
      startValues: { min: 0.2, value: 0.52, max: 0.6 },
    },
  );
  assert.equal(valuePatch.customValues.value, 0.6);

  const maxPatch = resolveCustomInteractionPatch(
    macro,
    { customValues: { min: 0.24, value: 0.52, max: 0.78 } },
    { name: 'maxZone', zone: macro._children.HitZones._children.maxZone },
    {
      rect: { left: 0, top: 0, width: 178, height: 178 },
      clientX: 140,
      clientY: 170,
      startClientX: 140,
      startClientY: 60,
      startNormalized: 0.78,
      startValues: { min: 0.24, value: 0.52, max: 0.78 },
    },
  );
  assert.equal(maxPatch.customValues.min, 0.24);
  assert.equal(maxPatch.customValues.value, 0.36);
  assert.equal(maxPatch.customValues.max, 0.36);

  const locked = resolveInteractiveControl(macro, {
    customValues: { min: 0.24, value: 0.52, max: 0.78, rangeLocked: true },
  }).control._children.Parts._children;
  assert.equal(locked.lockText._children.Text.content, 'LOCK');
  assert.equal(locked.minHandle.opacity, 0.35);
  assert.equal(locked.maxHandle.opacity, 0.35);

  const rect = { left: 0, top: 0, width: 178, height: 178 };
  assert.equal(resolveCustomHitZoneAtPoint(macro, rect, 30, 90, { rangeLocked: false })?.name, 'minZone');
  assert.equal(resolveCustomHitZoneAtPoint(macro, rect, 30, 90, { rangeLocked: true }), null);
  assert.equal(resolveCustomHitZoneAtPoint(macro, rect, 89, 89, { rangeLocked: true })?.name, 'lockZone');
});
