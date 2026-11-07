// unsavedEditors.js — editors that hold unsaved work in themselves rather than in a document store.
//
// A panel, a component, a script workspace and a screen each carry a `modified` flag in their store,
// so anything can ask whether they have unsaved changes. The Device Profile Designer does not: its
// working copy and its history live in the component (editor/DeviceProfileDesignerV2.svelte). So it
// says so here, and closing its tab or quitting the program (stores/quitGuard.js) can ask it.
//
// An entry: { kind, profileId?, name(), isDirty(), canSave(), save(), whyNot() }. Functions, not values:
// what is asked is what is true when it is asked.

const editors = new Map();
let nextKey = 0;

/** Register an editor; returns the function that removes it (call it when the editor goes away). */
export function registerUnsavedEditor(entry) {
  const key = `editor_${++nextKey}`;
  editors.set(key, entry);
  return () => { editors.delete(key); };
}

/** The editors with unsaved work now. */
export function dirtyEditors() {
  return [...editors.entries()]
    .filter(([, entry]) => { try { return entry.isDirty?.() === true; } catch { return false; } })
    .map(([key, entry]) => ({ key, entry }));
}

/** The editors showing one device profile (a tab and a split can both). */
export function profileEditors(profileId) {
  return [...editors.values()].filter((entry) => entry.kind === 'deviceProfile' && String(entry.profileId) === String(profileId));
}
