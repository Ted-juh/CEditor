// Settings › Control Sets, the owner's bug list:
//   - the Settings tab went back to General whenever it was reopened from its tab;
//   - the Library opened on the default for new panels (Graphite), not on the panel's set;
//   - on a built-in set the colours, material and family pickers were disabled, so they did nothing;
//   - the preview of one of your own sets drew stock Graphite Classic controls pinned to Graphite
//     Classic, so a family mixed in (or a colour) never showed;
//   - colours were the system colour popup.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { readFileSync } from 'node:fs';
import { openSettingsTab, settingsSection } from '../src/CE_Application/stores/panels.js';
import { createControlSetStarter } from '../src/CE_Application/models/controlSetStarter.js';
import { getControlSet } from '../src/CE_Application/models/controlSets.js';

const settings = () => readFileSync(new URL('../src/CE_Application/settings/ControlSetsSettings.svelte', import.meta.url), 'utf8');

test('reopening Settings keeps the section it was on; naming one still goes there', () => {
  openSettingsTab('controlSets');
  openSettingsTab();
  assert.equal(get(settingsSection), 'controlSets');
  openSettingsTab('fonts');
  assert.equal(get(settingsSection), 'fonts');
});

test('the preview draws the set being edited, its controls pinned to it', () => {
  const own = { ...getControlSet('graphite-studio'), id: 'my-set', name: 'My Set' };
  const sample = createControlSetStarter('graphite-studio', { set: own });
  const pins = new Set(sample.controls.map((control) => control._children.Core.controlSetId));
  assert.deepEqual([...pins], ['my-set']);
  const source = settings();
  assert.match(source, /createControlSetStarter\(layoutId, \{ set \}\)/);
});

test('the Library opens on the panel\'s set; built-ins are editable through a copy; colours are typed', () => {
  const source = settings();
  // The panel `activePanelId` names: `activePanel` is empty while the Settings tab is in front.
  assert.match(source, /let targetPanel = \$derived\(\$panels\.find\(\(entry\) => entry\.id === \$activePanelId\)/);
  assert.match(source, /let selectedId = \$state\(untrack\(\(\) => panelSetId \|\| \$generalSettings\.defaultControlSetId/);
  assert.doesNotMatch(source, /\$activePanel\?/);
  assert.doesNotMatch(source, /disabled=\{!isCustom\}/, 'nothing greyed out on a built-in');
  assert.match(source, /const copy = duplicateControlSet\(next, `\$\{builtInName\} \(mine\)`\);/);
  assert.doesNotMatch(source, /type="color"/, 'no colour popup');
});
