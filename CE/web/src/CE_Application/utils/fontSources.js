/**
 * fontSources.js — the font FILE behind a family name, so text can become outlines.
 *
 * The browser draws text from @font-face rules and system fonts and never hands the bytes back. To
 * turn a text part into glyph outlines (utils/textOutline.js) the editor needs the very file that
 * paints it, so this resolves (family, weight, style, character) to font bytes, in the order the
 * browser itself would find a face:
 *
 *   1. the faces shipped for panels (models/panelFontFaces.js — assets/fonts/panelFonts.css as data),
 *      choosing the unicode-range subset that holds the character, as the browser does;
 *   2. the fonts the user imported (Settings → Fonts: a local file or a cached Google face), and after
 *      them the faces the open panel carries (utils/documentFonts.js — all the player has);
 *   3. the system font of that name — on Windows read from the Fonts folder through the app's file
 *      bridge, in a browser through the Local Font Access API where it is granted;
 *   4. for Arial / Helvetica, Times New Roman and Courier New only: Liberation Sans, Serif and Mono,
 *      which are metric-compatible with them (every advance width identical), so the outline takes
 *      exactly the room the system font does even where the system file cannot be read.
 *
 * Anything else has no file the editor can read, and says so: `FontUnavailableError` names the family,
 * which the caller turns into a refusal the user can act on (pick a bundled or imported font).
 *
 * WOFF2 is decompressed to plain TrueType (woff2-encoder, Google's reference decoder in WebAssembly)
 * before fontkit parses it: fontkit's own WOFF2 path cannot instance a variable font, and most of the
 * panel faces are variable. Everything here is loaded on first use, never at start-up.
 */
import { PANEL_FONT_FACES } from '../models/panelFontFaces.js';
import { ATLAS_CHARACTERS, atlasFromFont, unitsPath } from './glyphAtlasBuild.js';

export class FontUnavailableError extends Error {
  constructor(family, detail = '') {
    super(`the font ${family} is not available to outline${detail ? ` — ${detail}` : ''}`);
    this.name = 'FontUnavailableError';
    this.family = family;
  }
}

const GENERIC = {
  'sans-serif': 'Arial',
  serif: 'Times New Roman',
  monospace: 'Courier New',
  'system-ui': 'Arial',
};

// Metric-compatible stand-ins (Liberation 2.x is drawn to the same advance widths).
const METRIC_TWINS = {
  arial: 'sans',
  helvetica: 'sans',
  'helvetica neue': 'sans',
  'times new roman': 'serif',
  times: 'serif',
  'courier new': 'mono',
  courier: 'mono',
};

// The Windows files of the families the font picker offers as built in (stores/appSettingsSchema.js).
const WINDOWS_FONT_FILES = {
  arial: ['arial', 'arialbd', 'ariali', 'arialbi'],
  verdana: ['verdana', 'verdanab', 'verdanai', 'verdanaz'],
  tahoma: ['tahoma', 'tahomabd', 'tahoma', 'tahomabd'],
  georgia: ['georgia', 'georgiab', 'georgiai', 'georgiaz'],
  'times new roman': ['times', 'timesbd', 'timesi', 'timesbi'],
  'courier new': ['cour', 'courbd', 'couri', 'courbi'],
  consolas: ['consola', 'consolab', 'consolai', 'consolaz'],
  'segoe ui': ['segoeui', 'segoeuib', 'segoeuii', 'segoeuiz'],
  'trebuchet ms': ['trebuc', 'trebucbd', 'trebucit', 'trebucbi'],
  impact: ['impact', 'impact', 'impact', 'impact'],
};

/** The first family of a CSS font-family list, unquoted, with generics mapped to a real family. */
export function primaryFamily(fontFamily) {
  const first = String(fontFamily ?? '').split(',')[0].trim().replace(/^['"]|['"]$/g, '').trim();
  const name = first || 'Arial';
  return GENERIC[name.toLowerCase()] ?? name;
}

function parseUnicodeRange(text) {
  return String(text ?? '').split(',').map((token) => token.trim().replace(/^U\+/i, '')).filter(Boolean).map((token) => {
    const [from, to] = token.split('-');
    const start = parseInt(from.replace(/\?/g, '0'), 16);
    const end = to ? parseInt(to, 16) : parseInt(from.replace(/\?/g, 'F'), 16);
    return [start, end];
  });
}

const rangesByFile = new Map();
function coversCodePoint(face, codePoint) {
  let ranges = rangesByFile.get(face.file);
  if (!ranges) {
    ranges = parseUnicodeRange(face.unicodeRange);
    rangesByFile.set(face.file, ranges);
  }
  return ranges.some(([start, end]) => codePoint >= start && codePoint <= end);
}

/**
 * CSS font matching, reduced to what panel faces need: the right style first (a missing italic falls
 * back to the upright face, which the browser then slants — `synthesizedItalic`), then the weight range
 * that holds the weight, else the nearest one.
 */
export function matchPanelFace(family, weight, style, codePoint = 0x41) {
  const key = String(family ?? '').toLowerCase();
  const faces = PANEL_FONT_FACES.filter((face) => face.family.toLowerCase() === key);
  if (!faces.length) return null;
  const wantItalic = style === 'italic';
  const styled = faces.filter((face) => (face.style === 'italic') === wantItalic);
  const pool = styled.length ? styled : faces;
  const covering = pool.filter((face) => coversCodePoint(face, codePoint));
  const candidates = covering.length ? covering : pool;
  const distance = (face) => (weight < face.weight[0] ? face.weight[0] - weight : weight > face.weight[1] ? weight - face.weight[1] : 0);
  const best = [...candidates].sort((a, b) => distance(a) - distance(b))[0];
  return { face: best, synthesizedItalic: wantItalic && !styled.length };
}

// --- Bytes ----------------------------------------------------------------------------------------

const isNode = typeof process !== 'undefined' && !!process.versions?.node && typeof window === 'undefined';

async function readUrl(url) {
  if (url.protocol === 'file:') {
    const fsModule = 'node:fs/promises';
    const { readFile } = await import(/* @vite-ignore */ fsModule);
    const buffer = await readFile(url);
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`font fetch failed: ${response.status}`);
  return response.arrayBuffer();
}

function bundledFontUrl(file) {
  // A template in `new URL(…, import.meta.url)` is how Vite is told to ship every file it can match.
  return new URL(`../../assets/fonts/${file}.woff2`, import.meta.url);
}

function isWoff2(buffer) {
  const bytes = new Uint8Array(buffer, 0, 4);
  return bytes[0] === 0x77 && bytes[1] === 0x4f && bytes[2] === 0x46 && bytes[3] === 0x32;
}

async function toSfnt(buffer) {
  if (!isWoff2(buffer)) return buffer;
  const { decompress } = await import('woff2-encoder');
  const out = await decompress(new Uint8Array(buffer));
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
}

let fontkitPromise = null;
function loadFontkit() {
  fontkitPromise ??= import('fontkit').then((module) => module.default ?? module);
  return fontkitPromise;
}

function bytesFor(buffer) {
  // fontkit wants a Buffer-like Uint8Array (it reads with DataView over `.buffer`).
  return typeof Buffer !== 'undefined' && isNode ? Buffer.from(buffer) : new Uint8Array(buffer);
}

const fontCache = new Map();
const sfntCache = new Map();

/** Parse (and cache) a font file into a fontkit font. */
async function fontFromLoader(key, load) {
  if (!fontCache.has(key)) {
    fontCache.set(key, (async () => {
      const fontkit = await loadFontkit();
      const sfnt = await toSfnt(await load());
      // Kept for the font worker (glyphAtlasAsync), which parses its own copy: fontkit's objects do
      // not cross a thread. The bytes are held anyway, inside the parsed font.
      sfntCache.set(key, sfnt);
      return fontkit.create(bytesFor(sfnt));
    })());
  }
  try {
    return await fontCache.get(key);
  } catch (error) {
    fontCache.delete(key);
    throw error;
  }
}

// --- Injected sources (the editor's settings and bridge; absent in the player and the tests) ------

let externalSources = {
  /** Imported fonts: [{ family, cssFamily, enabled, fontStyle, staticWeight, localDataUrl, filePath, cachedFaces }]. */
  storedFonts: () => [],
  /** Read a file by path through the app (Windows): resolves to an ArrayBuffer or null. */
  readFile: null,
};

/** The editor wires its settings store and file bridge in here (see stores/fontOutlineSources.js). */
export function setFontSources(sources) {
  externalSources = { ...externalSources, ...sources };
}

// The faces the open documents carry (utils/documentFonts.js): the only imported fonts the player
// has, and in the editor the fonts of a shared panel whose author imported them and this user did not.
let documentFaces = [];
export function setDocumentFonts(faces) {
  documentFaces = Array.isArray(faces) ? faces : [];
}

/** The faces the open documents carry, as last set — for the script catalogue (ce.text.fonts). */
export function currentDocumentFonts() {
  return documentFaces;
}

function dataUrlBuffer(dataUrl) {
  const text = String(dataUrl ?? '');
  const comma = text.indexOf(',');
  if (comma < 0) return null;
  const binary = atob(text.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function parseWeight(value, fallback = 400) {
  const n = Number(String(value ?? '').split(/\s+/)[0]);
  return Number.isFinite(n) ? n : fallback;
}

function storedFace(family, weight, style, codePoint = 0x41) {
  const key = family.toLowerCase();
  const fonts = (externalSources.storedFonts?.() ?? []).filter((font) => font?.enabled !== false
    && (String(font.family ?? '').toLowerCase() === key || String(font.cssFamily ?? '').toLowerCase() === key));
  const faces = [];
  for (const font of fonts) {
    if (Array.isArray(font.cachedFaces) && font.cachedFaces.length) {
      for (const face of font.cachedFaces) {
        faces.push({ id: `${font.id}:${face.weight}:${face.style}:${face.unicodeRange ?? ''}`, weight: parseWeight(face.weight), style: face.style || 'normal', unicodeRange: face.unicodeRange, dataUrl: face.dataUrl });
      }
    } else if (font.localDataUrl || font.filePath) {
      faces.push({ id: font.id, weight: parseWeight(font.staticWeight), style: font.fontStyle || 'normal', dataUrl: font.localDataUrl, filePath: font.filePath });
    }
  }
  // The user's own import wins; the faces an open panel carries answer where the user has none.
  if (!faces.length) {
    for (const face of documentFaces) {
      if (String(face.family).toLowerCase() !== key) continue;
      faces.push({ id: `doc:${face.family}:${face.weight}:${face.style}:${face.unicodeRange ?? ''}:${face.data.length}`, weight: parseWeight(face.weight), style: face.style || 'normal', unicodeRange: face.unicodeRange, dataUrl: face.data });
    }
  }
  if (!faces.length) return null;
  const wantItalic = style === 'italic';
  const styled = faces.filter((face) => (face.style === 'italic') === wantItalic);
  const pool = styled.length ? styled : faces;
  // A face split by unicode-range (a cached Google font) holds only its subset.
  const covering = pool.filter((face) => !face.unicodeRange
    || parseUnicodeRange(face.unicodeRange).some(([start, end]) => codePoint >= start && codePoint <= end));
  const candidates = covering.length ? covering : pool;
  return [...candidates].sort((a, b) => Math.abs(a.weight - weight) - Math.abs(b.weight - weight))[0];
}

async function queryLocalFont(family, weight, style) {
  if (typeof window === 'undefined' || typeof window.queryLocalFonts !== 'function') return null;
  try {
    const fonts = await window.queryLocalFonts();
    const key = family.toLowerCase();
    const matches = fonts.filter((font) => String(font.family).toLowerCase() === key);
    if (!matches.length) return null;
    const bold = weight >= 600;
    const italic = style === 'italic';
    const score = (font) => {
      const s = String(font.style).toLowerCase();
      return (s.includes('bold') === bold ? 0 : 2) + ((s.includes('italic') || s.includes('oblique')) === italic ? 0 : 1);
    };
    const best = [...matches].sort((a, b) => score(a) - score(b))[0];
    return { key: `local:${best.postscriptName}`, load: async () => (await best.blob()).arrayBuffer() };
  } catch {
    return null;
  }
}

function windowsFontFile(family, weight, style) {
  const files = WINDOWS_FONT_FILES[family.toLowerCase()];
  if (!files) return null;
  const index = (weight >= 600 ? 1 : 0) + (style === 'italic' ? 2 : 0);
  return `C:\\Windows\\Fonts\\${files[index]}.ttf`;
}

/**
 * The font for one character of a run. Resolves to `{ font, key, synthesizedItalic, synthesizedBold }`
 * or throws FontUnavailableError.
 */
export async function resolveFont(fontFamily, { weight = 400, style = 'normal', codePoint = 0x41 } = {}) {
  const family = primaryFamily(fontFamily);
  const italic = String(style).toLowerCase() === 'italic' ? 'italic' : 'normal';
  const w = Number.isFinite(Number(weight)) ? Number(weight) : 400;

  const panel = matchPanelFace(family, w, italic, codePoint);
  if (panel) {
    const key = `panel:${panel.face.file}`;
    const font = await fontFromLoader(key, () => readUrl(bundledFontUrl(panel.face.file)));
    const variable = !!font.variationAxes?.wght;
    return {
      font,
      key,
      variable,
      synthesizedItalic: panel.synthesizedItalic,
      // A static cut asked for a weight it does not have is emboldened by the browser past 600.
      synthesizedBold: !variable && w >= 600 && panel.face.weight[1] < 600,
    };
  }

  const stored = storedFace(family, w, italic, codePoint);
  if (stored) {
    const key = `stored:${stored.id}`;
    const font = await fontFromLoader(key, async () => {
      if (stored.dataUrl) return dataUrlBuffer(stored.dataUrl);
      const bytes = await externalSources.readFile?.(stored.filePath);
      if (!bytes) throw new FontUnavailableError(family, 'its file could not be read');
      return bytes;
    });
    return { font, key, variable: !!font.variationAxes?.wght, synthesizedItalic: italic === 'italic' && stored.style !== 'italic', synthesizedBold: false };
  }

  // Where no file can be read — the player has no imported fonts — a combined shape may carry the
  // glyphs of its text's face with it (see glyphAtlas below).
  const atlas = atlasFor(family, w, italic);
  if (atlas) {
    if (!atlas.font.covers(codePoint)) {
      throw new FontUnavailableError(family, `the character ${String.fromCodePoint(codePoint)} is not among the glyphs this shape carries`);
    }
    return { font: atlas.font, key: atlas.key, variable: false, synthesizedItalic: atlas.synthesizedItalic, synthesizedBold: atlas.synthesizedBold };
  }

  const windowsFile = externalSources.readFile ? windowsFontFile(family, w, italic) : null;
  if (windowsFile) {
    try {
      const font = await fontFromLoader(`system:${windowsFile}`, async () => {
        const bytes = await externalSources.readFile(windowsFile);
        if (!bytes) throw new Error('missing');
        return bytes;
      });
      return { font, key: `system:${windowsFile}`, variable: false, synthesizedItalic: false, synthesizedBold: false };
    } catch { /* fall through */ }
  }

  const local = await queryLocalFont(family, w, italic);
  if (local) {
    const font = await fontFromLoader(local.key, local.load);
    return { font, key: local.key, variable: !!font.variationAxes?.wght, synthesizedItalic: false, synthesizedBold: false };
  }

  const twin = METRIC_TWINS[family.toLowerCase()];
  if (twin) {
    const cut = `${w >= 600 ? 'bold' : ''}${w >= 600 && italic === 'italic' ? '-' : ''}${italic === 'italic' ? 'italic' : ''}` || 'regular';
    const file = `liberation-${twin}-${cut}`;
    const key = `twin:${file}`;
    const font = await fontFromLoader(key, () => readUrl(bundledFontUrl(file)));
    return { font, key, variable: false, synthesizedItalic: false, synthesizedBold: false, metricTwin: true };
  }

  throw new FontUnavailableError(family, 'it is a system font the editor cannot read here; pick one of the panel fonts or import the font file');
}

/**
 * The font instanced at a weight: a variable font at its `wght` axis (fontkit's own variation
 * machinery, glyph outlines and advances both), a static font as it is.
 */
const instanceCache = new Map();
export function fontAtWeight(resolved, weight) {
  if (!resolved.variable) return resolved.font;
  const axis = resolved.font.variationAxes.wght;
  const w = Math.max(axis.min, Math.min(axis.max, Number(weight) || axis.default));
  const key = `${resolved.key}@${w}`;
  if (!instanceCache.has(key)) instanceCache.set(key, resolved.font.getVariation({ wght: w }));
  return instanceCache.get(key);
}

/**
 * The file behind a resolved font, as TrueType/OpenType bytes, or null for one that has no file here
 * (a glyph atlas). For code that has to hand the face on — utils/svgArtworkFonts.js embeds it.
 */
export function fontFileBytes(resolved) {
  return sfntCache.get(resolved?.key) ?? null;
}

/** For the tests: forget parsed fonts (and registered glyph atlases). */
export function clearFontCache() {
  fontCache.clear();
  sfntCache.clear();
  instanceCache.clear();
  atlases.clear();
  atlasMemo.clear();
}

// --- Glyph atlases: a face's outlines carried in the document -------------------------------------
//
// The player loads the panel faces and nothing else, so text in a font the user imported cannot be
// outlined there: a combined shape whose text a binding changes at run time kept the outline it
// was saved with. An atlas is the part of a face such text can need — the outlines and advances of
// printable Latin, and the kerning between the ASCII ones — small enough to travel in the shape's
// cache. It shapes plainly: kerning, no ligatures or contextual forms, which is what a font with
// letter-spacing gets anyway, and within a hair of the real layout otherwise.

export { ATLAS_CHARACTERS };

const atlases = new Map();
const atlasId = (family, weight, style) => `${String(family).toLowerCase()}|${weight}|${style}`;

function commandsFrom(path) {
  const names = { M: 'moveTo', L: 'lineTo', Q: 'quadraticCurveTo', C: 'bezierCurveTo', Z: 'closePath' };
  const out = [];
  for (const [, letter, body] of String(path).matchAll(/([MLQCZ])([^MLQCZ]*)/g)) {
    out.push({ command: names[letter], args: body.trim() ? body.trim().split(/\s+/).map(Number) : [] });
  }
  return out;
}

/**
 * The atlas of a resolved face at a weight: `{ family, weight, style, unitsPerEm, ascent, descent,
 * synthesizedItalic, synthesizedBold, glyphs: { codePoint: [advance, path] }, kern: { 'a,b': dx } }`,
 * in font units. `extra` adds characters beyond printable Latin (the text as it is now).
 */
const atlasMemo = new Map();
export function glyphAtlas(resolved, { family, weight = 400, style = 'normal' }, extra = []) {
  const memoKey = `${resolved.key}@${weight}`;
  if (!atlasMemo.has(memoKey)) atlasMemo.set(memoKey, buildAtlas(resolved, { family, weight, style }));
  const base = atlasMemo.get(memoKey);
  const font = fontAtWeight(resolved, weight);
  const missing = extra.filter((cp) => !base.glyphs[cp] && font.hasGlyphForCodePoint?.(cp));
  if (!missing.length) return base;
  const glyphs = { ...base.glyphs };
  for (const cp of missing) {
    const glyph = font.glyphForCodePoint(cp);
    glyphs[cp] = [Math.round(glyph.advanceWidth * 10) / 10, unitsPath(glyph.path.commands)];
  }
  return { ...base, glyphs };
}

function atlasMeta(resolved, { family, weight, style }) {
  return {
    family: primaryFamily(family), weight: Number(weight) || 400, style,
    synthesizedItalic: !!resolved.synthesizedItalic, synthesizedBold: !!resolved.synthesizedBold,
  };
}

function buildAtlas(resolved, spec) {
  return atlasFromFont(fontAtWeight(resolved, spec.weight), atlasMeta(resolved, spec));
}

/**
 * glyphAtlas, with the expensive part — laying out every ASCII pair to read its kerning, about half a
 * second for one face — done in the font worker (utils/fontWorkerClient.js) instead of on the page.
 * The result is the same object glyphAtlas returns, and is remembered the same way, so a later
 * synchronous glyphAtlas call for the face is free. Falls back to building here where there is no
 * worker (the tests, the player) or the worker cannot start.
 */
export async function glyphAtlasAsync(resolved, spec, extra = []) {
  const { weight = 400, style = 'normal' } = spec;
  const memoKey = `${resolved.key}@${weight}`;
  const sfnt = sfntCache.get(resolved.key);
  if (!atlasMemo.has(memoKey) && sfnt) {
    const { buildAtlasInWorker } = await import('./fontWorkerClient.js');
    const meta = atlasMeta(resolved, { ...spec, weight, style });
    const built = await buildAtlasInWorker(sfnt, meta, resolved.variable ? weight : null);
    if (built && !atlasMemo.has(memoKey)) atlasMemo.set(memoKey, built);
  }
  return glyphAtlas(resolved, spec, extra);
}

/** A font-like object over an atlas: the part of fontkit's interface textOutline uses. */
function atlasFont(atlas) {
  const parsed = new Map();
  const glyph = (cp) => {
    if (!parsed.has(cp)) {
      const entry = atlas.glyphs[cp];
      parsed.set(cp, entry ? { advanceWidth: entry[0], path: { commands: commandsFrom(entry[1]) }, codePoints: [cp] } : null);
    }
    return parsed.get(cp);
  };
  return {
    unitsPerEm: atlas.unitsPerEm,
    ascent: atlas.ascent,
    descent: atlas.descent,
    covers: (cp) => !!atlas.glyphs[cp],
    layout(text) {
      const cps = [...String(text)].map((char) => char.codePointAt(0)).filter((cp) => atlas.glyphs[cp]);
      const glyphs = cps.map(glyph);
      const positions = cps.map((cp, i) => ({
        xAdvance: glyphs[i].advanceWidth + (i + 1 < cps.length ? (atlas.kern[`${cp},${cps[i + 1]}`] ?? 0) : 0),
        xOffset: 0,
        yOffset: 0,
      }));
      return { glyphs, positions };
    },
  };
}

/** Make an atlas available to resolveFont (the player does this for every shape that carries one). */
export function registerGlyphAtlas(atlas) {
  if (!atlas?.glyphs || !atlas.unitsPerEm) return;
  const id = atlasId(atlas.family, atlas.weight, atlas.style);
  if (atlases.has(id)) return;
  atlases.set(id, {
    ...atlas,
    key: `atlas:${id}`,
    font: atlasFont(atlas),
  });
}

function atlasFor(family, weight, style) {
  const exact = atlases.get(atlasId(family, weight, style));
  if (exact) return exact;
  const key = String(family).toLowerCase();
  const same = [...atlases.values()].filter((a) => a.family.toLowerCase() === key && a.style === style);
  return same.sort((a, b) => Math.abs(a.weight - weight) - Math.abs(b.weight - weight))[0] ?? null;
}

/** True for a face the player cannot read for itself (anything but the bundled panel faces and twins). */
export function needsAtlas(resolved) {
  return !/^(panel|twin|atlas):/.test(String(resolved?.key ?? ''));
}
