// hostagePlayerRole.test.js — the player role (docs/design/hostage-creator-editor-player.md).
//
// A player — HoSTage installed as one, or the editor trying its show as one — keeps the rig and
// the setlist, and makes no screens, control pages or controller descriptions, and does not
// build. The host refuses those commands (isEditorOnlyCommand in InstrumentHostService.cpp,
// tested natively in CE/tests/InstrumentHostServiceTests.cpp); the browser preview keeps a copy
// (utils/hostageRole.js). This file holds the copy to the host's list, and every page, surface
// and project command in the host to one side or the other, so a new one cannot slip past a
// player by not being listed.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { get } from 'svelte/store';

import {
  EDITOR_ONLY_COMMANDS, EDITOR_ONLY_SLOT_OPTIONS, editorOnlyCommand, editorOnlyRefusal,
} from '../src/CE_Application/utils/hostageRole.js';

const cpp = readFileSync(new URL('../../src/InstrumentHost/InstrumentHostService.cpp', import.meta.url), 'utf8');
const block = cpp.match(/bool isEditorOnlyCommand[\s\S]*?editorOnly \{([\s\S]*?)\};/)?.[1] ?? '';
const nativeEditorOnly = new Set([...block.matchAll(/"([A-Za-z]+)"/g)].map((m) => m[1]));
const nativeSlotFields = [...(cpp.match(/command == "setControlSlotOptions"\)\s*for \(const char\* field : \{([\s\S]*?)\}\)/)?.[1] ?? '')
  .matchAll(/"([A-Za-z]+)"/g)].map((m) => m[1]);

test('the preview refuses exactly what the host refuses', () => {
  assert.ok(nativeEditorOnly.size >= 15, `read ${nativeEditorOnly.size} commands from isEditorOnlyCommand`);
  assert.deepEqual([...EDITOR_ONLY_COMMANDS].sort(), [...nativeEditorOnly].sort());
  assert.deepEqual([...EDITOR_ONLY_SLOT_OPTIONS].sort(), [...nativeSlotFields].sort());
});

// Every command of the kinds that make screens, pages and products, and what a player does with
// it. A new one fails here until somebody decides.
const PLAYER_KEEPS = {
  setControlSlotValue: 'turning a knob is playing',
  setControlSlotOptions: 'only how the knob sends MIDI; the rest is refused field by field',
  learnControlSlotMidi: 're-learning which physical control sends what, on a different keyboard',
  clearControlSlotMidi: 'the same, undone',
  learnSurfaceControl: 'Learn hardware on the drawing: a MIDI binding, never a parameter',
  cancelLearnControlSlotParameter: 'cancelling changes nothing',
  showControlPage: 'switching pages is playing',
  getSurfaceLayout: 'reading',
  getHostProject: 'reading',
  claimHardwareSurface: 'taking the keyboard',
  releaseHardwareSurface: 'giving it back',
  browseOnSurface: 'a mode for a moment',
  soundcheckOnSurface: 'stage pages are switched by whoever plays',
  layersOnSurface: 'stage pages are switched by whoever plays',
  discoverOnSurface: 'stage pages are switched by whoever plays',
  cueOnSurface: 'stage pages are switched by whoever plays',
  changesOnSurface: 'stage pages are switched by whoever plays',
  metersOnSurface: 'stage pages are switched by whoever plays',
  liveOnSurface: 'stage pages are switched by whoever plays',
  setTryAsPlayer: 'the switch itself — refused in an installed player',
};

test('every page, surface and project command in the host is decided for a player', () => {
  const commands = new Set([...cpp.matchAll(/cmd == "([A-Za-z]+)"/g)].map((m) => m[1]));
  const kinds = /ControlPage|ControlSlot|UserSurface|SurfaceControl|HostProject|HostProduct|quickLearn|FaderLayers|PadLayers|SurfaceLayout|HardwareSurface|OnSurface|TryAsPlayer|Player\b|CreatorLicence/;
  const undecided = [...commands].filter((cmd) => kinds.test(cmd)
    && !EDITOR_ONLY_COMMANDS.has(cmd) && !(cmd in PLAYER_KEEPS));
  assert.deepEqual(undecided, [], 'add each to the editor-only list or to PLAYER_KEEPS, with a reason');
  for (const cmd of Object.keys(PLAYER_KEEPS)) {
    assert.ok(commands.has(cmd), `${cmd} is no longer a host command — take it out of PLAYER_KEEPS`);
    assert.ok(!EDITOR_ONLY_COMMANDS.has(cmd), `${cmd} cannot be both`);
  }
});

// The same, one level down: every field setControlSlotOptions reads is the page's or the player's.
const SLOT_FIELDS_PLAYER_KEEPS = {
  pageId: 'which slot', slotId: 'which slot',
  midiPickup: 'whether the knob catches the value up — the physical knob\'s',
  midiRelative: 'an endless knob or not — the keyboard\'s',
  midiRelativeFormat: 'which relative encoding the keyboard sends',
};

test('every field a slot\'s options take is decided for a player', () => {
  const handler = cpp.match(/if \(cmd == "setControlSlotOptions"\)([\s\S]*?)\n {4}if \(cmd == /)?.[1] ?? '';
  const fields = new Set([...handler.matchAll(/(?:hasProperty|getProperty) \("([A-Za-z]+)"/g)].map((m) => m[1]));
  assert.ok(fields.size >= 10, `read ${fields.size} fields from the setControlSlotOptions handler`);
  const undecided = [...fields].filter((f) => !EDITOR_ONLY_SLOT_OPTIONS.includes(f) && !(f in SLOT_FIELDS_PLAYER_KEEPS));
  assert.deepEqual(undecided, [], 'add each to the field list in isEditorOnlyCommand or to SLOT_FIELDS_PLAYER_KEEPS');
});

test('a slot option is the editor\'s unless it only says how the knob sends MIDI', () => {
  assert.equal(editorOnlyCommand({ cmd: 'setControlSlotOptions', pageId: 'p', slotId: 's1', midiRelative: true }), false);
  assert.equal(editorOnlyCommand({ cmd: 'setControlSlotOptions', pageId: 'p', slotId: 's1', midiPickup: true }), false);
  assert.equal(editorOnlyCommand({ cmd: 'setControlSlotOptions', pageId: 'p', slotId: 's1', label: 'Cutoff' }), true);
  assert.equal(editorOnlyCommand({ cmd: 'setControlSlotOptions', pageId: 'p', slotId: 's1', colour: 255 }), true);
  assert.equal(editorOnlyCommand({ cmd: 'addPart' }), false, 'the rig is everyone\'s');
  assert.equal(editorOnlyCommand({ cmd: 'addControlPage' }), true);
});

test('the preview\'s refusal reads like the host\'s', () => {
  for (const [cmd, expected] of [['addControlPage', /Screens and control pages are made in the HoSTage editor/],
    ['buildHostProduct', /Building belongs to the HoSTage editor/]]) {
    assert.match(editorOnlyRefusal(cmd), expected);
    const nativeText = cmd === 'buildHostProduct' ? 'Building belongs to the HoSTage editor' : 'Screens and control pages are made in the HoSTage editor';
    assert.ok(cpp.includes(nativeText), 'the same words are in the host');
  }
});

test('in the preview, the editor tries its show as the player and comes back', async () => {
  const { applyMockCommand, normalizeHostState } = await import('../src/CE_Application/stores/instrumentHost.js');
  let state = normalizeHostState({});
  assert.equal(state.player, false);
  const pages = (s) => s.rack.pages.length;

  state = applyMockCommand(state, { cmd: 'addControlPage' });
  const made = pages(state);
  assert.ok(made >= 1, 'the editor makes pages');

  state = applyMockCommand(state, { cmd: 'setTryAsPlayer', on: true });
  assert.equal(state.player, true);
  assert.equal(pages(applyMockCommand(state, { cmd: 'addControlPage' })), made, 'trying the player, it refuses a page');

  state = applyMockCommand(state, { cmd: 'setTryAsPlayer', on: false });
  assert.equal(state.player, false);
  assert.equal(pages(applyMockCommand(state, { cmd: 'addControlPage' })), made + 1, 'and back in the editor makes one');

  const installed = normalizeHostState({ playerInstalled: true });
  assert.equal(installed.player, true, 'installed as a player is a player');
  assert.equal(applyMockCommand(installed, { cmd: 'setTryAsPlayer', on: false }).player, true,
    'and has no editor to go back to');
});

test('the store sends the switch, and the screens hide what a player cannot do', async () => {
  const store = await import('../src/CE_Application/stores/instrumentHost.js');
  assert.equal(typeof store.setTryAsPlayer, 'function');
  assert.equal(get(store.hostState).player, false);

  const view = readFileSync(new URL('../src/CE_Application/sections/InstrumentHostView.svelte', import.meta.url), 'utf8');
  assert.match(view, /data-testid="host-try-player"/);
  assert.match(view, /data-testid="host-role-player"/);
  assert.match(view, /hostUtilities\.filter\(\(u\) => !\(u\.id === 'project' && \(player \|\| !creator\.available\)\)\)/,
    'no Project utility in a player');
  const surface = readFileSync(new URL('../src/CE_Application/sections/HostSurfacePanel.svelte', import.meta.url), 'utf8');
  assert.match(surface, /\{#if !player\}\s*<button type="button" class="ghost" data-testid="surface-describe"/);
  assert.match(surface, /function dropOn\(event, control\) \{\s*if \(player \|\|/, 'nothing can be dropped on a player\'s controls');
});
