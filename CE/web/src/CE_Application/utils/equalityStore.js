import { writable } from 'svelte/store';

/**
 * A writable that stays quiet when the value has not actually changed.
 *
 * WHY THIS EXISTS. Svelte's writable decides whether to notify with `safe_not_equal`, which for
 * any object or function returns true unconditionally:
 *
 *     a != a ? b == b : a !== b || (a !== null && typeof a === 'object') || typeof a === 'function'
 *
 * That is the right default — a mutated object is indistinguishable from an unmutated one by
 * identity — but it means an object-valued store CANNOT be quietened from the outside. The pattern
 *
 *     store.update((current) => (isSame(current, next) ? current : next));
 *
 * reads as "only notify when it changed" and does not do that: returning the identical object still
 * notifies every subscriber. Two scope stores in this app were written exactly that way, and the
 * cost was not theoretical — `stateEditScope` is read by a derived over the whole `panels` store,
 * so a notification nobody asked for re-derived the document's selected control and everything the
 * properties panel builds from it, on every selection, measured at ~124 ms a click.
 *
 * So the comparison moves inside the store, where it can be enforced. `set` compares before it
 * notifies; `update` is defined in terms of `set`, so the guard cannot be bypassed by using the
 * other one.
 *
 * @param initial the starting value
 * @param isEqual (a, b) => boolean — true when a notification would tell subscribers nothing
 */
export function equalityWritable(initial, isEqual) {
  const inner = writable(initial);
  let current = initial;

  const set = (next) => {
    if (isEqual(current, next)) return;
    current = next;
    inner.set(next);
  };

  return {
    subscribe: inner.subscribe,
    set,
    update: (fn) => set(fn(current)),
  };
}
