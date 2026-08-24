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
  underline: { property: 'textDecoration', on: 'underline', off: 'none', active: ['underline'], line: 'underline' },
  strikethrough: { property: 'textDecoration', on: 'line-through', off: 'none', active: ['line-through'], line: 'line-through' },
};

/**
 * Underline and strikethrough are not independent toggles, however much they look like two
 * buttons: they are two VALUES of one CSS property. Writing `textDecoration: 'underline'` over a
 * struck-through span silently drops the strike, and toggling either one off with `'none'` drops
 * both — which is exactly what a naive on/off pair does, and why they are handled here instead of
 * going through the plain single-property path.
 *
 * The set is read by walking up to `root`, because the two lines are usually applied by different
 * spans at different depths.
 */
const DECORATION_LINES = ['underline', 'line-through'];

export function activeDecorationLines(node, root = null) {
  const found = new Set();
  let current = isTextNode(node) ? node.parentNode : node;
  while (current) {
    const declared = String(current.style?.textDecoration ?? '');
    if (declared) {
      // 'none' at any level does not clear what an ancestor set — CSS text-decoration does not
      // inherit that way — but it does mean this element contributes nothing.
      for (const line of DECORATION_LINES) if (declared.includes(line)) found.add(line);
    }
    if (current === root) break;
    current = current.parentNode;
  }
  return found;
}

/** The `text-decoration` value for a set of lines — '' collapses to 'none'. */
export function decorationValue(lines) {
  const ordered = DECORATION_LINES.filter((line) => lines.has(line));
  return ordered.length ? ordered.join(' ') : 'none';
}

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

/** Bold / italic / underline / strikethrough, toggling off when the selection already has it. */
export function applyInlineStyle(root, selection, commandName, document) {
  const spec = INLINE_STYLE_COMMANDS[commandName];
  if (!spec) return null;
  const range = currentRange(selection, root);
  if (!range) return null;

  // The two decoration lines compose; everything else is a straight toggle.
  if (spec.line) {
    const lines = activeDecorationLines(range.startContainer, root);
    if (lines.has(spec.line)) lines.delete(spec.line); else lines.add(spec.line);
    return wrapSelection(root, selection, { textDecoration: decorationValue(lines) }, document);
  }

  const active = isInlineStyleActive(range.startContainer, spec, root);
  return wrapSelection(root, selection, { [spec.property]: active ? spec.off : spec.on }, document);
}

/** The old `fontName`. Not a toggle — a value, applied to the selection. */
export function applyFontFamily(root, selection, family, document) {
  const name = String(family ?? '').trim();
  if (!name) return null;
  return wrapSelection(root, selection, { fontFamily: name }, document);
}

/**
 * The old `fontSize`, in real pixels.
 *
 * execCommand's version took the legacy 1-7 HTML scale and emitted `<font size="4">`, so the
 * sidebar mapped px onto that scale, applied it, then hunted down the `<font>` elements it had
 * just caused and rewrote them to the px it actually wanted. Two of those steps existed only to
 * undo the first. A span with a font-size is the whole operation.
 */
export function applyFontSize(root, selection, px, document) {
  const size = Number(px);
  if (!Number.isFinite(size) || size <= 0) return null;
  return wrapSelection(root, selection, { fontSize: `${Math.round(size)}px` }, document);
}

/**
 * The old `removeFormat`: keep the words, drop everything wrapping them.
 *
 * Implemented as extract-and-reinsert-as-text rather than by walking the tree unwrapping spans,
 * because the selection can start and end in different parents at different depths and a partial
 * unwrap of that is where this kind of code goes wrong. Text is the one thing every branch of it
 * agrees on.
 */
export function clearFormatting(root, selection, document) {
  const range = currentRange(selection, root);
  if (!range || range.collapsed) return null;
  const text = String(range.toString ? range.toString() : range.extractContents().textContent ?? '');
  if (range.toString) range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  selectNode(selection, document, node);
  return node;
}

/** The old `foreColor`. Takes RRGGBB with or without the hash. */
export function applyTextColour(root, selection, hex, document) {
  const clean = String(hex ?? '').replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  return wrapSelection(root, selection, { color: `#${clean}` }, document);
}

/**
 * Block-level operations — alignment and lists.
 *
 * A contenteditable has no paragraphs unless someone made some, so "the block" here means the
 * TOP-LEVEL child of the editor that contains the caret. That is the unit a person means by "this
 * line", and it is the unit execCommand's justify* and insertList operated on. A caret sitting
 * directly in the root (an editor whose content is bare text nodes) has no block to align, so one
 * is made — otherwise the first alignment click on a fresh note would silently do nothing.
 */
/** The top-level child of `root` that contains `node` (or null when node is not inside root). */
export function topLevelBlock(node, root) {
  let current = node;
  while (current && current.parentNode && current.parentNode !== root) current = current.parentNode;
  return current && current.parentNode === root ? current : null;
}

/** Every top-level block the range touches, in document order. */
export function blocksInRange(root, range) {
  if (!root || !range) return [];
  const start = topLevelBlock(range.startContainer, root);
  const end = topLevelBlock(range.endContainer, root);
  const children = root.childNodes ?? [];
  const from = start ? Array.prototype.indexOf.call(children, start) : -1;
  const to = end ? Array.prototype.indexOf.call(children, end) : -1;
  if (from < 0 || to < 0) return [];
  const [lo, hi] = from <= to ? [from, to] : [to, from];
  const out = [];
  for (let i = lo; i <= hi; i += 1) {
    const child = children[i];
    if (child && child.nodeType === ELEMENT_NODE) out.push(child);
  }
  return out;
}

/**
 * Promote the loose text around the caret into a real block, so there is something to align or
 * list. Returns the block, or null when the root has no content at all.
 */
function ensureBlock(root, range, document) {
  const existing = topLevelBlock(range.startContainer, root);
  if (existing && existing.nodeType === ELEMENT_NODE) return existing;

  const div = document.createElement('div');
  const loose = [...(root.childNodes ?? [])];
  if (!loose.length) return null;
  for (const child of loose) div.appendChild(child);
  root.appendChild(div);
  return div;
}

/** The old `justifyLeft` / `justifyCenter` / `justifyRight`. */
export function applyBlockAlignment(root, selection, align, document) {
  const value = String(align ?? '').toLowerCase();
  if (!['left', 'center', 'right', 'justify'].includes(value)) return null;
  const range = currentRange(selection, root);
  if (!range) return null;

  let blocks = blocksInRange(root, range);
  if (!blocks.length) {
    const made = ensureBlock(root, range, document);
    blocks = made ? [made] : [];
  }
  for (const block of blocks) block.style.textAlign = value;
  return blocks.length ? blocks : null;
}

/**
 * The old `insertUnorderedList` / `insertOrderedList`.
 *
 * Toggling: if every block the range touches is already an `li` of the requested kind, the list
 * is unwrapped back to plain blocks. Anything else wraps. Half-in-a-list selections wrap, which
 * is the behaviour that surprises people least — the alternative is deciding which half wins.
 */
export function applyList(root, selection, ordered, document) {
  const range = currentRange(selection, root);
  if (!range) return null;
  const tag = ordered ? 'OL' : 'UL';

  let blocks = blocksInRange(root, range);
  if (!blocks.length) {
    const made = ensureBlock(root, range, document);
    blocks = made ? [made] : [];
  }
  if (!blocks.length) return null;

  const allAlready = blocks.every((b) => String(b.tagName ?? '').toUpperCase() === tag);
  if (allAlready) {
    // Unwrap: every li becomes its own div, in place.
    const replaced = [];
    for (const list of blocks) {
      const index = Array.prototype.indexOf.call(root.childNodes, list);
      const items = [...(list.childNodes ?? [])];
      root.removeChild(list);
      let at = index;
      for (const item of items) {
        const div = document.createElement('div');
        for (const child of [...(item.childNodes ?? [])]) div.appendChild(child);
        root.insertBefore ? root.insertBefore(div, root.childNodes[at] ?? null) : root.appendChild(div);
        replaced.push(div);
        at += 1;
      }
    }
    return replaced;
  }

  const list = document.createElement(tag.toLowerCase());
  const first = blocks[0];
  const index = Array.prototype.indexOf.call(root.childNodes, first);
  for (const block of blocks) {
    const item = document.createElement('li');
    for (const child of [...(block.childNodes ?? [])]) item.appendChild(child);
    list.appendChild(item);
    root.removeChild(block);
  }
  if (root.insertBefore) root.insertBefore(list, root.childNodes[index] ?? null);
  else root.appendChild(list);
  return list;
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
