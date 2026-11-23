// ctrlrLua.test.js — a Ctrlr panel's Lua, run in CEditor's Lua against a stand-in for Ctrlr, and
// the controls it sends for learned as device-profile parameters (ctrlrImport/ctrlrLua.js, learn.js).
//
// The fixture is hand-built (test/fixtures/ctrlr-minimal.panel): each Lua method in it is one case
// found in the public panels the importer was run on. The bytes below are worked by hand.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { readCtrlrPanel } from '../src/CE_Application/ctrlrImport/read.js';
import { harvestProfile } from '../src/CE_Application/ctrlrImport/harvest.js';
import { CTRLR_LUA_PRELUDE, CTRLR_LUA_STANDIN, luaLiteral } from '../src/CE_Application/ctrlrImport/ctrlrLua.js';
import { learnFromLua, lua51Source, panelLiteral, splitMessages } from '../src/CE_Application/ctrlrImport/learn.js';
import { localCompileParameter } from '../src/CE_Application/stores/deviceProfileLocalEngine.js';

const require = createRequire(import.meta.url);
const { LuaFactory } = require('wasmoon');
const createEngine = () => new LuaFactory().createEngine();

const FIXTURE = new Uint8Array(readFileSync(new URL('./fixtures/ctrlr-minimal.panel', import.meta.url)));
const read = () => readCtrlrPanel(FIXTURE);
const FROM_FILE = 'function fromFile(mod, value)\n  panel:sendMidiMessageNow(CtrlrMidiMessage({ 0xB0, 40, value }))\nend';

/** A Lua engine with the prelude and the stand-in over the fixture, for checking one thing. */
async function standIn() {
  const lua = await createEngine();
  lua.doStringSync(CTRLR_LUA_PRELUDE);
  lua.doStringSync(panelLiteral(read()));
  lua.doStringSync(CTRLR_LUA_STANDIN);
  return { run: (code) => lua.doStringSync(code), close: () => lua.global.close() };
}

const hex = (bytes) => bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
function sends(profile, id, value) {
  const compiled = localCompileParameter(profile, { parameterId: id, value });
  assert.equal(compiled.ok, true, compiled.error);
  return compiled.transaction.messages.map((m) => hex(m.bytes)).join(' | ');
}

let learnedOnce = null;
async function learned({ methodSource = null } = {}) {
  if (!methodSource && learnedOnce) return learnedOnce;
  const r = read();
  const harvest = harvestProfile(r);
  const result = await learnFromLua(r, harvest, { createEngine, methodSource });
  const out = { harvest, result, byName: Object.fromEntries(result.learned.map((l) => [l.name, l])) };
  if (!methodSource) learnedOnce = out;
  return out;
}

// --- Lua 5.1 and LuaJIT on Lua 5.4 ---------------------------------------------------------------

test('the Lua source the bundle carries is ASCII: a raw template cannot be escaped, and the build refuses one that is not', () => {
  for (const [name, source] of Object.entries({ CTRLR_LUA_PRELUDE, CTRLR_LUA_STANDIN })) {
    const at = source.search(/[^\x00-\x7f]/);
    assert.equal(at, -1, `${name} has a non-ASCII character at ${JSON.stringify(source.slice(Math.max(0, at - 30), at + 10))}`);
  }
});

test('what 5.1 and LuaJIT panels rely on: unpack, the bit library, numbers truncated where 5.4 refuses them', async () => {
  const lua = await standIn();
  try {
    assert.equal(lua.run('return select("#", unpack({ 1, 2, 3 }))'), 3);
    assert.equal(lua.run('return table.getn({ 1, 2 })'), 2);
    assert.equal(lua.run('return bit.band(0x1234, 0xFF)'), 0x34);
    assert.equal(lua.run('return bit.bor(0x10, 0x01)'), 0x11);
    assert.equal(lua.run('return bit.lshift(1, 31)'), -2147483648, 'signed 32-bit, as LuaJIT gives it');
    assert.equal(lua.run('return bit.rshift(-1, 28)'), 15);
    assert.equal(lua.run('return bit.arshift(-16, 2)'), -4);
    assert.equal(lua.run('return bit.tohex(255, 4)'), '00ff');
    assert.equal(lua.run('return bit.band(1000 / 128, 0x7F)'), 8, 'a fraction rounded, as BitOp does');
    assert.equal(lua.run('return string.format("%02x", 1000 / 128)'), '07', 'Lua 5.4 refuses %x of 7.8125; 5.1 truncates');
    assert.equal(lua.run('return string.format("%d items", 2.9)'), '2 items');
    assert.equal(lua.run('return ("abcdef"):sub(2.0, 3.7)'), 'bc');
    assert.equal(lua.run('return string.char(65.0, 66.9)'), 'AB');
    assert.equal(lua.run('return math.pow(2, 10)'), 1024);
    assert.equal(lua.run('return tostring(64 / 2)'), '32', 'LuaJIT writes a whole number without ".0"');
    assert.equal(lua.run('return tostring(1 / 4)'), '0.25');
    assert.equal(lua.run('return string.format("%s|%s", 64 / 2, "x")'), '32|x');
    assert.equal(lua.run('return table.concat({ 64 / 2, 1 / 4, "x" }, " ")'), '32 0.25 x');
    assert.equal(lua.run('return tonumber(10, 16)'), 16, 'with a base, LuaJIT reads a number as its text');
    assert.equal(lua.run('return tonumber("7F", 16)'), 127);
    assert.equal(lua.run('return select("#", table.remove({ 1, 2 }, 5))'), 0, 'LuaJIT removes nothing out of range; 5.4 stops');
    assert.equal(lua.run('local t = { 1, 2, 3 } return table.remove(t, 1) + 10 * #t'), 21);
    assert.equal(lua.run('local t = {} table.insert(t, 3, "x") return t[3]'), 'x', 'LuaJIT inserts anywhere; 5.4 stops');
    assert.equal(lua.run('local t = { "a", "c" } table.insert(t, 2, "b") table.insert(t, "d") return table.concat(t)'), 'abcd');
    assert.equal(lua.run('local t = setmetatable({ "A", "B" }, { __index = function(t, k) return "A" end }) local n = 0 for _ in ipairs(t) do n = n + 1 end return n'), 2,
      'LuaJIT\'s ipairs reads raw and stops; 5.4\'s asks __index and would never end');
    assert.equal(lua.run('local m = module("helpers") function m.twice(x) return 2 * x end return helpers.twice(21)'), 42);
    assert.equal(lua.run('return (pcall(require, "ffi"))'), false, 'no FFI: "if has_ffi" takes the path that works');
    assert.equal(lua.run('return require("math") == math'), true);
  } finally { lua.close(); }
});

test('somebody else\'s code: no files, no processes, no precompiled chunks', async () => {
  const lua = await standIn();
  try {
    assert.equal(lua.run('return io.open("/etc/passwd", "r")'), null, 'opening a file fails as a missing file does');
    assert.equal(lua.run('local n = 0 for _ in io.lines("/etc/passwd") do n = n + 1 end return n'), 0);
    assert.equal(lua.run('return os.execute("echo hi")'), null);
    assert.equal(lua.run('return os.remove("/tmp/x")'), null);
    assert.equal(typeof lua.run('return os.time()'), 'number', 'the clock is still there');
    assert.equal(lua.run('return string.dump'), null);
    assert.equal(lua.run('return debug.sethook ~= nil and debug.getinfo ~= nil'), true, 'a harmless stand-in for debugging helpers');
    assert.equal(lua.run('return (load("\\27Lua", "x"))'), null, 'a binary chunk is refused');
    assert.equal(lua.run('return load("return 1 + 1")()'), 2, 'source text loads');
  } finally { lua.close(); }
});

// --- The Ctrlr objects ---------------------------------------------------------------------------

test('MemoryBlock, CtrlrMidiMessage and BigInteger behave as CtrlrX binds them', async () => {
  const lua = await standIn();
  try {
    assert.equal(lua.run('return MemoryBlock({ 0xF0, 0x41, 0x10, 0xF7 }):toHexString(1)'), 'f0 41 10 f7', 'JUCE writes it lower case');
    assert.equal(lua.run('local m = MemoryBlock(3, true) m:setByte(1, 0x7F) return m:toHexString(1)'), '00 7f 00');
    assert.equal(lua.run('local m = MemoryBlock("F04110F7") return m:getRange(1, 2):toHexString(1)'), '41 10');
    assert.equal(lua.run('local m = MemoryBlock({ 0x0F, 0xA0 }) return m:getBitRange(4, 8)'), 0x00, 'bits 4-11, low byte first');
    assert.equal(lua.run('local m = MemoryBlock({ 0x0F, 0xA0 }) return m:getBitRange(0, 4)'), 15);
    assert.equal(lua.run('return CtrlrMidiMessage("B0 07 64"):getData():getByte(2)'), 0x64);
    assert.equal(lua.run('return CtrlrMidiMessage({ 0xB0, 7, 300 }):getData():getByte(2)'), 300 & 0xff, 'a byte is (uint8) of the number');
    assert.equal(lua.run('return CtrlrMidiMessage(MemoryBlock({ 0xF0, 0xF7 })):getSize()'), 2);
    assert.equal(lua.run('local b = BigInteger(0) b:setBitRangeAsInt(4, 3, 5) return b:toInteger()'), 0x50);
    assert.equal(lua.run('local b = BigInteger(0x50) return b:getBitRangeAsInt(4, 3)'), 5);
    assert.equal(lua.run('return utils.unpackDsiData(utils.packDsiData(MemoryBlock({ 0x80, 0x01, 0xFF }))):toHexString(1)'), '80 01 ff', 'DSI packing round trip');
    assert.equal(lua.run('return utils.getVersionMajor() .. "." .. utils.getVersionMinor()'), '5.6');
    assert.equal(lua.run('return MemoryBlock(2).getRawAddress'), null, 'a method the stand-in lacks is nil, so feature checks fall back');
  } finally { lua.close(); }
});

test('the panel and its controls: values, mapped values, properties, the channel', async () => {
  const lua = await standIn();
  try {
    assert.equal(lua.run('return panel:getProperty("panelMidiOutputChannelDevice")'), '3');
    assert.equal(lua.run('return panel:getModulatorByName("Lua Mode"):getValue()'), 0);
    assert.equal(lua.run('local m = panel:getModulatorByName("Lua Mode") m:setValue(1, false) return m:getValueMapped()'), 10, 'the list\'s value');
    assert.equal(lua.run('return panel:getModulatorByName("Lua Mode"):getComponent():getProperty("componentVisibleName")'), 'Mode');
    assert.equal(lua.run('return panel:getModulatorByName("no such control")'), null);
    assert.equal(lua.run('return panel:getGlobalVariable(0)'), 5, 'panelGlobalVariables');
    assert.equal(lua.run('return panel:getComponent("Lua Mode"):getOwner():getName()'), 'Lua Mode');
    assert.equal(lua.run('local c = panel:getComponent("Lua Mode") c:repaint() c:setColour(1, Colour(0xff000000)) return true'), true, 'drawing and showing do nothing, harmlessly');
  } finally { lua.close(); }
});

test('what CtrlrX does not bind is nil, as in Ctrlr: a method that calls it stops there', async () => {
  const lua = await standIn();
  try {
    // A real panel's luaPanelLoaded called utils.rotation, which CtrlrX does not have: in Ctrlr it
    // stopped there, the flag that let its controls send was never cleared, and they sent nothing.
    assert.equal(lua.run('return utils.rotation == nil'), true);
    assert.match(lua.run('local ok, err = pcall(function() utils.rotation(1.57, 0, 0) end) return tostring(err)'), /rotation/);
    assert.equal(lua.run('return panel:getComponent("Lua Mode").getOwnerModulator == nil'), true);
    assert.equal(lua.run('return panel:getComponent("Lua Mode").getNumItems == nil'), true, 'on the JUCE box, not the component');
    assert.equal(lua.run('return BigInteger(5).getBit == nil'), true);
    assert.equal(lua.run('return panel:getComponent("Lua Mode").noSuchMethod == nil'), true);
    // What CtrlrX binds is there: the JUCE box inside a combo, with the control's items.
    assert.equal(lua.run('return panel:getComponent("Lua Mode"):getOwnedComboBox():getNumItems()'), 3);
    assert.equal(lua.run('return panel:getComponent("Lua Mode"):getOwnedComboBox():getItemText(1)'), 'Soft');
    assert.equal(lua.run('return panel:getComponent("Lua Mode"):getOwnedComboBox():getText()'), 'Off');
  } finally { lua.close(); }
});

test('what CtrlrX binds and the stand-in leaves undone: drawing is absorbed, moving a value is not reproduced', async () => {
  const lua = await standIn();
  try {
    lua.run(`function probe(mod, value)
      local c = panel:getComponent("Lua Mode")
      c:setOpaque(true)
      c:setToggleState(true)
      panel:sendMidiMessageNow(CtrlrMidiMessage({ 0xB0, 1, value }))
    end`);
    const index = lua.run('for i = 1, panel:getNumModulators() do if panel:getModulatorByIndex(i - 1):getName() == "Lua Mode" then return i end end');
    const [, sent, unknown, ui] = lua.run(`return __ctrlr_learn(${index}, "probe", "5")`).split('|');
    assert.equal(sent, 'B0 01 05');
    assert.match(ui, /CtrlrComponent:setOpaque/);
    assert.match(unknown, /CtrlrComponent:setToggleState/, 'a button set from Lua may send in Ctrlr');
  } finally { lua.close(); }
});

test('the panel\'s own change hook runs before the control\'s method, as Ctrlr calls it', async () => {
  const lua = await standIn();
  try {
    lua.run(`function onAnyChange(mod, value)
      if mod:getName() == "Lua Mode" then panel:sendMidiMessageNow(CtrlrMidiMessage({ 0xB0, 2, value })) end
    end
    function own(mod, value) panel:sendMidiMessageNow(CtrlrMidiMessage({ 0xB0, 3, value })) end
    panel:setProperty("luaPanelModulatorValueChanged", "onAnyChange")`);
    const index = lua.run('for i = 1, panel:getNumModulators() do if panel:getModulatorByIndex(i - 1):getName() == "Lua Mode" then return i end end');
    assert.equal(lua.run(`return __ctrlr_learn(${index}, "own", "7")`).split('|')[1], 'B0 02 07,B0 03 07');
    // A callback that errs is disabled for the rest of the session, as Ctrlr's method manager does;
    // the control's own method still runs.
    lua.run('function onAnyChange(mod, value) error("broken") end');
    const broken = lua.run(`return __ctrlr_learn(${index}, "own", "7")`).split('|');
    assert.equal(broken[1], 'B0 03 07');
    assert.equal(broken[7], '', 'not an error of the control');
    assert.match(lua.run('return __ctrlr_hook_errors()'), /luaPanelModulatorValueChanged \(onAnyChange\), moving Lua Mode: .*broken.*disables it/);
    lua.run(`function onAnyChange(mod, value) panel:sendMidiMessageNow(CtrlrMidiMessage({ 0xB0, 2, value })) end`);
    assert.equal(lua.run(`return __ctrlr_learn(${index}, "own", "7")`).split('|')[1], 'B0 03 07', 'still disabled');
  } finally { lua.close(); }
});

test('each control runs from the panel as loaded: its own tables are put back too, in place', async () => {
  const lua = await standIn();
  try {
    lua.run(`flags = { on = 0, page = { n = 1 } }
    held = flags.page
    function bump(mod, value)
      panel:sendMidiMessageNow(CtrlrMidiMessage({ 0xB0, flags.on, flags.page.n }))
      flags.on = flags.on + 1
      flags.page.n = 5
      flags.page = { n = 9 }
      created = {}
    end
    __ctrlr_loaded()`);
    const index = lua.run('for i = 1, panel:getNumModulators() do if panel:getModulatorByName("Lua Mode") == panel:getModulatorByIndex(i - 1) then return i end end');
    assert.equal(lua.run(`return __ctrlr_learn(${index}, "bump", "1")`).split('|')[1], 'B0 00 01');
    assert.equal(lua.run(`return __ctrlr_learn(${index}, "bump", "1")`).split('|')[1], 'B0 00 01', 'not B0 01 09: the run before is undone');
    assert.equal(lua.run('return rawequal(flags.page, held) and held.n == 1 and created == nil'), true);
  } finally { lua.close(); }
});

test('what else CtrlrX gives a panel: JUCE String and StringArray, its enums, resources, jmax and jmin', async () => {
  const lua = await standIn();
  try {
    assert.equal(lua.run('return String("Filter Cutoff"):substring(0, 6)'), 'Filter', 'counted from 0, handed back as a Lua string');
    assert.equal(lua.run('return String("Filter"):startsWith("Fil") and not String("x"):isNotEmpty() == false'), true);
    assert.equal(lua.run('return type(String(1))'), 'table', 'an object, not text');
    assert.equal(lua.run('return String(1) + String(2.5)'), '12.5', 'JUCE writes a double with %g');
    assert.equal(lua.run('return String(1.5, 3) + ""'), '1.500');
    assert.equal(lua.run('return String("  42 Hz"):getIntValue()'), 42);
    assert.equal(lua.run('return String("0x7F"):getHexValue32()'), 0x7f);
    assert.equal(lua.run('return String("a-b-c"):replace("-", "+")'), 'a+b+c');
    assert.equal(lua.run('return (pcall(function() return "x" .. String("y") end))'), false, 'no .., as in Ctrlr');
    assert.equal(lua.run('local a = StringArray() a:add("x") a:set(5, "y") a:addLines("p\\nq") return a:size() .. a:joinIntoString(",")'), '4x,y,p,q');
    assert.equal(lua.run('return CtrlrPanel.EncodeNormal + CtrlrPanel.Encode16bitMsbFirst'), 8);
    assert.equal(lua.run('return jmax(3, 7) + jmin(3, 7)'), 10);
    assert.equal(lua.run('return MemoryBlock.fromLuaTable({ 0xF0, 0x41 }):toHexString(1)'), 'f0 41');
    assert.equal(lua.run('return MemoryBlock.fromLuaString("AB"):getByte(1)'), 0x42);
    assert.equal(lua.run('resources:getResourceAsImage("knob") return true'), true, 'pictures: drawing');
  } finally { lua.close(); }
});

test('several MIDI messages in one send are split as a receiver reads them', () => {
  assert.deepEqual(splitMessages([0xb0, 99, 1, 0xb0, 98, 20, 0xc0, 5, 0xf0, 0x41, 0xf7]),
    [[0xb0, 99, 1], [0xb0, 98, 20], [0xc0, 5], [0xf0, 0x41, 0xf7]]);
});

// --- Learning ------------------------------------------------------------------------------------

test('each control the Lua sends for is run through its values, and becomes a parameter where the bytes follow from it', async () => {
  const { result, byName } = await learned();
  assert.deepEqual(Object.keys(byName).sort(), ['Lua Bits', 'Lua Depth', 'Lua Mode', 'Lua NRPN', 'Lua Roland']);
  assert.deepEqual(byName['Lua Depth'].reads, ['modulator Lua Mode'], 'learned as the panel loads, and said what it reads');
  assert.equal(byName['Lua Roland'].reads, undefined, 'depends on nothing else');
  const reasons = Object.fromEntries(result.notLearned.map((n) => [n.name, n.reason]));
  assert.match(reasons['Patch Select'], /moves "Pan", which sends MIDI of its own/, 'Ctrlr would send Pan\'s MIDI too');
  assert.match(reasons['Lua Broken'], /stopped with an error: .*notAMethod/);
  assert.match(reasons['Lua From File'], /kept in a file beside the panel/);
  assert.equal(result.load.errors.length, 0);
});

test('the bytes, worked by hand: a Roland DT1 with its checksum, an NRPN, a list, BigInteger and bit', async () => {
  const { harvest, byName } = await learned();
  const { profile } = harvest;
  const id = (name) => byName[name].parameterId;
  // Panel channel 3: the Roland device id is 0x10 + 2. Checksum of 03 00 10 40: 128 - 83 = 0x2D.
  assert.equal(sends(profile, id('Lua Roland'), 64), 'F0 41 12 00 00 00 1D 12 03 00 10 40 2D F7');
  assert.equal(sends(profile, id('Lua Roland'), 0), 'F0 41 12 00 00 00 1D 12 03 00 10 00 6D F7');
  // 1000 = 7 × 128 + 104: the fraction of 1000 / 128 is dropped, as Lua 5.1 drops it.
  assert.equal(sends(profile, id('Lua NRPN'), 1000), 'B2 63 01 B2 62 14 B2 06 07 B2 26 68');
  const nrpn = profile.parameters.find((p) => p.id === id('Lua NRPN'));
  assert.equal(profile.messageRecipes.find((r) => r.id === nrpn.messageRecipe).kind, 'nrpn', 'four CCs that are an NRPN become an NRPN');
  const mode = profile.parameters.find((p) => p.id === id('Lua Mode'));
  assert.deepEqual(mode.choices.map((c) => [c.label, c.value]), [['Off', 0], ['Soft', 10], ['Hard', 20]]);
  assert.equal(sends(profile, id('Lua Mode'), mode.choices[1].id), 'B2 1E 0A');
  assert.equal(sends(profile, id('Lua Depth'), 10), 'B2 1F 0A', 'with Mode as it loads (Off)');
  assert.equal(sends(profile, id('Lua Bits'), 9), 'F0 43 10 7F 09 F7');
  assert.equal(nrpn.ctrlr.learnedFrom, 'sendNrpn', 'the profile says where it came from');
});

test('a method kept in a file beside the panel is learned when the file is given', async () => {
  const { result, byName } = await learned({ methodSource: (m) => (m.name === 'fromFile' ? FROM_FILE : null) });
  assert.ok(byName['Lua From File']);
  assert.ok(!result.notLearned.some((n) => n.name === 'Lua From File'));
  assert.equal(result.load.notRead.length, 0);
});

test('a control is learned from the panel as loaded, whatever the controls run before it changed', async () => {
  // Run twice, in one engine: Lua Mode's run moves Mode; Lua Depth reads Mode. Each is learned
  // from the state the panel loads in, so Depth sends its value as it would with Mode at Off.
  const { harvest, byName } = await learned();
  assert.equal(sends(harvest.profile, byName['Lua Depth'].parameterId, 0), 'B2 1F 00');
  assert.equal(sends(harvest.profile, byName['Lua Depth'].parameterId, 127), 'B2 1F 7F');
});

test('a control whose method the panel does not have sends nothing, as in Ctrlr, which finds no callback', async () => {
  const r = read();
  const mods = [];
  const walk = (n) => { for (const c of n.children ?? []) { if (c.name === 'modulator') mods.push(c); walk(c); } };
  walk(r.root);
  mods.find((m) => m.attributes.name === 'Lua Depth').attributes.luaModulatorValueChange = 'noSuchMethod';
  const result = await learnFromLua(r, harvestProfile(r), { createEngine });
  assert.ok(!result.learned.some((l) => l.name === 'Lua Depth'));
  assert.ok(!result.notLearned.some((n) => n.name === 'Lua Depth'), 'not an error: there is nothing to run');
  assert.equal(result.silent, (await learned()).result.silent + 1);
});

test('source that Lua 5.1 accepted and 5.4 refuses: an unknown escape in a string is the character', () => {
  assert.equal(lua51Source('x = "a\\Ib"'), 'x = "aIb"');
  assert.equal(lua51Source('x = "tab\\tok"'), 'x = "tab\\tok"', 'a real escape stays');
  assert.equal(lua51Source("x = 'it\\'s'"), "x = 'it\\'s'");
  assert.equal(lua51Source('-- "\\I" in a comment\nx = 1'), '-- "\\I" in a comment\nx = 1');
  assert.equal(lua51Source('x = [[ \\I ]]'), 'x = [[ \\I ]]', 'a long string has no escapes');
});

test('files: none exist, asking is harmless, reading one is a dependence', async () => {
  const lua = await standIn();
  try {
    assert.equal(lua.run('return File("C:/patches/a.syx"):existsAsFile()'), false);
    assert.equal(lua.run('return File("C:/patches/a.syx"):getFileNameWithoutExtension()'), 'a');
    assert.equal(lua.run('return File.getSpecialLocation(File.userDocumentsDirectory):getChildFile("x"):getFullPathName()'), '/ctrlr/x');
    assert.equal(lua.run('return CtrlrLuaObjectWrapper({ 1, 2 }):getObject()[2]'), 2);
  } finally { lua.close(); }
});

test('a value literal for Lua is quoted safely', () => {
  assert.equal(luaLiteral('a"b\\c\nd'), '"a\\"b\\\\c\\nd"');
  assert.equal(luaLiteral({ x: [1, 'two'] }), '{["x"]={1,"two"}}');
  assert.equal(luaLiteral('end]]--'), '"end]]--"');
  assert.equal(luaLiteral('\u0001' + '23'), '"\\00123"', 'a control character escaped in three digits, so a digit after it stays a digit');
});
