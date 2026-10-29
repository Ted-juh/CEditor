// OSC learn in the panel view: a control with an oscControl binding follows a message to its address,
// scaled from the sender's range to its own, with origin() giving "osc"; anything else that moves it
// sends its value back, to the address, and never what came from there. The panel's settings say
// where it listens. Learn takes the next message's address. The window-shut half is the plug-in's.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createControl } from '../src/CE_Application/models/componentTypes.js';
import {
  setRuntimeHost, setLiveEnabled, scriptApiForTesting, resetScriptStateForTesting, clearDeviceRuntimeDefinitions,
  oscHeardForTesting, oscLearnNext, runPreviewSessionsForTesting, syncOscBindingsForTesting,
} from '../src/CE_Application/scripting/panelRuntime.js';
import { createPlayerHost } from '../src/CE_Application/scripting/playerScriptHost.js';
import { createInteractionPreviewSession, panelPreviewSessions } from '../src/CE_Application/stores/interactionPreview.js';
import { oscControlBinding, parseOscTargets } from '../src/CE_Application/utils/oscControlBindings.js';

async function withPanel(run, binding = {}) {
  const sent = [];
  globalThis.window = { __JUCE__: { backend: {
    emitEvent: (name, payload) => sent.push([name, payload]),
    addEventListener: () => 0, removeEventListener: () => {},
  } } };
  const cutoff = createControl('Slider', { name: 'Cutoff' });
  Object.assign(cutoff._children.Behavior, { min: 0, max: 127 });
  cutoff._children.DeviceBindings = { _type: 'DeviceBindings', enabled: true, debug: false,
    bindings: [{ ...oscControlBinding('value'), address: '/fader/1', ...binding }] };
  const id = String(cutoff._children.Core.id);
  panelPreviewSessions.set({ [id]: createInteractionPreviewSession(cutoff) });
  const panel = { id: 'learn', controls: [cutoff], osc: { port: 9100, network: true, targets: 'tablet = 192.168.1.20:9000\nnonsense' } };
  setRuntimeHost(createPlayerHost(panel));
  setLiveEnabled(true);
  try {
    await run({ api: scriptApiForTesting('', 'learn-script'), sent, id });
  } finally {
    clearDeviceRuntimeDefinitions();
    resetScriptStateForTesting();
    setRuntimeHost(null);
    panelPreviewSessions.set({});
    delete globalThis.window;
  }
}
const commands = (sent) => sent.filter(([n]) => n === 'oscCommand').map(([, p]) => p);
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test('the panel\'s targets are read one per line, and a line that does not read is left out', () => {
  assert.deepEqual(parseOscTargets('tablet = 192.168.1.20:9000\n desk=10.0.0.2:53000 \nnonsense\nx = y:70000'),
    [{ name: 'tablet', host: '192.168.1.20', port: 9000 }, { name: 'desk', host: '10.0.0.2', port: 53000 }]);
});

test('a panel with OSC bindings listens on its port and names its targets', async () => {
  await withPanel(async ({ sent }) => {
    const c = commands(sent);
    assert.deepEqual(c.map((x) => x.op), ['listen', 'target']);
    assert.equal(c[0].port, 9100);
    assert.equal(c[0].network, true);
    assert.equal(c[0].nextFree, true);
    assert.deepEqual([c[1].name, c[1].host, c[1].port], ['tablet', '192.168.1.20', 9000]);
    syncOscBindingsForTesting();
    assert.equal(commands(sent).length, 2, 'not again while nothing changed');
  });
});

test('a message to the address moves the control, scaled, from "osc", and is not sent back', async () => {
  await withPanel(async ({ api, sent }) => {
    const seen = [];
    api.on('*', 'onValueChange', (v) => seen.push([v, api.origin()]));
    oscHeardForTesting('oscMessage', { address: '/fader/1', args: [0.5], types: 'f', from: { host: '192.168.1.30', port: 9001 } });
    await settle();
    assert.equal(api.get('Cutoff.value'), 63.5);
    assert.ok(!commands(sent).some((c) => c.op === 'send'), 'nothing goes back to where it came from');
  });
});

test('moved by anything else, the control sends its value back to the last sender', async () => {
  await withPanel(async ({ sent, id }) => {
    oscHeardForTesting('oscMessage', { address: '/fader/1', args: [0], types: 'f', from: { host: '192.168.1.30', port: 9001 } });
    await settle();
    panelPreviewSessions.update((s) => ({ ...s, [id]: { ...s[id], valueOverrideEnabled: true, valueOverride: 127 } }));
    await runPreviewSessionsForTesting();
    const back = commands(sent).filter((c) => c.op === 'send');
    assert.equal(back.length, 1);
    assert.deepEqual([back[0].to, back[0].address, back[0].args, back[0].types], [{ host: '192.168.1.30', port: 9001 }, '/fader/1', [1], 'f']);
  });
});

test('send back off sends nothing; Send to names where', async () => {
  await withPanel(async ({ sent, id }) => {
    panelPreviewSessions.update((s) => ({ ...s, [id]: { ...s[id], valueOverrideEnabled: true, valueOverride: 64 } }));
    await runPreviewSessionsForTesting();
    assert.equal(commands(sent).filter((c) => c.op === 'send').length, 0);
  }, { sendBack: false });
  await withPanel(async ({ sent, id }) => {
    panelPreviewSessions.update((s) => ({ ...s, [id]: { ...s[id], valueOverrideEnabled: true, valueOverride: 127 } }));
    await runPreviewSessionsForTesting();
    const back = commands(sent).filter((c) => c.op === 'send');
    assert.deepEqual([back[0]?.to, back[0]?.args], ['tablet', [1]]);
  }, { sendTo: 'tablet' });
});

test('Learn takes the next message\'s address', async () => {
  await withPanel(async () => {
    let learned = null;
    assert.equal(oscLearnNext((address) => { learned = address; }), true);
    oscHeardForTesting('oscMessage', { address: '/xy/2', args: [0.1, 0.2], types: 'ff', from: { host: '127.0.0.1', port: 9001 } });
    assert.equal(learned, '/xy/2');
  });
});
