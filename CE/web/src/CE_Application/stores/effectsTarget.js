import { writable, get } from 'svelte/store';
import { resolvedActivePanelId, selectedComponentIds } from './panels.js';

/**
 * Effects target binding store — the same shape as `colorTarget` and `gradientTarget`, because the
 * dock already has a way of being told what to edit and a third invention would be a third thing
 * to keep in sync.
 *
 * Target shape:
 *   { type: 'control', controlId: 'ctrl_1', domain: 'text' | 'component' | 'lighting' }
 *   null — nothing armed; the tab shows its empty state.
 *
 * WHY THIS ONE DOES NOT FOLLOW THE SELECTION, which is the opposite of what you might expect and
 * was decided deliberately:
 *
 * The Colors tab clears its target when the selection changes, and the comment in colorTarget.js
 * explains what that rule is defending against — a target is a live write-route into one property
 * path, and one that outlived its selection silently repainted an object the user had moved on
 * from. Effects is armed the same way and holds the same kind of route, so it inherits the rule
 * with one deliberate difference: it does not RETARGET on a selection change, it just keeps
 * editing what it was opened on, and the tab header names that control at all times.
 *
 * That combination is the point. Retargeting would make the dock a second properties panel and
 * would change what is under your hands mid-edit; clearing on every selection change would mean
 * re-opening the tab after every click, which is the most common action in the editor. Naming the
 * control in the header is what makes "stays put" safe rather than confusing, and it is exactly
 * the fix the 2026-08-13 review asked for when it found the colour dock had "no label saying what
 * is being edited".
 *
 * The target IS dropped when the active panel changes, because a control id belongs to a panel and
 * a stale one across panels is not a stale edit, it is an edit to nothing.
 */
export const effectsTarget = writable(null);

export const EFFECT_DOMAINS = ['text', 'component', 'lighting'];

/**
 * Arm the tab on a control.
 *
 * `domain` is optional — the tab picks the first domain the control actually has when it is
 * omitted, so a caller that only knows "edit this control's effects" does not have to work out
 * whether it is a label or a screen.
 */
export function activateEffectsTarget(controlId, domain = null) {
  if (!controlId) return null;
  const target = {
    type: 'control',
    controlId,
    domain: EFFECT_DOMAINS.includes(domain) ? domain : null,
  };
  effectsTarget.set(target);
  return target;
}

/** Switch domain without re-arming, so the Text/Layer/Screen switch keeps the same control. */
export function setEffectsDomain(domain) {
  if (!EFFECT_DOMAINS.includes(domain)) return;
  effectsTarget.update((target) => (target ? { ...target, domain } : target));
}

export function clearEffectsTarget() {
  effectsTarget.set(null);
}

/** True when the armed target no longer names a live control — the tab shows its empty state
 *  rather than writing into nothing. Callers pass the resolved control, so this module stays free
 *  of the control store. */
export function isEffectsTargetStale(target, resolvedControl) {
  return !!target && !resolvedControl;
}

// --- Target lifecycle -------------------------------------------------------
// Only the panel change clears. A selection change deliberately does not — see the header.
let panelSeen = false;
resolvedActivePanelId.subscribe(() => {
  if (!panelSeen) { panelSeen = true; return; }
  if (get(effectsTarget)) effectsTarget.set(null);
});

// Subscribed but unused on purpose: importing `selectedComponentIds` here documents that the
// selection was considered and rejected as a clear trigger, and keeps the import from being
// "helpfully" added later by someone matching this file against colorTarget.js.
export const SELECTION_DOES_NOT_CLEAR_EFFECTS_TARGET = selectedComponentIds;
