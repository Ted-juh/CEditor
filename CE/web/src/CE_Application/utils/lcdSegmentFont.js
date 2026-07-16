// LCD segment-display font: geometry for 7-segment and 14/16-segment (starburst)
// digits, plus character -> lit-segment maps. Coordinates use a 0..100 x, 0..180 y
// viewBox per glyph; the renderer scales them into each cell.

// --- geometry helpers -------------------------------------------------------

// A pointed horizontal bar centred on cy, spanning x1..x2, thickness th.
function hBar(x1, x2, cy, th = 15) {
  const h = th / 2;
  return {
    kind: 'poly',
    points: `${x1},${cy} ${x1 + h},${cy - h} ${x2 - h},${cy - h} ${x2},${cy} ${x2 - h},${cy + h} ${x1 + h},${cy + h}`,
  };
}

// A pointed vertical bar centred on cx, spanning y1..y2, thickness th.
function vBar(cx, y1, y2, th = 15) {
  const h = th / 2;
  return {
    kind: 'poly',
    points: `${cx},${y1} ${cx + h},${y1 + h} ${cx + h},${y2 - h} ${cx},${y2} ${cx - h},${y2 - h} ${cx - h},${y1 + h}`,
  };
}

// A diagonal stroke (rendered as a line with round caps).
function diag(x1, y1, x2, y2, width = 9) {
  return { kind: 'line', x1, y1, x2, y2, width };
}

// --- 7-segment --------------------------------------------------------------

const SEVEN_SEG_GEOMETRY = {
  a: hBar(24, 76, 14),
  b: vBar(84, 20, 86),
  c: vBar(84, 94, 160),
  d: hBar(24, 76, 166),
  e: vBar(16, 94, 160),
  f: vBar(16, 20, 86),
  g: hBar(24, 76, 90),
  dp: { kind: 'dot', cx: 93, cy: 166, r: 6 },
};

// char -> segments lit (7-seg). Unknown chars render blank.
const SEVEN_SEG_MAP = {
  '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc',
  '5': 'afgcd', '6': 'afgcde', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg',
  A: 'abcefg', b: 'cdefg', B: 'cdefg', C: 'adef', c: 'deg', D: 'bcdeg', d: 'bcdeg',
  E: 'adefg', F: 'aefg', G: 'acdef', H: 'bcefg', h: 'cefg', I: 'bc', J: 'bcd',
  L: 'def', n: 'ceg', N: 'abcef', O: 'abcdef', o: 'cdeg', P: 'abefg', q: 'abcfg',
  r: 'eg', R: 'abcef', S: 'afgcd', t: 'defg', T: 'defg', U: 'bcdef', u: 'cde',
  Y: 'bcdfg', y: 'bcdfg', Z: 'abged', '-': 'g', '_': 'd', '=': 'gd', '°': 'abfg',
  ' ': '',
};

// --- 9-segment --------------------------------------------------------------
// The common 9-segment layout: the seven standard segments plus a top-centre
// (i) and bottom-centre (l) vertical, which lets it render T, I, +, etc.
// (9-segment isn't fully standardised; some makers used two diagonals instead.)

const NINE_SEG_GEOMETRY = {
  a: hBar(24, 76, 14),
  b: vBar(84, 20, 86),
  c: vBar(84, 94, 160),
  d: hBar(24, 76, 166),
  e: vBar(16, 94, 160),
  f: vBar(16, 20, 86),
  g: hBar(24, 76, 90),
  i: vBar(50, 20, 86, 12),
  l: vBar(50, 94, 160, 12),
  dp: { kind: 'dot', cx: 93, cy: 166, r: 6 },
};

// Starts from the 7-seg map, then improves the glyphs that benefit from the two
// centre verticals. Segment names are single chars, so packed strings are fine.
const NINE_SEG_MAP = {
  ...SEVEN_SEG_MAP,
  '1': 'il', I: 'il', T: 'ail', t: 'gil', '+': 'gil', '±': 'gild',
  '0': 'abcdef', // (no slash; verticals reserved for glyphs that need them)
};

// --- 16-segment starburst ---------------------------------------------------
// Bars a/d/g are split into halves (a1/a2, d1/d2, g1/g2); i/l are the top/bottom
// centre verticals; h/j/k/m are the diagonals.

const SIXTEEN_SEG_GEOMETRY = {
  a1: hBar(20, 48, 14, 13),
  a2: hBar(52, 80, 14, 13),
  b: vBar(86, 20, 86, 13),
  c: vBar(86, 94, 160, 13),
  d1: hBar(20, 48, 166, 13),
  d2: hBar(52, 80, 166, 13),
  e: vBar(14, 94, 160, 13),
  f: vBar(14, 20, 86, 13),
  g1: hBar(20, 48, 90, 13),
  g2: hBar(52, 80, 90, 13),
  i: vBar(50, 20, 86, 12),
  l: vBar(50, 94, 160, 12),
  h: diag(22, 22, 44, 82),
  j: diag(78, 22, 56, 82),
  k: diag(22, 158, 44, 98),
  m: diag(78, 158, 56, 98),
  dp: { kind: 'dot', cx: 94, cy: 166, r: 6 },
};

// Compact tokens expand to the split half-bars.
function expandStarburst(tokens) {
  const out = [];
  for (const tok of tokens) {
    if (tok === 'a') out.push('a1', 'a2');
    else if (tok === 'd') out.push('d1', 'd2');
    else if (tok === 'g') out.push('g1', 'g2');
    else out.push(tok);
  }
  return out;
}

// char -> lit segments (16-seg starburst). Tokens use the compact a/d/g form.
const STARBURST_TOKENS = {
  '0': ['a', 'b', 'c', 'd', 'e', 'f'],
  '1': ['b', 'c'],
  '2': ['a', 'b', 'g', 'e', 'd'],
  '3': ['a', 'b', 'g', 'c', 'd'],
  '4': ['f', 'g', 'b', 'c'],
  '5': ['a', 'f', 'g', 'c', 'd'],
  '6': ['a', 'f', 'g', 'e', 'c', 'd'],
  '7': ['a', 'b', 'c'],
  '8': ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
  '9': ['a', 'b', 'c', 'd', 'f', 'g'],
  A: ['a', 'b', 'c', 'e', 'f', 'g'],
  B: ['a', 'b', 'c', 'd', 'g2', 'i', 'l'],
  C: ['a', 'd', 'e', 'f'],
  D: ['a', 'b', 'c', 'd', 'i', 'l'],
  E: ['a', 'd', 'e', 'f', 'g1'],
  F: ['a', 'e', 'f', 'g1'],
  G: ['a', 'c', 'd', 'e', 'f', 'g2'],
  H: ['b', 'c', 'e', 'f', 'g'],
  I: ['a', 'd', 'i', 'l'],
  J: ['b', 'c', 'd', 'e'],
  K: ['e', 'f', 'g1', 'j', 'm'],
  L: ['d', 'e', 'f'],
  M: ['b', 'c', 'e', 'f', 'h', 'j'],
  N: ['b', 'c', 'e', 'f', 'h', 'm'],
  O: ['a', 'b', 'c', 'd', 'e', 'f'],
  P: ['a', 'b', 'e', 'f', 'g'],
  Q: ['a', 'b', 'c', 'd', 'e', 'f', 'm'],
  R: ['a', 'b', 'e', 'f', 'g', 'm'],
  S: ['a', 'f', 'g', 'c', 'd'],
  T: ['a', 'i', 'l'],
  U: ['b', 'c', 'd', 'e', 'f'],
  V: ['e', 'f', 'k', 'j'],
  W: ['b', 'c', 'e', 'f', 'k', 'm'],
  X: ['h', 'j', 'k', 'm'],
  Y: ['h', 'j', 'l'],
  Z: ['a', 'd', 'j', 'k'],
  '-': ['g'],
  '_': ['d'],
  '=': ['g', 'd'],
  '+': ['g', 'i', 'l'],
  '*': ['g', 'h', 'i', 'j', 'k', 'l', 'm'],
  '/': ['j', 'k'],
  '\\': ['h', 'm'],
  ' ': [],
};

const STARBURST_MAP = Object.fromEntries(
  Object.entries(STARBURST_TOKENS).map(([ch, toks]) => [ch, expandStarburst(toks).join(' ')])
);

// --- public API -------------------------------------------------------------

export const SEGMENT_VIEWBOX = { width: 100, height: 180 };

// Resolve the geometry + lit-segment set for a character in a given segment mode.
// segmentType: 7 | 9 | 14 | 16 (14 shares the 16-seg starburst).
export function getSegmentGlyph(segmentType, rawChar) {
  const s = String(segmentType);
  const seg = s === '7' ? 7 : s === '9' ? 9 : 16;
  const upper = String(rawChar ?? ' ');
  const geometry = seg === 7 ? SEVEN_SEG_GEOMETRY : seg === 9 ? NINE_SEG_GEOMETRY : SIXTEEN_SEG_GEOMETRY;
  const map = seg === 7 ? SEVEN_SEG_MAP : seg === 9 ? NINE_SEG_MAP : STARBURST_MAP;

  // Exact match first, then case-folded, else blank.
  const litStr = map[upper] ?? map[upper.toUpperCase()] ?? map[upper.toLowerCase()] ?? '';
  // 7/9-seg map values are concatenated single-char segments ("abcdef"); the
  // 16-seg starburst map is space-separated multi-char tokens ("a1 a2 b ...").
  const tokens = seg === 16 ? litStr.split(/\s+/) : litStr.split('');
  const lit = new Set(tokens.map((t) => t.trim()).filter(Boolean));
  return { geometry, lit };
}
