// songBook.test.js — the Song Book's panels (scripts/songBookPanels.js, written to
// CE/panels/Song Book/ by export-song-book.mjs): the committed files are what the script writes,
// each opens as a panel with every clip on a control it has, the two scenes that follow something
// other than the clock are what they say, and no panel carries a song's words.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

import { SONG_BOOK_DIR, songFile } from '../scripts/export-song-book.mjs';
import { SONGS, songPanel } from '../scripts/songBookPanels.js';
import { deserializePanel } from '../src/CE_Application/stores/panelModel.js';
import { cleanScene } from '../src/CE_Application/utils/sceneFormat.js';

test('the committed songs are what the script writes: run export-song-book.mjs after changing one', () => {
  const names = SONGS.map(([id]) => songPanel(id).name);
  assert.deepEqual(readdirSync(SONG_BOOK_DIR).filter((f) => f.endsWith('.cepanel')).sort(), names.map((name) => `${name}.cepanel`).sort());
  for (const [id] of SONGS) {
    const { path, text } = songFile(id);
    assert.equal(readFileSync(path, 'utf8'), text, `${path} is stale`);
  }
});

test('each song opens as a panel, every clip of every scene on a control it has and inside its scene', () => {
  for (const [id] of SONGS) {
    const { path } = songFile(id);
    const panel = deserializePanel(readFileSync(path, 'utf8'), path, null);
    assert.ok(panel, `${id} opens`);
    const authored = songPanel(id).animationScenes;
    assert.equal(panel.animationScenes.length, authored.length, id);
    const ids = new Set(panel.controls.map((control) => control._children.Core.id));
    panel.animationScenes.forEach((scene, i) => {
      assert.equal(cleanScene(scene).clips.length, authored[i].clips.length, `${id}: no clip dropped on the way through the file`);
      for (const clip of scene.clips) {
        assert.ok(ids.has(clip.controlId), `${id}: ${clip.id} plays on a control the panel has`);
        assert.ok(clip.start + clip.length <= scene.length + 1, `${id}: ${clip.id} ends inside its scene`);
      }
    });
    assert.deepEqual([panel.animationScenes[0].trigger.type, panel.animationScenes[0].loop], ['panelOpen', true], `${id} plays as it opens`);
  }
});

test('two songs follow something other than the clock: the pointer, and the transport', () => {
  const eyes = songPanel('everybreath');
  const watch = eyes.controls.find((control) => control._children.Core.name === 'Watch');
  const watching = eyes.animationScenes.find((scene) => scene.clock);
  assert.deepEqual([watching.clock.source, watching.clock.controlId], ['pointerX', watch._children.Core.id]);
  assert.equal(eyes.controls.at(-1), watch, 'the panel the pointer is heard over is on top of everything');

  const sequencer = songPanel('bluemonday');
  const bar = sequencer.animationScenes.find((scene) => scene.trigger.type === 'beat');
  assert.deepEqual([bar.trigger.every, bar.loop], [4, false], 'a bar, started again on every fourth beat');
  assert.ok(bar.clips.length > 10);
});

test('no song carries its words: a title, and a few words of our own at most', () => {
  const plain = (words) => words.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, ' ').trim().toLowerCase();
  for (const [id] of SONGS) {
    const panel = songPanel(id);
    const title = panel.controls.find((control) => control._children.Core.name === 'Title');
    assert.equal(plain(title._children.Text.content), plain(panel.name), `${id}: its title is its name`);
    for (const control of panel.controls) {
      const words = String(control._children.Text?.content ?? '').split(/\s+/).filter(Boolean);
      assert.ok(words.length <= 12, `${id}: ${control._children.Core.name} says ${words.length} words`);
    }
  }
});
