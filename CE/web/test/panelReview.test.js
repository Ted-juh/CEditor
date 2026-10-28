// panelReview.test.js — ce.panel after its review, done in one pass at the owner's word
// (docs/design/api-descriptions-handoff.md, "ce.panel"): every call that did nothing, or did
// something else, without a word now says so, by the rules every module follows. An error means the
// call did nothing; a value used as its default is said once.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { scriptApiForTesting, setRuntimeHost, resetScriptStateForTesting } from '../src/CE_Application/scripting/panelRuntime.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { MEMBER_BY_ID } from '../src/CE_Application/scripting/panelApi.js';

const btn = (name, x, y) => createControl('Button', { name, Transform: { x, y, width: 40, height: 20 } });

/** `fn(api)` on a panel of two buttons, a knob and a container; what it returns, and what was said. */
function run(fn) {
  resetScriptStateForTesting();
  const panel = {
    id: 'p', name: 'P', width: 800, height: 600, scripting: { modules: ['ce.panel'] },
    controls: [btn('A', 0, 0), btn('B', 100, 30), createControl('Knob', { name: 'Cutoff' }), createControl('Container', { name: 'Row' })],
  };
  setRuntimeHost({ panel });
  try {
    clearScriptTrace();
    const result = fn(scriptApiForTesting('', 'panel-review').ce.panel);
    return { result, panel, said: get(scriptTrace).filter((t) => t.kind !== 'log').map((t) => `${t.kind}: ${t.message}`) };
  } finally { setRuntimeHost(null); }
}

test('a type is read in any case, and one left out is refused with why', () => {
  const made = run((p) => [p.create('knob') != null, p.create('BUTTON') != null, p.create()]);
  assert.deepEqual(made.result, [true, true, null]);
  assert.deepEqual(made.said, ['error: ce.panel.create: no type was given. ce.panel.types() lists them.']);
  const found = run((p) => [p.find({ type: 'knob' }), p.find({ type: 'Gizmo' }), p.find({ parent: 'row' })]);
  assert.deepEqual(found.result, [['Cutoff'], [], []]);
  assert.deepEqual(found.said, ['error: ce.panel.find: "Gizmo" is not a control type, so nothing was found. ce.panel.types() lists them.']);
});

test('a container that is not there, or not a container, refuses create and clone: nothing is made', () => {
  const done = run((p) => [p.create('Knob', { parent: 'Nobody' }), p.create('Knob', { parent: 'Cutoff' }), p.clone('A', { parent: 'Nobody' })]);
  assert.deepEqual(done.result, [null, null, null]);
  assert.equal(done.panel.controls.length, 4, 'nothing was added');
  assert.deepEqual(done.said, [
    'error: ce.panel.create("Knob"): no control named "Nobody" to put it in, so nothing was created.',
    'error: ce.panel.create("Knob"): "Cutoff" is not a container (it has no Children section), so nothing was created.',
    'error: ce.panel.clone("A"): no control named "Nobody" to put it in, so nothing was copied.',
  ]);
});

test('a place or size that is not a number, or a size not above 0, keeps the control\'s own and is said once', () => {
  const done = run((p) => [p.create('Knob', { name: 'K', x: 'left', width: -5 }), p.create('Knob', { name: 'L', x: 'left' })]);
  assert.deepEqual(done.result, ['K', 'L']);
  assert.deepEqual(done.said, [
    'warn: ce.panel.create("Knob"): the x "left" is not a number, so its own 0 was kept. This is said only the first time.',
    'warn: ce.panel.create("Knob"): the width -5 is not above 0, so its own 100 was kept. This is said only the first time.',
  ]);
});

test('one name is a list of one, and too few controls are refused with why', () => {
  const one = run((p) => p.align('A', 'left'));
  assert.equal(one.result, 1, 'one control, lined up on itself: placed where it was');
  assert.deepEqual(one.said, [], 'and its name is not read letter by letter');
  const few = run((p) => [p.distribute(['A'], 'hSpacing'), p.align([], 'left'), p.order([], 'front'), p.circle(['A', 'B'], { radius: -10 })]);
  assert.deepEqual(few.result, [0, 0, 0, 0]);
  assert.deepEqual(few.said, [
    'error: ce.panel.distribute needs at least two controls, and only "A" is one, so nothing was moved.',
    'error: ce.panel.align: no control was named, so nothing was moved.',
    'error: ce.panel.order: no control was named, so nothing was moved.',
    'error: ce.panel.circle: the radius -10 is below 0, so nothing was moved.',
  ]);
});

test('an option that is not a number is used as its default, and said once', () => {
  const done = run((p) => [p.grid(['A', 'B'], { columns: 'x' }), p.grid(['A', 'B'], { columns: 0 }), p.distribute(['A', 'B'], 'hSpacing', { gap: 'wide' })]);
  assert.deepEqual(done.said, [
    'warn: ce.panel.grid: the columns "x" is not a number, so 3 was used. This is said only the first time.',
    'warn: ce.panel.grid: the columns 0 is below 1, so 1 was used. This is said only the first time.',
    'warn: ce.panel.distribute: the gap "wide" is not a number, so a gap worked out from the space was used. This is said only the first time.',
  ]);
});

test('a required name or snapshot left out is refused with why', () => {
  const done = run((p) => [p.destroy(), p.destroy('Nobody'), p.info(), p.info('Nobody'), p.restore(), p.restore(5)]);
  assert.deepEqual(done.result, [false, false, null, null, 0, 0]);
  assert.deepEqual(done.said, [
    'error: ce.panel.destroy: no control was named, so nothing was removed.',
    'error: ce.panel.info: no control was named.',
    'error: ce.panel.restore: no snapshot was given: a table of control names and values, as ce.panel.snapshot() gives. Nothing was restored.',
    'error: ce.panel.restore: 5 is not a snapshot: a table of control names and values, as ce.panel.snapshot() gives. Nothing was restored.',
  ], 'a name that is not a control is the query\'s no-result, without a word');
});

test('the texts: one sentence, an example, and the rules on their own lines', () => {
  assert.equal(MEMBER_BY_ID.panelCreate.summary, 'Create a control of a type, and give back its name.');
  assert.equal(MEMBER_BY_ID.panelCreate.example, '`ce.panel.create("Knob", { name = "Cutoff", x = 20, y = 40 })` makes a knob called Cutoff at 20, 40.');
  assert.equal(MEMBER_BY_ID.panelCreate.params[0].summary, 'The control\'s type, such as "Knob": one of `ce.panel.types()`. Case-insensitive.\nNot a type, or left out: rejected with a console error.');
  for (const member of Object.values(MEMBER_BY_ID).filter((m) => /^panel[A-Z]/.test(m.id) && !/^panel(Text|Label|Show)/.test(m.id))) {
    if (!/^panel(Create|Clone|Destroy|Parent|Find|Info|Types|Align|Distribute|Match|Grid|Circle|Flip|Rect|Order|Batch|Keep|Entries|Entry|Define|Undefine|Patch|Snapshot|Each|Restore)$/.test(member.id)) continue;
    assert.ok(member.example, `${member.id} has an example`);
    assert.ok(!/\. [A-Z]/.test(member.summary), `${member.id}'s summary is one sentence: ${member.summary}`);
    for (const param of member.params ?? []) assert.ok(param.summary, `${member.id} ${param.name} says what it takes`);
  }
});
