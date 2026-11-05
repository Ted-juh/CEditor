// attachedLabels.js — a control attached to another (`Core.attachedTo`) goes where that one goes.
//
// A knob's name, value and range ends are Labels of their own (utils/labelShows.js), attached to the
// knob. They move with it however it is moved (a drag, the arrow keys, the inspector's X and Y,
// Align, a script), are copied with it (Duplicate, Alt+drag, Copy and Paste) and attached to the
// copy, and are deleted with it. In every other way each is a control of its own: selected, styled
// and moved on its own, which changes where it sits beside its control.
//
// Pure, no stores: stores/controls.js and stores/clipboard.js call these.

import { attachedTo, labelShows, labelSourceId } from './labelShows.js';
import { buildControlIndex, walkControls } from './containment.js';
import { getSliderGeometry, getSliderOrientation } from './sliderBehavior.js';
import { sliderNormalizedToAngle } from './sliderGeometry.js';

// One index per panel tree: an edit replaces the array, so the old index goes with it.
const ownersCache = new WeakMap();

/** Owner id → the ids of the controls attached to it, over a whole panel tree, nested ones too. */
export function attachmentsOf(controls) {
  if (!Array.isArray(controls)) return new Map();
  let owners = ownersCache.get(controls);
  if (owners) return owners;
  owners = new Map();
  walkControls(controls, (control) => {
    const owner = attachedTo(control);
    const id = control?._children?.Core?.id;
    if (!owner || id == null || owner === id) return;
    if (!owners.has(owner)) owners.set(owner, []);
    owners.get(owner).push(id);
  });
  ownersCache.set(controls, owners);
  return owners;
}

const textCache = new WeakMap();

/**
 * The controls whose own text a Label shows (`Text.shows` 'text'): a button whose caption is a Label
 * of its own prints none itself, flat or drawn as a key, so a set that draws it the other way never
 * doubles or loses its caption. Cached per panel tree.
 */
export function textShownOwners(controls) {
  if (!Array.isArray(controls)) return new Set();
  let owners = textCache.get(controls);
  if (owners) return owners;
  owners = new Set();
  walkControls(controls, (control) => {
    if (labelShows(control) === 'text') {
      const source = labelSourceId(control);
      if (source) owners.add(source);
    }
  });
  textCache.set(controls, owners);
  return owners;
}

const parentIdOf = (entry) => entry?.parent?._children?.Core?.id ?? null;

/** True when `id`, or a control it sits inside, is in `ids`. */
function within(index, id, ids) {
  for (let entry = index.get(id), at = id; entry; at = parentIdOf(entry), entry = at == null ? null : index.get(at)) {
    if (ids.has(at)) return true;
  }
  return false;
}

/**
 * The controls attached to any of `ids`, or to anything inside one of them, that are not themselves
 * among `ids` or inside one of them (those go anyway): what a gesture on `ids` takes along.
 */
export function attachedFollowers(controls, ids) {
  const owners = attachmentsOf(controls);
  const out = new Set();
  if (!owners.size) return out;
  const chosen = ids instanceof Set ? ids : new Set(ids ?? []);
  const index = buildControlIndex(controls);
  for (const [owner, labels] of owners) {
    if (!index.has(owner) || !within(index, owner, chosen)) continue;
    for (const label of labels) if (!within(index, label, chosen)) out.add(label);
  }
  return out;
}

/** `ids` with the controls attached to them (attachedFollowers) added, as a new Set. */
export function withAttached(controls, ids) {
  const out = new Set(ids instanceof Set ? ids : (ids ?? []));
  for (const id of attachedFollowers(controls, out)) out.add(id);
  return out;
}

/**
 * The patches that move each attached control as far as its control moved from `before` to `after`
 * (two versions of one panel tree): `Map<id, { 'Transform.x', 'Transform.y' }>`. A control that
 * moved on its own in the same change (one selected with its knob and dragged with it) went where it
 * was told; one inside a control that moved is carried by it; a control that changed containers was
 * reparented, which moves its attached controls itself.
 */
export function followMoves(before, after) {
  const patches = new Map();
  if (before === after) return patches;
  const owners = attachmentsOf(after);
  if (!owners.size) return patches;
  const was = buildControlIndex(before);
  const now = buildControlIndex(after);
  const xy = (entry) => {
    const t = entry?.control?._children?.Transform;
    return { x: Number(t?.x) || 0, y: Number(t?.y) || 0 };
  };
  const deltas = new Map();
  const delta = (id) => {
    if (deltas.has(id)) return deltas.get(id);
    const a = was.get(id);
    const b = now.get(id);
    let d = null;
    if (a && b && a.control !== b.control && parentIdOf(a) === parentIdOf(b)) {
      const p = xy(a);
      const q = xy(b);
      if (p.x !== q.x || p.y !== q.y) d = { dx: q.x - p.x, dy: q.y - p.y };
    }
    deltas.set(id, d);
    return d;
  };
  const carried = (id, owner) => {
    for (let at = parentIdOf(now.get(id)); at != null; at = parentIdOf(now.get(at))) {
      if (at === owner || delta(at)) return true;
    }
    return false;
  };
  for (const [owner, labels] of owners) {
    const d = delta(owner);
    if (!d) continue;
    for (const label of labels) {
      if (patches.has(label) || !was.has(label) || !now.has(label)) continue;
      if (delta(label) || carried(label, owner)) continue;
      const at = xy(now.get(label));
      patches.set(label, { 'Transform.x': at.x + d.dx, 'Transform.y': at.y + d.dy });
    }
  }
  return patches;
}

/**
 * Point a copy (and everything inside it) at the copies of the controls it named: `idMap` is old id →
 * new id (containment.js remintControlIds). A copied Label attached to a control that was copied with
 * it is attached to that copy; one copied alone stays with the original; one whose control is not on
 * the panel it lands in (`exists` says) is attached to nothing and reads its own words. In place.
 */
export function remapAttachments(control, idMap, exists = () => true) {
  walkControls([control], (node) => {
    const core = node._children.Core;
    if (core.attachedTo) {
      if (idMap?.has(core.attachedTo)) core.attachedTo = idMap.get(core.attachedTo);
      else if (!exists(core.attachedTo)) core.attachedTo = '';
    }
    const text = node._children.Text;
    if (text?.showsControl) {
      if (idMap?.has(text.showsControl)) text.showsControl = idMap.get(text.showsControl);
      else if (!exists(text.showsControl)) text.showsControl = '';
    }
  });
  return control;
}

const num = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * Where a new Label showing `shows` of `owner` goes, in the owner's frame: `{ x, y, width, height,
 * align }`, `size` being its lettering and `width` how wide its words are (at least). The name above
 * the control and the value below it (in its middle when the control reads its value there), the
 * unit under the value; min and max hang outward from the ends of a knob's arc, or sit under the
 * ends of a slider's track, aligned away from the middle; a range's start and end a row further in.
 * A first place to put it: the author moves it from there.
 */
export function attachedLabelRect(owner, shows, { size = 11, width = 0 } = {}) {
  const t = owner?._children?.Transform ?? {};
  const behavior = owner?._children?.Behavior ?? {};
  const x = num(t.x);
  const y = num(t.y);
  const w = Math.max(1, num(t.width, 100));
  const h = Math.max(1, num(t.height, 100));
  const line = Math.round(num(size, 11) * 1.6);
  const gap = 2;
  const fit = (least) => Math.round(Math.max(least, num(width)));
  const box = (left, top, across, align = 'center') => ({ x: Math.round(left), y: Math.round(top), width: Math.round(across), height: line, align });
  const centred = (cx, top, across) => box(cx - across / 2, top, across);
  // A meter by its own orientation (an arc's ends are its bottom corners, as a bar's are).
  const meter = owner?._children?.Meter;
  const circular = !meter && getSliderGeometry(behavior) === 'circular';
  const vertical = meter ? String(meter.orientation ?? '') === 'vertical' : (!circular && getSliderOrientation(behavior) === 'vertical');
  const middle = x + w / 2;

  if (shows === 'name') return centred(middle, y - line - gap, fit(w));
  if (shows === 'value') {
    return String(behavior.labelReadoutPlacement ?? '').trim().toLowerCase() === 'center'
      ? centred(middle, y + (h - line) / 2, fit(w * 0.6))
      : centred(middle, y + h + gap, fit(circular || vertical ? w * 0.6 : 40));
  }
  if (shows === 'unit') return centred(middle, y + h + gap + line, fit(30));
  if (!['min', 'max', 'start', 'end'].includes(shows)) return centred(middle, y + h + gap, fit(w * 0.6));

  const at = shows === 'min' || shows === 'start' ? 0 : 1;
  const further = shows === 'start' || shows === 'end' ? line : 0;
  const across = fit(24);
  if (circular) {
    const radians = (sliderNormalizedToAngle(behavior, at) * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const radius = Math.min(w, h) / 2;
    const px = middle + cos * radius;
    const py = y + h / 2 + sin * radius;
    // Beside the end of the arc, on the side away from the knob; below or above it at the bottom
    // or the top.
    if (cos < -0.25) return box(px + 4 - across, py - line / 2 + further, across, 'right');
    if (cos > 0.25) return box(px - 4, py - line / 2 + further, across, 'left');
    return centred(px, sin >= 0 ? py + gap + further : py - line - gap - further, across);
  }
  if (vertical) {
    const top = String(behavior.direction ?? 'btt').trim().toLowerCase() === 'ttb' ? at === 0 : at === 1;
    return box(x + w + gap, top ? y + further : y + h - line - further, across, 'left');
  }
  const left = String(behavior.direction ?? 'ltr').trim().toLowerCase() === 'rtl' ? at === 1 : at === 0;
  return left
    ? box(x, y + h + gap + further, across, 'left')
    : box(x + w - across, y + h + gap + further, across, 'right');
}
