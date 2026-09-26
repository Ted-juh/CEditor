// The Custom scene's call list: one Lua call per line, a function name then its payload.
//
//   set_values 1 10 64 127 0x7f        numbers, decimal or 0x hex, each one byte
//   set_labels s"TITLE" s"one" s""     s"…" is a length-prefixed string, the labels' encoding
//   set_text "raw"                     "…" is the bytes alone, no length
//
// Lines that are blank or start with -- are skipped, so a list can be commented like the Lua.

export function parseCalls(source) {
  const calls = [];
  const lines = String(source ?? '').split(/\r?\n/);
  lines.forEach((raw, index) => {
    const line = raw.trim();
    if (!line || line.startsWith('--')) return;
    const name = line.match(/^[A-Za-z_][A-Za-z0-9_]*/)?.[0];
    if (!name) throw new Error(`line ${index + 1}: expected a function name`);
    calls.push({ name, bytes: parseBytes(line.slice(name.length), index + 1) });
  });
  return calls;
}

function parseBytes(text, lineNumber) {
  const bytes = [];
  const token = /\s*(?:(s?)"((?:[^"\\]|\\.)*)"|(0x[0-9a-fA-F]+|\d+))\s*,?/y;
  let at = 0;
  while (at < text.length) {
    if (/^\s*$/.test(text.slice(at))) break;
    token.lastIndex = at;
    const m = token.exec(text);
    if (!m) throw new Error(`line ${lineNumber}: cannot read "${text.slice(at).trim()}"`);
    at = token.lastIndex;
    if (m[3] !== undefined) {
      const value = Number(m[3]);
      if (value > 255) throw new Error(`line ${lineNumber}: ${m[3]} does not fit in a byte`);
      bytes.push(value);
      continue;
    }
    const chars = [...new TextEncoder().encode(m[2].replace(/\\(.)/g, '$1'))].map((b) => (b < 0x80 ? b : 0x3f));
    if (m[1] === 's') {
      if (chars.length > 255) throw new Error(`line ${lineNumber}: a length-prefixed string holds 255 bytes`);
      bytes.push(chars.length);
    }
    bytes.push(...chars);
  }
  return bytes;
}
