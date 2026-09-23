import { writable, get } from 'svelte/store';
import { activePanel, resolvedActivePanelId, selectedComponentIds, updatePanel } from './panels.js';
import { controlSetForPanel, isTokenReference, resolveColourLiteral } from '../models/controlSets.js';
import { inspectorStateNameForPath, updateControlProperty, updateInspectorControlProperty } from './controls.js';
import { stateEditScope } from './stateEditScope.js';

/**
 * Color target binding store.
 *
 * When a swatch is clicked anywhere in the UI, it registers a "target"
 * describing where to write color changes back to. The DisplayPanel's
 * ColorChooser reads this target and routes live updates to the right place.
 *
 * Target shape:
 *   { type: 'panel', prop: 'bgColour' }
 *   { type: 'panel', prop: 'gridColour' }
 *   { type: 'control', controlId: 'ctrl_1', path: 'Background.Fill.colour' }
 *   null  (no active target — default panel bgColour behavior)
 *
 * WHY A GLOBAL DOCK AND NOT AN ANCHORED POPOVER — a decision, recorded here because the review
 * that argued the other way has been deleted and this is the file the argument was about.
 *
 * The 2026-08-13 GUI review's S3 called this out as a structural problem: Canva, Figma and
 * Illustrator all anchor colour editing next to the thing being edited, while CEditor routes it
 * through a dock at the far end of the window that can push the edited object out of view. That
 * reading was accepted; the conclusion was not. The owner elected to KEEP colour and gradient
 * editing in the display panel, and the complaints that were really about the dock being unusable
 * — no label saying what is being edited, no Done, no Cancel, a target that outlived its selection
 * and silently repainted the wrong object, and 44% of the viewport for a colour picker — were
 * fixed in place instead. One editing surface for colour, everywhere, is the rule.
 *
 * The single exception is the gradient STOP, which gets components/StopColourPopover.svelte,
 * because editing a stop through the dock meant leaving the gradient editor and coming back —
 * the gradient itself was the thing being pushed off screen.
 *
 * So: if you are here to add an anchored colour popover for controls, this is not an oversight.
 * Reopen the decision deliberately.
 */
export const colorTarget = writable(null);

/**
 * Activate a color target and return the current color value.
 * Call this when a swatch is clicked.
 *
 * @param {object} target - The target descriptor
 * @param {string} currentColor - The current RRGGBB (6-char) or AARRGGBB (8-char) color
 * @returns {{ color: string, alpha: number }} Parsed color + alpha for the ColorChooser
 */
export function activateColorTarget(target, currentColor) {
  // A value linked to the control set ('{accent}') opens the chooser at the colour the active
  // set gives it. What the chooser writes back is a literal — which is what "override" means in
  // docs/design/control-sets.md: the link breaks for this property and nothing else.
  const literal = isTokenReference(currentColor)
    ? resolveColourLiteral(currentColor, controlSetForPanel(get(activePanel)), '333333')
    : currentColor;
  // Parse AARRGGBB or RRGGBB
  const hex = (literal || '333333').replace(/^#/, '');
  let color, alpha;
  if (hex.length === 8) {
    alpha = parseInt(hex.slice(0, 2), 16) / 255;
    color = hex.slice(2, 8);
  } else {
    alpha = 1;
    color = hex.slice(0, 6);
  }

  // Attach initial color to the target so DisplayPanel can sync
  colorTarget.set({ ...target, _initialRawColor: currentColor, _initialColor: color, _initialAlpha: alpha });

  return { color, alpha };
}

/** Arm a colour target owned by a state-aware property inspector. */
export function activateInspectorColorTarget(target, currentColor) {
  const stateName = target?.type === 'control'
    ? inspectorStateNameForPath(target.path)
    : '';
  return activateColorTarget({ ...target, _inspectorStateName: stateName }, currentColor);
}

/**
 * Apply a color change from the ColorChooser to the active target.
 * Called by DisplayPanel's handleColorChange when a colorTarget is active.
 *
 * @param {string} hex - AARRGGBB (8-char) hex from ColorChooser
 */
export function applyColorToTarget(hex) {
  const target = get(colorTarget);
  if (!target) return;

  if (target.type === 'panel') {
    const panelId = get(resolvedActivePanelId);
    if (panelId == null) return;

    // All panel colour properties use AARRGGBB
    updatePanel(panelId, { [target.prop]: hex, modified: true });
  } else if (target.type === 'control') {
    // Control properties use AARRGGBB
    if (Object.prototype.hasOwnProperty.call(target, '_inspectorStateName')) {
      updateInspectorControlProperty(target.controlId, target.path, hex, target._inspectorStateName);
    } else {
      updateControlProperty(target.controlId, target.path, hex);
    }
  } else if (target.type === 'callback' && typeof target.apply === 'function') {
    target.apply(hex);
  }
}

/** Return the exact pre-edit value only after the session made a live write. */
export function colorTargetRestoreValue(target, dirty) {
  return dirty && target?._initialRawColor != null ? target._initialRawColor : null;
}

/**
 * Clear the color target (go back to default behavior).
 */
export function clearColorTarget() {
  colorTarget.set(null);
}

// --- Target lifecycle -------------------------------------------------------
// A target is a live write-route into a specific property. It must not outlive
// the moment it was created for: changing the selection or switching panels
// used to leave the target armed, so reopening the dock and dragging a band
// silently repainted an object the user had long moved on from.
let selectionSeen = false;
selectedComponentIds.subscribe(() => {
  if (!selectionSeen) { selectionSeen = true; return; }
  if (get(colorTarget)) colorTarget.set(null);
});

let panelSeen = false;
resolvedActivePanelId.subscribe(() => {
  if (!panelSeen) { panelSeen = true; return; }
  if (get(colorTarget)) colorTarget.set(null);
});

let stateScopeSeen = false;
stateEditScope.subscribe(() => {
  if (!stateScopeSeen) { stateScopeSeen = true; return; }
  if (get(colorTarget)) colorTarget.set(null);
});
