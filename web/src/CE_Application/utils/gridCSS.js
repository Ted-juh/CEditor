/**
 * Panel grid computation helpers.
 * - computeGridOrigin: origin used for snapping (no visual fudge)
 * - buildGridStyle: CSS background-image producing the visual grid
 */

import { hexToRgba } from './backgroundCSS.js';

/**
 * Snap origin for grid-aligned drags. Returns { x, y }.
 * When `gridCentered` is set, the origin is offset so the grid is symmetrically
 * placed around the panel, based on the largest tile (major grid, if any).
 */
export function computeGridOrigin(panel, gridSize) {
  if (!panel) return { x: 0, y: 0 };
  let ox = panel.gridOriginX ?? 0;
  let oy = panel.gridOriginY ?? 0;
  if (panel.gridCentered && gridSize > 0) {
    const sub = panel.gridSubdivision ?? 1;
    const tileSize = sub > 1 ? gridSize * sub : gridSize;
    const rw = Math.round(panel.width / tileSize);
    const rh = Math.round(panel.height / tileSize);
    ox = -((rw * tileSize) - panel.width) / 2;
    oy = -((rh * tileSize) - panel.height) / 2;
  }
  return { x: ox, y: oy };
}

/**
 * Visual grid CSS. Returns '' when disabled.
 * Supports dots / crosses / subdivided-lines / plain-lines modes.
 * Applies a -1.5px fudge on centered grids so the 1px stroke lines visually
 * center on the integer pixel boundary.
 */
export function buildGridStyle(panel, { gridEnabled, gridSize, gridColour, gridLineWidth }) {
  if (!gridEnabled || gridSize <= 0) return '';
  const c = hexToRgba(gridColour);
  const lw = gridLineWidth;
  const type = panel?.gridType ?? 'lines';
  const sub = panel?.gridSubdivision ?? 1;
  let ox = panel?.gridOriginX ?? 0;
  let oy = panel?.gridOriginY ?? 0;

  if (panel?.gridCentered) {
    // Round up the number of cells needed to cover each dimension, compute the
    // overshoot, then shift the origin by half the remainder so edges are equal.
    const tileSize = sub > 1 ? gridSize * sub : gridSize;
    const rw = Math.round(panel.width / tileSize);
    const rh = Math.round(panel.height / tileSize);
    ox = -((rw * tileSize) - panel.width) / 2 - 1.5;
    oy = -((rh * tileSize) - panel.height) / 2 - 1.5;
  }

  if (type === 'dots') {
    return `
      background-image: radial-gradient(circle, ${c} ${lw}px, transparent ${lw}px);
      background-size: ${gridSize}px ${gridSize}px;
      background-position: ${ox}px ${oy}px;
    `;
  }
  if (type === 'crosses') {
    const arm = Math.max(2, Math.round(gridSize * 0.2));
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${gridSize}' height='${gridSize}'><line x1='${gridSize/2 - arm}' y1='${gridSize/2}' x2='${gridSize/2 + arm}' y2='${gridSize/2}' stroke='${c}' stroke-width='${lw}'/><line x1='${gridSize/2}' y1='${gridSize/2 - arm}' x2='${gridSize/2}' y2='${gridSize/2 + arm}' stroke='${c}' stroke-width='${lw}'/></svg>`;
    const encoded = encodeURIComponent(svg);
    return `
      background-image: url("data:image/svg+xml,${encoded}");
      background-size: ${gridSize}px ${gridSize}px;
      background-position: ${ox}px ${oy}px;
    `;
  }
  if (sub > 1) {
    const majorSize = gridSize * sub;
    const majorLw = Math.max(lw + 1, lw * 2);
    const majorC = hexToRgba(panel?.gridSubColour ?? '55FFFFFF');
    return `
      background-image:
        linear-gradient(${majorC} ${majorLw}px, transparent ${majorLw}px),
        linear-gradient(90deg, ${majorC} ${majorLw}px, transparent ${majorLw}px),
        linear-gradient(${c} ${lw}px, transparent ${lw}px),
        linear-gradient(90deg, ${c} ${lw}px, transparent ${lw}px);
      background-size: ${majorSize}px ${majorSize}px, ${majorSize}px ${majorSize}px, ${gridSize}px ${gridSize}px, ${gridSize}px ${gridSize}px;
      background-position: ${ox}px ${oy}px;
    `;
  }
  return `
    background-image:
      linear-gradient(${c} ${lw}px, transparent ${lw}px),
      linear-gradient(90deg, ${c} ${lw}px, transparent ${lw}px);
    background-size: ${gridSize}px ${gridSize}px;
    background-position: ${ox}px ${oy}px;
  `;
}
