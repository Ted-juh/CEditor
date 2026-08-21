import { writable } from 'svelte/store';

/**
 * Active appearance facet for the top "Look" bar.
 *
 * The Look bar shows one facet's quick controls at a time (Text, Fill, Box, …)
 * instead of a flat cumulative strip. `activeFacet` is the user's chosen/last
 * facet — the context bar falls back to the first applicable facet when this
 * one doesn't apply to the current selection.
 *
 * The facet is also the hook other entry points point at: a right-click
 * "Edit colour" sets it to 'fill', a double-click on text sets it to 'text',
 * etc. — so every fast door into the model funnels through this store.
 */

// Priority order used to pick a default facet when the current one doesn't
// apply to a newly selected control. A Label auto-focuses Text; a plain shape
// falls through to Fill, then Box.
export const APPEARANCE_FACET_ORDER = ['text', 'fill', 'border', 'box', 'effects', 'icon'];

export const activeFacet = writable('text');

export function setFacet(facet) {
  if (!facet) return;
  activeFacet.set(facet);
}
