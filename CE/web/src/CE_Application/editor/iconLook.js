/**
 * iconLook.js — where a control's icon sits and how it is drawn, shared by the canvas
 * (CanvasControl) and a component's icon layer (InteractivePartRenderer), so a button's icon made
 * into a layer is the same picture.
 */
import { numberOr } from '../utils/primitives.js';
import { cssColor } from './canvasControlStyles.js';

/** The icon's side in pixels. */
export function iconSize(icon) {
  return Math.max(4, Number(icon?.size ?? 16));
}

/**
 * The icon's box in a `width` by `height` control: `{ left, top, size, zIndex }`. It is aligned in
 * the content box (the layout's paddings, `contentBox` from resolveContentBox), put on its side of
 * the text by the layout's mode, then moved by the icon offsets.
 */
export function iconPlacement(contentLayout, contentBox, mode, icon, width, height) {
  const size = iconSize(icon);
  const horizontalAlign = String(contentLayout?.horizontalAlign ?? 'center');
  const verticalAlign = String(contentLayout?.verticalAlign ?? 'center');
  const contentLeft = contentBox.paddingLeft;
  const contentRight = Math.max(contentLeft, width - contentBox.paddingRight);
  const contentTop = contentBox.paddingTop;
  const contentBottom = Math.max(contentTop, height - contentBox.paddingBottom);

  const alignAxis = (min, max, align, startValue, endValue) => {
    if (align === startValue) return min + (size / 2);
    if (align === endValue) return max - (size / 2);
    return (min + max) / 2;
  };

  let centerX = alignAxis(contentLeft, contentRight, horizontalAlign, 'left', 'right');
  let centerY = alignAxis(contentTop, contentBottom, verticalAlign, 'top', 'bottom');

  if (mode === 'icon_left_text_right') {
    centerX = contentLeft + (size / 2);
  } else if (mode === 'text_left_icon_right') {
    centerX = contentRight - (size / 2);
  } else if (mode === 'icon_above_text_below') {
    centerY = contentTop + (size / 2);
  } else if (mode === 'text_above_icon_below') {
    centerY = contentBottom - (size / 2);
  }

  centerX += numberOr(contentLayout?.iconOffsetX, 0);
  centerY += numberOr(contentLayout?.iconOffsetY, 0);
  return { left: centerX - (size / 2), top: centerY - (size / 2), size, zIndex: numberOr(contentLayout?.iconZIndex, 1) };
}

/** The icon picture's own style: its fit, opacity, flips and turn, and its shadow, glow and blur. */
export function iconImageStyle(icon) {
  const effects = icon?._children?.Effects ?? null;
  const fit = icon?.fit === 'cover' ? 'cover' : 'contain';
  const transforms = [];
  if (icon?.flipH === true) transforms.push('scaleX(-1)');
  if (icon?.flipV === true) transforms.push('scaleY(-1)');
  if (Math.abs(numberOr(icon?.rotation, 0)) > 0.001) transforms.push(`rotate(${numberOr(icon?.rotation, 0)}deg)`);
  const filters = [];
  if (effects?.shadowEnabled === true) {
    filters.push(`drop-shadow(${numberOr(effects?.shadowOffsetX, 0)}px ${numberOr(effects?.shadowOffsetY, 2)}px ${Math.max(0, numberOr(effects?.shadowBlur, 4))}px ${cssColor(effects?.shadowColour ?? '66000000')})`);
  }
  if (effects?.glowEnabled === true) {
    filters.push(`drop-shadow(0 0 ${Math.max(0, numberOr(effects?.glowSize, 4))}px ${cssColor(effects?.glowColour ?? '66FFFFFF')})`);
  }
  if (effects?.blurEnabled === true && numberOr(effects?.blurAmount, 0) > 0) {
    filters.push(`blur(${numberOr(effects?.blurAmount, 0)}px)`);
  }
  return [
    'width:100%',
    'height:100%',
    `object-fit:${fit}`,
    `opacity:${Math.max(0, Math.min(1, numberOr(icon?.opacity, 1)))}`,
    transforms.length ? `transform:${transforms.join(' ')}` : '',
    filters.length ? `filter:${filters.join(' ')}` : '',
  ].join('; ');
}
