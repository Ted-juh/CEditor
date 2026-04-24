import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveInteractionContext, resolveInteractiveControl } from '../src/CE_Application/utils/interactionRuntime.js';

function makeSelectedStateSection() {
  return {
    enabled: true,
    _children: {
      Selected: {
        enabled: true,
        when: { checked: true },
        patches: {
          component: {
            'Background.Fill.colour': 'FF2D6F9C',
          },
          parts: {},
        },
      },
    },
  };
}

function makeRadioGroupControl(id) {
  return {
    _children: {
      Core: { id, name: 'Filter Mode', controlType: 'RadioButtonGroup', enabled: true },
      Transform: { x: 0, y: 0, width: 240, height: 44 },
      Background: {
        _children: {
          Fill: { colour: 'FF3A3A3A' },
        },
      },
      Text: { content: 'Filter Mode' },
      Behavior: {
        family: 'select',
        role: 'radio',
        buttonType: 'radio',
        valueType: 'enum',
        defaultValue: 'off',
        selectionMode: 'single',
      },
      Value: {
        rows: [
          { id: 'off', displayText: 'Off', internalValue: 'off', enabled: true, selectedByDefault: true },
          { id: 'lpf', displayText: 'LPF', internalValue: 'lpf', enabled: true },
          { id: 'bpf', displayText: 'BPF', internalValue: 'bpf', enabled: true },
          { id: 'hpf', displayText: 'HPF', internalValue: 'hpf', enabled: true },
        ],
      },
      States: makeSelectedStateSection(),
    },
  };
}

function makeCyclicControl(id) {
  return {
    _children: {
      Core: { id, name: 'Cycle', controlType: 'CyclicButton', enabled: true },
      Transform: { x: 0, y: 0, width: 136, height: 40 },
      Background: {
        _children: {
          Fill: { colour: 'FF3A3A3A' },
        },
      },
      Text: { content: 'Cycle' },
      Behavior: {
        family: 'select',
        role: 'custom',
        buttonType: 'cyclic',
        valueType: 'enum',
        defaultValue: 'state_1',
        wrapBehavior: true,
      },
      Value: {
        rows: [
          { id: 'state_1', displayText: 'State 1', internalValue: 'state_1', enabled: true },
          { id: 'state_2', displayText: 'State 2', internalValue: 'state_2', enabled: true },
          { id: 'state_3', displayText: 'State 3', internalValue: 'state_3', enabled: true },
        ],
      },
      States: makeSelectedStateSection(),
    },
  };
}

function makeSliderControl(id, behaviorOverrides = {}) {
  return {
    _children: {
      Core: { id, name: 'Slider', controlType: 'Slider', enabled: true },
      Transform: { x: 0, y: 0, width: 220, height: 48 },
      Behavior: {
        family: 'range',
        role: 'slider',
        valueType: 'float',
        geometry: 'linear',
        valueMode: 'single',
        min: 0,
        max: 1,
        step: 0.01,
        defaultCurrentValue: 0.5,
        defaultStartValue: 0.25,
        defaultEndValue: 0.75,
        direction: 'ltr',
        orientation: 'horizontal',
        ...behaviorOverrides,
      },
      Parts: {
        _children: {},
      },
      States: {
        enabled: true,
        priority: ['activehandlecurrent', 'dragging'],
        _children: {
          ActiveHandleCurrent: {
            enabled: true,
            when: { activeHandle: 'current' },
            patches: { component: {}, parts: {} },
          },
        },
      },
    },
  };
}

test('resolveInteractionContext keeps built-in radio groups out of the root checked state', () => {
  const control = makeRadioGroupControl('radio_runtime');
  const signals = resolveInteractionContext(control, {
    valueOverrideEnabled: true,
    valueOverride: 'bpf',
    checked: true,
  });

  assert.equal(signals.valueRaw, 'bpf');
  assert.equal(signals.valueDisplay, 'BPF');
  assert.equal(signals.checked, false);
});

test('resolveInteractiveControl still applies checked-driven selected states for radio groups with an active row', () => {
  const control = makeRadioGroupControl('radio_selected');
  const resolved = resolveInteractiveControl(control, {});

  assert.equal(resolved.runtime.signals.checked, false);
  assert.equal(resolved.runtime.signals.selectionActive, true);
  assert.deepEqual(resolved.runtime.activeStates, ['Selected']);
  assert.equal(resolved.control._children.Background._children.Fill.colour, 'FF2D6F9C');
});

test('resolveInteractiveControl applies checked-driven selected states for cyclic buttons using their current row value', () => {
  const control = makeCyclicControl('cycle_selected');
  const resolved = resolveInteractiveControl(control, {});

  assert.equal(resolved.runtime.signals.valueRaw, 'state_1');
  assert.equal(resolved.runtime.signals.selectionActive, true);
  assert.deepEqual(resolved.runtime.activeStates, ['Selected']);
  assert.equal(resolved.control._children.Background._children.Fill.colour, 'FF2D6F9C');
});

test('resolveInteractionContext exposes unified slider signals for single sliders', () => {
  const control = makeSliderControl('slider_single');
  const signals = resolveInteractionContext(control, {});

  assert.equal(signals.geometry, 'linear');
  assert.equal(signals.valueMode, 'single');
  assert.equal(signals.activeHandle, 'current');
  assert.equal(signals.currentValueRaw, 0.5);
  assert.equal(signals.valueRaw, 0.5);
  assert.equal(signals.isDirty, false);
});

test('resolveInteractionContext clamps multi-value sliders without swapping semantic roles', () => {
  const control = makeSliderControl('slider_band', {
    valueMode: 'band',
    defaultStartValue: 0.2,
    defaultCurrentValue: 0.5,
    defaultEndValue: 0.8,
  });
  const signals = resolveInteractionContext(control, {
    activeHandle: 'end',
    endValueOverrideEnabled: true,
    endValueOverride: 0.1,
  });

  assert.equal(signals.activeHandle, 'end');
  assert.equal(signals.startValueRaw, 0.2);
  assert.equal(signals.currentValueRaw, 0.5);
  assert.equal(signals.endValueRaw, 0.5);
});

test('resolveInteractionContext reports seam crossing for circular wrapped ranges', () => {
  const control = makeSliderControl('slider_circular_range', {
    geometry: 'circular',
    valueMode: 'range',
    direction: 'cw',
    allowWrapAround: true,
    defaultStartValue: 0.75,
    defaultEndValue: 0.25,
  });
  const signals = resolveInteractionContext(control, {});

  assert.equal(signals.geometry, 'circular');
  assert.equal(signals.valueMode, 'range');
  assert.equal(signals.crossesSeam, true);
  assert.equal(signals.activeHandle, 'start');
});
