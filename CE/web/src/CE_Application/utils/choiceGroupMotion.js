/**
 * choiceGroupMotion.js — what moves in a choice group (RadioButtonGroup) when its options are
 * animated as parts (choiceGroupLayout.js CHOICE_PARTS): where the thumb stands, how it travels, and
 * which parts anything plays on. Pure: ChoiceGroup.svelte draws what this works out, CanvasControl
 * hands it the timings. The Components showcase's Choice group, phase 2
 * (docs/design/component-presets.md).
 *
 * THE THUMB. Unanimated, each option draws its own mark of being chosen (a strip's thumb or a key's
 * colour, the radio's dot, the lit lamp, the tab's underline), and a new choice moves it at once,
 * since it is a different option's. Anything played on `Parts.thumb` draws that mark apart, on a
 * layer between the options' faces and their words, where it can travel from the option it was on
 * to the next. A transition on it eases its two edges: the one ahead (as it travels) on the timing
 * of `Layout.x`, the one behind on the timing of `Layout.width`. Equal timings slide it whole; a
 * slower one behind stretches it toward the new option and then draws it after.
 */

/** The parts anything is played on: a transition's, a keyframe animation's, a text effect's. */
export function animatedParts({ partTransitions = null, keyframeEntries = [] } = {}) {
  const parts = new Set();
  for (const [name] of partTransitions ?? []) parts.add(name);
  for (const entry of keyframeEntries ?? []) if (entry?.part) parts.add(entry.part);
  return parts;
}

/**
 * Where the chosen option's mark stands, in the group's box: the whole option in the styles that
 * paint options (segmented, buttons), its indicator in the radio and LED styles, its underline in
 * the tab style. `item` is a placed option (left, top, width, height, padX), `resolved` its look.
 */
export function thumbBox(style, orientation, item, resolved) {
  if (!item || !resolved) return null;
  if (style === 'segmented' || style === 'buttons') {
    return { left: item.left, top: item.top, width: item.width, height: item.height };
  }
  if (style === 'tab') {
    const thickness = Math.max(1, Number(resolved.indicatorInner?.height) || 2);
    return orientation === 'vertical'
      ? { left: item.left, top: item.top + item.height * 0.2, width: thickness, height: item.height * 0.6 }
      : { left: item.left + item.padX, top: item.top + item.height - thickness, width: Math.max(0, item.width - 2 * item.padX), height: thickness };
  }
  // Radio and LED: the indicator leads the option's content, centred on its height. The dot sits in
  // the middle of the ring; the lamp is the indicator itself.
  const ring = style === 'led' ? resolved.indicatorOuter : (resolved.indicatorOuter?.visible ? resolved.indicatorOuter : resolved.indicatorInner);
  const ringW = Math.max(0, Number(ring?.width) || 0);
  const ringH = Math.max(0, Number(ring?.height) || 0);
  const ringLeft = item.left + item.padX;
  const ringTop = item.top + item.height / 2 - ringH / 2;
  if (style === 'led') return { left: ringLeft, top: ringTop, width: ringW, height: ringH };
  const dot = resolved.indicatorInner ?? ring;
  const dotW = Math.max(0, Number(dot?.width) || 0);
  const dotH = Math.max(0, Number(dot?.height) || 0);
  return { left: ringLeft + (ringW - dotW) / 2, top: ringTop + (ringH - dotH) / 2, width: dotW, height: dotH };
}

/**
 * Which way the thumb goes from one box to the next: +1 toward the end (right, or down when the
 * group stands upright), -1 back, 0 when it stays.
 */
export function thumbDirection(from, to, orientation = 'horizontal') {
  if (!from || !to) return 0;
  const along = orientation === 'vertical' ? ['top', 'height'] : ['left', 'width'];
  const before = from[along[0]] + from[along[1]] / 2;
  const after = to[along[0]] + to[along[1]] / 2;
  return after > before ? 1 : after < before ? -1 : 0;
}

/**
 * The thumb's CSS transition: each edge on its timing. `bucket` is the thumb's part transitions
 * (`transform`: the edge ahead; `size`: the edge behind; either standing for both when it is the
 * only one); `direction` from thumbDirection. The cross axis goes with the edge ahead. '' for none.
 */
export function thumbTransition(bucket, direction = 1, orientation = 'horizontal') {
  const ahead = bucket?.transform ?? bucket?.size ?? null;
  const behind = bucket?.size ?? bucket?.transform ?? null;
  if (!ahead && !behind) return '';
  const [start, end, crossA, crossB] = orientation === 'vertical' ? ['top', 'bottom', 'left', 'right'] : ['left', 'right', 'top', 'bottom'];
  // Going on, the end edge leads; going back, the start edge does.
  const leadEdge = direction < 0 ? start : end;
  const trailEdge = direction < 0 ? end : start;
  return `transition:${leadEdge} ${ahead}, ${trailEdge} ${behind}, ${crossA} ${ahead}, ${crossB} ${ahead};`;
}

/** The thumb's box as the four edges its transition eases, in a group `width` × `height`. */
export function thumbEdges(box, width, height) {
  return `left:${box.left}px;top:${box.top}px;right:${width - box.left - box.width}px;bottom:${height - box.top - box.height}px;`;
}
