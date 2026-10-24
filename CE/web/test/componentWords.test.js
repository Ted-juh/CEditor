// componentWords.test.js — the closed word lists a call takes that the API did not list, what the
// runtime says of a word it has none of, and the Values row that offers the words and says it.
//
// The hand-written families (the Zone Splitter, the Phrase Sequencer, the Phrase Recorder, the
// Harmoniser, the Setlist) took a word and either refused it without naming the words (the
// Harmoniser, the Recorder), said "nothing to change" (a phrase seed or direction there is none
// of), or did something nobody asked for: an unknown split preset replaced every zone with one
// whole-keyboard zone. The five verbs every generated family has took the name of one of its verbs,
// and read("fill") or read("step", 99) gave nothing back without a word. ce.panel's arrangement
// verbs refused an unknown word in their own sentence, but the API had the words only in prose, so
// the Values tab could neither offer them nor say it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { MODULES, MEMBER_BY_ID } from '../src/CE_Application/scripting/panelApi.js';
import { scriptApiForTesting, setRuntimeHost, resetScriptStateForTesting } from '../src/CE_Application/scripting/panelRuntime.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';
import { valueAtPath, setNestedValue } from '../src/CE_Application/stores/controlTreeUtils.js';
import { readStatement } from '../src/CE_Application/scripting/scriptValues.js';
import { meaningLine } from '../src/CE_Application/editor/valueRows.js';
import { LAYOUT_WORDS } from '../src/CE_Application/scripting/layoutWords.js';

const TYPES = [['Knob', 'K'], ['Matrix', 'Mat'], ['Turing', 'Tur'], ['Envelope', 'Env'], ['SplitZone', 'Split'],
  ['Phrase', 'Phr'], ['Recorder', 'Rec'], ['Harmoniser', 'Harm'], ['Setlist', 'Songs']];

/** A fresh panel of one of each, a runtime over it, and what `fn` makes it say: { result, lines }. */
function run(fn) {
  resetScriptStateForTesting();
  const controls = TYPES.map(([type, name]) => createControl(type, { name }));
  const panel = { id: 'p', name: 'P', width: 800, height: 400, controls, scripting: { modules: MODULES.map((m) => m.id) } };
  setRuntimeHost({ panel, scripts: [], readValue: (c, p) => valueAtPath(c, p), writeValue: (c, p, v) => (setNestedValue(c, p, v), true) });
  try {
    clearScriptTrace();
    const result = fn(scriptApiForTesting('K', 'words-probe'), controls);
    const trace = get(scriptTrace);
    return { result, lines: trace.filter((t) => t.kind === 'error' || t.kind === 'warn').map((t) => t.message), logs: trace.map((t) => t.message), controls };
  } finally { setRuntimeHost(null); }
}

/** The rows of the call the source is, read over the same controls. */
function rows(src) {
  const controls = TYPES.map(([type, name]) => createControl(type, { name }));
  return readStatement(src, 'lua', src.indexOf('(') + 1, { panel: { controls }, controls }).calls[0].args;
}
const rowNamed = (src, name) => rows(src).find((a) => a.name === name);

test.after(() => resetScriptStateForTesting());

test('a hand-written verb refuses a word it has none of, and names the words', () => {
  const cases = [
    [(api) => api.splitPreset('Split', 'single'), 'split Split: preset {"preset":"single"} — refused, nothing changed. One of: whole, classic, splitLayer, threeWay, velLayer.'],
    [(api) => api.phraseSeed('Phr', 'nope'), 'phrase Phr: seed {"seed":"nope"} — refused, nothing changed. One of: clear, octaves, arpUp, riff, random.'],
    [(api) => api.phraseDirection('Phr', 'sideways'), 'phrase Phr: direction {"direction":"sideways"} — refused, nothing changed. One of: forward, reverse, pingpong, random.'],
    [(api) => api.phraseKey('Phr', 'D'), 'phrase Phr: key {"key":"D"} — refused, nothing changed. A key is a pitch class, a number from 0 to 11 where 0 is C.'],
    [(api) => api.recorderSource('Rec', 'mic'), 'recorder Rec: source {"source":"mic"} — refused, nothing changed. One of: input, panel, both.'],
    [(api) => api.harmonyMode('Harm', 'chordz'), 'harmoniser Harm: mode {"mode":"chordz"} — refused, nothing changed. One of: diatonic, memory.'],
    [(api) => api.harmonyShape('Harm', 'blob'), 'harmoniser Harm: shape {"shape":"blob","preset":"blob"} — refused, nothing changed. One of: major, minor, sus4, maj7, min7, fifths, octaves, or a list of intervals in semitones.'],
    [(api) => api.harmonyOutOfKey('Harm', 'skip'), 'harmoniser Harm: outOfKey {"outOfKey":"skip"} — refused, nothing changed. One of: pass, nearest, mute.'],
    [(api) => api.harmonyDegree('Harm', 9, [0, 4, 7]), 'harmoniser Harm: degree {"degree":9,"chord":[0,4,7]} — refused, nothing changed. There is no degree 9: the scale has 7, 1 to 7.'],
    [(api) => api.setlistGoto('Songs', 'Encore'), 'setlist Songs: goto {"scene":"Encore"} — refused, nothing changed. There is no scene "Encore": a scene is its number from 1 to 3, or its name, "Opener", "Ballad", "Closer".'],
  ];
  for (const [call, said] of cases) {
    const { result, lines } = run(call);
    assert.equal(result, false, said);
    assert.deepEqual(lines, [said]);
  }
  // An unknown preset replaced every zone with one whole-keyboard zone. It changes nothing now.
  const { controls } = run((api) => api.splitPreset('Split', 'single'));
  assert.deepEqual(controls[4]._children.SplitZone.zones.map((z) => z.label), ['Bass', 'Lead']);
});

test('a call that is already so says so, and is not refused', () => {
  // Going to the scene you are on, and clearing an override there is none of, were refused.
  for (const call of [(api) => api.setlistGoto('Songs', 1), (api) => api.harmonyDegree('Harm', 2, 'clear')]) {
    const { result, lines, logs } = run(call);
    assert.deepEqual([result, lines], [true, []]);
    assert.match(logs.at(-1), /— already that way$/);
  }
});

test('read, size, fill and insert name the verbs they take, and read says an index past the end', () => {
  const cases = [
    [(api) => api.ce.components.turing.read('Tur', 'bogus'), undefined, 'turing.read: "bogus" is not a verb of this component. One of: division, editable, gate, length, phase, quantize, randomness, rate, run, showDivisions, showGate, step, sync.'],
    [(api) => api.ce.components.turing.read('Tur', 'fill'), undefined, 'turing.read: "fill" sets nothing, so there is nothing to read back. One of: division, editable, gate, length, phase, quantize, randomness, rate, run, showDivisions, showGate, step, sync.'],
    [(api) => api.ce.components.turing.read('Tur', 'step', 99), undefined, 'turing.read("step", 99): There is no step 99: the steps are 1 to 8.'],
    [(api) => api.ce.components.matrix.read('Mat', 'cell', 2, 9), undefined, 'matrix.read("cell", 2, 9): There is no column 9: the columns are 1 to 4.'],
    [(api) => api.ce.components.turing.size('Tur', 'rate'), undefined, 'turing.size: "rate" does not address a list. One of: step.'],
    [(api) => api.ce.components.turing.fill('Tur', 'bogus', [1]), false, 'turing.fill: "bogus" does not address a list. One of: step.'],
    [(api) => api.ce.components.envelope.insert('Env', 'rate'), false, 'envelope.insert: "rate" does not address a list. One of: pointCurve, pointX, pointY.'],
  ];
  for (const [call, back, said] of cases) {
    const { result, lines } = run(call);
    assert.equal(result, back, said);
    assert.deepEqual(lines, [said]);
  }
  // A good name and index read as they did.
  assert.deepEqual([run((api) => api.ce.components.turing.read('Tur', 'step', 2)).result, run((api) => api.ce.components.turing.read('Tur', 'rate')).result], [0.8, 2]);
});

test('a hand-written family reads a field in any case, and names the fields when it has none of one', () => {
  const zones = run((api) => api.splitRead('Split', 'ZONES'));
  assert.deepEqual([zones.result.map((z) => z.label), zones.lines], [['Bass', 'Lead'], []]);
  const none = run((api) => api.splitRead('Split', 'zonez'));
  assert.equal(none.result, undefined);
  assert.match(none.lines[0], /^split\.read: "zonez" is not a field of this component\. One of: .*\bzones\.$/);
});

test('ce.panel\'s arrangement verbs refuse a word they do not take, in their own sentence', () => {
  const cases = [
    [(api) => api.panelAlign(['K'], 'lefft'), 'ce.panel.align: "lefft" is not an edge. One of: left, hCenter, right, top, vCenter, bottom.'],
    [(api) => api.panelDistribute(['K'], 'edges'), 'ce.panel.distribute: "edges" is not something to spread. One of: leftEdges, hCenters, rightEdges, topEdges, vCenters, bottomEdges, hSpacing, vSpacing.'],
    [(api) => api.panelMatch(['K'], 'size'), 'ce.panel.match: "size" is not width, height or both.'],
    [(api) => api.panelFlip(['K'], 'diagonal'), 'ce.panel.flip: "diagonal" is not horizontal or vertical.'],
    [(api) => api.panelOrder(['K'], 'top'), 'ce.panel.order: "top" is not front, forward, backward or back.'],
  ];
  for (const [call, said] of cases) assert.deepEqual(run(call).lines, [said]);
  // The API lists the words the runtime takes, from the same table.
  for (const [id, { param, values }] of Object.entries(LAYOUT_WORDS)) {
    assert.deepEqual(MEMBER_BY_ID[id].params.find((p) => p.name === param).values, values, id);
  }
});

test('a word from a list is read in any case, by ce.panel and the hand-written families alike', () => {
  // "Left", "Classic" and "Memory" were refused for a capital letter.
  for (const call of [(api) => api.panelAlign(['K'], 'LEFT'), (api) => api.panelFlip(['K'], 'Vertical'),
    (api) => api.panelOrder(['K'], ' Front '), (api) => api.splitPreset('Split', 'Classic'),
    (api) => api.harmonyMode('Harm', 'Memory'), (api) => api.harmonyVoicing('Harm', 'CLOSE'),
    (api) => api.phraseDirection('Phr', 'Forward')]) {
    const { result, lines } = run(call);
    assert.notEqual(result, false, `${call}: ${lines.join(' / ')}`);
    assert.ok(!lines.some((l) => /refused|is not/.test(l)), `${call}: ${lines.join(' / ')}`);
  }
  assert.equal(rowNamed('ce.panel.align({"K"}, "HCENTER")', 'edge').problem, null);
  assert.equal(rowNamed('harmonyMode("Harm", "MEMORY")', 'mode').problem, null);
});

test('the rows offer the words, and say the refusal in the console\'s words', () => {
  const said = (src, name, call) => {
    const row = rowNamed(src, name);
    const { lines } = run(call);
    assert.ok(row?.problem, `${src}: no problem read`);
    assert.equal(row.problem.message, lines[0], src);
    return row;
  };
  said('splitPreset("Split", "single")', 'preset', (api) => api.splitPreset('Split', 'single'));
  said('harmonyMode("Harm", "chordz")', 'mode', (api) => api.harmonyMode('Harm', 'chordz'));
  said('harmonyDegree("Harm", 9, {0, 4, 7})', 'degree', (api) => api.harmonyDegree('Harm', 9, [0, 4, 7]));
  said('setlistGoto("Songs", "Encore")', 'scene', (api) => api.setlistGoto('Songs', 'Encore'));
  said('ce.components.turing.read("Tur", "fill")', 'name', (api) => api.ce.components.turing.read('Tur', 'fill'));
  said('ce.components.turing.read("Tur", "step", 99)', 'index', (api) => api.ce.components.turing.read('Tur', 'step', 99));
  said('ce.components.turing.size("Tur", "rate")', 'name', (api) => api.ce.components.turing.size('Tur', 'rate'));
  said('splitRead("Split", "zonez")', 'field', (api) => api.splitRead('Split', 'zonez'));
  said('ce.panel.flip({"K"}, "diagonal")', 'axis', (api) => api.panelFlip(['K'], 'diagonal'));
  // align's row adds the near miss to the runtime's sentence.
  assert.equal(rowNamed('ce.panel.align({"K"}, "lefft")', 'edge').problem.message,
    'ce.panel.align: "lefft" is not an edge. One of: left, hCenter, right, top, vCenter, bottom. Did you mean "left"?');

  // The words, as a dropdown.
  const choices = (src, name) => { const row = rowNamed(src, name); return [row.editable, row.meaning.choices]; };
  assert.deepEqual(choices('splitPreset("Split", "classic")', 'preset'), ['choice', ['whole', 'classic', 'splitLayer', 'threeWay', 'velLayer']]);
  assert.deepEqual(choices('harmonyMode("Harm", "memory")', 'mode'), ['choice', ['diatonic', 'memory']]);
  assert.deepEqual(choices('setlistGoto("Songs", "Ballad")', 'scene'), ['choice', ['Opener', 'Ballad', 'Closer']]);
  assert.deepEqual(choices('ce.components.turing.size("Tur", "step")', 'name'), ['choice', ['step']]);
  assert.equal(choices('ce.components.turing.read("Tur", "rate")', 'name')[1].includes('fill'), false, 'read offers only what it reads');
  assert.ok(choices('splitRead("Split", "zones")', 'field')[1].includes('zones'));
  assert.deepEqual(choices('ce.panel.order({"K"}, "back")', 'where'), ['choice', ['front', 'forward', 'backward', 'back']]);

  // What a good word or name addresses, now.
  assert.equal(meaningLine(rowNamed('harmonyKey("Harm", 14)', 'key')), 'D: 14 wraps round to 2');
  assert.equal(meaningLine(rowNamed('ce.components.turing.read("Tur", "step", 2)', 'name')), '8 steps');
  assert.equal(meaningLine(rowNamed('ce.components.turing.read("Tur", "step", 2)', 'index')), 'step 2 of 8');
  assert.equal(meaningLine(rowNamed('ce.components.matrix.fill("Mat", "cell", {})', 'name')), '4 rows of 4 columns');
  assert.equal(meaningLine(rowNamed('splitRead("Split", "ZONES")', 'field')), 'zones, now a list of 2');
  assert.equal(meaningLine(rowNamed('setlistGoto("Songs", 2)', 'scene')), 'scene 2 is "Ballad"');
  for (const [src, name] of [['splitPreset("Split", "classic")', 'preset'], ['ce.components.turing.read("Tur", "rate")', 'name'],
    ['harmonyRead("Harm", "mode")', 'field'], ['ce.panel.distribute({"K"}, "hSpacing")', 'what']]) {
    assert.equal(rowNamed(src, name).problem, null, src);
  }
});
