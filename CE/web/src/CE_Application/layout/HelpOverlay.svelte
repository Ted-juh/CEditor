<script>
  // HelpOverlay — the documentation, from inside the program.
  //
  // The completeness review's phrasing: "the scripting manual/cookbook/getting-started are
  // invisible from inside the app." A program with four designers in it shipped with an F1
  // shortcut list as its only help, while nineteen thousand words of manual sat in a repository
  // the user does not have.
  //
  // Three parts, and only one of them has any logic: the index (which document), the search
  // (`utils/helpSearch.js`), and the page (`utils/markdown.js`). The documents themselves are
  // baked in by `scripts/generate-help-bundle.mjs`, because this runs from a file:// bundle in
  // WebView2 and the sources live outside CE/web.

  import { documentOutline, renderMarkdown } from '../utils/markdown.js';
  import { searchHelp } from '../utils/helpSearch.js';

  let { show = false, onclose = () => {} } = $props();

  // The bundle is 124 KB of documentation and is loaded on first open, not at startup. Everything
  // in the eager entry chunk is parsed on every launch whether it is used or not, and help is the
  // clearest case in the app of something most sessions never touch. `main` is already the largest
  // chunk and the build config's note says approaching its limit is the thing worth investigating.
  let bundle = $state(null);
  let loadFailed = $state(false);

  $effect(() => {
    if (!show || bundle || loadFailed) return;
    import('../generated/helpDocs.js')
      .then((module) => { bundle = module; })
      .catch(() => { loadFailed = true; });
  });

  let docs = $derived(bundle?.HELP_DOCS ?? []);
  let sections = $derived(bundle?.HELP_SECTIONS ?? []);
  let gaps = $derived(bundle?.HELP_GAPS ?? []);

  let selectedId = $state('');
  let query = $state('');
  let contentEl = $state(null);

  let doc = $derived(docs.find((d) => d.id === selectedId) ?? docs[0] ?? null);
  let html = $derived(doc ? renderMarkdown(doc.text) : '');
  let outline = $derived(doc ? documentOutline(doc.text, { maxLevel: 2 }) : []);
  let results = $derived(query.trim().length >= 2 ? searchHelp(docs, query) : null);

  const docsIn = (section) => docs.filter((d) => d.section === section);

  function open(id, slug = null) {
    selectedId = id;
    // After the new document has rendered, not before it — otherwise the anchor being scrolled to
    // belongs to the document being replaced.
    queueMicrotask(() => requestAnimationFrame(() => {
      if (slug) contentEl?.querySelector(`#${CSS.escape(slug)}`)?.scrollIntoView({ block: 'start' });
      else contentEl?.scrollTo?.({ top: 0 });
    }));
  }

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) onclose();
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') { e.preventDefault(); onclose(); }
  }
</script>

<svelte:window onkeydown={(e) => { if (show) handleKeyDown(e); }} />

{#if show}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="overlay-backdrop" onclick={handleBackdropClick}>
    <div class="overlay-panel">
      <div class="overlay-header">
        <span class="overlay-title">Documentation</span>
        <input class="search" type="search" placeholder="Search all documents…" bind:value={query} />
        <button class="close-btn" onclick={onclose} aria-label="Close">&times;</button>
      </div>

      <div class="overlay-body">
        <nav class="index">
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
                  <button class="doc" class:active={entry.id === selectedId} onclick={() => open(entry.id)}>
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

        <article class="content" bind:this={contentEl}>
          {#if doc}
            <!-- Safe by construction: renderMarkdown escapes its input before emitting any tag,
                 and filters hrefs to http(s) and in-page anchors. See utils/markdown.js. -->
            {@html html}
          {:else if loadFailed}
            <p>The documentation bundle could not be loaded in this build.</p>
          {:else}
            <p class="loading">Loading…</p>
          {/if}
        </article>
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay-backdrop {
    position: fixed; inset: 0; background: rgba(0, 0, 0, 0.6); z-index: 9999;
    display: flex; align-items: center; justify-content: center;
  }

  .overlay-panel {
    background: #2D2D2D; border: 1px solid #444; border-radius: 8px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    width: 92%; max-width: 1100px; height: 86vh;
    display: flex; flex-direction: column;
  }

  .overlay-header {
    display: flex; align-items: center; gap: 12px;
    padding: 8px 12px; border-bottom: 1px solid #3A3A3A;
  }
  .overlay-title { color: #DDD; font-size: 13px; font-weight: 600; }

  .search {
    flex: 1; background: #1A1A1A; border: 1px solid #444; border-radius: 4px;
    color: #DDD; padding: 4px 8px; font-size: 12px; font-family: inherit;
  }
  .search:focus { outline: none; border-color: #5B9BD5; }

  .close-btn {
    background: none; border: none; color: #888;
    font-size: 20px; cursor: pointer; padding: 0 4px; line-height: 1;
  }
  .close-btn:hover { color: #FFF; }

  .overlay-body { flex: 1; display: grid; grid-template-columns: 280px 1fr; min-height: 0; }

  .index {
    border-right: 1px solid #3A3A3A; overflow-y: auto; padding: 10px 8px;
  }
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
    overflow-y: auto; padding: 18px 28px; color: #C8C8C8;
    font-size: 13px; line-height: 1.6; user-select: text;
  }

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
  .content :global(p) { margin: 0 0 10px; }
  .content :global(ul), .content :global(ol) { margin: 0 0 10px; padding-left: 22px; }
  .content :global(li) { margin-bottom: 4px; }
  .content :global(a) { color: #7FB3E0; }
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
