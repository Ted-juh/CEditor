// Resolve a bound parameter's literal hardware address (Roland DT1/RQ1 hex, or CC#)
// from the generated DPD runtimes, so the Device insight zone can show it inline.
//
// Minimal DeviceBindings carry only a parameterId — the address lives in the profile.
// For DPD-backed profiles the resolved slice carries `wires` (the self-contained MIDI
// config). We resolve via mergeParamForId, which strips the instance prefix
// (tone1.filter.cutoff -> filter.cutoff), so a panel's flat parameterId still matches.
import gaiaRuntime from '../generated/roland.gaia.runtime.json';
import dpdProfileMap from '../generated/dpdProfileMap.json';
import { mergeParamForId, dpdBackingFor } from './dpdMergeOnDrop.js';

// dpdSource -> bundled runtime. GAIA is the first shipped target; add more here as they land.
const RUNTIMES = { 'roland.gaia': gaiaRuntime };

function formatWire(wire) {
  if (!wire) return '';
  const msg = String(wire.msg ?? '').toUpperCase();
  if (wire.address) return msg ? `${msg} ${wire.address}` : String(wire.address);
  if (wire.cc != null) return `CC ${wire.cc}`;
  if (wire.controller != null) return `CC ${wire.controller}`;
  return msg;
}

/**
 * @returns {string|null} formatted address (e.g. "DT1 10 00 01 0C" or "CC 74"), or null if unresolved.
 */
export function resolveDeviceAddress(profile, parameterId) {
  if (!parameterId) return null;

  // Prefer an explicit profileId -> dpdSource -> runtime mapping.
  let runtime = null;
  const backing = profile ? dpdBackingFor(profile, dpdProfileMap) : null;
  if (backing?.dpdSource && RUNTIMES[backing.dpdSource]) runtime = RUNTIMES[backing.dpdSource];

  // Fallback: the profileId may not be in the map (id naming drift) — use whichever
  // runtime actually resolves this parameter.
  if (!runtime) {
    for (const candidate of Object.values(RUNTIMES)) {
      if (mergeParamForId(candidate, parameterId)) { runtime = candidate; break; }
    }
  }
  if (!runtime) return null;

  const slice = mergeParamForId(runtime, parameterId);
  if (!slice?.wires) return null;

  return formatWire(slice.wires.write) || formatWire(slice.wires.rxLive) || formatWire(slice.wires.read) || null;
}
