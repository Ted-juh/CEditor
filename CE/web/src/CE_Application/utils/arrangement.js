// arrangement.js — the arithmetic of arranging controls (design doc §42): align, distribute, match
// size, tidy into a grid, arrange in a circle and flip, pure. Transforms in PANEL space go in, a
// { id: patch } map comes out, and nothing reads a store.
//
// Every operation was written against the editor's SELECTION and could only ever run from the
// canvas (stores/alignment.js, which re-exports these). ce.panel needs the same maths against a list
// of NAMES, and two implementations of "distribute six things evenly" would drift the first time one
// of them was touched. The script editor's Values tab is the third reader: its row for an
// arrangement verb draws where the controls are and where the verb puts them, from arrangementPlan,
// which is the verb's own decision — the runtime (panelRuntime.js) applies the same plan.

/** The bounding box of a set of transforms. */
export function boundsOf(transforms) {
  if (!transforms.length) return { x: 0, y: 0, width: 0, height: 0 };
  const minX = Math.min(...transforms.map(t => t.x));
  const minY = Math.min(...transforms.map(t => t.y));
  const maxX = Math.max(...transforms.map(t => t.x + t.width));
  const maxY = Math.max(...transforms.map(t => t.y + t.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Align every transform to one edge of `ref`. `edge` is left|hCenter|right|top|vCenter|bottom. */
export function alignPatch(transform, edge, ref) {
  switch (edge) {
    case 'left':    return { 'Transform.x': ref.x };
    case 'hCenter': return { 'Transform.x': Math.round(ref.x + ref.width / 2 - transform.width / 2) };
    case 'right':   return { 'Transform.x': ref.x + ref.width - transform.width };
    case 'top':     return { 'Transform.y': ref.y };
    case 'vCenter': return { 'Transform.y': Math.round(ref.y + ref.height / 2 - transform.height / 2) };
    case 'bottom':  return { 'Transform.y': ref.y + ref.height - transform.height };
    default:        return null;
  }
}

/**
 * Spread transforms evenly. `what` is one of leftEdges | hCenters | rightEdges | topEdges |
 * vCenters | bottomEdges | hSpacing | vSpacing. The first and last stay put and everything between
 * is placed — which is what makes "distribute" different from "lay out in a row".
 *
 * hSpacing/vSpacing equalise the GAPS rather than the positions, so differently-sized controls end
 * up evenly spaced rather than evenly placed. `fixedGap` overrides the computed gap.
 */
export function distributePatches(transforms, what, fixedGap = null, alignOpposite = false) {
  if (transforms.length < 2) return new Map();
  const horizontal = ['leftEdges', 'hCenters', 'rightEdges', 'hSpacing'].includes(what);
  const sorted = [...transforms].sort((a, b) => (horizontal ? a.x - b.x : a.y - b.y));
  const out = new Map();

  if (what === 'hSpacing' || what === 'vSpacing') {
    const size = (t) => (horizontal ? t.width : t.height);
    const start = horizontal ? sorted[0].x : sorted[0].y;
    const last = sorted[sorted.length - 1];
    const end = (horizontal ? last.x + last.width : last.y + last.height);
    const total = sorted.reduce((sum, t) => sum + size(t), 0);
    const gap = fixedGap != null ? fixedGap
      : (sorted.length > 1 ? (end - start - total) / (sorted.length - 1) : 0);
    let cursor = start;
    for (const t of sorted) {
      const patch = horizontal ? { 'Transform.x': Math.round(cursor) } : { 'Transform.y': Math.round(cursor) };
      // The cross axis is left alone unless asked: spacing a row should not also move it.
      if (alignOpposite) {
        if (horizontal) patch['Transform.y'] = sorted[0].y;
        else patch['Transform.x'] = sorted[0].x;
      }
      out.set(t.id, patch);
      cursor += size(t) + gap;
    }
    return out;
  }

  const posOf = (t) => {
    switch (what) {
      case 'leftEdges':  return t.x;
      case 'hCenters':   return t.x + t.width / 2;
      case 'rightEdges': return t.x + t.width;
      case 'topEdges':   return t.y;
      case 'vCenters':   return t.y + t.height / 2;
      case 'bottomEdges':return t.y + t.height;
      default:           return 0;
    }
  };
  const first = posOf(sorted[0]);
  const last = posOf(sorted[sorted.length - 1]);
  const step = (last - first) / (sorted.length - 1);
  sorted.forEach((t, i) => {
    if (i === 0 || i === sorted.length - 1) return;   // the ends anchor the spread
    const target = first + step * i;
    const back = { leftEdges: 0, topEdges: 0, hCenters: t.width / 2, vCenters: t.height / 2,
                   rightEdges: t.width, bottomEdges: t.height }[what] ?? 0;
    out.set(t.id, horizontal ? { 'Transform.x': Math.round(target - back) }
                             : { 'Transform.y': Math.round(target - back) });
  });
  return out;
}

/** Give every transform the reference's size. `what` is width | height | both. */
export function matchPatch(reference, what) {
  const patch = {};
  if (what === 'width' || what === 'both') patch['Transform.width'] = reference.width;
  if (what === 'height' || what === 'both') patch['Transform.height'] = reference.height;
  return patch;
}

/** Lay transforms out in a grid, in READING ORDER — rows quantised to 20px, then left to right,
 *  which is what makes "tidy" match what the eye already sees rather than document order. */
export function gridPatches(transforms, columns = 3, gapX = 10, gapY = 10) {
  if (transforms.length < 2) return new Map();
  const sorted = [...transforms].sort((a, b) => {
    const rowA = Math.round(a.y / 20);
    const rowB = Math.round(b.y / 20);
    if (rowA !== rowB) return rowA - rowB;
    return a.x - b.x;
  });
  const originX = sorted[0].x;
  const originY = sorted[0].y;
  // Uniform cells, sized by the biggest, so a grid stays a grid.
  const cellW = Math.max(...sorted.map(t => t.width));
  const cellH = Math.max(...sorted.map(t => t.height));
  const cols = Math.max(1, Math.round(columns));
  const out = new Map();
  sorted.forEach((t, i) => {
    out.set(t.id, {
      'Transform.x': Math.round(originX + (i % cols) * (cellW + gapX)),
      'Transform.y': Math.round(originY + Math.floor(i / cols) * (cellH + gapY)),
    });
  });
  return out;
}

/** Arrange transforms around the centre of their own bounding box. */
export function circlePatches(transforms, radius = 100, startAngle = 0) {
  if (transforms.length < 2) return new Map();
  const b = boundsOf(transforms);
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  const step = (2 * Math.PI) / transforms.length;
  const startRad = (startAngle * Math.PI) / 180;
  const out = new Map();
  transforms.forEach((t, i) => {
    const angle = startRad + step * i;
    out.set(t.id, {
      'Transform.x': Math.round(cx + radius * Math.cos(angle) - t.width / 2),
      'Transform.y': Math.round(cy + radius * Math.sin(angle) - t.height / 2),
    });
  });
  return out;
}

/** Mirror positions about the centre of their bounding box. The controls themselves are not
 *  rotated — this moves them, which is what "flip the layout" means. */
export function flipPatches(transforms, axis) {
  if (transforms.length < 2) return new Map();
  const b = boundsOf(transforms);
  const out = new Map();
  for (const t of transforms) {
    if (axis === 'horizontal') {
      const centre = b.x + b.width / 2;
      out.set(t.id, { 'Transform.x': Math.round(centre - (t.x + t.width - centre)) });
    } else {
      const centre = b.y + b.height / 2;
      out.set(t.id, { 'Transform.y': Math.round(centre - (t.y + t.height - centre)) });
    }
  }
  return out;
}


/** The arrangement verbs arrangementPlan decides for, by their contract ids, with the word each is
 *  called by in its sentences (ce.panel.<word>). */
export const ARRANGE_VERBS = Object.freeze({
  panelAlign: 'align', panelDistribute: 'distribute', panelMatch: 'match',
  panelGrid: 'grid', panelCircle: 'circle', panelFlip: 'flip',
});

/**
 * What an arrangement verb does to `transforms` — the controls its names found, in PANEL space, in
 * the order given, each { id, name, x, y, width, height } — with `which`, its word (layoutWords.js)
 * already read, and its options as given: { patches, refused }, where `patches` is the { id: patch }
 * map the runtime writes back and `refused` the runtime's sentence for an option it will not act on
 * (nothing moves then). Align's plan also carries `ref`, the box it lines up on, and `key`, the id
 * of the control that box is when `opts.to` names one; match's carries `key`, whose size the others
 * take.
 *
 * Every verb but align needs two controls, and with fewer it moves nothing, without a word.
 */
export function arrangementPlan(memberId, transforms, which, opts) {
  const list = Array.isArray(transforms) ? transforms : [];
  const none = { patches: new Map(), refused: null, said: [] };
  const verb = ARRANGE_VERBS[memberId] ?? memberId;
  // No control to work on, or one where the verb needs two, is refused with why: it answered 0
  // without a word, as though there were nothing to move (the owner's word, "ce.panel" in
  // docs/design/api-descriptions-handoff.md).
  if (!list.length) return { ...none, refused: `ce.panel.${verb}: no control was named, so nothing was moved.` };
  if (memberId !== 'panelAlign' && ARRANGE_VERBS[memberId] && list.length < 2) {
    return { ...none, refused: `ce.panel.${verb} needs at least two controls, and only "${list[0].name}" is one, so nothing was moved.` };
  }
  // An option that is not a number is used as its default and said; the runtime says each once.
  const said = [];
  const numberOr = (key, fallback, fallbackWords) => {
    const given = opts?.[key];
    if (given === undefined || given === null) return fallback;
    const n = Number(given);
    if (typeof given !== 'boolean' && Number.isFinite(n)) return n;
    said.push(`ce.panel.${verb}: the ${key} ${JSON.stringify(given)} is not a number, so ${fallbackWords ?? fallback} was used.`);
    return fallback;
  };
  // The reference is the group's own bounds, or one named control — "align these to that one",
  // which is what the canvas calls a key object. A name that is not in the list is refused rather
  // than lined up on something else: a layout the script did not ask for, which it would have to
  // undo by hand. Match's reference is the first name unless one is named, the canvas's rule too.
  const keyName = opts?.to != null ? String(opts.to) : null;
  const named = keyName ? list.find((t) => t.name === keyName || t.id === keyName) ?? null : null;
  if (memberId === 'panelAlign') {
    if (keyName && !named) {
      return { ...none, refused: `ce.panel.align: "${keyName}" is not one of the names given, so nothing was moved.` };
    }
    const ref = named ? { x: named.x, y: named.y, width: named.width, height: named.height } : boundsOf(list);
    const patches = new Map();
    for (const t of list) {
      const patch = alignPatch(t, which, ref);
      if (patch) patches.set(t.id, patch);
    }
    return { patches, refused: null, ref, key: named?.id ?? null, said };
  }
  if (!ARRANGE_VERBS[memberId]) return none;
  switch (memberId) {
    case 'panelDistribute': {
      const gap = numberOr('gap', null, 'a gap worked out from the space');
      return { patches: distributePatches(list, which, gap, opts?.align === true), refused: null, said };
    }
    case 'panelMatch': {
      // A name that is not in the list used to fall back to the first, silently, and every other
      // control took the wrong size; it is refused, in align's words.
      if (keyName && !named) {
        return { ...none, refused: `ce.panel.match: "${keyName}" is not one of the names given, so nothing was resized.` };
      }
      const key = named ?? list[0];
      const patches = new Map();
      for (const t of list) {
        if (t.id === key.id) continue;                     // the reference does not resize itself
        patches.set(t.id, matchPatch(key, which));
      }
      return { patches, refused: null, key: key.id, said };
    }
    case 'panelGrid': {
      let columns = Math.round(numberOr('columns', 3));
      if (columns < 1) {
        said.push(`ce.panel.grid: the columns ${JSON.stringify(opts.columns)} is below 1, so 1 was used.`);
        columns = 1;
      }
      return { patches: gridPatches(list, columns, numberOr('gapX', 10), numberOr('gapY', 10)), refused: null, said };
    }
    case 'panelCircle': {
      const radius = numberOr('radius', 100);
      // A radius below 0 put each control on the far side of the circle from where it was asked.
      if (radius < 0) return { ...none, refused: `ce.panel.circle: the radius ${radius} is below 0, so nothing was moved.` };
      return { patches: circlePatches(list, radius, numberOr('startAngle', 0)), refused: null, said };
    }
    case 'panelFlip':
      return { patches: flipPatches(list, which), refused: null, said };
    default:
      return none;
  }
}
