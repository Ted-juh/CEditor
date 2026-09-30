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
 *   2. the fonts the user imported (Settings → Fonts: a local file or a cached Google face);
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

/** Parse (and cache) a font file into a fontkit font. */
async function fontFromLoader(key, load) {
  if (!fontCache.has(key)) {
    fontCache.set(key, (async () => {
      const fontkit = await loadFontkit();
      const sfnt = await toSfnt(await load());
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

function storedFace(family, weight, style) {
  const key = family.toLowerCase();
  const fonts = (externalSources.storedFonts?.() ?? []).filter((font) => font?.enabled !== false
    && (String(font.family ?? '').toLowerCase() === key || String(font.cssFamily ?? '').toLowerCase() === key));
  const faces = [];
  for (const font of fonts) {
    if (Array.isArray(font.cachedFaces) && font.cachedFaces.length) {
      for (const face of font.cachedFaces) {
        faces.push({ id: `${font.id}:${face.weight}:${face.style}:${face.unicodeRange ?? ''}`, weight: parseWeight(face.weight), style: face.style || 'normal', dataUrl: face.dataUrl });
      }
    } else if (font.localDataUrl || font.filePath) {
      faces.push({ id: font.id, weight: parseWeight(font.staticWeight), style: font.fontStyle || 'normal', dataUrl: font.localDataUrl, filePath: font.filePath });
    }
  }
  if (!faces.length) return null;
  const wantItalic = style === 'italic';
  const styled = faces.filter((face) => (face.style === 'italic') === wantItalic);
  const pool = styled.length ? styled : faces;
  return [...pool].sort((a, b) => Math.abs(a.weight - weight) - Math.abs(b.weight - weight))[0];
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

  const stored = storedFace(family, w, italic);
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

/** For the tests: forget parsed fonts. */
export function clearFontCache() {
  fontCache.clear();
  instanceCache.clear();
}
