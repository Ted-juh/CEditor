import test from 'node:test';
import assert from 'node:assert/strict';
import { queueContinuousParameterSend, discardPendingParameterSends } from '../src/CE_Application/stores/deviceMidiRuntime.js';

test('a final destination commit supersedes queued drag values without dropping other destinations', async () => {
  const sent = [], frames = [];
  globalThis.window = { __JUCE__: { backend: { emitEvent: (name, payload) => sent.push({ name, payload }) } } };
  globalThis.requestAnimationFrame = fn => { frames.push(fn); return frames.length; };
  try {
    const queue = (control, deviceRole, parameterId, value) => queueContinuousParameterSend({
      requestId: `panel_preview_${control}_continuous_123`, deviceRole, parameterId, value,
    });
    queue('first', 'synth', 'mix', 0.9);
    queue('second', 'synth', 'mix', 0.8);
    queue('third', 'synth', 'cutoff', 0.6);
    queue('first', 'other', 'mix', 0.7);
    discardPendingParameterSends({ deviceRole: 'synth', parameterId: 'mix' });
    for (const frame of frames.splice(0)) frame();
    assert.deepEqual(sent.filter(e => e.name === 'setDeviceParameter').map(e => [e.payload.deviceRole, e.payload.parameterId, e.payload.value]), [
      ['synth', 'cutoff', 0.6], ['other', 'mix', 0.7],
    ]);
    sent.length = 0;
    queue('first', 'synth', 'mix', 0.3);
    for (const frame of frames.splice(0)) frame();
    assert.equal(sent.find(e => e.name === 'setDeviceParameter').payload.value, 0.3, 'a later new gesture can still send');
  } finally {
    delete globalThis.window;
    delete globalThis.requestAnimationFrame;
  }
});
