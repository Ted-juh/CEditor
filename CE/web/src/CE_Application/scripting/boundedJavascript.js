import { newQuickJSWASMModuleFromVariant, newVariant } from 'quickjs-emscripten-core';
import RELEASE_SYNC from '@jitl/quickjs-wasmfile-release-sync';
import wasmUrl from '@jitl/quickjs-wasmfile-release-sync/wasm?url';

// Node uses the package's own filesystem loader; Vite emits a local WASM asset.
let engine;
let loading;
export function initialiseJavascriptSandbox() {
  return loading ??= newQuickJSWASMModuleFromVariant(
    typeof window === 'undefined' ? RELEASE_SYNC : newVariant(RELEASE_SYNC, { wasmLocation: wasmUrl }))
    .then(module => { engine = module; });
}

export const SCRIPT_LIMITS = Object.freeze({ milliseconds: 250, memoryBytes: 16 * 1024 * 1024,
  stackBytes: 256 * 1024, contexts: 32, calls: 4096, entries: 20000, text: 1024 * 1024 });
const active = new Set();
let depth = 0;
let deadline = 0;
let calls = 0;

// This function's source runs INSIDE QuickJS. Values cross as bounded data, never
// as host objects/prototypes. Function IDs retain closures, including timer and
// event callbacks, without granting access to the browser's Function constructor.
function guestBootstrap(bridge) {
  const stringify = JSON.stringify;
  const parse = JSON.parse;
  const entries = Object.entries;
  const fromEntries = Object.fromEntries;
  const isArray = Array.isArray;
  const createFunction = Function;
  const guest = new Map();
  const guestIds = new WeakMap();
  let next = 0;
  let count = 0;
  function encode(value, level = 0) {
    if (++count > 20000 || level > 32) throw Error('Script data limit exceeded');
    if (value === undefined) return ['undefined'];
    if (value === null) return ['null'];
    const kind = typeof value;
    if (kind === 'string' && value.length > 1048576) throw Error('Script data limit exceeded');
    if (kind === 'number') return ['number', String(value)];
    if (kind === 'string' || kind === 'boolean') return [kind, value];
    if (kind === 'bigint') return ['bigint', String(value)];
    if (kind === 'function' || value instanceof Promise) {
      let id = guestIds.get(value);
      if (id === undefined) {
        if (guest.size >= 4096) throw Error('Script callback limit exceeded');
        guestIds.set(value, id = ++next); guest.set(id, value);
      }
      return [kind === 'function' ? 'guest' : 'promise', id];
    }
    if (isArray(value) || ArrayBuffer.isView(value)) return ['array', Array.from(value, v => encode(v, level + 1))];
    if (kind === 'object') return ['object', entries(value).map(([k, v]) => [k, encode(v, level + 1)])];
    throw Error('Unsupported script value: ' + kind);
  }
  function pack(value) { count = 0; const text = stringify(encode(value));
    if (text.length > 2097152) throw Error('Script data limit exceeded'); return text; }
  function decode([kind, value]) {
    if (kind === 'undefined') return undefined;
    if (kind === 'null') return null;
    if (kind === 'number') return Number(value);
    if (kind === 'bigint') return BigInt(value);
    if (kind === 'array') return value.map(decode);
    if (kind === 'object') return fromEntries(value.map(([k, v]) => [k, decode(v)]));
    if (kind === 'guest' || kind === 'promise') return guest.get(value);
    if (kind === 'hostPromise') return new Promise((resolve, reject) => decode(['host', value])(resolve, reject));
    if (kind === 'host') return (...args) => {
      const result = parse(bridge(value, pack(args)));
      if (result.error) throw Error(result.error);
      return decode(result.value);
    };
    return value;
  }
  return {
    load(source, apiText, namesText) {
      const api = decode(parse(apiText));
      const names = parse(namesText);
      const probe = names.map(n => `${stringify(n)}: (typeof ${n} !== 'undefined' ? ${n} : undefined)`).join(',');
      return pack(createFunction(...Object.keys(api), source + '\n;return {' + probe + '};')(...Object.values(api)));
    },
    call(id, args) { return pack(guest.get(id)(...decode(parse(args)))); },
    subscribe(id, callbacks) { const [resolve, reject] = decode(parse(callbacks));
      guest.get(id).then(resolve, e => reject(String(e?.message ?? e))); },
  };
}

export function disposeJavascriptSandboxes(owner) {
  for (const sandbox of [...active]) if (owner === undefined || sandbox.owner === owner) sandbox.dispose();
}

export function evaluateBoundedJavascript(source, api, names, options = {}) {
  if (!engine) throw Error('Script interpreter has not finished loading');
  if (active.size >= SCRIPT_LIMITS.contexts) throw Error('Too many script instances; stop preview before loading more');
  if (source.length > SCRIPT_LIMITS.text) throw Error('Script source limit exceeded');
  const runtime = engine.newRuntime();
  runtime.setMemoryLimit(options.memoryBytes ?? SCRIPT_LIMITS.memoryBytes);
  runtime.setMaxStackSize(SCRIPT_LIMITS.stackBytes);
  runtime.setInterruptHandler(() => performance.now() >= deadline);
  const vm = runtime.newContext();
  const handles = [];
  const hostFunctions = new Map();
  const hostIds = new WeakMap();
  const guestFunctions = new Map();
  const pending = new Set();
  let nextHostId = 0;
  let disposed = false;
  let busy = 0;
  let retire = false;
  const sandbox = { owner: options.owner, dispose() {
    retire = true;
    if (busy || disposed) return;
    disposed = true; active.delete(sandbox);
    for (const reject of pending) reject(Error('Script instance stopped'));
    pending.clear();
    for (const handle of handles.reverse()) if (handle.alive) handle.dispose();
    vm.dispose(); runtime.dispose();
  } };
  active.add(sandbox);

  function run(fn) {
    if (disposed || retire) throw Error('Script instance stopped; enable or reload the current code');
    const outer = depth === 0;
    if (outer) { deadline = performance.now() + (options.milliseconds ?? SCRIPT_LIMITS.milliseconds); calls = 0; }
    depth++; busy++;
    try {
      const result = fn();
      if (retire) throw Error('Script instance stopped after its execution limit or approval changed');
      if (outer) {
        let jobs = 0;
        while (runtime.hasPendingJob()) {
          if (++jobs > 1000 || performance.now() >= deadline) throw Error('Script execution limit exceeded');
          const step = runtime.executePendingJobs(1);
          if (step.error) { const message = vm.dump(step.error); step.error.dispose(); throw Error(String(message?.message ?? message)); }
        }
      }
      if (performance.now() >= deadline) throw Error('Script execution limit exceeded');
      return result;
    } catch (error) {
      if (/interrupted|out of memory|stack overflow|limit exceeded/i.test(error?.message ?? '')) {
        retire = true;
        throw Error(`Script stopped: execution or memory limit exceeded (${error.message})`);
      }
      throw error;
    } finally {
      busy--; depth--;
      if (retire) sandbox.dispose();
    }
  }

  function encode(value, level = 0, budget = { count: 0 }) {
    if (++budget.count > SCRIPT_LIMITS.entries || level > 32) throw Error('Script data limit exceeded');
    if (value === undefined) return ['undefined'];
    if (value === null) return ['null'];
    const kind = typeof value;
    if (kind === 'string' && value.length > SCRIPT_LIMITS.text) throw Error('Script data limit exceeded');
    if (kind === 'number') return ['number', String(value)];
    if (kind === 'string' || kind === 'boolean') return [kind, value];
    if (kind === 'bigint') return ['bigint', String(value)];
    if (value instanceof Promise) {
      const subscribe = (resolve, reject) => {
        value.then(resolve, error => reject(String(error?.message ?? error)))
          .catch(error => options.onError?.(error));
      };
      return ['hostPromise', encode(subscribe, level + 1, budget)[1]];
    }
    if (kind === 'function') {
      if (hostIds.has(value)) return ['host', hostIds.get(value)];
      if (hostFunctions.size >= 8192) throw Error('Script callback limit exceeded');
      const id = ++nextHostId; hostIds.set(value, id); hostFunctions.set(id, value);
      return ['host', id];
    }
    if (Array.isArray(value) || ArrayBuffer.isView(value)) return ['array', Array.from(value, v => encode(v, level + 1, budget))];
    if (kind === 'object' && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null))
      return ['object', Object.entries(value).map(([k, v]) => [k, encode(v, level + 1, budget)])];
    throw Error('Unsupported value at the script boundary');
  }
  function pack(value) {
    const text = JSON.stringify(encode(value));
    if (text.length > SCRIPT_LIMITS.text * 2) throw Error('Script data limit exceeded');
    return text;
  }
  function decode([kind, value]) {
    if (kind === 'undefined') return undefined;
    if (kind === 'null') return null;
    if (kind === 'number') return Number(value);
    if (kind === 'bigint') return BigInt(value);
    if (kind === 'array') return value.map(decode);
    if (kind === 'object') return Object.fromEntries(value.map(([k, v]) => [k, decode(v)]));
    if (kind === 'guest') {
      if (!guestFunctions.has(value)) guestFunctions.set(value, (...args) => invoke('call', value, pack(args)));
      return guestFunctions.get(value);
    }
    if (kind === 'promise') return new Promise((resolve, reject) => {
      pending.add(reject);
      invoke('subscribe', value, pack([
        result => { pending.delete(reject); resolve(result); },
        error => { pending.delete(reject); reject(Error(error)); },
      ]));
    });
    return value;
  }
  const bridge = vm.newFunction('panelApi', (id, json) => {
    try {
      if (++calls > SCRIPT_LIMITS.calls || performance.now() >= deadline) throw Error('Script execution limit exceeded');
      const text = vm.getString(json);
      if (text.length > SCRIPT_LIMITS.text * 2) throw Error('Script data limit exceeded');
      const fn = hostFunctions.get(vm.getNumber(id));
      if (!fn) throw Error('Unknown script capability');
      const value = fn(...decode(JSON.parse(text)));
      return vm.newString(JSON.stringify({ value: encode(value) }));
    } catch (error) {
      if (/limit exceeded/.test(error.message)) retire = true;
      return vm.newString(JSON.stringify({ error: String(error?.message ?? error) }));
    }
  });
  handles.push(bridge);
  let bootstrap;
  function invoke(name, ...args) {
    return run(() => {
      const argumentsList = args.map(arg => typeof arg === 'number' ? vm.newNumber(arg) : vm.newString(arg));
      let result;
      try {
        result = vm.unwrapResult(vm.callMethod(bootstrap, name, argumentsList));
        return vm.typeof(result) === 'string' ? decode(JSON.parse(vm.getString(result))) : undefined;
      } finally { result?.dispose(); argumentsList.forEach(h => h.dispose()); }
    });
  }
  try {
    run(() => {
      const factory = vm.unwrapResult(vm.evalCode(`(${guestBootstrap.toString()})`));
      try { bootstrap = vm.unwrapResult(vm.callFunction(factory, vm.undefined, bridge)); handles.push(bootstrap); }
      finally { factory.dispose(); }
    });
    return invoke('load', source, pack(api), JSON.stringify(names)) ?? {};
  } catch (error) { sandbox.dispose(); throw error; }
}
