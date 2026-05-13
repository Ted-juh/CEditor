import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { activeEditorTab, activePanelId, panels } from '../src/CE_Application/stores/panels.js';
import {
  createInteractionPreviewSession,
  commitPanelPreviewSelectAction,
  panelPreviewSessions,
  updatePanelPreviewSession,
} from '../src/CE_Application/stores/interactionPreview.js';
import {
  applyCustomLinks,
  resolveCustomHitZoneAtPoint,
  resolveCustomHitZoneProbeValues,
  resolveCustomInteractionPatch,
} from '../src/CE_Application/utils/customComponentInteraction.js';
import {
  CUSTOM_ARP_RUNTIME_KEY,
  resolveCustomArpeggiatorStep,
  syncCustomArpeggiatorValues,
} from '../src/CE_Application/utils/customComponentArpeggiator.js';
import { materializedCustomComponentSnapshot } from '../src/CE_Application/utils/customComponentMaterializer.js';

function makeCyclicControl(id, { wrapBehavior = true } = {}) {
  return {
    _children: {
      Core: { id, name: 'Cycle', controlType: 'CyclicButton', enabled: true },
      Transform: { x: 0, y: 0, width: 136, height: 40 },
      Text: { content: 'Cycle' },
      Behavior: {
        family: 'select',
        role: 'custom',
        buttonType: 'cyclic',
        valueType: 'enum',
        defaultValue: 'state_1',
        wrapBehavior,
      },
      Value: {
        rows: [
          { id: 'state_1', displayText: 'State 1', internalValue: 'state_1', enabled: true },
          { id: 'state_2', displayText: 'State 2', internalValue: 'state_2', enabled: true },
          { id: 'state_3', displayText: 'State 3', internalValue: 'state_3', enabled: true },
        ],
      },
    },
  };
}

function makeRadioGroupControl(id) {
  return {
    _children: {
      Core: { id, name: 'Filter Mode', controlType: 'RadioButtonGroup', enabled: true },
      Transform: { x: 0, y: 0, width: 240, height: 44 },
      Text: { content: 'Filter Mode' },
      ContentLayout: { paddingLeft: 0, paddingRight: 0, paddingTop: 0, paddingBottom: 0, gap: 8 },
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
        ...behaviorOverrides,
      },
    },
  };
}

function makeCustomComponent(id) {
  return {
    _children: {
      Core: { id, name: 'Custom', controlType: 'CustomComponent', enabled: true },
      Transform: { x: 0, y: 0, width: 200, height: 100 },
      ValueChannels: {
        _children: {
          mainValue: {
            type: 'float',
            min: 0,
            max: 1,
            step: 0.01,
            defaultValue: 0.25,
            currentValue: 0.25,
            snap: { enabled: true },
          },
          mode: {
            type: 'enum',
            defaultValue: 'A',
            currentValue: 'A',
            values: ['A', 'B', 'C'],
          },
          xValue: {
            type: 'float',
            min: 0,
            max: 1,
            step: 0.01,
            defaultValue: 0,
            currentValue: 0,
            snap: { enabled: true },
          },
          yValue: {
            type: 'float',
            min: 0,
            max: 1,
            step: 0.01,
            defaultValue: 0,
            currentValue: 0,
            snap: { enabled: true },
          },
        },
      },
      Behaviors: {
        _children: {
          mainSlider: { type: 'slider', valueChannel: 'mainValue', geometry: 'linear' },
          modeButton: { type: 'cycle', valueChannel: 'mode', geometry: 'none' },
        },
      },
      HitZones: {
        _children: {
          mainDragArea: {
            enabled: true,
            shape: 'rectangle',
            action: 'dragValue',
            targetBehavior: 'mainSlider',
            targetValueChannel: 'mainValue',
            priority: 0,
            bounds: { x: 0, y: 0, width: 100, height: 100, unit: 'percent' },
          },
          modeClickArea: {
            enabled: true,
            shape: 'circle',
            action: 'cycleValue',
            targetBehavior: 'modeButton',
            targetValueChannel: 'mode',
            priority: 10,
            bounds: { x: 80, y: 0, width: 20, height: 40, unit: 'percent' },
          },
          gridCell: {
            enabled: true,
            shape: 'rectangle',
            action: 'setValue',
            targetBehavior: 'mainSlider',
            targetValueChannel: 'mainValue',
            targetValueChannelX: 'xValue',
            targetValueChannelY: 'yValue',
            priority: 20,
            payload: {
              type: 'gridCell',
              normalized: 0.75,
              xNormalized: 0.5,
              yNormalized: 0.25,
              rowIndex: 1,
              columnIndex: 2,
            },
            bounds: { x: 0, y: 50, width: 20, height: 50, unit: 'percent' },
          },
        },
      },
    },
  };
}

test('commitPanelPreviewSelectAction advances cyclic buttons through value rows', () => {
  const previousPanels = get(panels);
  const previousActivePanelId = get(activePanelId);
  const previousActiveEditorTab = get(activeEditorTab);
  const previousPreviewSessions = get(panelPreviewSessions);

  const control = makeCyclicControl('cycle_1');
  const panel = { id: 101, name: 'Preview Panel', controls: [control] };

  try {
    panels.set([panel]);
    activePanelId.set(panel.id);
    activeEditorTab.set({ type: 'panel', id: panel.id });
    panelPreviewSessions.set({});

    commitPanelPreviewSelectAction('cycle_1');
    assert.equal(get(panelPreviewSessions).cycle_1?.valueOverrideEnabled, true);
    assert.equal(get(panelPreviewSessions).cycle_1?.valueOverride, 'state_2');

    commitPanelPreviewSelectAction('cycle_1');
    assert.equal(get(panelPreviewSessions).cycle_1?.valueOverride, 'state_3');

    commitPanelPreviewSelectAction('cycle_1');
    assert.equal(get(panelPreviewSessions).cycle_1?.valueOverride, 'state_1');
  } finally {
    panels.set(previousPanels);
    activePanelId.set(previousActivePanelId);
    activeEditorTab.set(previousActiveEditorTab);
    panelPreviewSessions.set(previousPreviewSessions);
  }
});

test('commitPanelPreviewSelectAction selects the targeted radio-group item value', () => {
  const previousPanels = get(panels);
  const previousActivePanelId = get(activePanelId);
  const previousActiveEditorTab = get(activeEditorTab);
  const previousPreviewSessions = get(panelPreviewSessions);

  const control = makeRadioGroupControl('radio_1');
  const panel = { id: 103, name: 'Preview Panel', controls: [control] };

  try {
    panels.set([panel]);
    activePanelId.set(panel.id);
    activeEditorTab.set({ type: 'panel', id: panel.id });
    panelPreviewSessions.set({});

    commitPanelPreviewSelectAction('radio_1', { value: 'bpf' });
    assert.equal(get(panelPreviewSessions).radio_1?.checked, false);
    assert.equal(get(panelPreviewSessions).radio_1?.valueOverrideEnabled, true);
    assert.equal(get(panelPreviewSessions).radio_1?.valueOverride, 'bpf');
  } finally {
    panels.set(previousPanels);
    activePanelId.set(previousActivePanelId);
    activeEditorTab.set(previousActiveEditorTab);
    panelPreviewSessions.set(previousPreviewSessions);
  }
});

test('commitPanelPreviewSelectAction respects non-wrapping cyclic buttons at the end of the row list', () => {
  const previousPanels = get(panels);
  const previousActivePanelId = get(activePanelId);
  const previousActiveEditorTab = get(activeEditorTab);
  const previousPreviewSessions = get(panelPreviewSessions);

  const control = makeCyclicControl('cycle_nowrap', { wrapBehavior: false });
  const panel = { id: 102, name: 'Preview Panel', controls: [control] };

  try {
    panels.set([panel]);
    activePanelId.set(panel.id);
    activeEditorTab.set({ type: 'panel', id: panel.id });
    panelPreviewSessions.set({
      cycle_nowrap: {
        valueOverrideEnabled: true,
        valueOverride: 'state_3',
      },
    });

    commitPanelPreviewSelectAction('cycle_nowrap');
    assert.equal(get(panelPreviewSessions).cycle_nowrap?.valueOverride, 'state_3');
  } finally {
    panels.set(previousPanels);
    activePanelId.set(previousActivePanelId);
    activeEditorTab.set(previousActiveEditorTab);
    panelPreviewSessions.set(previousPreviewSessions);
  }
});

test('createInteractionPreviewSession seeds slider preview focus for the authored value mode', () => {
  const rangeSlider = makeSliderControl('slider_range', { valueMode: 'range' });
  const bandSlider = makeSliderControl('slider_band', { valueMode: 'band' });

  const rangeSession = createInteractionPreviewSession(rangeSlider);
  const bandSession = createInteractionPreviewSession(bandSlider);

  assert.equal(rangeSession.activeHandle, 'start');
  assert.equal(rangeSession.valueInputRole, 'start');
  assert.equal(bandSession.activeHandle, 'current');
  assert.equal(bandSession.valueInputRole, 'current');
});

test('createInteractionPreviewSession seeds custom component value channels', () => {
  const session = createInteractionPreviewSession(makeCustomComponent('custom_1'));

  assert.equal(session.customValues.mainValue, 0.25);
  assert.equal(session.customValues.mode, 'A');
  assert.equal(session.customValues.xValue, 0);
  assert.equal(session.customValues.yValue, 0);
  assert.equal(session.customNormalizedValue, 0.25);
});

test('custom arpeggiator resolves notes, velocity, and gate from the current step', () => {
  const control = makeCustomComponent('custom_arp');
  control._children.Designer = {
    arpeggiator: {
      enabled: true,
      stepCount: 8,
      viewNote: 60,
      blocks: [
        { id: 'a', note: 60, step: 1, length: 2, velocity: 96 },
        { id: 'b', note: 64, step: 3, length: 1, velocity: 72 },
      ],
    },
  };
  control._children.ValueChannels._children.arpCurrentStep = { type: 'int', min: 0, max: 7, defaultValue: 1, currentValue: 1 };
  control._children.ValueChannels._children.arpNote = { type: 'int', min: 0, max: 127, defaultValue: 0, currentValue: 0 };
  control._children.ValueChannels._children.arpVelocity = { type: 'int', min: 0, max: 127, defaultValue: 0, currentValue: 0 };
  control._children.ValueChannels._children.arpGate = { type: 'bool', defaultValue: false, currentValue: false };

  const step = resolveCustomArpeggiatorStep(control, 2);
  const values = syncCustomArpeggiatorValues(control, { arpCurrentStep: 3 });

  assert.equal(step.gate, true);
  assert.equal(step.note, 60);
  assert.equal(step.velocity, 96);
  assert.equal(values.arpGate, true);
  assert.equal(values.arpNote, 64);
  assert.equal(values.arpVelocity, 72);
});

test('custom arpeggiator runtime grid edits update the preview block model', () => {
  const control = makeCustomComponent('custom_arp_runtime');
  control._children.Transform = { x: 0, y: 0, width: 640, height: 220 };
  control._children.Parts = { _children: {} };
  control._children.HitZones = { _children: {} };
  control._children.Designer = {
    arpeggiator: {
      enabled: true,
      stepCount: 8,
      viewNote: 60,
      blocks: [
        { id: 'a', note: 60, step: 0, length: 1, velocity: 96 },
      ],
    },
  };
  control._children.ValueChannels._children.arpCurrentStep = { type: 'int', min: 0, max: 7, defaultValue: 2, currentValue: 2 };
  control._children.ValueChannels._children.arpNote = { type: 'int', min: 0, max: 127, defaultValue: 0, currentValue: 0 };
  control._children.ValueChannels._children.arpVelocity = { type: 'int', min: 0, max: 127, defaultValue: 0, currentValue: 0 };
  control._children.ValueChannels._children.arpGate = { type: 'bool', defaultValue: false, currentValue: false };

  const rect = { left: 0, top: 0, width: 640, height: 220 };
  const materialized = materializedCustomComponentSnapshot(control, {});
  const gridHit = { name: 'arp_grid_draw', zone: materialized._children.HitZones._children.arp_grid_draw };
  const drawPatch = resolveCustomInteractionPatch(control, createInteractionPreviewSession(control), gridHit, {
    rect,
    clientX: 211,
    clientY: 94,
  });
  const runtimeArp = drawPatch.customValues[CUSTOM_ARP_RUNTIME_KEY];
  const created = runtimeArp.blocks.find((block) => block.id === runtimeArp.selectedBlock);

  assert.ok(created);
  assert.equal(runtimeArp.blocks.length, 2);
  assert.equal(runtimeArp.selectedBlock, created.id);
  assert.equal(drawPatch.customValues.arpCurrentStep, 2);
  assert.equal(drawPatch.customValues.arpGate, true);
  assert.equal(drawPatch.customValues.arpNote, created.note);
});

test('updatePanelPreviewSession propagates custom panel routes between components', () => {
  const previousPanels = get(panels);
  const previousActivePanelId = get(activePanelId);
  const previousActiveEditorTab = get(activeEditorTab);
  const previousPreviewSessions = get(panelPreviewSessions);

  const source = makeCustomComponent('custom_route_source');
  const target = makeCustomComponent('custom_route_target');
  source._children.PublishedProperties = {
    inputs: {},
    outputs: {
      mainValue: { channel: 'mainValue', label: 'Main Value', type: 'float', enabled: true },
    },
  };
  source._children.Links = {
    enabled: true,
    _children: {
      routeToTarget: {
        enabled: true,
        type: 'external-output',
        source: 'mainValue',
        target: 'custom_route_target.mainValue',
        targetControlId: 'custom_route_target',
        targetPort: 'mainValue',
      },
    },
  };
  target._children.PublishedProperties = {
    inputs: {
      mainValue: { channel: 'mainValue', label: 'Main Value', type: 'float', enabled: true },
    },
    outputs: {},
  };

  const panel = { id: 104, name: 'Preview Panel', controls: [source, target] };

  try {
    panels.set([panel]);
    activePanelId.set(panel.id);
    activeEditorTab.set({ type: 'panel', id: panel.id });
    panelPreviewSessions.set({
      custom_route_source: createInteractionPreviewSession(source),
      custom_route_target: createInteractionPreviewSession(target),
    });

    updatePanelPreviewSession('custom_route_source', {
      customValues: {
        ...createInteractionPreviewSession(source).customValues,
        mainValue: 0.86,
      },
      valueOverrideEnabled: true,
      valueOverride: 0.86,
    });

    const sessions = get(panelPreviewSessions);
    assert.equal(sessions.custom_route_target?.customValues?.mainValue, 0.86);
    assert.equal(sessions.custom_route_target?.customNormalizedValue, 0.86);
    assert.equal(sessions.custom_route_target?.valueOverrideEnabled, true);
    assert.equal(sessions.custom_route_target?.valueOverride, 0.86);
  } finally {
    panels.set(previousPanels);
    activePanelId.set(previousActivePanelId);
    activeEditorTab.set(previousActiveEditorTab);
    panelPreviewSessions.set(previousPreviewSessions);
  }
});

test('resolveCustomInteractionPatch maps drag hit zones into custom channel values', () => {
  const control = makeCustomComponent('custom_2');
  const rect = { left: 0, top: 0, width: 200, height: 100 };
  const hitZone = resolveCustomHitZoneAtPoint(control, rect, 100, 50);
  const patch = resolveCustomInteractionPatch(control, createInteractionPreviewSession(control), hitZone, {
    rect,
    clientX: 150,
    clientY: 50,
  });

  assert.equal(hitZone.name, 'mainDragArea');
  assert.equal(patch.customValues.mainValue, 0.75);
  assert.equal(patch.valueOverride, 0.75);
  assert.equal(patch.activeCustomBehavior, 'mainSlider');
});

test('resolveCustomInteractionPatch cycles custom enum channels from hit zones', () => {
  const control = makeCustomComponent('custom_3');
  const rect = { left: 0, top: 0, width: 200, height: 100 };
  const hitZone = resolveCustomHitZoneAtPoint(control, rect, 180, 20);
  const patch = resolveCustomInteractionPatch(control, createInteractionPreviewSession(control), hitZone, {
    rect,
    clientX: 180,
    clientY: 20,
  });

  assert.equal(hitZone.name, 'modeClickArea');
  assert.equal(patch.customValues.mode, 'B');
  assert.equal(patch.activeCustomBehavior, 'modeButton');
});

test('resolveCustomHitZoneAtPoint prefers smaller zones when priorities tie', () => {
  const control = makeCustomComponent('custom_specific_zone');
  control._children.HitZones._children.modeClickArea.priority = 0;
  const hitZone = resolveCustomHitZoneAtPoint(control, { left: 0, top: 0, width: 100, height: 100 }, 90, 20);

  assert.equal(hitZone.name, 'modeClickArea');
  assert.equal(hitZone.zone.action, 'cycleValue');
});

test('resolveCustomInteractionPatch maps generated payloads into discrete and XY channel values', () => {
  const control = makeCustomComponent('custom_payload');
  const rect = { left: 0, top: 0, width: 200, height: 100 };
  const hitZone = resolveCustomHitZoneAtPoint(control, rect, 20, 75);
  const patch = resolveCustomInteractionPatch(control, createInteractionPreviewSession(control), hitZone, {
    rect,
    clientX: 20,
    clientY: 75,
  });

  assert.equal(hitZone.name, 'gridCell');
  assert.equal(patch.customValues.mainValue, 0.75);
  assert.equal(patch.customValues.xValue, 0.5);
  assert.equal(patch.customValues.yValue, 0.25);
  assert.equal(patch.valueOverride, 0.75);
});

test('resolveCustomInteractionPatch maps free XY drag points into paired value channels', () => {
  const control = makeCustomComponent('custom_xy_drag');
  control._children.Behaviors._children.xyPad = {
    type: 'xy-pad',
    valueChannel: 'xValue',
    valueChannels: ['xValue', 'yValue'],
    geometry: 'grid',
  };
  control._children.HitZones._children.xyPadArea = {
    enabled: true,
    shape: 'rectangle',
    action: 'dragValue',
    targetBehavior: 'xyPad',
    targetValueChannel: 'xValue',
    targetValueChannelY: 'yValue',
    priority: 30,
    bounds: { x: 0, y: 0, width: 100, height: 100, unit: 'percent' },
  };

  const rect = { left: 10, top: 20, width: 200, height: 100 };
  const hitZone = resolveCustomHitZoneAtPoint(control, rect, 60, 45);
  const patch = resolveCustomInteractionPatch(control, createInteractionPreviewSession(control), hitZone, {
    rect,
    clientX: 60,
    clientY: 45,
  });

  assert.equal(hitZone.name, 'xyPadArea');
  assert.equal(patch.customValues.xValue, 0.25);
  assert.equal(patch.customValues.yValue, 0.75);
  assert.equal(patch.activeCustomBehavior, 'xyPad');
});

test('custom circular hit zones can match narrow authored arc bands', () => {
  const control = makeCustomComponent('custom_arc_bands');
  control._children.Transform.width = 200;
  control._children.Transform.height = 200;
  control._children.Behaviors._children.outerRing = {
    type: 'slider',
    valueChannel: 'mainValue',
    geometry: 'circular',
    startAngle: -135,
    endAngle: 135,
    sweepAngle: 270,
    centerX: 50,
    centerY: 52,
  };
  control._children.Behaviors._children.innerRing = {
    type: 'slider',
    valueChannel: 'xValue',
    geometry: 'circular',
    startAngle: -135,
    endAngle: 135,
    sweepAngle: 270,
    centerX: 50,
    centerY: 52,
  };
  control._children.HitZones._children = {
    outerRingZone: {
      enabled: true,
      shape: 'ring',
      action: 'dragValue',
      targetBehavior: 'outerRing',
      targetValueChannel: 'mainValue',
      priority: 20,
      bounds: { x: 10, y: 12, width: 80, height: 80, unit: 'percent' },
      startAngle: -135,
      endAngle: 135,
      innerRadius: 0.86,
      outerRadius: 1,
    },
    innerRingZone: {
      enabled: true,
      shape: 'ring',
      action: 'dragValue',
      targetBehavior: 'innerRing',
      targetValueChannel: 'xValue',
      priority: 30,
      bounds: { x: 28, y: 30, width: 44, height: 44, unit: 'percent' },
      startAngle: -135,
      endAngle: 135,
      innerRadius: 0.78,
      outerRadius: 1,
    },
  };

  const rect = { left: 0, top: 0, width: 200, height: 200 };
  assert.equal(resolveCustomHitZoneAtPoint(control, rect, 100, 24)?.name, 'outerRingZone');
  assert.equal(resolveCustomHitZoneAtPoint(control, rect, 100, 56), null);
  assert.equal(resolveCustomHitZoneAtPoint(control, rect, 100, 60)?.name, 'innerRingZone');
  assert.equal(resolveCustomHitZoneAtPoint(control, rect, 100, 184), null);
});

test('custom circular drag maps authored 270 degree knob arcs instead of full circles', () => {
  const control = makeCustomComponent('custom_arc_drag');
  control._children.Transform.width = 200;
  control._children.Transform.height = 200;
  control._children.Behaviors._children.mainRing = {
    type: 'slider',
    valueChannel: 'mainValue',
    geometry: 'circular',
    startAngle: -135,
    endAngle: 135,
    sweepAngle: 270,
    centerX: 50,
    centerY: 52,
  };
  const hitZone = {
    name: 'mainRingZone',
    zone: {
      enabled: true,
      shape: 'ring',
      action: 'dragValue',
      targetBehavior: 'mainRing',
      targetValueChannel: 'mainValue',
      bounds: { x: 10, y: 12, width: 80, height: 80, unit: 'percent' },
      startAngle: -135,
      endAngle: 135,
      innerRadius: 0.86,
      outerRadius: 1,
    },
  };
  const rect = { left: 0, top: 0, width: 200, height: 200 };

  const topPatch = resolveCustomInteractionPatch(control, createInteractionPreviewSession(control), hitZone, {
    rect,
    clientX: 100,
    clientY: 24,
  });
  const rightPatch = resolveCustomInteractionPatch(control, createInteractionPreviewSession(control), hitZone, {
    rect,
    clientX: 157,
    clientY: 161,
  });
  const bottomPatch = resolveCustomInteractionPatch(control, createInteractionPreviewSession(control), hitZone, {
    rect,
    clientX: 100,
    clientY: 184,
  });

  assert.ok(Math.abs(topPatch.customValues.mainValue - 0.5) < 0.02);
  assert.equal(rightPatch.customValues.mainValue, 1);
  assert.equal(bottomPatch.customValues.mainValue, 0);
});

test('resolveCustomHitZoneProbeValues maps generated payloads without a pointer event', () => {
  const control = makeCustomComponent('custom_probe_payload');
  const zone = control._children.HitZones._children.gridCell;
  const values = resolveCustomHitZoneProbeValues(control, { name: 'gridCell', zone }, {
    mainValue: 0.25,
    mode: 'A',
    xValue: 0,
    yValue: 0,
  });

  assert.equal(values.mainValue, 0.75);
  assert.equal(values.xValue, 0.5);
  assert.equal(values.yValue, 0.25);
});

test('resolveCustomHitZoneProbeValues gives drag zones a useful preview value', () => {
  const control = makeCustomComponent('custom_probe_drag');
  const zone = control._children.HitZones._children.mainDragArea;
  const values = resolveCustomHitZoneProbeValues(control, { name: 'mainDragArea', zone }, {
    mainValue: 0.25,
  });

  assert.equal(values.mainValue, 0.75);
});

test('resolveCustomHitZoneProbeValues gives payloadless set zones a useful preview value', () => {
  const control = makeCustomComponent('custom_probe_set_surface');
  const zone = {
    enabled: true,
    action: 'setValue',
    targetBehavior: 'mainSlider',
    targetValueChannel: 'mainValue',
  };
  const values = resolveCustomHitZoneProbeValues(control, { name: 'padSurface', zone }, {
    mainValue: 0.25,
  });

  assert.equal(values.mainValue, 0.75);
});

test('resolveCustomHitZoneProbeValues cycles enum zones and prefers note numbers for piano keys', () => {
  const control = makeCustomComponent('custom_probe_note');
  control._children.ValueChannels._children.note = {
    type: 'int',
    min: 0,
    max: 127,
    step: 1,
    defaultValue: 60,
    currentValue: 60,
    snap: { enabled: true },
  };

  const modeValues = resolveCustomHitZoneProbeValues(control, {
    name: 'modeClickArea',
    zone: control._children.HitZones._children.modeClickArea,
  }, { mode: 'A' });
  const noteValues = resolveCustomHitZoneProbeValues(control, {
    name: 'pianoKey',
    zone: {
      enabled: true,
      action: 'noteValue',
      targetValueChannel: 'note',
      payload: {
        type: 'pianoKey',
        noteNumber: 64,
        noteName: 'E4',
        normalized: 0.5,
        keyIndex: 4,
      },
    },
  });

  assert.equal(modeValues.mode, 'B');
  assert.equal(noteValues.note, 64);
});

test('resolveCustomInteractionPatch applies custom switch links to routed output values', () => {
  const control = makeCustomComponent('custom_switch_link');
  control._children.ValueChannels._children.valueA = {
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: 0.2,
    currentValue: 0.2,
    snap: { enabled: true },
  };
  control._children.ValueChannels._children.valueB = {
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: 0.8,
    currentValue: 0.8,
    snap: { enabled: true },
  };
  control._children.Links = {
    enabled: true,
    _children: {
      activeValueRoute: {
        enabled: true,
        type: 'switch',
        source: 'mode',
        target: 'mainValue',
      },
    },
  };

  const rect = { left: 0, top: 0, width: 200, height: 100 };
  const hitZone = resolveCustomHitZoneAtPoint(control, rect, 180, 20);
  const patch = resolveCustomInteractionPatch(control, createInteractionPreviewSession(control), hitZone, {
    rect,
    clientX: 180,
    clientY: 20,
  });

  assert.equal(patch.customValues.mode, 'B');
  assert.equal(patch.customValues.mainValue, 0.8);
  assert.equal(patch.valueOverrideEnabled, true);
  assert.equal(patch.valueOverride, 0.8);
});

test('applyCustomLinks executes map, offset, condition, toggle, and reset operations', () => {
  const control = makeCustomComponent('custom_link_operations');
  control._children.ValueChannels._children.gain = {
    type: 'float',
    min: 0,
    max: 2,
    step: 0.01,
    defaultValue: 0.5,
    currentValue: 0.5,
    snap: { enabled: true },
  };
  control._children.ValueChannels._children.flag = {
    type: 'bool',
    defaultValue: false,
    currentValue: false,
  };
  control._children.ValueChannels._children.resetTarget = {
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: 0.33,
    currentValue: 0.77,
    snap: { enabled: true },
  };
  control._children.Links = {
    enabled: true,
    _children: {
      mapGain: {
        enabled: true,
        type: 'map',
        source: 'xValue',
        target: 'gain',
        inputMin: 0,
        inputMax: 1,
        outputMin: 0,
        outputMax: 2,
      },
      offsetY: {
        enabled: true,
        type: 'offset',
        source: 'xValue',
        target: 'yValue',
        amount: 0.25,
      },
      conditionalMain: {
        enabled: true,
        type: 'condition',
        target: 'mainValue',
        expression: 'mode === B',
        trueValue: 'yValue',
        falseValue: 'xValue',
      },
      toggleFlag: {
        enabled: true,
        type: 'toggle',
        target: 'flag',
      },
      resetValue: {
        enabled: true,
        type: 'reset',
        target: 'resetTarget',
      },
    },
  };

  const result = applyCustomLinks(control, {
    mainValue: 0.25,
    mode: 'B',
    xValue: 0.4,
    yValue: 0,
    gain: 0.5,
    flag: false,
    resetTarget: 0.77,
  });

  assert.equal(result.values.gain, 0.8);
  assert.equal(result.values.yValue, 0.65);
  assert.equal(result.values.mainValue, 0.65);
  assert.equal(result.values.flag, true);
  assert.equal(result.values.resetTarget, 0.33);
  assert.deepEqual([...result.targets], ['gain', 'yValue', 'mainValue', 'flag', 'resetTarget']);
});
