import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { activeEditorTab, activePanelId, panels } from '../src/CE_Application/stores/panels.js';
import {
  createInteractionPreviewSession,
  commitPanelPreviewSelectAction,
  panelPreviewSessions,
} from '../src/CE_Application/stores/interactionPreview.js';

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
