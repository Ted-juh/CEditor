import { untrack } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';

/**
 * Read one entry of an immutable object store without subscribing its renderer to
 * every other entry. Keep the original objects: wrapping sessions in deep state
 * would copy their dependency graph and defeat identity-based rendering.
 * The owner must destroy the subscription when its surface unmounts.
 */
export function keyedStoreView(store) {
  const values = new SvelteMap();
  let previous = {};
  const destroy = store.subscribe((entries) => untrack(() => {
    const next = entries ?? {};
    for (const key of Object.keys(previous)) {
      if (!Object.hasOwn(next, key)) values.delete(key);
    }
    for (const [key, value] of Object.entries(next)) {
      if (!Object.hasOwn(previous, key) || previous[key] !== value) values.set(key, value);
    }
    previous = next;
  }));
  return { values, destroy };
}
