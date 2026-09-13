// deviceParameterValues.js — what the device's parameters are currently set to.
//
// WHY THIS DID NOT EXIST, AND WHY IT HAD TO.
//
// A device parameter's value was only ever implied. An inbound CC was decoded against the profile
// and written into the preview session of every CONTROL bound to that parameter
// (`syncDeviceParameterToPanelPreview`), and an outbound change was read off the control that
// moved. So "what is the cutoff right now" had no answer unless some control happened to be bound
// to it — the device's state was scattered across whichever widgets the panel author drew.
//
// That is exactly why a display zone could not name a parameter: there was nothing to read. It is
// also why a screen reporting eight parameters needed eight controls existing only to be read.
//
// This models it once. Two funnels already carry the whole triple and nothing else does, which is
// what makes the store cheap and trustworthy rather than another thing to keep in step:
//
//   inbound   syncDeviceParameterToPanelPreview(role, parameterId, value)   — deviceBindingSync.js
//   outbound  commitDeviceParameter({ deviceRole, parameterId, value })     — deviceMidiOps.js
//
// WHAT IT IS NOT. Not persistence and not a patch: it is the editor's live picture of the device,
// dropped when the panel is, and it says nothing about whether the device agreed. A parameter the
// device never confirms still reads as whatever was last sent, which is the same thing the bound
// control already showed — this makes that honest rather than making it worse.

import { get, writable } from 'svelte/store';

/** { [deviceRole]: { [parameterId]: value } } */
export const deviceParameterValues = writable({});

/**
 * Record a parameter's value for a role.
 *
 * Writes nothing when the value is unchanged. Both funnels can fire several times for one gesture —
 * a continuous drag sends on every frame — and an unconditional `.set` would wake every display on
 * the panel for a value that did not move.
 */
export function recordDeviceParameterValue(deviceRole, parameterId, value) {
  const role = String(deviceRole ?? '');
  const id = String(parameterId ?? '');
  if (!role || !id || value === undefined) return;

  deviceParameterValues.update((current) => {
    if (current?.[role]?.[id] === value) return current;
    return { ...current, [role]: { ...(current?.[role] ?? {}), [id]: value } };
  });
}

/** The recorded value, or undefined when nothing has set it yet. */
export function deviceParameterValue(deviceRole, parameterId) {
  return get(deviceParameterValues)?.[String(deviceRole ?? '')]?.[String(parameterId ?? '')];
}

/** Forget everything, or one role's worth. Used when a panel or a device mapping changes. */
export function clearDeviceParameterValues(deviceRole = '') {
  const role = String(deviceRole ?? '');
  if (!role) { deviceParameterValues.set({}); return; }
  deviceParameterValues.update((current) => {
    if (!current?.[role]) return current;
    const { [role]: _gone, ...rest } = current;
    return rest;
  });
}
