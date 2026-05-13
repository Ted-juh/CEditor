import { writable } from 'svelte/store';

export const componentWorkspaceMode = writable('panel');

export function openComponentSurfaceWorkspace() {
  componentWorkspaceMode.set('surface');
}

export function closeComponentWorkspace() {
  componentWorkspaceMode.set('panel');
}
