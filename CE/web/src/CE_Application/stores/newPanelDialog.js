import { writable } from 'svelte/store';

/** Whether the New Panel dialog is open. Every user-facing "New Panel"
 *  entry point (menu, tab bar, empty state, Ctrl+N) opens this dialog;
 *  addPanel() stays the raw programmatic path. */
export const newPanelDialogOpen = writable(false);

export function openNewPanelDialog() {
  newPanelDialogOpen.set(true);
}

export function closeNewPanelDialog() {
  newPanelDialogOpen.set(false);
}
