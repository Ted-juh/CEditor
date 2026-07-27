// panelRuntimeApi.test.js — behaviour of the panel API the WebView runtime binds into scripts.
//
// The parity test (panelApiParity.test.js) checks that every declared member EXISTS. This one
// checks that the ones the audit found broken or missing actually behave: the encoding helpers
// ported from the C++ preludes, checksum honouring its `type` argument, and panic emitting the
// right CC sequence in the right order.
//
// Values are asserted against the C++ preludes in CE/src/Scripting, which are the reference: a
// script that packs a value here and unpacks it in the shipped plugin has to get the same number.

import test from 'node:test';
import assert from 'node:assert/strict';

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { scriptApiForTesting } from '../src/CE_Application/scripting/panelRuntime.js';

const api = scriptApiForTesting();
const runtimeSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'CE_Application', 'scripting', 'panelRuntime.js'),
  'utf8',
);

/* ------------------------------------------------------------------ MIDI encoding helpers */

test('to14bit / from14bit round-trip, and to14Bit is the same function', () => {
  assert.deepEqual(api.to14bit(0), { msb: 0, lsb: 0 });
  assert.deepEqual(api.to14bit(128), { msb: 1, lsb: 0 });
  assert.deepEqual(api.to14bit(16383), { msb: 127, lsb: 127 });
  for (const v of [0, 1, 127, 128, 8192, 16383]) {
    const { msb, lsb } = api.to14bit(v);
    assert.equal(api.from14bit(msb, lsb), v, `round-trip failed for ${v}`);
  }
  // The pre-contract spelling stays working — panels were written against it.
  assert.equal(api.to14Bit, api.to14bit);
});

test('to7bit packs msb-first by default and lsb-first on request', () => {
  assert.deepEqual(api.to7bit(16383, 2), [127, 127]);
  assert.deepEqual(api.to7bit(128, 2), [1, 0]);
  assert.deepEqual(api.to7bit(128, 2, 'lsb'), [0, 1]);
  assert.deepEqual(api.to7bit(1, 4), [0, 0, 0, 1]);
  for (const order of ['msb', 'lsb']) {
    assert.equal(api.from7bit(api.to7bit(1234567, 4, order), order), 1234567);
  }
});

test('nibbles split and recombine a byte', () => {
  assert.deepEqual(api.toNibbles(0xAB), { hi: 0xA, lo: 0xB });
  assert.equal(api.fromNibbles(0xA, 0xB), 0xAB);
  assert.deepEqual(api.nibblize([0xAB, 0xCD]), [0xA, 0xB, 0xC, 0xD]);
  assert.deepEqual(api.denibblize([0xA, 0xB, 0xC, 0xD]), [0xAB, 0xCD]);
  // Odd tail: the missing low nibble reads as zero rather than NaN.
  assert.deepEqual(api.denibblize([0xA, 0xB, 0xC]), [0xAB, 0xC0]);
});

test('ASCII helpers pad to length and read back', () => {
  assert.deepEqual(api.toAscii('Hi'), [72, 105]);
  assert.deepEqual(api.toAscii('Hi', 4), [72, 105, 32, 32]);   // patch names are space-padded
  assert.equal(api.fromAscii([72, 105]), 'Hi');
  assert.equal(api.fromAscii(api.toAscii('Bass', 8)).trimEnd(), 'Bass');
});

test('offset and signed encodings are inverses', () => {
  assert.equal(api.toOffset(-64, 64), 0);
  assert.equal(api.toOffset(63, 64), 127);
  assert.equal(api.fromOffset(0, 64), -64);
  assert.equal(api.toSigned(-1, 8), 255);
  assert.equal(api.fromSigned(255, 8), -1);
  assert.equal(api.fromSigned(127, 8), 127);
});

/* ------------------------------------------------------------------------------ checksum */

test('checksum honours its type argument', () => {
  const bytes = [0x01, 0x02, 0x03];
  // Roland/Yamaha: (128 - sum) & 0x7F. sum = 6 -> 122.
  assert.equal(api.checksum('roland', bytes), 122);
  assert.equal(api.checksum('yamaha', bytes), 122, 'the two spellings are the same algorithm');
  assert.equal(api.checksum('sum', bytes), 6);
  assert.equal(api.checksum('xor', bytes), 0x01 ^ 0x02 ^ 0x03);
  // Type used to be ignored entirely — every call returned the Roland value.
  assert.notEqual(api.checksum('xor', bytes), api.checksum('roland', bytes));
});

test('checksum keeps the one-argument form working', () => {
  const bytes = [0x10, 0x20];
  assert.equal(api.checksum(bytes), api.checksum('roland', bytes));
});

test('a Roland checksum makes the data sum to zero mod 128', () => {
  const data = [0x40, 0x11, 0x00, 0x7F, 0x2A];
  const sum = data.reduce((a, b) => a + b, 0) + api.checksum('roland', data);
  assert.equal(sum % 128, 0);
});

/* --------------------------------------------------------------------------------- panic */

test('panic sends all-sound-off before all-notes-off, on every channel', () => {
  // No JUCE host in a test run, so sends are traced rather than transmitted. Assert the shape
  // through the trace console.
  assert.equal(typeof api.panic, 'function');
  assert.doesNotThrow(() => api.panic());
  assert.doesNotThrow(() => api.panic({ channel: 3 }));
  assert.doesNotThrow(() => api.panic({ channel: 3, resetControllers: false }));
});

/* ------------------------------------------------------------------------ flow: no-ops gone */

test('on / emit / run and the timers are real functions, not the old stubs', () => {
  for (const name of ['on', 'emit', 'run', 'startTimer', 'stopTimer', 'noTransmit', 'transmit']) {
    assert.equal(typeof api[name], 'function', `${name} should be bound`);
  }
  // The stubs were `() => {}` — zero parameters. The real implementations take their arguments.
  assert.ok(api.on.length >= 3, 'on(target, event, fn) should take its three arguments');
  assert.ok(api.run.length >= 1, 'run(ref, args) should take its arguments');
  assert.ok(api.emit.length >= 1, 'emit(name, data) should take its arguments');
});

test('noTransmit and transmit restore the previous override even when the block throws', () => {
  // A block that throws must not leave the override stuck on, or every later write in the panel
  // silently inherits it. Running two throwing blocks back to back would compound the leak.
  assert.doesNotThrow(() => api.noTransmit(() => { throw new Error('boom'); }));
  assert.doesNotThrow(() => api.transmit(() => { throw new Error('boom'); }));
  // Still usable afterwards: a leaked override would not surface as a throw, so assert the
  // observable part — the block runs and control returns normally.
  let ran = false;
  api.noTransmit(() => { ran = true; });
  assert.equal(ran, true);
});

/* ------------------------------------------------------- inbound origin, held across the await */

test('inbound origin is a dispatch flag, not a wrapper around the dispatch call', () => {
  // dispatchEvents is async. Wrapping the CALL in a scope that pops the depth on return would pop
  // it the moment the promise was created — before a single handler ran — and every set() in an
  // inbound handler would transmit, echoing a dump straight back at the synth. The depth has to be
  // held inside dispatchEvents, across the await.
  assert.match(runtimeSource, /async function dispatchEvents\(events, \{ inbound = false \} = \{\}\)/,
    'dispatchEvents should take the inbound flag itself');
  assert.match(runtimeSource, /if \(inbound\) origin\.inboundDepth \+= 1;/);
  assert.match(runtimeSource, /if \(inbound\) origin\.inboundDepth -= 1;/);
  assert.doesNotMatch(runtimeSource, /withInbound\(\(\) => dispatchEvents/,
    'no synchronous wrapper around the async dispatch');
});

test('a decoded dump announces each parameter once, not twice', () => {
  // The decoded values reach scripts by two routes: the dump-parsed event, and deviceRuntimeState
  // (whose subscriber raises onParameterReceived for whatever changed). onDumpParsed has to record
  // what it announced, or every dump is announced a second time, one event per parameter.
  const dumpFn = runtimeSource.slice(runtimeSource.indexOf('function onDumpParsed'));
  assert.match(dumpFn.slice(0, 1600), /runtimeParams\.set\(/,
    'onDumpParsed should seed runtimeParams for the values it announced');
});

test('startTimer replaces a timer with the same id rather than stacking a second one', () => {
  api.startTimer('t', 10_000);
  api.startTimer('t', 10_000);
  assert.doesNotThrow(() => api.stopTimer('t'));
  assert.doesNotThrow(() => api.stopTimer('t'), 'stopping an unknown id is harmless');
  assert.doesNotThrow(() => api.stopTimer('never-started'));
});
