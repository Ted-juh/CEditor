/**
 * pdfGuard.js — what in a PDF would make pdf.js run out of memory, found before pdf.js reads it.
 *
 *   pdfHazard(bytes)  →  '' | what is wrong, said plainly
 *
 * pdf.js reads PDFs in the editor's own page, so a file that makes it allocate without end takes the
 * page down with it, and whatever was not saved. Two such files are in pdf.js's own tests, fixed in
 * pdf.js after the release the editor carries: a PostScript (Type 4) function that is not a valid
 * program (`{+}`), and an embedded TrueType font whose format 12 character map claims every code
 * there is. Neither is in a file a program writes; both are refused with what is wrong, where they
 * crashed the import.
 *
 * Streams are found in the file's own bytes: a function's stream, and a font file a font descriptor
 * points to (FontFile2), its object written out (not packed in an object stream). Compressed ones
 * are inflated. What is not found is not checked: this is a guard, not a PDF reader.
 */
import { inflateSync, unzlibSync } from 'fflate';

const latin1 = (bytes, from, to) => {
  let text = '';
  for (let i = from; i < to; i += 1) text += String.fromCharCode(bytes[i]);
  return text;
};

/** Each `N G obj << ... >> stream` in the file: `{ number, dict, data }`, the data as stored. */
function* streams(bytes, text) {
  const objectAt = /(\d+)\s+\d+\s+obj\b/g;
  let match;
  while ((match = objectAt.exec(text))) {
    const start = match.index + match[0].length;
    const streamAt = text.indexOf('stream', start);
    const endObj = text.indexOf('endobj', start);
    if (streamAt < 0 || (endObj >= 0 && endObj < streamAt)) continue;
    const dict = text.slice(start, streamAt);
    let from = streamAt + 6;
    if (text[from] === '\r') from += 1;
    if (text[from] === '\n') from += 1;
    // A direct length (an indirect one, `/Length 31 0 R`, is not: the stream ends at endstream).
    const length = /\/Length\s+(\d+)\b(?!\s+\d+\s+R)/.exec(dict);
    const to = length ? Math.min(bytes.length, from + Number(length[1])) : text.indexOf('endstream', from);
    if (to < from) continue;
    yield { number: Number(match[1]), dict, data: bytes.subarray(from, to) };
    objectAt.lastIndex = to;
  }
}

/** A stream's data decoded, for the one filter it may carry here (Flate), or null. */
function decoded(stream) {
  const filter = /\/Filter\s*(\[\s*)?\/(\w+)/.exec(stream.dict)?.[2];
  if (!filter) return stream.data;
  if (filter !== 'FlateDecode' && filter !== 'Fl') return null;
  try {
    return unzlibSync(stream.data);
  } catch {
    try { return inflateSync(stream.data); } catch { return null; }
  }
}

// PostScript calculator operators (PDF 32000, 7.10.5), and how many values each takes and gives.
const OPERATORS = {
  abs: [1, 1], add: [2, 1], atan: [2, 1], ceiling: [1, 1], cos: [1, 1], cvi: [1, 1], cvr: [1, 1],
  div: [2, 1], exp: [2, 1], floor: [1, 1], idiv: [2, 1], ln: [1, 1], log: [1, 1], mod: [2, 1],
  mul: [2, 1], neg: [1, 1], round: [1, 1], sin: [1, 1], sqrt: [1, 1], sub: [2, 1], truncate: [1, 1],
  and: [2, 1], bitshift: [2, 1], eq: [2, 1], false: [0, 1], ge: [2, 1], gt: [2, 1], le: [2, 1],
  lt: [2, 1], ne: [2, 1], not: [1, 1], or: [2, 1], true: [0, 1], xor: [2, 1],
  dup: [1, 2], exch: [2, 2], pop: [1, 0],
};

/**
 * Whether a Type 4 function's program can be run: every token an operator or a number, braces
 * matched, and no operator taking more values than the stack holds (counted from `inputs`). `copy`,
 * `index` and `roll` take a count from the stack, and are taken to be right.
 */
export function postScriptRuns(code, inputs) {
  const tokens = String(code).replace(/%[^\n\r]*/g, ' ').match(/[{}]|[^\s{}]+/g) ?? [];
  let at = 0;
  const number = (token) => /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(token);
  // A procedure from `{` to its `}`, run from `depth` values: the depth it leaves, or null where it
  // cannot run. A brace inside is the branch of an if or ifelse: run after the condition is taken.
  const procedure = (depth) => {
    let d = depth;
    let blocks = [];
    while (at < tokens.length) {
      const token = tokens[at];
      at += 1;
      if (token === '}') return d;
      if (token === '{') {
        if (d < 1) return null;
        const end = procedure(d - 1);
        if (end == null) return null;
        blocks.push(end - (d - 1));
        continue;
      }
      if (number(token)) { d += 1; continue; }
      if (token === 'if' || token === 'ifelse') {
        const need = token === 'if' ? 1 : 2;
        if (blocks.length < need || d < 1) return null;
        const taken = blocks.slice(-need);
        blocks = [];
        d = d - 1 + (token === 'if' ? Math.max(0, taken[0]) : Math.max(taken[0], taken[1]));
        continue;
      }
      if (token === 'copy' || token === 'index' || token === 'roll') {
        // A count from the stack (and for roll, a shift): what they give back is taken to be right.
        if (d < (token === 'roll' ? 2 : 1)) return null;
        if (token === 'roll') d -= 2;
        continue;
      }
      const arity = OPERATORS[token];
      if (!arity || d < arity[0]) return null;
      d += arity[1] - arity[0];
    }
    return null; // no closing brace
  };
  if (tokens[0] !== '{') return false;
  at = 1;
  return procedure(inputs) != null;
}

/** Whether an embedded TrueType font's format 12 or 13 character map claims an absurd range. */
export function fontMapRuns(font) {
  if (!font || font.length < 12) return true;
  const view = new DataView(font.buffer, font.byteOffset, font.byteLength);
  const tables = view.getUint16(4);
  for (let t = 0; t < tables; t += 1) {
    const entry = 12 + t * 16;
    if (entry + 16 > font.length) return true;
    if (latin1(font, entry, entry + 4) !== 'cmap') continue;
    const cmap = view.getUint32(entry + 8);
    if (cmap + 4 > font.length) return true;
    const subtables = view.getUint16(cmap + 2);
    for (let s = 0; s < subtables; s += 1) {
      const record = cmap + 4 + s * 8;
      if (record + 8 > font.length) return true;
      const at = cmap + view.getUint32(record + 4);
      if (at + 16 > font.length) continue;
      const format = view.getUint16(at);
      if (format !== 12 && format !== 13) continue;
      const groups = view.getUint32(at + 12);
      if (groups > 0x110000) return false;
      for (let g = 0; g < groups && at + 16 + g * 12 + 12 <= font.length; g += 1) {
        const start = view.getUint32(at + 16 + g * 12);
        const end = view.getUint32(at + 16 + g * 12 + 4);
        // Unicode ends at 10FFFF: a group past it, or backwards, is no character map.
        if (end < start || end > 0x10ffff) return false;
      }
    }
  }
  return true;
}

/** What in `bytes` would make pdf.js run out of memory, said plainly; '' where nothing was found. */
export function pdfHazard(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const text = latin1(view, 0, Math.min(view.length, 64 * 1024 * 1024));
  const fontFiles = new Set([...text.matchAll(/\/FontFile2\s+(\d+)\s+\d+\s+R/g)].map((m) => Number(m[1])));
  const hasFunctions = /\/FunctionType\s+4\b/.test(text);
  if (!fontFiles.size && !hasFunctions) return '';
  for (const stream of streams(view, text)) {
    const isFunction = /\/FunctionType\s+4\b/.test(stream.dict);
    if (!isFunction && !fontFiles.has(stream.number)) continue;
    const data = decoded(stream);
    if (!data) continue;
    if (isFunction) {
      // Only a program is judged: data that does not read as one was not decoded right here.
      if (!latin1(data, 0, Math.min(data.length, 64)).trim().startsWith('{')) continue;
      const domain = /\/Domain\s*\[([^\]]*)\]/.exec(stream.dict)?.[1].trim().split(/\s+/).length ?? 2;
      if (!postScriptRuns(latin1(data, 0, data.length), Math.max(1, Math.floor(domain / 2)))) {
        return 'a colour function in it is not a program that can be run';
      }
    } else if (!fontMapRuns(data)) {
      return 'a font in it is damaged (its character map covers more codes than there are)';
    }
  }
  return '';
}
