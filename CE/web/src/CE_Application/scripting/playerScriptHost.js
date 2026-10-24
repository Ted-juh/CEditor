// Runtime host for the EXPORTED PLAYER (the VST3/standalone plugin).
//
// The panel script runtime (panelRuntime.js) normally resolves the active panel, its scripts, and
// control values from the editor's Svelte stores (panels / controls / scriptDocuments). The player
// has none of those: it holds the panel in a local variable and renders live values from the
// `panelPreviewSessions` overlay. This module adapts that world to the runtime's host interface so
// the SAME runtime drives scripts in the shipped plugin exactly as it does in the editor preview.
//
// Host interface (consumed by panelRuntime.setRuntimeHost):
//   { panel, scripts, readValue(control, modelPath), writeValue(control, modelPath, value), storage? }

import { get } from 'svelte/store';
import { panelPreviewSessions, updatePanelPreviewSession } from '../stores/interactionPreview.js';
import { valueAtPath } from '../stores/controlTreeUtils.js';
import { collectPanelExportScripts } from './scriptPanelExport.js';
import { isSourceScript } from './scriptModel.js';
import {
  customChannelOfPath, customChannelPatch, hasLiveValue, isLiveValuePath, liveValuePatch,
  readLiveValue, readsLiveValue, whyChannelNotWritable,
} from './liveValue.js';

function controlId(control) {
  return String(control?._children?.Core?.id ?? '');
}

// A control's LIVE value (the main value or a custom component's value channel) is mirrored through
// the preview-session overlay, so the plugin UI moves and host-parameter sync fires. Everything else
// is a plain model property. The predicate itself lives in ./liveValue.js because the editor asks
// the same question and the two answers used to differ — see that module's header.

// Best-effort write of a non-value model path into the panel control object, so property mutations
// (colour, visible, …) reflect. Mirrors valueAtPath's _children/plain walk.
//
// The control object itself is changed — the player's update model is a raw tree it is told was
// written (onDocumentWrite) — but nothing below it is: every object on the way to the property is
// replaced by a copy, and the copy written. Below a control, an untouched section is the default
// itself, shared by every control of that type and frozen (stores/documentShape.js); writing into
// it would recolour all of them, and throws instead.
function setValueAtPath(control, modelPath, value) {
  const segs = String(modelPath).split('.').filter(Boolean);
  if (!segs.length || !control || typeof control !== 'object') return false;
  const copy = (v) => (Array.isArray(v) ? [...v] : { ...v });

  // The objects the path walks, each with the holder and key it hangs from.
  const steps = [];
  let node = control;
  for (let i = 0; i < segs.length - 1; i++) {
    const seg = segs[i];
    if (node?._children && seg in node._children) steps.push([node, '_children'], [node._children, seg]);
    else if (node && typeof node === 'object' && seg in node) steps.push([node, seg]);
    else return false;
    node = steps[steps.length - 1][0][steps[steps.length - 1][1]];
  }
  const last = segs[segs.length - 1];
  if (node?._children && last in node._children) steps.push([node, '_children']);
  else if (!node || typeof node !== 'object') return false;

  // Copy from the control down, re-hanging each copy on the copy above it.
  let holder = control;
  for (const [, key] of steps) {
    const next = copy(holder[key]);
    holder[key] = next;
    holder = next;
  }
  holder[last] = value;
  return true;
}

/** A value as the instance will store it: JSON, so a script mutating an object after saving it does
 *  not change what the page reads without changing what the instance keeps. */
const asStored = (value) => (value === undefined ? null : JSON.parse(JSON.stringify(value)));

/**
 * The plug-in instance's ce.storage stores, as the page sees them with the window open. The
 * instance keeps both scopes, "panel" and "local", and saves them with the project; it hands the
 * page a copy of each with the panel (`initial`, `{ panel, local }`) and takes every write back
 * through `send({ store, key, value })` or `send({ store, key, forget: true })`. So the page and the
 * window-closed runtime keep one store between them, and each instance its own.
 *
 * Without it the page kept panel scope in its copy of the document, which nothing saved, and local
 * scope in the WebView's localStorage, which every instance on the machine shared — and which is a
 * new, empty folder each time on Windows, where every instance gets a WebView2 profile of its own.
 */
export function createInstanceStorage(initial, send) {
  const maps = {
    panel: { ...(initial?.panel ?? {}) },
    local: { ...(initial?.local ?? {}) },
  };
  const scope = (store) => (store === 'local' ? 'local' : 'panel');
  return {
    /** The live map for a store: read it, never write to it — write() and forget() say so to the instance. */
    read: (store) => maps[scope(store)],
    write(store, key, value) {
      const s = scope(store);
      const stored = asStored(value);
      maps[s][key] = stored;
      send?.({ store: s, key, value: stored });
      return true;
    },
    forget(store, key) {
      const s = scope(store);
      if (!Object.hasOwn(maps[s], key)) return false;
      delete maps[s][key];
      send?.({ store: s, key, forget: true });
      return true;
    },
  };
}

/**
 * Build the runtime host for a loaded player panel.
 * @param {object|function(): object} panel the deserialized panel document the player is running,
 *   or a getter for it when the player replaces the document object reactively
 * @param {{ onDocumentWrite?: function(object, string, unknown): void,
 *           storage?: ReturnType<typeof createInstanceStorage> | null }} options
 */
export function createPlayerHost(panel, { onDocumentWrite = null, storage = null } = {}) {
  const currentPanel = () => (typeof panel === 'function' ? panel() : panel);
  return {
    get panel() { return currentPanel(); },
    // The plug-in instance's ce.storage stores, when the page runs in one (createInstanceStorage).
    storage,
    // Panel-level + per-control scripts (honoring panel.scripting.runOnExport / enabled flags),
    // filtered to the source (Lua/JS) scripts this runtime can execute — legacy command-graph
    // scripts are skipped (they ran in the retired engine).
    get scripts() { return collectPanelExportScripts(currentPanel()).filter(isSourceScript); },

    readValue(control, modelPath) {
      if (readsLiveValue(control, modelPath)) {
        const live = readLiveValue(get(panelPreviewSessions), control, modelPath);
        if (live !== undefined) return live;
      }
      return valueAtPath(control, modelPath);
    },

    /** @returns {boolean} whether the write landed — the runtime reports a set() that went
        nowhere, and only the host knows that a live value needs no Value section to move. */
    writeValue(control, modelPath, value) {
      const id = controlId(control);
      if (!id) return false;
      // A named channel is written where it is read — the session — leaving its siblings alone.
      // Writing the document instead would be invisible to every subsequent get(), because the
      // player seeds a session for every control before this host is installed.
      const channelName = customChannelOfPath(control, modelPath);
      if (channelName) {
        if (whyChannelNotWritable(control, channelName)) return false;
        updatePanelPreviewSession(id, customChannelPatch(control, channelName, value, get(panelPreviewSessions)));
        return true;
      }
      if (isLiveValuePath(modelPath) && hasLiveValue(control)) {
        // Same path the player uses for incoming MIDI: move the on-screen control AND let the
        // host-parameter sync pick it up (panelPreviewSessions subscriber in Player.svelte).
        updatePanelPreviewSession(id, liveValuePatch(value, control, get(panelPreviewSessions)));
        return true;
      }
      const wrote = setValueAtPath(control, modelPath, value) !== false;
      if (wrote && typeof onDocumentWrite === 'function') {
        onDocumentWrite(control, modelPath, value);
      }
      return wrote;
    },
  };
}
