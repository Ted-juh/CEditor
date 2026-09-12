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

/**
 * Every character `barString` can emit, full block first and then the seven partials.
 *
 * Exported so the glyph editor can offer exactly these to claim, rather than re-spelling them:
 * eight characters, which is exactly the eight CGRAM slots a hardware panel has, and that is not a
 * coincidence — a claiming set for these is what a bargraph glyph set IS.
 */
export const BAR_CHARS = `█${BAR_EIGHTHS.slice(1)}`;

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
  'static', 'name', 'value', 'pct', 'bar', 'midiValue', 'note', 'text', 'state', 'address', 'edit',
  'hbar', 'vbar', 'hslider', 'vslider', 'needle',
];

// Pixel-widget kinds: on a graphic (dot-matrix) panel these draw as true pixel
// widgets (bars/sliders/needle) spanning the zone's region (row..row+rowSpan).
// On character/segment panels they degrade to the char fallbacks below.
export const WIDGET_ZONE_KINDS = new Set(['hbar', 'vbar', 'hslider', 'vslider', 'needle']);

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

// The reserved source for the display's own editable text buffer (Display.editText).
// A zone with show:'edit' bound to this shows/edits the preset-name field.
export const EDIT_SOURCE_ID = '@edit';

// A zone may name the DISPLAY'S OWN STATE — today that is one thing, the menu cursor.
//
// `pages.selectorMap` and `overlays` answer from the panel's values, and `press`/`timeoutMs` move
// between pages. None of them can hold "which item is selected", because a layout is a list of
// zones and not a record. A menu could be entered and left but never scrolled.
//
//   '@state:cursor'   the selection index on this display, 0-based
export const STATE_SOURCE_PREFIX = '@state:';

export function isStateSource(id) {
  return String(id ?? '').startsWith(STATE_SOURCE_PREFIX);
}

/** The state key a '@state:...' source names, or '' when it is not one. */
export function stateKeyOf(id) {
  return isStateSource(id) ? String(id).slice(STATE_SOURCE_PREFIX.length).trim() : '';
}

/**
 * Move a selection index, wrapping at both ends.
 *
 * WRAPPING RATHER THAN CLAMPING. A three-item menu where holding the down key sticks on the last
 * row reads as broken, and every hardware menu short enough to fit one of these screens wraps.
 * Clamping would need a flag; nobody has asked for one, and a flag nobody asked for is a setting
 * everyone has to read past.
 */
export function moveCursor(current, delta, max) {
  const n = Math.max(0, Math.round(numberOr(max, 0)));
  if (n === 0) return 0;                       // a page with no list: nowhere to move
  const span = n + 1;
  const at = Math.round(numberOr(current, 0)) + Math.round(numberOr(delta, 0));
  return ((at % span) + span) % span;
}

/** Zone info for a state value, so `value`, `pct` and `bar` render it like anything else. */
export function stateInfo(value, max) {
  const n = Math.max(0, Math.round(numberOr(max, 0)));
  return {
    present: true,
    name: '',
    value: clamp(Math.round(numberOr(value, 0)), 0, n),
    min: 0,
    max: n,
    text: '',
    on: false,
  };
}

/**
 * Is a zone shown, given the display's state?
 *
 * `visibleWhen: { cursor: 1 }` is how a menu draws its selection marker: one arrow zone per row,
 * each shown only on its own index. Authoring N zones for N rows is honest for a screen four rows
 * tall, and it needs no new drawing — the zone engine already paints or skips a zone.
 */
export function zoneVisibleWith(zone, state = {}) {
  if (!zone || zone.visible === false) return false;
  const when = zone.visibleWhen;
  if (!when || typeof when !== 'object') return true;
  for (const [key, want] of Object.entries(when)) {
    if (Math.round(numberOr(state?.[key], 0)) !== Math.round(numberOr(want, 0))) return false;
  }
  return true;
}

// A zone may name a DEVICE PARAMETER instead of a panel control.
//
// Until this existed, a zone's sourceId was always a control id, so showing a device parameter
// meant creating a control, binding it, and pointing the zone at the control. A screen reporting
// eight parameters needed eight controls that existed only to be read.
//
//   '@param:filter.cutoff'         the default device role
//   '@param:synth:filter.cutoff'   a named role, for a panel driving more than one device
//
// The role is the part BEFORE the first colon when there are two segments, because a parameter id
// is dotted (`filter.cutoff`) and a role is not. A parameter id containing a colon would parse
// wrongly; none does, and the alternative was a second prefix nobody would remember.
export const PARAM_SOURCE_PREFIX = '@param:';

export function isParamSource(id) {
  return String(id ?? '').startsWith(PARAM_SOURCE_PREFIX);
}

/** { role, parameterId } for a '@param:...' source, or null. An empty id is not a source. */
export function parseParamSource(id, defaultRole = '') {
  const s = String(id ?? '');
  if (!isParamSource(s)) return null;
  const rest = s.slice(PARAM_SOURCE_PREFIX.length);
  const colon = rest.indexOf(':');
  const role = colon >= 0 ? rest.slice(0, colon).trim() : String(defaultRole ?? '');
  const parameterId = (colon >= 0 ? rest.slice(colon + 1) : rest).trim();
  if (!parameterId) return null;
  return { role, parameterId };
}

/**
 * A zone `info` built from a profile's parameter definition plus its current value.
 *
 * The same shape `lcdSourceInfo` produces for a control, so every `show` kind works against a
 * parameter without knowing the difference. `address` answers the parameter's own id, which is
 * what the kind already showed when it reached through a control's binding to find one.
 *
 * A BOOLEAN parameter has no `range` — it carries falseValue/trueValue instead — so it is reported
 * as 0..1 with `on` set. Reporting its raw 0/127 would make `pct` say 100% for "on", which is true
 * of the wire and useless on a screen.
 */
export function parameterInfo(parameter, value) {
  if (!parameter) return null;
  const isBool = String(parameter?.type ?? '') === 'boolean';
  const fallback = parameter?.default;
  const raw = value === undefined || value === null ? fallback : value;

  if (isBool) {
    const on = raw === true || numberOr(raw, 0) >= numberOr(parameter?.trueValue, 1) / 2;
    return {
      present: true,
      name: String(parameter?.name ?? parameter?.id ?? ''),
      value: on ? 1 : 0,
      min: 0,
      max: 1,
      text: on ? 'On' : 'Off',
      on,
      address: String(parameter?.id ?? ''),
    };
  }

  // A CHOICE PARAMETER IS NOT A NUMBER, and falling through to the numeric branch below silently
  // turned one into the wrong number. A profile's choice stores its value as an id — "square", not
  // 2 — so `numberOr(raw, min)` answered `min` for every setting the parameter had, and the text
  // was the unit rather than the label. An `@param:osc.wave` zone therefore read 0 and drew no
  // name, whichever waveform was selected.
  //
  // Shaped to match what a control-backed choice zone already produces (lcdSourceInfo): `text` is
  // the human label so a screen shows "Bright" rather than "option_2", and `selector` is the id so
  // a page can switch on it. The value is the POSITION in the list, which is what makes `pct` and
  // `bar` mean something for a parameter that has no numeric range of its own.
  const choices = Array.isArray(parameter?.choices) ? parameter.choices : [];
  if (choices.length) {
    const key = String(raw ?? '');
    // By id first, then by wire value: a profile records the id, but a value arriving from the
    // device is the wire byte, and both have to land on the same choice.
    const at = choices.findIndex((c) => String(c?.id ?? '') === key
      || String(c?.value ?? '') === key);
    const chosen = at >= 0 ? choices[at] : null;
    return {
      present: true,
      name: String(parameter?.name ?? parameter?.id ?? ''),
      value: Math.max(0, at),
      min: 0,
      max: choices.length - 1,
      text: String(chosen?.label ?? chosen?.id ?? ''),
      on: false,
      selector: String(chosen?.id ?? ''),
      address: String(parameter?.id ?? ''),
    };
  }

  const min = numberOr(parameter?.range?.min, 0);
  const max = numberOr(parameter?.range?.max, 127);
  return {
    present: true,
    name: String(parameter?.name ?? parameter?.id ?? ''),
    value: numberOr(raw, min),
    min,
    max,
    text: String(parameter?.display?.unit ?? ''),
    on: false,
    address: String(parameter?.id ?? ''),
  };
}

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
    case 'edit':
      // An editable string field (e.g. a preset name). Shows the source's live
      // text; the renderer overlays the caret when this zone is being edited.
      return `${prefix}${String(info?.text ?? zone?.text ?? '')}${suffix}`;
    case 'state':
      return present ? `${prefix}${info?.on === true || numberOr(info.value, 0) >= 0.5 ? 'On' : 'Off'}${suffix}` : '';
    case 'address':
      return String(info?.address ?? zone?.text ?? '----');
    // Character-mode fallbacks for the pixel widgets (graphic panels render
    // these as real pixel drawings instead of this text).
    case 'hbar':
    case 'hslider':
      return present ? barString(infoFraction(info), width) : '';
    case 'vbar':
    case 'vslider': {
      if (!present) return '';
      // Floor at the lowest visible level so an empty meter still reads as one.
      const level = ' ▁▂▃▄▅▆▇█'[clamp(Math.max(1, Math.round(infoFraction(info) * 8)), 1, 8)];
      return level.repeat(Math.max(1, Math.round(width)));
    }
    case 'needle':
      return present ? `${prefix}${Math.round(infoFraction(info) * 100)}%${suffix}` : '';
    default:
      return '';
  }
}

// The column offset (from the region's left edge) at which fitToRegion places
// content of `contentLen` chars under a given alignment. Used to place/read the
// on-screen edit caret so it tracks left/right/centre alignment.
export function regionStartOffset(width, contentLen, align = 'left') {
  const w = Math.max(0, Math.round(width));
  const len = Math.min(w, Math.max(0, Math.round(contentLen)));
  const pad = Math.max(0, w - len);
  const a = String(align ?? 'left').trim().toLowerCase();
  if (a === 'right') return pad;
  if (a === 'center') return Math.floor(pad / 2);
  return 0;
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

// Marquee window for a zone whose content overflows its region: loop the
// content with a blank gap and slide a `width`-wide window across it.
const ZONE_SCROLL_GAP = 3;
export function zoneScrollWindow(content, width, elapsedChars) {
  const track = `${content}${' '.repeat(ZONE_SCROLL_GAP)}`;
  const period = track.length;
  const base = ((Math.floor(elapsedChars) % period) + period) % period;
  let out = '';
  for (let i = 0; i < width; i += 1) out += track[(base + i) % period];
  return out;
}

// Compose `rows` strings of `cols` chars from a layout's zones. `state` gates zones that declare
// `visibleWhen` — see zoneVisibleWith, and note that pressTargetAt filters through the same
// predicate, so a zone that is not drawn cannot be pressed either. Later (higher
// priority) zones paint over earlier ones. getInfo(sourceId) -> info | null.
// `elapsedChars` drives per-zone marquee: a zone with scroll:true whose content
// overflows its region scrolls within it instead of truncating.
export function composeLayout(zones, rows, cols, getInfo, elapsedChars = 0, state = {}) {
  const nRows = Math.max(0, Math.round(rows));
  const nCols = Math.max(0, Math.round(cols));
  const grid = [];
  for (let r = 0; r < nRows; r += 1) grid.push(new Array(nCols).fill(' '));

  const ordered = (Array.isArray(zones) ? zones : [])
    .filter((z) => zoneVisibleWith(z, state))
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
    const fitted = zone?.scroll === true && raw.length > width
      ? zoneScrollWindow(raw, width, elapsedChars)
      : fitToRegion(raw, width, zone?.align);
    for (let i = 0; i < width; i += 1) grid[row][c0 + i] = fitted[i] ?? ' ';
  }

  return grid.map((cells) => cells.join(''));
}

// Does a selector-map rule match the live selector value? Supports exact match
// (default) plus comparison operators so a layout can switch on a range, not
// only an exact value. Numeric ops coerce both sides to Number; a non-numeric
// selector never matches a numeric op.
//   op: 'eq' (default) | 'ne' | 'lt' | 'le' | 'gt' | 'ge' | 'between'
//   'between' uses `when`..`when2` (inclusive, order-independent).
export function selectorRuleMatches(rule, sel) {
  const op = String(rule?.op ?? 'eq').trim().toLowerCase();
  if (op === 'eq') return String(rule?.when) === String(sel);
  if (op === 'ne') return String(rule?.when) !== String(sel);
  const n = Number(sel);
  const a = Number(rule?.when);
  if (!Number.isFinite(n) || !Number.isFinite(a)) return false;
  if (op === 'lt') return n < a;
  if (op === 'le') return n <= a;
  if (op === 'gt') return n > a;
  if (op === 'ge') return n >= a;
  if (op === 'between') {
    const b = Number(rule?.when2);
    if (!Number.isFinite(b)) return false;
    return n >= Math.min(a, b) && n <= Math.max(a, b);
  }
  return false;
}

// Pick the active layout id. Priority: an active overlay (resolved by the caller
// with timing) > the first matching selector rule > the default > the first
// layout. Rules are evaluated in order, so put more specific ones first.
export function resolveActiveLayoutId(pages, layouts, state = {}) {
  const list = Array.isArray(layouts) ? layouts : [];
  const ids = new Set(list.map((l) => String(l?.id ?? '')));

  const overlayId = String(state?.activeOverlayLayoutId ?? '');
  if (overlayId && ids.has(overlayId)) return overlayId;

  const map = Array.isArray(pages?.selectorMap) ? pages.selectorMap : [];
  const sel = state?.selectorValue;
  if (sel !== undefined && sel !== null && String(sel) !== '') {
    const hit = map.find((m) => selectorRuleMatches(m, sel));
    if (hit && ids.has(String(hit.layoutId))) return String(hit.layoutId);
  }

  const def = String(pages?.defaultLayoutId ?? '');
  if (ids.has(def)) return def;
  return list[0] ? String(list[0].id) : '';
}

export function findLayout(layouts, id) {
  return (Array.isArray(layouts) ? layouts : []).find((l) => String(l?.id ?? '') === String(id)) ?? null;
}

/**
 * A layout's auto-return, or null when it stays put.
 *
 * THE ONE EDGE A VALUE CANNOT EXPRESS. `pages.selectorMap` maps a control's value to a layout and
 * `overlays` show one on a trigger, so both are pure functions of the current values: ask twice
 * with the same values and you get the same answer. "Five seconds after you last touched it" is not
 * a value at all, which is why a device's Edit page could be entered here but never left.
 *
 * DECLARED ON THE PAGE, NOT ON THE KEY THAT OPENED IT. "This page does not stay" is a property of
 * the page — four soft keys and a selector can all lead to the same Edit screen, and every one of
 * them wants the same behaviour on arrival. Putting `after` on the press would mean repeating it
 * per key and getting it wrong on the fifth.
 *
 *   { id: 'edit', timeoutMs: 5000, timeoutTo: 'home', zones: [...] }
 *
 * `timeoutTo` empty means "stop overriding" — back to whatever the selector or the default says,
 * which is the common case and one fewer id to keep in step.
 */
export function layoutTimeout(layout) {
  const ms = numberOr(layout?.timeoutMs, 0);
  // Sub-100ms would be a page nobody could read; 0 and negatives mean "no timeout" rather than
  // "immediately", which is the reading that cannot strand a user on a screen they never saw.
  if (!(ms >= 100)) return null;
  return { ms: Math.round(ms), to: String(layout?.timeoutTo ?? '') };
}

// --- Pressable zones (soft keys) -------------------------------------------
//
// A zone may carry a `press` action, which makes it a HIT TARGET: the region it
// already occupies becomes a soft key, the way F1..F6 sit under a hardware
// screen. The action is one of:
//
//   { layout: 'id' }        switch the active layout — screen navigation
//   { set: 'name', to: n }  write a value to another control
//
// WHY THIS IS AN EXCEPTION AND NOT A NEW MODEL. A display has no Mouse,
// Behavior or HitZones section; it is an output, and `displayMode.js` makes a
// read-only control transparent to the pointer precisely so a meter laid over
// a knob passes the click through. Pressable zones do not overturn that — the
// display stays display-only, and only a zone that DECLARES an action takes a
// press. The precedent is already here: an `edit` zone has been clickable
// since the edit field was added, resolved through this same cell geometry.

/**
 * True when a zone declares a press action a user could actually trigger.
 *
 * EVERY ACTION HAS TO BE LISTED HERE. A zone whose action this does not recognise is not a hit
 * target at all, so `pressTargetAt` returns null and the press does nothing — silently, and
 * identically to a zone with no action. `{ cursor: ±1 }` shipped broken for exactly that reason:
 * the unit tests exercised the cursor arithmetic and the visibility gate separately and both
 * passed, while pressing the key in the real editor moved nothing.
 */
export function isPressableZone(zone) {
  if (!zone || zone.visible === false) return false;
  const press = zone.press;
  if (!press || typeof press !== 'object') return false;
  if (String(press.layout ?? '') !== '') return true;
  if (String(press.set ?? '') !== '') return true;
  // 0 is not a move, so it is not an action — the same reading `moveCursor` takes.
  return Number.isFinite(Number(press.cursor)) && Number(press.cursor) !== 0;
}

/** Does a zone's region cover this 0-based character cell? */
export function zoneCoversCell(zone, cell, cols) {
  if (!zone || !cell) return false;
  const row = Math.round(numberOr(zone?.row, 1)) - 1;
  if (cell.row !== row) return false;
  const nCols = Math.max(1, Math.round(numberOr(cols, 16)));
  const c0 = clamp(Math.round(numberOr(zone?.colStart, 1)) - 1, 0, nCols - 1);
  const c1 = clamp(Math.round(numberOr(zone?.colEnd, nCols)) - 1, c0, nCols - 1);
  return cell.col >= c0 && cell.col <= c1;
}

/**
 * The pressable zone a click at `cell` (0-based row/col) lands on, or null.
 *
 * ORDERED LIKE THE PAINT, AND THAT IS THE WHOLE SUBTLETY. Zones overlap on
 * purpose — composeLayout sorts by priority ascending and lets a later zone
 * paint over an earlier one — so the zone a user can SEE at a cell is the last
 * one to paint there. A press has to resolve to the same zone the eye picked,
 * so this walks the identical ordering backwards and returns the first hit.
 * Resolving it forwards would hand the press to a zone hidden underneath.
 */
export function pressTargetAt(zones, cell, cols, state = {}, getInfo = null) {
  const nCols = Math.max(0, Math.round(numberOr(cols, 0)));
  const ordered = (Array.isArray(zones) ? zones : [])
    .filter((z) => zoneVisibleWith(z, state))
    .slice()
    .sort((a, b) => numberOr(a?.priority, 0) - numberOr(b?.priority, 0));
  for (let i = ordered.length - 1; i >= 0; i -= 1) {
    const zone = ordered[i];
    if (!zoneCoversCell(zone, cell, cols)) continue;
    if (isPressableZone(zone)) return zone;
    // A zone that covers the cell but takes no press BLOCKS the ones beneath it,
    // for the same reason it hides them visually: the user pressed what they
    // could see, and what they could see does nothing.
    //
    // …UNLESS IT PAINTED NOTHING, which is the case that argument does not cover.
    // composeLayout skips a zone whose resolved content is empty — an idle
    // '@active#kind' zone, or any source that is absent — and leaves whatever is
    // underneath on screen. Blocking on it anyway made the two disagree: the eye
    // saw the soft key below and the press hit a zone that was never drawn. So the
    // same emptiness test decides both, from the same resolved content.
    if (getInfo && nCols > 0 && zoneContentEmpty(zone, nCols, getInfo)) continue;
    return null;
  }
  return null;
}

/** Did this zone resolve to nothing — the exact condition composeLayout skips on? */
function zoneContentEmpty(zone, nCols, getInfo) {
  const c0 = clamp(Math.round(numberOr(zone?.colStart, 1)) - 1, 0, nCols - 1);
  const c1 = clamp(Math.round(numberOr(zone?.colEnd, nCols)) - 1, c0, nCols - 1);
  const info = getInfo(String(zone?.sourceId ?? ''));
  return resolveZoneContent(zone, info, c1 - c0 + 1) === '';
}

/** Every pressable zone of a layout, for a surface that wants to mark them. */
export function pressableZones(zones) {
  return (Array.isArray(zones) ? zones : []).filter(isPressableZone);
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
