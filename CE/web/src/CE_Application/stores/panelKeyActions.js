// panelKeyActions.js — set the panel's key, and keep the followers in step.
//
// The store half of `utils/panelKey.js`. One action, `setPanelKey`, which writes the panel's context
// and then broadcasts it into every component that opted in. It reports what it could not do rather
// than doing something approximate: a panel set to a scale the note components have no name for
// leaves those followers alone and says so.

import { get } from 'svelte/store';
import { panels, resolvedActivePanelId, updatePanel } from './panels.js';
import { applyControlPatchesById, updateControlProperty } from './controls.js';
import {
  inferPanelContext, panelKeyPlan, panelMusicalContext,
} from '../utils/panelKey.js';
import { normalizeContext } from '../utils/musicalContext.js';

function activePanel() {
  const id = get(resolvedActivePanelId);
  return get(panels).find((entry) => entry.id === id) ?? null;
}

/** The active panel's key and scale. */
export function currentPanelContext() {
  return panelMusicalContext(activePanel());
}

/** Whether the panel has ever had a key set — as opposed to having the default one. */
export function hasPanelContext() {
  return !!activePanel()?.musicalContext;
}

/**
 * What the panel key would be if it were switched on now.
 *
 * Offered rather than assumed: writing C major over a panel already in F minor throughout would be
 * a destructive first impression of a convenience feature.
 */
export function suggestedPanelContext() {
  return inferPanelContext(activePanel());
}

/**
 * Set the panel's key and broadcast it.
 *
 * Returns `{ ok, changed, skipped }`. `skipped` is the followers whose scale vocabulary has no name
 * for the chosen one — reported, never rounded, because a chord pad quietly playing the wrong mode
 * is the kind of bug somebody blames on their ears.
 */
export function setPanelKey(context) {
  const panel = activePanel();
  if (!panel) return { ok: false, changed: 0, skipped: [] };

  const next = normalizeContext(context);
  updatePanel(panel.id, { musicalContext: next });

  // Re-read: `updatePanel` may normalise, and the plan must be computed from what was actually
  // stored rather than from what we asked for.
  const plan = panelKeyPlan({ ...panel, musicalContext: next });
  // One patch map rather than two writes per follower: a key change is one edit, and eight separate
  // store passes would be eight undo steps for something the author did once.
  applyControlPatchesById(new Map(plan.changes.map((change) => [
    change.controlId,
    { [`${change.section}.key`]: change.patch.key, [`${change.section}.scale`]: change.patch.scale },
  ])));

  return { ok: true, changed: plan.changes.length, skipped: plan.skipped, context: next };
}

/**
 * Turn following on or off for one control, and bring it into line immediately if it is now a
 * follower.
 *
 * Doing the catch-up here rather than waiting for the next key change is the difference between a
 * checkbox that appears to do nothing and one that does what it says.
 */
export function setFollowsPanelKey(controlId, section, follows) {
  updateControlProperty(controlId, `${section}.followPanelKey`, follows === true);
  if (follows !== true) return { ok: true, changed: 0 };

  const panel = activePanel();
  if (!panel) return { ok: true, changed: 0 };

  const plan = panelKeyPlan(panel);
  const mine = plan.changes.filter((change) => change.controlId === controlId);
  applyControlPatchesById(new Map(mine.map((change) => [
    change.controlId,
    { [`${change.section}.key`]: change.patch.key, [`${change.section}.scale`]: change.patch.scale },
  ])));
  return { ok: true, changed: mine.length, skipped: plan.skipped.filter((entry) => entry.controlId === controlId) };
}
