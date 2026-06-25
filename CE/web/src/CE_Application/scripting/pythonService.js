// pythonService.js — lightweight editor language intelligence for Python scripts.
//
// Python runs live in the WebView via Pyodide (panelRuntime), but there is no JS-side CPython
// parser for the editor. Rather than ship one, this derives the editor essentials with a
// string/comment-blanking scanner + structural heuristics:
//   • diagnostics — unbalanced brackets and compound headers missing their ':' (the two most
//     common typos), with line/offset for squiggles + the Problems panel
//   • symbols     — def / class / top-level assignments → completion, go-to-def, hover, sig-help
//   • folding     — indentation-based block regions
//
// Heuristic by design (no false-precision): it catches the frequent mistakes and never throws.

const COMPOUND = /^(?:if|elif|else|for|while|with|try|except|finally|def|class|async\s+def|async\s+for|async\s+with)\b/;

function lineOffsets(src) {
  const offs = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === '\n') offs.push(i + 1);
  return offs;
}
function lineOf(src, index) { return src.slice(0, Math.max(0, index)).split('\n').length; }

// Replace string and comment characters with spaces, preserving newlines and offsets, so the
// structural scans below never trip over brackets/colons that live inside strings or comments.
function blankCode(src) {
  let out = ''; let i = 0; const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '#') { while (i < n && src[i] !== '\n') { out += ' '; i++; } continue; }
    if (c === '"' || c === "'") {
      const triple = src.substr(i, 3) === c + c + c;
      const q = triple ? c + c + c : c;
      out += ' '.repeat(q.length); i += q.length;
      while (i < n) {
        if (!triple && src[i] === '\n') break;                 // unterminated single-line string
        if (src.substr(i, q.length) === q) { out += ' '.repeat(q.length); i += q.length; break; }
        out += src[i] === '\n' ? '\n' : ' '; i++;
      }
      continue;
    }
    out += c; i++;
  }
  return out;
}

// Group physical lines into logical lines (joined across open brackets and `\` continuations).
function logicalLines(blanked) {
  const lines = blanked.split('\n'); const out = [];
  let i = 0;
  while (i < lines.length) {
    const startLine = i + 1; let text = ''; let depth = 0;
    for (;;) {
      const raw = lines[i] ?? '';
      for (const ch of raw) { if ('([{'.includes(ch)) depth++; else if (')]}'.includes(ch)) depth = Math.max(0, depth - 1); }
      const cont = depth > 0 || /\\\s*$/.test(raw);
      text += raw + ' '; i++;
      if (!cont || i >= lines.length) break;
    }
    if (text.trim()) out.push({ line: startLine, text });
  }
  return out;
}

function hasTopLevelColon(text) {
  let depth = 0;
  for (const ch of text) {
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth = Math.max(0, depth - 1);
    else if (ch === ':' && depth === 0) return true;
  }
  return false;
}

function collectSymbols(src, offs) {
  const syms = []; const lines = src.split('\n');
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]; let m;
    if ((m = /^(\s*)(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(([^)]*)\)/.exec(line))) {
      syms.push({ name: m[2], kind: 'function', detail: `${m[2]}(${m[3].trim()})`, line: li + 1, col: 0, index: (offs[li] ?? 0) + line.indexOf(m[2]) });
    } else if ((m = /^(\s*)class\s+([A-Za-z_]\w*)/.exec(line))) {
      syms.push({ name: m[2], kind: 'class', detail: `class ${m[2]}`, line: li + 1, col: 0, index: (offs[li] ?? 0) + line.indexOf(m[2]) });
    } else if ((m = /^([A-Za-z_]\w*)\s*(?::[^=]+)?=(?!=)/.exec(line))) {
      syms.push({ name: m[1], kind: 'variable', detail: m[1], line: li + 1, col: 0, index: offs[li] ?? 0 });
    }
  }
  return syms;
}

/** Editor analysis for Python → { diagnostics, symbols }. Never throws. */
export function analyzePython(source) {
  const src = String(source ?? '');
  if (!src.trim()) return { diagnostics: [], symbols: [] };
  const blanked = blankCode(src);
  const offs = lineOffsets(src);
  const diagnostics = [];

  // 1) bracket balance
  const stack = []; const pairs = { ')': '(', ']': '[', '}': '{' };
  for (let i = 0; i < blanked.length; i++) {
    const c = blanked[i];
    if ('([{'.includes(c)) stack.push({ c, i });
    else if (')]}'.includes(c)) {
      const top = stack.pop();
      if (!top || top.c !== pairs[c]) diagnostics.push({ severity: 'error', message: `unmatched '${c}'`, line: lineOf(src, i), col: 0, index: i });
    }
  }
  for (const u of stack) diagnostics.push({ severity: 'error', message: `unclosed '${u.c}'`, line: lineOf(src, u.i), col: 0, index: u.i });

  // 2) compound statement headers missing their ':'
  for (const ll of logicalLines(blanked)) {
    if (COMPOUND.test(ll.text.trim()) && !hasTopLevelColon(ll.text)) {
      diagnostics.push({ severity: 'error', message: "expected ':' at the end of this block header", line: ll.line, col: 0, index: offs[ll.line - 1] ?? 0 });
    }
  }

  return { diagnostics: diagnostics.slice(0, 50), symbols: collectSymbols(src, offs) };
}

/** Indentation-based foldable regions for Python → [{ startLine, endLine }] (1-based, inclusive). */
export function foldPython(source) {
  const lines = String(source ?? '').split('\n');
  const indentOf = (s) => { if (!s.trim() || /^\s*#/.test(s)) return null; return /^[ \t]*/.exec(s)[0].replace(/\t/g, '    ').length; };
  const inds = lines.map(indentOf);
  const regions = [];
  for (let i = 0; i < lines.length; i++) {
    const ind = inds[i]; if (ind == null) continue;
    let end = i;
    for (let j = i + 1; j < lines.length; j++) {
      const ji = inds[j];
      if (ji == null) continue;        // blank / comment — tentatively inside the block
      if (ji > ind) end = j; else break;
    }
    if (end > i) regions.push({ startLine: i + 1, endLine: end + 1 });
  }
  return regions.sort((a, b) => a.startLine - b.startLine);
}
