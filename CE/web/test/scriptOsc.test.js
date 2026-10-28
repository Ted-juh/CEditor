// ce.osc in the panel view: commands go over the bridge to the device layer's transport, a refusal
// comes back as a console line, and a message that arrives runs each matching pattern's function and
// onOscIn, with origin() giving "osc". What each runtime checks and sends is oscParity.test.js's; the
// transport itself, OscTests.cpp's.
import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import {
  setRuntimeHost, setLiveEnabled, scriptApiForTesting, resetScriptStateForTesting, clearDeviceRuntimeDefinitions,
  oscHeardForTesting,
} from '../src/CE_Application/scripting/panelRuntime.js';
import { createPlayerHost } from '../src/CE_Application/scripting/playerScriptHost.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';

async function withBridge(run) {
  const sent = [];
  const listeners = {};
  globalThis.window = {
    __JUCE__: { backend: {
      emitEvent: (name, payload) => sent.push([name, payload]),
      addEventListener: (name, fn) => { listeners[name] = fn; return name; },
      removeEventListener: () => {},
    } },
  };
  const panel = { id: 'osc-panel', name: 'OSC panel', controls: [], scripting: { modules: ['ce.core', 'ce.osc'] } };
  setRuntimeHost(createPlayerHost(panel));
  setLiveEnabled(true);
  clearScriptTrace();
  try {
    await run({ api: scriptApiForTesting('', 'osc-script'), sent, listeners });
  } finally {
    clearDeviceRuntimeDefinitions();
    resetScriptStateForTesting();
    setRuntimeHost(null);
    delete globalThis.window;
  }
}

const commands = (sent) => sent.filter(([name]) => name === 'oscCommand').map(([, p]) => p);

test('a command goes to the transport, named for the panel', async () => {
  await withBridge(async ({ api, sent }) => {
    assert.equal(api.ce.osc.listen({ port: 9000, network: true }), true);
    const [listen] = commands(sent);
    assert.deepEqual({ ...listen, requestId: undefined }, { op: 'listen', port: 9000, network: true, nextFree: false, panel: 'OSC panel', requestId: undefined });
    assert.equal(api.ce.osc.send('127.0.0.1:9001', '/fader/1', [0.5, 2], 'fi'), true);
    assert.deepEqual(commands(sent)[1].args, [0.5, 2]);
    assert.equal(commands(sent)[1].types, 'fi');
    assert.equal(api.ce.osc.listen({ port: 80 }), false, 'a bad port is refused before anything is sent');
    assert.equal(commands(sent).length, 2);
  });
});

test('a refusal comes back as a console line, and status() follows the transport', async () => {
  await withBridge(async ({ api, sent }) => {
    api.ce.osc.listen({ port: 9000 });
    const { requestId } = commands(sent)[0];
    oscHeardForTesting('oscCommandAnswered', { requestId, op: 'listen', answer: { ok: false, error: 'portInUse', why: 'port 9000 is in use by another program' } });
    assert.ok(get(scriptTrace).some((t) => /ce\.osc\.listen: port 9000 is in use/.test(t.message ?? t.text ?? '')), 'the reason is said');
    const status = commands(sent).at(-1);
    assert.equal(status.op, 'status', 'and the transport is asked how things stand');
    oscHeardForTesting('oscCommandAnswered', { requestId: status.requestId, op: 'status', answer: { listening: false, error: 'portInUse', received: 0 } });
    assert.equal(api.ce.osc.status().error, 'portInUse');
  });
});

test('a message runs each matching pattern, then onOscIn, with origin "osc"', async () => {
  await withBridge(async ({ api }) => {
    const seen = [];
    api.ce.osc.on('/fader/*', (m) => seen.push(['fader', m.address, api.origin()]));
    const knobs = api.ce.osc.on('/knob/[1-4]', (m) => seen.push(['knob', m.address]));
    api.on('*', 'onOscIn', (m) => seen.push(['in', m.address, api.origin()]));
    oscHeardForTesting('oscMessage', { address: '/fader/2', args: [0.5], types: 'f', from: { host: '127.0.0.1', port: 9000 } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(seen, [['fader', '/fader/2', 'osc'], ['in', '/fader/2', 'osc']]);
    seen.length = 0;
    assert.equal(api.ce.osc.off(knobs), true);
    oscHeardForTesting('oscMessage', { address: '/knob/3', args: [], types: '', from: { host: '127.0.0.1', port: 9000 } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(seen, [['in', '/knob/3', 'osc']], 'after off, only onOscIn');
  });
});

test('the panel closing closes the port', async () => {
  let sentAfter = null;
  await withBridge(async ({ api, sent }) => {
    api.ce.osc.listen();
    sentAfter = sent;
  });
  assert.equal(commands(sentAfter).at(-1).op, 'reset');
});
