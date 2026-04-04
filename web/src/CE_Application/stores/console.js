import { writable, get } from 'svelte/store';
import { isJuceAvailable } from '../bridge/bridge.js';

/**
 * Global debug console store.
 *
 * Captures:
 *  - JS console.log / .warn / .error / .info / .debug
 *  - C++ messages via bridge event 'debugLog'
 *  - Manual pushes via clog / cwarn / cerror helpers
 */

const MAX_ENTRIES = 2000;

/** Each entry: { id, timestamp, level, source, message } */
export const consoleEntries = writable([]);

let nextId = 1;

function ts() {
  const d = new Date();
  return (
    String(d.getHours()).padStart(2, '0') + ':' +
    String(d.getMinutes()).padStart(2, '0') + ':' +
    String(d.getSeconds()).padStart(2, '0') + '.' +
    String(d.getMilliseconds()).padStart(3, '0')
  );
}

function push(level, source, args) {
  const message = args.map(a =>
    typeof a === 'string' ? a : JSON.stringify(a, null, 2) ?? String(a)
  ).join(' ');

  consoleEntries.update(list => {
    const next = [...list, { id: nextId++, timestamp: ts(), level, source, message }];
    return next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next;
  });
}

/** Programmatic helpers — use these in app code for console-only output */
export function clog(...args)   { push('log',   'app', args); }
export function cwarn(...args)  { push('warn',  'app', args); }
export function cerror(...args) { push('error', 'app', args); }
export function cinfo(...args)  { push('info',  'app', args); }
export function cdebug(...args) { push('debug', 'app', args); }

/** Clear all entries */
export function clearConsole() {
  consoleEntries.set([]);
}

// --- Intercept native console ---

const _origLog   = console.log;
const _origWarn  = console.warn;
const _origError = console.error;
const _origInfo  = console.info;
const _origDebug = console.debug;

console.log   = (...args) => { _origLog(...args);   push('log',   'js', args); };
console.warn  = (...args) => { _origWarn(...args);   push('warn',  'js', args); };
console.error = (...args) => { _origError(...args);  push('error', 'js', args); };
console.info  = (...args) => { _origInfo(...args);   push('info',  'js', args); };
console.debug = (...args) => { _origDebug(...args);  push('debug', 'js', args); };

// --- Listen for C++ debug messages ---

export function initConsoleBridge() {
  if (!isJuceAvailable()) return;
  window.__JUCE__.backend.addEventListener('debugLog', (payload) => {
    const level = payload.level || 'log';
    const message = payload.message || JSON.stringify(payload);
    push(level, 'c++', [message]);
  });
}
