// cppPreview.js — a small interpreter for the C++ *behavior-handler subset*.
//
// True C++ is compiled into the exported plugin. This interpreter runs the subset that panel
// behavior handlers actually use, LIVE in the WebView preview, against the same panel API the
// Lua/JS runtimes use — so a C++ script moves real controls in the editor without a compiler.
//
// SUPPORTED
//   • void handlers, e.g.  void onPanelReady(CeContext& ctx, const CeEvent& event) { … }
//   • variable decls: int/double/float/bool/char/auto/const/long/short/unsigned/size_t/string and
//     user types (Type name = expr;), including comma lists (int a = 0, b = 1;)
//   • assignment (= += -= *= /= %=), prefix/postfix ++/--
//   • if/else, for, while, return, break, continue, blocks
//   • arithmetic + - * / %, comparison, &&/|| (short-circuit), ternary ?:, unary !/-/+
//   • calls: ctx.method(…), member a.b / a->b, indexing a[i], math builtins (std:: forms ok)
//   • string literals + concatenation; (int)x and static_cast<int>(x) casts
//
// NOT SUPPORTED (raises a clear error instead of mis-running): templates, classes/structs,
// pointer arithmetic, STL containers, lambdas, switch/goto, iostream. Integer division is not
// truncated (numbers are doubles) — a preview approximation, noted to the user.

const TYPE_WORDS = new Set([
  'int', 'double', 'float', 'bool', 'char', 'void', 'auto', 'long', 'short', 'unsigned',
  'signed', 'size_t', 'string', 'wchar_t', 'int8_t', 'int16_t', 'int32_t', 'int64_t',
  'uint8_t', 'uint16_t', 'uint32_t', 'uint64_t',
]);
const DECL_LEADERS = new Set([...TYPE_WORDS, 'const', 'constexpr', 'static']);
const INT_CASTS = new Set(['int', 'long', 'short', 'unsigned', 'size_t', 'char',
  'int8_t', 'int16_t', 'int32_t', 'int64_t', 'uint8_t', 'uint16_t', 'uint32_t', 'uint64_t']);

const BINPREC = { '||': 1, '&&': 2, '==': 3, '!=': 3, '<': 4, '<=': 4, '>': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6 };

const BUILTINS = {
  min: Math.min, max: Math.max, abs: Math.abs, fabs: Math.abs,
  floor: Math.floor, ceil: Math.ceil, round: Math.round, trunc: Math.trunc,
  sqrt: Math.sqrt, pow: Math.pow, fmod: (a, b) => a % b,
  sin: Math.sin, cos: Math.cos, tan: Math.tan, exp: Math.exp, log: Math.log, log10: Math.log10,
  clamp: (v, lo, hi) => Math.min(hi, Math.max(lo, v)),
  to_string: (x) => String(x), stoi: (x) => parseInt(x, 10), stod: (x) => parseFloat(x), stof: (x) => parseFloat(x),
  static_cast: (x) => x, reinterpret_cast: (x) => x, const_cast: (x) => x, dynamic_cast: (x) => x,
  M_PI: Math.PI, M_E: Math.E,
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
    if (this.peek(1).type === 'id') return true;       // UserType name
    if (this.peek(1).value === '::') return true;       // ns::Type name
    return false;
  }

  parseStatement() {
    const k = this.peek();
    if (k.value === '{') return this.parseBlock();
    if (k.value === ';') { this.next(); return { type: 'empty' }; }
    if (k.type === 'id') {
      switch (k.value) {
        case 'if': return this.parseIf();
        case 'for': return this.parseFor();
        case 'while': return this.parseWhile();
        case 'return': { this.next(); const e = this.isV(';') ? null : this.parseExpr(); this.eat(';'); return { type: 'return', expr: e }; }
        case 'break': this.next(); this.eat(';'); return { type: 'break' };
        case 'continue': this.next(); this.eat(';'); return { type: 'continue' };
        case 'switch': case 'goto': case 'class': case 'struct': case 'template': case 'using': case 'namespace':
          throw new Error(`'${k.value}' is not supported in the C++ preview (line ${k.line})`);
        default: break;
      }
      if (this.isDeclStart()) return this.parseDecl();
    }
    const e = this.parseExpr(); this.eat(';'); return { type: 'exprStmt', expr: e };
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
    let init = null;
    if (!this.isV(';')) init = this.isDeclStart() ? this.parseDecl(true) : { type: 'exprStmt', expr: this.parseExpr() };
    this.eat(';');
    const cond = this.isV(';') ? null : this.parseExpr(); this.eat(';');
    const update = this.isV(')') ? null : this.parseExpr(); this.eat(')');
    return { type: 'for', init, cond, update, body: this.parseStatement() };
  }

  parseWhile() { this.eat('while'); this.eat('('); const cond = this.parseExpr(); this.eat(')'); return { type: 'while', cond, body: this.parseStatement() }; }

  skipAngles() { let d = 0; do { const v = this.next().value; if (v === '<') d++; else if (v === '>') d--; } while (d > 0 && !this.atEnd()); }

  parseDecl(noSemi = false) {
    // Consume type specifiers up to the declarator name.
    for (;;) {
      const k = this.peek();
      if (k.value === '<') { this.skipAngles(); continue; }
      if (k.value === '*' || k.value === '&' || k.value === '::') { this.next(); continue; }
      if (k.type === 'id') {
        const nx = this.peek(1).value;
        if (nx === '=' || nx === ';' || nx === ',' || nx === '[' || nx === ')') break; // k is the name
        this.next(); continue; // part of the type
      }
      break;
    }
    const decls = [];
    do {
      const nameTok = this.next();
      if (nameTok.type !== 'id') throw new Error(`expected a variable name (line ${nameTok.line})`);
      if (this.isV('[')) throw new Error(`arrays are not supported in the C++ preview (line ${nameTok.line})`);
      let init = null;
      if (this.isV('=')) { this.next(); init = this.parseAssign(); }
      decls.push({ name: nameTok.value, init });
    } while (this.isV(',') && this.next());
    if (!noSemi) this.eat(';');
    return { type: 'decl', decls };
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

  parsePrimary() {
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
      return { type: 'ident', name };
    }
    throw new Error(`unexpected '${k.value}' (line ${k.line})`);
  }
}

/* ------------------------------------------------------------------------ interpreter */

class ReturnSignal { constructor(value) { this.value = value; } }
const BREAK = Symbol('break'), CONTINUE = Symbol('continue');

function truthy(v) { return typeof v === 'number' ? v !== 0 : typeof v === 'boolean' ? v : v != null; }

class Env {
  constructor(parent) { this.vars = new Map(); this.parent = parent; }
  has(n) { return this.vars.has(n) || (this.parent ? this.parent.has(n) : false); }
  get(n) { return this.vars.has(n) ? this.vars.get(n) : this.parent ? this.parent.get(n) : undefined; }
  set(n, v) { let e = this; while (e) { if (e.vars.has(n)) { e.vars.set(n, v); return; } e = e.parent; } this.vars.set(n, v); }
  define(n, v) { this.vars.set(n, v); }
}

function lvalue(node, env) {
  if (node.type === 'ident') return { get: () => env.get(node.name), set: (v) => env.set(node.name, v) };
  if (node.type === 'member') { const o = evalNode(node.obj, env); return { get: () => o?.[node.name], set: (v) => { o[node.name] = v; } }; }
  if (node.type === 'index') { const o = evalNode(node.obj, env); const k = evalNode(node.index, env); return { get: () => o?.[k], set: (v) => { o[k] = v; } }; }
  throw new Error('invalid assignment target');
}

function applyBin(op, a, b) {
  switch (op) {
    case '+': return a + b; case '-': return a - b; case '*': return a * b; case '/': return a / b; case '%': return a % b;
    case '==': return a === b; case '!=': return a !== b;
    case '<': return a < b; case '<=': return a <= b; case '>': return a > b; case '>=': return a >= b;
  }
  throw new Error(`unsupported operator '${op}'`);
}

function evalNode(node, env) {
  switch (node.type) {
    case 'num': return node.value;
    case 'str': return node.value;
    case 'ident': {
      if (env.has(node.name)) return env.get(node.name);
      if (node.name in BUILTINS) return BUILTINS[node.name];
      throw new Error(`'${node.name}' is not defined`);
    }
    case 'member': { const o = evalNode(node.obj, env); return o == null ? undefined : o[node.name]; }
    case 'index': { const o = evalNode(node.obj, env); return o == null ? undefined : o[evalNode(node.index, env)]; }
    case 'call': {
      let fn, thisArg;
      if (node.callee.type === 'member') { thisArg = evalNode(node.callee.obj, env); fn = thisArg == null ? undefined : thisArg[node.callee.name]; }
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
    case 'cond': return truthy(evalNode(node.c, env)) ? evalNode(node.a, env) : evalNode(node.b, env);
    case 'cast': { const v = evalNode(node.arg, env); return INT_CASTS.has(node.t) ? Math.trunc(v) : v; }
    case 'assign': {
      const lv = lvalue(node.target, env);
      const rhs = evalNode(node.value, env);
      const v = node.op === '=' ? rhs : applyBin(node.op[0], lv.get(), rhs);
      lv.set(v); return v;
    }
    case 'preincr': { const lv = lvalue(node.arg, env); const v = lv.get() + (node.op === '++' ? 1 : -1); lv.set(v); return v; }
    case 'postincr': { const lv = lvalue(node.arg, env); const old = lv.get(); lv.set(old + (node.op === '++' ? 1 : -1)); return old; }
    default: throw new Error(`cannot evaluate ${node.type}`);
  }
}

function execStmt(node, env) {
  switch (node.type) {
    case 'empty': return;
    case 'exprStmt': evalNode(node.expr, env); return;
    case 'decl': for (const d of node.decls) env.define(d.name, d.init ? evalNode(d.init, env) : 0); return;
    case 'block': { const inner = new Env(env); for (const s of node.body) execStmt(s, inner); return; }
    case 'if': if (truthy(evalNode(node.cond, env))) execStmt(node.then, env); else if (node.els) execStmt(node.els, env); return;
    case 'while': while (truthy(evalNode(node.cond, env))) { try { execStmt(node.body, env); } catch (e) { if (e === BREAK) break; if (e !== CONTINUE) throw e; } } return;
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
  let fns;
  try { fns = extractFunctions(tokenize(String(source ?? ''))); }
  catch (e) { return { handlers, diagnostics: [String(e.message ?? e)] }; }
  for (const fn of fns) {
    try { fn.params = paramNames(fn.paramToks); fn.body = new Parser(fn.bodyToks).parseProgram(); handlers.set(fn.name, fn); }
    catch (e) { diagnostics.push(`${fn.name}: ${e.message ?? e}`); }
  }
  return { handlers, diagnostics };
}

/** Invoke a parsed handler. `args` are bound to its parameters positionally (ctx, event). */
export function invokeCpp(fnNode, args = []) {
  const env = new Env(null);
  (fnNode.params ?? []).forEach((name, idx) => env.define(name, args[idx]));
  try { for (const s of fnNode.body) execStmt(s, env); }
  catch (e) { if (e instanceof ReturnSignal) return e.value; if (e === BREAK || e === CONTINUE) return undefined; throw e; }
  return undefined;
}
