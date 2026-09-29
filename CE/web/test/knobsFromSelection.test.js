// knobsFromSelection.test.js — knobs and sliders into a component: what converts, what is refused and
// why, what the placed copy carries, and the panel knob's own rules for dragging, wheeling, keys,
// resetting and focus, which the part runs.
//
// The pixel proof is browser-checks/knobsFromSelection.mjs: a hand-built panel and a cluster of the
// GAIA sheet, driven by the same gestures before and after, compared pixel by pixel and value by value
// in preview — identical, at rest, hovered, dragged past the ends, wheeled, reset and focused.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { render } from 'svelte/server';

import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { SECTION_DEFAULTS } from '../src/CE_Application/models/sectionDefaults.js';
import { deepClone } from '../src/CE_Application/utils/deepClone.js';
import { planComponentFromSelection } from '../src/CE_Application/utils/customComponentFromControls.js';
import { deriveExportParameters } from '../src/CE_Application/utils/exportParameters.js';
import { diffCustomComponentAgainstSource } from '../src/CE_Application/utils/customComponentSourceLink.js';
import { validateCustomComponentPackage } from '../src/CE_Application/utils/customComponentPackage.js';
import { resolveInteractiveControl } from '../src/CE_Application/utils/interactionRuntime.js';
import {
  sliderControlBlurPatch, sliderControlFocusZonePatch, sliderControlKeyValue, sliderControlPressFocusPatch,
  sliderControlResetValue, sliderControlSession, sliderControlSnapshot, sliderControlValueFromPoint,
  sliderControlWheelValue,
} from '../src/CE_Application/utils/sliderControlPart.js';
import { panels, activePanelId, selectedComponentIds } from '../src/CE_Application/stores/panels.js';
import {
  createInteractionPreviewSession, panelPreviewSessions, updatePanelPreviewSession,
} from '../src/CE_Application/stores/interactionPreview.js';
import { customComponentLibrary } from '../src/CE_Application/stores/customComponentLibrary.js';
import { createComponentFromSelection } from '../src/CE_Application/stores/componentFromSelectionActions.js';
import InteractivePartRenderer from '../src/CE_Application/editor/InteractivePartRenderer.svelte';

const at = (type, id, x, y, width, height, extra = {}) => {
  const control = createControl(type, {
    ...extra,
    Core: { id, name: id, ...(extra.Core ?? {}) },
    Transform: { x, y, width, height, ...(extra.Transform ?? {}) },
  });
  return control;
};

function knob(id = 'cutoff', x = 40, y = 40, behavior = {}) {
  const control = at('Knob', id, x, y, 80, 80);
  Object.assign(control._children.Behavior, behavior);
  return control;
}

function filterPanel() {
  const cutoff = knob('cutoff', 40, 40, { min: 0, max: 100, step: 1, defaultValue: 50, defaultCurrentValue: 50, unit: '%' });
  cutoff._children.DeviceBindings.bindings = [{ kind: 'deviceParameter', parameterId: 'vcf.cutoff', deviceRole: 'mainSynth', port: 'value' }];
  return {
    id: 'p1',
    name: 'Voice',
    width: 400,
    height: 200,
    scripts: [],
    controls: [
      at('Label', 'legend', 40, 10, 180, 20, { Text: { content: 'FILTER' } }),
      cutoff,
      knob('reso', 140, 40),
    ],
  };
}
const refusal = (plan, name) => plan.refused.find((entry) => entry.name === name)?.reason ?? '';

// --- What converts ----------------------------------------------------------------------------------

test('a knob becomes a part that carries the knob, and a channel with its value model', () => {
  const plan = planComponentFromSelection(filterPanel(), ['legend', 'cutoff', 'reso'], { name: 'Filter' });
  assert.equal(plan.ok, true, JSON.stringify(plan.refused));
  const kids = plan.component._children;
  const part = kids.Parts._children.cutoff;
  assert.equal(part.kind, 'slidercontrol');
  assert.equal(part.meta.sliderControl.control._children.Behavior.max, 100, 'the knob itself rides in the part');
  assert.equal(part.meta.sliderControl.control._children.DeviceBindings, undefined, 'bindings stay with the placed copy');
  assert.deepEqual([part._children.Layout.x, part._children.Layout.y, part._children.Layout.width], [0, 30, 80]);

  const channel = kids.ValueChannels._children.cutoff;
  assert.deepEqual(
    [channel.type, channel.min, channel.max, channel.step, channel.defaultValue, channel.format.suffix],
    ['float', 0, 100, 1, 50, '%'],
  );
  assert.equal(kids.Behaviors._children.cutoff.type, 'slidercontrol');
  assert.equal(kids.Behaviors._children.cutoff.part, 'cutoff');
  const zone = kids.HitZones._children.cutoffZone;
  assert.deepEqual([zone.bounds.unit, zone.action, zone.targetValueChannel], ['percent', 'dragValue', 'cutoff']);
  assert.deepEqual(kids.Bindings._children.cutoffValue.target, 'Parts.cutoff.meta.sliderControl.value');
  assert.deepEqual(Object.keys(kids.States._children).filter((name) => name.startsWith('cutoff')),
    ['cutoffHover', 'cutoffPressed', 'cutoffFocused', 'cutoffDomFocus']);
});

test('a component with knobs is a complete package, not one "with issues"', () => {
  const plan = planComponentFromSelection(filterPanel(), ['legend', 'cutoff', 'reso'], { name: 'Filter' });
  const validation = validateCustomComponentPackage(plan.component);
  assert.deepEqual(validation.issues, []);
  assert.deepEqual(validation.warnings, []);
});

test('the channel value, and the zone\'s hover, press and focus, reach the part', () => {
  const plan = planComponentFromSelection(filterPanel(), ['cutoff', 'reso'], { name: 'Filter' });
  const resolved = resolveInteractiveControl(plan.component, {
    customValues: { cutoff: 72 },
    hoveredCustomHitZone: 'cutoffZone',
    activeCustomHitZone: 'resoZone',
    dragging: true,
    focusedCustomHitZones: ['resoZone'],
  });
  const meta = (name) => ({ ...resolved.control._children.Parts._children[name].meta.sliderControl, control: undefined });
  assert.deepEqual(meta('cutoff'), { control: undefined, hover: true, pressed: false, value: 72 });
  assert.equal(meta('reso').pressed, true);
  assert.equal(meta('reso').focused, true);
  assert.equal(meta('cutoff').focused, undefined, 'focus is the zone\'s, not the component\'s');
});

test('the part draws the knob with the panel\'s own renderer', () => {
  const snapshot = sliderControlSnapshot(knob('k', 0, 0, { precision: 2 }));
  const draw = (value) => render(InteractivePartRenderer, {
    props: {
      part: { kind: 'slidercontrol', visible: true, meta: { sliderControl: { control: snapshot, value } }, _children: { Layout: { x: 0, y: 0, width: 80, height: 80, xUnit: 'px', yUnit: 'px', anchorX: 'left', anchorY: 'top' } } },
      partName: 'k', parentWidth: 80, parentHeight: 80,
    },
  }).body;
  assert.match(draw(0.8), /<svg/);
  assert.match(draw(0.8), /0\.80/);
  assert.match(draw(0.2), /0\.20/);
});

// --- What is refused ---------------------------------------------------------------------------------

test('whatever the part would not draw, or would do differently, is refused by name', () => {
  const cases = [
    [(c) => { c._children.Behavior.valueMode = 'range'; }, /two handles/],
    [(c) => { c._children.Core.controlForm = 'disc'; }, /control form/],
    [(c) => { c._children.Behavior.valueFlow = 'display'; }, /read-only/],
    [(c) => { c._children.Core.enabled = false; }, /disabled/],
    [(c) => { c._children.Core.visible = false; }, /hidden/],
    [(c) => { c._children.Core.hostAutomation = false; }, /host automation/],
    [(c) => { c._children.Transform.rotation = 30; }, /rotated/],
    [(c) => {
      c._children.Background = deepClone(SECTION_DEFAULTS.Background);
      c._children.Background._children.Fill.solidEnabled = true;
    }, /background plate/],
    [(c) => { c._children.Text = { ...deepClone(SECTION_DEFAULTS.Text), content: 'CUT' }; }, /caption/],
    [(c) => { c._children.Parts._children.glow = { ...deepClone(c._children.Parts._children.pointerCurrent), name: 'glow', visible: true }; }, /extra parts drawn over it \(glow\)/],
    [(c) => { c._children.Scripts.scripts = [{ source: 'print(1)' }]; }, /a script of its own/],
    [(c) => { c._children.DeviceBindings = { enabled: false, bindings: [{ kind: 'deviceParameter', parameterId: 'x' }] }; }, /device bindings switched off/],
    [(c) => { c._children.DeviceBindings.bindings = [{ kind: 'deviceParameter', parameterId: 'x', port: 'state' }]; }, /device binding on its state port/],
  ];
  for (const [change, reason] of cases) {
    const panel = filterPanel();
    change(panel.controls[1]);
    const plan = planComponentFromSelection(panel, ['cutoff']);
    assert.equal(plan.ok, false, String(reason));
    assert.match(refusal(plan, 'cutoff'), reason);
  }
});

test('a knob anything else addresses is refused, naming where', () => {
  const addressed = (mutate) => {
    const panel = filterPanel();
    // An id unlike the name, so a reference by name is found as one, not as the id.
    panel.controls[1]._children.Core.id = 'k_cutoff';
    mutate(panel);
    return refusal(planComponentFromSelection(panel, ['k_cutoff']), 'cutoff');
  };
  // By id — a meter driven by it — found by searching everything outside the selection.
  assert.match(addressed((panel) => {
    const meter = at('Meter', 'lvl', 300, 40, 60, 100);
    meter._children.Meter.valueSourceId = 'k_cutoff';
    panel.controls.push(meter);
  }), /addressed by lvl \(Meter\.valueSourceId\)/);
  // By name: a script's target, an LCD soft key, a setlist's capture path.
  assert.match(addressed((panel) => { panel.scripts = [{ name: 'watch', target: 'cutoff', source: 'print(1)' }]; }), /target of script "watch"/);
  assert.match(addressed((panel) => {
    panel.controls[0]._children.Display = { layouts: [{ zones: [{ press: { set: 'cutoff.value' } }] }] };
  }), /legend's soft key/);
  assert.match(addressed((panel) => {
    panel.controls[0]._children.Setlist = { capturePaths: ['cutoff.value'], scenes: [] };
  }), /legend's setlist/);
  // Converted together, a reference between the two is not a reference to anything left behind.
  const panel = filterPanel();
  panel.controls[2]._children.Behavior.linkedTo = 'cutoff';
  assert.equal(planComponentFromSelection(panel, ['cutoff', 'reso']).ok, true);
  // Snapshots and the export list are keyed by host parameter id, which the conversion keeps.
  const snap = filterPanel();
  snap.parameterSnapshots = [{ values: { 'cutoff.value': 40 } }];
  assert.equal(planComponentFromSelection(snap, ['cutoff']).ok, true);
});

// --- What the placed copy carries -------------------------------------------------------------------

test('the copy exports the knob\'s host parameter: same id, label, range, unit and device wire', () => {
  const panel = filterPanel();
  const before = deriveExportParameters(panel).find((param) => param.id === 'cutoff.value');
  customComponentLibrary.clear();
  panels.set([panel]);
  activePanelId.set('p1');
  selectedComponentIds.set(new Set(['legend', 'cutoff', 'reso']));
  const result = createComponentFromSelection('Filter');
  assert.equal(result.ok, true);
  const after = deriveExportParameters(get(panels)[0]);
  const kept = after.find((param) => param.id === 'cutoff.value');
  const pick = ({ id, label, min, max, defaultValue, unit, deviceRole, deviceParameterId }) => ({ id, label, min, max, defaultValue, unit, deviceRole, deviceParameterId });
  assert.deepEqual(pick(kept), pick(before));
  assert.equal(kept.path, 'Filter.cutoff', 'the value is found through the channel');
  assert.deepEqual(after.map((param) => param.id).sort(), ['cutoff.value', 'reso.value']);
  const copy = get(panels)[0].controls[0];
  assert.deepEqual(copy._children.DeviceBindings.bindings.map((b) => [b.parameterId, b.port]), [['vcf.cutoff', 'cutoff']]);
  // An ordinary linked copy: what it carries is its own, so it is still current with the library.
  assert.equal(diffCustomComponentAgainstSource(copy, get(customComponentLibrary)).status, 'current');
});

test('a kept id never makes a duplicate: a second copy, or a new knob with the old name, wins nothing', () => {
  const panel = filterPanel();
  customComponentLibrary.clear();
  panels.set([panel]);
  activePanelId.set('p1');
  selectedComponentIds.set(new Set(['cutoff']));
  createComponentFromSelection('Filter');
  const copy = get(panels)[0].controls.find((c) => c._children.Core.controlType === 'CustomComponent');
  const twin = deepClone(copy);
  twin._children.Core.id = 'twin';
  twin._children.Core.name = 'Twin';
  const ids = (controls) => deriveExportParameters({ controls }).map((param) => param.id);
  assert.deepEqual(ids([copy, twin]), ['cutoff.value', 'Twin.cutoff'], 'first in panel order keeps it');
  assert.deepEqual(ids([knob('cutoff', 0, 0), copy]), ['cutoff.value', 'Filter.cutoff'], 'the knob\'s own name wins');
});

test('the copy takes a name no control has, points an explicit export list at the channel, and keeps the live value', () => {
  const panel = filterPanel();
  panel.controls.push(at('Label', 'Filter', 300, 150, 60, 20, { Text: { content: 'x' } }));
  panel.exportParameters = [{ id: 'cutoff.value', label: 'Cutoff', controlName: 'cutoff', path: 'cutoff.value', min: 0, max: 100 }];
  customComponentLibrary.clear();
  panels.set([panel]);
  activePanelId.set('p1');
  panelPreviewSessions.set({});
  updatePanelPreviewSession('cutoff', { valueOverrideEnabled: true, valueOverride: 73 });
  selectedComponentIds.set(new Set(['cutoff', 'reso']));
  const result = createComponentFromSelection('Filter');
  assert.equal(result.ok, true);
  const copy = result.instance;
  assert.equal(copy._children.Core.name, 'Filter_2');
  assert.deepEqual(get(panels)[0].exportParameters, [{ id: 'cutoff.value', label: 'Cutoff', controlName: 'Filter_2', path: 'Filter_2.cutoff', min: 0, max: 100 }]);
  // The knob does not jump: the copy's preview session, however it comes to exist, reads 73.
  assert.equal(copy._children.ValueChannels._children.cutoff.currentValue, 73);
  const session = get(panelPreviewSessions)[copy._children.Core.id] ?? createInteractionPreviewSession(copy);
  assert.equal(session.customValues.cutoff, 73);
});

// --- The panel knob's own rules, as the part runs them -------------------------------------------

test('the part\'s session is the one the panel would hold for the knob', () => {
  assert.deepEqual(sliderControlSession({ value: 3, hover: true }), {
    activeHandle: 'current', hover: true, pressed: false, dragging: false, focused: false,
    valueOverrideEnabled: true, valueOverride: 3, currentValueOverrideEnabled: true, currentValueOverride: 3,
  });
  const pressed = sliderControlSession({ pressed: true, focused: true });
  assert.deepEqual([pressed.hover, pressed.dragging, pressed.focused, pressed.valueOverrideEnabled], [true, true, true, undefined]);
});

test('a drag keeps one scrub for the gesture, as the panel does, so an overshoot comes straight back', () => {
  const dial = sliderControlSnapshot(knob('k', 0, 0, { circularDragMode: 'knob', step: 0.01 }));
  const rect = { left: 0, top: 0, width: 80, height: 80 };
  const start = { clientX: 40, clientY: 100, value: 0.5 };
  const dragState = {};
  // Up 500px (the knob mode's 1/250 per pixel takes it past the top), then down 100.
  assert.equal(sliderControlValueFromPoint(dial, rect, { clientX: 40, clientY: -400 }, start, dragState), 1);
  assert.ok(Math.abs(sliderControlValueFromPoint(dial, rect, { clientX: 40, clientY: -300 }, start, dragState) - 0.6) < 1e-9);
  // Without a gesture to keep, one move from the press: still past the top.
  assert.equal(sliderControlValueFromPoint(dial, rect, { clientX: 40, clientY: -300 }, start), 1);

  const slider = sliderControlSnapshot(at('Slider', 's', 0, 0, 100, 20));
  const track = { left: 0, top: 0, width: 100, height: 20 };
  const jump = sliderControlValueFromPoint(slider, track, { clientX: 50, clientY: 10 }, { clientX: 50, clientY: 10, value: 0 }, {});
  assert.ok(jump > 0.3 && jump < 0.7, `a slider jumps to the pointer: ${jump}`);
});

test('wheel, keys and reset move the knob by the panel\'s rules', () => {
  const k = sliderControlSnapshot(knob('k', 0, 0, { min: 0, max: 10, step: 1, defaultValue: 4, defaultCurrentValue: 4, wheelEnabled: false }));
  assert.equal(sliderControlWheelValue(k, 4, 1), null, 'a knob that ignores the wheel ignores it here too');
  k._children.Behavior.wheelEnabled = true;
  assert.deepEqual([sliderControlWheelValue(k, 4, 1), sliderControlWheelValue(k, 10, 1), sliderControlWheelValue(k, 0, -1)], [5, 10, 0]);
  assert.deepEqual(['ArrowUp', 'ArrowLeft', 'PageUp', 'PageDown', 'Home', 'End', 'x'].map((key) => sliderControlKeyValue(k, 4, key)), [5, 3, 10, 0, 0, 10, null]);
  assert.equal(sliderControlResetValue(k), 4);
  const bipolar = sliderControlSnapshot(knob('b', 0, 0, { min: -12, max: 12, step: 1, defaultValue: 5, defaultCurrentValue: 5 }));
  assert.equal(sliderControlResetValue(bipolar), 0, 'a range across zero resets to zero, as the panel resets it');
});

test('each knob keeps its own focus flag, as it did as a control', () => {
  let session = {};
  const apply = (patch) => { session = { ...session, ...patch }; };
  apply(sliderControlPressFocusPatch(session, 'aZone'));        // press A: it has DOM focus, flag off
  apply(sliderControlFocusZonePatch(session, 'aZone'));         // wheel A: focused
  apply(sliderControlFocusZonePatch(session, 'cZone'));         // wheel C, never pressed: focused too
  assert.deepEqual(session.focusedCustomHitZones, ['aZone', 'cZone']);
  apply(sliderControlPressFocusPatch(session, 'bZone'));        // press B: A loses DOM focus and its flag
  assert.deepEqual([session.focusedCustomHitZones, session.domFocusCustomHitZone], [['cZone'], 'bZone']);
  apply(sliderControlFocusZonePatch(session, 'bZone'));         // a key on B
  apply(sliderControlBlurPatch(session));                       // the component loses focus: so does B
  assert.deepEqual([session.focusedCustomHitZones, session.domFocusCustomHitZone], [['cZone'], '']);
});
