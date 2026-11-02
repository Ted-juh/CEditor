// componentSettings.js — the Settings tab of a custom component: its values, and the settings a
// panel can change on each copy. No Svelte, no stores: sections/CustomSettingsEditor.svelte draws
// what this works out and applies the patches it returns.
//
// The Settings tab replaced Publish when custom components were simplified to "import, change,
// choose what the panel may change, export". Publish was a Contract page of eight sections (inputs,
// outputs and editable properties each with its own Add / Selected / Remove editor, a Policy, the
// External links switches, an API preview, a Quality list, six Quick Publish recipes and a grid of
// suggestions) and a Package & Library page. Two things on it mattered to a component's author:
// which values a panel can use, and what a panel can change on a copy. Those are the two lists here.
//
// Values: every value is the panel's unless its author keeps it in (componentPanelValues.js).
// Settings: the editable properties, each one a field of the component a copy can set for itself.
// A setting starts as the component looks now: its default is the component's own value, kept in
// step when it is changed here and refreshed on export (refreshSettingDefaultsPatch), so the "has
// no package default value" warnings the Quality list raised cannot arise.

import { valueAtPath } from '../stores/controlTreeUtils.js';
import { capitalised, identifierWords } from './authorWords.js';
import { panelValuePatch, valueIsForPanel } from './componentPanelValues.js';

const EDITABLE = 'PublishedProperties.editableProperties';
const IMAGE_FIELDS = ['source', 'src', 'dataUrl', 'path'];

const words = (name) => identifierWords(name) || String(name ?? '');

function sectionsOf(control) {
  return control?._children ?? {};
}

function partsOf(control) {
  return sectionsOf(control).Parts?._children ?? {};
}

function partSections(part) {
  return part?._children ?? part ?? {};
}

/** Layers named the same but for a number (tick0 … tick10), three or more: not offered one by one. */
function numberedRunParts(names) {
  const runs = new Map();
  for (const name of names) {
    const match = /^(.*?)\d+$/.exec(name);
    if (match) runs.set(match[1], [...(runs.get(match[1]) ?? []), name]);
  }
  return new Set([...runs.values()].filter((run) => run.length >= 3).flat());
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value ?? '');
  return String(Math.round(number * 1000) / 1000);
}

// --- Values ------------------------------------------------------------------------------------

/** What a value is, in a few words: "0 to 1, starts at 0.5". */
export function valueSummary(channel) {
  const type = String(channel?.type ?? 'float').trim().toLowerCase();
  const start = channel?.defaultValue;
  if (['bool', 'boolean', 'toggle'].includes(type)) return `on or off, starts ${start === true ? 'on' : 'off'}`;
  if (['enum', 'choice', 'select'].includes(type)) {
    const count = Array.isArray(channel?.values) ? channel.values.length : 0;
    return `${count} choice${count === 1 ? '' : 's'}${start !== undefined && start !== '' ? `, starts at ${start}` : ''}`;
  }
  if (['text', 'string'].includes(type)) return 'text';
  if (['color', 'colour'].includes(type)) return 'a colour';
  if (['trigger', 'action'].includes(type)) return 'a trigger';
  const range = channel?.min !== undefined && channel?.max !== undefined
    ? `${formatNumber(channel.min)} to ${formatNumber(channel.max)}`
    : 'a number';
  return start !== undefined ? `${range}, starts at ${formatNumber(start)}` : range;
}

/** The component's values, as the Settings tab lists them. */
export function valueRows(control) {
  const published = sectionsOf(control).PublishedProperties ?? {};
  return Object.entries(sectionsOf(control).ValueChannels?._children ?? {})
    .filter(([, channel]) => channel && typeof channel === 'object')
    .map(([name, channel]) => {
      const publishedLabel = [published.inputs, published.outputs]
        .flatMap((map) => Object.entries(map ?? {}))
        .find(([entryName, entry]) => String(entry?.channel || entryName) === name)?.[1]?.label;
      return {
        name,
        label: String(publishedLabel || channel.label || capitalised(words(name))),
        summary: valueSummary(channel),
        forPanel: valueIsForPanel(control, name),
      };
    });
}

/** The switch: the panel can use this value, or only the component itself does. */
export function valueForPanelPatch(control, name, forPanel) {
  return panelValuePatch(control, name, forPanel);
}

// --- Settings ----------------------------------------------------------------------------------

/**
 * What a setting's path changes, for the line under its name and for the editor it gets.
 * `layer` is set when the setting is a layer's, so its colour can be edited in the Colors tool with
 * that layer selected.
 */
export function settingTarget(path) {
  const text = String(path ?? '').trim();
  let match;
  if ((match = /^Parts\.([^.]+)\.Text\.content$/.exec(text))) {
    return { kind: 'text', layer: match[1], what: `the text of “${match[1]}”` };
  }
  if ((match = /^Parts\.([^.]+)\.Background\.Fill\.colour$/.exec(text))) {
    return { kind: 'colour', layer: match[1], fill: true, what: `the fill of “${match[1]}”` };
  }
  if ((match = /^Parts\.([^.]+)\.Text\.Fill\.colour$/.exec(text))) {
    return { kind: 'colour', layer: match[1], what: `the text colour of “${match[1]}”` };
  }
  if ((match = /^Parts\.([^.]+)\.visible$/.exec(text))) {
    return { kind: 'bool', layer: match[1], what: `whether “${match[1]}” is shown` };
  }
  if ((match = /^Parts\.([^.]+)\.(?:Transform\.)?opacity$/.exec(text))) {
    return { kind: 'number', layer: match[1], what: `the opacity of “${match[1]}”` };
  }
  if ((match = /^Assets\.(?:filmstrips|images)\.([^.]+)\.[^.]+$/.exec(text))) {
    return { kind: 'image', asset: match[1], what: `the image of “${match[1]}”` };
  }
  const parts = text.split('.').filter(Boolean);
  return { kind: 'other', what: parts.length ? parts.map((part) => words(part)).join(' › ') : 'nothing yet' };
}

function editorKind(entry, target) {
  const type = String(entry?.type ?? '').trim().toLowerCase();
  if (['color', 'colour'].includes(type)) return 'colour';
  if (type === 'image') return 'image';
  if (['bool', 'boolean', 'toggle'].includes(type)) return 'bool';
  if (['float', 'int', 'integer', 'number', 'note'].includes(type)) return 'number';
  if (['enum', 'choice', 'select'].includes(type) && Array.isArray(entry?.values) && entry.values.length) return 'choice';
  if (target.kind !== 'other') return target.kind;
  return 'text';
}

/** The settings a panel can change on a copy, in their order, with the value each has now. */
export function settingRows(control) {
  const editable = sectionsOf(control).PublishedProperties?.editableProperties ?? {};
  return Object.entries(editable)
    .filter(([, entry]) => entry && entry.enabled !== false)
    .map(([name, entry]) => {
      const path = String(entry.path ?? '').trim();
      const target = settingTarget(path);
      const value = path ? valueAtPath(control, path) : undefined;
      return {
        name,
        label: String(entry.label || capitalised(words(name))),
        path,
        what: target.what,
        layer: target.layer ?? '',
        fill: target.fill === true,
        kind: editorKind(entry, target),
        values: Array.isArray(entry.values) ? entry.values : [],
        min: entry.min,
        max: entry.max,
        step: entry.step,
        value,
        missing: !!path && value === undefined,
      };
    });
}

/** Change a setting: the component's own field, and the default a copy starts from, together. */
export function settingValuePatch(control, name, value) {
  const entry = sectionsOf(control).PublishedProperties?.editableProperties?.[name];
  const path = String(entry?.path ?? '').trim();
  if (!path) return {};
  return { [path]: value, [`${EDITABLE}.${name}.defaultValue`]: value };
}

export function settingLabelPatch(name, label) {
  const text = String(label ?? '').trim();
  return text ? { [`${EDITABLE}.${name}.label`]: text } : {};
}

/** Remove a setting. Replaces the map, as dropEditablePropertiesWithMissingTargets does, so a
 *  saved component records the removal rather than reading the entry back from the type's defaults. */
export function removeSettingPatch(control, name) {
  const editable = sectionsOf(control).PublishedProperties?.editableProperties ?? {};
  return { [EDITABLE]: Object.fromEntries(Object.entries(editable).filter(([key]) => key !== name)) };
}

function uniqueKey(base, taken) {
  const clean = String(base ?? '').replace(/[^A-Za-z0-9_$]+/g, '_').replace(/^_+|_+$/g, '') || 'setting';
  if (!taken.has(clean)) return clean;
  let index = 2;
  while (taken.has(`${clean}${index}`)) index += 1;
  return `${clean}${index}`;
}

/**
 * The + Add a setting menu: the component's own layers and images, grouped by what an author would
 * change. `added` marks a path that is a setting already (switched on), and picking one switched
 * off switches it back on.
 */
export function settingOptions(control) {
  const editable = sectionsOf(control).PublishedProperties?.editableProperties ?? {};
  const onPaths = new Set(Object.values(editable)
    .filter((entry) => entry?.enabled !== false)
    .map((entry) => String(entry?.path ?? '').trim()));
  const parts = Object.entries(partsOf(control));
  const skip = numberedRunParts(parts.map(([name]) => name));
  const shown = parts.filter(([name]) => !skip.has(name));
  const item = (path, layerOrAsset, detail, label, type, key) => ({
    path, name: layerOrAsset, detail, label, type, key, added: onPaths.has(path),
  });

  const texts = [];
  const colours = [];
  const images = [];
  const visibility = [];
  for (const [name, part] of shown) {
    const sections = partSections(part);
    const title = capitalised(words(name));
    if (sections.Text) {
      texts.push(item(`Parts.${name}.Text.content`, name, 'its text',
        /label|text|title|caption/i.test(name) ? title : `${title} text`, 'text', `${name}Text`));
    }
    if (sections.Background && String(part?.kind ?? '') !== 'text') {
      colours.push(item(`Parts.${name}.Background.Fill.colour`, name, 'fill', `${title} colour`, 'color', `${name}Colour`));
    }
    if (sections.Text) {
      colours.push(item(`Parts.${name}.Text.Fill.colour`, name, 'text colour', `${title} text colour`, 'color', `${name}TextColour`));
    }
    visibility.push(item(`Parts.${name}.visible`, name, 'whether it is shown', `Show the ${words(name)}`, 'bool', `show${capitalised(name)}`));
  }
  const assets = sectionsOf(control).Assets ?? {};
  for (const kind of ['filmstrips', 'images']) {
    for (const [name, asset] of Object.entries(assets[kind] ?? {})) {
      const field = IMAGE_FIELDS.find((key) => asset && Object.prototype.hasOwnProperty.call(asset, key)) ?? 'source';
      images.push(item(`Assets.${kind}.${name}.${field}`, name, kind === 'filmstrips' ? 'filmstrip' : 'image',
        capitalised(words(name)), 'image', `${name}Image`));
    }
  }
  return [
    { group: 'Texts', items: texts },
    { group: 'Colours', items: colours },
    { group: 'Images', items: images },
    { group: 'Show / hide', items: visibility },
  ].filter((group) => group.items.length);
}

/**
 * Add a setting from the menu. It starts at what the component shows now. A path that is a setting
 * switched off is switched back on rather than added twice. Returns `{ name, patch }`.
 */
export function addSettingPatch(control, option) {
  const editable = sectionsOf(control).PublishedProperties?.editableProperties ?? {};
  const path = String(option?.path ?? '').trim();
  if (!path) return { name: '', patch: {} };
  const existing = Object.entries(editable).find(([, entry]) => String(entry?.path ?? '').trim() === path);
  if (existing) {
    const [name, entry] = existing;
    return entry?.enabled === false ? { name, patch: { [`${EDITABLE}.${name}.enabled`]: true } } : { name, patch: {} };
  }
  const name = uniqueKey(option.key, new Set(Object.keys(editable)));
  const entry = { path, label: String(option.label || capitalised(words(name))), type: String(option.type || 'text'), enabled: true };
  const target = settingTarget(path);
  if (target.layer) entry.part = target.layer;
  const value = valueAtPath(control, path);
  if (value !== undefined) entry.defaultValue = value;
  return { name, patch: { [`${EDITABLE}.${name}`]: entry } };
}

/**
 * On export: every setting's default becomes what the component shows, so a copy placed from the
 * library starts as the author left it however the author changed it (on the layer, in Settings,
 * by undo).
 */
export function refreshSettingDefaultsPatch(control) {
  const patch = {};
  for (const row of settingRows(control)) {
    if (!row.path || row.value === undefined) continue;
    const entry = sectionsOf(control).PublishedProperties.editableProperties[row.name];
    if (JSON.stringify(entry?.defaultValue) === JSON.stringify(row.value)) continue;
    patch[`${EDITABLE}.${row.name}.defaultValue`] = row.value;
  }
  return patch;
}
