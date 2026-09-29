// One rail, grouped: the show first (the songs, the launcher that plays their scenes), then
// what the songs are made of. Tool ids are stable; only labels and grouping are the page's.
export const PERFORMANCE_GROUPS = [
  { id: 'show', label: 'Show', tools: [
    { id: 'setlist', label: 'Songs' }, { id: 'clips', label: 'Launcher' }, { id: 'arranger', label: 'Arrange' },
  ] },
  { id: 'patterns', label: 'Patterns', tools: [
    { id: 'patterns', label: 'Patterns' },
  ] },
  { id: 'capture', label: 'Capture', tools: [
    { id: 'looper', label: 'Looper' }, { id: 'gestures', label: 'Gestures' }, { id: 'recorder', label: 'Recorder' },
  ] },
  { id: 'modulation', label: 'Modulation', tools: [
    { id: 'modulation', label: 'Matrix' }, { id: 'lfos', label: 'MIDI LFOs' },
    { id: 'envelopes', label: 'Envelopes' }, { id: 'msegs', label: 'MSEG' }, { id: 'random', label: 'Random' },
  ] },
  { id: 'setup', label: 'Setup', tools: [
    { id: 'tuning', label: 'Tuning' },
  ] },
];

export const DEFAULT_PERFORMANCE_TOOL = 'setlist';

const STORAGE_KEY = 'ceditor.instrumentHost.performanceNavigation.v2';
export const performanceGroupFor = (tool) =>
  PERFORMANCE_GROUPS.find(group => group.tools.some(item => item.id === tool)) ?? PERFORMANCE_GROUPS[0];

export function normalisePerformanceNavigation(value) {
  const input = value && typeof value === 'object' ? value : {};
  const lastTools = Object.fromEntries(PERFORMANCE_GROUPS.map(group => [group.id,
    group.tools.some(tool => tool.id === input.lastTools?.[group.id]) ? input.lastTools[group.id] : group.tools[0].id,
  ]));
  const group = performanceGroupFor(input.tab);
  const tab = group.tools.some(tool => tool.id === input.tab) ? input.tab : DEFAULT_PERFORMANCE_TOOL;
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
