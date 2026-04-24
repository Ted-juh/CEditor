const BASE_STATE_TARGET = '__base__';

const KNOWN_STATE_META = {
  hover: { shortLabel: 'H', order: 10, title: 'Hover' },
  pressed: { shortLabel: 'P', order: 20, title: 'Pressed' },
  focused: { shortLabel: 'F', order: 30, title: 'Focused' },
  disabled: { shortLabel: 'D', order: 40, title: 'Disabled' },
  dragging: { shortLabel: 'G', order: 50, title: 'Dragging' },
  checked: { shortLabel: 'C', order: 60, title: 'Checked' },
  mixed: { shortLabel: 'M', order: 70, title: 'Mixed' },
};

export const STATE_SCOPABLE_TABS = new Set(['transform', 'background', 'border', 'text', 'icon', 'effects', 'contentlayout', 'segments']);
export { BASE_STATE_TARGET };

export function isStateScopableTabId(tabId = '') {
  return STATE_SCOPABLE_TABS.has(String(tabId ?? '').trim().toLowerCase());
}

function normalizeStateKey(value) {
  return String(value ?? '').trim().toLowerCase();
}

function countStatePartOverrides(parts = {}) {
  let count = 0;
  for (const patchMap of Object.values(parts ?? {})) {
    count += Object.keys(patchMap ?? {}).length;
  }
  return count;
}

function countLeafEntries(node) {
  if (!node || typeof node !== 'object') return 0;

  let count = 0;
  for (const value of Object.values(node)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      count += countLeafEntries(value);
      continue;
    }
    if (value !== undefined) count += 1;
  }
  return count;
}

function appendLeafPaths(node, prefix, entries, limit) {
  if (!node || typeof node !== 'object') return;

  for (const [key, value] of Object.entries(node)) {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      appendLeafPaths(value, nextPrefix, entries, limit);
      if (entries.length >= limit) return;
      continue;
    }
    if (value === undefined) continue;
    entries.push(nextPrefix);
    if (entries.length >= limit) return;
  }
}

export function stateHasOverrides(state) {
  if (!state) return false;
  const componentCount = Object.keys(state?.patches?.component ?? {}).length;
  const partsCount = countStatePartOverrides(state?.patches?.parts);
  const segmentsCount = countLeafEntries(state?.patches?.segments);
  return componentCount + partsCount + segmentsCount > 0;
}

export function summarizeStateOverrides(state, { limit = 6 } = {}) {
  const entries = [];

  for (const path of Object.keys(state?.patches?.component ?? {})) {
    entries.push(path);
    if (entries.length >= limit) return entries;
  }

  for (const [partName, patchMap] of Object.entries(state?.patches?.parts ?? {})) {
    for (const path of Object.keys(patchMap ?? {})) {
      entries.push(`Parts.${partName}.${path}`);
      if (entries.length >= limit) return entries;
    }
  }

  appendLeafPaths(state?.patches?.segments, 'Segments', entries, limit);

  return entries;
}

function defaultShortLabel(name) {
  const cleaned = String(name ?? '').replace(/[^A-Za-z0-9]+/g, ' ').trim();
  if (!cleaned) return 'S';

  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }

  return cleaned.slice(0, 1).toUpperCase();
}

function makeUniqueShortLabel(preferred, fallbackName, usedLabels) {
  const basePreferred = String(preferred ?? '').trim().toUpperCase() || defaultShortLabel(fallbackName);
  if (!usedLabels.has(basePreferred)) {
    usedLabels.add(basePreferred);
    return basePreferred;
  }

  const compact = String(fallbackName ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  for (let length = 2; length <= Math.min(compact.length, 3); length += 1) {
    const candidate = compact.slice(0, length);
    if (candidate && !usedLabels.has(candidate)) {
      usedLabels.add(candidate);
      return candidate;
    }
  }

  let suffix = 2;
  while (usedLabels.has(`${basePreferred}${suffix}`)) {
    suffix += 1;
  }

  const candidate = `${basePreferred}${suffix}`;
  usedLabels.add(candidate);
  return candidate;
}

export function buildStateTargetOptions(statesSection, { includeBase = true } = {}) {
  const stateEntries = Object.entries(statesSection?._children ?? {});
  const priority = Array.isArray(statesSection?.priority)
    ? statesSection.priority.map(normalizeStateKey)
    : [];
  const usedLabels = new Set(includeBase ? ['B'] : []);

  const items = stateEntries
    .map(([stateName, state], index) => {
      const normalized = normalizeStateKey(stateName || state?.name);
      const known = KNOWN_STATE_META[normalized];
      const preferredOrder = priority.indexOf(normalized);
      const order = known
        ? known.order
        : preferredOrder === -1
          ? 500 + (index / 100)
          : 200 + preferredOrder;
      const fullLabel = String(state?.name ?? stateName ?? 'State');
      const shortLabel = makeUniqueShortLabel(known?.shortLabel, fullLabel, usedLabels);

      return {
        id: stateName,
        shortLabel,
        fullLabel,
        tooltip: `${shortLabel} ${known?.title ?? fullLabel}`,
        hasOverrides: stateHasOverrides(state),
        enabled: state?.enabled !== false,
        order,
      };
    })
    .sort((left, right) => left.order - right.order || left.fullLabel.localeCompare(right.fullLabel));

  if (!includeBase) return items;

  return [
    {
      id: BASE_STATE_TARGET,
      shortLabel: 'B',
      fullLabel: 'Base',
      tooltip: 'B Base',
      hasOverrides: false,
      enabled: true,
      order: -1,
    },
    ...items,
  ];
}

export function findStateTargetOption(options = [], targetId = BASE_STATE_TARGET) {
  return options.find((option) => option.id === targetId)
    ?? options.find((option) => option.id === BASE_STATE_TARGET)
    ?? null;
}

export function resolveSelectedStateName(
  options = [],
  selectedStateName = '',
  activeStateTarget = BASE_STATE_TARGET,
) {
  if (!Array.isArray(options) || options.length === 0) return '';

  if (options.some((option) => option.id === activeStateTarget)) {
    return activeStateTarget;
  }

  if (options.some((option) => option.id === selectedStateName)) {
    return selectedStateName;
  }

  return options[0]?.id ?? '';
}
