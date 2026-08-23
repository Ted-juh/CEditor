// panelSharingActions.test.js — the commands, as distinct from the format and the assets.
//
// The format (`utils/panelPackage.js`) and the asset binding (`stores/panelSharing.js`) each have
// their own file. What is left here is the part a user actually invokes: what gets packaged, what
// deliberately does NOT, and whether an opened package lands in a tab in a state where Save does
// the right thing.
//
// The two dialogs are not exercised — they are a JUCE FileChooser and a path coming back. What is
// exercised is everything on either side of them, which is where the mistakes are.

import test from 'node:test';
import assert from 'node:assert/strict';

import { fileCache } from '../src/CE_Application/stores/fileCache.js';
import { activePanel, addPanel, panels } from '../src/CE_Application/stores/panels.js';
import { createPanel } from '../src/CE_Application/stores/panelModel.js';
import { openPackageText, sharePanelToFile } from '../src/CE_Application/stores/panelSharingActions.js';
import { packagePanelForSharing, panelPackageFile } from '../src/CE_Application/stores/panelSharing.js';
import { get } from 'svelte/store';

function panelOnScreen({ filePath = null, bg = '' } = {}) {
  const panel = createPanel('Shareable');
  panel.filePath = filePath;
  panel.bgImage = bg;
  panel.deviceSession = { boundPorts: ['Roland GAIA 2'] };
  return panel;
}

test.beforeEach(() => {
  panels.set([]);
  fileCache.set({});
});

test("sharing an unsaved panel with no backend says so rather than failing silently", async () => {
  // No JUCE here, so the dialog never happens — but everything before it does, and a caller that
  // got no answer at all could not tell a refusal from a hang.
  addPanel(panelOnScreen());
  const result = await sharePanelToFile();
  assert.equal(result.ok, true);
  assert.equal(result.assetCount, 0);
});

test('sharing with no panel open is refused, not crashed', async () => {
  panels.set([]);
  const result = await sharePanelToFile();
  assert.equal(result.ok, false);
});

test("the author's file path never leaves the machine in a package", async () => {
  // C:/Users/<name>/... is the author's name and folder layout, in a file they are sending to a
  // stranger. It is also meaningless there, and deserializePanel takes the path from the caller.
  addPanel(panelOnScreen({ filePath: 'C:/Users/ted/Documents/secret-project/gaia.cepanel' }));
  const result = await sharePanelToFile();
  const json = JSON.stringify(result.envelope);
  assert.ok(!json.includes('C:/Users/ted'), 'the packaged document still carries the author path');
  assert.equal(result.envelope.panel.filePath, undefined);
});

test('bound MIDI ports are not shipped either — they name hardware the recipient has not got', async () => {
  addPanel(panelOnScreen());
  const result = await sharePanelToFile();
  assert.equal(result.envelope.panel.deviceSession, undefined);
  assert.ok(!JSON.stringify(result.envelope).includes('Roland GAIA 2'));
});

test('what is packaged is a .cepanel document, so opening one is the ordinary open path', async () => {
  addPanel(panelOnScreen());
  const { envelope } = await sharePanelToFile();
  assert.ok(Array.isArray(envelope.panel.controls), 'a package should carry a panel document');
  assert.ok(Array.isArray(envelope.panel.exportParameters),
    'and the document form, which is the one Save writes — export parameters included');
});

test('opening a package lands a panel in a tab with no file path', async () => {
  // The state that matters: it came out of somebody else's package, so Save must ask where to put
  // it rather than writing a .cepanel next to a file the user did not create.
  addPanel(panelOnScreen({ bg: '' }));
  const { envelope } = await sharePanelToFile();
  panels.set([]);

  const opened = await openPackageText(JSON.stringify(envelope));
  assert.ok(opened, 'the package should open');
  assert.equal(opened.filePath, null, 'an opened package is unsaved until the user saves it');
  assert.equal(get(panels).length, 1);
  assert.equal(get(activePanel).id, opened.id, 'and it should be the panel in front of them');
});

test('the name a package carries is the name the tab gets', async () => {
  addPanel(panelOnScreen());
  const { envelope } = await sharePanelToFile({ name: 'GAIA Performance' });
  panels.set([]);
  const opened = await openPackageText(JSON.stringify(envelope));
  assert.equal(opened.name, 'GAIA Performance');
});

test('a file that is not JSON is refused without opening a tab', async () => {
  const opened = await openPackageText('this is not a package');
  assert.equal(opened, null);
  assert.equal(get(panels).length, 0);
});

test('a package from a newer build is refused without opening a tab', async () => {
  addPanel(panelOnScreen());
  const { envelope } = await sharePanelToFile();
  panels.set([]);
  envelope.formatVersion = 99;
  assert.equal(await openPackageText(JSON.stringify(envelope)), null);
  assert.equal(get(panels).length, 0);
});

test('an image on the panel travels, and comes back inline', async () => {
  // The whole point of the format, driven end to end through the commands rather than the format.
  fileCache.set({ 'C:/pics/bg.png': 'data:image/png;base64,Ymc=' });
  addPanel(panelOnScreen({ bg: 'C:/pics/bg.png' }));

  const { envelope, assetCount } = await sharePanelToFile();
  assert.equal(assetCount, 1);
  panels.set([]);

  const opened = await openPackageText(JSON.stringify(envelope));
  assert.equal(opened.bgImage, 'data:image/png;base64,Ymc=');
  assert.ok(!opened.bgImage.includes('C:/'), 'the recipient must not be pointed at the author disk');
});

test('the saved file name comes from the package, not the tab', async () => {
  const { envelope } = await packagePanelForSharing({ name: 'x', controls: [] }, { name: 'Shared: One' });
  assert.equal(panelPackageFile(envelope).fileName, 'Shared_ One.cepanelpkg');
});
