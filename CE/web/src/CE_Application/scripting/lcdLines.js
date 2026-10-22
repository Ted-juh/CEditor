// lcdLines.js — what a character LCD shows of a line a script writes to it, in one place: the
// runtime (panelRuntime.js) says what of it the display cannot show, once, and the script editor's
// Values tab draws the line as the display shows it and says the same.
//
// ce.components.lcd.text("Lcd", 1, "…") stored the line whole and logged "text → lines", and
// three things about it went unsaid (LcdDisplayRenderer.svelte draws them):
//   · a line longer than the display is cut at its width unless the display scrolls, so on a
//     16-character display a 48-character line showed its first 16 and dropped the rest;
//   · a segment display has no shape for many characters ("%", "K" on seven segments), and a
//     graphic display's pixel font no glyph for some, and those cells stay blank;
//   · a display that has layouts shows their zones and not its lines at all.
// A line holding the renderer's {value}, {pct} or {bar} tokens is as long as what they expand to,
// which is known only when it is drawn, so its width is not judged, and the tokens are not
// characters to draw.

import { getSegmentGlyph } from '../utils/lcdSegmentFont.js';
import { glyphRows } from '../utils/pixelFont.js';

const numberOr = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

// The renderer's tokens (LcdDisplayRenderer's expandTokens).
const TOKENS = /\{(?:value|v\d+|pct|p\d+|bar|b\d+)(?::\d+)?\}/gi;

const SEGMENT_NAMES = { 7: '7-segment', 9: '9-segment', curved9: 'curved 9-segment', 14: '14-segment', 16: '16-segment' };

/** How a display's Display section is set, as the renderer reads it. */
export function lcdDisplayOf(display) {
  const d = display && typeof display === 'object' ? display : {};
  const scroll = String(d.scroll ?? 'off').trim().toLowerCase();
  const panelType = String(d.panelType ?? 'character').trim().toLowerCase();
  const segmentType = String(d.segmentType ?? '16').trim().toLowerCase();
  return {
    cols: Math.max(1, Math.round(numberOr(d.cols, 16))),
    scrolls: (scroll === 'left' || scroll === 'right') && Math.max(0, numberOr(d.scrollSpeed, 4)) > 0,
    layouts: Array.isArray(d.layouts) && d.layouts.length > 0,
    panelType: panelType === 'segment' || panelType === 'graphic' ? panelType : 'character',
    segmentType: SEGMENT_NAMES[segmentType] ? segmentType : '16',
  };
}

/** Whether the display draws `ch` in a cell: a character panel draws any, a segment panel the ones
 *  its segments have a shape for, a graphic panel the ones its pixel font has a glyph for. */
export function lcdDraws(how, ch) {
  if (ch === ' ') return true;
  if (how.panelType === 'segment') return getSegmentGlyph(how.segmentType, ch).lit.size > 0;
  if (how.panelType === 'graphic') return glyphRows(ch) !== null;
  return true;
}

/**
 * A line as the display shows it: `cells` (its first `cols` characters, each `{ ch, draws }`, or
 * null for a line with tokens, whose cells are known only when it is drawn) and `past` (the ones
 * after them, which scroll in, or are `cut` when the display does not scroll), and the characters
 * it cannot draw. Characters are counted as the renderer counts them, a UTF-16 unit each.
 */
export function lcdLine(display, text) {
  const how = lcdDisplayOf(display);
  const raw = String(text ?? '');
  const tokens = raw.includes('{') && new RegExp(TOKENS.source, 'i').test(raw);
  const plain = tokens ? raw.replace(TOKENS, '') : raw;
  const fits = tokens || how.scrolls || raw.length <= how.cols;
  const cell = (ch) => ({ ch, draws: lcdDraws(how, ch) });
  const cells = tokens ? null : Array.from({ length: how.cols }, (_, c) => cell(raw[c] ?? ' '));
  const past = tokens ? [] : Array.from({ length: Math.max(0, raw.length - how.cols) }, (_, i) => cell(raw[how.cols + i]));
  // What is ever on the display: the whole line when it scrolls, else its first `cols`.
  const seen = tokens || how.scrolls ? plain : plain.slice(0, how.cols);
  const undrawn = [...new Set(Array.from({ length: seen.length }, (_, i) => seen[i]).filter((ch) => !lcdDraws(how, ch)))];
  return {
    ...how,
    text: raw,
    tokens,
    cells,
    past,
    cut: fits ? '' : raw.slice(how.cols),
    shown: fits ? raw : raw.slice(0, how.cols),
    undrawn,
  };
}

const quotedList = (chars) => chars.map((ch) => JSON.stringify(ch)).join(', ');

/**
 * What the runtime says of a line written to the display, as [{ reason, message }], each without
 * the "said only the first time": the call as `call` ("lcd Lcd: text(1, \"…\")"), then why.
 */
export function lcdLineWords(display, call, text) {
  const line = lcdLine(display, text);
  if (line.layouts) {
    return [{ reason: 'layouts', message: `${call} — the display shows the zones of its layouts, not its lines, so this line is not shown.` }];
  }
  const said = [];
  if (line.cut) {
    said.push({ reason: 'width', message: `${call} — the display is ${line.cols} characters wide and does not scroll, `
      + `so only ${JSON.stringify(line.shown)} shows.` });
  }
  if (line.undrawn.length) {
    const what = line.panelType === 'segment' ? `${SEGMENT_NAMES[line.segmentType]} cells have no shape for`
      : 'pixel font has no glyph for';
    const cells = line.undrawn.length === 1 ? 'that cell stays' : 'those cells stay';
    said.push({ reason: 'glyphs', message: `${call} — the display's ${what} ${quotedList(line.undrawn)}, so ${cells} blank.` });
  }
  return said;
}
