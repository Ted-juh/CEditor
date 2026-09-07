<script>
  /**
   * SoundBrowser.svelte — the library as a workspace rather than a drawer.
   *
   * What this replaces is a scrolling list of grey type with a search box and five filter
   * buttons, which is the shape the product this succeeds already beat in 2015. Three things
   * make this one different, and all three are load-bearing rather than decorative:
   *
   *   A CHIP CAN BE REFUSED. Every facet value cycles off → keep → refuse, and alt-clicking
   *   goes straight to refuse. "Pads, but nothing distorted" is the search a person runs the
   *   moment they know what they do not want, and no preset browser has ever offered it.
   *
   *   A COUNT PREDICTS THE CLICK. The number on a chip is what you would have if you clicked
   *   it — the native side lifts each facet's own selection while counting (Library.h). So the
   *   strip is a map of where the library goes next, not a report on the filter already on.
   *
   *   A SOUND IS A SOUND. A vendor .vstpreset, a state you captured, a hardware synth patch, a
   *   whole voice chain and a whole rack are one result set, because to somebody looking for a
   *   bass they are the same thing. That is a Library.h property this view finally shows.
   *
   * The view holds the query and the native side answers it; `request` comes back on every
   * answer so the chips can be restored from the answer alone — including after a mutation,
   * which re-emits the view you were looking at rather than resetting you to all of it.
   */
  import {
    hostLibrary, requestLibrary, scanLibrary, browseLibraryPath, removeLibraryPath,
    saveUserPreset, saveRackToLibrary, saveChainToLibrary,
    setLibraryUserMetadata, removeLibraryRecord, loadLibraryRecord,
    saveSmartCollection, removeSmartCollection,
    emptyLibraryQuery, normalizeLibraryQuery, cycleLibraryFacet, libraryQueryIsEmpty,
  } from '../stores/instrumentHost.js';
  import PluginTile from './PluginTile.svelte';

  let {
    focusedPart = null,
    partTitle = () => '',
    auditionOn = false,
    onAudition = () => {},
    onToggleAudition = () => {},
  } = $props();

  let query = $state(emptyLibraryQuery());
  let selectedId = $state('');
  let collectionName = $state('');
  let namingCollection = $state(false);

  const FACET_LABELS = [
    ['categories', 'Type'],
    ['tags', 'Tag'],
    ['instruments', 'Instrument'],
    ['manufacturers', 'Maker'],
    ['sources', 'Source'],
  ];

  // Source types are the library's own vocabulary and they are not words anybody says out
  // loud. The chips read as what the sound IS; the value underneath stays what the record says.
  const SOURCE_LABELS = {
    vstpreset: 'Vendor preset',
    programList: "Plug-in's own programs",
    userState: 'Captured by you',
    hardwarePatch: 'Hardware patch',
    rackCapture: 'Rack capture',
    chainCapture: 'Chain capture',
  };
  const sourceLabel = (value) => SOURCE_LABELS[value] ?? value;

  let records = $derived($hostLibrary.records);
  let selected = $derived(records.find((r) => r.recordId === selectedId) ?? records[0] ?? null);
  let facets = $derived($hostLibrary.facets);
  let filtered = $derived(!libraryQueryIsEmpty(query));

  function ask(next) {
    query = normalizeLibraryQuery(next);
    requestLibrary(query);
  }

  export function refresh() { ask(query); }

  function clickFacet(facet, value, event) {
    // Alt (or right-click) refuses outright; a plain click walks the three states.
    ask(cycleLibraryFacet(query, facet, value, event.altKey || event.button === 2));
  }

  function clickType(value) {
    ask({ ...query, type: query.type === value ? '' : value });
  }

  function loadInto(record, action) {
    loadLibraryRecord(record.recordId, action, action === 'focused' ? focusedPart?.partId : undefined);
    if (auditionOn && action !== 'add') onAudition();
  }

  function clickTile(record) {
    selectedId = record.recordId;
    // Selecting shows it; loading is the button. A single click that both selects and loads is
    // how the old list put an instrument somewhere nobody expected.
    if (auditionOn && record.available && record.type !== 'rack') loadInto(record, 'focused');
  }

  function saveCurrentView() {
    const name = collectionName.trim();
    if (!name) return;
    saveSmartCollection(name, query);
    collectionName = '';
    namingCollection = false;
  }

  const detailLine = (record) => (record.type === 'rack'
    ? 'Rack'
    : [record.type === 'chain' ? 'Chain' : null,
       record.sourceType === 'hardwarePatch' ? 'Hardware' : null,
       record.instrument, record.manufacturer].filter(Boolean).join(' · ') || 'Preset');

</script>

<div class="browser" data-testid="host-sound-browser" aria-label="Sound browser">
  <div class="head">
    <input type="search" class="search" data-testid="browser-search"
           placeholder="Search sounds, chains and racks…"
           value={query.text}
           oninput={(e) => ask({ ...query, text: e.currentTarget.value })} />
    <span class="types">
      {#each [['', 'All'], ['preset', 'Sounds'], ['chain', 'Chains'], ['rack', 'Racks']] as [value, label] (value)}
        <button type="button" class="toggle" class:on={query.type === value}
                onclick={() => (value === '' ? ask({ ...query, type: '' }) : clickType(value))}>{label}</button>
      {/each}
    </span>
    <button type="button" class="toggle" class:on={auditionOn} data-testid="host-audition"
            title="When on, clicking a sound loads it into the focused part and plays a short note"
            onclick={() => onToggleAudition()}>♪ Audition</button>
    <button type="button" onclick={() => scanLibrary()} data-testid="host-scan-library">Scan presets</button>
    <button type="button" onclick={() => browseLibraryPath()}>Add folder…</button>
    <span class="counts" data-testid="browser-counts">
      {$hostLibrary.counts.matched} of {$hostLibrary.counts.total}
      {#if $hostLibrary.counts.missing > 0} · {$hostLibrary.counts.missing} missing{/if}
    </span>
  </div>

  <div class="body">
    <div class="rail">
      <div class="rail-head">Library</div>
      <button type="button" class="rail-item" class:on={!filtered}
              onclick={() => ask(emptyLibraryQuery())}>
        <span>All sounds</span><span class="n">{$hostLibrary.counts.total}</span>
      </button>
      <button type="button" class="rail-item" class:on={query.favouritesOnly}
              onclick={() => ask({ ...query, favouritesOnly: !query.favouritesOnly })}>
        <span>Favourites</span>
      </button>
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
            <button type="button" class="ghost danger" title="Forget this search"
                    onclick={() => removeSmartCollection(collection.collectionId)}>×</button>
          </div>
        {/each}
      {/if}

      {#if $hostLibrary.collections.length > 0}
        <div class="rail-head">Collections</div>
        {#each $hostLibrary.collections as collection (collection.name)}
          <button type="button" class="rail-item" class:on={query.collection === collection.name}
                  onclick={() => ask({ ...query,
                    collection: query.collection === collection.name ? '' : collection.name })}>
            <span>{collection.name}</span><span class="n">{collection.count}</span>
          </button>
        {/each}
      {/if}

      <div class="rail-head">Capture</div>
      <!-- A hardware part saves the patch it captured. The library is where a sound lives
           whichever box makes it, so "warm pad" finds the Serum preset and the Juno patch
           in one list. -->
      <button type="button" class="rail-action"
              disabled={!(focusedPart?.hasInstrument
                          || (focusedPart?.hardware && focusedPart?.hardwarePatchBytes > 0))}
              title={focusedPart?.hasInstrument ? `Capture ${partTitle(focusedPart)}'s current state`
                     : focusedPart?.hardware
                       ? (focusedPart.hardwarePatchBytes > 0
                            ? `Save ${partTitle(focusedPart)}'s captured patch to the library`
                            : 'Capture a patch from the synth first (Routing tab)')
                       : 'Focus a part with an instrument first'}
              onclick={() => saveUserPreset(focusedPart.partId)}
              data-testid="host-save-preset">{focusedPart?.hardware ? 'Save this patch' : 'Save this sound'}</button>
      <button type="button" class="rail-action" disabled={!focusedPart?.hasInstrument}
              title={focusedPart?.hasInstrument
                     ? `Capture ${partTitle(focusedPart)} whole: the instrument and its state, the MIDI modules ahead of it and the inserts behind it`
                     : 'Focus a part with an instrument first'}
              onclick={() => saveChainToLibrary(focusedPart.partId)}
              data-testid="host-save-chain">Save this chain</button>
      <button type="button" class="rail-action" onclick={() => saveRackToLibrary()}
              data-testid="host-save-rack">Save the rack</button>

      {#if $hostLibrary.paths.length > 0}
        <div class="rail-head">Scanned folders</div>
        {#each $hostLibrary.paths as path (path)}
          <div class="rail-row"><span class="path" title={path}>{path}</span>
            <button type="button" class="ghost danger"
                    onclick={() => removeLibraryPath(path)}>×</button></div>
        {/each}
      {/if}
    </div>

    <div class="main">
      <div class="facets" data-testid="browser-facets">
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

        <div class="frow actions">
          <span class="hint">Click a chip to keep only those; alt-click to refuse them.</span>
          {#if filtered}
            <button type="button" class="ghost" onclick={() => ask(emptyLibraryQuery())}>Clear all</button>
            {#if namingCollection}
              <input class="name-field" placeholder="Name this search…" bind:value={collectionName}
                     data-testid="collection-name"
                     onkeydown={(e) => e.key === 'Enter' && saveCurrentView()} />
              <button type="button" onclick={saveCurrentView} data-testid="save-collection">Save</button>
              <button type="button" class="ghost" onclick={() => (namingCollection = false)}>Cancel</button>
            {:else}
              <button type="button" class="ghost" onclick={() => (namingCollection = true)}>
                Save this search…
              </button>
            {/if}
          {/if}
        </div>
      </div>

      {#if records.length === 0}
        <div class="empty-hint">
          {$hostLibrary.counts.total === 0
            ? 'Nothing in the library yet — scan presets, or capture the focused part.'
            : 'Nothing matches. Clear a chip, or refuse fewer things.'}
        </div>
      {:else}
        <div class="grid" data-testid="browser-grid">
          {#each records as record (record.recordId)}
            <div class="tile" class:sel={record.recordId === selected?.recordId}
                 class:unavailable={!record.available}>
              <button type="button" class="tile-body" data-testid="browser-tile"
                      title={record.available ? detailLine(record) : record.reason}
                      onclick={() => clickTile(record)}>
                {#if record.type !== 'rack'}
                  <PluginTile ceId={record.targetCeId} name={record.instrument || record.name}
                              vendor={record.manufacturer} size={30} />
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
                  {#if record.sourceType === 'userState'}<span class="badge mine">MINE</span>{/if}
                  {#if !record.available}<span class="badge miss">NEEDS</span>{/if}
                </span>
                {#if record.type === 'rack'}
                  <button type="button" disabled={!record.available}
                          onclick={() => loadLibraryRecord(record.recordId)}>Restore</button>
                {:else}
                  <button type="button" disabled={!record.available || !focusedPart}
                          title={focusedPart ? `Load into ${partTitle(focusedPart)}` : 'Focus a rack part first'}
                          onclick={() => loadInto(record, 'focused')}>Load</button>
                  <button type="button" disabled={!record.available} title="Add as a new part"
                          onclick={() => loadInto(record, 'add')}>+</button>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    {#if selected}
      <div class="inspector" data-testid="browser-inspector">
        <div class="insp-name">{selected.name}</div>
        <div class="insp-sub">{detailLine(selected)}</div>

        <div class="insp-block">
          <div class="insp-head">Where it came from</div>
          <div class="kv">
            <span class="k">Source</span><span class="v">{sourceLabel(selected.sourceType)}</span>
            {#if selected.instrument}
              <span class="k">Instrument</span><span class="v">{selected.instrument}</span>
            {/if}
            {#if selected.manufacturer}
              <span class="k">Maker</span><span class="v">{selected.manufacturer}</span>
            {/if}
            <span class="k">Status</span>
            <span class="v" class:ok={selected.available} class:bad={!selected.available}>
              {selected.available ? 'playable now' : selected.reason || 'not playable here'}
            </span>
          </div>
        </div>

        <div class="insp-block">
          <div class="insp-head">Yours</div>
          <div class="rating" role="group" aria-label="Rating">
            {#each [1, 2, 3, 4, 5] as star (star)}
              <button type="button" class="ghost star" class:on={selected.rating >= star}
                      title={`Rate ${star}`}
                      onclick={() => setLibraryUserMetadata(selected.recordId,
                        { rating: selected.rating === star ? 0 : star })}
              >{selected.rating >= star ? '★' : '☆'}</button>
            {/each}
          </div>
          {#if selected.tags.length > 0}
            <div class="tags">
              {#each selected.tags as tag (tag)}
                <button type="button" class="chip small"
                        title={`Show everything tagged ${tag}`}
                        onclick={() => ask(cycleLibraryFacet(emptyLibraryQuery(), 'tags', tag))}>{tag}</button>
              {/each}
            </div>
          {/if}
          {#if selected.notes}<div class="notes">{selected.notes}</div>{/if}
        </div>

        {#if !selected.factory}
          <button type="button" class="ghost danger insp-remove"
                  onclick={() => removeLibraryRecord(selected.recordId)}>Remove this record</button>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  /* The workspace's controls, repeated because Svelte scopes them: InstrumentHostView's
     button/input rules stop at its own markup, and a browser wearing the browser's default
     chrome inside a dark tool is the first thing rendering it showed. Same values as there. */
  button {
    background: #232a31;
    border: 1px solid #3b4652;
    border-radius: 4px;
    color: #d6dbe0;
    padding: 4px 10px;
    cursor: pointer;
    font: inherit;
    font-size: 12px;
  }
  button:hover:not(:disabled) { border-color: #5b9bd5; }
  button:disabled { opacity: 0.5; cursor: default; }
  button.toggle { padding: 3px 7px; color: #7d8894; }
  button.toggle.on { color: #d6dbe0; border-color: #5b9bd5; background: #24313d; }
  button.ghost { background: none; border-color: transparent; color: #7d8894; }
  button.ghost:hover { color: #d6dbe0; border-color: #3b4652; }
  button.ghost.danger:hover { color: #e4b3b3; border-color: #7a4a4a; }
  input {
    background: #14171a;
    border: 1px solid #3b4652;
    border-radius: 4px;
    color: #d6dbe0;
    padding: 3px 6px;
    font: inherit;
    font-size: 12px;
  }

  .browser {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 8px 14px 0;
    padding: 10px;
    border: 1px solid #3b4652;
    border-radius: 6px;
    background: #171a1d;
    min-height: 0;
  }

  .head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .search { flex: 1; min-width: 200px; }
  .types { display: flex; gap: 4px; }
  .counts { color: #7d8894; font-size: 11px; margin-left: auto; }

  .body { display: flex; align-items: stretch; gap: 10px; min-height: 0; }

  .rail {
    width: 186px;
    flex: 0 0 186px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow-y: auto;
    max-height: 460px;
    padding-right: 4px;
  }
  .rail-head {
    color: #7d8894; font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase;
    margin: 10px 0 3px;
  }
  .rail-head:first-child { margin-top: 0; }
  button.rail-item {
    display: flex; align-items: center; gap: 6px; width: 100%; text-align: left;
    background: transparent; border: 1px solid transparent; border-radius: 4px;
    padding: 4px 7px; color: #9aa5b1; font-size: 12px;
  }
  button.rail-item:hover:not(:disabled) { background: #1c2126; color: #d6dbe0;
                                          border-color: transparent; }
  button.rail-item.on { background: #7fb4e01f; border-color: #4a86bd; color: #d6dbe0; }
  .rail-item .n { margin-left: auto; color: #7d8894; font-size: 10px; }
  .rail-row { display: flex; align-items: center; gap: 2px; }
  .rail-row .rail-item { flex: 1; min-width: 0; }
  button.rail-action { width: 100%; text-align: left; font-size: 11px; padding: 4px 7px; }
  .path {
    flex: 1; min-width: 0; color: #7d8894; font-size: 10px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; direction: rtl;
  }

  .main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; }

  .facets { display: flex; flex-direction: column; gap: 5px; }
  .frow { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
  .frow.actions { margin-top: 2px; }
  .hint { color: #66707b; font-size: 10.5px; margin-right: auto; }
  .flabel {
    color: #7d8894; font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase;
    width: 72px; flex: 0 0 72px;
  }
  button.chip {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 3px 8px; border-radius: 11px; border: 1px solid #3b4652;
    background: #1c2126; color: #9aa5b1; font-size: 11px;
  }
  button.chip:hover:not(:disabled) { color: #d6dbe0; border-color: #566372; }
  .chip .n { color: #66707b; font-size: 10px; }
  button.chip.on { background: #7fb4e01f; border-color: #4a86bd; color: #7fb4e0; }
  .chip.on .n { color: #4a86bd; }
  /* A refused value is struck through rather than hidden: a chip you cannot see is a filter
     you cannot take off. */
  button.chip.no { border-color: #e0565688; color: #e08a8a; background: #e0565614;
                   text-decoration: line-through; }
  .chip.small { padding: 2px 7px; font-size: 10px; }
  .name-field { width: 170px; }

  .grid {
    flex: 1; min-height: 0; overflow-y: auto;
    display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
    gap: 6px; align-content: start;
  }
  .tile {
    display: flex; flex-direction: column; gap: 4px; min-width: 0;
    padding: 7px; border: 1px solid #2a333d; border-radius: 5px; background: #14181b;
  }
  .tile.sel { border-color: #7fb4e0; }
  .tile.unavailable { opacity: 0.62; }
  button.tile-body {
    display: flex; align-items: center; gap: 7px; min-width: 0; width: 100%;
    background: transparent; border: 1px solid transparent; padding: 2px; border-radius: 4px;
    text-align: left; color: inherit;
  }
  button.tile-body:hover:not(:disabled) { border-color: #3b4652; background: #1c2126; }
  .tile-text { display: flex; flex-direction: column; min-width: 0; }
  .tile-name {
    font-weight: 600; font-size: 12px; color: #d6dbe0;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .tile-sub {
    color: #7d8894; font-size: 10.5px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .rack-mark {
    width: 30px; height: 30px; flex: 0 0 30px; border-radius: 4px; background: #1c2126;
    border: 1px solid #35c46f66; color: #35c46f; display: flex; align-items: center;
    justify-content: center; font-size: 14px;
  }
  .tile-foot { display: flex; align-items: center; gap: 4px; }
  .tile-foot button:not(.star) { padding: 3px 8px; font-size: 11px; }
  .badges { display: flex; gap: 3px; margin-right: auto; }
  .badge {
    font-size: 8.5px; letter-spacing: 0.06em; padding: 2px 4px; border-radius: 2px;
    border: 1px solid #3b4652; color: #7d8894;
  }
  .badge.mine { color: #7fb4e0; border-color: #4a86bd; }
  .badge.hw { color: #d9a13c; border-color: #d9a13c66; }
  .badge.chain { color: #a98bd6; border-color: #a98bd666; }
  .badge.rack { color: #35c46f; border-color: #35c46f66; }
  .badge.miss { color: #e05656; border-color: #e0565666; }
  button.star { color: #566372; font-size: 13px; padding: 1px 3px; }
  button.star.on { color: #d9a13c; }

  .inspector {
    width: 234px; flex: 0 0 234px; display: flex; flex-direction: column; gap: 8px;
    padding-left: 10px; border-left: 1px solid #2a333d; overflow-y: auto; max-height: 460px;
  }
  .insp-name { font-weight: 600; font-size: 14px; color: #d6dbe0; }
  .insp-sub { color: #7d8894; font-size: 11px; }
  .insp-block { border-top: 1px solid #2a333d; padding-top: 7px; }
  .insp-head {
    color: #7d8894; font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase;
    margin-bottom: 5px;
  }
  .kv { display: grid; grid-template-columns: 72px 1fr; gap: 3px 8px; font-size: 11px; }
  .kv .k { color: #66707b; }
  .kv .v { color: #9aa5b1; overflow-wrap: anywhere; }
  .kv .v.ok { color: #35c46f; }
  .kv .v.bad { color: #d6a3a3; }
  .rating { display: flex; gap: 1px; }
  .tags { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 6px; }
  .notes { color: #9aa5b1; font-size: 11px; margin-top: 6px; }
  button.insp-remove { align-self: flex-start; font-size: 11px; padding: 3px 6px; }
  .empty-hint { color: #7d8894; font-size: 12px; padding: 12px 0; }
</style>
