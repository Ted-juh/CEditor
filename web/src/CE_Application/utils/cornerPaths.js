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

    // Inward and outward both use a circular arc — the geometric quarter
    // circle, centered at (i, i) for inward and (R+i, R+i) for outward. Sides
    // are inset to butt against the arc cap (see sideInset in borderSegments.js).
    //
    // Reserved for a future "smooth inward" mode (cubic Bezier whose endpoint
    // tangents are parallel to the adjacent sides, so the stroke caps merge
    // without any L-step). Wire it up via a corner direction value like
    // `inward-smooth` when the UI exposes it:
    //
    //   const k = ro * 0.552284749831;
    //   case 'tl': return `M ${i} ${ro + i} C ${i} ${ro + i + k} ${ro + i + k} ${i} ${ro + i} ${i}`;
    //   case 'tr': return `M ${W - ro - i} ${i} C ${W - ro - i - k} ${i} ${W - i} ${ro + i + k} ${W - i} ${ro + i}`;
    //   case 'br': return `M ${W - i} ${H - ro - i} C ${W - i} ${H - ro - i - k} ${W - ro - i - k} ${H - i} ${W - ro - i} ${H - i}`;
    //   case 'bl': return `M ${ro + i} ${H - i} C ${ro + i + k} ${H - i} ${i} ${H - ro - i - k} ${i} ${H - ro - i}`;
    if (dir === 'inward') {
      // Extend each arc endpoint to the box edge with a line leg. The arc's
      // butt cap at each endpoint is perpendicular to the tangent (horizontal
      // at the side endpoint, vertical at the top endpoint), so it only covers
      // half the stroke width toward the box edge. The line legs fill that gap.
      switch (pos) {
        case 'tl': return `M 0 ${ro + i} L ${i} ${ro + i} A ${ro} ${ro} 0 0 0 ${ro + i} ${i} L ${ro + i} 0`;
        case 'tr': return `M ${W - ro - i} 0 L ${W - ro - i} ${i} A ${ro} ${ro} 0 0 0 ${W - i} ${ro + i} L ${W} ${ro + i}`;
        case 'br': return `M ${W} ${H - ro - i} L ${W - i} ${H - ro - i} A ${ro} ${ro} 0 0 0 ${W - ro - i} ${H - i} L ${W - ro - i} ${H}`;
        case 'bl': return `M ${ro + i} ${H} L ${ro + i} ${H - i} A ${ro} ${ro} 0 0 0 ${i} ${H - ro - i} L 0 ${H - ro - i}`;
      }
    }
    switch (pos) {
      case 'tl': return `M ${i} ${ro + i} A ${ro} ${ro} 0 0 1 ${ro + i} ${i}`;
      case 'tr': return `M ${W - ro - i} ${i} A ${ro} ${ro} 0 0 1 ${W - i} ${ro + i}`;
      case 'br': return `M ${W - i} ${H - ro - i} A ${ro} ${ro} 0 0 1 ${W - ro - i} ${H - i}`;
      case 'bl': return `M ${ro + i} ${H - i} A ${ro} ${ro} 0 0 1 ${i} ${H - ro - i}`;
    }
  }

  if (style === 'chamfer') {
    // Short horizontal/vertical legs extend to the box edge before and after
    // the diagonal, so the butt caps are axis-aligned and flush with the side
    // strokes — same approach as the inward-arc line legs.
    switch (pos) {
      case 'tl': return `M 0 ${e} L ${i} ${e} L ${e} ${i} L ${e} 0`;
      case 'tr': return `M ${W - e} 0 L ${W - e} ${i} L ${W - i} ${e} L ${W} ${e}`;
      case 'br': return `M ${W} ${H - e} L ${W - i} ${H - e} L ${W - e} ${H - i} L ${W - e} ${H}`;
      case 'bl': return `M ${e} ${H} L ${e} ${H - i} L ${i} ${H - e} L 0 ${H - e}`;
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
