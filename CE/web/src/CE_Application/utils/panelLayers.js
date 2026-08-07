// panelLayers.js — a panel's layers, as objects with an order rather than strings with an accident.
//
// WHAT WAS THERE. Every control already carries `Core.layer`, a free-text name, and
// sortControlsForRender already paints layer by layer. What did NOT exist was the layer itself: no
// list, no properties, and — the part that bites — no stored ORDER. getLayerOrder numbered layers
// by the position of their first member in the controls array, so:
//
//     [A(Main), B(Background), C(Main)]   ->  Background paints in FRONT of Main
//     delete A                            ->  Background paints BEHIND Main
//
// Deleting an unrelated control silently restacked the panel. That is the bug this file exists to
// remove, and it is why order is now data rather than a side effect of array position.
//
// MIGRATION IS BEHAVIOUR-PRESERVING, and deliberately so. A panel with no `layers` gets one built
// from first-appearance order — exactly what getLayerOrder computed — so every existing document
// renders identically on the first load and correctly on every load after it.
//
// KEYED BY NAME, not by id. `Core.layer` already holds a name, the properties panel already edits
// it as text, and documents already on disk already say "Main". An id would mean rewriting every
// control on migration and would make a hand-edited document harder to read for no gain a name does
// not already give. Renaming is therefore a rename-and-reassign, which is a store action's job.
//
// SELF-HEALING. A control naming a layer the list has never heard of — hand-edited file, a paste
// from another panel, a script — must never vanish. Unknown names are appended to the list on
// normalization, so the worst case is a layer in the wrong place rather than a control nobody can
// find.

export const DEFAULT_LAYER_NAME = 'Main';

/** One layer. `kind` is what step two hangs the scenery compile off; nothing reads it yet. */
export function createLayer(name = DEFAULT_LAYER_NAME, overrides = {}) {
  return {
    _type: 'Layer',
    kind: 'controls',
    visible: true,
    locked: false,
    ...overrides,
    // AFTER the spread, not before. Callers pass the raw stored entry as `overrides` while passing
    // the already-normalized name separately, so spreading last let an untrimmed or empty stored
    // name win and produced a layer nothing could match by name.
    _type: 'Layer',
    name: normalizeLayerName(name),
  };
}

export function normalizeLayerName(name) {
  return typeof name === 'string' && name.trim() ? name.trim() : DEFAULT_LAYER_NAME;
}

const layerNameOfControl = (control) => normalizeLayerName(control?._children?.Core?.layer);

/** Every layer name any control claims, in the order the controls first claim them. */
export function layerNamesInUse(controls) {
  const names = [];
  const seen = new Set();
  for (const control of controls ?? []) {
    const name = layerNameOfControl(control);
    if (seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

/**
 * The panel's layers, in paint order — index 0 furthest back.
 *
 * Pure, and total: give it garbage and it returns something a panel can render. The two jobs are
 * migration (no list yet -> build one that reproduces today's rendering) and healing (a control on
 * an unlisted layer gets that layer appended rather than dropped).
 */
export function normalizePanelLayers(layers, controls) {
  const out = [];
  const seen = new Set();

  for (const entry of Array.isArray(layers) ? layers : []) {
    const name = normalizeLayerName(typeof entry === 'string' ? entry : entry?.name);
    if (seen.has(name)) continue;                 // a duplicate name is not a second layer
    seen.add(name);
    out.push(createLayer(name, typeof entry === 'object' && entry ? entry : {}));
  }

  for (const name of layerNamesInUse(controls)) {
    if (seen.has(name)) continue;
    seen.add(name);
    out.push(createLayer(name));
  }

  if (out.length === 0) out.push(createLayer(DEFAULT_LAYER_NAME));
  return out;
}

/** Names in paint order — what sortControlsForRender wants. */
export const layerNames = (layers) => layers.map((layer) => layer.name);

export function findLayer(layers, name) {
  const wanted = normalizeLayerName(name);
  return (layers ?? []).find((layer) => layer.name === wanted) ?? null;
}

/** Controls on hidden layers are not drawn; controls on locked layers cannot be picked. */
export const isLayerHidden = (layers, name) => findLayer(layers, name)?.visible === false;
export const isLayerLocked = (layers, name) => findLayer(layers, name)?.locked === true;

export function controlIsHidden(layers, control) {
  return isLayerHidden(layers, layerNameOfControl(control));
}

export function controlIsLocked(layers, control) {
  return isLayerLocked(layers, layerNameOfControl(control));
}

/** How many controls sit on each layer — the count the list shows beside each row. */
export function layerPopulation(layers, controls) {
  const counts = new Map(layerNames(layers).map((name) => [name, 0]));
  for (const control of controls ?? []) {
    const name = layerNameOfControl(control);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return counts;
}

/** A name not already taken — `Layer 2`, `Layer 3`, ... */
export function uniqueLayerName(layers, base = 'Layer') {
  const taken = new Set(layerNames(layers));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base} ${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * Move the layer at `from` to `to`, returning a new array.
 *
 * Paint order IS this array's order, so this is the whole of "send layer to back".
 */
export function reorderLayers(layers, from, to) {
  const next = [...layers];
  if (from < 0 || from >= next.length) return next;
  const clamped = Math.max(0, Math.min(next.length - 1, to));
  const [moved] = next.splice(from, 1);
  next.splice(clamped, 0, moved);
  return next;
}
