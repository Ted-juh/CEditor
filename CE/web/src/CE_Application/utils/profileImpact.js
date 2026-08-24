// profileImpact.js — who depends on this profile, and what an edit to it would break.
//
// A device profile is not a leaf. Panels bind controls to its parameters by id, and the binding is
// a STRING: rename a parameter and every control pointing at the old id keeps pointing at nothing.
// Nothing errors, nothing warns, the knob just stops moving the synth — which is the worst kind of
// break, because the panel still looks right and the fault appears to be in the cable.
//
// So "impact" is the honest half of a Share screen. Before you publish a profile other people build
// panels on, and before you edit one your own panels already use, the question is the same: what
// does this change out from under somebody.
//
// FOUR KINDS OF BREAK, and only the first is obvious:
//
//   removed   — the parameter is gone. Every binding to it is dead.
//   renamed   — the id changed. Same as removed, from a binding's point of view, and it LOOKS
//               harmless in a diff because the parameter is still there under a new name.
//   retyped   — a float became a choice, or a choice's values changed. The binding survives and
//               starts sending values the device does not understand.
//   narrowed  — the range shrank. The binding survives, the control's own range did not shrink with
//               it, and the top of its travel now sends out-of-range values.
//
// The last two are the reason this is not just a set difference over ids.
//
// PURE. Panels and profiles in, findings out; the screen renders them and the tests do not need
// either store.

import { flatControls } from './containment.js';

function parameterList(profile) {
  const list = profile?.parameters;
  return Array.isArray(list) ? list : [];
}

function parameterMap(profile) {
  const map = new Map();
  for (const parameter of parameterList(profile)) {
    if (parameter?.id) map.set(String(parameter.id), parameter);
  }
  return map;
}

function controlId(control) {
  return String(control?._children?.Core?.id ?? '');
}

function controlName(control) {
  return String(control?._children?.Core?.name ?? controlId(control));
}

/**
 * Every binding from a set of panels into device parameters.
 *
 * Role-aware: two synths can be mapped at once, and a binding names the role rather than the
 * profile. `roleProfiles` maps role → profileId so a binding can be attributed to the right one; a
 * binding whose role is unmapped is reported with `profileId: ''` rather than dropped, because "you
 * have bindings pointing at a device you have not chosen" is itself worth seeing.
 */
export function collectBindings(panels, roleProfiles = {}) {
  const out = [];
  for (const panel of panels ?? []) {
    for (const control of flatControls(Array.isArray(panel?.controls) ? panel.controls : [])) {
      const bindings = control?._children?.DeviceBindings;
      if (bindings?.enabled === false) continue;
      for (const binding of Array.isArray(bindings?.bindings) ? bindings.bindings : []) {
        if (binding?.kind !== 'deviceParameter' || !binding?.parameterId) continue;
        const role = String(binding.deviceRole ?? '');
        out.push({
          panelId: String(panel?.id ?? ''),
          panelName: String(panel?.name ?? panel?.id ?? ''),
          controlId: controlId(control),
          controlName: controlName(control),
          port: String(binding.port ?? 'value'),
          deviceRole: role,
          profileId: String(roleProfiles?.[role] ?? ''),
          parameterId: String(binding.parameterId),
          // The control's own range, which is what makes a narrowed parameter a real break rather
          // than a theoretical one.
          controlMin: control?._children?.Behavior?.min,
          controlMax: control?._children?.Behavior?.max,
        });
      }
    }
  }
  return out;
}

/**
 * Who depends on this profile, grouped by parameter.
 *
 * Sorted by how many bindings a parameter carries, because that is the order somebody about to edit
 * one wants: the parameter forty controls point at is the one to leave alone.
 */
export function profileConsumers(profileId, panels, roleProfiles = {}) {
  const id = String(profileId ?? '');
  const bindings = collectBindings(panels, roleProfiles).filter((binding) => binding.profileId === id);

  const byParameter = new Map();
  for (const binding of bindings) {
    const bucket = byParameter.get(binding.parameterId) ?? { parameterId: binding.parameterId, bindings: [], panels: new Set() };
    bucket.bindings.push(binding);
    bucket.panels.add(binding.panelName);
    byParameter.set(binding.parameterId, bucket);
  }

  const parameters = [...byParameter.values()]
    .map((bucket) => ({ ...bucket, panels: [...bucket.panels].sort(), count: bucket.bindings.length }))
    .sort((a, b) => b.count - a.count || a.parameterId.localeCompare(b.parameterId));

  return {
    parameters,
    total: bindings.length,
    panels: [...new Set(bindings.map((binding) => binding.panelName))].sort(),
  };
}

/**
 * Was this parameter renamed rather than removed?
 *
 * Matched on label and message shape rather than on id — the id is the thing that changed, so it
 * cannot be the evidence. A confident match needs BOTH, because a profile full of parameters
 * labelled "Level" would otherwise pair them at random and report a rename that never happened,
 * which is worse than reporting a removal that was one.
 */
function findRename(removed, added) {
  const label = String(removed?.label ?? removed?.name ?? '').trim().toLowerCase();
  // An unlabelled parameter has nothing to match on, so there is no match and nothing to offer.
  if (!label) return { match: null, candidates: [] };
  const shape = String(removed?.messageRecipe ?? '');

  const matches = added.filter((candidate) => {
    const other = String(candidate?.label ?? candidate?.name ?? '').trim().toLowerCase();
    return other === label && String(candidate?.messageRecipe ?? '') === shape;
  });
  // Exactly one, or it is a guess. Two candidates with the same label and shape are genuinely
  // ambiguous and saying so is more use than picking.
  //
  // But NOT saying anything is worse than either. The ambiguous case used to come back as a bare
  // null, so the finding read "gone; every binding to it is dead" — which is almost certainly
  // false, and hides the two ids the matcher was looking at. Refusing to choose is the right call;
  // refusing to mention what the choice was between is just losing evidence the tool already had.
  return {
    match: matches.length === 1 ? matches[0] : null,
    candidates: matches.length > 1 ? matches.map((candidate) => String(candidate.id)) : [],
  };
}

function choiceValues(parameter) {
  const values = parameter?.values ?? parameter?.choices ?? parameter?.enum;
  return Array.isArray(values) ? values.map((entry) => String(entry?.value ?? entry?.id ?? entry)) : null;
}

/**
 * What changing this profile would break.
 *
 * `before` is the published or saved profile, `after` the edited one. Findings carry the bindings
 * they affect, so the screen can say "this breaks three controls on two panels" rather than "a
 * parameter changed".
 */
export function impactOfChange(before, after, bindings = []) {
  const oldParameters = parameterMap(before);
  const newParameters = parameterMap(after);

  const removedIds = [...oldParameters.keys()].filter((id) => !newParameters.has(id));
  const addedList = [...newParameters.values()].filter((parameter) => !oldParameters.has(String(parameter.id)));

  const bindingsFor = (id) => bindings.filter((binding) => binding.parameterId === id);
  const findings = [];

  for (const id of removedIds) {
    const parameter = oldParameters.get(id);
    const { match: rename, candidates } = findRename(parameter, addedList);
    findings.push({
      kind: rename ? 'renamed' : 'removed',
      parameterId: id,
      label: String(parameter?.label ?? parameter?.name ?? id),
      newId: rename ? String(rename.id) : null,
      // Empty unless the match was ambiguous. The finding stays `removed` — that is the safe
      // reading and the one a binding experiences — and these are what it could have been.
      renameCandidates: candidates,
      bindings: bindingsFor(id),
      // A rename looks harmless in a diff — the parameter is still there, under a new name — and is
      // exactly as broken as a removal from a binding's point of view.
      detail: rename
        ? `renamed to ${rename.id}; every binding still names the old id`
        : candidates.length
          ? `gone; every binding to it is dead. It may have become ${candidates.join(' or ')} — same `
            + 'label and same message shape, so which one cannot be told from here'
          : 'gone; every binding to it is dead',
    });
  }

  for (const [id, next] of newParameters) {
    const previous = oldParameters.get(id);
    if (!previous) continue;

    const oldChoices = choiceValues(previous);
    const newChoices = choiceValues(next);
    const oldType = String(previous.type ?? previous.kind ?? '');
    const newType = String(next.type ?? next.kind ?? '');

    if (oldType && newType && oldType !== newType) {
      findings.push({
        kind: 'retyped',
        parameterId: id,
        label: String(next.label ?? next.name ?? id),
        bindings: bindingsFor(id),
        detail: `${oldType} became ${newType}; bindings survive and start sending values the device may not accept`,
      });
      continue;
    }

    if (oldChoices && newChoices) {
      const lost = oldChoices.filter((value) => !newChoices.includes(value));
      if (lost.length) {
        findings.push({
          kind: 'retyped',
          parameterId: id,
          label: String(next.label ?? next.name ?? id),
          bindings: bindingsFor(id),
          detail: `choices removed: ${lost.slice(0, 4).join(', ')}${lost.length > 4 ? '…' : ''}`,
        });
        continue;
      }
    }

    const oldMin = Number(previous.min);
    const oldMax = Number(previous.max);
    const newMin = Number(next.min);
    const newMax = Number(next.max);
    if ([oldMin, oldMax, newMin, newMax].every(Number.isFinite) && (newMin > oldMin || newMax < oldMax)) {
      // Reported ALWAYS, but only the controls whose OWN range still runs past the new one are
      // attached. A control that never went that high was never going to send an out-of-range
      // value; listing it would bury the ones that will. A narrowing that affects nothing here is
      // still worth showing on a SHARE screen, where the panels that break are somebody else's and
      // cannot be counted from this machine.
      const affected = bindingsFor(id).filter((binding) =>
        Number(binding.controlMax) > newMax || Number(binding.controlMin) < newMin);
      findings.push({
        kind: 'narrowed',
        parameterId: id,
        label: String(next.label ?? next.name ?? id),
        bindings: affected,
        detail: affected.length
          ? `${oldMin}–${oldMax} became ${newMin}–${newMax}; the top of a bound control's travel now goes out of range`
          : `${oldMin}–${oldMax} became ${newMin}–${newMax}; nothing on this machine overshoots it, but a panel built elsewhere might`,
      });
    }
  }

  const affectedBindings = findings.reduce((sum, finding) => sum + finding.bindings.length, 0);
  return {
    findings: findings.sort((a, b) => b.bindings.length - a.bindings.length),
    added: addedList.filter((parameter) => !findings.some((finding) => finding.newId === String(parameter.id))).length,
    affectedBindings,
    // `safe` is about THIS machine's panels, which is what the count above measures. A finding with
    // no bindings — a range narrowed past nothing local — is still listed: it is safe here and may
    // not be for whoever downloads the profile, and those are different claims.
    safe: affectedBindings === 0,
  };
}

/**
 * What a shared profile carries, and what is stripped.
 *
 * Same rule the panel package follows: a profile is a description of an INSTRUMENT, and anything in
 * it that describes THIS MACHINE is noise at best and a privacy leak at worst. The port names a
 * synth happened to be plugged into say what interface the author owns; a saved variable can hold a
 * device id somebody set for their own rig.
 */
export const SHARE_STRIPPED_KEYS = ['midiInput', 'midiDestination', 'midiOutput', 'filePath', 'lastSeen', 'session'];

export function shareManifest(profile) {
  const stripped = [];
  const carried = [];

  for (const key of Object.keys(profile ?? {})) {
    if (SHARE_STRIPPED_KEYS.includes(key)) stripped.push(key);
    else carried.push(key);
  }

  return {
    carried: carried.sort(),
    stripped: stripped.sort(),
    parameters: parameterList(profile).length,
    dumps: Array.isArray(profile?.dumps) ? profile.dumps.length : 0,
    messageShapes: Array.isArray(profile?.messageShapes) ? profile.messageShapes.length : 0,
    presets: Array.isArray(profile?.presets?.slots) ? profile.presets.slots.length : 0,
  };
}

/** A profile with the machine-specific keys removed, ready to publish. */
export function profileForSharing(profile) {
  const out = {};
  for (const [key, value] of Object.entries(profile ?? {})) {
    if (SHARE_STRIPPED_KEYS.includes(key)) continue;
    out[key] = value;
  }
  return out;
}

/**
 * Whether a profile is fit to share, and what is missing if not.
 *
 * Not a validator — `validate.mjs` already says whether it is CORRECT. This says whether it is
 * USEFUL to somebody else, which is a different and softer question: a profile with no label, no
 * manufacturer and one parameter is valid and nobody can do anything with it.
 */
export function shareReadiness(profile) {
  const missing = [];
  if (!String(profile?.label ?? '').trim()) missing.push('a name');
  if (!String(profile?.manufacturer ?? profile?.vendor ?? '').trim()) missing.push('a manufacturer');
  if (!String(profile?.version ?? '').trim()) missing.push('a version');
  if (parameterList(profile).length === 0) missing.push('at least one parameter');

  const identity = profile?.identity ?? profile?.deviceId ?? null;
  if (!identity) {
    // Not fatal: plenty of useful profiles are for devices that do not answer an identity request.
    // Worth saying, because without it the profile cannot be matched to a device automatically.
    missing.push('an identity reply (optional — without it the profile cannot auto-match a device)');
  }

  return { ready: missing.filter((entry) => !entry.startsWith('an identity')).length === 0, missing };
}
