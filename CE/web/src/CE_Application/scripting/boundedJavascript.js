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

// `panelMemoryBytes` is what all of a panel's scripts may grow the one WebAssembly heap the
// interpreter runs in to, and that heap is what the page pays for. It replaces a cap of 32 sandboxes,
// which was the same 512 MB reached by counting scripts — 32 at 16 MB each — and refused the 33rd
// script of any panel. The GAIA panel has 232, at about 51 KB apiece; counting stopped 200 of them
// while the memory was nowhere near the limit.
//
// `memoryBytes` is what one call may allocate (the frames below say how), and in practice it refuses
// any single allocation larger than that. It was meant as each script's own ceiling and never was
// one: QuickJS checks an allocation's size against its limit, but under emscripten it adds 8 bytes
// per allocation to what it says it holds (js_def_malloc_usable_size is 0 there), so a script with a
// runtime of its own and a 16 MB limit could keep 100 MB in 1 MB pieces. What bounds what scripts
// keep is the panel budget.
//
// `milliseconds` is how long one call into a script may run (a load, a click, a timer's tick), and
// it is the plug-in's: JsScriptEngine.cpp gives each call 2 seconds, and a panel that works with the
// plug-in's window closed has to work with it open. It was 250 ms, and GAIA's preset-name script
// repaints every preset button in one call: 160 to 220 ms on a fast machine before the player found
// controls from an index, so a slower one stopped it, and every recall button with it. Two seconds
// still stops a runaway loop; scriptLimitParity.test.js holds the two numbers together.
export const SCRIPT_LIMITS = Object.freeze({ milliseconds: 2000, memoryBytes: 16 * 1024 * 1024,
  panelMemoryBytes: 512 * 1024 * 1024, stackBytes: 256 * 1024, calls: 4096, entries: 20000, text: 1024 * 1024 });
const active = new Set();
let panelMemoryBytes = SCRIPT_LIMITS.panelMemoryBytes;
let callMilliseconds = SCRIPT_LIMITS.milliseconds;

/** A smaller budget for a test, which cannot afford to allocate 512 MB to reach the real one. */
export function setPanelMemoryBudgetForTesting(bytes = SCRIPT_LIMITS.panelMemoryBytes) { panelMemoryBytes = bytes; }
/** A longer time limit for a test that is not about it. The limit is wall-clock, so on a busy machine
    a call that takes 40 ms idle can pass 250, and the sandbox it stops changes what such a test counts. */
export function setTimeLimitForTesting(milliseconds = SCRIPT_LIMITS.milliseconds) { callMilliseconds = milliseconds; }
/** The shared heap's size now, and how many sandboxes are live: what a test sets a budget against. */
export const scriptHeapBytesForTesting = () => heapBytes();
export const sandboxCountForTesting = () => active.size;
/** Whether the panel's runtime exists: it is made with the first script and freed with the last. */
export const sharedRuntimeAliveForTesting = () => shared !== null;
/** The runtime's allocation counter as read here, beside what QuickJS itself reports for it. */
export function allocationCounterForTesting() {
  const usage = shared.runtime.computeMemoryUsage();
  const reported = shared.runtime.getSystemContext().dump(usage);
  usage.dispose();
  return { count: word(MALLOC_COUNT), size: word(MALLOC_SIZE), reported };
}

// The shared heap's size. It only ever grows: what a stopped sandbox gave back is reused from inside
// it, not returned. So the budget is enforced on growth — whatever made the heap grow past the budget
// is stopped — and never on size alone, which after one runaway would refuse every script after it.
const heapBytes = () => engine.getWasmMemory().buffer.byteLength;
const grewPastBudget = (before) => { const now = heapBytes(); return now > before && now > panelMemoryBytes; };
const BUDGET_EXCEEDED = 'Script memory limit exceeded: the panel\'s scripts together have reached their budget';
const LIMIT = /interrupted|out of memory|stack overflow|limit exceeded/i;
let depth = 0;
let deadline = 0;
let calls = 0;

// ONE RUNTIME FOR THE PANEL, A CONTEXT PER SCRIPT. A QuickJS context is a realm: its own global
// object and built-ins, so a script's names are its own, as they were. A runtime is what contexts
// share: the allocator, the atom table, the job queue, the interrupt handler and the limits. Each
// script had one of its own, and on the GAIA panel's 232 scripts that was 8.5 MB of the 27.8 MB heap
// (19.3 MB with one runtime). The plug-in's engine made the same move (JsScriptEngine.cpp).
//
// What a script had to itself and now shares is handled here: the memory limit is set for whichever
// call is running (frames), the job queue is emptied before a call returns (drain), and a context
// is freed only when no call is running, when the queue is empty and nothing can still run in it.
let shared = null;          // { runtime, rt, owners: Map<context, sandbox> }
const frames = [];
const releases = [];        // contexts of stopped scripts, freed when no call is running
let holding = 0;            // inside disposeJavascriptSandboxes, which frees once at the end
let collect = false;
let cancelling = false;

// Two fields of QuickJS's JSRuntime that neither QuickJS nor quickjs-emscripten exports: what the
// runtime has allocated (malloc_state, right after the four allocator functions) and the size past
// which its next allocation runs the cycle collector (malloc_gc_threshold). Offsets for the pinned
// @jitl/quickjs-wasmfile-release-sync, checked when the runtime is made: the limit set through the
// API has to read back from the struct, and a new runtime's threshold has to be QuickJS's 256 KB.
const MALLOC_COUNT = 16, MALLOC_SIZE = 20, MALLOC_LIMIT = 24, GC_THRESHOLD = 108;
const view = () => new DataView(engine.getWasmMemory().buffer);
const word = (offset) => view().getUint32(shared.rt + offset, true);

function sharedRuntime() {
  if (shared) return shared;
  const runtime = engine.newRuntime();
  const rt = runtime.rt.value;
  runtime.setMemoryLimit(0x5ced17);
  const fits = view().getUint32(rt + MALLOC_LIMIT, true) === 0x5ced17
    && view().getUint32(rt + GC_THRESHOLD, true) === 256 * 1024;
  runtime.setMemoryLimit(-1);
  if (!fits) {
    runtime.dispose();
    throw Error('Script interpreter: this QuickJS build does not keep its runtime where boundedJavascript.js reads it');
  }
  runtime.setMaxStackSize(SCRIPT_LIMITS.stackBytes);
  runtime.setInterruptHandler(() => cancelling || performance.now() >= deadline);
  return shared = { runtime, rt, owners: new Map() };
}

// Every call into a script is a frame, and the runtime's memory limit is set for the innermost one:
// it may allocate `budget` past what the runtime held when it began, not counting what frames inside
// it took. A script called from another has a budget of its own, as it had a runtime of its own.
function enterFrame(budget) {
  const frame = { start: word(MALLOC_SIZE), inner: 0, budget };
  frames.push(frame);
  limitMemory();
  return frame;
}
function leaveFrame(frame) {
  frames.pop();
  const outer = frames.at(-1);
  if (outer) outer.inner += word(MALLOC_SIZE) - frame.start;
  limitMemory();
}
function limitMemory() {
  const frame = frames.at(-1);
  shared.runtime.setMemoryLimit(frame ? Math.max(1, frame.start + frame.inner + frame.budget) : -1);
}

// Promise jobs queue on the runtime, not the context: what one call leaves queued, the next call into
// any script would run. So an outer call empties the queue before it returns, its own jobs and those
// of any script it called, while it has time. A job that fails is the failure of the script whose
// context it ran in.
function drain(caller) {
  const { runtime, owners } = shared;
  let jobs = 0;
  while (runtime.hasPendingJob()) {
    if (++jobs > 1000 || performance.now() >= deadline) { cancelJobs(); throw Error('Script execution limit exceeded'); }
    const step = runtime.executePendingJobs(1);
    if (!step.error) continue;
    const { context } = step.error;
    const message = context.dump(step.error);
    step.error.dispose();
    const error = Error(String(message?.message ?? message));
    if (owners.get(context) !== caller) { owners.get(context)?.fail(error); continue; }
    cancelJobs();
    throw error;
  }
}

// What is still queued when a call runs out of time, or fails on a limit, cannot wait for the next
// call: it would run there, in whichever script that is, and a runaway's next job is queued by the
// one before it, for ever. So each job runs with nothing to allocate and the interrupt raised. It
// fails at its first allocation or loop, cannot queue another (a job is an allocation), and the
// queue empties. A script that a stopped one had called loses what it had queued in that call.
function cancelJobs() {
  const { runtime } = shared;
  cancelling = true;
  runtime.setMemoryLimit(1);
  try {
    while (runtime.hasPendingJob()) runtime.executePendingJobs(1).error?.dispose();
  } finally {
    cancelling = false;
    limitMemory();
  }
}

// Called when no call is running. Freeing a context frees nothing at once: its own functions refer to
// it, so it goes with the next run of the cycle collector, and memory a stopped script held would sit
// there until then. So the collector is run now, by lowering its threshold under the next allocation;
// a runtime per script freed everything when it was disposed. The runtime goes with its last script.
function settle() {
  for (const release of releases.splice(0)) release();
  if (!shared) return;
  if (!shared.owners.size) { shared.runtime.dispose(); shared = null; collect = false; return; }
  if (!collect) return;
  collect = false;
  view().setUint32(shared.rt + GC_THRESHOLD, 0, true);
  shared.owners.keys().next().value.newObject().dispose();
}

// This function's source runs INSIDE QuickJS. Values cross as bounded data, never
// as host objects/prototypes. Function IDs retain closures, including timer and
// event callbacks, without granting access to the browser's Function constructor.
function guestBootstrap(bridge) {
  // Its callbacks are queued by the collector, outside any call, for contexts that may already be
  // freed. No panel script uses it.
  delete globalThis.FinalizationRegistry;
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
  holding++;
  try {
    for (const sandbox of [...active]) if (owner === undefined || sandbox.owner === owner) sandbox.dispose();
  } finally {
    if (!--holding && !depth) settle();
  }
}

export function evaluateBoundedJavascript(source, api, names, options = {}) {
  if (!engine) throw Error('Script interpreter has not finished loading');
  if (source.length > SCRIPT_LIMITS.text) throw Error('Script source limit exceeded');
  const heapAtStart = heapBytes();
  const { runtime, owners } = sharedRuntime();
  const budget = options.memoryBytes ?? SCRIPT_LIMITS.memoryBytes;
  // Unlimited while it is made, even inside another script's call near its budget: a context that
  // fails to allocate comes back as a null pointer, not an error.
  runtime.setMemoryLimit(-1);
  const vm = runtime.newContext();
  limitMemory();
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
    releases.push(() => {
      for (const handle of handles.reverse()) if (handle.alive) handle.dispose();
      owners.delete(vm); vm.dispose(); collect = true;
    });
    if (!depth && !holding) settle();
  }, fail(error) {
    // A job of this script failed in another script's call.
    if (disposed) return;
    if (LIMIT.test(error.message)) {
      retire = true;
      error = Error(`Script stopped: execution or memory limit exceeded (${error.message})`);
    }
    options.onError?.(error);
    if (retire) sandbox.dispose();
  } };
  active.add(sandbox);
  owners.set(vm, sandbox);
  if (grewPastBudget(heapAtStart)) {
    sandbox.dispose();
    throw Error(BUDGET_EXCEEDED);
  }

  function run(fn) {
    if (disposed || retire) throw Error('Script instance stopped; enable or reload the current code');
    const outer = depth === 0;
    if (outer) { deadline = performance.now() + (options.milliseconds ?? callMilliseconds); calls = 0; }
    const heapBefore = heapBytes();
    const frame = enterFrame(budget);
    depth++; busy++;
    try {
      let result, failure;
      try { result = fn(); } catch (error) { failure = error; }
      // A call that was stopped while it ran, or failed on a limit, has its jobs cancelled, not run.
      if (outer) {
        if (retire || performance.now() >= deadline || LIMIT.test(failure?.message ?? '')) cancelJobs();
        else try { drain(sandbox); } catch (error) { failure = error; }
      }
      if (failure) throw failure;
      if (retire) throw Error('Script instance stopped after its execution limit or approval changed');
      if (performance.now() >= deadline) throw Error('Script execution limit exceeded');
      // Checked at every depth, so a script called from another is held to it on its own. The caller
      // grew too, by what the callee took, and is stopped with it: a chain that ran a panel out of
      // memory does not get to carry on.
      if (grewPastBudget(heapBefore)) throw Error(BUDGET_EXCEEDED);
      return result;
    } catch (error) {
      // Asked again here, because a script leaves by throwing as well as by returning: one that grew
      // the heap past the budget and then threw an error of its own would otherwise keep what it took,
      // and could take it again on the next call.
      const overBudget = grewPastBudget(heapBefore);
      if (overBudget || LIMIT.test(error?.message ?? '')) {
        retire = true;
        throw Error(`Script stopped: execution or memory limit exceeded (${overBudget ? BUDGET_EXCEEDED : error.message})`);
      }
      throw error;
    } finally {
      busy--; depth--;
      leaveFrame(frame);
      if (retire) sandbox.dispose();
      if (!depth && !holding) settle();
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
      // A stopped script's queued jobs can still run, in the call that stopped it, until its context
      // is freed: they reach nothing.
      if (disposed) throw Error('Script instance stopped');
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
