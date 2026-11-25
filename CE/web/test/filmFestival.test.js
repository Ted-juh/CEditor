// filmFestival.test.js — the Film Festival's eight panels (scripts/filmFestivalPanels.js, written to
// CE/panels/Film Festival/ by export-film-festival.mjs): the committed files are what the script
// writes, each opens as a panel, and each one's scene keeps every clip on a control the panel has.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

import { FESTIVAL_DIR, filmFile } from '../scripts/export-film-festival.mjs';
import { FILMS, filmPanel } from '../scripts/filmFestivalPanels.js';
import { deserializePanel } from '../src/CE_Application/stores/panelModel.js';
import { cleanScene } from '../src/CE_Application/utils/sceneFormat.js';

test('the committed films are what the script writes: run export-film-festival.mjs after changing one', () => {
  const names = FILMS.map(([id]) => filmPanel(id).name);
  assert.deepEqual(readdirSync(FESTIVAL_DIR).filter((f) => f.endsWith('.cepanel')).sort(), names.map((name) => `${name}.cepanel`).sort());
  for (const [id] of FILMS) {
    const { path, text } = filmFile(id);
    assert.equal(readFileSync(path, 'utf8'), text, `${path} is stale`);
  }
});

test('each film opens as a panel, its scene playing when it opens, every clip on a control it has', () => {
  for (const [id] of FILMS) {
    const { path } = filmFile(id);
    const panel = deserializePanel(readFileSync(path, 'utf8'), path, null);
    assert.ok(panel, `${id} opens`);
    assert.equal(panel.animationScenes.length, 1, id);
    const [scene] = panel.animationScenes;
    assert.deepEqual([scene.trigger.type, scene.loop], ['panelOpen', true], id);
    const authored = filmPanel(id).animationScenes[0];
    assert.equal(cleanScene(scene).clips.length, authored.clips.length, `${id}: no clip dropped on the way through the file`);
    const ids = new Set(panel.controls.map((control) => control._children.Core.id));
    for (const clip of scene.clips) assert.ok(ids.has(clip.controlId), `${id}: ${clip.id} plays on a control the panel has`);
    for (const clip of scene.clips) assert.ok(clip.start + clip.length <= scene.length + 1, `${id}: ${clip.id} ends inside its scene`);
  }
});

test('the films show the new text effects: The Shining parts its word, The Matrix and Back to the Future reel theirs', () => {
  const effectsOf = (id) => filmPanel(id).animationScenes[0].clips.filter((clip) => clip.effect.kind === 'text').map((clip) => `${clip.effect.effect}:${clip.effect.way}`);
  assert.ok(effectsOf('shining').includes('part:out'));
  assert.ok(effectsOf('matrix').includes('reel:in'));
  assert.ok(effectsOf('bttf').includes('reel:in'));
  assert.ok(effectsOf('psycho').includes('part:out'));
});
