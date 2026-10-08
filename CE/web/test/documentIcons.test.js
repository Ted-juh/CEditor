// documentIcons.test.js — library icons travel with the panel (utils/documentIcons.js).
//
// A control refers to an icon in the author's icon library; the exported player and anyone the panel
// is shared with have no such library. Packaging carries the pictures as `panel.icons`, and opening a
// panel makes them answer after the library, for the renderer, the icon pickers and ce.image.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import {
  documentIcons, embedPanelIcons, panelIconReferences, resolveIcon, setDocumentIcons, withEmbeddedIcons,
} from '../src/CE_Application/utils/documentIcons.js';
import { assetCatalogue, findAsset } from '../src/CE_Application/utils/imageLayers.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { deserializePanel, serializePanel } from '../src/CE_Application/stores/panelModel.js';
import { validatePanelDocument } from '../src/CE_Application/utils/panelFormat.js';

const svg = (tag) => `data:image/svg+xml;base64,${Buffer.from(`<svg id="${tag}"/>`).toString('base64')}`;
const library = [
  { id: 'gicon_play', name: 'play_arrow', enabled: true, sourceType: 'google', mimeType: 'image/svg+xml', dataUrl: svg('play'), isVector: true, width: 24, height: 24, filePath: '' },
  { id: 'gicon_pause', name: 'pause', enabled: true, sourceType: 'google', mimeType: 'image/svg+xml', dataUrl: svg('pause'), isVector: true, width: 24, height: 24, filePath: '' },
  { id: 'icon_logo', name: 'Logo', enabled: true, sourceType: 'local', mimeType: 'image/png', dataUrl: 'data:image/png;base64,iVBORw0KGgo=', isVector: false, width: 64, height: 32, filePath: 'C:/art/logo.png' },
  { id: 'icon_off', name: 'Switched off', enabled: false, sourceType: 'local', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AAAA', filePath: '' },
  { id: 'icon_unused', name: 'Unused', enabled: true, sourceType: 'local', mimeType: 'image/png', dataUrl: 'data:image/png;base64,BBBB', filePath: '' },
];

function button(icon = {}, extra = {}) {
  const control = createControl('ToggleButton');
  Object.assign(control._children.Icon, icon);
  Object.assign(control._children, extra);
  return control;
}
const panelWith = (...controls) => ({ id: 1, name: 'P', controls });

test('the references a panel holds: Icon sections and Icon state patches, but not a switched-off icon', () => {
  const stated = button({}, { States: { _type: 'States', _children: { checked: {
    patches: {
      component: { 'Icon.assetId': 'gicon_pause', 'Icon.name': 'pause' },
      parts: { cap: { 'Icon.name': 'Logo' } },
    },
  } } } });
  const refs = panelIconReferences(panelWith(
    button({ assetId: 'gicon_play', name: 'play_arrow' }),
    button({ source: 'none', assetId: 'icon_logo', name: 'Logo' }),
    button(),
    stated,
  ));
  assert.deepEqual(refs, [
    { assetId: 'gicon_play', name: 'play_arrow' },
    { assetId: 'gicon_pause', name: 'pause' },
    { assetId: '', name: 'Logo' },
  ]);
});

test('an icon resolves as the renderer resolves it: library by id, carried by id, then by name', () => {
  const carried = [{ id: 'gicon_play', name: 'play_arrow', dataUrl: svg('theirs') },
    { id: 'shared_only', name: 'Logo', dataUrl: svg('shared') }];
  assert.equal(resolveIcon({ assetId: 'gicon_play' }, library, carried).dataUrl, svg('play'), 'the library has the very icon');
  assert.equal(resolveIcon({ assetId: 'shared_only', name: 'Logo' }, library, carried).dataUrl, svg('shared'),
    'an exact id among the carried icons wins over a library icon that merely shares the name');
  assert.equal(resolveIcon({ assetId: 'gone', name: 'Logo' }, library, carried).id, 'icon_logo', 'then the name, library first');
  assert.equal(resolveIcon({ assetId: 'icon_off', name: 'Switched off' }, library, carried), null, 'a switched-off icon is not drawn');
  assert.equal(resolveIcon({ assetId: '', name: '' }, library, carried), null);
});

test('a panel carries the icons it shows, and only those', () => {
  const panel = panelWith(
    button({ assetId: 'gicon_play', name: 'play_arrow' }),
    button({ assetId: 'deleted_long_ago', name: 'Logo' }),
    button({ assetId: 'icon_off', name: 'Switched off' }),
    button({ assetId: 'never_existed', name: 'nothing by this name' }),
  );
  const icons = embedPanelIcons(panel, library);
  assert.deepEqual(icons.map((icon) => icon.id), ['gicon_play', 'icon_logo'],
    'by id, and by name where the id misses; a switched-off or dangling reference carries nothing');
  assert.deepEqual(icons[0], {
    id: 'gicon_play', name: 'play_arrow', dataUrl: svg('play'), mimeType: 'image/svg+xml', isVector: true, width: 24, height: 24,
  }, 'the picture and what the renderer needs, not the library\'s file path or source');
  assert.deepEqual(embedPanelIcons(panelWith(button()), library), [], 'a panel without icons carries none');
});

test('an icon only a script reaches is carried when the script names it in quotes', () => {
  const lua = button({ assetId: 'gicon_play', name: 'play_arrow' }, { Scripts: { _type: 'Scripts', scripts: [
    { language: 'lua', source: 'on("Play", "click", function() ce.image.icon("Play", "PAUSE") end)' },
  ] } });
  const viaGraph = { ...panelWith(button()), scripts: [{ language: 'visual', graph: { nodes: [{ op: 'imageIcon', args: ['Play', 'icon_logo'] }] } }] };
  assert.deepEqual(embedPanelIcons(panelWith(lua), library).map((icon) => icon.id), ['gicon_play', 'gicon_pause'],
    'ce.image.icon finds a name in any case, so the scan does too');
  assert.deepEqual(embedPanelIcons(viaGraph, library).map((icon) => icon.id), ['icon_logo'], 'a visual script\'s argument');
  const prose = { ...panelWith(button()), scripts: [{ language: 'javascript', source: '// pause here, then press play_arrow' }] };
  assert.deepEqual(embedPanelIcons(prose, library), [], 'a word in a comment is not a name in quotes');
});

test('a panel that arrived carrying icons passes them on, and drops the ones it no longer uses', () => {
  const theirs = { id: 'their_knob', name: 'Their knob', dataUrl: svg('knob'), mimeType: 'image/svg+xml', isVector: true };
  const original = { ...panelWith(button({ assetId: 'their_knob', name: 'Their knob' })), icons: [theirs] };
  const passed = withEmbeddedIcons(original, library);
  assert.deepEqual(passed.icons, [theirs]);
  assert.notEqual(passed, original);
  assert.deepEqual(original.icons, [theirs], 'the panel handed in is not changed');
  assert.equal(withEmbeddedIcons({ ...panelWith(button()), icons: [theirs] }, library).icons, undefined,
    'no icon key at all when nothing is carried');
});

test('a panel document keeps its icons through the schema, opening and saving', () => {
  const panel = withEmbeddedIcons(panelWith(button({ assetId: 'gicon_play', name: 'play_arrow' })), library);
  const text = serializePanel(panel);
  assert.equal(validatePanelDocument(JSON.parse(text)).ok, true);
  const opened = deserializePanel(text, null, 'P');
  assert.deepEqual(opened.icons, panel.icons);
  assert.deepEqual(JSON.parse(serializePanel(opened)).icons, panel.icons, 'saved again, still there');

  const bad = validatePanelDocument({ ...JSON.parse(text), icons: [{ id: 'x', name: 'x', dataUrl: 'C:/art/x.png' }] });
  assert.equal(bad.ok, false, 'a carried icon is a picture, not a path on somebody\'s disk');
  assert.match(bad.errors.join('\n'), /icons/);
});

test('carried icons answer for the pickers and for ce.image, after the library', async () => {
  const { appSettings, availableIcons } = await import('../src/CE_Application/stores/appSettings.js');
  const before = get(appSettings).icons;
  appSettings.update((current) => ({ ...current, icons: [library[0]] }));
  setDocumentIcons([
    { id: 'gicon_play', name: 'play_arrow', dataUrl: svg('older copy') },
    { id: 'their_knob', name: 'Their knob', dataUrl: svg('knob') },
    { id: 'their_knob', name: 'Their knob', dataUrl: svg('second open copy') },
    { id: 'not valid', name: 'x', dataUrl: 'C:/x.png' },
  ]);
  assert.deepEqual(get(documentIcons).map((icon) => icon.id), ['gicon_play', 'their_knob'], 'one per id, valid only');
  assert.deepEqual(get(availableIcons).map((option) => [option.value, option.label]), [
    ['gicon_play', 'play_arrow'],
    ['their_knob', 'Their knob (carried by the panel)'],
  ]);

  const catalogue = assetCatalogue(get(appSettings).icons, get(documentIcons));
  assert.deepEqual(catalogue.map((a) => [a.id, a.source, a.portable]), [
    ['gicon_play', 'google', false],
    ['their_knob', 'panel', true],
  ]);
  assert.equal(findAsset(catalogue, 'their knob').id, 'their_knob');

  setDocumentIcons([]);
  appSettings.update((current) => ({ ...current, icons: before }));
});

test('sharing a panel packs its icons, and opening the package keeps them', async () => {
  const { appSettings } = await import('../src/CE_Application/stores/appSettings.js');
  const { packagePanelForSharing, openSharedPanel } = await import('../src/CE_Application/stores/panelSharing.js');
  const before = get(appSettings).icons;
  appSettings.update((current) => ({ ...current, icons: library }));
  // What Share Panel hands over: the saved form, where a section has no `_type` and is known only by
  // the key it sits under.
  const scripted = button({ assetId: 'gicon_play', name: 'play_arrow' }, { Scripts: { _type: 'Scripts', scripts: [
    { language: 'javascript', source: 'on("Play", "click", () => ce.image.icon("Play", "pause"))' },
  ] } });
  const doc = JSON.parse(serializePanel(panelWith(scripted)));
  assert.equal(doc.controls[0]._children.Icon._type, undefined, 'the case this covers');
  const packed = await packagePanelForSharing(doc);
  assert.equal(packed.ok, true, JSON.stringify(packed.issues));
  assert.equal(packed.iconCount, 2);
  assert.deepEqual(packed.missing, []);
  appSettings.update((current) => ({ ...current, icons: [] }));
  const opened = await openSharedPanel(packed.envelope);
  assert.equal(opened.ok, true);
  assert.deepEqual(opened.panel.icons.map((icon) => [icon.id, icon.dataUrl]), [['gicon_play', svg('play')], ['gicon_pause', svg('pause')]],
    'the recipient has an empty library and still has the picture');
  appSettings.update((current) => ({ ...current, icons: before }));
});

test('an exported panel carries its icons to the player', async () => {
  const { appSettings } = await import('../src/CE_Application/stores/appSettings.js');
  const { preparePanelForExport } = await import('../src/CE_Application/stores/panelExportPreparation.js');
  const before = get(appSettings).icons;
  appSettings.update((current) => ({ ...current, icons: library }));
  const source = JSON.stringify({ panelGuid: 'icons-export', name: 'Icons', controls: [
    button({ assetId: 'gicon_play', name: 'play_arrow' }),
    button({ assetId: 'deleted_long_ago', name: 'gone' }),
  ] });
  const prepared = JSON.parse(await preparePanelForExport(source));
  assert.deepEqual(prepared.icons.map((icon) => icon.id), ['gicon_play'],
    'and a dangling reference does not stop the export');
  appSettings.update((current) => ({ ...current, icons: before }));
});
