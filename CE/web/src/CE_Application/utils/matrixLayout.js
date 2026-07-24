// Mod Matrix — pure math for an N×M routing grid: sources (rows) × destinations
// (columns), each cell a modulation amount. Grid geometry (with label headers),
// cell hit-test, amount storage (a flat row-major array), knob-style drag, and
// the dynamic per-cell binding ports for the fan-out mechanism. No DOM/store
// deps, so the renderer (draw), the preview hit-test, componentPorts (dynamic
// ports) and controlPortValues (fan-out) all share it and it's unit-testable.

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function clamp(n, lo, hi) { return n < lo ? lo : n > hi ? hi : n; }

export function matrixConfig(control) {
  return control?._children?.Matrix ?? {};
}
export function matrixRows(control) {
  const r = matrixConfig(control).rows;
  return Array.isArray(r) && r.length ? r.map((x) => String(x ?? '')) : ['Src'];
}
export function matrixCols(control) {
  const c = matrixConfig(control).cols;
  return Array.isArray(c) && c.length ? c.map((x) => String(x ?? '')) : ['Dest'];
}
export function matrixIndex(r, c, cols) { return r * cols + c; }

// The R×C amounts as a flat row-major array (missing entries default to 0).
export function matrixAmounts(control) {
  const R = matrixRows(control).length;
  const C = matrixCols(control).length;
  const raw = Array.isArray(matrixConfig(control).amounts) ? matrixConfig(control).amounts : [];
  const out = new Array(R * C);
  for (let i = 0; i < R * C; i += 1) out[i] = clamp(num(raw[i], 0), -1, 1);
  return out;
}
export function matrixAmountAt(control, r, c) {
  return matrixAmounts(control)[matrixIndex(r, c, matrixCols(control).length)] ?? 0;
}
// A new amounts array with cell (r,c) set (row/col-sized, clamped).
export function matrixSetAmount(control, r, c, value) {
  const C = matrixCols(control).length;
  const next = matrixAmounts(control);
  const bipolar = matrixConfig(control).bipolar !== false;
  next[matrixIndex(r, c, C)] = clamp(num(value, 0), bipolar ? -1 : 0, 1);
  return next;
}

// Layout: label headers reserve space at the top (col names) and left (row
// names); the remaining area is an even grid of cells.
export function matrixGeometry(width, height, control) {
  const cfg = matrixConfig(control);
  const R = matrixRows(control).length;
  const C = matrixCols(control).length;
  const showLabels = cfg.showLabels !== false;
  const headerW = showLabels ? clamp(num(cfg.rowHeaderW, 52), 0, num(width, 0) - 20) : 0;
  const headerH = showLabels ? clamp(num(cfg.colHeaderH, 20), 0, num(height, 0) - 20) : 0;
  const gridW = Math.max(1, num(width, 0) - headerW);
  const gridH = Math.max(1, num(height, 0) - headerH);
  return {
    headerW, headerH, gridX0: headerW, gridY0: headerH,
    cellW: gridW / Math.max(1, C), cellH: gridH / Math.max(1, R), rows: R, cols: C,
  };
}
export function matrixCellRect(r, c, geom) {
  return { x: geom.gridX0 + c * geom.cellW, y: geom.gridY0 + r * geom.cellH, w: geom.cellW, h: geom.cellH };
}
// The {r,c} cell under a control-local point, or null (in a header / outside).
export function matrixCellAtPoint(geom, px, py) {
  if (num(px, -1) < geom.gridX0 || num(py, -1) < geom.gridY0) return null;
  const c = Math.floor((px - geom.gridX0) / geom.cellW);
  const r = Math.floor((py - geom.gridY0) / geom.cellH);
  if (r < 0 || r >= geom.rows || c < 0 || c >= geom.cols) return null;
  return { r, c };
}

// Knob-style vertical drag: dragging up increases the amount. `dy` is pixels
// moved (down positive). A full cell height ≈ the full range; snap by `step`.
export function matrixAmountFromDrag(startAmount, dy, cellH, control) {
  const cfg = matrixConfig(control);
  const bipolar = cfg.bipolar !== false;
  const range = bipolar ? 2 : 1;
  const per = Math.max(24, num(cellH, 40)); // px for the full range (min feel)
  let next = num(startAmount, 0) - (num(dy, 0) / per) * range;
  const step = num(cfg.step, 0);
  if (step > 0) next = Math.round(next / step) * step;
  return clamp(next, bipolar ? -1 : 0, 1);
}

// --- Fan-out ports: one bindable port per cell -----------------------------
export function matrixCellPortId(r, c) { return `cell_${r}_${c}`; }
export function parseMatrixCellPort(id) {
  const m = String(id ?? '').match(/^cell_(\d+)_(\d+)$/);
  return m ? { r: Number(m[1]), c: Number(m[2]) } : null;
}
// The dynamic bindable ports (for componentPorts): one per cell, labelled
// "Source → Destination". `accepts`/`defaultBindingMode` mirror a value port.
export function matrixPorts(control, parameterTypes = null) {
  const rows = matrixRows(control);
  const cols = matrixCols(control);
  const accepts = parameterTypes
    ? [parameterTypes.INTEGER, parameterTypes.FLOAT, parameterTypes.BIPOLAR, parameterTypes.NORMALIZED].filter(Boolean)
    : ['int', 'float', 'bipolar', 'normalized'];
  const out = [];
  for (let r = 0; r < rows.length; r += 1) {
    for (let c = 0; c < cols.length; c += 1) {
      out.push({ id: matrixCellPortId(r, c), label: `${rows[r]} → ${cols[c]}`, accepts, defaultBindingMode: 'continuous' });
    }
  }
  return out;
}
// Fan-out values: { cellPortId: amount } for every cell (controlPortValues).
export function matrixPortValues(control) {
  const rows = matrixRows(control);
  const cols = matrixCols(control);
  const amounts = matrixAmounts(control);
  const out = {};
  for (let r = 0; r < rows.length; r += 1) {
    for (let c = 0; c < cols.length; c += 1) out[matrixCellPortId(r, c)] = amounts[matrixIndex(r, c, cols.length)];
  }
  return out;
}
