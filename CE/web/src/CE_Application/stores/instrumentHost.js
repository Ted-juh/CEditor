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
  onInstrumentHostProject,
  onInstrumentHostBuildProgress,
  onInstrumentHostParameters,
  onInstrumentHostParamValues,
  onInstrumentHostLibrary,
} from '../bridge/bridge.js';

export const hostState = writable(emptyHostState());
export const hostScanLog = writable([]);
export const hostLastError = writable('');
export const hostAudioDevices = writable(emptyAudioDevices());
export const hostProject = writable(emptyHostProject());
export const hostBuild = writable(emptyHostBuild());
export const hostParameters = writable(emptyHostParameters());
export const hostLibrary = writable(emptyHostLibrary());

// --- the Stage 4 library ------------------------------------------------------------------------

export function emptyHostLibrary() {
  return {
    records: [],
    counts: { total: 0, presets: 0, racks: 0, missing: 0 },
    paths: [],
    query: '',
    type: '',
  };
}

export function normalizeHostLibrary(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  return {
    records: (Array.isArray(p.records) ? p.records : []).map((r) => ({
      recordId: String(r?.recordId ?? ''),
      type: String(r?.type ?? ''),
      sourceType: String(r?.sourceType ?? ''),
      name: String(r?.name ?? ''),
      manufacturer: String(r?.manufacturer ?? ''),
      instrument: String(r?.instrument ?? ''),
      category: String(r?.category ?? ''),
      factory: r?.factory === true,
      missing: r?.missing === true,
      available: r?.available === true,
      reason: String(r?.reason ?? ''),
      favourite: r?.favourite === true,
      rating: Number(r?.rating ?? 0),
      notes: String(r?.notes ?? ''),
      tags: (Array.isArray(r?.tags) ? r.tags : []).map(String),
    })),
    counts: {
      total: Number(p.counts?.total ?? 0),
      presets: Number(p.counts?.presets ?? 0),
      racks: Number(p.counts?.racks ?? 0),
      missing: Number(p.counts?.missing ?? 0),
    },
    paths: (Array.isArray(p.paths) ? p.paths : []).map(String),
    query: String(p.query ?? ''),
    type: String(p.type ?? ''),
  };
}

export function mockHostLibrary(query = '', type = '') {
  const all = [
    { recordId: 'lib-1', type: 'preset', sourceType: 'vstpreset', name: 'Warm Pad',
      manufacturer: 'Mock Audio', instrument: 'Stage Keys', factory: true, available: true, favourite: true },
    { recordId: 'lib-2', type: 'preset', sourceType: 'userState', name: 'My Growl',
      manufacturer: 'Mock Audio', instrument: 'Analog One', available: true, tags: ['bass'] },
    { recordId: 'lib-3', type: 'preset', sourceType: 'vstpreset', name: 'Lost Lead',
      manufacturer: 'Someone', instrument: 'Uninstalled Synth', factory: true,
      available: false, reason: 'Requires Uninstalled Synth, which is not in the catalogue.' },
    { recordId: 'lib-4', type: 'rack', sourceType: 'rackCapture', name: 'Live Rig', available: true },
  ];
  const q = query.trim().toLowerCase();
  const records = all.filter((r) =>
    (!type || r.type === type)
    && (!q || r.name.toLowerCase().includes(q) || (r.instrument ?? '').toLowerCase().includes(q)
        || (r.manufacturer ?? '').toLowerCase().includes(q)));
  return normalizeHostLibrary({
    records,
    counts: { total: all.length, presets: 3, racks: 1, missing: 0 },
    paths: [],
    query,
    type,
  });
}

export function emptyHostProject() {
  return {
    productName: '',
    version: '',
    publisher: '',
    appId: '',
    includeStandalone: true,
    includeVst3: true,
  };
}

export function normalizeHostProject(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  return {
    productName: String(p.productName ?? ''),
    version: String(p.version ?? ''),
    publisher: String(p.publisher ?? ''),
    appId: String(p.appId ?? ''),
    includeStandalone: p.includeStandalone !== false,
    includeVst3: p.includeVst3 !== false,
  };
}

export function mockHostProject() {
  return normalizeHostProject({
    productName: 'My Instrument Rack',
    version: '1.0.0',
    publisher: '',
    appId: 'M0CK0000-0000-4000-8000-000000000000',
  });
}

export function emptyHostBuild() {
  return { running: false, done: false, ok: false, lines: [] };
}

// --- the Stage 2 parameter view -----------------------------------------------------------------

export function emptyHostParameters() {
  return { partId: '', parameters: [], warnings: [] };
}

export function normalizeHostParameters(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  return {
    partId: String(p.partId ?? ''),
    parameters: (Array.isArray(p.parameters) ? p.parameters : []).map((d) => ({
      id: String(d?.id ?? ''),
      index: Number(d?.index ?? 0),
      name: String(d?.name ?? ''),
      label: String(d?.label ?? ''),
      group: String(d?.group ?? ''),
      value: Number(d?.value ?? 0),
      text: String(d?.text ?? ''),
      defaultValue: Number(d?.defaultValue ?? 0),
      numSteps: Number(d?.numSteps ?? 0),
      discrete: d?.discrete === true,
      boolean: d?.boolean === true,
      automatable: d?.automatable !== false,
      meta: d?.meta === true,
    })),
    warnings: (Array.isArray(p.warnings) ? p.warnings : []).map(String),
  };
}

/** Applies one instrumentHostParamValues delta to the registry snapshot the view renders.
 *  A delta for a different part leaves the snapshot untouched — the native side speaks per
 *  part, and the view holds the focused part's registry only. */
export function applyParamValues(registry, payload) {
  if (!payload || String(payload.partId ?? '') !== registry.partId) return registry;
  const changes = Array.isArray(payload.changes) ? payload.changes : [];
  if (changes.length === 0) return registry;
  const byId = new Map(changes.map((c) => [String(c?.id ?? ''), c]));
  return {
    ...registry,
    parameters: registry.parameters.map((d) => {
      const change = byId.get(d.id);
      return change
        ? { ...d, value: Number(change.value ?? d.value), text: String(change.text ?? d.text) }
        : d;
    }),
  };
}

/** Case-insensitive name/group/id filter for the parameter list. */
export function filterParameters(parameters, query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return parameters;
  return parameters.filter(
    (d) => d.name.toLowerCase().includes(q) || d.group.toLowerCase().includes(q)
        || d.id.toLowerCase().includes(q)
  );
}

const MOCK_WAVES = ['Saw', 'Square', 'Sine'];
const mockParamText = (d, value) => {
  if (d.id === 'wave') return MOCK_WAVES[Math.min(2, Math.round(value * 2))];
  if (d.boolean) return value >= 0.5 ? 'On' : 'Off';
  return value.toFixed(2);
};

export function mockHostParameters(partId) {
  return normalizeHostParameters({
    partId,
    parameters: [
      { id: 'cutoff', index: 0, name: 'Cutoff', group: 'Filter', value: 0.5, text: '0.50', defaultValue: 0.5 },
      { id: 'wave', index: 1, name: 'Wave', group: 'Oscillator', value: 0, text: 'Saw', defaultValue: 0, numSteps: 3, discrete: true },
      { id: 'drive', index: 2, name: 'Drive', value: 0, text: 'Off', defaultValue: 0, numSteps: 2, discrete: true, boolean: true },
    ],
  });
}

/** Folds one instrumentHostBuildProgress event into the build store's value. */
export function applyBuildProgress(build, payload) {
  const line = String(payload?.line ?? '');
  const lines = line ? [...build.lines.slice(-199), line] : build.lines;
  if (payload?.done === true)
    return { running: false, done: true, ok: payload?.ok === true, lines };
  return { running: true, done: false, ok: false, lines };
}

export function emptyAudioDevices() {
  return { outputs: [], current: '', midiInputs: [], midiOutputs: [], inputChannels: 0 };
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
    midiOutputs: (Array.isArray(p.midiOutputs) ? p.midiOutputs : []).map((m) => ({
      id: String(m?.id ?? ''),
      name: String(m?.name ?? ''),
    })),
    inputChannels: Number(p.inputChannels ?? 0),
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
    midiOutputs: [
      { id: 'mock-out-1', name: 'AN1x MIDI Out' },
      { id: 'mock-out-2', name: 'USB MIDI Interface' },
    ],
    inputChannels: 4,
  });
}

export function emptyHostState() {
  return {
    instruments: [],
    effectClasses: [],
    modules: [],
    scanPaths: [],
    scanning: false,
    editorOpenPartId: '',
    audio: { enabled: false, running: false, deviceName: '', sampleRate: 0, bufferSize: 0,
             inputChannels: 0, cpu: 0, xruns: 0 },
    rack: { performanceId: '', focusedPartId: '', parts: [], masterEffects: [], returns: [],
            macros: [], pages: [], masterLatencyMs: 0 },
  };
}

const normalizeEffectSlot = (e) => ({
  effectId: String(e?.effectId ?? ''),
  pluginCeId: String(e?.pluginCeId ?? ''),
  pluginName: String(e?.pluginName ?? ''),
  pluginVendor: String(e?.pluginVendor ?? ''),
  bypassed: e?.bypassed === true,
  hasProcessor: e?.hasProcessor === true,
  unresolved: e?.unresolved === true,
});

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
    effectClasses: (Array.isArray(p.effectClasses) ? p.effectClasses : []).map((i) => ({
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
      numInstruments: Number(m?.numInstruments ?? 0),
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
      inputChannels: Number(p.audio?.inputChannels ?? 0),
      cpu: Number(p.audio?.cpu ?? 0),
      xruns: Number(p.audio?.xruns ?? 0),
    },
    rack: {
      performanceId: String(rack.performanceId ?? ''),
      focusedPartId: String(rack.focusedPartId ?? ''),
      masterLatencyMs: Number(rack.masterLatencyMs ?? 0),
      masterEffects: (Array.isArray(rack.masterEffects) ? rack.masterEffects : []).map(normalizeEffectSlot),
      returns: (Array.isArray(rack.returns) ? rack.returns : []).map((r) => ({
        returnId: String(r?.returnId ?? ''),
        name: String(r?.name ?? ''),
        level: Number(r?.level ?? 1),
        effects: (Array.isArray(r?.effects) ? r.effects : []).map(normalizeEffectSlot),
      })),
      macros: (Array.isArray(rack.macros) ? rack.macros : []).map((m) => ({
        macroId: String(m?.macroId ?? ''),
        name: String(m?.name ?? ''),
        value: Number(m?.value ?? 0),
        targets: (Array.isArray(m?.targets) ? m.targets : []).map((t) => ({
          targetId: String(t?.targetId ?? ''),
          parameterId: String(t?.parameterId ?? ''),
          targetName: String(t?.targetName ?? ''),
          displayName: String(t?.displayName ?? ''),
          rangeMin: Number(t?.rangeMin ?? 0),
          rangeMax: Number(t?.rangeMax ?? 1),
          inverted: t?.inverted === true,
          resolved: t?.resolved === true,
        })),
      })),
      pages: (Array.isArray(rack.pages) ? rack.pages : []).map((page) => ({
        pageId: String(page?.pageId ?? ''),
        name: String(page?.name ?? ''),
        generated: page?.generated === true,
        generatedForPartId: String(page?.generatedForPartId ?? ''),
        slots: (Array.isArray(page?.slots) ? page.slots : []).map((slot) => ({
          slotId: String(slot?.slotId ?? ''),
          assigned: slot?.assigned === true,
          partId: String(slot?.partId ?? ''),
          parameterId: String(slot?.parameterId ?? ''),
          label: String(slot?.label ?? ''),
          displayName: String(slot?.displayName ?? ''),
          partName: String(slot?.partName ?? ''),
          rangeMin: Number(slot?.rangeMin ?? 0),
          rangeMax: Number(slot?.rangeMax ?? 1),
          inverted: slot?.inverted === true,
          bipolar: slot?.bipolar === true,
          resolved: slot?.resolved === true,
        })),
      })),
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
        effects: (Array.isArray(part?.effects) ? part.effects : []).map(normalizeEffectSlot),
        sends: (Array.isArray(part?.sends) ? part.sends : []).map((s) => ({
          returnId: String(s?.returnId ?? ''),
          level: Number(s?.level ?? 0),
        })),
        extraOuts: (Array.isArray(part?.extraOuts) ? part.extraOuts : []).map((o) => ({
          pairIndex: Number(o?.pairIndex ?? 1),
          gain: Number(o?.gain ?? 1),
        })),
        outputChannels: Number(part?.outputChannels ?? 0),
        latencyMs: Number(part?.latencyMs ?? 0),
        hardware: part?.hardware === true,
        midiOutputId: String(part?.midiOutputId ?? ''),
        midiOutputName: String(part?.midiOutputName ?? ''),
        midiOutChannel: Number(part?.midiOutChannel ?? 1),
        audioReturnChannel: Number(part?.audioReturnChannel ?? -1),
        audioReturnStereo: part?.audioReturnStereo !== false,
        programBank: Number(part?.programBank ?? -1),
        programNumber: Number(part?.programNumber ?? -1),
        midiOutError: String(part?.midiOutError ?? ''),
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
    effectClasses: [
      { ceId: 'mock-reverb', name: 'Sweet Reverb', vendor: 'Mock Audio', version: '1.0' },
      { ceId: 'mock-comp', name: 'Big Comp', vendor: 'Tape Labs', version: '2.2' },
    ],
    modules: [
      { path: 'C:\\Program Files\\Common Files\\VST3\\MockAudio.vst3', numClasses: 2, numInstruments: 2 },
      { path: 'C:\\Program Files\\Common Files\\VST3\\TapeLabs.vst3', numClasses: 3, numInstruments: 1 },
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

/** The native virtualParameterName rule, mirrored for the mock's bindings and chips. */
function mockBindingName(parameterId, rack) {
  const id = String(parameterId ?? '');
  if (id === '@gain') return 'Level';
  if (id === '@pan') return 'Pan';
  if (id.startsWith('@send:'))
    return `Send — ${rack.returns.find((r) => r.returnId === id.slice(6))?.name ?? 'gone'}`;
  return id.replace(/^./, (c) => c.toUpperCase());
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
  if (cmd === 'browseScanPath') {
    // No native dialog in a plain browser; stand in with a fixed choice so the flow demos.
    if (!next.scanPaths.includes('D:\\Browsed VST3s')) next.scanPaths.push('D:\\Browsed VST3s');
    return next;
  }
  if (cmd === 'addEffect') {
    const effectClass = next.effectClasses.find((c) => c.ceId === payload.ceId);
    if (!effectClass) return next;
    const slot = normalizeHostState({ rack: { masterEffects: [{
      effectId: `mock-fx-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      pluginCeId: effectClass.ceId, pluginName: effectClass.name, pluginVendor: effectClass.vendor,
      hasProcessor: true,
    }] } }).rack.masterEffects[0];
    if (payload.chainId === 'master') next.rack.masterEffects.push(slot);
    else if (part(payload.chainId)) part(payload.chainId).effects.push(slot);
    else next.rack.returns.find((r) => r.returnId === payload.chainId)?.effects.push(slot);
    return next;
  }
  if (cmd === 'removeEffect' || cmd === 'setEffectBypassed' || cmd === 'moveEffect') {
    const chains = [next.rack.masterEffects, ...next.rack.parts.map((p) => p.effects),
                    ...next.rack.returns.map((r) => r.effects)];
    for (const chain of chains) {
      const index = chain.findIndex((e) => e.effectId === payload.effectId);
      if (index < 0) continue;
      if (cmd === 'removeEffect') chain.splice(index, 1);
      else if (cmd === 'setEffectBypassed') chain[index].bypassed = payload.bypassed === true;
      else chain.splice(Math.max(0, Math.min(chain.length - 1, Number(payload.index ?? 0))), 0,
                        ...chain.splice(index, 1));
      break;
    }
    return next;
  }
  if (cmd === 'addReturn') {
    next.rack.returns.push(normalizeHostState({ rack: { returns: [{
      returnId: `mock-return-${Date.now()}-${next.rack.returns.length + 1}`,
      name: payload.name || `Return ${next.rack.returns.length + 1}`,
    }] } }).rack.returns[0]);
    return next;
  }
  if (cmd === 'removeReturn') {
    next.rack.returns = next.rack.returns.filter((r) => r.returnId !== payload.returnId);
    // The native rule, mirrored: stranded sends are dropped, never kept dangling.
    for (const p of next.rack.parts)
      p.sends = p.sends.filter((s) => s.returnId !== payload.returnId);
    return next;
  }
  if (cmd === 'renameReturn') {
    const ret = next.rack.returns.find((r) => r.returnId === payload.returnId);
    if (ret) ret.name = String(payload.name ?? ret.name);
    return next;
  }
  if (cmd === 'setReturnLevel') {
    const ret = next.rack.returns.find((r) => r.returnId === payload.returnId);
    if (ret) ret.level = Math.min(2, Math.max(0, Number(payload.level ?? 1)));
    return next;
  }
  if (cmd === 'setSendLevel') {
    const target = part(payload.partId);
    if (!target || !next.rack.returns.some((r) => r.returnId === payload.returnId)) return next;
    const level = Math.min(2, Math.max(0, Number(payload.level ?? 0)));
    const send = target.sends.find((s) => s.returnId === payload.returnId);
    if (send) send.level = level;
    else target.sends.push({ returnId: payload.returnId, level });
    return next;
  }
  if (cmd === 'setExtraOut') {
    const target = part(payload.partId);
    const pairIndex = Number(payload.pairIndex ?? 0);
    if (!target || pairIndex < 1) return next;
    const gain = Math.min(2, Math.max(0, Number(payload.gain ?? 1)));
    const extra = target.extraOuts.find((o) => o.pairIndex === pairIndex);
    if (extra) extra.gain = gain;
    else target.extraOuts.push({ pairIndex, gain });
    return next;
  }
  if (cmd === 'removeExtraOut') {
    const target = part(payload.partId);
    if (target) target.extraOuts = target.extraOuts.filter((o) => o.pairIndex !== Number(payload.pairIndex));
    return next;
  }
  if (cmd === 'setHardwareConfig') {
    const target = part(payload.partId);
    if (!target) return next;
    target.hardware = true;
    target.hasInstrument = false;
    for (const key of ['midiOutputId', 'midiOutputName', 'deviceProfileId'])
      if (payload[key] !== undefined) target[key] = String(payload[key]);
    for (const key of ['midiOutChannel', 'audioReturnChannel', 'programBank', 'programNumber'])
      if (payload[key] !== undefined) target[key] = Number(payload[key]);
    if (payload.audioReturnStereo !== undefined) target.audioReturnStereo = payload.audioReturnStereo === true;
    // The port-gone diagnostic, mirrored against the mock device list.
    target.midiOutError = target.midiOutputId
      && !['mock-out-1', 'mock-out-2'].includes(target.midiOutputId)
      ? 'No such MIDI output.' : '';
    return next;
  }
  if (cmd === 'clearHardware') {
    const target = part(payload.partId);
    if (target) { target.hardware = false; target.midiOutError = ''; }
    return next;
  }
  if (cmd === 'sendHardwareProgram') {
    return next; // nothing observable in the browser — the port lives with the native side
  }
  if (cmd === 'addMacro') {
    next.rack.macros.push(normalizeHostState({ rack: { macros: [{
      macroId: `mock-macro-${Date.now()}-${next.rack.macros.length + 1}`,
      name: payload.name || `Macro ${next.rack.macros.length + 1}`,
    }] } }).rack.macros[0]);
    return next;
  }
  if (cmd === 'removeMacro') {
    next.rack.macros = next.rack.macros.filter((m) => m.macroId !== payload.macroId);
    return next;
  }
  if (cmd === 'renameMacro') {
    const macro = next.rack.macros.find((m) => m.macroId === payload.macroId);
    if (macro) macro.name = String(payload.name ?? macro.name);
    return next;
  }
  if (cmd === 'setMacroValue') {
    const macro = next.rack.macros.find((m) => m.macroId === payload.macroId);
    if (macro) macro.value = Math.min(1, Math.max(0, Number(payload.value ?? 0)));
    return next;
  }
  if (cmd === 'addMacroTarget' || cmd === 'removeMacroTarget') {
    const macro = next.rack.macros.find((m) => m.macroId === payload.macroId);
    if (!macro) return next;
    if (cmd === 'removeMacroTarget') {
      macro.targets = macro.targets.filter(
        (t) => !(t.targetId === payload.targetId && t.parameterId === payload.parameterId));
    } else if (!macro.targets.some((t) => t.targetId === payload.targetId && t.parameterId === payload.parameterId)) {
      macro.targets.push({
        targetId: String(payload.targetId ?? ''),
        parameterId: String(payload.parameterId ?? ''),
        targetName: part(payload.targetId)?.pluginName
          ?? [...next.rack.masterEffects, ...next.rack.parts.flatMap((p) => p.effects),
              ...next.rack.returns.flatMap((r) => r.effects)]
               .find((e) => e.effectId === payload.targetId)?.pluginName
          ?? '',
        displayName: mockBindingName(payload.parameterId, next.rack),
        rangeMin: 0, rangeMax: 1, inverted: false, resolved: true,
      });
    }
    return next;
  }
  if (cmd === 'addControlPage') {
    const pageId = `mock-page-${Date.now()}-${next.rack.pages.length + 1}`;
    next.rack.pages.push(normalizeHostState({ rack: { pages: [{
      pageId,
      name: payload.name || `Page ${next.rack.pages.length + 1}`,
      slots: Array.from({ length: 8 }, (_, i) => ({ slotId: `s${i + 1}` })),
    }] } }).rack.pages[0]);
    return next;
  }
  if (cmd === 'removeControlPage') {
    next.rack.pages = next.rack.pages.filter((p) => p.pageId !== payload.pageId);
    return next;
  }
  if (cmd === 'generateControlPages') {
    const target = part(payload.partId);
    if (!target?.hasInstrument) return next;
    // Mirrors the native rule: replace this part's generated pages, keep everything else.
    next.rack.pages = next.rack.pages.filter((p) => !(p.generated && p.generatedForPartId === payload.partId));
    const page = normalizeHostState({ rack: { pages: [{
      pageId: `mock-auto-${payload.partId}`,
      name: target.pluginName || 'Auto',
      generated: true,
      slots: Array.from({ length: 8 }, (_, i) => {
        const params = ['cutoff', 'wave', 'drive'];
        return i < params.length
          ? { slotId: `s${i + 1}`, assigned: true, partId: payload.partId, parameterId: params[i],
              displayName: params[i].replace(/^./, (c) => c.toUpperCase()),
              partName: target.pluginName, resolved: true }
          : { slotId: `s${i + 1}` };
      }),
    }] } }).rack.pages[0];
    page.generatedForPartId = payload.partId;
    next.rack.pages.push(page);
    return next;
  }
  if (cmd === 'renameControlPage') {
    const page = next.rack.pages.find((p) => p.pageId === payload.pageId);
    if (page) page.name = String(payload.name ?? page.name);
    return next;
  }
  if (cmd === 'assignControlSlot' || cmd === 'clearControlSlot' || cmd === 'setControlSlotOptions') {
    const page = next.rack.pages.find((p) => p.pageId === payload.pageId);
    const slot = page?.slots.find((s) => s.slotId === payload.slotId);
    if (!slot) return next;
    if (cmd === 'clearControlSlot') {
      Object.assign(slot, { assigned: false, partId: '', parameterId: '', label: '',
                            displayName: '', partName: '', rangeMin: 0, rangeMax: 1,
                            inverted: false, bipolar: false, resolved: false });
    } else if (cmd === 'assignControlSlot') {
      const target = part(payload.partId);
      const virtual = String(payload.parameterId ?? '').startsWith('@');
      // Mirrors the native rule: a plug-in address needs the live instrument; a mixer
      // address needs only its part.
      if (!target || (!virtual && !target.hasInstrument)) return next;
      Object.assign(slot, {
        assigned: true,
        partId: payload.partId,
        parameterId: String(payload.parameterId ?? ''),
        displayName: mockBindingName(payload.parameterId, next.rack),
        partName: target.pluginName || (target.hardware ? target.midiOutputName : ''),
        resolved: true,
      });
    } else {
      for (const key of ['rangeMin', 'rangeMax', 'inverted', 'bipolar', 'label'])
        if (payload[key] !== undefined) slot[key] = payload[key];
      if (payload.label !== undefined && payload.label) slot.displayName = String(payload.label);
    }
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
    hostProject.set(mockHostProject());
    return;
  }

  onInstrumentHostAudioDevices((payload) => hostAudioDevices.set(normalizeAudioDevices(payload)));
  onInstrumentHostProject((payload) => hostProject.set(normalizeHostProject(payload)));
  onInstrumentHostBuildProgress((payload) => hostBuild.update((b) => applyBuildProgress(b, payload)));
  onInstrumentHostParameters((payload) => hostParameters.set(normalizeHostParameters(payload)));
  onInstrumentHostParamValues((payload) => hostParameters.update((r) => applyParamValues(r, payload)));
  onInstrumentHostLibrary((payload) => hostLibrary.set(normalizeHostLibrary(payload)));
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
    if (payload?.cmd === 'getHostProject') return; // seeded by init
    if (payload?.cmd === 'setHostProject') {
      // The native rule, mirrored: authored fields merge, the appId never does.
      hostProject.update((project) => {
        const next = { ...project };
        for (const key of ['productName', 'version', 'publisher'])
          if (payload[key] !== undefined) next[key] = String(payload[key]).trim();
        for (const key of ['includeStandalone', 'includeVst3'])
          if (payload[key] !== undefined) next[key] = payload[key] === true;
        return next;
      });
      return;
    }
    if (payload?.cmd === 'buildHostProduct') {
      const project = get(hostProject);
      hostBuild.set(applyBuildProgress(emptyHostBuild(), { line: `Building "${project.productName}" ${project.version} (mock)` }));
      hostBuild.update((b) => applyBuildProgress(b, { line: 'Staged mock product folder.', done: true, ok: true }));
      return;
    }
    if (payload?.cmd === 'getParameters') {
      const state = get(hostState);
      const part = state.rack.parts.find((p) => p.partId === payload.partId);
      if (part) {
        // A part answers with its plug-in rows (when loaded) plus its mixer addresses —
        // the native Stage 5 registry, mirrored.
        const base = part.hasInstrument ? mockHostParameters(payload.partId).parameters : [];
        const mixer = [
          { id: '@gain', name: 'Level', group: 'Mixer', value: part.volume / 2,
            text: part.volume.toFixed(2), defaultValue: 0.5 },
          { id: '@pan', name: 'Pan', group: 'Mixer', value: (part.pan + 1) / 2,
            text: part.pan.toFixed(2), defaultValue: 0.5 },
          ...state.rack.returns.map((r) => ({
            id: `@send:${r.returnId}`, name: `Send — ${r.name}`, group: 'Mixer',
            value: (part.sends.find((s) => s.returnId === r.returnId)?.level ?? 0) / 2,
            text: (part.sends.find((s) => s.returnId === r.returnId)?.level ?? 0).toFixed(2),
            defaultValue: 0,
          })),
        ];
        hostParameters.set(normalizeHostParameters({ partId: payload.partId,
                                                     parameters: [...base, ...mixer] }));
        return;
      }
      const effect = [...state.rack.masterEffects, ...state.rack.parts.flatMap((p) => p.effects),
                      ...state.rack.returns.flatMap((r) => r.effects)]
        .find((e) => e.effectId === payload.partId);
      hostParameters.set(effect?.hasProcessor
        ? normalizeHostParameters({ partId: payload.partId, parameters: [
            { id: 'wet', index: 0, name: 'Wet', value: 1, text: '1.00', defaultValue: 1 }] })
        : emptyHostParameters());
      return;
    }
    if (payload?.cmd === 'setParameter' || payload?.cmd === 'resetParameter') {
      hostParameters.update((registry) => {
        if (registry.partId !== payload.partId) return registry;
        return {
          ...registry,
          parameters: registry.parameters.map((d) => {
            if (d.id !== payload.id) return d;
            const value = payload.cmd === 'resetParameter'
              ? d.defaultValue
              : Math.min(1, Math.max(0, Number(payload.value ?? 0)));
            return { ...d, value, text: mockParamText(d, value) };
          }),
        };
      });
      // Virtual addresses write the rack itself; the demo mirrors the visible half.
      const id = String(payload.id ?? '');
      if (id === '@gain' || id === '@pan') {
        const value = Math.min(1, Math.max(0, Number(payload.value ?? 0)));
        hostState.set(applyMockCommand(get(hostState), {
          cmd: 'setPartMixer', partId: payload.partId,
          ...(id === '@gain' ? { volume: value * 2 } : { pan: value * 2 - 1 }),
        }));
      } else if (id.startsWith('@send:')) {
        const value = Math.min(1, Math.max(0, Number(payload.value ?? 0)));
        hostState.set(applyMockCommand(get(hostState), {
          cmd: 'setSendLevel', partId: payload.partId,
          returnId: id.slice(6), level: value * 2,
        }));
      }
      return;
    }
    if (payload?.cmd === 'beginParameterGesture' || payload?.cmd === 'endParameterGesture') return;
    if (payload?.cmd === 'getLibrary' || payload?.cmd === 'scanLibrary') {
      hostLibrary.set(mockHostLibrary(payload.query ?? '', payload.type ?? ''));
      return;
    }
    if (payload?.cmd === 'saveUserPreset' || payload?.cmd === 'saveRackToLibrary') {
      const isRack = payload.cmd === 'saveRackToLibrary';
      const part = get(hostState).rack.parts.find((p) => p.partId === payload.partId);
      hostLibrary.update((lib) => normalizeHostLibrary({
        ...lib,
        records: [...lib.records, {
          recordId: `lib-user-${Date.now()}`,
          type: isRack ? 'rack' : 'preset',
          sourceType: isRack ? 'rackCapture' : 'userState',
          name: payload.name || (isRack ? 'Rack capture' : `${part?.pluginName ?? 'Instrument'} preset`),
          instrument: part?.pluginName ?? '',
          available: true,
        }],
        counts: { ...lib.counts, total: lib.counts.total + 1 },
      }));
      return;
    }
    if (payload?.cmd === 'setLibraryUserMetadata') {
      hostLibrary.update((lib) => ({
        ...lib,
        records: lib.records.map((r) => r.recordId === payload.recordId
          ? { ...r,
              favourite: payload.favourite !== undefined ? payload.favourite === true : r.favourite,
              rating: payload.rating !== undefined ? Number(payload.rating) : r.rating,
              notes: payload.notes !== undefined ? String(payload.notes) : r.notes }
          : r),
      }));
      return;
    }
    if (payload?.cmd === 'removeLibraryRecord') {
      hostLibrary.update((lib) => ({
        ...lib,
        records: lib.records.filter((r) => r.recordId !== payload.recordId || r.factory),
      }));
      return;
    }
    if (payload?.cmd === 'loadLibraryRecord') {
      // Mirrors the visible half: an added part appears; a focused load leaves structure alone.
      const record = get(hostLibrary).records.find((r) => r.recordId === payload.recordId);
      if (!record?.available) return;
      if (record.type === 'preset' && payload.action === 'add') {
        const next = applyMockCommand(get(hostState), { cmd: 'addPart' });
        const added = next.rack.parts.at(-1);
        added.pluginName = record.name;
        added.pluginVendor = record.manufacturer;
        added.hasInstrument = true;
        hostState.set(next);
      }
      return;
    }
    if (payload?.cmd === 'addLibraryPath' || payload?.cmd === 'removeLibraryPath'
        || payload?.cmd === 'browseLibraryPath') return;
    if (payload?.cmd === 'setControlSlotValue') {
      // Mirror the native mapping far enough for the demo: drive the parameter view when the
      // bound part's registry is on screen.
      const page = get(hostState).rack.pages.find((p) => p.pageId === payload.pageId);
      const slot = page?.slots.find((s) => s.slotId === payload.slotId);
      if (!slot?.resolved) return;
      const raw = Math.min(1, Math.max(0, Number(payload.value ?? 0)));
      const positioned = slot.inverted ? 1 - raw : raw;
      const mapped = slot.rangeMin + positioned * (slot.rangeMax - slot.rangeMin);
      hostParameters.update((registry) => {
        if (registry.partId !== slot.partId) return registry;
        return {
          ...registry,
          parameters: registry.parameters.map((d) =>
            d.id === slot.parameterId ? { ...d, value: mapped, text: mockParamText(d, mapped) } : d),
        };
      });
      return;
    }
    hostState.set(applyMockCommand(get(hostState), payload));
    return;
  }
  sendInstrumentHostCommand(payload);
}

export const requestHostState = () => send({ cmd: 'getState' });
export const scanForInstruments = () => send({ cmd: 'scan' });
export const addScanPath = (path) => send({ cmd: 'addScanPath', path });
export const browseScanPath = () => send({ cmd: 'browseScanPath' });
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
export const requestParameters = (partId) => send({ cmd: 'getParameters', partId });
export const setParameter = (partId, id, value) => send({ cmd: 'setParameter', partId, id, value });
export const resetParameter = (partId, id) => send({ cmd: 'resetParameter', partId, id });
export const beginParameterGesture = (partId, id) => send({ cmd: 'beginParameterGesture', partId, id });
export const endParameterGesture = (partId, id) => send({ cmd: 'endParameterGesture', partId, id });
export const addEffect = (chainId, ceId) => send({ cmd: 'addEffect', chainId, ceId });
export const removeEffect = (effectId) => send({ cmd: 'removeEffect', effectId });
export const moveEffect = (effectId, index) => send({ cmd: 'moveEffect', effectId, index });
export const setEffectBypassed = (effectId, bypassed) => send({ cmd: 'setEffectBypassed', effectId, bypassed });
export const openEffectEditor = (effectId) => send({ cmd: 'openEffectEditor', effectId });
export const addReturn = (name) => send(name ? { cmd: 'addReturn', name } : { cmd: 'addReturn' });
export const removeReturn = (returnId) => send({ cmd: 'removeReturn', returnId });
export const renameReturn = (returnId, name) => send({ cmd: 'renameReturn', returnId, name });
export const setReturnLevel = (returnId, level) => send({ cmd: 'setReturnLevel', returnId, level });
export const setSendLevel = (partId, returnId, level) =>
  send({ cmd: 'setSendLevel', partId, returnId, level });
export const setExtraOut = (partId, pairIndex, gain) =>
  send({ cmd: 'setExtraOut', partId, pairIndex, gain });
export const removeExtraOut = (partId, pairIndex) => send({ cmd: 'removeExtraOut', partId, pairIndex });
export const setHardwareConfig = (partId, fields) => send({ cmd: 'setHardwareConfig', partId, ...fields });
export const clearHardware = (partId) => send({ cmd: 'clearHardware', partId });
export const sendHardwareProgram = (partId) => send({ cmd: 'sendHardwareProgram', partId });
export const addMacro = (name) => send(name ? { cmd: 'addMacro', name } : { cmd: 'addMacro' });
export const removeMacro = (macroId) => send({ cmd: 'removeMacro', macroId });
export const renameMacro = (macroId, name) => send({ cmd: 'renameMacro', macroId, name });
export const setMacroValue = (macroId, value, final = false) =>
  send({ cmd: 'setMacroValue', macroId, value, final });
export const addMacroTarget = (macroId, targetId, parameterId) =>
  send({ cmd: 'addMacroTarget', macroId, targetId, parameterId });
export const removeMacroTarget = (macroId, targetId, parameterId) =>
  send({ cmd: 'removeMacroTarget', macroId, targetId, parameterId });
export const addControlPage = (name) => send(name ? { cmd: 'addControlPage', name } : { cmd: 'addControlPage' });
export const generateControlPages = (partId) => send({ cmd: 'generateControlPages', partId });
export const removeControlPage = (pageId) => send({ cmd: 'removeControlPage', pageId });
export const renameControlPage = (pageId, name) => send({ cmd: 'renameControlPage', pageId, name });
export const assignControlSlot = (pageId, slotId, partId, parameterId) =>
  send({ cmd: 'assignControlSlot', pageId, slotId, partId, parameterId });
export const clearControlSlot = (pageId, slotId) => send({ cmd: 'clearControlSlot', pageId, slotId });
export const setControlSlotOptions = (pageId, slotId, fields) =>
  send({ cmd: 'setControlSlotOptions', pageId, slotId, ...fields });
export const setControlSlotValue = (pageId, slotId, value) =>
  send({ cmd: 'setControlSlotValue', pageId, slotId, value });
export const requestLibrary = (query = '', type = '') => send({ cmd: 'getLibrary', query, type });
export const scanLibrary = () => send({ cmd: 'scanLibrary' });
export const browseLibraryPath = () => send({ cmd: 'browseLibraryPath' });
export const removeLibraryPath = (path) => send({ cmd: 'removeLibraryPath', path });
export const saveUserPreset = (partId, name) => send({ cmd: 'saveUserPreset', partId, name });
export const saveRackToLibrary = (name) => send({ cmd: 'saveRackToLibrary', name });
export const setLibraryUserMetadata = (recordId, fields) =>
  send({ cmd: 'setLibraryUserMetadata', recordId, ...fields });
export const removeLibraryRecord = (recordId) => send({ cmd: 'removeLibraryRecord', recordId });
export const loadLibraryRecord = (recordId, action = 'focused', partId) =>
  send(partId ? { cmd: 'loadLibraryRecord', recordId, action, partId }
              : { cmd: 'loadLibraryRecord', recordId, action });
export const requestHostProject = () => send({ cmd: 'getHostProject' });
export const setHostProject = (fields) => send({ cmd: 'setHostProject', ...fields });
export const buildHostProduct = () => {
  hostBuild.set({ ...emptyHostBuild(), running: true });
  send({ cmd: 'buildHostProduct' });
};
