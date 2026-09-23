import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import {
  panelPreviewSessions,
  setInteractionPreviewPanelProvider,
  syncPanelPreviewSessions,
  updatePanelPreviewSession,
} from '../src/CE_Application/stores/interactionPreview.js';
import { activePanelId, panels } from '../src/CE_Application/stores/panels.js';
import { makeRoute, routeEndpoint, ROUTE_MODE } from '../src/CE_Application/utils/routeModel.js';

const held = (value) => ({ valueOverrideEnabled: true, valueOverride: value });

function ranged(id, max = 1) {
  return {
    _children: {
      Core: { id, name: id, controlType: 'Knob' },
      Behavior: { family: 'range', role: 'knob', valueType: 'float', min: 0, max, defaultValue: 0 },
    },
  };
}

test('a player-owned panel participates in session value routes without an editor tab', () => {
  const source = ranged('source');
  const target = ranged('target', 127);
  const panel = {
    id: 'player-panel',
    controls: [source, target],
    routes: [makeRoute({
      from: routeEndpoint({ controlId: 'source', port: 'value' }),
      to: routeEndpoint({ controlId: 'target', port: 'value' }),
      mode: ROUTE_MODE.set,
    })],
  };

  panels.set([]);
  activePanelId.set(null);
  setInteractionPreviewPanelProvider(() => panel);
  try {
    panelPreviewSessions.set({});
    syncPanelPreviewSessions(panel.controls);
    updatePanelPreviewSession('source', held(0.5));
    assert.ok(Math.abs(get(panelPreviewSessions).target.valueOverride - 63.5) < 1e-9);
  } finally {
    setInteractionPreviewPanelProvider(null);
    panelPreviewSessions.set({});
  }
});
