import { writable } from 'svelte/store';

export const deviceParameterDrag = writable(null);

export function startDeviceParameterDrag(payload) {
  deviceParameterDrag.set(payload ?? null);
}

export function clearDeviceParameterDrag() {
  deviceParameterDrag.set(null);
}
