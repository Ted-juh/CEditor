import test from 'node:test';
import assert from 'node:assert/strict';
import { queueIncomingFeedback, incomingFeedbackEntries } from '../src/CE_Application/utils/incomingFeedback.js';

test('one MIDI frame retains distinct ports on the same control', () => {
  let pending = null;
  pending = queueIncomingFeedback(pending, 'display', 'brightness', 64);
  pending = queueIncomingFeedback(pending, 'display', 'text', 'Patch A');
  pending = queueIncomingFeedback(pending, 'display', 'brightness', 96);
  assert.deepEqual(incomingFeedbackEntries(pending), [
    { controlId: 'display', port: 'brightness', value: 96 },
    { controlId: 'display', port: 'text', value: 'Patch A' },
  ]);
});

test('a later repeat is forwarded so it can restore a locally changed control', () => {
  let pending = null;
  pending = queueIncomingFeedback(pending, 'display', 'brightness', 64);
  assert.equal(incomingFeedbackEntries(pending).length, 1);

  pending = null;
  pending = queueIncomingFeedback(pending, 'display', 'brightness', 64);
  pending = queueIncomingFeedback(pending, 'display', 'backlight', 64);
  pending = queueIncomingFeedback(pending, 'other', 'brightness', 64);
  assert.deepEqual(incomingFeedbackEntries(pending), [
    { controlId: 'display', port: 'brightness', value: 64 },
    { controlId: 'display', port: 'backlight', value: 64 },
    { controlId: 'other', port: 'brightness', value: 64 },
  ]);
});
