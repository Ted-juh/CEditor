/**
 * One inbound index per profile, built once.
 *
 * buildInboundIndex compiles every parameter five times — ~87ms for the GAIA's 793 — so it must not
 * happen per message, per keystroke, or per component mount. Two places want the same answer for the
 * same profile: the Player, decoding what the instrument sends, and the MIDI tab, naming what just
 * moved. This is the shared cache so they cannot disagree or pay for it twice.
 *
 * Keyed by profile id AND the source text, because a profile can be edited in the app: saving a
 * draft replaces the string, and an index built from the old one would name the wrong parameters.
 */

import { buildInboundIndex } from '../utils/inboundParameterIndex.js';

const LIMIT = 4;
const cache = new Map();   // profileId -> { source, index, parameterById }

/**
 * The index for a profile, plus its parameters by id — callers that resolve a message to a
 * parameter almost always need the parameter itself next, and looking it up by scanning 793 entries
 * is the kind of thing that ends up inside a message handler.
 *
 * Returns null for a missing or unparseable source rather than throwing: the source arrives
 * asynchronously over the bridge, so "not yet" is an ordinary state, not an error.
 */
export function inboundIndexFor(profileId, source) {
  const id = String(profileId ?? '');
  const text = String(source ?? '');
  if (!id || !text) return null;

  const hit = cache.get(id);
  if (hit && hit.source === text) return hit;

  let profile = null;
  try { profile = JSON.parse(text); } catch { return null; }
  if (!profile || typeof profile !== 'object') return null;

  const parameterById = {};
  for (const parameter of profile.parameters ?? []) {
    if (parameter?.id) parameterById[String(parameter.id)] = parameter;
  }
  const entry = { source: text, index: buildInboundIndex(profile), parameterById };

  cache.set(id, entry);
  // Oldest out first. A session realistically holds one or two profiles; the cap is here so a long
  // session that opens many cannot grow without bound.
  if (cache.size > LIMIT) cache.delete(cache.keys().next().value);
  return entry;
}

/** Test seam, and the honest thing to call if a profile is deleted. */
export function clearInboundIndexCache() {
  cache.clear();
}
