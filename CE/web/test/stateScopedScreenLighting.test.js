import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import {
  applyInspectorResolvedValue,
  applyInspectorControlPatch,
  updateControlProperty,
  updateInspectorControlProperty,
} from '../src/CE_Application/stores/controls.js';
import {
  activateColorTarget,
  activateInspectorColorTarget,
  applyColorToTarget,
  colorTarget,
  colorTargetRestoreValue,
} from '../src/CE_Application/stores/colorTarget.js';
import { activateGradientTarget, gradientTarget } from '../src/CE_Application/stores/gradientTarget.js';
import {
  availableStateEditNames,
  selectedScopedEditingControl,
  setStateEditScopeBase,
  setStateEditScopeState,
} from '../src/CE_Application/stores/stateEditScope.js';
import { activePanelId, panels, selectedComponentIds } from '../src/CE_Application/stores/panels.js';

function screenControl() {
  return {
    _children: {
      Core: { id: 'screen', name: 'Screen' },
      Display: { brightness: 40 },
      Pixel: { contrast: 55 },
      States: {
        _children: {
          Hover: { patches: { component: {}, parts: {} } },
        },
      },
    },
  };
}

test('explicit inspector screen edits stay inside the selected interaction state', () => {
  const control = screenControl();
  setStateEditScopeState('Hover');
  try {
    applyInspectorResolvedValue(control, 'Display.brightness', 80);
    applyInspectorResolvedValue(control, 'Pixel.contrast', 25);

    assert.equal(control._children.Display.brightness, 40);
    assert.equal(control._children.Pixel.contrast, 55);
    assert.deepEqual(control._children.States._children.Hover.patches.component, {
      'Display.brightness': 80,
      'Pixel.contrast': 25,
    });
  } finally {
    setStateEditScopeBase();
  }
});

test('generic screen writes remain on the base document while Hover is selected', () => {
  const control = screenControl();
  panels.set([{ id: 'panel', controls: [control] }]);
  activePanelId.set('panel');
  selectedComponentIds.set(new Set(['screen']));
  setStateEditScopeState('Hover');
  try {
    // This is the same generic API used by scripts, previews and canvas tools.
    updateControlProperty('screen', 'Display.brightness', 72);
    let stored = get(panels)[0].controls[0];
    assert.equal(stored._children.Display.brightness, 72);
    assert.deepEqual(stored._children.States._children.Hover.patches.component, {});

    updateInspectorControlProperty('screen', 'Pixel.contrast', 24);
    stored = get(panels)[0].controls[0];
    assert.equal(stored._children.Pixel.contrast, 55);
    assert.equal(stored._children.States._children.Hover.patches.component['Pixel.contrast'], 24);

    applyInspectorControlPatch('screen', {
      'Display.brightness': 63,
      'Pixel.contrast': 31,
    });
    stored = get(panels)[0].controls[0];
    assert.equal(stored._children.States._children.Hover.patches.component['Display.brightness'], 63);
    assert.equal(stored._children.States._children.Hover.patches.component['Pixel.contrast'], 31);
  } finally {
    setStateEditScopeBase();
    selectedComponentIds.set(new Set());
    activePanelId.set(null);
    panels.set([]);
  }
});

test('a state-aware inspector skips controls without the selected state', () => {
  const control = screenControl();
  delete control._children.States;
  setStateEditScopeState('Hover');
  try {
    assert.equal(applyInspectorResolvedValue(control, 'Display.brightness', 91), false);
    assert.equal(control._children.Display.brightness, 40);
  } finally {
    setStateEditScopeBase();
  }
});

test('a newer whole-node state override removes stale leaf overrides below it', () => {
  const control = screenControl();
  control._children.Display.fields = [{ colour: 'old' }];
  control._children.States._children.Hover.patches.component['Display.fields.0.colour'] = 'stale';
  setStateEditScopeState('Hover');
  try {
    const fields = [{ colour: 'new' }];
    applyInspectorResolvedValue(control, 'Display.fields', fields);
    assert.deepEqual(control._children.States._children.Hover.patches.component, {
      'Display.fields': fields,
    });
  } finally {
    setStateEditScopeBase();
  }
});

test('colour and gradient targets close when the editing state changes', () => {
  activateColorTarget({ type: 'control', controlId: 'screen', path: 'Display.litColour' }, 'FF112233');
  activateGradientTarget({ type: 'control', controlId: 'screen', path: 'Background.Fill' }, null);
  setStateEditScopeState('active');
  try {
    assert.equal(get(colorTarget), null);
    assert.equal(get(gradientTarget), null);
  } finally {
    setStateEditScopeBase();
  }
});

test('colour cancellation preserves a raw token and an untouched session is a no-op', () => {
  activateColorTarget({ type: 'control', controlId: 'screen', path: 'Display.litColour' }, '{surface}');
  const target = get(colorTarget);
  assert.equal(target._initialRawColor, '{surface}');
  assert.equal(colorTargetRestoreValue(target, false), null);
  assert.equal(colorTargetRestoreValue(target, true), '{surface}');
  colorTarget.set(null);
});

test('an inspector colour target captures Hover while a generic target stays on base', () => {
  const control = screenControl();
  control._children.Display.litColour = '{surface}';
  panels.set([{ id: 'panel', controls: [control] }]);
  activePanelId.set('panel');
  selectedComponentIds.set(new Set(['screen']));
  setStateEditScopeState('Hover');
  try {
    activateInspectorColorTarget(
      { type: 'control', controlId: 'screen', path: 'Display.litColour' },
      '{surface}',
    );
    applyColorToTarget('FF112233');
    let stored = get(panels)[0].controls[0];
    assert.equal(stored._children.Display.litColour, '{surface}');
    assert.equal(stored._children.States._children.Hover.patches.component['Display.litColour'], 'FF112233');

    activateColorTarget(
      { type: 'control', controlId: 'screen', path: 'Display.litColour' },
      '{surface}',
    );
    applyColorToTarget('FF445566');
    stored = get(panels)[0].controls[0];
    assert.equal(stored._children.Display.litColour, 'FF445566');
  } finally {
    colorTarget.set(null);
    setStateEditScopeBase();
    selectedComponentIds.set(new Set());
    activePanelId.set(null);
    panels.set([]);
  }
});

test('state editing resolves nested selected controls', () => {
  const child = {
    _children: {
      Core: { id: 'nested', name: 'Nested' },
      Display: { brightness: 40 },
      States: { _children: { Hover: { patches: { component: { 'Display.brightness': 80 }, parts: {} } } } },
    },
  };
  const container = {
    _children: {
      Core: { id: 'container', name: 'Container' },
      Children: { _children: { nested: child } },
    },
  };
  panels.set([{ id: 'panel', controls: [container] }]);
  activePanelId.set('panel');
  selectedComponentIds.set(new Set(['nested']));
  setStateEditScopeState('Hover');
  try {
    assert.deepEqual(get(availableStateEditNames), ['Hover']);
    assert.equal(get(selectedScopedEditingControl)?._children?.Core?.id, 'nested');
    assert.equal(get(selectedScopedEditingControl)?._children?.Display?.brightness, 80);
  } finally {
    setStateEditScopeBase();
    selectedComponentIds.set(new Set());
    activePanelId.set(null);
    panels.set([]);
  }
});
