/**
 * The gradient editor's proxy shape, derived from the thing being painted.
 *
 * THE PROBLEM THIS FIXES. The preview's shape was a five-button toggle row —
 * circle / ellipse / square / rectangle / triangle — defaulting to rectangle
 * and never once asked the target what it actually looks like. Design a radial
 * on the square proxy, apply it to a 240 × 40 fader, and the gradient you get
 * is not the gradient you drew: the radius handles map onto a different box
 * and the rounded corners the control really has are nowhere in the picture.
 * A WYSIWYG editor that guesses the W is not one.
 *
 * So the default is now the target's real width, height and corner geometry,
 * read out of the same `Transform` and `Background.Corners` the canvas paints
 * from. The manual shapes survive as an explicit override — sketching a
 * gradient before there is a target to aim it at is a real thing to want —
 * but they are a choice now, not the silent default.
 *
 * Pure: no stores, no DOM. The components hand in the target descriptor (from
 * `stores/gradientTarget.js`) and the active panel.
 */

import { findControlById } from './containment.js';
import { fillShapeCSS } from './plainFillCSS.js';
import { normalizeCorner } from './cornerNormalization.js';

/** What a preview falls back to with nothing to aim at: a plain 3:2 card. */
export const FALLBACK_GEOMETRY = Object.freeze({
  width: 240, height: 160, corners: null,
  source: 'none', label: 'No target — generic proxy',
});

const CORNER_KEYS = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'];
const CORNER_POSITIONS = ['tl', 'tr', 'br', 'bl'];

function positive(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function controlName(control) {
  return control?._children?.Core?.name ?? 'control';
}

/**
 * Real geometry of whatever the gradient is being written to.
 *
 * @param {object|null} target — a `gradientTarget` descriptor
 * @param {object|null} panel  — the active panel
 * @returns {{width:number, height:number, corners:object|null, source:string, label:string}}
 */
export function deriveProxyGeometry(target, panel) {
  if (target?.type === 'control') {
    const control = findControlById(panel?.controls ?? [], target.controlId);
    const transform = control?._children?.Transform;
    if (transform) {
      const width = positive(transform.width, FALLBACK_GEOMETRY.width);
      const height = positive(transform.height, FALLBACK_GEOMETRY.height);
      return {
        width,
        height,
        corners: control?._children?.Background?._children?.Corners ?? null,
        source: 'control',
        label: `${controlName(control)} — ${Math.round(width)} × ${Math.round(height)}`,
      };
    }
  }

  if (panel) {
    const width = positive(panel.width, FALLBACK_GEOMETRY.width);
    const height = positive(panel.height, FALLBACK_GEOMETRY.height);
    return {
      width,
      height,
      corners: null,
      source: 'panel',
      label: `${panel.name ?? 'Panel'} — ${Math.round(width)} × ${Math.round(height)}`,
    };
  }

  return { ...FALLBACK_GEOMETRY };
}

/**
 * Fit the target's box into the editor area, preserving its aspect ratio.
 * `scale` is what the corner radii have to be multiplied by — a 12px radius on
 * a 480px-wide control is a 3px radius on a preview a quarter the size, and
 * leaving it at 12 would draw a completely different shape.
 */
export function fitProxyBox(geometry, availWidth, availHeight, inset = 0.86) {
  const w = positive(geometry?.width, FALLBACK_GEOMETRY.width);
  const h = positive(geometry?.height, FALLBACK_GEOMETRY.height);
  const availW = Math.max(0, Number(availWidth) || 0) * inset;
  const availH = Math.max(0, Number(availHeight) || 0) * inset;
  if (availW <= 0 || availH <= 0) return { width: 0, height: 0, scale: 0 };

  const scale = Math.min(availW / w, availH / h);
  return {
    width: Math.max(8, Math.round(w * scale)),
    height: Math.max(8, Math.round(h * scale)),
    scale,
  };
}

/** Scale every radius in a Corners section, linked or unlinked. */
export function scaleCorners(corners, scale) {
  if (!corners) return null;
  const out = { ...corners };
  if (Number.isFinite(Number(corners.radius))) out.radius = Number(corners.radius) * scale;
  for (const key of CORNER_KEYS) {
    const slot = corners[key];
    if (slot && typeof slot === 'object') {
      out[key] = { ...slot, radius: (Number(slot.radius) || 0) * scale };
    }
  }
  return out;
}

/**
 * The CSS declaration that gives the preview box the target's outline —
 * `border-radius: …` or a `clip-path: …` for chamfers, notches and inward
 * corners. Same function the canvas fill uses, so the two cannot drift.
 */
export function proxyShapeCSS(geometry, previewWidth, previewHeight) {
  if (!geometry?.corners || previewWidth <= 0 || previewHeight <= 0) return '';
  const scale = previewWidth / positive(geometry.width, previewWidth);
  return fillShapeCSS(scaleCorners(geometry.corners, scale), previewWidth, previewHeight);
}

/**
 * Nearest of the legacy shape names, for the code that still speaks them:
 * `gradientToCSS` (which forces ry = rx for round shapes) and
 * `computeAxisGeometry` (which picks the axis length from it).
 */
export function proxyShapeKind(geometry) {
  const width = positive(geometry?.width, FALLBACK_GEOMETRY.width);
  const height = positive(geometry?.height, FALLBACK_GEOMETRY.height);
  const corners = geometry?.corners;
  if (corners) {
    // Half of the LONGER side, not the shorter one. A 120 × 48 control with a
    // 24px radius is a pill, not an ellipse: its straight flanks are most of
    // its width, and calling it an ellipse would swap the axis length for the
    // shorter one that only a real ellipse has.
    const half = Math.max(width, height) / 2;
    const round = CORNER_POSITIONS
      .map((pos) => normalizeCorner(corners, pos))
      .every((c) => c.style === 'rounded' && c.direction !== 'inward' && c.radius >= half - 0.5);
    if (round) return Math.abs(width - height) < 0.5 ? 'circle' : 'ellipse';
  }
  return 'rectangle';
}
