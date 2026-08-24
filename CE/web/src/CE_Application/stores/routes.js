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
import { panelPreviewSessions, updatePanelPreviewSession } from './interactionPreview.js';
import { panelRoutes, routeWriteTarget } from '../utils/routeAdapters.js';
import {
  endpointAddress, makeRoute, normalizeRoute, routeCycles, settleRoutes, wouldCycle,
} from '../utils/routeModel.js';
import { flatControls } from '../utils/containment.js';

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

function controlById(panel, id) {
  return flatControls(Array.isArray(panel?.controls) ? panel.controls : [])
    .find((control) => String(control?._children?.Core?.id ?? '') === String(id)) ?? null;
}

/**
 * A control port's value spec — min, max, step — so a route can map into the target's real range.
 *
 * Falls back to 0..1 rather than to nothing, because a route into a port whose range we cannot read
 * should still move something. A route that silently did nothing would be indistinguishable from a
 * route that was never made.
 */
export function specForEndpoint(panel, endpoint) {
  if (!endpoint || endpoint.kind === 'device') return null;
  const control = controlById(panel, endpoint.controlId);
  if (!control) return null;

  const channel = control?._children?.ValueChannels?._children?.[endpoint.port];
  if (channel) return { min: channel.min ?? 0, max: channel.max ?? 1, step: channel.step, type: channel.type };

  const behavior = control?._children?.Behavior;
  if (behavior) return { min: behavior.min ?? 0, max: behavior.max ?? 1, step: behavior.step, type: behavior.valueType };

  return { min: 0, max: 1 };
}

/**
 * Read a route endpoint's current value out of the preview sessions.
 *
 * Deliberately narrower than `readParameterValue`, which resolves an EXPORT parameter through three
 * doors. A route endpoint is a control and a port, which is one lookup: a named port is a value
 * channel, and `value` is the control's own. `undefined` for a control nobody has touched, so a
 * route does not fire on a value that was never set.
 */
function readEndpointValue(panel, sessions, endpoint) {
  if (!endpoint || endpoint.kind === 'device') return undefined;
  const session = sessions?.[endpoint.controlId];
  if (!session) return undefined;

  const port = endpoint.port || 'value';
  if (port !== 'value') return session.customValues?.[port];

  if (session.currentValueOverrideEnabled) return session.currentValueOverride;
  if (session.valueOverrideEnabled) return session.valueOverride;
  if (typeof session.checked === 'boolean') return session.checked ? 1 : 0;
  return undefined;
}

/**
 * Guard against re-entry.
 *
 * `applyRoutes` writes preview sessions, and a session write is what would call `applyRoutes` again
 * once this is wired to a source change. Settling already loops internally, so a nested call has
 * nothing to add and everything to lose — it would restart the walk from inside its own pass.
 */
let applying = false;

/**
 * Evaluate the panel's routes and write the results into the preview sessions.
 *
 * Called on a source change, not on a clock, and it SETTLES rather than taking one step: a chain
 * A→B→C moves the whole way on one call. `settleRoutes` holds the loop and the pass cap; this
 * function is only the part that knows where a control's value lives.
 *
 * The cap earns its place even though `addRoute` refuses to draw a loop. A panel file can carry a
 * ring the editor never saw — hand-edited, written by an older build, produced by a converter — and
 * without a limit the settle walks it until the frame dies. With one, the ring costs eight passes
 * and is handed back so the caller can say which wire to cut.
 */
export function applyRoutes() {
  const panel = activePanel();
  if (!panel || applying) return { writes: 0, passes: 0, settled: true, cycles: [] };

  const routes = panelRoutes(panel);
  if (routes.length === 0) return { writes: 0, passes: 0, settled: true, cycles: [] };

  applying = true;
  try {
    return settleRoutes(routes, {
      // Re-read the sessions store every time rather than closing over one snapshot: the point of
      // settling is that a later pass sees what an earlier one wrote.
      readSource: (endpoint) => readEndpointValue(panel, get(panelPreviewSessions) ?? {}, endpoint),
      readTarget: (endpoint) => readEndpointValue(panel, get(panelPreviewSessions) ?? {}, endpoint),
      specFor: (endpoint) => specForEndpoint(panel, endpoint),
      writeTarget: (endpoint, value) => {
        // Device targets go out over MIDI, not into a session. Returning false keeps them out of the
        // change count, so a panel whose only routes point at the device still settles.
        if (endpoint.kind !== 'control') return false;
        const sessions = get(panelPreviewSessions) ?? {};
        const port = endpoint.port || 'value';
        updatePanelPreviewSession(endpoint.controlId, port === 'value'
          ? { valueOverrideEnabled: true, valueOverride: value }
          : { customValues: { ...(sessions?.[endpoint.controlId]?.customValues ?? {}), [port]: value } });
        return true;
      },
    });
  } finally {
    applying = false;
  }
}

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
