// documentFonts.test.js — imported fonts travel with the panel (utils/documentFonts.js).
//
// A panel names a font the author imported in Settings; the exported player and anyone the panel is
// shared with have no such Settings. Packaging carries the faces as `panel.fonts`, and opening a panel
// registers them, for CSS and for text turned into outlines.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { embedPanelFonts, panelFontNames, registerDocumentFonts, withEmbeddedFonts } from '../src/CE_Application/utils/documentFonts.js';
import { FontUnavailableError, clearFontCache, resolveFont, setDocumentFonts, setFontSources } from '../src/CE_Application/utils/fontSources.js';
import { textOutline } from '../src/CE_Application/utils/textOutline.js';

const bytes = readFileSync(new URL('../src/assets/fonts/liberation-sans-regular.woff2', import.meta.url));
const dataUrl = `data:font/woff2;base64,${bytes.toString('base64')}`;
const label = (family, extra = {}) => ({ _children: { Core: { id: `l${Math.random()}` }, Text: { content: 'Hello', _children: { Font: { family, size: 20, ...extra } } } } });
const panelWith = (...controls) => ({ id: 1, name: 'P', controls });

const stored = [
  { id: 'a', family: 'Imported Sans', cssFamily: 'cefont-a', enabled: true, localDataUrl: dataUrl, fontStyle: 'normal', staticWeight: 400 },
  { id: 'b', family: 'Web Face', cssFamily: 'cefont-b', enabled: true, sourceType: 'google', cachedFaces: [
    { weight: '400', style: 'normal', unicodeRange: 'U+0000-00FF', dataUrl },
    { weight: '700', style: 'italic', dataUrl },
  ] },
  { id: 'c', family: 'On Disk', cssFamily: 'cefont-c', enabled: true, filePath: 'C:/fonts/ondisk.ttf', staticWeight: null, weightAxis: { min: 100, default: 400, max: 900 } },
  { id: 'd', family: 'Unreadable', cssFamily: 'cefont-d', enabled: true, filePath: 'C:/fonts/gone.ttf' },
];

test('the names a panel asks for: text, parts, state patches, CSS stacks', () => {
  const part = { _children: { Parts: { _children: { cap: { _children: { Text: { _children: { Font: { family: 'Web Face' } } } } } } } } };
  const stated = { _children: { States: { _children: { hover: { patches: { component: { 'Text.Font.family': 'cefont-c' } } } } } } };
  const names = panelFontNames(panelWith(label("'Imported Sans', sans-serif"), part, stated));
  assert.deepEqual(names.sort(), ['Imported Sans', 'Web Face', 'cefont-c'].sort());
});

test('only imported faces are carried, under the name the document uses', async () => {
  const panel = panelWith(label('Imported Sans'), label('Web Face'), label('cefont-c'), label('Unreadable'), label('Rubik'), label('Arial'));
  const reads = [];
  const { fonts, missing } = await embedPanelFonts(panel, stored, async (path) => { reads.push(path); return path.includes('ondisk') ? dataUrl : null; }, { subset: false });
  assert.deepEqual(fonts.map((face) => [face.family, face.weight, face.style, face.unicodeRange ?? '']), [
    ['Imported Sans', '400', 'normal', ''],
    ['Web Face', '400', 'normal', 'U+0000-00FF'],
    ['Web Face', '700', 'italic', ''],
    ['cefont-c', '100 900', 'normal', ''],
  ], 'a Google font brings every cached face; a variable file its weight range; bundled and system fonts nothing');
  assert.ok(fonts.every((face) => face.data === dataUrl));
  assert.deepEqual(reads.sort(), ['C:/fonts/gone.ttf', 'C:/fonts/ondisk.ttf']);
  assert.deepEqual(missing, ['Unreadable'], 'an imported font whose file cannot be read is reported, like an image');

  const unused = await embedPanelFonts(panelWith(label('Rubik')), stored, undefined, { subset: false });
  assert.deepEqual(unused.fonts, [], 'a panel that uses no imported font carries none');
});

test('a font only a script uses is carried when the script names it in quotes', async () => {
  const scripted = (source) => ({ ...panelWith(label('Rubik')), scripts: [{ language: 'javascript', source }] });
  const styled = await embedPanelFonts(scripted('ce.text.style("L", { family: "imported sans" })'), stored, undefined, { subset: false });
  assert.deepEqual(styled.fonts.map((face) => face.family), ['Imported Sans'],
    'by the family the user sees, in any case, under the name the library gives it');
  const lua = { ...panelWith(label('Rubik'), { _children: { Scripts: { scripts: [{ language: 'lua', source: "ce.text.style('L', { family = 'Web Face' })" }] } } }) };
  assert.deepEqual((await embedPanelFonts(lua, stored, undefined, { subset: false })).fonts.map((face) => face.weight), ['400', '700'],
    'a control\'s own script, in the saved form where the Scripts section has no _type');
  const prose = await embedPanelFonts(scripted('// set this in Imported Sans later'), stored, undefined, { subset: false });
  assert.deepEqual(prose.fonts, [], 'a word in a comment is not a name in quotes');
  const both = await embedPanelFonts({ ...panelWith(label('Imported Sans')), scripts: [{ source: '"Imported Sans"' }] }, stored, undefined, { subset: false });
  assert.equal(both.fonts.length, 1, 'a font a control already names is carried once');
  const carried = { family: 'Theirs', weight: '400', style: 'normal', data: dataUrl };
  const passed = await embedPanelFonts({ ...scripted('ce.text.style("L", { family: "Theirs" })'), fonts: [carried] }, [], undefined, { subset: false });
  assert.deepEqual(passed.fonts, [carried], 'and a carried face a script names is passed on');
});

test('a panel that arrived carrying a font passes it on to the next person', async () => {
  const carried = { family: 'Imported Sans', weight: '400', style: 'normal', data: dataUrl };
  const original = { ...panelWith(label('Imported Sans')), fonts: [carried] };
  const { panel } = await withEmbeddedFonts(original, [], async () => null, { subset: false });
  assert.deepEqual(panel.fonts, [carried]);
  await withEmbeddedFonts(original, [], async () => null);
  assert.equal(original.fonts[0].data, dataUrl, 'the panel handed in is not changed');
  const { panel: none } = await withEmbeddedFonts({ ...panelWith(label('Rubik')), fonts: [carried] }, [], async () => null);
  assert.equal(none.fonts, undefined, 'a font the panel no longer names is dropped');
});

test('where there are no Settings — the player — text outlines in the face the panel carries', async () => {
  clearFontCache();
  setFontSources({ storedFonts: () => [] });
  setDocumentFonts([]);
  await assert.rejects(resolveFont('Imported Sans'), FontUnavailableError, 'without it, the face is unknown');

  const { fonts } = await embedPanelFonts(panelWith(label('Imported Sans')), stored);
  assert.ok(fonts[0].data.length < dataUrl.length / 3, `carried subset: ${fonts[0].data.length} of ${dataUrl.length}`);
  await registerDocumentFonts(fonts);   // no document here: registers for outlines only
  const resolved = await resolveFont('Imported Sans', { weight: 400 });
  assert.match(resolved.key, /^stored:doc:/);
  const part = { kind: 'rectangle', _children: { Text: { content: 'Hello', _children: { Font: { family: 'Imported Sans', size: 20 } } } } };
  assert.ok((await textOutline(part, 200, 40)).pathData.length > 100, 'the text outlines from the carried face');

  // The user's own import wins over a carried face of the same name.
  setFontSources({ storedFonts: () => [stored[0]] });
  clearFontCache();
  assert.match((await resolveFont('Imported Sans')).key, /^stored:a$/);

  setFontSources({ storedFonts: () => [] });
  setDocumentFonts([]);
  clearFontCache();
});

test('packaging a panel carries its fonts, and opening the package keeps them', async () => {
  const { appSettings } = await import('../src/CE_Application/stores/appSettings.js');
  const { packagePanelForSharing, openSharedPanel } = await import('../src/CE_Application/stores/panelSharing.js');
  appSettings.update((current) => ({ ...current, fonts: [stored[0]] }));
  const packed = await packagePanelForSharing(panelWith(label('Imported Sans')));
  assert.equal(packed.ok, true, JSON.stringify(packed.issues));
  assert.equal(packed.fontCount, 1);
  assert.deepEqual(packed.missing, []);
  const opened = await openSharedPanel(packed.envelope);
  assert.equal(opened.ok, true);
  assert.equal(opened.panel.fonts[0].family, 'Imported Sans');
  assert.match(opened.panel.fonts[0].data, /^data:font\/woff2;base64,/, 'subset and compressed');
  appSettings.update((current) => ({ ...current, fonts: [] }));
});
