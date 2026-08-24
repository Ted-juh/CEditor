// routeSessions.js — routes, applied to the preview sessions.
//
// The half of the route feature that was missing. `routeModel.js` decides what a route computes and
// `routeAdapters.js` says where routes come from; this is the part that actually MOVES a control,
// and until it existed the Routes tab stored intent that nothing acted on: a cable drawn on the
// canvas, refused if it looped, warned about if two `set` routes fought over one target, and never
// evaluated. A feature that validates carefully and then does nothing is worse than an absent one,
// because everything about it says it works.
//
// IT IS AN EFFECT ON THE SESSIONS, not a subscriber to them. That shape is not a preference — it is
// what `applyPanelCustomLinkRoutes` next door already does for custom-component links, which are the
// nearest neighbour this feature has. `interactionPreview.applyPanelSessionEffects` runs both inside
// the store update, so:
//
//   * there is no trigger to get right. Every session write settles the routes, by construction.
//   * there is no re-entrancy. Nothing here calls back into the store; the sessions map being built
//     is threaded through and returned once.
//   * there is no rAF to coalesce. `settleRoutes` writes nothing when the panel is already settled,
//     so a quiet frame costs one pass and zero writes.
//
// The first attempt was a `applyRoutes()` in the store that called `updatePanelPreviewSession` per
// target, which would have re-entered the update it was called from and needed a guard, a frame
// budget and a dirty flag to be safe. None of that is needed once it is a pure function of the
// sessions, which is why the store's version is gone.
//
// DEVICE TARGETS ARE NOT SENT FROM HERE, and that is a real limit rather than an oversight — see
// `applyPanelValueRoutes` for what does reach a synth and what does not.

import { flatControls } from './containment.js';
import { panelRoutes } from './routeAdapters.js';
import { settleRoutes } from './routeModel.js';

const controlIdOf = (control) => String(control?._children?.Core?.id ?? '');

/**
 * A control port's value spec — min, max, step — so a route can map into the target's real range.
 *
 * Falls back to 0..1 rather than to nothing, because a route into a port whose range cannot be read
 * should still move something. A route that silently did nothing would be indistinguishable from a
 * route that was never made.
 */
export function specForEndpoint(panel, endpoint) {
  if (!endpoint || endpoint.kind === 'device') return null;
  const control = controlMapOf(panel).get(String(endpoint.controlId));
  if (!control) return null;

  const channel = control?._children?.ValueChannels?._children?.[endpoint.port];
  if (channel) return { min: channel.min ?? 0, max: channel.max ?? 1, step: channel.step, type: channel.type };

  const behavior = control?._children?.Behavior;
  if (behavior) return { min: behavior.min ?? 0, max: behavior.max ?? 1, step: behavior.step, type: behavior.valueType };

  return { min: 0, max: 1 };
}

/** id → control over the whole tree, so a route can reach a control inside a group. */
export function controlMapOf(panel) {
  return new Map(flatControls(Array.isArray(panel?.controls) ? panel.controls : [])
    .map((control) => [controlIdOf(control), control]));
}

/**
 * Read a route endpoint's current value out of the preview sessions.
 *
 * Deliberately narrower than `readParameterValue`, which resolves an EXPORT parameter through three
 * doors. A route endpoint is a control and a port, which is one lookup: a named port is a value
 * channel, and `value` is the control's own. `undefined` for a control nobody has touched, so a
 * route does not fire on a value that was never set.
 */
export function readRouteEndpointValue(sessions, endpoint) {
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
 * What an `add` route sums ONTO — the target's own value, not the last thing routes wrote to it.
 *
 * THE BUG THIS EXISTS FOR only became reachable when routes started being evaluated. `add`
 * contributes a signed offset around the target's current value, which is correct for a single
 * evaluation and compounds the moment there is a second: pass one writes base + 0.5, pass two reads
 * that back as the base and writes base + 1.0, and a modulated parameter walks to its own ceiling
 * without anybody touching it. Across frames it does the same thing more slowly.
 *
 * So the base is remembered, and invalidates itself with no coordination. The effect writes the
 * computed value and, beside it, both the base it used and the value it wrote. Next time round:
 *
 *   * the stored value still matches what is there → routes own this target, keep the base;
 *   * it does not → somebody else wrote it, and what they wrote IS the new base.
 *
 * That second case is what makes a modulated fader still draggable: you drag it to set the base and
 * the modulator rides on top, which is what a mod matrix row means. Nothing has to be told about
 * the drag — the mismatch is the signal.
 */
function evaluationBase(sessions, endpoint) {
  const session = sessions?.[String(endpoint.controlId)];
  if (!session) return undefined;
  const live = readRouteEndpointValue(sessions, endpoint);
  const stored = session.routeBases?.[endpoint.port || 'value'];
  if (!stored) return live;
  return stored.wrote === live ? stored.base : live;
}

/** The sessions map with one endpoint's value written into it. Returns a new map. */
function writeEndpointValue(sessions, endpoint, value, base) {
  const id = String(endpoint.controlId);
  const previous = sessions?.[id] ?? {};
  const port = endpoint.port || 'value';
  const routeBases = { ...(previous.routeBases ?? {}), [port]: { base, wrote: value } };
  const next = port === 'value'
    ? { ...previous, routeBases, valueOverrideEnabled: true, valueOverride: value }
    : { ...previous, routeBases, customValues: { ...(previous.customValues ?? {}), [port]: value } };
  return { ...sessions, [id]: next };
}

/**
 * Settle the panel's routes into the preview sessions.
 *
 * WHAT REACHES A SYNTH AND WHAT DOES NOT, because the two paths are easy to confuse:
 *
 *   * A route ending at a CONTROL is applied here. That is "this knob moves that fader", and it is
 *     what had no implementation at all before this.
 *   * A route ending at a DEVICE parameter is not sent from here and cannot be: this is a pure
 *     function of the sessions and sending MIDI is not that. For a Macro slot it does not need to
 *     be — a slot with a `DeviceBindings` entry already goes out through
 *     `emitControlPortFanout` on every drag, which is a separate, older and working path.
 *   * A route an author draws by hand from a control to a device parameter is therefore the one
 *     combination that still does nothing. `deviceTargetedRoutes` names them so the Routes tab can
 *     say so, rather than leaving somebody to discover it by watching a synth not move.
 *
 * Returns the same object when nothing moved, so the store's shallow comparison keeps working and a
 * settled panel does not re-render on every session write.
 */
export function applyPanelValueRoutes(panel, sessions = {}) {
  const routes = panelRoutes(panel);
  if (!routes.length) return sessions;

  const specs = (endpoint) => specForEndpoint(panel, endpoint);
  let next = sessions ?? {};
  // The base each target is evaluated against, fixed for the whole settle. Read once per target
  // rather than per pass, because a pass writes the target and the next pass would then read its own
  // output back as the base.
  const bases = new Map();
  const baseFor = (endpoint) => {
    const key = `${endpoint.controlId}:${endpoint.port || 'value'}`;
    if (!bases.has(key)) bases.set(key, evaluationBase(next, endpoint));
    return bases.get(key);
  };

  settleRoutes(routes, {
    // `next` rather than a captured snapshot: settling means a later pass sees what an earlier one
    // wrote, which is the whole reason a chain A→B→C moves the whole way on one call.
    readSource: (endpoint) => readRouteEndpointValue(next, endpoint),
    // What an `add` route sums onto — held still for the settle. See `evaluationBase`.
    readTarget: baseFor,
    // What the idempotence guard compares against, which is the live value and moves every pass.
    readCurrent: (endpoint) => readRouteEndpointValue(next, endpoint),
    specFor: specs,
    writeTarget: (endpoint, value) => {
      // Device targets go out over MIDI, not into a session. Returning false keeps them out of the
      // change count so a panel whose only routes point at the device still settles rather than
      // burning all eight passes on a write that never lands.
      if (endpoint.kind !== 'control') return false;
      next = writeEndpointValue(next, endpoint, value, baseFor(endpoint));
      return true;
    },
  });

  return next;
}

/**
 * Routes that end at a device parameter and are not a Macro or Router slot.
 *
 * The combination nothing sends. A Macro's own slots reach the synth through the fan-out path, so
 * they are excluded — flagging those would be a warning about something that works, which teaches
 * people to ignore the warning.
 */
export function deviceTargetedRoutes(routes) {
  return (routes ?? []).filter((route) => route?.to?.kind === 'device'
    && (route.origin ?? 'panel') === 'panel'
    && route.enabled !== false);
}
