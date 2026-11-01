// componentExport.js — what the Export window says about a custom component: the name and version
// it suggests, the few checks that matter, and the file name. Step 1 of making custom components
// "import, change, choose what the panel may change, export".
//
// Exporting used to be "Save local package" on Publish › Package & Library, after a contract page of
// eight sections and three overlapping systems of checks (package validation, an eight-step readiness
// score, a contract status) that blocked nothing. These are the checks that say whether the
// component will work on a panel, and none of them stops the export either.

import { getCustomBehaviors, getCustomValueChannels } from './customComponentInteraction.js';
import { materializedCustomComponentSnapshot } from './customComponentMaterializer.js';
import { editablePropertiesWithMissingTargets } from './customComponentPackage.js';
import { compareVersions, nextPackageVersion } from './customComponentSourceLink.js';
import { identifierWords } from './authorWords.js';

const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** The name a component is exported under: its package's, or its own when it has none yet. */
export function componentExportName(control) {
  const designer = control?._children?.Designer ?? {};
  const core = control?._children?.Core ?? {};
  return String(designer.packageName || core.name || 'Custom Component').trim() || 'Custom Component';
}

/**
 * The version to suggest: the next one after what the library holds under this name (1.2.0 →
 * 1.3.0), or the component's own when the library has none of that name (1.0.0 for a new one).
 * `was` is the newest version already there, for the window to say what it follows.
 */
export function componentExportVersion(control, libraryEntries = [], name = componentExportName(control)) {
  const key = String(name ?? '').trim().toLowerCase();
  const family = (libraryEntries ?? []).filter((entry) => String(entry?.name ?? '').trim().toLowerCase() === key);
  if (family.length === 0) {
    return { version: String(control?._children?.Designer?.packageVersion || '1.0.0'), was: null };
  }
  const newest = [...family].sort((a, b) => compareVersions(b?.version, a?.version))[0]?.version ?? null;
  return { version: nextPackageVersion(family), was: newest };
}

/** `Filmstrip Knob-1.1.0.ceditor-component.json`: what the library's own Package file is called. */
export function componentExportFileName(name, version) {
  const safe = (text, fallback) => String(text ?? '').trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ') || fallback;
  return `${safe(name, 'Custom Component')}-${safe(version, '1.0.0')}.ceditor-component.json`;
}

function channelWords(name, channel) {
  return String(channel?.label || identifierWords(name) || name);
}

/**
 * The checks the Export window shows: `{ level: 'ok' | 'warn' | 'note', text, fix? }`. A warning
 * says something will not work as the author probably means; none of them blocks the export.
 *
 * 1. It draws something.
 * 2. Its values can be changed on the panel: some hit zone (drawn, or made by a generator) drives
 *    them. With none, a display is right and a knob or button is not, so it is a warning that says
 *    which is which.
 * 3. Every setting the panel can change (an editable property) points at something that exists.
 */
export function componentExportChecks(control) {
  const checks = [];
  if (!control?._children) return [{ level: 'warn', text: 'There is no component to export.' }];
  const snapshot = materializedCustomComponentSnapshot(control);

  const parts = Object.keys(snapshot?._children?.Parts?._children ?? {}).length;
  checks.push(parts > 0
    ? { level: 'ok', text: `It draws something: ${plural(parts, 'layer')}.` }
    : { level: 'warn', text: 'It draws nothing yet: a panel would show an empty frame.' });

  // Both getters give the section's children keyed by name.
  const channels = Object.entries(getCustomValueChannels(control) ?? {}).filter(([, channel]) => channel?.enabled !== false);
  if (channels.length === 0) {
    checks.push({ level: 'note', text: 'It has no value: a panel can place it and change its settings, but nothing binds to it.' });
  } else {
    const behaviors = getCustomBehaviors(control) ?? {};
    const zones = Object.entries(snapshot?._children?.HitZones?._children ?? {}).filter(([, zone]) => zone?.enabled !== false);
    if (zones.length === 0) {
      const names = channels.map(([name, channel]) => channelWords(name, channel));
      checks.push({
        level: 'warn',
        text: `Nothing on the panel can change ${names.length === 1 ? names[0] : 'its values'}: it has no hit zone. `
          + 'Right for a display, which follows its synth parameter; a knob or a button needs one (the Hit Zone tool, H).',
      });
    } else {
      const [zoneName, zone] = zones[0];
      const behavior = behaviors[zone?.targetBehavior];
      const channelName = zone?.targetValueChannel || behavior?.valueChannel || zone?.targetValueChannelX || '';
      const channel = channels.find(([name]) => name === channelName)?.[1];
      const more = zones.length > 1 ? ` (and ${plural(zones.length - 1, 'more hit zone')})` : '';
      checks.push({
        level: 'ok',
        text: channelName
          ? `Its value can be changed: ${zoneName} drives ${channelWords(channelName, channel)}${more}.`
          : `It has ${plural(zones.length, 'hit zone')} to change it with.`,
      });
    }
  }

  const editable = Object.entries(control._children.PublishedProperties?.editableProperties ?? {})
    .filter(([, entry]) => entry?.enabled !== false);
  const missing = editablePropertiesWithMissingTargets(control);
  if (missing.length) {
    checks.push({
      level: 'warn',
      text: `${missing.length === 1 ? `The setting “${missing[0]}” points` : `${missing.length} settings (${missing.map((name) => `“${name}”`).join(', ')}) point`} `
        + 'at something that no longer exists, so a panel would show a field that does nothing.',
      fix: 'drop-missing-settings',
    });
  } else if (editable.length) {
    checks.push({ level: 'ok', text: `${editable.length === 1 ? 'Its one setting points' : `All ${editable.length} settings point`} at something that exists.` });
  } else {
    checks.push({ level: 'note', text: 'It has no settings: a panel can change its value, and nothing about its look.' });
  }
  return checks;
}
