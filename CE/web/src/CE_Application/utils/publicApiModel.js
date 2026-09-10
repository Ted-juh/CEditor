/**
 * publicApiModel.js — the pure half of the API tab.
 *
 * No Svelte, no DOM: the contract read out of `PublishedProperties` as one list of rows, and the
 * question "will a consumer actually see this row?" answered once. `docs/design/api-tab-design.md`
 * has the argument.
 *
 * THE CONTRACT IS ALREADY A TABLE, AND IT IS ALREADY LISTED. `CustomPublishedPropertiesEditor`'s
 * API Preview draws every enabled entry in three read-only lanes; the sections that EDIT them show
 * one entry at a time behind a `<select>`. Measured: growing a contract from 8 entries to 50 leaves
 * Published Inputs at 198px, Published Outputs at 198px and Editable Properties at 256px — not one
 * pixel, because the height does not depend on the contract. The list exists. It is just not the
 * thing you can edit.
 *
 * "WILL A CONSUMER SEE THIS?" HAS THREE ANSWERS IN THE APPLICATION AND THEY DISAGREE. Measured:
 *
 *   path `Parts.background.Background.Fill.nonsenseKey`
 *     customComponentPackage.editablePropertyPathIssue  → no issue (it checks the FIRST segment)
 *     CustomPublishedPropertiesEditor (the author)      → fine (it checks only for empty)
 *     CustomPublicPropertiesEditor (the consumer)       → filtered out of the instance's panel
 *
 * The author is the only person who can fix it and the only one not told. `rowIssue()` gives the
 * author the consumer's answer, which is the one that decides whether the property exists.
 */
import { valueAtPath } from '../stores/controlTreeUtils.js';

/** kind → the map on `PublishedProperties` that holds it. */
export const API_MAP_BY_KIND = { input: 'inputs', output: 'outputs', property: 'editableProperties' };

export const API_KINDS = Object.keys(API_MAP_BY_KIND);

/** How each kind reads on screen, and which way the value flows. */
export const API_KIND_META = {
  input: { label: 'Input', arrow: '→', one: 'input', many: 'inputs', targetField: 'channel', targetLabel: 'Channel' },
  output: { label: 'Output', arrow: '←', one: 'output', many: 'outputs', targetField: 'channel', targetLabel: 'Channel' },
  property: { label: 'Property', arrow: '·', one: 'property', many: 'properties', targetField: 'path', targetLabel: 'Path' },
};

/** Mirrored from `CustomPublishedPropertiesEditor`, which is where the vocabulary lives today. */
export const API_TYPES = ['float', 'int', 'bool', 'enum', 'note', 'color', 'text', 'image'];
export const NUMERIC_API_TYPES = new Set(['float', 'int', 'note']);

export const isNumericApiType = (type) => NUMERIC_API_TYPES.has(String(type ?? '').trim().toLowerCase());
export const isEnumApiType = (type) => String(type ?? '').trim().toLowerCase() === 'enum';

/** The dotted path for one field of one entry, matching what the shipped editor writes. */
export function entryPath(kind, name, field = '') {
  const map = API_MAP_BY_KIND[kind];
  if (!map || !name) return '';
  return field ? `PublishedProperties.${map}.${name}.${field}` : `PublishedProperties.${map}.${name}`;
}

export function rowKey(kind, name) {
  return API_MAP_BY_KIND[kind] && name ? `${kind}:${name}` : '';
}

export function parseRowKey(key) {
  const text = String(key ?? '');
  const cut = text.indexOf(':');
  if (cut < 1) return null;
  const kind = text.slice(0, cut);
  const name = text.slice(cut + 1);
  return API_MAP_BY_KIND[kind] && name ? { kind, name } : null;
}

/**
 * What an entry points at.
 *
 * `variable` is here because the SHIPPED DEFAULT CONTRACT uses it — `accentColour` in
 * `createCustomComponentPublishedPropertiesDefaults` targets `variable: 'accentColour'` rather than
 * a channel. Nothing reads it: the consumer view tests `entry.channel` only, package validation does
 * not mention it, and the one other reference in the application is a focus helper. So every custom
 * component made from that factory ships with a published input no consumer will ever see, and the
 * tab has to be able to say so rather than pretend the field does not exist.
 */
export function targetOf(entry, kind) {
  if (kind === 'property') {
    return { field: 'path', value: String(entry?.path ?? '').trim() };
  }
  const channel = String(entry?.channel ?? '').trim();
  if (channel) return { field: 'channel', value: channel };
  const variable = String(entry?.variable ?? '').trim();
  if (variable) return { field: 'variable', value: variable };
  return { field: 'channel', value: '' };
}

/** Every entry of every kind, as one list. */
export function readContract(control) {
  const published = control?._children?.PublishedProperties ?? null;
  const rows = [];
  for (const kind of API_KINDS) {
    const map = published?.[API_MAP_BY_KIND[kind]] ?? {};
    for (const name of Object.keys(map)) {
      const entry = map[name];
      if (!entry || typeof entry !== 'object') continue;
      rows.push(describeRow(kind, name, entry));
    }
  }
  return rows;
}

export function describeRow(kind, name, entry) {
  const target = targetOf(entry, kind);
  return {
    key: rowKey(kind, name),
    kind,
    name,
    entry,
    label: String(entry?.label ?? name),
    enabled: entry?.enabled !== false,
    type: String(entry?.type ?? 'float').trim().toLowerCase() || 'float',
    target: target.value,
    targetField: target.field,
    min: entry?.min,
    max: entry?.max,
    step: entry?.step,
    defaultValue: entry?.defaultValue,
    values: Array.isArray(entry?.values) ? entry.values : [],
  };
}

// --- Will a consumer see this? ----------------------------------------------

/**
 * The consumer's answer, given to the author.
 *
 * `null` means the row reaches the instance panel. Anything else means it does not, and says why in
 * the terms the author can act on. A DISABLED row is not an issue — it is switched off on purpose.
 */
export function rowIssue(row, control) {
  if (!row) return null;
  if (!row.enabled) return null;
  const channels = control?._children?.ValueChannels?._children ?? {};

  if (row.kind === 'property') {
    if (!row.target) {
      return { status: 'noTarget', message: 'has no target path, so it is dropped from the instance panel' };
    }
    if (valueAtPath(control, row.target) === undefined) {
      // The check the author's own editor does not run and package validation only half runs: it
      // validates the FIRST segment of the path and passes anything after it.
      return {
        status: 'unresolvedPath',
        message: `targets "${row.target}", which does not resolve on this component — the instance panel drops it`,
      };
    }
    return null;
  }

  if (row.targetField === 'variable') {
    const rescue = channels[row.target] ? row.target : '';
    return {
      status: 'legacyVariable',
      message: `targets variable "${row.target}", which nothing reads — the instance panel drops it`,
      fix: rescue ? { field: 'channel', value: rescue } : null,
      fixLabel: rescue ? `target the "${rescue}" channel instead` : '',
    };
  }
  if (!row.target) {
    return { status: 'noTarget', message: 'has no channel, so it is dropped from the instance panel' };
  }
  if (!channels[row.target]) {
    return {
      status: 'missingChannel',
      message: `targets channel "${row.target}", which this component does not have — the instance panel drops it`,
    };
  }
  return null;
}

/** The contract with each row's answer attached. */
export function contractRows(control) {
  return readContract(control).map((row) => ({ ...row, issue: rowIssue(row, control) }));
}

/**
 * The package validator's messages, attached to the rows they are about.
 *
 * `validateCustomComponentPackage` already produces these and the author editor already shows them
 * — as a flat list of sentences you match to a row by reading the quoted name out of the prose.
 * Same messages, put where the row is. IMPORTED, not reimplemented: a second opinion about whether
 * a contract is exportable is the last thing this needs.
 */
export function attachValidation(rows, messages = []) {
  const byKey = new Map();
  for (const message of messages) {
    const text = String(message?.message ?? message ?? '');
    const name = text.match(/"([^"]+)"/)?.[1] ?? '';
    if (!name) continue;
    const kind = text.startsWith('Published input') ? 'input'
      : text.startsWith('Published output') ? 'output'
        : text.startsWith('Editable property') ? 'property' : '';
    if (!kind) continue;
    const key = rowKey(kind, name);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push({ severity: message?.severity ?? 'warning', message: text });
  }
  return rows.map((row) => ({ ...row, warnings: byKey.get(row.key) ?? [] }));
}

// --- The table --------------------------------------------------------------

/** The columns the table draws, and how each one sorts. */
// --- Making and unmaking an entry --------------------------------------------
// This tab edited the contract that existed, and adding or removing an entry stayed in the
// properties panel. That is a gap the moment the panel's rows come out, so the shapes live here —
// one definition of what a new entry is, rather than the panel's and the tab's drifting apart.

/** Entry names are object keys, so they have to be usable as a path segment. */
export function cleanEntryName(wanted) {
  return String(wanted ?? '').trim().replace(/[^A-Za-z0-9_]+/g, '');
}

/**
 * A name not already taken in that map, or '' when there is nothing usable.
 *
 * The panel's three Add functions all bail silently on a duplicate — `if (published?.inputs?[name])
 * return;` — which looks like a broken button. This suffixes instead.
 */
export function uniqueEntryName(existingNames, wanted, fallback = 'entry') {
  const base = cleanEntryName(wanted) || cleanEntryName(fallback) || 'entry';
  const taken = new Set((existingNames ?? []).map(String));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base}${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * A new entry, in the shape the shipped panel editor makes.
 *
 * An input and an output point at a value CHANNEL; a property points at a section PATH. `target` is
 * whichever of those the caller has, and the field it lands in comes from `API_KIND_META`.
 */
export function newEntryShape(kind, name, target = '', { label = '', type = '' } = {}) {
  const meta = API_KIND_META[kind];
  if (!meta) return null;
  const entry = {
    [meta.targetField]: String(target ?? ''),
    label: String(label || name || ''),
    type: String(type || (kind === 'property' ? 'text' : 'float')),
    enabled: true,
  };
  if (kind === 'property') entry.defaultValue = '';
  return entry;
}

export const API_COLUMNS = [
  { key: 'kind', label: 'Dir', width: 46, sort: (row) => API_KINDS.indexOf(row.kind) },
  { key: 'name', label: 'Name', width: 0, sort: (row) => row.name.toLowerCase() },
  { key: 'type', label: 'Type', width: 58, sort: (row) => row.type },
  { key: 'target', label: 'Target', width: 0, sort: (row) => row.target.toLowerCase() },
  { key: 'range', label: 'Range', width: 84, sort: (row) => (Number.isFinite(Number(row.min)) ? Number(row.min) : Infinity) },
  { key: 'defaultValue', label: 'Default', width: 66, sort: (row) => String(row.defaultValue ?? '') },
  { key: 'enabled', label: 'On', width: 34, sort: (row) => (row.enabled ? 0 : 1) },
];

/**
 * Sorted rows.
 *
 * Ties break on kind then name so the order is total: a sort that leaves equal rows in map-key
 * order would reshuffle the table whenever an unrelated entry was renamed.
 */
export function sortRows(rows, column = 'kind', direction = 'asc') {
  const spec = API_COLUMNS.find((entry) => entry.key === column) ?? API_COLUMNS[0];
  const sign = direction === 'desc' ? -1 : 1;
  return [...(rows ?? [])].sort((left, right) => {
    const a = spec.sort(left);
    const b = spec.sort(right);
    if (a < b) return -1 * sign;
    if (a > b) return 1 * sign;
    if (left.kind !== right.kind) return API_KINDS.indexOf(left.kind) - API_KINDS.indexOf(right.kind);
    return left.name.localeCompare(right.name);
  });
}

/** How the range column reads, or '' when the type has no range. */
export function rangeText(row) {
  if (!isNumericApiType(row?.type)) return isEnumApiType(row?.type) ? `${row?.values?.length ?? 0} values` : '';
  const min = row?.min;
  const max = row?.max;
  const has = (value) => value !== undefined && value !== null && value !== '' && Number.isFinite(Number(value));
  if (!has(min) && !has(max)) return '—';
  return `${has(min) ? Number(min) : '?'} … ${has(max) ? Number(max) : '?'}`;
}

export function contractCounts(rows) {
  const counts = { input: 0, output: 0, property: 0, enabled: 0, dropped: 0, total: 0 };
  for (const row of (rows ?? [])) {
    counts[row.kind] += 1;
    counts.total += 1;
    if (row.enabled) counts.enabled += 1;
    if (row.issue) counts.dropped += 1;
  }
  return counts;
}

/** The fields the settings column draws for one row, given its kind and type. */
export function rowFields(row) {
  if (!row) return [];
  const fields = [
    { key: 'label', label: 'Label', kind: 'text', hint: 'Friendly name shown to whoever uses this component.' },
  ];
  if (isNumericApiType(row.type)) {
    fields.push(
      { key: 'min', label: 'Min', kind: 'number', hint: 'Smallest value shown to users of this package.' },
      { key: 'max', label: 'Max', kind: 'number', hint: 'Largest value shown to users of this package.' },
      { key: 'step', label: 'Step', kind: 'number', hint: 'Increment used in normal properties.' },
      { key: 'defaultValue', label: 'Default', kind: 'number', hint: 'Reset value for this entry.' },
    );
  } else if (isEnumApiType(row.type)) {
    fields.push(
      { key: 'values', label: 'Values', kind: 'list', hint: 'Comma-separated public choices.' },
      { key: 'defaultValue', label: 'Default', kind: 'text', hint: 'Reset value for this entry.' },
    );
  } else if (String(row.type) === 'bool') {
    fields.push({ key: 'defaultValue', label: 'Default', kind: 'toggle', hint: 'Reset value for this entry.' });
  } else {
    fields.push({ key: 'defaultValue', label: 'Default', kind: 'text', hint: 'Reset value for this entry.' });
  }
  return fields;
}

/**
 * Every label this tab can edit.
 *
 * Same purpose as the other tabs' versions: the properties panel's search index is built from the
 * rows it draws, so the day these rows leave the panel the search has to be fed from here.
 */
export function allApiFieldLabels() {
  const labels = new Set(['Label', 'Type', 'Channel', 'Path', 'Enabled']);
  for (const column of API_COLUMNS) labels.add(column.label);
  for (const type of ['float', 'enum', 'bool', 'text']) {
    for (const field of rowFields({ type, kind: 'input' })) labels.add(field.label);
  }
  return [...labels];
}
