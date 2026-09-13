<script>
  import HostConfirmButton from './HostConfirmButton.svelte';
  /** Sounds in the bottom dock: a virtual preset list with one load bar.
   * The native library owns search and metadata; this view owns selection, density and
   * optional details and filters. Library management lives beside the rack.
   */
  import {
    hostLibrary, hostLibraryLoad, requestLibrary, hostState, setPresetAudition,
    startSoundComparison, stepSoundComparison, keepSoundComparison, cancelSoundComparison,
    setLibraryUserMetadata, removeLibraryRecord, loadLibraryRecord,
    saveSmartCollection, removeSmartCollection,
    emptyLibraryQuery, normalizeLibraryQuery, cycleLibraryFacet, libraryQueryIsEmpty,
    hostAudition, auditionRecord, stopAudition, setAuditionPhrase, auditionLibraryRecord,
    hostVersionDiff, commitVersion, applyVersion, diffVersions, morphVersions,
    setMorph, clearMorph, setParameter,
    hostSimilar, similarSounds, hostSubstitutes, rackSubstitutes, rememberSubstitute,
    hostSurfaceBrowse, browseOnSurface, browseTurn, browsePad,
    MEASURED_AXES, measuredLabel,
  } from '../stores/instrumentHost.js';
  import { noteName } from '../utils/pianoGeometry.js';
  import PluginTile from './PluginTile.svelte';
  import { onMount, tick, untrack } from 'svelte';
  import { readStoredJson, writeStoredJson } from '../utils/localStorageState.js';
  import { matchesPresetKind, presetWindow } from '../utils/soundBrowserLayout.js';

  let {
    focusedPart = null,
    partTitle = () => '',
    auditionOn = false,
    onToggleAudition = () => {},
    onManageLibrary = () => {},
  } = $props();

  const preferencesKey = 'ceditor.instrumentHost.soundsView.v1';
  const preferences = readStoredJson(preferencesKey, {}) ?? {};
  let query = $state(untrack(() => normalizeLibraryQuery($hostLibrary.request)));
  let presetKind = $state(['instrument', 'effect'].includes(preferences.kind) ? preferences.kind : 'all');
  let detailsOpen = $state(preferences.details === true);
  let comfortable = $state(preferences.comfortable === true);
  let filtersOpen = $state(false);
  let listElement = $state(null);
  let listHeight = $state(240);
  let scrollTop = $state(0);
  let rowHeight = $derived(comfortable ? 42 : 32);
  onMount(() => ask(query));
  $effect(() => writeStoredJson(preferencesKey, { kind: presetKind, details: detailsOpen, comfortable }));
  $effect(() => {
    const element = listElement;
    // Grid/map temporarily unmount the list. Restore its scroll offset before displaying
    // the saved virtual window, otherwise the top spacer would fill the entire viewport.
    if (element) untrack(() => { element.scrollTop = scrollTop; });
  });
  let versionLabel = $state('');
  let namingVersion = $state(false);
  // Where the blend sits between the first save and the current one, 0-100.
  let blendAmount = $state(100);
  let onlyDifferences = $state(true);
  // Grid or map. The map is the same records on two measured axes — no projection, no learned
  // embedding, nothing to explain: where a dot sits IS its brightness and its attack.
  let view = $state('list');
  let axisX = $state('brightness');
  let axisY = $state('attack');
  let hovered = $state(null);
  let lasso = $state(null);   // { x0, y0, x1, y1 } in 0..1, while dragging
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
    nksf: 'NKS preset',
    fxp: 'Vanguard preset',
    spire: 'Spire preset',
    h2p: 'Zebra3 preset',
    programList: "Plug-in's own programs",
    userState: 'Captured by you',
    hardwarePatch: 'Hardware patch',
    rackCapture: 'Rack capture',
    chainCapture: 'Chain capture',
  };
  const sourceLabel = (value) => SOURCE_LABELS[value] ?? value;

  const AXIS_LABELS = {
    brightness: 'Brightness', attack: 'Attack', tail: 'Tail', width: 'Width', cost: 'Cost',
  };

  /** A record's own waveform, drawn from the envelope the auditioner measured. Mirrored around
      the middle and stretched to the tile, so the SHAPE reads at 190 pixels — a slow pad and a
      plucked bass are different objects before you read either name. */
  function thumbPoints(envelope) {
    const n = envelope.length;
    if (n === 0) return '';
    const top = envelope.map((v, i) => `${((i / (n - 1)) * 100).toFixed(1)},${(12 - v * 11).toFixed(1)}`);
    const bottom = envelope.map((v, i) => `${(((n - 1 - i) / (n - 1)) * 100).toFixed(1)},${(12 + v * 11).toFixed(1)}`);
    return [...top, ...bottom].join(' ');
  }

  /** What the preview cache costs, in a unit somebody can act on. Rounding 70 kB to "0 MB"
      makes the number look broken; below a megabyte it is kilobytes. */
  function cacheSize(bytes) {
    if (!(bytes > 0)) return '';
    if (bytes < 1048576) return ` · ${Math.round(bytes / 1024)} kB`;
    return ` · ${Math.round(bytes / 1048576)} MB`;
  }

  /** A rectangle on the map IS a query: two active ranges. That is why the selection is a
      rectangle and not a freehand loop — a loop could not be saved, re-run, or explained. */
  function lassoToQuery(box) {
    const next = normalizeLibraryQuery(query);
    next.ranges[axisX] = { min: Math.min(box.x0, box.x1), max: Math.max(box.x0, box.x1),
                           active: true };
    // Screen y grows downward and the axis grows upward, so the box flips on the way in.
    next.ranges[axisY] = { min: 1 - Math.max(box.y0, box.y1), max: 1 - Math.min(box.y0, box.y1),
                           active: true };
    return next;
  }

  function mapPoint(event) {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)),
             y: Math.min(1, Math.max(0, (event.clientY - box.top) / box.height)) };
  }

  function lassoDown(event) {
    const at = mapPoint(event);
    lasso = { x0: at.x, y0: at.y, x1: at.x, y1: at.y };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }
  function lassoMove(event) {
    if (!lasso) return;
    const at = mapPoint(event);
    lasso = { ...lasso, x1: at.x, y1: at.y };
  }
  function lassoUp() {
    if (!lasso) return;
    const box = lasso;
    lasso = null;
    // A click rather than a drag is not a selection.
    if (Math.abs(box.x1 - box.x0) < 0.02 || Math.abs(box.y1 - box.y0) < 0.02) return;
    ask(lassoToQuery(box));
  }

  function setRange(axis, key, value) {
    const next = normalizeLibraryQuery(query);
    const range = next.ranges[axis];
    range[key] = Math.min(1, Math.max(0, Number(value)));
    if (range.min > range.max) range[key === 'min' ? 'max' : 'min'] = range[key];
    range.active = true;
    ask(next);
  }

  function toggleRange(axis) {
    const next = normalizeLibraryQuery(query);
    next.ranges[axis].active = !next.ranges[axis].active;
    ask(next);
  }

  let records = $derived($hostLibrary.records.filter((record) => matchesPresetKind(record, presetKind)));
  let windowRows = $derived(presetWindow(records.length, scrollTop, listHeight, rowHeight));
  // Asking is cheap and the answer is per-record, so it is fetched on selection rather than
  // carried on every record in every library payload.
  let lastAskedSimilar = $state('');
  let selected = $derived(records.find((r) => r.recordId === selectedId) ?? records[0] ?? null);
  let loadResult = $derived($hostLibraryLoad.recordId === selected?.recordId ? $hostLibraryLoad : null);
  let updateIssues = $derived($hostLibrary.scanReport.filter((row) => row.reason || row.unavailable > 0).length);
  let facets = $derived($hostLibrary.facets);
  let filtered = $derived(!libraryQueryIsEmpty(query));

  function ask(next) {
    query = normalizeLibraryQuery(next);
    if (query.type !== 'preset') presetKind = 'all';
    scrollTop = 0;
    if (listElement) listElement.scrollTop = 0;
    requestLibrary(query);
  }

  function changeKind(value) {
    presetKind = ['instrument', 'effect'].includes(value) ? value : 'all';
    ask({ ...query, type: presetKind !== 'all' ? 'preset' : value === 'all' ? '' : value });
  }

  async function walkPresets(event) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter'].includes(event.key)
        || event.target.closest('[data-favourite]') || records.length === 0) return;
    event.preventDefault();
    if (event.key === 'Enter') { if (selected?.available) loadInto(selected, 'focused'); return; }
    const current = Math.max(0, records.findIndex((record) => record.recordId === selected?.recordId));
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? records.length - 1
      : Math.max(0, Math.min(records.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1)));
    selectRecord(records[index].recordId);
    if (listElement) {
      const top = index * rowHeight;
      if (top < listElement.scrollTop) listElement.scrollTop = top;
      else if (top + rowHeight > listElement.scrollTop + listHeight)
        listElement.scrollTop = top + rowHeight - listHeight;
      scrollTop = listElement.scrollTop;
      await tick();
      listElement.querySelector(`[data-row-index="${index}"] .preset-pick`)?.focus({ preventScroll: true });
    }
  }

  export function refresh() { ask(query); }
  export function search(text) { ask({ ...emptyLibraryQuery(), text }); }
  let audition = $derived($hostState.rack.presetAudition);
  let soundComparison = $derived($hostState.rack.soundComparison);
  let comparisonCandidates = $derived(records.filter(record => record.type === 'preset' && record.available
    && record.sourceType !== 'hardwarePatch' && focusedPart?.hasInstrument && !focusedPart.hardware
    && record.targetCeId === focusedPart.pluginCeId).slice(0, 20));

  function clickFacet(facet, value, event) {
    // Alt (or right-click) refuses outright; a plain click walks the three states.
    ask(cycleLibraryFacet(query, facet, value, event.altKey || event.button === 2));
  }

  function clickType(value) {
    ask({ ...query, type: query.type === value ? '' : value });
  }

  function loadInto(record, action) {
    if (!record?.available || ($hostLibraryLoad.recordId === record.recordId && $hostLibraryLoad.phase === 'loading')) return;
    if (record.type === 'rack') { loadLibraryRecord(record.recordId); return; }
    if ((!focusedPart && action !== 'add') || (record.isEffect && !focusedPart)) return;
    const partId = action === 'focused' || record.isEffect ? focusedPart?.partId : undefined;
    // With audition on, loading IS the phrase: the native side commits the preset and then
    // plays, one command, so the note never lands on the sound that was there before.
    if (auditionOn && action !== 'add' && record.type === 'preset') auditionLibraryRecord(record.recordId, action, partId);
    else loadLibraryRecord(record.recordId, action, partId);
  }

  /** The axes that agreed, and the one that did not — a percentage nobody can argue with is
      worse than one they can. */
  const agreedAxes = (match) => match.axes.slice(0, 3)
    .map((a) => AXIS_LABELS[a.axis]?.toLowerCase() ?? a.axis);
  const gaveUp = (match) => {
    const worst = match.axes[match.axes.length - 1];
    if (!worst || Math.abs(worst.delta) < 0.05) return '';
    const axis = AXIS_LABELS[worst.axis]?.toLowerCase() ?? worst.axis;
    return `${worst.delta > 0 ? 'more' : 'less'} ${axis}`;
  };

  function selectRecord(recordId) {
    selectedId = recordId;
    if (recordId && recordId !== lastAskedSimilar) {
      lastAskedSimilar = recordId;
      similarSounds(recordId);
    }
  }

  // Two sounds of the focused part's plug-in become the ends of its morph: the selected one
  // is A, the one you point at is B, and from then on the part's "@morph" address rides the
  // line between them — from the slider in the rail, or from whatever macro you put it on.
  // The native side refuses a pair the plug-in cannot read both ends of; here the only gate
  // is having a part with an instrument to move.
  const canMorph = $derived(Boolean(focusedPart?.hasInstrument && selected && selected.type === 'preset'));
  function morphWith(recordIdB) {
    if (!canMorph || !recordIdB || recordIdB === selected.recordId) return;
    setMorph(focusedPart.partId, selected.recordId, recordIdB);
  }
  function clickDot(event, record) {
    // Shift-click on the map picks the second end of a morph; a plain click selects.
    if (event.shiftKey && canMorph && record.recordId !== selected?.recordId) {
      morphWith(record.recordId);
      return;
    }
    clickTile(record);
  }

  function clickTile(record) {
    selectRecord(record.recordId);
    // Selecting shows it; loading is the button. A single click that both selects and loads is
    // how the old list put an instrument somewhere nobody expected. With audition on, a click
    // makes a SOUND — the stored snapshot answers immediately and the plug-in takes over when
    // it arrives, which is the whole difference between browsing and waiting.
    if (auditionOn && record.available && !record.isEffect) auditionRecord(record.recordId);
  }

  /** When a save happened, in the words somebody would use out loud. */
  function whenSaved(ms) {
    const seconds = Math.max(0, (Date.now() - ms) / 1000);
    if (seconds < 90) return 'just now';
    if (seconds < 5400) return `${Math.round(seconds / 60)} min ago`;
    if (seconds < 172800) return `${Math.round(seconds / 3600)} h ago`;
    return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }

  function saveVersion() {
    if (!selected) return;
    commitVersion(selected.recordId, versionLabel.trim() || undefined);
    versionLabel = '';
    namingVersion = false;
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

<div class="browser" data-testid="host-sound-browser" aria-label="Sound browser" style={`--preset-row-height:${rowHeight}px`}>
  <div class="head">
    <input type="search" class="search" data-testid="browser-search"
           placeholder="Search sounds, chains and racks…"
           value={query.text}
           oninput={(e) => ask({ ...query, text: e.currentTarget.value })} />
    <select aria-label="Preset type" value={presetKind !== 'all' ? presetKind : query.type || 'all'}
            onchange={(event) => changeKind(event.currentTarget.value)}>
      <option value="all">Everything</option><option value="preset">All presets</option>
      <option value="instrument">Instruments</option><option value="effect">Effects</option>
      <option value="chain">Chains</option><option value="rack">Racks</option>
    </select>
    <select aria-label="Plug-in filter" value={query.facets.instruments.include.length === 1 ? query.facets.instruments.include[0] : ''}
            onchange={(event) => ask({ ...query, facets: { ...query.facets, instruments: { include: event.currentTarget.value ? [event.currentTarget.value] : [], exclude: [] } } })}>
      <option value="">{query.facets.instruments.include.length > 1 ? 'Multiple plug-ins' : 'All plug-ins'}</option>
      {#each facets.instruments as plugin (plugin.value)}<option value={plugin.value}>{plugin.value}</option>{/each}
    </select>
    <button type="button" class="toggle" class:on={query.favouritesOnly} aria-label="Show favourites"
            aria-pressed={query.favouritesOnly} onclick={() => ask({ ...query, favouritesOnly: !query.favouritesOnly })}>★</button>
    <button type="button" class="toggle" class:on={filtersOpen} aria-expanded={filtersOpen}
            onclick={() => (filtersOpen = !filtersOpen)}>Filters{filtered ? ' •' : ''}</button>
    <button type="button" class="toggle" class:on={detailsOpen} aria-expanded={detailsOpen}
            data-testid="browser-details" onclick={() => (detailsOpen = !detailsOpen)}>Details</button>
  </div>

  <div class="body">
    <div class="main">
      {#if filtersOpen}
      <div class="facets" data-testid="browser-facets">
      {#if audition.enabled}
        <div class="audition-config" data-testid="host-audition-config">
          <strong>Audition phrase</strong>
          <label>Phrase
            <select value={audition.phrase}
                    onchange={(e) => setPresetAudition({ phrase: e.currentTarget.value })}>
              <option value="single">Single note</option>
              <option value="chord">Major chord</option>
              <option value="scale">Major scale</option>
              <option value="riff">Short riff</option>
            </select>
          </label>
          <label>Root
            <span class="number-with-note">
              <input type="number" min="0" max="127" value={audition.rootNote}
                     onchange={(e) => setPresetAudition({ rootNote: Number(e.currentTarget.value) })} />
              <small>{noteName(audition.rootNote)}</small>
            </span>
          </label>
          <label>Velocity
            <input type="number" min="1" max="127" value={audition.velocity}
                   onchange={(e) => setPresetAudition({ velocity: Number(e.currentTarget.value) })} />
          </label>
          <label>Length
            <span class="number-unit"><input type="number" min="40" max="4000" step="10"
                     value={audition.noteLengthMs}
                     onchange={(e) => setPresetAudition({ noteLengthMs: Number(e.currentTarget.value) })} /><small>ms</small></span>
          </label>
          {#if audition.phrase === 'scale' || audition.phrase === 'riff'}
            <label>Gap
              <span class="number-unit"><input type="number" min="0" max="2000" step="10"
                       value={audition.gapMs}
                       onchange={(e) => setPresetAudition({ gapMs: Number(e.currentTarget.value) })} /><small>ms</small></span>
            </label>
          {/if}
          <span class="audition-help">Click a preset name to load and hear it.</span>
        </div>
      {/if}

        <div class="browse-settings">      <label class="rail-setting">View <select aria-label="Browser view" bind:value={view}>
        <option value="list">List</option><option value="grid">Grid</option><option value="map">Map</option>
      </select></label>
      <label class="rail-setting">Spacing <select aria-label="Preset row spacing" value={comfortable ? 'comfortable' : 'compact'}
        onchange={(event) => { comfortable = event.currentTarget.value === 'comfortable'; scrollTop = 0; if (listElement) listElement.scrollTop = 0; }}>
        <option value="compact">Compact</option><option value="comfortable">Comfortable</option>
      </select></label>
      <button type="button" class="toggle" class:on={$hostSurfaceBrowse.browsing} data-testid="mirror-toggle"
              onclick={() => browseOnSurface(!$hostSurfaceBrowse.browsing)}>⌘ Browse on controller</button>
</div>
        <div class="browse-collections">      <div class="rail-head">Library</div>
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
            <HostConfirmButton identity={JSON.stringify([collection.collectionId])} aria-label="Remove smart collection" type="button" class="ghost danger" title="Forget this search"
                    onclick={() => removeSmartCollection(collection.collectionId)}>×</HostConfirmButton>
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

      <button type="button" class="rail-item" class:on={query.measuredOnly}
              title="Only sounds the auditioner has played"
              onclick={() => ask({ ...query, measuredOnly: !query.measuredOnly })}>
        <span>Measured</span><span class="n">{$hostLibrary.counts.measured}</span>
      </button>

</div>
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

        {#if $hostLibrary.counts.measured > 0}
          <div class="measured" data-testid="measured-strip">
            <span class="flabel">Measured</span>
            {#each MEASURED_AXES as axis (axis)}
              {@const range = query.ranges[axis]}
              <div class="axis" class:on={range.active}>
                <button type="button" class="axis-name" data-testid="axis-toggle"
                        title={range.active ? 'Stop filtering on this' : 'Filter on this'}
                        onclick={() => toggleRange(axis)}>
                  {AXIS_LABELS[axis]}
                  <span class="axis-value">
                    {range.active
                      ? `${measuredLabel(axis, range.min)} – ${measuredLabel(axis, range.max)}`
                      : 'any'}
                  </span>
                </button>
                <input type="range" min="0" max="1" step="0.01" value={range.min}
                       aria-label={`${AXIS_LABELS[axis]} minimum`}
                       oninput={(e) => setRange(axis, 'min', e.currentTarget.value)} />
                <input type="range" min="0" max="1" step="0.01" value={range.max}
                       aria-label={`${AXIS_LABELS[axis]} maximum`}
                       oninput={(e) => setRange(axis, 'max', e.currentTarget.value)} />
              </div>
            {/each}
          </div>
        {/if}

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
        <div class="mapwrap" data-testid="sound-map">
          <div class="mapaxes">
            <span class="flabel">Across</span>
            {#each MEASURED_AXES.filter((a) => a !== axisY) as axis (axis)}
              <button type="button" class="chip" class:on={axisX === axis}
                      onclick={() => (axisX = axis)}>{AXIS_LABELS[axis]}</button>
            {/each}
          </div>
          <div class="mapaxes">
            <span class="flabel">Up</span>
            {#each MEASURED_AXES.filter((a) => a !== axisX) as axis (axis)}
              <button type="button" class="chip" class:on={axisY === axis}
                      onclick={() => (axisY = axis)}>{AXIS_LABELS[axis]}</button>
            {/each}
          </div>

          <div class="map" role="presentation"
               onpointerdown={lassoDown} onpointermove={lassoMove} onpointerup={lassoUp}>
            {#each records.filter((r) => r.sonic) as record (record.recordId)}
              {@const x = record.sonic[axisX]}
              {@const y = 1 - record.sonic[axisY]}
              <button type="button" class="dot"
                      class:sel={record.recordId === selected?.recordId}
                      class:unavailable={!record.available}
                      data-testid="map-dot"
                      style={`left:${(x * 100).toFixed(2)}%;top:${(y * 100).toFixed(2)}%`}
                      title={`${record.name} — ${measuredLabel(axisX, record.sonic[axisX])} × ${measuredLabel(axisY, record.sonic[axisY])}`}
                      onmouseenter={() => (hovered = record)}
                      onmouseleave={() => (hovered = null)}
                      onclick={(e) => clickDot(e, record)}></button>
            {/each}
            {#if canMorph}
              <span class="maphint">shift-click a second dot to morph {partTitle(focusedPart)} between them</span>
            {/if}

            {#if lasso}
              <div class="lasso"
                   style={`left:${Math.min(lasso.x0, lasso.x1) * 100}%;top:${Math.min(lasso.y0, lasso.y1) * 100}%;width:${Math.abs(lasso.x1 - lasso.x0) * 100}%;height:${Math.abs(lasso.y1 - lasso.y0) * 100}%`}></div>
            {/if}

            <span class="axlabel x0">{measuredLabel(axisX, 0)}</span>
            <span class="axlabel x1">{measuredLabel(axisX, 1)}</span>
            <span class="axlabel y0">{measuredLabel(axisY, 0)}</span>
            <span class="axlabel y1">{measuredLabel(axisY, 1)}</span>

            {#if hovered}
              <div class="mapcard"
                   style={`left:${Math.min(78, hovered.sonic[axisX] * 100)}%;top:${Math.min(72, (1 - hovered.sonic[axisY]) * 100)}%`}>
                <span class="mapcard-name">{hovered.name}</span>
                <span class="mapcard-sub">{detailLine(hovered)}</span>
                <span class="mapcard-nums">
                  {AXIS_LABELS[axisX].toLowerCase()} {measuredLabel(axisX, hovered.sonic[axisX])}
                  · {AXIS_LABELS[axisY].toLowerCase()} {measuredLabel(axisY, hovered.sonic[axisY])}
                </span>
              </div>
            {/if}
          </div>

          <div class="mapfoot">
            <span class="hint">
              Drag a box to keep what is inside it — a box on two measured axes is a search, so
              it can be saved and run again. {records.filter((r) => r.sonic).length} of
              {records.length} shown; the rest have not been listened to.
            </span>
          </div>
        </div>
      {:else if records.length === 0}
        <div class="empty-hint">
          {$hostLibrary.counts.total === 0
            ? 'No saved sounds yet. Open Library → Update library, or capture the focused part.'
            : 'Nothing matches. Clear a chip, or refuse fewer things.'}
        </div>
      {:else if view === 'list'}
        <div class="preset-heading" aria-hidden="true"><span>★</span><span>Preset</span><span>Plug-in</span><span class="preset-category">Category</span><span>Type</span></div>
        <div class="preset-list" data-testid="preset-list" bind:this={listElement} bind:clientHeight={listHeight}
             onscroll={(event) => (scrollTop = event.currentTarget.scrollTop)} role="group" aria-label="Preset list">
          <div style={`height:${windowRows.before}px`} aria-hidden="true"></div>
          {#each records.slice(windowRows.start, windowRows.end) as record, offset (record.recordId)}
            <div class="preset-row" class:sel={record.recordId === selected?.recordId} class:unavailable={!record.available}
                 data-testid="preset-row" data-row-index={windowRows.start + offset}>
              <button type="button" class="preset-star" data-favourite aria-label={`${record.favourite ? 'Remove' : 'Add'} favourite: ${record.name}`}
                      aria-pressed={record.favourite} onclick={() => setLibraryUserMetadata(record.recordId, { favourite: !record.favourite })}>{record.favourite ? '★' : '☆'}</button>
              <button type="button" class="preset-pick" aria-pressed={record.recordId === selected?.recordId}
                      title={record.available ? `${record.name} — ${record.instrument}` : record.reason}
                      onkeydown={walkPresets} onclick={() => selectRecord(record.recordId)} ondblclick={() => loadInto(record, 'focused')}>
                <span class="preset-name">{record.name}</span><span>{record.instrument || '—'}</span>
                <span class="preset-category">{record.category || '—'}</span>
                <span class="preset-kind">{!record.available ? 'Missing' : record.isEffect ? 'FX' : record.type === 'rack' ? 'Rack' : record.type === 'chain' ? 'Chain' : record.sourceType === 'hardwarePatch' ? 'HW' : 'Inst'}</span>
              </button>
            </div>
          {/each}
          <div style={`height:${windowRows.after}px`} aria-hidden="true"></div>
        </div>
      {:else}
        <div class="grid" data-testid="browser-grid">
          {#each records as record (record.recordId)}
            <div class="tile" class:sel={record.recordId === selected?.recordId}
                 class:unavailable={!record.available}>
              <!-- Every tile keeps the thumbprint's space whether or not there is one yet, so
                   the grid does not reflow as the auditioner works through it. An unheard sound
                   draws the line and says so, which is different from drawing a flat sound. -->
              {#if record.sonic}
                <svg class="thumb" viewBox="0 0 100 24" preserveAspectRatio="none"
                     data-testid="tile-thumb" aria-hidden="true">
                  <polygon points={thumbPoints(record.sonic.envelope)} />
                  <line x1="0" y1="12" x2="100" y2="12" />
                </svg>
              {:else if record.sonicRefusal}
                <div class="thumb unheard refused" title={record.sonicRefusal}
                     data-testid="tile-refused">
                  <span>could not be heard</span>
                </div>
              {:else}
                <div class="thumb unheard" title="Not listened to yet">
                  <span>not heard yet</span>
                </div>
              {/if}
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
                  {#if record.isEffect}<span class="badge">FX</span>{/if}
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
                  <button type="button" disabled={!record.available || (record.isEffect && !focusedPart)} title={record.isEffect ? 'Add an effect to the focused part' : 'Add as a new part'}
                          onclick={() => loadInto(record, 'add')}>+</button>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    {#if detailsOpen}
      <div class="inspector" data-testid="browser-inspector">
      {#if focusedPart?.morph}
        <!-- Two sounds of one plug-in and the line between them. The slider is the part's
             "@morph" address, the same one a macro or a knob rides; nothing here is a save. -->
        <div class="rail-head">Morph</div>
        <div class="morph" data-testid="host-morph">
          <div class="morph-ends">
            <span class="morph-end" title={focusedPart.morph.nameA}>{focusedPart.morph.nameA}</span>
            <span class="morph-arrow">↔</span>
            <span class="morph-end b" title={focusedPart.morph.nameB}>{focusedPart.morph.nameB}</span>
          </div>
          <input type="range" min="0" max="100" step="1" data-testid="morph-ride"
                 aria-label={`Morph ${partTitle(focusedPart)} between ${focusedPart.morph.nameA} and ${focusedPart.morph.nameB}`}
                 disabled={!focusedPart.morph.live}
                 value={Math.round(focusedPart.morph.amount * 100)}
                 oninput={(e) => setParameter(focusedPart.partId, '@morph', Number(e.currentTarget.value) / 100)} />
          {#if focusedPart.morph.refusal}
            <div class="notes bad" data-testid="morph-refusal">{focusedPart.morph.refusal}</div>
          {:else if !focusedPart.morph.live}
            <div class="notes">Load the instrument to ride it.</div>
          {:else}
            <div class="notes">On a macro: it is <b>Morph</b> in {partTitle(focusedPart)}'s parameter list — M+ puts it on the selected macro, ⚡ on a knob.</div>
          {/if}
          <HostConfirmButton identity={JSON.stringify([focusedPart.partId])} aria-label="Clear morph" type="button" class="ghost morph-clear" data-testid="morph-clear"
                  title="Forget the pair. The sound stays where the ride left it."
                  onclick={() => clearMorph(focusedPart.partId)}>Clear the morph</HostConfirmButton>
        </div>
      {/if}


        {#if selected}
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

        {#if !selected.sonic && selected.sonicRefusal}
          <div class="insp-block">
            <div class="insp-head">Why it has no measurement</div>
            <!-- "Tried and it did not work" is a different thing to be told from "not heard
                 yet", and it is the one that has an answer: the auditioner will not ask again
                 unless somebody asks for everything to be measured again. -->
            <div class="notes" data-testid="inspector-refusal">{selected.sonicRefusal}
              It will not be asked again on its own — <em>Measure everything again</em>, beside
              the listen button, is the way back to it.</div>
          </div>
        {/if}

        {#if selected.sonic}
          <div class="insp-block">
            <div class="insp-head">What it measured like</div>
            {#if selected.sonic.silent}
              <div class="notes">The probe played a note and nothing came out. That is worth
                knowing rather than hiding — it usually means the sound needs a pedal, or the
                plug-in refused the state.</div>
            {:else}
              <div class="kv">
                <span class="k">Brightness</span>
                <span class="v">{measuredLabel('brightness', selected.sonic.brightness)} centroid</span>
                <span class="k">Attack</span>
                <span class="v">{measuredLabel('attack', selected.sonic.attack)}</span>
                <span class="k">Tail</span>
                <span class="v">{measuredLabel('tail', selected.sonic.tail)}</span>
                <span class="k">Width</span>
                <span class="v">{selected.sonic.width < 0.05 ? 'mono'
                                  : `${selected.sonic.width.toFixed(2)} stereo`}</span>
                <span class="k">Touch</span>
                <span class="v">{selected.sonic.dynamics < 0.05 ? 'ignores velocity'
                                  : selected.sonic.dynamics.toFixed(2)}</span>
                <span class="k">Cost</span>
                <span class="v">{selected.sonic.costPercent.toFixed(1)}% of one core</span>
              </div>
            {/if}
          </div>
        {/if}

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

        {#if $hostSimilar.recordId === selected.recordId && $hostSimilar.matches.length > 0}
          <div class="insp-block">
            <div class="insp-head">Sounds like</div>
            {#each $hostSimilar.matches as match (match.recordId)}
              <div class="subrow">
                <button type="button" class="ghost simrow" data-testid="similar-row"
                        title={`${agreedAxes(match).join(', ')} agree${gaveUp(match) ? ` — but ${gaveUp(match)}` : ''}`}
                        onclick={() => selectRecord(match.recordId)}>
                  <span class="simname">{match.name}</span>
                  <span class="simpct">{match.percent}%</span>
                </button>
                <!-- A neighbour is a sound you could be halfway to. The pair goes on the
                     focused part; riding it is the rail's slider or a macro. -->
                <button type="button" class="ghost keep morph-with" data-testid="morph-with"
                        disabled={!canMorph}
                        title={canMorph
                                 ? `Morph ${partTitle(focusedPart)} between ${selected.name} and ${match.name}`
                                 : 'Focus a part with an instrument first'}
                        onclick={() => morphWith(match.recordId)}>MORPH</button>
              </div>
            {/each}
            <div class="notes simwhy">
              Closest on {agreedAxes($hostSimilar.matches[0]).join(', ')}.
              {#if gaveUp($hostSimilar.matches[0])}
                What you give up: {gaveUp($hostSimilar.matches[0])}.
              {/if}
            </div>
          </div>
        {/if}

        {#if selected.type === 'rack'}
          <div class="insp-block">
            <div class="insp-head">
              Will it play here?
              <button type="button" class="ghost more" data-testid="check-rack"
                      onclick={() => rackSubstitutes(selected.recordId)}>CHECK</button>
            </div>
            {#if $hostSubstitutes && $hostSubstitutes.recordId === selected.recordId}
              {#if $hostSubstitutes.needing === 0}
                <div class="notes">Every plug-in this rack wants is installed.</div>
              {:else}
                <div class="subneed" data-testid="substitute-need">
                  {$hostSubstitutes.needing} of {$hostSubstitutes.parts.length} parts need a substitute.
                </div>
                {#each $hostSubstitutes.parts.filter((p) => !p.installed) as part (part.partId)}
                  <div class="subpart">
                    <div class="subwant">
                      wants <b>{part.pluginName}</b>{#if part.presetName} · {part.presetName}{/if}
                    </div>
                    {#if part.candidates.length === 0}
                      <div class="notes">
                        {part.measured
                          ? 'Nothing you own measures close enough to offer.'
                          : 'This part was never listened to, so there is nothing to match against.'}
                      </div>
                    {:else}
                      {#each part.candidates as candidate, index (candidate.recordId)}
                        {@const chosen = part.remembered === candidate.recordId}
                        <div class="subrow" class:chosen>
                          <button type="button" class="ghost simrow" class:best={index === 0}
                                  data-testid="substitute-candidate"
                                  title={`Load ${candidate.name} onto this part instead`}
                                  onclick={() => loadLibraryRecord(candidate.recordId, 'replace', part.partId)}>
                            <span class="simname">{candidate.name}</span>
                            <span class="simpct">{candidate.percent}%</span>
                          </button>
                          <!-- Choosing is explicit and reversible. Loading a substitute to hear
                               it is not the same act as deciding it is the answer, and nothing
                               here is written down behind your back. -->
                          <button type="button" class="ghost keep" class:on={chosen}
                                  data-testid="substitute-keep"
                                  title={chosen
                                    ? 'Forget this choice — the list goes back to nearest-first'
                                    : 'Offer this one first next time, on this computer'}
                                  onclick={() => rememberSubstitute(part.pluginCeId, part.presetName,
                                                                   chosen ? '' : candidate.recordId,
                                                                   selected.recordId)}>
                            {chosen ? 'CHOSEN' : 'KEEP'}
                          </button>
                        </div>
                      {/each}
                      <div class="notes simwhy">
                        {agreedAxes(part.candidates[0]).join(', ')} agree{gaveUp(part.candidates[0])
                          ? ` — ${gaveUp(part.candidates[0])}` : ''}. The rack keeps naming
                        {part.pluginName}, so it plays properly again the day that comes back.
                      </div>
                      {#if part.remembered}
                        <div class="notes simwhy" data-testid="substitute-chosen-note">
                          Your choice, kept on this computer only — a Sound Pack you hand
                          somebody does not carry it.
                        </div>
                      {/if}
                    {/if}
                  </div>
                {/each}
              {/if}
            {:else}
              <div class="notes">A captured rack names the plug-ins it wants. Check what this
                machine has.</div>
            {/if}
          </div>
        {/if}

        {#if selected.type !== 'rack'}
        <div class="insp-block">
          <div class="insp-head">
            Saves
            {#if selected.versions.length > 1 || selected.branchedFrom}
              <button type="button" class="ghost more" data-testid="show-diff"
                      title="What changed between the first of these and now"
                      onclick={() => diffVersions(selected.recordId)}>WHAT CHANGED?</button>
            {/if}
          </div>

          {#if selected.versions.length === 0}
            <div class="notes">
              {selected.factory
                ? 'A vendor preset. Saving over it makes a sound of your own instead — the vendor keeps theirs.'
                : 'No saves yet. Saving keeps a version rather than writing over this one.'}
            </div>
          {:else}
            <div class="vrail" data-testid="version-rail">
              {#each [...selected.versions].reverse() as version, index (version.versionId)}
                <div class="vrow" class:now={index === 0}>
                  <i class="pip" class:origin={version.origin}></i>
                  <button type="button" class="ghost vlabel" data-testid="version-row"
                          title="Put this one back on the part"
                          onclick={() => applyVersion(selected.recordId, version.versionId)}>
                    {version.label || (index === 0 ? 'the current sound' : 'an unnamed save')}
                  </button>
                  <span class="vwhen">{whenSaved(version.savedAtMs)}</span>
                </div>
              {/each}
            </div>
          {/if}

          {#if selected.versions.length > 1}
            <!-- Two saves of one sound are two points, and everything between them is a sound
                 too. The rail picks one; this crosses from the first to the last without
                 keeping either. Nothing is written until you save the result. -->
            <div class="vblend">
              <label for="blend-{selected.recordId}">first</label>
              <input id="blend-{selected.recordId}" type="range" min="0" max="100" step="1"
                     data-testid="version-blend" bind:value={blendAmount}
                     oninput={() => morphVersions(selected.recordId,
                                                  selected.versions[0].versionId,
                                                  selected.versions[selected.versions.length - 1].versionId,
                                                  blendAmount / 100)} />
              <label for="blend-{selected.recordId}">now</label>
            </div>
          {/if}

          {#if selected.branchedFromName}
            <div class="branched">branched from <b>{selected.branchedFromName}</b></div>
          {/if}

          <div class="vsave">
            {#if namingVersion}
              <input class="name-field" placeholder="Name this save…" bind:value={versionLabel}
                     data-testid="version-name"
                     onkeydown={(e) => e.key === 'Enter' && saveVersion()} />
              <button type="button" data-testid="save-version" onclick={saveVersion}>Save</button>
              <button type="button" class="ghost" onclick={() => (namingVersion = false)}>Cancel</button>
            {:else}
              <button type="button" data-testid="commit-version"
                      title="Keep the part's current sound as another save of this record"
                      onclick={() => commitVersion(selected.recordId)}>Save this state</button>
              <button type="button" class="ghost" onclick={() => (namingVersion = true)}>Name it…</button>
            {/if}
          </div>
        </div>
        {/if}

        {#if !selected.factory}
          <HostConfirmButton identity={JSON.stringify([selected.recordId])} title="Remove library record" aria-label="Remove library record" type="button" class="ghost danger insp-remove"
                  onclick={() => removeLibraryRecord(selected.recordId)}>Remove this record</HostConfirmButton>
        {/if}
        {:else}
          <div class="empty-hint">No preset selected.</div>
        {/if}
      </div>
    {/if}
  </div>

  {#if $hostSurfaceBrowse.browsing}
    <!-- What the hardware is showing, mirrored. Not a decoration: browsing without looking at
         the computer only works if you can check, once, that the two agree. -->
    <div class="mirror" data-testid="surface-mirror">
      <div class="lcd">
        <div class="lcd-head">
          <span>{$hostSurfaceBrowse.title}</span>
          <span>{$hostSurfaceBrowse.total}</span>
        </div>
        {#each $hostSurfaceBrowse.rows as row (row.name + row.detail)}
          <div class="lcd-row" class:on={row.current} class:dim={!row.available}>
            <i class="lcd-pip" class:lit={row.current}></i>
            <span class="lcd-name">{row.name}</span>
            <span class="lcd-detail">{row.detail}</span>
          </div>
        {/each}
        {#if $hostSurfaceBrowse.rows.length === 0}
          <div class="lcd-row"><span class="lcd-name">nothing matches</span></div>
        {/if}
        <div class="lcd-foot">
          <button type="button" class="ghost lcd-btn"
                  onclick={() => browseTurn(0, -1)}>◀ PREV</button>
          <span>PUSH = LOAD</span>
          <button type="button" class="ghost lcd-btn"
                  onclick={() => browseTurn(0, 1)}>NEXT ▶</button>
        </div>
      </div>

      <div class="mirror-right">
        <div class="encgrid">
          {#each $hostSurfaceBrowse.encoders as knob, index (index)}
            <button type="button" class="enc" class:act={knob.role === 'scroll'}
                    class:inert={knob.role === ''} data-testid="mirror-encoder"
                    title={knob.role === '' ? 'Drawn, and honestly inert — this browser has nothing for it'
                           : `Turn ${knob.label.toLowerCase()}`}
                    disabled={knob.role === ''}
                    onclick={() => browseTurn(index, 1)}>
              <span class="enc-n">ENC {index + 1}</span>
              <span class="enc-v">{knob.label}{knob.value ? `: ${knob.value}` : ''}</span>
            </button>
          {/each}
        </div>

        {#if $hostSurfaceBrowse.pads.length > 0}
          <div class="padgrid">
            {#each $hostSurfaceBrowse.pads as pad, index (index)}
              <button type="button" class="pad" class:dim={!pad.available}
                      data-testid="mirror-pad"
                      title={`Pad ${index + 1}: ${pad.name}`}
                      onclick={() => browsePad(index)}>{pad.name}</button>
            {/each}
          </div>
        {/if}

        <div class="mirror-note">
          {#if $hostSurfaceBrowse.limitations}
            <b>This controller:</b> {$hostSurfaceBrowse.limitations}
          {:else}
            {$hostSurfaceBrowse.surface.encoders} encoders ·
            {$hostSurfaceBrowse.surface.pads} pads{$hostSurfaceBrowse.pads.length
              < $hostSurfaceBrowse.surface.pads
              ? ` (${$hostSurfaceBrowse.pads.length} holding something)` : ''} ·
            {$hostSurfaceBrowse.surface.hasDisplay
              ? `${$hostSurfaceBrowse.surface.displayRows}-row screen`
              : 'no screen'}. The browser is built from what this surface says it has, not from
            a list of blessed devices.
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
          <button type="button" class="ghost" title="Previous preset"
                  onclick={() => stepSoundComparison(-1)}>‹ Previous</button>
          <button type="button" class="ghost" title="Next preset"
                  onclick={() => stepSoundComparison(1)}>Next ›</button>
          <button type="button" class="compare-keep" onclick={() => keepSoundComparison()}>
            Keep this sound
          </button>
          <button type="button" class="ghost" onclick={() => cancelSoundComparison()}>
            Cancel · restore original
          </button>
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
    <label class="audition-toggle"><input type="checkbox" checked={auditionOn} onchange={onToggleAudition}
           data-testid="host-audition" />Audition on load</label>
        <button type="button" data-testid="host-start-sound-comparison"
                disabled={soundComparison.active || comparisonCandidates.length < 2}
                title={comparisonCandidates.length >= 2
                  ? `Compare ${comparisonCandidates.length} visible presets with the audition phrase`
                  : 'Show at least two presets for the focused instrument'}
                onclick={() => startSoundComparison(focusedPart.partId,
                  comparisonCandidates.map((record) => record.recordId))}>
          Compare visible ({comparisonCandidates.length})
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
    <span>{records.length} shown · {$hostLibrary.counts.total} saved{#if $hostLibrary.scanning} · Updating library…{/if}</span>
    {#if $hostLibrary.updateFinished && !$hostLibrary.scanning}
      <button type="button" class="ghost" onclick={onManageLibrary} data-testid="library-update-result">{!$hostLibrary.scanReport.length ? 'No plug-ins available · View results' : updateIssues ? `Update finished · ${updateIssues} ${updateIssues === 1 ? 'plug-in needs' : 'plug-ins need'} attention` : 'Library updated'}</button>
    {/if}
    {#if $hostAudition.stage === 'loading' || $hostAudition.stage === 'snapshot' || $hostAudition.stage === 'live'}
      <span>{$hostAudition.detail || $hostAudition.stage}<button type="button" class="ghost" onclick={stopAudition}>Stop</button></span>
    {:else}<span>↑ ↓ select · Enter load</span>{/if}
  </div>

  <!-- The audition bar. It is the answer to "what am I hearing, and what is it playing" — the
       two questions a preview that swaps sources underneath you has to keep answering. -->
  <div class="audition" data-testid="audition-bar">
    <button type="button" class="play"
            disabled={!selected || !selected.available || selected.isEffect || selected.type !== 'preset'}
            title={selected?.instant ? 'Play the stored preview now'
                                     : 'Load and play — this one has no preview yet'}
            onclick={() => selected && auditionRecord(selected.recordId)}>▶</button>

    <div class="now">
      <span class="now-name">{$hostAudition.recordId
        ? (records.find((r) => r.recordId === $hostAudition.recordId)?.name ?? selected?.name ?? '—')
        : (selected?.name ?? 'Nothing selected')}</span>
      <span class="now-stage" data-testid="audition-stage">
        {#if $hostAudition.stage === 'snapshot'}
          <i class="pip snap"></i>preview · the plug-in is still loading
        {:else if $hostAudition.stage === 'loading'}
          <i class="pip none"></i>{$hostAudition.detail || 'loading…'}
        {:else if $hostAudition.stage === 'live'}
          <i class="pip live"></i>the real thing{$hostAudition.detail ? ` · ${$hostAudition.detail}` : ''}
        {:else if $hostAudition.stage === 'silent'}
          <i class="pip none"></i>{$hostAudition.detail}
        {:else if selected?.type === 'rack' || selected?.sourceType === 'hardwarePatch'}
          <i class="pip none"></i>loads rather than previews
        {:else if selected}
          <i class="pip" class:snap={selected.instant} class:none={!selected.instant}></i>
          {selected.instant ? 'previews instantly' : 'no preview yet — would load first'}
        {/if}
      </span>
    </div>

    <div class="phrase">
      <span class="phrase-label">Play with</span>
      {#each [['note', 'A note'], ['chord', 'A chord'], ['recent', `Your last ${$hostAudition.bars} bars`]] as [mode, label] (mode)}
        <button type="button" class="toggle" class:on={$hostAudition.phrase === mode}
                data-testid="phrase-mode"
                title={mode === 'recent'
                       ? 'Audition with the line you were just playing, at your tempo'
                       : `Audition with ${label.toLowerCase()}`}
                onclick={() => setAuditionPhrase(mode)}>{label}</button>
      {/each}
    </div>

    <span class="cache" title="Previews are a cache — the least recently heard are dropped first">
      {$hostLibrary.counts.snapshots} previews{cacheSize($hostLibrary.counts.snapshotBytes)}
    </span>

    <button type="button" class="ghost" onclick={() => stopAudition()}>Stop</button>
  </div>
</div>

<style>
  .browse-settings, .browse-collections { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 8px; }
  .browse-collections .rail-head { flex-basis: 100%; margin: 3px 0; }
  .browse-collections .rail-item { width: auto; gap: 8px; }
  .browse-settings .rail-setting { margin: 0; }
  .audition-config {
    display: flex; align-items: end; gap: 10px; flex-wrap: wrap;
    padding: 7px 9px;
    border: 1px solid var(--host-line);
    background: #171c21;
  }
  .audition-config strong { align-self: center; color: #d7dde3; font-size: 12px; }
  .audition-config label {
    display: flex; flex-direction: column; gap: 3px;
    color: #96a2ad; font-size: 10px; text-transform: uppercase;
  }
  .audition-config select { width: 112px; }
  .audition-config input[type="number"] { width: 66px; }
  .number-with-note, .number-unit { display: inline-flex; align-items: center; gap: 4px; }
  .number-with-note small, .number-unit small { color: #b7c1ca; font-size: 11px; text-transform: none; }
  .audition-help { align-self: center; color: #78848f; font-size: 11px; }
  .sound-compare {
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    padding: 8px 10px;
    border: 1px solid #d66f24;
    background: linear-gradient(90deg, #2a1c13, #171c21 42%);
  }
  .compare-slot {
    display: inline-flex; align-items: baseline; justify-content: center;
    min-width: 44px; color: #ff9a47; font-size: 22px; font-weight: 750;
  }
  .compare-slot small { color: #a87955; font-size: 11px; }
  .compare-copy { display: flex; flex: 1 1 180px; min-width: 150px; flex-direction: column; }
  .compare-copy small { color: #9f8877; font-size: 10px; }
  .compare-copy strong { color: #f1f3f5; font-size: 13px; }
  .compare-keep { border-color: #d66f24; color: #ffd7b7; }

  /* The workspace's controls, repeated because Svelte scopes them: InstrumentHostView's
     button/input rules stop at its own markup, and a browser wearing the browser's default
     chrome inside a dark tool is the first thing rendering it showed. Same values as there. */
  button {
    background: var(--host-surface-raised);
    border: 1px solid var(--host-line);
    border-radius: 4px;
    color: var(--host-text);
    padding: 4px 10px;
    cursor: pointer;
    font: inherit;
    font-size: 12px;
  }
  button:hover:not(:disabled) { border-color: #5b9bd5; }
  button:disabled { opacity: 0.5; cursor: default; }
  button.toggle { padding: 3px 7px; color: var(--host-text-dim); }
  button.toggle.on { color: var(--host-text); border-color: #5b9bd5; background: #24313d; }
  button.ghost { background: none; border-color: transparent; color: var(--host-text-dim); }
  button.ghost:hover { color: var(--host-text); border-color: var(--host-line); }
  .browser :global(button.ghost.danger):hover { color: #e4b3b3; border-color: #7a4a4a; }
  input {
    background: var(--host-field);
    border: 1px solid var(--host-line);
    border-radius: 4px;
    color: var(--host-text);
    padding: 3px 6px;
    font: inherit;
    font-size: 12px;
  }

  .browser {
    /* The browser is laid out against its own width, not the window's. It was built for a
       full-width workspace and now also has to sit in the utility drawer, which is less than
       half that: three fixed columns at 186 + 234 plus the grid do not fit, and what a person
       sees when they do not fit is labels printed over chips. A container query is the honest
       way to say that - the drawer can be resized, and the layout follows the space it is
       actually given rather than a guess about which of the two places it is in. */
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 8px 14px 0;
    padding: 10px;
    border: 1px solid var(--host-line);
    border-radius: 6px;
    background: var(--host-surface);
    min-height: 0;
  }

  .head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .search { flex: 1; min-width: 200px; }
  .browser .load-failed { color: #f3a5a5; }
  .body { display: flex; align-items: stretch; gap: 10px; min-height: 0; }

  .rail-head {
    color: var(--host-text-dim); font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase;
    margin: 10px 0 3px;
  }
  .rail-head:first-child { margin-top: 0; }
  button.rail-item {
    display: flex; align-items: center; gap: 6px; width: 100%; text-align: left;
    background: transparent; border: 1px solid transparent; border-radius: 4px;
    padding: 4px 7px; color: var(--host-text-soft); font-size: 12px;
  }
  button.rail-item:hover:not(:disabled) { background: var(--host-surface-raised); color: var(--host-text);
                                          border-color: transparent; }
  button.rail-item.on { background: #7fb4e01f; border-color: #4a86bd; color: var(--host-text); }
  .rail-item .n { margin-left: auto; color: var(--host-text-dim); font-size: 10px; }
  .rail-row { display: flex; align-items: center; gap: 2px; }
  .rail-row .rail-item { flex: 1; min-width: 0; }

  .main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; }

  .facets { display: flex; flex-direction: column; gap: 5px; }
  .frow { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
  .frow.actions { margin-top: 2px; }

  .measured { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 2px; }
  .axis {
    display: flex; flex-direction: column; gap: 2px; min-width: 132px;
    padding: 4px 6px; border: 1px solid var(--host-line-soft); border-radius: 4px; background: #14181b;
  }
  .axis.on { border-color: #4a86bd; background: #7fb4e00f; }
  button.axis-name {
    display: flex; align-items: baseline; gap: 5px; background: none; border: 0; padding: 0;
    color: var(--host-text-soft); font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase;
  }
  button.axis-name:hover:not(:disabled) { color: var(--host-text); border-color: transparent; }
  .axis.on button.axis-name { color: #7fb4e0; }
  .axis-value { text-transform: none; letter-spacing: 0; color: var(--host-text-dim); font-size: 10px; }
  .axis.on .axis-value { color: var(--host-text-soft); }
  /* The range inputs wear the workspace, not the browser: WebView2 is Chromium, so the
     -webkit- track and thumb are the ones that apply, and the bare rule keeps a plain browser
     from drawing a default control beside a styled one. */
  .axis input[type='range'] {
    width: 100%; height: 12px; margin: 0; padding: 0;
    -webkit-appearance: none; appearance: none; background: transparent; cursor: pointer;
  }
  .axis input[type='range']::-webkit-slider-runnable-track {
    height: 3px; border-radius: 2px; background: var(--host-line-soft);
  }
  .axis input[type='range']::-webkit-slider-thumb {
    -webkit-appearance: none; appearance: none;
    width: 9px; height: 12px; margin-top: -4.5px; border-radius: 2px;
    background: var(--host-text-dim); border: 1px solid var(--host-bg-deep);
  }
  .axis.on input[type='range']::-webkit-slider-runnable-track { background: #24313d; }
  .axis.on input[type='range']::-webkit-slider-thumb { background: #7fb4e0; }

  .thumb { display: block; width: 100%; height: 22px; background: var(--host-bg-deep); border-radius: 3px; }
  .thumb.unheard {
    display: flex; align-items: center; justify-content: center;
    border: 1px dashed var(--host-line-soft); color: #4d565f; font-size: 9px; letter-spacing: 0.06em;
  }
  /* A refusal is not the same absence as "not heard yet": one is waiting its turn, the other
     has had its turn and has an answer. Amber rather than grey, the same colour the duplicate
     note uses for "something here needs reading". */
  .thumb.unheard.refused { border-color: #6b5426; color: #b08a3d; }
  .thumb polygon { fill: #6fb0c9; fill-opacity: 0.85; }
  .thumb line { stroke: #7fb4e0; stroke-opacity: 0.3; stroke-width: 0.4; }

  .hint { color: var(--host-text-dim); font-size: 10.5px; margin-right: auto; }
  .flabel {
    color: var(--host-text-dim); font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase;
    width: 72px; flex: 0 0 72px;
  }
  button.chip {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 3px 8px; border-radius: 11px; border: 1px solid var(--host-line);
    background: var(--host-surface-raised); color: var(--host-text-soft); font-size: 11px;
  }
  button.chip:hover:not(:disabled) { color: var(--host-text); border-color: #566372; }
  .chip .n { color: var(--host-text-dim); font-size: 10px; }
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
    padding: 7px; border: 1px solid var(--host-line-soft); border-radius: 5px; background: #14181b;
  }
  .tile.sel { border-color: #7fb4e0; }
  .tile.unavailable { opacity: 0.62; }
  button.tile-body {
    display: flex; align-items: center; gap: 7px; min-width: 0; width: 100%;
    background: transparent; border: 1px solid transparent; padding: 2px; border-radius: 4px;
    text-align: left; color: inherit;
  }
  button.tile-body:hover:not(:disabled) { border-color: var(--host-line); background: var(--host-surface-raised); }
  .tile-text { display: flex; flex-direction: column; min-width: 0; }
  .tile-name {
    font-weight: 600; font-size: 12px; color: var(--host-text);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .tile-sub {
    color: var(--host-text-dim); font-size: 10.5px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .rack-mark {
    width: 30px; height: 30px; flex: 0 0 30px; border-radius: 4px; background: var(--host-surface-raised);
    border: 1px solid #35c46f66; color: #35c46f; display: flex; align-items: center;
    justify-content: center; font-size: 14px;
  }
  .tile-foot { display: flex; align-items: center; gap: 4px; }
  .tile-foot button:not(.star) { padding: 3px 8px; font-size: 11px; }
  .badges { display: flex; gap: 3px; margin-right: auto; }
  .badge {
    font-size: 8.5px; letter-spacing: 0.06em; padding: 2px 4px; border-radius: 2px;
    border: 1px solid var(--host-line); color: var(--host-text-dim);
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
    padding-left: 10px; border-left: 1px solid var(--host-line-soft); overflow-y: auto; max-height: 460px;
  }
  .insp-name { font-weight: 600; font-size: 14px; color: var(--host-text); }
  .insp-sub { color: var(--host-text-dim); font-size: 11px; }
  .insp-block { border-top: 1px solid var(--host-line-soft); padding-top: 7px; }
  .insp-head {
    color: var(--host-text-dim); font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase;
    margin-bottom: 5px;
  }
  .kv { display: grid; grid-template-columns: 72px 1fr; gap: 3px 8px; font-size: 11px; }
  .kv .k { color: var(--host-text-dim); }
  .kv .v { color: var(--host-text-soft); overflow-wrap: anywhere; }
  .kv .v.ok { color: #35c46f; }
  .kv .v.bad { color: #d6a3a3; }
  .rating { display: flex; gap: 1px; }
  .tags { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 6px; }
  .notes { color: var(--host-text-soft); font-size: 11px; margin-top: 6px; }
  .inspector :global(button.insp-remove) { align-self: flex-start; font-size: 11px; padding: 3px 6px; }
  .empty-hint { color: var(--host-text-dim); font-size: 12px; padding: 12px 0; }

  /* Under roughly 760px the three columns become three rows, in reading order: what you are
     filtering by, what came back, and what one of them is. Each keeps its own scroll so the
     drawer never grows a second scrollbar of its own. */
  @container (max-width: 760px) {
    .body { flex-direction: column; }
    .inspector {
      width: auto; flex: 0 0 auto; max-height: 420px;
      padding-left: 0; border-left: 0;
      padding-top: 8px; border-top: 1px solid var(--host-line-soft);
    }
    /* Two-up tiles rather than one wide one: the grid row is the whole width here. */
    .grid { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); max-height: 360px; }
  }


  .vrail { display: flex; flex-direction: column; gap: 0; }
  .vrow { display: grid; grid-template-columns: 10px minmax(0, 1fr) auto; gap: 6px;
          align-items: center; position: relative; padding: 2px 0; }
  .vrow .pip { width: 6px; height: 6px; border-radius: 50%; background: var(--host-line); margin-left: 2px;
               z-index: 1; }
  .vrow.now .pip { background: #7fb4e0; box-shadow: 0 0 0 3px #7fb4e026; }
  .vrow .pip.origin { background: var(--host-text-dim); }
  /* The line down the rail is the history; the first and last rows only own half of it. */
  .vrow::before { content: ''; position: absolute; left: 4.5px; top: 0; bottom: 0; width: 1px;
                  background: var(--host-line-soft); }
  .vrow:first-child::before { top: 50%; }
  .vrow:last-child::before { bottom: 50%; }
  button.vlabel { text-align: left; padding: 1px 3px; font-size: 11px; color: var(--host-text-soft);
                  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .vrow.now button.vlabel { color: var(--host-text); font-weight: 600; }
  .vwhen { color: var(--host-text-dim); font-size: 10px; white-space: nowrap; }
  .branched { color: var(--host-text-dim); font-size: 10.5px; margin-top: 6px; }
  .branched b { color: var(--host-text-soft); font-weight: 600; }
  .vblend { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
  .vblend label { font-size: 10px; opacity: 0.6; text-transform: uppercase; letter-spacing: 0.04em; }
  .vblend input { flex: 1; }

  .vsave { display: flex; gap: 4px; margin-top: 8px; flex-wrap: wrap; }
  .vsave .name-field { width: 130px; }
  button.more { margin-left: auto; color: #7fb4e0; font-size: 9px; letter-spacing: 0.06em;
                padding: 0 2px; }

  .diff {
    display: flex; flex-direction: column; gap: 6px; padding: 9px 10px;
    border: 1px solid var(--host-line); border-radius: 5px; background: #14181b;
  }
  .diff-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .diff-title { font-weight: 600; font-size: 12px; color: var(--host-text); }
  .diff-count { color: var(--host-text-dim); font-size: 11px; margin-right: auto; }
  .diff-rows { display: flex; flex-direction: column; max-height: 190px; overflow-y: auto; }
  .drow {
    display: grid; grid-template-columns: 130px 1fr 78px 78px; gap: 8px; align-items: center;
    padding: 4px 0; border-bottom: 1px solid var(--host-surface-raised); font-size: 11px;
  }
  .dname { color: var(--host-text-soft); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .drow.changed .dname { color: var(--host-text); }
  .dbar { position: relative; height: 12px; background: var(--host-bg-deep); border: 1px solid var(--host-line-soft);
          border-radius: 2px; }
  /* A's value is the ground the change happened on; B's is drawn thinner on top of it, so a
     row reads as one bar moving rather than two bars competing. */
  .dbar .da { position: absolute; left: 1px; top: 1px; bottom: 1px; background: #39424d;
              border-radius: 1px; }
  .dbar .db { position: absolute; left: 1px; top: 3px; bottom: 3px; border-radius: 1px;
              background: linear-gradient(90deg, #4a86bd, #7fb4e0); }
  .dval { color: var(--host-text-dim); font-size: 10.5px; text-align: right; font-variant-numeric: tabular-nums; }
  .dval.b { color: #7fb4e0; }
  .diff-foot { color: var(--host-text-dim); font-size: 10.5px; }

  button.simrow {
    display: flex; align-items: baseline; gap: 6px; width: 100%; text-align: left;
    padding: 3px 4px; border-radius: 3px; font-size: 11px;
  }
  button.simrow:hover:not(:disabled) { background: var(--host-surface-raised); border-color: transparent; }
  button.simrow.best { border-color: #35c46f66; background: #35c46f0d; }
  .subrow { display: flex; align-items: stretch; gap: 4px; }
  .subrow button.simrow { flex: 1; min-width: 0; }
  button.morph-with:disabled { opacity: 0.35; }

  .morph { display: flex; flex-direction: column; gap: 5px; padding: 0 2px; }
  .morph-ends { display: flex; align-items: baseline; gap: 6px; font-size: 11px; min-width: 0; }
  .morph-end { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .morph-end.b { text-align: right; }
  .morph-arrow { flex: 0 0 auto; color: var(--host-text-dim); }
  .morph input[type="range"] { width: 100%; margin: 0; }
  .morph .notes.bad { color: #e0725c; }
  .morph :global(button.morph-clear) { align-self: flex-start; font-size: 10px; padding: 2px 6px; color: var(--host-text-dim); }
  .maphint {
    position: absolute; left: 8px; bottom: 6px; font-size: 10px; color: var(--host-text-dim);
    pointer-events: none;
  }
  button.keep {
    flex: 0 0 auto; font-size: 9px; letter-spacing: 0.06em; padding: 0 6px; color: var(--host-text-dim);
  }
  button.keep.on { color: #d9d3c4; border-color: #6b5426; background: #d9a13c14; }
  .simname { color: var(--host-text-soft); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
             min-width: 0; flex: 1; }
  .simpct { color: #35c46f; font-size: 10.5px; font-variant-numeric: tabular-nums; }
  .simwhy { font-size: 10px; margin-top: 4px; }
  .subneed { color: #d9a13c; font-size: 11px; margin-bottom: 6px; }
  .subpart { border-top: 1px solid var(--host-surface-raised); padding-top: 6px; margin-top: 6px; }
  .subwant { color: var(--host-text-dim); font-size: 10.5px; margin-bottom: 4px; }
  .subwant b { color: var(--host-text); font-weight: 600; }

  .mapwrap { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 6px; }
  .mapaxes { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
  .map {
    /* A fixed height rather than flex:1. Growing to fit pushed the audition bar off the bottom
       of the window, which is exactly the control somebody reaches for while browsing a map. */
    position: relative; height: 300px; flex: 0 0 300px;
    border: 1px solid var(--host-line-soft); border-radius: 5px;
    background:
      linear-gradient(#1c212633 1px, transparent 1px) 0 0 / 100% 20%,
      linear-gradient(90deg, #1c212633 1px, transparent 1px) 0 0 / 20% 100%,
      #101315;
    touch-action: none; cursor: crosshair; overflow: hidden;
  }
  button.dot {
    position: absolute; width: 9px; height: 9px; padding: 0; margin: -4.5px 0 0 -4.5px;
    border-radius: 50%; border: 1px solid var(--host-bg-deep); background: #7fb4e0; opacity: 0.8;
  }
  button.dot:hover:not(:disabled) { opacity: 1; border-color: var(--host-text); }
  button.dot.sel { background: var(--host-text); box-shadow: 0 0 0 3px #7fb4e044; opacity: 1; }
  button.dot.unavailable { background: #566372; opacity: 0.55; }
  .lasso {
    position: absolute; border: 1px dashed #7fb4e0; background: #7fb4e014; pointer-events: none;
  }
  .axlabel { position: absolute; color: #5b6570; font-size: 9.5px; pointer-events: none; }
  .axlabel.x0 { left: 5px; bottom: 3px; }
  .axlabel.x1 { right: 5px; bottom: 3px; }
  .axlabel.y0 { left: 5px; bottom: 14px; }
  .axlabel.y1 { left: 5px; top: 4px; }
  .mapcard {
    position: absolute; margin: 10px 0 0 10px; padding: 6px 8px; width: 172px;
    background: var(--host-surface); border: 1px solid #4a86bd; border-radius: 4px;
    display: flex; flex-direction: column; gap: 1px; pointer-events: none;
    box-shadow: 0 8px 22px #000a;
  }
  .mapcard-name { font-weight: 600; font-size: 11.5px; color: var(--host-text); }
  .mapcard-sub { color: var(--host-text-dim); font-size: 10px; }
  .mapcard-nums { color: var(--host-text-soft); font-size: 10px; margin-top: 3px; }
  .mapfoot { display: flex; }

  .mirror {
    display: flex; gap: 12px; padding: 10px; margin-top: 2px;
    border: 1px solid var(--host-line-soft); border-radius: 5px; background: var(--host-bg-deep); flex-wrap: wrap;
  }
  /* The screen is drawn as a screen — a character grid in its own phosphor — because that is
     what somebody is checking against, and a styled HTML list would not be it. */
  .lcd {
    width: 268px; flex: 0 0 268px; padding: 8px 9px; border-radius: 4px;
    background: #06170f; border: 1px solid #1d4a34; color: #8ff0b8;
    font-family: ui-monospace, monospace; box-shadow: inset 0 0 24px #0b3a2544;
  }
  .lcd-head {
    display: flex; justify-content: space-between; gap: 8px; font-size: 9.5px; color: #4fbf87;
    border-bottom: 1px solid #1d4a34; padding-bottom: 5px; letter-spacing: 0.06em;
  }
  .lcd-row { display: flex; align-items: center; gap: 6px; padding: 3px 0; font-size: 11.5px; }
  .lcd-row.on { color: #d6ffe8; }
  .lcd-row.dim { color: #2f6f4f; }
  .lcd-pip { width: 5px; height: 5px; border-radius: 50%; background: #1d4a34; flex: 0 0 5px; }
  .lcd-pip.lit { background: #8ff0b8; box-shadow: 0 0 6px #8ff0b8; }
  .lcd-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .lcd-detail { font-size: 9px; color: #4fbf87; white-space: nowrap; }
  .lcd-foot {
    display: flex; justify-content: space-between; align-items: center; gap: 6px;
    border-top: 1px solid #1d4a34; padding-top: 5px; margin-top: 5px;
    font-size: 9px; color: #4fbf87; letter-spacing: 0.04em;
  }
  button.lcd-btn { color: #4fbf87; font-size: 9px; padding: 1px 3px; font-family: inherit; }
  button.lcd-btn:hover:not(:disabled) { color: #8ff0b8; border-color: #1d4a34; }

  .mirror-right { flex: 1; min-width: 260px; display: flex; flex-direction: column; gap: 6px; }
  .encgrid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; }
  button.enc {
    display: flex; flex-direction: column; gap: 3px; align-items: flex-start; text-align: left;
    padding: 5px 6px; min-width: 0;
  }
  button.enc.act { border-color: #4a86bd; background: #7fb4e014; }
  button.enc.inert { opacity: 0.45; }
  .enc-n { font: 600 8.5px/1 ui-monospace, monospace; color: var(--host-text-dim); letter-spacing: 0.06em; }
  .enc-v { font-size: 10.5px; color: var(--host-text-soft); overflow: hidden; text-overflow: ellipsis;
           white-space: nowrap; max-width: 100%; }
  button.enc.act .enc-v { color: #7fb4e0; }
  .padgrid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; }
  button.pad {
    padding: 7px 5px; font-size: 10px; overflow: hidden; text-overflow: ellipsis;
    white-space: nowrap; background: #7fb4e014; border-color: #4a86bd66;
  }
  button.pad.dim { opacity: 0.45; }
  .mirror-note { color: var(--host-text-dim); font-size: 10.5px; line-height: 1.5; }
  .mirror-note b { color: #d9a13c; font-weight: 600; }

  .audition {
    display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
    padding: 8px 10px; margin-top: 2px;
    border: 1px solid var(--host-line-soft); border-radius: 5px; background: var(--host-bg-deep);
  }
  button.play {
    width: 26px; height: 26px; padding: 0; border-radius: 50%;
    background: #7fb4e01f; border-color: #4a86bd; color: #7fb4e0; font-size: 11px;
  }
  .now { display: flex; flex-direction: column; gap: 1px; min-width: 190px; }
  .now-name { font-weight: 600; font-size: 12px; color: var(--host-text); }
  .now-stage { display: flex; align-items: center; gap: 5px; color: var(--host-text-dim); font-size: 10.5px; }
  .pip { width: 7px; height: 7px; border-radius: 50%; background: var(--host-line); flex: 0 0 7px; }
  .pip.snap { background: #7fb4e0; }
  .pip.live { background: #35c46f; }
  .pip.none { background: #566372; }
  .phrase { display: flex; align-items: center; gap: 4px; }
  .phrase-label {
    color: var(--host-text-dim); font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase;
    margin-right: 2px;
  }
  .cache { margin-left: auto; color: var(--host-text-dim); font-size: 10.5px; }

  /* Dock layout: the results scroll while the toolbar, target and load actions stay put. */
  .browser { flex: 1; height: 100%; min-width: 0; margin: 0; padding: 0; gap: 0; border: 0;
             border-radius: 0; background: var(--host-surface, #171a1d); position: relative; overflow: hidden; }
  .browser .head { flex: none; padding: 7px 10px; gap: 6px; border-bottom: 1px solid var(--host-line, #3b4652); }
  .browser .search { min-width: 130px; width: 130px; }
  .browser select { background: var(--host-bg-deep, #14171a); color: var(--host-text, #d6dbe0);
                    border: 1px solid var(--host-line, #3b4652); border-radius: 4px; font: inherit;
                    font-size: 12px; padding: 4px 6px; min-width: 0; max-width: 160px; height: 29px; }
  .browser .head button, .browser .head input { height: 29px; box-sizing: border-box; }
  .browser .body { flex: 1; min-height: 0; gap: 0; position: relative; flex-direction: row; }
  .browser .main { min-height: 0; gap: 0; overflow: hidden; }
  .browser .facets { max-height: 140px; min-height: 0; overflow-y: auto; flex: 0 1 auto; padding: 8px 10px; border-bottom: 1px solid var(--host-line, #3b4652); }
  .rail-setting, .browser .rail-head { display: flex; justify-content: space-between; align-items: center; gap: 6px; }
  .rail-setting { font-size: 12px; margin-top: 5px; }
  .browser .rail-head { font-size: 11px; }
  .browser .inspector { width: 240px; flex: 0 0 240px; min-height: 0; max-height: none; overflow-y: auto;
                       padding: 10px; border-left: 1px solid var(--host-line, #3b4652); border-top: 0;
                       background: var(--host-surface, #1d232b); box-sizing: border-box; }
  .preset-list { flex: 1; min-height: 32px; overflow-y: auto; overflow-x: hidden; position: relative; }
  .preset-heading { display: grid; grid-template-columns: 30px minmax(100px, 1.7fr) minmax(90px, 1fr) minmax(70px, .8fr) 60px;
                    gap: 6px; padding: 5px 10px; font-size: 11px; color: var(--host-text-soft, #9aa5b1);
                    background: var(--host-bg, #1d232b); border-bottom: 1px solid var(--host-line, #3b4652); flex: none; }
  .preset-row { display: flex; gap: 6px; height: var(--preset-row-height); min-height: var(--preset-row-height);
                box-sizing: border-box; border-bottom: 1px solid var(--host-line-soft, #2b333d); padding: 0 10px; }
  .preset-row.sel { background: var(--host-selection, #243b37); box-shadow: inset 3px 0 var(--host-accent, #80d8bc); }
  .preset-row.unavailable .preset-name { color: var(--host-text-dim, #7d8894); }
  .browser.browser.browser.browser button.preset-star { width: 30px; flex: 0 0 30px; padding: 0; background: none; border: 0; border-radius: 0; color: var(--host-text-soft, #9aa5b1); }
  .browser.browser.browser.browser button.preset-star[aria-pressed="true"] { color: var(--host-accent, #80d8bc); }
  .browser.browser.browser.browser button.preset-pick { display: grid; grid-template-columns: minmax(100px, 1.7fr) minmax(90px, 1fr) minmax(70px, .8fr) 60px;
                               gap: 6px; flex: 1; min-width: 0; padding: 0; background: none; border: 0; border-radius: 0;
                               text-align: left; align-items: center; color: var(--host-text-soft, #9aa5b1); font-size: 12px; }
  .browser.browser.browser.browser button.preset-pick:hover:not(:disabled) { background: var(--host-surface-hover, #27323b); border: 0; }
  .preset-pick > span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .preset-pick .preset-name { color: var(--host-text, #d6dbe0); }
  .preset-kind { font-size: 11px; }
  .browser .grid, .browser .mapwrap { flex: 1; min-height: 0; overflow-y: auto; max-height: none; padding: 8px; }
  .browser .empty-hint { padding: 14px; }
  .selection-bar { display: flex; align-items: center; flex: none; gap: 8px; padding: 7px 10px;
                   border-top: 1px solid var(--host-line, #3b4652); background: var(--host-bg, #1d232b); }
  .selection-info { display: flex; flex: 1; flex-direction: column; min-width: 0; }
  .selection-info strong { font-size: 12px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .selection-info > span { font-size: 11px; color: var(--host-text-soft, #9aa5b1); overflow-wrap: anywhere; }
  .audition-toggle { display: flex; align-items: center; gap: 5px; font-size: 12px; white-space: nowrap; }
  .audition-toggle input { margin: 0; }
  .load-selected { border-color: var(--host-accent, #80d8bc); color: var(--host-text, #d6dbe0); min-width: 70px; }
  .browser-status { flex: none; display: flex; align-items: center; justify-content: space-between; gap: 8px;
                    min-height: 23px; padding: 2px 10px; color: var(--host-text-soft, #9aa5b1); font-size: 11px;
                    border-top: 1px solid var(--host-line-soft, #2b333d); }
  .browser-status button { padding: 0 5px; }
  .browser .audition { flex: none; padding: 6px 10px; flex-wrap: wrap; gap: 6px; }
  .browser .mirror { max-height: 130px; overflow: auto; flex: none; }
  @container (max-width: 760px) {
    .browser .inspector { position: absolute; right: 0; top: 0; bottom: 0; z-index: 3; width: 240px; max-width: 100%; }
    .browser .preset-category { display: none; }
    .preset-heading { grid-template-columns: 30px minmax(100px, 1.7fr) minmax(85px, 1fr) 60px; }
    .browser.browser.browser.browser button.preset-pick { grid-template-columns: minmax(100px, 1.7fr) minmax(85px, 1fr) 60px; }
  }
  @container (max-width: 500px) {
    .browser .search { flex-basis: 100%; }
    .browser .head { gap: 4px; }
    .browser select { max-width: 115px; }
    .browser .head button { padding-left: 5px; padding-right: 5px; }
    .selection-bar { flex-wrap: wrap; gap: 5px; }
    .selection-info { flex-basis: 100%; }
    .audition-toggle { margin-right: auto; }
    .preset-heading { grid-template-columns: 25px minmax(100px, 1.7fr) minmax(70px, 1fr); }
    .preset-heading > span:last-child, .preset-kind { display: none; }
    .browser.browser.browser.browser button.preset-pick { grid-template-columns: minmax(100px, 1.7fr) minmax(70px, 1fr); }
    .browser.browser.browser.browser button.preset-star { width: 25px; flex-basis: 25px; }
    .browser-status { flex-wrap: wrap; }
  }
</style>
