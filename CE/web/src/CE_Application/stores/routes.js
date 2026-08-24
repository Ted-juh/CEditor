// routes.js — the panel's routes, and the actions that edit them.
//
// The store half of the route model: reading the panel's routes (its own plus the ones derived from
// Macro slots and Router destinations), adding and removing panel routes, and refusing the ones
// that would close a loop.
//
// THE LOOP REFUSAL IS THE POINT of doing this here rather than in the component. Fan-out routing
// plus a visual canvas makes a cycle trivially easy to draw — A modulates B, B modulates A — and the
// runtime would then chase it forever. Caught at author time, once, in the one place every editor
// goes through.

import { derived, get } from 'svelte/store';
import { panels, resolvedActivePanelId, updatePanel } from './panels.js';
import { panelRoutes, routeWriteTarget } from '../utils/routeAdapters.js';
import {
  endpointAddress, makeRoute, normalizeRoute, routeCycles, wouldCycle,
} from '../utils/routeModel.js';

function activePanel() {
  const id = get(resolvedActivePanelId);
  return get(panels).find((entry) => entry.id === id) ?? null;
}

/** Every route on the active panel, from wherever it lives. */
export const activeRoutes = derived(
  [panels, resolvedActivePanelId],
  ([$panels, $activeId]) => panelRoutes($panels.find((entry) => entry.id === $activeId) ?? null),
);

/** The cycles among them, if any. Empty is the normal state and the editor shows nothing for it. */
export const routeCycleWarnings = derived(activeRoutes, ($routes) => routeCycles($routes));

/**
 * The panel's routes, applied.
 *
 * NOT HERE ANY MORE, and worth a signpost rather than a silent absence. This file used to carry an
 * `applyRoutes()` that read the sessions, settled the routes and wrote each target back through
 * `updatePanelPreviewSession` — which meant it re-entered the store update it would have been
 * called from, needed a re-entrancy guard, and still had no trigger: nothing ever called it, so
 * every route on every panel was stored, validated and never evaluated.
 *
 * `utils/routeSessions.js` does it as a pure function of the sessions instead, run inside
 * `interactionPreview.applyPanelSessionEffects` beside the custom-component links — the nearest
 * neighbour this feature has, which has always worked that way. No trigger to forget, no re-entry
 * to guard, no frame budget to tune.
 */

function writePanelRoutes(next) {
  const panel = activePanel();
  if (!panel) return;
  updatePanel(panel.id, { routes: next });
}

/**
 * Add a route, unless it would close a loop.
 *
 * Returns `{ ok, reason, cycle }` rather than throwing or silently dropping: the editor has to tell
 * the author WHICH wire is the problem, and "add failed" would send them looking at the wrong one.
 */
export function addRoute(spec) {
  const panel = activePanel();
  if (!panel) return { ok: false, reason: 'no panel' };

  const route = normalizeRoute(makeRoute(spec));
  if (!route) return { ok: false, reason: 'not a route' };
  if (!endpointAddress(route.from) || !endpointAddress(route.to)) {
    return { ok: false, reason: 'a route needs both ends' };
  }

  const existing = panelRoutes(panel);
  if (existing.some((entry) => entry.id === route.id)) {
    return { ok: false, reason: 'that route already exists' };
  }
  if (wouldCycle(existing, route)) {
    const cycle = routeCycles([...existing, route])[0] ?? [];
    return { ok: false, reason: 'that would make a loop', cycle };
  }

  writePanelRoutes([...(panel.routes ?? []), route]);
  return { ok: true, route };
}

export function removeRoute(routeId) {
  const panel = activePanel();
  if (!panel) return false;
  const next = (panel.routes ?? []).filter((route) => String(route?.id) !== String(routeId));
  if (next.length === (panel.routes ?? []).length) return false;
  writePanelRoutes(next);
  return true;
}

/**
 * Change one field of a route.
 *
 * A DERIVED ROUTE IS NOT EDITED HERE. A Macro slot read as a route is a view of the slot; writing a
 * panel copy of it would leave the two out of step and the next read would discard the edit
 * silently. So this reports where the real record is and lets the caller go there.
 */
export function updateRoute(routeId, patch) {
  const panel = activePanel();
  if (!panel) return { ok: false, reason: 'no panel' };

  const route = panelRoutes(panel).find((entry) => String(entry.id) === String(routeId));
  if (!route) return { ok: false, reason: 'no such route' };

  const where = routeWriteTarget(route);
  if (where.kind !== 'panel') {
    return { ok: false, reason: `that route belongs to a ${where.kind}`, editAt: where };
  }

  const next = (panel.routes ?? []).map((entry) => (String(entry?.id) === String(routeId)
    ? normalizeRoute({ ...entry, ...patch })
    : entry));
  writePanelRoutes(next);
  return { ok: true };
}
