export const PERFORMANCE_GROUPS = [
  { id: 'playback', label: 'Patterns & playback', tools: [
    { id: 'patterns', label: 'Patterns' }, { id: 'clips', label: 'Clips & scenes' }, { id: 'arranger', label: 'Arrange' },
  ] },
  { id: 'capture', label: 'Capture', tools: [
    { id: 'looper', label: 'Looper' }, { id: 'gestures', label: 'Gestures' }, { id: 'recorder', label: 'Recorder' },
  ] },
  { id: 'modulation', label: 'Modulation', tools: [
    { id: 'modulation', label: 'Matrix' }, { id: 'lfos', label: 'MIDI LFOs' },
    { id: 'envelopes', label: 'Envelopes' }, { id: 'msegs', label: 'MSEG' }, { id: 'random', label: 'Random' },
  ] },
  { id: 'setup', label: 'Live setup', tools: [
    { id: 'setlist', label: 'Setlist' }, { id: 'tuning', label: 'Tuning' },
  ] },
];

const STORAGE_KEY = 'ceditor.instrumentHost.performanceNavigation.v1';
export const performanceGroupFor = (tool) =>
  PERFORMANCE_GROUPS.find(group => group.tools.some(item => item.id === tool)) ?? PERFORMANCE_GROUPS[0];

export function normalisePerformanceNavigation(value) {
  const input = value && typeof value === 'object' ? value : {};
  const lastTools = Object.fromEntries(PERFORMANCE_GROUPS.map(group => [group.id,
    group.tools.some(tool => tool.id === input.lastTools?.[group.id]) ? input.lastTools[group.id] : group.tools[0].id,
  ]));
  const group = performanceGroupFor(input.tab);
  const tab = group.tools.some(tool => tool.id === input.tab) ? input.tab : 'patterns';
  lastTools[performanceGroupFor(tab).id] = tab;
  return { tab, lastTools };
}

export function selectPerformanceTool(value, tool) {
  const state = normalisePerformanceNavigation(value);
  if (!PERFORMANCE_GROUPS.some(group => group.tools.some(item => item.id === tool))) return state;
  return { tab: tool, lastTools: { ...state.lastTools, [performanceGroupFor(tool).id]: tool } };
}

export function restorePerformanceNavigation(storage) {
  try {
    return normalisePerformanceNavigation(JSON.parse((storage ?? globalThis.localStorage)?.getItem(STORAGE_KEY) ?? '{}'));
  } catch { return normalisePerformanceNavigation(); }
}

export function storePerformanceNavigation(value, storage) {
  try {
    (storage ?? globalThis.localStorage)?.setItem(STORAGE_KEY, JSON.stringify(normalisePerformanceNavigation(value)));
  } catch { /* Navigation still works if preferences cannot be saved. */ }
}
