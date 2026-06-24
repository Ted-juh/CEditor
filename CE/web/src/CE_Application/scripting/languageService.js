// languageService.js — real parser-backed language intelligence for the script editor.
//
// Built on acorn (JavaScript) and luaparse (Lua). From a source string it derives:
//   • diagnostics  — syntax errors with precise line/col/offset (inline squiggles + panel)
//   • symbols      — declared functions / variables / parameters (completion, go-to-def)
//   • completions  — keywords + panel API + document symbols, filtered at the caret
//   • hover        — signature/summary for an identifier (API, or a local declaration)
//   • definition   — the source offset where an identifier is declared
//
// The panel API surface (set/get/on/sendCC/scale/…) comes from panelApi.js so this stays
// the single source of truth. Parsing is best-effort: while the user is mid-edit the source
// often doesn't parse, so the last good symbol table per language is reused as a fallback.

import { parse as parseJs } from 'acorn';
import luaparse from 'luaparse';
import {
  COMMANDS, HELPERS, VALUE_ACCESSORS, SELF, ALL_EVENTS,
} from './panelApi.js';

/* ----------------------------------------------------------- static API data */

const API_FUNCTIONS = [...COMMANDS, ...HELPERS].map((m) => ({
  label: m.id,
  kind: 'function',
  detail: m.signature || `${m.id}(…)`,
  doc: m.summary || '',
}));
const API_BY_NAME = Object.fromEntries(API_FUNCTIONS.map((f) => [f.label, f]));

// Parameter names per API function, for signature help. Prefer the structured
// params array (commands); fall back to parsing the signature string (helpers).
function paramsFromSignature(sig) {
  const m = /\(([^)]*)\)/.exec(sig || '');
  if (!m || !m[1].trim()) return [];
  return m[1].split(',').map((s) => s.trim()).filter(Boolean);
}
const API_PARAMS = {};
for (const m of [...COMMANDS, ...HELPERS]) {
  const params = Array.isArray(m.params) ? m.params.map((p) => p.name) : paramsFromSignature(m.signature);
  API_PARAMS[m.id] = { name: m.id, params, signature: m.signature || `${m.id}(…)` };
}
const EVENT_BY_FN = Object.fromEntries(ALL_EVENTS.map((e) => [e.fn, e]));
const ACCESSOR_BY_ID = Object.fromEntries(VALUE_ACCESSORS.map((a) => [a.id, a]));

const JS_KEYWORDS = ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while',
  'do', 'switch', 'case', 'default', 'break', 'continue', 'new', 'typeof', 'instanceof', 'this',
  'class', 'try', 'catch', 'finally', 'throw', 'true', 'false', 'null', 'undefined'];
const LUA_KEYWORDS = ['and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function',
  'goto', 'if', 'in', 'local', 'nil', 'not', 'or', 'repeat', 'return', 'then', 'true', 'until', 'while'];
const PY_KEYWORDS = ['def', 'return', 'if', 'elif', 'else', 'for', 'while', 'break', 'continue',
  'import', 'from', 'as', 'class', 'try', 'except', 'finally', 'raise', 'with', 'lambda', 'pass',
  'and', 'or', 'not', 'in', 'is', 'None', 'True', 'False', 'global', 'nonlocal', 'yield'];
const JS_BUILTINS = ['console', 'Math', 'JSON', 'Object', 'Array', 'String', 'Number', 'parseInt', 'parseFloat'];
const LUA_BUILTINS = ['print', 'pairs', 'ipairs', 'tostring', 'tonumber', 'type', 'math', 'string', 'table'];
const PY_BUILTINS = ['print', 'len', 'range', 'str', 'int', 'float', 'list', 'dict', 'enumerate', 'abs', 'min', 'max'];

function keywordItems(language) {
  let kw = LUA_KEYWORDS, bi = LUA_BUILTINS;
  if (language === 'javascript') { kw = JS_KEYWORDS; bi = JS_BUILTINS; }
  else if (language === 'python') { kw = PY_KEYWORDS; bi = PY_BUILTINS; }
  return [
    ...kw.map((k) => ({ label: k, kind: 'keyword', detail: 'keyword', doc: '' })),
    ...bi.map((b) => ({ label: b, kind: 'builtin', detail: 'built-in', doc: '' })),
  ];
}

/* ------------------------------------------------------------------ parsing */

export function languageKey(id) {
  return id === 'javascript' ? 'javascript' : 'lua';
}

const IDENT = /[A-Za-z0-9_$]/;

// Generic depth-first walk over either parser's AST (both are plain nested
// objects whose nodes carry a string `type`). Skips position metadata.
function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const n of node) walk(n, visit); return; }
  if (typeof node.type === 'string') visit(node);
  for (const key in node) {
    if (key === 'loc' || key === 'range') continue;
    const v = node[key];
    if (v && typeof v === 'object') walk(v, visit);
  }
}

function sym(name, kind, detail, index, loc) {
  return { name, kind, detail, index: index ?? 0, line: loc?.start?.line ?? 0, col: loc?.start?.column ?? 0 };
}

function jsSignature(node) {
  const params = (node.params || []).map((p) => p.name || (p.type === 'RestElement' ? '…' : '?')).join(', ');
  return `function ${node.id ? node.id.name : ''}(${params})`;
}
function luaSignature(name, node) {
  const params = (node.parameters || []).map((p) => p.name || (p.type === 'VarargLiteral' ? '...' : '?')).join(', ');
  return `function ${name}(${params})`;
}

function collectJsSymbols(ast) {
  const syms = [];
  walk(ast, (node) => {
    if (node.type === 'FunctionDeclaration' && node.id) {
      syms.push(sym(node.id.name, 'function', jsSignature(node), node.id.start, node.id.loc));
    } else if (node.type === 'VariableDeclarator' && node.id && node.id.type === 'Identifier') {
      syms.push(sym(node.id.name, 'variable', 'variable', node.id.start, node.id.loc));
    }
    if (/Function/.test(node.type) && Array.isArray(node.params)) {
      for (const p of node.params) {
        if (p.type === 'Identifier') syms.push(sym(p.name, 'parameter', 'parameter', p.start, p.loc));
      }
    }
  });
  return syms;
}

function collectLuaSymbols(ast) {
  const syms = [];
  walk(ast, (node) => {
    if (node.type === 'FunctionDeclaration') {
      const id = node.identifier;
      if (id && id.type === 'Identifier') {
        syms.push(sym(id.name, 'function', luaSignature(id.name, node), id.range?.[0], id.loc));
      }
      for (const p of node.parameters || []) {
        if (p.type === 'Identifier') syms.push(sym(p.name, 'parameter', 'parameter', p.range?.[0], p.loc));
      }
    } else if (node.type === 'LocalStatement') {
      for (const v of node.variables || []) {
        if (v.type === 'Identifier') syms.push(sym(v.name, 'variable', 'local', v.range?.[0], v.loc));
      }
    }
  });
  return syms;
}

// Last successfully-parsed symbol table per language, reused when the current
// source is mid-edit and doesn't parse.
const lastGoodSymbols = { javascript: [], lua: [] };

/** Parse + analyze: returns { diagnostics, symbols }. Never throws. */
export function analyze(source, languageId) {
  const src = String(source ?? '');
  if (!src.trim()) return { diagnostics: [], symbols: [] };
  // Only JS and Lua have parsers here; Python (Tier-2) gets no diagnostics/symbols.
  if (languageId !== 'javascript' && languageId !== 'lua') return { diagnostics: [], symbols: [] };

  if (languageId === 'javascript') {
    try {
      const ast = parseJs(src, {
        ecmaVersion: 2023, locations: true, sourceType: 'script',
        allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true,
      });
      const symbols = dedupeSymbols(collectJsSymbols(ast));
      lastGoodSymbols.javascript = symbols;
      return { diagnostics: [], symbols };
    } catch (e) {
      const loc = e.loc || { line: 1, column: 0 };
      return {
        diagnostics: [{ severity: 'error', message: cleanMessage(e.message), line: loc.line, col: loc.column, index: e.pos ?? 0 }],
        symbols: lastGoodSymbols.javascript,
      };
    }
  }

  try {
    const ast = luaparse.parse(src, { locations: true, ranges: true, comments: false });
    const symbols = dedupeSymbols(collectLuaSymbols(ast));
    lastGoodSymbols.lua = symbols;
    return { diagnostics: [], symbols };
  } catch (e) {
    return {
      diagnostics: [{
        severity: 'error', message: cleanMessage(e.message),
        line: e.line ?? 1, col: e.column ?? 0, index: e.index ?? 0,
      }],
      symbols: lastGoodSymbols.lua,
    };
  }
}

function dedupeSymbols(syms) {
  const seen = new Set();
  const out = [];
  for (const s of syms) {
    if (seen.has(s.name)) continue;
    seen.add(s.name);
    out.push(s);
  }
  return out;
}

// "Unexpected token (1:13)" → "Unexpected token"; "[2:9] '(' expected near 'f'" → "'(' expected near 'f'".
function cleanMessage(msg) {
  return String(msg || 'Syntax error')
    .replace(/\s*\(\d+:\d+\)\s*$/, '')
    .replace(/^\s*\[\d+:\d+\]\s*/, '')
    .trim() || 'Syntax error';
}

/* --------------------------------------------------------------- word / caret */

/** The identifier surrounding `index` → { word, start, end }, or null. */
export function wordAt(source, index) {
  const src = String(source ?? '');
  let start = index, end = index;
  while (start > 0 && IDENT.test(src[start - 1])) start--;
  while (end < src.length && IDENT.test(src[end])) end++;
  if (start === end) return null;
  return { word: src.slice(start, end), start, end };
}

// The identifier prefix immediately before the caret (for completion).
function prefixBefore(source, caret) {
  let start = caret;
  while (start > 0 && IDENT.test(source[start - 1])) start--;
  return { prefix: source.slice(start, caret), start };
}

/* ----------------------------------------------------------------- completions */

/**
 * Completions for the caret at `caretIndex`.
 * Returns { from, to, options } where [from,to) is the range the chosen label replaces.
 * After a '.', offers value accessors (.value/.normalizedValue/.midiValue); otherwise
 * merges keywords, built-ins, panel API functions, and document symbols, filtered by prefix.
 */
export function getCompletions(source, languageId, caretIndex) {
  const src = String(source ?? '');
  const { prefix, start } = prefixBefore(src, caretIndex);

  // Member access: the char before the word is a dot.
  if (src[start - 1] === '.') {
    const opts = VALUE_ACCESSORS.map((a) => ({ label: a.id, kind: 'property', detail: a.label, doc: a.summary }));
    return { from: start, to: caretIndex, options: filterRank(opts, prefix) };
  }

  // Parse with the half-typed prefix removed so a trailing partial word doesn't break
  // the parse and hide the document's own symbols.
  const probeSource = src.slice(0, start) + src.slice(caretIndex);
  const { symbols } = analyze(probeSource, languageId);
  const symItems = symbols.map((s) => ({ label: s.name, kind: s.kind, detail: s.detail, doc: '' }));
  const pool = dedupeByLabel([...symItems, ...API_FUNCTIONS, ...keywordItems(languageId)]);
  return { from: start, to: caretIndex, options: filterRank(pool, prefix) };
}

function dedupeByLabel(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    if (seen.has(it.label)) continue;
    seen.add(it.label);
    out.push(it);
  }
  return out;
}

// Filter by case-insensitive prefix/substring and rank: startsWith before includes,
// document symbols and API above keywords, then alphabetical. Empty prefix → keep all.
function filterRank(items, prefix) {
  const p = String(prefix || '').toLowerCase();
  const kindRank = { variable: 0, parameter: 0, function: 1, property: 1, builtin: 2, keyword: 3 };
  const scored = [];
  for (const it of items) {
    const label = it.label.toLowerCase();
    if (!p) { scored.push([2, it]); continue; }
    if (label === p) continue; // exact full word — nothing to complete
    if (label.startsWith(p)) scored.push([0, it]);
    else if (label.includes(p)) scored.push([1, it]);
  }
  scored.sort((a, b) =>
    a[0] - b[0] ||
    (kindRank[a[1].kind] ?? 9) - (kindRank[b[1].kind] ?? 9) ||
    a[1].label.localeCompare(b[1].label));
  return scored.map(([, it]) => it).slice(0, 40);
}

/* --------------------------------------------------------------------- hover */

/** Hover info for the identifier at `index` → { title, doc } or null. */
export function getHover(source, languageId, index) {
  const w = wordAt(source, index);
  if (!w) return null;
  const name = w.word;

  // A declaration in this document.
  const { symbols } = analyze(source, languageId);
  const decl = symbols.find((s) => s.name === name);
  if (decl) return { title: decl.detail, doc: decl.kind === 'parameter' ? 'parameter' : '' };

  // Panel API function.
  if (API_BY_NAME[name]) return { title: API_BY_NAME[name].detail, doc: API_BY_NAME[name].doc };
  // Event handler name.
  if (EVENT_BY_FN[name]) return { title: `${name}(${EVENT_BY_FN[name].payload ?? ''})`, doc: EVENT_BY_FN[name].summary };
  // Value accessor / self.
  if (ACCESSOR_BY_ID[name]) return { title: `.${name}`, doc: ACCESSOR_BY_ID[name].summary };
  if (name === SELF.id) return { title: 'self', doc: SELF.summary };
  return null;
}

/* ---------------------------------------------------------------- definition */

/**
 * Signature help for the call enclosing `caret` → { name, params, activeParam } or null.
 * Scans backwards for the unmatched '(' and the identifier before it, counting top-level
 * commas to find the active argument. Looks the function up in the panel API, then the
 * document's own functions. (Heuristic: doesn't skip commas inside strings.)
 */
export function getSignatureHelp(source, languageId, caret) {
  const src = String(source ?? '');
  const pre = src.slice(0, caret);
  let depth = 0, commas = 0, i = pre.length - 1;
  for (; i >= 0; i--) {
    const c = pre[i];
    if (c === ')' || c === ']' || c === '}') depth++;
    else if (c === '(') { if (depth === 0) break; depth--; }
    else if (c === '[' || c === '{') { if (depth === 0) return null; depth--; }
    else if (c === ',' && depth === 0) commas++;
    else if (c === ';' && depth === 0) return null;
  }
  if (i < 0) return null;
  let j = i - 1;
  while (j >= 0 && /\s/.test(pre[j])) j--;
  if (j < 0) return null;
  const w = wordAt(src, j);
  if (!w) return null;

  let info = API_PARAMS[w.word];
  if (!info) {
    // Parse the source up to the current (likely incomplete) line so the call being
    // typed doesn't break the parse and hide the function's declaration.
    const lineStart = src.lastIndexOf('\n', caret - 1) + 1;
    const probe = src.slice(0, lineStart) || src;
    const fn = analyze(probe, languageId).symbols.find((s) => s.name === w.word && s.kind === 'function');
    if (fn) info = { name: w.word, params: paramsFromSignature(fn.detail), signature: fn.detail };
  }
  if (!info || info.params.length === 0) return null;
  return { name: info.name, params: info.params, activeParam: Math.min(commas, info.params.length - 1), signature: info.signature };
}

/** Source offset where the identifier at `index` is declared → { index, line, col } or null. */
export function getDefinition(source, languageId, index) {
  const w = wordAt(source, index);
  if (!w) return null;
  const { symbols } = analyze(source, languageId);
  // Prefer a function/variable declaration over a parameter.
  const order = { function: 0, variable: 1, parameter: 2 };
  const matches = symbols.filter((s) => s.name === w.word).sort((a, b) => (order[a.kind] ?? 3) - (order[b.kind] ?? 3));
  const def = matches[0];
  if (!def) return null;
  return { index: def.index, line: def.line, col: def.col };
}
