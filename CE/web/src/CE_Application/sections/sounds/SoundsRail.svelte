<script>
  /**
   * What the browse is narrowed by: the library's own views, your collections and saved
   * searches, what you play, the facets and the measured ranges.
   *
   * In the dock it is the block the Filters button opens, chips wrapping across the width. On
   * the Sounds page it is a column that is always there, with the plug-ins as a list you tick,
   * tags grouped by family, and collections you drop sounds onto.
   */
  import HostConfirmButton from '../HostConfirmButton.svelte';
  import RangeBand from '../../components/controls/RangeBand.svelte';
  import {
    hostLibrary, hostUnplayed, unplayedLikeHabits, saveSmartCollection, removeSmartCollection,
    setLibraryUserMetadata, cycleLibraryFacet, libraryQueryIsEmpty, normalizeLibraryQuery,
    MEASURED_AXES, measuredLabel,
  } from '../../stores/instrumentHost.js';
  import { TAG_FAMILIES, tagFamily } from '../../utils/tagVocabulary.js';
  import { AXIS_LABELS, sourceLabel, RECORDS_MIME } from './soundsText.js';
  import { sounds } from './soundsBrowser.svelte.js';

  let { layout = 'dock', onreveal = () => {} } = $props();

  const page = $derived(layout === 'page');
  const query = $derived(sounds.query);
  const facets = $derived($hostLibrary.facets);
  const filtered = $derived(!libraryQueryIsEmpty(query));
  const ask = (next) => sounds.ask(next);

  const FACET_LABELS = [
    ['categories', 'Type'],
    ['tags', 'Tag'],
    ['instruments', 'Instrument'],
    ['manufacturers', 'Maker'],
    ['sources', 'Source'],
  ];
  // On the page the plug-ins and tags have places of their own; the rest stay chip rows.
  const PAGE_CHIP_FACETS = FACET_LABELS.filter(([facet]) => facet !== 'instruments' && facet !== 'tags');

  function clickFacet(facet, value, event) {
    // Alt (or right-click) refuses outright; a plain click walks the three states.
    ask(cycleLibraryFacet(query, facet, value, event.altKey || event.button === 2));
  }
  function toggleRange(axis) {
    const next = normalizeLibraryQuery(query);
    next.ranges[axis].active = !next.ranges[axis].active;
    ask(next);
  }
  // Both ends at once, from the band: a range dragged is a range applied.
  function setRangePair(axis, { min, max }) {
    const next = normalizeLibraryQuery(query);
    next.ranges[axis] = { ...next.ranges[axis], min, max, active: true };
    ask(next);
  }

  let collectionName = $state('');
  let namingCollection = $state(false);
  function saveCurrentView() {
    const name = collectionName.trim();
    if (!name) return;
    saveSmartCollection(name, query);
    collectionName = '';
    namingCollection = false;
  }

  // Collections exist because a record names them, so a new one is only a name here until the
  // first sound is dropped on it.
  let pendingCollections = $state([]);
  let newCollection = $state('');
  let makingCollection = $state(false);
  const collections = $derived([
    ...$hostLibrary.collections,
    ...pendingCollections.filter((name) => !$hostLibrary.collections.some((c) => c.name === name))
      .map((name) => ({ name, count: 0, pending: true })),
  ]);
  function makeCollection() {
    const name = newCollection.trim();
    if (name && !collections.some((c) => c.name === name)) pendingCollections = [...pendingCollections, name];
    newCollection = '';
    makingCollection = false;
  }
  let dropTarget = $state('');
  function dropOn(event, name) {
    event.preventDefault();
    dropTarget = '';
    let ids = [];
    try { ids = JSON.parse(event.dataTransfer.getData(RECORDS_MIME) || '[]'); } catch { ids = []; }
    for (const id of ids) {
      const record = sounds.records.find((r) => r.recordId === id);
      if (record && !record.collections.includes(name))
        setLibraryUserMetadata(id, { collections: [...record.collections, name] });
    }
  }
  const acceptsRecords = (event) => [...(event.dataTransfer?.types ?? [])].includes(RECORDS_MIME);

  // Tags on the page, grouped the way the vocabulary groups them; anything else is "Other".
  const tagGroups = $derived.by(() => {
    const groups = [...TAG_FAMILIES.map((f) => ({ id: f.id, label: f.label, values: [] })),
      { id: 'other', label: 'Other', values: [] }];
    for (const value of facets.tags) groups.find((g) => g.id === tagFamily(value.value)).values.push(value);
    return groups.filter((g) => g.values.length > 0);
  });
  const recentOn = $derived(query.sort === 'recent' && query.sortDescending);
</script>

<div class="rail" class:page data-testid="browser-facets">
  <div class="browse-collections">
    <div class="rail-head">Library</div>
    <button type="button" class="rail-item" class:on={!filtered && !recentOn} onclick={() => sounds.clear()}>
      <span>All sounds</span><span class="n">{$hostLibrary.counts.total}</span>
    </button>
    <button type="button" class="rail-item" class:on={query.favouritesOnly}
            onclick={() => ask({ ...query, favouritesOnly: !query.favouritesOnly })}>
      <span>Favourites</span>
    </button>
    {#if page}
      <button type="button" class="rail-item" class:on={recentOn} data-testid="rail-recent"
              title="Everything, the most recently loaded first"
              onclick={() => ask({ ...query, sort: recentOn ? '' : 'recent', sortDescending: !recentOn })}>
        <span>Recently loaded</span>
      </button>
    {/if}
    <button type="button" class="rail-item" class:on={query.availableOnly}
            title="Hide records whose plug-in is not installed, or whose file is gone"
            onclick={() => ask({ ...query, availableOnly: !query.availableOnly })}>
      <span>Playable now</span>
    </button>
    <button type="button" class="rail-item" class:on={query.minRating > 0}
            onclick={() => ask({ ...query, minRating: query.minRating > 0 ? 0 : 4 })}>
      <span>Rated ★★★★+</span>
    </button>

    {#if $hostLibrary.smartCollections.length > 0}
      <div class="rail-head">Saved searches</div>
      {#each $hostLibrary.smartCollections as collection (collection.collectionId)}
        <div class="rail-row">
          <button type="button" class="rail-item" data-testid="smart-collection"
                  onclick={() => ask(collection.query)}>
            <span>{collection.name}</span><span class="n">{collection.count}</span>
          </button>
          <HostConfirmButton identity={JSON.stringify([collection.collectionId])} aria-label="Remove smart collection" type="button" class="ghost danger" title="Forget this search"
                  onclick={() => removeSmartCollection(collection.collectionId)}>×</HostConfirmButton>
        </div>
      {/each}
    {/if}

    {#if collections.length > 0 || page}
      <div class="rail-head">Collections
        {#if page}<button type="button" class="ghost add" data-testid="new-collection"
                          title="A new collection: name it, then drop sounds on it"
                          onclick={() => (makingCollection = true)}>+ new</button>{/if}
      </div>
      {#each collections as collection (collection.name)}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="drop" class:over={dropTarget === collection.name}
             ondragover={(e) => { if (acceptsRecords(e)) { e.preventDefault(); dropTarget = collection.name; } }}
             ondragleave={() => { if (dropTarget === collection.name) dropTarget = ''; }}
             ondrop={(e) => dropOn(e, collection.name)}>
          <button type="button" class="rail-item" class:on={query.collection === collection.name}
                  data-testid="collection" data-collection={collection.name}
                  title={collection.pending ? 'Drop sounds here to fill it' : `Show ${collection.name}; drop sounds here to add them`}
                  onclick={() => ask({ ...query, collection: query.collection === collection.name ? '' : collection.name })}>
            <span>{collection.name}</span><span class="n">{collection.pending ? 'drop here' : collection.count}</span>
          </button>
        </div>
      {/each}
      {#if makingCollection}
        <input class="name-field" placeholder="Name, then Enter" aria-label="New collection name"
               data-testid="new-collection-name" bind:value={newCollection}
               onkeydown={(e) => { if (e.key === 'Enter') makeCollection(); if (e.key === 'Escape') makingCollection = false; }}
               onblur={makeCollection} />
      {/if}
    {/if}

    <button type="button" class="rail-item" class:on={query.measuredOnly}
            title="Only sounds the auditioner has played"
            onclick={() => ask({ ...query, measuredOnly: !query.measuredOnly })}>
      <span>Measured</span><span class="n">{$hostLibrary.counts.measured}</span>
    </button>
    <button type="button" class="rail-item" class:on={query.addedWithinDays > 0}
            data-testid="added-recently"
            title="Only what arrived in the last fortnight. A sound the library has always had has no arrival time and is not recent; a file that merely moved keeps the record it already had, so it is not new either."
            onclick={() => ask({ ...query, addedWithinDays: query.addedWithinDays > 0 ? 0 : 14 })}>
      <span>Added recently</span><span class="n">{$hostLibrary.counts.addedRecently}</span>
    </button>

    <!-- What the browse is not showing. A fold nobody can count is a fold nobody can undo,
         so the number is here whether or not there is a set left to fold. -->
    {#if $hostLibrary.counts.hidden > 0}
      <button type="button" class="rail-item" class:on={query.includeHidden}
              data-testid="folded-away"
              title="Folded duplicates. They were never deleted — show them and any one can be put back."
              onclick={() => ask({ ...query, includeHidden: !query.includeHidden })}>
        <span>Folded away</span><span class="n">{$hostLibrary.counts.hidden}</span>
      </button>
    {/if}

    <!-- WHAT YOU OWN VERSUS WHAT YOU PLAY. The statistic on its own is something to feel bad
         about; it earns its place because the row beside it is a way in. -->
    {#if $hostLibrary.counts.total > 0}
      <div class="rail-head">What you play</div>
      <span class="play-note" data-testid="play-note">
        {$hostLibrary.counts.everLoaded} of {$hostLibrary.counts.total} ever loaded
      </span>
      <button type="button" class="rail-item" class:on={query.neverLoadedOnly}
              data-testid="never-loaded"
              title="Sounds you own and have never once loaded. Auditioning one while browsing does not count as playing it."
              onclick={() => ask({ ...query, neverLoadedOnly: !query.neverLoadedOnly })}>
        <span>Never loaded</span><span class="n">{$hostLibrary.counts.neverLoaded}</span>
      </button>
      <button type="button" class="rail-item" data-testid="suggest-unplayed"
              title="Measure what you keep reaching for, then find what you own that sounds like it and have never opened"
              onclick={() => unplayedLikeHabits(20)}><span>Find what I'd like</span></button>

      {#if $hostUnplayed.matches.length > 0}
        <span class="play-note" data-testid="unplayed-from">
          from the {$hostUnplayed.from} you keep loading
        </span>
        {#each $hostUnplayed.matches.slice(0, 8) as match (match.recordId)}
          <button type="button" class="rail-item" data-testid="unplayed-match"
                  title={`${match.percent}% like what you reach for, and you have never opened it`}
                  onclick={() => onreveal(match.recordId, match.name)}>
            <span>{match.name}</span><span class="n">{match.percent}%</span>
          </button>
        {/each}
      {:else if !$hostUnplayed.enough}
        <!-- Refused rather than guessed: a centre averaged from one or two sounds is confident
             nonsense. -->
        <span class="play-note dim" data-testid="unplayed-not-enough">
          Load a few more and this can tell you what you'd like.
        </span>
      {/if}
    {/if}
  </div>

  {#if page}
    {#if facets.instruments.length > 0}
      <div class="rail-head">Plug-ins</div>
      <div class="ticks" data-testid="rail-plugins">
        {#each facets.instruments as value (value.value)}
          <button type="button" class="tick" class:on={value.selected} class:no={value.excluded}
                  data-testid="rail-plugin" aria-pressed={value.selected}
                  title={value.excluded ? 'Refused — click to clear' : value.selected ? 'Click to refuse instead' : 'Click to keep; alt-click to refuse'}
                  oncontextmenu={(e) => { e.preventDefault(); clickFacet('instruments', value.value, e); }}
                  onclick={(e) => clickFacet('instruments', value.value, e)}>
            <i class="box"></i><span class="tname">{value.value}</span><span class="n">{value.count}</span>
          </button>
        {/each}
      </div>
    {/if}
    {#each PAGE_CHIP_FACETS as [facet, label] (facet)}
      {#if facets[facet].length > 0}
        <div class="rail-head">{label}</div>
        <div class="chips">
          {#each facets[facet] as value (value.value)}
            <button type="button" class="chip" class:on={value.selected} class:no={value.excluded}
                    data-testid="facet-chip"
                    oncontextmenu={(e) => { e.preventDefault(); clickFacet(facet, value.value, e); }}
                    onclick={(e) => clickFacet(facet, value.value, e)}>
              {facet === 'sources' ? sourceLabel(value.value) : value.value}<span class="n">{value.count}</span>
            </button>
          {/each}
        </div>
      {/if}
    {/each}
    {#each tagGroups as group (group.id)}
      <div class="rail-head">{group.label}</div>
      <div class="chips" data-testid={`rail-tags-${group.id}`}>
        {#each group.values as value (value.value)}
          <button type="button" class="chip" class:on={value.selected} class:no={value.excluded}
                  data-testid="facet-chip"
                  oncontextmenu={(e) => { e.preventDefault(); clickFacet('tags', value.value, e); }}
                  onclick={(e) => clickFacet('tags', value.value, e)}>
            {value.value}<span class="n">{value.count}</span>
          </button>
        {/each}
      </div>
    {/each}
  {:else}
    {#each FACET_LABELS as [facet, label] (facet)}
      {#if facets[facet].length > 0}
        <div class="frow">
          <span class="flabel">{label}</span>
          {#each facets[facet].slice(0, 12) as value (value.value)}
            <button type="button" class="chip" class:on={value.selected} class:no={value.excluded}
                    data-testid="facet-chip"
                    title={value.excluded ? 'Refused — click to clear'
                           : value.selected ? 'Click to refuse instead'
                           : `Click to keep only these; alt-click to refuse them (${value.count} would match)`}
                    oncontextmenu={(e) => { e.preventDefault(); clickFacet(facet, value.value, e); }}
                    onclick={(e) => clickFacet(facet, value.value, e)}>
              {facet === 'sources' ? sourceLabel(value.value) : value.value}
              <span class="n">{value.count}</span>
            </button>
          {/each}
        </div>
      {/if}
    {/each}
  {/if}

  {#if $hostLibrary.counts.measured > 0}
    <div class="measured" data-testid="measured-strip">
      {#if page}<div class="rail-head">Measured</div>{:else}<span class="flabel">Measured</span>{/if}
      {#each MEASURED_AXES as axis (axis)}
        {@const range = query.ranges[axis]}
        <div class="axis" class:on={range.active}>
          <button type="button" class="axis-name" data-testid="axis-toggle"
                  title={range.active ? 'Stop filtering on this' : 'Filter on this'}
                  onclick={() => toggleRange(axis)}>
            {AXIS_LABELS[axis]}
            <span class="axis-value">
              {range.active ? `${measuredLabel(axis, range.min)} – ${measuredLabel(axis, range.max)}` : 'any'}
            </span>
          </button>
          <RangeBand min={range.min} max={range.max} active={range.active} label={AXIS_LABELS[axis]}
                     format={(v) => measuredLabel(axis, v)} testid={`axis-band-${axis}`}
                     onchange={(pair) => setRangePair(axis, pair)} />
        </div>
      {/each}
    </div>
  {/if}

  <div class="frow actions">
    {#if !page}<span class="hint">Click a chip to keep only those; alt-click to refuse them.</span>{/if}
    {#if filtered}
      <button type="button" class="ghost" onclick={() => sounds.clear()}>Clear all</button>
      {#if namingCollection}
        <input class="name-field" placeholder="Name this search…" bind:value={collectionName}
               data-testid="collection-name"
               onkeydown={(e) => e.key === 'Enter' && saveCurrentView()} />
        <button type="button" onclick={saveCurrentView} data-testid="save-collection">Save</button>
        <button type="button" class="ghost" onclick={() => (namingCollection = false)}>Cancel</button>
      {:else}
        <button type="button" class="ghost" onclick={() => (namingCollection = true)}>Save this search…</button>
      {/if}
    {/if}
  </div>
</div>

<style>
  .rail { display: flex; flex-direction: column; gap: 5px; }
  .browse-collections { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 4px; }
  .browse-collections .rail-head { flex-basis: 100%; margin: 3px 0; }
  .browse-collections .rail-item { width: auto; gap: 8px; }
  .rail-row { display: flex; align-items: center; gap: 2px; }
  .rail-row .rail-item { flex: 1; min-width: 0; }
  .drop { border-radius: 4px; }
  .drop.over { outline: 2px dashed #d9a13c; outline-offset: 1px; background: #d9a13c14; }
  .rail-head button.add { font-size: 10.5px; padding: 0 4px; color: #7fb4e0; }
  .frow { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
  .frow.actions { margin-top: 2px; }
  .flabel { color: var(--host-text-dim); font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase;
            width: 72px; flex: 0 0 72px; }
  .hint { color: var(--host-text-dim); font-size: 10.5px; margin-right: auto; }
  .play-note { color: var(--host-text-soft); font-size: 10.5px; padding: 2px 0; }
  .play-note.dim { color: var(--host-text-dim); }
  .measured { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 2px; }
  .axis { display: flex; flex-direction: column; gap: 2px; min-width: 132px;
          padding: 4px 6px; border: 1px solid var(--host-line-soft); border-radius: 4px; background: #14181b; }
  .axis.on { border-color: #4a86bd; background: #7fb4e00f; }
  button.axis-name { display: flex; align-items: baseline; gap: 5px; background: none; border: 0; padding: 0;
                     color: var(--host-text-soft); font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase; }
  button.axis-name:hover:not(:disabled) { color: var(--host-text); border-color: transparent; }
  .axis.on button.axis-name { color: #7fb4e0; }
  .axis-value { text-transform: none; letter-spacing: 0; color: var(--host-text-dim); font-size: 10px; }
  .axis.on .axis-value { color: var(--host-text-soft); }
  .name-field { width: 170px; }
  .chips { display: flex; flex-wrap: wrap; gap: 4px; }

  /* The page: one column, every group always visible, scrolling on its own. */
  .rail.page { gap: 4px; }
  .page .browse-collections { flex-direction: column; flex-wrap: nowrap; align-items: stretch; gap: 1px; }
  .page .browse-collections .rail-item { width: 100%; }
  .page .rail-head { margin: 10px 0 3px; display: flex; align-items: center; justify-content: space-between; }
  .page .measured { flex-direction: column; align-items: stretch; gap: 4px; }
  .page .axis { min-width: 0; }
  .page .name-field { width: 100%; box-sizing: border-box; }
  .ticks { display: flex; flex-direction: column; gap: 1px; }
  button.tick { display: flex; align-items: center; gap: 7px; width: 100%; text-align: left; background: transparent;
                border: 1px solid transparent; border-radius: 4px; padding: 3px 6px; color: var(--host-text-soft); font-size: 12px; }
  button.tick:hover:not(:disabled) { background: var(--host-surface-raised); color: var(--host-text); border-color: transparent; }
  .tick .box { width: 11px; height: 11px; flex: none; border-radius: 2px; border: 1px solid var(--host-line-strong, #526170); }
  .tick.on .box { background: #5b9bd5; border-color: #79b9ee; }
  .tick.no .box { background: #e05656; border-color: #e05656; }
  .tick.no .tname { text-decoration: line-through; color: var(--host-text-dim); }
  .tick .tname { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tick .n { margin-left: auto; color: var(--host-text-dim); font-size: 10px; }
</style>
