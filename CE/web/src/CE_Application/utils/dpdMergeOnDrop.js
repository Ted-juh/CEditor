// Merge-on-drop enrichment for DPD-backed profiles (architecture doc §Integration).
//
// The editor's bind action writes a DeviceBindings entry that references a parameterId. For a
// DPD-sourced profile that is not enough: the doc requires the dropped section be SELF-CONTAINED —
// carrying its own address/CC, enum wire values, and packing — plus a source:"id@version" stamp,
// so the panel needs no profile at runtime and an opt-in re-sync stays possible later.
//
// This is the thin wiring: given the legacy descriptor being dropped + the profile + the generated
// runtime (which carries `mergeParams`, the resolved slices), produce the enriched binding. The
// actual translation lives in the generated dpdMerge.js (a regenerated copy of CE/dpd/merge.mjs),
// keeping one source of truth. Pure + dependency-light so it unit-tests under `node --test`.
import { dpdParamToBindingSection } from '../generated/dpdMerge.js';

// The C++ profile *summary* carries only id/name/filePath, so a DPD-backed legacy profile is
// recognised via the generated map (legacy id -> { dpdSource, version }) rather than a field on
// the summary. The map is passed in (the Svelte caller imports the JSON; Vite handles that), which
// keeps this util free of static JSON imports so it runs under both Vite and `node --test`.
// Returns { dpdSource, version } or null.
export function dpdBackingFor(profile, dpdProfileMap = {}) {
  const id = String(profile?.id ?? '');
  return (id && dpdProfileMap[id]) || null;
}

// emit-legacy flattens resolvedIds by stripping the leading instance/scope segment
// (tone1.filter.cutoff -> filter.cutoff). Map a dropped (flat) id back to its instance-0 slice.
export function mergeParamForId(runtime, parameterId) {
  const mergeParams = runtime?.mergeParams;
  if (!mergeParams || !parameterId) return null;

  // exact resolvedId hit first (callers that already pass the full id)
  if (mergeParams[parameterId]) return mergeParams[parameterId];

  const target = String(parameterId);
  // first match by flat id == instance 0 (resolveParams emits instance 0 before later instances)
  for (const [rid, slice] of Object.entries(mergeParams)) {
    if (rid.replace(/^[^.]+\./, '') === target) return slice;
  }
  return null;
}

// Does this profile come from a DPD, and does the runtime describe that same DPD?
export function runtimeMatchesProfile(runtime, profile, dpdProfileMap = {}) {
  if (!runtime || !profile) return false;
  const backing = dpdBackingFor(profile, dpdProfileMap);
  return !!backing && backing.dpdSource === String(runtime.profileId ?? '');
}

// Return a NEW binding enriched per the doc: always a source stamp; and, when the profile is
// DPD-backed and the parameter resolves to a slice, the self-contained address/CC + enum + packing.
// Non-DPD profiles (or unknown params) pass through with just the stamp — graceful, additive.
export function enrichBindingWithDpd(binding, { parameter, profile, runtime, dpdProfileMap = {}, port } = {}) {
  const next = { ...binding };
  const backing = dpdBackingFor(profile, dpdProfileMap);
  const version = backing?.version ?? profile?.profileVersion ?? profile?.version ?? '0.0.0';
  if (profile?.id) next.source = `${profile.id}@${version}`;

  if (!runtimeMatchesProfile(runtime, profile, dpdProfileMap)) return next;

  const slice = mergeParamForId(runtime, parameter?.id ?? binding?.parameterId);
  if (!slice) return next;

  const section = dpdParamToBindingSection(slice, {
    profileId: runtime.profileId,
    version: runtime.version,
    port: port ?? binding?.port ?? 'value',
    deviceRole: binding?.deviceRole ?? 'mainSynth',
  });

  // Stamp with the DPD id@version (the slice's true origin) and graft the self-contained MIDI config.
  next.source = section.source ?? next.source;
  next.valueType = section.valueType;
  next.range = section.range;
  if (section.enum) next.enum = section.enum;
  next.encoding = section.encoding;
  next.size = section.size;
  next.wires = section.wires;
  return next;
}
