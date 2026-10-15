/**
 * Quick structured-clone replacement for data that's known to be plain
 * JSON (no Date, Map, Set, functions, etc.). The ValueTree data this
 * project deals with is always JSON-serializable, so this is safe.
 *
 * Using a named helper is purely for readability — JSON.parse(JSON.stringify(x))
 * appears in ~20 places across the codebase and hides the intent.
 *
 * The catch is what makes this safe on reactive data. `structuredClone` throws
 * on a Svelte 5 `$state` proxy:
 *
 *   DataCloneError: #<Object> could not be cloned.
 *
 * — which is not a corrupt document, just the proxy refusing to be cloned by
 * an algorithm that predates it. Reached from the UI it surfaces as "The
 * display panel stopped rendering" or a blank canvas, because the throw takes
 * out whatever render or store update was in flight. The project has hit this
 * at least three times in different places (see the comments in Player.svelte
 * and DeviceProfileDesignerV2.svelte), each time fixed locally by remembering
 * to wrap the argument.
 *
 * Remembering is the part that fails. So the fallback lives here instead: a
 * proxy that will not structured-clone still stringifies correctly, and the
 * JSON round trip is exactly what this helper promised in the first place.
 * `$state.snapshot` would be the more direct tool, but it is a compiler rune
 * and unavailable in a plain .js module — and callers reaching for a shared
 * clone helper are the ones least likely to know their argument is reactive.
 *
 * Plain data is copied here, by hand, and that is not about speed. structuredClone keeps two
 * references to one object as one object in the copy; JSON does not. A loaded panel's controls
 * share their untouched defaults (stores/documentShape.js), so two parts of one control can hold
 * the same default Background — and a draft cloned with structuredClone would hold one Background
 * for both, where a write meant for one part lands in the other. Copying every reference on its
 * own is what JSON, and so this helper, always promised. It also reads through a $state proxy,
 * which structuredClone refuses.
 *
 * Anything else — a Date, a Map, a typed array, a cycle — goes the old way: structuredClone, then
 * JSON.
 */
const NOT_PLAIN = Symbol('not plain');

function isPlainContainer(value) {
  if (Array.isArray(value)) return true;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function clonePlain(value, ancestors) {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') throw NOT_PLAIN;
    return value;
  }
  if (!isPlainContainer(value) || ancestors.has(value)) throw NOT_PLAIN;
  ancestors.add(value);
  let out;
  if (Array.isArray(value)) {
    out = new Array(value.length);
    for (let i = 0; i < value.length; i++) if (i in value) out[i] = clonePlain(value[i], ancestors);
  } else {
    out = {};
    for (const key of Object.keys(value)) out[key] = clonePlain(value[key], ancestors);
  }
  ancestors.delete(value);
  return out;
}

export function deepClone(value) {
  try {
    return clonePlain(value, new Set());
  } catch (error) {
    if (error !== NOT_PLAIN) throw error;
  }
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      // Fall through to JSON — see above. Deliberately catching everything:
      // the only failures possible here are non-cloneable inputs, and for the
      // JSON-shaped data this helper is for, the round trip handles them.
    }
  }

  return JSON.parse(JSON.stringify(value));
}
