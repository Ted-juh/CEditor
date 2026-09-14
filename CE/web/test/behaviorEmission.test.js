import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { createControl } from '../src/CE_Application/models/componentTypes.js';
import {
  dispatchInteraction,
  resetScriptStateForTesting,
  runPreviewSessionsForTesting,
  scriptApiForTesting,
  setLiveEnabled,
  setRuntimeHost,
} from '../src/CE_Application/scripting/panelRuntime.js';
import {
  createInteractionPreviewSession,
  panelPreviewSessions,
} from '../src/CE_Application/stores/interactionPreview.js';

async function withControl(type, behaviorPatch, run) {
  const control = createControl(type, { name: 'Subject' });
  Object.assign(control._children.Behavior, behaviorPatch);
  const id = String(control._children.Core.id);
  panelPreviewSessions.set({ [id]: createInteractionPreviewSession(control) });
  setRuntimeHost({ panel: { id: 'behavior-events', controls: [control], scripting: { modules: ['ce.core'] } }, scripts: [] });
  setLiveEnabled(true);
  try {
    await run({ control, id, api: scriptApiForTesting('', `behavior-${id}`) });
  } finally {
    resetScriptStateForTesting();
    setRuntimeHost(null);
    panelPreviewSessions.set({});
  }
}

test('emitClick and emitStateChange independently gate only their script events', async () => {
  await withControl('ToggleButton', { emitClick: false, emitStateChange: true }, async ({ id, api }) => {
    const seen = [];
    api.on('*', 'onClick', () => seen.push('click'));
    api.on('*', 'onStateChanged', (state) => seen.push(state));

    await dispatchInteraction(id, 'onClick', { x: 4, y: 5 });
    panelPreviewSessions.update((sessions) => ({
      ...sessions,
      [id]: { ...sessions[id], hover: true },
    }));
    await runPreviewSessionsForTesting();

    assert.deepEqual(seen, ['hover']);
  });

  await withControl('ToggleButton', { emitClick: true, emitStateChange: false }, async ({ id, api }) => {
    const seen = [];
    api.on('*', 'onClick', () => seen.push('click'));
    api.on('*', 'onStateChanged', (state) => seen.push(state));

    await dispatchInteraction(id, 'onClick', { x: 4, y: 5 });
    panelPreviewSessions.update((sessions) => ({
      ...sessions,
      [id]: { ...sessions[id], hover: true },
    }));
    await runPreviewSessionsForTesting();

    assert.deepEqual(seen, ['click']);
  });
});

test('slider change and commit emissions are distinct and independently suppressible', async () => {
  const exercise = async (flags) => {
    const seen = [];
    await withControl('Slider', flags, async ({ id, api }) => {
      api.on('*', 'onValueChange', (value) => seen.push(['change', value]));
      api.on('*', 'onValueChanged', (value) => seen.push(['commit', value]));

      panelPreviewSessions.update((sessions) => ({
        ...sessions,
        [id]: { ...sessions[id], valueOverrideEnabled: true, valueOverride: 0.72, dragging: true },
      }));
      await runPreviewSessionsForTesting();
      panelPreviewSessions.update((sessions) => ({
        ...sessions,
        [id]: { ...sessions[id], dragging: false },
      }));
      await runPreviewSessionsForTesting();
    });
    return seen;
  };

  assert.deepEqual(await exercise({ emitValueChange: true, emitValueCommit: true }), [
    ['change', 0.72],
    ['commit', 0.72],
  ]);
  assert.deepEqual(await exercise({ emitValueChange: false, emitValueCommit: true }), [
    ['commit', 0.72],
  ]);
  assert.deepEqual(await exercise({ emitValueChange: true, emitValueCommit: false }), [
    ['change', 0.72],
  ]);
});

test('emitActiveHandleChange supplies previous and current handle metadata', async () => {
  await withControl('Slider', {
    valueMode: 'range',
    activeHandlePolicy: 'startFirst',
    emitActiveHandleChange: true,
  }, async ({ id, api }) => {
    const seen = [];
    api.on('*', 'onActiveHandleChanged', (info) => seen.push(info));

    panelPreviewSessions.update((sessions) => ({
      ...sessions,
      [id]: { ...sessions[id], activeHandle: 'end', valueInputRole: 'end' },
    }));
    await runPreviewSessionsForTesting();

    assert.deepEqual(seen, [{ activeHandle: 'end', previousActiveHandle: 'start' }]);
  });

  await withControl('Slider', {
    valueMode: 'range',
    activeHandlePolicy: 'startFirst',
    emitActiveHandleChange: false,
  }, async ({ id, api }) => {
    const seen = [];
    api.on('*', 'onActiveHandleChanged', (info) => seen.push(info));
    panelPreviewSessions.update((sessions) => ({
      ...sessions,
      [id]: { ...sessions[id], activeHandle: 'end', valueInputRole: 'end' },
    }));
    await runPreviewSessionsForTesting();
    assert.deepEqual(seen, []);
  });
});

test('mixed bool state is a script-visible value without inventing a boolean', async () => {
  await withControl('ToggleButton', { allowMixed: true, emitValueChange: true }, async ({ id, api }) => {
    const seen = [];
    api.on('*', 'onValueChanged', (value) => seen.push(value));
    panelPreviewSessions.update((sessions) => ({
      ...sessions,
      [id]: { ...sessions[id], checked: false, mixed: true },
    }));
    await runPreviewSessionsForTesting();
    assert.deepEqual(seen, ['mixed']);
  });
});
