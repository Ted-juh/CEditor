/**
 * richTextEditing.js — the contenteditable operations the notepad used to get
 * from `document.execCommand`, plus the caret bookkeeping that makes an
 * external content change survivable.
 *
 * Review finding B10, last clause: the notepad was built on `execCommand`,
 * which has been formally deprecated for years, is specified nowhere, and
 * disagrees with itself between engines about what markup it emits. The four
 * commands it was used for here — bold, italic, underline, foreColor — plus a
 * literal `insertText` for the Tab key are all expressible with Range and
 * Selection, which are specified and are not going anywhere.
 *
 * Review finding D2: the same editor re-synced its DOM only when the note INDEX
 * changed, so an undo that reverted the note's content left the contenteditable
 * showing the old text — and the next keystroke wrote that stale DOM straight
 * back over the restored model, silently undoing the undo. `resolveNotepadSync`
 * is the decision that fixes it, kept out here as a pure function because the
 * bug was in the CONDITION, not in the DOM work, and a condition can be tested.
 *
 * Everything takes its `document` and `selection` as arguments. That is not
 * ceremony: it is what lets the awkward cases — a caret restored into the wrong
 * text node, a toggle that fails to notice it is already bold — be tested
 * without a browser, which is the whole reason the old code was never tested.
 */

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

/**
 * The three toggles, as style declarations rather than commands.
 *
 * `active` lists the computed values that count as "already on" — font-weight
 * in particular arrives as a keyword from one path and a number from another,
 * and a toggle that only recognises `bold` turns 700 into bold instead of off.
 */
export const INLINE_STYLE_COMMANDS = {
  bold: { property: 'fontWeight', on: 'bold', off: 'normal', active: ['bold', 'bolder', '600', '700', '800', '900'] },
  italic: { property: 'fontStyle', on: 'italic', off: 'normal', active: ['italic', 'oblique'] },
  underline: { property: 'textDecoration', on: 'underline', off: 'none', active: ['underline'] },
};

function isTextNode(node) {
  return !!node && node.nodeType === TEXT_NODE;
}

function textLength(node) {
  return String(node?.nodeValue ?? '').length;
}

/** Text nodes under `root`, in document order. */
export function collectTextNodes(root, out = []) {
  if (!root) return out;
  if (isTextNode(root)) {
    out.push(root);
    return out;
  }
  const children = root.childNodes ?? [];
  for (let i = 0; i < children.length; i++) collectTextNodes(children[i], out);
  return out;
}

function isWithin(ancestor, node) {
  let current = node;
  while (current) {
    if (current === ancestor) return true;
    current = current.parentNode;
  }
  return false;
}

/**
 * Is `node` already inside something carrying this style?
 *
 * Walks the ancestor chain up to (and including) `root` and takes the first
 * explicit declaration it meets, because that is the one the browser paints.
 * A `font-weight: normal` span nested inside a bold one is not bold, and a
 * toggle that only asked "is there a bold ancestor anywhere?" would refuse to
 * turn it on.
 */
export function isInlineStyleActive(node, command, root = null) {
  const spec = typeof command === 'string' ? INLINE_STYLE_COMMANDS[command] : command;
  if (!spec) return false;
  let current = isTextNode(node) ? node.parentNode : node;
  while (current) {
    if (current.nodeType === ELEMENT_NODE) {
      const declared = String(current.style?.[spec.property] ?? '').trim().toLowerCase();
      if (declared) return spec.active.some((value) => declared.includes(value));
    }
    if (current === root) break;
    current = current.parentNode;
  }
  return false;
}

function currentRange(selection, root) {
  if (!selection || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!range) return null;
  if (root && !isWithin(root, range.commonAncestorContainer ?? range.startContainer)) return null;
  return range;
}

function selectNode(selection, document, node, { collapseInside = false } = {}) {
  const range = document.createRange();
  if (collapseInside) {
    range.setStart(node, 0);
    range.collapse(true);
  } else {
    range.selectNodeContents(node);
  }
  selection.removeAllRanges();
  selection.addRange(range);
  return range;
}

/**
 * Wrap the current selection in a `<span>` carrying `styles`.
 *
 * The collapsed-caret case inserts an EMPTY span and parks the caret inside it.
 * That looks like a no-op and is not: it is how you say "the next thing typed
 * is bold" without execCommand's invisible typing state. The span is empty, so
 * if the user types nothing it contributes nothing to the saved HTML.
 */
export function wrapSelection(root, selection, styles, document) {
  const range = currentRange(selection, root);
  if (!range) return null;

  const span = document.createElement('span');
  for (const [property, value] of Object.entries(styles)) span.style[property] = value;

  if (range.collapsed) {
    range.insertNode(span);
    selectNode(selection, document, span, { collapseInside: true });
    return span;
  }

  span.appendChild(range.extractContents());
  range.insertNode(span);
  selectNode(selection, document, span);
  return span;
}

/** Bold / italic / underline, toggling off when the selection already has it. */
export function applyInlineStyle(root, selection, commandName, document) {
  const spec = INLINE_STYLE_COMMANDS[commandName];
  if (!spec) return null;
  const range = currentRange(selection, root);
  if (!range) return null;
  const active = isInlineStyleActive(range.startContainer, spec, root);
  return wrapSelection(root, selection, { [spec.property]: active ? spec.off : spec.on }, document);
}

/** The old `foreColor`. Takes RRGGBB with or without the hash. */
export function applyTextColour(root, selection, hex, document) {
  const clean = String(hex ?? '').replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  return wrapSelection(root, selection, { color: `#${clean}` }, document);
}

/** The old `insertText`: replace the selection with literal characters. */
export function insertPlainText(root, selection, text, document) {
  const range = currentRange(selection, root);
  if (!range) return null;
  if (!range.collapsed) range.deleteContents();
  const node = document.createTextNode(String(text ?? ''));
  range.insertNode(node);

  const after = document.createRange();
  after.setStart(node, textLength(node));
  after.collapse(true);
  selection.removeAllRanges();
  selection.addRange(after);
  return node;
}

/**
 * Where the caret is, counted in characters from the start of `root`.
 *
 * A character offset rather than a (node, offset) pair on purpose: the whole
 * point is to survive `innerHTML` being replaced, after which every node the
 * old pair pointed at is gone.
 */
export function caretOffsetWithin(root, container, offset) {
  if (!root || !container) return null;
  const nodes = collectTextNodes(root);

  if (isTextNode(container)) {
    let total = 0;
    for (const node of nodes) {
      if (node === container) return total + Math.min(Number(offset) || 0, textLength(node));
      total += textLength(node);
    }
    return null;
  }

  // Element container: the boundary sits before its `offset`-th child.
  const children = container.childNodes ?? [];
  const preceding = [];
  for (let i = 0; i < Math.min(Number(offset) || 0, children.length); i++) {
    collectTextNodes(children[i], preceding);
  }
  const last = preceding[preceding.length - 1] ?? null;

  let total = 0;
  if (!last) {
    for (const node of nodes) {
      if (isWithin(container, node)) return total;
      total += textLength(node);
    }
    return total;
  }
  for (const node of nodes) {
    total += textLength(node);
    if (node === last) return total;
  }
  return total;
}

/** The caret's character offset, or null when the caret is not in `root`. */
export function readCaretOffset(root, selection) {
  const range = currentRange(selection, root);
  if (!range) return null;
  return caretOffsetWithin(root, range.endContainer, range.endOffset);
}

/**
 * Put the caret back `offset` characters into `root`, clamping to the end.
 *
 * Clamping matters: the content this caret is being restored into is usually
 * SHORTER than the content it was taken from (that is what an undo does), and
 * a range set past the end of a text node throws rather than saturating.
 */
export function restoreCaretOffset(root, offset, selection, document) {
  if (!root || offset == null || !selection) return false;
  const nodes = collectTextNodes(root);
  let remaining = Math.max(0, Number(offset) || 0);

  for (const node of nodes) {
    const length = textLength(node);
    if (remaining <= length) {
      const range = document.createRange();
      range.setStart(node, remaining);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      return true;
    }
    remaining -= length;
  }

  const last = nodes[nodes.length - 1];
  const range = document.createRange();
  if (last) range.setStart(last, textLength(last));
  else range.setStart(root, 0);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

/**
 * Should the contenteditable be re-loaded from the model, and may the caret be
 * kept while doing it?
 *
 * The old condition was `index !== lastSyncedIndex` and nothing else, which is
 * where D2 lived. Three guards earn their place here:
 *
 *  - `modelHtml === domHtml` — the DOM already agrees, which is the state after
 *    every single keystroke. Re-syncing here is what would clobber typing.
 *  - `modelHtml === lastSyncedHtml` — the model has not moved since we last
 *    pushed it into the DOM. Without this the browser's own `innerHTML`
 *    normalisation (it will happily give back markup that is not byte-identical
 *    to what you set) makes the first two conditions permanently true and the
 *    effect re-syncs forever, one pass per frame.
 *  - `composing` — during IME composition the DOM legitimately runs ahead of
 *    the model, and replacing innerHTML mid-composition drops the candidate.
 */
export function resolveNotepadSync({
  index = 0,
  lastIndex = -1,
  modelHtml = '',
  domHtml = '',
  lastSyncedHtml = null,
  composing = false,
} = {}) {
  if (index !== lastIndex) return { sync: true, reason: 'note-switch', preserveCaret: false };
  if (composing) return { sync: false, reason: 'composing', preserveCaret: false };
  if (modelHtml === domHtml) return { sync: false, reason: 'in-sync', preserveCaret: false };
  if (modelHtml === lastSyncedHtml) return { sync: false, reason: 'local-edit', preserveCaret: false };
  return { sync: true, reason: 'external-change', preserveCaret: true };
}
