import { writable, get } from 'svelte/store';
import { resolvedActivePanelId, selectedComponentIds } from './panels.js';

/**
 * editorTarget.js — one store for every dock tab that edits a control.
 *
 * WHY THIS IS ONE STORE AND NOT THREE. `colorTarget.js` and `gradientTarget.js` are the same file
 * twice, down to an identical fourteen-line lifecycle block that `gradientTarget.js` labels
 * "mirror colorTarget.js". The Effects tab shipped with a third copy. Typography would have been a
 * fourth, and the space plan's whole complaint about that duplication would have been written by
 * the same hand that kept adding to it.
 *
 * So the shape is a REGISTRY: a target names its `kind`, the kind names its dock tab, and adding a
 * tab is adding a row rather than writing a store. Colour and gradient are not folded in here —
 * they carry an initial VALUE through the target (`_initialColor`, `_initialGradient`) and the dock
 * syncs from it, which is a different contract from "here is a control, go read it". Merging those
 * two is a separate job; this stops the bleeding.
 *
 * Target shape:
 *   { kind: 'effects' | 'typography' | 'assets' | 'screen' | 'api', type: 'control', controlId: 'ctrl_1', domain: string|null }
 *   null — nothing armed; the tab shows its empty state.
 *
 * WHY IT DOES NOT FOLLOW THE SELECTION. Decided for the Effects tab and inherited here. The Colors
 * tab clears its target on a selection change because a stale write-route silently repaints an
 * object the user moved on from. These tabs hold the same kind of route, so they take the rule with
 * one difference: they do not RETARGET when the selection changes, they keep editing what they were
 * opened on, and the tab header names that control at all times. Retargeting would change what is
 * under your hands mid-edit; clearing would mean re-opening the tab after every click, which is the
 * most common action in the editor. The header naming the control is what makes staying put safe
 * rather than confusing — it is the fix the 2026-08-13 review asked for when it found the colour
 * dock had "no label saying what is being edited".
 *
 * The target IS dropped when the active panel changes: a control id belongs to a panel, and a stale
 * one across panels is not a stale edit but an edit to nothing.
 */
export const editorTarget = writable(null);

/**
 * kind → the dock tab that edits it, and which domains it accepts.
 *
 * `domains` is null when the kind does not use them. Keeping it here rather than in each tab means
 * `impliedDockTab` can route a target without importing either tab.
 */
export const EDITOR_TARGET_KINDS = {
  effects: { tab: 'effects', domains: ['text', 'component', 'lighting'] },
  typography: { tab: 'type', domains: ['type', 'flow'] },
  // Assets has no halves — one library, one stage — so it has no domains. Which asset is selected
  // is the tab's own state and deliberately not carried here: `domains` is a fixed list validated
  // on the way in, and an asset name is neither fixed nor known to this file.
  assets: { tab: 'assets', domains: null },
  // Screen has no halves either. Which page and which zone are selected are the tab's own state:
  // both belong to the control's data, not to a fixed list this file could validate against.
  screen: { tab: 'screen', domains: null },
  // The API tab has no halves either: which row is selected is the tab's own state.
  api: { tab: 'api', domains: null },
};

export function isEditorTargetKind(kind) {
  return Object.hasOwn(EDITOR_TARGET_KINDS, String(kind));
}

/** The dock tab a target wants, or '' when there is nothing armed. */
export function tabForEditorTarget(target) {
  return EDITOR_TARGET_KINDS[target?.kind]?.tab ?? '';
}

/**
 * Arm a tab on a control.
 *
 * `domain` is optional — a caller that only knows "edit this control's effects" does not have to
 * work out whether it is a label or a screen; the tab picks the first domain the control has.
 */
export function activateEditorTarget(kind, controlId, domain = null) {
  if (!isEditorTargetKind(kind) || !controlId) return null;
  const allowed = EDITOR_TARGET_KINDS[kind].domains;
  const target = {
    kind,
    type: 'control',
    controlId,
    domain: allowed?.includes(domain) ? domain : null,
  };
  editorTarget.set(target);
  return target;
}

/** Switch domain without re-arming, so a tab's own sub-switch keeps the same control. */
export function setEditorTargetDomain(domain) {
  editorTarget.update((target) => {
    if (!target) return target;
    const allowed = EDITOR_TARGET_KINDS[target.kind]?.domains;
    if (allowed && !allowed.includes(domain)) return target;
    return { ...target, domain };
  });
}

export function clearEditorTarget() {
  editorTarget.set(null);
}

/** The armed target when it is of `kind`, otherwise null — what a tab reads so it ignores a target
 *  belonging to a sibling tab. */
export function targetOfKind(target, kind) {
  return target?.kind === kind ? target : null;
}

// --- Target lifecycle -------------------------------------------------------
// Only the panel change clears. A selection change deliberately does not — see the header.
let panelSeen = false;
resolvedActivePanelId.subscribe(() => {
  if (!panelSeen) { panelSeen = true; return; }
  if (get(editorTarget)) editorTarget.set(null);
});

// Imported and re-exported on purpose: it documents that the selection was considered and rejected
// as a clear trigger, and stops the import being "helpfully" added later by someone matching this
// file against colorTarget.js.
export const SELECTION_DOES_NOT_CLEAR_EDITOR_TARGET = selectedComponentIds;
