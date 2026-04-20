/**
 * Converts a gradient data object to a CSS background string.
 * Shared between GradientEditor and GradientMiniPreview.
 */

/**
 * Build CSS color stops string from gradient stops.
 * @param {Array} stops - [{color: 'RRGGBB', position: 0-100}, ...]
 * @param {number} edge - Edge hardness 0 (smooth) to 100 (hard bands).
 *   Backwards compat: 'soft' treated as 0, 'hard' as 100.
 * @returns {string} CSS color stop list
 */
function buildStops(stops, edge) {
  const sorted = [...stops].sort((a, b) => a.position - b.position);

  // Normalize legacy string values
  let hardness = typeof edge === 'number' ? edge : (edge === 'hard' ? 100 : 0);
  hardness = Math.max(0, Math.min(100, hardness));

  if (hardness === 0) {
    // Fully smooth
    return sorted.map(s => `#${s.color} ${s.position}%`).join(', ');
  }

  // Partial to full hardness: shrink the transition zone between stops.
  // At 100% hardness, each color occupies a flat band (zero transition).
  // At e.g. 50%, the transition zone is halved.
  const t = hardness / 100; // 0..1
  const parts = [];
  for (let i = 0; i < sorted.length; i++) {
    const cur = sorted[i];
    const next = sorted[i + 1];
    if (!next) {
      parts.push(`#${cur.color} ${cur.position}%`);
    } else {
      const mid = (cur.position + next.position) / 2;
      const holdEnd = cur.position + (mid - cur.position) * t;
      const nextStart = next.position - (next.position - mid) * t;
      parts.push(`#${cur.color} ${cur.position}%`);
      parts.push(`#${cur.color} ${holdEnd}%`);
      parts.push(`#${next.color} ${nextStart}%`);
    }
  }
  return parts.join(', ');
}

/**
 * Convert gradient data to CSS background property value.
 * @param {object} gradient - The gradient data object from the panel store
 * @returns {string} CSS background value
 */
export function gradientToCSS(gradient, shape = 'rectangle') {
  if (!gradient || !gradient.stops || gradient.stops.length < 2) {
    return '#333333';
  }

  const stops = buildStops(gradient.stops, gradient.edge ?? 'soft');
  const angle = gradient.angle ?? 90;
  const cx = gradient.centerX ?? 50;
  const cy = gradient.centerY ?? 50;
  const rx = gradient.radiusX ?? 50;
  // Circle/square shapes force ry = rx for perfectly round radials
  const ry = (shape === 'circle' || shape === 'square') ? rx : (gradient.radiusY ?? 50);

  switch (gradient.type) {
    case 'linear':
      return `linear-gradient(${angle}deg, ${stops})`;

    case 'radial':
      return `radial-gradient(ellipse ${rx}% ${ry}% at ${cx}% ${cy}%, ${stops})`;

    case 'conical':
      return `conic-gradient(from ${angle}deg at ${cx}% ${cy}%, ${stops})`;

    case 'radialRamp': {
      // Repeating radial — scale stop positions by radius to define one cycle
      const sorted = [...gradient.stops].sort((a, b) => a.position - b.position);
      const scaled = sorted.map(s => ({
        ...s, position: parseFloat((s.position / 100 * rx).toFixed(1))
      }));
      const rampStops = buildStops(scaled, gradient.edge ?? 0);
      return `repeating-radial-gradient(ellipse at ${cx}% ${cy}%, ${rampStops})`;
    }

    case 'linearRamp': {
      // Repeating linear — scale stop positions to create repeating bands
      const sorted = [...gradient.stops].sort((a, b) => a.position - b.position);
      const cycleSize = rx; // reuse radiusX as cycle width (%)
      const scaled = sorted.map(s => ({
        ...s, position: parseFloat((s.position / 100 * cycleSize).toFixed(1))
      }));
      const rampStops = buildStops(scaled, gradient.edge ?? 0);
      return `repeating-linear-gradient(${angle}deg, ${rampStops})`;
    }

    case 'squareRamp': {
      // Concentric squares — CSS can't do Chebyshev distance natively.
      // Rendered via canvas in squareRampToDataURL(), return placeholder here.
      return '#333';
    }

    case 'duotone': {
      const sorted = [...gradient.stops].sort((a, b) => a.position - b.position);
      const c1 = sorted[0]?.color || '000000';
      const c2 = sorted[sorted.length - 1]?.color || 'FFFFFF';
      return `linear-gradient(${angle}deg, #${c1} 0%, #${c2} 100%)`;
    }

    case 'tricolor': {
      const sorted = [...gradient.stops].sort((a, b) => a.position - b.position);
      const c1 = sorted[0]?.color || '000000';
      const c2 = sorted[Math.floor(sorted.length / 2)]?.color || '888888';
      const c3 = sorted[sorted.length - 1]?.color || 'FFFFFF';
      return `linear-gradient(${angle}deg, #${c1} 0%, #${c2} 50%, #${c3} 100%)`;
    }

    case 'banding': {
      const bandStops = buildStops(gradient.stops, 'hard');
      return `linear-gradient(${angle}deg, ${bandStops})`;
    }

    case 'reflected': {
      // Bilinear 1D — mirror stops symmetrically from center outward
      const sorted = [...gradient.stops].sort((a, b) => a.position - b.position);
      const parts = [];
      // First half: mirror (highest position → 0%, lowest → 50%)
      for (let i = sorted.length - 1; i >= 0; i--) {
        const cssPos = 50 - (sorted[i].position / 100) * 50;
        parts.push(`#${sorted[i].color} ${cssPos}%`);
      }
      // Second half: normal (skip first to avoid duplicate at center)
      for (let i = 1; i < sorted.length; i++) {
        const cssPos = 50 + (sorted[i].position / 100) * 50;
        parts.push(`#${sorted[i].color} ${cssPos}%`);
      }
      return `linear-gradient(${angle}deg, ${parts.join(', ')})`;
    }

    case 'mesh':
    case 'volumeMesh': {
      // CSS approximation with layered radials; use meshPoints if available
      const points = gradient.meshPoints || gradient.stops.map((s, i) => ({
        x: ((i / Math.max(gradient.stops.length - 1, 1)) * 80 + 10),
        y: ((i % 2) * 60 + 20),
        color: s.color,
      }));
      // volumeMesh uses same layers — blur applied via gradientFilterCSS()
      return points.map(p =>
        `radial-gradient(circle at ${p.x}% ${p.y}%, #${p.color} 0%, transparent 70%)`
      ).join(', ');
    }

    default:
      return `linear-gradient(${gradient.angle}deg, ${stops})`;
  }
}

/**
 * Build a CSS stop string for the stop bar (always linear, always soft, left-to-right).
 * @param {Array} stops
 * @param {'soft'|'hard'} edge
 * @returns {string}
 */
export function stopBarCSS(stops, edge) {
  if (!stops || stops.length < 2) return '#333';
  return `linear-gradient(to right, ${buildStops(stops, edge)})`;
}

/**
 * Returns a CSS background-blend-mode value for gradient types needing blending.
 * squareRamp layers two gradients that must be blended to create concentric squares.
 */
export function gradientBlendCSS(gradient) {
  return '';
}

/**
 * Returns a CSS filter value for gradient types needing post-processing.
 * volumeMesh applies blur to blend sharp radial layers into fluid clouds.
 */
export function gradientFilterCSS(gradient) {
  if (gradient?.type === 'volumeMesh') return 'blur(50px)';
  return '';
}

/**
 * Interpolate a color between two stops at a given position.
 * @param {Array} stops - Sorted stops array
 * @param {number} position - 0-100
 * @returns {string} 6-digit hex
 */
export function interpolateColor(stops, position) {
  const sorted = [...stops].sort((a, b) => a.position - b.position);
  if (position <= sorted[0].position) return sorted[0].color;
  if (position >= sorted[sorted.length - 1].position) return sorted[sorted.length - 1].color;

  let left = sorted[0], right = sorted[sorted.length - 1];
  for (let i = 0; i < sorted.length - 1; i++) {
    if (position >= sorted[i].position && position <= sorted[i + 1].position) {
      left = sorted[i];
      right = sorted[i + 1];
      break;
    }
  }

  const t = (position - left.position) / (right.position - left.position);
  const lR = parseInt(left.color.slice(0, 2), 16);
  const lG = parseInt(left.color.slice(2, 4), 16);
  const lB = parseInt(left.color.slice(4, 6), 16);
  const rR = parseInt(right.color.slice(0, 2), 16);
  const rG = parseInt(right.color.slice(2, 4), 16);
  const rB = parseInt(right.color.slice(4, 6), 16);

  const toHex = v => Math.round(v).toString(16).padStart(2, '0').toUpperCase();
  return toHex(lR + (rR - lR) * t) + toHex(lG + (rG - lG) * t) + toHex(lB + (rB - lB) * t);
}

/**
 * Interpolate color as [r, g, b] for canvas rendering.
 */
function interpolateRGB(stops, position) {
  const sorted = [...stops].sort((a, b) => a.position - b.position);
  if (position <= sorted[0].position) {
    const c = sorted[0].color;
    return [parseInt(c.slice(0,2),16), parseInt(c.slice(2,4),16), parseInt(c.slice(4,6),16)];
  }
  if (position >= sorted[sorted.length-1].position) {
    const c = sorted[sorted.length-1].color;
    return [parseInt(c.slice(0,2),16), parseInt(c.slice(2,4),16), parseInt(c.slice(4,6),16)];
  }
  let left = sorted[0], right = sorted[sorted.length-1];
  for (let i = 0; i < sorted.length - 1; i++) {
    if (position >= sorted[i].position && position <= sorted[i+1].position) {
      left = sorted[i]; right = sorted[i+1]; break;
    }
  }
  const t = (position - left.position) / (right.position - left.position);
  const lR = parseInt(left.color.slice(0,2),16), lG = parseInt(left.color.slice(2,4),16), lB = parseInt(left.color.slice(4,6),16);
  const rR = parseInt(right.color.slice(0,2),16), rG = parseInt(right.color.slice(2,4),16), rB = parseInt(right.color.slice(4,6),16);
  return [Math.round(lR+(rR-lR)*t), Math.round(lG+(rG-lG)*t), Math.round(lB+(rB-lB)*t)];
}

/**
 * Render a square ramp gradient to a canvas data URL.
 * Uses Chebyshev distance: max(|dx|, |dy|) from center, repeating.
 * @param {object} gradient
 * @param {number} width
 * @param {number} height
 * @returns {string} data URL
 */
export function squareRampToDataURL(gradient, width = 256, height = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(width, height);

  const cx = (gradient.centerX ?? 50) / 100 * width;
  const cy = (gradient.centerY ?? 50) / 100 * height;
  const cycleW = (gradient.radiusX ?? 50) / 100 * width;
  const cycleH = (gradient.radiusY ?? 50) / 100 * height;
  const stops = gradient.stops || [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Chebyshev distance normalized to cycle size
      const dx = Math.abs(x - cx) / (cycleW || 1);
      const dy = Math.abs(y - cy) / (cycleH || 1);
      let dist = Math.max(dx, dy);
      // Repeating: wrap into 0-1 range
      dist = dist % 1;
      // Map to stop position 0-100
      const pos = dist * 100;
      const [r, g, b] = interpolateRGB(stops, pos);
      const idx = (y * width + x) * 4;
      img.data[idx] = r;
      img.data[idx+1] = g;
      img.data[idx+2] = b;
      img.data[idx+3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL();
}
