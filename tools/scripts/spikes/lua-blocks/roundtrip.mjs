// lua-blocks spike: does a block view of Lua round-trip without changing meaning?
//
// Supports docs/design/product-ideas.md section 12. NOT shipped code and not on any test
// path — it exists so the round-trip claim in that document can be re-run and argued with.
//
// Claim under test: blocks -> Lua always works, and Lua -> blocks never REJECTS anything
// (unsupported statements become a raw-Lua block carrying the original source verbatim).
// Both directions are checked by comparing normalised ASTs, not strings.

// Resolved against CE/web's node_modules so this runs from anywhere in the tree.
// Requires `cd CE/web && npm ci` first — see README.md.
import luaparse from '../../../../CE/web/node_modules/luaparse/luaparse.js';

// ---------------------------------------------------------------- Lua -> blocks

const SUPPORTED = new Set([
  'LocalStatement', 'AssignmentStatement', 'CallStatement', 'IfStatement',
  'ForNumericStatement', 'ReturnStatement', 'FunctionDeclaration', 'WhileStatement',
]);

function expr(node) {
  // Expressions become block sockets. Anything we do not model is kept as raw source.
  switch (node.type) {
    case 'NumericLiteral': case 'StringLiteral': case 'BooleanLiteral': case 'NilLiteral':
      return { k: 'lit', raw: node.raw };
    case 'Identifier':
      return { k: 'var', name: node.name };
    case 'BinaryExpression': case 'LogicalExpression':
      return { k: 'bin', op: node.operator, a: expr(node.left), b: expr(node.right) };
    case 'UnaryExpression':
      return { k: 'un', op: node.operator, a: expr(node.argument) };
    case 'CallExpression':
      return { k: 'call', fn: name(node.base), args: node.arguments.map(expr) };
    case 'MemberExpression':
      return { k: 'member', obj: expr(node.base), idx: node.identifier.name, sep: node.indexer };
    default:
      return { k: 'rawExpr', src: slice(node) };
  }
}

function name(base) {
  if (base.type === 'Identifier') return base.name;
  if (base.type === 'MemberExpression') return `${name(base.base)}${base.indexer}${base.identifier.name}`;
  return slice(base);
}

let SRC = '';
const slice = (n) => SRC.slice(n.range[0], n.range[1]);

function stmt(node) {
  if (!SUPPORTED.has(node.type)) return { k: 'raw', src: slice(node) };   // never rejected
  switch (node.type) {
    case 'LocalStatement':
      return { k: 'local', names: node.variables.map((v) => v.name), values: node.init.map(expr) };
    case 'AssignmentStatement':
      return { k: 'set', targets: node.variables.map(expr), values: node.init.map(expr) };
    case 'CallStatement':
      return { k: 'do', call: expr(node.expression) };
    case 'ReturnStatement':
      return { k: 'return', values: node.arguments.map(expr) };
    case 'IfStatement':
      return { k: 'if', clauses: node.clauses.map((c) => ({
        cond: c.condition ? expr(c.condition) : null, body: c.body.map(stmt) })) };
    case 'ForNumericStatement':
      return { k: 'forRange', v: node.variable.name, from: expr(node.start), to: expr(node.end),
               step: node.step ? expr(node.step) : null, body: node.body.map(stmt) };
    case 'WhileStatement':
      return { k: 'while', cond: expr(node.condition), body: node.body.map(stmt) };
    case 'FunctionDeclaration':
      return { k: 'func', name: node.identifier ? name(node.identifier) : null, isLocal: !!node.isLocal,
               params: node.parameters.map((p) => p.name ?? p.value), body: node.body.map(stmt) };
  }
}

export function luaToBlocks(src) {
  SRC = src;
  const ast = luaparse.parse(src, { ranges: true, locations: false, comments: false, luaVersion: '5.3' });
  return ast.body.map(stmt);
}

// ---------------------------------------------------------------- blocks -> Lua

const pad = (d) => '  '.repeat(d);

function genExpr(e) {
  switch (e.k) {
    case 'lit': return e.raw;
    case 'var': return e.name;
    case 'bin': return `(${genExpr(e.a)} ${e.op} ${genExpr(e.b)})`;
    case 'un': return `${e.op}${e.op === 'not' ? ' ' : ''}${genExpr(e.a)}`;
    case 'call': return `${e.fn}(${e.args.map(genExpr).join(', ')})`;
    case 'member': return `${genExpr(e.obj)}${e.sep}${e.idx}`;
    case 'rawExpr': return e.src;
  }
}

function genStmt(b, d = 0) {
  const p = pad(d);
  switch (b.k) {
    case 'raw': return b.src.split('\n').map((l) => p + l).join('\n');
    case 'local': return `${p}local ${b.names.join(', ')}${b.values.length ? ' = ' + b.values.map(genExpr).join(', ') : ''}`;
    case 'set': return `${p}${b.targets.map(genExpr).join(', ')} = ${b.values.map(genExpr).join(', ')}`;
    case 'do': return `${p}${genExpr(b.call)}`;
    case 'return': return `${p}return${b.values.length ? ' ' + b.values.map(genExpr).join(', ') : ''}`;
    case 'if': {
      const out = [];
      b.clauses.forEach((c, i) => {
        out.push(i === 0 ? `${p}if ${genExpr(c.cond)} then`
               : c.cond ? `${p}elseif ${genExpr(c.cond)} then` : `${p}else`);
        out.push(...c.body.map((s) => genStmt(s, d + 1)));
      });
      out.push(`${p}end`);
      return out.join('\n');
    }
    case 'forRange':
      return [`${p}for ${b.v} = ${genExpr(b.from)}, ${genExpr(b.to)}${b.step ? ', ' + genExpr(b.step) : ''} do`,
              ...b.body.map((s) => genStmt(s, d + 1)), `${p}end`].join('\n');
    case 'while':
      return [`${p}while ${genExpr(b.cond)} do`, ...b.body.map((s) => genStmt(s, d + 1)), `${p}end`].join('\n');
    case 'func':
      return [`${p}${b.isLocal ? 'local ' : ''}function ${b.name ?? ''}(${b.params.join(', ')})`,
              ...b.body.map((s) => genStmt(s, d + 1)), `${p}end`].join('\n');
  }
}

export const blocksToLua = (blocks) => blocks.map((b) => genStmt(b, 0)).join('\n');

// ---------------------------------------------------------------- equivalence

/** Strip positions and cosmetic fields so two ASTs compare on MEANING, not layout. */
function normalise(n) {
  if (Array.isArray(n)) return n.map(normalise);
  if (n && typeof n === 'object') {
    const out = {};
    for (const k of Object.keys(n).sort()) {
      if (k === 'range' || k === 'loc' || k === 'raw') continue;
      out[k] = normalise(n[k]);
    }
    return out;
  }
  return n;
}

export function sameMeaning(a, b) {
  const opts = { ranges: false, locations: false, comments: false, luaVersion: '5.3' };
  return JSON.stringify(normalise(luaparse.parse(a, opts)))
      === JSON.stringify(normalise(luaparse.parse(b, opts)));
}

/** Count BOTH fallback kinds: a whole unsupported statement, and an unsupported expression
    sitting in an otherwise-modelled statement. The second kind is the one that is easy to
    miss and the one that decides whether a block view is actually useful. */
export function countRaw(blocks) {
  let stmts = 0, exprs = 0;
  const inExpr = (e) => {
    if (!e || typeof e !== 'object') return;
    if (e.k === 'rawExpr') exprs++;
    ['a', 'b', 'obj', 'call', 'cond', 'from', 'to', 'step'].forEach((f) => inExpr(e[f]));
    if (e.args) e.args.forEach(inExpr);
  };
  const walk = (bs) => bs.forEach((b) => {
    if (b.k === 'raw') stmts++;
    ['values', 'targets'].forEach((f) => { if (b[f]) b[f].forEach(inExpr); });
    ['call', 'cond', 'from', 'to', 'step'].forEach((f) => inExpr(b[f]));
    if (b.body) walk(b.body);
    if (b.clauses) b.clauses.forEach((c) => { inExpr(c.cond); walk(c.body); });
  });
  walk(blocks);
  return { stmts, exprs };
}
