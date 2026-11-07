// accessibilityCheckRun.js — measuring the text on the canvas for the dock's Access tool.
//
// What a text's background IS on a panel is rarely one colour: a label sits on a control's plate,
// which sits on a section's gradient, which sits on the panel's picture. Reading colours out of the
// CSS (as accessibility linters do) answers "unknown" for most of that. So the background is
// measured the way it is drawn: the panel is pictured once by the canvas's own renderer
// (utils/domPicture.js, the same path as File → Export Picture) with every text made transparent,
// and each text's colour is laid over the pixels that are behind it there. Gradients, pictures and
// semi-transparent plates come out as they look.
//
// The rules (WCAG AA, what counts as large text, which share of the background) are
// utils/accessibilityCheck.js.

import { get } from 'svelte/store';
import { activePanel } from './panels.js';
import { EDITOR_ONLY, EDITOR_STATE_CLASSES, SURFACE_ROOT_STYLE, liveSurface, surfaceReady } from './pictureExport.js';
import { pictureOfElement } from '../utils/domPicture.js';
import { flatControls } from '../utils/containment.js';
import { contrastOverPixels, parseCssColor, requiredContrast } from '../utils/accessibilityCheck.js';

const SVG_TEXT = new Set(['text', 'tspan', 'textPath']);

/** Elements on the surface that draw text of their own: a direct text node with something in it. */
function textOwners(surface) {
  const owners = [];
  const walker = document.createTreeWalker(surface, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.nodeValue || !node.nodeValue.trim()) continue;
    const owner = node.parentElement;
    if (!owner || seen.has(owner)) continue;
    seen.add(owner);
    if (owner.closest(EDITOR_ONLY)) continue;
    if (owner.closest('style, script, title, desc, defs')) continue;
    if (!owner.closest('[data-control-id]')) continue;
    if (!owner.getClientRects().length) continue;
    const style = getComputedStyle(owner);
    if (style.visibility === 'hidden' || style.display === 'none') continue;
    owners.push(owner);
  }
  return owners;
}

/** The text's own boxes (not the element's, which can be far larger), in screen pixels. */
function textBox(owner) {
  let left = Infinity; let top = Infinity; let right = -Infinity; let bottom = -Infinity;
  for (const child of owner.childNodes) {
    if (child.nodeType !== 3 || !child.nodeValue?.trim()) continue;
    const range = document.createRange();
    range.selectNodeContents(child);
    for (const rect of range.getClientRects()) {
      if (rect.width <= 0 || rect.height <= 0) continue;
      left = Math.min(left, rect.left); top = Math.min(top, rect.top);
      right = Math.max(right, rect.right); bottom = Math.max(bottom, rect.bottom);
    }
  }
  return Number.isFinite(left) ? { left, top, right, bottom } : null;
}

/** The opacity the element is drawn with: its own and every ancestor's, up to the surface. */
function drawnOpacity(element, surface) {
  let opacity = 1;
  for (let node = element; node && node !== surface; node = node.parentElement) {
    const value = Number.parseFloat(getComputedStyle(node).opacity);
    if (Number.isFinite(value)) opacity *= value;
  }
  return opacity;
}

function textColour(owner) {
  const style = getComputedStyle(owner);
  if (owner.namespaceURI === 'http://www.w3.org/2000/svg' && SVG_TEXT.has(owner.localName)) {
    return parseCssColor(style.fill);
  }
  // Text painted by its background (background-clip: text) has a transparent colour: its look is a
  // gradient or a picture, which no single colour stands for.
  const fill = style.webkitTextFillColor || style.color;
  return parseCssColor(fill);
}

/**
 * Every text on the panel the canvas shows, with its contrast:
 * [{ id, controlName, text, ratio, required, large, measurable }], hardest first; `ratio` is null
 * where the text's colour is not one colour (measurable: false).
 */
export async function measureTextContrast() {
  const panel = get(activePanel);
  const surface = liveSurface(panel?.id);
  if (!surface) return { ok: false, reason: 'Show the panel in the editor, then check it.' };
  await surfaceReady(surface);

  const owners = textOwners(surface);
  const hidden = new Set(owners);
  const width = panel?.width ?? surface.clientWidth;
  const height = panel?.height ?? surface.clientHeight;
  const background = await pictureOfElement(surface, {
    region: { x: 0, y: 0, width, height },
    scale: 1,
    skip: (node) => node.matches?.(EDITOR_ONLY) ?? false,
    adjust: (copy, live) => {
      for (const name of EDITOR_STATE_CLASSES) copy.classList?.remove(name);
      if (!hidden.has(live) || !copy.style) return;
      for (const property of ['color', '-webkit-text-fill-color', 'fill', 'stroke', 'caret-color']) {
        copy.style.setProperty(property, 'transparent', 'important');
      }
      copy.style.setProperty('text-shadow', 'none', 'important');
      copy.style.setProperty('-webkit-text-stroke', '0', 'important');
    },
    rootStyle: SURFACE_ROOT_STYLE,
  });
  const ctx = background.canvas.getContext('2d', { willReadFrequently: true });
  const surfaceRect = surface.getBoundingClientRect();
  const zoom = surface.offsetWidth ? surfaceRect.width / surface.offsetWidth : 1;

  const byControl = new Map();
  for (const owner of owners) {
    const box = textBox(owner);
    if (!box) continue;
    const x0 = Math.max(0, Math.floor((box.left - surfaceRect.left) / zoom - surface.clientLeft));
    const y0 = Math.max(0, Math.floor((box.top - surfaceRect.top) / zoom - surface.clientTop));
    const x1 = Math.min(width, Math.ceil((box.right - surfaceRect.left) / zoom - surface.clientLeft));
    const y1 = Math.min(height, Math.ceil((box.bottom - surfaceRect.top) / zoom - surface.clientTop));
    if (x1 <= x0 || y1 <= y0) continue;

    const style = getComputedStyle(owner);
    const colour = textColour(owner);
    const opacity = drawnOpacity(owner, surface);
    if (opacity < 0.05) continue;   // drawn invisibly on purpose (a hit area, a hidden caption)
    const control = owner.closest('[data-control-id]');
    const id = control?.getAttribute('data-control-id') ?? '';
    const fontSize = Number.parseFloat(style.fontSize) || 12;
    const required = requiredContrast(fontSize, style.fontWeight);
    const measurable = !!colour && colour.a > 0;
    const ratio = measurable
      ? contrastOverPixels({ ...colour, a: colour.a * opacity }, ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data)
      : null;
    const entry = {
      id,
      text: String(owner.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40),
      ratio: ratio == null ? null : Math.round(ratio * 100) / 100,
      required,
      large: required === 3,
      measurable,
    };
    // A control keeps its hardest text: the one a reader would struggle with.
    const kept = byControl.get(id);
    const shortfall = (e) => (e.ratio == null ? -1 : e.required / e.ratio);
    if (!kept || shortfall(entry) > shortfall(kept)) byControl.set(id, entry);
  }

  const names = new Map(flatControls(panel?.controls ?? [])
    .map((control) => [String(control?._children?.Core?.id ?? ''), String(control?._children?.Core?.name ?? '')]));
  const results = [...byControl.values()].map((entry) => ({ ...entry, controlName: names.get(entry.id) || entry.id }));
  results.sort((a, b) => (a.ratio == null ? 1 : a.ratio / a.required) - (b.ratio == null ? 1 : b.ratio / b.required));
  return {
    ok: true,
    results,
    failing: results.filter((entry) => entry.ratio != null && entry.ratio < entry.required),
    unmeasured: results.filter((entry) => entry.ratio == null),
    missing: background.missing,
  };
}
