// scriptPreludeAgreement.test.js — the C++ engines' preludes and the WebView runtime have to
// compute the SAME numbers, not merely define the same names.
//
// Name parity (panelApiParity.test.js) would still pass if to7bit packed msb-first in one runtime
// and lsb-first in another, or if checksum used a different polynomial — and a script that packs a
// SysEx value in the editor and unpacks it in the shipped plugin would quietly corrupt the patch.
// So this extracts each prelude from its .cpp source and RUNS it: Lua under wasmoon (the same Lua
// 5.4 the runtime embeds), JavaScript under node:vm, Python under python3 when the machine has one.
//
// Python was checked by NAME only until phase 12, on the grounds that CPython is not guaranteed in
// a node test run. The grounds were real; the conclusion was too weak. Where python3 IS present the
// prelude runs for free, and the first run of it found quantizeNote raising TypeError on every
// call. So it runs when it can and skips with a reason when it cannot, and
// PythonScriptEngineTests.cpp still covers the engine where CPython definitely exists.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { get } from 'svelte/store';

import { resetScriptStateForTesting, sampleEnvelope, scriptApiForTesting } from '../src/CE_Application/scripting/panelRuntime.js';
import {
  MEMBER_BY_ID, memberRuntime, optionChecks, RUNTIME_WEBVIEW,
} from '../src/CE_Application/scripting/panelApi.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';
import {
  JSON_CASES, JSON_DECODE_CASES, JSON_REJECTS, NATIVE_ENCODE_CASES,
} from './fixtures/jsonCases.js';

const here = dirname(fileURLToPath(import.meta.url));
const scriptingDir = join(here, '..', '..', 'src', 'Scripting');

function findPython3(spawnSync) {
  // Windows commonly installs Python 3 as python.exe, without a python3 alias.
  return [process.env.CEDITOR_TEST_PYTHON, 'python3', 'python'].filter(Boolean).find(command => {
    const probe = spawnSync(command, ['-c', 'import sys; assert sys.version_info.major == 3'], { encoding: 'utf8' });
    return !probe.error && probe.status === 0;
  });
}

function extractRawString(file, tag) {
  // Normalize CRLF from Windows checkouts (core.autocrlf): the preludes are authored LF, and the
  // C++ compiler sees them LF, so the agreement tests must too.
  const source = readFileSync(join(scriptingDir, file), 'utf8').replace(/\r\n/g, '\n');
  const open = `R"${tag}(`;
  const start = source.indexOf(open);
  assert.notEqual(start, -1, `could not find the ${tag} prelude in ${file}`);
  const end = source.indexOf(`)${tag}"`, start);
  assert.notEqual(end, -1, `unterminated ${tag} prelude in ${file}`);
  return source.slice(start + open.length, end);
}

const web = scriptApiForTesting();

// The cases every runtime must agree on. Each is [helper, args] and gets compared against what the
// WebView runtime returns, since that is the one the editor shows the author.
const CASES = [
  ['clamp', [5, 0, 3]], ['clamp', [-1, 0, 3]], ['clamp', [2, 0, 3]],
  ['round', [2.5]], ['round', [2.4]], ['round', [-2.5]],
  ['scale', [64, 0, 127, 0, 1000]], ['scale', [5, 0, 0, 9, 10]],
  ['snap', [7, 5]], ['snap', [7, 0]],
  ['lerp', [0, 10, 0.25]],
  // Helpers that read their numbers through the prelude's own __num. A second __num, defined for
  // the byte helpers' messages, once replaced it in Python and made every one of these raise there.
  ['norm', [5, 0, 10]], ['denorm', [0.5, 0, 10]], ['bipolar', [0.25]], ['unipolar', [-0.5]],
  ['fold', [12, 0, 10]], ['roundTo', [3.14159, 2]], ['toDegrees', [Math.PI]], ['toRadians', [180]],
  ['distance', [0, 0, 3, 4]], ['euclid', [8, 3]], ['almost', [0.1 + 0.2, 0.3]],
  ['indexOfRange', [0.5, 4]], ['approach', [0, 10, 0.5]],
  ['curve', [0.5, 'exp']], ['curve', [0.25, 'log']], ['curve', [0.5, 's']], ['curve', [0.5, 'linear']],
  ['noteName', [60]], ['noteName', [61]], ['noteName', [0]],
  // The panel's spelling, selected by the second argument being PRESENT — so all three states
  // (absent, true, false) are cases, not just the two values.
  ['noteName', [63, true]], ['noteName', [61, false]], ['noteName', [63, false]], ['noteName', [-1, true]],
  ['noteNumber', ['C3']], ['noteNumber', ['A#4']], ['noteNumber', ['nonsense']],
  // Every accidental spelling the panel can print, plus the two that must be REFUSED. "Eb4"
  // returning 0 rather than nothing is how a misspelling used to play C-1 in silence.
  ['noteNumber', ['C♯4']], ['noteNumber', ['Eb4']], ['noteNumber', ['E♭4']],
  ['noteNumber', ['Db-1']], ['noteNumber', ['Cb3']], ['noteNumber', ['Fb4']],
  ['noteNumber', ['B#3']], ['noteNumber', ['H4']], ['noteNumber', ['C']],
  ['noteNumber', [60]],
  ['noteSpelling', [60, 'major']], ['noteSpelling', [60, 'minor']], ['noteSpelling', ['F4', 'major']],
  ['noteSpelling', ['A4', 'minor']], ['noteSpelling', [60]], ['noteSpelling', [60, 'bogus']],
  ['noteSpelling', ['c4', 'major']], ['inScale', ['c4', 60, 'major']], ['scaleDegree', [60, 'c4', 'major']],
  ['inScale', [62, 60, 'major']], ['inScale', [61, 60, 'major']], ['inScale', [61, 60]],
  ['inScale', [75, 60, 'minor']], ['inScale', [61, 60, 'bogus']],
  ['scaleDegree', [60, 60, 'major']], ['scaleDegree', [67, 60, 'major']],
  ['scaleDegree', [61, 60, 'major']], ['scaleDegree', [70, 60, 'minor']],
  ['scaleDegree', [67, 60, 'bogus']],
  ['chordQuality', [[60, 64, 67]]], ['chordQuality', [[60, 63, 67]]], ['chordQuality', [[60, 63, 70]]],
  ['chordQuality', [[60, 63, 66]]], ['chordQuality', [[60, 63, 66, 69]]], ['chordQuality', [[60, 63, 66, 70]]],
  ['chordQuality', [[60, 64, 68]]], ['chordQuality', [[60, 62, 67]]], ['chordQuality', [[60, 65, 67]]],
  ['chordQuality', [[60, 64, 67, 71]]], ['chordQuality', [[60, 64, 67, 70]]], ['chordQuality', [[60, 63, 67, 71]]],
  // Inverted and out of order — the quality is read from the LOWEST note, so both must still name
  // a chord rather than depending on how the caller happened to build the list.
  ['chordQuality', [[67, 60, 64]]], ['chordQuality', [[]]],
  // ce.time's grid. Divisions first, because every other verb here takes one and a fraction that
  // differs by a runtime is a sequencer running at the wrong rate with nothing failing.
  ['beatsPerDivision', ['1/16']], ['beatsPerDivision', ['1/8T']], ['beatsPerDivision', ['1/4D']],
  ['beatsPerDivision', ['1/1']], ['beatsPerDivision', ['1/32']], ['beatsPerDivision', ['1/3']],
  ['stepAt', [2.5, '1/16']], ['stepAt', [0, '1/16']], ['stepAt', [-1, '1/16']],
  ['stepAt', [2.5, '1/8T']], ['stepAt', [2.5, 'nope']],
  // Any case is the same division: the names differ only by D and T.
  ['beatsPerDivision', ['1/8t']], ['beatsPerDivision', ['1/4d']], ['stepAt', [2.5, '1/16t']],
  ['swingOffset', [1, 0.5, '1/8d']],
  ['swingOffset', [0, 0.5, '1/16']], ['swingOffset', [1, 0.5, '1/16']],
  ['swingOffset', [3, 1, '1/8']], ['swingOffset', [-1, 0.5, '1/16']],
  ['swingOffset', [1, 2, '1/16']], ['swingOffset', [1, 0.5, 'nope']],
  ['tapTempo', [[0, 500, 1000, 1500]]], ['tapTempo', [[0, 500, 5000, 5500]]],
  ['tapTempo', [[1000]]], ['tapTempo', [[]]], ['tapTempo', [[0, 500, 1000], 100]],
  ['tapTempo', [[0, 10]]], ['tapTempo', [[0, 100000]]],
  ['clockTempo', [[20.8, 20.8, 20.8]]], ['clockTempo', [[20, 21, 100, 20]]],
  ['clockTempo', [[]]], ['clockTempo', [[0, -1]]],
  // Colour. Hex formatting is where four runtimes drift silently: a missing zero-pad, a rounding
  // that goes the other way at .5, a case that differs. Every one produces a colour that is nearly
  // right in one engine, and nothing fails.
  ['lighten', ['336699']], ['lighten', ['#336699', 0.75]], ['lighten', ['66336699']],
  ['lighten', ['000000', 0]], ['lighten', ['nope']], ['lighten', ['']],
  ['darken', ['336699']], ['darken', ['FFFFFF', 0.1]], ['darken', ['010101', 0.5]],
  ['mixColour', ['000000', 'FFFFFF', 0.5]], ['mixColour', ['FF0000', '00FF00', 0.25]],
  ['mixColour', ['000000', 'FFFFFF', 5]], ['mixColour', ['000000', 'zz', 0.5]],
  ['colourAlpha', ['336699', 0.4]], ['colourAlpha', ['336699', 0]], ['colourAlpha', ['336699', 1]],
  ['colourAlpha', ['336699', 2]],
  // Eight digits are AARRGGBB, as a property reads them, and an amount may be text that is a number.
  ['lighten', ['#5B9BD580', 0]], ['darken', ['FF336699', 0.5]], ['colourAlpha', ['80336699', '0.5']],
  ['lighten', ['336699', '0.25']], ['lighten', ['336699', null]], ['colourAlpha', ['336699', 1.5]],
  // A colour written with its alpha in a stated place: the form every reader reads one way, or a
  // refusal in the same words.
  ['colourFromArgb', ['#80123456']], ['colourFromArgb', ['80123456']], ['colourFromArgb', ['FF5B9BD5']],
  ['colourFromArgb', ['#8123']], ['colourFromArgb', ['#abc']], ['colourFromArgb', ['5b9bd5']],
  ['colourFromRgba', ['#12345680']], ['colourFromRgba', ['12345680']], ['colourFromRgba', ['#5B9BD5FF']],
  ['colourFromRgba', ['#1238']], ['colourFromRgba', ['#ABCDEF']], ['colourFromRgba', ['abc']],
  ['colourFromArgb', ['#12345']], ['colourFromArgb', ['nope']], ['colourFromArgb', ['#80123456 ']],
  ['colourFromRgba', ['red']], ['colourFromRgba', [0x12345680]], ['colourFromArgb', [1.5]],
  ['colourFromArgb', [null]], ['colourFromRgba', [true]], ['colourFromArgb', ['##123456']],
  ['colourFromRgba', ['#1234567g']], ['colourFromArgb', ['#80123456\n']],
  ['rgbToHex', [51, 102, 153]], ['rgbToHex', [0, 0, 0]], ['rgbToHex', [300, -5, 127.5]],
  ['hslToHex', [210, 50, 40]], ['hslToHex', [0, 0, 100]], ['hslToHex', [359, 100, 50]],
  ['from14bit', [1, 0]], ['from14bit', [127, 127]],
  ['from7bit', [[1, 0], 'msb']], ['from7bit', [[1, 0], 'lsb']], ['from7bit', [[1, 0]]],
  ['fromNibbles', [0xA, 0xB]],
  ['fromAscii', [[72, 105]]],
  ['toOffset', [-64, 64]], ['fromOffset', [0, 64]],
  ['toSigned', [-1, 8]], ['fromSigned', [255, 8]], ['fromSigned', [127, 8]],
  // All eleven checksum algorithms in all four runtimes (design doc §48). This is the case that most
  // needs to be here: a checksum that differs between the editor and the export means the synth
  // accepts a dump from one and rejects it from the other, silently. The CRCs especially — Lua's
  // integers are 64-bit, JavaScript's bitwise operators are 32-bit SIGNED, and Python's are
  // arbitrary-precision, so the same three lines of shifting give three different answers unless
  // each is masked correctly.
  ['checksum', ['roland', [0x01, 0x02, 0x03]]],
  ['checksum', ['yamaha', [0x40, 0x11, 0x00, 0x7F, 0x2A]]],
  ['checksum', ['sum', [0x01, 0x02, 0x03]]],
  ['checksum', ['xor', [0x01, 0x02, 0x03]]],
  ['checksum', ['sum-7bit', [0x40, 0x00, 0x7F, 0x03, 0x0A]]],
  ['checksum', ['roland-7bit', [0x40, 0x00, 0x7F, 0x03, 0x0A]]],
  ['checksum', ['ones-complement-7bit', [0x40, 0x00, 0x7F, 0x03, 0x0A]]],
  ['checksum', ['xor-7bit', [0x40, 0x00, 0x7F, 0x03, 0x0A]]],
  ['checksum', ['offset-7bit', [0x40, 0x00, 0x7F, 0x03, 0x0A]]],
  ['checksum', ['sum-8bit', [0x40, 0x00, 0x7F, 0x03, 0x0A]]],
  ['checksum', ['twos-complement-8bit', [0x40, 0x00, 0x7F, 0x03, 0x0A]]],
  ['checksum', ['crc8', [0x40, 0x00, 0x7F, 0x03, 0x0A]]],
  ['checksum', ['crc16-ccitt', [0x40, 0x00, 0x7F, 0x03, 0x0A]]],
  ['checksum', ['crc16-modbus', [0x40, 0x00, 0x7F, 0x03, 0x0A]]],
  ['checksum', ['crc32', [0x40, 0x00, 0x7F, 0x03, 0x0A]]],
  // The catalogue's check string, so the four runtimes are pinned to the published values and not
  // merely to each other.
  ['checksum', ['crc8', [49, 50, 51, 52, 53, 54, 55, 56, 57]]],
  ['checksum', ['crc16-ccitt', [49, 50, 51, 52, 53, 54, 55, 56, 57]]],
  ['checksum', ['crc16-modbus', [49, 50, 51, 52, 53, 54, 55, 56, 57]]],
  ['checksum', ['crc32', [49, 50, 51, 52, 53, 54, 55, 56, 57]]],
  // An unknown algorithm must come back as nothing in every runtime, not as a Roland checksum.
  ['checksum', ['crc17', [0x01, 0x02, 0x03]]],
  // Byte lists (docs/design/script-bytes.md). Numbers here, lists in STRUCT_CASES. Negative
  // numbers and full 32-bit fields are where Lua's 64-bit integers, JavaScript's doubles and
  // Python's unbounded integers would part company if the arithmetic were not the same.
  ['getBits', [180, 4, 3]], ['getBits', [[0, 180], 12, 3]], ['getBits', ['00 B4', 12, 3]],
  ['getBits', [-1, 0, 8]], ['getBits', [-17, 4, 8]], ['getBits', [0xFFFFFFFF, 0, 32]],
  ['getBits', [[0x34, 0x12], 0, 16]], ['getBits', [[1, 2, 3, 4], 4, 20]], ['getBits', [180.0, 2, 1]],
  ['setBits', [180, 4, 3, 5]], ['setBits', [-1, 0, 8, 0]], ['setBits', [0, 28, 4, 15]],
  ['bytesRead', [[240, 1, 16, 247], 1, 2]], ['bytesRead', ['34 12', 0, 2, { bits: 8, order: 'lsb' }]],
  ['bytesRead', [[0x7F, 0x7F, 0x7F, 0x7F], 0, 4]], ['bytesRead', [[255, 255, 255, 255], 0, 4, { bits: 8 }]],
  ['bytesRead', [[0x81], 0, 1]], ['bytesRead', [[1, 2], 0, 2, { order: 'lsb' }]],
  ['bytesFind', ['F0 41 10 42 12 F7', '42 12']], ['bytesFind', [[1, 2, 1, 2], [1, 2], 1]],
  ['bytesFind', [[1, 2, 3], [4]]], ['bytesFind', [[1, 2], [1, 2, 3]]], ['bytesFind', [[1, 2], [2], 5]],
  ['bytesToHex', [[240, 65, 16, 247]]], ['bytesToHex', [[]]], ['bytesToHex', [[300, -1, 10.7]]],
  ['bytesToHex', ['f0,41 0x10']],
  ['bytesToBase64', [[240, 65, 16, 66]]], ['bytesToBase64', [[1]]], ['bytesToBase64', [[1, 2]]],
  ['bytesToBase64', [[]]], ['bytesToBase64', ['F0 41']], ['bytesToBase64', [[255, 254, 253, 0, 1]]],
  // Hex text, as the editor always took it and the preludes now do: spaced, with commas and 0x,
  // one-digit bytes, and the one-argument form.
  ['checksum', ['roland', '40 00 7F 00']], ['checksum', ['roland', '0x40,0x00 7f 0']],
  ['checksum', ['40 00 7F 00']], ['checksum', ['xor-7bit', '01 02 03']],
  ['checksum', ['roland', '40007F00']],
  // ce.math.map, which is also how ce.anim.envelope samples its points. Straight lines, a step and
  // the held ends first; then a point's curve, which shapes the segment ending at it. The preludes
  // read a point for its x and y alone, so an envelope with curves moved in straight lines in the
  // plug-in with the window shut and along the curves in the editor.
  ['mapCurve', [0.25, [[0, 0], [1, 10]]]], ['mapCurve', [-1, [[0, 2], [1, 10]]]],
  ['mapCurve', [0.5, [[0, 0], [0.5, 0], [0.5, 1], [1, 1]]]], ['mapCurve', [0.7, [{ x: 1, y: 0 }, { x: 0, y: 1 }]]],
  ['mapCurve', [0.5, [[0, 0], [1, 1, 'exp']]]], ['mapCurve', [0.5, [[0, 0], [1, 1, 'exp', 3]]]],
  ['mapCurve', [0.25, [{ x: 0, y: 0 }, { x: 1, y: 1, curve: 'log', tension: 2 }]]],
  ['mapCurve', [0.3, [[0, 0], [1, 1, 's']]]], ['mapCurve', [0.3, [[0, 0], [1, 1, 'scurve']]]],
  ['mapCurve', [0.5, [[0, 0], [1, 1, 'hold']]]], ['mapCurve', [0.5, [[0, 0], [1, 1, 'bogus']]]],
  // Tension 0 is the default, not a straight line: `tension || 1.6` in the app, as in shape().
  ['mapCurve', [0.75, [[0, 0], [0.5, 1, 'exp', 0], [1, 0, 'log']]]],
  ['mapCurve', [0.6, [[0, 0.2, 'exp'], [1, 0.8]]]],
  // ce.time's numbers read as the transport reads them, where one is not used as written (the words
  // are compared in their own test below). A boolean is no number: it was 1 in three runtimes and
  // the default in Lua.
  ['stepAt', ['x', '1/16']], ['stepAt', ['2.5', '1/8']], ['swingOffset', [true, 2, '1/16']],
  ['beatsToMs', ['x', 120]], ['beatsToMs', ['2', 120]], ['msToBeats', [true, 60]], ['beatsToMs', [true, 120]],
  // ce.math's numbers. A negative hue goes round: it gave the wrong colour in the two JavaScript
  // runtimes and the right one in Lua and Python, whose % does not keep the sign. Saturation and
  // lightness are held at 0 and 100 both ways. A colour's part left out is 0, and text that is a
  // number is read as one (Python read "128" as 0). The same point twice is at angle 0, not 180.
  ['hslToHex', [-120, 100, 50]], ['hslToHex', [480, 100, 50]], ['hslToHex', [0, -10, 50]],
  ['hslToHex', [0, 150, 150]], ['hslToHex', [120]], ['hslToHex', ['120', '100', '50']],
  ['rgbToHex', [255]], ['rgbToHex', ['128', 0, 0]], ['mixColour', ['000000', 'FFFFFF']],
  ['mixColour', ['000000', 'FFFFFF', '0.5']], ['snap', ['37', 10]], ['lerp', ['10', 20, 0.5]],
  ['angleOf', [5, 5, 5, 5]], ['angleOf', [0, 0, 0, -10]],
  // Whole numbers inside the range only: the ends were floored, so random(1.5, 3.5) could give 1.
  // randomFloat with one number is the top of a range from 0; it was the bottom of one up to 1.
  // Seeded first, so every runtime draws the same numbers.
  ['randomSeed', [7]], ...Array.from({ length: 12 }, () => ['random', [1.5, 3.5]]),
  ['random', [-3.5, 2]], ['random', [6, 1]], ['randomFloat', [5]], ['randomFloat', []], ['randomFloat', [2, 4]],
];

// Helpers returning a table/array/object, compared structurally after normalising Lua's 1-based
// tables back to JS arrays.
// ce.music's lists of notes and the words they take (noteLists.js): each call's answer, and what it
// says, in every engine.
const NOTE_CALLS = [
  ['chordQuality', [['C4', 'Eb4', 'G4']]], ['chordQuality', [['60', '64', '67']]], ['chordQuality', [[60, 'X9']]],
  ['chordQuality', [[60, true]]], ['chordQuality', [null]],
  ['voiceLead', [['C4', 'E4', 'G4'], ['B3', 'D4', 'G4']]], ['voiceLead', [[60, 64, 67], [59, 'nope']]],
  ['voiceLead', [[60, 64, 67], [59, 62, 67], 'loose']], ['voiceLead', [[60, 64, 67], [59, 62, 67], 'loose']],
  ['voiceLead', ['C4', [60]]], ['voiceLead', [null, [60]]], ['voiceLead', [[60, 64]]],
  ['expandOctaves', [['C4', 'E4'], 2]], ['expandOctaves', [[60], 7]], ['expandOctaves', [[60], 0]],
  ['expandOctaves', [[60], 2.5]], ['expandOctaves', [[60], 'two']], ['expandOctaves', [[60, false]]],
  ['arpOrder', [['C4', 'E4', 'G4'], 'down']], ['arpOrder', [[60, 64], 'sideways']], ['arpOrder', [[60, 64]]],
  ['arpOrder', [[60, {}], 'up']],
];

const STRUCT_CASES = [
  ['to14bit', [16383]], ['to14bit', [128]],
  ['to7bit', [16383, 2, 'msb']], ['to7bit', [128, 2, 'lsb']], ['to7bit', [1, 4, 'msb']],
  // Default arguments too: a default that differs between runtimes is drift a fully-specified
  // call would never reveal.
  ['to7bit', [128]], ['toNibbles', [0x0F]], ['toAscii', ['Hi']],
  ['toNibbles', [0xAB]],
  ['nibblize', [[0xAB, 0xCD]]], ['denibblize', [[0xA, 0xB, 0xC, 0xD]]],
  ['toAscii', ['Hi', 4]],
  ['scaleNotes', [60, 'dorian']], ['scaleNotes', [60]], ['scaleNotes', [60, 'bogus']],
  // An unreadable root is no answer in every runtime, not the scale on C-1.
  ['scaleNotes', ['c4', 'major']], ['chordNotes', ['c4', 'major']], ['quantizeNote', ['c4', 60, 'major']],
  ['degreeChord', ['c4', 'major', 1]], ['scaleNotes', ['C-1', 'major']],
  ['scaleNotes', [null, 'major']], ['degreeChord', [null, 'major', 1]],
  ['chordNotes', ['C4', 'min7']], ['chordNotes', [60, 'bogus']],
  ['quantizeNote', [61, 60, 'major']], ['quantizeNote', [66, 60, 'major']], ['quantizeNote', [61, 60, 'bogus']],
  // degreeChord returns a whole record — name, roman numeral, spelling and notes — so every field
  // is compared, which is where a per-runtime table lookup would show up.
  ['degreeChord', [60, 'major', 1]], ['degreeChord', [60, 'major', 5]],
  ['degreeChord', [60, 'major', 7]], ['degreeChord', [60, 'major', 5, 4]],
  ['degreeChord', [60, 'minor', 2]], ['degreeChord', [60, 'minor', 6, 4]],
  ['degreeChord', ['F4', 'minor', 4]], ['degreeChord', [60, 'harmonicMinor', 5, 4]],
  ['degreeChord', [60, 'pentatonicMin', 2]],
  // Past the end of the scale, and the argument defaults — 0 and a missing size are where
  // `0 || 3` (3 in JS and Python, 0 in Lua) would have silently disagreed.
  ['degreeChord', [60, 'major', 8]], ['degreeChord', [60, 'major', 0]],
  ['degreeChord', [60, 'major', 3, 0]], ['degreeChord', [60, 'bogus', 1]],
  ['voiceLead', [[60, 64, 67], [59, 62, 67]]],
  ['voiceLead', [[60, 64, 67], [59, 62, 67], 'smooth']],
  ['voiceLead', [[60, 64, 67], [59, 62, 67], 'off']],
  ['voiceLead', [[60, 64, 67], []]],
  ['voiceLead', [[65, 69, 72], [60, 64, 67]]],
  ['voiceLead', [[62, 65, 69, 72], [60, 64, 67]]],
  ['expandOctaves', [[60, 64, 67], 2]], ['expandOctaves', [[67, 60, 64]]],
  ['expandOctaves', [[120, 124], 2]], ['expandOctaves', [[60], 9]],
  ['arpOrder', [[60, 64, 67], 'up']], ['arpOrder', [[60, 64, 67], 'down']],
  ['arpOrder', [[60, 64, 67], 'updown']], ['arpOrder', [[60, 64, 67], 'downup']],
  ['arpOrder', [[60, 64, 67], 'chord']], ['arpOrder', [[60, 64, 67], 'random']],
  ['arpOrder', [[60, 64, 67], 'asPlayed']], ['arpOrder', [[60, 64], 'updown']],
  ['arpOrder', [[60], 'downup']], ['arpOrder', [[], 'up']],
  // Lists of notes by name, or with text that is a number, read as numbers; one with anything else
  // in it refused. The words they take used as their defaults (noteLists.js).
  ...NOTE_CALLS,
  ['divisionNames', []],
  ['hexToRgb', ['336699']], ['hexToRgb', ['#0A0B0C']], ['hexToRgb', ['bad']],
  ['hexToRgb', ['#5B9BD580']], ['hexToRgb', ['x5B9BD5']], ['hexToRgb', ['#12#34#56']], ['hexToRgb', [0xFF0000]],
  ['hexToHsl', ['336699']], ['hexToHsl', ['808080']], ['hexToHsl', ['FF0000']],
  ['barBeatAt', [0]], ['barBeatAt', [4.5]], ['barBeatAt', [4.5, 3]], ['barBeatAt', [-1]],
  ['barBeatAt', [0.999]], ['barBeatAt', [12.25, 7]],
  ['stepsBetween', [0, 1, '1/16']], ['stepsBetween', [1, 1, '1/16']],
  ['stepsBetween', [0.9, 1.1, '1/4']], ['stepsBetween', [0, 100, '1/16']],
  ['stepsBetween', [0, 100, '1/16', 4]], ['stepsBetween', [0, 100, '1/16', 0]],
  ['stepsBetween', [5, 1, '1/16']], ['stepsBetween', [0, 1, 'nope']], ['stepsBetween', [0, 1, '1/16t']],
  ['cycleAt', [0, 1]], ['cycleAt', [6, 1]], ['cycleAt', [6, 1, 3]],
  ['cycleAt', [6, 0]], ['cycleAt', [6, 1000]], ['cycleAt', [-3, 2]],
  ['loopedBeats', [0, 4, 8]], ['loopedBeats', [4, 4, 8]], ['loopedBeats', [13, 4, 8]],
  ['loopedBeats', [20, 4, 8]], ['loopedBeats', [20, 4, 0]],
  ['barBeatAt', [-1, 0]], ['barBeatAt', ['8', null]], ['barBeatAt', [true]], ['stepsBetween', [0, 4, '1/4', 0.4]],
  ['stepsBetween', [-2, 'soon', '1/4']], ['cycleAt', ['x', 100, 0]], ['cycleAt', [4, 0.1, 'three']],
  ['loopedBeats', [-3, -1, 0]],
  // Byte lists that come back as lists: a field written across a byte boundary, a write that grows
  // the list, the empty slice, and base64 with and without padding and with whitespace in it.
  ['setBits', [[0, 180], 12, 3, 5]], ['setBits', ['00 00', 7, 2, 3]], ['setBits', [[255], 0, 8, 0]],
  ['bytesWrite', [[240, 0, 0, 247], 1, 2, 200]], ['bytesWrite', [[1, 2], 2, 2, 0x1234, { bits: 8, order: 'lsb' }]],
  ['bytesWrite', [[], 0, 4, 268435455]], ['bytesWrite', [[9, 9, 9], 1, 1, 0]],
  ['bytesSlice', [[240, 65, 16, 66, 247], 1, 3]], ['bytesSlice', ['F0 41 10', 1]], ['bytesSlice', [[1, 2, 3], 3]],
  ['bytesSlice', [[1, 2, 3], 1, 0]],
  ['bytesPut', [[1, 2, 3], 3, [4, 5]]], ['bytesPut', [[1, 2, 3], 1, 'FF']], ['bytesPut', [[1, 2, 3], 0, []]],
  ['bytesPut', [[1, 2, 3], 2, [7, 8, 9]]],
  ['bytesFromHex', ['F0 41 10 F7']], ['bytesFromHex', ['0xf0,0x41']], ['bytesFromHex', ['']],
  ['bytesFromBase64', ['8EEQQg==']], ['bytesFromBase64', ['AQ==']], ['bytesFromBase64', ['AQI=']],
  ['bytesFromBase64', ['8E EQ\nQg==']], ['bytesFromBase64', ['']], ['bytesFromBase64', ['//79AAE=']],
];

const near = (a, b) => (typeof a === 'number' && typeof b === 'number'
  ? Math.abs(a - b) < 1e-9
  : JSON.stringify(a) === JSON.stringify(b));

test('no prelude defines a top-level name twice', () => {
  // Each prelude is one long file of helpers, and a second definition under a name already taken
  // replaces the first without a word: in Python for every caller, since a global is looked up when
  // the function runs; in Lua for every function written below it. The byte helpers' __num, a
  // number for a message, once replaced ce.math's __num, which reads one, and 28 helpers raised in
  // the exported plugin's Python while every test here passed.
  const preludes = [
    ['LuaScriptEngine.cpp', 'LUA', /^local function (\w+)|^local (\w+)\s*=/],
    ['JsScriptEngine.cpp', 'JS', /^function (\w+)|^(?:var|let|const) (\w+)\s*=/],
    ['PythonScriptEngine.cpp', 'PY', /^def (\w+)|^(\w+)\s*=/],
  ];
  for (const [file, tag, definition] of preludes) {
    const seen = new Map();
    const twice = [];
    extractRawString(file, tag).split('\n').forEach((line, i) => {
      const m = line.match(definition);
      if (!m) return;
      const name = m[1] ?? m[2];
      if (seen.has(name)) twice.push(`${name} (prelude lines ${seen.get(name)} and ${i + 1})`);
      else seen.set(name, i + 1);
    });
    assert.deepEqual(twice, [], `${tag} prelude defines a name twice`);
  }
});

// A value built inside a vm context (or handed back by wasmoon) carries that realm's
// Object.prototype, and deepStrictEqual compares prototypes — so a structurally identical result
// fails on identity alone. Compare the data, which is all that crosses the language boundary
// anyway.
const plain = (v) => JSON.parse(JSON.stringify(v ?? null));

/* ----------------------------------------------------------------------- JavaScript prelude */

test('the JS engine prelude computes what the WebView runtime computes', () => {
  const prelude = extractRawString('JsScriptEngine.cpp', 'JS');
  // The prelude wraps a native bridge that does not exist here; only the pure helpers are under
  // test, so stub the bridge and let the rest define itself.
  const sandbox = { __api: new Proxy({}, { get: () => () => undefined }),
    // logError as well as log: checksum() calls it for an unknown algorithm, and an unstubbed host
    // binding fails the whole prelude rather than the one helper.
    log: () => {}, logError: () => {} };
  vm.createContext(sandbox);
  vm.runInContext(prelude, sandbox);

  for (const [fn, args] of CASES) {
    assert.equal(typeof sandbox[fn], 'function', `${fn} missing from the JS prelude`);
    const got = sandbox[fn](...args);
    const want = web[fn](...args);
    assert.ok(near(got, want), `JS prelude ${fn}(${JSON.stringify(args)}) = ${JSON.stringify(got)}, WebView = ${JSON.stringify(want)}`);
  }
  for (const [fn, args] of STRUCT_CASES) {
    assert.deepEqual(plain(sandbox[fn](...args)), plain(web[fn](...args)), `JS prelude ${fn} disagrees`);
  }
});

test('the JS prelude defines the panel verbs as stubs that log rather than throw', () => {
  const prelude = extractRawString('JsScriptEngine.cpp', 'JS');
  const logged = [];
  // The JS prelude declares its own log() that forwards to the native bridge (Lua takes log as a
  // host binding instead), so the notice has to be captured at __api, not at a sandbox global.
  const sandbox = {
    __api: new Proxy({}, {
      get: (_t, prop) => (prop === 'log' ? (m) => logged.push(String(m)) : () => undefined),
    }),
  };
  vm.createContext(sandbox);
  vm.runInContext(prelude, sandbox);
  assert.equal(typeof sandbox.setlistNext, 'function');
  sandbox.setlistNext('Songs');
  assert.equal(logged.length, 1);
  assert.match(logged[0], /setlistNext\(\) needs the panel window open/);
});

/* ------------------------------------------------------------------------------ Lua prelude */

// Lua results come back as ONE string, serialised inside Lua. Marshalling a table per case across
// the wasmoon boundary corrupts its heap after a few dozen crossings (the failure shows up as a nil
// _ENV in an unrelated helper, then a hard "memory access out of bounds") — which would make this
// test flaky in a way that looks like a prelude bug. One crossing, no table marshalling, no flake.
const LUA_SERIALISER = `
local function __ser(v)
  local t = type(v)
  if t == "number" then
    if v == math.floor(v) and math.abs(v) < 1e15 then return string.format("%d", v) end
    return string.format("%.10g", v)
  elseif t == "string" then return string.format("%q", v)
  elseif t == "boolean" then return tostring(v)
  elseif t == "table" then
    -- An empty Lua table IS an empty list and an empty map at the same time; the language has no
    -- way to tell them apart. Both sides collapse the empty case to "[]" so a real value never
    -- fails on a distinction Lua cannot express.
    if next(v) == nil then return "[]" end
    if #v > 0 then
      local parts = {}
      for i = 1, #v do parts[i] = __ser(v[i]) end
      return "[" .. table.concat(parts, ",") .. "]"
    end
    local keys = {}
    for k in pairs(v) do keys[#keys + 1] = tostring(k) end
    table.sort(keys)
    local parts = {}
    for _, k in ipairs(keys) do parts[#parts + 1] = string.format("%q", k) .. ":" .. __ser(v[k]) end
    return "{" .. table.concat(parts, ",") .. "}"
  end
  return "null"
end
`;

test('the Lua engine prelude computes what the WebView runtime computes', async () => {
  const { LuaFactory } = await import('wasmoon');
  const lua = await new LuaFactory().createEngine();
  try {
    // sendCC/log are host bindings in the real engine; the pure helpers do not use them, and the
    // panel-verb stubs only call log when invoked. `on` is different: the prelude CALLS it at load
    // time, to register the one listener that drives after(). Leaving it out does not fail the
    // helper being tested — it fails the whole prelude, before any of them are defined.
    lua.global.set('log', () => {});
    lua.global.set('logError', () => {});
    lua.global.set('logWarn', () => {});
    lua.global.set('sendCC', () => {});
    lua.global.set('on', () => {});
    lua.global.set('startTimer', () => {});
    lua.global.set('stopTimer', () => {});
    await lua.doString(extractRawString('LuaScriptEngine.cpp', 'LUA'));

    const all = [...CASES, ...STRUCT_CASES];
    const calls = all.map(([fn, args]) => `__ser(${fn}(${args.map(luaLiteral).join(', ')}))`);
    const chunk = `${LUA_SERIALISER}\nreturn table.concat({${calls.join(',\n')}}, "\\n")`;
    const got = String(await lua.doString(chunk)).split('\n');

    assert.equal(got.length, all.length, 'expected one serialised result per case');
    all.forEach(([fn, args], i) => {
      const want = canonical(web[fn](...args));
      assert.equal(got[i], want,
        `Lua prelude ${fn}(${JSON.stringify(args)}) = ${got[i]}, WebView = ${want}`);
    });
  } finally {
    lua.global.close();
  }
});

test('the Lua prelude defines the panel verbs as stubs that log rather than error', async () => {
  const { LuaFactory } = await import('wasmoon');
  const lua = await new LuaFactory().createEngine();
  try {
    const logged = [];
    lua.global.set('log', (m) => logged.push(String(m)));
    lua.global.set('sendCC', () => {});
    lua.global.set('on', () => {});          // called at load time to arm after()
    lua.global.set('startTimer', () => {});
    lua.global.set('stopTimer', () => {});
    await lua.doString(extractRawString('LuaScriptEngine.cpp', 'LUA'));
    await lua.doString('setlistNext("Songs")');
    assert.equal(logged.length, 1);
    assert.match(logged[0], /setlistNext\(\) needs the panel window open/);
  } finally {
    lua.global.close();
  }
});

test('panic expands to the same CC sequence in the Lua prelude as in the WebView runtime', async () => {
  const { LuaFactory } = await import('wasmoon');
  const lua = await new LuaFactory().createEngine();
  try {
    const sent = [];
    lua.global.set('log', () => {});
    lua.global.set('sendCC', (ch, cc, v) => sent.push([ch, cc, v]));
    lua.global.set('on', () => {});          // called at load time to arm after()
    lua.global.set('startTimer', () => {});
    lua.global.set('stopTimer', () => {});
    await lua.doString(extractRawString('LuaScriptEngine.cpp', 'LUA'));

    await lua.doString('panic({ channel = 3 })');
    assert.deepEqual(sent, [[3, 120, 0], [3, 123, 0], [3, 121, 0]],
      'all-sound-off must precede all-notes-off, then reset-all-controllers');

    sent.length = 0;
    await lua.doString('panic({ channel = 3, resetControllers = false })');
    assert.deepEqual(sent, [[3, 120, 0], [3, 123, 0]]);

    sent.length = 0;
    await lua.doString('panic()');
    assert.equal(sent.length, 48, 'no channel given means all sixteen, three messages each');
    assert.deepEqual(sent[0], [1, 120, 0]);
    assert.deepEqual(sent[47], [16, 121, 0]);
  } finally {
    lua.global.close();
  }
});

/* --------------------------------------------------------------------------------- helpers */

// A table key as Lua must write it: bare when it is a name, bracketed when it is a keyword such as
// `repeat` or text such as "1", which bare would be a parse error or the number 1.
const LUA_KEYWORDS = new Set(['and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function',
  'goto', 'if', 'in', 'local', 'nil', 'not', 'or', 'repeat', 'return', 'then', 'true', 'until', 'while']);
const luaKey = (k) => (/^[A-Za-z_]\w*$/.test(k) && !LUA_KEYWORDS.has(k) ? k : `[${JSON.stringify(k)}]`);
function luaLiteral(v) {
  if (v === FN) return 'function() end';
  if (v === null || v === undefined) return 'nil';
  if (Array.isArray(v)) return `{${v.map(luaLiteral).join(', ')}}`;
  if (typeof v === 'object') return `{${Object.entries(v).map(([k, x]) => `${luaKey(k)} = ${luaLiteral(x)}`).join(', ')}}`;
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number' && !Number.isFinite(v)) {
    return Number.isNaN(v) ? '(0/0)' : v > 0 ? 'math.huge' : '(-math.huge)';
  }
  return String(v);
}
// JSON for the Python driver, which cannot write NaN or Infinity: they go as marked strings that the
// driver's _dec turns back into floats, so a case can pass them to every engine alike.
const pyJson = (v) => JSON.stringify(v, (_k, x) => (typeof x === 'number' && !Number.isFinite(x)
  ? `\u0000${Number.isNaN(x) ? 'nan' : x > 0 ? 'inf' : '-inf'}` : x));

// The JS half of the serialiser above: same key ordering, same number formatting (Lua's "%.10g"
// keeps ten significant digits, so scale()'s 503.937007874… must be cut the same way on both
// sides or the comparison fails on float printing rather than on a real disagreement).
function canonical(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean') return String(v);
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number') {
    if (Number.isInteger(v) && Math.abs(v) < 1e15) return String(v);
    return String(Number(v.toPrecision(10)));
  }
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  const keys = Object.keys(v).sort();
  // See __ser: an empty table is both shapes in Lua, so the empty case collapses on both sides.
  if (!keys.length) return '[]';
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
}

/* --------------------------------------------------------------------------- Python prelude */

// Python used to be checked by NAME only, on the grounds that CPython is not guaranteed in a node
// test run. That grounds is real but the conclusion was too weak: where python3 IS on the box, the
// prelude can be executed for free, and the first run of it found quantizeNote raising TypeError on
// every call — because the prelude defines its own `set(path, value)`, which shadows the builtin
// `set` for the whole namespace, and quantizeNote was calling `set(<generator>)`. That is invisible
// to name parity, invisible to a reading of the code, and shipped.
//
// So: run it when python3 is there, skip with a reason when it is not. PythonScriptEngineTests.cpp
// still covers the engine itself where CPython definitely exists.
const PY_DRIVER = `
import sys, json
# The prelude opens with "import ceditor as __api" — the native bridge. Any object may stand in
# for a module in sys.modules, and none of the pure helpers touch it.
class _Bridge:
    def __getattr__(self, name): return lambda *a, **k: None
sys.modules["ceditor"] = _Bridge()
payload = json.loads(sys.stdin.read())
g = {"__name__": "prelude"}
# The host binds these before the prelude runs; the prelude CALLS on() at load time to arm after(),
# so leaving them out fails the whole prelude rather than the helper under test.
for name in ["log", "logError", "on", "off", "emit", "run", "set", "get", "sendCC", "startTimer", "stopTimer"]:
    g[name] = (lambda *a, **k: None)
exec(compile(payload["prelude"], "prelude", "exec"), g)
out = []
for fn, args in payload["cases"]:
    if fn not in g:
        out.append({"missing": fn})
    else:
        try: out.append({"value": g[fn](*args)})
        except Exception as err: out.append({"error": type(err).__name__ + ": " + str(err)})
sys.stdout.write(json.dumps(out, ensure_ascii=False))
`;

test('the Python engine prelude computes what the WebView runtime computes', async (t) => {
  const { spawnSync } = await import('node:child_process');
  const python = findPython3(spawnSync);
  if (!python) {
    t.skip('Python 3 is not on this machine — PythonScriptEngineTests.cpp covers the prelude there');
    return;
  }

  const all = [...CASES, ...STRUCT_CASES];
  const run = spawnSync(python, ['-c', PY_DRIVER], {
    input: JSON.stringify({ prelude: extractRawString('PythonScriptEngine.cpp', 'PY'), cases: all }),
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    // Windows Python defaults stdio to the legacy code page (cp1252), which cannot carry the
    // musical symbols and emoji in the cases; UTF-8 mode matches what the embedded engine does.
    env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
  });
  assert.equal(run.status, 0, `the Python prelude failed to run:\n${run.stderr}`);

  const got = JSON.parse(run.stdout);
  assert.equal(got.length, all.length, 'expected one result per case');
  all.forEach(([fn, args], i) => {
    assert.equal(got[i].missing, undefined, `${fn} missing from the Python prelude`);
    assert.equal(got[i].error, undefined,
      `Python prelude ${fn}(${JSON.stringify(args)}) raised ${got[i].error}`);
    // Canonicalise both sides the same way, so this compares VALUES rather than how each language
    // happens to print a float or order a dict's keys.
    assert.equal(canonical(got[i].value ?? null), canonical(web[fn](...args) ?? null),
      `Python prelude ${fn}(${JSON.stringify(args)}) disagrees with the WebView runtime`);
  });
});

/* ------------------------------------------------------------- the refusals, word for word */

// A mistake a helper refuses has to be refused in the same words everywhere, or the editor and the
// exported plugin tell the author two different things about one line. Each case runs in all four
// engines, and the error lines it raises are compared with the WebView runtime's exactly. A case
// that must raise nothing (a division in another case, say) is here too, so "accepted" is pinned
// as firmly as "refused". A null argument is a value left out (nil, undefined, None), and the
// refusals for it print no value, because each language would print a different word. FN stands for
// a function, which each engine is handed in its own language.
const FN = { __function: true };
// A transport at 120 BPM, for the sandboxes whose musical timers must arm as the editor's do.
const TEMPO_120 = { playing: false, bpm: 120, beats: 0, beatsPerBar: 4, source: 'internal', valid: true };
// Points ce.anim.envelope refuses, in every engine and in the same words, and points it takes. A nil
// cannot sit in a Lua list, so no case holds one; Lua's table of two would be a list of one.
const ENVELOPE_REFUSED = [
  [{ x: 0, y: 0 }, { x: 50, y: 1 }], [[0, 0], ['50', 1]], [{ x: 0, y: 0 }, { x: -0.5, y: 1 }],
  [{ x: 0, y: 0 }, { x: 1.5, y: 0 }], [{ x: 0, y: 0 }, 0.5], [{ x: 0, y: 0 }, 'up'], [{ x: 0, y: 0 }, true],
  [{ x: 0, y: 0 }, { x: 1, y: 'high' }], [{ x: 0, y: 0 }, { x: 1 }], [{ x: 0, y: 0 }, { y: 1 }],
  [[0, 0], [1, true]], [[0, 0], [1]], [{ x: 0, y: 0 }, { x: 'soon', y: 1 }, { x: 2, y: 0 }],
  [{ x: 0, y: 0 }, { x: NaN, y: 1 }], [{ x: 0, y: 0 }, { x: 1, y: Infinity }], [{ x: '0x1', y: 0 }, { x: 1, y: 1 }],
];
const ENVELOPE_TAKEN = [
  [{ x: 0, y: 0 }, { x: 1, y: 1 }], [[0, 0], [0.25, 1], [1, 0]], [{ x: '0', y: '0.5' }, { x: ' 1 ', y: 1 }],
  [{ x: 0, y: -0.5 }, { x: 1, y: 1.5 }], [{ x: 1, y: 0 }, { x: 0, y: 1 }], [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }],
];
const ENVELOPE_TOO_FEW = [[{ x: 0, y: 0 }], [], 'up', 5, null];
const REFUSAL_CASES = [
  // MIDI senders: an unreadable note name sends nothing.
  ['sendNote', [1, 'c4', 100]], ['sendNoteOff', [1, 'c4']], ['sendAftertouch', [1, 90, 'c4']],
  ['sendNote', [1, 'C4', 100]],
  // Divisions: any case is read, and a name that is not a division says so.
  ['beatsPerDivision', ['1/6']], ['stepAt', [2, 'nope']], ['stepsBetween', [0, 1, '1/3']],
  ['swingOffset', [1, 0.5, 'quarter']],
  // A number a helper cannot do without, left out, is rejected (it was the default in silence);
  // one it can do without is the default, and says nothing. The first one left out is said, alone.
  ['barBeatAt', [null]], ['barBeatAt', [4]], ['stepAt', [null, '1/16']], ['stepsBetween', [null, 4, '1/4']],
  ['stepsBetween', [0, null, '1/4']], ['stepsBetween', [null, null, '1/4']], ['swingOffset', [null, 0.5, '1/16']],
  ['swingOffset', [1, null, '1/16']], ['cycleAt', [6, null]], ['cycleAt', [null, 1]], ['cycleAt', [6, 1]],
  ['loopedBeats', [4, 4, null]], ['loopedBeats', [null, 4, 8]], ['beatsToMs', [null, 120]], ['msToBeats', [null]],
  // A timer with no id, a one-shot with no function, and a list of taps or gaps that is not one.
  ['startTimer', [null, 250]], ['startTimer', ['', 250]], ['stopTimer', [null]], ['syncTimer', [null, 1]],
  ['after', [10, 'x']], ['after', [10, null]], ['afterBeats', [1, 'x']], ['afterBeats', [1, null]],
  ['tapTempo', [null]], ['tapTempo', ['x']], ['tapTempo', [5]], ['tapTempo', [[1000, 1500]]],
  ['clockTempo', [null]], ['clockTempo', ['x']], ['clockTempo', [[20.8, 20.8]]],
  ['beatsPerDivision', ['1/8t']], ['stepAt', [2.5, '1/16D']], ['swingOffset', [1, 0.5, '1/4d']],
  // Music helpers: an unreadable note name, an unknown scale or chord, the scale checked first.
  ['scaleNotes', ['c4', 'major']], ['scaleNotes', [60, 'lokrian']], ['chordNotes', [60, 'maj']],
  ['chordNotes', ['Hb2', 'min7']], ['quantizeNote', [61, 'c4', 'major']], ['quantizeNote', ['x', 'y', 'nope']],
  ['noteSpelling', ['c4', 'minor']], ['inScale', ['c4', 60, 'major']], ['scaleDegree', [60, 'c4', 'major']],
  ['degreeChord', ['c4', 'major', 1]], ['degreeChord', [60, 'lokrian', 1]],
  ['scaleNotes', ['C-1', 'major']], ['degreeChord', [60, 'major', 5]],
  // checksum reads hex text a byte at a time, and names the algorithms it knows.
  ['checksum', ['roland', '40007F00']], ['checksum', ['roland', '40 00 zz 00']], ['checksum', ['40 0 7F 00']],
  ['checksum', ['crc17', [1, 2, 3]]],
  // A note left out altogether, which the numeric path used to make 0. Channel pressure is the one
  // place a missing note is meant, and it must stay silent.
  ['sendNote', [1, null, 100]], ['sendNoteOff', [1, null]], ['sendAftertouch', [1, 90, null]],
  ['scaleNotes', [null, 'major']], ['quantizeNote', [61, null, 'major']], ['degreeChord', [null, 'major', 1]],
  ['inScale', [null, 60, 'major']],
  // Byte lists: every way each helper can refuse, and two that must not.
  ['getBits', [180, -1, 3]], ['getBits', [180, 0, 33]], ['getBits', [180, 30, 4]], ['getBits', [180, 31, 2]],
  ['getBits', [[1], 4, 8]], ['getBits', [[1], 8, 1]], ['getBits', ['F041', 0, 8]], ['getBits', [180, 4, 3]],
  ['setBits', [0, 0, 3, 9]], ['setBits', [0, 0, 3, 2.5]], ['setBits', [0, 0, 1, 2]], ['setBits', [[1], 4, 8, 1]],
  ['bytesRead', [[1, 2], 1, 2]], ['bytesRead', [[1, 2], 2, 1]], ['bytesRead', [[1, 2], -1, 1]],
  ['bytesRead', [[1, 2], 0, 5]], ['bytesRead', [[1, 2], 0, 1, { bits: 6 }]], ['bytesRead', [[1, 2], 0, 1, { order: 'big' }]],
  ['bytesRead', [[1], 0, 2]],
  ['bytesWrite', [[1, 2], 3, 1, 0]], ['bytesWrite', [[1, 2], 0, 1, 128]], ['bytesWrite', [[1, 2], 0, 2, 70000, { bits: 8 }]],
  ['bytesWrite', [[1, 2], 0, 1, -1]],
  ['bytesSlice', [[1, 2, 3], 2, 2]], ['bytesSlice', [[1, 2, 3], 4]], ['bytesSlice', [[1, 2, 3], 5, 0]],
  ['bytesSlice', [[1, 2, 3], 0, -1]], ['bytesSlice', [[1], 1, 1]],
  ['bytesPut', [[1, 2], 3, [1]]], ['bytesPut', [[1, 2], 0, 'F0411']],
  ['bytesFind', [[1, 2], []]], ['bytesFind', [[1, 2], [1], -1]], ['bytesFind', [[1, 2, 3], [9]]],
  ['bytesFromHex', ['F04110']], ['bytesToHex', ['zz']],
  ['bytesFromBase64', ['8EEQQg=']], ['bytesFromBase64', ['8E=Q']], ['bytesFromBase64', [42]],
  ['bytesToBase64', [[1, 2, 3]]],
  // Channel messages: an address outside its range, anything that is not a number, and a value left
  // out are refused; a value past the end of its range is still clamped, so those must stay silent.
  ['sendCC', [1, 200, 5]], ['sendCC', [1, 'cutoff', 5]], ['sendCC', [0, 7, 5]], ['sendCC', [17, 7, 5]],
  ['sendCC', [null, 7, 5]], ['sendCC', [1, 7, null]], ['sendCC', [1, 7, 'loud']], ['sendCC', [1, 7, NaN]],
  ['sendCC', [1, 7, 128]], ['sendCC', [1, 7.4, 64.5]], ['sendCC', [true, 7, 5]],
  // Text that is a number is read as one, as it always was; text that is not, is not.
  ['sendCC', ['1', ' 74 ', '64']], ['sendCC', [1, '0x10', 5]], ['sendNote', [1, 60, 100, '500']],
  ['sendNote', [1, 60, '1e2']], ['sendPitchBend', [1, '8192']],
  ['sendNote', [1, 'C10', 100]], ['sendNote', [1, 'C-2', 100]], ['sendNote', [1, 128, 100]],
  ['sendNote', [1, -1, 100]], ['sendNote', [1, NaN, 100]], ['sendNote', [1, true, 100]],
  ['sendNote', [1, [60], 100]], ['sendNote', [1, 60]], ['sendNote', [1, 60, 100, '500ms']],
  ['sendNote', [1, 60, 100, -5]], ['sendNote', [1, 60, 100, 0]], ['sendNote', [1, 'G9', 100]],
  ['sendNote', [1, 127.6, 100]], ['sendNote', [1, 60, 100, 250]],
  ['sendNoteOff', [1, 'G#9']], ['sendNoteOff', [1, 60]], ['sendAftertouch', [1, null]], ['sendAftertouch', [1, 90, 200]],
  ['sendProgramChange', [1, 128]], ['sendProgramChange', [1, 5, 200]], ['sendProgramChange', [1, null]],
  ['sendPitchBend', [1, 'center']], ['sendPitchBend', [1, NaN]], ['sendPitchBend', [1]], ['sendPitchBend', [1, -1]],
  ['sendNRPN', [1, 128, 0, 5]], ['sendNRPN', [1, 0, 0, null]], ['sendRPN', [1, 0, 'x', 5]], ['sendRPN', [1, 0, 0, 20000]],
  ['sendSongPosition', [null]], ['sendSongPosition', ['start']],
  ['sendTransport', ['pause']], ['sendTransport', [null]], ['sendTransport', ['STOP']], ['sendTransport', [3]],
  ['panic', [{ channel: 'all' }]], ['panic', [{ channel: 17 }]], ['panic', [{ channel: 2 }]],
  // The music helpers' numbers: NaN or true is not a note, where it used to root the answer at C-1.
  ['scaleNotes', [NaN, 'major']], ['scaleNotes', [true, 'major']], ['quantizeNote', [NaN, 60, 'major']],
  ['inScale', [Infinity, 60, 'major']], ['scaleDegree', [60, [60], 'major']], ['chordNotes', [127, 'major']],
  // One byte rule: an item is a whole number from 0 to 255 or one hex byte, a list is a list, and the
  // separators are the same everywhere (a form feed is one, a no-break space is not).
  ['bytesToHex', [[300]]], ['bytesToHex', [['41', '0xF7']]], ['bytesToHex', [[1.5]]], ['bytesToHex', [[-1]]],
  ['bytesToHex', [[true]]], ['bytesToHex', [[[1]]]], ['bytesToHex', [42]], ['bytesToHex', [null]],
  ['bytesToHex', [[NaN]]], ['bytesToHex', [[1, Infinity]]], ['bytesToHex', [['G0']]],
  ['bytesToHex', ['F0\f41']], ['bytesToHex', ['F0\u00A041']],
  ['bytesPut', [[1, 2, 3], 1, 0x7F]], ['bytesFind', [[1, 2], 0xF7]], ['bytesFromHex', [42]],
  ['bytesFromHex', [null]], ['bytesFromHex', [[1, 2]]], ['bytesFromBase64', [null]],
  ['checksum', ['roland']], ['checksum', [null]], ['checksum', ['roland', [300]]], ['checksum', ['xor', ['41', 16]]],
  // A value left out, or not a number, is named rather than printed as each language prints it.
  ['setBits', [0, 0, 3]], ['bytesWrite', [[1], 0, 1]], ['bytesWrite', [[1], 0, 1, '5']],
  ['getBits', [NaN, 0, 3]], ['setBits', [Infinity, 0, 3, 1]], ['getBits', [true, 0, 1]],
  ['getBits', [5]], ['bytesPut', [[1], 1]],
  ['beatsPerDivision', [null]], ['stepAt', [2.5]], ['stepAt', [2.5, 8]], ['swingOffset', [1, 0.5]],
  ['checksum', [null, [1, 2]]], ['checksum', [true, [1, 2]]], ['checksum', ['constructor', [1, 2]]],
  // Colours are read as a property stores them: 6 or 8 hex digits, one "#" at most, and CSS's short
  // forms written out ("#000" and "red" must stay silent; COLOUR_FORM_INPUTS below has the rest).
  // Anything else is refused with the forms, and with the full form for "#" with four digits or a
  // number. Eight digits are AARRGGBB, so "#5B9BD580" is accepted (as the panel's green), silently.
  ['lighten', ['x5B9BD5']], ['hexToRgb', ['#12#34#56']], ['hexToHsl', ['#000']], ['darken', ['#0008']],
  ['colourAlpha', [0xFF0000, 0.5]], ['lighten', [0xFF5B9BD5]], ['hexToRgb', [1.5]], ['hexToRgb', [true]],
  ['mixColour', ['000000', 'red', 0.5]], ['mixColour', ['nope', 'zz', 0.5]], ['lighten', [null]],
  ['hexToHsl', ['']], ['lighten', ['#5B9BD580']], ['hexToRgb', ['FF5B9BD5']],
  // Amounts on a 0..1 scale: outside it is refused, with the number out of 100 when that lands
  // inside, and the colour is checked first. Left out is the default, except for alpha's.
  ['lighten', ['336699', 40]], ['darken', ['336699', 55]], ['colourAlpha', ['336699', 128]],
  ['colourAlpha', ['336699', 1.5]], ['colourAlpha', ['336699', -0.5]], ['colourAlpha', ['336699', null]],
  ['lighten', ['336699', 'lots']], ['lighten', ['336699', '40']], ['darken', ['336699', true]],
  ['lighten', ['nope', 40]],
  ['lighten', ['336699', '0.5']], ['darken', ['336699', 1]], ['colourAlpha', ['336699', 0]],
  ['lighten', ['336699', null]],
  // ce.anim's target is a number, or text that is one; anything else starts nothing.
  ['animateTo', ['K.value', 'full']], ['animateSpring', ['K.value', '100px']],
  ['animateTo', ['K.value', '#FF0000']], ['animateTo', [['K.value', 'R.value'], null]],
  ['animateSpring', ['K.value', true]],
  // ce.anim.envelope's points: one that is not a point, or whose x is not from 0 to 1, starts nothing.
  // The sampler dropped the first and never reached the second, both without a word.
  ...ENVELOPE_REFUSED.map((points) => ['animateEnvelope', ['K.value', points]]),
  // Settings: an options table with any key but `scope` is refused, because a misspelled key used to
  // mean the shared panel store. The keys are named sorted, whatever order the table keeps them in.
  ['saveSetting', ['k', 1, { scop: 'script' }]], ['loadSetting', ['k', null, { scope: 'script', fallbak: 2 }]],
  ['listSettings', [{ b: 1, a: 2 }]], ['allSettings', [{ scope: 'panel', z: 1, x: 2, y: 3 }]],
  ['forgetSetting', ['k', { scop: 'local' }]], ['clearSettings', [{ scop: 'script' }]],
  ['storageInfo', [{ scope: 'sript' }]], ['saveSetting', ['k', 1, { scope: 'bogus' }]],
  // Timers: a repeating interval is a number above 0, a one-shot's delay a number from 0, and a
  // musical length may be a division's name. Each used to become a 1 ms timer, or run at once.
  ['startTimer', ['t', 'fast']], ['startTimer', ['t']], ['startTimer', ['t', -100]], ['startTimer', ['t', 0]],
  ['startTimer', [5, -0.5]], ['startTimer', ['t', true]], ['startTimer', ['t', '250']],
  ['startTimer', ['t', { ms: 5 }]], ['startTimer', ['t', 250]],
  ['syncTimer', ['s', '1/6']], ['syncTimer', ['s', 0]], ['syncTimer', ['s', null]], ['syncTimer', ['s', -1]],
  ['syncTimer', ['s', 'fast']], ['syncTimer', ['s', '1/16']], ['syncTimer', ['s', '1/8t']], ['syncTimer', ['s', 0.25]],
  ['after', ['1s', FN]], ['after', [-5, FN]], ['after', [null, FN]], ['after', [false, FN]],
  ['after', [0, FN]], ['after', [10, FN]],
  ['afterBeats', ['1/6', FN]], ['afterBeats', [-1, FN]], ['afterBeats', [null, FN]], ['afterBeats', ['1/4', FN]],
  ['afterBeats', [0, FN]],
  // Options: a key the member does not take refuses the call, for every member the preludes
  // implement whose options list fields, from the lists gen-script-modules.mjs writes into them.
  // Several keys are named sorted; a misspelling inside an option with fields of its own is named
  // with the option, after the call's own. Each is checked before anything else the call reads.
  ['set', ['K.value', 1, { transmit: false, quiet: true }]],
  ['requestDump', ['patch', FN, { timout: 50 }]], ['recallPreset', [0, { rol: 'mainSynth' }]],
  ['animateTo', ['K.value', 1, { easing: 'outBack' }]],
  ['animateTo', ['K.value', 1, { time: 800, ease: 'out', onDone: 1, repeat: 2 }]],
  ['animateTo', ['K.value', 'full', { easing: 'outBack' }]],
  ['animateSpring', ['K.value', 1, { curve: 'outBack' }]],
  ['animateEnvelope', ['K.value', [{ x: 0, y: 0 }, { x: 1, y: 1 }], { damping: 3, frequency: 2 }]],
  ['syncTimer', ['s', '1/16', { folow: false }]],
  ['deviceParameters', [{ grp: 'Filter' }]], ['devicePorts', [{ dir: 'in' }]],
  ['deviceDefineParameter', ['p', { nrpn: { mbs: 1, lsb: 2 } }]],
  ['deviceDefineParameter', ['p', { nmae: 'Cutoff', cc: 7, nrpn: { msb: 1, lbs: 2 } }]],
  ['deviceDefineDump', ['patch', { header: 'F0', match: { prefx: 'F0', suffix: 'F7' }, fields: [] }]],
  ['checksum', ['roland', [1, 2], { ofset: 1 }]], ['checksum', ['roland', [1, 2], { offset: 0 }]],
  ['panic', [{ channel: 2, reset: false }]], ['panic', [{ channel: 2, resetControllers: false }]],
  ['encodeJson', [{ a: 1 }, { indnt: 2 }]], ['encodeJson', [{ a: 1 }, { indent: 2 }]],
  ['bytesRead', [[1, 2], 0, 2, { ordr: 'lsb' }]], ['bytesRead', [[1, 2], 0, 2, { bits: 8, Order: 'lsb', order: 'lsb' }]],
  ['bytesWrite', [[1, 2], 0, 2, 300, { bit: 8 }]], ['bytesWrite', [[1, 2], 0, 2, 300, { order: 'lsb', bitz: 8, Bits: 8 }]],
  ['bytesWrite', [[1, 2], 0, 2, 300, { bits: 8, order: 'lsb' }]],
  // Not options tables, so nothing to refuse: a list, numbered keys, and no table at all.
  ['bytesRead', [[1, 2], 0, 2, [8]]], ['bytesRead', [[1, 2], 0, 2, { 1: 8 }]], ['bytesRead', [[1, 2], 0, 2, 'lsb']],
  ['bytesWrite', [[1, 2], 0, 2, 300, [8]]], ['bytesWrite', [[1, 2], 0, 2, 300, { 1: 8 }]],
  // ce.math's numbers: a value that is not a number is refused, where it was read as 0 or as NaN in
  // silence. Left out is 0 for a colour's parts and for mix's t, and a refusal for snap and lerp.
  // random has no answer when no whole number lies in its range.
  ['rgbToHex', ['x', 0, 0]], ['rgbToHex', [255, true, 0]], ['rgbToHex', [255]],
  ['hslToHex', [0, 'x', 50]], ['hslToHex', [NaN, 100, 50]], ['mixColour', ['000000', 'FFFFFF', 'x']],
  ['snap', [37]], ['snap', ['x', 10]], ['lerp', [10, 20]], ['lerp', [10, 'x', 0.5]],
  ['random', [1.2, 1.8]], ['random', ['x', 6]], ['random', [1, 6]],
];

/** The case's arguments with FN made a function in this realm. */
const withFunctions = (args) => args.map((a) => (a === FN ? () => {} : a));

function webRefusals(fn, args) {
  clearScriptTrace();
  web[fn](...withFunctions(args));
  return get(scriptTrace).filter((e) => e.kind === 'error').map((e) => e.message);
}

test('the engines refuse the same mistakes in the same words', async (t) => {
  const want = REFUSAL_CASES.map(([fn, args]) => webRefusals(fn, args));
  // The cases that are accepted started real timers in this process.
  resetScriptStateForTesting();
  assert.ok(want.some((lines) => lines.length), 'the cases must include some refusals');

  // JavaScript, under node:vm. The transport reports a tempo, as the editor's clock always does, so
  // a musical timer that is accepted arms rather than stopping at "no tempo", which is an error
  // now, as every rejection is.
  {
    const errors = [];
    const sandbox = { __api: new Proxy({}, { get: () => () => undefined }), log: () => {},
      logError: (m) => errors.push(String(m)) };
    vm.createContext(sandbox);
    vm.runInContext(extractRawString('JsScriptEngine.cpp', 'JS'), sandbox);
    // The prelude declares its own logError, forwarding to __api.logAt, so capture it there.
    sandbox.__api = new Proxy({}, {
      get: (_t, prop) => (prop === 'logAt' ? (kind, m) => { if (kind === 'error') errors.push(String(m)); }
        : prop === 'transportState' ? () => TEMPO_120 : () => undefined),
    });
    REFUSAL_CASES.forEach(([fn, args], i) => {
      errors.length = 0;
      sandbox[fn](...withFunctions(args));
      assert.deepEqual([...errors], want[i], `JS prelude ${fn}(${JSON.stringify(args)})`);
    });
  }

  // Lua, under wasmoon: one crossing for every case, for the reason LUA_SERIALISER gives.
  {
    const { LuaFactory } = await import('wasmoon');
    const lua = await new LuaFactory().createEngine();
    try {
      // __transportState reports a tempo, as the editor's clock always does, so a musical timer
      // that is accepted arms rather than stopping at "no tempo", which is an error now.
      // `set` is a host binding in this engine, and has to exist before the prelude loads for the
      // option check to wrap it, as the real engine binds it first.
      for (const name of ['log', 'logError', 'logWarn', 'set', 'sendCC', 'sendNRPN', 'sendMidi', 'on', 'startTimer', 'stopTimer']) {
        lua.global.set(name, () => {});
      }
      lua.global.set('__transportState', () => TEMPO_120);
      await lua.doString(extractRawString('LuaScriptEngine.cpp', 'LUA'));
      const calls = REFUSAL_CASES.map(([fn, args]) =>
        `__errs = {}; ${fn}(${args.map(luaLiteral).join(', ')}); out[#out + 1] = table.concat(__errs, "\\1")`);
      const chunk = `__errs = {}\nlogError = function(m) __errs[#__errs + 1] = tostring(m) end\n`
        + `local out = {}\n${calls.join('\n')}\nreturn table.concat(out, "\\n")`;
      const got = String(await lua.doString(chunk)).split('\n');
      REFUSAL_CASES.forEach(([fn, args], i) => {
        assert.deepEqual(got[i] ? got[i].split('\u0001') : [], want[i], `Lua prelude ${fn}(${JSON.stringify(args)})`);
      });
    } finally {
      lua.global.close();
    }
  }

  // Python, when python3 is here.
  const { spawnSync } = await import('node:child_process');
  const python = findPython3(spawnSync);
  if (!python) {
    t.diagnostic('Python 3 is not on this machine: its refusals were not compared');
    return;
  }
  const driver = `
import sys, json
class _Bridge:
    def __getattr__(self, name):
        if name == "transportState": return lambda *a, **k: {"playing": False, "bpm": 120, "beats": 0, "beatsPerBar": 4, "source": "internal", "valid": True}
        return lambda *a, **k: None
sys.modules["ceditor"] = _Bridge()
payload = json.loads(sys.stdin.read())
g = {"__name__": "prelude"}
for name in ["log", "logError", "on", "off", "emit", "run", "set", "get", "sendCC", "startTimer", "stopTimer"]:
    g[name] = (lambda *a, **k: None)
exec(compile(payload["prelude"], "prelude", "exec"), g)
errors = []
g["logError"] = lambda m, *rest: errors.append(str(m))
def _dec(v):
    if isinstance(v, str) and v.startswith("\\u0000"): return float(v[1:])
    if isinstance(v, list): return [_dec(x) for x in v]
    if isinstance(v, dict): return {k: _dec(x) for k, x in v.items()}
    return v
out = []
for fn, args in payload["cases"]:
    del errors[:]
    g[fn](*[(lambda *a: None) if isinstance(x, dict) and x.get("__function") else x for x in _dec(args)])
    out.append(list(errors))
sys.stdout.write(json.dumps(out, ensure_ascii=False))
`;
  const run = spawnSync(python, ['-c', driver], {
    input: pyJson({ prelude: extractRawString('PythonScriptEngine.cpp', 'PY'), cases: REFUSAL_CASES }),
    encoding: 'utf8',
    env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
  });
  assert.equal(run.status, 0, `the Python prelude failed to run:\n${run.stderr}`);
  const got = JSON.parse(run.stdout);
  REFUSAL_CASES.forEach(([fn, args], i) => {
    assert.deepEqual(got[i], want[i], `Python prelude ${fn}(${JSON.stringify(args)})`);
  });
});

/* ------------------------------------------------------ ce.anim.envelope's points, every way */

// The refusals above, with what is taken and what is too few beside them: whether the move starts
// and what is refused as an error, compared with the WebView's for each. Too few points was a note
// (a plain line) until the owner asked for the error every other rejection is. The host's animate
// is stood in for by one that starts whatever it is given.
test('ce.anim.envelope takes and refuses the same points in every engine', async (t) => {
  const cases = [...ENVELOPE_REFUSED, ...ENVELOPE_TAKEN, ...ENVELOPE_TOO_FEW];
  const want = cases.map((points) => {
    clearScriptTrace();
    const started = web.animateEnvelope('K.value', points) === true;
    const lines = get(scriptTrace);
    return { started, errors: lines.filter((e) => e.kind === 'error').map((e) => e.message),
      notes: lines.filter((e) => e.kind === 'log').map((e) => e.message) };
  });
  resetScriptStateForTesting();
  assert.deepEqual(want.map((w) => w.started), cases.map((p) => ENVELOPE_TAKEN.includes(p)), 'the WebView starts exactly the taken ones');
  assert.ok(want.slice(0, ENVELOPE_REFUSED.length).every((w) => w.errors.length === 1 && !w.notes.length), 'each refusal is one error');
  assert.ok(want.slice(-ENVELOPE_TOO_FEW.length).every((w) => w.errors.length === 1 && !w.notes.length), 'too few is one error, as every rejection is');
  const label = (i) => `ce.anim.envelope("K.value", ${JSON.stringify(cases[i])})`;

  // JavaScript, under node:vm.
  {
    let cur = null;
    const sandbox = { __api: new Proxy({}, { get: () => () => undefined }), log: () => {}, logError: () => {} };
    vm.createContext(sandbox);
    vm.runInContext(extractRawString('JsScriptEngine.cpp', 'JS'), sandbox);
    sandbox.__api = new Proxy({}, {
      get: (_t, prop) => {
        if (prop === 'logAt') return (kind, m) => { if (kind === 'error') cur.errors.push(String(m)); };
        if (prop === 'log') return (m) => { cur.notes.push(String(m)); };
        if (prop === 'animate') return () => true;
        return () => undefined;
      },
    });
    cases.forEach((points, i) => {
      cur = { started: false, errors: [], notes: [] };
      cur.started = sandbox.animateEnvelope('K.value', points) === true;
      assert.deepEqual(cur, want[i], `JS prelude ${label(i)}`);
    });
  }

  // Lua, under wasmoon, in one crossing.
  {
    const { LuaFactory } = await import('wasmoon');
    const lua = await new LuaFactory().createEngine();
    try {
      for (const name of ['log', 'logError', 'logWarn', 'set', 'sendCC', 'sendNRPN', 'sendMidi', 'on', 'startTimer', 'stopTimer', '__transportState']) {
        lua.global.set(name, () => {});
      }
      await lua.doString(extractRawString('LuaScriptEngine.cpp', 'LUA'));
      const calls = cases.map((points) => `do __errs, __notes = {}, {}; local s = animateEnvelope("K.value", ${luaLiteral(points)}); `
        + 'out[#out + 1] = tostring(s == true) .. "\\2" .. table.concat(__errs, "\\1") .. "\\2" .. table.concat(__notes, "\\1") end');
      const chunk = 'logError = function(m) __errs[#__errs + 1] = tostring(m) end\n'
        + 'log = function(m) __notes[#__notes + 1] = tostring(m) end\n'
        + '__animate = function() return true end\n'
        + `local out = {}\n${calls.join('\n')}\nreturn table.concat(out, "\\3")`;
      const got = String(await lua.doString(chunk)).split('\u0003');
      const split = (s) => (s ? s.split('\u0001') : []);
      got.forEach((line, i) => {
        const [started, errors, notes] = line.split('\u0002');
        assert.deepEqual({ started: started === 'true', errors: split(errors), notes: split(notes) }, want[i], `Lua prelude ${label(i)}`);
      });
    } finally {
      lua.global.close();
    }
  }

  // Python, when python3 is here.
  const { spawnSync } = await import('node:child_process');
  const python = findPython3(spawnSync);
  if (!python) {
    t.diagnostic('Python 3 is not on this machine: its envelope points were not compared');
    return;
  }
  const driver = `
import sys, json
class _Bridge:
    def __getattr__(self, name): return lambda *a, **k: None
sys.modules["ceditor"] = _Bridge()
payload = json.loads(sys.stdin.read())
g = {"__name__": "prelude"}
for name in ["log", "logError", "on", "off", "emit", "run", "set", "get", "sendCC", "startTimer", "stopTimer"]:
    g[name] = (lambda *a, **k: None)
exec(compile(payload["prelude"], "prelude", "exec"), g)
cur = {}
g["logError"] = lambda m, *rest: cur["errors"].append(str(m))
g["log"] = lambda m, *rest: cur["notes"].append(str(m))
class _Host(_Bridge):
    def animate(self, *a): return True
g["__api"] = _Host()
def _dec(v):
    if isinstance(v, str) and v.startswith("\\u0000"): return float(v[1:])
    if isinstance(v, list): return [_dec(x) for x in v]
    if isinstance(v, dict): return {k: _dec(x) for k, x in v.items()}
    return v
out = []
for points in payload["cases"]:
    cur["errors"], cur["notes"] = [], []
    started = g["animateEnvelope"]("K.value", _dec(points)) is True
    out.append({"started": started, "errors": cur["errors"], "notes": cur["notes"]})
sys.stdout.write(json.dumps(out, ensure_ascii=False))
`;
  const run = spawnSync(python, ['-c', driver], {
    input: pyJson({ prelude: extractRawString('PythonScriptEngine.cpp', 'PY'), cases }),
    encoding: 'utf8',
    env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
  });
  assert.equal(run.status, 0, `the Python prelude failed to run:\n${run.stderr}`);
  JSON.parse(run.stdout).forEach((answer, i) => assert.deepEqual(answer, want[i], `Python prelude ${label(i)}`));
});

// A point written by number rather than by name: { 0: x, 1: y } in JavaScript or Python, and in Lua
// { x, y } (entries 1 and 2, as Lua counts) or { [0] = x, [1] = y }. The editor read entry 1 before
// entry 0, so { 0: 0, 1: 0.2 } was a point at x 0.2, and the preludes read a table point by its
// names alone. No JSON case can carry one to Python, whose keys arrive there as text, so each
// language writes its own. And the samples ce.anim.envelope moves along are the same with curves in
// them as without: the JS prelude's against the editor's, point for point.
test('a point written by its numbered entries is the same point, curve and all, in every engine', async (t) => {
  const want = 0.2 + 0.4 * 0.5 ** 2.6;
  const close = (got, label) => assert.ok(Math.abs(Number(got) - want) < 1e-9, `${label}: ${got}, want ${want}`);
  const numbered = [{ 0: 0, 1: 0.2 }, { 0: 1, 1: 0.6, 2: 'exp' }];
  close(web.mapCurve(0.5, numbered), 'WebView, keyed from 0');
  // How wasmoon hands the editor a Lua { 0, 0.2 }: an object keyed from 1.
  close(web.mapCurve(0.5, [{ 1: 0, 2: 0.2 }, { 1: 1, 2: 0.6, 3: 'exp' }]), 'WebView, a Lua table');
  close(web.mapCurve(0.5, [[0, 0.2], { x: 1, y: 0.6, curve: 'exp' }]), 'WebView, a pair and a named point');

  const curved = [{ x: 0, y: 0 }, { x: 0.4, y: 1, curve: 'exp', tension: 3 }, { x: 1, y: 0.25, curve: 's' }];
  const sandbox = { __api: new Proxy({}, { get: () => () => undefined }), log: () => {}, logError: () => {} };
  vm.createContext(sandbox);
  vm.runInContext(extractRawString('JsScriptEngine.cpp', 'JS'), sandbox);
  close(sandbox.mapCurve(0.5, numbered), 'JS prelude, keyed from 0');
  for (const points of [numbered, curved]) {
    const editor = sampleEnvelope(points);
    const plugin = sandbox.__animSample(points);
    assert.equal(plugin.length, editor.length, 'one sample per step in both');
    const apart = editor.findIndex((y, i) => Math.abs(y - plugin[i]) > 1e-9);
    assert.equal(apart, -1, `JS prelude samples ${JSON.stringify(points)} apart from the editor at ${apart}`);
  }

  const { LuaFactory } = await import('wasmoon');
  const lua = await new LuaFactory().createEngine();
  try {
    for (const name of ['log', 'logError', 'sendCC', 'on', 'startTimer', 'stopTimer']) lua.global.set(name, () => {});
    await lua.doString(extractRawString('LuaScriptEngine.cpp', 'LUA'));
    const got = String(await lua.doString('return string.format("%.17g\\n%.17g", '
      + 'mapCurve(0.5, {{[0] = 0, [1] = 0.2}, {[0] = 1, [1] = 0.6, [2] = "exp"}}), '
      + 'mapCurve(0.5, {{0, 0.2}, {1, 0.6, "exp"}}))')).split('\n');
    close(got[0], 'Lua prelude, keyed from 0');
    close(got[1], 'Lua prelude, keyed from 1');
  } finally {
    lua.global.close();
  }

  const { spawnSync } = await import('node:child_process');
  const python = findPython3(spawnSync);
  if (!python) {
    t.diagnostic('Python 3 is not on this machine: its numbered points were not compared');
    return;
  }
  const driver = `
import sys, json
class _Bridge:
    def __getattr__(self, name): return lambda *a, **k: None
sys.modules["ceditor"] = _Bridge()
payload = json.loads(sys.stdin.read())
g = {"__name__": "prelude"}
for name in ["log", "logError", "on", "off", "emit", "run", "set", "get", "sendCC", "startTimer", "stopTimer"]:
    g[name] = (lambda *a, **k: None)
exec(compile(payload["prelude"], "prelude", "exec"), g)
sys.stdout.write(json.dumps([
    g["mapCurve"](0.5, [{0: 0, 1: 0.2}, {0: 1, 1: 0.6, 2: "exp"}]),
    g["mapCurve"](0.5, [(0, 0.2), {"x": 1, "y": 0.6, "curve": "exp"}]),
]))
`;
  const run = spawnSync(python, ['-c', driver], {
    input: JSON.stringify({ prelude: extractRawString('PythonScriptEngine.cpp', 'PY') }),
    encoding: 'utf8',
    env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
  });
  assert.equal(run.status, 0, `the Python prelude failed to run:\n${run.stderr}`);
  const [keyed, mixed] = JSON.parse(run.stdout);
  close(keyed, 'Python prelude, keyed from 0');
  close(mixed, 'Python prelude, a pair and a named point');
});

/* ------------------------------------------------- ce.math's colours, in CSS's short forms */

// The ce.math colour helpers read a colour as if the long form a property stores for it had been
// given (scriptColours.storedColour): "red" is "#FF0000", rgba(255, 0, 0, 0.5) is "80FF0000". The
// WebView reads CSS with four regular expressions and JavaScript's numbers; each prelude has its own
// port (Lua with a tokenizer, as its patterns have no alternation), so these are the places they could
// part: the case of a name, a function or a unit; every syntax; a number Number() reads and another
// language might not; Math.round's half, which goes up where Python's round() goes to even and Lua
// has none; `%` on a negative hue; JavaScript's white space, which is neither Python's nor Lua's;
// and every form that stays refused, with its hint. Each input goes through every colour helper,
// and the answer and the console lines are compared with the WebView's.
const COLOUR_FORM_INPUTS = [
  // The panel's own forms, read as before.
  '5B9BD5', '#5B9BD5', '805B9BD5', '#805b9bd5',
  // Names, in any case, and "transparent". JavaScript's toLowerCase reads the Kelvin sign as "k".
  'red', 'RED', 'Red', 'SteelBlue', 'rebeccapurple', 'LightGoldenRodYellow', 'darkSlateGrey', 'aqua',
  'transparent', 'TRANSPARENT', 'Transparent', 'Khaki',
  // "#" with three digits.
  '#abc', '#ABC', '#000', '#fFf', '#a1B',
  // rgb() and rgba() with commas, either name with or without an alpha, the name in any case.
  'rgb(0, 0, 0)', 'rgb(91,155,213)', 'rgb( 91 , 155 , 213 )', 'rgba(255, 0, 0, 0.5)', 'rgba(255, 0, 0, 1)',
  'rgb(255, 0, 0, 0.25)', 'rgba(1, 2, 3)', 'RGB(10, 20, 30)', 'Rgba(10, 20, 30, .5)',
  // With spaces, and a slash before the alpha.
  'rgb(91 155 213)', 'rgb(91 155 213 / 0.5)', 'rgb(91 155 213/50%)', 'rgba(255 0 0 / 0)', 'RGBA(1 2 3 / 1)',
  // Percentages: channels (mixed with numbers, as the expressions allow), and alpha.
  'rgb(100%, 50%, 0%)', 'rgb(30% 30% 30%)', 'rgb(50%, 10, 20)', 'rgb(0.5%, 100.5%, -1%)',
  'rgba(0, 0, 0, 30%)', 'rgb(0 0 0 / 50%)', 'rgba(0, 0, 0, 150%)', 'rgba(0, 0, 0, -10%)',
  // Alpha 0, above 1 and below 0.
  'rgba(255, 0, 0, 0)', 'rgba(255, 0, 0, 1.5)', 'rgba(255, 0, 0, -1)', 'rgba(255, 0, 0, 0.002)',
  // Channels past either end, the .5 edge of the rounding, and every way Number() reads a number.
  'rgb(300, -5, 256)', 'rgb(1e3, -1e3, 255.4)', 'rgb(254.5, 0.5, 2.5)', 'rgb(-0.5, -0, +5)',
  'rgb(1e400, 0, 0)', 'rgb(.5, 5., 1E1)', 'rgb(1e+2, 1e-2, 12.5e1)', 'rgb(-2.5, 3.5, 1.4999999999999999)',
  // hsl() and hsla(): each unit, in any case; a negative hue, one past 360, and a fractional one.
  'hsl(0, 100%, 50%)', 'hsl(120, 100%, 25%)', 'hsl(210deg 60% 60%)', 'HSL(210DEG 60% 60%)',
  'hsl(200grad, 50%, 50%)', 'hsl(3.14159rad 50% 50%)', 'hsl(0.5turn 50% 50%)', 'hsl(0.5TURN, 50%, 50%)',
  'hsl(-120, 100%, 50%)', 'hsl(-0.25turn, 100%, 50%)', 'hsl(480, 100%, 50%)', 'hsl(720.5 100% 50%)',
  'hsl(-400grad 40% 60%)', 'hsl(-1rad, 80%, 30%)', 'hsl(359.99, 100%, 50%)', 'hsl(1e2, 50%, 50%)',
  'hsla(120, 100%, 50%, 0.25)', 'hsla(120 100% 50% / 25%)', 'hsl(120 100 50)', 'hsl(120 100% 50% / 1.5)',
  // Saturation and lightness past their ends, and lightness on the .5 edge of the rounding.
  'hsl(0, 150%, -10%)', 'hsl(0, 0%, 30%)', 'hsl(0, 0%, 50%)', 'hsl(0 0% 10%)', 'hsl(30, 50%, 50%)',
  'hsl(90, 33%, 47%)', 'hsl(17.5, 62.5%, 37.5%)',
  // JavaScript's white space inside a function is a separator: a no-break space, an em space.
  'rgb(1, 2,3)', 'rgb(1 2　3)', 'hsl(10  50% 50%)',
  // …and around text is text with space around it, refused with what it means. U+0085 is not white
  // space in JavaScript (Python's strip() takes it), and the long s is not an s (Python's re.I takes it).
  ' red', 'red﻿', '\u0085red', 'rgb(1,\u00852,3)', 'hſl(0, 100%, 50%)',
  // Still refused: what has two readings, or none.
  0xFF0000, 1.5, true, null, '#abcd', '#ABCD', 'abc', 'currentColor', 'currentcolor', ' red ', 'red ',
  '\tred', '', 'notacolour', 'constructor', '__proto__', 'toString', '#12345', '#1234567', 'x5B9BD5',
  '#5B9BD5 ', ' #5B9BD580', ' 5B9BD5', ' #abcd', ' rgb(1, 2, 3) ', ' transparent', ' #ABC',
  'rgb(1,2)', 'rgb(1, 2, 3,)', 'rgb(1 2 3 4)', 'rgb(1, 2 3)', 'rgba(1,2,3 / 0.5)', 'rgb (1,2,3)',
  'rgb(1e, 2, 3)', 'rgb(1.2.3, 4, 5)', 'rgb(+-1, 2, 3)', 'rgb(10deg, 0, 0)', 'rgb(1, 2, 3)x',
  'rgb(0,0,0))', 'rgb()', 'rgb(1 2 3 /)', 'rgb(1%%, 2, 3)', 'hsl(10, 50, 50)', 'hsl(10%, 50%, 50%)',
  'hsl(10, 50%, 50)', 'hsl(10deg%, 50%, 50%)', 'hsl(10 deg, 50%, 50%)', 'hsl(1e400, 50%, 50%)',
  'hsl(1e308turn 50% 50%)', 'hsv(0, 100%, 50%)',
];
const COLOUR_FORM_CASES = COLOUR_FORM_INPUTS.flatMap((x) => [
  ['lighten', [x, 0.2]], ['darken', [x, 0.5]], ['colourAlpha', [x, 0.5]], ['hexToRgb', [x]], ['hexToHsl', [x]],
  ['mixColour', [x, 'FFFFFF', 0.25]], ['mixColour', ['000000', x, 0.5]],
]);

test('the ce.math colour helpers read CSS\'s short forms as a property stores them, in every engine', async (t) => {
  const want = COLOUR_FORM_CASES.map(([fn, args]) => {
    clearScriptTrace();
    const value = canonical(web[fn](...args));
    return { value, errors: get(scriptTrace).filter((e) => e.kind === 'error').map((e) => e.message) };
  });
  // Both outcomes, so neither "everything reads" nor "everything refuses" passes by accident.
  assert.ok(want.filter((w) => w.errors.length === 0).length > 400, 'most short forms are read');
  assert.ok(want.filter((w) => w.errors.length).length > 300, 'and what has no one reading is refused');
  const label = (i) => `${COLOUR_FORM_CASES[i][0]}(${JSON.stringify(COLOUR_FORM_CASES[i][1])})`;

  // JavaScript, under node:vm.
  {
    const errors = [];
    const sandbox = { __api: new Proxy({}, { get: () => () => undefined }), log: () => {}, logError: () => {} };
    vm.createContext(sandbox);
    vm.runInContext(extractRawString('JsScriptEngine.cpp', 'JS'), sandbox);
    sandbox.__api = new Proxy({}, {
      get: (_t, prop) => (prop === 'logAt' ? (kind, m) => { if (kind === 'error') errors.push(String(m)); } : () => undefined),
    });
    COLOUR_FORM_CASES.forEach(([fn, args], i) => {
      errors.length = 0;
      const value = canonical(sandbox[fn](...args));
      assert.deepEqual({ value, errors: [...errors] }, want[i], `JS prelude ${label(i)}`);
    });
  }

  // Lua, under wasmoon, in one crossing. A message may hold a newline (it quotes the colour), so the
  // cases are parted by \3, and each case's answer from its lines by \2.
  {
    const { LuaFactory } = await import('wasmoon');
    const lua = await new LuaFactory().createEngine();
    try {
      for (const name of ['log', 'logError', 'sendCC', 'on', 'startTimer', 'stopTimer']) lua.global.set(name, () => {});
      await lua.doString(extractRawString('LuaScriptEngine.cpp', 'LUA'));
      // Each case in a block of its own: a chunk may hold 200 locals, and there are more cases.
      const calls = COLOUR_FORM_CASES.map(([fn, args]) => `do __errs = {}; local v = __ser(${fn}(`
        + `${args.map(luaLiteral).join(', ')})); out[#out + 1] = v .. "\\2" .. table.concat(__errs, "\\1") end`);
      const chunk = `${LUA_SERIALISER}\n__errs = {}\nlogError = function(m) __errs[#__errs + 1] = tostring(m) end\n`
        + `local out = {}\n${calls.join('\n')}\nreturn table.concat(out, "\\3")`;
      const got = String(await lua.doString(chunk)).split('\u0003');
      assert.equal(got.length, COLOUR_FORM_CASES.length, 'one answer per case');
      got.forEach((line, i) => {
        const [value, lines] = line.split('\u0002');
        assert.deepEqual({ value, errors: lines ? lines.split('\u0001') : [] }, want[i], `Lua prelude ${label(i)}`);
      });
    } finally {
      lua.global.close();
    }
  }

  // Python, when python3 is here.
  const { spawnSync } = await import('node:child_process');
  const python = findPython3(spawnSync);
  if (!python) {
    t.diagnostic('Python 3 is not on this machine: its colour readers were not compared');
    return;
  }
  const driver = `
import sys, json
class _Bridge:
    def __getattr__(self, name): return lambda *a, **k: None
sys.modules["ceditor"] = _Bridge()
payload = json.loads(sys.stdin.read())
g = {"__name__": "prelude"}
for name in ["log", "logError", "on", "off", "emit", "run", "set", "get", "sendCC", "startTimer", "stopTimer"]:
    g[name] = (lambda *a, **k: None)
exec(compile(payload["prelude"], "prelude", "exec"), g)
errors = []
g["logError"] = lambda m, *rest: errors.append(str(m))
out = []
for fn, args in payload["cases"]:
    del errors[:]
    try: out.append({"value": g[fn](*args), "errors": list(errors)})
    except Exception as err: out.append({"raised": type(err).__name__ + ": " + str(err)})
sys.stdout.write(json.dumps(out, ensure_ascii=False))
`;
  const run = spawnSync(python, ['-c', driver], {
    input: pyJson({ prelude: extractRawString('PythonScriptEngine.cpp', 'PY'), cases: COLOUR_FORM_CASES }),
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
  });
  assert.equal(run.status, 0, `the Python prelude failed to run:\n${run.stderr}`);
  JSON.parse(run.stdout).forEach((answer, i) => {
    assert.equal(answer.raised, undefined, `Python prelude ${label(i)} raised ${answer.raised}`);
    assert.deepEqual({ value: canonical(answer.value ?? null), errors: answer.errors }, want[i], `Python prelude ${label(i)}`);
  });
});

// The generated option check finds a member's options by position (and in Python by the parameter's
// name too), from the contract's list of parameters. A prelude function taking them anywhere else
// would be checked on the wrong argument, or not at all, and its refusals would stop agreeing with
// the editor's only for the calls nobody thought to write a case for.
test('each prelude takes the options it checks where the contract says', () => {
  const checks = optionChecks().filter((c) => memberRuntime(MEMBER_BY_ID[c.id]) !== RUNTIME_WEBVIEW);
  const preludes = [
    ['Lua', extractRawString('LuaScriptEngine.cpp', 'LUA'), 'function'],
    ['JS', extractRawString('JsScriptEngine.cpp', 'JS'), 'function'],
    ['Python', extractRawString('PythonScriptEngine.cpp', 'PY'), 'def'],
  ];
  const notInSource = [];
  for (const [language, source, keyword] of preludes) {
    for (const { id, params: [{ index, name }] } of checks) {
      const m = new RegExp(`^${keyword} ${id}\\(([^)]*)\\)`, 'm').exec(source);
      if (!m) { notInSource.push(`${language} ${id}`); continue; }
      const names = m[1].split(',').map((p) => p.split('=')[0].trim());
      assert.equal(names[index], name, `${language} ${id}(${m[1]}): its options are argument ${index + 1}, ${name}`);
    }
  }
  // Lua's set is a host binding rather than prelude source; the check wraps it all the same.
  assert.deepEqual(notInSource, ['Lua set']);
});

// A refused call answers what its member answers for any other refusal (panelApi.js, refusalOf),
// and that answer has to be the same everywhere too: a script testing `if not ce.device.ports(...)`
// or reading `r.ok` from recallPreset must take the same branch in the editor and in the export.
// One unknown key per member the preludes implement, so every kind of answer they give is here.
const OPTION_ANSWER_CASES = [
  ['set', ['K.value', 1, { quiet: true }]], ['requestDump', ['patch', null, { timout: 50 }]],
  ['recallPreset', [0, { rol: 'mainSynth' }]], ['animateTo', ['K.value', 1, { easing: 'outBack' }]],
  ['animateSpring', ['K.value', 1, { curve: 'outBack' }]],
  ['animateEnvelope', ['K.value', [{ x: 0, y: 0 }, { x: 1, y: 1 }], { damping: 3 }]],
  ['syncTimer', ['s', '1/16', { folow: false }]], ['deviceParameters', [{ grp: 'Filter' }]],
  ['deviceDefineParameter', ['p', { cc: 7, nmae: 'Cutoff' }]], ['deviceDefineDump', ['d', { header: 'F0' }]],
  ['devicePorts', [{ dir: 'in' }]], ['checksum', ['roland', [1, 2], { ofset: 1 }]],
  ['panic', [{ reset: false }]], ['encodeJson', [{ a: 1 }, { indnt: 2 }]],
  ['bytesRead', [[1, 2], 0, 2, { ordr: 'lsb' }]], ['bytesWrite', [[1, 2], 0, 2, 300, { bit: 8 }]],
  ['formatNumber', [1, { decimal: 2 }]], ['formatHz', [440, { flats: true }]], ['formatTime', [5, { scal: 's' }]],
  ['formatDb', [-6, { fromgain: true }]], ['formatPercent', [0.5, { mx: 2 }]], ['formatPan', [0, { sign: 'always' }]],
  ['formatRatio', [4, { stile: 'x' }]], ['formatClock', [1000, { hour: true }]], ['formatNote', [60, { middlec: 3 }]],
  ['formatDivision', [1, { tol: 0.1 }]], ['formatTable', [0, ['a'], { strt: 1 }]], ['formatFit', ['a', 4, { allign: 'right' }]],
  ['formatLine', ['a', 'b', 8, { gaps: 2 }]], ['formatParse', ['5', { knd: 'hz' }]],
  ['formatParameter', ['cutoff', 5, { rol: 'mainSynth' }]],
  ['patchCurrent', ['voice', { grups: ['x'] }]], ['patchRead', ['voice', 'fn', { tmeout: 5 }]],
  ['patchLoad', ['x', { rle: 'a' }]], ['patchMorph', [{}, {}, 0.5, { switchat: 0.5 }]],
  ['patchBlend', [[{}, {}], [1, 1], { onlly: ['x'] }]], ['patchRandom', [{ sed: 1 }]],
  ['patchMutate', [{}, 0.1, { sed: 1 }]], ['patchMerge', [{}, {}, { grups: ['x'] }]],
  ['patchDiff', [{}, {}, { exept: ['x'] }]], ['patchEqual', [{}, {}, { lok: ['x'] }]],
  ['patchApply', [{}, { sned: 'none' }]], ['patchSave', ['x', {}, { replce: true }]],
  ['patchList', [{ scpe: 'voice' }]], ['patchForget', ['x', { rle: 'a' }]], ['patchWrite', [{}, 1, { rle: 'a' }]],
];

test('a refused call answers the same in every engine', async (t) => {
  const covered = new Set(OPTION_ANSWER_CASES.map(([fn]) => fn));
  for (const c of optionChecks().filter((x) => memberRuntime(MEMBER_BY_ID[x.id]) !== RUNTIME_WEBVIEW)) {
    assert.ok(covered.has(c.id), `${c.id} needs a case here`);
  }
  const want = OPTION_ANSWER_CASES.map(([fn, args]) => canonical(web[fn](...args)));
  resetScriptStateForTesting();

  {
    const sandbox = { __api: new Proxy({}, { get: () => () => undefined }), log: () => {}, logError: () => {} };
    vm.createContext(sandbox);
    vm.runInContext(extractRawString('JsScriptEngine.cpp', 'JS'), sandbox);
    OPTION_ANSWER_CASES.forEach(([fn, args], i) => {
      assert.equal(canonical(sandbox[fn](...args)), want[i], `JS prelude ${fn}(${JSON.stringify(args)})`);
    });
  }
  {
    const { LuaFactory } = await import('wasmoon');
    const lua = await new LuaFactory().createEngine();
    try {
      for (const name of ['log', 'logError', 'set', 'sendCC', 'sendMidi', 'on', 'startTimer', 'stopTimer']) {
        lua.global.set(name, () => {});
      }
      await lua.doString(extractRawString('LuaScriptEngine.cpp', 'LUA'));
      const calls = OPTION_ANSWER_CASES.map(([fn, args]) => `__ser(${fn}(${args.map(luaLiteral).join(', ')}))`);
      const got = String(await lua.doString(`${LUA_SERIALISER}\nreturn table.concat({${calls.join(',\n')}}, "\\n")`)).split('\n');
      OPTION_ANSWER_CASES.forEach(([fn, args], i) => {
        assert.equal(got[i], want[i], `Lua prelude ${fn}(${JSON.stringify(args)})`);
      });
    } finally {
      lua.global.close();
    }
  }
  const { spawnSync } = await import('node:child_process');
  const python = findPython3(spawnSync);
  if (!python) { t.diagnostic('Python 3 is not on this machine: its answers were not compared'); return; }
  const run = spawnSync(python, ['-c', PY_DRIVER], {
    input: JSON.stringify({ prelude: extractRawString('PythonScriptEngine.cpp', 'PY'), cases: OPTION_ANSWER_CASES }),
    encoding: 'utf8',
    env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
  });
  assert.equal(run.status, 0, `the Python prelude failed to run:\n${run.stderr}`);
  const got = JSON.parse(run.stdout);
  OPTION_ANSWER_CASES.forEach(([fn, args], i) => {
    assert.equal(got[i].error, undefined, `Python prelude ${fn}(${JSON.stringify(args)}) raised ${got[i].error}`);
    assert.equal(canonical(got[i].value ?? null), want[i], `Python prelude ${fn}(${JSON.stringify(args)})`);
  });
});

/* ------------------------------------------------- a value past its end: sent, and said once */

// A value one step past its range (a CC value of 128, a bend of -1) is sent as the nearest end, and
// the first time for each command a warning says so. Two calls, one warning, the same words in every
// engine; an address past its range is refused instead, and is in REFUSAL_CASES above.
const EDGE_CALLS = [['sendCC', [1, 7, 200]], ['sendCC', [1, 7, 300]], ['sendNote', [1, 60, -5]],
  ['sendPitchBend', [1, 20000]], ['sendNRPN', [1, 0, 0, -1]], ['sendAftertouch', [1, 128.4]]];

test('a value past its end is sent as the nearest end and said once, in the same words everywhere', async (t) => {
  resetScriptStateForTesting();
  clearScriptTrace();
  for (const [fn, args] of EDGE_CALLS) web[fn](...args);
  const want = get(scriptTrace).filter((e) => e.kind === 'warn').map((e) => e.message);
  assert.deepEqual(want, [
    'sendCC: the value 200 is outside 0 to 127, so 127 was sent. This is said only the first time.',
    'sendNote: the velocity -5 is outside 0 to 127, so 0 was sent. This is said only the first time.',
    'sendPitchBend: the bend 20000 is outside 0 to 16383, so 16383 was sent. This is said only the first time.',
    'sendNRPN: the value -1 is outside 0 to 16383, so 0 was sent. This is said only the first time.',
    'sendAftertouch: the pressure 128.4 is outside 0 to 127, so 127 was sent. This is said only the first time.',
  ], 'the second sendCC says nothing');
  assert.deepEqual(get(scriptTrace).filter((e) => e.kind === 'error'), []);

  // JavaScript, under node:vm.
  {
    const warns = [];
    const sandbox = { __api: new Proxy({}, { get: () => () => undefined }), log: () => {}, logError: () => {} };
    vm.createContext(sandbox);
    vm.runInContext(extractRawString('JsScriptEngine.cpp', 'JS'), sandbox);
    sandbox.__api = new Proxy({}, {
      get: (_t, prop) => (prop === 'logAt' ? (kind, m) => { if (kind === 'warn') warns.push(String(m)); } : () => undefined),
    });
    for (const [fn, args] of EDGE_CALLS) sandbox[fn](...args);
    assert.deepEqual(warns, want, 'JS prelude');
  }
  // Lua, under wasmoon.
  {
    const { LuaFactory } = await import('wasmoon');
    const lua = await new LuaFactory().createEngine();
    try {
      for (const name of ['log', 'logError', 'logWarn', 'sendCC', 'sendNRPN', 'sendMidi', 'on', 'startTimer', 'stopTimer']) {
        lua.global.set(name, () => {});
      }
      await lua.doString(extractRawString('LuaScriptEngine.cpp', 'LUA'));
      const calls = EDGE_CALLS.map(([fn, args]) => `${fn}(${args.map(luaLiteral).join(', ')})`).join('\n');
      const got = String(await lua.doString(`local w = {}\nlogWarn = function(m) w[#w + 1] = tostring(m) end\n${calls}\nreturn table.concat(w, "\\n")`));
      assert.deepEqual(got.split('\n'), want, 'Lua prelude');
    } finally {
      lua.global.close();
    }
  }
  // Python, when python3 is here.
  const { spawnSync } = await import('node:child_process');
  const python = findPython3(spawnSync);
  if (!python) { t.diagnostic('Python 3 is not on this machine: its warnings were not compared'); return; }
  const driver = `
import sys, json
class _Bridge:
    def __getattr__(self, name): return lambda *a, **k: None
sys.modules["ceditor"] = _Bridge()
payload = json.loads(sys.stdin.read())
g = {"__name__": "prelude"}
for name in ["log", "logError", "on", "off", "emit", "run", "set", "get", "sendCC", "startTimer", "stopTimer"]:
    g[name] = (lambda *a, **k: None)
exec(compile(payload["prelude"], "prelude", "exec"), g)
warns = []
g["logWarn"] = lambda m, *rest: warns.append(str(m))
for fn, args in payload["calls"]:
    g[fn](*args)
sys.stdout.write(json.dumps(warns, ensure_ascii=False))
`;
  const run = spawnSync(python, ['-c', driver], {
    input: JSON.stringify({ prelude: extractRawString('PythonScriptEngine.cpp', 'PY'), calls: EDGE_CALLS }),
    encoding: 'utf8',
    env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
  });
  assert.equal(run.status, 0, `the Python prelude failed to run:\n${run.stderr}`);
  assert.deepEqual(JSON.parse(run.stdout), want, 'Python prelude');
});

/* ------------------------------------------------- ce.time's numbers, as the transport reads them */

// A number ce.time's helpers cannot use as written is said, once per helper and argument, in the
// same words in every engine (timeWords.js). The second barBeatAt and the second cycleAt's bars say
// nothing; text that is a number, and an argument left out, say nothing at all.
const TIME_CALLS = [
  ['barBeatAt', [-1, 0]], ['barBeatAt', [-2, 0]], ['stepAt', ['x', '1/16']], ['stepsBetween', [0, 4, '1/4', 0.4]],
  ['stepsBetween', [-2, 'soon', '1/4']], ['swingOffset', [true, 2, '1/16']], ['cycleAt', ['x', 100, 0]],
  ['cycleAt', [4, 0.1]], ['loopedBeats', [-3, -1, 0]], ['beatsToMs', ['x', 120]], ['beatsToMs', [1, -5]],
  ['msToBeats', [true, 'fast']], ['barBeatAt', ['8', null]], ['stepAt', ['2.5', '1/8']],
  // A tap or a gap that is not a number above 0 is left out, and a pause that is not one is 2000.
  ['tapTempo', [[1000, 'x', 1500, 0, 2000], 'x']], ['tapTempo', [[1000, 1500], -1]], ['clockTempo', [[20, 0, 21]]],
];

test('ce.time\'s helpers say a number they cannot use as written, once, in the same words everywhere', async (t) => {
  resetScriptStateForTesting();
  clearScriptTrace();
  for (const [fn, args] of TIME_CALLS) web[fn](...args);
  const want = get(scriptTrace).filter((e) => e.kind === 'warn').map((e) => e.message);
  const said = (text) => `${text} This is said only the first time.`;
  assert.deepEqual(want, [
    said('ce.time.position: beats is -1, which is less than 0, so 0 was used.'),
    said('ce.time.position: beatsPerBar is 0, which is less than 1, so 1 was used.'),
    said('ce.time.step: beats is "x", which is not a number, so 0 was used.'),
    said('ce.time.steps: max is 0.4, which is less than 1, so 1 was used.'),
    said('ce.time.steps: from is -2, which is less than 0, so 0 was used.'),
    said('ce.time.steps: to is "soon", which is not a number, so 0 was used.'),
    said('ce.time.swing: step is true, which is not a number, so 0 was used.'),
    said('ce.time.swing: amount is 2, which is more than 1, so 1 was used.'),
    said('ce.time.cycle: beats is "x", which is not a number, so 0 was used.'),
    said('ce.time.cycle: bars is 100, which is more than 64, so 64 was used.'),
    said('ce.time.cycle: beatsPerBar is 0, which is less than 1, so 1 was used.'),
    said('ce.time.looped: beats is -3, which is less than 0, so 0 was used.'),
    said('ce.time.looped: startBeats is -1, which is less than 0, so 0 was used.'),
    said('ce.time.looped: lengthBeats is 0, which is less than 0.01, so 0.01 was used.'),
    said('ce.time.beatsToMs: beats is "x", which is not a number, so 0 was used.'),
    said('ce.time.beatsToMs: bpm is -5, which is not above 0, so the transport\'s tempo was used.'),
    said('ce.time.msToBeats: ms is true, which is not a number, so 0 was used.'),
    said('ce.time.msToBeats: bpm is "fast", which is not a number, so the transport\'s tempo was used.'),
    said('ce.time.tap: "x" at position 2 of times is not a tap time in milliseconds above 0, so it was left out.'),
    said('ce.time.tap: resetMs is "x", which is not a number, so 2000 was used.'),
    said('ce.time.clockTempo: 0 at position 2 of intervalsMs is not a gap in milliseconds above 0, so it was left out.'),
  ], 'the second tap\'s 0 and -1 are not said again');
  assert.deepEqual(get(scriptTrace).filter((e) => e.kind === 'error'), []);
  resetScriptStateForTesting();

  // JavaScript, under node:vm.
  {
    const warns = [];
    const sandbox = { __api: new Proxy({}, { get: () => () => undefined }), log: () => {}, logError: () => {} };
    vm.createContext(sandbox);
    vm.runInContext(extractRawString('JsScriptEngine.cpp', 'JS'), sandbox);
    sandbox.__api = new Proxy({}, {
      get: (_t, prop) => (prop === 'logAt' ? (kind, m) => { if (kind === 'warn') warns.push(String(m)); } : () => undefined),
    });
    for (const [fn, args] of TIME_CALLS) sandbox[fn](...args);
    assert.deepEqual(warns, want, 'JS prelude');
  }
  // Lua, under wasmoon.
  {
    const { LuaFactory } = await import('wasmoon');
    const lua = await new LuaFactory().createEngine();
    try {
      // __transportState answers nothing, as a host with no transport does: a bpm the helpers cannot
      // use falls back to a tempo there is none of.
      for (const name of ['log', 'logError', 'logWarn', 'sendCC', 'sendNRPN', 'sendMidi', 'on', 'startTimer', 'stopTimer', '__transportState']) {
        lua.global.set(name, () => {});
      }
      await lua.doString(extractRawString('LuaScriptEngine.cpp', 'LUA'));
      const calls = TIME_CALLS.map(([fn, args]) => `${fn}(${args.map(luaLiteral).join(', ')})`).join('\n');
      const got = String(await lua.doString(`local w = {}\nlogWarn = function(m) w[#w + 1] = tostring(m) end\n${calls}\nreturn table.concat(w, "\\n")`));
      assert.deepEqual(got.split('\n'), want, 'Lua prelude');
    } finally {
      lua.global.close();
    }
  }
  // Python, when python3 is here.
  const { spawnSync } = await import('node:child_process');
  const python = findPython3(spawnSync);
  if (!python) { t.diagnostic('Python 3 is not on this machine: its warnings were not compared'); return; }
  const driver = `
import sys, json
class _Bridge:
    def __getattr__(self, name): return lambda *a, **k: None
sys.modules["ceditor"] = _Bridge()
payload = json.loads(sys.stdin.read())
g = {"__name__": "prelude"}
for name in ["log", "logError", "on", "off", "emit", "run", "set", "get", "sendCC", "startTimer", "stopTimer"]:
    g[name] = (lambda *a, **k: None)
exec(compile(payload["prelude"], "prelude", "exec"), g)
warns = []
g["logWarn"] = lambda m, *rest: warns.append(str(m))
for fn, args in payload["calls"]:
    g[fn](*args)
sys.stdout.write(json.dumps(warns, ensure_ascii=False))
`;
  const run = spawnSync(python, ['-c', driver], {
    input: JSON.stringify({ prelude: extractRawString('PythonScriptEngine.cpp', 'PY'), calls: TIME_CALLS }),
    encoding: 'utf8',
    env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
  });
  assert.equal(run.status, 0, `the Python prelude failed to run:\n${run.stderr}`);
  assert.deepEqual(JSON.parse(run.stdout), want, 'Python prelude');
});

/* ---------------------------------------------- each language's own byte type, as a list */

// The byte-list helpers take a list or hex text everywhere, and also the byte type each language
// already has: a typed array in JavaScript, bytes or a bytearray in Python. (The WebView half is in
// scriptBytes.test.js.) A list always comes back, so what a script does next is the same in every
// language.
test('the byte helpers read each language\'s own byte type as a list', async (t) => {
  const sandbox = { __api: new Proxy({}, { get: () => () => undefined }), log: () => {}, logError: () => {} };
  vm.createContext(sandbox);
  vm.runInContext(extractRawString('JsScriptEngine.cpp', 'JS'), sandbox);
  assert.equal(vm.runInContext('bytesToHex(new Uint8Array([0xF0, 0x41]))', sandbox), 'F0 41');
  assert.equal(vm.runInContext('getBits(new Uint8Array([0, 0xB4]), 12, 3)', sandbox), 3);
  assert.deepEqual(plain(vm.runInContext('bytesPut(new Uint8Array([1, 2]), 2, new Uint8Array([3]))', sandbox)), [1, 2, 3]);

  const { spawnSync } = await import('node:child_process');
  const python = findPython3(spawnSync);
  if (!python) { t.diagnostic('Python 3 is not on this machine: bytes and bytearray were not checked'); return; }
  const driver = `
import sys, json
class _Bridge:
    def __getattr__(self, name): return lambda *a, **k: None
sys.modules["ceditor"] = _Bridge()
g = {"__name__": "prelude"}
for name in ["log", "logError", "on", "off", "emit", "run", "set", "get", "sendCC", "startTimer", "stopTimer"]:
    g[name] = (lambda *a, **k: None)
exec(compile(sys.stdin.read(), "prelude", "exec"), g)
out = [g["bytesToHex"](b"\\xf0\\x41"), g["getBits"](bytearray([0, 0xB4]), 12, 3),
       g["bytesPut"](bytearray([1, 2]), 2, b"\\x03"), g["bytesToBase64"](bytes([240, 65, 16, 66]))]
sys.stdout.write(json.dumps(out))
`;
  const ran = spawnSync(python, ['-c', driver], {
    input: extractRawString('PythonScriptEngine.cpp', 'PY'), encoding: 'utf8',
    env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
  });
  assert.equal(ran.status, 0, ran.stderr);
  assert.deepEqual(JSON.parse(ran.stdout), ['F0 41', 3, [1, 2, 3], '8EEQQg==']);
});

/* -------------------------------------------------------------- the generated ce.* namespace */

test('the generated namespace block runs in the JS prelude and reaches the same functions', () => {
  const prelude = extractRawString('JsScriptEngine.cpp', 'JS');
  const sandbox = { __api: new Proxy({}, { get: () => () => undefined }) };
  vm.createContext(sandbox);
  vm.runInContext(prelude, sandbox);

  assert.equal(typeof sandbox.ce, 'object', 'ce should exist after the prelude runs');
  assert.equal(sandbox.ce.midi.sendCC, sandbox.sendCC, 'ce.midi.sendCC is the flat sendCC');
  assert.equal(sandbox.ce.math.clamp(5, 0, 3), 3);
  assert.equal(sandbox.ce.midi.checksum('roland', [1, 2, 3]), web.checksum('roland', [1, 2, 3]));
  assert.equal(typeof sandbox.ce.components.setlist.next, 'function', 'the panel-verb stub is namespaced too');
  assert.equal(sandbox.ce.components.setlist.next, sandbox.setlistNext);
  assert.equal(typeof sandbox.ce.core.set, 'function', 'ce.core mirrors the globals for discoverability');
});

test('the generated namespace block runs in the Lua prelude and reaches the same functions', async () => {
  const { LuaFactory } = await import('wasmoon');
  const lua = await new LuaFactory().createEngine();
  try {
    // The real engine's installApi() binds the ce.core verbs as host functions BEFORE the prelude
    // runs, so the generated namespace block finds them in _G. Mirror that, or ce.core comes out
    // empty here for a reason that has nothing to do with the block being tested.
    for (const hostBinding of ['set', 'get', 'log', 'on', 'off', 'emit', 'run', 'noTransmit', 'transmit', 'sendCC']) {
      lua.global.set(hostBinding, () => {});
    }
    await lua.doString(extractRawString('LuaScriptEngine.cpp', 'LUA'));

    // One crossing, as everywhere else in this file — wasmoon's heap does not survive many.
    // Separator is "|" rather than a newline: escaping a newline through JS template literal ->
    // Lua string literal is one layer of quoting too many, and gets it wrong silently.
    const got = String(await lua.doString(`
      return table.concat({
        tostring(ce ~= nil),
        tostring(ce.midi.sendCC == sendCC),
        tostring(ce.math.clamp(5, 0, 3)),
        tostring(ce.midi.checksum("roland", {1, 2, 3})),
        tostring(type(ce.components.setlist.next)),
        tostring(ce.components.setlist.next == setlistNext),
        tostring(type(ce.core.set)),
      }, "|")`)).split('|');

    assert.equal(got[0], 'true', 'ce should exist after the prelude runs');
    assert.equal(got[1], 'true', 'ce.midi.sendCC is the flat sendCC');
    assert.equal(got[2], '3');
    assert.equal(got[3], String(web.checksum('roland', [1, 2, 3])));
    assert.equal(got[4], 'function', 'the panel-verb stub is namespaced too');
    assert.equal(got[5], 'true');
    assert.equal(got[6], 'function', 'ce.core mirrors the globals for discoverability');
  } finally {
    lua.global.close();
  }
});

/* ------------------------------------------------------------------ ce.storage JSON (§43)
 *
 * A stricter bar than everything above, and it has to be. The rest of this file canonicalises both
 * sides before comparing, so it checks that the runtimes compute the same VALUE. encode() returns a
 * string a script puts somewhere — into a setting, into a SysEx payload — so here the four have to
 * produce the same CHARACTERS.
 *
 * That is why the encoder is written out by hand in Lua and in Python rather than handed to a
 * library: json.dumps spells 1e-5 as "1e-05" where JavaScript spells the same double "0.00001", and
 * a patch encoded in the editor would not compare equal to the same patch encoded in the plugin.
 * Lua has no json module at all, which is the reason the verbs exist.
 */

/** A Lua source literal for a JavaScript value — the input side, so the encoder is what is tested. */
function luaJsonLiteral(v) {
  if (v === null || v === undefined) return 'nil';
  if (typeof v === 'boolean') return String(v);
  if (typeof v === 'number') return String(v);   // JS prints the shortest round-trip; Lua reads it
  if (typeof v === 'string') {
    // Lua's own decimal escape, zero-padded so a following digit cannot be swallowed. Bytes above
    // 0x7F stay in the source as UTF-8, which is how the prelude itself carries them.
    let out = '"';
    for (const ch of v) {
      const code = ch.codePointAt(0);
      if (ch === '"') out += '\\"';
      else if (ch === '\\') out += '\\\\';
      else if (code < 32 || code === 127) out += `\\${String(code).padStart(3, '0')}`;
      else out += ch;
    }
    return `${out}"`;
  }
  if (Array.isArray(v)) return `{${v.map(luaJsonLiteral).join(', ')}}`;
  return `{${Object.entries(v).map(([k, x]) => `[${luaJsonLiteral(k)}] = ${luaJsonLiteral(x)}`).join(', ')}}`;
}

test('the Lua prelude encodes and decodes JSON byte-for-byte as the WebView does', async () => {
  const { LuaFactory } = await import('wasmoon');
  const lua = await new LuaFactory().createEngine();
  try {
    for (const binding of ['log', 'logError', 'sendCC', 'on', 'startTimer', 'stopTimer']) {
      lua.global.set(binding, () => {});
    }
    await lua.doString(extractRawString('LuaScriptEngine.cpp', 'LUA'));

    // One crossing, as everywhere else in this file — wasmoon's heap does not survive many. "\\1"
    // as the separator rather than a newline or a pipe: a fixture contains both of those.
    const encodes = JSON_CASES.map((c) => `tostring(encodeJson(${luaJsonLiteral(c.value)}))`);
    const natives = NATIVE_ENCODE_CASES.map((c) => `tostring(encodeJson(${c.lua}))`);
    const decodes = JSON_DECODE_CASES.map((c) => `tostring(encodeJson(decodeJson(${luaJsonLiteral(c.text)})))`);
    const rejects = JSON_REJECTS.map((t) => `tostring(decodeJson(${luaJsonLiteral(t)}))`);
    const indent = ['tostring(encodeJson({ b = 2, a = 1 }, { indent = 2 }))'];
    const all = [...encodes, ...natives, ...decodes, ...rejects, ...indent];
    const got = String(await lua.doString(
      `return table.concat({${all.join(',\n')}}, "\\1")`)).split('\u0001');

    assert.equal(got.length, all.length, 'expected one result per case');
    let at = 0;
    for (const c of JSON_CASES) assert.equal(got[at++], c.json, `Lua encode: ${c.name}`);
    for (const c of NATIVE_ENCODE_CASES) assert.equal(got[at++], c.json, `Lua encode: ${c.name}`);
    for (const c of JSON_DECODE_CASES) {
      assert.equal(got[at++], c.json, `Lua decode: ${JSON.stringify(c.text)}`);
    }
    for (const t of JSON_REJECTS) {
      // tostring(nil) is "nil": the text was refused, which is what tells a malformed config from
      // an empty one.
      assert.equal(got[at++], 'nil', `Lua should refuse ${JSON.stringify(t)}`);
    }
    assert.equal(got[at++], web.encodeJson({ b: 2, a: 1 }, { indent: 2 }), 'Lua indent');
  } finally {
    lua.global.close();
  }
});

test('the JavaScript prelude encodes and decodes JSON byte-for-byte as the WebView does', () => {
  const prelude = extractRawString('JsScriptEngine.cpp', 'JS');
  const sandbox = { __api: new Proxy({}, { get: () => () => undefined }) };
  vm.createContext(sandbox);
  vm.runInContext(prelude, sandbox);

  for (const c of JSON_CASES) {
    assert.equal(sandbox.encodeJson(c.value), c.json, `JS encode: ${c.name}`);
    assert.equal(sandbox.encodeJson(c.value), web.encodeJson(c.value),
      `JS encode disagrees with the WebView: ${c.name}`);
  }
  for (const c of NATIVE_ENCODE_CASES) {
    assert.equal(sandbox.encodeJson(vm.runInContext(`(${c.javascript})`, sandbox)), c.json,
      `JS encode: ${c.name}`);
  }
  for (const c of JSON_DECODE_CASES) {
    assert.equal(sandbox.encodeJson(sandbox.decodeJson(c.text)), c.json,
      `JS decode: ${JSON.stringify(c.text)}`);
  }
  for (const t of JSON_REJECTS) {
    assert.equal(sandbox.decodeJson(t), undefined, `JS should refuse ${JSON.stringify(t)}`);
  }
  assert.equal(sandbox.encodeJson({ b: 2, a: 1 }, { indent: 2 }),
    web.encodeJson({ b: 2, a: 1 }, { indent: 2 }));
});

// Same shape as the helper driver above: the prelude runs, then each case is evaluated in its
// namespace and the ANSWER comes back as text, so nothing is canonicalised on the way.
const PY_JSON_DRIVER = `
import sys, json
class _Bridge:
    def __getattr__(self, name): return lambda *a, **k: None
sys.modules["ceditor"] = _Bridge()
payload = json.loads(sys.stdin.read())
g = {"__name__": "prelude"}
for name in ["log", "logError", "on", "off", "emit", "run", "set", "get", "sendCC",
             "startTimer", "stopTimer"]:
    g[name] = (lambda *a, **k: None)
exec(compile(payload["prelude"], "prelude", "exec"), g)
out = []
for value in payload["encode"]:
    out.append(g["encodeJson"](value))
for src in payload["native"]:
    out.append(g["encodeJson"](eval(src, g)))
for text in payload["decode"]:
    out.append(g["encodeJson"](g["decodeJson"](text)))
for text in payload["reject"]:
    out.append(g["decodeJson"](text))
out.append(g["encodeJson"]({"b": 2, "a": 1}, {"indent": 2}))
sys.stdout.write(json.dumps(out, ensure_ascii=False))
`;

test('the Python prelude encodes and decodes JSON byte-for-byte as the WebView does', async (t) => {
  const { spawnSync } = await import('node:child_process');
  const python = findPython3(spawnSync);
  if (!python) {
    t.skip('Python 3 is not on this machine — PythonScriptEngineTests.cpp covers the prelude there');
    return;
  }

  const run = spawnSync(python, ['-c', PY_JSON_DRIVER], {
    input: JSON.stringify({
      prelude: extractRawString('PythonScriptEngine.cpp', 'PY'),
      encode: JSON_CASES.map((c) => c.value),
      native: NATIVE_ENCODE_CASES.map((c) => c.python),
      decode: JSON_DECODE_CASES.map((c) => c.text),
      reject: JSON_REJECTS,
    }),
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    // Same UTF-8 forcing as the compute-agreement test above: cp1252 stdio cannot carry the cases.
    env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
  });
  assert.equal(run.status, 0, `the Python prelude failed to run:\n${run.stderr}`);

  const got = JSON.parse(run.stdout);
  let at = 0;
  for (const c of JSON_CASES) assert.equal(got[at++], c.json, `Python encode: ${c.name}`);
  for (const c of NATIVE_ENCODE_CASES) assert.equal(got[at++], c.json, `Python encode: ${c.name}`);
  for (const c of JSON_DECODE_CASES) {
    assert.equal(got[at++], c.json, `Python decode: ${JSON.stringify(c.text)}`);
  }
  for (const text of JSON_REJECTS) {
    assert.equal(got[at++], null, `Python should refuse ${JSON.stringify(text)}`);
  }
  assert.equal(got[at++], web.encodeJson({ b: 2, a: 1 }, { indent: 2 }), 'Python indent');
});

test('the three preludes derive the same private key for the same script, or scopes do not survive export', () => {
  // A setting saved in script scope by the editor has to be readable by the exported plugin, and
  // that only works if all four spell the key identically. This is the one piece of ce.storage that
  // is not a pure helper and still has to agree across runtimes.
  const prelude = extractRawString('JsScriptEngine.cpp', 'JS');
  const sandbox = { __api: new Proxy({}, { get: () => () => undefined }), __scriptId: 'abc' };
  vm.createContext(sandbox);
  vm.runInContext(prelude, sandbox);
  assert.equal(sandbox.__storageKeyFor('script', 'k'), '\u0001script:abc:k');
  assert.equal(sandbox.__storageKeyFor('panel', 'k'), 'k');
  assert.equal(sandbox.__storageKeyFrom('panel', '\u0001script:other:k'), undefined,
    "a panel listing must not show another script's private key");
  assert.equal(sandbox.__storageStore('script'), 'panel',
    'script scope is a prefix on the panel store, not a store of its own');
  assert.equal(sandbox.__storageStore('local'), 'local');
});

// requestDump's callback is matched against the id a dump arrives under, which is the dump's own
// ("system"), and a request ("requestSystem") is not one. Each runtime asks the host which dump a
// request answers with (the plug-in's "answers" query; the WebView reads the profile itself) and
// waits for that, so a callback for a request hears the dump instead of only its timeout.
test('a callback for a request waits for the dump it answers with, in every prelude', async (t) => {
  const answers = (kind, payload) => (kind === 'answers' && payload?.request === 'requestSystem' ? 'system' : undefined);
  const want = [['system', true], ['common', true]];
  // JavaScript, under node:vm.
  {
    const heard = [];
    const sandbox = { __api: new Proxy({}, { get: () => () => undefined }), log: () => {}, logError: () => {} };
    vm.createContext(sandbox);
    vm.runInContext(extractRawString('JsScriptEngine.cpp', 'JS'), sandbox);
    sandbox.__api = new Proxy({}, { get: (_t, prop) => (prop === 'deviceQuery' ? answers : () => undefined) });
    sandbox.requestDump('requestSystem', (values, info) => heard.push([info.kind, info.ok]));
    sandbox.requestDump('common', (values, info) => heard.push([info.kind, info.ok]));
    sandbox.__resolveDumps('system', 'mainSynth', {}, '');
    sandbox.__resolveDumps('common', 'mainSynth', {}, '');
    assert.deepEqual(heard, want, 'JS prelude');
  }
  // Lua, under wasmoon: the prelude's own onDumpReceived handler is how a dump reaches the waiters.
  {
    const { LuaFactory } = await import('wasmoon');
    const lua = await new LuaFactory().createEngine();
    try {
      for (const name of ['log', 'logError', 'logWarn', 'sendCC', 'sendNRPN', 'sendMidi', 'startTimer', 'stopTimer', '__transportState', '__requestDump']) {
        lua.global.set(name, () => {});
      }
      let onDump = null;
      lua.global.set('on', (_target, event, fn) => { if (event === 'onDumpReceived') onDump = fn; });
      lua.global.set('__deviceQuery', (kind, payload) => answers(kind, payload));
      await lua.doString(extractRawString('LuaScriptEngine.cpp', 'LUA'));
      await lua.doString(`__heard = {}
requestDump("requestSystem", function(values, info) __heard[#__heard + 1] = info.kind end)
requestDump("common", function(values, info) __heard[#__heard + 1] = info.kind end)`);
      assert.equal(typeof onDump, 'function', 'the prelude registers its onDumpReceived handler');
      onDump({ kind: 'system', role: 'mainSynth', values: {} });
      onDump({ kind: 'common', role: 'mainSynth', values: {} });
      const heard = String(await lua.doString('return table.concat(__heard, ",")'));
      assert.deepEqual(heard.split(','), want.map(([kind]) => kind), 'Lua prelude');
    } finally {
      lua.global.close();
    }
  }
  // Python, when python3 is here.
  const { spawnSync } = await import('node:child_process');
  const python = findPython3(spawnSync);
  if (!python) { t.diagnostic('Python 3 is not on this machine: its waiters were not compared'); return; }
  const driver = `
import sys, json
class _Bridge:
    def __getattr__(self, name):
        if name == "deviceQuery":
            return lambda kind, payload=None: "system" if kind == "answers" and (payload or {}).get("request") == "requestSystem" else None
        return lambda *a, **k: None
sys.modules["ceditor"] = _Bridge()
payload = json.loads(sys.stdin.read())
g = {"__name__": "prelude"}
for name in ["log", "logError", "logWarn", "on", "off", "emit", "run", "set", "get", "sendCC", "startTimer", "stopTimer"]:
    g[name] = (lambda *a, **k: None)
exec(compile(payload["prelude"], "prelude", "exec"), g)
heard = []
g["requestDump"]("requestSystem", lambda values, info: heard.append([info["kind"], info["ok"]]))
g["requestDump"]("common", lambda values, info: heard.append([info["kind"], info["ok"]]))
g["__resolveDumps"]("system", "mainSynth", {}, None)
g["__resolveDumps"]("common", "mainSynth", {}, None)
sys.stdout.write(json.dumps(heard))
`;
  const run = spawnSync(python, ['-c', driver], {
    input: JSON.stringify({ prelude: extractRawString('PythonScriptEngine.cpp', 'PY') }),
    encoding: 'utf8',
    env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
  });
  assert.equal(run.status, 0, `the Python prelude failed to run:\n${run.stderr}`);
  assert.deepEqual(JSON.parse(run.stdout), want, 'Python prelude');
});

// Left out, requestDump's timeout is what the profile's request deserves (the plug-in's
// "answerWaitMs" query): a fixed 3000 ms reported an AN1x request, whose own timeout is 4000 ms, as
// unanswered while its reply was on the way. A given timeout still wins, and a kind that is no
// request keeps the 3000 ms.
test('requestDump waits as long as the profile asks, in every prelude', async (t) => {
  const query = (kind, payload) => (kind === 'answerWaitMs' && payload?.request === 'requestVoice' ? 4500 : undefined);
  const want = [4500, 3000, 50];
  {
    const waits = [];
    const sandbox = { __api: new Proxy({}, { get: () => () => undefined }), log: () => {}, logError: () => {} };
    vm.createContext(sandbox);
    vm.runInContext(extractRawString('JsScriptEngine.cpp', 'JS'), sandbox);
    sandbox.__api = new Proxy({}, { get: (_t, prop) => (prop === 'deviceQuery' ? query : () => undefined) });
    sandbox.after = (ms) => { waits.push(ms); };
    sandbox.requestDump('requestVoice', () => {});
    sandbox.requestDump('voiceCommon', () => {});
    sandbox.requestDump('requestVoice', () => {}, { timeout: 50 });
    assert.deepEqual(waits, want, 'JS prelude');
  }
  {
    const { LuaFactory } = await import('wasmoon');
    const lua = await new LuaFactory().createEngine();
    try {
      for (const name of ['log', 'logError', 'logWarn', 'sendCC', 'sendNRPN', 'sendMidi', 'startTimer', 'stopTimer', '__transportState', '__requestDump', 'on']) {
        lua.global.set(name, () => {});
      }
      lua.global.set('__deviceQuery', (kind, payload) => query(kind, payload));
      await lua.doString(extractRawString('LuaScriptEngine.cpp', 'LUA'));
      const waits = [];
      lua.global.set('after', (ms) => { waits.push(Number(ms)); });
      await lua.doString(`requestDump("requestVoice", function() end)
requestDump("voiceCommon", function() end)
requestDump("requestVoice", function() end, { timeout = 50 })`);
      assert.deepEqual(waits, want, 'Lua prelude');
    } finally {
      lua.global.close();
    }
  }
  const { spawnSync } = await import('node:child_process');
  const python = findPython3(spawnSync);
  if (!python) { t.diagnostic('Python 3 is not on this machine: its wait was not compared'); return; }
  const driver = `
import sys, json
class _Bridge:
    def __getattr__(self, name):
        if name == "deviceQuery":
            return lambda kind, payload=None: 4500 if kind == "answerWaitMs" and (payload or {}).get("request") == "requestVoice" else None
        return lambda *a, **k: None
sys.modules["ceditor"] = _Bridge()
payload = json.loads(sys.stdin.read())
g = {"__name__": "prelude"}
for name in ["log", "logError", "logWarn", "on", "off", "emit", "run", "set", "get", "sendCC", "startTimer", "stopTimer"]:
    g[name] = (lambda *a, **k: None)
exec(compile(payload["prelude"], "prelude", "exec"), g)
waits = []
g["after"] = lambda ms, fn: waits.append(ms)
g["requestDump"]("requestVoice", lambda values, info: None)
g["requestDump"]("voiceCommon", lambda values, info: None)
g["requestDump"]("requestVoice", lambda values, info: None, { "timeout": 50 })
sys.stdout.write(json.dumps(waits))
`;
  const run = spawnSync(python, ['-c', driver], {
    input: JSON.stringify({ prelude: extractRawString('PythonScriptEngine.cpp', 'PY') }),
    encoding: 'utf8',
    env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
  });
  assert.equal(run.status, 0, `the Python prelude failed to run:\n${run.stderr}`);
  assert.deepEqual(JSON.parse(run.stdout), want, 'Python prelude');
});

test('the note lists and their words are read, refused and said alike in every engine', async (t) => {
  resetScriptStateForTesting();
  clearScriptTrace();
  const said = [];
  for (const [fn, args] of NOTE_CALLS) {
    clearScriptTrace();
    web[fn](...args);
    said.push(get(scriptTrace).filter((e) => e.kind === 'error' || e.kind === 'warn').map((e) => `${e.kind}: ${e.message}`));
  }
  resetScriptStateForTesting();
  assert.deepEqual(said[0], [], 'a chord by name is read');
  assert.deepEqual(said[2], ['error: ce.music.quality: "X9" at position 2 of notes is not a note name, so there is no answer. '
    + 'A name is a capital letter, then # or b if it has one, then the octave: "C4", "Eb3", "F#-1".']);
  assert.deepEqual([said[7].length, said[8].length], [1, 0], 'a word used as its default is said once');
  // JavaScript, under node:vm.
  {
    const lines = [];
    const sandbox = { __api: new Proxy({}, { get: () => () => undefined }), log: () => {}, logError: () => {} };
    vm.createContext(sandbox);
    vm.runInContext(extractRawString('JsScriptEngine.cpp', 'JS'), sandbox);
    sandbox.__api = new Proxy({}, {
      get: (_t, prop) => (prop === 'logAt' ? (kind, m) => { if (kind === 'error' || kind === 'warn') lines.push(`${kind}: ${m}`); } : () => undefined),
    });
    const got = NOTE_CALLS.map(([fn, args]) => { lines.length = 0; sandbox[fn](...args); return [...lines]; });
    assert.deepEqual(got, said, 'JS prelude');
  }
  // Lua, under wasmoon.
  {
    const { LuaFactory } = await import('wasmoon');
    const lua = await new LuaFactory().createEngine();
    try {
      for (const name of ['log', 'sendCC', 'sendNRPN', 'sendMidi', 'on', 'startTimer', 'stopTimer', '__transportState']) lua.global.set(name, () => {});
      await lua.doString(`__lines = {}
logError = function(m) __lines[#__lines + 1] = "error: " .. tostring(m) end
logWarn = function(m) __lines[#__lines + 1] = "warn: " .. tostring(m) end`);
      await lua.doString(extractRawString('LuaScriptEngine.cpp', 'LUA'));
      const calls = NOTE_CALLS.map(([fn, args]) => `__lines = {}\n${fn}(${args.map(luaLiteral).join(', ')})\n__out[#__out + 1] = table.concat(__lines, "\\u{1}")`).join('\n');
      const out = String(await lua.doString(`__out = {}\n${calls}\nreturn table.concat(__out, "\\u{2}")`));
      const got = out.split('\u0002').map((x) => (x ? x.split('\u0001') : []));
      assert.deepEqual(got, said, 'Lua prelude');
    } finally {
      lua.global.close();
    }
  }
  // Python, when python3 is here.
  const { spawnSync } = await import('node:child_process');
  const python = findPython3(spawnSync);
  if (!python) { t.diagnostic('Python 3 is not on this machine: its words were not compared'); return; }
  const driver = `
import sys, json
class _Bridge:
    def __getattr__(self, name): return lambda *a, **k: None
sys.modules["ceditor"] = _Bridge()
payload = json.loads(sys.stdin.read())
g = {"__name__": "prelude"}
for name in ["log", "on", "off", "emit", "run", "set", "get", "sendCC", "startTimer", "stopTimer"]:
    g[name] = (lambda *a, **k: None)
exec(compile(payload["prelude"], "prelude", "exec"), g)
lines = []
g["logWarn"] = lambda m, *rest: lines.append("warn: " + str(m))
g["logError"] = lambda m, *rest: lines.append("error: " + str(m))
out = []
for fn, args in payload["calls"]:
    lines.clear()
    g[fn](*args)
    out.append(list(lines))
sys.stdout.write(json.dumps(out, ensure_ascii=False))
`;
  const run = spawnSync(python, ['-c', driver], {
    input: JSON.stringify({ prelude: extractRawString('PythonScriptEngine.cpp', 'PY'), calls: NOTE_CALLS }),
    encoding: 'utf8',
    env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
  });
  assert.equal(run.status, 0, `the Python prelude failed to run:\n${run.stderr}`);
  assert.deepEqual(JSON.parse(run.stdout), said, 'Python prelude');
});
