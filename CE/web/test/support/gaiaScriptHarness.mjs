// gaiaScriptHarness.mjs — run a GENERATED panel script against the REAL script runtime.
//
// WHY THIS EXISTS. Both GAIA generator scripts were tested by handing them fake `get`/`set`/`watch`
// functions and checking what they asked for. Both passed. Both were dead: one watched a path the
// runtime never writes, the other read a section its control does not have. A stub cannot catch
// either, because a stub answers whatever the test wants — the test was checking the script against
// the test's idea of the runtime, not against the runtime.
//
// So these helpers wire a generated script to the actual panelRuntime, with a real panel in the
// store and real preview sessions, and let a test move a control the way a user would.

import { get } from 'svelte/store';

import { panels, addPanel, setActivePanel } from '../../src/CE_Application/stores/panels.js';
import { panelPreviewSessions, updatePanelPreviewSession } from '../../src/CE_Application/stores/interactionPreview.js';
import * as rt from '../../src/CE_Application/scripting/panelRuntime.js';
import { syncCustomArpeggiatorValues } from '../../src/CE_Application/utils/customComponentArpeggiator.js';
import { seedCustomValues } from '../../src/CE_Application/utils/customComponentInteraction.js';

/** Put a built panel into the store as the active one, with a clean runtime. */
export function mountPanel(built, id = 'gaia') {
  panels.set([]);
  panelPreviewSessions.set({});
  rt.resetScriptStateForTesting();
  rt.setRuntimeHost(null);              // the editor path: no host, so sessions are consulted
  addPanel({ ...built, id });
  setActivePanel(id);
  return {
    /** The panel as it stands in the store — where a script's set() actually lands. */
    controls: () => get(panels).find((p) => p.id === id).controls,
  };
}

/**
 * Load a generated script and return what it did.
 *
 * `after` is captured rather than timed: a test should decide when the debounce fires, not wait for
 * it. `ce.device.write` is recorded, because for the arp bridge those writes ARE the feature.
 */
export function loadScript(source, { scriptId = 'harness' } = {}) {
  const api = rt.scriptApiForTesting('', scriptId);
  const writes = [];
  const logs = [];
  const timers = [];
  const scope = {
    get: api.get,
    set: api.set,
    watch: api.watch,
    log: (message) => logs.push(String(message)),
    after: (ms, fn) => { timers.push(fn); return timers.length; },
    ce: { device: { write: (parameterId, value) => writes.push([parameterId, value]) } },
  };
  const factory = new Function(...Object.keys(scope), `${source}\nreturn { onPanelLoad };`);
  const module = factory(...Object.values(scope));
  return {
    writes,
    logs,
    onPanelLoad: () => module.onPanelLoad(),
    /** Settle the runtime, then fire whatever the script deferred — one gesture's worth. */
    settle() {
      rt.runReactiveForTesting();
      while (timers.length) timers.shift()();
    },
  };
}

/** Move a custom component's channel, exactly as an interaction would. */
export function moveChannel(controlId, values) {
  updatePanelPreviewSession(controlId, { customValues: values });
}

/**
 * Draw an arpeggio pattern, by building the patch the way a pointer edit builds it.
 *
 * PRECISELY WHAT THIS DOES AND DOES NOT PROVE, because the first version of this comment overclaimed
 * and that is the exact mistake these tests exist to catch. It calls syncCustomArpeggiatorValues —
 * the function resolveCustomInteractionPatch calls to turn an arpeggiator edit into a session patch
 * (customComponentInteraction.js) — over the same seed values. So it proves the SHAPE of a real
 * edit's patch, not the pointer arithmetic that decides which block was drawn.
 *
 * What connects the two is pinned separately, in the test named "a real pointer edit publishes the
 * channel the bridge watches", which goes through resolveCustomInteractionPatch itself. Without that
 * link this helper would be manufacturing the very channel it then asserts the script reads.
 */
export function drawPattern(control, blocks, { stepCount = 32 } = {}) {
  const values = syncCustomArpeggiatorValues(control, {
    ...seedCustomValues(control),
    __arpeggiator: {
      enabled: true,
      stepCount,
      noteMin: 48,
      noteMax: 72,
      viewNote: 60,
      selectedBlock: null,
      blocks,
    },
  });
  updatePanelPreviewSession(control._children.Core.id, { customValues: values });
  return values;
}

export const controlNamed = (built, name) =>
  built.controls.find((c) => c._children?.Core?.name === name);

export const idOf = (control) => String(control?._children?.Core?.id ?? '');
