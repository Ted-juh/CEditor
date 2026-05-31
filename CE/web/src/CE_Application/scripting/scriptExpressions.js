export function readPath(source, path, fallback = undefined) {
  const parts = String(path ?? '').split('.').filter(Boolean);
  if (parts.length === 0) return fallback;

  let cursor = source;
  for (const part of parts) {
    if (cursor == null || typeof cursor !== 'object' || !(part in cursor)) return fallback;
    cursor = cursor[part];
  }
  return cursor;
}

function asNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function clamp(value, min, max) {
  const low = Math.min(asNumber(min), asNumber(max));
  const high = Math.max(asNumber(min), asNumber(max));
  return Math.min(high, Math.max(low, asNumber(value)));
}

export function scale(value, fromMin, fromMax, toMin, toMax) {
  const input = asNumber(value);
  const inMin = asNumber(fromMin);
  const inMax = asNumber(fromMax);
  const outMin = asNumber(toMin);
  const outMax = asNumber(toMax);
  if (inMax === inMin) return outMin;
  const t = (input - inMin) / (inMax - inMin);
  return outMin + t * (outMax - outMin);
}

export function curve(value, from = 0, to = 1, shape = 'linear') {
  const input = clamp(value, 0, 1);
  const shaped = shape === 'exp'
    ? input * input
    : shape === 'sqrt'
      ? Math.sqrt(input)
      : input;
  return scale(shaped, 0, 1, from, to);
}

export function split14Bit(value) {
  const number = Math.max(0, Math.min(16383, Math.round(asNumber(value))));
  return { value: number, msb: (number >> 7) & 0x7F, lsb: number & 0x7F };
}

export function evaluateExpression(expression, context = {}) {
  if (expression == null) return expression;
  if (typeof expression === 'number' || typeof expression === 'boolean') return expression;
  if (typeof expression === 'string') return expression;

  if (Array.isArray(expression)) {
    return expression.map((item) => evaluateExpression(item, context));
  }

  if (typeof expression !== 'object') return expression;

  if (expression.ref) {
    return readPath(context, expression.ref, 0);
  }

  if (Object.prototype.hasOwnProperty.call(expression, 'literal')) {
    return expression.literal;
  }

  const op = String(expression.op ?? '');
  const args = Array.isArray(expression.args) ? expression.args.map((arg) => evaluateExpression(arg, context)) : [];
  switch (op) {
    case 'clamp':
      return clamp(args[0], args[1], args[2]);
    case 'scale':
      return scale(args[0], args[1], args[2], args[3], args[4]);
    case 'round':
      return Math.round(asNumber(args[0]));
    case 'curve':
      return curve(args[0], expression.from ?? args[1], expression.to ?? args[2], expression.shape ?? args[3]);
    case 'to14Bit':
    case 'split14bit':
      return split14Bit(args[0]);
    case 'add':
    case '+':
      return args.reduce((sum, item) => sum + asNumber(item), 0);
    case 'subtract':
    case '-':
      return args.length <= 1 ? -asNumber(args[0]) : asNumber(args[0]) - asNumber(args[1]);
    case 'multiply':
    case '*':
      return args.reduce((product, item) => product * asNumber(item), 1);
    case 'divide':
    case '/':
      return asNumber(args[1]) === 0 ? 0 : asNumber(args[0]) / asNumber(args[1]);
    case 'equals':
    case '==':
      return args[0] === args[1];
    case 'and':
      return args.every(Boolean);
    case 'or':
      return args.some(Boolean);
    case 'not':
      return !args[0];
    default:
      return expression.value ?? 0;
  }
}

export function expressionToText(expression, target = 'ce') {
  if (expression == null) return 'null';
  if (typeof expression === 'number' || typeof expression === 'boolean') return String(expression);
  if (typeof expression === 'string') return JSON.stringify(expression);
  if (typeof expression !== 'object') return String(expression);
  if (expression.ref) return String(expression.ref);
  if (Object.prototype.hasOwnProperty.call(expression, 'literal')) return JSON.stringify(expression.literal);

  const op = String(expression.op ?? '');
  const args = Array.isArray(expression.args) ? expression.args.map((arg) => expressionToText(arg, target)) : [];
  if (op === '*' || op === '+' || op === '-' || op === '/') return `(${args.join(` ${op} `)})`;
  if (op === 'curve') {
    return `curve(${args[0] ?? '0'}, from: ${expression.from ?? args[1] ?? 0}, to: ${expression.to ?? args[2] ?? 1}, shape: ${JSON.stringify(expression.shape ?? 'linear')})`;
  }
  if (op === 'split14bit') return `split14bit(${args.join(', ')})`;
  return `${op || 'value'}(${args.join(', ')})`;
}
