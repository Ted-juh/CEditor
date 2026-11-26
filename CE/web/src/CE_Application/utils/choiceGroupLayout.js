// choiceGroupLayout.js — a choice group's (RadioButtonGroup's) options: which are shown, which are
// chosen, where each one goes, and which one a key moves to. Pure apart from measureChoiceLabel,
// which measures with a canvas where there is one. Drawing places the options from this layout, and
// Preview and the editor's test surface hit-test the DRAWN options (choiceKeyAtPoint), so drawing
// and clicking cannot disagree, as they could when each worked the grid out for itself
// (docs/design/choice-group.md).
import { numberOr } from './primitives.js';

/** The five looks, segmented first: what a group with no style of its own, or an unknown one, is. */
export const CHOICE_STYLES = Object.freeze(['segmented', 'buttons', 'radio', 'led', 'tab']);

/**
 * The interaction signals an option has of its own. A state whose condition asks about one of
 * these is the options' (choiceGroupStyle.js), and the control's state engine leaves it alone.
 */
export const OPTION_STATE_SIGNALS = Object.freeze(['hover', 'pressed', 'focused', 'checked']);

const trimmed = (value) => String(value ?? '').trim();
const lower = (value) => trimmed(value).toLowerCase();

export function isChoiceGroupBehavior(behavior) {
  return lower(behavior?.buttonType) === 'radio';
}

/** The style a group is drawn in. A group with no `visualStyle` takes its subtype, as it always did. */
export function choiceStyleOf(behavior) {
  const style = lower(behavior?.visualStyle ?? behavior?.subtype);
  return CHOICE_STYLES.includes(style) ? style : 'segmented';
}

/** Only the segmented style draws the control's Background as a frame round its options. */
export function choiceStyleDrawsFrame(style) {
  return style === 'segmented';
}

/** The styles whose options sit on the panel rather than on a face of their own. */
export function choiceStyleOnPanel(style) {
  return style === 'radio' || style === 'led' || style === 'tab';
}

export function choiceOrientation(behavior) {
  return lower(behavior?.orientation) === 'vertical' ? 'vertical' : 'horizontal';
}

export function choiceSelectionMode(behavior) {
  return lower(behavior?.selectionMode) === 'multi' ? 'multi' : 'single';
}

/** A state about one option: its condition reads hover, pressed, focused or checked. */
export function isOptionState(state) {
  return Object.keys(state?.when ?? {}).some((key) => OPTION_STATE_SIGNALS.includes(key));
}

/** The options a group shows: a row that is switched off is not drawn and cannot be chosen. */
export function choiceRows(valueRows = []) {
  return Array.isArray(valueRows) ? valueRows.filter((row) => row?.enabled !== false) : [];
}

/** The key an option is chosen by: its internal value, else its id. */
export function choiceKey(row, index = 0) {
  return trimmed(row?.internalValue ?? row?.id ?? `item_${index + 1}`);
}

/**
 * The keys chosen when nothing has been clicked yet: the rows marked selected by default (the first
 * one, unless multi-select), else the default value, else the first row. `forceRowIds` chooses
 * those rows instead (the Segments tab previewing the chosen look on the options it targets).
 */
export function selectedChoiceKeys(valueRows = [], behavior = null, { forceRowIds = [] } = {}) {
  const rows = choiceRows(valueRows);
  const forced = new Set((Array.isArray(forceRowIds) ? forceRowIds : []).map(trimmed));
  const selected = new Set();
  if (forced.size > 0) {
    rows.forEach((row, index) => { if (forced.has(trimmed(row?.id))) selected.add(choiceKey(row, index)); });
    return selected;
  }
  const multi = choiceSelectionMode(behavior) === 'multi';
  for (const [index, row] of rows.entries()) {
    if (row?.selectedByDefault !== true) continue;
    selected.add(choiceKey(row, index));
    if (!multi) return selected;
  }
  if (selected.size > 0) return selected;
  const defaultValue = behavior?.defaultValue;
  if (Array.isArray(defaultValue)) {
    for (const entry of defaultValue) selected.add(trimmed(entry));
  } else if (defaultValue != null && trimmed(defaultValue) !== '') {
    selected.add(trimmed(defaultValue));
  }
  if (selected.size === 0 && rows[0]) selected.add(choiceKey(rows[0], 0));
  return selected;
}

/**
 * One activation of an option, in the authored row order and with the raw values: `{ matched,
 * value }`. Multi-select adds the option, or takes it away when deselecting is allowed; single
 * choose it, or clears the choice when deselecting is allowed and it was already chosen.
 */
export function choiceSelection({ behavior = null, valueRows = [], selectedValues = [], requestedValue = '' } = {}) {
  const rows = choiceRows(valueRows);
  const requestedKey = trimmed(requestedValue);
  const nextRow = rows.find((row, index) => choiceKey(row, index) === requestedKey);
  if (!nextRow) return { matched: false, value: undefined };

  const selected = new Set((Array.isArray(selectedValues) ? selectedValues : [selectedValues])
    .filter((value) => value !== '' && value != null)
    .map(trimmed));
  const nextValue = nextRow?.internalValue ?? nextRow?.id ?? '';
  const nextKey = trimmed(nextValue);

  if (choiceSelectionMode(behavior) === 'multi') {
    if (selected.has(nextKey)) {
      if (behavior?.allowDeselect === true) selected.delete(nextKey);
    } else {
      selected.add(nextKey);
    }
    return {
      matched: true,
      value: rows.filter((row, index) => selected.has(choiceKey(row, index))).map((row) => row?.internalValue ?? row?.id ?? ''),
    };
  }
  return { matched: true, value: behavior?.allowDeselect === true && selected.has(nextKey) ? '' : nextValue };
}

/**
 * The option a key moves to from `currentKey`, or null for a key that moves nothing. The arrows go
 * to the previous or next option whichever way the group runs, as a radio group's do, and wrap;
 * Home and End go to the first and last. With no current option, any of them starts at the first.
 */
export function stepChoice(valueRows, currentKey, key) {
  const keys = choiceRows(valueRows).map((row, index) => choiceKey(row, index));
  if (!keys.length) return null;
  const at = keys.indexOf(trimmed(currentKey));
  switch (key) {
    case 'Home': return keys[0];
    case 'End': return keys[keys.length - 1];
    case 'ArrowLeft':
    case 'ArrowUp': return at < 0 ? keys[0] : keys[(at - 1 + keys.length) % keys.length];
    case 'ArrowRight':
    case 'ArrowDown': return at < 0 ? keys[0] : keys[(at + 1) % keys.length];
    default: return null;
  }
}

// --- Measuring a label --------------------------------------------------------------------------

let measuringContext = null;
const measured = new Map();

function context() {
  if (measuringContext !== null) return measuringContext;
  try {
    const canvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(1, 1)
      : (typeof document !== 'undefined' ? document.createElement('canvas') : null);
    measuringContext = canvas?.getContext?.('2d') ?? false;
  } catch {
    measuringContext = false;
  }
  return measuringContext;
}

function cased(text, transform) {
  if (transform === 'uppercase') return text.toUpperCase();
  if (transform === 'lowercase') return text.toLowerCase();
  if (transform === 'capitalize') return text.replace(/\b\w/g, (letter) => letter.toUpperCase());
  return text;
}

/**
 * A label's width in px, in the font it is drawn in. Where there is no canvas (Node, the tests) an
 * estimate: the layout only needs the labels' proportions, and clicks read the drawn options.
 */
export function measureChoiceLabel(text, { fontSize = 11, fontWeight = 600, fontFamily = '', fontStyle = '', letterSpacing = 0, textTransform = 'none' } = {}) {
  const shown = cased(String(text ?? ''), textTransform);
  const size = Math.max(1, numberOr(fontSize, 11));
  const spacing = numberOr(letterSpacing, 0) * shown.length;
  const italic = lower(fontStyle).includes('italic') ? 'italic ' : '';
  const font = `${italic}${fontWeight} ${size}px ${fontFamily ? `"${fontFamily}", ` : ''}sans-serif`;
  const cacheKey = `${font}|${shown}`;
  if (!measured.has(cacheKey)) {
    const ctx = context();
    let width;
    if (ctx) {
      ctx.font = font;
      width = ctx.measureText(shown).width;
    } else {
      width = shown.length * size * 0.6;
    }
    if (measured.size > 2000) measured.clear();
    measured.set(cacheKey, width);
  }
  return measured.get(cacheKey) + spacing;
}

// --- Layout -------------------------------------------------------------------------------------

/**
 * Room on each side of an option's content: the face styles breathe; rings and lamps sit at the
 * start of their option and are spaced by the gap, so they keep none.
 */
const PAD_X = Object.freeze({ segmented: 10, buttons: 10, tab: 8, radio: 0, led: 0 });
const MIN_PAD_X = 3;

/** Options in a segmented strip or a row of tabs touch: their spacing is the dividers or the baseline. */
function spacingFor(style, gap) {
  return style === 'segmented' || style === 'tab' ? 0 : Math.max(0, numberOr(gap, 0));
}

function columnsFor(behavior, count) {
  const requested = Math.max(0, Math.round(numberOr(behavior?.itemColumns, 0)));
  if (requested > 0) return Math.min(count, requested);
  return choiceOrientation(behavior) === 'vertical' ? 1 : Math.max(1, count);
}

/**
 * Column widths. `equal` shares the room equally; `fit` gives each column its labels' width and
 * shares what is left over (or shrinks them all alike when there is too little); `auto`, the
 * default, is `equal` while every label fits an equal share and `fit` once one does not.
 */
function columnWidths(sizing, naturals, room) {
  const count = naturals.length;
  const equal = room / count;
  const fit = sizing === 'fit' || (sizing !== 'equal' && Math.max(...naturals) > equal);
  if (!fit) return naturals.map(() => equal);
  const total = naturals.reduce((sum, width) => sum + width, 0);
  if (total <= 0) return naturals.map(() => equal);
  return total <= room
    ? naturals.map((width) => width + (room - total) / count)
    : naturals.map((width) => (width * room) / total);
}

/**
 * Where each option goes, in the control's own px. `labelWidths` are the labels' measured widths
 * (measureChoiceLabel), `indicator` how wide an option's ring or lamp is (0 for none). Items carry
 * their key, row, place in the grid, box, and the padding they keep at their size; `dividers` are
 * the hairlines a segmented strip draws between neighbours, each naming the two options it parts.
 */
export function choiceGroupLayout({
  style = 'segmented',
  behavior = null,
  valueRows = [],
  width = 0,
  height = 0,
  padding = {},
  gap = 0,
  labelWidths = [],
  indicator = 0,
  indicatorGap = 6,
} = {}) {
  const rows = choiceRows(valueRows);
  if (!rows.length) return { columns: 0, rowCount: 0, items: [], dividers: [] };

  const left = Math.max(0, numberOr(padding.left, 0));
  const right = Math.max(0, numberOr(padding.right, 0));
  const top = Math.max(0, numberOr(padding.top, 0));
  const bottom = Math.max(0, numberOr(padding.bottom, 0));
  const spacing = spacingFor(style, gap);
  const columns = columnsFor(behavior, rows.length);
  const rowCount = Math.max(1, Math.ceil(rows.length / columns));
  const contentWidth = Math.max(0, numberOr(width, 0) - left - right);
  const contentHeight = Math.max(0, numberOr(height, 0) - top - bottom);
  const padX = PAD_X[style] ?? PAD_X.segmented;
  const indicatorRoom = indicator > 0 ? indicator + Math.max(0, numberOr(indicatorGap, 6)) : 0;
  const natural = rows.map((row, index) => Math.max(0, numberOr(labelWidths[index], 0)) + indicatorRoom + 2 * padX);
  const naturalColumns = Array.from({ length: columns }, (_, column) =>
    Math.max(0, ...natural.filter((_, index) => index % columns === column)));
  const widths = columns === 1
    ? [contentWidth]
    : columnWidths(lower(behavior?.optionSizing) || 'auto', naturalColumns, Math.max(0, contentWidth - spacing * (columns - 1)));
  const cellHeight = Math.max(0, (contentHeight - spacing * (rowCount - 1)) / rowCount);
  const lefts = widths.reduce((out, columnWidth, column) => {
    out.push(column === 0 ? left : out[column - 1] + widths[column - 1] + spacing);
    return out;
  }, []);

  const items = rows.map((row, index) => {
    const column = index % columns;
    const line = Math.floor(index / columns);
    const itemWidth = widths[column];
    const content = Math.max(0, numberOr(labelWidths[index], 0)) + indicatorRoom;
    return {
      key: choiceKey(row, index),
      row,
      index,
      column,
      line,
      left: lefts[column],
      top: top + line * (cellHeight + spacing),
      width: itemWidth,
      height: cellHeight,
      // The padding an option keeps: all of it while its content fits, less as it gets tight,
      // and never under three px where the style has any.
      padX: Math.max(Math.min(MIN_PAD_X, padX), Math.min(padX, (itemWidth - content) / 2)),
    };
  });

  const dividers = [];
  if (style === 'segmented') {
    for (const item of items) {
      const nextInLine = items.find((other) => other.line === item.line && other.column === item.column + 1);
      if (nextInLine) {
        const x = item.left + item.width;
        dividers.push({ between: [item.key, nextInLine.key], x1: x, y1: item.top + item.height * 0.25, x2: x, y2: item.top + item.height * 0.75 });
      }
      const below = items.find((other) => other.column === item.column && other.line === item.line + 1);
      if (below) {
        const y = item.top + item.height;
        dividers.push({ between: [item.key, below.key], x1: item.left + item.width * 0.15, y1: y, x2: item.left + item.width * 0.85, y2: y });
      }
    }
  }
  return { columns, rowCount, items, dividers };
}

/**
 * The key of the drawn option under a point given in the control's own px, from the option
 * elements inside `element` (each carrying `data-choice-key`). Their offset boxes are layout
 * boxes, untouched by the control's scale or turn, which is what control-local px are.
 */
export function choiceKeyAtPoint(element, x, y) {
  const options = element?.querySelectorAll?.('[data-choice-key]') ?? [];
  for (const option of options) {
    const left = option.offsetLeft;
    const top = option.offsetTop;
    if (x >= left && x <= left + option.offsetWidth && y >= top && y <= top + option.offsetHeight) {
      return option.dataset.choiceKey ?? '';
    }
  }
  return '';
}
