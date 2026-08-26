/**
 * instrumentHost.js — UI state for the Instrument Host workspace (VIP-successor Stage 1).
 *
 * The native side is authoritative: every command answers with a full `instrumentHostState`
 * push and this store just renders the latest one. The pure pieces — payload normalization,
 * the instrument search filter, and the mock reducer that stands in for the backend when the
 * app runs in a plain browser — are exported for the node tests.
 *
 * Mock mode matters here the same way it does everywhere else in this app: `localhost:5173`
 * without the JUCE backend must still show a working workspace, so the mock reducer applies
 * the same commands to a local state instead of dropping them on the floor.
 */
import { writable, get } from 'svelte/store';
import {
  isJuceAvailable,
  sendInstrumentHostCommand,
  onInstrumentHostState,
  onInstrumentHostScanProgress,
  onInstrumentHostError,
  onInstrumentHostAudioDevices,
} from '../bridge/bridge.js';

export const hostState = writable(emptyHostState());
export const hostScanLog = writable([]);
export const hostLastError = writable('');
export const hostAudioDevices = writable(emptyAudioDevices());

export function emptyAudioDevices() {
  return { outputs: [], current: '', midiInputs: [] };
}

export function normalizeAudioDevices(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  return {
    outputs: (Array.isArray(p.outputs) ? p.outputs : []).map(String),
    current: String(p.current ?? ''),
    midiInputs: (Array.isArray(p.midiInputs) ? p.midiInputs : []).map((m) => ({
      id: String(m?.id ?? ''),
      name: String(m?.name ?? ''),
      enabled: m?.enabled === true,
    })),
  };
}

export function mockAudioDevices() {
  return normalizeAudioDevices({
    outputs: ['Speakers (Mock Audio Device)', 'Headphones (Mock Audio Device)'],
    current: 'Speakers (Mock Audio Device)',
    midiInputs: [
      { id: 'mock-in-1', name: 'CTRL49 USB', enabled: true },
      { id: 'mock-in-2', name: 'Mock MIDI Keyboard', enabled: false },
    ],
  });
}

export function emptyHostState() {
  return {
    instruments: [],
    modules: [],
    scanPaths: [],
    scanning: false,
    editorOpenPartId: '',
    audio: { enabled: false, running: false, deviceName: '', sampleRate: 0, bufferSize: 0 },
    rack: { performanceId: '', focusedPartId: '', parts: [] },
  };
}

/** Shapes whatever arrived into the exact structure the view renders — absent fields become
 *  defaults rather than undefined holes. */
export function normalizeHostState(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const rack = p.rack && typeof p.rack === 'object' ? p.rack : {};

  return {
    instruments: (Array.isArray(p.instruments) ? p.instruments : []).map((i) => ({
      ceId: String(i?.ceId ?? ''),
      name: String(i?.name ?? ''),
      vendor: String(i?.vendor ?? ''),
      version: String(i?.version ?? ''),
    })),
    modules: (Array.isArray(p.modules) ? p.modules : []).map((m) => ({
      path: String(m?.path ?? ''),
      quarantined: m?.quarantined === true,
      missing: m?.missing === true,
      failureCount: Number(m?.failureCount ?? 0),
      lastFailureReason: String(m?.lastFailureReason ?? ''),
      numClasses: Number(m?.numClasses ?? 0),
    })),
    scanPaths: (Array.isArray(p.scanPaths) ? p.scanPaths : []).map(String),
    scanning: p.scanning === true,
    editorOpenPartId: String(p.editorOpenPartId ?? ''),
    audio: {
      enabled: p.audio?.enabled === true,
      running: p.audio?.running === true,
      deviceName: String(p.audio?.deviceName ?? ''),
      sampleRate: Number(p.audio?.sampleRate ?? 0),
      bufferSize: Number(p.audio?.bufferSize ?? 0),
    },
    rack: {
      performanceId: String(rack.performanceId ?? ''),
      focusedPartId: String(rack.focusedPartId ?? ''),
      parts: (Array.isArray(rack.parts) ? rack.parts : []).map((part) => ({
        partId: String(part?.partId ?? ''),
        pluginCeId: String(part?.pluginCeId ?? ''),
        pluginName: String(part?.pluginName ?? ''),
        pluginVendor: String(part?.pluginVendor ?? ''),
        hasInstrument: part?.hasInstrument === true,
        unresolved: part?.unresolved === true,
        channel: Number(part?.channel ?? 0),
        keyLow: Number(part?.keyLow ?? 0),
        keyHigh: Number(part?.keyHigh ?? 127),
        velocityLow: Number(part?.velocityLow ?? 1),
        velocityHigh: Number(part?.velocityHigh ?? 127),
        transpose: Number(part?.transpose ?? 0),
        enabled: part?.enabled !== false,
        mute: part?.mute === true,
        solo: part?.solo === true,
        volume: Number(part?.volume ?? 1),
        pan: Number(part?.pan ?? 0),
      })),
    },
  };
}

/** Case-insensitive name/vendor filter for the browser column. */
export function filterInstruments(instruments, query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return instruments;
  return instruments.filter(
    (i) => i.name.toLowerCase().includes(q) || i.vendor.toLowerCase().includes(q)
  );
}

/** The browser-only demo catalogue and rack. */
export function mockHostState() {
  return normalizeHostState({
    instruments: [
      { ceId: 'mock-analog', name: 'Analog One', vendor: 'Mock Audio', version: '1.4' },
      { ceId: 'mock-keys', name: 'Stage Keys', vendor: 'Mock Audio', version: '2.0' },
      { ceId: 'mock-strings', name: 'String Machine', vendor: 'Tape Labs', version: '1.1' },
    ],
    modules: [
      { path: 'C:\\Program Files\\Common Files\\VST3\\MockAudio.vst3', numClasses: 2 },
      { path: 'C:\\Program Files\\Common Files\\VST3\\Rusty.vst3', quarantined: true, failureCount: 2, lastFailureReason: 'scanner exited with code 3', numClasses: 0 },
    ],
    scanPaths: [],
    rack: {
      performanceId: 'mock-performance',
      focusedPartId: 'mock-part-1',
      parts: [
        { partId: 'mock-part-1', pluginCeId: 'mock-keys', pluginName: 'Stage Keys', pluginVendor: 'Mock Audio', hasInstrument: true },
        { partId: 'mock-part-2', pluginCeId: '', pluginName: '' },
      ],
    },
  });
}

/** The mock reducer: applies one command to a normalized state, so the browser-only app
 *  behaves instead of stalling. Deliberately mirrors the native semantics the tests pin. */
export function applyMockCommand(state, payload) {
  const cmd = payload?.cmd;
  const next = normalizeHostState(state);
  const part = (id) => next.rack.parts.find((p) => p.partId === id);

  if (cmd === 'addPart') {
    const partId = `mock-part-${Date.now()}-${next.rack.parts.length + 1}`;
    next.rack.parts.push(normalizeHostState({ rack: { parts: [{ partId }] } }).rack.parts[0]);
    if (!next.rack.focusedPartId) next.rack.focusedPartId = partId;
    return next;
  }
  if (cmd === 'removePart') {
    next.rack.parts = next.rack.parts.filter((p) => p.partId !== payload.partId);
    if (next.rack.focusedPartId === payload.partId)
      next.rack.focusedPartId = next.rack.parts[0]?.partId ?? '';
    if (next.editorOpenPartId === payload.partId) next.editorOpenPartId = '';
    return next;
  }
  if (cmd === 'focusPart') {
    if (part(payload.partId)) {
      next.rack.focusedPartId = payload.partId;
      // The editor follows focus, hiding over an empty part — the native rule, mirrored.
      if (next.editorOpenPartId && next.editorOpenPartId !== payload.partId)
        next.editorOpenPartId = part(payload.partId)?.hasInstrument ? payload.partId : '';
    }
    return next;
  }
  if (cmd === 'openEditor') {
    if (part(payload.partId)?.hasInstrument) next.editorOpenPartId = payload.partId;
    return next;
  }
  if (cmd === 'closeEditor') {
    next.editorOpenPartId = '';
    return next;
  }
  if (cmd === 'loadInstrument') {
    const target = part(payload.partId);
    const instrument = next.instruments.find((i) => i.ceId === payload.ceId);
    if (target && instrument) {
      target.pluginCeId = instrument.ceId;
      target.pluginName = instrument.name;
      target.pluginVendor = instrument.vendor;
      target.hasInstrument = true;
      target.unresolved = false;
    }
    return next;
  }
  if (cmd === 'unloadInstrument') {
    const target = part(payload.partId);
    if (target) { target.hasInstrument = false; target.unresolved = target.pluginCeId !== ''; }
    if (next.editorOpenPartId === payload.partId) next.editorOpenPartId = '';
    return next;
  }
  if (cmd === 'setPartMixer') {
    const target = part(payload.partId);
    if (target)
      for (const key of ['enabled', 'mute', 'solo', 'volume', 'pan'])
        if (payload[key] !== undefined) target[key] = payload[key];
    return next;
  }
  if (cmd === 'setPartMidiRules') {
    const target = part(payload.partId);
    if (target)
      for (const key of ['channel', 'keyLow', 'keyHigh', 'velocityLow', 'velocityHigh', 'transpose'])
        if (payload[key] !== undefined) target[key] = Number(payload[key]);
    return next;
  }
  if (cmd === 'clearQuarantine') {
    const module = next.modules.find((m) => m.path === payload.modulePath);
    if (module) { module.quarantined = false; module.failureCount = 0; module.lastFailureReason = ''; }
    return next;
  }
  if (cmd === 'addScanPath') {
    if (payload.path && !next.scanPaths.includes(payload.path)) next.scanPaths.push(payload.path);
    return next;
  }
  if (cmd === 'removeScanPath') {
    next.scanPaths = next.scanPaths.filter((p) => p !== payload.path);
    return next;
  }

  return next; // getState / scan / panic mutate nothing mockable
}

let initialized = false;

/** Wires the bridge listeners (or seeds mock state) and asks for the first snapshot.
 *  Idempotent; the workspace calls it on mount. */
export function initInstrumentHostBridge() {
  if (initialized) return;
  initialized = true;

  if (!isJuceAvailable()) {
    hostState.set(mockHostState());
    hostAudioDevices.set(mockAudioDevices());
    return;
  }

  onInstrumentHostAudioDevices((payload) => hostAudioDevices.set(normalizeAudioDevices(payload)));
  onInstrumentHostState((payload) => hostState.set(normalizeHostState(payload)));
  onInstrumentHostScanProgress((payload) => {
    hostScanLog.update((lines) => [...lines.slice(-49), String(payload?.line ?? '')]);
    // done means the catalogue changed on the scan thread; the fresh snapshot has to come
    // through the normal command path (see InstrumentHostService.cpp, runScanNow).
    if (payload?.done === true) send({ cmd: 'getState' });
  });
  onInstrumentHostError((payload) => hostLastError.set(String(payload?.message ?? '')));
  send({ cmd: 'getState' });
}

function send(payload) {
  if (!isJuceAvailable()) {
    // Device commands mutate the device store, everything else the host state.
    if (payload?.cmd === 'setAudioDevice') {
      hostAudioDevices.update((d) => ({ ...d, current: String(payload.name ?? d.current) }));
      return;
    }
    if (payload?.cmd === 'setMidiInputEnabled') {
      hostAudioDevices.update((d) => ({
        ...d,
        midiInputs: d.midiInputs.map((m) =>
          m.id === payload.id ? { ...m, enabled: payload.enabled === true } : m
        ),
      }));
      return;
    }
    if (payload?.cmd === 'getAudioDevices') return;
    hostState.set(applyMockCommand(get(hostState), payload));
    return;
  }
  sendInstrumentHostCommand(payload);
}

export const requestHostState = () => send({ cmd: 'getState' });
export const scanForInstruments = () => send({ cmd: 'scan' });
export const addScanPath = (path) => send({ cmd: 'addScanPath', path });
export const removeScanPath = (path) => send({ cmd: 'removeScanPath', path });
export const clearQuarantine = (modulePath) => send({ cmd: 'clearQuarantine', modulePath });
export const addRackPart = () => send({ cmd: 'addPart' });
export const removeRackPart = (partId) => send({ cmd: 'removePart', partId });
export const focusRackPart = (partId) => send({ cmd: 'focusPart', partId });
export const moveRackPart = (partId, index) => send({ cmd: 'movePart', partId, index });
export const loadInstrument = (partId, ceId) => send({ cmd: 'loadInstrument', partId, ceId });
export const unloadInstrument = (partId) => send({ cmd: 'unloadInstrument', partId });
export const setPartMixer = (partId, fields) => send({ cmd: 'setPartMixer', partId, ...fields });
export const setPartMidiRules = (partId, fields) => send({ cmd: 'setPartMidiRules', partId, ...fields });
export const hostPanic = (partId) => send(partId ? { cmd: 'panic', partId } : { cmd: 'panic' });
export const openEditor = (partId) => send({ cmd: 'openEditor', partId });
export const closeEditor = () => send({ cmd: 'closeEditor' });
export const requestAudioDevices = () => send({ cmd: 'getAudioDevices' });
export const setAudioDevice = (name) => send({ cmd: 'setAudioDevice', name });
export const setMidiInputEnabled = (id, enabled) => send({ cmd: 'setMidiInputEnabled', id, enabled });
