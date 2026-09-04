// Shared browser-side response-curve math for the Velocity / Expression Designer. The native
// engine uses the same five curves and nine evenly-spaced custom points; keeping this pure lets
// localhost preview and tests show the exact result without pretending to run the audio graph.

export const RESPONSE_CURVE_POINT_COUNT = 9;
export const RESPONSE_CURVES = ['linear', 'soft', 'hard', 's curve', 'custom'];

const clamp = (value, low, high) => Math.min(high, Math.max(low, Number(value)));

export function normalizeResponseCurvePoints(points) {
  const source = Array.isArray(points) && points.length === RESPONSE_CURVE_POINT_COUNT
    ? points : null;
  return Array.from({ length: RESPONSE_CURVE_POINT_COUNT }, (_, index) => {
    const identity = Math.round(index * 127 / (RESPONSE_CURVE_POINT_COUNT - 1));
    return Math.round(clamp(source?.[index] ?? identity, 0, 127));
  });
}

export function responseCurveValue(input, curve = 'linear', customPoints = []) {
  const x = clamp(Number.isFinite(Number(input)) ? Number(input) : 0, 0, 1);
  if (curve === 'soft') return Math.sqrt(x);
  if (curve === 'hard') return x * x;
  if (curve === 's curve') return x * x * (3 - 2 * x);
  if (curve !== 'custom') return x;

  const points = normalizeResponseCurvePoints(customPoints);
  const scaled = x * (RESPONSE_CURVE_POINT_COUNT - 1);
  const left = Math.min(RESPONSE_CURVE_POINT_COUNT - 1, Math.floor(scaled));
  const right = Math.min(RESPONSE_CURVE_POINT_COUNT - 1, left + 1);
  const fraction = scaled - left;
  return (points[left] + (points[right] - points[left]) * fraction) / 127;
}

export function responseCurveDisplayPoints(curve = 'linear', customPoints = []) {
  if (curve === 'custom') return normalizeResponseCurvePoints(customPoints);
  return Array.from({ length: RESPONSE_CURVE_POINT_COUNT }, (_, index) => Math.round(
    responseCurveValue(index / (RESPONSE_CURVE_POINT_COUNT - 1), curve) * 127));
}

export function applyResponseCurve7(value, options = {}) {
  const noteVelocity = options.noteVelocity === true;
  const floor = noteVelocity ? 1 : 0;
  const inputA = Math.round(clamp(options.inputMin ?? floor, floor, 127));
  const inputB = Math.round(clamp(options.inputMax ?? 127, floor, 127));
  const outputA = Math.round(clamp(options.outputMin ?? floor, floor, 127));
  const outputB = Math.round(clamp(options.outputMax ?? 127, floor, 127));
  const inputMin = Math.min(inputA, inputB);
  const inputMax = Math.max(inputA, inputB);
  const outputMin = Math.min(outputA, outputB);
  const outputMax = Math.max(outputA, outputB);
  const incoming = clamp(Number.isFinite(Number(value)) ? Number(value) : inputMin,
    inputMin, inputMax);
  const normalized = inputMax === inputMin ? (incoming >= inputMax ? 1 : 0)
    : (incoming - inputMin) / (inputMax - inputMin);
  return Math.round(clamp(outputMin + responseCurveValue(
    normalized, options.curve, options.points) * (outputMax - outputMin), floor, 127));
}
