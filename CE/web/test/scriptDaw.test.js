// ce.daw and origin() in the panel view: in the editor, with no DAW, and in an exported plug-in's
// window, where the page reads the DAW from what the processor pushes (PlayerHost::pushDawInfo) and
// sends what a script changes back. The commands' own checks, the same in every runtime, are
// dawParity.test.js's; the window-shut half is PluginProcessor.h's.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createControl } from '../src/CE_Application/models/componentTypes.js';
import {
  resetScriptStateForTesting, runPreviewSessionsForTesting, scriptApiForTesting, setLiveEnabled, setRuntimeHost,
  setDawInfo, setDawCommandSink, setDawParamSink, noteHostValue, raiseAutomationIn, raiseDawProgramIn, dawSpareMoved,
} from '../src/CE_Application/scripting/panelRuntime.js';
import { createInteractionPreviewSession, panelPreviewSessions } from '../src/CE_Application/stores/interactionPreview.js';
import { collectExportParameters } from '../src/CE_Application/utils/exportParameters.js';
import { createPlayerHost } from '../src/CE_Application/scripting/playerScriptHost.js';

async function withPanel(run, { spares = 2 } = {}) {
  const cutoff = createControl('Slider', { name: 'Cutoff' });
  Object.assign(cutoff._children.Behavior, { min: 20, max: 20000 });
  cutoff._children.Core.dawGroup = 'Filter';
  const rate = createControl('Slider', { name: 'LfoRate' });
  Object.assign(rate._children.Behavior, { min: 0, max: 10 });
  rate._children.Core.hostAutomation = false;
  const controls = [cutoff, rate];
  const sessions = Object.fromEntries(controls.map((c) => [String(c._children.Core.id), createInteractionPreviewSession(c)]));
  panelPreviewSessions.set(sessions);
  const panel = { id: 'daw', controls, exportSettings: { spareDawParameters: spares }, scripting: { modules: ['ce.core', 'ce.daw'] } };
  setRuntimeHost(createPlayerHost(panel));
  setLiveEnabled(true);
  const sent = [];
  try {
    await run({ api: scriptApiForTesting('', 'daw-script'), panel, cutoff, sent });
  } finally {
    setDawInfo(null);
    setDawCommandSink(null);
    setDawParamSink(null);
    resetScriptStateForTesting();
    setRuntimeHost(null);
    panelPreviewSessions.set({});
  }
}

/** What the processor would push for this panel: its parameters, two spares, a bank. */
function pushed(panel) {
  const parameters = collectExportParameters(panel).map((p) => ({
    id: p.id, name: p.label, path: p.path, control: p.controlName, min: p.min, max: p.max,
    default: p.defaultValue, unit: p.unit, kind: p.valueKind, ...(p.group ? { group: p.group } : {}), value: p.defaultValue,
  }));
  parameters.push({ id: 'spare1', name: 'Spare 1', slot: 1, min: 0, max: 1, default: 0, unit: '', kind: 'float', value: 0 });
  parameters.push({ id: 'spare2', name: 'Spare 2', slot: 2, min: 0, max: 1, default: 0, unit: '', kind: 'float', value: 0 });
  return {
    host: { name: 'Bitwig Studio', format: 'vst3', sampleRate: 48000, blockSize: 256, editorOpen: true },
    parameters,
    program: { index: 0, number: 1, name: 'Init', count: 2 },
    programs: [{ index: 0, number: 1, name: 'Init' }, { index: 1, number: 2, name: 'Bass' }],
    spares: 2,
  };
}

test('in the editor there is no DAW: parameters are what the next export would bake', async () => {
  await withPanel(async ({ api }) => {
    assert.equal(api.ce.daw.host(), undefined);
    assert.equal(api.ce.daw.program(), undefined);
    assert.deepEqual(api.ce.daw.programs(), []);
    const list = api.ce.daw.parameters();
    assert.deepEqual(list.map((p) => p.id), ['Cutoff.value', 'spare1', 'spare2'], 'LfoRate is kept out; the spares are at the end');
    assert.equal(list[0].group, 'Filter', 'the DAW group is baked from the inspector');
    assert.equal(api.ce.daw.parameter('Cutoff.value').max, 20000);
    assert.equal(api.ce.daw.beginGesture('Cutoff.value'), false);
    assert.equal(api.ce.daw.rename('Cutoff.value', 'x'), false);
    assert.equal(api.ce.daw.assign(1, 'LfoRate.value'), false);
    assert.equal(api.ce.daw.markChanged(), false);
    assert.equal(api.origin(), undefined, 'outside a handler: nothing');
  });
});

test('in the plug-in\'s window, ce.daw answers from what the processor pushed, and sends its changes', async () => {
  await withPanel(async ({ api, panel, sent }) => {
    setDawInfo(pushed(panel));
    setDawCommandSink((command) => sent.push(command));
    assert.equal(api.ce.daw.host().name, 'Bitwig Studio');
    assert.equal(api.ce.daw.programs()[1].name, 'Bass');
    assert.equal(api.ce.daw.beginGesture('Cutoff.value'), true);
    assert.equal(api.ce.daw.beginGesture('Cutoff.value'), false, 'one gesture at a time');
    assert.equal(api.ce.daw.endGesture('Cutoff.value'), true);
    assert.equal(api.ce.daw.endGesture('Cutoff.value'), false);
    assert.equal(api.ce.daw.beginGesture('LfoRate.value'), false, 'not a DAW parameter');
    assert.equal(api.ce.daw.rename('Cutoff', 'Brightness'), true);
    assert.equal(api.ce.daw.assign(1, 'LfoRate.value', { name: 'LFO rate' }), true);
    assert.equal(api.ce.daw.assign(3, 'LfoRate.value'), false, 'the panel has two spares');
    assert.equal(api.ce.daw.assign(2), true, 'nothing empties the slot');
    assert.equal(api.ce.daw.markChanged(), true);
    assert.deepEqual(sent, [
      { op: 'beginGesture', path: 'Cutoff.value' },
      { op: 'endGesture', path: 'Cutoff.value' },
      { op: 'rename', path: 'Cutoff.value', name: 'Brightness' },
      { op: 'assign', slot: 1, path: 'LfoRate.value', name: 'LFO rate', display: { min: 0, max: 10, unit: '' } },
      { op: 'assign', slot: 2, path: '', name: '' },
      { op: 'markChanged' },
    ]);
  });
});

test('the DAW\'s move raises the value events with origin "host", then automationIn', async () => {
  await withPanel(async ({ api, panel, cutoff }) => {
    setDawInfo(pushed(panel));
    const seen = [];
    api.on('*', 'onValueChange', (v) => seen.push(['change', v, api.origin()]));
    api.on('*', 'onAutomationIn', (move) => seen.push(['automation', move.path, move.value, api.origin()]));
    const id = String(cutoff._children.Core.id);
    noteHostValue(id, 'host');
    panelPreviewSessions.update((s) => ({ ...s, [id]: { ...s[id], valueOverrideEnabled: true, valueOverride: 440 } }));
    await runPreviewSessionsForTesting();
    await raiseAutomationIn('Cutoff.value', 440);
    assert.deepEqual(seen, [['change', 440, 'host'], ['automation', 'Cutoff.value', 440, 'host']]);
    // A hand's move afterwards is a hand's.
    seen.length = 0;
    panelPreviewSessions.update((s) => ({ ...s, [id]: { ...s[id], valueOverride: 500 } }));
    await runPreviewSessionsForTesting();
    assert.deepEqual(seen, [['change', 500, 'user']]);
  });
});

test('a spare the DAW moves moves its control; the control moved by hand moves the spare', async () => {
  await withPanel(async ({ api, panel }) => {
    const info = pushed(panel);
    Object.assign(info.parameters.find((p) => p.id === 'spare1'),
      { path: 'LfoRate.value', control: 'LfoRate', min: 0, max: 10, name: 'LFO rate' });
    setDawInfo(info);
    const moves = [];
    api.on('*', 'onAutomationIn', (move) => moves.push([move.id, move.control, move.value]));
    dawSpareMoved(1, 0.25);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(api.get('LfoRate.value'), 2.5);
    assert.deepEqual(moves, [['spare1', 'LfoRate', 2.5]]);
    const spareMoves = [];
    setDawParamSink((id, value) => spareMoves.push([id, value]));
    const rate = panel.controls[1];
    const id = String(rate._children.Core.id);
    panelPreviewSessions.update((s) => ({ ...s, [id]: { ...s[id], valueOverrideEnabled: true, valueOverride: 5 } }));
    await runPreviewSessionsForTesting();
    assert.deepEqual(spareMoves, [['spare1', 0.5]]);
  });
});

test('the DAW choosing a program raises dawProgramIn, and program() follows', async () => {
  await withPanel(async ({ api, panel }) => {
    setDawInfo(pushed(panel));
    const seen = [];
    api.on('*', 'onDawProgramIn', (program) => seen.push(program));
    await raiseDawProgramIn({ index: 1, number: 2, name: 'Bass' });
    assert.deepEqual(seen, [{ index: 1, number: 2, name: 'Bass' }]);
    assert.equal(api.ce.daw.program().name, 'Bass');
  });
});
