import { writable } from 'svelte/store';

/** Currently displayed hint text in the properties info bar */
export const propertyHint = writable('');

/** Set hint text (call on mouseenter/focus) */
export function setHint(text) {
  propertyHint.set(text);
}

/** Clear hint text (call on mouseleave/blur) */
export function clearHint() {
  propertyHint.set('');
}
