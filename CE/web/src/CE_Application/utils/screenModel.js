/**
 * screenModel.js — the pure half of the Screen tab.
 *
 * No Svelte, no DOM: everything here is arithmetic over a display control's section, so it can be
 * tested under plain `node --test`. `docs/design/screen-tab-design.md` has the argument.
 *
 * TWO COMPONENTS, ONE IDEA, TWO COORDINATE SYSTEMS. `LcdDisplay` composes a screen out of ZONES on
 * a character grid (`row`, `colStart`, `colEnd`); `PixelDisplay` composes one out of ELEMENTS on a
 * pixel grid (`x`, `y`, `w`, `h`). Everything above that — layouts, page rules, which page is
 * showing — is the same engine, and `Pixel`'s own comment says so ("Layouts/pages (same engine as
 * the LCD)"). So this file speaks in rects over a grid and converts at the edges.
 *
 * THE CHECK IS THE POINT. `composeLayout` in `lcdZones.js` DROPS a zone whose row is past the last
 * row and CLAMPS one whose columns run past the last column — and a clamped zone still paints, one
 * cell wide against the right edge, which reads as a rendering bug rather than as a number that is
 * out of range. Nothing in the application looks at this, and the trigger is the Rows and Cols
 * fields at the top of the same panel. `placementIssue()` is that test and `fitRect()` is the
 * repair.
 *
 * `selectorRuleMatches` IS IMPORTED, NOT REIMPLEMENTED. The live-rule marker and the shadowed-rule
 * warning are both "ask the shipped matcher"; a second copy of the operator table here would be a
 * second opinion about which page is showing.
 */
import { selectorRuleMatches } from './lcdZones.js';

const numberOr = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const clampInt = (value, lo, hi) => Math.max(lo, Math.min(hi, Math.round(numberOr(value, lo))));

/** kind → the section that holds the screen. */
export const SCREEN_SECTION_BY_KIND = { lcd: 'Display', pixel: 'Pixel' };

export const SCREEN_KINDS = Object.keys(SCREEN_SECTION_BY_KIND);

/** kind → what one layout's items are called, in the data and on screen. */
export const SCREEN_ITEM_BY_KIND = {
  lcd: { key: 'zones', one: 'zone', many: 'zones', unit: 'cell' },
  pixel: { key: 'elements', one: 'element', many: 'elements', unit: 'px' },
};

/** Which kind of screen a control carries, or '' when it carries none. */
export function screenKindOf(control) {
  for (const kind of SCREEN_KINDS) {
    if (control?._children?.[SCREEN_SECTION_BY_KIND[kind]]) return kind;
  }
  return '';
}

export function screenSectionOf(control) {
  const kind = screenKindOf(control);
  return kind ? control._children[SCREEN_SECTION_BY_KIND[kind]] : null;
}

/**
 * The grid a layout is placed on, in its own units.
 *
 * A character screen is `cols x rows` cells; a pixel screen is `pixelsW x pixelsH` pixels. The
 * graphic LCD panel type also has `pixelWidth`/`pixelHeight`, but ZONES are still placed in
 * character cells on it — the pixel size only changes how the text is rasterised — so it is
 * deliberately not read here.
 */
export function screenGrid(screen, kind) {
  if (kind === 'pixel') {
    return {
      unitsX: Math.max(1, Math.round(numberOr(screen?.pixelsW, 128))),
      unitsY: Math.max(1, Math.round(numberOr(screen?.pixelsH, 64))),
      unit: 'px',
    };
  }
  return {
    unitsX: Math.max(1, Math.round(numberOr(screen?.cols, 16))),
    unitsY: Math.max(1, Math.round(numberOr(screen?.rows, 2))),
    unit: 'cell',
  };
}

// --- Layouts ----------------------------------------------------------------

/**
 * The layouts, as one shape for both kinds.
 *
 * `PixelDisplay` may have no layouts at all and keep a flat `elements` list instead — its own
 * comment: "when layouts is non-empty the active layout's elements replace the flat list above". A
 * caller should not have to know that, so the flat list comes back as a single unnamed layout with
 * `flat: true`, and the write paths follow.
 */
export function layoutsOf(screen, kind) {
  const itemKey = SCREEN_ITEM_BY_KIND[kind]?.key ?? 'zones';
  const list = Array.isArray(screen?.layouts) ? screen.layouts : [];
  if (list.length) {
    return list.map((layout, index) => ({
      id: String(layout?.id ?? index),
      name: String(layout?.name ?? layout?.id ?? `Layout ${index + 1}`),
      index,
      flat: false,
      items: Array.isArray(layout?.[itemKey]) ? layout[itemKey] : [],
    }));
  }
  if (kind === 'pixel' && Array.isArray(screen?.elements) && screen.elements.length) {
    return [{ id: '', name: 'Screen', index: -1, flat: true, items: screen.elements }];
  }
  return [];
}

export function findScreenLayout(layouts, id) {
  if (!layouts.length) return null;
  return layouts.find((layout) => layout.id === String(id ?? '')) ?? layouts[0];
}

/** The dotted path prefix for one item, matching what the shipped editors write. */
export function itemPathBase(kind, layout, itemIndex) {
  const section = SCREEN_SECTION_BY_KIND[kind];
  const itemKey = SCREEN_ITEM_BY_KIND[kind]?.key;
  if (!section || !itemKey || !layout) return '';
  const index = Math.max(0, Math.round(numberOr(itemIndex, 0)));
  return layout.flat
    ? `${section}.${itemKey}.${index}`
    : `${section}.layouts.${layout.index}.${itemKey}.${index}`;
}

// --- Rects ------------------------------------------------------------------

/**
 * One item as a rect in grid units, x/y zero-based.
 *
 * Zones are stored 1-based and inclusive (`colStart: 1, colEnd: 8` is eight cells starting at the
 * left); elements are stored 0-based with a width. Converting once, here, is what lets the overlay
 * and the checks be written once.
 */
export function itemRect(item, kind) {
  if (kind === 'pixel') {
    return {
      x: Math.round(numberOr(item?.x, 0)),
      y: Math.round(numberOr(item?.y, 0)),
      w: Math.max(1, Math.round(numberOr(item?.w, 1))),
      h: Math.max(1, Math.round(numberOr(item?.h, 8))),
    };
  }
  const start = Math.round(numberOr(item?.colStart, 1));
  const end = Math.round(numberOr(item?.colEnd, start));
  return {
    x: start - 1,
    y: Math.round(numberOr(item?.row, 1)) - 1,
    w: Math.max(1, end - start + 1),
    h: Math.max(1, Math.round(numberOr(item?.rowSpan, 1))),
  };
}

/** The patch that puts an item at `rect`. Only the properties that change are written. */
export function rectPatch(kind, base, rect, item = null) {
  if (!base) return {};
  const next = {};
  const x = Math.round(numberOr(rect?.x, 0));
  const y = Math.round(numberOr(rect?.y, 0));
  const w = Math.max(1, Math.round(numberOr(rect?.w, 1)));
  const h = Math.max(1, Math.round(numberOr(rect?.h, 1)));
  const current = item ? itemRect(item, kind) : null;

  if (kind === 'pixel') {
    if (!current || current.x !== x) next[`${base}.x`] = x;
    if (!current || current.y !== y) next[`${base}.y`] = y;
    if (!current || current.w !== w) next[`${base}.w`] = w;
    if (!current || current.h !== h) next[`${base}.h`] = h;
    return next;
  }
  if (!current || current.y !== y) next[`${base}.row`] = y + 1;
  if (!current || current.x !== x) next[`${base}.colStart`] = x + 1;
  if (!current || current.x + current.w !== x + w) next[`${base}.colEnd`] = x + w;
  // rowSpan only exists on zones that use it; never introduce it for a one-row zone.
  if (h > 1 || Math.round(numberOr(item?.rowSpan, 1)) > 1) next[`${base}.rowSpan`] = h;
  return next;
}

/** A rect moved and shrunk as little as possible to sit wholly inside the grid. */
export function fitRect(rect, grid) {
  const w = Math.max(1, Math.min(grid.unitsX, Math.round(numberOr(rect?.w, 1))));
  const h = Math.max(1, Math.min(grid.unitsY, Math.round(numberOr(rect?.h, 1))));
  return {
    x: clampInt(rect?.x, 0, grid.unitsX - w),
    y: clampInt(rect?.y, 0, grid.unitsY - h),
    w,
    h,
  };
}

/**
 * Where one grid unit sits inside a rendered screen, in CSS pixels.
 *
 * MIRRORED FROM `editor/LcdDisplayRenderer.svelte`, deliberately and exactly — the same three lines
 * that file computes for its own characters. A zone box drawn on any other arithmetic would sit
 * beside the letters instead of around them, and an overlay that does not line up with the picture
 * is worse than no overlay. `screenModel.test.js` reads the renderer and fails if those lines move.
 *
 * The pixel screen has no per-cell gaps: one grid unit is one pixel of the surface.
 */
export function cellGeometry({ width = 0, height = 0, grid, kind = 'lcd', screen = null } = {}) {
  const padding = Math.max(0, numberOr(screen?.padding, kind === 'pixel' ? 8 : 10));
  const screenW = Math.max(1, numberOr(width, 0) - padding * 2);
  const screenH = Math.max(1, numberOr(height, 0) - padding * 2);
  if (kind === 'pixel') {
    return { padding, screenW, screenH, cellW: screenW / grid.unitsX, cellH: screenH / grid.unitsY, gapX: 0, gapY: 0 };
  }
  const gapX = Math.max(0, numberOr(screen?.charSpacing, 1));
  const gapY = Math.max(0, numberOr(screen?.lineSpacing, 3));
  return {
    padding,
    screenW,
    screenH,
    cellW: Math.max(1, (screenW - (grid.unitsX - 1) * gapX) / grid.unitsX),
    cellH: Math.max(1, (screenH - (grid.unitsY - 1) * gapY) / grid.unitsY),
    gapX,
    gapY,
  };
}

/** A rect in grid units as a box in CSS pixels, relative to the rendered control. */
export function rectBox(rect, geometry) {
  const { padding, cellW, cellH, gapX, gapY } = geometry;
  return {
    left: padding + rect.x * (cellW + gapX),
    top: padding + rect.y * (cellH + gapY),
    width: rect.w * cellW + Math.max(0, rect.w - 1) * gapX,
    height: rect.h * cellH + Math.max(0, rect.h - 1) * gapY,
  };
}

/** A pointer offset inside the rendered control, as grid units. The inverse of `rectBox`. */
export function pointToCell(offsetX, offsetY, geometry, grid) {
  const { padding, cellW, cellH, gapX, gapY } = geometry;
  const x = Math.floor((numberOr(offsetX, 0) - padding) / Math.max(0.0001, cellW + gapX));
  const y = Math.floor((numberOr(offsetY, 0) - padding) / Math.max(0.0001, cellH + gapY));
  return { x: clampInt(x, 0, grid.unitsX - 1), y: clampInt(y, 0, grid.unitsY - 1) };
}

// --- The check --------------------------------------------------------------

/**
 * Is this item actually where its numbers say?
 *
 * Returns null when it is. Otherwise a status, a sentence naming what the renderer will really do,
 * and the rect that would repair it.
 *
 * The two statuses are different failures and must read differently:
 *   `offGrid` — the renderer skips it entirely and the screen shows nothing where you expect it.
 *   `clipped` — the renderer still draws it, in the wrong place or at the wrong size, which is the
 *               one that looks like a bug in the app rather than a number out of range.
 */
export function placementIssue(item, grid, kind) {
  const rect = itemRect(item, kind);
  const names = SCREEN_ITEM_BY_KIND[kind] ?? SCREEN_ITEM_BY_KIND.lcd;
  const fitted = fitRect(rect, grid);

  if (kind === 'lcd') {
    if (rect.y < 0 || rect.y >= grid.unitsY) {
      return {
        status: 'offGrid',
        message: `on row ${rect.y + 1} of a ${grid.unitsY}-row screen — composeLayout skips it, so it never paints`,
        repair: fitted,
        repairLabel: `move to row ${fitted.y + 1}`,
      };
    }
    if (rect.x < 0 || rect.x + rect.w > grid.unitsX) {
      const c0 = clampInt(rect.x, 0, grid.unitsX - 1);
      const c1 = clampInt(rect.x + rect.w - 1, c0, grid.unitsX - 1);
      return {
        status: 'clipped',
        message: `runs to column ${rect.x + rect.w} on a ${grid.unitsX}-column screen — it still paints, clamped to `
          + `${c1 - c0 + 1} cell${c1 - c0 === 0 ? '' : 's'} at column ${c0 + 1}`,
        repair: fitted,
        repairLabel: `fit to columns ${fitted.x + 1}–${fitted.x + fitted.w}`,
      };
    }
    return null;
  }

  if (rect.x >= grid.unitsX || rect.y >= grid.unitsY || rect.x + rect.w <= 0 || rect.y + rect.h <= 0) {
    return {
      status: 'offGrid',
      message: `at ${rect.x},${rect.y} on a ${grid.unitsX}×${grid.unitsY} screen — entirely outside it`,
      repair: fitted,
      repairLabel: `move to ${fitted.x},${fitted.y}`,
    };
  }
  if (rect.x < 0 || rect.y < 0 || rect.x + rect.w > grid.unitsX || rect.y + rect.h > grid.unitsY) {
    return {
      status: 'clipped',
      message: `runs to ${rect.x + rect.w},${rect.y + rect.h} on a ${grid.unitsX}×${grid.unitsY} screen — the overhang is cut off`,
      repair: fitted,
      repairLabel: `fit to ${fitted.w}×${fitted.h} at ${fitted.x},${fitted.y}`,
    };
  }
  return null;
}

/**
 * Where the renderer will ACTUALLY paint this item, or null when it paints nowhere.
 *
 * The distinction the overlay needs. A zone whose columns run off the right is not drawn where its
 * numbers say — `composeLayout` clamps it and paints it, one cell wide, at the edge — so drawing a
 * box at columns 20-28 would be a picture of something that does not happen. A zone whose row is
 * past the last row is not painted at all, and there is no box to draw; the overlay marks the edge
 * it fell off instead.
 */
export function renderedRect(item, grid, kind) {
  const rect = itemRect(item, kind);
  if (kind === 'lcd') {
    if (rect.y < 0 || rect.y >= grid.unitsY) return null;
    const c0 = clampInt(rect.x, 0, grid.unitsX - 1);
    const c1 = clampInt(rect.x + rect.w - 1, c0, grid.unitsX - 1);
    return { x: c0, y: rect.y, w: c1 - c0 + 1, h: rect.h };
  }
  const x0 = Math.max(0, rect.x);
  const y0 = Math.max(0, rect.y);
  const x1 = Math.min(grid.unitsX, rect.x + rect.w);
  const y1 = Math.min(grid.unitsY, rect.y + rect.h);
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Which edge an item that paints nowhere fell off, for the marker that stands in for its box. */
export function offGridEdge(item, grid, kind) {
  const rect = itemRect(item, kind);
  if (rect.y >= grid.unitsY) return 'bottom';
  if (rect.y + rect.h <= 0) return 'top';
  if (rect.x >= grid.unitsX) return 'right';
  if (rect.x + rect.w <= 0) return 'left';
  return '';
}

/** Every item's issue, with its index, so a caller can list and repair them. `names` is for prose. */
export function placementIssues(items, grid, kind) {
  const out = [];
  (Array.isArray(items) ? items : []).forEach((item, index) => {
    const issue = placementIssue(item, grid, kind);
    if (issue) out.push({ index, item, ...issue });
  });
  return out;
}

/** How many of the grid's cells no item covers. Only meaningful for a character screen. */
export function unusedCells(items, grid, kind) {
  if (kind !== 'lcd') return null;
  const taken = new Set();
  for (const item of (Array.isArray(items) ? items : [])) {
    if (item?.visible === false) continue;
    const rect = itemRect(item, kind);
    for (let y = rect.y; y < rect.y + rect.h; y += 1) {
      for (let x = rect.x; x < rect.x + rect.w; x += 1) {
        if (x >= 0 && y >= 0 && x < grid.unitsX && y < grid.unitsY) taken.add(`${x},${y}`);
      }
    }
  }
  return grid.unitsX * grid.unitsY - taken.size;
}

// --- Page rules -------------------------------------------------------------

/** Move an entry, returning a new array. The only way page rules can be reordered at all. */
export function reorderRules(rules, from, to) {
  const list = Array.isArray(rules) ? [...rules] : [];
  if (!list.length) return list;
  const a = clampInt(from, 0, list.length - 1);
  const b = clampInt(to, 0, list.length - 1);
  if (a === b) return list;
  const [moved] = list.splice(a, 1);
  list.splice(b, 0, moved);
  return list;
}

/**
 * Which rule wins for a selector value — the same `find` `resolveActiveLayoutId` does.
 *
 * -1 when none matches, which is not a fault: the default layout is what shows then.
 */
export function liveRuleIndex(rules, selectorValue) {
  if (selectorValue === undefined || selectorValue === null || String(selectorValue) === '') return -1;
  const list = Array.isArray(rules) ? rules : [];
  return list.findIndex((rule) => selectorRuleMatches(rule, selectorValue));
}

/**
 * Is this rule unreachable, and if so because of which earlier one?
 *
 * Only answered for a rule that matches ONE concrete value — an `eq` — because then the question is
 * decidable by asking the shipped matcher whether any earlier rule already claims that value. For a
 * rule with a range there is no cheap exact answer, and a guess that cried wolf on a working panel
 * would be worse than saying nothing.
 */
export function shadowedRuleIndex(rules, index) {
  const list = Array.isArray(rules) ? rules : [];
  const rule = list[index];
  if (!rule) return -1;
  if (String(rule.op ?? 'eq').trim().toLowerCase() !== 'eq') return -1;
  const value = rule.when;
  if (value === undefined || value === null || String(value) === '') return -1;
  for (let i = 0; i < index; i += 1) {
    if (selectorRuleMatches(list[i], value)) return i;
  }
  return -1;
}

// --- Settings ---------------------------------------------------------------

/**
 * The non-spatial fields of one item — the ones a rectangle cannot express.
 *
 * `show`/`kind` and `sourceId` are deliberately NOT here: they are the two the tab draws itself,
 * because their option lists come from the control's own sources and from `ZONE_SHOW_KINDS`.
 */
// --- Making and unmaking an item ---------------------------------------------
// This tab edited the zones and elements a layout already had, and adding, removing and duplicating
// one stayed in the properties panel. That is a gap the moment the panel's rows come out, so the
// shapes live here — one definition of what a new zone is, rather than the panel's and the tab's
// drifting apart.

/** The array path an item list lives at, which is what an add or a remove has to write back. */
export function itemListPath(kind, layout) {
  const section = SCREEN_SECTION_BY_KIND[kind];
  const itemKey = SCREEN_ITEM_BY_KIND[kind]?.key;
  if (!section || !itemKey || !layout) return '';
  return layout.flat ? `${section}.${itemKey}` : `${section}.layouts.${layout.index}.${itemKey}`;
}

/**
 * The lowest `<prefix><n>` not already taken.
 *
 * The panel's own `genId` is time-based, which collides when two things are made in the same
 * millisecond — `nextPointId` in envelopeLayout.js records the same choice for the same reason.
 */
export function nextItemId(items, prefix) {
  const taken = new Set((Array.isArray(items) ? items : []).map((item) => String(item?.id ?? '')));
  for (let n = 0; ; n += 1) {
    const id = `${prefix}${n}`;
    if (!taken.has(id)) return id;
  }
}

/** A new zone or element, in the shape the shipped panel editors make. */
export function newScreenItem(kind, items, grid = {}) {
  if (kind === 'pixel') {
    const height = Math.max(1, Math.round(numberOr(grid.h ?? grid.rows, 32)));
    return {
      id: nextItemId(items, 'el_'), kind: 'vbar', x: 4, y: 4,
      w: 12, h: Math.max(8, height - 8),
      sourceId: '', align: 'left', precision: 0, prefix: '', suffix: '', label: '',
      frame: false, ticks: false, peakHold: false, smooth: false, visible: true,
    };
  }
  const cols = Math.max(1, Math.round(numberOr(grid.cols ?? grid.w, 16)));
  return {
    id: nextItemId(items, 'z_'), row: 1, colStart: 1, colEnd: Math.min(cols, 8),
    show: 'static', sourceId: '', text: 'TEXT', align: 'left', radix: 'dec',
  };
}

export function itemsWithAdded(items, made) {
  return [...(Array.isArray(items) ? items : []), made];
}

export function itemsWithRemoved(items, at) {
  const list = Array.isArray(items) ? [...items] : [];
  if (at < 0 || at >= list.length) return list;
  list.splice(at, 1);
  return list;
}

/** A copy sits directly after its original, with an id of its own — the panel's behaviour. */
export function itemsWithDuplicated(items, at, prefix) {
  const list = Array.isArray(items) ? [...items] : [];
  const source = list[at];
  if (!source) return list;
  const copy = { ...source, id: nextItemId(list, prefix) };
  list.splice(at + 1, 0, copy);
  return list;
}

/** The id prefix a kind's items use, so a caller need not know. */
export function itemIdPrefix(kind) {
  return kind === 'pixel' ? 'el_' : 'z_';
}

export const SCREEN_ITEM_FIELDS = {
  lcd: [
    { key: 'align', label: 'Align', kind: 'choice', options: ['left', 'center', 'right'], hint: 'Where the content sits inside the zone.' },
    { key: 'radix', label: 'Radix', kind: 'choice', options: ['dec', 'hex'], hint: 'Number base for value kinds.' },
    { key: 'scroll', label: 'Scroll', kind: 'toggle', hint: 'Scroll content too long for the region instead of clipping it.' },
    { key: 'visible', label: 'Visible', kind: 'toggle', hint: 'Draw this zone at all.' },
  ],
  pixel: [
    { key: 'align', label: 'Align', kind: 'choice', options: ['left', 'center', 'right'], hint: 'Where the content sits inside the element.' },
    { key: 'radix', label: 'Radix', kind: 'choice', options: ['dec', 'hex'], hint: 'Number base for value kinds.' },
    { key: 'frame', label: 'Frame', kind: 'toggle', hint: 'Draw a one-pixel outline around the element.' },
    { key: 'visible', label: 'Visible', kind: 'toggle', hint: 'Draw this element at all.' },
  ],
};

export function itemFields(kind) {
  return SCREEN_ITEM_FIELDS[kind] ?? [];
}

/**
 * Every label this tab can edit.
 *
 * Same purpose as `allEffectFieldLabels()`, `allTypographyFieldLabels()` and
 * `allAssetFieldLabels()`: the properties panel's search index is built from the rows it draws, so
 * the day these rows leave the panel the search has to be fed from here instead.
 */
export function allScreenFieldLabels() {
  const labels = new Set(['Zone', 'Element', 'Row', 'Cols', 'X', 'Y', 'W', 'H', 'Kind', 'Source']);
  for (const kind of SCREEN_KINDS) {
    for (const field of itemFields(kind)) labels.add(field.label);
  }
  return [...labels];
}
