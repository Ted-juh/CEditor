// ctrlrImport.test.js — reading somebody else's Ctrlr panel, held to the bytes Ctrlr sends.
//
// The fixture (fixtures/ctrlr-minimal.panel) is hand-built in the format real panels are written in.
// The format itself was learnt from 421 public panels (docs/design/ctrlr-import-plan.md, "What real
// panels showed"); those belong to their authors and are not committed. The first version of the
// importer was written before anybody here had seen one, from Ctrlr's identifier list alone, and on
// real files it converted nothing: message types are numbers, a .bpanelz is a binary tree, colours
// are 0xAARRGGBB. Every case below is something a real panel does.
//
// THE STANDARD is the bytes. test/support/ctrlrReference.js is an independent port of CtrlrX's own
// byte-building code (CtrlrSysexProcessor, CtrlrUtilities, CtrlrModulatorProcessor); for every
// parameter the import makes, every value it can take must compile, through the device-profile
// engine, to exactly what that reference says Ctrlr sends. Run over all 421 panels (the CLI's
// --corpus --verify) that is 2,053,514 values and no difference.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deflateSync, gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { attr, findAll, parseXml } from '../src/CE_Application/ctrlrImport/xml.js';
import { classifyLuaMethod, decodePanelBytes, messageTypeName, readCtrlrPanel } from '../src/CE_Application/ctrlrImport/read.js';
import { decodeJuceBase64, findEmbeddedPanel, parseValueTree, pictureSize } from '../src/CE_Application/ctrlrImport/binary.js';
import { compileForwardExpression, isIdentityExpression } from '../src/CE_Application/ctrlrImport/expression.js';
import {
  classifySysexToken, harvestProfile, readMultiList, readSysexFormula, readValueList,
} from '../src/CE_Application/ctrlrImport/harvest.js';
import { componentForCtrlr, planReconstruction, readColour, readFont, readRectangle } from '../src/CE_Application/ctrlrImport/reconstruct.js';
import { buildCtrlrPanel } from '../src/CE_Application/ctrlrImport/buildPanel.js';
import { localCompileParameter, validateLocalProfileSource } from '../src/CE_Application/stores/deviceProfileLocalEngine.js';
import { ctrlrMessages, sysexBytes } from './support/ctrlrReference.js';

const FIXTURE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures/ctrlr-minimal.panel'));
const read = () => readCtrlrPanel(FIXTURE);
const hex = (bytes) => bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');

// --- JUCE's binary ValueTree, written the way ValueTree::writeToStream writes it -----------------

function compressedInt(value) {
  const magnitude = Math.abs(value);
  const bytes = [];
  for (let v = magnitude; v > 0; v = Math.floor(v / 256)) bytes.push(v & 0xff);
  return [bytes.length | (value < 0 ? 0x80 : 0), ...bytes];
}
function writeTree(node) {
  const utf8 = (text) => [...new TextEncoder().encode(text), 0];
  const out = [...utf8(node.name), ...compressedInt(Object.keys(node.attributes).length)];
  for (const [key, value] of Object.entries(node.attributes)) {
    const body = [5, ...new TextEncoder().encode(String(value)), 0];   // every property as a string
    out.push(...utf8(key), ...compressedInt(body.length), ...body);
  }
  out.push(...compressedInt(node.children.length));
  for (const child of node.children) out.push(...writeTree(child));
  return out;
}
const binaryOf = (xmlBytes) => new Uint8Array(writeTree(parseXml(new TextDecoder().decode(xmlBytes))));

// --- The XML reader ------------------------------------------------------------------------------

test('attributes, children, CDATA and entities', () => {
  const root = parseXml(`<panel name="a &amp; b"><m x="1"/><lua><![CDATA[if a < b then end]]></lua></panel>`);
  assert.equal(attr(root, 'name'), 'a & b');
  assert.equal(findAll(root, 'm').length, 1);
  assert.equal(findAll(root, 'lua')[0].text, 'if a < b then end');
});

test('a DOCTYPE with a subset is refused, and malformed XML fails with a line number', () => {
  assert.throws(() => parseXml('<!DOCTYPE p [<!ENTITY x "boom">]><p>&x;</p>'), /DOCTYPE/);
  assert.throws(() => parseXml('<a><b></a>'), /line \d+/);
  assert.throws(() => parseXml(''), /empty/);
});

// --- S1: the three forms a panel comes in --------------------------------------------------------

test('a .panel: the details real panels carry, under the names they carry them', () => {
  const result = read();
  assert.equal(result.ok, true);
  assert.equal(result.format, 'xml');
  assert.deepEqual(
    { name: result.panel.name, author: result.panel.author, version: result.panel.version, maker: result.panel.manufacturer, device: result.panel.instrument },
    { name: 'Test Synth Editor', author: 'Somebody', version: '1.2', maker: 'Acme', device: 'TS-1' },
  );
  assert.deepEqual([result.panel.width, result.panel.height], [640, 400], 'the size is on uiPanelEditor');
  assert.equal(result.panel.outputChannel, 3);
  assert.equal(result.panel.globals[0], 5);
  assert.deepEqual(result.panel.layers.map((layer) => [layer.name, layer.visible]), [['HIDDEN', false], ['MAIN', true]], 'back to front');
});

test('Lua: the code is in luaMethodCode, and every attribute naming a method counts', () => {
  const { luaMethods } = read();
  const send = luaMethods.find((m) => m.name === 'sendThing');
  assert.match(send.source, /getModulatorByName\("Pan"\)/, 'the code itself, not an empty string');
  assert.deepEqual(send.uses, { luaModulatorValueChange: 2 }, 'two modulators call it when they change');
  assert.equal(luaMethods.find((m) => m.name === 'paintBg').classification, 'paint');
  assert.equal(send.classification, 'shimmable');
  assert.equal(luaMethods.find((m) => m.name === 'onLoad').classification, 'port');
});

test('a .bpanelz is JUCE\'s binary tree, compressed — and reads exactly as the XML does', () => {
  const xml = read();
  for (const [bytes, encoding] of [[deflateSync(binaryOf(FIXTURE)), 'zlib'], [binaryOf(FIXTURE), 'plain'], [gzipSync(binaryOf(FIXTURE)), 'gzip']]) {
    const binary = readCtrlrPanel(bytes);
    assert.equal(binary.ok, true, binary.error);
    assert.equal(binary.format, 'binary');
    assert.equal(binary.encoding, encoding);
    assert.deepEqual(binary.panel, xml.panel);
    assert.deepEqual(binary.counts, xml.counts);
    assert.deepEqual(harvestProfile(binary).profile, harvestProfile(xml).profile, 'the same profile, whichever form');
  }
  assert.throws(() => parseValueTree(binaryOf(FIXTURE).subarray(0, 200)), /ends early/, 'a cut-off file is refused, not read past its end');
});

test('an XML .bpanelz with a NUL after </panel> reads, as Ctrlr reads it', () => {
  // Ctrlr reads the text as a JUCE String, which ends at the first NUL; some saved panels carry one.
  const withNul = deflateSync(Buffer.concat([Buffer.from(FIXTURE), Buffer.from('\r\n\0')]));
  const result = readCtrlrPanel(withNul);
  assert.equal(result.ok, true, result.error);
  assert.equal(result.format, 'xml');
  assert.equal(result.counts.modulators, read().counts.modulators);
});

test('a panel inside a program Ctrlr exported is found, with its pictures beside it', () => {
  // An exported program carries the panel compressed, and its pictures as a second tree,
  // resourceExportList — not in the panel, which names them by file.
  const root = parseXml(new TextDecoder().decode(FIXTURE));
  const resources = findAll(root, 'resource');
  for (const node of findAll(root, 'panelResources')) node.children = [];
  const panelStream = deflateSync(new Uint8Array(writeTree(root)));
  const listStream = deflateSync(new Uint8Array(writeTree({ name: 'resourceExportList', attributes: {}, children: resources })));
  const filler = (n, seed) => Uint8Array.from({ length: n }, (_, i) => (i * seed + 17) % 251);
  const program = new Uint8Array([0x4d, 0x5a, ...filler(4000, 7), ...panelStream, ...filler(3000, 13), ...listStream, ...filler(500, 3)]);

  const found = findEmbeddedPanel(program);
  assert.equal(found.ok, true);
  assert.equal(found.resources.length, 1);
  const result = readCtrlrPanel(program);
  assert.equal(result.encoding, 'program');
  assert.equal(result.panel.name, 'Test Synth Editor');
  assert.equal(result.counts.picturesInFile, 1, 'the picture came from the list beside the panel');
  assert.equal(findEmbeddedPanel(new Uint8Array([0x4d, 0x5a, ...filler(2000, 5)])).ok, false);
});

test('something that is not a Ctrlr panel is refused, with what was tried', () => {
  const result = decodePanelBytes(Buffer.from('this is not a panel'));
  assert.equal(result.ok, false);
  assert.ok(result.attempts.length >= 3);
  assert.equal(decodePanelBytes(Buffer.alloc(0)).ok, false);
});

test('message types are numbers, sometimes decimals, in a few old panels names', () => {
  assert.equal(messageTypeName('0'), 'CC');
  assert.equal(messageTypeName('5'), 'SysEx');
  assert.equal(messageTypeName('7.0'), 'ProgramChange');
  assert.equal(messageTypeName('6'), 'Multi');
  assert.equal(messageTypeName('CC'), 'CC');
  assert.equal(messageTypeName(''), 'None');
  assert.equal(messageTypeName('42'), '');
  assert.deepEqual(read().histograms.messageType, { CC: 10, None: 6, SysEx: 4, Multi: 2, ProgramChange: 1 });
});

test('a method that draws is paint even when no hook says so; a method name cannot claim every hook', () => {
  assert.equal(classifyLuaMethod({ hooks: [], body: 'g:fillAll()' }), 'paint');
  const panel = readCtrlrPanel(Buffer.from('<panel luaPanelLoaded="real"><luaMethod luaMethodName=".*" luaMethodCode="x"/><luaMethod luaMethodName="real" luaMethodCode="y"/></panel>'));
  assert.deepEqual(panel.luaMethods.find((m) => m.name === '.*').hooks, []);
  assert.deepEqual(panel.luaMethods.find((m) => m.name === 'real').hooks, ['luaPanelLoaded']);
});

// --- The pieces Ctrlr's bytes are made from ------------------------------------------------------

test('value formulas: Ctrlr\'s functions, cut to an integer as Ctrlr sends them', () => {
  for (const identity of ['', 'modulatorValue', 'value', 'midiValue', 'return modulatorValue;']) assert.equal(isIdentityExpression(identity), true);
  const twos = compileForwardExpression('lt(modulatorValue,0,16384+modulatorValue,modulatorValue)');
  assert.deepEqual([twos.forward(-1), twos.forward(5)], [16383, 5]);
  assert.equal(compileForwardExpression('modulatorValue * 1.27').forward(50), 63, 'trunc(63.5)');
  assert.equal(compileForwardExpression('(modulatorValue - 63) * -1').forward(0), 63);
  assert.equal(compileForwardExpression('lt (modulatorValue, 0, 8 + abs(modulatorValue), modulatorValue)').forward(-3), 11);
  assert.match(compileForwardExpression('setGlobal (0, setBit (global.k0, 4, modulatorValue))').error, /cannot be read/);
  assert.match(compileForwardExpression('osc1.modulatorValue + 1').error, /not something a value formula can read/);
  assert.throws(() => compileForwardExpression('modulatorValue / 0').forward(1), /divides by zero/);
});

test('value lists: name=value, or the LINE number (empty lines counted), as CtrlrValueMap reads them', () => {
  assert.deepEqual(readValueList('Off=0\n1=32\n2=65'), [{ label: 'Off', value: 0 }, { label: '1', value: 32 }, { label: '2', value: 65 }]);
  assert.deepEqual(readValueList('Saw\n\nSquare\n__extra'), [{ label: 'Saw', value: 0 }, { label: 'Square', value: 2 }]);
  assert.deepEqual(readValueList('"a=b"=7'), [{ label: 'a=b', value: 7 }], 'an = inside quotes is part of the name');
});

test('SysEx codes, identified in CtrlrX\'s order', () => {
  assert.deepEqual(classifySysexToken('1y'), { kind: 'channel4', high: 1 });
  assert.equal(classifySysexToken('z5').span, 5);
  assert.equal(classifySysexToken('z5').type, 'roland-7bit');
  assert.equal(classifySysexToken('w4').type, 'sum-7bit');
  assert.deepEqual(classifySysexToken('k0'), { kind: 'global', index: 0 });
  assert.equal(classifySysexToken('OD').byte, 0x0d, 'a letter O where a zero was meant is still read as hex, as Ctrlr reads it');
  assert.equal(classifySysexToken('116').kind, 'unsupported', 'getHexValue32("116") is 278, capped at 255: no data byte');
  assert.match(classifySysexToken('tp').reason, /current program/);
});

test('a Roland DT1: the bytes the checksum covers become the address', () => {
  const sysex = readSysexFormula('F0 41 10 00 00 00 1D 12 03 00 06 00 MS LS z6 F7', { channel: 1 });
  assert.deepEqual(sysex.template, ['F0', '41', '10', '00', '00', '00', '1D', '12', '$address', '$encodedValue', '$checksum', 'F7']);
  assert.equal(sysex.address, '03 00 06 00');
  assert.equal(sysex.encoding.type, 'u14');
  assert.deepEqual(sysex.checksum, { type: 'roland-7bit' });
  // A channel code outside the covered span stays a variable; the address is what z3 covers.
  const inside = readSysexFormula('F0 41 yy 12 01 xx z3 F7', { channel: 5 });
  assert.equal(inside.address, '12 01');
  assert.deepEqual(inside.template.slice(0, 3), ['F0', '41', '$ctrlrChannel']);
  // A channel code inside the covered span is written in at the panel's channel, and said so.
  const covered = readSysexFormula('F0 41 12 yy 01 xx z3 F7', { channel: 5 });
  assert.equal(covered.address, '04 01');
  assert.match(covered.notes.join(' '), /written in as 04 \(channel 5\)/);
  assert.match(readSysexFormula('F0 01 23 b1 63 00 62 02 06 MS 26 LS F7').reason, /split around other bytes .* channel message/);
});

test('Multi messages: an NRPN as four CCs is an NRPN; a CC pair a CC sequence', () => {
  const nrpn = readMultiList('CC,ByteValue,MSB7bitValue,99,-2:CC,ByteValue,LSB7bitValue,98,-2:CC,ByteValue,MSB7bitValue,6,-1:CC,ByteValue,LSB7bitValue,38,-1', { number: 300 });
  assert.deepEqual([nrpn.recipe.kind, nrpn.recipe.parameterMsb, nrpn.recipe.parameterLsb, nrpn.recipe.valueResolution], ['nrpn', 2, 44, 14]);
  const pair = readMultiList('CC,ByteValue,MSB7bitValue,1,-1:CC,ByteValue,LSB7bitValue,33,-1');
  assert.deepEqual(pair.recipe.messages, [{ controller: 1, value: '$byte0' }, { controller: 33, value: '$byte1' }]);
  assert.match(readMultiList('SysEx,Direct,Direct,-1,-1').reason, /several SysEx/);
});

// --- S2: the profile, held to Ctrlr's bytes ------------------------------------------------------

const harvested = () => harvestProfile(read());
const parameterOf = (profile, id) => profile.parameters.find((p) => p.id === id);

test('what each case became', () => {
  const { profile } = harvested();
  assert.deepEqual(parameterOf(profile, 'pan').encoding, { type: 'u7', transform: { offset: 64 } });
  assert.deepEqual(parameterOf(profile, 'pan').range, { min: -64, max: 63 }, 'the values the player sees');
  assert.deepEqual(parameterOf(profile, 'detune').encoding, { type: 'u14', transform: { negativeOffset: 16384 } });
  assert.equal(parameterOf(profile, 'detune').address, '03 00 06 00');
  assert.deepEqual(parameterOf(profile, 'lfo.shape').choices.map((c) => [c.label, c.value]), [['Triangle', 0], ['Saw', 32], ['Square', 65], ['Random', 127]]);
  assert.equal(parameterOf(profile, 'lfo.shape').default, 'saw');
  assert.deepEqual(parameterOf(profile, 'mode').display.table, ['Off', 'Low', 'Mid', 'High'], 'a slider over a list reads its words');
  assert.equal(parameterOf(profile, 'octave').ui.step, 12);
  assert.ok(parameterOf(profile, 'unnamed.9'), 'a modulator with no name is numbered, not refused');
  assert.equal(profile.variables.channel, 3);
  assert.equal(profile.variables.ctrlrChannel1, 0x12, '"1y" on channel 3');
  assert.equal(profile.status, 'imported');
});

test('what is refused says why, and what Lua sends is counted, not refused', () => {
  const { report } = harvested();
  const reasons = Object.fromEntries(report.flagged.map((f) => [f.name, f.reason]));
  assert.match(reasons['Computed Dump'], /runs a Lua method/);
  assert.match(reasons.Program, /program change/);
  assert.match(reasons['Packed Bits'], /cannot be read/);
  assert.deepEqual(report.sendsFromLua, ['Patch']);
  assert.equal(report.converted, 14);
  assert.equal(report.sending, 17);
});

test('the profile validates, and every parameter names a recipe it defines', () => {
  const { profile } = harvested();
  const validation = validateLocalProfileSource(profile.id, JSON.stringify(profile));
  assert.ok(validation.ok, JSON.stringify(validation.validation ?? validation.error));
  const recipes = new Set(profile.messageRecipes.map((r) => r.id));
  for (const parameter of profile.parameters) assert.ok(recipes.has(parameter.messageRecipe), parameter.id);
});

test('EVERY value of every parameter sends exactly what Ctrlr sends', () => {
  const source = read();
  const { profile, parameterIdOf } = harvestProfile(source);
  const nodeOf = new Map([...parameterIdOf].map(([node, id]) => [id, node]));
  let checked = 0;
  for (const parameter of profile.parameters) {
    const node = nodeOf.get(parameter.id);
    const pairs = parameter.type === 'choice'
      ? parameter.choices.map((choice, index) => [choice.id, index])
      : Array.from({ length: parameter.range.max - parameter.range.min + 1 }, (_, i) => parameter.range.min + i)
        .filter((v) => !parameter.ui?.step || (v - parameter.range.min) % parameter.ui.step === 0)
        .map((v) => [v, v]);
    for (const [engineValue, ctrlrValue] of pairs) {
      const compiled = localCompileParameter(profile, { parameterId: parameter.id, value: engineValue });
      assert.ok(compiled.ok, `${parameter.id} = ${engineValue}: ${compiled.error}`);
      const got = compiled.transaction.messages.flatMap((m) => m.bytes);
      const want = ctrlrMessages(node, source.panel, ctrlrValue).flat();
      assert.equal(hex(got), hex(want), `${parameter.id} = ${engineValue}`);
      checked += 1;
    }
  }
  assert.ok(checked > 16000, `${checked} values`);
});

test('the same bytes, worked by hand', () => {
  const { profile } = harvested();
  const bytes = (id, value) => hex(localCompileParameter(profile, { parameterId: id, value }).transaction.messages.flatMap((m) => m.bytes));
  // 03+00+06+00+7F+7F = 263; 263 mod 128 = 7; Roland's checksum 128 - 7 = 121 = 79.
  assert.equal(bytes('detune', -1), 'F0 41 10 00 00 00 1D 12 03 00 06 00 7F 7F 79 F7');
  assert.equal(bytes('pan', -64), 'B2 0A 00', 'channel 3, "value + 64"');
  assert.equal(bytes('lfo.shape', 'square'), 'B2 0C 41');
  assert.equal(bytes('mode', 2), 'F0 43 12 5C 10 02 F7');
  assert.equal(bytes('resonance', 1000), 'B2 63 02 B2 62 2C B2 06 07 B2 26 68', 'CtrlrX\'s NRPN order: 99, 98, 6, 38');
  assert.equal(bytes('fine', 1000), 'B2 01 07 B2 21 68');
  // And CtrlrX's own test (Tests/test_ProcessorMidiSysex.cpp): F0 7D xx F7 at 64 is F0 7D 40 F7.
  assert.equal(hex(sysexBytes('F0 7D xx F7', 64, 1)), 'F0 7D 40 F7');
});

// --- S3: the panel ---------------------------------------------------------------------------------

function built() {
  const source = read();
  const harvest = harvestProfile(source);
  const plan = planReconstruction(source, { profileId: harvest.profile.id, parameterIdOf: harvest.parameterIdOf, profile: harvest.profile });
  const panel = buildCtrlrPanel(plan, { name: 'T', width: source.panel.width, height: source.panel.height, profileId: harvest.profile.id });
  const all = [];
  const walk = (controls, parent) => {
    for (const control of controls) {
      all.push({ control, parent });
      walk(Object.values(control._children.Children?._children ?? {}), control);
    }
  };
  walk(panel.controls, null);
  const byName = (name) => all.find(({ control }) => control._children.Core.name === name);
  return { plan, panel, all, byName };
}

test('colours, fonts and rectangles as JUCE reads them', () => {
  assert.equal(readColour('0xffff0000'), 'FFFF0000');
  assert.equal(readColour('ffff0000'), 'FFFF0000');
  assert.equal(readColour('fad3d'), '000FAD3D', 'five digits: a transparent colour, as JUCE has it');
  assert.equal(readColour('', 'X'), 'X');
  assert.deepEqual(readFont('<Sans-Serif>;12;1;0;0;0;1;3'), { family: 'sans-serif', generic: true, size: 12, bold: true, italic: false, underline: false });
  assert.deepEqual(readRectangle('10,20,60,60'), { x: 10, y: 20, width: 60, height: 60 });
  assert.equal(readRectangle('10 20 0 60'), null);
  assert.equal(componentForCtrlr({ attributes: { uiType: 'uiSlider', uiSliderStyle: 'RotaryVerticalDrag' } }).type, 'Knob');
  assert.equal(componentForCtrlr({ attributes: { uiType: 'uiSlider', uiSliderStyle: 'IncDecButtons' } }).type, 'Number');
  assert.equal(componentForCtrlr({ attributes: { uiType: 'uiTheremin' } }).type, 'Label');
});

test('a control in a group and one on a tab page are placed INSIDE them, where they were', () => {
  const { byName } = built();
  const amp = byName('Amp Level');
  assert.equal(amp.parent._children.Core.name, 'Group A');
  assert.deepEqual([amp.control._children.Transform.x, amp.control._children.Transform.y], [10, 30], 'relative to the group, as Ctrlr has it');
  const extra = byName('Extra Knob');
  assert.equal(extra.parent._children.Core.controlType, 'TabContainer');
  assert.equal(extra.control._children.Core.tabPageId, 'p1', 'on the second page');
  const tabs = extra.parent._children.TabContainer;
  assert.deepEqual(tabs.pages.map((p) => p.label), ['Main', 'Extra']);
  assert.equal(tabs.stripSize, 24);
  const group = byName('Group A').control;
  assert.equal(group._children.Background._children.Fill.colour, 'FF334455');
  assert.equal(group._children.Background._children.Border.thickness, 2);
});

test('a caption takes its band of the control\'s rectangle, attached to the control', () => {
  const { all, byName } = built();
  const cutoff = byName('Filter Cutoff').control;
  const t = cutoff._children.Transform;
  assert.deepEqual([t.x, t.y, t.width, t.height], [10, 34, 60, 60], 'below a 14-pixel caption');
  const caption = all.find(({ control }) => control._children.Core.attachedTo === cutoff._children.Core.id).control;
  assert.equal(caption._children.Text.content, 'Cutoff');
  assert.deepEqual([caption._children.Transform.y, caption._children.Transform.height], [20, 14]);
  assert.equal(caption._children.Text._children.Fill.colour, 'FFCCCCCC');
});

test('layers come across, the hidden ones hidden', () => {
  const { panel, byName } = built();
  assert.deepEqual(panel.layers.map((layer) => [layer.name, layer.visible]), [['HIDDEN', false], ['MAIN', true]]);
  assert.equal(byName('Hidden Thing').control._children.Core.layer, 'HIDDEN');
  assert.equal(byName('Filter Cutoff').control._children.Core.layer, 'MAIN');
});

test('a picture knob draws the panel\'s own frames, and they follow the value', () => {
  const { byName } = built();
  const knob = byName('Picture Knob').control;
  assert.equal(knob._children.Core.controlType, 'CustomComponent');
  const image = knob._children.Parts._children.frames.sections?.Image ?? knob._children.Parts._children.frames._children?.Image;
  assert.match(image.source, /^data:image\/png;base64,/);
  assert.deepEqual([image.frameCount, image.frameWidth, image.frameHeight, image.orientation], [2, 4, 8, 'vertical']);
  assert.equal(knob._children.Bindings._children.frame.target, 'Parts.frames.Image.frameIndex');
  assert.equal(knob._children.DeviceBindings.bindings[0].port, 'mainValue');
  const picture = decodeJuceBase64(read().resources[0].data);
  assert.deepEqual(pictureSize(picture), { width: 4, height: 16 });
});

test('every control bound to the parameter its own modulator became; the others listed', () => {
  const { all, plan, byName } = built();
  const bound = all.filter(({ control }) => control._children.DeviceBindings?.bindings?.length);
  assert.equal(bound.length, 14);
  assert.equal(byName('LFO Shape').control._children.DeviceBindings.bindings[0].port, 'selectedChoice');
  assert.deepEqual(byName('LFO Shape').control._children.Value.rows.map((row) => row.displayText), ['Triangle', 'Saw', 'Square', 'Random']);
  assert.equal(byName('Osc Sync').control._children.DeviceBindings.bindings[0].port, 'state');
  assert.equal(byName('Octave').control._children.Behavior.step, 12);
  assert.equal(byName('Pan').control._children.Transform.opacity, 128 / 255);
  assert.deepEqual(plan.unbound.map((u) => u.name).sort(), ['Computed Dump', 'Packed Bits', 'Program']);
  assert.equal(plan.skipped[0].name, 'Broken Rect');
  assert.match(plan.notes.join(' '), /Lua paint callback/);
  assert.match(plan.notes.join(' '), /1 of the panel's 2 layers start hidden/);
});

// --- From the File menu ---------------------------------------------------------------------------

test('the File menu import: a profile for the engine, a panel bound to it, and the rest in its notes', async () => {
  const { importCtrlrPanelBytes, unusedProfileId } = await import('../src/CE_Application/stores/ctrlrImportActions.js');
  const { panels, activePanel } = await import('../src/CE_Application/stores/panels.js');
  const { deviceProfiles } = await import('../src/CE_Application/stores/deviceProfiles.js');
  const { serializePanel, deserializePanel } = await import('../src/CE_Application/stores/panelModel.js');
  const { get } = await import('svelte/store');

  const saved = [];
  const result = await importCtrlrPanelBytes(new Uint8Array(deflateSync(binaryOf(FIXTURE))), 'C:/Panels/ts1.bpanelz', {
    saveProfile: (id, source) => saved.push({ id, profile: JSON.parse(source) }),
  });
  assert.ok(result, 'the import went through');
  assert.equal(saved.length, 1);
  assert.equal(saved[0].profile.parameters.length, 14);

  const panel = get(activePanel);
  assert.equal(panel, result.panel);
  assert.equal(panel.name, 'Test Synth Editor (Ctrlr)');
  assert.equal(panel.modified, true, 'never saved: closing it or quitting asks');

  const [report, lua] = panel.notepad.notes;
  assert.match(report.content, /14 of the 17 controls that send MIDI themselves became parameters/);
  assert.match(report.content, /1 control\(s\) send nothing of their own: Lua sends for them/);
  assert.match(report.content, /not converted: Program — a program change/);
  assert.equal(lua.name, 'Ctrlr Lua');
  assert.match(lua.content, /-- sendThing \[shimmable\] called by: luaModulatorValueChange ×2/);
  assert.match(lua.content, /getModulatorByName/, 'the code itself');

  // Saved and opened again: the same controls, nested as they were.
  const back = deserializePanel(serializePanel(panel), '/x/ts1.cepanel');
  assert.equal(back.controls.length, panel.controls.length);

  deviceProfiles.update((list) => [...list, { id: result.profileId, name: 'first import' }]);
  const again = await importCtrlrPanelBytes(new Uint8Array(FIXTURE), 'ts1.panel', { saveProfile: (id) => saved.push({ id }) });
  assert.equal(again.profileId, `${result.profileId}-2`, 'a re-import never writes over an earlier profile');
  assert.equal(unusedProfileId('a', ['a', 'a-2']), 'a-3');

  const refused = await importCtrlrPanelBytes(new TextEncoder().encode('not a panel'), 'junk.panel', { saveProfile: () => saved.push('no') });
  assert.equal(refused, null);
  assert.equal(saved.at(-1).id, again.profileId, 'and nothing is saved for it');
  panels.set([]);
});
