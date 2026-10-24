// Resolve a bound parameter's literal hardware address (Roland DT1/RQ1 hex, or CC#)
// from the generated DPD runtimes, so the Device insight zone can show it inline.
//
// Minimal DeviceBindings carry only a parameterId — the address lives in the profile.
// For DPD-backed profiles the resolved slice carries `wires` (the self-contained MIDI
// config). We resolve via mergeParamForId, which strips the instance prefix
// (tone1.filter.cutoff -> filter.cutoff), so a panel's flat parameterId still matches.
import dpdProfileMap from '../generated/dpdProfileMap.json';
import { mergeParamForId, dpdBackingFor } from './dpdMergeOnDrop.js';

// dpdSource -> bundled runtime. dpdProfileMap registers a profile as DPD-backed; if its runtime is
// not ALSO in this table the app takes the DPD path and then finds nothing, which reads to the user
// as "unresolved profile" rather than as a missing build artefact. dpdLibraryGuards.test.js keeps
// the two in step.
//
// Each is loaded the first time an address is asked of it, not with the editor. Imported statically
// they were parsed at every start, in the eager entry chunk, for this one line of the Device
// insight strip: the AN1x's runtime alone is 1.4 MB of JSON, and it took `main` past
// vite.config.js's chunkSizeWarningLimit.
const RUNTIMES = {
  'roland.gaia': () => import('../generated/roland.gaia.runtime.json'),
  'yamaha.an1x': () => import('../generated/yamaha.an1x.runtime.json'),
  'generic.cc': () => import('../generated/generic.cc.runtime.json'),
};
const loaded = new Map();
function runtimeFor(source) {
  if (!loaded.has(source)) loaded.set(source, RUNTIMES[source]().then((m) => m.default ?? m));
  return loaded.get(source);
}

function formatWire(wire) {
  if (!wire) return '';
  const msg = String(wire.msg ?? '').toUpperCase();
  if (wire.address) return msg ? `${msg} ${wire.address}` : String(wire.address);
  if (wire.cc != null) return `CC ${wire.cc}`;
  if (wire.controller != null) return `CC ${wire.controller}`;
  return msg;
}

/**
 * @returns {Promise<string|null>} formatted address (e.g. "DT1 10 00 01 0C" or "CC 74"), or null if unresolved.
 */
export async function resolveDeviceAddress(profile, parameterId) {
  if (!parameterId) return null;

  // Prefer an explicit profileId -> dpdSource -> runtime mapping.
  let runtime = null;
  const backing = profile ? dpdBackingFor(profile, dpdProfileMap) : null;
  if (backing?.dpdSource && RUNTIMES[backing.dpdSource]) runtime = await runtimeFor(backing.dpdSource);

  // Fallback: the profileId may not be in the map (id naming drift) — use whichever
  // runtime actually resolves this parameter.
  if (!runtime) {
    for (const source of Object.keys(RUNTIMES)) {
      const candidate = await runtimeFor(source);
      if (mergeParamForId(candidate, parameterId)) { runtime = candidate; break; }
    }
  }
  if (!runtime) return null;

  const slice = mergeParamForId(runtime, parameterId);
  if (!slice?.wires) return null;

  return formatWire(slice.wires.write) || formatWire(slice.wires.rxLive) || formatWire(slice.wires.read) || null;
}
