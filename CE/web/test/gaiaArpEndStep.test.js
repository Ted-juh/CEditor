import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGaiaPanel } from '../../../tools/scripts/gaia-panel/make-gaia-panel.mjs';
import { mountPanel, loadScript, controlNamed, idOf } from './support/gaiaScriptHarness.mjs';
import { get } from 'svelte/store';
import { panelPreviewSessions, updatePanelPreviewSession } from '../src/CE_Application/stores/interactionPreview.js';
import { resolveCustomInteractionPatch, seedCustomValues } from '../src/CE_Application/utils/customComponentInteraction.js';
import { syncDeviceParameterToPanelPreview } from '../src/CE_Application/utils/deviceBindingSync.js';
import { materializedCustomComponentSnapshot } from '../src/CE_Application/utils/customComponentMaterializer.js';

test('ruler stages loop length, scales with zoom, and ignores non-atomic hardware feedback', () => {
  const panel = buildGaiaPanel();
  mountPanel(panel);
  assert.ok(!panel.scripts.some(s => s.id === 'gaia_arp_end_step'));
  const grid = controlNamed(panel, 'arp_pattern_grid');
  const binding = grid._children.DeviceBindings.bindings[0];
  assert.equal(binding.port, 'arpEndStep');
  assert.equal(binding.parameterId, 'arp.endStep');
  const original = seedCustomValues(grid);
  updatePanelPreviewSession(idOf(grid), { customValues: original });
  const script = loadScript(panel.scripts.find(s => s.id === 'gaia_arp_pattern_bridge').source);
  script.onPanelLoad();
  const zone = materializedCustomComponentSnapshot(grid, { customChannels: { 'channel.arpEndStep.raw': 32 } })._children.HitZones._children.arp_end_step_ruler;
  for (const scale of [0.5, 1, 1.5]) for (const end of [16, 1, 32, 8]) {
    const width = grid._children.Transform.width;
    const patch = resolveCustomInteractionPatch(grid, { customValues: original }, { name: 'arp_end_step_ruler', zone }, {
      rect: { left: 100, top: 50, width: width * scale, height: 240 * scale },
      clientX: 100 + (44 + (end - 0.5) * (width - 52) / 32) * scale, clientY: 55,
    });
    assert.deepEqual(patch.customValues, { arpEndStep: end });
    assert.equal(patch.valueOverride, undefined, 'must not move the playhead');
    updatePanelPreviewSession(idOf(grid), patch);
    script.settle();
    assert.deepEqual(get(panelPreviewSessions)[idOf(grid)].customValues.arpPattern, original.arpPattern);
  }
  assert.deepEqual(script.writes, [], 'ruler must not send or regenerate note patterns');
  assert.equal(syncDeviceParameterToPanelPreview(binding.deviceRole, 'arp.endStep', 12), 0);
  assert.equal(get(panelPreviewSessions)[idOf(grid)].customValues.arpEndStep, 8);
  assert.deepEqual(get(panelPreviewSessions)[idOf(grid)].customValues.arpPattern, original.arpPattern);
});

test('loop overlay keeps all columns, notes and edit zones; exact boundaries for 1, 16 and 32', () => {
  const grid = controlNamed(buildGaiaPanel(), 'arp_pattern_grid');
  const width = grid._children.Transform.width;
  const gridWidth = width - 52;
  const original = JSON.stringify(grid);
  for (const end of [1, 16, 32]) {
    const result = materializedCustomComponentSnapshot(grid, { customChannels: { 'channel.arpEndStep.raw': end } });
    const parts = result._children.Parts._children;
    assert.ok(parts.arp_step_32);
    assert.ok(parts.arp_block_arp_seed_7); // Note starting at step 17 must survive shortening.
    assert.ok(result._children.HitZones._children.arp_block_arp_seed_7_velocity);
    assert.equal(parts.arp_end_boundary._children.Layout.x, 44 + end * gridWidth / 32 - 2);
    assert.equal(parts.arp_end_label._children.Text.content, `END ${end}`);
    if (end < 32) {
      assert.equal(parts.arp_inactive_steps._children.Layout.width, gridWidth * (32 - end) / 32);
      assert.equal(parts.arp_inactive_steps._children.Layout.x, 44 + end * gridWidth / 32);
    } else assert.equal(parts.arp_inactive_steps, undefined);
  }
  assert.equal(JSON.stringify(grid), original);
  const noInput = materializedCustomComponentSnapshot(grid, {});
  assert.equal(noInput._children.Parts._children.arp_end_boundary, undefined);
});
