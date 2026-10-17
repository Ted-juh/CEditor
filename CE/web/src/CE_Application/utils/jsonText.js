// jsonText.js — JSON for a person to read and type: laid out compactly, and its mistakes located.
//
// formatJson lays a value out the way someone would by hand: an object or a list that fits on one
// line stays on one (`"Transform": { "x": 28, "y": 118, "width": 120, "height": 53 }`), anything
// longer is broken over lines, one entry each, indented two spaces. JSON.stringify(value, null, 2)
// gives every number of a coordinate its own line, which doubled the length of a control and made
// the short sections the hardest to read. The text parses back to exactly the value it was made
// from, key order included.
//
// jsonSyntaxError says where a text stops being JSON, as a line and column. JSON.parse says so in
// V8 (WebView2, Node) and does not in JavaScriptCore (the Linux webview), whose message is only
// "JSON Parse error: Expected '}'". A text a person is typing needs the line on every platform, so
// this scans for it itself; it runs only when JSON.parse has already refused the text.

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** `value` as JSON (JSON's own rules for what is kept), laid out to fit `width` columns. */
export function formatJson(value, { width = 80 } = {}) {
  const json = JSON.stringify(value);
  if (json === undefined) return '';
  return render(JSON.parse(json), 0, 0, width);
}

function inline(value) {
  if (Array.isArray(value)) return value.length ? `[${value.map(inline).join(', ')}]` : '[]';
  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    return entries.length ? `{ ${entries.map(([k, v]) => `${JSON.stringify(k)}: ${inline(v)}`).join(', ')} }` : '{}';
  }
  return JSON.stringify(value);
}

// `used` is how many columns the line has before the value: its indent and its key.
function render(value, depth, used, width) {
  if (!Array.isArray(value) && !isPlainObject(value)) return JSON.stringify(value);
  const flat = inline(value);
  // The outermost value always opens up: a control written on one line is no easier to read than
  // the file was.
  if (depth > 0 && used + flat.length <= width) return flat;
  const pad = '  '.repeat(depth + 1);
  const close = '  '.repeat(depth);
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    const items = value.map((item) => pad + render(item, depth + 1, pad.length, width));
    return `[\n${items.join(',\n')}\n${close}]`;
  }
  const entries = Object.entries(value);
  if (!entries.length) return '{}';
  const lines = entries.map(([key, item]) => {
    const head = `${pad}${JSON.stringify(key)}: `;
    return head + render(item, depth + 1, head.length, width);
  });
  return `{\n${lines.join(',\n')}\n${close}}`;
}

/**
 * Where `text` stops being JSON: `{ message, line, col, index }` (line and col from 1), or null when
 * it is JSON. The first mistake only, as a parser would report it.
 */
export function jsonSyntaxError(text) {
  const src = String(text ?? '');
  let i = 0;

  const fail = (message, at = i) => {
    const before = src.slice(0, at);
    const line = before.split('\n').length;
    const col = at - before.lastIndexOf('\n');
    return { message, line, col, index: at };
  };
  const describe = (at) => (at >= src.length ? 'the end of the text' : `${JSON.stringify(src[at])}`);
  const space = () => { while (i < src.length && ' \t\n\r'.includes(src[i])) i++; };

  // Each returns an error, or null having moved past what it read.
  function value() {
    space();
    const c = src[i];
    if (c === '{') return object();
    if (c === '[') return array();
    if (c === '"') return string();
    if (c === '-' || (c >= '0' && c <= '9')) return number();
    for (const word of ['true', 'false', 'null']) {
      if (src.startsWith(word, i)) { i += word.length; return null; }
    }
    if (c === "'") return fail('Strings are written in double quotes: "like this"');
    if (c === '}' || c === ']' || c === ',') return fail(`Expected a value before ${describe(i)}`);
    return fail(`Expected a value, found ${describe(i)}`);
  }

  function object() {
    i++;
    space();
    if (src[i] === '}') { i++; return null; }
    for (;;) {
      space();
      if (src[i] === '}') return fail('A comma before "}" leaves nothing after it: remove the comma');
      if (src[i] !== '"') {
        return src[i] === "'" ? fail('Property names are written in double quotes: "like this"')
          : fail(`Expected a property name in double quotes, found ${describe(i)}`);
      }
      const err = string();
      if (err) return err;
      space();
      if (src[i] !== ':') return fail(`Expected ":" after the property name, found ${describe(i)}`);
      i++;
      const inner = value();
      if (inner) return inner;
      space();
      if (src[i] === ',') { i++; continue; }
      if (src[i] === '}') { i++; return null; }
      return fail(`Expected "," or "}" after a property, found ${describe(i)}`);
    }
  }

  function array() {
    i++;
    space();
    if (src[i] === ']') { i++; return null; }
    for (;;) {
      space();
      if (src[i] === ']') return fail('A comma before "]" leaves nothing after it: remove the comma');
      const inner = value();
      if (inner) return inner;
      space();
      if (src[i] === ',') { i++; continue; }
      if (src[i] === ']') { i++; return null; }
      return fail(`Expected "," or "]" after an item, found ${describe(i)}`);
    }
  }

  function string() {
    const start = i;
    i++;
    while (i < src.length) {
      const c = src[i];
      if (c === '"') { i++; return null; }
      if (c === '\n') return fail('A string ends at the end of its line: close it with "', start);
      if (c === '\\') {
        const next = src[i + 1];
        if (next === 'u') {
          if (!/^[0-9a-fA-F]{4}$/.test(src.slice(i + 2, i + 6))) return fail('"\\u" takes four hex digits');
          i += 6;
          continue;
        }
        if (!next || !'"\\/bfnrt'.includes(next)) return fail(`"\\${next ?? ''}" is not an escape JSON knows`);
        i += 2;
        continue;
      }
      if (c < ' ') return fail('A control character inside a string has to be escaped');
      i++;
    }
    return fail('This string is never closed', start);
  }

  function number() {
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(src.slice(i));
    if (!match) return fail(`Expected a number, found ${describe(i)}`);
    i += match[0].length;
    if (/[0-9A-Za-z_.]/.test(src[i] ?? '')) return fail(`Unexpected ${describe(i)} after the number`);
    return null;
  }

  const err = value();
  if (err) return err;
  space();
  if (i < src.length) return fail(`Unexpected ${describe(i)} after the end of the value`);
  return null;
}

/**
 * The multi-line objects and lists of a JSON text, for the editor's folding gutter:
 * [{ startLine, endLine }] (from 1), one per opening line, outermost first. Brackets inside strings
 * do not count. A text that does not balance gives what balanced before the mistake.
 */
export function jsonFoldRegions(text) {
  const src = String(text ?? '');
  const out = [];
  const stack = [];
  let line = 1;
  let inString = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '\n') { line++; continue; }
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '{' || c === '[') stack.push(line);
    else if (c === '}' || c === ']') {
      const start = stack.pop();
      if (start != null && line > start) out.push({ startLine: start, endLine: line });
    }
  }
  const byStart = new Map();
  for (const region of out) {
    const prev = byStart.get(region.startLine);
    if (!prev || region.endLine > prev.endLine) byStart.set(region.startLine, region);
  }
  return [...byStart.values()].sort((a, b) => a.startLine - b.startLine);
}
