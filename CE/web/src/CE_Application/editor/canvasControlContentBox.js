/**
 * Where a control's content sits inside it, from its ContentLayout section, the text's Position
 * and the icon: the layout paddings and gap, and the text's own paddings and offset, which make
 * room for an icon beside, above or below it and for a lamp at either end.
 *
 * Eleven deriveds in CanvasControl, every one evaluated by every labelled control; one here
 * (`contentBox`), by the same expressions. Like resolveTextSettings, it hands back `previous` when
 * nothing changed, so the text layout that reads the paddings re-runs only when one does.
 *
 * `lamp` is `{ onRight, width, gap }` for a control that draws a lamp and null for one that does not.
 */

import { numberOr } from '../utils/primitives.js';

function sameValues(a, b) {
  if (!a) return false;
  for (const key in b) if (!Object.is(a[key], b[key])) return false;
  return true;
}

export function resolveContentBox(contentLayout, textPosition, contentLayoutMode, icon, lamp, previous = null) {
  const paddingLeft = numberOr(contentLayout?.paddingLeft, textPosition?.paddingLeft ?? 4) + (lamp && !lamp.onRight ? lamp.width + lamp.gap : 0);
  const paddingRight = numberOr(contentLayout?.paddingRight, textPosition?.paddingRight ?? 4) + (lamp && lamp.onRight ? lamp.width + lamp.gap : 0);
  const paddingTop = numberOr(contentLayout?.paddingTop, 0);
  const paddingBottom = numberOr(contentLayout?.paddingBottom, 0);
  const gap = Math.max(0, numberOr(contentLayout?.gap, 8));
  // The room an icon takes on the side of the text it is laid out on.
  const iconRoom = (mode) => (contentLayoutMode === mode && icon?.source !== 'none' ? Math.max(4, Number(icon?.size ?? 16)) + gap : 0);
  const box = {
    paddingLeft,
    paddingRight,
    paddingTop,
    paddingBottom,
    gap,
    textOffsetX: numberOr(textPosition?.offsetX, 0) + numberOr(contentLayout?.textOffsetX, 0),
    textOffsetY: numberOr(textPosition?.offsetY, 0) + numberOr(contentLayout?.textOffsetY, 0),
    textPaddingLeft: paddingLeft + iconRoom('icon_left_text_right'),
    textPaddingRight: paddingRight + iconRoom('text_left_icon_right'),
    textPaddingTop: paddingTop + iconRoom('icon_above_text_below'),
    textPaddingBottom: paddingBottom + iconRoom('text_above_icon_below'),
  };
  return sameValues(previous, box) ? previous : box;
}
