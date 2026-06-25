// javaPreview.js — interpreter for the Java *behavior-handler subset*, so Java scripts run live in
// the WebView preview (real Java would compile to a native export). Same design as cppPreview/
// csharpPreview, with Java idioms: -> lambdas, enhanced for (`for (T x : coll)`), method-style
// collections (ArrayList.size()/get()/add(), HashMap.put()/get()), System.out.println, Math.*,
// StringBuilder, classes, enums, try/catch.
//
// NOT SUPPORTED (clear diagnostic): generics you define, streams/lambda chains beyond simple use,
// threads/synchronized, reflection, annotations with logic, var-args. Those raise a diagnostic.

const TYPE_WORDS = new Set(['int', 'long', 'short', 'byte', 'double', 'float', 'boolean', 'char',
  'void', 'var', 'String', 'Object', 'Integer', 'Long', 'Double', 'Float', 'Boolean', 'Character', 'Number']);
const DECL_LEADERS = new Set([...TYPE_WORDS, 'final', 'static', 'public', 'private', 'protected', 'abstract', 'synchronized', 'transient', 'volatile', 'native']);
const MODIFIERS = new Set(['public', 'private', 'protected', 'static', 'final', 'abstract', 'synchronized', 'transient', 'volatile', 'native', 'strictfp', 'default']);
const BINPREC = { '||': 2, '&&': 3, '|': 4, '^': 5, '&': 6, '==': 7, '!=': 7, '<': 8, '<=': 8, '>': 8, '>=': 8, '<<': 9, '>>': 9, '>>>': 9, '+': 10, '-': 10, '*': 11, '/': 11, '%': 11 };
const INT_CASTS = new Set(['int', 'long', 'short', 'byte', 'char', 'Integer', 'Long']);

class ReturnSignal { constructor(value) { this.value = value; } }
class JavaThrow { constructor(value) { this.value = value; } }
const BREAK = Symbol('break'), CONTINUE = Symbol('continue');

/* ------------------------------------------------------------------------- tokenizer */

const SPECS = [
  ['skip', /(?:[ \t\r\n]+|@[A-Za-z_][\w.]*(?:\([^()]*\))?|\/\/[^\n]*|\/\*[\s\S]*?\*\/)/y],
  ['num', /(?:0[xX][0-9a-fA-F_]+|(?:[\d_]+\.?[\d_]*|\.[\d_]+)(?:[eE][+-]?\d+)?)[fFdDlL]*/y],
  ['str', /"(?:\\.|[^"\\])*"/y],
  ['char', /'(?:\\.|[^'\\])'/y],
  ['id', /[A-Za-z_$][\w$]*/y],
  ['op', /->|==|!=|<=|>=|&&|\|\||\+\+|--|\+=|-=|\*=|\/=|%=|::|>>>|>>|<<|[+\-*/%=<>!?:.,;(){}\[\]&|~^]/y],
];

function unescape(s) { return s.replace(/\\(.)/g, (_, c) => ({ n: '\n', t: '\t', r: '\r', '0': '\0', '"': '"', "'": "'", '\\': '\\' }[c] ?? c)); }

function tokenize(src) {
  const toks = []; let i = 0, line = 1;
  while (i < src.length) {
    let matched = false;
    for (const [type, re] of SPECS) {
      re.lastIndex = i; const m = re.exec(src);
      if (!m || m.index !== i) continue;
      const text = m[0];
      if (type === 'skip') { for (const ch of text) if (ch === '\n') line++; i += text.length; matched = true; break; }
      let value = text;
      if (type === 'num') value = (text[1] === 'x' || text[1] === 'X') ? parseInt(text.replace(/_/g, ''), 16) : parseFloat(text.replace(/[_fFdDlL]/g, ''));
      else if (type === 'str') value = unescape(text.slice(1, -1));
      else if (type === 'char') value = unescape(text.slice(1, -1)).charCodeAt(0);
      toks.push({ type, value, line, index: i });
      for (const ch of text) if (ch === '\n') line++;
      i += text.length; matched = true; break;
    }
    if (!matched) throw new Error(`unexpected character '${src[i]}' at line ${line}`);
  }
  toks.push({ type: 'eof', value: null, line, index: src.length });
  return toks;
}

function matchClose(toks, openIdx, open, close) {
  let depth = 0;
  for (let j = openIdx; j < toks.length; j++) { if (toks[j].value === open) depth++; else if (toks[j].value === close) { depth--; if (depth === 0) return j; } }
  throw new Error(`unbalanced '${open}' (line ${toks[openIdx].line})`);
}

function paramNames(paramToks) {
  const names = []; let seg = [], depth = 0;
  const flush = () => { const ids = seg.filter((t) => t.type === 'id' && !DECL_LEADERS.has(t.value) && !TYPE_WORDS.has(t.value)); if (ids.length) names.push(ids[ids.length - 1].value); else { const any = seg.filter((t) => t.type === 'id'); if (any.length) names.push(any[any.length - 1].value); } seg = []; };
  for (const t of paramToks) { if (t.value === '(' || t.value === '[' || t.value === '<') depth++; else if (t.value === ')' || t.value === ']' || t.value === '>') depth--; if (t.value === ',' && depth === 0) { flush(); continue; } seg.push(t); }
  if (seg.length) flush();
  return names;
}

function extractFunctions(toks) {
  const fns = []; let i = 0;
  while (i < toks.length) {
    const t = toks[i];
    if (t.type === 'id' && toks[i + 1] && toks[i + 1].value === '(' && !TYPE_WORDS.has(t.value)) {
      const pEnd = matchClose(toks, i + 1, '(', ')');
      if (toks[pEnd + 1] && toks[pEnd + 1].value === '{') {
        const bEnd = matchClose(toks, pEnd + 1, '{', '}');
        fns.push({ name: t.value, line: t.line, index: t.index, paramToks: toks.slice(i + 2, pEnd), bodyToks: toks.slice(pEnd + 2, bEnd) });
        i = bEnd + 1; continue;
      }
    }
    i++;
  }
  return fns;
}

/* ----------------------------------------------------------------------------- parser */

class Parser {
  constructor(toks) { this.t = toks; this.i = 0; }
  peek(o = 0) { return this.t[this.i + o] ?? { type: 'eof', value: null }; }
  next() { return this.t[this.i++] ?? { type: 'eof', value: null }; }
  isV(v) { return this.peek().value === v; }
  eat(v) { if (!this.isV(v)) throw new Error(`expected '${v}' but found '${this.peek().value}' (line ${this.peek().line})`); return this.next(); }
  atEnd() { return this.peek().type === 'eof'; }

  parseProgram() { const s = []; while (!this.atEnd()) s.push(this.parseStatement()); return s; }
  parseBlock() { this.eat('{'); const s = []; while (!this.isV('}') && !this.atEnd()) s.push(this.parseStatement()); this.eat('}'); return { type: 'block', body: s }; }

  isDeclStart() {
    const k = this.peek();
    if (k.type !== 'id') return false;
    if (DECL_LEADERS.has(k.value)) return true;
    let i = this.i + 1;
    if (this.t[i]?.value === '<') { let d = 0; do { const v = this.t[i]?.value; if (v === '<') d++; else if (v === '>') d--; i++; } while (d > 0 && i < this.t.length); }
    while (this.t[i]?.value === '[' && this.t[i + 1]?.value === ']') i += 2;
    return this.t[i]?.type === 'id';
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
        case 'do': { this.next(); const body = this.parseStatement(); this.eat('while'); this.eat('('); const cond = this.parseExpr(); this.eat(')'); this.eat(';'); return { type: 'doWhile', body, cond }; }
        case 'switch': return this.parseSwitch();
        case 'return': { this.next(); const e = this.isV(';') ? null : this.parseExpr(); this.eat(';'); return { type: 'return', expr: e }; }
        case 'break': this.next(); this.eat(';'); return { type: 'break' };
        case 'continue': this.next(); this.eat(';'); return { type: 'continue' };
        case 'throw': { this.next(); const e = this.isV(';') ? null : this.parseExpr(); this.eat(';'); return { type: 'throw', expr: e }; }
        case 'try': return this.parseTry();
        case 'synchronized': case 'assert': case 'yield':
          throw new Error(`'${k.value}' is not supported in the Java preview (line ${k.line})`);
        default: break;
      }
      if (this.isDeclStart()) return this.parseDecl();
    }
    const e = this.parseExpr(); this.eat(';'); return { type: 'exprStmt', expr: e };
  }

  parseIf() { this.eat('if'); this.eat('('); const cond = this.parseExpr(); this.eat(')'); const then = this.parseStatement(); let els = null; if (this.isV('else')) { this.next(); els = this.parseStatement(); } return { type: 'if', cond, then, els }; }
  parseWhile() { this.eat('while'); this.eat('('); const cond = this.parseExpr(); this.eat(')'); return { type: 'while', cond, body: this.parseStatement() }; }

  parseFor() {
    this.eat('for'); const open = this.i; this.eat('(');
    const close = matchClose(this.t, open, '(', ')');
    let depth = 0, isEach = false, hasSemi = false;
    for (let j = open + 1; j < close; j++) { const v = this.t[j].value; if ('([{'.includes(v)) depth++; else if (')]}'.includes(v)) depth--; else if (depth === 0 && v === ':') isEach = true; else if (depth === 0 && v === ';') hasSemi = true; }
    if (isEach && !hasSemi) {
      let name = null;
      while (!this.isV(':') && !this.atEnd()) { if (this.isV('<')) { this.skipAngles(); continue; } const t = this.next(); if (t.type === 'id') name = t.value; }
      this.eat(':'); const iterable = this.parseExpr(); this.eat(')');
      return { type: 'foreach', name, iterable, body: this.parseStatement() };
    }
    let init = null;
    if (!this.isV(';')) init = this.isDeclStart() ? this.parseDecl(true) : { type: 'exprStmt', expr: this.parseCommaExpr() };
    this.eat(';');
    const cond = this.isV(';') ? null : this.parseExpr(); this.eat(';');
    const update = this.isV(')') ? null : this.parseCommaExpr(); this.eat(')');
    return { type: 'for', init, cond, update, body: this.parseStatement() };
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

  parseTry() {
    this.eat('try');
    if (this.isV('(')) { let d = 1; this.next(); while (d > 0 && !this.atEnd()) { const v = this.next().value; if (v === '(') d++; else if (v === ')') d--; } } // try-with-resources head (ignored)
    const block = this.parseBlock(); const catches = []; let fin = null;
    while (this.isV('catch')) {
      this.next(); let param = null;
      if (this.isV('(')) { this.next(); const start = this.i; let d = 1; while (d > 0 && !this.atEnd()) { const v = this.next().value; if (v === '(') d++; else if (v === ')') d--; } const ids = this.t.slice(start, this.i - 1).filter((tk) => tk.type === 'id' && !DECL_LEADERS.has(tk.value)); param = ids.length ? ids[ids.length - 1].value : null; }
      catches.push({ param, body: this.parseBlock() });
    }
    if (this.isV('finally')) { this.next(); fin = this.parseBlock(); }
    return { type: 'try', block, catches, fin };
  }

  skipAngles() { let d = 0; do { const v = this.next().value; if (v === '<') d++; else if (v === '>') d--; } while (d > 0 && !this.atEnd()); }

  parseDecl(noSemi = false) {
    let typeName = '';
    for (;;) {
      const k = this.peek();
      if (k.value === '<') { this.skipAngles(); continue; }
      if (k.value === '[' && this.peek(1).value === ']') { this.next(); this.next(); continue; }
      if (k.value === '.') { this.next(); continue; }
      if (k.type === 'id') { const nx = this.peek(1).value; if (nx === '=' || nx === ';' || nx === ',' || nx === ')' || nx === '(' || nx === '[' || nx === ':') break; if (!MODIFIERS.has(k.value)) typeName = k.value; this.next(); continue; }
      break;
    }
    const decls = [];
    do {
      const nameTok = this.next();
      if (nameTok.type !== 'id') throw new Error(`expected a variable name (line ${nameTok.line})`);
      let init = null, ctorArgs = null;
      if (this.isV('[')) { this.next(); const len = this.isV(']') ? null : this.parseAssign(); this.eat(']'); init = { type: 'arrayNew', len }; }
      else if (this.isV('=')) { this.next(); init = this.parseInitializer(); }
      decls.push({ name: nameTok.value, init, ctorArgs, typeName });
    } while (this.isV(',') && this.next());
    if (!noSemi) this.eat(';');
    return { type: 'decl', decls };
  }

  parseInitializer() { return this.isV('{') ? this.parseArrayLiteral() : this.parseAssign(); }
  parseArrayLiteral() { this.eat('{'); const elems = []; if (!this.isV('}')) do { if (this.isV('}')) break; elems.push(this.parseInitializer()); } while (this.isV(',') && this.next()); this.eat('}'); return { type: 'array', elems }; }
  parseCommaExpr() { const first = this.parseAssign(); if (!this.isV(',')) return first; const list = [first]; while (this.isV(',') && this.next()) list.push(this.parseAssign()); return { type: 'seq', list }; }
  parseExpr() { return this.parseAssign(); }

  parseAssign() {
    const left = this.parseLambdaOr();
    const k = this.peek();
    if (k.type === 'op' && ['=', '+=', '-=', '*=', '/=', '%='].includes(k.value)) { this.next(); return { type: 'assign', op: k.value, target: left, value: this.parseAssign() }; }
    return left;
  }

  parseLambdaOr() {
    if (this.peek().type === 'id' && this.peek(1).value === '->') { const p = this.next().value; this.eat('->'); return { type: 'lambda', params: [p], body: this.lambdaBody() }; }
    if (this.isV('(')) { const close = matchClose(this.t, this.i, '(', ')'); if (this.t[close + 1]?.value === '->') { this.next(); const params = paramNames(this.t.slice(this.i, close)); this.i = close + 1; this.eat('->'); return { type: 'lambda', params, body: this.lambdaBody() }; } }
    return this.parseTernary();
  }
  lambdaBody() { if (this.isV('{')) return { block: this.parseBlock().body }; return { expr: this.parseAssign() }; }

  parseTernary() { const c = this.parseBinary(1); if (this.isV('?')) { this.next(); const a = this.parseAssign(); this.eat(':'); const b = this.parseAssign(); return { type: 'cond', c, a, b }; } return c; }

  parseBinary(minPrec) {
    let left = this.parseUnary();
    for (;;) {
      const k = this.peek();
      if (k.type === 'id' && k.value === 'instanceof' && 8 >= minPrec) { this.next(); while ((this.peek().type === 'id') || this.isV('.') || (this.isV('[') && this.peek(1).value === ']')) { this.next(); if (this.isV('<')) this.skipAngles(); } left = { type: 'instanceof', left }; continue; }
      if (k.type !== 'op' || !(k.value in BINPREC) || BINPREC[k.value] < minPrec) break;
      const op = k.value, prec = BINPREC[op]; this.next();
      left = { type: 'bin', op, left, right: this.parseBinary(prec + 1) };
    }
    return left;
  }

  parseUnary() {
    const k = this.peek();
    if (k.type === 'op' && (k.value === '!' || k.value === '-' || k.value === '+' || k.value === '~')) { this.next(); return { type: 'unary', op: k.value, arg: this.parseUnary() }; }
    if (k.value === '++' || k.value === '--') { this.next(); return { type: 'preincr', op: k.value, arg: this.parseUnary() }; }
    if (k.value === '(' && this.peek(1).type === 'id' && TYPE_WORDS.has(this.peek(1).value) && this.peek(2).value === ')') { this.next(); const t = this.next().value; this.eat(')'); return { type: 'cast', t, arg: this.parseUnary() }; }
    return this.parsePostfix();
  }

  parsePostfix() {
    let e = this.parsePrimary();
    for (;;) {
      const k = this.peek();
      if (k.value === '.') { this.next(); e = { type: 'member', obj: e, name: this.next().value }; }
      else if (k.value === '::') { this.next(); e = { type: 'member', obj: e, name: this.next().value }; } // method reference ≈ member
      else if (k.value === '(') { this.next(); const args = this.parseArgs(); this.eat(')'); e = { type: 'call', callee: e, args }; }
      else if (k.value === '[') { this.next(); const idx = this.parseAssign(); this.eat(']'); e = { type: 'index', obj: e, index: idx }; }
      else if (k.value === '++' || k.value === '--') { this.next(); e = { type: 'postincr', op: k.value, arg: e }; }
      else break;
    }
    return e;
  }

  parseArgs() { const a = []; if (this.isV(')')) return a; do { a.push(this.parseAssign()); } while (this.isV(',') && this.next()); return a; }

  parseNew() {
    this.eat('new');
    let typeName = '';
    while (this.peek().type === 'id' || this.isV('.')) { if (this.peek().type === 'id') typeName = this.peek().value; this.next(); if (this.isV('<')) this.skipAngles(); }
    if (this.isV('[')) { this.next(); const len = this.isV(']') ? null : this.parseAssign(); this.eat(']'); while (this.isV('[') && this.peek(1).value === ']') { this.next(); this.next(); } if (this.isV('{')) return this.parseArrayLiteral(); return { type: 'arrayNew', len }; }
    let args = [];
    if (this.isV('(')) { this.next(); args = this.parseArgs(); this.eat(')'); }
    let initList = null;
    if (this.isV('{')) initList = this.parseArrayLiteral();
    return { type: 'new', typeName, args, initList };
  }

  parsePrimary() {
    if (this.isV('{')) return this.parseArrayLiteral();
    if (this.isV('new')) return this.parseNew();
    const k = this.next();
    if (k.type === 'num' || k.type === 'char') return { type: 'num', value: k.value };
    if (k.type === 'str') return { type: 'str', value: k.value };
    if (k.value === '(') { const e = this.parseAssign(); this.eat(')'); return e; }
    if (k.type === 'id') {
      if (k.value === 'true') return { type: 'num', value: 1 };
      if (k.value === 'false') return { type: 'num', value: 0 };
      if (k.value === 'null') return { type: 'null' };
      return { type: 'ident', name: k.value };
    }
    throw new Error(`unexpected '${k.value}' (line ${k.line})`);
  }
}

/* ------------------------------------------------------------------------ interpreter */

function truthy(v) { return typeof v === 'number' ? v !== 0 : typeof v === 'boolean' ? v : v != null; }
function jStr(v) { return v == null ? 'null' : typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v); }

const MATH = {
  max: (...a) => Math.max(...a), min: (...a) => Math.min(...a), abs: Math.abs, floor: Math.floor,
  ceil: Math.ceil, round: (x) => Math.round(x), sqrt: Math.sqrt, cbrt: Math.cbrt, pow: Math.pow,
  sin: Math.sin, cos: Math.cos, tan: Math.tan, exp: Math.exp, log: Math.log, log10: Math.log10,
  signum: Math.sign, hypot: Math.hypot, floorDiv: (a, b) => Math.floor(a / b), floorMod: (a, b) => ((a % b) + b) % b,
  toRadians: (d) => d * Math.PI / 180, toDegrees: (r) => r * 180 / Math.PI, PI: Math.PI, E: Math.E,
};

function memberGet(obj, name) {
  if (Array.isArray(obj)) {
    if (name === 'length') return obj.length; // native array field
    switch (name) {
      case 'size': return () => obj.length;
      case 'add': return (x) => { obj.push(x); return true; };
      case 'get': return (i) => obj[i];
      case 'set': return (i, v) => { const o = obj[i]; obj[i] = v; return o; };
      case 'remove': return (i) => { if (typeof i === 'number') return obj.splice(i, 1)[0]; const k = obj.indexOf(i); if (k >= 0) obj.splice(k, 1); return k >= 0; };
      case 'contains': return (x) => obj.includes(x);
      case 'indexOf': return (x) => obj.indexOf(x);
      case 'isEmpty': return () => obj.length === 0;
      case 'clear': return () => { obj.length = 0; };
      case 'sort': return (cmp) => obj.sort(cmp ? (a, b) => cmp(a, b) : (a, b) => a - b);
      case 'forEach': return (fn) => obj.forEach((x) => fn(x));
      case 'toString': return () => '[' + obj.join(', ') + ']';
    }
    return undefined;
  }
  if (obj instanceof Map) {
    switch (name) {
      case 'size': return () => obj.size;
      case 'put': return (k, v) => { const o = obj.has(k) ? obj.get(k) : null; obj.set(k, v); return o; };
      case 'get': return (k) => (obj.has(k) ? obj.get(k) : null);
      case 'getOrDefault': return (k, d) => (obj.has(k) ? obj.get(k) : d);
      case 'containsKey': return (k) => obj.has(k);
      case 'containsValue': return (v) => [...obj.values()].includes(v);
      case 'remove': return (k) => { const o = obj.get(k); obj.delete(k); return o; };
      case 'isEmpty': return () => obj.size === 0;
      case 'clear': return () => obj.clear();
      case 'keySet': return () => [...obj.keys()];
      case 'values': return () => [...obj.values()];
      case 'entrySet': return () => [...obj.entries()].map(([k, v]) => ({ getKey: () => k, getValue: () => v }));
      case 'merge': return (k, v, fn) => { const nv = obj.has(k) ? fn(obj.get(k), v) : v; obj.set(k, nv); return nv; };
      case 'putIfAbsent': return (k, v) => { if (!obj.has(k)) obj.set(k, v); return obj.get(k); };
    }
    return undefined;
  }
  if (typeof obj === 'string') {
    switch (name) {
      case 'length': return () => obj.length;
      case 'charAt': return (i) => obj.charCodeAt(i);
      case 'substring': return (a, b) => (b === undefined ? obj.substring(a) : obj.substring(a, b));
      case 'indexOf': return (s) => obj.indexOf(typeof s === 'number' ? String.fromCharCode(s) : s);
      case 'contains': return (s) => obj.includes(s);
      case 'equals': return (s) => obj === s;
      case 'equalsIgnoreCase': return (s) => obj.toLowerCase() === jStr(s).toLowerCase();
      case 'toUpperCase': return () => obj.toUpperCase();
      case 'toLowerCase': return () => obj.toLowerCase();
      case 'trim': case 'strip': return () => obj.trim();
      case 'startsWith': return (s) => obj.startsWith(s);
      case 'endsWith': return (s) => obj.endsWith(s);
      case 'replace': return (a, b) => obj.split(jStr(a)).join(jStr(b));
      case 'split': return (re) => obj.split(re);
      case 'isEmpty': return () => obj.length === 0;
      case 'isBlank': return () => obj.trim().length === 0;
      case 'toString': return () => obj;
    }
    return undefined;
  }
  if (obj && typeof obj === 'object') return obj[name];
  return undefined;
}

class Env {
  constructor(parent) { this.vars = new Map(); this.parent = parent; }
  has(n) { return this.vars.has(n) || (this.parent ? this.parent.has(n) : false); }
  get(n) { return this.vars.has(n) ? this.vars.get(n) : this.parent ? this.parent.get(n) : undefined; }
  set(n, v) { let e = this; while (e) { if (e.vars.has(n)) { e.vars.set(n, v); return; } e = e.parent; } this.vars.set(n, v); }
  define(n, v) { this.vars.set(n, v); }
}

function lvalue(node, env) {
  if (node.type === 'ident') { if (!env.has(node.name)) { const self = env.get('this'); if (self && typeof self === 'object' && node.name in self) return { get: () => self[node.name], set: (v) => { self[node.name] = v; } }; } return { get: () => env.get(node.name), set: (v) => env.set(node.name, v) }; }
  if (node.type === 'member') { const o = evalNode(node.obj, env); return { get: () => memberGet(o, node.name), set: (v) => { o[node.name] = v; } }; }
  if (node.type === 'index') { const o = evalNode(node.obj, env); const k = evalNode(node.index, env); return { get: () => o?.[k], set: (v) => { o[k] = v; } }; }
  throw new Error('invalid assignment target');
}

function applyBin(op, a, b) {
  switch (op) {
    case '+': return (typeof a === 'string' || typeof b === 'string') ? jStr(a) + jStr(b) : a + b;
    case '-': return a - b; case '*': return a * b; case '/': return a / b; case '%': return a % b;
    case '==': return a === b; case '!=': return a !== b;
    case '<': return a < b; case '<=': return a <= b; case '>': return a > b; case '>=': return a >= b;
    case '&': return a & b; case '|': return a | b; case '^': return a ^ b;
    case '<<': return a << b; case '>>': return a >> b; case '>>>': return a >>> b;
  }
  throw new Error(`unsupported operator '${op}'`);
}

function makeLambda(node, env) {
  return (...args) => { const fenv = new Env(env); node.params.forEach((p, i) => fenv.define(p, args[i])); if (node.body.expr) return evalNode(node.body.expr, fenv); try { for (const s of node.body.block) execStmt(s, fenv); } catch (e) { if (e instanceof ReturnSignal) return e.value; throw e; } };
}

function evalNode(node, env) {
  switch (node.type) {
    case 'num': return node.value;
    case 'str': return node.value;
    case 'null': return null;
    case 'ident': {
      if (env.has(node.name)) return env.get(node.name);
      const self = env.get('this'); if (self && typeof self === 'object' && node.name in self) return self[node.name];
      const prog = env.get('__program'); if (prog?.enums?.has(node.name)) return prog.enums.get(node.name);
      throw new Error(`'${node.name}' is not defined`);
    }
    case 'array': return node.elems.map((e) => evalNode(e, env));
    case 'arrayNew': return new Array(Math.max(0, (node.len ? evalNode(node.len, env) : 0) | 0)).fill(0);
    case 'seq': { let v; for (const e of node.list) v = evalNode(e, env); return v; }
    case 'lambda': return makeLambda(node, env);
    case 'instanceof': return evalNode(node.left, env) != null;
    case 'member': { const o = evalNode(node.obj, env); if (o == null) return undefined; return memberGet(o, node.name); }
    case 'index': { const o = evalNode(node.obj, env); return o == null ? undefined : o[evalNode(node.index, env)]; }
    case 'new': return construct(node, env);
    case 'call': {
      let fn, thisArg;
      if (node.callee.type === 'member') { thisArg = evalNode(node.callee.obj, env); fn = memberGet(thisArg, node.callee.name); }
      else fn = evalNode(node.callee, env);
      if (typeof fn !== 'function') { const nm = node.callee.type === 'member' ? node.callee.name : node.callee.name; throw new Error(`'${nm}' is not callable in the Java preview`); }
      return fn.apply(thisArg, node.args.map((a) => evalNode(a, env)));
    }
    case 'bin': {
      if (node.op === '&&') return truthy(evalNode(node.left, env)) ? truthy(evalNode(node.right, env)) : false;
      if (node.op === '||') return truthy(evalNode(node.left, env)) ? true : truthy(evalNode(node.right, env));
      return applyBin(node.op, evalNode(node.left, env), evalNode(node.right, env));
    }
    case 'unary': { const v = evalNode(node.arg, env); return node.op === '!' ? !truthy(v) : node.op === '-' ? -v : node.op === '~' ? ~v : +v; }
    case 'cond': return truthy(evalNode(node.c, env)) ? evalNode(node.a, env) : evalNode(node.b, env);
    case 'cast': { const v = evalNode(node.arg, env); return INT_CASTS.has(node.t) ? Math.trunc(v) : v; }
    case 'assign': { const lv = lvalue(node.target, env); const rhs = evalNode(node.value, env); const v = node.op === '=' ? rhs : applyBin(node.op[0], lv.get(), rhs); lv.set(v); return v; }
    case 'preincr': { const lv = lvalue(node.arg, env); const v = lv.get() + (node.op === '++' ? 1 : -1); lv.set(v); return v; }
    case 'postincr': { const lv = lvalue(node.arg, env); const old = lv.get(); lv.set(old + (node.op === '++' ? 1 : -1)); return old; }
    default: throw new Error(`cannot evaluate ${node.type}`);
  }
}

function construct(node, env) {
  const tn = node.typeName;
  if (/Exception$|Error$|Throwable$/.test(tn)) { const msg = node.args.length ? evalNode(node.args[0], env) : ''; return { getMessage: () => msg, getLocalizedMessage: () => msg, message: msg, toString: () => tn + ': ' + msg }; }
  if (['ArrayList', 'LinkedList', 'List', 'Vector', 'Stack', 'ArrayDeque', 'HashSet', 'TreeSet', 'LinkedHashSet'].includes(tn)) return node.initList ? evalNode(node.initList, env) : [];
  if (['HashMap', 'TreeMap', 'LinkedHashMap', 'Map', 'Hashtable'].includes(tn)) return new Map();
  if (tn === 'StringBuilder' || tn === 'StringBuffer') { const o = { _s: node.args.length && typeof evalNode(node.args[0], env) === 'string' ? evalNode(node.args[0], env) : '' }; o.append = (x) => { o._s += jStr(x); return o; }; o.toString = () => o._s; o.length = () => o._s.length; o.charAt = (i) => o._s.charCodeAt(i); o.insert = (i, x) => { o._s = o._s.slice(0, i) + jStr(x) + o._s.slice(i); return o; }; o.reverse = () => { o._s = [...o._s].reverse().join(''); return o; }; return o; }
  const prog = env.get('__program');
  if (prog?.classes?.has(tn)) return instantiate(prog.classes.get(tn), node.args.map((a) => evalNode(a, env)), env);
  return node.initList ? evalNode(node.initList, env) : {};
}

function instantiate(def, args, env) {
  const prog = env.get('__program');
  const obj = {};
  for (const f of def.fields) obj[f.name] = f.init ? evalNode(f.init, env) : (f.typeName === 'String' ? '' : f.typeName === 'boolean' ? false : 0);
  for (const [mn, m] of def.methods) obj[mn] = (...a) => { if (!m.body) m.body = new Parser([...m.bodyToks, { type: 'eof', value: null }]).parseProgram(); return runBody(m.body, m.params, prog, obj, a); };
  if (def.methods.has(def.ctorName)) obj[def.ctorName](...args); // constructor = method named like the class
  return obj;
}

function execStmt(node, env) {
  switch (node.type) {
    case 'empty': return;
    case 'exprStmt': evalNode(node.expr, env); return;
    case 'decl': for (const d of node.decls) env.define(d.name, declDefault(d, env)); return;
    case 'block': { const inner = new Env(env); for (const s of node.body) execStmt(s, inner); return; }
    case 'if': if (truthy(evalNode(node.cond, env))) execStmt(node.then, env); else if (node.els) execStmt(node.els, env); return;
    case 'while': while (truthy(evalNode(node.cond, env))) { try { execStmt(node.body, env); } catch (e) { if (e === BREAK) break; if (e !== CONTINUE) throw e; } } return;
    case 'doWhile': do { try { execStmt(node.body, env); } catch (e) { if (e === BREAK) break; if (e !== CONTINUE) throw e; } } while (truthy(evalNode(node.cond, env))); return;
    case 'for': { const inner = new Env(env); if (node.init) execStmt(node.init, inner); while (node.cond ? truthy(evalNode(node.cond, inner)) : true) { try { execStmt(node.body, inner); } catch (e) { if (e === BREAK) break; if (e !== CONTINUE) throw e; } if (node.update) evalNode(node.update, inner); } return; }
    case 'foreach': { const it = evalNode(node.iterable, env); const list = it instanceof Map ? [...it.keys()] : typeof it === 'string' ? it.split('') : Array.isArray(it) ? it : []; for (const el of list) { const inner = new Env(env); inner.define(node.name, el); try { execStmt(node.body, inner); } catch (e) { if (e === BREAK) break; if (e !== CONTINUE) throw e; } } return; }
    case 'switch': { const d = evalNode(node.disc, env); let start = node.clauses.findIndex((c) => c.test !== null && evalNode(c.test, env) === d); if (start < 0) start = node.clauses.findIndex((c) => c.test === null); if (start < 0) return; const inner = new Env(env); try { for (let ci = start; ci < node.clauses.length; ci++) for (const s of node.clauses[ci].stmts) execStmt(s, inner); } catch (e) { if (e === BREAK) return; throw e; } return; }
    case 'return': throw new ReturnSignal(node.expr ? evalNode(node.expr, env) : undefined);
    case 'throw': throw new JavaThrow(node.expr ? evalNode(node.expr, env) : undefined);
    case 'try': {
      try { execStmt(node.block, new Env(env)); }
      catch (e) { if (e instanceof ReturnSignal || e === BREAK || e === CONTINUE) { if (node.fin) execStmt(node.fin, new Env(env)); throw e; } if (node.catches.length) { const c = node.catches[0]; const inner = new Env(env); inner.define(c.param ?? '__exc', e instanceof JavaThrow ? e.value : { getMessage: () => String(e?.message ?? e), message: String(e?.message ?? e) }); execStmt(c.body, inner); } else if (!node.fin) throw e; }
      if (node.fin) execStmt(node.fin, new Env(env));
      return;
    }
    case 'break': throw BREAK;
    case 'continue': throw CONTINUE;
    default: throw new Error(`cannot execute ${node.type}`);
  }
}

function declDefault(d, env) {
  if (d.init) return evalNode(d.init, env);
  if (d.typeName === 'String') return '';
  if (d.typeName === 'boolean') return false;
  return 0;
}

/* ------------------------------------------------------------------- top-level + run */

function parseTypeMembers(toks, typeName) {
  const fields = [], methods = new Map(); let i = 0;
  while (i < toks.length) {
    if (MODIFIERS.has(toks[i]?.value)) { i++; continue; }
    if (toks[i]?.value === ';' || toks[i]?.value === '{' || toks[i]?.value === '}') { i++; continue; }
    let j = i, name = null, nameIdx = -1, isMethod = false;
    while (j < toks.length) {
      const v = toks[j].value;
      if (v === '<') { let d = 0; do { if (toks[j].value === '<') d++; else if (toks[j].value === '>') d--; j++; } while (d > 0 && j < toks.length); continue; }
      if (v === '{' || v === '}' || v === ';') break;
      if (toks[j].type === 'id') { const nx = toks[j + 1]?.value; if (nx === '(') { name = toks[j].value; nameIdx = j; isMethod = true; break; } if (nx === '=' || nx === ';' || nx === ',') { name = toks[j].value; nameIdx = j; break; } }
      j++;
    }
    if (name === null) break;
    if (isMethod) {
      const pOpen = nameIdx + 1, pEnd = matchClose(toks, pOpen, '(', ')');
      if (toks[pEnd + 1]?.value === '{') { const bEnd = matchClose(toks, pEnd + 1, '{', '}'); methods.set(name, { params: paramNames(toks.slice(pOpen + 1, pEnd)), bodyToks: toks.slice(pEnd + 2, bEnd), body: null }); i = bEnd + 1; }
      else { i = pEnd + 1; if (toks[i]?.value === ';') i++; }
    } else {
      let tn = ''; { let k = i; while (k < nameIdx) { if (toks[k].type === 'id' && !MODIFIERS.has(toks[k].value)) tn = toks[k].value; k++; } }
      let k = nameIdx + 1, init = null;
      if (toks[k]?.value === '=') { const start = k + 1; let d = 0, e = start; while (e < toks.length && !(toks[e].value === ';' && d === 0)) { if ('([{'.includes(toks[e].value)) d++; if (')]}'.includes(toks[e].value)) d--; e++; } init = new Parser([...toks.slice(start, e), { type: 'eof', value: null }]).parseExpr(); k = e; }
      while (k < toks.length && toks[k].value !== ';') k++;
      fields.push({ name, typeName: tn, init });
      i = k + 1;
    }
  }
  return { fields, methods, ctorName: typeName };
}

function extractTypes(toks) {
  const classes = new Map(), enums = new Map(), diagnostics = [];
  let i = 0;
  while (i < toks.length) {
    const t = toks[i];
    if (t.type === 'id' && (t.value === 'class' || t.value === 'interface') && toks[i + 1]?.type === 'id') {
      const name = toks[i + 1].value; let b = i + 2; while (b < toks.length && toks[b].value !== '{') b++;
      if (toks[b]?.value === '{') { const bEnd = matchClose(toks, b, '{', '}'); try { const tm = parseTypeMembers(toks.slice(b + 1, bEnd), name); tm.line = t.line; classes.set(name, tm); } catch (e) { diagnostics.push(`class ${name}: ${e.message ?? e}`); } i = bEnd + 1; continue; }
    }
    if (t.type === 'id' && t.value === 'enum' && toks[i + 1]?.type === 'id') {
      let b = i + 2; while (b < toks.length && toks[b].value !== '{') b++;
      if (toks[b]?.value === '{') { const bEnd = matchClose(toks, b, '{', '}'); parseEnumerators(toks.slice(b + 1, bEnd), enums); i = bEnd + 1; continue; }
    }
    i++;
  }
  return { classes, enums, diagnostics };
}

function parseEnumerators(toks, enums) {
  // Java enum constants are at the start, comma-separated identifiers (ignore bodies/members).
  let val = 0, i = 0;
  while (i < toks.length) {
    if (toks[i].type !== 'id') break;
    enums.set(toks[i].value, val); val++; i++;
    if (toks[i]?.value === '(') { const e = matchClose(toks, i, '(', ')'); i = e + 1; }
    if (toks[i]?.value === ',') { i++; continue; }
    break; // hit ';' or a member declaration
  }
}

function extractGlobals(toks, program) {
  const globals = new Map(); let i = 0;
  while (i < toks.length) {
    const t = toks[i];
    if (t.type === 'id' && (t.value === 'class' || t.value === 'interface' || t.value === 'enum')) { let b = i; while (b < toks.length && toks[b].value !== '{' && toks[b].value !== ';') b++; if (toks[b]?.value === '{') i = matchClose(toks, b, '{', '}') + 1; else i = b + 1; continue; }
    if (t.type === 'id' && (t.value === 'import' || t.value === 'package')) { let b = i; while (b < toks.length && toks[b].value !== ';') b++; i = b + 1; continue; }
    if (t.type === 'id' && !MODIFIERS.has(t.value)) {
      let j = i, name = null, nameIdx = -1, isFunc = false, isDecl = false;
      while (j < toks.length) { const v = toks[j].value; if (v === '<') { let d = 0; do { if (toks[j].value === '<') d++; else if (toks[j].value === '>') d--; j++; } while (d > 0 && j < toks.length); continue; } if (v === ';' || v === '{' || v === '}') break; if (toks[j].type === 'id') { const nx = toks[j + 1]?.value; if (nx === '(') { name = toks[j].value; nameIdx = j; isFunc = true; break; } if (nx === '=' || nx === ';') { name = toks[j].value; nameIdx = j; isDecl = true; break; } } j++; }
      if (isFunc) { const pEnd = matchClose(toks, nameIdx + 1, '(', ')'); if (toks[pEnd + 1]?.value === '{') i = matchClose(toks, pEnd + 1, '{', '}') + 1; else { i = pEnd + 1; if (toks[i]?.value === ';') i++; } continue; }
      if (isDecl) { let k = i, d = 0; while (k < toks.length && !(toks[k].value === ';' && d === 0)) { if ('([{'.includes(toks[k].value)) d++; if (')]}'.includes(toks[k].value)) d--; k++; } try { const decl = new Parser([...toks.slice(i, k), { type: 'op', value: ';' }, { type: 'eof', value: null }]).parseDecl(); const env = new Env(null); env.define('__program', program); for (const [n, v] of program.enums) env.define(n, v); for (const [n, v] of globals) env.define(n, v); for (const dcl of decl.decls) globals.set(dcl.name, declDefault(dcl, env)); } catch { /* not a decl */ } i = k + 1; continue; }
    }
    i++;
  }
  return globals;
}

const SYSTEM = (print) => ({ out: { println: (...a) => print(a.map(jStr).join('')), print: (...a) => print(a.map(jStr).join('')), printf: (fmt, ...a) => print(jStr(fmt)) }, err: { println: (...a) => print(a.map(jStr).join('')), print: (...a) => print(a.map(jStr).join('')) } });

function runBody(body, params, program, thisObj, args) {
  const env = new Env(null);
  const print = program?.print ?? (() => {});
  env.define('__program', program ?? null);
  env.define('System', SYSTEM(print));
  env.define('Math', MATH);
  if (thisObj) env.define('this', thisObj);
  if (program) {
    for (const [n, v] of program.globals) env.define(n, v);
    for (const [n, v] of program.enums) env.define(n, v);
    for (const [n, f] of program.funcs) env.define(n, (...a) => runBody(f.body, f.params, program, null, a));
  }
  (params ?? []).forEach((p, idx) => env.define(p, args[idx]));
  try { for (const s of body) execStmt(s, env); }
  catch (e) { if (e instanceof ReturnSignal) return e.value; if (e === BREAK || e === CONTINUE) return undefined; throw e; }
  return undefined;
}

/* --------------------------------------------------------------------------- public */

export function compileJava(source) {
  const diagnostics = []; const handlers = new Map();
  const program = { funcs: new Map(), classes: new Map(), enums: new Map(), globals: new Map(), print: null };
  let toks;
  try { toks = tokenize(String(source ?? '')); } catch (e) { return { handlers, diagnostics: [String(e.message ?? e)] }; }
  const types = extractTypes(toks);
  for (const [n, c] of types.classes) program.classes.set(n, c);
  for (const [n, v] of types.enums) program.enums.set(n, v);
  diagnostics.push(...types.diagnostics);
  let fns; try { fns = extractFunctions(toks); } catch (e) { return { handlers, diagnostics: [...diagnostics, String(e.message ?? e)] }; }
  // Skip functions that are class constructors / members already captured as class methods.
  const classMethodNames = new Set(); for (const c of program.classes.values()) for (const mn of c.methods.keys()) classMethodNames.add(mn);
  for (const fn of fns) {
    try { fn.params = paramNames(fn.paramToks); fn.body = new Parser(fn.bodyToks).parseProgram(); fn.program = program; program.funcs.set(fn.name, fn); handlers.set(fn.name, fn); }
    catch (e) { diagnostics.push(`${fn.name}: ${e.message ?? e}`); }
  }
  try { for (const [n, v] of extractGlobals(toks, program)) program.globals.set(n, v); } catch (e) { diagnostics.push(`globals: ${e.message ?? e}`); }
  return { handlers, diagnostics };
}

export function invokeJava(fnNode, args = [], opts = {}) {
  const program = fnNode.program;
  if (program && opts.print) program.print = opts.print;
  return runBody(fnNode.body, fnNode.params, program, null, args);
}

/* -------------------------------------------------- editor language-service support */

export function analyzeJava(source) {
  const src = String(source ?? '');
  if (!src.trim()) return { diagnostics: [], symbols: [] };
  const offs = [0]; for (let i = 0; i < src.length; i++) if (src[i] === '\n') offs.push(i + 1);
  const { diagnostics: raw } = compileJava(src);
  const diagnostics = raw.map((d) => { const message = String(d); const ln = Math.max(1, parseInt((/\(line (\d+)\)/.exec(message) || [])[1] || '1', 10)); return { severity: 'error', message: message.replace(/\s*\(line \d+\)/, ''), line: ln, col: 0, index: offs[ln - 1] ?? 0 }; });
  const symbols = [];
  let toks; try { toks = tokenize(src); } catch { return { diagnostics, symbols }; }
  for (const fn of extractFunctions(toks)) symbols.push({ name: fn.name, kind: 'function', detail: `${fn.name}(${paramNames(fn.paramToks).join(', ')})`, line: fn.line ?? 1, col: 0, index: fn.index ?? 0 });
  let m; const reType = /\b(class|interface|enum)\s+([A-Za-z_$][\w$]*)/g;
  while ((m = reType.exec(src))) symbols.push({ name: m[2], kind: 'class', detail: `${m[1]} ${m[2]}`, line: src.slice(0, m.index).split('\n').length, col: 0, index: m.index });
  return { diagnostics, symbols };
}

export function foldJava(source) {
  let toks; try { toks = tokenize(String(source ?? '')); } catch { return []; }
  const stack = [], byStart = new Map();
  for (const t of toks) { if (t.value === '{') stack.push(t.line); else if (t.value === '}') { const s = stack.pop(); if (s != null && t.line > s) { const p = byStart.get(s); if (!p || t.line > p.endLine) byStart.set(s, { startLine: s, endLine: t.line }); } } }
  return [...byStart.values()].sort((a, b) => a.startLine - b.startLine);
}
