<script>
  // CodeEditor — a dependency-free code editor for the BehaviorDesigner script area.
  // A transparent <textarea> drives all editing/caret/clipboard behaviour; a synced
  // highlight <pre> sits behind it and a line-number gutter to its left. On top of the
  // plain textarea it adds: line numbers, JS/Lua syntax highlighting, current-line
  // highlight, smart Tab/auto-indent, bracket & quote auto-closing, comment toggle,
  // find & replace, and font zoom. Native textarea undo/redo and copy/paste are kept
  // intact by routing every programmatic edit through document.execCommand('insertText').
  //
  // A long JSON text (the panel file view's "every field" reference: up to 11,000 lines for one of
  // GAIA's controls) is drawn only where it is on screen. The textarea still holds all of it, so
  // selecting, copying, the caret and find are the browser's own over the whole text; the highlight
  // layer and the gutter draw the visible lines and a margin, and move with the scroll. JSON can be
  // drawn a window at a time because each of its tokens ends on the line it began on; a script's
  // block comment or template string does not, so scripts are drawn whole, as before. Positions are
  // found through an index of where each line starts (utils/lineIndex.js), not by counting newlines.
  //
  // MARKS: the Values sidebar's highlights (`marks`, editor/codeMarks.js) are boxes placed by line and
  // column behind the textarea, as the occurrence marks are, so no character moves: a faint band over
  // the statement it lists, a light box around the value under the pointer in it, and an outlined box
  // around the value an edit is open on. replaceRange() is how the sidebar writes a value back: one
  // replacement through applyEdit, so it is one native undo step and reaches the parent as typing does.
  //
  // VALUE COMPLETION: with the caret inside a string that is a value the editor knows the choices for
  // (a curve, a division, an event, a control's name…), completion lists those choices instead of
  // words, and the one accepted replaces the whole value between the quotes, as one edit. What the
  // choices are comes from the Values core, which is a chunk of its own and is handed in, once it has
  // loaded, as `valueCompletions` (scripting/valueCompletions.js); until then, and outside such a
  // value, completion is word completion as it always was.
  import { onDestroy, tick } from 'svelte';
  import { highlight, lineCommentToken, matchingBracket, identifierOccurrences, languageKey } from './codeHighlight.js';
  import { analyze, getCompletions, getHover, getDefinition, getSignatureHelp, getFoldRegions, wordAt } from '../scripting/languageService.js';
  import { projectFolds, pruneFolds } from './foldModel.js';
  import { columnInsert, columnDelete, offsetOf } from './columnEdit.js';
  import { floating } from '../utils/floatingUi.js';
  import { carryPopupTheme } from './popupTheme.js';
  import { placeSignatureHint } from './signatureHint.js';
  import { visualColumn, indexAtColumn } from './textColumns.js';
  import { paramColours } from '../scripting/paramColours.js';
  import { lineAt, lineStartsOf } from '../utils/lineIndex.js';
  import { markBoxes } from './codeMarks.js';

  let {
    value = '',
    language = 'lua',
    oninput = null,
    onrun = null,
    oncaret = null,
    ondiagnostics = null,
    breakpoints = [],
    onbreakpoints = null,
    placeholder = '',
    minHeight = 240,
    // The component type this script is attached to, if it is attached to one. Completion uses it
    // to leave out the verbs the control has no section for.
    controlType = '',
    // Shown to read, not to edit: the panel file view's "every field" reference.
    readOnly = false,
    // The Values sidebar's highlights: [{ start, end, kind: 'statement' | 'hover' | 'edit' }], offsets
    // into `value`. None are drawn while the view is folded.
    marks = [],
    // Told whether the view is folded, each time that changes: folding ends an open value edit.
    onfold = null,
    // (source, language, caret, { force }) → { from, to, current, options, selected } | null: the
    // choices for the value the caret is in (scripting/valueCompletions.js), or null to complete words.
    valueCompletions = null,
  } = $props();

  let bpSet = $derived(new Set(breakpoints)); // 1-based line numbers
  function toggleBreakpoint(line) {
    const next = new Set(bpSet);
    next.has(line) ? next.delete(line) : next.add(line);
    onbreakpoints?.([...next].sort((a, b) => a - b));
  }

  let taEl = $state(null);       // the editable textarea (the source of truth for editing)
  let rootEl = null;             // the editor's own box, whose colours the portaled popups take
  let measureEl = $state(null);  // hidden element for measuring monospace character width
  let scrollTop = $state(0);
  let scrollLeft = $state(0);
  let caretLine = $state(0);
  let caretCol = $state(0);
  let caretPos = $state(0);
  let fontSize = $state(13);
  let charWidth = $state(7.8);
  // Editor colour theme — persisted locally, independent of the app chrome.
  let theme = $state(readTheme());
  function readTheme() {
    try { return localStorage.getItem('ce-theme') === 'light' ? 'light' : 'dark'; } catch { return 'dark'; }
  }
  function toggleTheme() {
    theme = theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('ce-theme', theme); } catch { /* ignore */ }
  }

  // ----- minimap -----
  let showMinimap = $state(readMinimap());
  let minimapCanvas = $state(null);
  let minimapWrap = $state(null);
  let taClientH = $state(0);
  function readMinimap() {
    try { return localStorage.getItem('ce-minimap') === '1'; } catch { return false; }
  }
  function toggleMinimap() {
    showMinimap = !showMinimap;
    try { localStorage.setItem('ce-minimap', showMinimap ? '1' : '0'); } catch { /* ignore */ }
  }

  // Parser-backed analysis (acorn / luaparse). The AST parse is the heaviest per-keystroke
  // cost, so for large scripts we debounce it (highlighting stays live — it's cheap regex).
  let analyzedSource = $state('');
  let analyzeTimer = null;
  $effect(() => {
    const v = value;
    clearTimeout(analyzeTimer);
    analyzeTimer = null;
    if (v.length < 4000) { analyzedSource = v; return; } // small: parse immediately
    const timer = setTimeout(() => {
      if (analyzeTimer === timer) analyzeTimer = null;
      analyzedSource = v;
    }, 250);
    analyzeTimer = timer;
    return () => {
      clearTimeout(timer);
      if (analyzeTimer === timer) analyzeTimer = null;
    };
  });
  let analysis = $derived(analyze(analyzedSource, language));
  let diagnostics = $derived(analysis.diagnostics);
  let errorLines = $derived(new Set(diagnostics.map((d) => d.line)));

  // ----- code folding -----
  // The full `value` is always the truth (emitted/saved). Folding only changes the
  // DISPLAYED text; while folds are active the textarea is read-only and a click unfolds.
  let folded = $state(new Set());                 // full-source start-lines that are folded
  let foldRegions = $derived(getFoldRegions(analyzedSource, language));
  let foldStarts = $derived(new Set(foldRegions.map((r) => r.startLine)));
  $effect(() => { // drop folds whose region disappeared after an edit
    const pruned = pruneFolds(folded, foldRegions);
    if (pruned.size !== folded.size) folded = pruned;
  });
  let isFolded = $derived(folded.size > 0);
  $effect(() => { onfold?.(isFolded); });
  let projection = $derived(isFolded ? projectFolds(value, folded, foldRegions) : null);
  let displayText = $derived(projection ? projection.text : value);
  function fullLineOf(displayIdx) { return projection ? (projection.displayToFull[displayIdx] ?? displayIdx + 1) : displayIdx + 1; }
  function toggleFold(fullLine) {
    if (!foldStarts.has(fullLine)) return;
    const next = new Set(folded);
    next.has(fullLine) ? next.delete(fullLine) : next.add(fullLine);
    folded = next;
  }
  function unfoldAll() { if (isFolded) folded = new Set(); }
  function toggleFoldAll() { folded = isFolded ? new Set() : new Set(foldStarts); }
  // Each diagnostic, resolved to the on-screen token it underlines.
  // Squiggle overlay positions are in full-source space; suppress while folded
  // (the gutter error tint still shows via errorLines, keyed by full line number).
  // Columns as drawn (textColumns.js): the diagnostic's own column and its word's length count
  // characters, and a tab before it put the underline under the wrong text.
  let diagSpans = $derived(isFolded ? [] : diagnostics.map((d) => {
    const w = wordAt(analyzedSource, d.index) || wordAt(analyzedSource, d.index - 1);
    const len = w ? w.word.length : 1;
    const text = analyzedSource.split('\n')[d.line - 1] ?? '';
    const col = visualColumn(text, d.col);
    return { line: d.line, col, len: visualColumn(text, d.col + len) - col, message: d.message };
  }));
  $effect(() => { ondiagnostics?.(diagnostics); });

  const PAD_TOP = 10;
  let lineHeight = $derived(Math.round(fontSize * 1.6));
  let lines = $derived(displayText.split('\n'));
  let lineCount = $derived(lines.length);
  // Where each line starts, as character offsets: of the full source, and of what is displayed.
  let valueStarts = $derived(lineStartsOf(value));
  let displayStarts = $derived(projection ? lineStartsOf(displayText) : valueStarts);
  // Gutter shows full-source line numbers, so size it to the full line count (not the
  // possibly-fewer displayed rows when folded).
  let gutterDigits = $derived(String(valueStarts.length).length);

  // ----- drawing only what is on screen (long JSON) -----
  const VIRTUAL_MIN_LINES = 1000;
  const WINDOW_STEP = 40;    // the drawn window moves in steps of this many lines…
  const WINDOW_MARGIN = 60;  // …and reaches this far past the screen on each side
  let virtual = $derived(languageKey(language) === 'json' && lineCount > VIRTUAL_MIN_LINES);
  let firstRow = $derived.by(() => {
    if (!virtual) return 0;
    const top = Math.max(0, Math.floor((scrollTop - PAD_TOP) / lineHeight));
    return Math.max(0, Math.floor(top / WINDOW_STEP) * WINDOW_STEP - WINDOW_MARGIN);
  });
  let lastRow = $derived(virtual
    ? Math.min(lineCount, firstRow + Math.ceil((taClientH || 800) / lineHeight) + WINDOW_STEP + 2 * WINDOW_MARGIN)
    : lineCount);
  let windowStart = $derived(virtual ? displayStarts[firstRow] : 0);
  let windowText = $derived(virtual
    ? displayText.slice(windowStart, lastRow < lineCount ? displayStarts[lastRow] - 1 : displayText.length)
    : displayText);
  let gutterRows = $derived(Array.from({ length: lastRow - firstRow }, (_, i) => firstRow + i));

  // Highlight a matched bracket pair only when there's no active text selection (and not folded).
  // Offsets are into the drawn text, which a long text starts at windowStart.
  let matchMarks = $derived.by(() => {
    if (isFolded || !taEl || taEl.selectionStart !== taEl.selectionEnd) return undefined;
    const pair = matchingBracket(displayText, caretPos);
    return pair ? new Set(pair.map((at) => at - windowStart)) : undefined;
  });
  let highlighted = $derived(highlight(windowText, language, matchMarks));

  // Highlight every occurrence of the identifier under the caret (or the selected word).
  const IDENT_RE = /^[A-Za-z_$][\w$]*$/;
  let targetWord = $derived.by(() => {
    if (!taEl) return null;
    void caretPos; // re-run when the caret/selection moves
    const s = taEl.selectionStart, e = taEl.selectionEnd;
    if (s !== e) { const sel = value.slice(s, e); return IDENT_RE.test(sel) ? sel : null; }
    const w = wordAt(value, s);
    return w && w.word.length >= 2 ? w.word : null;
  });
  let occurrences = $derived.by(() => {
    if (isFolded || !targetWord) return [];
    // A long text marks the occurrences in what is drawn, which is all that would show.
    const occ = identifierOccurrences(windowText, language, targetWord);
    const found = occ.length >= 2 ? occ.slice(0, 200) : [];
    return windowStart ? found.map((o) => ({ start: o.start + windowStart, end: o.end + windowStart })) : found;
  });
  // The Values sidebar's highlights, placed in the lines drawn (a long text draws a window of them).
  let markList = $derived(markBoxes(marks, value, valueStarts, { first: firstRow, last: lastRow, folded: isFolded }));
  // A trailing newline collapses in <pre>; pad so the highlight layer matches the textarea height.
  let highlightedSafe = $derived(highlighted + (windowText.endsWith('\n') ? '\n' : ''));

  const CLOSERS = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`' };
  const OPENERS = new Set(Object.keys(CLOSERS));

  function emit() { oninput?.(taEl.value); }

  function onScroll() {
    scrollTop = taEl.scrollTop;
    scrollLeft = taEl.scrollLeft;
    taClientH = taEl.clientHeight;
    acOpen = false;   // popups are positioned for the pre-scroll caret; close on scroll
    clearHover();
  }

  // Minimap: a scaled "shape of code" + a draggable viewport box.
  let mmViewport = $derived.by(() => {
    void scrollTop; void taClientH;
    const total = lineCount * lineHeight;
    if (total <= 0) return { top: 0, height: 100 };
    const vh = (taClientH || (taEl?.clientHeight ?? 0));
    return { top: Math.min(100, (scrollTop / total) * 100), height: Math.min(100, (vh / total) * 100) };
  });
  function drawMinimap() {
    const cv = minimapCanvas, wrap = minimapWrap;
    if (!cv || !wrap) return;
    const W = wrap.clientWidth, H = wrap.clientHeight;
    if (W === 0 || H === 0) return;
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    const n = lines.length;
    const cellH = Math.max(1, Math.min(4, H / Math.max(n, 1)));
    // A text taller than the map is sampled, one line per row, so the map is the whole text and the
    // viewport box (a share of the whole) sits over the part it says.
    const stride = Math.max(1, (n * cellH) / H);
    const cellW = Math.max(0.8, Math.min(1.6, (W - 6) / 90));
    const fg = theme === 'light' ? 'rgba(31,36,48,0.5)' : 'rgba(207,227,216,0.45)';
    const com = theme === 'light' ? 'rgba(138,148,140,0.6)' : 'rgba(91,107,95,0.75)';
    const tok = lineCommentToken(language);
    for (let row = 0; ; row++) {
      const y = row * cellH;
      const i = Math.floor(row * stride);
      if (y > H || i >= n) break;
      const line = lines[i];
      ctx.fillStyle = tok && line.trimStart().startsWith(tok) ? com : fg;
      let run = -1;
      for (let c = 0; c <= line.length; c++) {
        const ch = line[c];
        const ws = ch === undefined || ch === ' ' || ch === '\t';
        if (!ws && run < 0) run = c;
        else if (ws && run >= 0) {
          ctx.fillRect(4 + run * cellW, y, Math.max(1, (c - run) * cellW), Math.max(1, cellH - 0.6));
          run = -1;
        }
      }
    }
  }
  $effect(() => {
    void value; void theme; void language; void showMinimap;
    if (showMinimap) drawMinimap();
  });
  let cancelMinimapDrag = null;
  function minimapScrollTo(clientY) {
    if (!taEl || !minimapWrap) return;
    const r = minimapWrap.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientY - r.top) / r.height));
    taEl.scrollTop = Math.max(0, frac * lineCount * lineHeight - taEl.clientHeight / 2);
    onScroll();
  }
  function onMinimapDown(e) {
    e.preventDefault();
    cancelMinimapDrag?.();
    minimapScrollTo(e.clientY);
    const move = (ev) => minimapScrollTo(ev.clientY);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('blur', up);
      if (cancelMinimapDrag === up) cancelMinimapDrag = null;
    };
    cancelMinimapDrag = up;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('blur', up);
  }

  function syncCaret() {
    if (!taEl) return;
    const pos = taEl.selectionStart;
    caretPos = pos;
    // The index is of what is displayed; between a keystroke and the parent passing the new text
    // back, the textarea is ahead of it, and is indexed itself.
    const text = taEl.value;
    const starts = text === displayText ? displayStarts : lineStartsOf(text);
    caretLine = lineAt(starts, pos);
    caretCol = pos - starts[caretLine];
    // A value's list is about the characters between its quotes: the caret leaving them (an arrow
    // key, typing over the closing quote) closes it, so that Enter out there is a new line again and
    // not a rewrite of the value left behind.
    if (acOpen && acValue && (pos < acFrom || pos > acTo || taEl.selectionEnd !== pos)) acOpen = false;
    // The third argument is the caret's offset into the full source; folded, the start of its line
    // in the full source plus its column, since the textarea then holds the folded text.
    const fullLine = fullLineOf(caretLine);
    const offset = projection ? (valueStarts[fullLine - 1] ?? 0) + caretCol : pos;
    oncaret?.(fullLine, caretCol + 1, offset);
  }

  function countLines(s) { let n = 0; for (let i = 0; i < s.length; i++) if (s[i] === '\n') n++; return n; }

  const PAD_L = 4;   // .ce-hl / .ce-ta left padding (px) — keep in sync with the CSS
  // Measure the monospace character width whenever the font size changes.
  $effect(() => {
    void fontSize;
    if (measureEl) charWidth = measureEl.getBoundingClientRect().width / 10 || charWidth;
    if (taEl) taClientH = taEl.clientHeight;
  });
  // …and whenever the measured text changes width without the size changing. The face is a web font
  // (JetBrains Mono), loaded the first time text needs it, so the first measure is the fallback's:
  // on Windows that is Cascadia Code or Consolas, 7.0 px a character to JetBrains Mono's 7.8, and
  // every box placed by column (occurrences, squiggles, the Values marks, the completion list) ended
  // further from its text the further along the line it was.
  $effect(() => {
    const el = measureEl;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => { charWidth = el.getBoundingClientRect().width / 10 || charWidth; });
    observer.observe(el);
    return () => observer.disconnect();
  });

  // The text of line `line` (from 0).
  function lineTextOf(line) {
    const start = valueStarts[line] ?? 0;
    return value.slice(start, line + 1 < valueStarts.length ? valueStarts[line + 1] - 1 : value.length);
  }
  // line/column (0-based) of a character offset, the column as the editor draws it, a tab to its next
  // stop (textColumns.js). Counted in characters, every box placed by it (the completion list, the
  // rename box, the occurrence marks) sat left of its text on a line with tabs.
  function posOf(index) {
    const at = Math.min(index, value.length);
    const line = lineAt(valueStarts, at);
    return { line, col: visualColumn(lineTextOf(line), at - valueStarts[line]) };
  }
  // Content-space pixel (pre-scroll) for a line/col.
  function xyOf(line, col) {
    return { x: PAD_L + col * charWidth, y: PAD_TOP + line * lineHeight };
  }
  // Character offset nearest a client (mouse) coordinate.
  function indexAtClient(clientX, clientY) {
    if (!taEl) return 0;
    const r = taEl.getBoundingClientRect();
    const lx = clientX - r.left + taEl.scrollLeft - PAD_L;
    const ly = clientY - r.top + taEl.scrollTop - PAD_TOP;
    const line = Math.max(0, Math.floor(ly / lineHeight));
    const col = Math.max(0, Math.round(lx / charWidth));
    if (line >= valueStarts.length) return value.length;
    return valueStarts[line] + indexAtColumn(lineTextOf(line), col);
  }

  // ----- autocomplete -----
  let acOpen = $state(false);
  let acOptions = $state([]);
  let acIndex = $state(0);
  let acFrom = $state(0);
  let acTo = $state(0);
  // The list is a value's choices, not words: accepting one replaces all of [acFrom, acTo), the text
  // between the value's quotes, rather than the word before the caret.
  let acValue = $state(false);
  let acEl = $state(null);
  let acAnchor = $derived(acOpen ? posOf(acFrom) : { line: 0, col: 0 });
  // Viewport coords of the completion anchor (fixed-positioned so it escapes the editor's clip).
  let acScreen = $derived.by(() => {
    if (!acOpen || !taEl) return { x: 0, y: 0 };
    const r = taEl.getBoundingClientRect();
    return {
      x: r.left + PAD_L + acAnchor.col * charWidth - taEl.scrollLeft,
      y: r.top + PAD_TOP + (acAnchor.line + 1) * lineHeight - taEl.scrollTop,
    };
  });

  // ----- signature help -----
  let signature = $derived.by(() => {
    void caretPos;
    if (isFolded || !taEl || taEl.selectionStart !== taEl.selectionEnd) return null;
    return getSignatureHelp(value, language, caretPos);
  });
  // Each parameter's colour, the one it has under its argument and in the Values sidebar.
  let sigColours = $derived(signature ? paramColours(signature.id, signature.params) : []);
  // At the right edge of the caret's line when it clears the code, else a box above it or below
  // (signatureHint.js).
  let sigPlace = $derived.by(() => {
    if (!signature || !taEl) return null;
    const r = taEl.getBoundingClientRect();
    const text = taEl.value;
    const starts = text === displayText ? displayStarts : lineStartsOf(text);
    const start = starts[caretLine] ?? 0;
    const end = caretLine + 1 < starts.length ? starts[caretLine + 1] - 1 : text.length;
    const line = text.slice(start, end);
    // In columns as drawn: a tab is drawn to its next stop, not one character wide.
    const endCol = visualColumn(line, Math.max(line.trimEnd().length, caretCol));
    const x0 = r.left + PAD_L - scrollLeft;
    return placeSignatureHint({
      name: signature.name, params: signature.params, active: signature.activeParam,
      lineEndX: x0 + endCol * charWidth, caretX: x0 + visualColumn(line, caretCol) * charWidth,
      lineTop: r.top + PAD_TOP + caretLine * lineHeight - scrollTop, lineHeight, charWidth,
      box: { left: r.left, right: r.left + taEl.clientWidth, top: r.top, bottom: r.top + taEl.clientHeight },
    });
  });

  function refreshCompletion(force) {
    if (!taEl) return;
    const caret = taEl.selectionStart;
    if (caret !== taEl.selectionEnd) { acOpen = false; return; }
    // In a value the editor knows the choices for, those are the list, and words are not asked for
    // even when none of the choices fits what is typed: a function's name is no curve. The textarea's
    // text, not `value`, since the range found is the one an accept replaces.
    const choice = valueCompletions?.(taEl.value, language, caret, { force }) ?? null;
    if (choice) {
      // The same rule as for words: typing opens the list once there is something typed in the value,
      // or, in a path, once a dot is (`openEmpty`), as member completion opens after one.
      if ((!force && caret === choice.from && !choice.openEmpty) || choice.options.length === 0) { acOpen = false; return; }
      acOptions = choice.options;
      acFrom = choice.from;
      acTo = choice.to;
      acIndex = Math.max(0, Math.min(choice.options.length - 1, choice.selected ?? 0));
      acValue = true;
      acOpen = true;
      return;
    }
    const { from, to, options } = getCompletions(value, language, caret, { controlType });
    const prefixLen = to - from;
    // Auto-open only once there's a prefix; Ctrl+Space (force) opens regardless.
    if (!force && prefixLen === 0) { acOpen = false; return; }
    if (options.length === 0) { acOpen = false; return; }
    acOptions = options;
    acFrom = from;
    acTo = to;
    acIndex = 0;
    acValue = false;
    acOpen = true;
  }

  function acceptCompletion() {
    const opt = acOptions[acIndex];
    if (!opt) { acOpen = false; return; }
    if (acValue) {
      // A value's choice replaces the whole value between its quotes, as one edit, and leaves the caret
      // after it, inside them. The value as it is already written is no edit at all.
      const text = opt.insert ?? opt.label;
      if (taEl.value.slice(acFrom, acTo) === text) { taEl.setSelectionRange(acTo, acTo); syncCaret(); }
      else applyEdit(acFrom, acTo, text, acFrom + text.length);
    } else {
      applyEdit(acFrom, taEl.selectionStart, opt.label, acFrom + opt.label.length);
    }
    acOpen = false;
  }

  // A list can run past its height (a value's choices, which open on the one written; the words;
  // Go to symbol's symbols), and the arrow keys move through all of it, wrapping from the first row
  // to the last: the selected row is kept in view, by the list's own scroll, so nothing else on the
  // page moves. Measured on screen, since a symbol row's offset counts from the box above its list.
  function keepSelectedInView(list, selector) {
    const row = list?.querySelector(selector);
    if (!row) return;
    const box = list.getBoundingClientRect();
    const at = row.getBoundingClientRect();
    const top = box.top + list.clientTop;
    const bottom = top + list.clientHeight;
    if (at.top < top) list.scrollTop -= top - at.top;
    else if (at.bottom > bottom) list.scrollTop += at.bottom - bottom;
  }
  $effect(() => {
    void acIndex; void acOptions;
    if (acOpen) keepSelectedInView(acEl, '.ce-ac-row.sel');
  });
  // The pointer selects the row it moves onto, and only when it moves: a list the keys scroll
  // passes its rows under a resting pointer, and the browser tells each it was entered, so a row
  // that took the selection on mouseenter took it back from the keys. A move has a distance; what
  // the browser says of a scroll has none. A browser that gives no distance moves it as before.
  const pointerMoved = (e) => e.movementX === undefined || e.movementX !== 0 || e.movementY !== 0;

  const KIND_ICON = { function: 'ƒ', variable: 'x', parameter: 'p', property: '.', builtin: 'b', keyword: 'k', value: '"' };
  function kindIcon(kind) { return KIND_ICON[kind] ?? '•'; }

  // ----- hover -----
  let hover = $state(null);   // { title, doc, x, y }
  let hoverTimer = null;
  function onMouseMove(e) {
    if (isFolded) { clearHover(); return; }
    clearTimeout(hoverTimer);
    const cx = e.clientX, cy = e.clientY;
    hoverTimer = setTimeout(() => {
      const idx = indexAtClient(cx, cy);
      const w = wordAt(value, idx);
      const info = w ? getHover(value, language, idx) : null;
      hover = info ? { ...info, cx, cy } : null;
    }, 220);
  }
  function clearHover() { clearTimeout(hoverTimer); hoverTimer = null; hover = null; }

  // Move the caret to an offset and scroll it into view.
  function jumpTo(index) {
    taEl.focus();
    taEl.setSelectionRange(index, index);
    const top = posOf(index).line * lineHeight;
    if (top < taEl.scrollTop || top > taEl.scrollTop + taEl.clientHeight - lineHeight * 2) {
      taEl.scrollTop = Math.max(0, top - taEl.clientHeight / 2);
    }
    syncCaret();
  }

  // ----- go to definition -----
  function gotoDefinition(index) {
    const def = getDefinition(value, language, index);
    if (!def) return false;
    jumpTo(def.index);
    return true;
  }

  // ----- go to symbol (outline palette) -----
  let soOpen = $state(false);
  let soQuery = $state('');
  let soIndex = $state(0);
  let soListEl = $state(null);
  let soInputEl = $state(null);
  let soAll = $derived(
    analysis.symbols.filter((s) => s.kind === 'function' || s.kind === 'variable')
      .slice().sort((a, b) => a.index - b.index));
  let soItems = $derived.by(() => {
    const q = soQuery.trim().toLowerCase();
    return q ? soAll.filter((s) => s.name.toLowerCase().includes(q)) : soAll;
  });
  let soScreen = $derived.by(() => {
    if (!soOpen || !taEl) return { x: 0, y: 0, w: 360 };
    const r = taEl.getBoundingClientRect();
    const w = Math.min(420, r.width - 24);
    return { x: r.left + (r.width - w) / 2, y: r.top + 14, w };
  });
  async function openSymbols() {
    if (soAll.length === 0) return;
    soOpen = true; soQuery = ''; soIndex = 0;
    await tick();
    soInputEl?.focus();
  }
  function acceptSymbol() {
    const s = soItems[soIndex];
    soOpen = false;
    if (s) jumpTo(s.index);
  }
  function onSymbolKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); soIndex = Math.min(soIndex + 1, soItems.length - 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); soIndex = Math.max(soIndex - 1, 0); }
    else if (e.key === 'Enter') { e.preventDefault(); acceptSymbol(); }
    else if (e.key === 'Escape') { e.preventDefault(); soOpen = false; taEl?.focus(); }
  }
  $effect(() => {
    void soIndex; void soItems;
    if (soOpen) keepSelectedInView(soListEl, '.ce-so-row.sel');
  });
  async function onEditorClick(e) {
    // Click in the folded view → unfold and drop the caret on the clicked line of the full source.
    if (isFolded) {
      const idx = indexAtClient(e.clientX, e.clientY);
      const dispLine = countLines(displayText.slice(0, idx));
      const fullLine = fullLineOf(dispLine);
      unfoldAll();
      await tick();
      const offset = value.split('\n').slice(0, fullLine - 1).reduce((n, l) => n + l.length + 1, 0);
      taEl.focus();
      taEl.setSelectionRange(offset, offset);
      syncCaret();
      return;
    }
    column = null; // a plain click collapses any column selection
    if (e.ctrlKey || e.metaKey) {
      const idx = indexAtClient(e.clientX, e.clientY);
      if (gotoDefinition(idx)) { e.preventDefault(); return; }
    }
    syncCaret();
  }

  // ----- rename symbol (multi-occurrence edit) -----
  let renaming = $state(null);   // { word, occ, x, y }
  let renameDraft = $state('');
  let renameInputEl = $state(null);
  async function startRename() {
    const w = wordAt(value, taEl.selectionStart);
    if (!w) return;
    const occ = identifierOccurrences(value, language, w.word);
    if (occ.length === 0) return;
    const r = taEl.getBoundingClientRect();
    const p = posOf(w.start);
    renaming = {
      word: w.word, occ,
      x: r.left + PAD_L + p.col * charWidth - taEl.scrollLeft,
      y: r.top + PAD_TOP + p.line * lineHeight - taEl.scrollTop,
    };
    renameDraft = w.word;
    await tick();
    renameInputEl?.focus();
    renameInputEl?.select();
  }
  function commitRename() {
    const r = renaming;
    renaming = null;
    if (!r) return;
    const name = renameDraft.trim();
    if (name && name !== r.word && /^[A-Za-z_$][\w$]*$/.test(name)) {
      let v = value;
      // Replace from the end so earlier offsets stay valid.
      for (let i = r.occ.length - 1; i >= 0; i--) v = v.slice(0, r.occ[i].start) + name + v.slice(r.occ[i].end);
      const caret = r.occ[0].start + name.length;
      applyEdit(0, value.length, v, caret);
    }
    taEl?.focus();
  }

  // ----- column (block) selection / multi-line edit -----
  let column = $state(null); // { anchorLine, headLine, col } — all 0-based; carets across the range
  let columnCaretLines = $derived.by(() => {
    if (!column) return [];
    const a = Math.min(column.anchorLine, column.headLine), b = Math.max(column.anchorLine, column.headLine);
    const out = [];
    for (let i = a; i <= b; i++) out.push(i);
    return out;
  });
  function startOrExtendColumn(dir) {
    if (isFolded) return;
    if (!column) column = { anchorLine: caretLine, headLine: caretLine, col: caretCol };
    const h = Math.max(0, Math.min(lines.length - 1, column.headLine + dir));
    column = { ...column, headLine: h };
  }
  function columnRange() { return [Math.min(column.anchorLine, column.headLine), Math.max(column.anchorLine, column.headLine)]; }
  function columnType(ch) {
    const [a, b] = columnRange();
    const next = columnInsert(value, a, b, column.col, ch);
    applyEdit(0, value.length, next, offsetOf(next, column.headLine, column.col + 1));
    column = { ...column, col: column.col + 1 };
  }
  function columnBackspace() {
    if (column.col <= 0) return;
    const [a, b] = columnRange();
    const next = columnDelete(value, a, b, column.col);
    applyEdit(0, value.length, next, offsetOf(next, column.headLine, column.col - 1));
    column = { ...column, col: column.col - 1 };
  }

  // Select the next occurrence of the current word (wraps), scrolling it into view.
  function jumpToNextOccurrence() {
    const occ = occurrences;
    if (occ.length === 0) return;
    const pos = taEl.selectionStart;
    const next = occ.find((o) => o.start > pos) || occ[0];
    taEl.focus();
    taEl.setSelectionRange(next.start, next.end);
    const top = posOf(next.start).line * lineHeight;
    if (top < taEl.scrollTop || top > taEl.scrollTop + taEl.clientHeight - lineHeight * 2) {
      taEl.scrollTop = Math.max(0, top - taEl.clientHeight / 2);
    }
    syncCaret();
  }

  // Replace [start,end) with text, preserving the native undo stack, then optionally
  // reselect [selStart,selEnd]. Fires the textarea input path so the parent stays in sync.
  function applyEdit(start, end, text, selStart, selEnd) {
    if (isFolded) return; // never edit the projected (folded) text — the full source is the truth
    // readonly stops typing, not this: a read-only textarea refuses insertText, and the fallback
    // below would write it anyway, past an oninput that ignores it. Every edit of the editor's own
    // (indent, Enter, closing brackets, column typing, replace, rename, insert) comes through here.
    if (readOnly) return;
    const ta = taEl;
    ta.focus();
    ta.setSelectionRange(start, end);
    let ok = false;
    try { ok = document.execCommand('insertText', false, text); } catch { ok = false; }
    if (!ok) {
      const v = ta.value;
      ta.value = v.slice(0, start) + text + v.slice(end);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (selStart != null) ta.setSelectionRange(selStart, selEnd ?? selStart);
    syncCaret();
  }

  // ----- indentation helpers -----
  const INDENT = '  '; // two spaces, matching the .code tab-size of 2
  function lineStartOf(v, pos) { const nl = v.lastIndexOf('\n', pos - 1); return nl + 1; }
  function leadingWs(line) { const m = line.match(/^[ \t]*/); return m ? m[0] : ''; }

  function indentSelection(dedent) {
    const ta = taEl, v = ta.value;
    const selStart = ta.selectionStart, selEnd = ta.selectionEnd;
    const from = lineStartOf(v, selStart);
    const segs = v.slice(from, selEnd).split('\n');
    const lastIdx = segs.length - 1;
    let firstDelta = 0, totalDelta = 0;
    const next = segs.map((ln, i) => {
      if (dedent) {
        const m = ln.match(/^( {1,2}|\t)/);
        const cut = m ? m[0].length : 0;
        if (i === 0) firstDelta = -cut;
        totalDelta -= cut;
        return ln.slice(cut);
      }
      // Skip a trailing empty segment (selection ending at a line boundary).
      if (i === lastIdx && ln === '' && segs.length > 1) return ln;
      if (i === 0) firstDelta = INDENT.length;
      totalDelta += INDENT.length;
      return INDENT + ln;
    }).join('\n');
    applyEdit(from, selEnd, next, Math.max(from, selStart + firstDelta), selEnd + totalDelta);
  }

  const NAV_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', 'Escape']);
  function onKeydown(e) {
    const ta = taEl;
    // While folded the view is read-only: navigation passes through; any editing key
    // unfolds first (then the user edits the real, full source) — no edit hits projected text.
    if (isFolded) {
      if (NAV_KEYS.has(e.key)) return;
      e.preventDefault();
      unfoldAll();
      return;
    }
    const v = ta.value;
    const start = ta.selectionStart, end = ta.selectionEnd;
    const mod = e.ctrlKey || e.metaKey;

    // Column (block) selection: Shift+Alt+Up/Down adds a caret on each line at the same column.
    if (e.altKey && e.shiftKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault(); startOrExtendColumn(e.key === 'ArrowDown' ? 1 : -1); return;
    }
    if (column) {
      if (e.key === 'Escape') { e.preventDefault(); column = null; return; }
      if (e.key === 'Backspace') { e.preventDefault(); columnBackspace(); return; }
      if (e.key.length === 1 && !mod && !e.altKey) { e.preventDefault(); columnType(e.key); return; }
      // any other key (arrows, Enter, …) exits column mode and proceeds normally
      column = null;
    }

    // Autocomplete navigation takes priority while the popup is open.
    if (acOpen) {
      if (e.key === 'ArrowDown') { e.preventDefault(); acIndex = (acIndex + 1) % acOptions.length; return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); acIndex = (acIndex - 1 + acOptions.length) % acOptions.length; return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); acceptCompletion(); return; }
      if (e.key === 'Escape') { e.preventDefault(); acOpen = false; return; }
    }
    // Trigger completion explicitly (Ctrl/⌘+Space).
    if (mod && e.key === ' ') { e.preventDefault(); refreshCompletion(true); return; }
    // Go to symbol (Ctrl/⌘+Shift+O).
    if (mod && e.shiftKey && (e.key === 'O' || e.key === 'o')) { e.preventDefault(); openSymbols(); return; }
    // Rename symbol (F2) — edits every occurrence at once.
    if (e.key === 'F2') { e.preventDefault(); startRename(); return; }
    // Go to definition (F12) / cycle references (Shift+F12).
    if (e.key === 'F12') {
      e.preventDefault();
      if (e.shiftKey) jumpToNextOccurrence(); else gotoDefinition(ta.selectionStart);
      return;
    }

    // Shortcuts help overlay
    if (e.key === 'F1') { e.preventDefault(); showHelp = !showHelp; return; }
    if (showHelp && e.key === 'Escape') { e.preventDefault(); showHelp = false; return; }
    // Find / replace
    if (mod && (e.key === 'f' || e.key === 'h')) {
      e.preventDefault(); openFind(e.key === 'h'); return;
    }
    if (showFind && e.key === 'Escape') { e.preventDefault(); closeFind(); return; }
    // Font zoom
    if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); fontSize = Math.min(24, fontSize + 1); return; }
    if (mod && e.key === '-') { e.preventDefault(); fontSize = Math.max(10, fontSize - 1); return; }
    if (mod && e.key === '0') { e.preventDefault(); fontSize = 13; return; }
    // Run
    if (mod && e.key === 'Enter') { e.preventDefault(); onrun?.(); return; }
    // Comment toggle
    if (mod && e.key === '/') { e.preventDefault(); toggleComment(); return; }

    // Tab / Shift-Tab indent
    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) { indentSelection(true); return; }
      if (start !== end) { indentSelection(false); return; }
      applyEdit(start, end, INDENT, start + INDENT.length); return;
    }

    // Enter: auto-indent (carry leading whitespace; add one level after an opener)
    if (e.key === 'Enter' && start === end) {
      const ls = lineStartOf(v, start);
      const line = v.slice(ls, start);
      let indent = leadingWs(line);
      const prevChar = v[start - 1];
      const nextChar = v[start];
      const opensBlock = /[([{]$/.test(line.trimEnd()) || /\b(then|do|else)$/.test(line.trimEnd()) || /\bfunction\b[^)]*\)\s*$/.test(line.trimEnd());
      if (opensBlock) {
        const inner = indent + INDENT;
        // If the caret sits between a matching pair, expand to two lines with a closing line.
        if (prevChar && nextChar && CLOSERS[prevChar] === nextChar) {
          applyEdit(start, end, '\n' + inner + '\n' + indent, start + 1 + inner.length);
        } else {
          applyEdit(start, end, '\n' + inner, start + 1 + inner.length);
        }
        e.preventDefault(); return;
      }
      if (indent) { e.preventDefault(); applyEdit(start, end, '\n' + indent, start + 1 + indent.length); return; }
    }

    // Bracket / quote auto-closing
    if (OPENERS.has(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const closer = CLOSERS[e.key];
      const nextChar = v[end];
      const isQuote = e.key === '"' || e.key === "'" || e.key === '`';
      if (start === end) {
        const prev = v[start - 1];
        // Type over an existing quote instead of inserting a duplicate.
        if (isQuote && nextChar === e.key) { e.preventDefault(); ta.setSelectionRange(start + 1, start + 1); return; }
        // Don't auto-close a quote when typing right after a word or quote char.
        if (isQuote && prev && /[\w"'`]/.test(prev)) return;
        e.preventDefault();
        applyEdit(start, end, e.key + closer, start + 1); return;
      }
      // Wrap the current selection in the pair.
      e.preventDefault();
      applyEdit(start, end, e.key + v.slice(start, end) + closer, start + 1, end + 1); return;
    }

    // Type-over an auto-inserted closer.
    if ((e.key === ')' || e.key === ']' || e.key === '}') && start === end && v[start] === e.key) {
      e.preventDefault(); ta.setSelectionRange(start + 1, start + 1); return;
    }

    // Backspace inside an empty pair removes both halves.
    if (e.key === 'Backspace' && start === end && start > 0) {
      const prev = v[start - 1], next = v[start];
      if (OPENERS.has(prev) && CLOSERS[prev] === next) {
        e.preventDefault(); applyEdit(start - 1, start + 1, '', start - 1); return;
      }
    }
  }

  function toggleComment() {
    const ta = taEl, v = ta.value;
    const token = lineCommentToken(language);
    if (!token) return; // a language without comments (JSON)
    const selStart = ta.selectionStart, selEnd = ta.selectionEnd;
    const from = lineStartOf(v, selStart);
    // Operate on whole lines: extend to the end of the line containing the selection end.
    let blockEnd = v.indexOf('\n', selEnd);
    if (blockEnd === -1) blockEnd = v.length;
    // If a multi-line selection ends exactly at a line boundary, exclude that next line.
    if (selEnd > selStart && v[selEnd - 1] === '\n') blockEnd = selEnd - 1;
    const segs = v.slice(from, blockEnd).split('\n');
    const nonEmpty = segs.filter((l) => l.trim() !== '');
    const allCommented = nonEmpty.length > 0 && nonEmpty.every((l) => l.trimStart().startsWith(token));
    const next = segs.map((ln) => {
      if (ln.trim() === '') return ln;
      if (allCommented) {
        const idx = ln.indexOf(token);
        const after = ln.slice(idx + token.length);
        return ln.slice(0, idx) + (after.startsWith(' ') ? after.slice(1) : after);
      }
      const ws = leadingWs(ln);
      return ws + token + ' ' + ln.slice(ws.length);
    }).join('\n');
    applyEdit(from, blockEnd, next, from, from + next.length);
  }

  // ----- shortcuts help -----
  let showHelp = $state(false);
  const SHORTCUTS = [
    { keys: 'Tab / Shift+Tab', desc: 'Indent / outdent line or selection' },
    { keys: 'Enter', desc: 'New line with auto-indent' },
    { keys: 'Ctrl/⌘ + F', desc: 'Find' },
    { keys: 'Ctrl/⌘ + H', desc: 'Find & replace' },
    { keys: 'Ctrl/⌘ + /', desc: 'Toggle line comment' },
    { keys: 'Ctrl/⌘ + Space', desc: 'Trigger autocomplete; in a value, its choices' },
    { keys: 'F12 / Ctrl/⌘+Click', desc: 'Go to definition' },
    { keys: 'Shift + F12', desc: 'Next occurrence (references)' },
    { keys: 'Ctrl/⌘ + Shift + O', desc: 'Go to symbol' },
    { keys: 'F2', desc: 'Rename symbol (all occurrences)' },
    { keys: 'Gutter ▾ / ⊟', desc: 'Fold a block / fold all (click to edit unfolds)' },
    { keys: 'Shift+Alt+↑/↓', desc: 'Column selection — type/Backspace edits every line' },
    { keys: 'Ctrl/⌘ + Enter', desc: 'Run script' },
    { keys: 'Ctrl/⌘ + = / − / 0', desc: 'Zoom in / out / reset' },
    { keys: 'Ctrl/⌘ + Z / Y', desc: 'Undo / redo' },
    { keys: '(  [  {  "  \'  `', desc: 'Auto-close, or wrap the selection' },
    { keys: 'F1', desc: 'Toggle this help' },
  ];
  export function toggleHelp() { showHelp = !showHelp; }

  // ----- find & replace -----
  let showFind = $state(false);
  let showReplace = $state(false);
  let findText = $state('');
  let replaceText = $state('');
  let useRegex = $state(false);
  let useCase = $state(false);
  let findInputEl = $state(null);
  let matches = $derived(computeMatches(value, findText, useRegex, useCase));
  let activeMatch = $state(0);

  function computeMatches(text, q, regex, cs) {
    if (!q) return [];
    let re;
    try {
      const src = regex ? q : q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      re = new RegExp(src, 'g' + (cs ? '' : 'i'));
    } catch { return []; }
    const out = [];
    let m;
    while ((m = re.exec(text)) !== null) {
      out.push([m.index, m.index + m[0].length]);
      if (m[0].length === 0) re.lastIndex++;
      if (out.length > 5000) break;
    }
    return out;
  }

  async function openFind(replace) {
    showFind = true;
    showReplace = replace;
    const sel = taEl.value.slice(taEl.selectionStart, taEl.selectionEnd);
    if (sel && !sel.includes('\n')) findText = sel;
    await tick();
    findInputEl?.focus();
    findInputEl?.select();
  }

  function closeFind() { showFind = false; taEl?.focus(); }

  function gotoMatch(dir) {
    if (matches.length === 0) return;
    activeMatch = (activeMatch + dir + matches.length) % matches.length;
    selectMatch();
  }

  function selectMatch() {
    const m = matches[activeMatch];
    if (!m) return;
    taEl.focus();
    taEl.setSelectionRange(m[0], m[1]);
    // Scroll the match's line into view.
    const top = posOf(m[0]).line * lineHeight;
    if (top < taEl.scrollTop || top > taEl.scrollTop + taEl.clientHeight - lineHeight * 2) {
      taEl.scrollTop = Math.max(0, top - taEl.clientHeight / 2);
    }
    syncCaret();
  }

  function replaceCurrent() {
    if (matches.length === 0) return;
    const m = matches[activeMatch];
    applyEdit(m[0], m[1], replaceText, m[0] + replaceText.length);
    // matches recompute from value; keep index in range.
    activeMatch = Math.min(activeMatch, Math.max(0, matches.length - 2));
  }

  function replaceAll() {
    if (!findText || matches.length === 0) return;
    let re;
    try {
      const src = useRegex ? findText : findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      re = new RegExp(src, 'g' + (useCase ? '' : 'i'));
    } catch { return; }
    const next = taEl.value.replace(re, useRegex ? replaceText : () => replaceText);
    applyEdit(0, taEl.value.length, next, Math.min(taEl.selectionStart, next.length));
  }

  // ----- exposed API (used by the API-insert picker in BehaviorDesigner) -----
  export async function insert(text) {
    if (!taEl) return;
    if (isFolded) { unfoldAll(); await tick(); }
    const start = taEl.selectionStart, end = taEl.selectionEnd;
    applyEdit(start, end, text, start + text.length);
    await tick();
    taEl.focus();
  }
  export function focus() { taEl?.focus(); }

  /**
   * Replace [start, end) of the source with `text`, for the Values sidebar: through applyEdit, so it
   * is one step of the textarea's own undo and fires the input path a keystroke does. The caret and
   * selection keep their place, moved by the edit, and focus goes back to where it was (a field or
   * the display panel), since the textarea has to hold it for the edit. Returns the whole text after
   * the edit, or null when the view cannot be edited (folded, or read-only).
   */
  export function replaceRange(start, end, text) {
    if (!taEl || isFolded || readOnly) return null;
    const length = taEl.value.length;
    const s = Math.max(0, Math.min(length, Math.floor(start)));
    const e = Math.max(s, Math.min(length, Math.floor(end)));
    const insert = String(text ?? '');
    const back = typeof document !== 'undefined' ? document.activeElement : null;
    const moved = (p) => (p <= s ? p : p >= e ? p + insert.length - (e - s) : s + insert.length);
    applyEdit(s, e, insert, moved(taEl.selectionStart), moved(taEl.selectionEnd));
    if (back && back !== taEl && back.isConnected && typeof back.focus === 'function') back.focus({ preventScroll: true });
    return taEl.value;
  }

  /** Scroll [start, end) into view and put the caret at its start: a Values row was clicked. */
  export async function reveal(start, end = start, { focus: take = true } = {}) {
    if (!taEl) return;
    if (isFolded) { unfoldAll(); await tick(); }
    const at = Math.max(0, Math.min(value.length, Math.floor(start) || 0));
    if (take) taEl.focus({ preventScroll: true });
    taEl.setSelectionRange(at, at);
    const p = posOf(at);
    const last = posOf(Math.max(at, Math.min(value.length, Math.floor(end) || at)));
    const top = p.line * lineHeight;
    const bottom = (last.line + 1) * lineHeight;
    if (top < taEl.scrollTop || bottom > taEl.scrollTop + taEl.clientHeight - lineHeight) {
      taEl.scrollTop = Math.max(0, top - taEl.clientHeight / 3);
    }
    const x = p.col * charWidth;
    if (x < taEl.scrollLeft || x > taEl.scrollLeft + taEl.clientWidth - charWidth * 8) {
      taEl.scrollLeft = Math.max(0, x - taEl.clientWidth / 3);
    }
    onScroll();
    syncCaret();
  }
  // Put the caret at a line and column (both from 1) and scroll it into the middle of the view: the
  // panel file view takes a reader to the mistake it reported.
  export async function revealLine(line, col = 1) {
    if (!taEl) return;
    if (isFolded) { unfoldAll(); await tick(); }
    const at = Math.max(1, Math.min(valueStarts.length, Math.floor(line) || 1));
    const start = valueStarts[at - 1];
    const end = at < valueStarts.length ? valueStarts[at] - 1 : value.length;
    const offset = start + Math.max(0, Math.min(end - start, (Math.floor(col) || 1) - 1));
    taEl.focus();
    taEl.setSelectionRange(offset, offset);
    taEl.scrollTop = Math.max(0, (at - 1) * lineHeight - taEl.clientHeight / 2);
    onScroll();
    syncCaret();
  }

  onDestroy(() => {
    cancelMinimapDrag?.();
    clearTimeout(analyzeTimer);
    clearHover();
  });

  // Move a node to <body> so fixed-positioned popups aren't clipped by an ancestor's
  // overflow or transformed containing block. Its colours go with it: they are set where the
  // editor is, and do not reach <body> (popupTheme.js).
  function portal(node) {
    carryPopupTheme(node, rootEl);
    document.body.appendChild(node);
    return { destroy() { node.remove(); } };
  }
</script>

<div class={['ce', theme === 'light' && 'light']} bind:this={rootEl} style="--ce-fs:{fontSize}px; --ce-lh:{lineHeight}px; --ce-pad-top:{PAD_TOP}px; --ce-gw:{gutterDigits}ch; min-height:{minHeight}px">
  <div class="ce-gutter">
    <div class="ce-gutter-inner" style="transform:translateY({firstRow * lineHeight - scrollTop}px)">
      {#each gutterRows as i (i)}
        {@const fl = fullLineOf(i)}
        <div class={['ce-gln', i === caretLine && 'active', errorLines.has(fl) && 'err', bpSet.has(fl) && 'bp']}
          role="button" tabindex="-1" title="Toggle breakpoint"
          onclick={() => toggleBreakpoint(fl)}
          onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleBreakpoint(fl); } }}>
          {#if foldStarts.has(fl)}
            <span class="ce-fold" role="button" tabindex="-1" title="Fold / unfold (region)"
              onclick={(e) => { e.stopPropagation(); toggleFold(fl); }}
              onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); toggleFold(fl); } }}>{folded.has(fl) ? '▸' : '▾'}</span>
          {:else}
            <span class="ce-fold ce-fold-empty"></span>
          {/if}
          <span class="ce-lnnum">{fl}</span>
        </div>
      {/each}
    </div>
  </div>

  <div class="ce-area">
    {#each markList as b (b.key)}
      {#if b.band}
        <div class="ce-mark ce-mark-statement" data-mark="statement" data-line={b.line + 1}
          style="top:{PAD_TOP + b.line * lineHeight - scrollTop}px; height:{lineHeight}px"></div>
      {:else}
        <div class={['ce-mark', `ce-mark-${b.kind}`, b.colour && `c-${b.colour}`]} data-mark={b.kind} data-line={b.line + 1}
          style="left:{PAD_L + b.col * charWidth - scrollLeft - 1}px; top:{PAD_TOP + b.line * lineHeight - scrollTop}px; width:{b.width * charWidth + 2}px; height:{lineHeight}px"></div>
      {/if}
    {/each}
    <!-- After the marks: its bar is drawn over a statement band's, so the caret's line in it shows. -->
    <div class="ce-activeline" style="top:{PAD_TOP + caretLine * lineHeight - scrollTop}px; height:{lineHeight}px"></div>
    {#each occurrences as o (o.start)}
      {@const p = posOf(o.start)}
      <div class="ce-occ"
        style="left:{PAD_L + p.col * charWidth - scrollLeft}px; top:{PAD_TOP + p.line * lineHeight - scrollTop}px; width:{(posOf(o.end).col - p.col) * charWidth}px; height:{lineHeight}px"></div>
    {/each}
    {#each columnCaretLines as ln (ln)}
      <div class="ce-mcaret"
        style="left:{PAD_L + visualColumn(lineTextOf(ln), column.col) * charWidth - scrollLeft}px; top:{PAD_TOP + ln * lineHeight - scrollTop}px; height:{lineHeight}px"></div>
    {/each}
    <pre class="ce-hl" aria-hidden="true" style="transform:translate({-scrollLeft}px, {firstRow * lineHeight - scrollTop}px)">{@html highlightedSafe}</pre>
    <textarea
      class="ce-ta"
      bind:this={taEl}
      value={displayText}
      readonly={isFolded || readOnly}
      {placeholder}
      spellcheck="false"
      autocomplete="off"
      autocapitalize="off"
      autocorrect="off"
      wrap="off"
      oninput={() => { if (isFolded || readOnly) return; emit(); syncCaret(); if (!column) refreshCompletion(false); }}
      onscroll={onScroll}
      onkeydown={onKeydown}
      onkeyup={syncCaret}
      onclick={onEditorClick}
      onfocus={syncCaret}
      onblur={() => { acOpen = false; clearHover(); }}
      onmousemove={onMouseMove}
      onmouseleave={clearHover}
    ></textarea>

    <!-- diagnostics underline layer (clipped with the content) -->
    {#each diagSpans as d (d.line + ':' + d.col)}
      <div class="ce-squiggle"
        style="left:{PAD_L + d.col * charWidth - scrollLeft}px; top:{PAD_TOP + (d.line - 1) * lineHeight - scrollTop + lineHeight - 3}px; width:{Math.max(d.len, 1) * charWidth}px"
        title={d.message}></div>
    {/each}
  </div>

  {#if showMinimap}
    <div class="ce-minimap" bind:this={minimapWrap} onpointerdown={onMinimapDown}
      role="button" tabindex="-1" aria-label="Minimap — click to scroll">
      <canvas class="ce-minimap-canvas" bind:this={minimapCanvas}></canvas>
      <div class="ce-minimap-vp" style="top:{mmViewport.top}%; height:{mmViewport.height}%"></div>
    </div>
  {/if}

  <span class="ce-measure" bind:this={measureEl} aria-hidden="true">0000000000</span>

  {#if showFind}
    <div class="ce-find" role="search">
      <div class="ce-find-row">
        <input
          class="ce-find-input"
          bind:this={findInputEl}
          bind:value={findText}
          placeholder="Find"
          onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); gotoMatch(e.shiftKey ? -1 : 1); } }}
        />
        <span class="ce-find-count">{matches.length ? (activeMatch + 1) + '/' + matches.length : 'No results'}</span>
        <button class="ce-find-btn" title="Previous (Shift+Enter)" onclick={() => gotoMatch(-1)}>↑</button>
        <button class="ce-find-btn" title="Next (Enter)" onclick={() => gotoMatch(1)}>↓</button>
        <button class={['ce-find-toggle', useCase && 'on']} title="Match case" onclick={() => useCase = !useCase}>Aa</button>
        <button class={['ce-find-toggle', useRegex && 'on']} title="Use regular expression" onclick={() => useRegex = !useRegex}>.*</button>
        <button class="ce-find-toggle" title="Replace mode" onclick={() => showReplace = !showReplace}>⇄</button>
        <button class="ce-find-btn" title="Close (Esc)" onclick={closeFind}>✕</button>
      </div>
      {#if showReplace}
        <div class="ce-find-row">
          <input class="ce-find-input" bind:value={replaceText} placeholder="Replace"
            onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); replaceCurrent(); } }} />
          <button class="ce-find-btn wide" onclick={replaceCurrent}>Replace</button>
          <button class="ce-find-btn wide" onclick={replaceAll}>All</button>
        </div>
      {/if}
    </div>
  {/if}

  {#if foldRegions.length > 0}
    <button class="ce-fold-btn" title={isFolded ? 'Unfold all' : 'Fold all'} aria-label="Fold all"
      onclick={toggleFoldAll} class:on={isFolded}>{isFolded ? '⊞' : '⊟'}</button>
  {/if}
  <button class="ce-minimap-btn" title="Toggle minimap" aria-label="Toggle minimap"
    onclick={toggleMinimap} class:on={showMinimap}>▤</button>
  <button class="ce-theme-btn" title="Toggle editor theme" aria-label="Toggle editor theme"
    onclick={toggleTheme}>{theme === 'dark' ? '☾' : '☀'}</button>
  <button class="ce-help-btn" title="Keyboard shortcuts (F1)" aria-label="Keyboard shortcuts"
    onclick={() => showHelp = !showHelp}>?</button>

  {#if showHelp}
    <div class="ce-help" role="dialog" aria-label="Keyboard shortcuts">
      <div class="ce-help-head"><span>Keyboard shortcuts</span><button class="ce-find-btn" title="Close (Esc)" onclick={() => showHelp = false}>✕</button></div>
      <dl class="ce-help-list">
        {#each SHORTCUTS as s (s.keys)}
          <div class="ce-help-row"><dt>{s.keys}</dt><dd>{s.desc}</dd></div>
        {/each}
      </dl>
    </div>
  {/if}

  {#if renaming}
    <input class="ce-rename" use:portal bind:this={renameInputEl} bind:value={renameDraft}
      style="left:{renaming.x}px; top:{renaming.y}px"
      onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitRename(); } else if (e.key === 'Escape') { e.preventDefault(); renaming = null; taEl?.focus(); } }}
      onblur={commitRename} />
  {/if}

  {#if hover}
    <div class="ce-hover" use:portal use:floating={{ anchor: { x: hover.cx, y: hover.cy }, placement: 'bottom-start', offset: { mainAxis: 16, crossAxis: 6 }, fallbackPlacements: ['top-start'], track: false }}>
      <div class="ce-hover-title">{hover.title}</div>
      {#if hover.doc}<div class="ce-hover-doc">{hover.doc}</div>{/if}
    </div>
  {/if}

  {#if signature && sigPlace && !acOpen}
    <!-- A line tall, in the code's own size: inline on the caret's line, or a box over the line
         before or after it, cut at the editor's width. -->
    <div class={['ce-sig', sigPlace.mode]} data-mode={sigPlace.mode} use:portal
      style:left="{sigPlace.x}px" style:top="{sigPlace.y}px"
      style:height="{lineHeight}px" style:line-height="{sigPlace.mode === 'inline' ? lineHeight : lineHeight - 2}px"
      style:font-size="{fontSize}px"
      style:max-width={sigPlace.mode === 'inline' ? null : `${sigPlace.width}px`}>
      <span class="ce-sig-name">{signature.name}</span>(<!--
        -->{#each sigPlace.parts as p, i (i)}<span class={['ce-sig-param', p.active && 'active', sigColours[p.index] && `c-${sigColours[p.index]}`]}>{p.text}</span>{#if i < sigPlace.parts.length - 1}{', '}{/if}{/each}<!--
      -->)
    </div>
  {/if}

  {#if acOpen}
    <div class="ce-ac" bind:this={acEl} data-list={acValue ? 'value' : 'words'} use:portal use:floating={{ anchor: { x: acScreen.x, y: acScreen.y - lineHeight, width: 0, height: lineHeight }, placement: 'bottom-start', offset: -2, fallbackPlacements: ['top-start'], track: false }}>
      {#each acOptions as o, i (o.kind + o.label)}
        <div class={['ce-ac-row', i === acIndex && 'sel']}
          role="option" aria-selected={i === acIndex} tabindex="-1"
          onmousedown={(e) => { e.preventDefault(); acIndex = i; acceptCompletion(); }}
          onmousemove={(e) => { if (acIndex !== i && pointerMoved(e)) acIndex = i; }}>
          <span class={['ce-ac-kind', o.kind]}>{kindIcon(o.kind)}</span>
          <span class="ce-ac-label">{o.label}</span>
          <span class="ce-ac-detail">{o.detail}</span>
        </div>
      {/each}
    </div>
  {/if}

  {#if soOpen}
    <div class="ce-so-backdrop" use:portal role="presentation" onmousedown={() => { soOpen = false; taEl?.focus(); }}></div>
    <div class="ce-so" use:portal style="left:{soScreen.x}px; top:{soScreen.y}px; width:{soScreen.w}px"
      role="dialog" aria-label="Go to symbol" tabindex="-1" onmousedown={(e) => e.stopPropagation()}>
      <input class="ce-so-input" bind:this={soInputEl} bind:value={soQuery} placeholder="Go to symbol…"
        oninput={() => soIndex = 0} onkeydown={onSymbolKey} />
      <div class="ce-so-list" bind:this={soListEl}>
        {#if soItems.length === 0}
          <div class="ce-so-empty">No symbols</div>
        {:else}
          {#each soItems as s, i (s.index)}
            <div class={['ce-so-row', i === soIndex && 'sel']}
              role="option" aria-selected={i === soIndex} tabindex="-1"
              onmousedown={(e) => { e.preventDefault(); soIndex = i; acceptSymbol(); }}
              onmousemove={(e) => { if (soIndex !== i && pointerMoved(e)) soIndex = i; }}>
              <span class={['ce-ac-kind', s.kind]}>{kindIcon(s.kind)}</span>
              <span class="ce-so-name">{s.name}</span>
              <span class="ce-so-detail">{s.detail}</span>
              <span class="ce-so-line">{s.line}</span>
            </div>
          {/each}
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .ce {
    /* editor colour theme (dark default) */
    --ce-bg: #0a0c10;
    --ce-gutter-bg: #080a0d;
    --ce-fg: #cfe3d8;
    --ce-active: rgba(255, 255, 255, 0.04);
    --ce-occ: rgba(224, 162, 60, 0.18);
    --ce-sel: rgba(90, 155, 240, 0.35);
    --ce-com: #5b6b5f;
    --ce-str: #9ed4a8;
    --ce-numc: #e0a23c;
    --ce-kw: #5a9bf0;
    --ce-litc: #c98be0;
    --ce-bic: #4dd6a0;
    --ce-match-bg: rgba(90, 155, 240, 0.28);
    --ce-match-ring: rgba(90, 155, 240, 0.55);
    /* the Values sidebar's highlights: the statement it lists, the value under the pointer in it, and
       the value an edit is open on — each its own, so all three read apart from --ce-occ and --ce-sel */
    --ce-stmt: rgba(90, 155, 240, 0.055);
    --ce-stmt-bar: rgba(90, 155, 240, 0.75);
    --ce-hov: rgba(255, 255, 255, 0.075);
    --ce-hov-ring: rgba(255, 255, 255, 0.24);
    --ce-edit: rgba(90, 155, 240, 0.12);
    --ce-edit-ring: #6aa8ff;
    position: relative;
    display: flex;
    width: 100%;
    background: var(--ce-bg);
    border: 1px solid var(--line-2);
    border-radius: 8px;
    overflow: hidden;
    font-family: var(--mono);
    font-size: var(--ce-fs);
    line-height: var(--ce-lh);
    resize: vertical;
  }
  .ce.light {
    --ce-bg: #fbfcfd;
    --ce-gutter-bg: #f1f3f6;
    --ce-fg: #1f2430;
    --ce-active: rgba(0, 0, 0, 0.05);
    --ce-occ: rgba(176, 104, 0, 0.16);
    --ce-sel: rgba(42, 93, 176, 0.22);
    --ce-com: #8a948c;
    --ce-str: #2e7d46;
    --ce-numc: #b06800;
    --ce-kw: #2a5db0;
    --ce-litc: #8a3fb0;
    --ce-bic: #1a8f6a;
    --ce-match-bg: rgba(42, 93, 176, 0.2);
    --ce-match-ring: rgba(42, 93, 176, 0.5);
    --ce-stmt: rgba(42, 93, 176, 0.05);
    --ce-stmt-bar: rgba(42, 93, 176, 0.6);
    --ce-hov: rgba(0, 0, 0, 0.05);
    --ce-hov-ring: rgba(0, 0, 0, 0.24);
    --ce-edit: rgba(42, 93, 176, 0.09);
    --ce-edit-ring: #2a5db0;
  }

  .ce-gutter {
    position: relative;
    flex-shrink: 0;
    width: calc(var(--ce-gw) + 22px);
    overflow: hidden;
    background: var(--ce-gutter-bg);
    border-right: 1px solid var(--line);
    user-select: none;
  }
  .ce-gutter-inner { position: absolute; top: 0; left: 0; right: 0; padding-top: var(--ce-pad-top); will-change: transform; }
  .ce-gln {
    display: flex;
    align-items: center;
    height: var(--ce-lh);
    line-height: var(--ce-lh);
    padding-right: 8px;
    color: var(--txt-faint);
    font-variant-numeric: tabular-nums;
    cursor: pointer;
    position: relative;
  }
  .ce-fold {
    flex-shrink: 0; width: 13px; text-align: center; font-size: 9px;
    color: var(--txt-faint); cursor: pointer; opacity: 0;
    transition: opacity .1s;
  }
  .ce-gutter:hover .ce-fold { opacity: 0.85; }
  .ce-fold-empty { cursor: default; }
  .ce-lnnum { flex: 1; text-align: right; }
  .ce-gln.active .ce-lnnum { color: var(--txt-dim); }
  .ce-gln.err { color: var(--red); box-shadow: inset 2px 0 0 var(--red); }
  .ce-gln.err .ce-lnnum { color: var(--red); }
  .ce-gln.bp { box-shadow: inset 3px 0 0 var(--red); }
  .ce-gln.bp .ce-lnnum { color: var(--red); }

  .ce-area { position: relative; flex: 1; min-width: 0; overflow: hidden; }

  /* The caret's line: a faint band, and a bar at its left edge as the Values tab's statement band
     has, in the accent colour, so the line the caret is on reads at a glance. */
  .ce-activeline {
    position: absolute;
    left: 0; right: 0;
    background: var(--ce-active);
    box-shadow: inset 2px 0 0 var(--accent);
    pointer-events: none;
    z-index: 0;
  }
  .ce-occ {
    position: absolute;
    background: var(--ce-occ);
    border-radius: 2px;
    pointer-events: none;
    z-index: 0;
  }
  .ce-mark {
    position: absolute;
    pointer-events: none;
    z-index: 0;
    box-sizing: border-box;
  }
  .ce-mark-statement { left: 0; right: 0; background: var(--ce-stmt); box-shadow: inset 2px 0 0 var(--ce-stmt-bar); }
  /* An argument's parameter colour, as a line under it: the colour it has in the hint and the sidebar. */
  .ce-mark-param { box-shadow: inset 0 -2px 0 var(--ce-param, var(--txt-faint)); border-radius: 0; }
  .ce-mark-param.c-blue { --ce-param: var(--blue); }
  .ce-mark-param.c-amber { --ce-param: var(--amber); }
  .ce-mark-param.c-green { --ce-param: var(--accent); }
  .ce-mark-hover { background: var(--ce-hov); box-shadow: 0 0 0 1px var(--ce-hov-ring); border-radius: 3px; }
  .ce-mark-edit { background: var(--ce-edit); box-shadow: 0 0 0 1.5px var(--ce-edit-ring); border-radius: 3px; }
  .ce-mcaret {
    position: absolute;
    width: 2px;
    background: var(--accent);
    pointer-events: none;
    z-index: 3;
    animation: ce-blink 1s steps(1) infinite;
  }
  @keyframes ce-blink { 50% { opacity: 0; } }

  .ce-hl, .ce-ta {
    margin: 0;
    padding: var(--ce-pad-top) 12px var(--ce-pad-top) 4px;
    font-family: var(--mono);
    font-size: var(--ce-fs);
    line-height: var(--ce-lh);
    tab-size: 2;
    white-space: pre;
    word-wrap: normal;
    border: 0;
  }

  .ce-hl {
    position: absolute;
    top: 0; left: 0;
    min-width: 100%;
    color: var(--ce-fg);
    pointer-events: none;
    z-index: 1;
    will-change: transform;
  }

  .ce-ta {
    position: absolute;
    inset: 0;
    width: 100%; height: 100%;
    background: transparent;
    color: transparent;
    caret-color: var(--ce-fg);
    resize: none;
    overflow: auto;
    outline: none;
    z-index: 2;
  }
  .ce-ta::selection { background: var(--ce-sel); }
  .ce-ta::placeholder { color: var(--txt-faint); }

  /* token colours — tuned for the dark #0a0c10 surface */
  .ce-hl :global(.tok-com) { color: var(--ce-com); font-style: italic; }
  .ce-hl :global(.tok-str) { color: var(--ce-str); }
  .ce-hl :global(.tok-num) { color: var(--ce-numc); }
  .ce-hl :global(.tok-kw)  { color: var(--ce-kw); }
  .ce-hl :global(.tok-lit) { color: var(--ce-litc); }
  .ce-hl :global(.tok-bi)  { color: var(--ce-bic); }
  .ce-hl :global(.tok-key) { color: var(--ce-kw); }
  .ce-hl :global(.tok-match) {
    background: var(--ce-match-bg);
    border-radius: 2px;
    box-shadow: 0 0 0 1px var(--ce-match-ring);
  }

  .ce-find {
    position: absolute;
    top: 8px; right: 14px;
    z-index: 5;
    background: var(--panel-2);
    border: 1px solid var(--line-2);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-family: 'Archivo', system-ui, sans-serif;
  }
  .ce-find-row { display: flex; align-items: center; gap: 5px; }
  .ce-find-input {
    width: 170px;
    background: var(--bg-2);
    border: 1px solid var(--line-2);
    border-radius: 6px;
    padding: 5px 8px;
    color: var(--txt);
    font-size: 12px;
    font-family: var(--mono);
  }
  .ce-find-input:focus { outline: none; border-color: var(--accent-dim); }
  .ce-find-count { font-size: 11px; color: var(--txt-faint); min-width: 58px; text-align: center; }
  .ce-find-btn, .ce-find-toggle {
    background: transparent;
    border: 1px solid transparent;
    border-radius: 6px;
    color: var(--txt-dim);
    cursor: pointer;
    font-size: 12px;
    padding: 4px 7px;
    line-height: 1;
  }
  .ce-find-btn.wide { border-color: var(--line-2); }
  .ce-find-btn:hover, .ce-find-toggle:hover { background: var(--bg-2); color: var(--txt); }
  .ce-find-toggle.on { background: var(--accent-dim); color: #eafff5; border-color: var(--accent); }

  /* shortcuts help */
  .ce-help-btn {
    position: absolute;
    right: 8px; bottom: 8px;
    z-index: 4;
    width: 22px; height: 22px;
    border-radius: 50%;
    background: var(--panel-2);
    border: 1px solid var(--line-2);
    color: var(--txt-dim);
    cursor: pointer;
    font-size: 12px;
    line-height: 1;
    opacity: 0.55;
    transition: opacity .12s;
  }
  .ce-help-btn:hover { opacity: 1; color: var(--txt); }
  .ce-theme-btn {
    position: absolute;
    right: 36px; bottom: 8px;
    z-index: 4;
    width: 22px; height: 22px;
    border-radius: 50%;
    background: var(--panel-2);
    border: 1px solid var(--line-2);
    color: var(--txt-dim);
    cursor: pointer;
    font-size: 12px;
    line-height: 1;
    opacity: 0.55;
    transition: opacity .12s;
  }
  .ce-theme-btn:hover { opacity: 1; color: var(--txt); }
  .ce-fold-btn {
    position: absolute;
    right: 92px; bottom: 8px;
    z-index: 4;
    width: 22px; height: 22px;
    border-radius: 50%;
    background: var(--panel-2);
    border: 1px solid var(--line-2);
    color: var(--txt-dim);
    cursor: pointer;
    font-size: 12px;
    line-height: 1;
    opacity: 0.55;
    transition: opacity .12s;
  }
  .ce-fold-btn:hover { opacity: 1; color: var(--txt); }
  .ce-fold-btn.on { opacity: 1; color: var(--accent); border-color: var(--accent-dim); }
  .ce-minimap-btn {
    position: absolute;
    right: 64px; bottom: 8px;
    z-index: 4;
    width: 22px; height: 22px;
    border-radius: 50%;
    background: var(--panel-2);
    border: 1px solid var(--line-2);
    color: var(--txt-dim);
    cursor: pointer;
    font-size: 11px;
    line-height: 1;
    opacity: 0.55;
    transition: opacity .12s;
  }
  .ce-minimap-btn:hover { opacity: 1; color: var(--txt); }
  .ce-minimap-btn.on { opacity: 1; color: var(--accent); border-color: var(--accent-dim); }

  /* minimap */
  .ce-minimap {
    position: relative;
    flex-shrink: 0;
    width: 64px;
    background: var(--ce-gutter-bg);
    border-left: 1px solid var(--line);
    cursor: pointer;
    overflow: hidden;
  }
  .ce-minimap-canvas { display: block; width: 100%; height: 100%; }
  .ce-minimap-vp {
    position: absolute;
    left: 0; right: 0;
    background: rgba(120, 150, 200, 0.18);
    border: 1px solid rgba(120, 150, 200, 0.35);
    pointer-events: none;
  }
  .ce-help {
    position: absolute;
    right: 14px; bottom: 38px;
    z-index: 6;
    width: 320px;
    background: var(--panel-2);
    border: 1px solid var(--line-2);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    padding: 10px 12px;
    font-family: 'Archivo', system-ui, sans-serif;
  }
  .ce-help-head {
    display: flex; align-items: center; justify-content: space-between;
    font-size: 12px; font-weight: 600; color: var(--txt);
    margin-bottom: 8px;
  }
  .ce-help-list { margin: 0; display: flex; flex-direction: column; gap: 5px; }
  .ce-help-row { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
  .ce-help-row dt {
    font-family: var(--mono); font-size: 11px; color: var(--accent);
    white-space: nowrap; flex-shrink: 0;
  }
  .ce-help-row dd { margin: 0; font-size: 12px; color: var(--txt-dim); text-align: right; }

  /* hidden monospace measuring element */
  .ce-measure {
    position: absolute; visibility: hidden; pointer-events: none; white-space: pre;
    font-family: var(--mono); font-size: var(--ce-fs); line-height: var(--ce-lh);
    top: -9999px; left: -9999px;
  }

  /* diagnostics squiggle */
  .ce-squiggle {
    position: absolute;
    height: 3px;
    z-index: 1;
    pointer-events: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='6' height='3'%3E%3Cpath d='M0 3 Q1.5 0 3 1.5 T6 3' stroke='%23e0635a' fill='none' stroke-width='0.9'/%3E%3C/svg%3E");
    background-repeat: repeat-x;
    background-position: left bottom;
  }

  /* rename input */
  .ce-rename {
    position: fixed;
    z-index: 64;
    min-width: 90px;
    background: var(--panel-2);
    border: 1px solid var(--accent);
    border-radius: 5px;
    padding: 2px 6px;
    color: var(--txt);
    font-family: var(--mono);
    font-size: var(--ce-fs);
    outline: none;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.5);
  }

  /* hover tooltip */
  .ce-hover {
    position: fixed;
    z-index: 60;
    max-width: 360px;
    background: var(--panel-2);
    border: 1px solid var(--line-2);
    border-radius: 7px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    padding: 7px 9px;
    pointer-events: none;
    font-family: 'Archivo', system-ui, sans-serif;
  }
  .ce-hover-title { font-family: var(--mono); font-size: 12px; color: var(--accent); white-space: pre-wrap; }
  .ce-hover-doc { font-size: 12px; color: var(--txt-dim); margin-top: 4px; line-height: 1.4; }

  /* signature help: inline after the end of the caret's line, or a box over the line before or after
     it; a line tall either way, its size set where it is placed (signatureHint.js, whose HINT holds
     the padding and border) */
  .ce-sig {
    position: fixed;
    z-index: 59;
    box-sizing: border-box;
    background: var(--panel-2);
    border: 1px solid var(--line-2);
    border-radius: 4px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.45);
    padding: 0 6px;
    font-family: var(--mono);
    color: var(--txt-dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    pointer-events: none;
  }
  .ce-sig.inline {
    border: none;
    box-shadow: none;
  }
  /* The name in the text's own colour, so blue is free for a parameter; each parameter in the colour
     it has under its argument and in the Values sidebar (scripting/paramColours.js), grey when it
     has none; the one being typed underlined. */
  .ce-sig-name { color: var(--txt); }
  .ce-sig-param { color: var(--txt-faint); }
  .ce-sig-param.c-blue { color: var(--blue); }
  .ce-sig-param.c-amber { color: var(--amber); }
  .ce-sig-param.c-green { color: var(--accent); }
  .ce-sig-param.active { font-weight: 700; text-decoration: underline; text-underline-offset: 3px; }
  .ce-sig-param.active:not([class*='c-']) { color: var(--txt); }

  /* autocomplete popup */
  .ce-ac {
    position: fixed;
    z-index: 61;
    min-width: 240px;
    max-width: 420px;
    max-height: 240px;
    overflow-y: auto;
    background: var(--panel-2);
    border: 1px solid var(--line-2);
    border-radius: 7px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.55);
    padding: 4px;
    font-family: 'Archivo', system-ui, sans-serif;
  }
  .ce-ac-row {
    display: flex; align-items: center; gap: 8px;
    padding: 4px 7px; border-radius: 5px; cursor: pointer;
  }
  .ce-ac-row.sel { background: var(--accent-dim); }
  .ce-ac-kind {
    flex-shrink: 0; width: 16px; height: 16px; border-radius: 4px;
    display: inline-flex; align-items: center; justify-content: center;
    font-family: var(--mono); font-size: 11px; font-weight: 700;
    background: var(--bg-2); color: var(--txt-dim);
  }
  .ce-ac-kind.function { color: var(--blue); }
  .ce-ac-kind.variable, .ce-ac-kind.parameter { color: var(--accent); }
  .ce-ac-kind.keyword { color: #c98be0; }
  .ce-ac-kind.property { color: var(--amber); }
  /* a value's choice is a string, in the colour the editor's dark theme gives strings (the list is
     outside .ce, so its --ce-str is not there to read) */
  .ce-ac-kind.value { color: #9ed4a8; }
  .ce-ac-label { font-family: var(--mono); font-size: 12px; color: var(--txt); flex-shrink: 0; }
  .ce-ac-detail {
    font-size: 11px; color: var(--txt-faint); margin-left: auto;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .ce-ac-row.sel .ce-ac-label, .ce-ac-row.sel .ce-ac-detail { color: #eafff5; }

  /* go to symbol palette */
  .ce-so-backdrop { position: fixed; inset: 0; z-index: 62; background: rgba(0, 0, 0, 0.25); }
  .ce-so {
    position: fixed;
    z-index: 63;
    max-height: 60vh;
    display: flex;
    flex-direction: column;
    background: var(--panel-2);
    border: 1px solid var(--line-2);
    border-radius: 9px;
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.6);
    overflow: hidden;
    font-family: 'Archivo', system-ui, sans-serif;
  }
  .ce-so-input {
    border: 0; border-bottom: 1px solid var(--line); outline: none;
    background: var(--bg-2); color: var(--txt);
    padding: 9px 12px; font-size: 13px; font-family: var(--mono);
  }
  .ce-so-list { overflow-y: auto; padding: 4px; }
  .ce-so-empty { padding: 16px; text-align: center; color: var(--txt-faint); font-size: 12px; }
  .ce-so-row { display: flex; align-items: center; gap: 8px; padding: 5px 8px; border-radius: 5px; cursor: pointer; }
  .ce-so-row.sel { background: var(--accent-dim); }
  .ce-so-name { font-family: var(--mono); font-size: 12px; color: var(--txt); flex-shrink: 0; }
  .ce-so-detail { font-size: 11px; color: var(--txt-faint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ce-so-line { margin-left: auto; font-size: 11px; color: var(--txt-faint); font-variant-numeric: tabular-nums; }
  .ce-so-row.sel .ce-so-name, .ce-so-row.sel .ce-so-detail, .ce-so-row.sel .ce-so-line { color: #eafff5; }
</style>
