/**
 * Undo/redo for the General settings page.
 *
 * WHY SETTINGS GETS UNDO AT ALL, given it holds preferences rather than a
 * document. Ctrl+Z in the settings workspace did nothing at all — the tab
 * resolves to no panel (`resolvePanelSelection` returns null for it), so the
 * built-in contexts had nothing to offer and the keystroke fell on the floor.
 * Meanwhile every row on the page is a one-click, immediately-persisted,
 * silently-applied change with no confirmation: knock "Restore Unsaved Work"
 * off, or scrub Default Grid Size past the value you wanted, and the number you
 * had is gone. Undo costs nothing here because nothing else wants the chord.
 *
 * WHY ONLY GENERAL. The other settings sections are ACTIONS, not editable
 * state: Fonts and Icons import and delete files, MIDI opens and closes
 * devices, Toolchains provisions them. Reverting those by writing an old
 * snapshot back would be a lie at best (the file is gone) and a device-level
 * side effect at worst. General is the one section that is purely a set of
 * values, so it is the one section registered — and it registers only while it
 * is the section on screen, so nothing about it can claim undo from the others.
 *
 * The contract for the registry lives above `registerHistoryContext()` in
 * stores/history.js. Read it before changing anything here.
 */

import { get } from 'svelte/store';
import { generalSettings, updateGeneralSettings } from '../stores/appSettings.js';
import {
  registerHistoryContext,
  resetHistoryBaseline,
  scheduleSnapshot,
} from '../stores/history.js';

/** The history key for the General page. One page, one document, one stack. */
export const GENERAL_SETTINGS_HISTORY_KIND = 'settings';
export const GENERAL_SETTINGS_HISTORY_ID = 'general';

/**
 * Register the General settings page as an undo context for as long as it is
 * mounted. Returns the function that unregisters it again.
 *
 * The store parameters exist so a test can drive this without the real
 * preferences singleton; the designer and the app always take the defaults.
 */
export function registerGeneralSettingsHistory({
  isActive,
  settings = generalSettings,
  apply = updateGeneralSettings,
} = {}) {
  let lastJson = null;

  const unregister = registerHistoryContext({
    kind: GENERAL_SETTINGS_HISTORY_KIND,
    id: GENERAL_SETTINGS_HISTORY_ID,
    isActive: isActive ?? (() => true),
    // A shallow copy: the values are scalars, and the store hands out a fresh
    // object on every update, so nothing history keeps can be mutated later.
    snapshot: () => ({ ...(get(settings) ?? {}) }),
    // Preferences have no saved/unsaved state to be in — every change is
    // written through as it is made — so the state on screen is always the
    // saved one and `meta.modified` is always false. Saying so keeps history
    // from reporting a dirty document that has no way to be saved.
    isClean: () => true,
    restore: (snapshot) => {
      // Back through the normal write path, so an undone preference is applied
      // to the runtime and persisted exactly as if it had been typed.
      apply({ ...snapshot });
    },
  });

  // A plain store subscription, no `$effect` involved: this is the only editable
  // state on the page and it already lives in a store, so there is nothing to
  // watch a component for.
  const unsubscribe = settings.subscribe((value) => {
    const json = JSON.stringify(value ?? null);
    if (json === lastJson) return;
    const first = lastJson == null;
    lastJson = json;
    // The first emission is the state the page opened in — subscribing fires it
    // synchronously — so it is the baseline, not an edit.
    if (first) resetHistoryBaseline();
    else scheduleSnapshot();
  });

  return () => {
    unsubscribe();
    unregister();
  };
}
