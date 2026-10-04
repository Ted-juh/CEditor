/**
 * fontSubset.js — a carried font cut down to the characters a panel can show.
 *
 * utils/documentFonts.js carries the imported faces a panel names, so the player and whoever the panel
 * is shared with draw in them. A whole font file is mostly glyphs the panel never shows: Liberation
 * Sans is 2,620 glyphs in 144 KB of WOFF2 (411 KB as TrueType), and a CJK face is megabytes;
 * cut and recompressed it is 25 KB. This keeps the characters the panel
 * can plausibly draw and drops the rest.
 *
 * WHY HARFBUZZ. fontkit can subset too, but its subsetter writes the outline tables alone: kerning,
 * ligatures and a variable font's axes are dropped, so a label would lay out one way in the editor
 * and another in the player. HarfBuzz's hb-subset (harfbuzzjs, MIT, the same library browsers shape
 * text with) keeps the layout tables and variations for the glyphs it keeps — a kerned string
 * measures identically before and after (test/fontSubset.test.js). Its WebAssembly is loaded only
 * here, only when a panel is packaged, never in the player.
 *
 * WHAT IS KEPT: printable ASCII, Latin-1 and Latin Extended-A, general punctuation and the euro sign,
 * and every character that appears anywhere in the panel's own strings — text, option lists,
 * scripts — so a caption a script writes from a literal is covered. Text a script builds from
 * characters the panel never contains (a user typing Greek into a text field, say) falls back per
 * character to another face, as the browser does for any glyph a font lacks.
 *
 * The result is compressed to WOFF2. A face that fails to subset, or would not get meaningfully
 * smaller, is carried whole.
 */

const BASE_RANGES = [[0x20, 0x7e], [0xa0, 0x17f], [0x2000, 0x206f], [0x20ac, 0x20ac]];

/** The characters a panel can show: the base ranges plus every character in its own strings. */
export function panelCharacters(panel) {
  const set = new Set();
  for (const [start, end] of BASE_RANGES) for (let cp = start; cp <= end; cp += 1) set.add(cp);
  const walk = (node) => {
    if (typeof node === 'string') {
      if (node.startsWith('data:')) return;
      for (const char of node) set.add(char.codePointAt(0));
      return;
    }
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (!node || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      if (key === 'fonts') continue;
      walk(value);
    }
  };
  walk(panel);
  return [...set].filter((cp) => cp >= 0x20);
}

let harfbuzz = null;
async function loadHarfbuzz() {
  if (!harfbuzz) {
    harfbuzz = (async () => {
      let bytes;
      if (typeof window === 'undefined' && typeof process !== 'undefined' && process.versions?.node) {
        const fsModule = 'node:fs/promises';
        const { readFile } = await import(/* @vite-ignore */ fsModule);
        const wasmPath = 'harfbuzzjs/dist/harfbuzz-subset.wasm';
        bytes = await readFile(new URL(import.meta.resolve(wasmPath)));
      } else {
        const { default: url } = await import('harfbuzzjs/dist/harfbuzz-subset.wasm?url');
        const response = await fetch(url);
        if (!response.ok) throw new Error(`harfbuzz fetch failed: ${response.status}`);
        bytes = await response.arrayBuffer();
      }
      const { instance } = await WebAssembly.instantiate(bytes, {});
      return instance.exports;
    })();
  }
  try {
    return await harfbuzz;
  } catch (error) {
    harfbuzz = null;
    throw error;
  }
}

/** hb-subset: an sfnt (TrueType / OpenType bytes) cut to `codePoints`, or null if HarfBuzz refuses it. */
export async function subsetSfnt(sfnt, codePoints) {
  const hb = await loadHarfbuzz();
  const bytes = sfnt instanceof Uint8Array ? sfnt : new Uint8Array(sfnt);
  const pointer = hb.malloc(bytes.length);
  new Uint8Array(hb.memory.buffer).set(bytes, pointer);
  const HB_MEMORY_MODE_WRITABLE = 2;
  const blob = hb.hb_blob_create(pointer, bytes.length, HB_MEMORY_MODE_WRITABLE, 0, 0);
  const face = hb.hb_face_create(blob, 0);
  hb.hb_blob_destroy(blob);
  const input = hb.hb_subset_input_create_or_fail();
  let result = null;
  try {
    if (!input) return null;
    const unicodes = hb.hb_subset_input_unicode_set(input);
    for (const cp of codePoints) hb.hb_set_add(unicodes, cp);
    const subset = hb.hb_subset_or_fail(face, input);
    if (subset) {
      const out = hb.hb_face_reference_blob(subset);
      const offset = hb.hb_blob_get_data(out, 0);
      const length = hb.hb_blob_get_length(out);
      // Read after the call: the module's memory may have grown, detaching any earlier view.
      if (length > 0) result = new Uint8Array(hb.memory.buffer).slice(offset, offset + length);
      hb.hb_blob_destroy(out);
      hb.hb_face_destroy(subset);
    }
  } finally {
    if (input) hb.hb_subset_input_destroy(input);
    hb.hb_face_destroy(face);
    hb.free(pointer);
  }
  return result;
}

function dataUrlBytes(dataUrl) {
  const text = String(dataUrl ?? '');
  const comma = text.indexOf(',');
  if (comma < 0 || !text.slice(0, comma).includes(';base64')) return null;
  const binary = atob(text.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesDataUrl(bytes, mime) {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return `data:${mime};base64,${btoa(binary)}`;
}

const isWoff2 = (bytes) => bytes[0] === 0x77 && bytes[1] === 0x4f && bytes[2] === 0x46 && bytes[3] === 0x32;
const isWoff = (bytes) => bytes[0] === 0x77 && bytes[1] === 0x4f && bytes[2] === 0x46 && bytes[3] === 0x46;

/**
 * A carried face's data URL, subset to `codePoints` and compressed to WOFF2 — or the original, when
 * it cannot be read, subset or made at least a tenth smaller. Never throws: carrying the whole font
 * is always a correct answer, only a larger one.
 */
export async function subsetFontDataUrl(dataUrl, codePoints) {
  try {
    const bytes = dataUrlBytes(dataUrl);
    if (!bytes || bytes.length < 4 || isWoff(bytes)) return dataUrl;
    const { compress, decompress } = await import('woff2-encoder');
    const sfnt = isWoff2(bytes) ? await decompress(bytes) : bytes;
    const subset = await subsetSfnt(sfnt, codePoints);
    if (!subset) return dataUrl;
    const packed = await compress(subset);
    const next = bytesDataUrl(packed, 'font/woff2');
    return next.length <= dataUrl.length * 0.9 ? next : dataUrl;
  } catch (error) {
    console.warn('[fontSubset] carrying the whole font', error);
    return dataUrl;
  }
}
