// The Macro's knob in its set's design.
//
// A set's knob is not a colour. It is a form (a tuning knob on Tolex, a lens on Neon, a vernier on
// Machined, a chicken-head on Chicken Head), a cap, a pointer, a scale and a material, and the Macro
// drew its own dark disc instead of any of them. So when a Macro's `knobDesign` is 'set', it hosts a
// Knob: the factory Knob, resolved through the set's family exactly as a Knob placed on the same
// panel is, and drawn by the same code. Whatever a set does to its knobs, it does to the Macro's.
//
// It sits on the Macro's face, the set's display window, rather than on the panel its markings were
// chosen for. So two things are re-inked where they would vanish there, and only then: the scale
// printed around a knob (its legend), and the needle of a form that has no body to carry it.
//
// The knob only draws. The Macro owns the value, the drag (macroKnobHit, on the Macro's own
// geometry), its caption and its readout, so the knob's labels are left out and its value is handed
// in as a runtime rather than written into the control: the knob control stays the same object while
// the Macro turns, and only the runtime changes.

import { familyPatchFor, pristineControlFor, resolveControlForSet } from '../models/controlSetFamilies.js';
import { resolveToken } from '../models/controlSets.js';
import { contrast } from '../models/instrumentDesigns.js';
import { deepClone } from './deepClone.js';
import { resolveInteractiveControl } from './interactionRuntime.js';
import { macroConfig } from './macroLayout.js';

// Forms drawn as line-work straight onto what is behind them, with no cap or body under the needle.
const BODILESS_FORMS = new Set(['pointer']);
// Forms that read by their own light: a lens, an LED ring, line-work. They need nothing behind them.
const SELF_LIT_FORMS = new Set(['pointer', 'lens', 'encoder']);
// Forms that are not a round cap: a ring of light round a tuning dial, a roller, a tile or a balance
// beam reads as a mistake rather than as a lit ring.
const NOT_ROUND_FORMS = new Set(['tuning', 'roller', 'new-tessera', 'new-balance']);
const LABEL_PARTS = ['labelMin', 'labelMax', 'labelStart', 'labelCurrent', 'labelEnd', 'labelValue', 'labelTitle', 'labelUnit'];

export function macroUsesSetKnob(control) {
  return macroConfig(control).knobDesign === 'set';
}

/**
 * The square the knob is drawn in: the room the Macro's own knob and value arc take, less what its
 * caption and readout need, since a set's knob draws to the edge of its box (a ring of ticks, a
 * wheel's spokes) and the Macro's own arc did not. Same arithmetic as MacroRenderer's text.
 */
export function macroKnobBox(geom, control = null) {
  const cfg = macroConfig(control);
  const margin = geom.knobR + 10;
  const readoutSize = Math.max(12, geom.knobR * 0.42);
  const top = cfg.label ? geom.knobCY - geom.knobR - 4 : geom.knobCY - margin;
  const bottom = cfg.showValues !== false ? geom.knobCY + geom.knobR + 15 - readoutSize * 0.78 - 2 : geom.knobCY + margin;
  const side = Math.max(8, Math.min(bottom - top, 2 * margin));
  const cy = (top + bottom) / 2;
  return { x: geom.knobCX - side / 2, y: cy - side / 2, width: side, height: side };
}

/**
 * The Knob a Macro hosts, in Macro-local coordinates. Not yet resolved for a set: the canvas resolves
 * it like any control, so a Macro pinned to a set (Core.controlSetId) pins its knob to the same one.
 * The changes made here are not factory values, so no family patch overrides them. With `set`, the
 * knob's markings are checked against the Macro's face in that set.
 */
export function macroKnobControl(macro, box, set = null) {
  const factory = pristineControlFor('Knob');
  if (!factory || !box) return null;
  const knob = deepClone(factory);
  const core = knob._children.Core;
  const macroCore = macro?._children?.Core ?? {};
  core.id = `${macroCore.id || 'macro'}~knob`;
  core.name = '';
  if (macroCore.controlSetId) core.controlSetId = macroCore.controlSetId;
  core.formShowValue = false;
  Object.assign(knob._children.Transform, { x: box.x, y: box.y, width: box.width, height: box.height });
  Object.assign(knob._children.Behavior, { showMinMaxLabels: false, showValueReadout: false, showHandleLabels: false });
  const parts = knob._children.Parts?._children;
  if (parts) for (const name of LABEL_PARTS) delete parts[name];
  if (set) reinkForFace(knob, set);
  return knob;
}

function reinkForFace(knob, set) {
  const face = resolveToken('instrument.face', set);
  if (!face) return;
  const drawn = resolveControlForSet(knob, set)._children.Core;
  const reads = (colour) => /^[0-9A-F]{8}$/i.test(String(colour)) && contrast(colour, face) >= 3;
  if (!reads(drawn.formLabelColour)) knob._children.Core.formLabelColour = '{instrument.ink}';
  if (BODILESS_FORMS.has(drawn.controlForm) && !reads(drawn.formInkColour)) knob._children.Core.formInkColour = '{instrument.text}';
}

/**
 * The ring of light a knob sits on when its body would be lost on the Macro's face: a mid-grey cap
 * on a near-black screen reads at about 2:1 (Flightdeck, Stompbox, Bakelite). A lighter plate would
 * not help, sitting too close to the grey; light behind a dark silhouette does, so the knob sits on
 * an underlit ring in the set's own display light. Returns that colour, or null for a knob that
 * reads already or lights itself.
 */
export function macroKnobHalo(knob, set) {
  if (!knob || !set) return null;
  const core = resolveControlForSet(knob, set)._children.Core;
  if (SELF_LIT_FORMS.has(core.controlForm) || NOT_ROUND_FORMS.has(core.controlForm)) return null;
  const face = resolveToken('instrument.face', set);
  const body = core.controlForm ? core.formFaceColour
    : resolveControlForSet(knob, set)._children.Parts?._children?.bodyCap?._children?.Background?._children?.Fill?.colour;
  if (!face || !/^[0-9A-F]{8}$/i.test(String(body)) || contrast(body, face) >= 2.5) return null;
  // The light must read on the face, or there is no ring to see: a reflective set's ink is dark.
  const lit = resolveToken('display.lit', set);
  return /^[0-9A-F]{8}$/i.test(String(lit)) && contrast(lit, face) >= 3 ? lit : null;
}

/**
 * What the hosted knob and its ring are built from, as a string the canvas keys the knob on: the
 * Macro's id and set pin, the knob's box, and everything the knob and the ring read from the set,
 * which is its colours and its Knob family. The knob is rebuilt only when this changes, so it has to
 * change whenever any of those does: a set edited in Settings keeps its id and its face while its
 * display light or its cap colour moves.
 */
export function macroKnobSignature(macro, box, set = null) {
  const core = macro?._children?.Core ?? {};
  return JSON.stringify([core.id ?? '', core.controlSetId ?? '', box, set?.id ?? '', set?.tokens ?? null, familyPatchFor(set, 'Knob')]);
}

/** The knob's runtime at rest, computed once per knob. */
export function macroKnobBaseRuntime(knob) {
  return knob ? resolveInteractiveControl(knob, {}).runtime : null;
}

/** The runtime at the Macro's value. While the Macro is dragged, transitions are off, as on a Knob. */
export function macroKnobRuntime(base, value, dragging = false) {
  if (!base) return null;
  const v = Math.max(0, Math.min(1, Number(value) || 0));
  return {
    ...base,
    signals: { ...base.signals, valueRaw: v, valueNormalized: v, currentValueRaw: v, currentValueNormalized: v, dragging: dragging === true },
  };
}
