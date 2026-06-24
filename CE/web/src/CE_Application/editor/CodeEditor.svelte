<script>
  // CodeEditor — a dependency-free code editor for the BehaviorDesigner script area.
  // A transparent <textarea> drives all editing/caret/clipboard behaviour; a synced
  // highlight <pre> sits behind it and a line-number gutter to its left. On top of the
  // plain textarea it adds: line numbers, JS/Lua syntax highlighting, current-line
  // highlight, smart Tab/auto-indent, bracket & quote auto-closing, comment toggle,
  // find & replace, and font zoom. Native textarea undo/redo and copy/paste are kept
  // intact by routing every programmatic edit through document.execCommand('insertText').
  import { tick } from 'svelte';
  import { highlight, lineCommentToken } from './codeHighlight.js';

  let {
    value = '',
    language = 'lua',
    oninput = null,
    onrun = null,
    placeholder = '',
    minHeight = 240,
  } = $props();

  let taEl = $state(null);       // the editable textarea (the source of truth for editing)
  let scrollTop = $state(0);
  let scrollLeft = $state(0);
  let caretLine = $state(0);
  let fontSize = $state(13);

  const PAD_TOP = 10;
  const PAD_LEFT = 4;            // gap between gutter and code start
  let lineHeight = $derived(Math.round(fontSize * 1.6));
  let lines = $derived(value.split('\n'));
  let lineCount = $derived(lines.length);
  let gutterDigits = $derived(String(lineCount).length);
  let highlighted = $derived(highlight(value, language));
  // A trailing newline collapses in <pre>; pad so the highlight layer matches the textarea height.
  let highlightedSafe = $derived(highlighted + (value.endsWith('\n') ? '\n' : ''));

  const CLOSERS = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`' };
  const OPENERS = new Set(Object.keys(CLOSERS));

  function emit() { oninput?.(taEl.value); }

  function onScroll() {
    scrollTop = taEl.scrollTop;
    scrollLeft = taEl.scrollLeft;
  }

  function syncCaret() {
    if (!taEl) return;
    caretLine = countLines(taEl.value.slice(0, taEl.selectionStart));
  }

  function countLines(s) { let n = 0; for (let i = 0; i < s.length; i++) if (s[i] === '\n') n++; return n; }

  // Replace [start,end) with text, preserving the native undo stack, then optionally
  // reselect [selStart,selEnd]. Fires the textarea input path so the parent stays in sync.
  function applyEdit(start, end, text, selStart, selEnd) {
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

  function onKeydown(e) {
    const ta = taEl;
    const v = ta.value;
    const start = ta.selectionStart, end = ta.selectionEnd;
    const mod = e.ctrlKey || e.metaKey;

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
    const ln = countLines(taEl.value.slice(0, m[0]));
    const top = ln * lineHeight;
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
    const start = taEl.selectionStart, end = taEl.selectionEnd;
    applyEdit(start, end, text, start + text.length);
    await tick();
    taEl.focus();
  }
  export function focus() { taEl?.focus(); }
</script>

<div class="ce" style="--ce-fs:{fontSize}px; --ce-lh:{lineHeight}px; --ce-pad-top:{PAD_TOP}px; --ce-gw:{gutterDigits}ch; min-height:{minHeight}px">
  <div class="ce-gutter" aria-hidden="true">
    <div class="ce-gutter-inner" style="transform:translateY({-scrollTop}px)">
      {#each lines as _, i (i)}
        <div class={['ce-gln', i === caretLine && 'active']}>{i + 1}</div>
      {/each}
    </div>
  </div>

  <div class="ce-area">
    <div class="ce-activeline" style="top:{PAD_TOP + caretLine * lineHeight - scrollTop}px; height:{lineHeight}px"></div>
    <pre class="ce-hl" aria-hidden="true" style="transform:translate({-scrollLeft}px, {-scrollTop}px)">{@html highlightedSafe}</pre>
    <textarea
      class="ce-ta"
      bind:this={taEl}
      {value}
      {placeholder}
      spellcheck="false"
      autocomplete="off"
      autocapitalize="off"
      autocorrect="off"
      wrap="off"
      oninput={() => { emit(); syncCaret(); }}
      onscroll={onScroll}
      onkeydown={onKeydown}
      onkeyup={syncCaret}
      onclick={syncCaret}
      onfocus={syncCaret}
    ></textarea>
  </div>

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
</div>

<style>
  .ce {
    position: relative;
    display: flex;
    width: 100%;
    background: #0a0c10;
    border: 1px solid var(--line-2);
    border-radius: 8px;
    overflow: hidden;
    font-family: var(--mono);
    font-size: var(--ce-fs);
    line-height: var(--ce-lh);
    resize: vertical;
  }

  .ce-gutter {
    position: relative;
    flex-shrink: 0;
    width: calc(var(--ce-gw) + 22px);
    overflow: hidden;
    background: #080a0d;
    border-right: 1px solid var(--line);
    user-select: none;
  }
  .ce-gutter-inner { position: absolute; top: 0; left: 0; right: 0; padding-top: var(--ce-pad-top); will-change: transform; }
  .ce-gln {
    height: var(--ce-lh);
    line-height: var(--ce-lh);
    padding-right: 8px;
    text-align: right;
    color: var(--txt-faint);
    font-variant-numeric: tabular-nums;
  }
  .ce-gln.active { color: var(--txt-dim); }

  .ce-area { position: relative; flex: 1; min-width: 0; overflow: hidden; }

  .ce-activeline {
    position: absolute;
    left: 0; right: 0;
    background: rgba(255, 255, 255, 0.04);
    pointer-events: none;
    z-index: 0;
  }

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
    color: #cfe3d8;
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
    caret-color: #cfe3d8;
    resize: none;
    overflow: auto;
    outline: none;
    z-index: 2;
  }
  .ce-ta::selection { background: rgba(90, 155, 240, 0.35); }
  .ce-ta::placeholder { color: var(--txt-faint); }

  /* token colours — tuned for the dark #0a0c10 surface */
  .ce-hl :global(.tok-com) { color: #5b6b5f; font-style: italic; }
  .ce-hl :global(.tok-str) { color: #9ed4a8; }
  .ce-hl :global(.tok-num) { color: #e0a23c; }
  .ce-hl :global(.tok-kw)  { color: #5a9bf0; }
  .ce-hl :global(.tok-lit) { color: #c98be0; }
  .ce-hl :global(.tok-bi)  { color: #4dd6a0; }

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
</style>
