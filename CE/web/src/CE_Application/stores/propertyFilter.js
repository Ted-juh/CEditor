import { writable } from 'svelte/store';

// Cross-inspector property search. PropertyCell/PropertySection read this to
// hide rows whose label/hint don't match, and the properties panel writes it
// from a search box. Empty string means "no filter" (everything shows).
export const propertyFilter = writable('');

export function setPropertyFilter(value) {
  propertyFilter.set(String(value ?? ''));
}

export function clearPropertyFilter() {
  propertyFilter.set('');
}
