import { writable, derived, get } from 'svelte/store';
import { selectedControl } from './controls.js';
import { setDebugDock } from './debugDock.js';

const DEFAULT_SESSION = {
  enabled: true,
  hover: false,
  pressed: false,
  focused: false,
  dragging: false,
  disabled: false,
  checked: false,
  mixed: false,
  valueOverrideEnabled: false,
  valueOverride: 0,
  animationsEnabled: true,
  autoDebug: false,
};

export const interactionPreviewSessions = writable({});

export function getDefaultInteractionPreviewSession() {
  return { ...DEFAULT_SESSION };
}

function shallowEqualSession(left, right) {
  if (left === right) return true;
  if (!left || !right) return false;

  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (left[key] !== right[key]) return false;
  }
  return true;
}

export function updateInteractionPreviewSession(controlId, patch = {}) {
  if (!controlId) return;
  interactionPreviewSessions.update((current) => {
    const previousSession = {
      ...DEFAULT_SESSION,
      ...(current[controlId] ?? {}),
    };
    const nextSession = {
      ...previousSession,
      ...patch,
    };

    if (shallowEqualSession(previousSession, nextSession)) {
      return current;
    }

    return {
      ...current,
      [controlId]: nextSession,
    };
  });
}

export function resetInteractionPreviewSession(controlId) {
  if (!controlId) return;
  interactionPreviewSessions.update((current) => ({
    ...current,
    [controlId]: { ...DEFAULT_SESSION },
  }));
}

export function removeInteractionPreviewSession(controlId) {
  if (!controlId) return;
  interactionPreviewSessions.update((current) => {
    const next = { ...current };
    delete next[controlId];
    return next;
  });
}

export const selectedInteractionPreview = derived(
  [selectedControl, interactionPreviewSessions],
  ([$selectedControl, $sessions]) => {
    const controlId = $selectedControl?._children?.Core?.id;
    if (!controlId) return null;
    return {
      controlId,
      session: {
        ...DEFAULT_SESSION,
        ...($sessions[controlId] ?? {}),
      },
    };
  }
);

export function dumpSelectedInteractionDebug(payload) {
  const selected = get(selectedInteractionPreview);
  if (!selected?.controlId) return;
  setDebugDock({
    title: 'Interaction Debug',
    source: selected.controlId,
    text: JSON.stringify(payload ?? {}, null, 2),
  });
}
