/**
 * SVG path builders for single-corner shapes.
 *
 * Corner shape vocabulary (used by both border stroke paths and fill
 * clip-paths):
 *   - rounded (outward / inward)
 *   - chamfer (45° cut)
 *   - notch   (L-shaped inset)
 *   - straight (plain 90° corner)
 *
 * All positions map to 'tl' | 'tr' | 'br' | 'bl'.
 */

/**
 * Build the stroked corner path for a single corner layer.
 *
 *   cn     — corner data (needs .style, .direction)
 *   pos    — 'tl' | 'tr' | 'br' | 'bl'
 *   R      — corner radius (inset-adjusted if needed)
 *   inset  — per-layer centerline inset from the box edge
 *   tBase  — base half-thickness (used to compute R+t end position)
 *   W, H   — box dimensions
 */
export function buildCornerPath(cn, pos, R, inset, tBase, W, H) {
  const style = cn.style || 'rounded';
  const dir = cn.direction || 'outward';
  const i = inset;
  const e = R + tBase;

  if (R <= 0) {
    switch (pos) {
      case 'tl': return `M ${i} ${i}`;
      case 'tr': return `M ${W - i} ${i}`;
      case 'br': return `M ${W - i} ${H - i}`;
      case 'bl': return `M ${i} ${H - i}`;
    }
  }

  if (style === 'rounded') {
    const ro = Math.max(0, e - i);
    if (ro <= 0) {
      switch (pos) {
        case 'tl': return `M ${i} ${i}`;
        case 'tr': return `M ${W - i} ${i}`;
        case 'br': return `M ${W - i} ${H - i}`;
        case 'bl': return `M ${i} ${H - i}`;
      }
    }
    const sweep = dir === 'inward' ? 0 : 1;
    switch (pos) {
      case 'tl': return `M ${i} ${ro + i} A ${ro} ${ro} 0 0 ${sweep} ${ro + i} ${i}`;
      case 'tr': return `M ${W - ro - i} ${i} A ${ro} ${ro} 0 0 ${sweep} ${W - i} ${ro + i}`;
      case 'br': return `M ${W - i} ${H - ro - i} A ${ro} ${ro} 0 0 ${sweep} ${W - ro - i} ${H - i}`;
      case 'bl': return `M ${ro + i} ${H - i} A ${ro} ${ro} 0 0 ${sweep} ${i} ${H - ro - i}`;
    }
  }

  if (style === 'chamfer') {
    switch (pos) {
      case 'tl': return `M ${i} ${e} L ${e} ${i}`;
      case 'tr': return `M ${W - e} ${i} L ${W - i} ${e}`;
      case 'br': return `M ${W - i} ${H - e} L ${W - e} ${H - i}`;
      case 'bl': return `M ${e} ${H - i} L ${i} ${H - e}`;
    }
  }
  if (style === 'notch') {
    switch (pos) {
      case 'tl': return `M ${i} ${e} L ${e} ${e} L ${e} ${i}`;
      case 'tr': return `M ${W - e} ${i} L ${W - e} ${e} L ${W - i} ${e}`;
      case 'br': return `M ${W - i} ${H - e} L ${W - e} ${H - e} L ${W - e} ${H - i}`;
      case 'bl': return `M ${e} ${H - i} L ${e} ${H - e} L ${i} ${H - e}`;
    }
  }
  // straight
  switch (pos) {
    case 'tl': return `M ${i} ${e} L ${i} ${i} L ${e} ${i}`;
    case 'tr': return `M ${W - e} ${i} L ${W - i} ${i} L ${W - i} ${e}`;
    case 'br': return `M ${W - i} ${H - e} L ${W - i} ${H - i} L ${W - e} ${H - i}`;
    case 'bl': return `M ${e} ${H - i} L ${i} ${H - i} L ${i} ${H - e}`;
  }
}

/**
 * Build the fill-layer clip-path CSS. Takes normalized corner data for
 * each position and returns `clip-path: path('...');` or ''.
 *
 *   cornersByPos — { tl, tr, br, bl } normalized corner objects
 */
export function buildFillClipPath(cornersByPos, W, H) {
  const { tl, tr, br, bl } = cornersByPos;
  const d = [];
  const tlP = fillCornerSegment(tl, 'tl', W, H);
  d.push(`M ${tlP.start}`); d.push(tlP.path);
  const trP = fillCornerSegment(tr, 'tr', W, H);
  d.push(`L ${trP.start}`); d.push(trP.path);
  const brP = fillCornerSegment(br, 'br', W, H);
  d.push(`L ${brP.start}`); d.push(brP.path);
  const blP = fillCornerSegment(bl, 'bl', W, H);
  d.push(`L ${blP.start}`); d.push(blP.path);
  d.push('Z');
  return `clip-path: path('${d.join(' ')}');`;
}

// Internal: one corner's segment of the fill clip-path outline.
function fillCornerSegment(c, pos, W, H) {
  const r = c.radius || 0;
  const style = c.style || 'rounded';
  const dir = c.direction || 'outward';

  if (r === 0 || style === 'straight') {
    switch (pos) {
      case 'tl': return { start: '0 0', path: '' };
      case 'tr': return { start: `${W} 0`, path: '' };
      case 'br': return { start: `${W} ${H}`, path: '' };
      case 'bl': return { start: `0 ${H}`, path: '' };
    }
  }
  if (style === 'rounded' && dir === 'inward') {
    switch (pos) {
      case 'tl': return { start: `0 ${r}`, path: `A ${r} ${r} 0 0 0 ${r} 0` };
      case 'tr': return { start: `${W - r} 0`, path: `A ${r} ${r} 0 0 0 ${W} ${r}` };
      case 'br': return { start: `${W} ${H - r}`, path: `A ${r} ${r} 0 0 0 ${W - r} ${H}` };
      case 'bl': return { start: `${r} ${H}`, path: `A ${r} ${r} 0 0 0 0 ${H - r}` };
    }
  }
  if (style === 'rounded') {
    switch (pos) {
      case 'tl': return { start: `0 ${r}`, path: `A ${r} ${r} 0 0 1 ${r} 0` };
      case 'tr': return { start: `${W - r} 0`, path: `A ${r} ${r} 0 0 1 ${W} ${r}` };
      case 'br': return { start: `${W} ${H - r}`, path: `A ${r} ${r} 0 0 1 ${W - r} ${H}` };
      case 'bl': return { start: `${r} ${H}`, path: `A ${r} ${r} 0 0 1 0 ${H - r}` };
    }
  }
  if (style === 'chamfer') {
    const d = r;
    switch (pos) {
      case 'tl': return { start: `0 ${d}`, path: `L ${d} 0` };
      case 'tr': return { start: `${W - d} 0`, path: `L ${W} ${d}` };
      case 'br': return { start: `${W} ${H - d}`, path: `L ${W - d} ${H}` };
      case 'bl': return { start: `${d} ${H}`, path: `L 0 ${H - d}` };
    }
  }
  if (style === 'notch') {
    switch (pos) {
      case 'tl': return { start: `0 ${r}`, path: `L ${r} ${r} L ${r} 0` };
      case 'tr': return { start: `${W - r} 0`, path: `L ${W - r} ${r} L ${W} ${r}` };
      case 'br': return { start: `${W} ${H - r}`, path: `L ${W - r} ${H - r} L ${W - r} ${H}` };
      case 'bl': return { start: `${r} ${H}`, path: `L ${r} ${H - r} L 0 ${H - r}` };
    }
  }
  // Fallback (unknown style)
  switch (pos) {
    case 'tl': return { start: '0 0', path: '' };
    case 'tr': return { start: `${W} 0`, path: '' };
    case 'br': return { start: `${W} ${H}`, path: '' };
    case 'bl': return { start: `0 ${H}`, path: '' };
  }
}
