/**
 * Which controls are scenery, and which of them can safely be folded into one ground layer.
 *
 * A big panel is mostly printed matter. The GAIA's 409 controls are 189 Labels and 27 Backgrounds —
 * legends, plate outlines, section headings — and 193 things that actually do something. Every one
 * of those 216 is currently a full CanvasControl: selection overlay, drag handlers, interaction
 * runtime, device-drop targets, nested-control reach. None of it is ever used, because a Label
 * cannot be bound, clicked, scripted or animated.
 *
 * WHY THIS IS INFERRED AND NOT DECLARED. Nothing in the panel format says "this is scenery", and
 * adding a flag would put the burden on whoever draws the panel — they would have to know the
 * optimisation exists, remember to set it, and be right. Worse, a wrong flag is a rendering bug
 * with no symptom at authoring time. So staticness is read off the component type instead, where it
 * is already a fact: COMPONENT_TYPES declares the sections each type has, and a type whose section
 * list contains no Mouse, no Value, no States, no Animations, no Scripts and no DeviceBindings is
 * structurally incapable of changing. Label declares Background, Text, Icon, Effects and
 * ContentLayout. There is no field on it that could move.
 *
 * The rule is one-directional on purpose: calling a dynamic control scenery breaks the panel, while
 * calling a scenery control dynamic only costs what it costs today. Every uncertain case therefore
 * resolves to "not scenery", including whole categories (any panel carrying scripts) that could
 * probably be folded with more analysis.
 */

import { COMPONENT_TYPES } from '../models/componentTypes.js';
import { getControlCore } from './controlOrder.js';

/**
 * Sections whose presence means a control can change, be driven, or be touched.
 *
 * Listed rather than derived because the question each answers is a judgement, not a shape: `Icon`
 * and `ContentLayout` are as inert as `Text`, while `Value` and `HitZones` are not, and no property
 * of the section objects themselves distinguishes them. A section name absent from both this list
 * and a type's declared sections simply never comes up; a NEW section added to the model defaults
 * to inert, which is the wrong direction, so it is asserted against the real registry in
 * sceneryModel.test.js — a type that gains behaviour must gain it here too.
 */
const DYNAMIC_SECTIONS = new Set([
  'Animations',
  'Assets',
  'Behavior',
  'Behaviors',
  'Bindings',
  'Children',
  'Designer',
  'DeviceBindings',
  'ExternalAPI',
  'Generators',
  'HitZones',
  'Links',
  'Mouse',
  'Parts',
  'PublishedProperties',
  'Scripts',
  'States',
  'Value',
  'ValueChannels',
  'Variants',
]);

/**
 * Is a component TYPE incapable of doing anything?
 *
 * Core and Transform are on every control and neither is dynamic — a Transform can be edited, but
 * editing is what unfolds the control again, not something it does on its own.
 */
export function isSceneryType(controlType) {
  const type = COMPONENT_TYPES[controlType];
  if (!type) return false;                       // unknown type: assume it does something
  const sections = type.sections;
  if (!Array.isArray(sections)) return false;
  return !sections.some((name) => DYNAMIC_SECTIONS.has(name));
}

/** Every type in the registry that qualifies, for tests and for reporting. */
export function sceneryTypes() {
  return Object.keys(COMPONENT_TYPES).filter(isSceneryType).sort();
}

/**
 * Is this particular control scenery?
 *
 * The type decides almost all of it. What is left is the control having grown a section its type
 * never declared — which the document format allows, since expandControl fills in from the pristine
 * control of the type but does not strip what it finds.
 */
export function isScenery(control) {
  const core = getControlCore(control);
  if (!core) return false;
  if (!isSceneryType(core.controlType)) return false;
  for (const name of Object.keys(control?._children ?? {})) {
    if (DYNAMIC_SECTIONS.has(name)) return false;
  }
  return true;
}

/**
 * Can a panel's scenery be folded at all?
 *
 * A script can reach any control by id and set its text, colour or visibility, and nothing in the
 * script's shape says which ones it will touch. Reading the source and looking for ids would work
 * most of the time, and "most of the time" is not a property worth having in a renderer — a frozen
 * label that was supposed to animate is a bug nobody would think to look for here. So a panel with
 * any script keeps all its controls live.
 *
 * This is the conservative case most worth revisiting: per-id analysis would let scripted panels
 * fold everything the script demonstrably never names.
 */
export function panelAllowsFold(panel) {
  const scripts = panel?.scripts;
  return !Array.isArray(scripts) || scripts.length === 0;
}

function boxOf(control) {
  const t = control?._children?.Transform ?? {};
  return {
    x: Number(t.x) || 0,
    y: Number(t.y) || 0,
    w: Number(t.width) || 0,
    h: Number(t.height) || 0,
  };
}

function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * Split controls into the ground and what stays live, WITHOUT moving anything visually.
 *
 * The fold collapses scenery into a single layer behind every live control, and on a real panel the
 * two are thoroughly interleaved — the GAIA's scenery runs three controls deep before the first
 * live one, then alternates for the remaining four hundred. Folding all of it would drop 40 legends
 * behind the comboboxes and buttons they label, where an opaque background swallows them.
 *
 * So a scenery control folds only if nothing it covers is already beneath it: no live control
 * earlier in render order overlaps its box. Scenery that fails this stays live, costing what it
 * costs today and painting exactly where it did. Relative order within the ground is preserved, so
 * scenery-over-scenery is unaffected.
 *
 * The membership deliberately does NOT depend on what is selected or hovered. It was written that
 * way first, and it is a trap: the ground is cached against its own contents, so pulling one label
 * out to give it drag handles mints a new key and re-bakes the other 172 — several hundred
 * milliseconds, on every hover. The ground is a function of the panel alone. Holding a control live
 * is sceneryHoldSet's job, and it works by drawing over the ground rather than by changing it.
 */
export function planSceneryFold(orderedControls) {
  const controls = orderedControls ?? [];
  const isGroundCandidate = controls.map(isScenery);
  const boxes = controls.map(boxOf);

  const ground = [];
  const live = [];
  const liveBoxes = [];

  // Blocking CASCADES, which is the part that is easy to get wrong: a label held back because it
  // covers a combobox is itself live now, so a second label printed over THAT one has to be held
  // back too. Deciding each control against the controls already placed — rather than against the
  // ones that merely looked foldable — is what makes the chain resolve. Walking in render order
  // means everything before `i` is already final.
  for (let i = 0; i < controls.length; i++) {
    const foldable = isGroundCandidate[i] && !liveBoxes.some((box) => overlaps(boxes[i], box));
    if (foldable) {
      ground.push(controls[i]);
      continue;
    }
    live.push(controls[i]);
    liveBoxes.push(boxes[i]);
  }

  return { ground, live };
}

/**
 * Which folded controls have to be drawn as real controls again, given the ones you asked for.
 *
 * The editor needs a folded control back the moment you point at it: selection is DOM-driven, so a
 * control nobody mounted cannot be clicked, and handles and drags need a real component. Since the
 * ground itself must not change (see planSceneryFold), the answer is to hide those controls inside
 * the baked ground and draw live copies over it.
 *
 * Drawing them over it moves them up the stack, so the seed is not enough on its own. A plate is
 * folded before the legends printed on it; hoisting the plate alone would put it in front of its own
 * legends and they would disappear. So the set closes over what it would cover: anything later in
 * the ground that overlaps something already in the set comes too, and the whole set is drawn in
 * render order, which preserves their order among themselves.
 *
 * Above the rest of the ground is where they belong, and BELOW every live control is also where they
 * belong — the fold already guarantees no live control drawn earlier overlaps a ground member, so a
 * hoisted control cannot be hidden by one, and the live controls drawn later are supposed to be on
 * top. Rendering the held set between the ground and the live controls satisfies both.
 */
export function sceneryHoldSet(ground, isSeed) {
  const controls = ground ?? [];
  if (!controls.length || typeof isSeed !== 'function') return { held: [], heldIds: new Set() };

  const boxes = controls.map(boxOf);
  const holding = controls.map((control) => !!isSeed(control));

  // One forward pass is enough: a control can only be pulled up by something before it, and by the
  // time it is reached every earlier member is already marked.
  for (let i = 0; i < controls.length; i++) {
    if (holding[i]) continue;
    for (let j = 0; j < i; j++) {
      if (holding[j] && overlaps(boxes[i], boxes[j])) { holding[i] = true; break; }
    }
  }

  const held = [];
  const heldIds = new Set();
  for (let i = 0; i < controls.length; i++) {
    if (!holding[i]) continue;
    held.push(controls[i]);
    const id = getControlCore(controls[i])?.id;
    if (id != null) heldIds.add(id);
  }
  return { held, heldIds };
}

// FNV-1a over the control's serialized form. Memoized on the control object itself: the document is
// immutable on write, so an untouched control keeps its identity across a panel edit and never
// hashes twice. Without this the fingerprint would re-stringify every label on every keystroke.
const hashCache = new WeakMap();

function hashControl(control) {
  const cached = hashCache.get(control);
  if (cached !== undefined) return cached;
  const text = JSON.stringify(control);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  const out = hash.toString(36);
  hashCache.set(control, out);
  return out;
}

/**
 * A key for the baked ground: same scenery, same string.
 *
 * Covers the controls' content and their order, so moving a label or retyping one re-bakes, and
 * editing a knob does not.
 */
export function sceneryFingerprint(ground) {
  if (!ground?.length) return 'empty';
  return `${ground.length}:${ground.map(hashControl).join('.')}`;
}
