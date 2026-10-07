// googleIcons.js — Google's icons (Material Symbols), fetched by name into the icon library.
//
// Settings → Fonts could always take a Google font by name; Settings → Icons could only take files,
// so using one of Google's icons meant a trip to fonts.google.com/icons, a download and an import.
// This is the icon half of the same idea: search the names, pick a style, and CEditor fetches the
// SVG itself and keeps it, so the internet is needed once, when the icon is added.
//
// WHERE THE FILES COME FROM. Google serves every Material Symbol as a single SVG on fonts.gstatic.com,
// in three styles (Outlined, Rounded, Sharp), filled or not, at seven weights:
//
//   https://fonts.gstatic.com/s/i/short-term/release/materialsymbols<style>/<name>/<variant>/24px.svg
//
// where <variant> is `default`, `fill1`, `wght300`, `wght300fill1` and so on. The server answers any
// origin (`Access-Control-Allow-Origin: *`), which is what lets the editor's web view fetch it, the
// same way Google Fonts are fetched. An unknown name is a 404 with an HTML body — checked for, so a
// typo can never be stored as an "icon".
//
// THE NAMES come from generated/googleIconNames.js (see scripts/generate-google-icon-names.mjs). The
// list is only for searching: a name that is not on it can still be tried, because the fetch is the
// real test of whether Google has the icon.

export const GOOGLE_ICON_STYLES = Object.freeze([
  { id: 'outlined', label: 'Outlined' },
  { id: 'rounded', label: 'Rounded' },
  { id: 'sharp', label: 'Sharp' },
]);

export const GOOGLE_ICON_WEIGHTS = Object.freeze([100, 200, 300, 400, 500, 600, 700]);

// Google draws its icons black. A panel is dark by default, so white is the default here: an icon
// with no tint shows in the colour it was stored in, and a tint (a mask over its shape,
// editor/canvasControlStyles.js) recolours either one.
export const GOOGLE_ICON_COLOURS = Object.freeze([
  { id: 'white', label: 'White', hex: '#FFFFFF' },
  { id: 'black', label: 'Black', hex: '#000000' },
]);
export const GOOGLE_ICON_DEFAULT_WEIGHT = 400;

/** Where people go to look at the icons — named in the UI and the manual. */
export const GOOGLE_ICONS_PAGE = 'https://fonts.google.com/icons';

const STYLE_IDS = GOOGLE_ICON_STYLES.map((style) => style.id);
const COLOUR_IDS = GOOGLE_ICON_COLOURS.map((colour) => colour.id);

/** Icons a synth panel reaches for first, shown before anything is typed. Every one is checked
 *  against the name list by test/googleIcons.test.js, so this can never offer a dead name. */
export const GOOGLE_ICON_SUGGESTIONS = Object.freeze([
  'play_arrow', 'pause', 'stop', 'fiber_manual_record', 'skip_previous', 'skip_next', 'fast_rewind',
  'fast_forward', 'repeat', 'shuffle', 'volume_up', 'volume_off', 'mic', 'headphones', 'piano',
  'music_note', 'queue_music', 'album', 'graphic_eq', 'equalizer', 'tune', 'waves', 'speed', 'timer',
  'sync', 'cable', 'usb', 'bolt', 'power_settings_new', 'settings', 'save', 'folder_open', 'refresh',
  'undo', 'redo', 'add', 'remove', 'close', 'check', 'keyboard_arrow_up', 'keyboard_arrow_down',
  'lock', 'lock_open', 'link', 'star', 'favorite', 'info', 'help', 'warning', 'light_mode', 'dark_mode',
]);

/** A name as Google writes it: lower case, words joined by underscores. "Volume Up" → "volume_up". */
export function normalizeGoogleIconName(text) {
  return String(text ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/** One request, with every field in range: an unknown style is Outlined, a weight is snapped to
 *  the nearest one Google draws, and an unknown colour is white. */
export function normalizeGoogleIconRequest(request) {
  const style = STYLE_IDS.includes(request?.style) ? request.style : 'outlined';
  const wanted = Number(request?.weight);
  const weight = Number.isFinite(wanted)
    ? GOOGLE_ICON_WEIGHTS.reduce((best, w) => (Math.abs(w - wanted) < Math.abs(best - wanted) ? w : best))
    : GOOGLE_ICON_DEFAULT_WEIGHT;
  return {
    name: normalizeGoogleIconName(request?.name),
    style,
    fill: request?.fill === true,
    weight,
    colour: COLOUR_IDS.includes(request?.colour) ? request.colour : 'white',
  };
}

/** The path segment Google uses for a fill and weight: `default`, `fill1`, `wght300`, `wght300fill1`. */
export function googleIconVariant({ fill = false, weight = GOOGLE_ICON_DEFAULT_WEIGHT } = {}) {
  const parts = `${weight !== GOOGLE_ICON_DEFAULT_WEIGHT ? `wght${weight}` : ''}${fill ? 'fill1' : ''}`;
  return parts || 'default';
}

/** The SVG's address on fonts.gstatic.com. */
export function googleIconUrl(request) {
  const r = normalizeGoogleIconRequest(request);
  return 'https://fonts.gstatic.com/s/i/short-term/release/'
    + `materialsymbols${r.style}/${r.name}/${googleIconVariant(r)}/24px.svg`;
}

/** Identifies one icon in one look — two requests with the same key are the same picture. */
export function googleIconKey(request) {
  const r = normalizeGoogleIconRequest(request);
  return `${r.style}/${googleIconVariant(r)}/${r.colour}/${r.name}`;
}

/** How the icon is named in the library: its Google name, plus the look when it is not the default. */
export function googleIconLabel(request) {
  const r = normalizeGoogleIconRequest(request);
  const look = [
    r.style !== 'outlined' ? r.style : '',
    r.fill ? 'filled' : '',
    r.weight !== GOOGLE_ICON_DEFAULT_WEIGHT ? String(r.weight) : '',
    r.colour !== 'white' ? r.colour : '',
  ].filter(Boolean);
  return look.length ? `${r.name} (${look.join(', ')})` : r.name;
}

/** A line describing the look, for the library: "Material Symbols · Rounded · filled · weight 300". */
export function googleIconDescription(request) {
  const r = normalizeGoogleIconRequest(request);
  const style = GOOGLE_ICON_STYLES.find((s) => s.id === r.style)?.label ?? 'Outlined';
  return ['Material Symbols', style, r.fill ? 'filled' : '', `weight ${r.weight}`, r.colour]
    .filter(Boolean).join(' · ');
}

/**
 * Names matching what was typed, best first: the exact name, then names that start with it, then
 * names containing every word of it. "volume up" finds volume_up; "arrow" finds arrow_back before
 * keyboard_arrow_up.
 */
export function searchGoogleIconNames(names, query, limit = 60) {
  const list = Array.isArray(names) ? names : [];
  const wanted = normalizeGoogleIconName(query);
  if (!wanted) return [];
  const words = wanted.split('_').filter(Boolean);
  const exact = [];
  const starts = [];
  const contains = [];
  for (const name of list) {
    if (name === wanted) exact.push(name);
    else if (name.startsWith(wanted)) starts.push(name);
    else if (words.every((word) => name.includes(word))) contains.push(name);
  }
  return [...exact, ...starts, ...contains].slice(0, Math.max(0, limit));
}

/** An SVG Google sent, checked: it must be an <svg> element and carry nothing that runs. */
export function isUsableIconSvg(text) {
  const svg = String(text ?? '').trim();
  return /^<svg[\s>]/i.test(svg) && /<\/svg>\s*$/i.test(svg) && !/<script|\son\w+\s*=|javascript:/i.test(svg);
}

/** The SVG drawn in a colour: Google's shapes carry no fill of their own and inherit the root's. */
export function colourIconSvg(svg, colour = 'white') {
  const hex = GOOGLE_ICON_COLOURS.find((c) => c.id === colour)?.hex ?? '#FFFFFF';
  const text = String(svg ?? '');
  const open = text.match(/^<svg\b[^>]*>/i)?.[0];
  if (!open) return text;
  const coloured = /\sfill\s*=\s*"[^"]*"/i.test(open)
    ? open.replace(/\sfill\s*=\s*"[^"]*"/i, ` fill="${hex}"`)
    : open.replace(/^<svg\b/i, `<svg fill="${hex}"`);
  return coloured + text.slice(open.length);
}

/** The SVG as a data URL, base64 like every other icon in the library. */
export function svgToDataUrl(svg) {
  const bytes = new TextEncoder().encode(String(svg ?? ''));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

/**
 * Fetch one icon. Resolves to `{ ok: true, svg }` or `{ ok: false, reason }`, where reason is
 * `empty` (no name), `not-found` (Google has no icon of that name), `network` (Google could not be
 * reached) or `invalid` (the answer was not an SVG). Never throws.
 */
export async function fetchGoogleIconSvg(request, fetchImpl = globalThis.fetch) {
  const r = normalizeGoogleIconRequest(request);
  if (!r.name) return { ok: false, reason: 'empty' };
  let response;
  try {
    response = await fetchImpl(googleIconUrl(r));
  } catch {
    return { ok: false, reason: 'network' };
  }
  if (response?.status === 404) return { ok: false, reason: 'not-found' };
  if (!response?.ok) return { ok: false, reason: 'network' };
  let text = '';
  try {
    text = await response.text();
  } catch {
    return { ok: false, reason: 'network' };
  }
  if (!isUsableIconSvg(text)) return { ok: false, reason: 'invalid' };
  return { ok: true, svg: colourIconSvg(text.trim(), r.colour) };
}
