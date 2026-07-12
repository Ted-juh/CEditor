// Global Simple/Advanced mode for the custom component creator (§11.2).
//
// Simple hides the raw component-graph list managers (Channels, Behaviors,
// Hit Zones, Bindings, Links, Variants) so the common path leads with the
// design surface, Make Interactive, the API editor, and the Test Bench.
// Advanced exposes the full graph. Same data model underneath — nothing is
// deleted or disabled, only progressively disclosed, and the toggle is
// always visible so an author can never feel stuck in the wrong mode.
import { writable } from 'svelte/store';

const STORAGE_KEY = 'ceditor.creatorMode';

function initialMode() {
  // Default to Simple so a new component opens decluttered (the whole point of
  // the progressive-disclosure pass); once a user picks Advanced it persists.
  try {
    return localStorage.getItem(STORAGE_KEY) === 'advanced' ? 'advanced' : 'simple';
  } catch {
    return 'simple';
  }
}

export const creatorMode = writable(initialMode());

creatorMode.subscribe((mode) => {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Persistence is best-effort (e.g. no localStorage in tests).
  }
});

// Property-panel tabs Simple mode hides for custom components. These are the
// remaining raw-graph list managers; Interact/Publish handle the common path
// (Interact additionally gates its own flat lists on Advanced).
export const CREATOR_SIMPLE_HIDDEN_TABS = new Set([
  'bindings',
  'links',
]);

export function toggleCreatorMode() {
  creatorMode.update((mode) => (mode === 'simple' ? 'advanced' : 'simple'));
}
