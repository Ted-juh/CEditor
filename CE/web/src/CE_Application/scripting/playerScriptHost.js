// Runtime host for the EXPORTED PLAYER (the VST3/standalone plugin).
//
// The panel script runtime (panelRuntime.js) normally resolves the active panel, its scripts, and
// control values from the editor's Svelte stores (panels / controls / scriptDocuments). The player
// has none of those: it holds the panel in a local variable and renders live values from the
// `panelPreviewSessions` overlay. This module adapts that world to the runtime's host interface so
// the SAME runtime drives scripts in the shipped plugin exactly as it does in the editor preview.
//
// Host interface (consumed by panelRuntime.setRuntimeHost):
//   { panel, scripts, readValue(control, modelPath), writeValue(control, modelPath, value) }

import { get } from 'svelte/store';
import { panelPreviewSessions, updatePanelPreviewSession } from '../stores/interactionPreview.js';
import { valueAtPath } from '../stores/controlTreeUtils.js';
import { collectPanelExportScripts } from './scriptPanelExport.js';
import { isSourceScript } from './scriptModel.js';
import { isLiveValuePath, hasLiveValue, liveValuePatch, readLiveValue } from './liveValue.js';

function controlId(control) {
  return String(control?._children?.Core?.id ?? '');
}

// A control's LIVE value (the main value or a custom component's value channel) is mirrored through
// the preview-session overlay, so the plugin UI moves and host-parameter sync fires. Everything else
// is a plain model property. The predicate itself lives in ./liveValue.js because the editor asks
// the same question and the two answers used to differ — see that module's header.

// Best-effort write of a non-value model path straight into the (reactive) panel control object,
// so property mutations (colour, visible, …) reflect. Mirrors valueAtPath's _children/plain walk.
function setValueAtPath(control, modelPath, value) {
  const segs = String(modelPath).split('.').filter(Boolean);
  if (!segs.length) return false;
  let node = control;
  for (let i = 0; i < segs.length - 1; i++) {
    const seg = segs[i];
    if (node?._children && seg in node._children) node = node._children[seg];
    else if (node && typeof node === 'object' && seg in node) node = node[seg];
    else return false;
  }
  const last = segs[segs.length - 1];
  if (node?._children && last in node._children) { node._children[last] = value; return true; }
  if (node && typeof node === 'object') { node[last] = value; return true; }
  return false;
}

/**
 * Build the runtime host for a loaded player panel.
 * @param {object} panel the deserialized panel document the player is running
 */
export function createPlayerHost(panel) {
  return {
    panel,
    // Panel-level + per-control scripts (honoring panel.scripting.runOnExport / enabled flags),
    // filtered to the source (Lua/JS) scripts this runtime can execute — legacy command-graph
    // scripts are skipped (they ran in the retired engine).
    scripts: collectPanelExportScripts(panel).filter(isSourceScript),

    readValue(control, modelPath) {
      if (isLiveValuePath(modelPath) && hasLiveValue(control)) {
        const live = readLiveValue(get(panelPreviewSessions), control);
        if (live !== undefined) return live;
      }
      return valueAtPath(control, modelPath);
    },

    /** @returns {boolean} whether the write landed — the runtime reports a set() that went
        nowhere, and only the host knows that a live value needs no Value section to move. */
    writeValue(control, modelPath, value) {
      const id = controlId(control);
      if (!id) return false;
      if (isLiveValuePath(modelPath) && hasLiveValue(control)) {
        // Same path the player uses for incoming MIDI: move the on-screen control AND let the
        // host-parameter sync pick it up (panelPreviewSessions subscriber in Player.svelte).
        updatePanelPreviewSession(id, liveValuePatch(value));
        return true;
      }
      return setValueAtPath(control, modelPath, value) !== false;
    },
  };
}
