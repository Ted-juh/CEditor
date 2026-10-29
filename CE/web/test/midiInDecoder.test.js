// The panel view's MIDI input decoder against the table both runtimes are held to
// (CE/tests/fixtures/midiInCases.json; the plug-in's MidiInDecoder.h runs the same table in C++).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createMidiInDecoder } from '../src/CE_Application/scripting/midiInDecoder.js';

const TABLE = JSON.parse(readFileSync(fileURLToPath(new URL('../../tests/fixtures/midiInCases.json', import.meta.url)), 'utf8'));

/** A case's steps through a decoder: every event, in order, and which messages were taken as MPE timbre. */
export function runCase(c) {
  const d = createMidiInDecoder();
  const events = [];
  const taken = [];
  for (const step of c.steps) {
    if ('listen' in step) { d.listen(step.listen, step.opts); continue; }
    if (step.flush) { events.push(...d.flush(step.at)); continue; }
    const r = d.feed(step.role, step.bytes, step.at);
    events.push(...r.events);
    taken.push(r.ccTaken);
  }
  return { events, taken };
}

for (const c of TABLE.cases) {
  test(c.name, () => {
    assert.deepEqual(runCase(c).events, c.events);
  });
}

test('controller 74 on an MPE member channel is expression, not a controller', () => {
  const mpe = TABLE.cases.find((c) => c.name.startsWith('MPE read back'));
  assert.deepEqual(runCase(mpe).taken, [false, true, false, false, false, false, false, false, false, false, false]);
});

test('nextDue says when what waits will go', () => {
  const d = createMidiInDecoder();
  d.feed('a', [224, 0, 64], 0);
  assert.equal(d.nextDue(), null);
  d.feed('a', [224, 0, 65], 3);
  assert.equal(d.nextDue(), 10);
  d.flush(10);
  assert.equal(d.nextDue(), null);
});
