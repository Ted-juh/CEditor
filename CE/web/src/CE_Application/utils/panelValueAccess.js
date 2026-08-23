// panelValueAccess.js — reading and writing one exported parameter's live value.
//
// EVERY value feature needs the same two functions, and until now only the Player had them, inline
// and private. Snapshots, morph, Patch Diff and the Randomizer are all "read all the values / write
// all the values" over the same set, and four private copies of the read would be four chances to
// disagree about where a value lives.
//
// THREE PLACES A VALUE CAN LIVE, one per export door, and they are genuinely different:
//
//   sectionValues[Section][field]   a field on the component's OWN section — an Arp's rate, a
//                                   joystick's x. See utils/sectionValueOverrides.js.
//   customValues[leaf]              a CustomComponent value channel.
//   valueOverride / checked         the plain Behavior value, which is what most controls have.
//
// `collectExportParameters` already says which door a parameter goes through (`section`/`field` for
// the first, a non-'value' path leaf for the second, nothing for the third), so the routing here is
// a reading of the parameter rather than a guess about the control.

import { sectionValueOf, sectionValuePatch } from './sectionValueOverrides.js';

/** The leaf of a parameter's dotted path — 'value' for the ordinary Behavior case. */
export function parameterLeaf(parameter) {
  return String(parameter?.path ?? '').split('.').slice(1).join('.') || 'value';
}

/** Which door this parameter goes through: 'section' | 'channel' | 'behavior'. */
export function parameterDoor(parameter) {
  if (parameter?.section && parameter?.field) return 'section';
  return parameterLeaf(parameter) === 'value' ? 'behavior' : 'channel';
}

/**
 * The value a control currently holds, in the parameter's own units.
 *
 * `undefined` — never a fallback number — when the session has not been touched. A snapshot that
 * recorded 0 for every untouched control would recall a panel to zero rather than to where it was,
 * which is the difference between "capture" and "reset".
 */
export function readParameterValue(session, parameter) {
  if (!session || !parameter) return undefined;

  switch (parameterDoor(parameter)) {
    case 'section': {
      const raw = sectionValueOf(session.sectionValues, parameter.section, parameter.field);
      const n = Number(raw);
      return Number.isFinite(n) ? n : undefined;
    }
    case 'channel': {
      const n = Number(session.customValues?.[parameterLeaf(parameter)]);
      return Number.isFinite(n) ? n : undefined;
    }
    default: {
      let raw;
      if (session.currentValueOverrideEnabled) raw = session.currentValueOverride;
      else if (session.valueOverrideEnabled) raw = session.valueOverride;
      else if (typeof session.checked === 'boolean') raw = session.checked ? 1 : 0;
      const n = Number(raw);
      return Number.isFinite(n) ? n : undefined;
    }
  }
}

/**
 * The session patch that writes a value back.
 *
 * Takes the EXISTING session for the section case, because a component can have several exported
 * fields — an Arp has four — and writing one must not clear the other three.
 */
export function writeParameterPatch(parameter, value, session = null) {
  switch (parameterDoor(parameter)) {
    case 'section':
      return {
        sectionValues: sectionValuePatch(session?.sectionValues, parameter.section, parameter.field, value),
      };
    case 'channel':
      return { customValues: { [parameterLeaf(parameter)]: value } };
    default:
      return { valueOverrideEnabled: true, valueOverride: value };
  }
}

/** The control a parameter drives, resolved by name or by the id prefix of its path. */
export function controlIdForParameter(parameter, panel) {
  const wanted = String(parameter?.controlName ?? String(parameter?.id ?? '').split('.')[0] ?? '');
  if (!wanted) return '';
  for (const control of panel?.controls ?? []) {
    const core = control?._children?.Core;
    if (!core) continue;
    if (core.id === wanted || core.name === wanted) return String(core.id ?? '');
  }
  return '';
}

/** Clamp into the parameter's declared range, which is what every writer here owes the control. */
export function clampToParameter(parameter, value) {
  const min = Number(parameter?.min ?? 0);
  const max = Number(parameter?.max ?? 1);
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(Math.max(n, Math.min(min, max)), Math.max(min, max));
}
