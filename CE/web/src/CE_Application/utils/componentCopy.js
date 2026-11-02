// componentCopy.js — the Component tab of a custom component placed on a panel: where the copy
// came from, whether the library has a newer version and what changed in it, its values and its
// settings. No Svelte, no stores: sections/CustomComponentTab.svelte draws it.
//
// Step 3 of simplifying custom components. A placed copy's tab was "Properties": a Public API card
// (the contract's name, "5 public items", counts of inputs, outputs and props), Open Designer and
// Open Settings, the Source card with its fingerprint, Published Inputs, Editable Properties (an
// image as a text field of its data URL) and a list of Published Outputs. What a panel author
// needs from it: which component this is and whether there is a newer one, and the value and
// settings of this copy. The rest went under More, or went.

import { valueAtPath } from '../stores/controlTreeUtils.js';
import { capitalised, identifierWords } from './authorWords.js';
import { panelValueEntries } from './componentPanelValues.js';
import { settingRows } from './componentSettings.js';
import { compareVersions, diffCustomComponentAgainstSource } from './customComponentSourceLink.js';
import { isMidiControlBinding, midiControlLabel } from './midiControlBindings.js';

const sectionsOf = (control) => control?._children ?? {};

function hasDefault(entry) {
  return !!entry && Object.prototype.hasOwnProperty.call(entry, 'defaultValue');
}

function same(left, right) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

/**
 * Where the copy came from and how it stands against the library.
 *
 * `state`: 'library' (linked, up to date), 'edited' (linked, changed on this copy), 'update' (a
 * newer version, nothing of the copy's own to lose), 'diverged' (a newer version, and changes of
 * the copy's own an update would replace), 'missing' (linked to a package the library no longer
 * has), 'local' (made on this panel, never exported). `newer` lists each version past the copy's,
 * newest first, with the "What changed" typed when it was exported.
 */
export function copyStanding(control, libraryEntries = []) {
  const sections = sectionsOf(control);
  const designer = sections.Designer ?? {};
  const source = designer.sourcePackage ?? null;
  const name = String(source?.name || designer.packageName || sections.Core?.name || 'Custom Component');
  const report = diffCustomComponentAgainstSource(control, libraryEntries ?? []);
  const linked = report.status !== 'unlinked';
  const version = String(source?.version || designer.packageVersion || '');
  const state = !linked ? 'local'
    : report.status === 'current' ? 'library'
      : report.status;
  const newer = ['update', 'diverged'].includes(report.status)
    ? (report.versions ?? [])
      .filter((entry) => compareVersions(entry?.version, version) > 0)
      .map((entry) => ({
        version: String(entry.version),
        changes: String(entry.envelope?.metadata?.changes ?? entry.changes ?? '').trim(),
      }))
    : [];
  let line;
  if (state === 'local') line = 'made on this panel · not in your library';
  else if (state === 'missing') line = `version ${version} · no longer in your library`;
  else line = `version ${version} · from your library`;
  return { name, version, linked, state, line, report, newer, latest: report.latest ?? null };
}

/** What a binding on the Device tab is called, in a word: the synth parameter, or the MIDI message. */
export function bindingLabel(binding) {
  if (!binding) return '';
  if (binding.kind === 'deviceParameter' && binding.parameterId) return String(binding.parameterId);
  if (isMidiControlBinding(binding)) return midiControlLabel(binding);
  return 'Bound';
}

function bindingFor(control, channel) {
  const deviceBindings = sectionsOf(control).DeviceBindings;
  if (deviceBindings?.enabled === false) return null;
  const bindings = Array.isArray(deviceBindings?.bindings) ? deviceBindings.bindings : [];
  return bindings.find((binding) => String(binding?.port ?? '') === channel
    && (binding.parameterId || isMidiControlBinding(binding) || binding.kind === 'oscControl')) ?? null;
}

function channelValue(channel) {
  if (channel?.currentValue !== undefined) return channel.currentValue;
  return channel?.defaultValue;
}

/**
 * The copy's values: every value the panel can drive into it (componentPanelValues.js), with the
 * value it starts at on this panel and what it is bound to on the Device tab, if anything.
 *
 * What a value resets to: its published default, else the library's own start for it (`library`,
 * the component the copy came from), else nothing. Not the channel's defaultValue: setting a value
 * here writes that, so it would always "reset" to itself.
 */
export function copyValueRows(control, library = null) {
  const channels = sectionsOf(control).ValueChannels?._children ?? {};
  const published = sectionsOf(control).PublishedProperties?.inputs ?? {};
  const libraryChannels = library?._children?.ValueChannels?._children ?? {};
  return panelValueEntries(control, 'input')
    .map(([name, entry]) => {
      const channelName = String(entry?.channel || name);
      const channel = channels[channelName];
      if (!channel) return null;
      const binding = bindingFor(control, channelName);
      const value = channelValue(channel);
      const publishedEntry = published[name];
      const start = hasDefault(publishedEntry) ? publishedEntry.defaultValue
        : hasDefault(libraryChannels[channelName]) ? libraryChannels[channelName].defaultValue
          : undefined;
      return {
        name: channelName,
        label: String(entry?.label || channel.label || capitalised(identifierWords(channelName))),
        type: String(entry?.type ?? channel.type ?? 'float').trim().toLowerCase(),
        value,
        min: entry?.min ?? channel.min,
        max: entry?.max ?? channel.max,
        step: entry?.step ?? channel.step,
        values: Array.isArray(entry?.values) && entry.values.length ? entry.values : (Array.isArray(channel.values) ? channel.values : []),
        bound: bindingLabel(binding),
        resetTo: start,
        customized: start !== undefined && !same(value, start),
      };
    })
    .filter(Boolean);
}

/** Parse what was typed into a value's field as its type wants it. */
export function parseCopyValue(raw, type, fallback) {
  const kind = String(type ?? 'float').trim().toLowerCase();
  if (['bool', 'boolean', 'toggle'].includes(kind)) return raw === true || raw === 'true' || raw === '1';
  if (['int', 'integer', 'note'].includes(kind)) {
    const number = Math.round(Number(raw));
    return Number.isFinite(number) ? number : fallback;
  }
  if (['float', 'number', 'normalized', 'bipolar'].includes(kind)) {
    const number = Number(raw);
    return Number.isFinite(number) ? number : fallback;
  }
  return String(raw ?? '');
}

/** Set a value on this copy: where it starts, and where it is now. */
export function copyValuePatch(name, value) {
  return {
    [`ValueChannels.${name}.defaultValue`]: value,
    [`ValueChannels.${name}.currentValue`]: value,
  };
}

/** The copy's settings, each with what the component started it at, to reset to. */
export function copySettingRows(control) {
  const editable = sectionsOf(control).PublishedProperties?.editableProperties ?? {};
  return settingRows(control).map((row) => {
    const entry = editable[row.name];
    return {
      ...row,
      resetTo: hasDefault(entry) ? entry.defaultValue : undefined,
      customized: hasDefault(entry) && !same(row.value, entry.defaultValue),
    };
  });
}

/** More › Reset settings: every value and setting of this copy back to where the component starts. */
export function resetCopyPatch(control, library = null) {
  const patch = {};
  for (const row of copyValueRows(control, library)) {
    if (row.customized) Object.assign(patch, copyValuePatch(row.name, row.resetTo));
  }
  for (const row of copySettingRows(control)) {
    if (row.customized && row.path) patch[row.path] = row.resetTo;
  }
  return patch;
}

/** The library's differences from this copy, for More: `what · this copy → library`. */
export function copyDifferences(report) {
  return (report?.design ?? []).map((row) => ({
    path: row.path,
    what: String(row.path ?? '').split('.').slice(1).filter((part) => part !== '_children').join(' › ') || row.label,
    here: row.instance,
    library: row.source,
    origin: row.origin,
  }));
}

/** The image a setting shows, when it is one a browser can draw. */
export function imageSource(value) {
  return /^(data:|https?:|file:|blob:)/.test(String(value ?? '')) ? String(value) : '';
}

export { valueAtPath };
