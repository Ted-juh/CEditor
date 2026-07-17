// LCD zones / layouts / pages engine. Pure functions so the core is testable
// without a DOM: given layouts, zones, a page state, and a map of source-control
// info, compose the per-row strings and resolve which layout is active.
//
// A "zone" binds a rectangular region (row, colStart..colEnd) to a source
// control and a "show" kind. A "layout" is a named list of zones. "pages" pick
// which layout is active (a selector value, plus transient overlays).

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function numberOr(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

// Fraction of a source's value across its range.
export function infoFraction(info) {
  const min = numberOr(info?.min, 0);
  const max = numberOr(info?.max, 127);
  const span = max - min;
  return span === 0 ? 0 : clamp((numberOr(info?.value, 0) - min) / span, 0, 1);
}

const BAR_EIGHTHS = ' ▏▎▍▌▋▊▉';
export function barString(frac, width) {
  const w = Math.max(1, Math.round(width));
  const eighths = Math.round(clamp(frac, 0, 1) * w * 8);
  const full = Math.min(w, Math.floor(eighths / 8));
  let s = '█'.repeat(full);
  if (full < w) s += BAR_EIGHTHS[eighths % 8] + ' '.repeat(Math.max(0, w - full - 1));
  return s.slice(0, w);
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export function noteName(value) {
  const n = Math.round(numberOr(value, 0));
  const octave = Math.floor(n / 12) - 1;
  return `${NOTE_NAMES[((n % 12) + 12) % 12]}${octave}`;
}

// The reserved "show" kinds a zone can render. Kinds needing a bound device
// parameter (address, and real MIDI) fall back to a placeholder without one.
export const ZONE_SHOW_KINDS = [
  'static', 'name', 'value', 'pct', 'bar', 'midiValue', 'note', 'text', 'state', 'address',
];

// A reserved dynamic source: instead of a fixed control id, a zone can bind to
// "@active" — whichever control is currently / most recently being interacted
// with. The preview resolves it to the live control and stores its info under
// this key, so one zone can follow whatever the user touches.
//
// It may also carry a kind filter as "@active#value" / "@active#switch" /
// "@active#choice" so a zone follows the active control ONLY when that control
// is of the chosen kind. This lets two zones share the same region: e.g. a
// "value" zone scoped to sliders and a "state" zone scoped to buttons — only
// the one matching the currently-touched control paints, so they never collide.
export const ACTIVE_SOURCE_ID = '@active';

export function isActiveSource(id) {
  return String(id ?? '') === ACTIVE_SOURCE_ID || String(id ?? '').startsWith(`${ACTIVE_SOURCE_ID}#`);
}

// The kind filter of an "@active#kind" source ('' when unfiltered / not active).
export function activeFilterOf(id) {
  const s = String(id ?? '');
  const hash = s.indexOf('#');
  return isActiveSource(s) && hash >= 0 ? s.slice(hash + 1).trim().toLowerCase() : '';
}

// Resolve the raw content string a zone shows, given its source info and the
// region width. `info` is null/absent for static zones or missing sources.
export function resolveZoneContent(zone, info, width) {
  const show = String(zone?.show ?? 'static').trim().toLowerCase();
  const prefix = String(zone?.prefix ?? '');
  const suffix = String(zone?.suffix ?? '');
  const present = info?.present === true;

  switch (show) {
    case 'static':
      return String(zone?.text ?? '');
    case 'name':
      return `${prefix}${String(zone?.label || info?.name || zone?.text || '')}${suffix}`;
    case 'value': {
      if (!present) return '';
      const prec = Math.max(0, Math.round(numberOr(zone?.precision, 0)));
      return `${prefix}${numberOr(info.value, 0).toFixed(prec)}${suffix}`;
    }
    case 'pct':
      return present ? `${prefix}${Math.round(infoFraction(info) * 100)}${suffix}` : '';
    case 'bar':
      return present ? barString(infoFraction(info), width) : '';
    case 'midivalue': {
      if (!present) return '';
      const midi = Math.round(clamp(infoFraction(info) * 127, 0, 127));
      const hex = String(zone?.radix ?? 'dec').trim().toLowerCase() === 'hex';
      const body = hex ? midi.toString(16).toUpperCase().padStart(2, '0') : String(midi);
      return `${prefix}${body}${suffix}`;
    }
    case 'note':
      return present ? `${prefix}${noteName(info.value)}${suffix}` : '';
    case 'text':
      return `${prefix}${String(info?.text ?? '')}${suffix}`;
    case 'state':
      return present ? `${prefix}${info?.on === true || numberOr(info.value, 0) >= 0.5 ? 'On' : 'Off'}${suffix}` : '';
    case 'address':
      return String(info?.address ?? zone?.text ?? '----');
    default:
      return '';
  }
}

// Fit content into a fixed-width region with alignment + truncation.
export function fitToRegion(content, width, align = 'left') {
  const w = Math.max(0, Math.round(width));
  let s = String(content ?? '');
  if (s.length >= w) return s.slice(0, w);
  const pad = w - s.length;
  const a = String(align ?? 'left').trim().toLowerCase();
  if (a === 'right') return ' '.repeat(pad) + s;
  if (a === 'center') {
    const left = Math.floor(pad / 2);
    return ' '.repeat(left) + s + ' '.repeat(pad - left);
  }
  return s + ' '.repeat(pad);
}

// Compose `rows` strings of `cols` chars from a layout's zones. Later (higher
// priority) zones paint over earlier ones. getInfo(sourceId) -> info | null.
export function composeLayout(zones, rows, cols, getInfo) {
  const nRows = Math.max(0, Math.round(rows));
  const nCols = Math.max(0, Math.round(cols));
  const grid = [];
  for (let r = 0; r < nRows; r += 1) grid.push(new Array(nCols).fill(' '));

  const ordered = (Array.isArray(zones) ? zones : [])
    .filter((z) => z && z.visible !== false)
    .slice()
    .sort((a, b) => numberOr(a?.priority, 0) - numberOr(b?.priority, 0));

  for (const zone of ordered) {
    const row = Math.round(numberOr(zone?.row, 1)) - 1;
    if (row < 0 || row >= nRows || nCols === 0) continue;
    const c0 = clamp(Math.round(numberOr(zone?.colStart, 1)) - 1, 0, nCols - 1);
    const c1 = clamp(Math.round(numberOr(zone?.colEnd, nCols)) - 1, c0, nCols - 1);
    const width = c1 - c0 + 1;
    const info = getInfo ? getInfo(String(zone?.sourceId ?? '')) : null;
    const raw = resolveZoneContent(zone, info, width);
    // Empty content doesn't paint, so a zone whose source is absent (or an idle
    // "@active#kind" zone) leaves overlapping zones underneath it untouched.
    if (raw === '') continue;
    const fitted = fitToRegion(raw, width, zone?.align);
    for (let i = 0; i < width; i += 1) grid[row][c0 + i] = fitted[i] ?? ' ';
  }

  return grid.map((cells) => cells.join(''));
}

// Pick the active layout id. Priority: an active overlay (resolved by the caller
// with timing) > the selector's mapped layout > the default > the first layout.
export function resolveActiveLayoutId(pages, layouts, state = {}) {
  const list = Array.isArray(layouts) ? layouts : [];
  const ids = new Set(list.map((l) => String(l?.id ?? '')));

  const overlayId = String(state?.activeOverlayLayoutId ?? '');
  if (overlayId && ids.has(overlayId)) return overlayId;

  const map = Array.isArray(pages?.selectorMap) ? pages.selectorMap : [];
  const sel = state?.selectorValue;
  if (sel !== undefined && sel !== null && String(sel) !== '') {
    const hit = map.find((m) => String(m?.when) === String(sel));
    if (hit && ids.has(String(hit.layoutId))) return String(hit.layoutId);
  }

  const def = String(pages?.defaultLayoutId ?? '');
  if (ids.has(def)) return def;
  return list[0] ? String(list[0].id) : '';
}

export function findLayout(layouts, id) {
  return (Array.isArray(layouts) ? layouts : []).find((l) => String(l?.id ?? '') === String(id)) ?? null;
}

// Every sourceId referenced by a layout's zones (for the preview to gather live
// values) plus the page selector + overlay sources.
export function collectSourceIds(display) {
  const ids = new Set();
  for (const layout of (Array.isArray(display?.layouts) ? display.layouts : [])) {
    for (const zone of (Array.isArray(layout?.zones) ? layout.zones : [])) {
      const id = String(zone?.sourceId ?? '');
      if (id) ids.add(id);
    }
  }
  const pages = display?.pages ?? {};
  if (pages.selectorSourceId) ids.add(String(pages.selectorSourceId));
  for (const ov of (Array.isArray(pages?.overlays) ? pages.overlays : [])) {
    if (ov?.sourceId) ids.add(String(ov.sourceId));
  }
  return [...ids];
}
