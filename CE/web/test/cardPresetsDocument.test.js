// cardPresetsDocument.test.js — card presets travel with the panel (finding E3, second clause).
//
// Presets lived only in localStorage, which made them a property of the machine rather than of
// the design. Share a .cepanel and it arrived without the presets its layout was built from: the
// reader saw a preset picker holding their own presets and none of the author's, and any
// instruction of the form "reapply the Knob Chrome preset" could not be followed at all.
//
// They now live in both places — the user's library, which is what makes them reusable, and the
// document, which is what makes them travel — and the store every card reads is the merge.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { panels, activePanelId, activeEditorTab } from '../src/CE_Application/stores/panels.js';
import { createPanel, deserializePanel, serializePanel, normalizeCardPresets } from '../src/CE_Application/stores/panelModel.js';
import {
  addCardPreset,
  adoptDocumentCardPresets,
  cardPresetLibrary,
  cardPresets,
  getCardPresetById,
  mergePresetLists,
  removeCardPreset,
  updateCardPreset,
} from '../src/CE_Application/stores/cardPresets.js';

function openPanel(overrides = {}) {
  const panel = { ...createPanel('Presets'), ...overrides };
  panels.set([panel]);
  activePanelId.set(panel.id);
  activeEditorTab.set({ type: 'panel', id: panel.id });
  return panel;
}

function reset() {
  cardPresetLibrary.set([]);
  openPanel();
}

const documentPresets = () => get(panels)[0].cardPresets;

test('a new panel carries an empty preset list', () => {
  assert.deepEqual(createPanel('x').cardPresets, []);
});

test('saving a preset puts it in the library AND in the open document', () => {
  reset();
  const preset = addCardPreset({ domain: 'component:core', name: 'Knob Chrome', patches: { 'Core.tooltip': 'x' } });

  assert.equal(get(cardPresetLibrary).some((p) => p.id === preset.id), true, 'the library is what makes it reusable');
  assert.equal(documentPresets().some((p) => p.id === preset.id), true, 'the document is what makes it travel');
  assert.equal(get(cardPresets).some((p) => p.id === preset.id), true);
});

test('a preset saved into a panel survives a save/open round trip', () => {
  reset();
  const preset = addCardPreset({ domain: 'component:text', name: 'Caption', patches: { 'Text.content': 'hi' } });

  const reopened = deserializePanel(serializePanel(get(panels)[0]), 'C:/x/shared.cepanel', 'shared');
  const carried = reopened.cardPresets.find((p) => p.id === preset.id);
  assert.ok(carried, 'the preset did not survive the file');
  assert.equal(carried.name, 'Caption');
  assert.deepEqual(carried.patches, { 'Text.content': 'hi' });
});

test('opening a shared panel shows its presets without touching the reader\'s library', () => {
  reset();
  cardPresetLibrary.set([{ id: 'mine', domain: 'component:core', name: 'My Preset', patches: {} }]);

  // A panel from somebody else, carrying a preset the reader has never seen.
  openPanel({ cardPresets: [{ id: 'theirs', domain: 'component:core', name: 'Their Preset', patches: {} }] });

  const visible = get(cardPresets).map((p) => p.id);
  assert.deepEqual(visible.sort(), ['mine', 'theirs'], 'both the reader\'s and the document\'s presets are usable');
  assert.deepEqual(get(cardPresetLibrary).map((p) => p.id), ['mine'],
    'opening a file must not quietly grow the reader\'s library');
  assert.equal(getCardPresetById('theirs')?.name, 'Their Preset');
});

test('on an id collision the document wins, and the library copy is left alone', () => {
  reset();
  cardPresetLibrary.set([{ id: 'shared', domain: 'component:core', name: 'Library Version', patches: { a: 1 } }]);
  openPanel({ cardPresets: [{ id: 'shared', domain: 'component:core', name: 'Document Version', patches: { a: 2 } }] });

  const merged = get(cardPresets);
  assert.equal(merged.length, 1, 'the same preset must not appear twice');
  assert.equal(merged[0].name, 'Document Version', 'the panel\'s own design is what its presets have to describe');
  assert.equal(merged[0].origin, 'document');
  assert.equal(get(cardPresetLibrary)[0].name, 'Library Version', 'the reader\'s copy is untouched');
});

test('mergePresetLists drops entries with no id and never duplicates one', () => {
  const merged = mergePresetLists(
    [{ id: 'a', name: 'doc' }, { id: 'a', name: 'dupe' }, { name: 'no id' }],
    [{ id: 'a', name: 'lib' }, { id: 'b', name: 'lib b' }],
  );
  assert.deepEqual(merged.map((p) => `${p.id}:${p.name}:${p.origin}`), ['a:doc:document', 'b:lib b:library']);
});

test('editing and deleting reach both copies', () => {
  reset();
  const preset = addCardPreset({ domain: 'component:core', name: 'Before', patches: {} });

  updateCardPreset(preset.id, { name: 'After' });
  assert.equal(get(cardPresetLibrary).find((p) => p.id === preset.id).name, 'After');
  assert.equal(documentPresets().find((p) => p.id === preset.id).name, 'After',
    'a preset that drifted between the file and the library would silently stop matching its name');

  removeCardPreset(preset.id);
  assert.equal(get(cardPresetLibrary).some((p) => p.id === preset.id), false);
  assert.equal(documentPresets().some((p) => p.id === preset.id), false);
});

test('editing a document-only preset does not copy it into the library', () => {
  reset();
  openPanel({ cardPresets: [{ id: 'theirs', domain: 'component:core', name: 'Theirs', patches: {} }] });

  updateCardPreset('theirs', { name: 'Renamed' });
  assert.equal(documentPresets()[0].name, 'Renamed');
  assert.deepEqual(get(cardPresetLibrary), [], 'someone else\'s preset must not appear in the reader\'s library uninvited');
});

test('adopting is the explicit way a document preset joins the library', () => {
  reset();
  const panel = openPanel({
    cardPresets: [
      { id: 'theirs', domain: 'component:core', name: 'Theirs', patches: {} },
      { id: 'mine', domain: 'component:core', name: 'Already Known', patches: {} },
    ],
  });
  cardPresetLibrary.set([{ id: 'mine', domain: 'component:core', name: 'Already Known', patches: {} }]);

  const added = adoptDocumentCardPresets(panel.id);
  assert.deepEqual(added.map((p) => p.id), ['theirs'], 'only the unknown one is added');
  assert.deepEqual(get(cardPresetLibrary).map((p) => p.id).sort(), ['mine', 'theirs']);
  assert.deepEqual(adoptDocumentCardPresets(panel.id), [], 'adopting twice adds nothing');
});

test('a document written before presets travelled, or written badly, opens cleanly', () => {
  assert.deepEqual(normalizeCardPresets(undefined), []);
  assert.deepEqual(normalizeCardPresets('nonsense'), []);
  assert.deepEqual(normalizeCardPresets([null, 'x', { name: 'no id' }, { id: '' }]), []);
  assert.deepEqual(normalizeCardPresets([{ id: 'a' }, { id: 'a' }, { id: 'b' }]).map((p) => p.id), ['a', 'b']);

  const legacy = deserializePanel(JSON.stringify({ name: 'Old', controls: [] }), 'C:/x/old.cepanel', 'old');
  assert.deepEqual(legacy.cardPresets, [], 'a panel from before this existed must open with an empty list, not undefined');
});
