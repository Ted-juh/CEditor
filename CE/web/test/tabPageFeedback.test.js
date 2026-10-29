// tabPageFeedback.test.js — a Tabbed Container bound to a parameter follows the synth, as well as
// telling it.
//
// `pageIndex` was a bindable port in one direction only. A click on the strip wrote the page and
// sent the container's bindings; a value arriving for the same parameter found no case for the
// port and was dropped, in the editor and in the exported player alike. So a panel whose pages are
// the synth's parts (the SH-201's UPPER and LOWER, bound to Keyboard Part) showed the part it had
// last asked for, not the one the synth was on, and a footswitch could not turn a page.

import test from 'node:test';
import assert from 'node:assert/strict';
import { render } from 'svelte/server';
import { get } from 'svelte/store';

import PanelPreviewSurface from '../src/CE_Application/editor/PanelPreviewSurface.svelte';
import { panels, activePanelId, activeEditorTab } from '../src/CE_Application/stores/panels.js';
import { panelPreviewSessions, createInteractionPreviewSession, setPreviewModeEnabled } from '../src/CE_Application/stores/interactionPreview.js';
import { syncDeviceParameterToPanelPreview } from '../src/CE_Application/utils/deviceBindingSync.js';
import { pageIndexForValue } from '../src/CE_Application/utils/tabContainerLayout.js';
import { incomingFeedbackPatch } from '../src/CE_Application/utils/incomingFeedback.js';

const label = (id, text, page) => ({ _children: {
  Core: { id, name: id, controlType: 'Label', tabPageId: page },
  Transform: { x: 10, y: 40, width: 120, height: 20 },
  Text: { content: text },
} });

function tones(binding = { kind: 'deviceParameter', port: 'pageIndex', deviceRole: 'synth', parameterId: 'patch.keyboardPart' }) {
  return { _children: {
    Core: { id: 'tones', name: 'Tones', controlType: 'TabContainer' },
    Transform: { x: 0, y: 0, width: 400, height: 200 },
    TabContainer: { pageIndex: 0, pages: [{ id: 'upper', label: 'UPPER' }, { id: 'lower', label: 'LOWER' }] },
    DeviceBindings: { bindings: [binding] },
    Children: { _children: { u: label('u', 'UPPER_PAGE_MARK', 'upper'), l: label('l', 'LOWER_PAGE_MARK', 'lower') } },
  } };
}

function show(control) {
  // Preview, where the panel is played rather than edited and session values are what is drawn.
  setPreviewModeEnabled(true);
  const panel = { id: 'tabs', width: 400, height: 200, controls: [control], layers: [] };
  panels.set([panel]);
  activePanelId.set(panel.id);
  activeEditorTab.set({ type: 'panel', id: panel.id });
  return panel;
}

test('a page is named by its id or label, else by its number; anything else names none', () => {
  const control = tones();
  assert.equal(pageIndexForValue(control, 'lower'), 1);
  assert.equal(pageIndexForValue(control, 'UPPER'), 0);
  assert.equal(pageIndexForValue(control, 1), 1);
  assert.equal(pageIndexForValue(control, '1'), 1);
  assert.equal(pageIndexForValue(control, 7), 1, 'clamped to the last page');
  assert.equal(pageIndexForValue(control, true), 1);
  assert.equal(pageIndexForValue(control, 'dual'), null);
  const modes = { _children: { TabContainer: { pages: [{ id: 'p0', label: 'POLY' }, { id: 'p1', label: 'SOLO+LEGATO' }] } } };
  assert.equal(pageIndexForValue(modes, 'solo-legato'), 1, 'a choice id finds the page labelled as the synth labels it');
  assert.equal(pageIndexForValue(control, ''), null);
  assert.equal(pageIndexForValue(control, null), null);
});

test('the synth saying "lower" turns the page, and the Lower controls are what is drawn', () => {
  const control = tones();
  const panel = show(control);
  panelPreviewSessions.set({ tones: { ...createInteractionPreviewSession(control), sectionValues: { Background: { kept: true } } } });

  const before = render(PanelPreviewSurface, { props: { panel, scale: 1, bgLayers: {}, gridStyle: '' } }).body;
  assert.ok(before.includes('UPPER_PAGE_MARK') && !before.includes('LOWER_PAGE_MARK'), 'opens on Upper');

  syncDeviceParameterToPanelPreview('synth', 'patch.keyboardPart', 'lower');
  const session = get(panelPreviewSessions).tones;
  assert.equal(session.sectionValues.TabContainer.pageIndex, 1);
  assert.deepEqual(session.sectionValues.Background, { kept: true }, 'the container\'s other live sections stay');
  const after = render(PanelPreviewSurface, { props: { panel, scale: 1, bgLayers: {}, gridStyle: '' } }).body;
  assert.ok(after.includes('LOWER_PAGE_MARK') && !after.includes('UPPER_PAGE_MARK'), 'shows Lower');

  syncDeviceParameterToPanelPreview('synth', 'patch.keyboardPart', 'dual');
  assert.equal(get(panelPreviewSessions).tones.sectionValues.TabContainer.pageIndex, 1, 'a value naming no page changes nothing');
});

test('the exported player turns the page by the wire value it decodes', () => {
  const control = tones();
  const session = { sectionValues: { Background: { kept: true } } };
  assert.deepEqual(incomingFeedbackPatch('pageIndex', 1, { control, session }),
    { sectionValues: { Background: { kept: true }, TabContainer: { pageIndex: 1 } } });
  assert.equal(incomingFeedbackPatch('pageIndex', 'dual', { control, session }), null);
  // The ports it already had are as they were.
  assert.deepEqual(incomingFeedbackPatch('value', 64, {}), { valueOverrideEnabled: true, valueOverride: 64 });
  assert.deepEqual(incomingFeedbackPatch('text', 'Patch A', {}), { textOverride: 'Patch A' });
  assert.deepEqual(incomingFeedbackPatch('backlight', 100, {}), { backlightOverride: true });
  assert.deepEqual(incomingFeedbackPatch('brightness', 127, {}), { brightnessOverride: 100 });
});
