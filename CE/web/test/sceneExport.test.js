// sceneExport.test.js — a panel's scenes reach the plug-in (step 5b): the export payload a plug-in is
// built from carries them, as the editor and tools/scripts/prepare-export-panel.mjs write it, and
// the player reads them back with the loader Player.svelte uses.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { exportFormFor } from '../../../tools/scripts/lib/exportDocument.mjs';
import { deserializePanel } from '../src/CE_Application/stores/panelModel.js';

const saved = JSON.parse(readFileSync(new URL('../../qa/QA-01-components.cepanel', import.meta.url), 'utf8'));
const firstId = saved.controls[0]?._children?.Core?.id ?? saved.controls[0]?.Core?.id;

const scenes = [
  {
    id: 'sc_intro', name: 'Intro', trigger: { type: 'panelOpen' }, length: 1200, loop: false,
    clips: [{ id: 'cl_1', controlId: firstId, target: 'Transform', start: 0, length: 600, label: 'Fade in',
      effect: { kind: 'keyframes', easing: 'outCubic', frames: [{ at: 0, opacity: 0 }, { at: 1, opacity: 1 }] } }],
  },
  { id: 'sc_beat', name: 'Pulse', trigger: { type: 'beat', every: 4 }, length: 400, loop: false, clips: [] },
  { id: 'sc_press', name: 'Press', trigger: { type: 'state', controlId: firstId, to: 'pressed' }, length: 300, loop: true, clips: [] },
];

test('the export payload carries the panel\'s scenes, and the player reads them back', async () => {
  assert.ok(firstId, 'the fixture has a control to animate');
  const payload = await exportFormFor({ ...saved, animationScenes: scenes }, 'QA-01-components.cepanel');
  assert.deepEqual(payload.animationScenes.map((scene) => [scene.id, scene.trigger.type]), [['sc_intro', 'panelOpen'], ['sc_beat', 'beat'], ['sc_press', 'state']]);
  const player = deserializePanel(JSON.stringify(payload), null, null);
  assert.equal(player.animationScenes.length, 3);
  assert.equal(player.animationScenes[0].clips[0].controlId, firstId);
  assert.deepEqual(player.animationScenes[2].trigger, { type: 'state', controlId: firstId, to: 'pressed' });
  assert.equal(player.animationScenes[2].loop, true);
});
