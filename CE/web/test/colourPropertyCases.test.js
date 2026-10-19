// colourPropertyCases.test.js — the editor's colour rule, case by case, and the C++ tables written
// from it.
//
// A colour property is read by scriptColours.panelColour in the panel view, and by
// CE/src/Scripting/ScriptColours.h in the exported plug-in with its window shut, where a script's
// set() reaches the C++ panel model instead. fixtures/colourPropertyCases.json is read here and by
// CE/tests/PanelValueModelTests.cpp, so a case one runtime stores, writes out or refuses differently
// from the other fails in that runtime's suite, in the same words.
//
// Which properties are colours comes from the section templates on both sides: the C++ reads
// ScriptColours.generated.h, which tools/scripts/gen-colour-fields.mjs writes from scriptColours.js
// and the templates. The last test fails while that header is stale.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { colourFieldAt, panelColour } from '../src/CE_Application/scripting/scriptColours.js';
import { controlSetForPanel, resolveToken } from '../src/CE_Application/models/controlSets.js';

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/colourPropertyCases.json', import.meta.url), 'utf8'));
const resolves = (name) => FIXTURE.controlSetNames.includes(name);

test('every colour property case is stored or refused as the shared fixture says', () => {
  for (const c of FIXTURE.cases) {
    const expected = 'stored' in c ? { colour: c.stored } : { why: c.why, advice: c.advice };
    assert.deepEqual(panelColour(c.value, FIXTURE.fields[c.field], resolves), expected,
      `${c.case}: ${JSON.stringify(c.value)} in a ${c.field} field`);
  }
});

test('the fixture stores and refuses in every kind of field', () => {
  for (const kind of Object.keys(FIXTURE.fields)) {
    const of = FIXTURE.cases.filter((c) => c.field === kind);
    assert.ok(of.some((c) => 'stored' in c), `a ${kind} field stores something`);
    assert.ok(of.some((c) => 'why' in c), `a ${kind} field refuses something`);
  }
  // Every case is one thing or the other, so a case cannot pass by asking for nothing.
  for (const c of FIXTURE.cases) assert.notEqual('stored' in c, 'why' in c, c.case);
});

test('every field case is a colour property, of its kind, or not one, as the shared fixture says', () => {
  for (const c of FIXTURE.fieldCases) {
    assert.deepEqual(colourFieldAt(FIXTURE.roots[c.root], c.path), c.field, `${c.case}: ${c.root} ${c.path}`);
  }
});

test('a reference resolves on a panel as the shared fixture says, against the real control sets', () => {
  // The question set() asks of a reference before it stores one (panelRuntime.js colourWrites).
  for (const c of FIXTURE.controlSetCases) {
    assert.equal(resolveToken(c.name, controlSetForPanel(c.panel)) !== undefined, c.resolves, `${c.case}: ${c.name}`);
  }
});

test('the C++ tables are written from the editor\'s, and are up to date', async () => {
  const gen = await import('../../../tools/scripts/gen-colour-fields.mjs');
  const committed = readFileSync(new URL(`../../../${gen.HEADER_FILE}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(committed, gen.headerText(),
    `${gen.HEADER_FILE} is stale — run: node tools/scripts/gen-colour-fields.mjs --write`);
});
