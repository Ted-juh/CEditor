/**
 * dockOpeners.js — the way from the properties panel into a dock tab.
 *
 * WHY THIS EXISTS. Eight tabs were built — Effects, Type, Assets, Screen, API, Library, Animation,
 * Designer — and until now not one of them could be reached from the properties panel. `grep` for
 * `displayTabRequest` found four setters in the whole application: the colour swatch, the canvas
 * "Align…" menu, one gradient button on the panel card, and the custom design surface. The eight
 * new tabs had none, so the only way in was to find the tab in the dock strip yourself and then
 * press "Use selection".
 *
 * COLOURS IS THE PRECEDENT, and it is worth being precise about what it does, because these tabs
 * cannot copy it exactly. `SwatchCluster` sets the colour target AND requests the tab, in that
 * order, from a widget that is itself the value being edited. None of these eight has a
 * single-value widget like a swatch — an effect stack is not one colour — so the way in is an icon
 * in the SECTION HEADER instead, in the `tools` slot `PropertySection` already provides.
 *
 * BOTH HALVES ARE NEEDED. Arming a target only says WHAT is being edited; the thing that edits it
 * is the dock, which may be hidden or sitting on Notepad. `App.svelte` un-hides the dock whenever
 * `displayTabRequest` changes, so requesting the tab covers that — but a target armed without a tab
 * request lands the user on whatever tab they left open, which looks like nothing happening.
 * `CustomDesignSurfaceEditor.svelte` records the same lesson for its own local dock.
 *
 * This module is the pure half: which tab, which target kind, what the button says.
 * `properties/OpenInDock.svelte` is the button. `dockOpeners.test.js` checks every row against the
 * shipped tab strip and the shipped target-kind registry, so a tab renamed in one place and not the
 * other fails rather than opening nothing.
 */

/**
 * tab id → what the opener does.
 *
 * `kind` is the `EDITOR_TARGET_KINDS` row the button arms, or '' for a tab that edits no particular
 * control (Library edits the library). `domains` lists the domains that tab accepts, so a call site
 * asking for one that does not exist fails a test rather than being silently dropped.
 */
export const DOCK_OPENERS = {
  effects: { tab: 'effects', label: 'Effects', kind: 'effects', domains: ['text', 'component', 'lighting'] },
  type: { tab: 'type', label: 'Text', kind: 'typography', domains: ['type', 'layout', 'fill', 'flow', 'lines', 'effects'] },
  assets: { tab: 'assets', label: 'Assets', kind: 'assets', domains: [] },
  screen: { tab: 'screen', label: 'Screen', kind: 'screen', domains: [] },
  api: { tab: 'api', label: 'API', kind: 'api', domains: [] },
  library: { tab: 'library', label: 'Library', kind: '', domains: [] },
  animation: { tab: 'animation', label: 'Animation', kind: 'animation', domains: [] },
  designer: { tab: 'designer', label: 'Designer', kind: 'designer', domains: [] },
};

export function openerFor(tab) {
  return DOCK_OPENERS[String(tab ?? '')] ?? null;
}

export function dockOpenerTabs() {
  return Object.keys(DOCK_OPENERS);
}

/**
 * Is this a domain the tab accepts?
 *
 * A tab with no domains takes none; passing one anyway is a call-site mistake worth catching, not a
 * value to forward and have `activateEditorTarget` quietly drop.
 */
export function acceptsDomain(tab, domain) {
  if (domain == null || domain === '') return true;
  return (DOCK_OPENERS[String(tab ?? '')]?.domains ?? []).includes(String(domain));
}

/** What the button's tooltip says, so every opener in the panel says the same thing. */
export function openerTitle(tab, what = '') {
  const opener = openerFor(tab);
  if (!opener) return '';
  return what
    ? `Edit ${what} in the ${opener.label} tab`
    : `Open the ${opener.label} tab`;
}
