// richTextEditing.test.js — the notepad off execCommand, and undo that stops corrupting.
//
// Review finding B10, last clause: the notepad's bold/italic/underline/foreColor and its Tab
// key all went through `document.execCommand`, which is deprecated, specified nowhere, and
// emits different markup per engine into HTML we persist inside the panel file.
//
// Review finding D2: the editor re-synced its contenteditable only when the note INDEX
// changed, so an undo reverted the model, left the DOM showing the old text, and the next
// keystroke saved that stale DOM back over the restored content — an undo that silently
// undid itself. The fix is a condition, and a condition can be tested; `resolveNotepadSync`
// exists as a separate function for exactly that reason.
//
// There is no jsdom in this suite (and no browser), so the DOM operations are exercised
// against the small fake below. That is not a weaker test than a real DOM for what is being
// checked here: every one of these functions is a sequence of Range and Selection calls, and
// what went wrong historically was the SEQUENCE — a caret restored into a node that no longer
// exists, a toggle that could not see it was already bold, a programmatic edit that never got
// saved. The fake models node identity, text splitting and offsets, which is what those bugs
// were made of.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyInlineStyle,
  applyTextColour,
  caretOffsetWithin,
  collectTextNodes,
  insertPlainText,
  isInlineStyleActive,
  readCaretOffset,
  resolveNotepadSync,
  restoreCaretOffset,
} from '../src/CE_Application/utils/richTextEditing.js';

// --- A DOM small enough to read, real enough to catch offset bugs -------------

class FakeNode {
  constructor(nodeType) {
    this.nodeType = nodeType;
    this.childNodes = [];
    this.parentNode = null;
  }

  appendChild(node) {
    if (node.nodeType === 11) {
      for (const child of [...node.childNodes]) this.appendChild(child);
      return node;
    }
    if (node.parentNode) node.parentNode.removeChild(node);
    node.parentNode = this;
    this.childNodes.push(node);
    return node;
  }

  insertAt(index, node) {
    if (node.parentNode) node.parentNode.removeChild(node);
    node.parentNode = this;
    this.childNodes.splice(index, 0, node);
    return node;
  }

  removeChild(node) {
    const index = this.childNodes.indexOf(node);
    if (index >= 0) this.childNodes.splice(index, 1);
    node.parentNode = null;
    return node;
  }

  get textContent() {
    if (this.nodeType === 3) return this.nodeValue;
    return this.childNodes.map((child) => child.textContent).join('');
  }
}

class FakeText extends FakeNode {
  constructor(value) { super(3); this.nodeValue = String(value); }
}

class FakeElement extends FakeNode {
  constructor(tagName) { super(1); this.tagName = tagName; this.style = {}; }
}

class FakeFragment extends FakeNode {
  constructor() { super(11); }
}

class FakeRange {
  constructor(doc) {
    this.doc = doc;
    this.startContainer = null;
    this.startOffset = 0;
    this.endContainer = null;
    this.endOffset = 0;
  }

  get collapsed() {
    return this.startContainer === this.endContainer && this.startOffset === this.endOffset;
  }

  // Enough for the module's only use of it — an "is this range inside the editor" check.
  get commonAncestorContainer() { return this.startContainer; }

  setStart(node, offset) {
    this.startContainer = node;
    this.startOffset = offset;
    if (!this.endContainer) { this.endContainer = node; this.endOffset = offset; }
  }

  setEnd(node, offset) { this.endContainer = node; this.endOffset = offset; }

  collapse(toStart) {
    if (toStart) { this.endContainer = this.startContainer; this.endOffset = this.startOffset; }
    else { this.startContainer = this.endContainer; this.startOffset = this.endOffset; }
  }

  selectNodeContents(node) {
    this.startContainer = node;
    this.startOffset = 0;
    this.endContainer = node;
    this.endOffset = node.nodeType === 3 ? node.nodeValue.length : node.childNodes.length;
  }

  /** Splits `text` at `offset`, returning the index the tail sits at in its parent. */
  #splitText(text, offset) {
    const parent = text.parentNode;
    const index = parent.childNodes.indexOf(text);
    const tail = text.nodeValue.slice(offset);
    text.nodeValue = text.nodeValue.slice(0, offset);
    if (tail) parent.insertAt(index + 1, new FakeText(tail));
    return index + 1;
  }

  extractContents() {
    const fragment = new FakeFragment();
    if (this.startContainer === this.endContainer && this.startContainer.nodeType === 3) {
      const text = this.startContainer;
      const parent = text.parentNode;
      const selected = text.nodeValue.slice(this.startOffset, this.endOffset);
      const tail = text.nodeValue.slice(this.endOffset);
      text.nodeValue = text.nodeValue.slice(0, this.startOffset);
      const index = parent.childNodes.indexOf(text);
      if (tail) parent.insertAt(index + 1, new FakeText(tail));
      fragment.appendChild(new FakeText(selected));
      this.startContainer = parent; this.startOffset = index + 1;
      this.endContainer = parent; this.endOffset = index + 1;
      return fragment;
    }
    // Element container: move the children in [startOffset, endOffset).
    const parent = this.startContainer;
    const moving = parent.childNodes.slice(this.startOffset, this.endOffset);
    for (const child of moving) fragment.appendChild(child);
    this.endContainer = parent; this.endOffset = this.startOffset;
    return fragment;
  }

  deleteContents() { this.extractContents(); }

  insertNode(node) {
    if (this.startContainer.nodeType === 3) {
      const index = this.#splitText(this.startContainer, this.startOffset);
      this.startContainer.parentNode.insertAt(index, node);
    } else {
      this.startContainer.insertAt(this.startOffset, node);
    }
  }
}

class FakeSelection {
  constructor() { this.ranges = []; }
  get rangeCount() { return this.ranges.length; }
  getRangeAt(i) { return this.ranges[i]; }
  removeAllRanges() { this.ranges = []; }
  addRange(range) { this.ranges.push(range); }
}

const fakeDocument = {
  createElement: (tag) => new FakeElement(tag),
  createTextNode: (value) => new FakeText(value),
  createDocumentFragment: () => new FakeFragment(),
  createRange() { return new FakeRange(this); },
};

/** An editor holding one text node, with `text` selected from `from` to `to`. */
function editorWith(text, from = 0, to = 0) {
  const root = new FakeElement('div');
  const node = new FakeText(text);
  root.appendChild(node);
  const selection = new FakeSelection();
  const range = fakeDocument.createRange();
  range.setStart(node, from);
  range.setEnd(node, to);
  selection.addRange(range);
  return { root, node, selection };
}

/** Rough innerHTML, enough to see what markup was emitted. */
function html(node) {
  if (node.nodeType === 3) return node.nodeValue;
  const inner = node.childNodes.map(html).join('');
  if (node === node.ownerRoot) return inner;
  const style = Object.entries(node.style ?? {})
    .map(([key, value]) => `${key}:${value}`)
    .join(';');
  return `<${node.tagName}${style ? ` style="${style}"` : ''}>${inner}</${node.tagName}>`;
}

function innerHtml(root) {
  return root.childNodes.map(html).join('');
}

// --- Formatting ---------------------------------------------------------------

test('bold wraps the selection in a styled span instead of whatever execCommand felt like', () => {
  const { root, selection } = editorWith('hello world', 6, 11);
  const span = applyInlineStyle(root, selection, 'bold', fakeDocument);

  assert.ok(span, 'a span was produced');
  assert.equal(span.style.fontWeight, 'bold');
  assert.equal(span.textContent, 'world');
  assert.equal(innerHtml(root), 'hello <span style="fontWeight:bold">world</span>');
  assert.equal(root.textContent, 'hello world', 'no text was lost or duplicated');
});

test('italic and underline take the same path with their own declarations', () => {
  for (const [command, property, value] of [['italic', 'fontStyle', 'italic'], ['underline', 'textDecoration', 'underline']]) {
    const { root, selection } = editorWith('abcdef', 1, 4);
    const span = applyInlineStyle(root, selection, command, fakeDocument);
    assert.equal(span.style[property], value);
    assert.equal(span.textContent, 'bcd');
    assert.equal(root.textContent, 'abcdef');
  }
});

test('bold on already-bold text turns it off rather than bolding it twice', () => {
  // The toggle has to READ the tree, which is the part execCommand did for free and the
  // part a naive replacement forgets.
  const root = new FakeElement('div');
  const strong = new FakeElement('span');
  strong.style.fontWeight = 'bold';
  const text = new FakeText('already bold');
  strong.appendChild(text);
  root.appendChild(strong);

  const selection = new FakeSelection();
  const range = fakeDocument.createRange();
  range.setStart(text, 0);
  range.setEnd(text, 7);
  selection.addRange(range);

  const span = applyInlineStyle(root, selection, 'bold', fakeDocument);
  assert.equal(span.style.fontWeight, 'normal', 'toggled off');
});

test('a numeric font-weight counts as bold, because half the app writes 700', () => {
  const wrapper = new FakeElement('span');
  wrapper.style.fontWeight = '700';
  const text = new FakeText('x');
  wrapper.appendChild(text);
  assert.equal(isInlineStyleActive(text, 'bold'), true);
});

test('the nearest declaration wins, so normal inside bold is not bold', () => {
  const outer = new FakeElement('span');
  outer.style.fontWeight = 'bold';
  const inner = new FakeElement('span');
  inner.style.fontWeight = 'normal';
  const text = new FakeText('x');
  inner.appendChild(text);
  outer.appendChild(inner);
  assert.equal(isInlineStyleActive(text, 'bold'), false);
});

test('a collapsed caret gets an empty span it can type into', () => {
  // execCommand kept an invisible "typing state" for this. Without a replacement, pressing
  // Ctrl+B before typing did nothing at all.
  const { root, selection } = editorWith('ab', 1, 1);
  const span = applyInlineStyle(root, selection, 'bold', fakeDocument);
  assert.ok(span);
  assert.equal(span.textContent, '', 'contributes nothing if the user types nothing');
  assert.equal(root.textContent, 'ab');
  assert.equal(selection.getRangeAt(0).startContainer, span, 'the caret is inside it');
});

test('foreColor becomes a colour span, and rejects anything that is not a 6-digit hex', () => {
  const { root, selection } = editorWith('red text', 0, 3);
  const span = applyTextColour(root, selection, '#FF3355', fakeDocument);
  assert.equal(span.style.color, '#FF3355');
  assert.equal(span.textContent, 'red');

  const other = editorWith('x', 0, 1);
  assert.equal(applyTextColour(other.root, other.selection, 'nope', fakeDocument), null);
  assert.equal(applyTextColour(other.root, other.selection, 'FF33', fakeDocument), null);
});

test('Tab inserts literal spaces and leaves the caret after them', () => {
  const { root, selection } = editorWith('ab', 1, 1);
  insertPlainText(root, selection, '    ', fakeDocument);
  assert.equal(root.textContent, 'a    b');
  const caret = selection.getRangeAt(0);
  assert.equal(caret.startContainer.nodeValue, '    ');
  assert.equal(caret.startOffset, 4);
});

test('Tab over a selection replaces it', () => {
  const { root, selection } = editorWith('abcdef', 1, 4);
  insertPlainText(root, selection, '-', fakeDocument);
  assert.equal(root.textContent, 'a-ef');
});

test('nothing happens when the selection is outside the editor', () => {
  const root = new FakeElement('div');
  root.appendChild(new FakeText('inside'));
  const elsewhere = new FakeElement('div');
  const stray = new FakeText('outside');
  elsewhere.appendChild(stray);

  const selection = new FakeSelection();
  const range = fakeDocument.createRange();
  range.setStart(stray, 0);
  range.setEnd(stray, 3);
  selection.addRange(range);

  assert.equal(applyInlineStyle(root, selection, 'bold', fakeDocument), null);
  assert.equal(insertPlainText(root, selection, 'x', fakeDocument), null);
  assert.equal(root.textContent, 'inside');
});

// --- Caret across a reload -----------------------------------------------------

test('the caret is measured in characters, counting across element boundaries', () => {
  const root = new FakeElement('div');
  const a = new FakeText('one ');
  const span = new FakeElement('span');
  const b = new FakeText('two');
  span.appendChild(b);
  const c = new FakeText(' three');
  root.appendChild(a);
  root.appendChild(span);
  root.appendChild(c);

  assert.equal(collectTextNodes(root).length, 3);
  assert.equal(caretOffsetWithin(root, a, 2), 2);
  assert.equal(caretOffsetWithin(root, b, 1), 5);
  assert.equal(caretOffsetWithin(root, c, 6), 13);
  assert.equal(caretOffsetWithin(root, root, 0), 0, 'element boundary before everything');
  assert.equal(caretOffsetWithin(root, root, 2), 7, 'element boundary after the span');
});

test('a caret restored after a reload lands on the same character', () => {
  const before = new FakeElement('div');
  before.appendChild(new FakeText('hello world'));
  const selection = new FakeSelection();
  const range = fakeDocument.createRange();
  range.setStart(before.childNodes[0], 8);
  range.collapse(true);
  selection.addRange(range);

  const offset = readCaretOffset(before, selection);
  assert.equal(offset, 8);

  // The undo has landed: same editor element, entirely new nodes.
  const after = new FakeElement('div');
  const first = new FakeText('hello ');
  const rest = new FakeText('world again');
  after.appendChild(first);
  after.appendChild(rest);

  assert.equal(restoreCaretOffset(after, offset, selection, fakeDocument), true);
  const restored = selection.getRangeAt(0);
  assert.equal(restored.startContainer, rest);
  assert.equal(restored.startOffset, 2, 'character 8 overall is character 2 of the second node');
});

test('restoring past the end clamps instead of throwing, which is the usual case for undo', () => {
  const after = new FakeElement('div');
  const text = new FakeText('short');
  after.appendChild(text);
  const selection = new FakeSelection();

  assert.equal(restoreCaretOffset(after, 500, selection, fakeDocument), true);
  const range = selection.getRangeAt(0);
  assert.equal(range.startContainer, text);
  assert.equal(range.startOffset, 5);
});

test('restoring into an emptied editor puts the caret at the root', () => {
  const after = new FakeElement('div');
  const selection = new FakeSelection();
  assert.equal(restoreCaretOffset(after, 12, selection, fakeDocument), true);
  assert.equal(selection.getRangeAt(0).startContainer, after);
});

// --- The D2 condition ----------------------------------------------------------

test('switching notes always reloads, and does not try to keep the caret', () => {
  const decision = resolveNotepadSync({ index: 2, lastIndex: 1, modelHtml: 'b', domHtml: 'a' });
  assert.deepEqual(decision, { sync: true, reason: 'note-switch', preserveCaret: false });
});

test('an external change reloads the DOM and keeps the caret — the undo bug', () => {
  // The model has been reverted by undo. The DOM still shows what the user typed, and
  // lastSyncedHtml is what we last pushed. Before this, sync was false and the next
  // keystroke wrote `<p>typed</p>` back over the restored content.
  const decision = resolveNotepadSync({
    index: 0,
    lastIndex: 0,
    modelHtml: '<p>restored</p>',
    domHtml: '<p>typed</p>',
    lastSyncedHtml: '<p>typed</p>',
  });
  assert.deepEqual(decision, { sync: true, reason: 'external-change', preserveCaret: true });
});

test('typing never reloads the DOM out from under the user', () => {
  // After every keystroke the model is set FROM the DOM, so the two agree.
  const decision = resolveNotepadSync({
    index: 0,
    lastIndex: 0,
    modelHtml: '<p>typing</p>',
    domHtml: '<p>typing</p>',
    lastSyncedHtml: '<p>typin</p>',
  });
  assert.equal(decision.sync, false);
  assert.equal(decision.reason, 'in-sync');
});

test('the browser renormalising innerHTML does not start an infinite re-sync', () => {
  // Set innerHTML to X and the browser can hand back X' that is not byte-identical. Without
  // the lastSyncedHtml guard, "model !== dom" stays true forever and the effect re-syncs
  // once per frame, wiping the selection each time.
  const decision = resolveNotepadSync({
    index: 0,
    lastIndex: 0,
    modelHtml: '<b>x</b>',
    domHtml: '<b>x</b> ',
    lastSyncedHtml: '<b>x</b>',
  });
  assert.equal(decision.sync, false);
  assert.equal(decision.reason, 'local-edit');
});

test('an IME composition is left alone until it finishes', () => {
  const decision = resolveNotepadSync({
    index: 0,
    lastIndex: 0,
    modelHtml: 'old',
    domHtml: 'new candidate',
    lastSyncedHtml: 'old',
    composing: true,
  });
  assert.equal(decision.sync, false);
  assert.equal(decision.reason, 'composing');
});

test('a note switch still wins over a composition, because the old note is gone', () => {
  const decision = resolveNotepadSync({ index: 1, lastIndex: 0, composing: true });
  assert.equal(decision.sync, true);
  assert.equal(decision.reason, 'note-switch');
});
