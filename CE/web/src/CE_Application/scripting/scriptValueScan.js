// scriptValueScan.js — a script's text as tokens, statements and calls, in each of the seven
// languages, for the Values sidebar's reader (scriptValues.js). docs/design/script-editor-value-
// editors.md, "Decided: a Values sidebar", is what it is for.
//
// Pure functions over a string. Nothing here knows the scripting API; scriptValues.js asks it
// three questions about a source: what the tokens are (tokenize), which statements there are and
// which of their text is their own (statementUnits), and which calls a statement makes with which
// arguments, written out how (scanCalls, literalOf).
//
// TWO WAYS TO FIND A STATEMENT. JavaScript and Lua have a real parser in the bundle already (acorn,
// luaparse, as languageService.analyze uses them), and when the source parses its statements come
// from there. Every other language, and JavaScript and Lua while they are mid-edit (the normal case
// while typing), are read by a scanner over the tokens: brackets, `;`, a line break where a
// statement could end, Lua's block keywords, Python's logical lines and block headers. The scanner
// never throws and never returns a range outside the source; a source it cannot make sense of gives
// fewer statements, not wrong ones.
//
// A STATEMENT'S OWN TEXT. A statement that holds others (a function body, an `if`, a callback passed
// to `on`) does not own their text: those are HOLES in it, statements of their own. So a caret
// inside a callback reads the callback's statement, and a caret on `on("x", "evt", function(e)`
// reads the `on` call, whose third argument is the callback, computed.

import { parse as parseJs } from 'acorn';
import luaparse from 'luaparse';

/* ------------------------------------------------------------------------------------ lines */

/** Offsets at which each line starts; line n (1-based) starts at starts[n - 1]. */
export function lineStartsOf(source) {
  const starts = [0];
  for (let i = 0; i < source.length; i += 1) if (source.charCodeAt(i) === 10) starts.push(i + 1);
  return starts;
}

/** The 1-based line holding `offset`. */
export function lineAt(starts, offset) {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) lo = mid; else hi = mid - 1;
  }
  return lo + 1;
}

/* -------------------------------------------------------------------------------- tokenizer */
// A token: { t, s, e, v } — t is 'id' (names and keywords), 'num', 'str' or 'op' (operators and
// brackets); s and e are offsets. A string carries `q` (its quote: " ' ` [[ [==[ """ '''),
// `prefix` (Python's r/b/f, C#'s @ and $, C++'s R/u8/L), `raw` (the text between the quotes),
// `v` (its value, escapes read), `open` (it never closes) and `interp` (it holds ${…} or {…}).
// A number carries `v` and `raw`. Comments are dropped.

const JS_OPS = ['>>>=', '...', '===', '!==', '**=', '<<=', '>>=', '>>>', '&&=', '||=', '??=', '=>', '==', '!=',
  '<=', '>=', '&&', '||', '??', '?.', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '**', '<<', '>>'];
const LUA_OPS = ['...', '..', '==', '~=', '<=', '>=', '//', '::', '<<', '>>'];
const PY_OPS = ['**=', '//=', '>>=', '<<=', '->', ':=', '**', '//', '==', '!=', '<=', '>=', '<<', '>>', '+=', '-=',
  '*=', '/=', '%=', '&=', '|=', '^=', '@='];
const C_OPS = ['>>=', '<<=', '->*', '...', '->', '::', '=>', '++', '--', '==', '!=', '<=', '>=', '&&', '||', '??',
  '?.', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<', '>>'];

const isIdStart = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_' || c === '$' || c > '\u007f';
const isIdPart = (c) => isIdStart(c) || (c >= '0' && c <= '9');
const isDigit = (c) => c >= '0' && c <= '9';

/** The language a tokenizer reads, by its id: 'lua', 'python', 'json', a C family, or 'javascript'. */
export function familyOf(languageId) {
  switch (languageId) {
    case 'lua': return 'lua';
    case 'python': return 'python';
    case 'json': return 'json';
    case 'cpp': case 'c++': return 'cpp';
    case 'csharp': case 'cs': return 'csharp';
    case 'java': return 'java';
    case 'typescript': case 'ts': return 'typescript';
    default: return 'javascript';
  }
}

const REGEX_AFTER_WORDS = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete',
  'void', 'throw', 'instanceof', 'yield', 'await']);

function unescapeC(raw) {
  return raw.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[0-7]{1,3}|\r?\n|.)/g, (_, e) => {
    if (e[0] === 'u') return String.fromCodePoint(parseInt(e[1] === '{' ? e.slice(2, -1) : e.slice(1), 16));
    if (e[0] === 'x') return String.fromCharCode(parseInt(e.slice(1), 16));
    if (/^[0-7]/.test(e)) return e === '0' ? '\0' : String.fromCharCode(parseInt(e, 8));
    if (e === '\n' || e === '\r\n') return '';
    return { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', a: '\x07', z: '' }[e] ?? e;
  });
}

/**
 * The tokens of `source` in `languageId`. Never throws: a character it does not know is an
 * operator of its own, an unterminated string or comment runs to the end of its line (or of the
 * source, for the kinds that may span lines) and says so.
 */
export function tokenize(source, languageId) {
  const fam = familyOf(languageId);
  const src = String(source ?? '');
  const n = src.length;
  const tokens = [];
  const ops = fam === 'lua' ? LUA_OPS : fam === 'python' ? PY_OPS
    : (fam === 'cpp' || fam === 'csharp' || fam === 'java') ? C_OPS : JS_OPS;
  let i = 0;
  let lineStart = true;      // nothing but whitespace yet on this line (preprocessor lines)
  const push = (tok) => { tokens.push(tok); lineStart = false; return tok; };
  const prevSig = () => tokens[tokens.length - 1];

  while (i < n) {
    const c = src[i];
    if (c === '\n') { i += 1; lineStart = true; continue; }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v' || c === ' ') { i += 1; continue; }

    // ---- comments
    if (fam === 'lua' && c === '-' && src[i + 1] === '-') {
      const long = /^\[(=*)\[/.exec(src.slice(i + 2, i + 2 + 64));
      if (long) {
        const close = `]${long[1]}]`;
        const end = src.indexOf(close, i + 2 + long[0].length);
        i = end < 0 ? n : end + close.length;
      } else {
        const end = src.indexOf('\n', i);
        i = end < 0 ? n : end;
      }
      continue;
    }
    if (fam === 'python' && c === '#') { const end = src.indexOf('\n', i); i = end < 0 ? n : end; continue; }
    if (fam !== 'lua' && fam !== 'python' && c === '/' && src[i + 1] === '/') {
      const end = src.indexOf('\n', i); i = end < 0 ? n : end; continue;
    }
    if (fam !== 'lua' && fam !== 'python' && c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2); i = end < 0 ? n : end + 2; continue;
    }
    if ((fam === 'cpp' || fam === 'csharp') && c === '#' && lineStart) {
      const end = src.indexOf('\n', i); i = end < 0 ? n : end; continue;
    }

    // ---- strings
    if (fam === 'lua' && c === '[' && /^\[=*\[/.test(src.slice(i, i + 66))) {
      const level = /^\[(=*)\[/.exec(src.slice(i, i + 66))[1];
      const openLen = level.length + 2;
      const close = `]${level}]`;
      const end = src.indexOf(close, i + openLen);
      const rawEnd = end < 0 ? n : end;
      let raw = src.slice(i + openLen, rawEnd);
      push({ t: 'str', s: i, e: end < 0 ? n : end + close.length, q: `[${level}[`, prefix: '', raw,
        v: raw.replace(/^\r?\n/, ''), open: end < 0 });
      i = end < 0 ? n : end + close.length;
      continue;
    }
    let prefix = '';
    let q = '';
    if (c === '"' || c === "'" || (c === '`' && (fam === 'javascript' || fam === 'typescript'))) q = c;
    else if (fam === 'python' && /[rRbBuUfF]/.test(c)) {
      const m = /^([rRbBuUfF]{1,2})(["'])/.exec(src.slice(i, i + 3));
      if (m && /^(?:[rRuUbBfF]|[rR][bBfF]|[bBfF][rR])$/.test(m[1])) { prefix = m[1]; q = m[2]; }
    } else if (fam === 'csharp' && (c === '@' || c === '$')) {
      const m = /^(\$@|@\$|\$|@)"/.exec(src.slice(i, i + 3));
      if (m) { prefix = m[1]; q = '"'; }
    } else if (fam === 'cpp' && /[RuUL]/.test(c)) {
      const m = /^(u8R|uR|UR|LR|R|u8|u|U|L)(["'])/.exec(src.slice(i, i + 4));
      if (m && !isIdPart(src[i - 1] ?? ' ')) { prefix = m[1]; q = m[2]; }
    }
    if (q) {
      const start = i;
      i += prefix.length;
      // C++ raw string R"delim( … )delim"
      if (fam === 'cpp' && prefix.endsWith('R') && q === '"') {
        const m = /^"([^()\\\s]{0,16})\(/.exec(src.slice(i, i + 20));
        if (m) {
          const close = `)${m[1]}"`;
          const bodyStart = i + m[0].length;
          const end = src.indexOf(close, bodyStart);
          const raw = src.slice(bodyStart, end < 0 ? n : end);
          push({ t: 'str', s: start, e: end < 0 ? n : end + close.length, q: `R"${m[1]}(`, prefix, raw, v: raw, open: end < 0 });
          i = end < 0 ? n : end + close.length;
          continue;
        }
      }
      const triple = (fam === 'python' || fam === 'java') && src.startsWith(q.repeat(3), i);
      if (triple) {
        const close = q.repeat(3);
        const bodyStart = i + 3;
        let j = bodyStart;
        let end = -1;
        while (j < n) {
          if (src[j] === '\\' && !/[rR]/.test(prefix)) { j += 2; continue; }
          if (src.startsWith(close, j)) { end = j; break; }
          j += 1;
        }
        const raw = src.slice(bodyStart, end < 0 ? n : end);
        push({ t: 'str', s: start, e: end < 0 ? n : end + 3, q: close, prefix, raw,
          v: /[rR]/.test(prefix) ? raw : unescapeC(raw), open: end < 0,
          interp: /[fF]/.test(prefix) && /\{(?!\{)/.test(raw.replace(/\{\{/g, '')) });
        i = end < 0 ? n : end + 3;
        continue;
      }
      // An ordinary quoted string. A template literal may span lines and hold ${…}; the others end
      // at the line's end when unclosed (a line continuation aside).
      const verbatim = fam === 'csharp' && prefix.includes('@');
      const rawMode = (fam === 'python' && /[rR]/.test(prefix)) || verbatim;
      let j = i + 1;
      let end = -1;
      let interp = false;
      let depth = 0;
      while (j < n) {
        const d = src[j];
        if (q === '`') {
          if (d === '\\') { j += 2; continue; }
          if (d === '$' && src[j + 1] === '{') { interp = true; depth += 1; j += 2; continue; }
          if (depth > 0) {
            if (d === '{') depth += 1;
            else if (d === '}') depth -= 1;
            else if (d === '"' || d === "'") { const k = src.indexOf(d, j + 1); j = k < 0 ? n : k + 1; continue; }
            j += 1;
            continue;
          }
          if (d === '`') { end = j; break; }
          j += 1;
          continue;
        }
        if (verbatim) {
          if (d === '"') { if (src[j + 1] === '"') { j += 2; continue; } end = j; break; }
          j += 1;
          continue;
        }
        if (d === '\\' && !rawMode) { j += src[j + 1] === '\r' && src[j + 2] === '\n' ? 3 : 2; continue; }
        if (d === '\\' && rawMode) { j += 2; continue; }
        if (d === '\n') break;
        if (d === q) { end = j; break; }
        j += 1;
      }
      const stop = end < 0 ? (q === '`' || verbatim ? n : Math.min(j, n)) : end;
      const raw = src.slice(i + 1, stop);
      let value = raw;
      if (verbatim) value = raw.replace(/""/g, '"');
      else if (!rawMode) value = unescapeC(raw);
      if (q === '`') interp = interp || /\$\{/.test(raw);
      if ((fam === 'python' && /[fF]/.test(prefix)) || (fam === 'csharp' && prefix.includes('$'))) {
        interp = /\{(?!\{)/.test(raw.replace(/\{\{/g, ''));
      }
      const tok = push({ t: 'str', s: start, e: end < 0 ? stop : end + 1, q, prefix, raw, v: value, open: end < 0 });
      if (interp) tok.interp = true;
      if (q === "'" && (fam === 'cpp' || fam === 'csharp' || fam === 'java')) tok.char = true;
      i = end < 0 ? stop : end + 1;
      continue;
    }

    // ---- numbers
    if (isDigit(c) || (c === '.' && isDigit(src[i + 1] ?? ''))) {
      let m;
      const rest = src.slice(i, i + 80);
      if (fam === 'lua') m = /^(?:0[xX][0-9a-fA-F]*(?:\.[0-9a-fA-F]*)?(?:[pP][+-]?\d+)?|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/.exec(rest);
      else m = /^(?:0[xX][0-9a-fA-F_']+|0[bB][01_']+|0[oO][0-7_]+|(?:\d[\d_']*\.?[\d_']*|\.\d[\d_']*)(?:[eE][+-]?\d+)?)(?:[a-zA-Z]{1,3})?/.exec(rest);
      const raw = m ? m[0] : c;
      push({ t: 'num', s: i, e: i + raw.length, raw, v: numberValue(raw, fam) });
      i += raw.length;
      continue;
    }

    // ---- names
    if (isIdStart(c)) {
      let j = i + 1;
      while (j < n && isIdPart(src[j])) j += 1;
      if (fam === 'lua' || fam === 'python') {
        // `$` is no part of a name in either.
        const k = src.slice(i, j).indexOf('$');
        if (k >= 0) j = i + Math.max(1, k);
      }
      push({ t: 'id', s: i, e: j, v: src.slice(i, j) });
      i = j;
      continue;
    }

    // ---- a JavaScript regular expression, where an expression may start
    if ((fam === 'javascript' || fam === 'typescript') && c === '/') {
      const p = prevSig();
      const expressionStarts = !p || (p.t === 'op' && !/^[)\]}]$/.test(p.v) && p.v !== '++' && p.v !== '--')
        || (p.t === 'id' && REGEX_AFTER_WORDS.has(p.v));
      if (expressionStarts) {
        let j = i + 1;
        let cls = false;
        let ok = false;
        while (j < n && src[j] !== '\n') {
          if (src[j] === '\\') { j += 2; continue; }
          if (src[j] === '[') cls = true;
          else if (src[j] === ']') cls = false;
          else if (src[j] === '/' && !cls) { ok = true; break; }
          j += 1;
        }
        if (ok) {
          j += 1;
          while (j < n && isIdPart(src[j])) j += 1;
          push({ t: 'regex', s: i, e: j, v: src.slice(i, j) });
          i = j;
          continue;
        }
      }
    }

    // ---- operators
    let op = c;
    for (const candidate of ops) {
      if (src.startsWith(candidate, i)) { op = candidate; break; }
    }
    if (op === '?.' && isDigit(src[i + 2] ?? '')) op = '?';
    push({ t: 'op', s: i, e: i + op.length, v: op });
    i += op.length;
  }
  return tokens;
}

/** A number's value from its text, as the language reads it. NaN when it is not one. */
export function numberValue(raw, fam) {
  let text = String(raw).replace(/[_']/g, '');
  if (fam !== 'lua') text = /^0[xX]/.test(text) ? text.replace(/[uUlLn]+$/, '') : text.replace(/[uUlLfFdDmMnj]+$/, '');
  if (/^0[xX]/.test(text)) {
    if (fam === 'lua' && /[.pP]/.test(text)) {
      const m = /^0[xX]([0-9a-fA-F]*)(?:\.([0-9a-fA-F]*))?(?:[pP]([+-]?\d+))?$/.exec(text);
      if (!m) return NaN;
      const whole = parseInt(m[1] || '0', 16);
      const frac = (m[2] || '').split('').reduce((acc, d, k) => acc + parseInt(d, 16) / 16 ** (k + 1), 0);
      return (whole + frac) * 2 ** Number(m[3] || 0);
    }
    return parseInt(text.slice(2), 16);
  }
  if (/^0[bB]/.test(text)) return parseInt(text.slice(2), 2);
  if (/^0[oO]/.test(text)) return parseInt(text.slice(2), 8);
  return Number(text);
}

/* -------------------------------------------------------------------------- bracket matching */

const OPENERS = { '(': ')', '[': ']', '{': '}' };
const CLOSERS = { ')': '(', ']': '[', '}': '{' };

/**
 * For every bracket token, the index of the one that closes or opens it, or -1 when it has none.
 * A closer that does not match the innermost opener closes the openers above the one it matches
 * (they are left unclosed), or is left alone when none matches: what a half-typed source looks like.
 */
export function matchBrackets(tokens) {
  const match = new Int32Array(tokens.length).fill(-1);
  const stack = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const tok = tokens[i];
    if (tok.t !== 'op') continue;
    if (OPENERS[tok.v]) { stack.push(i); continue; }
    const want = CLOSERS[tok.v];
    if (!want) continue;
    let k = stack.length - 1;
    while (k >= 0 && tokens[stack[k]].v !== want) k -= 1;
    if (k < 0) continue;
    const open = stack[k];
    stack.length = k;
    match[open] = i;
    match[i] = open;
  }
  return match;
}

/* --------------------------------------------------------------------------- statement units */
// A unit: { a, b, holes } — tokens a..b-1 are the statement's, and each hole [h0, h1) is a run of
// them that belongs to statements nested inside it.
//
// MID-EDIT. A bracket that never closes would swallow every line after it into one statement. So a
// line break inside a bracket that has no match ends the statement when the next line is indented
// no deeper than the statement's first line: `set("a", foo(1,` typed above `log("b")` leaves
// `log("b")` a statement of its own. A bracket that does close is never cut this way.

/** How far line `line` (1-based) is indented, tabs as four. */
function indentOf(source, starts, line) {
  let width = 0;
  for (let i = starts[line - 1]; i < source.length; i += 1) {
    const c = source[i];
    if (c === ' ') width += 1;
    else if (c === '\t') width += 4;
    else break;
  }
  return width;
}

/** Does the line break before token j end a statement left open by the unmatched bracket at `open`? */
function breaksUnclosed(tokens, match, starts, source, open, first, j) {
  if (open < 0 || match[open] >= 0) return false;
  const line = lineAt(starts, tokens[j].s);
  if (line <= lineAt(starts, tokens[j - 1].e > tokens[j - 1].s ? tokens[j - 1].e - 1 : tokens[j - 1].s)) return false;
  return indentOf(source, starts, line) <= indentOf(source, starts, lineAt(starts, tokens[first].s));
}

const isOp = (tok, v) => tok && tok.t === 'op' && tok.v === v;
const isWord = (tok, v) => tok && tok.t === 'id' && tok.v === v;

const ENDS_EXPRESSION = (tok) => tok && (tok.t === 'num' || tok.t === 'str' || tok.t === 'regex'
  || (tok.t === 'id') || (tok.t === 'op' && (tok.v === ')' || tok.v === ']' || tok.v === '}' || tok.v === '++' || tok.v === '--')));

// Words after which a statement is not finished, whatever comes on the next line.
const C_NOT_DONE = new Set(['if', 'for', 'while', 'switch', 'catch', 'else', 'do', 'try', 'finally', 'new', 'typeof',
  'instanceof', 'in', 'of', 'return', 'throw', 'case', 'default', 'var', 'let', 'const', 'function', 'class', 'extends',
  'implements', 'import', 'export', 'await', 'yield', 'delete', 'void', 'static', 'public', 'private', 'protected',
  'internal', 'readonly', 'async', 'auto', 'int', 'double', 'float', 'bool', 'string', 'char', 'long', 'short',
  'unsigned', 'signed', 'struct', 'enum', 'namespace', 'using', 'template', 'typename', 'interface', 'as', 'is']);
// …and tokens at the start of a line that continue the statement on the line before.
const C_CONTINUES = new Set(['.', '?.', '->', '::', ',', ')', ']', '?', ':', '=>', '+', '-', '*', '/', '%', '==', '!=',
  '===', '!==', '<', '>', '<=', '>=', '&&', '||', '??', '&', '|', '^', '<<', '>>', '>>>', '=', '+=', '-=', '*=', '/=',
  '%=', '&=', '|=', '^=', '<<=', '>>=', '>>>=', '**', '**=', '&&=', '||=', '??=', '...']);
const C_CONTINUE_WORDS = new Set(['in', 'of', 'instanceof', 'as', 'satisfies', 'is']);
const BLOCK_WORDS = new Set(['else', 'do', 'try', 'finally', 'static', 'unsafe', 'checked', 'unchecked', 'get', 'set',
  'init', 'add', 'remove', 'mutable', 'noexcept', 'const', 'override', 'final']);
const TYPE_BODY_WORDS = new Set(['class', 'struct', 'interface', 'enum', 'namespace', 'record', 'union', 'extends',
  'implements', 'module']);

/** C-family statements: JavaScript, TypeScript, C++, C# and Java, by brackets, `;` and line breaks. */
function cUnits(tokens, match, starts, fam, source) {
  const units = [];
  const lineOfTok = (k) => lineAt(starts, tokens[k].s);

  // Is the `{` at j a block of statements, or an expression (an object, an initializer)?
  const isBlockBrace = (j, stmtStart, prev, expressionContext) => {
    if (prev < stmtStart) return true;
    const p = tokens[prev];
    if (p.t === 'op') {
      if (p.v === ')') {
        // C#'s `new Foo() { A = 1 }` is an initializer.
        if (fam === 'csharp') {
          const open = match[prev];
          if (open > 0 && tokens[open - 1]?.t === 'id') {
            for (let k = open - 1; k >= stmtStart; k -= 1) {
              if (isWord(tokens[k], 'new')) return false;
              if (tokens[k].t !== 'id' && !isOp(tokens[k], '.') && !isOp(tokens[k], '<') && !isOp(tokens[k], '>')) break;
            }
          }
        }
        return true;
      }
      if (p.v === '=>' || p.v === '->') return true;
      if (p.v === ';' || p.v === '{' || p.v === '}') return true;
      if (p.v === ']') {
        if (fam !== 'cpp') return false;
        const open = match[prev];
        const before = open > 0 ? tokens[open - 1] : null;
        return !before || (before.t === 'op' && ['(', ',', '=', '{', ';'].includes(before.v)) || isWord(before, 'return');
      }
      if (p.v === ':') return !expressionContext;
      return false;
    }
    if (p.t === 'id') {
      if (BLOCK_WORDS.has(p.v)) return true;
      if (['return', 'throw', 'yield', 'await', 'case', 'typeof', 'new', 'in', 'of'].includes(p.v)) return false;
      let sawNew = false;
      let typeBody = false;
      for (let k = prev; k >= stmtStart; k -= 1) {
        const tk = tokens[k];
        if (tk.t === 'op' && (tk.v === '=' || tk.v === '(' || tk.v === ',')) break;
        if (isWord(tk, 'new')) sawNew = true;
        if (tk.t === 'id' && TYPE_BODY_WORDS.has(tk.v)) typeBody = true;
      }
      if (typeBody) return true;
      if (sawNew) return false;
      return !expressionContext;
    }
    return false;
  };

  // The statements of a block, tokens lo..hi-1. Returns nothing; pushes units.
  const block = (lo, hi) => {
    let i = lo;
    while (i < hi) {
      if (isOp(tokens[i], ';')) { i += 1; continue; }
      const end = statement(i, hi);
      i = Math.max(end, i + 1);
    }
  };

  // A statement that is another's body without braces, as a hole of it; returns the index after it.
  const body = (from, hi, unit) => {
    const end = statement(from, hi);
    if (end > from) unit.holes.push([from, end]);
    return end;
  };

  // One statement from i; returns the index after it.
  const statement = (i, hi) => {
    const unit = { a: i, b: i, holes: [] };
    units.push(unit);
    const stack = [];          // open brackets inside this statement: { idx, expr }
    const startsWithDo = isWord(tokens[i], 'do');
    const label = isWord(tokens[i], 'case') || isWord(tokens[i], 'default')
      || (fam === 'cpp' && ['public', 'private', 'protected'].includes(tokens[i]?.v) && isOp(tokens[i + 1], ':'));
    let j = i;
    let prev = i - 1;
    while (j < hi) {
      const tok = tokens[j];
      if (j > i && stack.length > 0 && breaksUnclosed(tokens, match, starts, source, stack[stack.length - 1].idx, i, j)) break;
      // A line break where the statement could end, at its own bracket depth.
      if (j > i && stack.length === 0) {
        const p = tokens[j - 1];
        if (lineOfTok(j) > lineAt(starts, p.e > p.s ? p.e - 1 : p.s) && ENDS_EXPRESSION(p)
          && !(p.t === 'id' && C_NOT_DONE.has(p.v))
          && !(tok.t === 'op' && C_CONTINUES.has(tok.v))
          && !(tok.t === 'id' && (C_CONTINUE_WORDS.has(tok.v) || ['else', 'catch', 'finally'].includes(tok.v)
            || (startsWithDo && tok.v === 'while')))) {
          // `if (x)` alone on its line ends there too: its body is a statement of its own, as a
          // parse makes it.
          break;
        }
      }
      if (tok.t === 'op') {
        if (tok.v === ';' && stack.length === 0) { j += 1; break; }
        if (label && tok.v === ':' && stack.length === 0) { j += 1; break; }
        if (tok.v === '(' || tok.v === '[') {
          stack.push({ idx: j, expr: true });
        } else if (tok.v === '{') {
          // Every bracket on the stack is an expression's: a block inside one is read as a block of
          // its own and never pushed.
          const asBlock = isBlockBrace(j, i, prev, stack.length > 0);
          const close = match[j] >= 0 && match[j] <= hi ? match[j] : hi;
          if (asBlock) {
            if (close > j + 1) unit.holes.push([j + 1, close]);
            block(j + 1, close);
            if (close >= hi) { j = hi; break; }
            j = close;          // the `}`: part of this statement
            prev = j;
            const next = tokens[j + 1];
            if (stack.length === 0) {
              const continues = next && j + 1 < hi && (
                (next.t === 'id' && (['else', 'catch', 'finally'].includes(next.v) || (startsWithDo && next.v === 'while')))
                || (next.t === 'op' && (C_CONTINUES.has(next.v) || next.v === ';') && lineOfTok(j + 1) === lineOfTok(j))
                || (next.t === 'op' && next.v === ';'));
              if (!continues) { j += 1; break; }
            }
            j += 1;
            continue;
          }
          stack.push({ idx: j, expr: true });
        } else if (tok.v === ')' || tok.v === ']' || tok.v === '}') {
          if (stack.length === 0) {
            // A closer this statement did not open: the end of the enclosing block, or a stray one.
            if (tok.v === '}') break;
          } else {
            stack.pop();
            // `if (x) foo();` on one line: the body is a statement of its own, as a parse makes it.
            if (stack.length === 0 && tok.v === ')' && isHeaderParen(tokens, match, j)) {
              const next = tokens[j + 1];
              if (next && j + 1 < hi && !isOp(next, '{') && !isOp(next, ';') && lineOfTok(j + 1) === lineOfTok(j)) {
                j = body(j + 1, hi, unit);
                if (j < hi && (isWord(tokens[j], 'else') || (startsWithDo && isWord(tokens[j], 'while')))) { prev = j - 1; continue; }
                break;
              }
            }
          }
        }
      } else if (stack.length === 0 && (tok.v === 'else' || tok.v === 'do') && tok.t === 'id') {
        // `else foo();`, `do foo(); while (x);`: the same.
        const next = tokens[j + 1];
        if (next && j + 1 < hi && !isOp(next, '{') && !isWord(next, 'if')) {
          j = body(j + 1, hi, unit);
          if (j < hi && startsWithDo && isWord(tokens[j], 'while')) { prev = j - 1; continue; }
          break;
        }
      }
      prev = j;
      j += 1;
    }
    unit.b = Math.max(j, i + 1);
    return unit.b;
  };

  block(0, tokens.length);
  return units;
}

/** Is the `)` at k the end of an `if (…)`, `for (…)`, `while (…)`… header, after which a body follows? */
function isHeaderParen(tokens, match, k) {
  const open = match[k];
  if (open <= 0) return false;
  const before = tokens[open - 1];
  return before?.t === 'id' && ['if', 'for', 'while', 'foreach', 'using', 'lock', 'with'].includes(before.v);
}

const LUA_CLOSERS = new Set(['end', 'else', 'elseif', 'until']);
const LUA_STARTS = new Set(['local', 'if', 'for', 'while', 'do', 'repeat', 'return', 'break', 'goto', 'function']);
const LUA_NOT_DONE = new Set(['and', 'or', 'not', 'local', 'return', 'function', 'in', 'then', 'do', 'if', 'elseif',
  'while', 'for', 'until', 'repeat', 'else', 'goto']);

/** Lua statements: block keywords, brackets, and where one expression ends and a name starts. */
function luaUnits(tokens, match, starts, source) {
  const units = [];
  const n = tokens.length;

  // The statements of a block from lo, up to the closer that ends it; returns the closer's index.
  const block = (lo) => {
    let i = lo;
    while (i < n) {
      const tok = tokens[i];
      if (tok.t === 'id' && LUA_CLOSERS.has(tok.v)) return i;
      if (isOp(tok, ';')) { i += 1; continue; }
      const end = statement(i);
      i = Math.max(end, i + 1);
    }
    return n;
  };

  // A function's body, after its `(…)`. Returns the index after its `end`.
  const functionAt = (j, unit) => {
    let k = j + 1;
    while (k < n && (tokens[k].t === 'id' || isOp(tokens[k], '.') || isOp(tokens[k], ':')) && !isOp(tokens[k], '(')) {
      if (tokens[k].t === 'id' && LUA_CLOSERS.has(tokens[k].v)) break;
      k += 1;
    }
    if (!isOp(tokens[k], '(')) return j + 1;
    const close = match[k] >= 0 ? match[k] : n - 1;
    const end = block(close + 1);
    if (end > close + 1) unit.holes.push([close + 1, end]);
    return isWord(tokens[end], 'end') ? end + 1 : end;
  };

  // A block after a keyword (then/do/else/repeat), as a hole; returns the closer's index.
  const bodyAt = (lo, unit) => {
    const end = block(lo);
    if (end > lo) unit.holes.push([lo, end]);
    return end;
  };

  const statement = (i) => {
    const unit = { a: i, b: i, holes: [] };
    units.push(unit);
    const first = tokens[i];
    let j = i;
    const findWord = (from, word) => {
      let depth = 0;
      for (let k = from; k < n; k += 1) {
        const tk = tokens[k];
        if (tk.t === 'op' && OPENERS[tk.v]) depth += 1;
        else if (tk.t === 'op' && CLOSERS[tk.v]) depth = Math.max(0, depth - 1);
        else if (depth === 0 && isWord(tk, word)) return k;
        else if (depth === 0 && tk.t === 'id' && (LUA_CLOSERS.has(tk.v) || tk.v === 'local')) return -1;
        else if (isWord(tk, 'function')) { k = skipFunctionTokens(tokens, match, k) - 1; }
      }
      return -1;
    };
    if (isWord(first, 'if')) {
      let k = findWord(i + 1, 'then');
      if (k < 0) { unit.b = expression(i + 1, unit); return unit.b; }
      expression(i + 1, unit, k);
      let c = bodyAt(k + 1, unit);
      while (isWord(tokens[c], 'elseif')) {
        const t2 = findWord(c + 1, 'then');
        if (t2 < 0) { unit.b = expression(c + 1, unit); return unit.b; }
        expression(c + 1, unit, t2);
        c = bodyAt(t2 + 1, unit);
      }
      if (isWord(tokens[c], 'else')) c = bodyAt(c + 1, unit);
      unit.b = isWord(tokens[c], 'end') ? c + 1 : c;
      return unit.b;
    }
    if (isWord(first, 'while') || isWord(first, 'for')) {
      const k = findWord(i + 1, 'do');
      if (k < 0) { unit.b = expression(i + 1, unit); return unit.b; }
      expression(i + 1, unit, k);
      const c = bodyAt(k + 1, unit);
      unit.b = isWord(tokens[c], 'end') ? c + 1 : c;
      return unit.b;
    }
    if (isWord(first, 'do')) {
      const c = bodyAt(i + 1, unit);
      unit.b = isWord(tokens[c], 'end') ? c + 1 : c;
      return unit.b;
    }
    if (isWord(first, 'repeat')) {
      const c = bodyAt(i + 1, unit);
      unit.b = isWord(tokens[c], 'until') ? expression(c + 1, unit) : c;
      return unit.b;
    }
    if (isWord(first, 'function') || (isWord(first, 'local') && isWord(tokens[i + 1], 'function'))) {
      unit.b = functionAt(isWord(first, 'local') ? i + 1 : i, unit);
      return unit.b;
    }
    j = expression(isWord(first, 'local') || isWord(first, 'return') || isWord(first, 'goto') ? i + 1 : i, unit, -1, i);
    unit.b = Math.max(j, i + 1);
    return unit.b;
  };

  // An expression (or an assignment's two sides) from j; stops at `stop` when given, else where the
  // next statement starts. Function bodies inside it become holes.
  const expression = (j, unit, stop = -1, stmtStart = j) => {
    const open = [];
    const limit = stop >= 0 ? stop : n;
    while (j < limit) {
      const tok = tokens[j];
      const depth = open.length;
      if (depth > 0 && j > stmtStart && breaksUnclosed(tokens, match, starts, source, open[depth - 1], stmtStart, j)) break;
      if (tok.t === 'id' && tok.v === 'function') { j = functionAt(j, unit); continue; }
      if (depth === 0 && stop < 0) {
        if (tok.t === 'id' && LUA_CLOSERS.has(tok.v)) break;
        if (isOp(tok, ';')) break;
        if (j > stmtStart) {
          const p = tokens[j - 1];
          const ends = p.t === 'num' || p.t === 'str' || (p.t === 'op' && (p.v === ')' || p.v === ']' || p.v === '}' || p.v === '...'))
            || (p.t === 'id' && !LUA_NOT_DONE.has(p.v));
          if (ends && tok.t === 'id' && !['and', 'or', 'then', 'do', 'in'].includes(tok.v)) break;
          if (ends && tok.t === 'id' && LUA_STARTS.has(tok.v)) break;
        }
      }
      if (tok.t === 'op' && OPENERS[tok.v]) open.push(j);
      else if (tok.t === 'op' && CLOSERS[tok.v]) { if (depth === 0) { if (stop < 0) break; } else open.pop(); }
      j += 1;
    }
    return j;
  };

  // A closer left over at the top (an `end` too many, mid-edit) is a statement of its own, and the
  // statements after it are still read.
  let at = 0;
  while (at < n) {
    const closer = block(at);
    if (closer >= n) break;
    units.push({ a: closer, b: closer + 1, holes: [] });
    at = closer + 1;
  }
  return units;
}

/** The index after a `function … end`, without recording anything: for looking past one. */
function skipFunctionTokens(tokens, match, j) {
  let depth = 0;
  for (let k = j; k < tokens.length; k += 1) {
    const tk = tokens[k];
    if (tk.t !== 'id') continue;
    if (['function', 'do', 'then', 'repeat'].includes(tk.v)) {
      if (tk.v === 'do' || tk.v === 'then') {
        // `while … do` and `if … then` open a block their own `while`/`if` already counted.
        continue;
      }
      depth += 1;
    } else if (['if', 'while', 'for'].includes(tk.v)) depth += 1;
    else if (tk.v === 'end' || tk.v === 'until') { depth -= 1; if (depth === 0) return k + 1; }
  }
  return tokens.length;
}

const PY_HEADERS = new Set(['if', 'elif', 'else', 'for', 'while', 'with', 'try', 'except', 'finally', 'def', 'class',
  'async', 'match', 'case']);

/** Python statements: logical lines, `;`, and a block header's own line up to its `:`. */
function pythonUnits(tokens, match, starts, source) {
  const units = [];
  const n = tokens.length;
  const lineOfTok = (k) => lineAt(starts, tokens[k].s);
  let i = 0;
  while (i < n) {
    // A logical line: physical lines joined while a bracket is open or a line ends with "\".
    let j = i;
    const open = [];
    while (j < n) {
      const tok = tokens[j];
      if (j > i && open.length === 0 && lineOfTok(j) > lineAt(starts, tokens[j - 1].e - 1) && !isOp(tokens[j - 1], '\\')) break;
      if (j > i && open.length > 0 && breaksUnclosed(tokens, match, starts, source, open[open.length - 1], i, j)) break;
      if (tok.t === 'op' && OPENERS[tok.v]) open.push(j);
      else if (tok.t === 'op' && CLOSERS[tok.v]) open.pop();
      j += 1;
    }
    // Within it: a header up to its `:`, then statements split at `;`.
    let k = i;
    while (k < j) {
      if (isOp(tokens[k], ';')) { k += 1; continue; }
      let end = k;
      let d = 0;
      const header = tokens[k].t === 'id' && PY_HEADERS.has(tokens[k].v);
      const decorator = isOp(tokens[k], '@');
      let lambdas = 0;
      while (end < j) {
        const tok = tokens[end];
        if (tok.t === 'op' && OPENERS[tok.v]) d += 1;
        else if (tok.t === 'op' && CLOSERS[tok.v]) d = Math.max(0, d - 1);
        else if (d === 0 && isWord(tok, 'lambda')) lambdas += 1;
        else if (d === 0 && isOp(tok, ':') && header && !decorator) {
          if (lambdas > 0) lambdas -= 1;
          else { end += 1; break; }
        } else if (d === 0 && isOp(tok, ';') && !decorator) break;
        end += 1;
      }
      units.push({ a: k, b: Math.max(end, k + 1), holes: [] });
      k = Math.max(end, k + 1);
    }
    i = Math.max(j, i + 1);
  }
  return units;
}

/* ---------------------------------------------------------------------- statements from a parse */

const JS_PARSE_OPTIONS = {
  ecmaVersion: 'latest', sourceType: 'script', allowReturnOutsideFunction: true,
  allowAwaitOutsideFunction: true, allowHashBang: true, allowImportExportEverywhere: true,
};

const isJsStatement = (node, parent, key) => {
  const type = node.type;
  if (type === 'BlockStatement' || type === 'EmptyStatement') return false;
  if (type === 'VariableDeclaration' && parent && /^For/.test(parent.type) && (key === 'init' || key === 'left')) return false;
  return type.endsWith('Statement') || type.endsWith('Declaration') || type === 'MethodDefinition'
    || type === 'PropertyDefinition' || type === 'StaticBlock';
};

const isLuaStatement = (node) => /Statement$/.test(node.type)
  || (node.type === 'FunctionDeclaration' && (node.isLocal || node.identifier));

/** Statement ranges and their holes from a parse: [{ s, e, holes: [[s, e]] }], or null when it does not parse. */
function parsedRanges(source, fam) {
  let ast;
  try {
    ast = fam === 'lua'
      ? luaparse.parse(source, { ranges: true, locations: false, comments: false, luaVersion: '5.3' })
      : parseJs(source, JS_PARSE_OPTIONS);
  } catch {
    return null;
  }
  const out = [];
  const start = (node) => (fam === 'lua' ? node.range[0] : node.start);
  const end = (node) => (fam === 'lua' ? node.range[1] : node.end);
  const isStatement = fam === 'lua' ? isLuaStatement : isJsStatement;
  const visit = (node, parent, key, owner) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const child of node) visit(child, parent, key, owner); return; }
    if (typeof node.type !== 'string') return;
    let mine = owner;
    if (isStatement(node, parent, key)) {
      const range = { s: start(node), e: end(node), holes: [] };
      if (owner) owner.holes.push([range.s, range.e]);
      out.push(range);
      mine = range;
    }
    for (const k of Object.keys(node)) {
      if (k === 'range' || k === 'loc' || k === 'type' || k === 'start' || k === 'end') continue;
      const v = node[k];
      if (v && typeof v === 'object') visit(v, node, k, mine);
    }
  };
  visit(ast, null, '', null);
  return out;
}

/** The index of the first token starting at or after `offset`. */
function tokenIndexAt(tokens, offset) {
  let lo = 0;
  let hi = tokens.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (tokens[mid].s < offset) lo = mid + 1; else hi = mid;
  }
  return lo;
}

/**
 * The statements of a source: units { a, b, holes, parsed } over its tokens, from the parser when
 * the language has one and the source parses, else from the scanner.
 */
export function statementUnits(source, languageId, tokens, match, starts) {
  const fam = familyOf(languageId);
  if (fam === 'javascript' || fam === 'lua') {
    const ranges = parsedRanges(source, fam);
    if (ranges) {
      return ranges.map((r) => ({
        a: tokenIndexAt(tokens, r.s),
        b: tokenIndexAt(tokens, r.e),
        holes: r.holes.map(([s, e]) => [tokenIndexAt(tokens, s), tokenIndexAt(tokens, e)]).filter(([x, y]) => y > x),
        parsed: true,
      })).filter((u) => u.b > u.a);
    }
  }
  if (fam === 'lua') return luaUnits(tokens, match, starts, source);
  if (fam === 'python') return pythonUnits(tokens, match, starts, source);
  if (fam === 'json') return [{ a: 0, b: tokens.length, holes: [] }];
  return cUnits(tokens, match, starts, fam, source);
}

/* ------------------------------------------------------------------------------------- calls */
// A call: { calleeA, calleeB (token indices of its name), callee (the name, dots for every
// separator), open, close (its brackets; close -1 when it never closes), form ('paren' | 'table' |
// 'string', Lua's f{…} and f"…"), args: [{ a, b, keyword?, keywordTok? }], calls: [nested] }.
// Indices are into the token stream the caller passes, which may hold { t: 'hole' } markers.

const CHAIN_SEPARATORS = new Set(['.', ':', '?.', '->', '::']);
// ":" chains only in Lua (obj:name()). Elsewhere it ends a key or a block header, or is a ternary's
// second half, and taking it for a chain read `{ a: clamp(x) }` as a call to a.clamp and lost the
// call after a Python `def f():` and after a ternary's ":".
const chains = (tok, fam) => tok?.t === 'op' && CHAIN_SEPARATORS.has(tok.v) && (tok.v !== ':' || fam === 'lua');

/** The token stream of a unit: its own tokens, with each hole as one { t: 'hole' } marker. */
export function unitStream(tokens, unit) {
  const out = [];
  let i = unit.a;
  const holes = [...unit.holes].sort((x, y) => x[0] - y[0]);
  let h = 0;
  while (i < unit.b) {
    while (h < holes.length && holes[h][1] <= i) h += 1;
    if (h < holes.length && holes[h][0] <= i) {
      const [h0, h1] = holes[h];
      out.push({ t: 'hole', s: tokens[h0].s, e: tokens[Math.min(h1, tokens.length) - 1].e });
      i = h1;
      h += 1;
      continue;
    }
    out.push(tokens[i]);
    i += 1;
  }
  return out;
}

/** Calls in stream[lo..hi), outermost first, each with the calls in its arguments nested in it. */
export function scanCalls(stream, lo, hi, fam, match = matchBrackets(stream)) {
  const out = [];
  let i = lo;
  while (i < hi) {
    const tok = stream[i];
    const before = stream[i - 1];
    if (tok.t === 'id' && !(i > lo && chains(before, fam))) {
      let k = i + 1;
      while (k + 1 < hi && chains(stream[k], fam) && stream[k + 1].t === 'id') k += 2;
      const next = stream[k];
      const call = next && k < hi ? callAt(stream, i, k, hi, fam, match) : null;
      if (call) {
        out.push(call);
        i = call.close >= 0 ? call.close + 1 : hi;
        continue;
      }
      i = k;
      continue;
    }
    i += 1;
  }
  return out;
}

const NOT_CALLEES = new Set(['if', 'while', 'for', 'switch', 'catch', 'return', 'function', 'typeof', 'new', 'sizeof',
  'foreach', 'using', 'lock', 'elif', 'and', 'or', 'not', 'in', 'lambda', 'def', 'class', 'local', 'then', 'do',
  'else', 'until', 'with', 'await', 'yield', 'throw', 'delete', 'void', 'assert', 'except', 'from', 'import']);

function callAt(stream, a, k, hi, fam, match) {
  const next = stream[k];
  let form = null;
  if (isOp(next, '(')) form = 'paren';
  else if (fam === 'lua' && isOp(next, '{')) form = 'table';
  else if (fam === 'lua' && next.t === 'str') form = 'string';
  if (!form) return null;
  if (k === a + 1 && NOT_CALLEES.has(stream[a].v)) return null;
  // A function's own declaration is not a call: `function foo(a)`, `def foo(a)`, `void foo(int a) {`,
  // a class's `foo(a) {`.
  const before = stream[a - 1];
  if (before && before.t === 'id' && ['function', 'def', 'class', 'new'].includes(before.v)) return null;
  if (fam !== 'lua' && fam !== 'python' && form === 'paren' && isMethodHeader(stream, k, match)) return null;
  const callee = [];
  for (let x = a; x < k; x += 1) if (stream[x].t === 'id') callee.push(stream[x].v);
  const call = { calleeA: a, calleeB: k, callee: callee.join('.'), form, open: k, close: -1, args: [], calls: [] };
  // Lua's obj:name(…) passes obj itself first: worth saying when obj is the API's.
  if (fam === 'lua' && k - 2 >= a && isOp(stream[k - 2], ':')) call.method = true;
  if (form === 'string') {
    call.close = k;
    call.args.push({ a: k, b: k + 1 });
    return call;
  }
  const close = match[k] >= 0 && match[k] < hi ? match[k] : -1;
  call.close = close;
  const end = close >= 0 ? close : hi;
  if (form === 'table') {
    call.args.push({ a: k, b: end + (close >= 0 ? 1 : 0) });
  } else {
    let start = k + 1;
    let depth = 0;
    for (let x = k + 1; x < end; x += 1) {
      const tk = stream[x];
      if (tk.t === 'op' && OPENERS[tk.v]) depth += 1;
      else if (tk.t === 'op' && CLOSERS[tk.v]) depth = Math.max(0, depth - 1);
      else if (depth === 0 && isOp(tk, ',')) {
        call.args.push({ a: start, b: x });
        start = x + 1;
      }
    }
    if (end > start || call.args.length) call.args.push({ a: start, b: end });
    for (const arg of call.args) {
      // Python's keyword arguments, and C#'s named ones.
      const first = stream[arg.a];
      const second = stream[arg.a + 1];
      if (first?.t === 'id' && arg.b - arg.a >= 2
        && ((fam === 'python' && isOp(second, '=')) || (fam === 'csharp' && isOp(second, ':')))) {
        arg.keyword = first.v;
        arg.keywordTok = arg.a;
        arg.a += 2;
      }
    }
  }
  for (const arg of call.args) call.calls.push(...scanCalls(stream, arg.a, arg.b, fam, match));
  return call;
}

/** `void foo(int a) {` or `foo(a) {` in a class: a header, not a call. */
function isMethodHeader(stream, k, match) {
  const close = match[k];
  if (close < 0) return false;
  const after = stream[close + 1];
  return Boolean(after && (isOp(after, '{') || (after.t === 'id' && ['const', 'override', 'noexcept', 'throws'].includes(after.v))));
}

/* ---------------------------------------------------------------------------------- literals */
// What an argument's text is when it is written out: a node
//   { type: 'string', value, tok } | { type: 'number', value, raw, sign } | { type: 'boolean', value }
//   | { type: 'null' } | { type: 'list' | 'table', open, close, entries } | { type: 'computed' }
// where an entry is { key, keyStyle, keyA, keyB, a, b, node } (key null for a list item). Indices are
// into the stream. `literal(node)` says whether every part of it is written out.

const TRUE_WORDS = { lua: ['true'], python: ['True'], default: ['true'] };
const FALSE_WORDS = { lua: ['false'], python: ['False'], default: ['false'] };
const NULL_WORDS = { lua: ['nil'], python: ['None'], javascript: ['null', 'undefined'], typescript: ['null', 'undefined'],
  cpp: ['nullptr', 'NULL'], csharp: ['null'], java: ['null'], json: ['null'] };

/** The literal the tokens stream[a..b) write, or { type: 'computed' }. */
export function literalOf(stream, a, b, fam, match = matchBrackets(stream)) {
  if (b <= a) return { type: 'computed', empty: true };
  const first = stream[a];
  if (b - a === 1) {
    if (first.t === 'str') {
      if (first.open || first.interp || (fam === 'python' && /[bB]/.test(first.prefix))) return { type: 'computed' };
      return { type: 'string', value: first.v, tok: a };
    }
    if (first.t === 'num') return Number.isFinite(first.v) ? { type: 'number', value: first.v, raw: first.raw, tok: a, sign: '' } : { type: 'computed' };
    if (first.t === 'id') {
      if ((TRUE_WORDS[fam] ?? TRUE_WORDS.default).includes(first.v)) return { type: 'boolean', value: true };
      if ((FALSE_WORDS[fam] ?? FALSE_WORDS.default).includes(first.v)) return { type: 'boolean', value: false };
      if ((NULL_WORDS[fam] ?? []).includes(first.v)) return { type: 'null', value: null };
    }
    return { type: 'computed' };
  }
  if (b - a === 2 && first.t === 'op' && (first.v === '-' || first.v === '+') && stream[a + 1].t === 'num') {
    const v = stream[a + 1].v;
    if (!Number.isFinite(v)) return { type: 'computed' };
    return { type: 'number', value: first.v === '-' ? -v : v, raw: stream[a + 1].raw, tok: a + 1, sign: first.v };
  }
  // Python's dict(k=v, …) when every argument is a keyword one.
  if (fam === 'python' && isWord(first, 'dict') && isOp(stream[a + 1], '(') && match[a + 1] === b - 1) {
    const entries = [];
    let start = a + 2;
    let depth = 0;
    const pushEntry = (x0, x1) => {
      if (x1 <= x0) return true;
      if (stream[x0].t !== 'id' || !isOp(stream[x0 + 1], '=')) return false;
      entries.push({ key: stream[x0].v, keyStyle: 'keyword', keyA: x0, keyB: x0 + 1, a: x0 + 2, b: x1,
        node: literalOf(stream, x0 + 2, x1, fam, match) });
      return true;
    };
    for (let x = a + 2; x < b - 1; x += 1) {
      const tk = stream[x];
      if (tk.t === 'op' && OPENERS[tk.v]) depth += 1;
      else if (tk.t === 'op' && CLOSERS[tk.v]) depth -= 1;
      else if (depth === 0 && isOp(tk, ',')) { if (!pushEntry(start, x)) return { type: 'computed' }; start = x + 1; }
    }
    if (!pushEntry(start, b - 1)) return { type: 'computed' };
    return { type: 'table', open: a + 1, close: b - 1, entries, dict: true };
  }
  // C# and Java array initializers: new[] { … }, new int[] { … }, new List<int> { … }.
  let lo = a;
  if ((fam === 'csharp' || fam === 'java') && isWord(first, 'new')) {
    let x = a + 1;
    while (x < b && !isOp(stream[x], '{')) x += 1;
    if (x >= b) return { type: 'computed' };
    lo = x;
  }
  const opener = stream[lo];
  if (opener.t !== 'op' || !OPENERS[opener.v] || match[lo] !== b - 1) return { type: 'computed' };
  if (opener.v === '(' && fam !== 'python') return { type: 'computed' };
  const keyed = (opener.v === '{' && fam !== 'cpp' && fam !== 'csharp' && fam !== 'java');
  const entries = [];
  let start = lo + 1;
  let depth = 0;
  const separators = fam === 'lua' ? [',', ';'] : [','];
  const parts = [];
  for (let x = lo + 1; x < b - 1; x += 1) {
    const tk = stream[x];
    if (tk.t === 'op' && OPENERS[tk.v]) depth += 1;
    else if (tk.t === 'op' && CLOSERS[tk.v]) depth -= 1;
    else if (depth === 0 && tk.t === 'op' && separators.includes(tk.v)) { parts.push([start, x]); start = x + 1; }
  }
  if (b - 1 > start) parts.push([start, b - 1]);
  let anyKey = false;
  for (const [x0, x1] of parts) {
    if (x1 <= x0) continue;
    const entry = keyed ? keyedEntry(stream, x0, x1, fam, match) : null;
    if (entry === false) return { type: 'computed' };
    if (entry) { anyKey = true; entries.push(entry); continue; }
    entries.push({ key: null, keyStyle: null, a: x0, b: x1, node: literalOf(stream, x0, x1, fam, match) });
  }
  const isTuple = opener.v === '(';
  if (isTuple && parts.length < 2 && !(parts.length === 1 && isOp(stream[b - 2], ','))) return { type: 'computed' };
  if (fam !== 'lua' && opener.v === '{' && keyed && !anyKey && entries.length) {
    // `{ a, b }` in JavaScript is shorthand, and in Python a set: neither is a literal here.
    return { type: 'computed' };
  }
  const type = anyKey || (opener.v === '{' && keyed && !entries.length) ? 'table' : 'list';
  return { type, open: lo, close: b - 1, entries };
}

/** One `key = value` (Lua), `key: value` (JavaScript, Python) entry; null for a list item; false for neither. */
function keyedEntry(stream, x0, x1, fam, match) {
  const t0 = stream[x0];
  const t1 = stream[x0 + 1];
  if (fam === 'lua') {
    if (t0.t === 'id' && isOp(t1, '=')) {
      return { key: t0.v, keyStyle: 'name', keyA: x0, keyB: x0 + 1, a: x0 + 2, b: x1, node: literalOf(stream, x0 + 2, x1, fam, match) };
    }
    if (isOp(t0, '[') && match[x0] > x0 && isOp(stream[match[x0] + 1], '=')) {
      const close = match[x0];
      const keyNode = literalOf(stream, x0 + 1, close, fam, match);
      if (keyNode.type !== 'string' && keyNode.type !== 'number') return false;
      return { key: String(keyNode.value), keyStyle: keyNode.type === 'string' ? 'bracket' : 'index', keyA: x0, keyB: close + 1,
        keyTok: x0 + 1, a: close + 2, b: x1, node: literalOf(stream, close + 2, x1, fam, match) };
    }
    return null;
  }
  if (isOp(t1, ':')) {
    if (t0.t === 'id' && fam !== 'python') {
      return { key: t0.v, keyStyle: 'name', keyA: x0, keyB: x0 + 1, a: x0 + 2, b: x1, node: literalOf(stream, x0 + 2, x1, fam, match) };
    }
    if (t0.t === 'str' && !t0.open && !t0.interp) {
      return { key: t0.v, keyStyle: 'string', keyA: x0, keyB: x0 + 1, keyTok: x0, a: x0 + 2, b: x1, node: literalOf(stream, x0 + 2, x1, fam, match) };
    }
    if (t0.t === 'num') {
      return { key: String(t0.v), keyStyle: 'number', keyA: x0, keyB: x0 + 1, a: x0 + 2, b: x1, node: literalOf(stream, x0 + 2, x1, fam, match) };
    }
    return false;
  }
  if (fam !== 'python' && isOp(t0, '[') && match[x0] > x0 && isOp(stream[match[x0] + 1], ':')) {
    const close = match[x0];
    const keyNode = literalOf(stream, x0 + 1, close, fam, match);
    if (keyNode.type !== 'string' && keyNode.type !== 'number') return false;
    return { key: String(keyNode.value), keyStyle: 'computed', keyA: x0, keyB: close + 1, keyTok: x0 + 1, a: close + 2, b: x1,
      node: literalOf(stream, close + 2, x1, fam, match) };
  }
  return false;
}

/** Is every part of a literal node written out? */
export function isLiteral(node) {
  if (!node || node.type === 'computed') return false;
  if (node.type === 'list' || node.type === 'table') return node.entries.every((e) => isLiteral(e.node));
  return true;
}

/** A literal node's JavaScript value: strings unquoted, numbers as numbers, lists as arrays, tables as objects. */
export function valueOf(node) {
  switch (node?.type) {
    case 'string': case 'number': case 'boolean': return node.value;
    case 'null': return null;
    case 'list': return node.entries.map((e) => valueOf(e.node));
    case 'table': {
      if (node.entries.length && node.entries.every((e) => e.key === null)) return node.entries.map((e) => valueOf(e.node));
      const out = {};
      let index = 0;
      for (const e of node.entries) {
        if (e.key === null) { index += 1; out[String(index)] = valueOf(e.node); } else out[e.key] = valueOf(e.node);
      }
      return out;
    }
    default: return undefined;
  }
}
