// ctrlrImport.test.js — reading somebody else's Ctrlr panel.
//
// THE OBJECTION this feature exists to answer, and why it points the wrong way: "converting Ctrlr
// panels must be enormously hard — Ctrlr is JUCE C++ modules and CEditor is Svelte." A Ctrlr panel
// file contains no JUCE code. It is an XML property bag, and Ctrlr's C++ is the interpreter of that
// file exactly as CEditor's Svelte is the interpreter of a `.cepanel`. The import is a document
// translation and the rendering stacks never meet.
//
// WHAT IS NOT TESTED HERE, said plainly because it is the honest limit: no real community panel has
// been through this. Nobody in this repository has a `.panel` or a `.bpanelz`, so the fixture is
// hand-built from Ctrlr's own identifier table and the tests are about the RULES rather than about
// the corpus. The plan's own open questions — the exact `componentRectangle` format, the `.bpanelz`
// compression, how widely value expressions are used — are unanswerable from here, and every one of
// them is handled by refusing-and-reporting rather than guessing. That is what these tests pin.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gzipSync, deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { attr, findAll, parseXml } from '../../../tools/ctrlr-import/xml.mjs';
import { classifyLuaMethod, decodePanelBytes, readCtrlrPanel } from '../../../tools/ctrlr-import/read.mjs';
import { harvestProfile, isIdentityExpression, readSysexTemplate } from '../../../tools/ctrlr-import/harvest.mjs';
import {
  componentForCtrlr, planReconstruction, readColour, readItemList, readRectangle,
} from '../../../tools/ctrlr-import/reconstruct.mjs';
import { localCompileParameter, validateLocalProfileSource } from '../src/CE_Application/stores/deviceProfileLocalEngine.js';

const FIXTURE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures/ctrlr-minimal.panel'));
const read = () => readCtrlrPanel(FIXTURE);

// --- the XML reader ----------------------------------------------------------------------------

test('attributes, children, CDATA and entities', () => {
  const root = parseXml(`<panel name="a &amp; b"><m x="1"/><lua><![CDATA[if a < b then end]]></lua></panel>`);
  assert.equal(root.name, 'panel');
  assert.equal(attr(root, 'name'), 'a & b');
  assert.equal(findAll(root, 'm').length, 1);
  assert.equal(findAll(root, 'lua')[0].text, 'if a < b then end', 'CDATA is literal, and Lua lives in it');
});

test('a DOCTYPE with a subset is refused, not parsed carefully', () => {
  // Entity expansion is the one attack surface an XML reader brings, and a Ctrlr panel has no use
  // for a DOCTYPE at all — so the safe answer is to refuse rather than to handle it well.
  assert.throws(() => parseXml('<!DOCTYPE p [<!ENTITY x "boom">]><p>&x;</p>'), /DOCTYPE/);
  assert.throws(() => parseXml('<!DOCTYPE p SYSTEM "http://example.com/p.dtd"><p/>'), /DOCTYPE/);
});

test('malformed XML fails with a line number, not silently', () => {
  // These files are tens of thousands of lines; "unexpected character" without one is useless.
  assert.throws(() => parseXml('<a><b></a>'), /line \d+/);
  assert.throws(() => parseXml('<a x=1/>'), /line \d+/);
  assert.throws(() => parseXml(''), /empty/);
});

// --- S1: read the file and report ----------------------------------------------------------------

test('a plain .panel reads, and says how it was decoded', () => {
  const result = read();
  assert.equal(result.ok, true);
  assert.equal(result.encoding, 'plain');
  assert.equal(result.panel.name, 'Test Synth Editor');
  assert.equal(result.panel.author, 'Somebody');
  assert.equal(result.counts.modulators, 8);
});

test('a compressed panel is decoded, whichever form it is in', () => {
  // The plan lists .bpanelz compression as an unconfirmed open question. Rather than picking one,
  // this tries each and REPORTS which worked — so the first real file answers the question instead
  // of a guess being baked in.
  assert.equal(decodePanelBytes(gzipSync(FIXTURE)).encoding, 'gzip');
  assert.equal(decodePanelBytes(deflateSync(FIXTURE)).encoding, 'zlib');
  assert.equal(decodePanelBytes(FIXTURE).encoding, 'plain');
});

test('something that is not a Ctrlr panel is refused, with what was tried', () => {
  // A converter that half-reads a file is worse than one that says it cannot read it — and the list
  // of attempts is what the first real .bpanelz will need somebody to look at.
  const result = decodePanelBytes(Buffer.from('this is not a panel'));
  assert.equal(result.ok, false);
  assert.ok(result.attempts.length >= 3, 'every decoder tried should be reported');
  assert.equal(decodePanelBytes(Buffer.alloc(0)).ok, false);
});

test('the report histograms what the panel actually contains', () => {
  // The point of S1: run it over a corpus and learn what the corpus has before committing to any
  // mapping.
  const { histograms } = read();
  assert.equal(histograms.messageType.cc, 5);
  assert.equal(histograms.messageType.sysex, 2);
  assert.equal(histograms.sliderStyle.rotary, 2);
  assert.deepEqual(histograms.luaClass, { shimmable: 1, paint: 1, port: 1 });
});

// --- S4: Lua triage (computed by S1, because the histogram is what S1 is for) ---------------------

test('Lua is classified into the three kinds the plan names', () => {
  assert.equal(classifyLuaMethod({ hooks: ['luaPanelPaintBackground'] }), 'paint');
  assert.equal(classifyLuaMethod({ hooks: ['luaModulatorGetValueForMIDI'] }), 'shimmable');
  assert.equal(classifyLuaMethod({ hooks: ['luaPanelLoaded'], body: 'panel:getModulatorByName("x")' }), 'shimmable');
  assert.equal(classifyLuaMethod({ hooks: [], body: 'local t = {}' }), 'port');
});

test('a method that draws is a paint method even when no hook says so', () => {
  // Ctrlr wires paint callbacks by name from a component attribute, so the hook list is not always
  // the whole story — and misclassifying a paint method as shimmable is how a shim would come to
  // promise something it cannot do.
  assert.equal(classifyLuaMethod({ hooks: [], body: 'g:fillAll()' }), 'paint');
});

test('a method name cannot claim every hook there is', () => {
  // The name comes out of the file. Building a regexp from it would let a method called ".*" match
  // every hook attribute in the document.
  const panel = readCtrlrPanel(Buffer.from(
    '<panel luaPanelLoaded="real"><luaMethod luaMethodName=".*">x</luaMethod>'
    + '<luaMethod luaMethodName="real">y</luaMethod></panel>'));
  const wildcard = panel.luaMethods.find((m) => m.name === '.*');
  assert.deepEqual(wildcard.hooks, [], 'a regexp-shaped name must match nothing');
});

// --- S2: harvest the profile ---------------------------------------------------------------------

test('a modulator becomes a parameter with the range it declared', () => {
  const { profile } = harvestProfile(read());
  const cutoff = profile.parameters.find((p) => p.id === 'filter.cutoff');
  assert.equal(cutoff.name, 'Filter Cutoff');
  assert.deepEqual(cutoff.range, { min: 0, max: 127 });
  assert.equal(cutoff.default, 64);
  assert.equal(cutoff.messageRecipe, 'cc74');
});

test('every parameter names a recipe the profile actually defines', () => {
  // THE TRAP, recorded in the engine's own tests: a parameter naming a messageRecipe the profile
  // does not define makes loadFromJson reject the WHOLE profile — silently, taking every other
  // parameter with it. A harvester that got this wrong would produce files that look right and
  // load as nothing.
  const { profile } = harvestProfile(read());
  const defined = new Set(profile.messageRecipes.map((r) => r.id));
  for (const parameter of profile.parameters) {
    assert.ok(defined.has(parameter.messageRecipe),
      `${parameter.id} names recipe "${parameter.messageRecipe}", which is not defined`);
  }
});

test('the harvested profile validates, and its parameters compile to bytes', () => {
  // The real contract. A profile that parses and produces no MIDI is a file, not a device profile.
  const { profile } = harvestProfile(read());
  const validation = validateLocalProfileSource(profile.id, JSON.stringify(profile));
  assert.ok(validation.ok, JSON.stringify(validation.validation ?? validation.error));

  const compiled = localCompileParameter(profile, { parameterId: 'filter.cutoff', value: 100 });
  assert.ok(compiled.ok, compiled.error);
  assert.match(compiled.hex, /^B0 4A 64$/i, 'CC 74 (0x4A) = 100 (0x64) on channel 1');
  assert.equal(compiled.transaction.messages[0].kind, 'cc');
});

test('a modulator this cannot express is flagged, never guessed at', () => {
  // A profile that quietly contains a wrong address is worse than one missing a parameter: the
  // first sends bytes to a synth and the second does not.
  const { report } = harvestProfile(read());
  const reasons = Object.fromEntries(report.flagged.map((f) => [f.name, f.reason]));
  assert.match(reasons['Scaled Thing'], /value expression is not the identity/);
  assert.match(reasons['Computed Dump'], /Lua, not a byte template/);
  assert.match(reasons.Program, /not a parameter send/);
  assert.equal(report.converted, 5);
  assert.equal(report.modulators, 8);
});

test('the identity expression is recognised so it is not flagged as work', () => {
  // How much parser is worth writing is a question about the corpus, and this is what lets a corpus
  // run answer it with a number.
  for (const identity of ['', '   ', 'modulatorValue', 'value', 'return modulatorValue;']) {
    assert.equal(isIdentityExpression(identity), true, JSON.stringify(identity));
  }
  assert.equal(isIdentityExpression('modulatorValue * 2'), false);
});

test('a SysEx template is read, and Lua in the formula is refused', () => {
  assert.deepEqual(readSysexTemplate('F0 41 xx F7').bytes, [0xf0, 0x41, 'xx', 0xf7]);
  assert.equal(readSysexTemplate('function() end').ok, false);
  assert.equal(readSysexTemplate('F0 41 F7').ok, false, 'no place for the value');
  assert.equal(readSysexTemplate('F0 xx xx F7').ok, false, 'two value slots is ambiguous');
  assert.equal(readSysexTemplate('').ok, false);
});

test('the harvested profile does not claim to be verified', () => {
  // It is a transcription of somebody else's transcription and has never been near the instrument.
  // It must not sit in a list looking like a profile somebody checked.
  const { profile } = harvestProfile(read());
  assert.equal(profile.status, 'imported');
  assert.equal(profile.trust, 'local');
  assert.ok(profile.ctrlrSource.panelName, 'the source panel should be recorded');
});

test('duplicate modulator names become distinct parameters', () => {
  // Ctrlr does not require unique names; the DPD requires unique ids. A suffix rather than a drop,
  // because the second "Cutoff" is a real parameter of something.
  const panel = readCtrlrPanel(Buffer.from(
    '<panel>'
    + '<modulator modulatorName="Cutoff"><midi midiMessageType="cc" midiMessageCtrlrNumber="1"/></modulator>'
    + '<modulator modulatorName="Cutoff"><midi midiMessageType="cc" midiMessageCtrlrNumber="2"/></modulator>'
    + '</panel>'));
  const ids = harvestProfile(panel).profile.parameters.map((p) => p.id);
  assert.deepEqual(ids, ['cutoff', 'cutoff.2']);
});

// --- S3: reconstruct the panel --------------------------------------------------------------------

test('a rotary slider is a Knob and a linear one is a Slider', () => {
  assert.equal(componentForCtrlr({ attributes: { uiType: 'uiSlider', uiSliderStyle: 'Rotary' } }).type, 'Knob');
  assert.equal(componentForCtrlr({ attributes: { uiType: 'uiSlider', uiSliderStyle: 'LinearVertical' } }).type, 'Slider');
  assert.equal(componentForCtrlr({ attributes: { uiType: 'uiCombo' } }).type, 'Combobox');
});

test('an unknown component type becomes a visible Label, and says so', () => {
  // Visible, harmless and obviously unfinished — the three properties a fallback should have.
  const mapped = componentForCtrlr({ attributes: { uiType: 'uiTheremin' } });
  assert.equal(mapped.type, 'Label');
  assert.match(mapped.reason, /no CEditor equivalent/);
});

test('a rectangle is refused rather than defaulted', () => {
  // The exact format is one of the plan's open questions. A control silently placed at 0,0 with
  // size 0 is invisible, and a panel full of those looks like the importer worked.
  assert.deepEqual(readRectangle('10 20 60 60'), { x: 10, y: 20, width: 60, height: 60 });
  assert.deepEqual(readRectangle('10,20,60,60'), { x: 10, y: 20, width: 60, height: 60 });
  for (const junk of ['', 'not numbers', '10 20 60', '10 20 60 60 70', '10 20 0 60']) {
    assert.equal(readRectangle(junk), null, JSON.stringify(junk));
  }
});

test('colours need no conversion at all, only a case fold', () => {
  // Both sides store JUCE Colour::toString() output, because both inherited it from JUCE.
  assert.equal(readColour('ffcc4400'), 'FFCC4400');
  assert.equal(readColour('#1a2b3c'), 'FF1A2B3C');
  assert.equal(readColour('rebeccapurple', 'FF000000'), 'FF000000');
});

test('combo contents are a newline-separated list', () => {
  assert.deepEqual(readItemList('Triangle\nSaw\n\nSquare'), ['Triangle', 'Saw', 'Square']);
});

test('the reconstruction places what it can and reports what it cannot', () => {
  const source = read();
  const { profile } = harvestProfile(source);
  const plan = planReconstruction(source, {
    profileId: profile.id,
    parameterIds: new Set(profile.parameters.map((p) => p.id)),
  });

  assert.equal(plan.ok, true);
  assert.equal(plan.skipped.length, 1);
  assert.match(plan.skipped[0].reason, /not four numbers/);
  assert.equal(plan.placed.find((c) => c.name === 'Cutoff').type, 'Knob');
});

test('a control whose modulator was flagged is placed UNBOUND, and reported', () => {
  // The one that matters most. A binding to a parameter the profile does not carry looks connected
  // in the editor and sends nothing — the silent failure this whole importer is written to avoid.
  const source = read();
  const { profile } = harvestProfile(source);
  const known = new Set(profile.parameters.map((p) => p.id));
  const plan = planReconstruction(source, { profileId: profile.id, parameterIds: known });

  for (const control of plan.placed) {
    if (control.parameterId) assert.ok(known.has(control.parameterId), `${control.name} binds a missing parameter`);
  }
  assert.equal(plan.unbound.length, 3, 'the three flagged modulators leave three unbound controls');
  assert.match(plan.notes.join(' '), /bound to nothing/);
});

test('the notes say what will differ, rather than leaving it to be discovered', () => {
  const plan = planReconstruction(read(), { profileId: 'x' });
  const notes = plan.notes.join(' ');
  assert.match(notes, /not pixel-exact/);
  assert.match(notes, /paint callback/, 'a custom-paint component must be called out');
  assert.match(notes, /filmstrip/i, 'and the idiom CEditor can actually match near-exactly');
});
