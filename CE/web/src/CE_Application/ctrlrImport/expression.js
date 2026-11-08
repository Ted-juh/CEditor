// expression.js — Ctrlr's value formulas, evaluated exactly as Ctrlr evaluates them.
//
// A modulator can carry `modulatorValueExpression`: what the control's value becomes on the wire.
// About 4,000 of the 25,000 sending modulators in the public panels surveyed have one —
// "modulatorValue + 64", "(modulatorValue - 63) * -1", and Ctrlr's way of writing a negative number,
// "lt(modulatorValue, 0, 16384 + modulatorValue, modulatorValue)". The harvester turns each into
// something a device profile says (harvest.js); this is what tells it what the formula DOES.
//
// THE LANGUAGE is JUCE's Expression (numbers, + - * /, unary minus, parentheses, symbols and
// function calls) with Ctrlr's functions (CtrlrEvaluationScopes.cpp, evaluateFormulaFunction):
//
//   lt gt lte gte eq (a, b, then, else)     abs ceil floor     mod (integer) fmod pow     min max
//
// and the modulator's symbols (CtrlrModulatorProcessor::getSymbolValue). What Ctrlr then sends is
// the result cut to an integer (`int evaluationResult = evaluateForward(...)`), which is what
// `evaluateForward` here returns too.
//
// WHAT IS REFUSED rather than guessed: setBit, setGlobal and the other functions that write panel
// state as a side effect — they are Lua-shaped logic in a formula's clothing — and any symbol Ctrlr
// would quietly read as 1.0. A formula that does not parse is refused too; Ctrlr itself falls back to
// sending the plain value then, and a profile should not inherit that accident silently.

const FUNCTIONS = {
  lt: [4, (a, b, c, d) => (a < b ? c : d)],
  gt: [4, (a, b, c, d) => (a > b ? c : d)],
  lte: [4, (a, b, c, d) => (a <= b ? c : d)],
  gte: [4, (a, b, c, d) => (a >= b ? c : d)],
  eq: [4, (a, b, c, d) => (a === b ? c : d)],
  abs: [1, (a) => Math.abs(a)],
  ceil: [1, (a) => Math.ceil(a)],
  floor: [1, (a) => Math.floor(a)],
  mod: [2, (a, b) => Math.trunc(a) % Math.trunc(b)],
  fmod: [2, (a, b) => a % b],
  pow: [2, (a, b) => a ** b],
  max: [2, (a, b) => Math.max(a, b)],
  min: [2, (a, b) => Math.min(a, b)],
};

/** The value names a forward formula may read, all of them the control's value here. */
const VALUE_SYMBOLS = new Set(['modulatorValue']);
const RANGE_SYMBOLS = new Set(['modulatorMin', 'modulatorMax']);

function tokenize(text) {
  const tokens = [];
  const pattern = /\s*(?:(\d+\.?\d*(?:[eE][-+]?\d+)?|\.\d+)|([A-Za-z_][A-Za-z0-9_.]*)|(.))/gy;
  let match;
  while (pattern.lastIndex < text.length && (match = pattern.exec(text))) {
    if (match[1] !== undefined) tokens.push({ kind: 'number', value: Number(match[1]) });
    else if (match[2] !== undefined) tokens.push({ kind: 'name', value: match[2] });
    else if (match[3] !== undefined && match[3].trim()) tokens.push({ kind: 'op', value: match[3] });
  }
  return tokens;
}

class Parser {
  constructor(tokens) { this.tokens = tokens; this.at = 0; }
  peek() { return this.tokens[this.at]; }
  take(op) {
    const token = this.peek();
    if (token?.kind === 'op' && token.value === op) { this.at += 1; return true; }
    return false;
  }
  expect(op) { if (!this.take(op)) throw new Error(`expected "${op}"`); }

  // sum := product (('+'|'-') product)*  ;  product := unary (('*'|'/') unary)*
  sum() {
    let node = this.product();
    for (;;) {
      if (this.take('+')) node = { op: '+', a: node, b: this.product() };
      else if (this.take('-')) node = { op: '-', a: node, b: this.product() };
      else return node;
    }
  }
  product() {
    let node = this.unary();
    for (;;) {
      if (this.take('*')) node = { op: '*', a: node, b: this.unary() };
      else if (this.take('/')) node = { op: '/', a: node, b: this.unary() };
      else return node;
    }
  }
  unary() {
    if (this.take('-')) return { op: 'neg', a: this.unary() };
    if (this.take('+')) return this.unary();
    return this.primary();
  }
  primary() {
    const token = this.tokens[this.at++];
    if (!token) throw new Error('the formula ends early');
    if (token.kind === 'number') return { op: 'num', value: token.value };
    if (token.kind === 'op' && token.value === '(') {
      const inner = this.sum();
      this.expect(')');
      return inner;
    }
    if (token.kind === 'name') {
      if (this.take('(')) {
        const args = [];
        if (!this.take(')')) {
          do { args.push(this.sum()); } while (this.take(','));
          this.expect(')');
        }
        const spec = FUNCTIONS[token.value];
        if (!spec) throw new Error(`"${token.value}" is not a function Ctrlr's formulas have, or one that changes the panel`);
        if (args.length !== spec[0]) throw new Error(`${token.value} takes ${spec[0]} values, not ${args.length}`);
        return { op: 'call', fn: spec[1], args };
      }
      if (VALUE_SYMBOLS.has(token.value)) return { op: 'value' };
      if (RANGE_SYMBOLS.has(token.value)) return { op: 'range', name: token.value };
      throw new Error(`"${token.value}" is not something a value formula can read here`);
    }
    throw new Error(`unexpected "${token.value}"`);
  }
}

function evaluate(node, scope) {
  switch (node.op) {
    case 'num': return node.value;
    case 'value': return scope.value;
    case 'range': return node.name === 'modulatorMin' ? scope.min : scope.max;
    case 'neg': return -evaluate(node.a, scope);
    case '+': return evaluate(node.a, scope) + evaluate(node.b, scope);
    case '-': return evaluate(node.a, scope) - evaluate(node.b, scope);
    case '*': return evaluate(node.a, scope) * evaluate(node.b, scope);
    case '/': {
      const divisor = evaluate(node.b, scope);
      // JUCE's Expression divides as doubles; a zero divisor is an infinity Ctrlr then sends as
      // garbage. Refused here instead.
      if (divisor === 0) throw new Error('the formula divides by zero');
      return evaluate(node.a, scope) / divisor;
    }
    case 'call': return node.fn(...node.args.map((arg) => evaluate(arg, scope)));
    default: throw new Error('unreadable formula');
  }
}

/** Is this formula the plain value — empty, or one of the ways Ctrlr writes "unchanged"? */
export function isIdentityExpression(expression) {
  const text = String(expression ?? '').trim().replace(/;$/, '').trim();
  return ['', 'modulatorValue', 'value', 'midiValue', 'return modulatorValue', 'return value'].includes(text);
}

/**
 * A forward formula, compiled: `{ ok, identity, forward(value), rawValue(value) }` — `forward`
 * returns the integer Ctrlr would send and `rawValue` the result before it is cut; both throw for a
 * value the formula cannot compute — or `{ ok: false, error }`.
 */
export function compileForwardExpression(text, { min = 0, max = 127 } = {}) {
  const source = String(text ?? '').trim();
  if (isIdentityExpression(source)) {
    return { ok: true, identity: true, forward: (value) => Math.trunc(value), rawValue: (value) => value };
  }
  let tree;
  try {
    const parser = new Parser(tokenize(source));
    tree = parser.sum();
    if (parser.at < parser.tokens.length) throw new Error(`unexpected "${parser.tokens[parser.at].value}"`);
  } catch (error) {
    return { ok: false, error: `the value formula "${source}" cannot be read: ${error.message}` };
  }
  const rawValue = (value) => {
    const result = evaluate(tree, { value, min, max });
    if (!Number.isFinite(result)) throw new Error(`the value formula gives ${result} for ${value}`);
    return result;
  };
  return {
    ok: true,
    identity: false,
    // What Ctrlr sends: the result cut to an integer.
    forward: (value) => Math.trunc(rawValue(value)),
    // The result before that, which a transform is fitted to.
    rawValue,
  };
}
