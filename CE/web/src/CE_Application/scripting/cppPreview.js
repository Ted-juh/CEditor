// cppPreview.js — a small interpreter for the C++ *behavior-handler subset*.
//
// True C++ is compiled into the exported plugin. This interpreter runs the subset that panel
// behavior handlers actually use, LIVE in the WebView preview, against the same panel API the
// Lua/JS runtimes use — so a C++ script moves real controls in the editor without a compiler.
//
// SUPPORTED
//   • void handlers, e.g.  void onPanelReady(CeContext& ctx, const CeEvent& event) { … }
//   • user-defined helper functions (callable from handlers, recursion ok), lambdas (with capture)
//   • structs with data members AND methods (implicit `this`), enums / enum class, std::pair
//   • variable decls: int/double/float/bool/char/auto/const/long/short/unsigned/size_t/string and
//     user types (Type name = expr;), comma lists, C arrays + brace initializers
//   • containers: std::vector / std::array (.size/.push_back/.at/.back/.front/.empty/.clear),
//     std::map / std::unordered_map (operator[], .count/.contains/.at/.size/.empty/.erase/.clear),
//     std::string (.size/.length/.substr/.find/.empty/.at)
//   • assignment (= += -= *= /= %=), prefix/postfix ++/--, nullptr
//   • if/else, for, range-based for, while, switch/case (fallthrough), return, break, continue
//   • arithmetic + - * / %, comparison, &&/|| (short-circuit), ternary ?:, unary !/-/+
//   • calls: ctx.method(…), member a.b / a->b, indexing a[i], math builtins (std:: forms ok)
//   • <algorithm>/<numeric> over iterators: sort (with comparator), reverse, accumulate, find/find_if,
//     count/count_if, max_element/min_element, fill, iota, for_each, distance, begin/end; *it, ++it
//   • top-level global variables / constants; do/while; comma operator; bitwise & | ^
//   • string literals + concatenation; (int)x and static_cast<int>(x) casts
//   • std::cout << … << std::endl and printf(…) → the script console
//
// NOT SUPPORTED (raises a clear error instead of mis-running): templates you define, classes with
// methods, pointer arithmetic, struct member functions, lambdas, goto, exceptions, iterators.
// Integer division is not truncated (numbers are doubles) — a preview approximation.

const TYPE_WORDS = new Set([
  'int', 'double', 'float', 'bool', 'char', 'void', 'auto', 'long', 'short', 'unsigned',
  'signed', 'size_t', 'string', 'wchar_t', 'int8_t', 'int16_t', 'int32_t', 'int64_t',
  'uint8_t', 'uint16_t', 'uint32_t', 'uint64_t',
]);
const DECL_LEADERS = new Set([...TYPE_WORDS, 'const', 'constexpr', 'static']);
const INT_CASTS = new Set(['int', 'long', 'short', 'unsigned', 'size_t', 'char',
  'int8_t', 'int16_t', 'int32_t', 'int64_t', 'uint8_t', 'uint16_t', 'uint32_t', 'uint64_t']);

const BINPREC = { '||': 1, '&&': 2, '|': 3, '^': 4, '&': 5, '==': 6, '!=': 6, '<': 7, '<=': 7, '>': 7, '>=': 7, '+': 8, '-': 8, '*': 9, '/': 9, '%': 9 };

// A random-access iterator over a JS array, used by std::begin/end and the algorithms below.
class CppIter { constructor(container, pos) { this.container = container; this.pos = pos; } }

const spreadable = (a) => (a.length === 1 && Array.isArray(a[0]) ? a[0] : a);
const BUILTINS = {
  min: (...a) => Math.min(...spreadable(a)), max: (...a) => Math.max(...spreadable(a)), abs: Math.abs, fabs: Math.abs,
  floor: Math.floor, ceil: Math.ceil, round: Math.round, trunc: Math.trunc,
  sqrt: Math.sqrt, pow: Math.pow, fmod: (a, b) => a % b,
  sin: Math.sin, cos: Math.cos, tan: Math.tan, exp: Math.exp, log: Math.log, log10: Math.log10,
  clamp: (v, lo, hi) => Math.min(hi, Math.max(lo, v)),
  to_string: (x) => String(x), stoi: (x) => parseInt(x, 10), stod: (x) => parseFloat(x), stof: (x) => parseFloat(x),
  static_cast: (x) => x, reinterpret_cast: (x) => x, const_cast: (x) => x, dynamic_cast: (x) => x,
  make_pair: (a, b) => ({ first: a, second: b }), swap: () => {},
  M_PI: Math.PI, M_E: Math.E, npos: -1,
  // <algorithm> / <numeric> over [first, last) iterator ranges
  sort: (f, l, cmp) => { const c = f.container, a = c.slice(f.pos, l.pos); a.sort(cmp ? (x, y) => (cmp(x, y) ? -1 : cmp(y, x) ? 1 : 0) : (x, y) => x - y); for (let k = 0; k < a.length; k++) c[f.pos + k] = a[k]; },
  stable_sort: (f, l, cmp) => BUILTINS.sort(f, l, cmp),
  reverse: (f, l) => { const c = f.container; let i = f.pos, j = l.pos - 1; while (i < j) { const t = c[i]; c[i] = c[j]; c[j] = t; i++; j--; } },
  accumulate: (f, l, init, op) => { const c = f.container; let a = init; for (let i = f.pos; i < l.pos; i++) a = op ? op(a, c[i]) : a + c[i]; return a; },
  count: (f, l, v) => { const c = f.container; let n = 0; for (let i = f.pos; i < l.pos; i++) if (c[i] === v) n++; return n; },
  count_if: (f, l, p) => { const c = f.container; let n = 0; for (let i = f.pos; i < l.pos; i++) if (p(c[i])) n++; return n; },
  find: (f, l, v) => { const c = f.container; for (let i = f.pos; i < l.pos; i++) if (c[i] === v) return new CppIter(c, i); return new CppIter(c, l.pos); },
  find_if: (f, l, p) => { const c = f.container; for (let i = f.pos; i < l.pos; i++) if (p(c[i])) return new CppIter(c, i); return new CppIter(c, l.pos); },
  max_element: (f, l) => { const c = f.container; let b = f.pos; for (let i = f.pos + 1; i < l.pos; i++) if (c[i] > c[b]) b = i; return new CppIter(c, b); },
  min_element: (f, l) => { const c = f.container; let b = f.pos; for (let i = f.pos + 1; i < l.pos; i++) if (c[i] < c[b]) b = i; return new CppIter(c, b); },
  fill: (f, l, v) => { const c = f.container; for (let i = f.pos; i < l.pos; i++) c[i] = v; },
  iota: (f, l, v) => { const c = f.container; let x = v; for (let i = f.pos; i < l.pos; i++) c[i] = x++; },
  for_each: (f, l, fn) => { const c = f.container; for (let i = f.pos; i < l.pos; i++) fn(c[i]); },
  distance: (f, l) => l.pos - f.pos,
  begin: (c) => new CppIter(c, 0), end: (c) => new CppIter(c, c.length),
};

/* ------------------------------------------------------------------------ tokenizer */

const SPECS = [
  ['skip', /(?:[ \t\r\n]+|#[^\n]*|\/\/[^\n]*|\/\*[\s\S]*?\*\/)/y],
  ['num', /(?:0[xX][0-9a-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)[fFuUlL]*/y],
  ['str', /"(?:\\.|[^"\\])*"/y],
  ['char', /'(?:\\.|[^'\\])'/y],
  ['id', /[A-Za-z_]\w*/y],
  ['op', /==|!=|<=|>=|&&|\|\||\+\+|--|\+=|-=|\*=|\/=|%=|->|::|<<|>>|[+\-*/%=<>!?:.,;(){}\[\]&|~^]/y],
];

function unescape(s) {
  return s.replace(/\\(.)/g, (_, c) => ({ n: '\n', t: '\t', r: '\r', '0': '\0', '"': '"', "'": "'", '\\': '\\' }[c] ?? c));
}

function tokenize(src) {
  const toks = [];
  let i = 0, line = 1;
  while (i < src.length) {
    let matched = false;
    for (const [type, re] of SPECS) {
      re.lastIndex = i;
      const m = re.exec(src);
      if (!m || m.index !== i) continue;
      const text = m[0];
      if (type === 'skip') { for (const ch of text) if (ch === '\n') line++; i += text.length; matched = true; break; }
      let value = text;
      if (type === 'num') value = text[1] === 'x' || text[1] === 'X' ? parseInt(text, 16) : parseFloat(text.replace(/[fFuUlL]+$/, ''));
      else if (type === 'str') value = unescape(text.slice(1, -1));
      else if (type === 'char') value = unescape(text.slice(1, -1)).charCodeAt(0);
      toks.push({ type: type === 'num' || type === 'str' || type === 'char' ? type : type, value, line });
      i += text.length; matched = true; break;
    }
    if (!matched) throw new Error(`unexpected character '${src[i]}' at line ${line}`);
  }
  toks.push({ type: 'eof', value: null, line });
  return toks;
}

/* --------------------------------------------------------------- function extraction */

function matchClose(toks, openIdx, open, close) {
  let depth = 0;
  for (let j = openIdx; j < toks.length; j++) {
    if (toks[j].value === open) depth++;
    else if (toks[j].value === close) { depth--; if (depth === 0) return j; }
  }
  throw new Error(`unbalanced '${open}' (started line ${toks[openIdx].line})`);
}

// Find every `name ( … ) { … }` — a function definition — ignoring the return type entirely.
function extractFunctions(toks) {
  const fns = [];
  let i = 0;
  while (i < toks.length) {
    const t = toks[i];
    if (t.type === 'id' && toks[i + 1] && toks[i + 1].value === '(') {
      const pEnd = matchClose(toks, i + 1, '(', ')');
      if (toks[pEnd + 1] && toks[pEnd + 1].value === '{') {
        const bEnd = matchClose(toks, pEnd + 1, '{', '}');
        fns.push({ name: t.value, paramToks: toks.slice(i + 2, pEnd), bodyToks: toks.slice(pEnd + 2, bEnd) });
        i = bEnd + 1; continue;
      }
    }
    i++;
  }
  return fns;
}

// Top-level `struct Name { … };` (data members) and `enum [class] Name { … }` definitions.
function extractTypes(toks) {
  const structs = new Map(), enums = new Map(), diagnostics = [];
  let i = 0;
  while (i < toks.length) {
    const t = toks[i];
    if (t.type === 'id' && t.value === 'struct' && toks[i + 1]?.type === 'id' && toks[i + 2]?.value === '{') {
      const name = toks[i + 1].value;
      const bEnd = matchClose(toks, i + 2, '{', '}');
      try { structs.set(name, parseStructMembers(toks.slice(i + 3, bEnd))); }
      catch (e) { diagnostics.push(`struct ${name}: ${e.message ?? e}`); }
      i = bEnd + 1; continue;
    }
    if (t.type === 'id' && t.value === 'enum') {
      let j = i + 1;
      if (toks[j]?.value === 'class' || toks[j]?.value === 'struct') j++;
      if (toks[j]?.type === 'id') j++;
      while (toks[j] && toks[j].value !== '{' && toks[j].value !== ';') j++;
      if (toks[j]?.value === '{') {
        const bEnd = matchClose(toks, j, '{', '}');
        parseEnumerators(toks.slice(j + 1, bEnd), enums);
        i = bEnd + 1; continue;
      }
    }
    i++;
  }
  return { structs, enums, diagnostics };
}

// Top-level global variables / constants (so handlers can reference `const int kMax = 127;`).
// Skips struct/enum/function/using definitions; evaluates each remaining decl into program.globals.
function extractGlobals(toks, program) {
  const globals = new Map();
  let i = 0;
  while (i < toks.length) {
    const t = toks[i];
    if (t.type === 'id' && (t.value === 'struct' || t.value === 'class' || t.value === 'enum' || t.value === 'union')) {
      let j = i; while (j < toks.length && toks[j].value !== '{' && toks[j].value !== ';') j++;
      if (toks[j]?.value === '{') { i = matchClose(toks, j, '{', '}') + 1; if (toks[i]?.value === ';') i++; } else i = j + 1;
      continue;
    }
    if (t.type === 'id' && ['using', 'namespace', 'typedef', 'template', 'friend', 'extern'].includes(t.value)) {
      let j = i; while (j < toks.length && toks[j].value !== ';' && toks[j].value !== '{') j++;
      if (toks[j]?.value === '{') { i = matchClose(toks, j, '{', '}') + 1; if (toks[i]?.value === ';') i++; } else i = j + 1;
      continue;
    }
    if (t.type === 'id') {
      let j = i, name = null, nameIdx = -1, isFunc = false, isDecl = false;
      while (j < toks.length) {
        const v = toks[j].value;
        if (v === '<') { let d = 0; do { if (toks[j].value === '<') d++; else if (toks[j].value === '>') d--; j++; } while (d > 0 && j < toks.length); continue; }
        if (v === ';' || v === '{' || v === '}') break;
        if (toks[j].type === 'id') {
          const nx = toks[j + 1]?.value;
          if (nx === '(') { name = toks[j].value; nameIdx = j; isFunc = true; break; }
          if (nx === '=' || nx === ';' || nx === ',' || nx === '[') { name = toks[j].value; nameIdx = j; isDecl = true; break; }
        }
        j++;
      }
      if (isFunc) {
        const pEnd = matchClose(toks, nameIdx + 1, '(', ')');
        if (toks[pEnd + 1]?.value === '{') { i = matchClose(toks, pEnd + 1, '{', '}') + 1; } else { i = pEnd + 1; if (toks[i]?.value === ';') i++; }
        continue;
      }
      if (isDecl) {
        let k = i, d = 0;
        while (k < toks.length && !(toks[k].value === ';' && d === 0)) { if ('([{'.includes(toks[k].value)) d++; if (')]}'.includes(toks[k].value)) d--; k++; }
        try {
          const decl = new Parser([...toks.slice(i, k), { type: 'op', value: ';' }, { type: 'eof', value: null }]).parseDecl();
          const env = new Env(null);
          env.define('__program', program);
          for (const [n, v] of program.enums) env.define(n, v);
          for (const [n, v] of globals) env.define(n, v);
          for (const dcl of decl.decls) globals.set(dcl.name, declDefault(dcl, env));
        } catch { /* not a global var decl — ignore */ }
        i = k + 1; continue;
      }
    }
    i++;
  }
  return globals;
}

function parseStructMembers(toks) {
  const fields = [], methods = new Map();
  let i = 0;
  while (i < toks.length) {
    if (['public', 'private', 'protected'].includes(toks[i]?.value)) { i++; if (toks[i]?.value === ':') i++; continue; }
    if (toks[i]?.value === ';') { i++; continue; }
    // Walk type specifiers to the declarator name; field vs method by the token after the name.
    let j = i, name = null, nameIdx = -1, isMethod = false;
    while (j < toks.length) {
      const v = toks[j].value;
      if (v === '<') { let d = 0; do { if (toks[j].value === '<') d++; else if (toks[j].value === '>') d--; j++; } while (d > 0 && j < toks.length); continue; }
      if (v === '{' || v === '}') break;
      if (toks[j].type === 'id') {
        const nx = toks[j + 1]?.value;
        if (nx === '(') { name = toks[j].value; nameIdx = j; isMethod = true; break; }
        if (nx === '=' || nx === ';' || nx === ',' || nx === '[') { name = toks[j].value; nameIdx = j; break; }
      }
      j++;
    }
    if (name === null) break;
    if (isMethod) {
      const pOpen = nameIdx + 1, pEnd = matchClose(toks, pOpen, '(', ')');
      if (toks[pEnd + 1]?.value === '{') {
        const bEnd = matchClose(toks, pEnd + 1, '{', '}');
        methods.set(name, { params: paramNames(toks.slice(pOpen + 1, pEnd)), bodyToks: toks.slice(pEnd + 2, bEnd), body: null });
        i = bEnd + 1;
      } else { i = pEnd + 1; if (toks[i]?.value === ';') i++; } // prototype only
    } else {
      let k = i, d = 0;
      while (k < toks.length && !(toks[k].value === ';' && d === 0)) { if ('([{'.includes(toks[k].value)) d++; if (')]}'.includes(toks[k].value)) d--; k++; }
      const p = new Parser([...toks.slice(i, k), { type: 'op', value: ';' }, { type: 'eof', value: null }]);
      for (const decl of p.parseDecl().decls) fields.push(decl);
      i = k + 1;
    }
  }
  return { fields, methods };
}

function parseEnumerators(toks, enums) {
  let val = 0, i = 0;
  while (i < toks.length) {
    if (toks[i].type !== 'id') { i++; continue; }
    const name = toks[i].value; i++;
    if (toks[i]?.value === '=') {
      i++; const start = i; let depth = 0;
      while (i < toks.length && !(toks[i].value === ',' && depth === 0)) { if ('([{'.includes(toks[i].value)) depth++; if (')]}'.includes(toks[i].value)) depth--; i++; }
      try { val = evalConst(toks.slice(start, i)); } catch { /* keep running value */ }
    }
    enums.set(name, val);
    val = (typeof val === 'number' ? val : 0) + 1;
    if (toks[i]?.value === ',') i++;
  }
}

function evalConst(toks) {
  return evalNode(new Parser([...toks, { type: 'eof', value: null }]).parseExpr(), new Env(null));
}

// Parameter NAME = the last identifier in each comma-separated segment (`const CeEvent& event` → event).
function paramNames(paramToks) {
  const names = [];
  let seg = [], depth = 0;
  const flush = () => {
    const ids = seg.filter((t) => t.type === 'id' && !DECL_LEADERS.has(t.value));
    if (ids.length) names.push(ids[ids.length - 1].value);
    else if (seg.some((t) => t.type === 'id')) names.push(seg.filter((t) => t.type === 'id').pop().value);
    seg = [];
  };
  for (const t of paramToks) {
    if (t.value === '(' || t.value === '[' || t.value === '<') depth++;
    else if (t.value === ')' || t.value === ']' || t.value === '>') depth--;
    if (t.value === ',' && depth === 0) { flush(); continue; }
    seg.push(t);
  }
  if (seg.length) flush();
  return names;
}

/* ----------------------------------------------------------------------------- parser */

class Parser {
  constructor(toks) { this.t = toks; this.i = 0; }
  peek(o = 0) { return this.t[this.i + o] ?? { type: 'eof', value: null }; }
  next() { return this.t[this.i++] ?? { type: 'eof', value: null }; }
  isV(v) { const k = this.peek(); return k.value === v; }
  eat(v) { if (!this.isV(v)) throw new Error(`expected '${v}' but found '${this.peek().value}' (line ${this.peek().line})`); return this.next(); }
  atEnd() { return this.peek().type === 'eof'; }

  parseProgram() { const s = []; while (!this.atEnd()) s.push(this.parseStatement()); return s; }

  parseBlock() { this.eat('{'); const s = []; while (!this.isV('}') && !this.atEnd()) s.push(this.parseStatement()); this.eat('}'); return { type: 'block', body: s }; }

  isDeclStart() {
    const k = this.peek();
    if (k.type !== 'id') return false;
    if (DECL_LEADERS.has(k.value)) return true;
    // Scan a (possibly qualified / templated / pointer) type, then require a declarator name after
    // it — so `std::vector<int> v` is a decl but `std::sort(...)` (a call) is not.
    let i = this.i + 1;
    while (this.t[i]?.value === '::' && this.t[i + 1]?.type === 'id') i += 2;
    if (this.t[i]?.value === '<') { let d = 0; do { const v = this.t[i]?.value; if (v === '<') d++; else if (v === '>') d--; i++; } while (d > 0 && i < this.t.length); }
    while (this.t[i]?.value === '*' || this.t[i]?.value === '&') i++;
    return this.t[i]?.type === 'id';
  }

  parseStatement() {
    const k = this.peek();
    if (k.value === '{') return this.parseBlock();
    if (k.value === ';') { this.next(); return { type: 'empty' }; }
    if (this.isCoutStart()) return this.parseCout();
    if (k.type === 'id') {
      switch (k.value) {
        case 'if': return this.parseIf();
        case 'for': return this.parseFor();
        case 'while': return this.parseWhile();
        case 'switch': return this.parseSwitch();
        case 'do': { this.next(); const body = this.parseStatement(); this.eat('while'); this.eat('('); const cond = this.parseExpr(); this.eat(')'); this.eat(';'); return { type: 'doWhile', body, cond }; }
        case 'return': { this.next(); const e = this.isV(';') ? null : this.parseExpr(); this.eat(';'); return { type: 'return', expr: e }; }
        case 'break': this.next(); this.eat(';'); return { type: 'break' };
        case 'continue': this.next(); this.eat(';'); return { type: 'continue' };
        case 'goto': case 'class': case 'struct': case 'template': case 'using': case 'namespace':
          throw new Error(`'${k.value}' is not supported in the C++ preview (line ${k.line})`);
        default: break;
      }
      if (this.isDeclStart()) return this.parseDecl();
    }
    const e = this.parseExpr(); this.eat(';'); return { type: 'exprStmt', expr: e };
  }

  isCoutStart() {
    const a = this.peek();
    if (a.value === 'cout' || a.value === 'cerr') return true;
    return a.value === 'std' && this.peek(1).value === '::' && (this.peek(2).value === 'cout' || this.peek(2).value === 'cerr');
  }

  parseCout() {
    if (this.isV('std')) { this.next(); this.eat('::'); }
    this.next(); // cout / cerr
    const parts = [];
    while (this.isV('<<')) { this.next(); parts.push(this.parseAssign()); }
    this.eat(';');
    return { type: 'cout', parts };
  }

  parseSwitch() {
    this.eat('switch'); this.eat('('); const disc = this.parseExpr(); this.eat(')'); this.eat('{');
    const clauses = [];
    while (!this.isV('}') && !this.atEnd()) {
      if (this.isV('case')) { this.next(); const t = this.parseExpr(); this.eat(':'); clauses.push({ test: t, stmts: [] }); }
      else if (this.isV('default')) { this.next(); this.eat(':'); clauses.push({ test: null, stmts: [] }); }
      else { if (!clauses.length) throw new Error(`statement before first case (line ${this.peek().line})`); clauses[clauses.length - 1].stmts.push(this.parseStatement()); }
    }
    this.eat('}');
    return { type: 'switch', disc, clauses };
  }

  parseIf() {
    this.eat('if'); this.eat('('); const cond = this.parseExpr(); this.eat(')');
    const then = this.parseStatement();
    let els = null;
    if (this.isV('else')) { this.next(); els = this.parseStatement(); }
    return { type: 'if', cond, then, els };
  }

  parseFor() {
    this.eat('for'); this.eat('(');
    // Range-based for: for (auto x : container)
    if (this.isDeclStart()) {
      const save = this.i;
      const name = this.parseDeclaratorName();
      if (name && this.isV(':')) {
        this.next(); const iterable = this.parseExpr(); this.eat(')');
        return { type: 'forEach', varName: name, iterable, body: this.parseStatement() };
      }
      this.i = save; // not a range-for — reparse as a classic for
    }
    let init = null;
    if (!this.isV(';')) init = this.isDeclStart() ? this.parseDecl(true) : { type: 'exprStmt', expr: this.parseCommaExpr() };
    this.eat(';');
    const cond = this.isV(';') ? null : this.parseExpr(); this.eat(';');
    const update = this.isV(')') ? null : this.parseCommaExpr(); this.eat(')');
    return { type: 'for', init, cond, update, body: this.parseStatement() };
  }

  // Comma operator (used in for-init / for-update): evaluate each, yield the last.
  parseCommaExpr() {
    const first = this.parseAssign();
    if (!this.isV(',')) return first;
    const list = [first];
    while (this.isV(',') && this.next()) list.push(this.parseAssign());
    return { type: 'seq', list };
  }

  // Consume type specifiers + one declarator name, returning the name (for range-for detection).
  parseDeclaratorName() {
    for (;;) {
      const k = this.peek();
      if (k.value === '<') { this.skipAngles(); continue; }
      if (k.value === '*' || k.value === '&' || k.value === '::') { this.next(); continue; }
      if (k.type === 'id') {
        const nx = this.peek(1).value;
        if (nx === ':' || nx === '=' || nx === ';' || nx === ')') return this.next().value;
        this.next(); continue;
      }
      return null;
    }
  }

  parseWhile() { this.eat('while'); this.eat('('); const cond = this.parseExpr(); this.eat(')'); return { type: 'while', cond, body: this.parseStatement() }; }

  skipAngles() { let d = 0; do { const v = this.next().value; if (v === '<') d++; else if (v === '>') d--; } while (d > 0 && !this.atEnd()); }

  parseDecl(noSemi = false) {
    // Consume type specifiers up to the declarator name; note the kind for a sensible default value.
    let typeHint = 'num', typeName = '';
    for (;;) {
      const k = this.peek();
      if (k.value === '<') { this.skipAngles(); continue; }
      if (k.value === '*' || k.value === '&' || k.value === '::') { this.next(); continue; }
      if (k.type === 'id') {
        if (k.value === 'string') typeHint = 'string';
        else if (k.value === 'vector' || k.value === 'array') typeHint = 'array';
        const nx = this.peek(1).value;
        if (nx === '=' || nx === ';' || nx === ',' || nx === '[' || nx === ')') break; // k is the name
        typeName = k.value; this.next(); continue; // part of the type
      }
      break;
    }
    const decls = [];
    do {
      const nameTok = this.next();
      if (nameTok.type !== 'id') throw new Error(`expected a variable name (line ${nameTok.line})`);
      let isArray = false, arrayLen = null;
      if (this.isV('[')) { isArray = true; this.next(); arrayLen = this.isV(']') ? null : this.parseAssign(); this.eat(']'); }
      let init = null;
      if (this.isV('=')) { this.next(); init = this.parseInitializer(); }
      decls.push({ name: nameTok.value, init, isArray, arrayLen, typeHint, typeName });
    } while (this.isV(',') && this.next());
    if (!noSemi) this.eat(';');
    return { type: 'decl', decls };
  }

  parseInitializer() { return this.isV('{') ? this.parseArrayLiteral() : this.parseAssign(); }
  parseArrayLiteral() {
    this.eat('{'); const elems = [];
    if (!this.isV('}')) do { if (this.isV('}')) break; elems.push(this.parseInitializer()); } while (this.isV(',') && this.next());
    this.eat('}');
    return { type: 'array', elems };
  }

  parseExpr() { return this.parseAssign(); }

  parseAssign() {
    const left = this.parseTernary();
    const k = this.peek();
    if (k.type === 'op' && ['=', '+=', '-=', '*=', '/=', '%='].includes(k.value)) {
      this.next();
      return { type: 'assign', op: k.value, target: left, value: this.parseAssign() };
    }
    return left;
  }

  parseTernary() {
    const c = this.parseBinary(1);
    if (this.isV('?')) { this.next(); const a = this.parseAssign(); this.eat(':'); const b = this.parseAssign(); return { type: 'cond', c, a, b }; }
    return c;
  }

  parseBinary(minPrec) {
    let left = this.parseUnary();
    for (;;) {
      const k = this.peek();
      if (k.type !== 'op' || !(k.value in BINPREC) || BINPREC[k.value] < minPrec) break;
      const op = k.value; const prec = BINPREC[op]; this.next();
      left = { type: 'bin', op, left, right: this.parseBinary(prec + 1) };
    }
    return left;
  }

  parseUnary() {
    const k = this.peek();
    if (k.value === '*') { this.next(); return { type: 'deref', arg: this.parseUnary() }; } // *iterator
    if (k.type === 'op' && (k.value === '!' || k.value === '-' || k.value === '+')) { this.next(); return { type: 'unary', op: k.value, arg: this.parseUnary() }; }
    if (k.value === '++' || k.value === '--') { this.next(); return { type: 'preincr', op: k.value, arg: this.parseUnary() }; }
    // C-style cast: ( typeword ) expr
    if (k.value === '(' && this.peek(1).type === 'id' && TYPE_WORDS.has(this.peek(1).value) && this.peek(2).value === ')') {
      this.next(); const t = this.next().value; this.eat(')'); return { type: 'cast', t, arg: this.parseUnary() };
    }
    return this.parsePostfix();
  }

  parsePostfix() {
    let e = this.parsePrimary();
    for (;;) {
      const k = this.peek();
      if (k.value === '.' || k.value === '->') { this.next(); e = { type: 'member', obj: e, name: this.next().value }; }
      else if (k.value === '(') { this.next(); const args = this.parseArgs(); this.eat(')'); e = { type: 'call', callee: e, args }; }
      else if (k.value === '[') { this.next(); const idx = this.parseAssign(); this.eat(']'); e = { type: 'index', obj: e, index: idx }; }
      else if (k.value === '++' || k.value === '--') { this.next(); e = { type: 'postincr', op: k.value, arg: e }; }
      else break;
    }
    return e;
  }

  parseArgs() { const a = []; if (this.isV(')')) return a; do { a.push(this.parseAssign()); } while (this.isV(',') && this.next()); return a; }

  parseLambda() {
    this.eat('['); { let d = 1; while (d > 0 && !this.atEnd()) { const v = this.next().value; if (v === '[') d++; else if (v === ']') d--; } } // skip captures
    let params = [];
    if (this.isV('(')) { this.next(); const start = this.i; let d = 1; while (d > 0 && !this.atEnd()) { const v = this.next().value; if (v === '(') d++; else if (v === ')') d--; } params = paramNames(this.t.slice(start, this.i - 1)); }
    if (this.isV('->')) { while (!this.isV('{') && !this.atEnd()) this.next(); } // skip trailing return type
    return { type: 'lambda', params, body: this.parseBlock().body };
  }

  parsePrimary() {
    if (this.isV('{')) return this.parseArrayLiteral();
    if (this.isV('[')) return this.parseLambda();
    const k = this.next();
    if (k.type === 'num' || k.type === 'char') return { type: 'num', value: k.value };
    if (k.type === 'str') return { type: 'str', value: k.value };
    if (k.value === '(') { const e = this.parseAssign(); this.eat(')'); return e; }
    if (k.type === 'id') {
      let name = k.value;
      while (this.isV('::')) { this.next(); name = this.next().value; } // namespace-qualified → last segment
      if (/cast$/.test(name) && this.isV('<')) this.skipAngles();       // static_cast<T> → drop the <T>
      if (name === 'true') return { type: 'num', value: 1, bool: true };
      if (name === 'false') return { type: 'num', value: 0, bool: true };
      if (name === 'nullptr' || name === 'NULL') return { type: 'num', value: 0 };
      return { type: 'ident', name };
    }
    throw new Error(`unexpected '${k.value}' (line ${k.line})`);
  }
}

/* ------------------------------------------------------------------------ interpreter */

class ReturnSignal { constructor(value) { this.value = value; } }
const BREAK = Symbol('break'), CONTINUE = Symbol('continue');

function truthy(v) { return typeof v === 'number' ? v !== 0 : typeof v === 'boolean' ? v : v != null; }
function cppStr(v) { return typeof v === 'boolean' ? (v ? '1' : '0') : String(v); }

// Default value for a declaration with no initializer, from its type (struct / map / vector / …).
function declDefault(d, env) {
  if (d.init) {
    // pair p = {a, b}  →  { first, second }
    if (d.typeName === 'pair' && d.init.type === 'array' && d.init.elems.length === 2) {
      return { first: evalNode(d.init.elems[0], env), second: evalNode(d.init.elems[1], env) };
    }
    return evalNode(d.init, env);
  }
  if (d.isArray) return new Array(Math.max(0, (d.arrayLen ? evalNode(d.arrayLen, env) : 0) | 0)).fill(0);
  const prog = env.get('__program');
  if (prog && prog.structs && prog.structs.has(d.typeName)) return constructStruct(prog.structs.get(d.typeName), env);
  if (d.typeName === 'map' || d.typeName === 'unordered_map') return new Map();
  if (d.typeName === 'pair') return { first: 0, second: 0 };
  if (d.typeHint === 'array') return [];
  if (d.typeHint === 'string' || d.typeName === 'string') return '';
  return 0;
}

function constructStruct(def, env) {
  const prog = env.get('__program');
  const obj = {};
  for (const f of def.fields) obj[f.name] = declDefault(f, env);
  if (def.methods) for (const [mname, m] of def.methods) {
    obj[mname] = (...args) => {
      if (!m.body) m.body = new Parser([...m.bodyToks, { type: 'eof', value: null }]).parseProgram();
      return runBody(m.body, m.params, prog, obj, args);
    };
  }
  return obj;
}

// std::vector / std::array / std::string member functions, mapped onto JS arrays/strings.
function containerMethod(obj, name) {
  if (obj instanceof Map) {
    switch (name) {
      case 'size': return () => obj.size;
      case 'empty': return () => obj.size === 0;
      case 'count': return (k) => (obj.has(k) ? 1 : 0);
      case 'contains': return (k) => obj.has(k);
      case 'at': return (k) => obj.get(k);
      case 'erase': return (k) => { obj.delete(k); };
      case 'clear': return () => obj.clear();
    }
  }
  if (Array.isArray(obj)) {
    switch (name) {
      case 'size': case 'length': return () => obj.length;
      case 'push_back': return (x) => { obj.push(x); };
      case 'pop_back': return () => obj.pop();
      case 'at': return (i) => obj[i];
      case 'back': return () => obj[obj.length - 1];
      case 'front': return () => obj[0];
      case 'empty': return () => obj.length === 0;
      case 'clear': return () => { obj.length = 0; };
      case 'begin': case 'cbegin': return () => new CppIter(obj, 0);
      case 'end': case 'cend': return () => new CppIter(obj, obj.length);
      case 'resize': return (n) => { obj.length = n | 0; for (let i = 0; i < obj.length; i++) if (obj[i] === undefined) obj[i] = 0; };
    }
  } else if (typeof obj === 'string') {
    switch (name) {
      case 'size': case 'length': return () => obj.length;
      case 'empty': return () => obj.length === 0;
      case 'at': return (i) => obj[i];
      case 'substr': return (a, b) => (b === undefined ? obj.substr(a) : obj.substr(a, b));
      case 'find': return (s) => obj.indexOf(s);
      case 'c_str': case 'data': return () => obj;
      case 'back': return () => obj[obj.length - 1];
      case 'front': return () => obj[0];
    }
  }
  return undefined;
}

// Minimal printf: substitute %d/%i/%f/%g/%s/%c in order, ignoring width/precision flags.
function formatPrintf(args) {
  let i = 1;
  return String(args[0] ?? '').replace(/%%|%[-+ 0-9.]*[dioxXfgGeEsc]/g, (m) => (m === '%%' ? '%' : cppStr(args[i++])));
}

class Env {
  constructor(parent) { this.vars = new Map(); this.parent = parent; }
  has(n) { return this.vars.has(n) || (this.parent ? this.parent.has(n) : false); }
  get(n) { return this.vars.has(n) ? this.vars.get(n) : this.parent ? this.parent.get(n) : undefined; }
  set(n, v) { let e = this; while (e) { if (e.vars.has(n)) { e.vars.set(n, v); return; } e = e.parent; } this.vars.set(n, v); }
  define(n, v) { this.vars.set(n, v); }
}

function lvalue(node, env) {
  if (node.type === 'ident') {
    if (!env.has(node.name)) {
      const self = env.get('this');
      if (self && typeof self === 'object' && node.name in self) return { get: () => self[node.name], set: (v) => { self[node.name] = v; } };
    }
    return { get: () => env.get(node.name), set: (v) => env.set(node.name, v) };
  }
  if (node.type === 'deref') { const it = evalNode(node.arg, env); if (it instanceof CppIter) return { get: () => it.container[it.pos], set: (v) => { it.container[it.pos] = v; } }; throw new Error('cannot dereference'); }
  if (node.type === 'member') { const o = evalNode(node.obj, env); return { get: () => o?.[node.name], set: (v) => { o[node.name] = v; } }; }
  if (node.type === 'index') {
    const o = evalNode(node.obj, env); const k = evalNode(node.index, env);
    if (o instanceof Map) return { get: () => (o.has(k) ? o.get(k) : 0), set: (v) => o.set(k, v) };
    return { get: () => o?.[k], set: (v) => { o[k] = v; } };
  }
  throw new Error('invalid assignment target');
}

function applyBin(op, a, b) {
  switch (op) {
    case '+': return a + b; case '-': return a - b; case '*': return a * b; case '/': return a / b; case '%': return a % b;
    case '==': return (a instanceof CppIter && b instanceof CppIter) ? (a.container === b.container && a.pos === b.pos) : a === b;
    case '!=': return (a instanceof CppIter && b instanceof CppIter) ? !(a.container === b.container && a.pos === b.pos) : a !== b;
    case '<': return a < b; case '<=': return a <= b; case '>': return a > b; case '>=': return a >= b;
    case '&': return a & b; case '|': return a | b; case '^': return a ^ b;
  }
  throw new Error(`unsupported operator '${op}'`);
}

function evalNode(node, env) {
  switch (node.type) {
    case 'num': return node.value;
    case 'str': return node.value;
    case 'ident': {
      if (env.has(node.name)) return env.get(node.name);
      const self = env.get('this');
      if (self && typeof self === 'object' && node.name in self) return self[node.name];
      if (node.name in BUILTINS) return BUILTINS[node.name];
      throw new Error(`'${node.name}' is not defined`);
    }
    case 'array': return node.elems.map((e) => evalNode(e, env));
    case 'seq': { let v; for (const e of node.list) v = evalNode(e, env); return v; }
    case 'lambda': {
      const captured = env;
      return (...args) => {
        const fenv = new Env(captured);
        node.params.forEach((p, i) => fenv.define(p, args[i]));
        try { for (const s of node.body) execStmt(s, fenv); }
        catch (e) { if (e instanceof ReturnSignal) return e.value; if (e === BREAK || e === CONTINUE) return undefined; throw e; }
      };
    }
    case 'member': {
      const o = evalNode(node.obj, env);
      if (o == null) return undefined;
      return containerMethod(o, node.name) ?? o[node.name];
    }
    case 'index': {
      const o = evalNode(node.obj, env); const k = evalNode(node.index, env);
      if (o instanceof Map) return o.has(k) ? o.get(k) : 0;
      return o == null ? undefined : o[k];
    }
    case 'call': {
      if (node.callee.type === 'ident' && node.callee.name === 'printf') {
        (env.get('__print') || (() => {}))(formatPrintf(node.args.map((a) => evalNode(a, env))));
        return undefined;
      }
      let fn, thisArg;
      if (node.callee.type === 'member') { thisArg = evalNode(node.callee.obj, env); fn = containerMethod(thisArg, node.callee.name) ?? (thisArg == null ? undefined : thisArg[node.callee.name]); }
      else { fn = evalNode(node.callee, env); }
      if (typeof fn !== 'function') {
        const nm = node.callee.type === 'member' ? node.callee.name : node.callee.name ?? 'value';
        throw new Error(`'${nm}' is not callable in the C++ preview`);
      }
      return fn.apply(thisArg, node.args.map((a) => evalNode(a, env)));
    }
    case 'bin': {
      if (node.op === '&&') return truthy(evalNode(node.left, env)) ? truthy(evalNode(node.right, env)) : false;
      if (node.op === '||') return truthy(evalNode(node.left, env)) ? true : truthy(evalNode(node.right, env));
      return applyBin(node.op, evalNode(node.left, env), evalNode(node.right, env));
    }
    case 'unary': { const v = evalNode(node.arg, env); return node.op === '!' ? !truthy(v) : node.op === '-' ? -v : +v; }
    case 'deref': { const it = evalNode(node.arg, env); if (it instanceof CppIter) return it.container[it.pos]; throw new Error('cannot dereference a non-iterator'); }
    case 'cond': return truthy(evalNode(node.c, env)) ? evalNode(node.a, env) : evalNode(node.b, env);
    case 'cast': { const v = evalNode(node.arg, env); return INT_CASTS.has(node.t) ? Math.trunc(v) : v; }
    case 'assign': {
      const lv = lvalue(node.target, env);
      const rhs = evalNode(node.value, env);
      const v = node.op === '=' ? rhs : applyBin(node.op[0], lv.get(), rhs);
      lv.set(v); return v;
    }
    case 'preincr': { const lv = lvalue(node.arg, env); const cur = lv.get(); if (cur instanceof CppIter) { cur.pos += node.op === '++' ? 1 : -1; return cur; } const v = cur + (node.op === '++' ? 1 : -1); lv.set(v); return v; }
    case 'postincr': { const lv = lvalue(node.arg, env); const cur = lv.get(); if (cur instanceof CppIter) { const old = new CppIter(cur.container, cur.pos); cur.pos += node.op === '++' ? 1 : -1; return old; } lv.set(cur + (node.op === '++' ? 1 : -1)); return cur; }
    default: throw new Error(`cannot evaluate ${node.type}`);
  }
}

function execStmt(node, env) {
  switch (node.type) {
    case 'empty': return;
    case 'exprStmt': evalNode(node.expr, env); return;
    case 'cout': {
      let s = '';
      for (const p of node.parts) s += (p.type === 'ident' && p.name === 'endl') ? '\n' : cppStr(evalNode(p, env));
      (env.get('__print') || (() => {}))(s);
      return;
    }
    case 'decl': for (const d of node.decls) env.define(d.name, declDefault(d, env)); return;
    case 'block': { const inner = new Env(env); for (const s of node.body) execStmt(s, inner); return; }
    case 'if': if (truthy(evalNode(node.cond, env))) execStmt(node.then, env); else if (node.els) execStmt(node.els, env); return;
    case 'while': while (truthy(evalNode(node.cond, env))) { try { execStmt(node.body, env); } catch (e) { if (e === BREAK) break; if (e !== CONTINUE) throw e; } } return;
    case 'doWhile': do { try { execStmt(node.body, env); } catch (e) { if (e === BREAK) break; if (e !== CONTINUE) throw e; } } while (truthy(evalNode(node.cond, env))); return;
    case 'forEach': {
      const it = evalNode(node.iterable, env);
      const list = typeof it === 'string' ? it.split('') : Array.isArray(it) ? it : [];
      for (const el of list) {
        const inner = new Env(env); inner.define(node.varName, el);
        try { execStmt(node.body, inner); } catch (e) { if (e === BREAK) break; if (e !== CONTINUE) throw e; }
      }
      return;
    }
    case 'switch': {
      const d = evalNode(node.disc, env);
      let start = node.clauses.findIndex((c) => c.test !== null && evalNode(c.test, env) === d);
      if (start < 0) start = node.clauses.findIndex((c) => c.test === null);
      if (start < 0) return;
      const inner = new Env(env);
      try { for (let ci = start; ci < node.clauses.length; ci++) for (const s of node.clauses[ci].stmts) execStmt(s, inner); }
      catch (e) { if (e === BREAK) return; throw e; }
      return;
    }
    case 'for': {
      const inner = new Env(env);
      if (node.init) execStmt(node.init, inner);
      while (node.cond ? truthy(evalNode(node.cond, inner)) : true) {
        try { execStmt(node.body, inner); } catch (e) { if (e === BREAK) break; if (e !== CONTINUE) throw e; }
        if (node.update) evalNode(node.update, inner);
      }
      return;
    }
    case 'return': throw new ReturnSignal(node.expr ? evalNode(node.expr, env) : undefined);
    case 'break': throw BREAK;
    case 'continue': throw CONTINUE;
    default: throw new Error(`cannot execute ${node.type}`);
  }
}

/* --------------------------------------------------------------------------- public */

/** Parse a C++ source into runnable handler functions. → { handlers: Map<name, fnNode>, diagnostics } */
export function compileCpp(source) {
  const diagnostics = [];
  const handlers = new Map();
  const program = { funcs: new Map(), structs: new Map(), enums: new Map(), globals: new Map(), print: null };
  let toks;
  try { toks = tokenize(String(source ?? '')); }
  catch (e) { return { handlers, diagnostics: [String(e.message ?? e)] }; }
  const types = extractTypes(toks);
  for (const [n, s] of types.structs) program.structs.set(n, s);
  for (const [n, v] of types.enums) program.enums.set(n, v);
  diagnostics.push(...types.diagnostics);
  let fns;
  try { fns = extractFunctions(toks); }
  catch (e) { return { handlers, diagnostics: [...diagnostics, String(e.message ?? e)] }; }
  for (const fn of fns) {
    try {
      fn.params = paramNames(fn.paramToks);
      fn.body = new Parser(fn.bodyToks).parseProgram();
      fn.program = program;
      program.funcs.set(fn.name, fn);
      handlers.set(fn.name, fn);
    } catch (e) { diagnostics.push(`${fn.name}: ${e.message ?? e}`); }
  }
  try { for (const [n, v] of extractGlobals(toks, program)) program.globals.set(n, v); }
  catch (e) { diagnostics.push(`globals: ${e.message ?? e}`); }
  return { handlers, diagnostics };
}

/** Invoke a parsed handler. `args` bind to its params positionally (ctx, event). opts.print
 *  receives anything written via std::cout / printf. Helper functions in the same source are
 *  callable (and may recurse). */
// Core runner: build a scope (program funcs + enums, optional `this`), bind params, execute.
function runBody(body, params, program, thisObj, args) {
  const env = new Env(null);
  env.define('__program', program ?? null);
  env.define('__print', program?.print ?? (() => {}));
  if (thisObj) env.define('this', thisObj);
  if (program) {
    for (const [name, v] of program.globals) env.define(name, v);
    for (const [name, v] of program.enums) env.define(name, v);
    for (const [name, f] of program.funcs) env.define(name, (...a) => runBody(f.body, f.params, program, null, a));
  }
  (params ?? []).forEach((name, idx) => env.define(name, args[idx]));
  try { for (const s of body) execStmt(s, env); }
  catch (e) { if (e instanceof ReturnSignal) return e.value; if (e === BREAK || e === CONTINUE) return undefined; throw e; }
  return undefined;
}

export function invokeCpp(fnNode, args = [], opts = {}) {
  const program = fnNode.program;
  if (program && opts.print) program.print = opts.print;
  return runBody(fnNode.body, fnNode.params, program, null, args);
}
