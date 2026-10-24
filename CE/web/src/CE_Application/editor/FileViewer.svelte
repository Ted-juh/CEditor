<script>
  // FileViewer — a long text to read: the panel file view's whole file (GAIA: 71,000 lines, 3 MB).
  //
  // Only the lines on screen are drawn, in the code editor's colours, and a spacer as tall as the text
  // gives the scrollbar its length. There is no textarea: a browser lays out all of a textarea's text
  // before it shows any of it, which for GAIA's file was two and a half seconds, and this text is not
  // edited here. So selecting and copying work over what is drawn, the keyboard scrolls, and find
  // (Ctrl+F) is this component's own, over the whole text.
  //
  // `oncurrent(line)` says which line (from 1) the reader is at: the line they clicked or, once they
  // scroll, the top line on screen. revealLine(line) brings a line to the top and makes it current.
  import { onMount, tick } from 'svelte';
  import { highlight } from './codeHighlight.js';
  import { lineAt, lineStartsOf } from '../utils/lineIndex.js';

  let { text = '', language = 'json', oncurrent = null } = $props();

  const PAD = 10;            // above the first line and below the last, as in the code editor
  const PAD_L = 4;
  const FONT_SIZE = 13;
  const LINE_HEIGHT = Math.round(FONT_SIZE * 1.6);
  const STEP = 40;           // the drawn window moves in steps of this many lines…
  const MARGIN = 60;         // …and reaches this far past the screen on each side
  const MAX_MATCHES = 10000;

  // The code editor's theme, which its ☾/☀ button keeps.
  const theme = (() => { try { return localStorage.getItem('ce-theme') === 'light' ? 'light' : 'dark'; } catch { return 'dark'; } })();

  let scroller = $state(null);
  let spacer = $state(null);
  let measureEl = $state(null);
  let findInput = $state(null);
  let scrollTop = $state(0);
  let viewH = $state(600);
  let charWidth = $state(7.8);
  let current = $state(1);
  let pinnedTop = null;      // where revealLine put the scroll, so that scroll does not move `current`

  let starts = $derived(lineStartsOf(text));
  let lineCount = $derived(starts.length);
  let longest = $derived.by(() => {
    let max = 0;
    for (let i = 0; i < starts.length; i++) {
      const end = i + 1 < starts.length ? starts[i + 1] - 1 : text.length;
      if (end - starts[i] > max) max = end - starts[i];
    }
    return max;
  });
  let firstRow = $derived(Math.max(0, Math.floor(Math.max(0, (scrollTop - PAD) / LINE_HEIGHT) / STEP) * STEP - MARGIN));
  let lastRow = $derived(Math.min(lineCount, firstRow + Math.ceil(viewH / LINE_HEIGHT) + STEP + 2 * MARGIN));
  let windowStart = $derived(starts[firstRow] ?? 0);
  let windowEnd = $derived(lastRow < lineCount ? starts[lastRow] - 1 : text.length);
  let highlighted = $derived(highlight(text.slice(windowStart, windowEnd), language));
  let rows = $derived(Array.from({ length: lastRow - firstRow }, (_, i) => firstRow + i));

  $effect(() => { oncurrent?.(current); });

  onMount(() => {
    if (measureEl) charWidth = measureEl.getBoundingClientRect().width / 10 || charWidth;
    const resize = new ResizeObserver(() => { if (scroller) viewH = scroller.clientHeight; });
    if (scroller) { resize.observe(scroller); viewH = scroller.clientHeight; }
    return () => resize.disconnect();
  });

  function onScroll() {
    scrollTop = scroller.scrollTop;
    if (pinnedTop !== null && Math.abs(scroller.scrollTop - pinnedTop) < 1) return;
    pinnedTop = null;
    // The first line more than half on screen.
    current = Math.min(lineCount, Math.floor(Math.max(0, scroller.scrollTop - PAD + LINE_HEIGHT / 2) / LINE_HEIGHT) + 1);
  }

  function lineAtClient(clientY) {
    const top = spacer.getBoundingClientRect().top;
    return Math.max(1, Math.min(lineCount, Math.floor((clientY - top - PAD) / LINE_HEIGHT) + 1));
  }

  /** Bring `line` (from 1) to the top of the view, and make it the current line. */
  export function revealLine(line) {
    if (!scroller) return;
    const at = Math.max(1, Math.min(lineCount, Math.floor(line) || 1));
    // Flush with the top edge (the first line keeps the padding above it).
    scroller.scrollTop = at > 1 ? PAD + (at - 1) * LINE_HEIGHT : 0;
    pinnedTop = scroller.scrollTop;
    scrollTop = scroller.scrollTop;
    current = at;
    scroller.focus({ preventScroll: true });
  }

  export function focus() { scroller?.focus({ preventScroll: true }); }

  // ----- find -----
  let showFind = $state(false);
  let findText = $state('');
  let matchCase = $state(false);
  let activeMatch = $state(-1);
  let findFrom = 1;          // the line a search starts from: where find was opened, or last clicked
  let lowerText = $derived(text.toLowerCase());
  let matches = $derived.by(() => {
    if (!findText) return [];
    const hay = matchCase ? text : lowerText;
    const needle = matchCase ? findText : findText.toLowerCase();
    const out = [];
    for (let at = hay.indexOf(needle); at !== -1 && out.length < MAX_MATCHES; at = hay.indexOf(needle, at + needle.length)) out.push(at);
    return out;
  });
  // The matches in the drawn lines, placed.
  let marks = $derived.by(() => {
    const out = [];
    let lo = 0, hi = matches.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (matches[mid] < windowStart) lo = mid + 1; else hi = mid; }
    for (let i = lo; i < matches.length && matches[i] < windowEnd; i++) {
      const line = lineAt(starts, matches[i]);
      out.push({ i, top: PAD + line * LINE_HEIGHT, left: PAD_L + (matches[i] - starts[line]) * charWidth });
    }
    return out;
  });

  async function openFind() {
    showFind = true;
    findFrom = current;
    const selected = window.getSelection()?.toString() ?? '';
    if (selected && !selected.includes('\n')) findText = selected;
    await tick();
    findInput?.focus();
    findInput?.select();
    if (findText) fromCurrent();
  }
  function closeFind() { showFind = false; activeMatch = -1; focus(); }

  // The first match at or after the line the search starts from. Not the current line: each match
  // shown moves that, and typing a longer word would otherwise search on from the last one.
  function fromCurrent() {
    if (!matches.length) { activeMatch = -1; return; }
    const from = starts[findFrom - 1] ?? 0;
    const next = matches.findIndex((at) => at >= from);
    showMatch(next === -1 ? 0 : next);
  }
  function step(dir) {
    if (!matches.length) return;
    showMatch(activeMatch < 0 ? 0 : (activeMatch + dir + matches.length) % matches.length);
  }
  function showMatch(index) {
    activeMatch = index;
    const at = matches[index];
    const line = lineAt(starts, at);
    // A third of the way down, so what comes before it shows too.
    const top = Math.max(0, line * LINE_HEIGHT - viewH / 3);
    if (line * LINE_HEIGHT < scroller.scrollTop || (line + 2) * LINE_HEIGHT > scroller.scrollTop + viewH) scroller.scrollTop = top;
    const x = PAD_L + (at - starts[line]) * charWidth;
    if (x < scroller.scrollLeft || x > scroller.scrollLeft + scroller.clientWidth - 40) scroller.scrollLeft = Math.max(0, x - 80);
    pinnedTop = scroller.scrollTop;
    scrollTop = scroller.scrollTop;
    current = line + 1;
  }

  function onKeydown(e) {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && (e.key === 'f' || e.key === 'F')) { e.preventDefault(); openFind(); return; }
    if (e.key === 'F3') { e.preventDefault(); if (!showFind) openFind(); else step(e.shiftKey ? -1 : 1); return; }
    if (e.key === 'Escape' && showFind) { e.preventDefault(); closeFind(); }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class={['fv', theme === 'light' && 'light']} style="--fv-lh:{LINE_HEIGHT}px; --fv-fs:{FONT_SIZE}px; --fv-pad:{PAD}px; --fv-gw:{String(lineCount).length}ch"
  onkeydown={onKeydown} data-testid="file-viewer">
  <div class="fv-gutter" aria-hidden="true">
    <div class="fv-gutter-inner" style="transform:translateY({firstRow * LINE_HEIGHT - scrollTop}px)">
      {#each rows as i (i)}
        <div class={['fv-gln', i + 1 === current && 'active']}>{i + 1}</div>
      {/each}
    </div>
  </div>

  <!-- The scroller takes a tab stop so the file can be scrolled from the keyboard (a scrollable
       region nobody can focus cannot be read without a mouse). Its mouseup only notes which line
       was clicked; nothing is activated by it. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <div class="fv-scroll" bind:this={scroller} onscroll={onScroll} tabindex="0" role="document"
    aria-label="The whole file, to read"
    onmouseup={(e) => {
      // A click in the text, not the end of a drag on the scrollbar (whose target is the scroller).
      if (e.button === 0 && e.target !== scroller) { pinnedTop = scroller.scrollTop; current = findFrom = lineAtClient(e.clientY); }
    }}>
    <div class="fv-spacer" bind:this={spacer}
      style="height:{2 * PAD + lineCount * LINE_HEIGHT}px; width:{PAD_L + longest * charWidth + 24}px">
      <div class="fv-active" style="top:{PAD + (current - 1) * LINE_HEIGHT}px"></div>
      {#each marks as m (m.i)}
        <div class={['fv-mark', m.i === activeMatch && 'on']}
          style="top:{m.top}px; left:{m.left}px; width:{findText.length * charWidth}px"></div>
      {/each}
      <pre class="fv-lines" style="top:{PAD + firstRow * LINE_HEIGHT}px">{@html highlighted}</pre>
    </div>
  </div>

  <span class="fv-measure" bind:this={measureEl} aria-hidden="true">0000000000</span>

  {#if showFind}
    <div class="fv-find" role="search">
      <input class="fv-find-input" bind:this={findInput} placeholder="Find in the file" value={findText}
        oninput={(e) => { findText = e.target.value; fromCurrent(); }}
        onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); step(e.shiftKey ? -1 : 1); } }} />
      <span class="fv-find-count">{matches.length ? `${activeMatch + 1}/${matches.length}${matches.length >= MAX_MATCHES ? '+' : ''}` : findText ? 'No results' : ''}</span>
      <button class="fv-find-btn" title="Previous (Shift+Enter)" onclick={() => step(-1)}>↑</button>
      <button class="fv-find-btn" title="Next (Enter)" onclick={() => step(1)}>↓</button>
      <button class={['fv-find-btn', matchCase && 'on']} title="Match case"
        onclick={() => { matchCase = !matchCase; fromCurrent(); }}>Aa</button>
      <button class="fv-find-btn" title="Close (Esc)" onclick={closeFind}>✕</button>
    </div>
  {/if}
</div>

<style>
  .fv {
    --ce-bg: #0a0c10;
    --ce-gutter-bg: #080a0d;
    --ce-fg: #cfe3d8;
    --ce-active: rgba(255, 255, 255, 0.04);
    --ce-occ: rgba(224, 162, 60, 0.22);
    --ce-sel: rgba(90, 155, 240, 0.35);
    --ce-com: #5b6b5f;
    --ce-str: #9ed4a8;
    --ce-numc: #e0a23c;
    --ce-kw: #5a9bf0;
    --ce-litc: #c98be0;
    --ce-bic: #4dd6a0;
    --ce-match-bg: rgba(90, 155, 240, 0.28);
    --ce-match-ring: rgba(90, 155, 240, 0.55);
    position: relative;
    display: flex;
    flex: 1;
    min-height: 0;
    background: var(--ce-bg);
    border: 1px solid var(--line-2);
    border-radius: 8px;
    overflow: hidden;
    font-family: var(--mono);
    font-size: var(--fv-fs);
    line-height: var(--fv-lh);
  }
  .fv.light {
    --ce-bg: #fbfcfd;
    --ce-gutter-bg: #f1f3f6;
    --ce-fg: #1f2430;
    --ce-active: rgba(0, 0, 0, 0.05);
    --ce-occ: rgba(176, 104, 0, 0.2);
    --ce-sel: rgba(42, 93, 176, 0.22);
    --ce-com: #8a948c;
    --ce-str: #2e7d46;
    --ce-numc: #b06800;
    --ce-kw: #2a5db0;
    --ce-litc: #8a3fb0;
    --ce-bic: #1a8f6a;
    --ce-match-bg: rgba(42, 93, 176, 0.2);
    --ce-match-ring: rgba(42, 93, 176, 0.5);
  }
  .fv-gutter {
    position: relative; flex-shrink: 0; width: calc(var(--fv-gw) + 18px); overflow: hidden;
    background: var(--ce-gutter-bg); border-right: 1px solid var(--line); user-select: none;
  }
  .fv-gutter-inner { position: absolute; top: 0; left: 0; right: 0; padding-top: var(--fv-pad); will-change: transform; }
  .fv-gln {
    height: var(--fv-lh); padding-right: 8px; text-align: right; color: var(--txt-faint);
    font-variant-numeric: tabular-nums;
  }
  .fv-gln.active { color: var(--txt-dim); }
  .fv-scroll { position: relative; flex: 1; min-width: 0; overflow: auto; outline: none; }
  .fv-spacer { position: relative; min-width: 100%; }
  .fv-active { position: absolute; left: 0; right: 0; height: var(--fv-lh); background: var(--ce-active); pointer-events: none; }
  .fv-mark { position: absolute; height: var(--fv-lh); background: var(--ce-occ); border-radius: 2px; pointer-events: none; }
  .fv-mark.on { background: var(--ce-match-bg); box-shadow: 0 0 0 1px var(--ce-match-ring); }
  .fv-lines {
    position: absolute; left: 0; margin: 0; padding: 0 12px 0 4px; white-space: pre; tab-size: 2;
    font: inherit; line-height: inherit; color: var(--ce-fg);
  }
  .fv-lines::selection, .fv-lines :global(*::selection) { background: var(--ce-sel); }
  .fv-lines :global(.tok-com) { color: var(--ce-com); font-style: italic; }
  .fv-lines :global(.tok-str) { color: var(--ce-str); }
  .fv-lines :global(.tok-num) { color: var(--ce-numc); }
  .fv-lines :global(.tok-kw) { color: var(--ce-kw); }
  .fv-lines :global(.tok-lit) { color: var(--ce-litc); }
  .fv-lines :global(.tok-bi) { color: var(--ce-bic); }
  .fv-lines :global(.tok-key) { color: var(--ce-kw); }
  .fv-measure { position: absolute; visibility: hidden; white-space: pre; font: inherit; }
  .fv-find {
    position: absolute; top: 8px; right: 18px; z-index: 5; display: flex; align-items: center; gap: 4px;
    padding: 5px 6px; background: var(--panel-2); border: 1px solid var(--line-2); border-radius: 8px;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35); font-family: var(--font, inherit);
  }
  .fv-find-input {
    width: 200px; padding: 3px 6px; font-size: 12px; color: var(--txt); background: var(--bg);
    border: 1px solid var(--line-2); border-radius: 5px; font-family: var(--mono);
  }
  .fv-find-count { min-width: 64px; font-size: 11px; color: var(--txt-dim); text-align: center; }
  .fv-find-btn {
    min-width: 24px; height: 24px; padding: 0 5px; font-size: 12px; color: var(--txt-dim); background: none;
    border: 1px solid transparent; border-radius: 5px; cursor: pointer;
  }
  .fv-find-btn:hover { color: var(--txt); background: var(--panel); }
  .fv-find-btn.on { color: var(--accent); border-color: var(--accent-dim); }
</style>
