import { writable } from 'svelte/store';

const DEFAULT_STATE = {
  title: 'Debug',
  source: '',
  text: '',
};

export const debugDockState = writable(DEFAULT_STATE);

export function setDebugDock(payload = {}) {
  debugDockState.set({
    ...DEFAULT_STATE,
    ...payload,
    title: String(payload?.title ?? DEFAULT_STATE.title),
    source: String(payload?.source ?? ''),
    text: String(payload?.text ?? ''),
  });
}

export function clearDebugDock() {
  debugDockState.set(DEFAULT_STATE);
}
