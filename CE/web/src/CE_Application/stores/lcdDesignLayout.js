import { writable } from 'svelte/store';

// Which layout each LCD display shows on the DESIGN canvas (controlId -> layoutId).
// This is a transient view preference — deliberately NOT stored in the panel data,
// so it can never leak into saved panels or change how a panel renders elsewhere.
// Empty/absent = fall back to the Pages default layout.
export const lcdDesignLayoutIds = writable({});

export function setLcdDesignLayout(controlId, layoutId) {
  const id = String(controlId ?? '');
  if (!id) return;
  lcdDesignLayoutIds.update((map) => ({ ...map, [id]: String(layoutId ?? '') }));
}
