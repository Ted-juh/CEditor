import { writable } from 'svelte/store';

/**
 * Requested PropertiesPanel tab — set externally to jump the panel to a section
 * (e.g. the Device insight zone's "Properties" button → 'devicebindings').
 * PropertiesPanel watches this, switches its single-view tab, then clears it.
 * A fresh object each call so repeated requests for the same tab still fire.
 * Value: { tabId: string } | null
 */
export const propertiesTabRequest = writable(null);

export function requestPropertiesTab(tabId) {
  if (!tabId) return;
  propertiesTabRequest.set({ tabId: String(tabId) });
}
