// routeAdapters.js — read what already routes as routes.
//
// The Link Mapper note's open question was "route storage: on the Mapper, or a shared panel route
// store the node-graph also reads? (Ideally one model, three editors.)" — and answering it with a
// new store would have made the answer worse, not better. Two things on this panel ALREADY fan one
// value out to several destinations with a depth and a curve: the Macro's `slots` and the Router's
// `destinations`. Adding a third place routes can live and calling it "the shared model" would
// leave a Macro's assignments invisible to the node-graph, which is the exact failure the question
// was about.
//
// So the shared model reads them. `panelRoutes` returns one flat list: the panel's own routes, plus
// every Macro slot and Router destination expressed as a route record. The canvas can draw a
// Macro's four assignments as four cables, cycle detection sees them, and nothing had to be
// migrated or duplicated to make that true.
//
// WHAT THIS IS NOT is a rewrite of those two components. They keep their own sections, editors and
// runtimes; this is a READ-ONLY VIEW over them. A route sourced from a Macro slot carries
// `origin: 'macro'` and the ids needed to write back, so an editor can offer to edit it in place
// rather than pretending it owns it.

import { flatControls } from './containment.js';
import { ROUTE_CURVE, ROUTE_MODE, makeRoute, normalizeRoute, routeEndpoint } from './routeModel.js';
import { acceptsFeedback, acceptsInput } from './displayMode.js';

function controlId(control) {
  return String(control?._children?.Core?.id ?? '');
}

function controlName(control) {
  return String(control?._children?.Core?.name ?? controlId(control));
}

function controlType(control) {
  return String(control?._children?.Core?.controlType ?? '');
}

/**
 * A slot or destination's bound device parameter, if it has one.
 *
 * Both components express "where this goes" as a bindable PORT, and the binding that fills it lives
 * in DeviceBindings. An unbound slot is a real and common state — the author added the lane and has
 * not chosen a destination yet — so it becomes a route to nowhere rather than being dropped, which
 * is what lets an editor show it as the incomplete thing it is.
 */
function boundTargetFor(control, portId) {
  const bindings = control?._children?.DeviceBindings;
  if (bindings?.enabled === false) return null;
  const hit = (Array.isArray(bindings?.bindings) ? bindings.bindings : [])
    .find((binding) => String(binding?.port ?? '') === String(portId) && binding?.parameterId);
  if (!hit) return null;
  return routeEndpoint({
    kind: 'device',
    deviceRole: String(hit.deviceRole ?? ''),
    parameterId: String(hit.parameterId ?? ''),
  });
}

/** The Macro's slots, as routes. One source (the macro knob) to many targets. */
export function macroRoutes(control) {
  const macro = control?._children?.Macro;
  if (!macro || macro.enabled === false) return [];
  const id = controlId(control);
  const from = routeEndpoint({ kind: 'control', controlId: id, port: 'value' });

  return (Array.isArray(macro.slots) ? macro.slots : []).map((slot, index) => {
    const port = `slot_${index}`;
    return {
      ...makeRoute({
        id: `macro:${id}:${slot?.id ?? index}`,
        from,
        to: boundTargetFor(control, port) ?? routeEndpoint({ kind: 'control', controlId: id, port }),
        enabled: slot?.enabled !== false,
        // A macro DRIVES its destinations — the knob is the value, not a nudge to it. That is the
        // whole difference between a macro and a mod matrix row, and it is why `mode` exists.
        mode: ROUTE_MODE.set,
        depth: Number(slot?.depth ?? 1),
        outputMin: slot?.min ?? null,
        outputMax: slot?.max ?? null,
        curve: Object.values(ROUTE_CURVE).includes(slot?.curve) ? slot.curve : ROUTE_CURVE.linear,
      }),
      origin: 'macro',
      originControlId: id,
      originIndex: index,
      label: String(slot?.label ?? `Dest ${index + 1}`),
      sourceLabel: `${controlName(control)} macro`,
      colour: slot?.colour ?? null,
      bound: boundTargetFor(control, port) !== null,
    };
  });
}

/**
 * The Router's destinations, as routes.
 *
 * The Router's own transfer curve is NOT folded into `curve` here, and that is deliberate. Its curve
 * is a breakpoint list with per-segment shapes, which a route's single `curve` name cannot express —
 * flattening it to "exp" would be a lie the canvas then draws confidently. The route says linear and
 * carries `shapedBySource: true`, so a reader knows the source value arrives already shaped.
 */
export function routerRoutes(control) {
  const router = control?._children?.Router;
  if (!router || router.enabled === false) return [];
  const id = controlId(control);
  const from = routeEndpoint({ kind: 'control', controlId: id, port: 'value' });

  return (Array.isArray(router.destinations) ? router.destinations : []).map((destination, index) => {
    const port = `dest_${index}`;
    return {
      ...makeRoute({
        id: `router:${id}:${destination?.id ?? index}`,
        from,
        to: boundTargetFor(control, port) ?? routeEndpoint({ kind: 'control', controlId: id, port }),
        enabled: destination?.enabled !== false,
        mode: ROUTE_MODE.set,
        depth: Number(destination?.depth ?? 1),
        outputMin: destination?.min ?? null,
        outputMax: destination?.max ?? null,
      }),
      origin: 'router',
      originControlId: id,
      originIndex: index,
      label: String(destination?.label ?? `Dest ${index + 1}`),
      sourceLabel: `${controlName(control)} router`,
      colour: destination?.colour ?? null,
      bound: boundTargetFor(control, port) !== null,
      // The source arrives already shaped by the Router's breakpoint curve, which a route's single
      // curve name cannot describe. Saying so beats flattening it into a shape it is not.
      shapedBySource: true,
    };
  });
}

/** Routes stored on the panel itself — the Link Mapper's own, and anything the canvas draws. */
export function ownRoutes(panel) {
  return (Array.isArray(panel?.routes) ? panel.routes : [])
    .map((route) => {
      const normalized = normalizeRoute(route);
      return normalized ? { ...normalized, origin: 'panel', label: String(route?.label ?? '') } : null;
    })
    .filter(Boolean);
}

/**
 * Every route on the panel, from wherever it lives.
 *
 * Order matters and is stated: panel routes first, then the components' own. A `set` route is a
 * base that later `add` routes sum onto (see evaluateRoutes), so a component whose assignments
 * should win over a hand-drawn cable would need this order reversed — and nobody has asked for
 * that, which is why the order is written down rather than left to `flatControls`.
 */
export function panelRoutes(panel) {
  const controls = flatControls(Array.isArray(panel?.controls) ? panel.controls : []);
  const derived = [];
  for (const control of controls) {
    const type = controlType(control);
    if (type === 'Macro') derived.push(...macroRoutes(control));
    else if (type === 'Router') derived.push(...routerRoutes(control));
  }
  return [...ownRoutes(panel), ...derived];
}

/**
 * Which of a panel's routes an editor may change in place.
 *
 * A derived route is a view of a Macro slot or a Router destination; writing to it directly would
 * put the panel's copy and the component's out of step, and the next read would silently discard
 * the edit. So an editor gets told where the real record is instead of being trusted to remember.
 */
export function routeWriteTarget(route) {
  if (!route || route.origin === 'panel' || !route.origin) return { kind: 'panel' };
  return {
    kind: route.origin,          // 'macro' | 'router'
    controlId: String(route.originControlId ?? ''),
    index: Number(route.originIndex ?? -1),
    section: route.origin === 'macro' ? 'Macro' : 'Router',
    field: route.origin === 'macro' ? 'slots' : 'destinations',
  };
}

/**
 * Everything on the panel a route can start from or end at.
 *
 * One list with a `direction` on each entry rather than two lists, because almost every control's
 * value is BOTH: a knob can drive something and be driven by something. Splitting them into
 * "sources" and "targets" would have to duplicate every entry and then keep the two in step.
 *
 * A DISPLAY IS NOT A SOURCE and an input-only control is not a target — the value-flow capability
 * already answers that question, so the route editor asks it rather than growing its own idea of
 * which way a control faces.
 */
export function routeEndpointCandidates(panel) {
  const controls = flatControls(Array.isArray(panel?.controls) ? panel.controls : []);
  const out = [];

  for (const control of controls) {
    const id = controlId(control);
    if (!id) continue;
    const behavior = control?._children?.Behavior ?? null;
    const name = controlName(control);
    const channels = control?._children?.ValueChannels?._children ?? {};

    const ports = Object.keys(channels).length
      ? Object.keys(channels).map((port) => ({ port, label: `${name} · ${port}`, spec: channels[port] }))
      : [{ port: 'value', label: name, spec: behavior }];

    for (const { port, label, spec } of ports) {
      out.push({
        endpoint: routeEndpoint({ kind: 'control', controlId: id, port }),
        controlId: id,
        controlName: name,
        controlType: controlType(control),
        port,
        label,
        min: spec?.min ?? 0,
        max: spec?.max ?? 1,
        // The value-flow capability already answers which way a control faces, so the route editor
        // asks it rather than growing a second idea of the same thing. A display never emits, so it
        // cannot be a source; an input-only control is never moved by feedback, so it is not a target.
        canSource: acceptsInput(behavior),
        canTarget: acceptsInput(behavior) && acceptsFeedback(behavior),
      });
    }
  }
  return out;
}
