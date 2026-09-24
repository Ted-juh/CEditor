import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGaiaPanel } from '../../../tools/scripts/gaia-panel/make-gaia-panel.mjs';
import { DIMMED } from '../../../tools/scripts/gaia-panel/active-state.mjs';
import { mountPanel, loadScript, controlNamed, idOf } from './support/gaiaScriptHarness.mjs';
import { onDumpParsedForTesting } from '../src/CE_Application/scripting/panelRuntime.js';
import { updatePanelPreviewSession } from '../src/CE_Application/stores/interactionPreview.js';

const ROLE = 'Roland GAIA SH-01';
function setup() {
  const panel = buildGaiaPanel(), mounted = mountPanel(panel);
  const script = loadScript(panel.scripts.find(s => s.id === 'gaia_active_state').source);
  const config = JSON.parse(panel.scripts.find(s => s.id === 'gaia_active_state').source.match(/var CONFIG = ([\s\S]*?);\n/)[1]);
  const byId = id => mounted.controls().find(c => c._children.Core.id === id)._children;
  const opacity = id => byId(id).Transform.opacity ?? 1;
  const enabled = id => byId(id).Core.enabled !== false;
  // Device events are dispatched asynchronously (handlers are primed first), as they are live.
  const receive = async values => { onDumpParsedForTesting({ ok: true, deviceRole: ROLE, values }); await new Promise(r => setTimeout(r, 20)); script.settle(); };
  return { panel, mounted, script, config, byId, opacity, enabled, receive };
}

test('every tone row and effect block is found, and the TONE buttons are never dimmed with their row', () => {
  const { panel, config } = setup();
  assert.equal(config.tones.length, 3);
  for (const tone of config.tones) {
    assert.ok(tone.members.length > 60, `tone row has its frames, captions and controls: ${tone.members.length}`);
    for (const t of [1, 2, 3]) for (const name of [`common.tone${t}Switch`, `common.tone${t}Select`, `tone${t}.copy`]) {
      assert.ok(!tone.members.includes(idOf(controlNamed(panel, name))), `${name} stays bright`);
    }
  }
  const t2 = new Set(config.tones[1].members);
  for (const name of ['tone2.filter.cutoff', 'tone2.amp.level', 'tone2.modLfo.rate', 'tone2.osc.pitchEnv.viewButton']) {
    assert.ok(t2.has(idOf(controlNamed(panel, name))), `${name} dims with tone 2`);
  }
  assert.ok(!t2.has(idOf(controlNamed(panel, 'tone1.filter.cutoff'))), 'rows do not bleed into each other');
  assert.deepEqual(config.effects.map(e => e.parameter), ['distortion.type', 'flanger.type', 'delay.type', 'reverb.type']);
  for (const effect of config.effects) { assert.equal(effect.knobs.length, 4); assert.equal(effect.captions.length, 4); }
});

test('nothing dims before a value is known, and loading undoes a dim a saved panel carried', () => {
  const { script, config, byId, opacity, enabled } = setup();
  const sample = config.tones[1].members[0], knob = config.effects[0].knobs[0];
  byId(sample).Transform.opacity = DIMMED; byId(knob).Core.enabled = false; byId(knob).Transform.opacity = DIMMED;
  script.onPanelLoad(); script.settle();
  for (const tone of config.tones) for (const id of tone.members) assert.equal(opacity(id), 1);
  for (const effect of config.effects) for (const id of [...effect.knobs, ...effect.captions]) assert.equal(opacity(id), 1);
  assert.equal(enabled(knob), true);
});

test('a tone the synth reports OFF dims its row, even though OFF is also the default; ON restores it', async () => {
  const { script, config, opacity, receive } = setup();
  script.onPanelLoad(); script.settle();
  await receive({ 'common.tone1Switch': 'on', 'common.tone2Switch': 'off', 'common.tone3Switch': 0 });
  for (const id of config.tones[0].members) assert.equal(opacity(id), 1);
  for (const id of config.tones[1].members) assert.equal(opacity(id), DIMMED);
  for (const id of config.tones[2].members) assert.equal(opacity(id), DIMMED);
  await receive({ 'common.tone2Switch': 'on' });
  for (const id of config.tones[1].members) assert.equal(opacity(id), 1);
  assert.deepEqual(script.writes, [], 'dimming sends nothing to the synth');
});

test('effect knobs lock and dim while TYPE is OFF and come back with a type', async () => {
  const { script, config, opacity, enabled, receive } = setup();
  script.onPanelLoad(); script.settle();
  await receive({ 'distortion.type': 0, 'reverb.type': 1 });
  const [distortion, , , reverb] = config.effects;
  for (const id of distortion.knobs) { assert.equal(enabled(id), false); assert.equal(opacity(id), DIMMED); }
  for (const id of distortion.captions) assert.equal(opacity(id), DIMMED);
  for (const id of reverb.knobs) { assert.equal(enabled(id), true); assert.equal(opacity(id), 1); }
  await receive({ 'distortion.type': 2 });
  for (const id of distortion.knobs) { assert.equal(enabled(id), true); assert.equal(opacity(id), 1); }
  for (const id of config.effects[1].knobs) assert.equal(enabled(id), true, 'an effect never reported stays usable');
  assert.deepEqual(script.writes, []);
});

test('switching a tone off on the panel dims it without waiting for the synth', () => {
  const { panel, script, config, opacity } = setup();
  script.onPanelLoad(); script.settle();
  const sw = idOf(controlNamed(panel, 'common.tone3Switch'));
  updatePanelPreviewSession(sw, { checked: true }); script.settle();
  updatePanelPreviewSession(sw, { checked: false }); script.settle();
  for (const id of config.tones[2].members) assert.equal(opacity(id), DIMMED);
});
