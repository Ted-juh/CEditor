import test from 'node:test';
import assert from 'node:assert/strict';
import { createInboundRefreshQueue } from '../src/CE_Application/utils/inboundRefresh.js';
import { createNativeRuntimeDelta } from '../src/CE_Application/utils/nativeRuntimeDelta.js';

test('a MIDI burst requests one block, then a bounded trailing read with no startup chain', () => {
  let time = 0, sequence = 0;
  const timers = new Map(), sent = [];
  const queue = createInboundRefreshQueue(payload => sent.push(payload), {
    now: () => time,
    later: (callback, delay) => { const id = ++sequence; timers.set(id, { callback, at: time + delay }); return id; },
    cancel: id => timers.delete(id),
  });
  const advance = end => {
    while (true) {
      const due = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]); time = due[1].at; due[1].callback();
    }
    time = end;
  };
  const payload = { deviceRole: 'gaia', profileId: 'roland-gaia-sh01', request: 'requestReverb' };
  queue.request(payload); advance(0);
  for (let i = 0; i < 300; i++) queue.request(payload);
  advance(90); assert.equal(sent.length, 1);
  queue.finish(sent[0].correlationId); advance(99); assert.equal(sent.length, 1);
  advance(100); assert.equal(sent.length, 2);
  assert.equal(sent[1].request, 'requestReverb');
  assert.equal(sent[1].chainStartup, false);
  queue.finish(sent[1].correlationId); advance(2000); assert.equal(sent.length, 2);
  queue.request(payload); advance(2000); queue.request(payload);
  advance(3500); assert.equal(sent.length, 4, 'lost replies release the in-flight read');
  queue.clear(); assert.equal(timers.size, 0);
});

test('a block reply cannot roll unrelated live controls back to the native cache', () => {
  const delta = createNativeRuntimeDelta();
  assert.deepEqual(delta({ gaia: { pitch: 40, cutoff: 60 } }), { gaia: { pitch: 40, cutoff: 60 } });
  // Hardware CC has since moved pitch to 80 in the UI; the native cache still says 40.
  assert.deepEqual(delta({ gaia: { pitch: 40, cutoff: 90 } }), { gaia: { cutoff: 90 } });
  assert.deepEqual(delta({ gaia: { pitch: 40, cutoff: 90 } }), {});
  assert.deepEqual(delta({ gaia: { pitch: 40, cutoff: 90 } }, { gaia: { pitch: 40 } }),
    { gaia: { pitch: 40 } }, 'an actual read of pitch remains authoritative');
});
