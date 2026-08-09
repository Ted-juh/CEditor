/**
 * Which devices a panel actually talks to.
 *
 * A device "role" is just a name — `mainSynth`, `primary`, `drums` — and everything below the UI is
 * already keyed by it: every control binding carries a deviceRole, every send carries a deviceRole,
 * and deviceRoleMappings is a map from role to { profile, MIDI output, MIDI input }. Two synths at
 * once is not a feature that needs adding to the model; it is what the model already is.
 *
 * What was missing is that nothing ever told you which roles a panel uses. Every mapDeviceRole call
 * in the UI passed the DEFAULT_DEVICE_ROLE constant, so only `mainSynth` could ever be configured —
 * while the GAIA panel binds 365 of its controls to a role called `primary`. Sending one of those
 * looks up deviceRoleMappings['primary'], finds nothing, and gives up with "Not sent: unresolved
 * profile for primary". The panel could not reach a synth no matter which port you picked, because
 * the port was attached to a different name than the one its controls asked for.
 *
 * So the settings page reads the roles out of the panels rather than making anyone guess them.
 */

import { flatControls } from './containment.js';

/**
 * Every device role referenced by these controls, with how many bindings use each.
 *
 * Returns a Map so the caller can both list the roles and say how much of the panel depends on one —
 * "365 controls" is the difference between a role worth configuring and a stray binding.
 */
export function countRolesInControls(controls) {
  const counts = new Map();
  for (const control of flatControls(controls ?? [])) {
    const bindings = control?._children?.DeviceBindings?.bindings;
    if (!Array.isArray(bindings)) continue;
    for (const binding of bindings) {
      const role = typeof binding?.deviceRole === 'string' ? binding.deviceRole.trim() : '';
      if (!role) continue;                       // an unset role falls back to the default at send time
      counts.set(role, (counts.get(role) ?? 0) + 1);
    }
  }
  return counts;
}

/** The same, across several panels, so settings can describe the whole session. */
export function countRolesInPanels(panels) {
  const total = new Map();
  for (const panel of panels ?? []) {
    for (const [role, n] of countRolesInControls(panel?.controls)) {
      total.set(role, (total.get(role) ?? 0) + n);
    }
  }
  return total;
}

/**
 * Rename a device everywhere the controls refer to it.
 *
 * The device's name IS its identity — there is no hidden id underneath and deliberately so, because
 * a second identifier is a second thing to keep in sync and a second thing to show by mistake. The
 * cost of that choice is this function: renaming has to rewrite the bindings, or the controls would
 * go on asking for a name nothing answers to.
 *
 * Returns the same array when nothing referred to the old name, so callers can skip writing a panel
 * they did not change.
 */
export function renameRoleInControls(controls, from, to) {
  const before = String(from ?? '');
  const after = String(to ?? '');
  if (!before || !after || before === after) return controls ?? [];

  let touched = false;
  const rewrite = (control) => {
    const bindings = control?._children?.DeviceBindings?.bindings;
    const kids = control?._children?.Children?._children;

    const nextBindings = Array.isArray(bindings) && bindings.some((b) => b?.deviceRole === before)
      ? bindings.map((b) => (b?.deviceRole === before ? { ...b, deviceRole: after } : b))
      : null;

    let nextKids = null;
    if (kids && typeof kids === 'object') {
      const entries = Object.entries(kids).map(([key, child]) => [key, child?._children ? rewrite(child) : child]);
      if (entries.some(([key, child]) => child !== kids[key])) nextKids = Object.fromEntries(entries);
    }

    if (!nextBindings && !nextKids) return control;
    touched = true;
    return {
      ...control,
      _children: {
        ...control._children,
        ...(nextBindings ? { DeviceBindings: { ...control._children.DeviceBindings, bindings: nextBindings } } : {}),
        ...(nextKids ? { Children: { ...control._children.Children, _children: nextKids } } : {}),
      },
    };
  };

  const next = (controls ?? []).map(rewrite);
  return touched ? next : (controls ?? []);
}

/**
 * The rows a device settings page should show.
 *
 * Configured devices first, in their existing order, then any device a panel asks for that nothing
 * has set up — those are the ones that silently fail to send, and they are the whole reason this is
 * assembled from both sides rather than just read off the mappings.
 */
export function deviceRoleRows(roleMappings, panels, alwaysInclude = []) {
  const used = countRolesInPanels(panels);
  const rows = [];
  const seen = new Set();

  const add = (role) => {
    if (!role || seen.has(role)) return;
    seen.add(role);
    rows.push({
      role,
      mapping: roleMappings?.[role] ?? null,
      configured: !!roleMappings?.[role],
      usedBy: used.get(role) ?? 0,
    });
  };

  for (const role of Object.keys(roleMappings ?? {})) add(role);
  for (const role of alwaysInclude) add(role);
  for (const role of [...used.keys()].sort()) add(role);

  return rows;
}
