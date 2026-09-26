<script>
  /**
   * Sounds: the library as a browser. Two layouts over one browser (see soundsBrowser.svelte.js):
   *
   *  - `dock`: the Sounds tab under the rack, the quick pick while you work on a part. A list
   *    first; the rail opens behind Filters and the inspector behind Details.
   *  - `page`: the Sounds page, the whole screen. The rail, the results and the inspector each
   *    get full height, with sortable columns, a map that fills the window, several sounds
   *    selected at once and history you can step back through.
   *
   * The host owns search, sort and paging; this view owns what is selected, the layout and the
   * gestures.
   */
  import HostConfirmButton from './HostConfirmButton.svelte';
  import {
    hostLibrary, hostLibraryLoad, hostState,
    startSoundComparison, stepSoundComparison, keepSoundComparison, cancelSoundComparison,
    setLibraryUserMetadata, loadLibraryRecord, hostVersionDiff, auditionRecord, stopAudition, hostAudition,
    setMorph, setLibraryRecordHidden, hostSurfaceBrowse, browseOnSurface, browseTurn, browsePad,
    LIBRARY_SORTS,
  } from '../stores/instrumentHost.js';
  import PluginTile from './PluginTile.svelte';
  import Segmented from '../components/controls/Segmented.svelte';
  import { onMount, tick, untrack } from 'svelte';
  import { readStoredJson, writeStoredJson } from '../utils/localStorageState.js';
  import { presetWindow } from '../utils/soundBrowserLayout.js';
  import { sounds } from './sounds/soundsBrowser.svelte.js';
  import SoundsRail from './sounds/SoundsRail.svelte';
  import SoundsInspector from './sounds/SoundsInspector.svelte';
  import SoundsMap from './sounds/SoundsMap.svelte';
  import SoundsAuditionBar from './sounds/SoundsAuditionBar.svelte';
  import SoundsBulkBar from './sounds/SoundsBulkBar.svelte';
  import SoundsShootout from './sounds/SoundsShootout.svelte';
  import { RECORDS_MIME, detailLine, envelopeLine, lastLoaded, thumbPoints } from './sounds/soundsText.js';

  let {
    focusedPart = null,
    partTitle = () => '',
    auditionOn = false,
    onToggleAudition = () => {},
    onManageLibrary = () => {},
    onBack = () => {},
    layout = 'dock',
    // The filter row and the inspector start closed in the dock unless the caller asks otherwise
    // — a render test does, and so may a caller landing somebody on a filter.
    showFilters = false,
    showDetails = null,
  } = $props();

  const page = untrack(() => layout === 'page');
  const preferencesKey = `ceditor.instrumentHost.soundsView.${page ? 'page' : 'dock'}.v2`;
  const preferences = readStoredJson(preferencesKey, {}) ?? {};
  let detailsOpen = $state(untrack(() => page || (showDetails ?? preferences.details === true)));
  let comfortable = $state(preferences.comfortable === true);
  let filtersOpen = $state(untrack(() => showFilters === true));
  let view = $state(['list', 'grid', 'map'].includes(preferences.view) ? preferences.view : 'list');
  let listElement = $state(null);
  let listHeight = $state(240);
  let scrollTop = $state(0);
  let gridElement = $state(null);
  let gridWidth = $state(800);
  let gridHeight = $state(400);
  let gridScroll = $state(0);
  let onlyDifferences = $state(true);
  let compareOpen = $state(false);
  let rowHeight = $derived(comfortable ? 42 : 32);

  onMount(() => sounds.ask(sounds.query));
  $effect(() => writeStoredJson(preferencesKey, { details: detailsOpen, comfortable, view }));
  $effect(() => {
    const element = listElement;
    // Grid and map unmount the list. Restore its scroll offset before showing the saved virtual
    // window, otherwise the top spacer would fill the entire viewport.
    if (element) untrack(() => { element.scrollTop = scrollTop; });
  });

  const records = $derived(sounds.records);
  const selected = $derived(sounds.selected);
  const selection = $derived(new Set(sounds.selection));
  const query = $derived(sounds.query);
  let windowRows = $derived(presetWindow(records.length, scrollTop, listHeight, rowHeight));
  // The grid, windowed by rows: tiles have one height, so a row is a row.
  const TILE_MIN = 190, TILE_GAP = 6, TILE_ROW = 124;
  const gridColumns = $derived(Math.max(1, Math.floor((gridWidth - 16 + TILE_GAP) / (TILE_MIN + TILE_GAP))));
  const gridRows = $derived(presetWindow(Math.ceil(records.length / gridColumns), gridScroll, gridHeight, TILE_ROW));
  // Near the end of what is held, ask for the next page.
  $effect(() => {
    const end = view === 'grid' ? gridRows.end * gridColumns : view === 'list' ? windowRows.end : records.length;
    if (end >= records.length - 60) untrack(() => sounds.loadMore());
  });

  let loadResult = $derived($hostLibraryLoad.recordId === selected?.recordId ? $hostLibraryLoad : null);
  let updateIssues = $derived($hostLibrary.scanReport.filter((row) => row.reason || row.unavailable > 0).length);
  let facets = $derived($hostLibrary.facets);
  let soundComparison = $derived($hostState.rack.soundComparison);
  let comparisonCandidates = $derived(records.filter(record => record.type === 'preset' && record.available
    && record.sourceType !== 'hardwarePatch' && focusedPart?.hasInstrument && !focusedPart.hardware
    && record.targetCeId === focusedPart.pluginCeId).slice(0, 20));
  const canMorph = $derived(Boolean(focusedPart?.hasInstrument && selected && selected.type === 'preset'));

  function changeKind(value) {
    sounds.presetKind = ['instrument', 'effect'].includes(value) ? value : 'all';
    sounds.ask({ ...query, type: sounds.presetKind !== 'all' ? 'preset' : value === 'all' ? '' : value });
  }
  function resetScroll() {
    scrollTop = 0;
    if (listElement) listElement.scrollTop = 0;
    gridScroll = 0;
    if (gridElement) gridElement.scrollTop = 0;
  }
  $effect(() => { query; untrack(resetScroll); });

  async function walkPresets(event) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter'].includes(event.key)
        || event.target.closest('[data-favourite]') || records.length === 0) return;
    event.preventDefault();
    if (event.key === 'Enter') { if (selected?.available) loadInto(selected, 'focused'); return; }
    const current = Math.max(0, records.findIndex((record) => record.recordId === selected?.recordId));
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? records.length - 1
      : Math.max(0, Math.min(records.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1)));
    if (event.shiftKey && event.key !== 'Home' && event.key !== 'End') sounds.select(records[index].recordId, { shiftKey: true });
    else sounds.selectOnly(records[index].recordId);
    if (listElement) {
      const top = index * rowHeight;
      if (top < listElement.scrollTop) listElement.scrollTop = top;
      else if (top + rowHeight > listElement.scrollTop + listHeight)
        listElement.scrollTop = top + rowHeight - listHeight;
      scrollTop = listElement.scrollTop;
      await tick();
      listElement?.querySelector(`[data-row-index="${index}"] .preset-pick`)?.focus({ preventScroll: true });
    }
  }

  export function refresh() { sounds.refresh(); }
  export function search(text) { sounds.search(text); }

  const loadInto = (record, action) => {
    if ($hostLibraryLoad.recordId === record?.recordId && $hostLibraryLoad.phase === 'loading') return;
    sounds.load(record, action, { focusedPart, auditionOn });
  };

  // Walking to a relative must LAND on it. If it is not in view, search for it by name and say
  // so, rather than changing the view behind somebody's back.
  let revealedNote = $state('');
  function revealRecord(recordId, name = '') {
    if (!recordId) return;
    if (!records.some((r) => r.recordId === recordId)) {
      revealedNote = 'Filters cleared to show it.';
      if (name) sounds.search(name); else sounds.clear();
    } else {
      revealedNote = '';
    }
    sounds.selectOnly(recordId);
  }

  function clickTile(record, event) {
    sounds.select(record.recordId, event);
    // Selecting shows it; loading is the button. With audition on, a click makes a SOUND — the
    // stored snapshot answers immediately and the plug-in takes over when it arrives.
    if (auditionOn && record.available && !record.isEffect && !event?.ctrlKey && !event?.shiftKey) auditionRecord(record.recordId);
  }
  function preview(record) {
    if (record?.available && !record.isEffect && record.type === 'preset') auditionRecord(record.recordId);
  }
  function dragRecords(event, record) {
    const ids = selection.has(record.recordId) ? [...selection] : [record.recordId];
    event.dataTransfer.setData(RECORDS_MIME, JSON.stringify(ids));
    event.dataTransfer.setData('text/plain', ids.map((id) => records.find((r) => r.recordId === id)?.name ?? id).join('\n'));
    event.dataTransfer.effectAllowed = 'copy';
  }

  const COLUMNS = [
    { key: 'name', label: 'Preset' },
    { key: 'instrument', label: 'Plug-in' },
    { key: 'category', label: 'Category', cls: 'preset-category' },
  ];
  const PAGE_COLUMNS = [
    { key: '', label: 'Envelope', cls: 'col-env' },
    { key: 'rating', label: 'Rating', cls: 'col-rating' },
    { key: 'recent', label: 'Loaded', cls: 'col-loaded' },
  ];
  const sortMark = (key) => (key && query.sort === key ? (query.sortDescending ? ' ↓' : ' ↑') : '');
  const sortLabel = $derived(LIBRARY_SORTS.find((s) => s.key === query.sort)?.label ?? 'Library order');
  const kindLabel = (record) => (!record.available ? 'Missing' : record.isEffect ? 'FX' : record.type === 'rack' ? 'Rack'
    : record.type === 'chain' ? 'Chain' : record.sourceType === 'hardwarePatch' ? 'HW' : 'Inst');
  const VIEW_OPTIONS = [
    { value: 'list', label: 'List', path: 'M5 3 H19 M5 7 H19 M5 11 H19' },
    { value: 'grid', label: 'Grid', path: 'M5 2 H10 V6 H5 Z M14 2 H19 V6 H14 Z M5 8 H10 V12 H5 Z M14 8 H19 V12 H14 Z' },
    { value: 'map', label: 'Map', path: 'M6 10 L6.5 10 M11 4 L11.5 4 M16 8 L16.5 8 M9 7 L9.5 7 M18 3 L18.5 3 M13 11 L13.5 11' },
  ];
  const SPACING_OPTIONS = [
    { value: 'compact', label: 'Compact', path: 'M5 3 H19 M5 6 H19 M5 9 H19 M5 12 H19' },
    { value: 'comfortable', label: 'Comfortable', path: 'M5 3 H19 M5 8 H19 M5 13 H19' },
  ];
  const historyOptions = () => ({ focusedPart, auditionOn });
  function pageKey(event) {
    if (!page || compareOpen || event.target.closest?.('input, textarea, select')) return;
    if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); onBack(); return; }
    if (event.altKey && event.key === 'ArrowLeft') { event.preventDefault(); sounds.step(-1, historyOptions()); }
    if (event.altKey && event.key === 'ArrowRight') { event.preventDefault(); sounds.step(1, historyOptions()); }
  }
</script>

<svelte:window onkeydown={pageKey} />

<div class="browser" class:page data-testid="host-sound-browser" aria-label="Sound browser" style={`--preset-row-height:${rowHeight}px`}>
  <div class="head">
    {#if page}
      <span class="history">
        <button type="button" class="ghost" data-testid="sounds-back" disabled={!sounds.canGoBack || !focusedPart}
                title="Back to the sound you loaded before (Alt+Left)" onclick={() => sounds.step(-1, historyOptions())}>◀</button>
        <button type="button" class="ghost" data-testid="sounds-forward" disabled={!sounds.canGoForward || !focusedPart}
                title="Forward (Alt+Right)" onclick={() => sounds.step(1, historyOptions())}>▶</button>
      </span>
    {/if}
    <input type="search" class="search" data-testid="browser-search"
           placeholder="Search sounds, chains and racks…"
           value={query.text}
           oninput={(e) => sounds.ask({ ...query, text: e.currentTarget.value })} />
    <select aria-label="Preset type" value={sounds.presetKind !== 'all' ? sounds.presetKind : query.type || 'all'}
            onchange={(event) => changeKind(event.currentTarget.value)}>
      <option value="all">Everything</option><option value="preset">All presets</option>
      <option value="instrument">Instruments</option><option value="effect">Effects</option>
      <option value="chain">Chains</option><option value="rack">Racks</option>
    </select>
    {#if !page}
      <select aria-label="Plug-in filter" value={query.facets.instruments.include.length === 1 ? query.facets.instruments.include[0] : ''}
              onchange={(event) => sounds.ask({ ...query, facets: { ...query.facets, instruments: { include: event.currentTarget.value ? [event.currentTarget.value] : [], exclude: [] } } })}>
        <option value="">{query.facets.instruments.include.length > 1 ? 'Multiple plug-ins' : 'All plug-ins'}</option>
        {#each facets.instruments as plugin (plugin.value)}<option value={plugin.value}>{plugin.value}</option>{/each}
      </select>
    {/if}
    <button type="button" class="toggle" class:on={query.favouritesOnly} aria-label="Show favourites"
            aria-pressed={query.favouritesOnly} onclick={() => sounds.ask({ ...query, favouritesOnly: !query.favouritesOnly })}>★</button>
    <select class="sort" aria-label="Sort by" data-testid="browser-sort" value={query.sort}
            title={`Sorted by ${sortLabel.toLowerCase()}${query.sort ? (query.sortDescending ? ', high to low' : ', low to high') : ''}`}
            onchange={(e) => sounds.sortBy(e.currentTarget.value)}>
      {#each LIBRARY_SORTS as option (option.key)}<option value={option.key}>{option.label}</option>{/each}
    </select>
    {#if query.sort}
      <button type="button" class="toggle" data-testid="browser-sort-direction"
              title="Turn the order round" aria-label="Turn the order round"
              onclick={() => sounds.ask({ ...query, sortDescending: !query.sortDescending })}>{query.sortDescending ? '↓' : '↑'}</button>
    {/if}
    {#if page}
      <Segmented options={VIEW_OPTIONS} value={view} label="Browser view" testid="browser-view" onchange={(next) => (view = next)} />
      <span class="count" data-testid="browser-count">{records.length < sounds.matched ? `${records.length} of ` : ''}{sounds.matched} sounds</span>
      <button type="button" class="toggle" class:on={$hostSurfaceBrowse.browsing} data-testid="mirror-toggle"
              onclick={() => browseOnSurface(!$hostSurfaceBrowse.browsing)}>⌘ Browse on controller</button>
    {:else}
      <button type="button" class="toggle" class:on={filtersOpen} aria-expanded={filtersOpen}
              onclick={() => (filtersOpen = !filtersOpen)}>Filters</button>
      <button type="button" class="toggle" class:on={detailsOpen} aria-expanded={detailsOpen}
              data-testid="browser-details" onclick={() => (detailsOpen = !detailsOpen)}>Details</button>
    {/if}
  </div>

  {#if sounds.selection.length > 1}
    <SoundsBulkBar records={sounds.selectedRecords} oncompare={() => (compareOpen = true)}
                   onclear={() => sounds.clearSelection()} />
  {/if}

  <div class="body">
    {#if page}
      <nav class="rail-column" aria-label="Library">
        <SoundsRail layout="page" onreveal={revealRecord} />
      </nav>
    {/if}
    <div class="main">
      {#if filtersOpen && !page}
        <div class="facets">
          <div class="browse-settings">
            <span class="rail-setting">View
              <Segmented options={VIEW_OPTIONS} value={view} label="Browser view" testid="browser-view"
                         onchange={(next) => (view = next)} /></span>
            <span class="rail-setting">Spacing
              <Segmented options={SPACING_OPTIONS} value={comfortable ? 'comfortable' : 'compact'} label="Preset row spacing"
                         testid="row-spacing"
                         onchange={(next) => { comfortable = next === 'comfortable'; resetScroll(); }} /></span>
            <button type="button" class="toggle" class:on={$hostSurfaceBrowse.browsing} data-testid="mirror-toggle"
                    onclick={() => browseOnSurface(!$hostSurfaceBrowse.browsing)}>⌘ Browse on controller</button>
          </div>
          <SoundsRail layout="dock" onreveal={revealRecord} />
        </div>
      {/if}
      {#if detailsOpen && $hostVersionDiff && $hostVersionDiff.recordId === selected?.recordId}
        {@const diff = $hostVersionDiff}
        <div class="diff" data-testid="version-diff">
          <div class="diff-head">
            <span class="diff-title">{diff.nameA} → {diff.nameB}</span>
            <span class="diff-count">
              {diff.identical ? 'identical' : `${diff.differing} of ${diff.total} parameters differ`}
            </span>
            <button type="button" class="toggle" class:on={onlyDifferences}
                    onclick={() => (onlyDifferences = !onlyDifferences)}>Only differences</button>
            <button type="button" class="ghost" onclick={() => hostVersionDiff.set(null)}>Close</button>
          </div>
          <div class="diff-rows">
            {#each diff.parameters.filter((r) => !onlyDifferences || r.changed) as row (row.definitionId)}
              <div class="drow" class:changed={row.changed}>
                <span class="dname">{row.name}</span>
                <span class="dbar">
                  <i class="da" style={`width:calc(${Math.round(row.a * 100)}% - 2px)`}></i>
                  <i class="db" style={`width:calc(${Math.round(row.b * 100)}% - 2px)`}></i>
                </span>
                <span class="dval">{row.aText}</span>
                <span class="dval b">{row.bText}</span>
              </div>
            {/each}
            {#if diff.parameters.filter((r) => !onlyDifferences || r.changed).length === 0}
              <div class="notes">Nothing differs — these two saves are the same sound.</div>
            {/if}
          </div>
          {#if onlyDifferences && diff.total > diff.differing}
            {@const hidden = diff.total - diff.differing}
            <div class="diff-foot">{hidden} identical parameter{hidden === 1 ? '' : 's'} hidden</div>
          {/if}
        </div>
      {/if}

      {#if view === 'map'}
        <SoundsMap {layout} {canMorph} partName={partTitle(focusedPart)}
                   onpick={(record) => { if (auditionOn || page) preview(record); }}
                   onwalk={preview}
                   onmorph={(recordIdB) => canMorph && setMorph(focusedPart.partId, selected.recordId, recordIdB)} />
      {:else if records.length === 0}
        <div class="empty-hint">
          {$hostLibrary.counts.total === 0
            ? 'No saved sounds yet. Open Library → Update library, or capture the focused part.'
            : 'Nothing matches. Clear a chip, or refuse fewer things.'}
        </div>
      {:else if view === 'list'}
        <div class="preset-heading" role="row">
          <span>★</span>
          {#each COLUMNS as column (column.key)}
            <button type="button" class={`heading ${column.cls ?? ''}`} class:on={query.sort === column.key}
                    data-testid={`sort-${column.key}`} title={`Sort by ${column.label.toLowerCase()}`}
                    onclick={() => sounds.sortBy(column.key)}>{column.label}{sortMark(column.key)}</button>
          {/each}
          {#if page}
            {#each PAGE_COLUMNS as column (column.label)}
              {#if column.key}
                <button type="button" class={`heading ${column.cls}`} class:on={query.sort === column.key}
                        data-testid={`sort-${column.key}`} onclick={() => sounds.sortBy(column.key)}>{column.label}{sortMark(column.key)}</button>
              {:else}<span class={column.cls}>{column.label}</span>{/if}
            {/each}
          {/if}
          <span>Type</span>
        </div>
        <div class="preset-list" data-testid="preset-list" bind:this={listElement} bind:clientHeight={listHeight}
             onscroll={(event) => (scrollTop = event.currentTarget.scrollTop)} role="group" aria-label="Preset list">
          <div style={`height:${windowRows.before}px`} aria-hidden="true"></div>
          {#each records.slice(windowRows.start, windowRows.end) as record, offset (record.recordId)}
            <div class="preset-row" class:sel={record.recordId === selected?.recordId} class:picked={selection.has(record.recordId)}
                 class:unavailable={!record.available}
                 data-testid="preset-row" data-row-index={windowRows.start + offset}
                 draggable="true" ondragstart={(e) => dragRecords(e, record)}>
              <button type="button" class="preset-star" data-favourite aria-label={`${record.favourite ? 'Remove' : 'Add'} favourite: ${record.name}`}
                      aria-pressed={record.favourite} onclick={() => setLibraryUserMetadata(record.recordId, { favourite: !record.favourite })}>{record.favourite ? '★' : '☆'}</button>
              <button type="button" class="preset-pick" aria-pressed={record.recordId === selected?.recordId}
                      title={record.available ? `${record.name} — ${record.instrument}` : record.reason}
                      onkeydown={walkPresets} onclick={(e) => sounds.select(record.recordId, e)} ondblclick={() => loadInto(record, 'focused')}>
                <span class="preset-name">{record.name}{#if record.hidden}<span class="badge folded">FOLDED</span>{/if}</span><span>{record.instrument || '—'}</span>
                <span class="preset-category">{record.category || '—'}</span>
                {#if page}
                  <span class="col-env">{#if record.sonic && !record.sonic.silent}<svg viewBox="0 0 70 16" preserveAspectRatio="none" aria-hidden="true"><path d={`${envelopeLine(record.sonic.envelope, 70, 16)} L70,16 L0,16 Z`} /></svg>{/if}</span>
                  <span class="col-rating">{#if record.rating > 0}<span class="stars">{'★'.repeat(record.rating)}</span>{/if}</span>
                  <span class="col-loaded">{lastLoaded(record.lastLoadedAtMs)}</span>
                {/if}
                <span class="preset-kind">{kindLabel(record)}</span>
              </button>
              <!-- A folded row is only ever in the list because the browse was asked to show them,
                   and the way back belongs on the row itself. -->
              {#if record.hidden}
                <button type="button" class="preset-unfold" data-testid="unfold-record"
                        title="Put this back in the browse"
                        onclick={() => setLibraryRecordHidden(record.recordId, false)}>Unfold</button>
              {/if}
            </div>
          {/each}
          <div style={`height:${windowRows.after}px`} aria-hidden="true"></div>
          {#if !sounds.complete}<div class="more" aria-live="polite">Loading more of {sounds.matched}…</div>{/if}
        </div>
      {:else}
        <div class="grid" data-testid="browser-grid" bind:this={gridElement} bind:clientWidth={gridWidth} bind:clientHeight={gridHeight}
             onscroll={(event) => (gridScroll = event.currentTarget.scrollTop)} style={`--columns:${gridColumns}`}>
          <div class="grid-space" style={`height:${gridRows.before}px`} aria-hidden="true"></div>
          {#each records.slice(gridRows.start * gridColumns, gridRows.end * gridColumns) as record (record.recordId)}
            <div class="tile" class:sel={record.recordId === selected?.recordId} class:picked={selection.has(record.recordId)}
                 class:unavailable={!record.available} draggable="true" ondragstart={(e) => dragRecords(e, record)}>
              <!-- Every tile keeps the thumbprint's space whether or not there is one yet, so the
                   grid does not reflow as the auditioner works through it. -->
              {#if record.sonic}
                <svg class="thumb" viewBox="0 0 100 24" preserveAspectRatio="none" data-testid="tile-thumb" aria-hidden="true">
                  <polygon points={thumbPoints(record.sonic.envelope)} />
                  <line x1="0" y1="12" x2="100" y2="12" />
                </svg>
              {:else if record.sonicRefusal}
                <div class="thumb unheard refused" title={record.sonicRefusal} data-testid="tile-refused"><span>could not be heard</span></div>
              {:else}
                <div class="thumb unheard" title="Not listened to yet"><span>not heard yet</span></div>
              {/if}
              <button type="button" class="tile-body" data-testid="browser-tile"
                      title={record.available ? detailLine(record) : record.reason}
                      onclick={(e) => clickTile(record, e)} ondblclick={() => loadInto(record, 'focused')}>
                {#if record.type !== 'rack'}
                  <PluginTile ceId={record.targetCeId} name={record.instrument || record.name} vendor={record.manufacturer} size={30} />
                {:else}
                  <span class="rack-mark" aria-hidden="true">▤</span>
                {/if}
                <span class="tile-text">
                  <span class="tile-name">{record.name}</span>
                  <span class="tile-sub">{detailLine(record)}</span>
                </span>
              </button>
              <div class="tile-foot">
                <button type="button" class="ghost star" class:on={record.favourite}
                        title={record.favourite ? 'Unfavourite' : 'Favourite'}
                        onclick={() => setLibraryUserMetadata(record.recordId, { favourite: !record.favourite })}
                >{record.favourite ? '★' : '☆'}</button>
                <span class="badges">
                  {#if record.type === 'rack'}<span class="badge rack">RACK</span>
                  {:else if record.type === 'chain'}<span class="badge chain">CHAIN</span>{/if}
                  {#if record.sourceType === 'hardwarePatch'}<span class="badge hw">HW</span>{/if}
                  {#if record.isEffect}<span class="badge">FX</span>{/if}
                  {#if record.sourceType === 'userState'}<span class="badge mine">MINE</span>{/if}
                  {#if !record.available}<span class="badge miss">NEEDS</span>{/if}
                  {#if record.hidden}<span class="badge folded">FOLDED</span>{/if}
                </span>
                {#if record.hidden}
                  <button type="button" data-testid="unfold-record" title="Put this back in the browse"
                          onclick={() => setLibraryRecordHidden(record.recordId, false)}>Unfold</button>
                {/if}
                {#if record.type === 'rack'}
                  <button type="button" disabled={!record.available} onclick={() => loadInto(record, 'focused')}>Restore</button>
                {:else}
                  <button type="button" disabled={!record.available || !focusedPart}
                          title={focusedPart ? `Load into ${partTitle(focusedPart)}` : 'Focus a rack part first'}
                          onclick={() => loadInto(record, 'focused')}>Load</button>
                  <button type="button" disabled={!record.available || (record.isEffect && !focusedPart)} title={record.isEffect ? 'Add an effect to the focused part' : 'Add as a new part'}
                          onclick={() => loadInto(record, 'add')}>+</button>
                {/if}
              </div>
            </div>
          {/each}
          <div class="grid-space" style={`height:${gridRows.after}px`} aria-hidden="true"></div>
        </div>
      {/if}

      {#if compareOpen && sounds.selectedRecords.length >= 2}
        <SoundsShootout records={sounds.selectedRecords} canLoad={Boolean(focusedPart)}
                        onload={(record) => { loadInto(record, 'focused'); compareOpen = false; }}
                        onclose={() => (compareOpen = false)} />
      {/if}
    </div>

    {#if detailsOpen}
      <div class="inspector-column">
        <SoundsInspector {focusedPart} {partTitle} {layout} {revealedNote}
                         onreveal={revealRecord} onaudition={preview} />
      </div>
    {/if}
  </div>

  {#if $hostSurfaceBrowse.browsing}
    <!-- What the hardware is showing, mirrored. Browsing without looking at the computer only
         works if you can check, once, that the two agree. -->
    <div class="mirror" data-testid="surface-mirror">
      <div class="lcd">
        <div class="lcd-head"><span>{$hostSurfaceBrowse.title}</span><span>{$hostSurfaceBrowse.total}</span></div>
        {#each $hostSurfaceBrowse.rows as row (row.name + row.detail)}
          <div class="lcd-row" class:on={row.current} class:dim={!row.available}>
            <i class="lcd-pip" class:lit={row.current}></i>
            <span class="lcd-name">{row.name}</span>
            <span class="lcd-detail">{row.detail}</span>
          </div>
        {/each}
        {#if $hostSurfaceBrowse.rows.length === 0}<div class="lcd-row"><span class="lcd-name">nothing matches</span></div>{/if}
        <div class="lcd-foot">
          <button type="button" class="ghost lcd-btn" onclick={() => browseTurn(0, -1)}>◀ PREV</button>
          <span>PUSH = LOAD</span>
          <button type="button" class="ghost lcd-btn" onclick={() => browseTurn(0, 1)}>NEXT ▶</button>
        </div>
      </div>
      <div class="mirror-right">
        <div class="encgrid">
          {#each $hostSurfaceBrowse.encoders as knob, index (index)}
            <button type="button" class="enc" class:act={knob.role === 'scroll'} class:inert={knob.role === ''} data-testid="mirror-encoder"
                    title={knob.role === '' ? 'Drawn, and honestly inert — this browser has nothing for it' : `Turn ${knob.label.toLowerCase()}`}
                    disabled={knob.role === ''} onclick={() => browseTurn(index, 1)}>
              <span class="enc-n">ENC {index + 1}</span>
              <span class="enc-v">{knob.label}{knob.value ? `: ${knob.value}` : ''}</span>
            </button>
          {/each}
        </div>
        {#if $hostSurfaceBrowse.pads.length > 0}
          <div class="padgrid">
            {#each $hostSurfaceBrowse.pads as pad, index (index)}
              <button type="button" class="pad" class:dim={!pad.available} data-testid="mirror-pad"
                      title={`Pad ${index + 1}: ${pad.name}`} onclick={() => browsePad(index)}>{pad.name}</button>
            {/each}
          </div>
        {/if}
        <div class="mirror-note">
          {#if $hostSurfaceBrowse.limitations}
            <b>This controller:</b> {$hostSurfaceBrowse.limitations}
          {:else}
            {$hostSurfaceBrowse.surface.encoders} encoders ·
            {$hostSurfaceBrowse.surface.pads} pads{$hostSurfaceBrowse.pads.length < $hostSurfaceBrowse.surface.pads
              ? ` (${$hostSurfaceBrowse.pads.length} holding something)` : ''} ·
            {$hostSurfaceBrowse.surface.hasDisplay ? `${$hostSurfaceBrowse.surface.displayRows}-row screen` : 'no screen'}.
            The browser is built from what this surface says it has, not from a list of blessed devices.
          {/if}
        </div>
      </div>
    </div>
  {/if}

  {#if soundComparison.active}
    <div class="sound-compare" data-testid="host-sound-comparison">
      <span class="compare-slot">{soundComparison.index + 1}<small>/{soundComparison.count}</small></span>
      <span class="compare-copy">
        <small>Sound Comparison · original: {soundComparison.originalName}</small>
        <strong>{soundComparison.name || 'Preset unavailable'}</strong>
      </span>
      <button type="button" class="ghost" title="Previous preset" onclick={() => stepSoundComparison(-1)}>‹ Previous</button>
      <button type="button" class="ghost" title="Next preset" onclick={() => stepSoundComparison(1)}>Next ›</button>
      <button type="button" class="compare-keep" onclick={() => keepSoundComparison()}>Keep this sound</button>
      <button type="button" class="ghost" onclick={() => cancelSoundComparison()}>Cancel · restore original</button>
    </div>
  {/if}

  <div class="selection-bar" data-testid="sound-selection-bar">
    <div class="selection-info">
      <strong>{selected?.name ?? 'No preset selected'}</strong>
      <span aria-live="polite" class:load-failed={loadResult?.phase === 'failed'} data-testid="sound-load-result">{selected && !selected.available ? selected.reason
        : loadResult?.message ? loadResult.message
        : selected?.type === 'rack' ? 'Restore the saved rack'
        : focusedPart ? `${selected?.isEffect ? 'Insert on' : 'Load into'} ${partTitle(focusedPart)}`
        : 'Select a target part, or add an instrument as a new part'}</span>
    </div>
    <button type="button" data-testid="host-start-sound-comparison"
            disabled={soundComparison.active || comparisonCandidates.length < 2}
            title={comparisonCandidates.length >= 2
              ? `Step through ${comparisonCandidates.length} visible presets on the part, with the audition phrase`
              : 'Show at least two presets for the focused instrument'}
            onclick={() => startSoundComparison(focusedPart.partId, comparisonCandidates.map((record) => record.recordId))}>
      Step through visible ({comparisonCandidates.length})
    </button>
    {#if selected?.type !== 'rack'}
      <button type="button" disabled={!selected?.available || loadResult?.phase === 'loading' || (selected?.isEffect && !focusedPart)}
              data-testid="sound-add" onclick={() => loadInto(selected, 'add')}>{selected?.isEffect ? 'Add insert' : 'Add part'}</button>
    {/if}
    <button type="button" class="load-selected" data-testid="sound-load"
            disabled={!selected?.available || loadResult?.phase === 'loading' || (selected?.type !== 'rack' && !focusedPart)}
            onclick={() => loadInto(selected, 'focused')}>{loadResult?.phase === 'loading' ? 'Loading…' : selected?.type === 'rack' ? 'Restore rack' : selected?.isEffect ? 'Load effect' : 'Load'}</button>
  </div>
  <div class="browser-status" data-testid="browser-counts">
    <span>{records.length}{records.length < sounds.matched ? ` of ${sounds.matched}` : ''} shown · {$hostLibrary.counts.total} saved{#if $hostLibrary.scanning} · Updating library…{/if}</span>
    {#if $hostLibrary.updateFinished && !$hostLibrary.scanning}
      <button type="button" class="ghost" onclick={onManageLibrary} data-testid="library-update-result">{!$hostLibrary.scanReport.length ? 'No plug-ins available · View results' : updateIssues ? `Update finished · ${updateIssues} ${updateIssues === 1 ? 'plug-in needs' : 'plug-ins need'} attention` : 'Library updated'}</button>
    {/if}
    {#if $hostAudition.stage === 'loading' || $hostAudition.stage === 'snapshot' || $hostAudition.stage === 'live'}
      <span>{$hostAudition.detail || $hostAudition.stage}<button type="button" class="ghost" onclick={stopAudition}>Stop</button></span>
    {:else}<span>↑ ↓ select · Shift or Ctrl click for several · Enter load{#if page} · Alt+← back{/if}</span>{/if}
  </div>

  <SoundsAuditionBar {layout} {auditionOn} {onToggleAudition} />
</div>

<style>
  .sound-compare { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 8px 10px;
                   border: 1px solid #d66f24; background: linear-gradient(90deg, #2a1c13, #171c21 42%); }
  .compare-slot { display: inline-flex; align-items: baseline; justify-content: center; min-width: 44px; color: #ff9a47; font-size: 22px; font-weight: 750; }
  .compare-slot small { color: #a87955; font-size: 11px; }
  .compare-copy { display: flex; flex: 1 1 180px; min-width: 150px; flex-direction: column; }
  .compare-copy small { color: #9f8877; font-size: 10px; }
  .compare-copy strong { color: #f1f3f5; font-size: 13px; }
  .compare-keep { border-color: #d66f24; color: #ffd7b7; }

  /* The workspace's controls, repeated because Svelte scopes them. Written :global under the
     browser so the rail, the inspector and the map (components of their own) wear them too. */
  .browser :global(button:not(.ctl)) { background: var(--host-surface-raised); border: 1px solid var(--host-line); border-radius: 4px;
    color: var(--host-text); padding: 4px 10px; cursor: pointer; font: inherit; font-size: 12px; }
  .browser :global(button:not(.ctl):hover:not(:disabled)) { border-color: #5b9bd5; }
  .browser :global(button:disabled) { opacity: 0.5; cursor: default; }
  .browser :global(button.toggle) { padding: 3px 7px; color: var(--host-text-dim); }
  .browser :global(button.toggle.on) { color: var(--host-text); border-color: #5b9bd5; background: #24313d; }
  .browser :global(button.ghost) { background: none; border-color: transparent; color: var(--host-text-dim); }
  .browser :global(button.ghost:hover) { color: var(--host-text); border-color: var(--host-line); }
  .browser :global(button.ghost.danger):hover { color: #e4b3b3; border-color: #7a4a4a; }
  .browser :global(input), .browser :global(textarea) { background: var(--host-field); border: 1px solid var(--host-line); border-radius: 4px;
    color: var(--host-text); padding: 3px 6px; font: inherit; font-size: 12px; }
  .browser :global(.rail-head) { color: var(--host-text-dim); font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; margin: 10px 0 3px; }
  .browser :global(button.rail-item) { display: flex; align-items: center; gap: 6px; width: 100%; text-align: left;
    background: transparent; border: 1px solid transparent; border-radius: 4px; padding: 4px 7px; color: var(--host-text-soft); font-size: 12px; }
  .browser :global(button.rail-item:hover:not(:disabled)) { background: var(--host-surface-raised); color: var(--host-text); border-color: transparent; }
  .browser :global(button.rail-item.on) { background: #7fb4e01f; border-color: #4a86bd; color: var(--host-text); }
  .browser :global(.rail-item .n) { margin-left: auto; color: var(--host-text-dim); font-size: 10px; }
  .browser :global(button.chip) { display: inline-flex; align-items: center; gap: 5px; padding: 3px 8px; border-radius: 11px;
    border: 1px solid var(--host-line); background: var(--host-surface-raised); color: var(--host-text-soft); font-size: 11px; }
  .browser :global(button.chip:hover:not(:disabled)) { color: var(--host-text); border-color: #566372; }
  .browser :global(.chip .n) { color: var(--host-text-dim); font-size: 10px; }
  .browser :global(button.chip.on) { background: #7fb4e01f; border-color: #4a86bd; color: #7fb4e0; }
  .browser :global(.chip.on .n) { color: #4a86bd; }
  /* A refused value is struck through rather than hidden: a chip you cannot see is a filter you cannot take off. */
  .browser :global(button.chip.no) { border-color: #e0565688; color: #e08a8a; background: #e0565614; text-decoration: line-through; }
  .browser :global(.chip.small) { padding: 2px 7px; font-size: 10px; }
  .browser :global(.chip.suggested) { border-style: dashed; opacity: .75; }
  .browser :global(.chip.suggested:hover) { opacity: 1; }
  .browser :global(.notes) { color: var(--host-text-soft); font-size: 11px; margin-top: 6px; }
  .browser :global(button.star) { color: #566372; font-size: 15px; padding: 1px 3px; background: none; border: 0; cursor: pointer; }
  .browser :global(button.star.on) { color: #d9a13c; }

  .browser {
    /* Laid out against its own width, not the window's: the dock and the page are different
       widths, and the layout follows the space it is given. */
    container-type: inline-size;
    display: flex; flex-direction: column; flex: 1; height: 100%; min-width: 0; min-height: 0;
    margin: 0; padding: 0; gap: 0; border: 0; border-radius: 0;
    background: var(--host-surface, #171a1d); position: relative; overflow: hidden;
  }
  .head { display: flex; align-items: center; flex-wrap: wrap; flex: none; padding: 7px 10px; gap: 6px;
          border-bottom: 1px solid var(--host-line, #3b4652); }
  .search { flex: 1; min-width: 130px; max-width: 130px; }
  .page .search { max-width: 360px; }
  .history { display: inline-flex; gap: 2px; }
  .count { font: 11px var(--host-font-mono, monospace); color: var(--host-text-dim); }
  .browser select { background: var(--host-bg-deep, #14171a); color: var(--host-text, #d6dbe0);
                    border: 1px solid var(--host-line, #3b4652); border-radius: 4px; font: inherit;
                    font-size: 12px; padding: 4px 6px; min-width: 0; max-width: 160px; height: 29px; }
  .head :global(button), .head input { height: 29px; box-sizing: border-box; }
  .load-failed { color: #f3a5a5; }
  .body { display: flex; flex: 1; min-height: 0; gap: 0; position: relative; flex-direction: row; align-items: stretch; }
  .main { position: relative; flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; gap: 0; overflow: hidden; }
  .rail-column { width: 240px; flex: 0 0 240px; overflow-y: auto; padding: 8px 10px; box-sizing: border-box;
                 border-right: 1px solid var(--host-line, #3b4652); background: #14181c; }
  .inspector-column { display: flex; min-height: 0; }
  .page .inspector-column { width: 320px; flex: 0 0 320px; border-left: 1px solid var(--host-line, #3b4652); background: #14181c; }
  .facets { max-height: 170px; min-height: 0; overflow-y: auto; flex: 0 1 auto; padding: 8px 10px; border-bottom: 1px solid var(--host-line, #3b4652);
            display: flex; flex-direction: column; gap: 5px; }
  .browse-settings { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 4px; }
  .rail-setting { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; }

  .preset-list { flex: 1; min-height: 32px; overflow-y: auto; overflow-x: hidden; position: relative; }
  .preset-heading { display: grid; grid-template-columns: 30px minmax(100px, 1.7fr) minmax(90px, 1fr) minmax(70px, .8fr) 60px;
                    gap: 6px; padding: 5px 10px; font-size: 11px; color: var(--host-text-soft, #9aa5b1);
                    background: var(--host-bg, #1d232b); border-bottom: 1px solid var(--host-line, #3b4652); flex: none; align-items: center; }
  .page .preset-heading { grid-template-columns: 30px minmax(140px, 1.7fr) minmax(90px, 1fr) minmax(70px, .8fr) 76px 64px 76px 50px; }
  .browser.browser .preset-heading :global(button.heading) { background: none; border: 0; padding: 0; text-align: left; font-size: 11px;
                                                       color: var(--host-text-soft, #9aa5b1); white-space: nowrap; }
  .browser.browser .preset-heading :global(button.heading.on) { color: #79b9ee; }
  .preset-row { display: flex; gap: 6px; height: var(--preset-row-height); min-height: var(--preset-row-height);
                box-sizing: border-box; border-bottom: 1px solid var(--host-line-soft, #2b333d); padding: 0 10px; }
  .preset-row.picked { background: #1e3346; }
  .preset-row.sel { background: var(--host-selection, #243b37); box-shadow: inset 3px 0 var(--host-accent, #80d8bc); }
  .preset-row.unavailable .preset-name { color: var(--host-text-dim, #7d8894); }
  .preset-name .badge.folded { margin-left: 6px; vertical-align: 1px; }
  .preset-unfold { flex: none; align-self: center; padding: 1px 7px; font-size: 10.5px; }
  .browser.browser.browser.browser button.preset-star { width: 30px; flex: 0 0 30px; padding: 0; background: none; border: 0; border-radius: 0; color: var(--host-text-soft, #9aa5b1); }
  .browser.browser.browser.browser button.preset-star[aria-pressed="true"] { color: var(--host-accent, #80d8bc); }
  .browser.browser.browser.browser button.preset-pick { display: grid; grid-template-columns: minmax(100px, 1.7fr) minmax(90px, 1fr) minmax(70px, .8fr) 60px;
                               gap: 6px; flex: 1; min-width: 0; padding: 0; background: none; border: 0; border-radius: 0;
                               text-align: left; align-items: center; color: var(--host-text-soft, #9aa5b1); font-size: 12px; }
  .browser.browser.browser.browser.page button.preset-pick { grid-template-columns: minmax(140px, 1.7fr) minmax(90px, 1fr) minmax(70px, .8fr) 76px 64px 76px 50px; }
  .browser.browser.browser.browser button.preset-pick:hover:not(:disabled) { background: var(--host-surface-hover, #27323b); border: 0; }
  .preset-pick > span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .preset-pick .preset-name { color: var(--host-text, #d6dbe0); }
  .preset-kind { font-size: 11px; }
  .col-env svg { width: 70px; height: 16px; display: block; }
  .col-env path { fill: #6fb0c944; stroke: #7fb4e0; stroke-width: 1; vector-effect: non-scaling-stroke; }
  .stars { color: #d9a13c; font-size: 10.5px; letter-spacing: 1px; }
  .col-loaded { font: 11px var(--host-font-mono, monospace); color: var(--host-text-dim); }
  .more { padding: 8px 10px; color: var(--host-text-dim); font-size: 11px; }

  .grid { flex: 1; min-height: 0; overflow-y: auto; padding: 8px; display: grid;
          grid-template-columns: repeat(var(--columns, 4), minmax(0, 1fr)); grid-auto-rows: 118px; gap: 6px; align-content: start; }
  .grid-space { grid-column: 1 / -1; }
  .tile { display: flex; flex-direction: column; gap: 4px; min-width: 0; box-sizing: border-box;
          padding: 7px; border: 1px solid var(--host-line-soft); border-radius: 5px; background: #14181b; }
  .tile.picked { border-color: #4a86bd; background: #1b2a38; }
  .tile.sel { border-color: #7fb4e0; }
  .tile.unavailable { opacity: 0.62; }
  .browser.browser button.tile-body { display: flex; align-items: center; gap: 7px; min-width: 0; width: 100%;
    background: transparent; border: 1px solid transparent; padding: 2px; border-radius: 4px; text-align: left; color: inherit; }
  .browser.browser button.tile-body:hover:not(:disabled) { border-color: var(--host-line); background: var(--host-surface-raised); }
  .tile-text { display: flex; flex-direction: column; min-width: 0; }
  .tile-name { font-weight: 600; font-size: 12px; color: var(--host-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tile-sub { color: var(--host-text-dim); font-size: 10.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rack-mark { width: 30px; height: 30px; flex: 0 0 30px; border-radius: 4px; background: var(--host-surface-raised);
               border: 1px solid #35c46f66; color: #35c46f; display: flex; align-items: center; justify-content: center; font-size: 14px; }
  .tile-foot { display: flex; align-items: center; gap: 4px; }
  .tile-foot :global(button:not(.star)) { padding: 3px 8px; font-size: 11px; }
  .badges { display: flex; gap: 3px; margin-right: auto; }
  .badge { font-size: 8.5px; letter-spacing: 0.06em; padding: 2px 4px; border-radius: 2px; border: 1px solid var(--host-line); color: var(--host-text-dim); }
  .badge.mine { color: #7fb4e0; border-color: #4a86bd; }
  .badge.hw { color: #d9a13c; border-color: #d9a13c66; }
  .badge.chain { color: #a98bd6; border-color: #a98bd666; }
  .badge.rack { color: #35c46f; border-color: #35c46f66; }
  .badge.miss { color: #e05656; border-color: #e0565666; }
  /* Amber: a folded row is tidied away, not broken. */
  .badge.folded { color: #d9a13c; border-color: #d9a13c66; }
  .thumb { display: block; width: 100%; height: 22px; background: var(--host-bg-deep); border-radius: 3px; }
  .thumb.unheard { display: flex; align-items: center; justify-content: center;
                   border: 1px dashed var(--host-line-soft); color: #4d565f; font-size: 9px; letter-spacing: 0.06em; }
  .thumb.unheard.refused { border-color: #6b5426; color: #b08a3d; }
  .thumb polygon { fill: #6fb0c9; fill-opacity: 0.85; }
  .thumb line { stroke: #7fb4e0; stroke-opacity: 0.3; stroke-width: 0.4; }
  .empty-hint { color: var(--host-text-dim); font-size: 12px; padding: 14px; }

  .diff { display: flex; flex-direction: column; gap: 6px; padding: 9px 10px; margin: 6px;
          border: 1px solid var(--host-line); border-radius: 5px; background: #14181b; }
  .diff-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .diff-title { font-weight: 600; font-size: 12px; color: var(--host-text); }
  .diff-count { color: var(--host-text-dim); font-size: 11px; margin-right: auto; }
  .diff-rows { display: flex; flex-direction: column; max-height: 190px; overflow-y: auto; }
  .drow { display: grid; grid-template-columns: 130px 1fr 78px 78px; gap: 8px; align-items: center;
          padding: 4px 0; border-bottom: 1px solid var(--host-surface-raised); font-size: 11px; }
  .dname { color: var(--host-text-soft); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .drow.changed .dname { color: var(--host-text); }
  .dbar { position: relative; height: 12px; background: var(--host-bg-deep); border: 1px solid var(--host-line-soft); border-radius: 2px; }
  .dbar .da { position: absolute; left: 1px; top: 1px; bottom: 1px; background: #39424d; border-radius: 1px; }
  .dbar .db { position: absolute; left: 1px; top: 3px; bottom: 3px; border-radius: 1px; background: linear-gradient(90deg, #4a86bd, #7fb4e0); }
  .dval { color: var(--host-text-dim); font-size: 10.5px; text-align: right; font-variant-numeric: tabular-nums; }
  .dval.b { color: #7fb4e0; }
  .diff-foot { color: var(--host-text-dim); font-size: 10.5px; }

  .mirror { display: flex; gap: 12px; padding: 10px; flex-wrap: wrap; max-height: 130px; overflow: auto; flex: none;
            border-top: 1px solid var(--host-line-soft); background: var(--host-bg-deep); }
  .page .mirror { max-height: 200px; }
  .lcd { width: 268px; flex: 0 0 268px; padding: 8px 9px; border-radius: 4px; background: #06170f; border: 1px solid #1d4a34; color: #8ff0b8;
         font-family: ui-monospace, monospace; box-shadow: inset 0 0 24px #0b3a2544; }
  .lcd-head { display: flex; justify-content: space-between; gap: 8px; font-size: 9.5px; color: #4fbf87;
              border-bottom: 1px solid #1d4a34; padding-bottom: 5px; letter-spacing: 0.06em; }
  .lcd-row { display: flex; align-items: center; gap: 6px; padding: 3px 0; font-size: 11.5px; }
  .lcd-row.on { color: #d6ffe8; }
  .lcd-row.dim { color: #2f6f4f; }
  .lcd-pip { width: 5px; height: 5px; border-radius: 50%; background: #1d4a34; flex: 0 0 5px; }
  .lcd-pip.lit { background: #8ff0b8; box-shadow: 0 0 6px #8ff0b8; }
  .lcd-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .lcd-detail { font-size: 9px; color: #4fbf87; white-space: nowrap; }
  .lcd-foot { display: flex; justify-content: space-between; align-items: center; gap: 6px; border-top: 1px solid #1d4a34;
              padding-top: 5px; margin-top: 5px; font-size: 9px; color: #4fbf87; letter-spacing: 0.04em; }
  .browser.browser button.lcd-btn { color: #4fbf87; font-size: 9px; padding: 1px 3px; font-family: inherit; }
  .mirror-right { flex: 1; min-width: 260px; display: flex; flex-direction: column; gap: 6px; }
  .encgrid, .padgrid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; }
  .browser.browser button.enc { display: flex; flex-direction: column; gap: 3px; align-items: flex-start; text-align: left; padding: 5px 6px; min-width: 0; }
  .browser.browser button.enc.act { border-color: #4a86bd; background: #7fb4e014; }
  .browser.browser button.enc.inert { opacity: 0.45; }
  .enc-n { font: 600 8.5px/1 ui-monospace, monospace; color: var(--host-text-dim); letter-spacing: 0.06em; }
  .enc-v { font-size: 10.5px; color: var(--host-text-soft); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
  .browser.browser button.pad { padding: 7px 5px; font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
                                background: #7fb4e014; border-color: #4a86bd66; }
  .browser.browser button.pad.dim { opacity: 0.45; }
  .mirror-note { color: var(--host-text-dim); font-size: 10.5px; line-height: 1.5; }
  .mirror-note b { color: #d9a13c; font-weight: 600; }

  .selection-bar { display: flex; align-items: center; flex: none; gap: 8px; padding: 7px 10px;
                   border-top: 1px solid var(--host-line, #3b4652); background: var(--host-bg, #1d232b); }
  .selection-info { display: flex; flex: 1; flex-direction: column; min-width: 0; }
  .selection-info strong { font-size: 12px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .selection-info > span { font-size: 11px; color: var(--host-text-soft, #9aa5b1); overflow-wrap: anywhere; }
  .browser.browser .load-selected { border-color: var(--host-accent, #80d8bc); color: var(--host-text, #d6dbe0); min-width: 70px; }
  .browser-status { flex: none; display: flex; align-items: center; justify-content: space-between; gap: 8px;
                    min-height: 23px; padding: 2px 10px; color: var(--host-text-soft, #9aa5b1); font-size: 11px;
                    border-top: 1px solid var(--host-line-soft, #2b333d); }
  .browser-status :global(button) { padding: 0 5px; }

  @container (max-width: 760px) {
    .inspector-column { position: absolute; right: 0; top: 0; bottom: 0; z-index: 3; width: 240px; max-width: 100%; }
    .preset-category { display: none; }
    .preset-heading { grid-template-columns: 30px minmax(100px, 1.7fr) minmax(85px, 1fr) 60px; }
    .browser.browser.browser.browser button.preset-pick { grid-template-columns: minmax(100px, 1.7fr) minmax(85px, 1fr) 60px; }
    .rail-column { display: none; }
  }
  @container (max-width: 500px) {
    .search { flex-basis: 100%; max-width: none; }
    .head { gap: 4px; }
    .browser select { max-width: 115px; }
    .selection-bar { flex-wrap: wrap; gap: 5px; }
    .selection-info { flex-basis: 100%; }
    .preset-heading { grid-template-columns: 25px minmax(100px, 1.7fr) minmax(70px, 1fr); }
    .preset-heading > span:last-child, .preset-kind { display: none; }
    .browser.browser.browser.browser button.preset-pick { grid-template-columns: minmax(100px, 1.7fr) minmax(70px, 1fr); }
    .browser.browser.browser.browser button.preset-star { width: 25px; flex-basis: 25px; }
    .browser-status { flex-wrap: wrap; }
  }
</style>
