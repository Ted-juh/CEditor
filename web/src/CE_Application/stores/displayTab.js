import { writable } from 'svelte/store';

/**
 * Requested display tab — set externally to switch the DisplayPanel's active tab.
 * The DisplayPanel watches this and applies the switch, then clears it.
 * Value: { tab: string } | null
 */
export const displayTabRequest = writable(null);
