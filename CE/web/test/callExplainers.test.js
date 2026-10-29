// callExplainers.test.js — what the Values sidebar draws under a call (scripting/callExplainers.js,
// editor/explainViews.js) and the colour each parameter has everywhere (scripting/paramColours.js).
// docs/design/api-descriptions-handoff.md, "The Values sidebar and the hint".
//
// The drawings do the runtime's arithmetic again on the values written in the call, so each is held
// against the runtime here: a drawing that says one thing while the call does another would teach
// the wrong thing in the one place people go to learn it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { readStatement } from '../src/CE_Application/scripting/scriptValues.js';
import { explainCall, returnLines, isFunctionLiteral, callNotes } from '../src/CE_Application/scripting/callExplainers.js';
import { paramColours, paramColour, PARAM_COLOURS } from '../src/CE_Application/scripting/paramColours.js';
import { bitRows, rangeLines, shownResult, listText, codeParts, cellCentre } from '../src/CE_Application/editor/explainViews.js';
import { statementRows, argColour, callAt } from '../src/CE_Application/editor/valueRows.js';
import { scriptApiForTesting } from '../src/CE_Application/scripting/panelRuntime.js';
import { computeChecksum } from '../src/CE_Application/utils/checksums.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';
import { MEMBER_BY_ID } from '../src/CE_Application/scripting/panelApi.js';

const callOf = (src, at, lang = 'lua') => readStatement(src, lang, src.indexOf(at) + 1, {})?.calls?.[0] ?? null;
const api = scriptApiForTesting('', 'explainers');

/* ------------------------------------------------------------------------------ colours */

test('each parameter has one colour, three colours at most, an options table grey', () => {
  assert.deepEqual(paramColours('setBits', ['value', 'start', 'count', 'bits']), ['blue', 'amber', 'amber', 'green'],
    'start and count say where the field is together, so they share one');
  assert.deepEqual(paramColours('sendNRPN', ['channel', 'msb', 'lsb', 'value']), [null, 'amber', 'amber', 'blue']);
  // Not listed: the three in order, then grey; an options table grey wherever it is.
  assert.deepEqual(paramColours('nope', ['a', 'b', 'opts', 'c', 'd']), ['blue', 'amber', null, 'green', null]);
  assert.deepEqual(paramColours(null, ['[, opts]']), [null]);
  assert.equal(paramColour('getBits', ['value', 'start', 'count'], 'count'), 'amber');
  assert.equal(paramColour('getBits', ['value', 'start', 'count'], 'nothing'), null);
  assert.deepEqual(PARAM_COLOURS, ['blue', 'amber', 'green']);
});

test('the call\'s head knows its parameters and their colours, and a row\'s value has its parameter\'s colour', () => {
  const src = 'local b = setBits(0xB4, 4, 3, 5)\n';
  const st = readStatement(src, 'lua', src.indexOf('setBits') + 1, {});
  const call = st.calls[0];
  assert.deepEqual(call.doc.params.map((p) => p.name), ['value', 'start', 'count', 'bits']);
  assert.deepEqual(call.doc.colours, ['blue', 'amber', 'amber', 'green']);
  assert.equal(call.doc.summary, 'Change a setting in a byte.');
  assert.deepEqual(call.args.map((a) => argColour(call, a)), ['blue', 'amber', 'amber', 'green']);
  // The explain row comes after the call's rows.
  assert.deepEqual(statementRows(st).map((r) => r.type), ['call', 'arg', 'arg', 'arg', 'arg', 'explain']);
});

test('the head explains the call the caret is in: the inner one in a call inside another', () => {
  const src = 'local name = fromAscii(bytesSlice(dump, 10, 12))\n';
  const st = readStatement(src, 'lua', src.indexOf('dump') + 1, {});
  assert.equal(callAt(st, src.indexOf('dump') + 1).path, 'ce.midi.slice');
  assert.equal(callAt(st, src.indexOf('fromAscii') + 1).path, 'ce.midi.fromAscii');
  assert.equal(callAt(null, 0), null);
});

/* ----------------------------------------------------------------------------- the bits */

test('setBits as rows: the byte, its bit numbers, the arrow over the field, the new bits, the new byte', () => {
  const view = bitRows(callOf('local b = setBits(0xB4, 4, 3, 5)\n', 'setBits').bits);
  assert.equal(view.verb, 'set');
  const [g] = view.groups;
  assert.equal(g.beforeHex, '0xB4');
  assert.equal(g.cells.map((c) => c.before).join(''), '10110100');
  assert.deepEqual(g.cells.filter((c) => c.field).map((c) => c.bit), [6, 5, 4]);
  assert.equal(g.cells.map((c) => (c.put === null ? '.' : c.put)).join(''), '.101....');
  assert.equal(view.bitsHex, '0x05');
  assert.equal(g.afterHex, '0xD4', 'the runtime\'s answer');
  assert.equal(api.setBits(0xB4, 4, 3, 5), 0xD4);
  assert.deepEqual(g.arrow, { left: 1, right: 3, dot: true, head: true }, 'from bit 4 (the third cell from the left of bit 4) to bit 6');
  assert.equal(cellCentre(3, 22, 2), 3 * 24 + 11);
});

test('getBits as rows: the setting read, moved down to bit 0', () => {
  const view = bitRows(callOf('local w = getBits(0xB4, 4, 3)\n', 'getBits').bits);
  assert.equal(view.verb, 'get');
  assert.equal(view.read.hex, '0x03');
  assert.equal(view.read.value, api.getBits(0xB4, 4, 3));
  assert.equal(view.readCells.map((c) => c.v).join(''), '00000011');
  assert.deepEqual(view.readCells.filter((c) => c.field).map((c) => c.bit), [2, 1, 0]);
});

test('a value only known when the script runs: the field and the arrow, and empty cells', () => {
  const view = bitRows(callOf('local b = setBits(byte, 4, 3, wave)\n', 'setBits').bits);
  const [g] = view.groups;
  assert.equal(g.beforeHex, '');
  assert.ok(g.cells.every((c) => c.before === null));
  assert.deepEqual(g.cells.filter((c) => c.field).map((c) => c.bit), [6, 5, 4]);
  assert.ok(g.arrow);
  assert.equal(view.result, null);
  assert.equal(bitRows(null), null);
});

/* ------------------------------------------------------------------------- the drawings */

test('to7bit: the number in binary, cut into groups of 7, and the bytes the runtime returns', () => {
  const ex = callOf('local b = to7bit(1000, 2)\n', 'to7bit').explain;
  assert.equal(ex.kind, 'sevenBit');
  assert.equal(ex.binary, '00001111101000');
  assert.deepEqual(ex.groups.map((g) => g.bits), ['0000111', '1101000']);
  assert.deepEqual(ex.bytes.map((b) => b.byte), api.to7bit(1000, 2));
  const lsb = callOf('local b = to7bit(1000, 2, "lsb")\n', 'to7bit').explain;
  assert.deepEqual(lsb.bytes.map((b) => b.byte), api.to7bit(1000, 2, 'lsb'));
  assert.deepEqual(lsb.bytes.map((b) => b.label), ['first', 'second']);
  assert.equal(callOf('local b = to7bit(20000, 2)\n', 'to7bit').explain, undefined, 'too big for two bytes: nothing drawn');
  assert.equal(callOf('local b = to7bit(v, 2)\n', 'to7bit').explain.value, null, 'a value not written out: empty groups');
  assert.equal(listText([7, 104], 'lua'), '{7, 104}');
  assert.equal(listText([7, 104], 'javascript'), '[7, 104]');
});

test('bytesRead: the message numbered from 0, the bytes read marked, and what they make', () => {
  const ex = callOf('local v = bytesRead("F0 43 10 4C 00 00 07 68 F7", 6, 2)\n', 'bytesRead').explain;
  assert.equal(ex.kind, 'bytes');
  assert.deepEqual(ex.cells.filter((c) => c.field).map((c) => [c.index, c.hex]), [[6, '07'], [7, '68']]);
  assert.equal(ex.value, api.bytesRead('F0 43 10 4C 00 00 07 68 F7', 6, 2));
  assert.equal(ex.formula, '7 × 128 + 104');
  const eight = callOf('local v = bytesRead({1, 2, 3}, 0, 2, { bits = 8, order = "lsb" })\n', 'bytesRead').explain;
  assert.equal(eight.value, api.bytesRead([1, 2, 3], 0, 2, { bits: 8, order: 'lsb' }));
  // A long dump: a window around the bytes read.
  const long = Array.from({ length: 40 }, (_, i) => i);
  const win = callOf(`local v = bytesRead({${long.join(', ')}}, 20, 2)\n`, 'bytesRead').explain;
  assert.ok(win.before && win.after);
  assert.ok(win.cells.length <= 12);
  assert.deepEqual(win.cells.filter((c) => c.field).map((c) => c.index), [20, 21]);
  // Past the end is the runtime's to refuse, in its own words: nothing drawn.
  assert.equal(callOf('local v = bytesRead("F0 F7", 1, 2)\n', 'bytesRead').explain, undefined);
  // The message only known when the script runs: the bytes read, empty.
  const later = callOf('local v = bytesRead(msg, 6, 2)\n', 'bytesRead').explain;
  assert.ok(later.cells.every((c) => c.hex === null));
  assert.equal(later.value, null);
});

test('sendNRPN: the four messages the runtime sends', () => {
  const ex = callOf('sendNRPN(1, 0, 5, 9000)\n', 'sendNRPN').explain;
  assert.deepEqual(ex.lines.map((l) => l.bytes.join(' ')), ['B0 63 00', 'B0 62 05', 'B0 06 46', 'B0 26 28']);
  clearScriptTrace();
  api.sendNRPN(1, 0, 5, 9000);
  const sent = get(scriptTrace).map((t) => String(t.message ?? '')).join('\n');
  assert.match(sent, new RegExp(ex.lines.map((l) => l.bytes.join(' ')).join(' ')));
  const rpn = callOf('sendRPN(2, 0, 0, 2)\n', 'sendRPN').explain;
  assert.deepEqual(rpn.lines.map((l) => l.cc), [101, 100, 6, 38]);
  assert.equal(rpn.status, 'B1');
  assert.equal(callOf('sendNRPN(1, 0, 5, 20000)\n', 'sendNRPN').explain, undefined, 'a value past 16383 is the runtime\'s to refuse');
});

test('checksum: the bytes added up and the steps, ending at the runtime\'s checksum', () => {
  const ex = callOf('local s = checksum("roland", {0x40, 0x00, 0x7F, 0x00})\n', 'checksum').explain;
  assert.equal(ex.type, 'roland-7bit');
  assert.equal(ex.result, 0x41);
  assert.equal(ex.result, computeChecksum('roland', [0x40, 0x00, 0x7F, 0x00]));
  assert.deepEqual(ex.steps.map((s) => s.right), ['= 191', '= 63', '= 65']);
  const sum = callOf('local s = checksum("sum-7bit", "01 02 7F")\n', 'checksum').explain;
  assert.equal(sum.result, computeChecksum('sum-7bit', [1, 2, 0x7F]));
  assert.equal(callOf('local s = checksum("nope", {1})\n', 'checksum').explain, undefined);
});

test('scale: two ranges, the value on the first and where the runtime puts it on the second', () => {
  const ex = callOf('local hz = scale(64, 0, 127, 20, 20000)\n', 'scale').explain;
  assert.ok(Math.abs(ex.result - api.scale(64, 0, 127, 20, 20000)) < 1e-9);
  const view = rangeLines(ex);
  assert.equal(view.result, '≈ 10089');
  assert.ok(view.x > view.pad && view.x < view.width - view.pad);
  const outside = callOf('local v = scale(200, 0, 127, 0, 100)\n', 'scale').explain;
  assert.equal(outside.outside, true);
  assert.equal(rangeLines(outside).x, rangeLines(outside).width - rangeLines(outside).pad, 'held at the end it is past');
  assert.equal(callOf('local v = scale(k, 0, 127, 0, 100)\n', 'scale').explain.value, null);
  assert.equal(shownResult(50), '50');
  assert.equal(shownResult(50.394), '≈ 50.39');
});

test('animateStop and animateFinish say which of the two they are', () => {
  assert.deepEqual(explainCall('animateStop', []), { kind: 'stopOrFinish', verb: 'stop' });
  assert.deepEqual(explainCall('animateFinish', []), { kind: 'stopOrFinish', verb: 'finish' });
  assert.equal(explainCall('sendCC', []), null);
});

/* ------------------------------------------------------------- answers and good to know */

test('what a function written in place returns, line by line', () => {
  const src = 'interceptMidiIn(function(bytes)\n  if bytes[1] == 0xFE then return false end -- drop\n  if bytes[1] == 0xF8 then return { 0xF8 } end\n  return nil\nend)\n';
  const call = callOf(src, 'intercept');
  assert.deepEqual(call.returns.map((r) => [r.key, r.lines]), [['bytes', [3]], ['false', [2]], ['nothing', [4]]]);
  const js = 'interceptMidiIn((bytes) => {\n  if (bytes[0] === 0xFE) return false;\n  return;\n});\n';
  assert.deepEqual(callOf(js, 'intercept', 'javascript').returns.map((r) => r.lines), [[], [2], [3]]);
  // A function named, not written here: the table without lines.
  const named = callOf('interceptMidiIn(filter)\n', 'intercept');
  assert.deepEqual(named.returns.map((r) => r.lines), [[], [], []]);
  assert.equal(returnLines({ text: 'filter', range: { start: 0 } }, () => 1), null);
  assert.equal(isFunctionLiteral({ text: 'function(b) end' }), true);
  assert.equal(isFunctionLiteral({ text: '(b) => b' }), true);
  assert.equal(isFunctionLiteral({ text: 'lambda b: b' }), true);
  assert.equal(isFunctionLiteral({ text: 'onMessage' }), false);
});

test('Good to know: three lines at most, a check about this script when it can see it, a dot when it cannot', () => {
  const ok = callOf('panelBatch(function()\n  panelCreate("knob", {})\nend)\n', 'panelBatch');
  assert.deepEqual(ok.notes.map((n) => n.mark), ['ok', 'dot', 'dot']);
  const waits = callOf('ce.panel.batch(async () => {\n  await load();\n});\n', 'ce.panel', 'javascript');
  assert.equal(waits.notes[0].mark, 'warn');
  const named = callOf('panelBatch(build)\n', 'panelBatch');
  assert.equal(named.notes[0].mark, 'dot', 'a function named elsewhere cannot be checked: never an unchecked ✓');
  assert.equal(named.notes[0].text, MEMBER_BY_ID.panelBatch.notes[0].text);
  // The Lua note only in Lua, and naming the list the script reads.
  const lua = callOf('local v = bytesRead(msg, 6, 2)\n', 'bytesRead');
  assert.equal(lua.notes[0].text, 'Offsets count from 0, also in Lua: offset 6 is msg[7].');
  assert.equal(callOf('local v = bytesRead("F0 43 10 4C 00 00 07 68 F7", 6, 2)\n', 'bytesRead').notes[0].text, 'Offsets count from 0, also in Lua: offset 6 is the 7th byte.');
  const js = callOf('const v = bytesRead(msg, 6, 2);\n', 'bytesRead', 'javascript');
  assert.ok(!js.notes.some((n) => /Lua/.test(n.text)));
  assert.deepEqual(callNotes({ notes: ['a', 'b', 'c', 'd'] }, {}, []).map((n) => n.text), ['a', 'b', 'c']);
  assert.deepEqual(codeParts('use `ce.anim.finish()` now'), [{ text: 'use ', code: false }, { text: 'ce.anim.finish()', code: true }, { text: ' now', code: false }]);
});

/* ---------------------------------------------------------------------- the API's words */

test('a description with its detail moved out keeps every fact somewhere a reader finds it', () => {
  const words = (id) => {
    const m = MEMBER_BY_ID[id];
    return [m.summary, m.example, ...(m.params ?? []).map((p) => p.summary), ...(m.notes ?? []).map((n) => (typeof n === 'string' ? n : n.text)),
      ...(m.returns ?? []).map((r) => `${r.when} ${r.then}`)].filter(Boolean).join(' ');
  };
  // The facts the old descriptions held, each still said.
  assert.match(words('getBits'), /1 to 32/);
  assert.match(words('getBits'), /not read as 0/);
  assert.match(words('setBits'), /not cut down to fit/);
  assert.match(words('setBits'), /list passed in is not changed/);
  assert.match(words('bytesRead'), /from 0/);
  assert.match(words('bytesRead'), /1 to 4/);
  assert.match(words('panelBatch'), /await/);
  assert.match(words('panelBatch'), /no undo/);
  assert.match(words('panelBatch'), /fails with an error/);
  assert.match(words('interceptMidiIn'), /dropped/);
  assert.match(words('animateStop'), /every animation/);
  assert.match(words('animateStop'), /false/);
  assert.match(words('nowMs'), /not the time of day/);
  assert.match(words('scale'), /norm\(\)/);
  assert.match(words('sendNRPN'), /Non-Registered Parameter Number/);
  assert.match(words('sendNRPN'), /16383/);
  assert.match(words('to7bit'), /16383/);
  assert.match(words('sendCC'), /Control Change/);
  assert.match(words('sendRPN'), /101 and 100/);
  assert.match(words('sendRPN'), /fine tuning and 2 coarse tuning/);
  assert.match(words('sendSongPosition'), /Song Position Pointer/);
  assert.match(words('sendSongPosition'), /six clock ticks/);
  assert.match(words('sendMidi'), /longer run/);
  assert.match(words('sendMidi'), /Nothing is added or changed/);
  assert.match(words('sendNote'), /a letter from A to G, then # or b if it has one, then the octave, in any case/);
  assert.match(words('sendNote'), /0 means note off/);
  assert.match(words('sendNote'), /until sendNoteOff/);
  assert.match(words('feedMidi'), /interceptMidiIn sees the message first/);
  assert.match(words('routeMidi'), /noTransmit/);
  assert.match(words('sendNoteOff'), /0 when left out/);
  assert.match(words('sendNoteOff'), /its own note off/);
  assert.match(words('sendProgramChange'), /Bank Select/);
  assert.match(words('sendProgramChange'), /count from 1/);
  assert.match(words('sendPitchBend'), /8192 is the centre/);
  assert.match(words('sendPitchBend'), /back to the centre/);
  assert.match(words('sendAftertouch'), /polyphonic aftertouch/);
  assert.match(words('sendAftertouch'), /channel pressure/);
  assert.match(words('sendClock'), /24 ticks/);
  assert.match(words('sendTransport'), /Case-insensitive/);
  assert.match(words('sendSysex'), /System Exclusive/);
  assert.match(words('sendSysex'), /F04110/);
  assert.match(words('panic'), /All Sound Off/);
  assert.match(MEMBER_BY_ID.panic.params[0].fields.find((f) => f.name === 'channel').summary, /"all"/);
  assert.match(words('from7bit'), /"lsb"/);
  assert.match(words('to14bit'), /16383/);
  assert.match(words('toAscii'), /spaces/);
  assert.match(words('toSigned'), /two's complement/);
  assert.match(words('toSigned'), /unchanged/);
  assert.match(words('bytesWrite'), /not changed/);
  assert.match(words('bytesWrite'), /list grows/);
  assert.match(words('bytesWrite'), /does not fit/);
  assert.match(words('bytesWrite'), /other than bits and order/);
  assert.match(words('bytesSlice'), /to the end/);
  assert.match(words('bytesPut'), /cannot start past the end/);
  assert.match(words('bytesFind'), /without a message/);
  assert.match(words('bytesToHex'), /console/);
  assert.match(words('bytesFromHex'), /0x/);
  assert.match(words('bytesToBase64'), /= padding/);
  assert.match(words('bytesFromBase64'), /line breaks are ignored/);
  // ce.math: the facts its old descriptions held. How a colour is read and that random numbers are
  // seeded are said once, in the chapter's introduction (generate-scripting-manual.mjs).
  assert.match(words('lighten'), /Default: 0\.4/);
  assert.match(words('darken'), /Default: 0\.55/);
  assert.match(words('darken'), /opposite way/);
  assert.match(words('mixColour'), /straight line/);
  assert.match(words('mixColour'), /Left out: 0/);
  assert.match(words('colourAlpha'), /AARRGGBB/);
  assert.match(words('colourAlpha'), /ce\.draw\.opacity/);
  assert.match(words('colourAlpha'), /already has is replaced/);
  assert.match(words('hexToRgb'), /0 ↔ 255/);
  assert.match(words('hexToRgb'), /alpha is ignored/);
  assert.match(words('rgbToHex'), /held at 0 or 255/);
  assert.match(words('rgbToHex'), /fraction is rounded/);
  assert.match(words('colourFromArgb'), /RRGGBBAA to a drawing/);
  assert.match(words('colourFromArgb'), /returned solid/);
  assert.match(words('colourFromRgba'), /alpha last/);
  assert.match(words('colourFromRgba'), /returned solid/);
  assert.match(words('hexToHsl'), /not rounded/);
  assert.match(words('hexToHsl'), /grey has hue 0/);
  assert.match(words('hslToHex'), /wraps round/);
  assert.match(words('hslToHex'), /ce\.math\.hsl/);
  assert.match(words('clamp'), /Must be below hi/);
  assert.match(words('round'), /-2\.5 gives -2/);
  assert.match(words('snap'), /0 leaves the value unchanged/);
  assert.match(words('snap'), /Left out: an error in the console/);
  assert.match(words('curve'), /"linear"/);
  assert.match(words('curve'), /ce\.math\.map/);
  assert.match(words('curve'), /not held at 0 or 1/);
  assert.match(words('lerp'), /not held at 0 or 1/);
  assert.match(words('lerp'), /Left out: an error in the console/);
  assert.match(words('wrap'), /11 in Lua and -1 in JavaScript/);
  assert.match(words('wrap'), /never equals hi/);
  assert.match(words('mapCurve'), /later one wins/);
  assert.match(words('mapCurve'), /held at that point's y/);
  assert.match(words('mapCurve'), /sorted by x/);
  assert.match(words('quantizeTo'), /lower one wins/);
  assert.match(words('quantizeTo'), /value is returned unchanged/);
  assert.match(words('randomChoice'), /negative weight counts as 0/);
  assert.match(words('randomChoice'), /one random number/);
  assert.match(words('dbToGain'), /0 dB gives 1/);
  assert.match(words('gainToDb'), /-144/);
  assert.match(words('norm'), /held at 0 or 1/);
  assert.match(words('norm'), /ce\.math\.denorm/);
  assert.match(words('denorm'), /held at 0 or 1/);
  assert.match(words('bipolar'), /0\.5 gives 0/);
  assert.match(words('unipolar'), /0 gives 0\.5/);
  assert.match(words('fold'), /ce\.math\.wrap/);
  assert.match(words('fold'), /modulation depths/);
  assert.match(words('indexOfRange'), /last slot/);
  assert.match(words('crossfade'), /dips audibly/);
  assert.match(words('crossfade'), /Default: "linear"/);
  assert.match(words('approach'), /straight to the target/);
  assert.match(words('approach'), /without a timer/);
  assert.match(words('roundTo'), /not text/);
  assert.match(words('almost'), /0\.000000001/);
  assert.match(words('minOf'), /Empty or left out: no result/);
  assert.match(words('maxOf'), /Empty or left out: no result/);
  assert.match(words('sumOf'), /Empty or left out: 0/);
  assert.match(words('meanOf'), /Empty or left out: no result/);
  assert.match(words('blend'), /shorter one/);
  assert.match(words('blend'), /ce\.math\.lerp/);
  assert.match(words('randomFloat'), /never reaches/);
  assert.match(words('randomFloat'), /whole numbers/);
  assert.match(words('randomGaussian'), /two thirds/);
  assert.match(words('randomGaussian'), /two random numbers/);
  assert.match(words('randomWalk'), /bounces back/);
  assert.match(words('randomWalk'), /no limits/);
  assert.match(words('randomBool'), /Default: 0\.5/);
  assert.match(words('randomBool'), /probability gate/);
  assert.match(words('shuffle'), /not changed/);
  assert.match(words('shuffle'), /same seed always shuffles/);
  assert.match(words('toDegrees'), /ce\.draw/);
  assert.match(words('toRadians'), /sin and cos/);
  assert.match(words('distance'), /XY pads/);
  assert.match(words('angleOf'), /twelve o'clock/);
  assert.match(words('angleOf'), /straight above gives 0/);
  assert.match(words('polar'), /tip of a knob's pointer/);
  assert.match(words('polar'), /y counts downwards/);
  assert.match(words('shapeCurve'), /Default: 1\.6/);
  assert.match(words('shapeCurve'), /different family/);
  assert.match(words('shapeCurve'), /Macro/);
  assert.match(words('deadzone'), /Expression Router/);
  assert.match(words('deadzone'), /stretched/);
  assert.match(words('weightsFor'), /adding up to 1/);
  assert.match(words('weightsFor'), /ce\.math\.blendBy/);
  assert.match(words('blendBy'), /0 or less: 0/);
  assert.match(words('blendBy'), /need not add up to 1/);
  assert.match(words('tickStops'), /Default: 11/);
  assert.match(words('tickStops'), /line up/);
  assert.match(words('dbPosition'), /-60/);
  assert.match(words('dbPosition'), /\+6/);
  assert.match(words('smooth'), /Default: 0\.0001/);
  assert.match(words('smooth'), /ce\.math\.approach/);
  assert.match(words('hysteresis'), /Schmitt trigger/);
  assert.match(words('hysteresis'), /Must be below high/);
  assert.match(words('median'), /even count/);
  assert.match(words('median'), /stray spike/);
  assert.match(words('euclid'), /64/);
  assert.match(words('euclid'), /Arpeggiator/);
  assert.match(words('unshape'), /no exact reverse/);
  assert.match(words('unshape'), /taper/);
  assert.match(words('random'), /whole number/);
  assert.match(words('random'), /random\(1\.5, 3\.5\) gives 2 or 3/);
  assert.match(words('random'), /never 1/);
  assert.match(words('randomSeed'), /0 uses the default/);
  assert.match(words('randomSeed'), /never affects another script/);
  assert.match(words('randomStream'), /ends in an error/);
  assert.match(words('randomStream'), /drum pattern/);
  // And the descriptions themselves are the one plain sentence: no example, no parameter names.
  const midiRest = ['sendCC', 'sendRPN', 'sendSongPosition', 'sendMidi', 'sendNote', 'feedMidi', 'routeMidi', 'sendNoteOff',
    'sendProgramChange', 'sendPitchBend', 'sendAftertouch', 'sendClock', 'sendTransport', 'sendSysex', 'panic', 'from7bit',
    'to14bit', 'from14bit', 'toNibbles', 'fromNibbles', 'nibblize', 'denibblize', 'toAscii', 'fromAscii', 'toOffset',
    'fromOffset', 'toSigned', 'fromSigned', 'bytesWrite', 'bytesSlice', 'bytesPut', 'bytesFind', 'bytesToHex', 'bytesFromHex',
    'bytesToBase64', 'bytesFromBase64'];
  const mathRest = ['lighten', 'darken', 'mixColour', 'colourAlpha', 'hexToRgb', 'rgbToHex',
    'colourFromArgb', 'colourFromRgba', 'hexToHsl', 'hslToHex', 'clamp', 'round', 'snap', 'curve', 'lerp',
    'wrap', 'mapCurve', 'quantizeTo', 'randomChoice', 'dbToGain', 'gainToDb', 'norm', 'denorm', 'bipolar',
    'unipolar', 'fold', 'indexOfRange', 'crossfade', 'approach', 'roundTo', 'almost', 'minOf', 'maxOf',
    'sumOf', 'meanOf', 'blend', 'randomFloat', 'randomGaussian', 'randomWalk', 'randomBool', 'shuffle',
    'toDegrees', 'toRadians', 'distance', 'angleOf', 'polar', 'shapeCurve', 'deadzone', 'weightsFor',
    'blendBy', 'tickStops', 'dbPosition', 'smooth', 'hysteresis', 'median', 'euclid', 'unshape', 'random',
    'randomSeed', 'randomStream'];
  for (const id of ['getBits', 'setBits', 'bytesRead', 'to7bit', 'sendNRPN', 'scale', 'panelBatch', 'interceptMidiIn', 'animateStop', 'nowMs', ...midiRest, ...mathRest]) {
    const s = MEMBER_BY_ID[id].summary;
    assert.ok(!s.includes('`'), `${id}: no code in the description`);
    assert.ok(s.split(/(?<=\.)\s/).length <= 2, `${id}: two sentences at most`);
  }
});
