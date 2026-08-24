// autoPanelActions.test.js — the command, as distinct from the generator.
//
// `utils/autoPanel.js` is pure and tested on its own. What is left here is the part that made this
// a command rather than a function call: `deviceProfiles` is a LIST — id, name, path — and does not
// carry the parameters. Those live in the profile's source text, which the engine sends on request.
// So generating from a profile the user has never opened means asking, and then waiting for an
// event that may not come.
//
// Every other reader of `profileSources` in the app is reactive and can return null and re-run when
// the source lands. A menu command has one shot, and the failure it has to avoid is hanging.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { get } from 'svelte/store';

import { deviceProfiles, profileSources } from '../src/CE_Application/stores/deviceProfileStores.js';
import { activePanel, panels } from '../src/CE_Application/stores/panels.js';
import { generatePanelFromProfile, profileById } from '../src/CE_Application/stores/autoPanelActions.js';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const SOURCE = readFileSync(join(REPO, 'CE/profiles/test/roland-gaia-dpd.ceditor-device.json'), 'utf8');
const PROFILE = JSON.parse(SOURCE);

test.beforeEach(() => {
  panels.set([]);
  profileSources.set({});
  deviceProfiles.set([{ id: PROFILE.id, name: PROFILE.name }]);
});

test('a profile already in the store is used without asking for it again', async () => {
  profileSources.set({ [PROFILE.id]: { source: SOURCE } });
  const profile = await profileById(PROFILE.id);
  assert.equal(profile.id, PROFILE.id);
  assert.equal(profile.parameters.length, PROFILE.parameters.length);
});

test('a profile whose source arrives late is still generated from', async () => {
  // The reason this is a promise at all: the source is not there when the menu item is clicked.
  const pending = profileById(PROFILE.id);
  setTimeout(() => profileSources.set({ [PROFILE.id]: { source: SOURCE } }), 10);
  const profile = await pending;
  assert.equal(profile.id, PROFILE.id);
});

test('a source that never arrives resolves null rather than hanging the menu', async () => {
  // With no JUCE backend the request goes nowhere, so this is the real no-engine path. It must
  // return, and the caller must be able to say why.
  assert.equal(await profileById(''), null);
});

test('generating puts a bound panel in front of the user', async () => {
  profileSources.set({ [PROFILE.id]: { source: SOURCE } });
  const panel = await generatePanelFromProfile(PROFILE.id);

  assert.ok(panel, 'no panel was created');
  assert.equal(get(panels).length, 1);
  assert.equal(get(activePanel).id, panel.id, 'a generated panel should be the one in front of you');
  assert.match(panel.name, /generated/i);
  assert.equal(panel.filePath, null, 'it is unsaved until the user saves it');
  assert.equal(panel.requiredProfiles[0].profileId, PROFILE.id);
});

test('the generated panel carries one bound control per parameter', async () => {
  profileSources.set({ [PROFILE.id]: { source: SOURCE } });
  const panel = await generatePanelFromProfile(PROFILE.id);
  const bound = panel.controls.filter((c) => c._children.DeviceBindings?.bindings?.length);
  assert.equal(bound.length, PROFILE.parameters.length);
});

test('a profile with no parameters is refused, not turned into an empty panel', async () => {
  // An empty panel named after a device is worse than an error: it looks like the profile is
  // broken in some subtle way rather than simply having nothing in it yet.
  profileSources.set({ empty: { source: JSON.stringify({ id: 'empty', name: 'Empty', parameters: [] }) } });
  deviceProfiles.set([{ id: 'empty', name: 'Empty' }]);
  assert.equal(await generatePanelFromProfile('empty'), null);
  assert.equal(get(panels).length, 0);
});

test('an unreadable profile source is refused without opening a tab', async () => {
  profileSources.set({ [PROFILE.id]: { source: 'not json' } });
  assert.equal(await generatePanelFromProfile(PROFILE.id), null);
  assert.equal(get(panels).length, 0);
});

test('options reach the generator', async () => {
  profileSources.set({ [PROFILE.id]: { source: SOURCE } });
  const group = PROFILE.parameters[0].group;
  const panel = await generatePanelFromProfile(PROFILE.id, { groups: [group] });
  const expected = PROFILE.parameters.filter((p) => p.group === group).length;
  const bound = panel.controls.filter((c) => c._children.DeviceBindings?.bindings?.length);
  assert.equal(bound.length, expected);
});
