/**
 * workspacePickerEntries.js — the rows the shared "open a saved thing" picker shows.
 *
 * Review finding D6: the File menu's "Open Saved Custom Component" opened `library[0]` with no
 * picker while the tab strip showed a real one. Two implementations of one question is how they
 * drifted apart in the first place, so the row-building and the one-entry shortcut live here and
 * both surfaces read them.
 *
 * `shouldOpenDirectly` is the tab strip's existing behaviour, kept: with exactly one saved
 * package a picker is a dialog whose only purpose is to be dismissed. With none, it must still
 * open — the empty state is the only thing that explains why nothing happened.
 *
 * Device profiles used to be listed here too; there are ninety-odd now, and they have a picker of
 * their own (layout/DeviceProfilePicker.svelte).
 */

export function componentPickerEntries(library) {
  return (Array.isArray(library) ? library : []).map((entry) => ({
    key: entry.id,
    title: entry.name || entry.id,
    subtitle: `${entry.version ?? '1.0.0'} · ${entry.category || 'custom'}`,
    entry,
  }));
}

export function shouldOpenDirectly(entries) {
  return Array.isArray(entries) && entries.length === 1;
}
