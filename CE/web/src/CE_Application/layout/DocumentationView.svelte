<script module>
  // Kept across mounts. The editor's canvas area re-mounts its content on every tab switch (the
  // {#key} in EditorCanvas.svelte), so anything the reader would expect to find again — which
  // document, where in it, what they searched for — cannot live in the component.
  const scrollByDoc = new Map();
  let lastSelectedId = '';
  let lastQuery = '';
  let lastHandledRequest = 0;
  let lastIndexWidth = 0;
</script>

<script>
  // DocumentationView — the documentation, from inside the program.
  //
  // The completeness review's phrasing: "the scripting manual/cookbook/getting-started are
  // invisible from inside the app." A program with four designers in it shipped with an F1
  // shortcut list as its only help, while nineteen thousand words of manual sat in a repository
  // the user does not have.
  //
  // It was a modal overlay first: a box over the editor that could be neither moved nor resized,
  // and that hid what the reader was reading about. It is a page now, shown in two places —
  // an editor tab (EditorCanvas.svelte) and a native window of its own (HelpWindow.svelte) — and
  // the place is the caller's business: `placeAction` is the one button that moves it.
  //
  // Three parts, and only one of them has any logic: the index (which document), the search
  // (`utils/helpSearch.js`), and the page (`utils/markdown.js`). The documents themselves are
  // baked in by `scripts/generate-help-bundle.mjs`, because this runs from a bundle inside the
  // WebView and the sources live outside CE/web.
  //
  // LINKS. A link to a section of this document or of another shipped document is followed here
  // (`followLink`); only an outside page goes to the browser. See `linkTag` in utils/markdown.js
  // for what that used to get wrong.

  import { tick, untrack } from 'svelte';
  import ArrowLeft from 'lucide-svelte/icons/arrow-left';
  import { documentOutline, renderMarkdown } from '../utils/markdown.js';
  import { searchHelp } from '../utils/helpSearch.js';
  import { helpLinkResolver } from '../utils/helpLinks.js';
  import { readStoredJson, writeStoredJson } from '../utils/localStorageState.js';

  let {
    /** `{ doc, anchor, n }`: show `doc` at `anchor` whenever `n` changes. */
    request = { doc: '', anchor: '', n: 0 },
    /** Told the id of the document on screen, whenever it changes. */
    ondocument = () => {},
    /** `{ label, title, icon, run(position) }`: the button that moves the manual elsewhere. */
    placeAction = null,
  } = $props();

  const INDEX_WIDTH_KEY = 'ce.help.indexWidth';
  const INDEX_WIDTH_MIN = 180;
  const INDEX_WIDTH_MAX = 520;

  // The bundle is about 780 KB of documentation and is loaded on first open, not at startup. Everything
  // in the eager entry chunk is parsed on every launch whether it is used or not, and help is the
  // clearest case in the app of something most sessions never touch. `main` is already the largest
  // chunk and the build config's note says approaching its limit is the thing worth investigating.
  let bundle = $state(null);
  let loadFailed = $state(false);

  import('../generated/helpDocs.js')
    .then((module) => { bundle = module; })
    .catch(() => { loadFailed = true; });

  let docs = $derived(bundle?.HELP_DOCS ?? []);
  let sections = $derived(bundle?.HELP_SECTIONS ?? []);
  let gaps = $derived(bundle?.HELP_GAPS ?? []);
  let resolveLink = $derived(helpLinkResolver(docs));

  // The first document: where this viewer was last, else what the first request names. Read once,
  // on purpose — later requests are followed by the effect below, not by this initial value.
  let selectedId = $state(untrack(() => lastSelectedId || request?.doc || ''));
  let query = $state(lastQuery);
  let contentEl = $state(null);
  let searchEl = $state(null);
  /** Where "Back" goes: `{ doc, scrollTop }`, most recent last. */
  let backStack = $state([]);
  let indexWidth = $state(clampIndexWidth(lastIndexWidth || readStoredJson(INDEX_WIDTH_KEY, 280)));

  let doc = $derived(docs.find((d) => d.id === selectedId) ?? docs[0] ?? null);
  let html = $derived(doc ? renderMarkdown(doc.text, { resolveLink }) : '');
  let outline = $derived(doc ? documentOutline(doc.text, { maxLevel: 2 }) : []);
  let results = $derived(query.trim().length >= 2 ? searchHelp(docs, query) : null);

  const docsIn = (section) => docs.filter((d) => d.section === section);

  function clampIndexWidth(value) {
    const n = Number(value);
    return Math.min(INDEX_WIDTH_MAX, Math.max(INDEX_WIDTH_MIN, Number.isFinite(n) ? n : 280));
  }

  // Report the document on screen, and remember it for the next mount.
  $effect(() => {
    const id = doc?.id ?? '';
    if (!id) return;
    lastSelectedId = id;
    ondocument(id);
  });

  $effect(() => { lastQuery = query; });

  // Follow a request — Help → Documentation, a link from elsewhere in the program, or the window
  // being opened on a document. Once the bundle is here; and only a request this view has not
  // already followed, so switching back to the tab returns to where the reader was.
  //
  // Only the request's count is watched. The store behind it also follows the document on screen
  // (noteDocumentShown), and reacting to that would scroll the page back the moment a link moved it.
  let requestCount = $derived(request?.n ?? 0);
  let settled = false;
  $effect(() => {
    const n = requestCount;
    if (!bundle) return;
    untrack(() => {
      if (n !== lastHandledRequest) {
        lastHandledRequest = n;
        show(request?.doc || selectedId, request?.anchor || null, { restore: !settled });
      } else if (!settled) {
        restoreScroll();
      }
      settled = true;
    });
  });

  function afterRender(fn) {
    // After the new document has rendered, not before it — otherwise the anchor being scrolled to
    // belongs to the document being replaced.
    tick().then(() => requestAnimationFrame(fn));
  }

  function rememberScroll() {
    if (contentEl && doc) scrollByDoc.set(doc.id, contentEl.scrollTop);
  }

  // Both of these read the place to return to BEFORE the page changes: the scroll events a
  // re-render fires (a shorter document clamps the position) would otherwise overwrite it first.
  function restoreScroll() {
    const place = scrollByDoc.get(doc?.id) ?? 0;
    afterRender(() => { if (contentEl) contentEl.scrollTop = place; });
  }

  function scrollToSlug(slug) {
    const target = slug ? contentEl?.querySelector(`#${CSS.escape(slug)}`) : null;
    if (!target) { if (contentEl) contentEl.scrollTop = 0; return; }
    // Not scrollIntoView: it scrolls every ancestor that can, and in the editor that includes
    // containers whose overflow is hidden — the whole layout would shift to show a heading.
    contentEl.scrollTop += target.getBoundingClientRect().top - contentEl.getBoundingClientRect().top - 10;
    // A jump into the middle of a long page is easy to lose; the heading it landed on says so.
    target.classList.remove('help-target');
    void target.offsetWidth;
    target.classList.add('help-target');
  }

  /** Show `id`, at `slug` when given, else where the reader last was in it (or at the top). */
  function show(id, slug = null, { restore = false, top = false } = {}) {
    const known = docs.some((d) => d.id === id) ? id : (docs[0]?.id ?? '');
    const same = known === doc?.id;
    if (!same) rememberScroll();
    const place = top ? 0 : (scrollByDoc.get(known) ?? 0);
    selectedId = known;
    afterRender(() => {
      if (slug) scrollToSlug(slug);
      // The document already on screen stays where it is, unless the page has just been built.
      else if ((restore || top || !same) && contentEl) contentEl.scrollTop = place;
    });
  }

  /** The index, search and outline: a choice, not a jump, so nothing goes on the Back stack. */
  function open(id, slug = null) {
    show(id, slug ?? '');
  }

  /** A link in the page: a jump the reader may want to come back from. */
  function followLink(id, slug) {
    if (doc) backStack = [...backStack, { doc: doc.id, scrollTop: contentEl?.scrollTop ?? 0 }].slice(-50);
    // A link to a document, not to a place in it, opens at its beginning.
    show(id, slug || '', { top: !slug });
  }

  function goBack() {
    const last = backStack.at(-1);
    if (!last) return;
    backStack = backStack.slice(0, -1);
    rememberScroll();
    selectedId = last.doc;
    afterRender(() => { if (contentEl) contentEl.scrollTop = last.scrollTop; });
  }

  function handleContentClick(e) {
    const link = e.target?.closest?.('a');
    if (!link || !contentEl?.contains(link)) return;
    const targetDoc = link.dataset.helpDoc;
    const anchor = link.dataset.helpAnchor;
    // An outside page: left to the WebView, which hands it to the browser (TrustedWebBrowser.h).
    if (targetDoc === undefined && anchor === undefined) return;
    e.preventDefault();
    followLink(targetDoc || doc?.id, anchor);
  }

  function handleContentAuxClick(e) {
    // A middle-click on a link inside the manual asks for a new window on the app's own origin,
    // which nothing outside the app can show. Followed here instead, like a plain click.
    if (e.button === 1) handleContentClick(e);
  }

  /** The document and the section at the top of the page, for moving the manual elsewhere. */
  function currentPosition() {
    if (!doc) return { doc: selectedId, anchor: '' };
    let anchor = '';
    if (contentEl) {
      const top = contentEl.getBoundingClientRect().top;
      for (const heading of contentEl.querySelectorAll('h1[id], h2[id], h3[id], h4[id]')) {
        if (heading.getBoundingClientRect().top - top <= 12) anchor = heading.id;
        else break;
      }
    }
    return { doc: doc.id, anchor };
  }

  function handleKeyDown(e) {
    if (e.altKey && e.key === 'ArrowLeft' && backStack.length) { e.preventDefault(); goBack(); return; }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      e.stopPropagation();
      searchEl?.focus();
      searchEl?.select();
    }
  }

  function handleSearchKeyDown(e) {
    if (e.key === 'Escape' && query) { e.preventDefault(); e.stopPropagation(); query = ''; }
  }

  // --- the index's width ---------------------------------------------------------------------
  let resizing = null;

  function startResize(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    resizing = { startX: e.clientX, startWidth: indexWidth };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function moveResize(e) {
    if (!resizing) return;
    indexWidth = clampIndexWidth(resizing.startWidth + e.clientX - resizing.startX);
  }

  function endResize() {
    if (!resizing) return;
    resizing = null;
    lastIndexWidth = indexWidth;
    writeStoredJson(INDEX_WIDTH_KEY, indexWidth);
  }

  function handleResizeKey(e) {
    const step = e.shiftKey ? 40 : 10;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      indexWidth = clampIndexWidth(indexWidth + (e.key === 'ArrowRight' ? step : -step));
      lastIndexWidth = indexWidth;
      writeStoredJson(INDEX_WIDTH_KEY, indexWidth);
    }
  }
</script>

<!-- The keys are the page's own (Ctrl+F, Alt+Left), taken from whatever inside it has focus. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="documentation-view" role="document" onkeydown={handleKeyDown}>
  <div class="doc-header">
    <span class="doc-heading">Documentation</span>
    <button class="header-btn" disabled={!backStack.length} onclick={goBack}
            title="Back to where the last link was clicked (Alt+Left)" aria-label="Back">
      <ArrowLeft size={14} />
    </button>
    <input class="search" type="search" placeholder="Search all documents…  (Ctrl+F)"
           bind:value={query} bind:this={searchEl} onkeydown={handleSearchKeyDown} />
    {#if placeAction}
      <button class="header-btn place" title={placeAction.title} onclick={() => placeAction.run(currentPosition())}>
        {#if placeAction.icon}<placeAction.icon size={14} />{/if}
        <span>{placeAction.label}</span>
      </button>
    {/if}
  </div>

  <div class="doc-body" style="grid-template-columns: {indexWidth}px 5px 1fr;">
    <nav class="index" aria-label="Documents">
      {#if results}
        <div class="result-count">
          {results.total} match{results.total === 1 ? '' : 'es'}
          {#if results.total === 0}<span class="dim"> — nothing found</span>{/if}
        </div>
        {#each results.groups as group}
          <div class="group">
            <div class="group-title">{group.title}<span class="dim"> · {group.found}</span></div>
            {#each group.hits as hit}
              <button class="hit" onclick={() => open(group.id, hit.slug)}>
                {#if hit.heading}<span class="hit-heading">{hit.heading}</span>{/if}
                <span class="hit-text">{hit.text}</span>
              </button>
            {/each}
            {#if group.hidden > 0}
              <div class="hidden-note">…{group.hidden} more in this document</div>
            {/if}
          </div>
        {/each}
      {:else}
        {#each sections as section}
          <div class="group">
            <div class="group-title">{section}</div>
            {#each docsIn(section) as entry}
              <button class="doc" class:active={entry.id === doc?.id} onclick={() => open(entry.id)}>
                <span class="doc-title">{entry.title}</span>
                <span class="doc-blurb">{entry.blurb}</span>
                <span class="doc-meta">{entry.words.toLocaleString()} words · {entry.source}</span>
              </button>
            {/each}
          </div>
        {/each}

        {#if doc && outline.length > 1}
          <div class="group">
            <div class="group-title">On this page</div>
            {#each outline as item}
              <button class="anchor" style="padding-left: {(item.level - 1) * 10 + 8}px"
                      onclick={() => open(doc.id, item.slug)}>{item.title}</button>
            {/each}
          </div>
        {/if}

        <!-- Stated, not omitted: an index that lists only what exists reads as complete. -->
        {#each gaps as gap}
          <p class="gap">{gap}</p>
        {/each}
      {/if}
    </nav>

    <!-- A focusable separator is the ARIA pattern for a splitter the keyboard can move. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div class="splitter" role="separator" aria-orientation="vertical" aria-label="Resize the index"
         aria-valuenow={indexWidth} aria-valuemin={INDEX_WIDTH_MIN} aria-valuemax={INDEX_WIDTH_MAX}
         tabindex="0" onpointerdown={startResize} onpointermove={moveResize}
         onpointerup={endResize} onpointercancel={endResize} onkeydown={handleResizeKey}></div>

    <!-- The handlers only intercept links, which are focusable and answer Enter on their own. -->
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
    <article class="content" bind:this={contentEl} onclick={handleContentClick} onauxclick={handleContentAuxClick}
             onscroll={rememberScroll}>
      <div class="page">
        {#if doc}
          <!-- Safe by construction: renderMarkdown escapes its input before emitting any tag,
               and filters hrefs to http(s) and in-page anchors. See utils/markdown.js. -->
          {@html html}
        {:else if loadFailed}
          <p>The documentation bundle could not be loaded in this build.</p>
        {:else}
          <p class="loading">Loading…</p>
        {/if}
      </div>
    </article>
  </div>
</div>

<style>
  .documentation-view {
    display: flex; flex-direction: column;
    width: 100%; height: 100%; min-height: 0;
    background: #1E1E1E;
  }

  .doc-header {
    display: flex; align-items: center; gap: 8px; flex: 0 0 auto;
    padding: 6px 12px; border-bottom: 1px solid #333; background: #252526;
  }
  .doc-heading { color: #DDD; font-size: 13px; font-weight: 600; margin-right: 4px; }

  .search {
    flex: 1; max-width: 560px; background: #1A1A1A; border: 1px solid #444; border-radius: 4px;
    color: #DDD; padding: 4px 8px; font-size: 12px; font-family: inherit;
  }
  .search:focus { outline: none; border-color: #5B9BD5; }

  .header-btn {
    display: inline-flex; align-items: center; gap: 6px;
    background: #2D2D2D; border: 1px solid #444; border-radius: 4px;
    color: #BBB; font-family: inherit; font-size: 12px; cursor: pointer;
    padding: 4px 7px; line-height: 1;
  }
  .header-btn:hover:not(:disabled) { color: #FFF; border-color: #5B9BD5; }
  .header-btn:disabled { opacity: 0.35; cursor: default; }
  .header-btn.place { margin-left: auto; }

  .doc-body { flex: 1; display: grid; min-height: 0; }

  .index {
    background: #232323; overflow-y: auto; padding: 10px 8px; min-width: 0;
  }
  .splitter {
    cursor: col-resize; background: #2A2A2A; border-left: 1px solid #333; border-right: 1px solid #333;
    touch-action: none;
  }
  .splitter:hover, .splitter:focus-visible { background: #3A4551; outline: none; }

  .group { margin-bottom: 14px; }
  .group-title {
    font-size: 10px; color: #5B9BD5; text-transform: uppercase; letter-spacing: 0.5px;
    padding: 0 6px 4px; border-bottom: 1px solid #333; margin-bottom: 6px;
  }
  .dim { color: #666; text-transform: none; letter-spacing: 0; }

  .doc, .hit, .anchor {
    display: block; width: 100%; text-align: left; background: none; border: none;
    color: #BBB; font-family: inherit; cursor: pointer; border-radius: 4px;
    padding: 5px 6px; font-size: 12px;
  }
  .doc:hover, .hit:hover, .anchor:hover { background: #383838; color: #EEE; }
  .doc.active { background: #3A4551; color: #FFF; }

  .doc-title { display: block; font-weight: 600; }
  .doc-blurb { display: block; color: #8A8A8A; font-size: 11px; line-height: 1.35; margin-top: 2px; }
  .doc-meta { display: block; color: #666; font-size: 10px; margin-top: 3px; }

  .anchor { color: #9AA5B1; font-size: 11px; padding-top: 3px; padding-bottom: 3px; }

  .result-count { color: #999; font-size: 11px; padding: 2px 6px 8px; }
  .hit-heading { display: block; color: #7FB3E0; font-size: 11px; }
  .hit-text { display: block; color: #999; font-size: 11px; line-height: 1.35; margin-top: 1px; }
  .hidden-note { color: #666; font-size: 10px; padding: 2px 6px; }

  .gap {
    color: #8A8A8A; font-size: 11px; line-height: 1.5;
    background: #262626; border-left: 2px solid #6C7A86; border-radius: 3px;
    padding: 8px 10px; margin: 0 6px;
  }

  .loading { color: #777; }

  .content {
    overflow-y: auto; padding: 18px 28px; color: #C8C8C8; min-width: 0;
    font-size: 13px; line-height: 1.6; user-select: text;
  }
  /* A reading measure: a full-width tab on a wide screen would otherwise make lines too long to
     follow back to their start. Tables are allowed the width they need. */
  .page { max-width: 980px; }

  .index::-webkit-scrollbar, .content::-webkit-scrollbar { width: 8px; }
  .index::-webkit-scrollbar-track, .content::-webkit-scrollbar-track { background: transparent; }
  .index::-webkit-scrollbar-thumb, .content::-webkit-scrollbar-thumb { background: #444; border-radius: 4px; }

  /* The rendered document. `:global` because this markup comes from renderMarkdown rather than
     from this component's template, so Svelte's scoping never sees it. */
  .content :global(h1) { color: #EEE; font-size: 20px; margin: 0 0 14px; }
  .content :global(h2) {
    color: #E0E0E0; font-size: 16px; margin: 26px 0 10px;
    padding-bottom: 5px; border-bottom: 1px solid #3A3A3A;
  }
  .content :global(h3) { color: #D6D6D6; font-size: 14px; margin: 20px 0 8px; }
  .content :global(h4), .content :global(h5), .content :global(h6) {
    color: #CCC; font-size: 13px; margin: 16px 0 6px;
  }
  .content :global(:is(h1, h2, h3, h4, h5, h6)) { scroll-margin-top: 10px; border-radius: 3px; }
  .content :global(.help-target) { animation: help-target 1.4s ease-out; }
  @keyframes help-target {
    from { background: rgba(91, 155, 213, 0.28); }
    to { background: transparent; }
  }
  @media (prefers-reduced-motion: reduce) {
    .content :global(.help-target) { animation: none; }
  }
  .content :global(p) { margin: 0 0 10px; }
  .content :global(ul), .content :global(ol) { margin: 0 0 10px; padding-left: 22px; }
  .content :global(li) { margin-bottom: 4px; }
  .content :global(a) { color: #7FB3E0; }
  .content :global(a[target="_blank"])::after { content: ' ↗'; font-size: 10px; color: #6C8FB0; }
  .content :global(strong) { color: #E8E8E8; }
  .content :global(code) {
    background: #1E1E1E; border: 1px solid #3A3A3A; border-radius: 3px;
    padding: 1px 4px; font-size: 12px; color: #D7BA7D;
  }
  .content :global(pre) {
    background: #1A1A1A; border: 1px solid #333; border-radius: 4px;
    padding: 10px 12px; overflow-x: auto; margin: 0 0 12px;
  }
  .content :global(pre code) { background: none; border: none; padding: 0; color: #C8C8C8; }
  .content :global(blockquote) {
    border-left: 3px solid #4A5560; background: #262626; margin: 0 0 12px;
    padding: 8px 12px; color: #A8A8A8;
  }
  .content :global(blockquote p:last-child) { margin-bottom: 0; }
  .content :global(hr) { border: none; border-top: 1px solid #3A3A3A; margin: 20px 0; }
  .content :global(table) { border-collapse: collapse; margin: 0 0 12px; width: 100%; font-size: 12px; }
  .content :global(th), .content :global(td) {
    border: 1px solid #3A3A3A; padding: 5px 8px; text-align: left; vertical-align: top;
  }
  .content :global(th) { background: #333; color: #DDD; }
  .content :global(del) { color: #777; }
</style>
