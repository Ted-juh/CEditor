// hostageShows.test.js — shows (docs/design/hostage-creator-editor-player.md, step 3).
//
// The host writes, opens and carries shows (HostShow.h; testShows and
// testShowFindsVendorPresetsAlreadyHere in CE/tests/InstrumentHostServiceTests.cpp); the build
// script ships one in a product (hostProductBuild.test.js). This file holds the page to what the
// host reports, the browser preview's stand-in to what the host does, and the two owner's rules:
// a player switches shows, and where a change goes is the user's choice.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  normalizeShows, normalizeHostState, applyMockCommand, noteMockShowChange,
} from '../src/CE_Application/stores/instrumentHost.js';
import { stageCommandAllowed } from '../src/CE_Application/utils/stageLock.js';
import { editorOnlyCommand } from '../src/CE_Application/utils/hostageRole.js';

const source = (file) => readFileSync(new URL(`../src/CE_Application/${file}`, import.meta.url), 'utf8');
const SHOW_COMMANDS = ['saveShow', 'openShow', 'revertShow', 'deleteShow', 'importShow', 'exportShow', 'setShowChanges', 'refreshShows'];

test('the state says which show is open, whether the rig moved on, and what is missing', () => {
  assert.deepEqual(normalizeShows(undefined),
    { current: null, changed: false, changes: 'keep', list: [], missing: [], canPick: false });
  const shows = normalizeShows({
    current: { name: 'Friday: Paradiso', file: 'Friday Paradiso.hostageshow', builtIn: false },
    changed: true, changes: 'save', canPick: true,
    list: [{ name: 'Friday Paradiso', file: 'Friday Paradiso.hostageshow', savedAtMs: 5 }, { name: 'no file' }],
    missing: ['Good Synth (Good Audio)'],
  });
  assert.equal(shows.current.name, 'Friday: Paradiso');
  assert.equal(shows.changes, 'save');
  assert.equal(shows.list.length, 1, 'a row with no file is not a show');
  assert.deepEqual(shows.missing, ['Good Synth (Good Audio)']);
  assert.equal(normalizeShows({ changed: true }).changed, false, 'no show open, nothing to have changed');
});

test('a player switches shows, and nobody does under Stage Lock', () => {
  for (const cmd of SHOW_COMMANDS) {
    assert.equal(editorOnlyCommand({ cmd }), false, `${cmd} is a player's as much as the editor's`);
    assert.equal(stageCommandAllowed(true, cmd), false, `${cmd} waits for Stage Lock to come off`);
  }
});

test('in the preview, shows are saved, changed, gone back to and switched as the host does', () => {
  const run = (state, payload) => noteMockShowChange(state, applyMockCommand(state, payload), payload);
  let state = normalizeHostState({});
  state = run(state, { cmd: 'saveShow', name: 'Friday: Paradiso' });
  assert.deepEqual(state.shows.current, { name: 'Friday: Paradiso', file: 'Friday Paradiso.hostageshow', builtIn: false });
  const parts = state.rack.parts.length;

  state = run(state, { cmd: 'addPart' });
  assert.equal(state.shows.changed, true, 'a change to the rig is a change to the show');
  state = run(state, { cmd: 'revertShow' });
  assert.equal(state.rack.parts.length, parts, 'Back to the show undoes it');
  assert.equal(state.shows.changed, false);

  state = run(state, { cmd: 'addPart' });
  state = run(state, { cmd: 'saveShow', name: 'Rehearsal' });
  assert.equal(state.shows.list.length, 2);
  state = run(state, { cmd: 'openShow', file: 'Friday Paradiso.hostageshow' });
  assert.equal(state.rack.parts.length, parts, 'switching opens the other show\'s rig');

  state = run(state, { cmd: 'setShowChanges', mode: 'save' });
  state = run(state, { cmd: 'addPart' });
  assert.equal(state.shows.changed, false, 'saving as it goes, the show never falls behind');
  state = run(state, { cmd: 'openShow', file: 'Rehearsal.hostageshow' });
  state = run(state, { cmd: 'openShow', file: 'Friday Paradiso.hostageshow' });
  assert.equal(state.rack.parts.length, parts + 1, 'and what changed went into the show');

  state = run(state, { cmd: 'deleteShow', file: 'Rehearsal.hostageshow' });
  assert.deepEqual(state.shows.list.map((row) => row.name), ['Friday Paradiso']);
});

test('the Shows utility asks before changes are thrown away, and says what is missing', () => {
  const panel = source('sections/HostShowsPanel.svelte');
  assert.match(panel, /let unsaved = \$derived\(shows\.changed && shows\.changes === 'keep'\)/);
  assert.match(panel, /\{:else if unsaved\}\s*<HostConfirmButton[^>]*data-testid="show-open"/,
    'opening another show over changes kept apart asks for a second click');
  assert.match(panel, /\{#if shows\.changes === 'keep'\}\s*<HostConfirmButton[^>]*data-testid="show-revert"/,
    'Back to the show is there when changes are kept apart, and asks too');
  assert.match(panel, /data-testid="show-missing"/);
  assert.match(panel, /data-testid="show-changes-save"[^>]*onchange=\{\(\) => setShowChanges\('save'\)\}/);
  assert.match(panel, /\{#if !row\.builtIn\}\s*<HostConfirmButton[^>]*data-testid="show-delete"/,
    'a show that came with the program has no Delete');

  const view = source('sections/InstrumentHostView.svelte');
  assert.match(view, /\{ id: 'shows', label: 'Shows' \}/);
  assert.match(view, /\{#if activeUtility === 'shows'\}\s*<HostShowsPanel \/>/);
});

// Step 4: making a player (PlayerCreator.h; testPlayerCreator and testCreatePlayerCommand natively).
test('the page is told what this HoSTage can copy into a player, and how the last one went', async () => {
  const { normalizePlayers } = await import('../src/CE_Application/stores/instrumentHost.js');
  assert.deepEqual(normalizePlayers(undefined), { standalone: false, vst3: false, canPick: false, busy: false, last: null });
  const players = normalizePlayers({
    standalone: true, vst3: true, busy: false,
    last: { ok: true, name: 'Friday Rig', folder: '/media/stick/Friday Rig', notes: ['The live plug-in worker was not found'] },
  });
  assert.equal(players.last.folder, '/media/stick/Friday Rig');
  assert.deepEqual(players.last.notes, ['The live plug-in worker was not found']);
  assert.equal(editorOnlyCommand({ cmd: 'createPlayer' }), true, 'a player does not make players');
});

test('Make a player is the editor\'s, starts from the open show, and says what goes in', () => {
  const panel = source('sections/HostShowsPanel.svelte');
  assert.match(panel, /let makesPlayers = \$derived\(!\$hostState\.player\)/);
  assert.match(panel, /\{#if makesPlayers\}\s*<section class="shows-block" data-testid="player-maker">/);
  assert.match(panel, /const isTicked = \(row\) => ticked\[keyOf\(row\)\] \?\? Boolean\(isCurrent\(row\)\)/,
    'the open show is ticked until somebody says otherwise');
  assert.match(panel, /data-testid="player-unsaved">The open show goes in as it was last saved/);
  assert.match(panel, /data-testid="player-standalone" disabled=\{!players\.standalone\}/);
  assert.match(panel, /data-testid="player-nothing"/, 'with nothing to copy, it says so instead of offering');
  assert.match(panel, /createPlayer\(\{ name: playerName\.trim\(\), shows: chosen, standalone: standaloneOn, vst3: vst3On,\s*portable: wantPortable && standaloneOn \}\)/);
  assert.match(panel, /let wantPortable = \$state\(true\)/, 'portable to begin with: most players go on a stick');
  assert.match(panel, /data-testid="player-portable" disabled=\{!standaloneOn\}/, 'and only the standalone can be');
});
