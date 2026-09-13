<script>
  /**
   * The Library tab.
   *
   * Candidate 6 of the display-panel plan; `docs/design/library-tab-design.md` has the argument.
   * Three things are worth knowing before editing this file.
   *
   * FIRST, THIS IS NOT A SPACE CANDIDATE, and the record says so. `CustomPackageLibrary` measures
   * 459px empty and 647px with packages, and stops there — its card grid is capped at 282px with a
   * scrollbar, so twelve saved components render in the same height as three. Building this on a
   * space argument would have been building it on nothing.
   *
   * SECOND, the case is what the two existing surfaces cannot do between them. The library section
   * shows a picture of each package and its only use action is `applyLibraryEntryToCurrent`, which
   * OVERWRITES the component you have selected — it never calls `addCustomComponentPackage`. The
   * Insert panel can place one, and shows `entries.slice(0, 6)` with no search and no picture at
   * all. So the surface with the pictures cannot place, and the surface that places shows six of
   * them blind. This tab is a component palette: every saved component, drawn by the real renderer,
   * searchable, and placed by click or drag.
   *
   * THIRD, THE PROPERTIES PANEL IS UNTOUCHED, and so is the Insert panel. `CustomPackageLibrary`
   * still draws its section and still does save, import, export and metadata — the parts of this
   * that really are a modal task. `allLibraryFieldLabels()` is ready for the day its rows come out.
   */
  import { onMount } from 'svelte';
  import Search from 'lucide-svelte/icons/search';
  import LibraryGrid from './library/LibraryGrid.svelte';
  import LibraryDetail from './library/LibraryDetail.svelte';
  import { activePanel, selectedComponentIds, resolvedActivePanelId } from '../stores/panels.js';
  import { addCustomComponentPackage, applyControlPatch, getSection } from '../stores/controls.js';
  import { flatControls } from '../utils/containment.js';
  import { deepClone } from '../utils/deepClone.js';
  import { customComponentLibrary } from '../stores/customComponentLibrary.js';
  import { customComponentPackageProvenance } from '../utils/customComponentPackage.js';
  import {
    describeLibrary,
    filterLibrary,
    sortLibrary,
    libraryCounts,
    libraryTags,
    LIBRARY_SORTS,
  } from '../utils/componentLibraryModel.js';

  let rows = $derived(describeLibrary($customComponentLibrary ?? []));
  let counts = $derived(libraryCounts(rows));
  let tags = $derived(libraryTags(rows));

  let query = $state('');
  let sort = $state('recent');
  let visible = $derived(sortLibrary(filterLibrary(rows, query), sort));

  let wantedId = $state('');
  let selectedId = $derived(visible.some((row) => row.id === wantedId) ? wantedId : (visible[0]?.id ?? ''));
  let selected = $derived(visible.find((row) => row.id === selectedId) ?? null);

  let canPlace = $derived($resolvedActivePanelId != null);

  // "Replace" targets whatever custom component is selected right now — unlike the editing tabs,
  // this one FOLLOWS the selection, because the thing it replaces is the thing you are pointing at
  // and a stale target here would overwrite the wrong component.
  let panelControls = $derived(flatControls($activePanel?.controls ?? []));
  let target = $derived.by(() => {
    const first = [...($selectedComponentIds ?? [])][0];
    if (!first) return null;
    const control = panelControls.find((entry) => entry._children?.Core?.id === first) ?? null;
    return control?._children?.PublishedProperties || control?._children?.Parts ? control : null;
  });
  let targetName = $derived(target?._children?.Core?.name ?? '');

  let status = $state('');

  onMount(() => { status = ''; });

  function place(row) {
    if (!row?.envelope || !canPlace) return;
    addCustomComponentPackage(row.envelope);
    customComponentLibrary.markUsed(row.id);
    status = `Placed ${row.name}`;
  }

  /**
   * The destructive one, kept identical to what the properties panel does — same sections skipped,
   * same provenance written. Two implementations of "load this package over that component" would
   * be two answers to what a component becomes.
   */
  function replace(row) {
    const id = target?._children?.Core?.id;
    if (!id || !row?.component?._children) return;
    const provenance = customComponentPackageProvenance(row.envelope ?? row.entry);
    const patch = {};
    for (const [section, value] of Object.entries(row.component._children)) {
      if (section === 'Transform') continue;
      if (section === 'Core') {
        patch.Core = { ...deepClone(value), id };
      } else if (section === 'Designer') {
        patch.Designer = {
          ...deepClone(value),
          sourcePackage: provenance,
          packageName: provenance?.name ?? row.name,
          packageVersion: provenance?.version ?? row.version,
          packageId: provenance?.id ?? row.id,
          packageFingerprint: provenance?.fingerprint ?? row.fingerprint,
          packageImportedAt: provenance?.importedAt ?? new Date().toISOString(),
        };
      } else {
        patch[section] = deepClone(value);
      }
    }
    applyControlPatch(id, patch);
    customComponentLibrary.markUsed(row.id);
    status = `${targetName} replaced with ${row.name}`;
  }

  function remove(row) {
    if (!row?.id) return;
    customComponentLibrary.remove(row.id);
    status = `Forgot ${row.name}`;
    wantedId = '';
  }

  function pin(row) {
    if (!row?.id) return;
    customComponentLibrary.togglePinned(row.id);
  }
</script>

<div class="library-tab">
  <div class="head">
    <span class="who">
      <b>{counts.total}</b> saved
      {#if counts.pinned}<em>{counts.pinned} pinned</em>{/if}
      {#if counts.invalid}<i class="stale" title="Packages whose own validation failed">{counts.invalid} with issues</i>{/if}
    </span>

    {#if status}<span class="status" role="status">{status}</span>{/if}

    <label class="search">
      <Search size={11} aria-hidden="true" />
      <input type="text" placeholder="Search name, author, tag" bind:value={query} aria-label="Search the library" />
    </label>

    <div class="sorts" role="tablist" aria-label="Sort">
      {#each LIBRARY_SORTS as entry (entry.key)}
        <button type="button" role="tab" class:on={sort === entry.key} aria-selected={sort === entry.key}
                title={entry.hint} onclick={() => { sort = entry.key; }}>{entry.label}</button>
      {/each}
    </div>
  </div>

  {#if !counts.total}
    <div class="empty">
      <strong>The library is empty.</strong>
      <p>
        Save a custom component from the Publish tab — Package &amp; Library — and it appears here,
        drawn by the same renderer that draws it on the canvas.
      </p>
    </div>
  {:else}
    <div class="cols">
      <div class="gridcol">
        <div class="colh">
          Components <s>{visible.length}{visible.length === rows.length ? '' : ` of ${rows.length}`}</s>
        </div>
        <LibraryGrid
          rows={visible}
          {selectedId}
          {canPlace}
          onselect={(id) => { wantedId = id; status = ''; }}
          onplace={place}
          onpin={pin}
        />
        {#if tags.length}
          <div class="tagrow">
            {#each tags.slice(0, 8) as tag (tag.tag)}
              <button type="button" class:on={query.trim().toLowerCase() === tag.tag.toLowerCase()}
                      title={`${tag.count} with this tag`}
                      onclick={() => { query = query.trim().toLowerCase() === tag.tag.toLowerCase() ? '' : tag.tag; }}>
                {tag.tag} <i>{tag.count}</i>
              </button>
            {/each}
          </div>
        {/if}
      </div>

      <div class="detailcol">
        <div class="colh">{selected?.name ?? 'Package'}</div>
        <LibraryDetail
          row={selected}
          {targetName}
          {canPlace}
          canReplace={!!target}
          onplace={place}
          onreplace={replace}
          onremove={remove}
        />
      </div>
    </div>
  {/if}
</div>

<style>
  .library-tab {
    height: 100%;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: auto;
    background: #15181B;
  }

  .head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 10px;
    border-bottom: 1px solid #2A2A2A;
    flex: 0 0 auto;
    flex-wrap: wrap;
  }

  .who {
    font: 500 9.5px/1 'IBM Plex Mono', ui-monospace, monospace;
    color: #616C75;
    white-space: nowrap;
  }
  .who b { color: #8FEDE3; font-weight: 600; }
  .who em { font-style: normal; margin-left: 6px; color: #8A949C; }
  .who .stale {
    font-style: normal;
    margin-left: 6px;
    color: #D98C8C;
    border: 1px solid #5C3A3A;
    background: #241616;
    border-radius: 2px;
    padding: 2px 4px;
  }

  .status {
    font: 400 9.5px/1 'IBM Plex Sans', system-ui, sans-serif;
    color: #8A949C;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .search {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 5px;
    height: 24px;
    padding: 0 7px;
    border: 1px solid #333;
    border-radius: 3px;
    background: #1A1A1A;
    color: #69737B;
  }
  .search input {
    width: 168px;
    border: 0;
    background: transparent;
    color: #DDD;
    font: 400 10px/1 'IBM Plex Sans', system-ui, sans-serif;
    outline: none;
  }
  .search:focus-within { border-color: #5B9BD5; }

  .sorts { display: flex; gap: 2px; }
  .sorts button {
    border: 1px solid transparent;
    background: transparent;
    color: #96A6B2;
    font: 600 9px/1 'IBM Plex Sans', system-ui, sans-serif;
    padding: 5px 8px;
    border-radius: 3px;
    cursor: pointer;
  }
  .sorts button:hover { color: #DDE6EC; }
  .sorts button.on { border-color: #5B9BD5; background: #173449; color: #EAF5FF; }

  .cols {
    display: flex;
    gap: 10px;
    padding: 10px;
    align-items: flex-start;
    min-width: 0;
    flex: 1 1 auto;
  }

  .gridcol { flex: 1 1 0; min-width: 320px; }
  .detailcol { flex: 0 0 262px; min-width: 0; }

  .colh {
    display: flex;
    align-items: center;
    gap: 6px;
    font: 600 8.5px/1 'IBM Plex Mono', ui-monospace, monospace;
    letter-spacing: 0.13em;
    text-transform: uppercase;
    color: #616C75;
    margin-bottom: 7px;
    white-space: nowrap;
    overflow: hidden;
  }
  .colh s { margin-left: auto; text-decoration: none; font-size: 8.5px; letter-spacing: 0.06em; }

  .tagrow { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
  .tagrow button {
    border: 1px solid #2E3540;
    background: #12171A;
    color: #8FA4B0;
    font: 500 8.5px/1 'IBM Plex Mono', ui-monospace, monospace;
    padding: 4px 6px;
    border-radius: 3px;
    cursor: pointer;
  }
  .tagrow button:hover { border-color: #4A555E; color: #E8EEF5; }
  .tagrow button.on { border-color: #5B9BD5; background: #173449; color: #EAF5FF; }
  .tagrow button i { font-style: normal; opacity: 0.55; margin-left: 3px; }

  .empty { padding: 22px; max-width: 46ch; color: #8A949C; }
  .empty strong { display: block; font: 600 13px/1.4 'IBM Plex Sans', system-ui, sans-serif; color: #E8EEF5; }
  .empty p { margin: 8px 0 0; font: 400 12px/1.6 'IBM Plex Sans', system-ui, sans-serif; }

  @media (max-width: 1000px) {
    .cols { flex-wrap: wrap; }
    .detailcol { flex: 1 1 100%; }
  }
</style>
