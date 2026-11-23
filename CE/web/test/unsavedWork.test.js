// unsavedWork.test.js — the places CEditor used to lose work without asking.
//
//   Quitting: the close button, Alt+F4 and File → Close Program quit at once (QuitGate.h asks the
//     page now; stores/quitGuard.js answers, layout/QuitDialog.svelte asks the person).
//   A device profile tab closed with unsaved changes in its Designer, without a word.
//   A new device profile could not be saved (the engine had no file for it), and started as nothing
//     to edit (editor/dpd/dpdNewProfile.js).
//   The CTRL49 Screen Builder could not save at all (stores/screenBuilder.js, stores/typedDocuments.js).

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { unsavedDocumentsFrom } from '../src/CE_Application/stores/quitGuard.js';
import { screenDocumentFromAssignment, screenDocumentText, exportAssignment } from '../src/CE_Application/stores/screenBuilder.js';
import { typedDocumentFileName, typedDocumentNameFromFile } from '../src/CE_Application/stores/typedDocuments.js';
import { newProfileModel } from '../src/CE_Application/editor/dpd/dpdNewProfile.js';
import dpdLibrary from '../src/CE_Application/generated/dpd/dpdLibrary.json' with { type: 'json' };
import { resolveModel } from '../src/CE_Application/generated/dpd/resolve.mjs';
import { buildLegacyProfile } from '../src/CE_Application/generated/dpd/emit-legacy-core.mjs';
import { validateLocalProfileSource } from '../src/CE_Application/stores/deviceProfileLocalEngine.js';

/** A bridge that records what the page sends and lets the test answer as C++ would. */
function withBridge(fn) {
  const previous = globalThis.window;
  const sent = [];
  const listeners = new Map();
  let token = 0;
  globalThis.window = {
    ...(previous ?? {}),
    __JUCE__: { backend: {
      emitEvent: (name, payload) => sent.push({ name, payload }),
      addEventListener: (name, callback) => { listeners.set(name, [...(listeners.get(name) ?? []), callback]); return ++token; },
      removeEventListener: () => {},
    } },
  };
  const fire = (name, payload) => (listeners.get(name) ?? []).forEach((callback) => callback(payload));
  return Promise.resolve(fn({ sent, fire })).finally(() => { globalThis.window = previous; });
}

const answers = (sent) => sent.filter((event) => event.name === 'quitAnswer').map((event) => event.payload.answer);
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

// --- What is unsaved ------------------------------------------------------------------------------

test('what counts as unsaved, and what Save and quit can save without a dialog', () => {
  const editor = { kind: 'deviceProfile', profileId: 'p1', name: () => 'My Synth', canSave: () => true };
  const list = unsavedDocumentsFrom({
    panels: [
      { id: 1, name: 'Lead', modified: true, filePath: '/x/Lead.cepanel' },
      { id: 2, name: 'Fresh', modified: true, filePath: '' },
      { id: 3, name: 'Clean', modified: false, filePath: '/x/Clean.cepanel' },
    ],
    scripts: [
      { id: 's1', name: 'Lead · Scripts', panelId: '1', modified: true },          // with its panel: listed once
      { id: 's2', name: 'Clean · Scripts', panelId: '3', modified: true },         // its panel is clean: the panel saves it
      { id: 's3', name: 'Tools', panelId: '', modified: true, filePath: '/x/Tools.cescripts' },
    ],
    components: [{ id: 'c1', name: 'Knob', modified: true }],
    screens: [{ id: 'sc1', name: 'Filter page', modified: true, filePath: '' }],
    editors: [{ key: 'editor_1', entry: editor }],
  });
  assert.deepEqual(list.map((entry) => `${entry.kind}:${entry.name}:${entry.canSave}`), [
    'panel:Lead:true', 'panel:Fresh:false', 'panel:Clean:true', 'script:Tools:true',
    'component:Knob:false', 'screen:Filter page:false', 'deviceProfile:My Synth:true',
  ]);
  assert.match(list.find((entry) => entry.name === 'Fresh').note, /never saved/);
  assert.match(list.find((entry) => entry.kind === 'component').note, /Export/);
  assert.deepEqual(unsavedDocumentsFrom({}), [], 'nothing open, nothing to ask about');
});

// --- Quitting -----------------------------------------------------------------------------------------

test('quitting with nothing unsaved: the page says it is asking, then quit, and shows nothing', async () => {
  const { panels } = await import('../src/CE_Application/stores/panels.js');
  const { _handleQuitRequest, quitPrompt } = await import('../src/CE_Application/stores/quitGuard.js');
  panels.set([{ id: 41, name: 'Clean', modified: false, controls: [] }]);
  await withBridge(({ sent }) => {
    _handleQuitRequest();
    assert.deepEqual(answers(sent), ['asking', 'quit']);
    assert.equal(get(quitPrompt), null);
  });
  panels.set([]);
});

test('quitting with unsaved work: the window lists it; Cancel stays, and nothing quits', async () => {
  const { panels } = await import('../src/CE_Application/stores/panels.js');
  const { _handleQuitRequest, quitPrompt, stayOpen } = await import('../src/CE_Application/stores/quitGuard.js');
  panels.set([{ id: 42, name: 'Lead', modified: true, filePath: '/x/Lead.cepanel', controls: [] }]);
  await withBridge(({ sent }) => {
    _handleQuitRequest();
    assert.deepEqual(answers(sent), ['asking'], 'asking, and nothing more until the person answers');
    assert.deepEqual(get(quitPrompt).documents.map((entry) => entry.name), ['Lead']);
    _handleQuitRequest();
    assert.deepEqual(answers(sent), ['asking', 'asking'], 'the close button again only says it is still asking');
    stayOpen();
    assert.deepEqual(answers(sent), ['asking', 'asking', 'stay']);
    assert.equal(get(quitPrompt), null);
  });
  panels.set([]);
});

test('Save and quit saves what has a file, waits for the program to say so, then quits', async () => {
  const { panels } = await import('../src/CE_Application/stores/panels.js');
  const { _handleQuitRequest, quitPrompt, saveAndQuit } = await import('../src/CE_Application/stores/quitGuard.js');
  panels.set([{ id: 43, name: 'Lead', modified: true, filePath: '/x/Lead.cepanel', controls: [] }]);
  await withBridge(async ({ sent }) => {
    _handleQuitRequest();
    const done = saveAndQuit();
    const save = sent.find((event) => event.name === 'savePanel');
    assert.ok(save, 'the panel is saved to its file, with no dialog');
    assert.equal(save.payload.filePath, '/x/Lead.cepanel');
    await settle();
    assert.deepEqual(answers(sent), ['asking'], 'not quit before the program says the file was written');
    // As C++'s 'panelSaved' does, through applyPanelSavedPayload.
    panels.update((list) => list.map((panel) => ({ ...panel, modified: false })));
    assert.equal(await done, true);
    assert.deepEqual(answers(sent), ['asking', 'quit']);
    assert.equal(get(quitPrompt), null);
  });
  panels.set([]);
});

test('Save and quit leaves the window open on what it could not save, and says so', async () => {
  const { panels } = await import('../src/CE_Application/stores/panels.js');
  const { _handleQuitRequest, quitPrompt, saveAndQuit } = await import('../src/CE_Application/stores/quitGuard.js');
  panels.set([
    { id: 44, name: 'Saved', modified: true, filePath: '/x/Saved.cepanel', controls: [] },
    { id: 45, name: 'Untitled', modified: true, filePath: '', controls: [] },
  ]);
  await withBridge(async ({ sent }) => {
    _handleQuitRequest();
    const done = saveAndQuit();
    await settle();
    assert.equal(sent.filter((event) => event.name === 'savePanelAs').length, 0, 'no dialog is opened behind the window');
    panels.update((list) => list.map((panel) => (panel.id === 44 ? { ...panel, modified: false } : panel)));
    assert.equal(await done, false);
    assert.deepEqual(answers(sent), ['asking'], 'and it does not quit');
    assert.deepEqual(get(quitPrompt).documents.map((entry) => entry.name), ['Untitled']);
    assert.match(get(quitPrompt).note, /Saved 1\. This one still has unsaved changes/);
  });
  panels.set([]);
});

test('Quit without saving takes the recovery copy first, then quits', async () => {
  const { panels } = await import('../src/CE_Application/stores/panels.js');
  const { _handleQuitRequest, quitWithoutSaving } = await import('../src/CE_Application/stores/quitGuard.js');
  panels.set([{ id: 46, name: 'Lead', modified: true, filePath: '', controls: [] }]);
  await withBridge(async ({ sent }) => {
    _handleQuitRequest();
    await quitWithoutSaving();
    assert.deepEqual(answers(sent), ['asking', 'quit']);
  });
  panels.set([]);
});

// --- Device profiles ----------------------------------------------------------------------------------

test('a device profile tab asks before throwing its Designer\'s changes away', async () => {
  const { closeDeviceProfileTab, deviceProfileTabs } = await import('../src/CE_Application/stores/panels.js');
  const { registerUnsavedEditor } = await import('../src/CE_Application/stores/unsavedEditors.js');
  let dirty = true;
  const unregister = registerUnsavedEditor({ kind: 'deviceProfile', profileId: 'my-synth', name: () => 'My Synth', isDirty: () => dirty });
  deviceProfileTabs.set([{ id: 'my-synth', name: 'My Synth', modified: false }]);
  const previous = globalThis.window;
  const asked = [];
  let answer = false;
  globalThis.window = { ...(previous ?? {}), confirm: (message) => { asked.push(message); return answer; } };
  try {
    assert.equal(closeDeviceProfileTab('my-synth'), false, 'kept when the answer is no');
    assert.match(asked[0], /"My Synth" has unsaved changes/);
    assert.equal(get(deviceProfileTabs).length, 1);
    answer = true;
    assert.equal(closeDeviceProfileTab('my-synth'), true);
    assert.equal(get(deviceProfileTabs).length, 0);
    deviceProfileTabs.set([{ id: 'my-synth', name: 'My Synth', modified: false }]);
    dirty = false;
    asked.length = 0;
    assert.equal(closeDeviceProfileTab('my-synth'), true);
    assert.equal(asked.length, 0, 'nothing unsaved, nothing asked');
  } finally {
    globalThis.window = previous;
    unregister();
    deviceProfileTabs.set([]);
  }
});

test('a new device profile starts as one that can be saved: the standard controllers, its own id and name', () => {
  const model = newProfileModel(dpdLibrary, { id: 'new-device-profile', name: 'My Synth' });
  assert.equal(model.id, 'new-device-profile');
  assert.equal(model.label, 'My Synth');
  assert.equal(model.provenance.source, 'local');
  assert.notEqual(dpdLibrary['generic.cc'].label, model.label, 'the library\'s own model is not touched');
  // What Save to engine writes, checked by the engine's rules (the same rules the C++ engine
  // applies: at least one parameter, at least one message recipe).
  const legacy = buildLegacyProfile(resolveModel(structuredClone(model), dpdLibrary), { legacyId: 'new-device-profile', embedDpdModel: model });
  assert.equal(legacy.id, 'new-device-profile');
  assert.ok(legacy.parameters.length > 0, 'it has parameters from the start');
  const checked = validateLocalProfileSource('new-device-profile', JSON.stringify(legacy));
  assert.notEqual(checked.ok, false, JSON.stringify(checked.validation ?? checked.error ?? ''));
  assert.equal(newProfileModel({}, { id: 'x' }), null, 'without the base in the library, nothing');
});

// --- The CTRL49 Screen Builder ------------------------------------------------------------------------

test('a screen saves as the assignment the native bridge loads, and opens back the same', () => {
  const doc = {
    name: 'Filter page', deviceRole: 'mainSynth', profilePath: 'profiles/gaia.json',
    pages: [
      { title: 'FILTER', slots: [{ label: 'CUTOFF', param: 'filter.cutoff' }, { label: '', param: 'filter.resonance' }, ...Array.from({ length: 6 }, () => ({ label: '', param: '' }))] },
      { title: 'AMP', slots: Array.from({ length: 8 }, () => ({ label: '', param: '' })) },
    ],
  };
  const text = screenDocumentText(doc);
  assert.deepEqual(JSON.parse(text), exportAssignment(doc), 'the file is the assignment, nothing else');
  const back = screenDocumentFromAssignment(text);
  assert.equal(back.name, 'Filter page');
  assert.equal(back.profilePath, 'profiles/gaia.json');
  assert.deepEqual(back.pages, doc.pages, 'a label the export filled in from the parameter comes back empty');
  assert.equal(screenDocumentFromAssignment('{"pages":[{"title":"X","slots":[]}]}').pages[0].slots.length, 8, 'every page has its eight encoders');
  assert.equal(screenDocumentFromAssignment('not json'), null);
  assert.equal(screenDocumentFromAssignment('{"name":"no pages"}'), null);
});

test('a screen\'s file is named after it, and named it back', () => {
  assert.equal(typedDocumentFileName('ctrl49Screen', 'Filter: page/1'), 'Filter page 1.assignment.json');
  assert.equal(typedDocumentFileName('ctrl49Screen', ''), 'Untitled.assignment.json');
  assert.equal(typedDocumentNameFromFile('ctrl49Screen', 'C:\\Screens\\Lead.assignment.json'), 'Lead');
  assert.equal(typedDocumentNameFromFile('ctrl49Screen', 'Lead.json'), 'Lead');
});

test('Save on a screen writes its file through the app, and marks it saved when the app says so', async () => {
  const { createScreenDocument, saveScreenDocument, screenDocuments, setScreenPageTitle } = await import('../src/CE_Application/stores/screenBuilder.js');
  await withBridge(async ({ sent, fire }) => {
    const doc = createScreenDocument({ name: 'Lead' });
    setScreenPageTitle(doc.id, 0, 'LEAD');
    const first = saveScreenDocument(doc.id);
    await settle();
    const asked = sent.find((event) => event.name === 'saveTypedDocumentAs');
    assert.ok(asked, 'a screen never saved goes through the save dialog');
    assert.equal(asked.payload.kind, 'ctrl49Screen');
    assert.equal(asked.payload.suggestedName, 'Lead.assignment.json');
    assert.equal(JSON.parse(asked.payload.data).pages[0].title, 'LEAD');
    fire('typedDocumentResult', { requestId: asked.payload.requestId, ok: true, filePath: '/s/Lead live.assignment.json', name: 'Lead live.assignment.json' });
    assert.equal(await first, true);
    let saved = get(screenDocuments).find((entry) => entry.id === doc.id);
    assert.equal(saved.modified, false);
    assert.equal(saved.filePath, '/s/Lead live.assignment.json');
    assert.equal(saved.name, 'Lead live', 'named after the file it was saved as');

    setScreenPageTitle(doc.id, 0, 'LEAD 2');
    const second = saveScreenDocument(doc.id);
    await settle();
    const again = sent.filter((event) => event.name === 'saveTypedDocument').at(-1);
    assert.equal(again.payload.filePath, '/s/Lead live.assignment.json', 'then Save goes straight to that file');
    fire('typedDocumentResult', { requestId: again.payload.requestId, ok: false, filePath: again.payload.filePath });
    assert.equal(await second, false);
    saved = get(screenDocuments).find((entry) => entry.id === doc.id);
    assert.equal(saved.modified, true, 'a write that failed leaves the screen unsaved');
  });
  screenDocuments.set([]);
});
