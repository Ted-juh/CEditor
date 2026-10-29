// arpOwnChord.test.js — the Arpeggiator's own chord (item 8 of the owner's review of the arp): a key
// by its note's name or a number round the octave, a degree counted from 1 to its scale's length,
// and followPanelKey(true) taking the panel's key at once, as the inspector's toggle does.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { COMPONENT_VERBS, componentScriptPatch, componentRefusalReason, componentClampWarning } from '../src/CE_Application/scripting/componentVerbs.js';
import { pitchClassOf } from '../src/CE_Application/scripting/musicTheory.js';
import { MODULES } from '../src/CE_Application/scripting/panelApi.js';
import { scriptApiForTesting, setRuntimeHost, resetScriptStateForTesting } from '../src/CE_Application/scripting/panelRuntime.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { valueAtPath, setNestedValue } from '../src/CE_Application/stores/controlTreeUtils.js';
import { arpBaseNotes } from '../src/CE_Application/utils/arpLayout.js';

const verb = (id) => COMPONENT_VERBS.find((v) => v.id === id);

test('a key is a note\'s name in any case, or a number round the octave', () => {
  assert.deepEqual(['C', 'f#', 'Eb', 'BB', 'C♯', 'g#3', ' A ', 12, 14, -1, 2.6, '7'].map(pitchClassOf), [0, 6, 3, 10, 1, 8, 9, 0, 2, 11, 3, 7]);
  assert.deepEqual(['H', '', 'C##', true, null].map(pitchClassOf), [null, null, null, null, null]);
  const key = verb('arpKey');
  assert.deepEqual(componentScriptPatch(key, { key: 0 }, ['F#']), { key: 6 });
  assert.deepEqual(componentScriptPatch(key, { key: 0 }, [14]), { key: 2 });
  assert.deepEqual(componentScriptPatch(key, { key: 0 }, ['H']), {});
  assert.equal(componentRefusalReason(key, { key: 0 }, ['H']), '"H" is not a note: a name such as "C", "F#" or "Eb", or 0 to 11.');
  assert.equal(componentClampWarning(key, 'Arp', [12], { key: 0 }), null, 'round the octave is not past an end');
});

test('a degree counts from 1, stored one lower, to the scale\'s own length', () => {
  const degree = verb('arpDegree');
  assert.deepEqual(componentScriptPatch(degree, { degree: 0, scale: 'minor' }, [5]), { degree: 4 });
  assert.deepEqual(componentScriptPatch(degree, { degree: 0, scale: 'pentatonicMin' }, [7]), { degree: 4 });
  assert.deepEqual(componentScriptPatch(degree, { degree: 0, scale: 'blues' }, [7]), { degree: 5 });
  assert.deepEqual(componentScriptPatch(degree, { degree: 3, scale: 'minor' }, [0]), { degree: 0 });
  assert.equal(componentClampWarning(degree, 'Arp', [7], { scale: 'pentatonicMaj' }),
    'arp Arp: degree(7) — the degree 7 is outside 1 to 5, so 5 was used.');
  assert.equal(componentClampWarning(degree, 'Arp', [7], { scale: 'major' }), null);
  // The chord the engine builds on the stored degree: the fifth of C major is G B D.
  const fifth = { _children: { Arp: { source: 'chord', key: 0, scale: 'major', degree: 4, baseOctave: 3 } } };
  assert.deepEqual(arpBaseNotes(fifth), [55, 59, 62]);
});

/** A runtime over one Arp on a panel whose key is `context`. */
function run(arp, context, fn) {
  resetScriptStateForTesting();
  const control = createControl('Arp', { name: 'Arp' });
  Object.assign(control._children.Arp, arp);
  const panel = { id: 'p', name: 'P', width: 800, height: 400, controls: [control], musicalContext: context,
    scripting: { modules: MODULES.map((m) => m.id) } };
  setRuntimeHost({ panel, scripts: [], readValue: (c, p) => valueAtPath(c, p), writeValue: (c, p, v) => (setNestedValue(c, p, v), true) });
  try {
    clearScriptTrace();
    const result = fn(scriptApiForTesting('Arp', 'arp-chord-probe').ce.components.arp);
    return { result, arp: control._children.Arp, said: get(scriptTrace).filter((t) => t.kind !== 'log').map((t) => t.message) };
  } finally { setRuntimeHost(null); }
}

test.after(() => resetScriptStateForTesting());

test('followPanelKey(true) takes the panel\'s key and scale at once; again when a key() strayed', () => {
  const panelKey = { root: 'D', scale: 'dorian' };
  const done = run({ key: 0, scale: 'minor', followPanelKey: false }, panelKey, (arp) => [arp.followPanelKey('Arp', true), arp.read('Arp', 'key'), arp.read('Arp', 'scale')]);
  assert.deepEqual(done.result, [true, 2, 'dorian']);
  const strayed = run({ key: 0, scale: 'dorian', followPanelKey: true }, panelKey, (arp) => [arp.followPanelKey('Arp', true), arp.read('Arp', 'key')]);
  assert.deepEqual(strayed.result, [true, 2]);
  const off = run({ key: 0, scale: 'minor', followPanelKey: true }, panelKey, (arp) => [arp.followPanelKey('Arp', false), arp.read('Arp', 'key')]);
  assert.deepEqual(off.result, [true, 0], 'false keeps its own key');
  const read = run({ key: 0, degree: 4 }, panelKey, (arp) => [arp.key('Arp', 'Bb'), arp.read('Arp', 'key'), arp.read('Arp', 'degree'), arp.key('Arp', 'X')]);
  assert.deepEqual(read.result, [true, 10, 5, false]);
  assert.deepEqual(read.said, ['arp Arp: key("X") — refused, nothing changed. "X" is not a note: a name such as "C", "F#" or "Eb", or 0 to 11.']);
});

// Item 12: the Euclidean rhythm's pulses run to its own steps, and its rotation goes round them.
test('pulses run to the rhythm\'s steps, and a rotation goes round them', () => {
  const pulses = verb('arpEuclidPulses');
  assert.deepEqual(componentScriptPatch(pulses, { euclidSteps: 8, euclidPulses: 5 }, [20]), { euclidPulses: 8 });
  assert.equal(componentClampWarning(pulses, 'Arp', [20], { euclidSteps: 8 }),
    'arp Arp: euclidPulses(20) — the euclidPulses 20 is outside 0 to 8, so 8 was used.');
  assert.deepEqual(componentScriptPatch(pulses, { euclidSteps: 16, euclidPulses: 5 }, [12]), { euclidPulses: 12 });
  const rotate = verb('arpEuclidRotate');
  assert.deepEqual([-1, 9, 40, 2.6].map((n) => componentScriptPatch(rotate, { euclidSteps: 8, euclidRotate: 5 }, [n]).euclidRotate), [7, 1, 0, 3]);
  assert.equal(componentClampWarning(rotate, 'Arp', [40], { euclidSteps: 8 }), null, 'round the steps is not past an end');
  assert.deepEqual(componentScriptPatch(rotate, { euclidSteps: 8, euclidRotate: 0 }, ['x']), {});
  assert.equal(componentRefusalReason(rotate, { euclidSteps: 8 }, ['x']), '"x" is not a number.');
});

