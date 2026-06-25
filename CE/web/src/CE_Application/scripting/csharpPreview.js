// csharpPreview.js — interpreter for the C# *behavior-handler subset*, so C# scripts run live in
// the WebView preview (the real C# would be compiled into a native export). Mirrors cppPreview's
// design, adapted to C# idioms: var, foreach, => lambdas, string interpolation $"…", List/Dictionary
// with property-style .Count/.Length, Console.WriteLine, Math.*, new expressions, classes.
//
// SUPPORTED: handlers (camelCase or PascalCase), var/typed decls, if/else, for, foreach, while,
// do/while, switch, return/break/continue, try/catch/throw, arithmetic/comparison/logical/bitwise/
// ternary/?? , prefix-postfix ++/--, lambdas, List<T>/Dictionary<K,V>/arrays + their members, string
// methods, classes with fields/methods/auto-properties, enums, Console + Math.
// NOT SUPPORTED (clear diagnostic): LINQ query syntax, async/await, generics you define, structs by
// value, attributes, unsafe/pointers, properties with custom bodies.

const TYPE_WORDS = new Set(['int', 'long', 'short', 'byte', 'sbyte', 'uint', 'ulong', 'ushort',
  'double', 'float', 'decimal', 'bool', 'char', 'string', 'object', 'var', 'void', 'dynamic']);
const DECL_LEADERS = new Set([...TYPE_WORDS, 'const', 'readonly', 'static', 'public', 'private',
  'protected', 'internal', 'override', 'virtual', 'abstract', 'sealed', 'new']);
const MODIFIERS = new Set(['public', 'private', 'protected', 'internal', 'static', 'readonly',
  'const', 'override', 'virtual', 'abstract', 'sealed', 'partial', 'async', 'extern', 'new', 'unsafe']);
const BINPREC = { '??': 1, '||': 2, '&&': 3, '|': 4, '^': 5, '&': 6, '==': 7, '!=': 7, '<': 8, '<=': 8, '>': 8, '>=': 8, '+': 9, '-': 9, '*': 10, '/': 10, '%': 10 };

class ReturnSignal { constructor(value) { this.value = value; } }
class CsThrow { constructor(value) { this.value = value; } }
const BREAK = Symbol('break'), CONTINUE = Symbol('continue');

/* ------------------------------------------------------------------------- tokenizer */

const SPECS = [
  ['skip', /(?:[ \t\r\n]+|#[^\n]*|\/\/[^\n]*|\/\*[\s\S]*?\*\/)/y],
  ['num', /(?:0[xX][0-9a-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)[fFdDmMuUlL]*/y],
  ['interp', /\$"(?:\\.|[^"\\])*"/y],
  ['verbatim', /@"(?:[^"]|"")*"/y],
  ['str', /"(?:\\.|[^"\\])*"/y],
  ['char', /'(?:\\.|[^'\\])'/y],
  ['id', /[A-Za-z_]\w*/y],
  ['op', /=>|==|!=|<=|>=|&&|\|\||\+\+|--|\+=|-=|\*=|\/=|%=|\?\?|\?\.|[+\-*/%=<>!?:.,;(){}\[\]&|~^]/y],
];

function unescape(s) {
  return s.replace(/\\(.)/g, (_, c) => ({ n: '\n', t: '\t', r: '\r', '0': '\0', '"': '"', "'": "'", '\\': '\\' }[c] ?? c));
}

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
      if (type === 'num') value = (text[1] === 'x' || text[1] === 'X') ? parseInt(text, 16) : parseFloat(text.replace(/[fFdDmMuUlL]+$/, ''));
      else if (type === 'str') value = unescape(text.slice(1, -1));
      else if (type === 'verbatim') value = text.slice(2, -1).replace(/""/g, '"');
      else if (type === 'char') value = unescape(text.slice(1, -1)).charCodeAt(0);
      else if (type === 'interp') value = text.slice(2, -1); // raw inner, parsed later
      toks.push({ type: type === 'str' || type === 'verbatim' ? 'str' : type, value, line, index: i });
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
  for (let j = openIdx; j < toks.length; j++) {
    if (toks[j].value === open) depth++;
    else if (toks[j].value === close) { depth--; if (depth === 0) return j; }
  }
  throw new Error(`unbalanced '${open}' (line ${toks[openIdx].line})`);
}

function paramNames(paramToks) {
  const names = []; let seg = [], depth = 0;
  const flush = () => { const ids = seg.filter((t) => t.type === 'id' && !DECL_LEADERS.has(t.value) && !TYPE_WORDS.has(t.value)); if (ids.length) names.push(ids[ids.length - 1].value); else { const any = seg.filter((t) => t.type === 'id'); if (any.length) names.push(any[any.length - 1].value); } seg = []; };
  for (const t of paramToks) {
    if (t.value === '(' || t.value === '[' || t.value === '<') depth++;
    else if (t.value === ')' || t.value === ']' || t.value === '>') depth--;
    if (t.value === ',' && depth === 0) { flush(); continue; }
    seg.push(t);
  }
  if (seg.length) flush();
  return names;
}

// Every `Name(params){body}` — a method/function — ignoring return type & modifiers.
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
    // Type name  (UserType x  /  Foo<Bar> x  /  Foo[] x)
    let i = this.i + 1;
    if (this.t[i]?.value === '<') { let d = 0; do { const v = this.t[i]?.value; if (v === '<') d++; else if (v === '>') d--; i++; } while (d > 0 && i < this.t.length); }
    while (this.t[i]?.value === '[' && this.t[i + 1]?.value === ']') i += 2;
    while (this.t[i]?.value === '?') i++;
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
        case 'foreach': return this.parseForeach();
        case 'while': return this.parseWhile();
        case 'do': { this.next(); const body = this.parseStatement(); this.eat('while'); this.eat('('); const cond = this.parseExpr(); this.eat(')'); this.eat(';'); return { type: 'doWhile', body, cond }; }
        case 'switch': return this.parseSwitch();
        case 'return': { this.next(); const e = this.isV(';') ? null : this.parseExpr(); this.eat(';'); return { type: 'return', expr: e }; }
        case 'break': this.next(); this.eat(';'); return { type: 'break' };
        case 'continue': this.next(); this.eat(';'); return { type: 'continue' };
        case 'throw': { this.next(); const e = this.isV(';') ? null : this.parseExpr(); this.eat(';'); return { type: 'throw', expr: e }; }
        case 'try': return this.parseTry();
        case 'goto': case 'unsafe': case 'fixed': case 'lock': case 'using': case 'yield':
          throw new Error(`'${k.value}' is not supported in the C# preview (line ${k.line})`);
        default: break;
      }
      if (this.isDeclStart()) return this.parseDecl();
    }
    const e = this.parseExpr(); this.eat(';'); return { type: 'exprStmt', expr: e };
  }

  parseIf() { this.eat('if'); this.eat('('); const cond = this.parseExpr(); this.eat(')'); const then = this.parseStatement(); let els = null; if (this.isV('else')) { this.next(); els = this.parseStatement(); } return { type: 'if', cond, then, els }; }
  parseWhile() { this.eat('while'); this.eat('('); const cond = this.parseExpr(); this.eat(')'); return { type: 'while', cond, body: this.parseStatement() }; }
  parseForeach() { this.eat('foreach'); this.eat('('); this.skipType(); const name = this.next().value; this.eat('in'); const iterable = this.parseExpr(); this.eat(')'); return { type: 'foreach', name, iterable, body: this.parseStatement() }; }

  parseFor() {
    this.eat('for'); this.eat('(');
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
    this.eat('try'); const block = this.parseBlock(); const catches = []; let fin = null;
    while (this.isV('catch')) {
      this.next(); let param = null;
      if (this.isV('(')) { this.next(); const start = this.i; let d = 1; while (d > 0 && !this.atEnd()) { const v = this.next().value; if (v === '(') d++; else if (v === ')') d--; } const ids = this.t.slice(start, this.i - 1).filter((tk) => tk.type === 'id' && !DECL_LEADERS.has(tk.value)); param = ids.length ? ids[ids.length - 1].value : null; }
      catches.push({ param, body: this.parseBlock() });
    }
    if (this.isV('finally')) { this.next(); fin = this.parseBlock(); }
    return { type: 'try', block, catches, fin };
  }

  skipAngles() { let d = 0; do { const v = this.next().value; if (v === '<') d++; else if (v === '>') d--; } while (d > 0 && !this.atEnd()); }
  skipType() { // consume a type (var / qualified / generic / array / nullable) before a declarator name
    for (;;) {
      const k = this.peek();
      if (k.value === '<') { this.skipAngles(); continue; }
      if (k.value === '.' || k.value === '?' || k.value === '[' || k.value === ']') { this.next(); continue; }
      if (k.type === 'id') { const nx = this.peek(1).value; if (nx === '=' || nx === ';' || nx === ',' || nx === ')' || nx === 'in' || nx === '(') break; this.next(); continue; }
      break;
    }
  }

  parseDecl(noSemi = false) {
    let typeName = '';
    for (;;) {
      const k = this.peek();
      if (k.value === '<') { this.skipAngles(); continue; }
      if (k.value === '.' || k.value === '?') { this.next(); continue; }
      if (k.value === '[' && this.peek(1).value === ']') { this.next(); this.next(); continue; }
      if (k.type === 'id') { const nx = this.peek(1).value; if (nx === '=' || nx === ';' || nx === ',' || nx === ')' || nx === '(' || nx === '[') break; if (!MODIFIERS.has(k.value)) typeName = k.value; this.next(); continue; }
      break;
    }
    const decls = [];
    do {
      const nameTok = this.next();
      if (nameTok.type !== 'id') throw new Error(`expected a variable name (line ${nameTok.line})`);
      let init = null, ctorArgs = null;
      if (this.isV('[')) { this.next(); ctorArgs = this.isV(']') ? [] : [this.parseAssign()]; this.eat(']'); /* arr length */ init = { type: 'arrayNew', len: ctorArgs[0] ?? null }; ctorArgs = null; }
      else if (this.isV('=')) { this.next(); init = this.parseInitializer(); }
      else if (this.isV('(')) { this.next(); ctorArgs = this.parseArgs(); this.eat(')'); }
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

  // Lambdas: `x => …`  or  `(a, b) => …`
  parseLambdaOr() {
    if (this.peek().type === 'id' && this.peek(1).value === '=>') { const p = this.next().value; this.eat('=>'); return { type: 'lambda', params: [p], body: this.lambdaBody() }; }
    if (this.isV('(')) {
      const close = matchClose(this.t, this.i, '(', ')');
      if (this.t[close + 1]?.value === '=>') { this.next(); const params = paramNames(this.t.slice(this.i, close)); this.i = close + 1; this.eat('=>'); return { type: 'lambda', params, body: this.lambdaBody() }; }
    }
    return this.parseTernary();
  }
  lambdaBody() { if (this.isV('{')) return { block: this.parseBlock().body }; return { expr: this.parseAssign() }; }

  parseTernary() {
    const c = this.parseBinary(1);
    if (this.isV('?') && this.peek().value === '?') { /* handled as ?? in binary */ }
    if (this.isV('?')) { this.next(); const a = this.parseAssign(); this.eat(':'); const b = this.parseAssign(); return { type: 'cond', c, a, b }; }
    return c;
  }

  parseBinary(minPrec) {
    let left = this.parseUnary();
    for (;;) {
      const k = this.peek();
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
      if (k.value === '.' || k.value === '?.') { this.next(); e = { type: 'member', obj: e, name: this.next().value, optional: k.value === '?.' }; }
      else if (k.value === '(') { this.next(); const args = this.parseArgs(); this.eat(')'); e = { type: 'call', callee: e, args }; }
      else if (k.value === '[') { this.next(); const idx = this.parseAssign(); this.eat(']'); e = { type: 'index', obj: e, index: idx }; }
      else if (k.value === '++' || k.value === '--') { this.next(); e = { type: 'postincr', op: k.value, arg: e }; }
      else break;
    }
    return e;
  }

  parseArgs() { const a = []; if (this.isV(')')) return a; do { const p = this.peek(); if (p.type === 'id' && (p.value === 'out' || p.value === 'ref' || p.value === 'in')) this.next(); a.push(this.parseAssign()); } while (this.isV(',') && this.next()); return a; }

  parseNew() {
    this.eat('new');
    // new Type(args) | new Type[n] | new Type[]{...} | new[]{...} | new Type{...}
    if (this.isV('[')) { this.next(); this.eat(']'); return this.parseArrayLiteral(); } // new[] {...}
    let typeName = '';
    while (this.peek().type === 'id' || this.isV('.')) { if (this.peek().type === 'id') typeName = this.peek().value; this.next(); if (this.isV('<')) this.skipAngles(); }
    if (this.isV('[')) { this.next(); const len = this.isV(']') ? null : this.parseAssign(); this.eat(']'); if (this.isV('{')) return this.parseArrayLiteral(); return { type: 'arrayNew', len }; }
    let args = [];
    if (this.isV('(')) { this.next(); args = this.parseArgs(); this.eat(')'); }
    let initList = null;
    if (this.isV('{')) initList = this.parseArrayLiteral();
    return { type: 'new', typeName, args, initList };
  }

  parseInterp(raw) {
    // Split $"...{expr}..." into literal + expression parts (braces respected, {{ }} escapes).
    const parts = []; let lit = ''; let i = 0;
    while (i < raw.length) {
      const c = raw[i];
      if (c === '{' && raw[i + 1] === '{') { lit += '{'; i += 2; continue; }
      if (c === '}' && raw[i + 1] === '}') { lit += '}'; i += 2; continue; }
      if (c === '{') {
        if (lit) { parts.push({ type: 'str', value: lit }); lit = ''; }
        let depth = 1, j = i + 1; while (j < raw.length && depth > 0) { if (raw[j] === '{') depth++; else if (raw[j] === '}') depth--; if (depth > 0) j++; }
        let exprText = raw.slice(i + 1, j); const colon = splitFormat(exprText); // drop :format spec
        parts.push(new Parser([...tokenize(colon), { type: 'eof', value: null }]).parseExpr());
        i = j + 1; continue;
      }
      lit += c; i++;
    }
    if (lit) parts.push({ type: 'str', value: lit });
    return { type: 'interp', parts };
  }

  parsePrimary() {
    if (this.isV('{')) return this.parseArrayLiteral();
    if (this.isV('new')) return this.parseNew();
    const k = this.next();
    if (k.type === 'num' || k.type === 'char') return { type: 'num', value: k.value };
    if (k.type === 'str') return { type: 'str', value: k.value };
    if (k.type === 'interp') return this.parseInterp(k.value);
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

function splitFormat(text) { // strip a trailing :format that is at bracket depth 0
  let depth = 0; for (let i = 0; i < text.length; i++) { const c = text[i]; if ('([{'.includes(c)) depth++; else if (')]}'.includes(c)) depth--; else if (c === ':' && depth === 0) return text.slice(0, i); } return text; }

/* ------------------------------------------------------------------------ interpreter */

function truthy(v) { return typeof v === 'number' ? v !== 0 : typeof v === 'boolean' ? v : v != null; }
function csStr(v) { return v == null ? '' : typeof v === 'boolean' ? (v ? 'True' : 'False') : String(v); }

const MATH = {
  Min: (...a) => Math.min(...a), Max: (...a) => Math.max(...a), Abs: Math.abs, Floor: Math.floor,
  Ceiling: Math.ceil, Round: (x) => Math.round(x), Sqrt: Math.sqrt, Pow: Math.pow, Sign: Math.sign,
  Sin: Math.sin, Cos: Math.cos, Tan: Math.tan, Exp: Math.exp, Log: Math.log, Log10: Math.log10,
  Truncate: Math.trunc, Clamp: (v, lo, hi) => Math.min(hi, Math.max(lo, v)), PI: Math.PI, E: Math.E,
};

// C# member semantics: .Count/.Length are PROPERTIES (values); .Add/.Contains/… are methods.
function memberGet(obj, name) {
  if (Array.isArray(obj)) {
    if (name === 'Count' || name === 'Length') return obj.length;
    switch (name) {
      case 'Add': return (x) => { obj.push(x); };
      case 'AddRange': return (xs) => { for (const x of xs) obj.push(x); };
      case 'Remove': return (x) => { const k = obj.indexOf(x); if (k >= 0) obj.splice(k, 1); return k >= 0; };
      case 'RemoveAt': return (i) => obj.splice(i, 1);
      case 'Contains': return (x) => obj.includes(x);
      case 'IndexOf': return (x) => obj.indexOf(x);
      case 'Clear': return () => { obj.length = 0; };
      case 'Sort': return (cmp) => obj.sort(cmp ? (a, b) => cmp(a, b) : (a, b) => a - b);
      case 'Reverse': return () => obj.reverse();
      case 'ToArray': case 'ToList': return () => obj.slice();
      case 'First': return () => obj[0];
      case 'Last': return () => obj[obj.length - 1];
      case 'Sum': return () => obj.reduce((s, x) => s + x, 0);
    }
    return undefined;
  }
  if (obj instanceof Map) {
    if (name === 'Count') return obj.size;
    switch (name) {
      case 'Add': return (k, v) => obj.set(k, v);
      case 'ContainsKey': return (k) => obj.has(k);
      case 'Remove': return (k) => obj.delete(k);
      case 'Clear': return () => obj.clear();
      case 'TryGetValue': return (k) => obj.get(k);
      case 'Keys': return [...obj.keys()];
      case 'Values': return [...obj.values()];
    }
    return undefined;
  }
  if (typeof obj === 'string') {
    if (name === 'Length') return obj.length;
    switch (name) {
      case 'Substring': return (a, b) => (b === undefined ? obj.substring(a) : obj.substring(a, a + b));
      case 'Contains': return (s) => obj.includes(s);
      case 'IndexOf': return (s) => obj.indexOf(s);
      case 'ToUpper': return () => obj.toUpperCase();
      case 'ToLower': return () => obj.toLowerCase();
      case 'Trim': return () => obj.trim();
      case 'StartsWith': return (s) => obj.startsWith(s);
      case 'EndsWith': return (s) => obj.endsWith(s);
      case 'Replace': return (a, b) => obj.split(a).join(b);
      case 'Split': return (sep) => obj.split(sep);
      case 'ToString': return () => obj;
    }
    return undefined;
  }
  if (obj && typeof obj === 'object') {
    if (name === 'ToString' && typeof obj.ToString !== 'function') return () => csStr(obj.value ?? obj);
    return obj[name];
  }
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
  if (node.type === 'ident') {
    if (!env.has(node.name)) { const self = env.get('this'); if (self && typeof self === 'object' && node.name in self) return { get: () => self[node.name], set: (v) => { self[node.name] = v; } }; }
    return { get: () => env.get(node.name), set: (v) => env.set(node.name, v) };
  }
  if (node.type === 'member') { const o = evalNode(node.obj, env); return { get: () => memberGet(o, node.name), set: (v) => { o[node.name] = v; } }; }
  if (node.type === 'index') { const o = evalNode(node.obj, env); const k = evalNode(node.index, env); if (o instanceof Map) return { get: () => o.get(k), set: (v) => o.set(k, v) }; return { get: () => o?.[k], set: (v) => { o[k] = v; } }; }
  throw new Error('invalid assignment target');
}

function applyBin(op, a, b) {
  switch (op) {
    case '+': return (typeof a === 'string' || typeof b === 'string') ? csStr(a) + csStr(b) : a + b;
    case '-': return a - b; case '*': return a * b; case '/': return a / b; case '%': return a % b;
    case '==': return a === b; case '!=': return a !== b;
    case '<': return a < b; case '<=': return a <= b; case '>': return a > b; case '>=': return a >= b;
    case '&': return a & b; case '|': return a | b; case '^': return a ^ b;
    case '??': return a == null ? b : a;
  }
  throw new Error(`unsupported operator '${op}'`);
}

function makeLambda(node, env) {
  return (...args) => {
    const fenv = new Env(env);
    node.params.forEach((p, i) => fenv.define(p, args[i]));
    if (node.body.expr) return evalNode(node.body.expr, fenv);
    try { for (const s of node.body.block) execStmt(s, fenv); } catch (e) { if (e instanceof ReturnSignal) return e.value; throw e; }
  };
}

function evalNode(node, env) {
  switch (node.type) {
    case 'num': return node.value;
    case 'str': return node.value;
    case 'null': return null;
    case 'ident': {
      if (env.has(node.name)) return env.get(node.name);
      const self = env.get('this'); if (self && typeof self === 'object' && node.name in self) return self[node.name];
      const prog = env.get('__program');
      if (prog?.enums?.has(node.name)) return prog.enums.get(node.name);
      throw new Error(`'${node.name}' is not defined`);
    }
    case 'array': return node.elems.map((e) => evalNode(e, env));
    case 'arrayNew': return new Array(Math.max(0, (node.len ? evalNode(node.len, env) : 0) | 0)).fill(0);
    case 'seq': { let v; for (const e of node.list) v = evalNode(e, env); return v; }
    case 'lambda': return makeLambda(node, env);
    case 'interp': return node.parts.map((p) => csStr(evalNode(p, env))).join('');
    case 'member': {
      const o = evalNode(node.obj, env);
      if (o == null) { if (node.optional) return null; return undefined; }
      return memberGet(o, node.name);
    }
    case 'index': { const o = evalNode(node.obj, env); if (o instanceof Map) { const k = evalNode(node.index, env); return o.has(k) ? o.get(k) : null; } return o == null ? undefined : o[evalNode(node.index, env)]; }
    case 'new': return construct(node, env);
    case 'call': {
      let fn, thisArg;
      if (node.callee.type === 'member') { thisArg = evalNode(node.callee.obj, env); if (thisArg == null && node.callee.optional) return null; fn = memberGet(thisArg, node.callee.name); }
      else fn = evalNode(node.callee, env);
      if (typeof fn !== 'function') { const nm = node.callee.type === 'member' ? node.callee.name : node.callee.name; throw new Error(`'${nm}' is not callable in the C# preview`); }
      return fn.apply(thisArg, node.args.map((a) => evalNode(a, env)));
    }
    case 'bin': {
      if (node.op === '&&') return truthy(evalNode(node.left, env)) ? truthy(evalNode(node.right, env)) : false;
      if (node.op === '||') return truthy(evalNode(node.left, env)) ? true : truthy(evalNode(node.right, env));
      if (node.op === '??') { const l = evalNode(node.left, env); return l == null ? evalNode(node.right, env) : l; }
      return applyBin(node.op, evalNode(node.left, env), evalNode(node.right, env));
    }
    case 'unary': { const v = evalNode(node.arg, env); return node.op === '!' ? !truthy(v) : node.op === '-' ? -v : node.op === '~' ? ~v : +v; }
    case 'cond': return truthy(evalNode(node.c, env)) ? evalNode(node.a, env) : evalNode(node.b, env);
    case 'cast': { const v = evalNode(node.arg, env); return ['int', 'long', 'short', 'byte', 'uint', 'ulong', 'char'].includes(node.t) ? Math.trunc(v) : v; }
    case 'assign': { const lv = lvalue(node.target, env); const rhs = evalNode(node.value, env); const v = node.op === '=' ? rhs : applyBin(node.op[0], lv.get(), rhs); lv.set(v); return v; }
    case 'preincr': { const lv = lvalue(node.arg, env); const v = lv.get() + (node.op === '++' ? 1 : -1); lv.set(v); return v; }
    case 'postincr': { const lv = lvalue(node.arg, env); const old = lv.get(); lv.set(old + (node.op === '++' ? 1 : -1)); return old; }
    default: throw new Error(`cannot evaluate ${node.type}`);
  }
}

function construct(node, env) {
  const tn = node.typeName;
  if (tn === 'List' || tn === 'Stack' || tn === 'Queue' || tn === 'HashSet') return node.initList ? evalNode(node.initList, env) : [];
  if (tn === 'Dictionary') return new Map();
  const prog = env.get('__program');
  if (prog?.classes?.has(tn)) return instantiate(prog.classes.get(tn), node.args.map((a) => evalNode(a, env)), env);
  // generic object initializer or unknown type
  const obj = {};
  if (node.initList) return evalNode(node.initList, env);
  return obj;
}

function instantiate(def, args, env) {
  const prog = env.get('__program');
  const obj = {};
  for (const f of def.fields) obj[f.name] = f.init ? evalNode(f.init, env) : (f.typeName === 'List' ? [] : f.typeName === 'Dictionary' ? new Map() : f.typeName === 'string' ? '' : 0);
  for (const [mn, m] of def.methods) obj[mn] = (...a) => { if (!m.body) m.body = new Parser([...m.bodyToks, { type: 'eof', value: null }]).parseProgram(); return runBody(m.body, m.params, prog, obj, a); };
  if (def.ctor) { if (!def.ctor.body) def.ctor.body = new Parser([...def.ctor.bodyToks, { type: 'eof', value: null }]).parseProgram(); runBody(def.ctor.body, def.ctor.params, prog, obj, args); }
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
    case 'foreach': {
      const it = evalNode(node.iterable, env);
      const list = it instanceof Map ? [...it.entries()].map(([k, v]) => ({ Key: k, Value: v })) : typeof it === 'string' ? it.split('') : Array.isArray(it) ? it : [];
      for (const el of list) { const inner = new Env(env); inner.define(node.name, el); try { execStmt(node.body, inner); } catch (e) { if (e === BREAK) break; if (e !== CONTINUE) throw e; } }
      return;
    }
    case 'switch': { const d = evalNode(node.disc, env); let start = node.clauses.findIndex((c) => c.test !== null && evalNode(c.test, env) === d); if (start < 0) start = node.clauses.findIndex((c) => c.test === null); if (start < 0) return; const inner = new Env(env); try { for (let ci = start; ci < node.clauses.length; ci++) for (const s of node.clauses[ci].stmts) execStmt(s, inner); } catch (e) { if (e === BREAK) return; throw e; } return; }
    case 'return': throw new ReturnSignal(node.expr ? evalNode(node.expr, env) : undefined);
    case 'throw': throw new CsThrow(node.expr ? evalNode(node.expr, env) : undefined);
    case 'try': {
      try { execStmt(node.block, new Env(env)); }
      catch (e) {
        if (e instanceof ReturnSignal || e === BREAK || e === CONTINUE) { if (node.fin) execStmt(node.fin, new Env(env)); throw e; }
        if (node.catches.length) { const c = node.catches[0]; const inner = new Env(env); inner.define(c.param ?? '__exc', e instanceof CsThrow ? e.value : { Message: String(e?.message ?? e) }); execStmt(c.body, inner); }
        else if (!node.fin) throw e;
      }
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
  if (d.ctorArgs) { const tn = d.typeName; if (tn === 'List') return []; if (tn === 'Dictionary') return new Map(); const prog = env.get('__program'); if (prog?.classes?.has(tn)) return instantiate(prog.classes.get(tn), d.ctorArgs.map((x) => evalNode(x, env)), env); const a = d.ctorArgs.map((x) => evalNode(x, env)); return a.length === 1 ? a[0] : 0; }
  if (d.typeName === 'List') return [];
  if (d.typeName === 'Dictionary') return new Map();
  if (d.typeName === 'string') return '';
  if (d.typeName === 'bool') return false;
  return 0;
}

/* ------------------------------------------------------------------- top-level + run */

// struct/class members
function parseTypeMembers(toks) {
  const fields = [], methods = new Map(); let ctor = null; let i = 0;
  while (i < toks.length) {
    if (['public', 'private', 'protected', 'internal', 'static', 'readonly', 'const', 'override', 'virtual', 'abstract', 'sealed', 'partial', 'new'].includes(toks[i]?.value)) { i++; continue; }
    if (toks[i]?.value === ';' || toks[i]?.value === '{' || toks[i]?.value === '}') { i++; continue; }
    let j = i, name = null, nameIdx = -1, isMethod = false;
    while (j < toks.length) {
      const v = toks[j].value;
      if (v === '<') { let d = 0; do { if (toks[j].value === '<') d++; else if (toks[j].value === '>') d--; j++; } while (d > 0 && j < toks.length); continue; }
      if (v === '{' || v === '}' || v === ';') break;
      if (toks[j].type === 'id') { const nx = toks[j + 1]?.value; if (nx === '(') { name = toks[j].value; nameIdx = j; isMethod = true; break; } if (nx === '=' || nx === ';' || nx === ',' || nx === '{') { name = toks[j].value; nameIdx = j; break; } }
      j++;
    }
    if (name === null) break;
    if (isMethod) {
      const pOpen = nameIdx + 1, pEnd = matchClose(toks, pOpen, '(', ')');
      if (toks[pEnd + 1]?.value === '{') {
        const bEnd = matchClose(toks, pEnd + 1, '{', '}');
        const m = { params: paramNames(toks.slice(pOpen + 1, pEnd)), bodyToks: toks.slice(pEnd + 2, bEnd), body: null };
        methods.set(name, m);
        i = bEnd + 1;
      } else { i = pEnd + 1; if (toks[i]?.value === ';') i++; }
    } else {
      // field or auto-property:  Type Name;  Type Name = expr;  Type Name { get; set; }
      let typeName = ''; { let k = i; while (k < nameIdx) { if (toks[k].type === 'id' && !MODIFIERS.has(toks[k].value)) typeName = toks[k].value; k++; } }
      let k = nameIdx + 1, init = null;
      if (toks[k]?.value === '{') { const e = matchClose(toks, k, '{', '}'); k = e + 1; }       // auto-property → field
      else if (toks[k]?.value === '=') { const start = k + 1; let d = 0; let e = start; while (e < toks.length && !(toks[e].value === ';' && d === 0)) { if ('([{'.includes(toks[e].value)) d++; if (')]}'.includes(toks[e].value)) d--; e++; } init = new Parser([...toks.slice(start, e), { type: 'eof', value: null }]).parseExpr(); k = e; }
      while (k < toks.length && toks[k].value !== ';') k++;
      fields.push({ name, typeName, init });
      i = k + 1;
    }
  }
  return { fields, methods, ctor };
}

function extractTypes(toks) {
  const classes = new Map(), enums = new Map(), diagnostics = [];
  let i = 0;
  while (i < toks.length) {
    const t = toks[i];
    if (t.type === 'id' && (t.value === 'class' || t.value === 'struct') && toks[i + 1]?.type === 'id') {
      const name = toks[i + 1].value; let b = i + 2; while (b < toks.length && toks[b].value !== '{') b++;
      if (toks[b]?.value === '{') { const bEnd = matchClose(toks, b, '{', '}'); try { const tm = parseTypeMembers(toks.slice(b + 1, bEnd)); tm.line = t.line; classes.set(name, tm); } catch (e) { diagnostics.push(`class ${name}: ${e.message ?? e}`); } i = bEnd + 1; continue; }
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
  let val = 0, i = 0;
  while (i < toks.length) {
    if (toks[i].type !== 'id') { i++; continue; }
    const name = toks[i].value; i++;
    if (toks[i]?.value === '=') { i++; const start = i; let d = 0; while (i < toks.length && !(toks[i].value === ',' && d === 0)) { if ('([{'.includes(toks[i].value)) d++; if (')]}'.includes(toks[i].value)) d--; i++; } try { val = evalNode(new Parser([...toks.slice(start, i), { type: 'eof', value: null }]).parseExpr(), new Env(null)); } catch { /* keep */ } }
    enums.set(name, val); val = (typeof val === 'number' ? val : 0) + 1;
    if (toks[i]?.value === ',') i++;
  }
}

// Top-level globals (skipping class/enum/using/namespace bodies).
function extractGlobals(toks, program) {
  const globals = new Map(); let i = 0;
  while (i < toks.length) {
    const t = toks[i];
    if (t.type === 'id' && (t.value === 'class' || t.value === 'struct' || t.value === 'enum' || t.value === 'interface')) { let b = i; while (b < toks.length && toks[b].value !== '{' && toks[b].value !== ';') b++; if (toks[b]?.value === '{') { i = matchClose(toks, b, '{', '}') + 1; } else i = b + 1; continue; }
    if (t.type === 'id' && (t.value === 'using' || t.value === 'namespace')) { let b = i; while (b < toks.length && toks[b].value !== ';' && toks[b].value !== '{') b++; if (toks[b]?.value === '{') { i = b + 1; } else i = b + 1; continue; }
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

function runBody(body, params, program, thisObj, args) {
  const env = new Env(null);
  env.define('__program', program ?? null);
  env.define('__print', program?.print ?? (() => {}));
  env.define('Console', { WriteLine: (...a) => (program?.print ?? (() => {}))(a.map(csStr).join('')), Write: (...a) => (program?.print ?? (() => {}))(a.map(csStr).join('')) });
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

export function compileCsharp(source) {
  const diagnostics = []; const handlers = new Map();
  const program = { funcs: new Map(), classes: new Map(), enums: new Map(), globals: new Map(), print: null };
  let toks;
  try { toks = tokenize(String(source ?? '')); } catch (e) { return { handlers, diagnostics: [String(e.message ?? e)] }; }
  const types = extractTypes(toks);
  for (const [n, c] of types.classes) program.classes.set(n, c);
  for (const [n, v] of types.enums) program.enums.set(n, v);
  diagnostics.push(...types.diagnostics);
  let fns; try { fns = extractFunctions(toks); } catch (e) { return { handlers, diagnostics: [...diagnostics, String(e.message ?? e)] }; }
  for (const fn of fns) {
    try { fn.params = paramNames(fn.paramToks); fn.body = new Parser(fn.bodyToks).parseProgram(); fn.program = program; program.funcs.set(fn.name, fn); handlers.set(fn.name, fn); }
    catch (e) { diagnostics.push(`${fn.name}: ${e.message ?? e}`); }
  }
  try { for (const [n, v] of extractGlobals(toks, program)) program.globals.set(n, v); } catch (e) { diagnostics.push(`globals: ${e.message ?? e}`); }
  return { handlers, diagnostics };
}

export function invokeCsharp(fnNode, args = [], opts = {}) {
  const program = fnNode.program;
  if (program && opts.print) program.print = opts.print;
  return runBody(fnNode.body, fnNode.params, program, null, args);
}

/* -------------------------------------------------- editor language-service support */

export function analyzeCsharp(source) {
  const src = String(source ?? '');
  if (!src.trim()) return { diagnostics: [], symbols: [] };
  const offs = [0]; for (let i = 0; i < src.length; i++) if (src[i] === '\n') offs.push(i + 1);
  const { diagnostics: raw } = compileCsharp(src);
  const diagnostics = raw.map((d) => { const message = String(d); const ln = Math.max(1, parseInt((/\(line (\d+)\)/.exec(message) || [])[1] || '1', 10)); return { severity: 'error', message: message.replace(/\s*\(line \d+\)/, ''), line: ln, col: 0, index: offs[ln - 1] ?? 0 }; });
  const symbols = [];
  let toks; try { toks = tokenize(src); } catch { return { diagnostics, symbols }; }
  for (const fn of extractFunctions(toks)) symbols.push({ name: fn.name, kind: 'function', detail: `${fn.name}(${paramNames(fn.paramToks).join(', ')})`, line: fn.line ?? 1, col: 0, index: fn.index ?? 0 });
  let m; const reType = /\b(class|struct|enum|interface)\s+([A-Za-z_]\w*)/g;
  while ((m = reType.exec(src))) symbols.push({ name: m[2], kind: 'class', detail: `${m[1]} ${m[2]}`, line: src.slice(0, m.index).split('\n').length, col: 0, index: m.index });
  return { diagnostics, symbols };
}

export function foldCsharp(source) {
  let toks; try { toks = tokenize(String(source ?? '')); } catch { return []; }
  const stack = [], byStart = new Map();
  for (const t of toks) { if (t.value === '{') stack.push(t.line); else if (t.value === '}') { const s = stack.pop(); if (s != null && t.line > s) { const p = byStart.get(s); if (!p || t.line > p.endLine) byStart.set(s, { startLine: s, endLine: t.line }); } } }
  return [...byStart.values()].sort((a, b) => a.startLine - b.startLine);
}
