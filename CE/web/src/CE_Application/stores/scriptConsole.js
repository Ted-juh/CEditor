import { writable } from 'svelte/store';
import { isJuceAvailable } from '../bridge/bridge.js';

/**
 * Script trace/console store — the editor-side surface for the API-level debugger (#8) and
 * runtime error visibility (#9). The C++ ScriptRuntime emits 'scriptLog' / 'scriptError' /
 * 'scriptTrace' / 'scriptMidi' bridge events while scripts run (Model 2); they land here.
 *
 * Each entry: { id, time, kind: 'log'|'warn'|'error'|'trace'|'midi', scriptId, message }
 */

const MAX = 1000;
export const scriptTrace = writable([]);
let nextId = 1;

function ts() {
  const d = new Date();
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':');
}

export function addScriptTrace(kind, scriptId, message) {
  scriptTrace.update((list) => {
    const next = [...list, { id: nextId++, time: ts(), kind, scriptId: scriptId || '', message: String(message) }];
    return next.length > MAX ? next.slice(next.length - MAX) : next;
  });
}

export function clearScriptTrace() { scriptTrace.set([]); }

export function initScriptConsoleBridge() {
  if (!isJuceAvailable()) return;
  const b = window.__JUCE__.backend;
  const on = (event, kind) => b.addEventListener(event, (p) => addScriptTrace(kind, p?.scriptId, p?.message ?? JSON.stringify(p)));
  on('scriptLog', 'log');
  on('scriptError', 'error');
  on('scriptTrace', 'trace');
  on('scriptMidi', 'midi');
}
