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
 * Non-proxy values are unaffected: structuredClone succeeds and returns first.
 */
export function deepClone(value) {
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
