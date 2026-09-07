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
    hostAnalysis, analyseLibrary, cancelAnalysis,
    hostAudition, auditionRecord, stopAudition, setAuditionPhrase,
    hostVersionDiff, commitVersion, applyVersion, diffVersions,
    hostSimilar, similarSounds, hostSubstitutes, rackSubstitutes,
    MEASURED_AXES, measuredLabel,
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
  let versionLabel = $state('');
  let namingVersion = $state(false);
  let onlyDifferences = $state(true);
  // Grid or map. The map is the same records on two measured axes — no projection, no learned
  // embedding, nothing to explain: where a dot sits IS its brightness and its attack.
  let view = $state('grid');
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

  let records = $derived($hostLibrary.records);
  // Asking is cheap and the answer is per-record, so it is fetched on selection rather than
  // carried on every record in every library payload.
  let lastAskedSimilar = $state('');
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

  function clickTile(record) {
    selectRecord(record.recordId);
    // Selecting shows it; loading is the button. A single click that both selects and loads is
    // how the old list put an instrument somewhere nobody expected. With audition on, a click
    // makes a SOUND — the stored snapshot answers immediately and the plug-in takes over when
    // it arrives, which is the whole difference between browsing and waiting.
    if (auditionOn && record.available) auditionRecord(record.recordId);
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
    <span class="types">
      {#each [['grid', 'Grid'], ['map', 'Map']] as [value, label] (value)}
        <button type="button" class="toggle" class:on={view === value} data-testid="view-mode"
                title={value === 'map'
                       ? 'The same sounds placed by what they measured, not by what they are called'
                       : 'The result list'}
                onclick={() => (view = value)}>{label}</button>
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

      <div class="rail-head">The auditioner</div>
      {#if $hostAnalysis.running}
        <div class="listen-progress" data-testid="analysis-progress">
          <div class="bar"><i style={`width:${$hostAnalysis.total > 0
            ? Math.round(100 * $hostAnalysis.done / $hostAnalysis.total) : 0}%`}></i></div>
          <span class="listen-what">{$hostAnalysis.done} of {$hostAnalysis.total} · {$hostAnalysis.what}</span>
        </div>
        <button type="button" class="rail-action" onclick={() => cancelAnalysis()}>Stop listening</button>
      {:else}
        <button type="button" class="rail-action" data-testid="host-analyse"
                disabled={$hostLibrary.counts.measurable === 0}
                title={$hostLibrary.counts.measurable === 0
                       ? 'Everything with a plug-in behind it has been measured'
                       : 'Play each of these once and write down what came out'}
                onclick={() => analyseLibrary()}>
          {$hostLibrary.counts.measurable === 0
            ? 'Nothing left to measure'
            : `Listen to ${$hostLibrary.counts.measurable} sound${$hostLibrary.counts.measurable === 1 ? '' : 's'}`}
        </button>
        {#if $hostAnalysis.what}
          <span class="listen-what">{$hostAnalysis.what}</span>
        {/if}
      {/if}
      <button type="button" class="rail-item" class:on={query.measuredOnly}
              title="Only sounds the auditioner has played"
              onclick={() => ask({ ...query, measuredOnly: !query.measuredOnly })}>
        <span>Measured</span><span class="n">{$hostLibrary.counts.measured}</span>
      </button>

      {#if $hostLibrary.duplicates.length > 0}
        <div class="rail-head">Housekeeping</div>
        <div class="rail-row">
          <span class="dup-note" data-testid="duplicate-note">
            {$hostLibrary.duplicates.length} duplicate
            {$hostLibrary.duplicates.length === 1 ? 'set' : 'sets'} —
            {$hostLibrary.duplicates.reduce((n, d) => n + d.recordIds.length - 1, 0)} copies
          </span>
        </div>
        {#each $hostLibrary.duplicates.slice(0, 6) as set (set.keyRecordId)}
          <button type="button" class="rail-item" data-testid="duplicate-set"
                  title={set.identical ? 'The same bytes, filed more than once'
                                       : 'The same name, plug-in and measurement'}
                  onclick={() => ask({ ...emptyLibraryQuery(), text: set.name })}>
            <span>{set.name}</span><span class="n">×{set.recordIds.length}</span>
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

      {#if $hostVersionDiff && $hostVersionDiff.recordId === selected?.recordId}
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
                      onclick={() => clickTile(record)}></button>
            {/each}

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
            ? 'Nothing in the library yet — scan presets, or capture the focused part.'
            : 'Nothing matches. Clear a chip, or refuse fewer things.'}
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
              <button type="button" class="ghost simrow" data-testid="similar-row"
                      title={`${agreedAxes(match).join(', ')} agree${gaveUp(match) ? ` — but ${gaveUp(match)}` : ''}`}
                      onclick={() => selectRecord(match.recordId)}>
                <span class="simname">{match.name}</span>
                <span class="simpct">{match.percent}%</span>
              </button>
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
                        <button type="button" class="ghost simrow" class:best={index === 0}
                                data-testid="substitute-candidate"
                                title={`Load ${candidate.name} onto this part instead`}
                                onclick={() => loadLibraryRecord(candidate.recordId, 'replace', part.partId)}>
                          <span class="simname">{candidate.name}</span>
                          <span class="simpct">{candidate.percent}%</span>
                        </button>
                      {/each}
                      <div class="notes simwhy">
                        {agreedAxes(part.candidates[0]).join(', ')} agree{gaveUp(part.candidates[0])
                          ? ` — ${gaveUp(part.candidates[0])}` : ''}. The rack keeps naming
                        {part.pluginName}, so it plays properly again the day that comes back.
                      </div>
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
          <button type="button" class="ghost danger insp-remove"
                  onclick={() => removeLibraryRecord(selected.recordId)}>Remove this record</button>
        {/if}
      </div>
    {/if}
  </div>

  <!-- The audition bar. It is the answer to "what am I hearing, and what is it playing" — the
       two questions a preview that swaps sources underneath you has to keep answering. -->
  <div class="audition" data-testid="audition-bar">
    <button type="button" class="play"
            disabled={!selected || !selected.available}
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

  .measured { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 2px; }
  .axis {
    display: flex; flex-direction: column; gap: 2px; min-width: 132px;
    padding: 4px 6px; border: 1px solid #2a333d; border-radius: 4px; background: #14181b;
  }
  .axis.on { border-color: #4a86bd; background: #7fb4e00f; }
  button.axis-name {
    display: flex; align-items: baseline; gap: 5px; background: none; border: 0; padding: 0;
    color: #9aa5b1; font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase;
  }
  button.axis-name:hover:not(:disabled) { color: #d6dbe0; border-color: transparent; }
  .axis.on button.axis-name { color: #7fb4e0; }
  .axis-value { text-transform: none; letter-spacing: 0; color: #66707b; font-size: 10px; }
  .axis.on .axis-value { color: #9aa5b1; }
  /* The range inputs wear the workspace, not the browser: WebView2 is Chromium, so the
     -webkit- track and thumb are the ones that apply, and the bare rule keeps a plain browser
     from drawing a default control beside a styled one. */
  .axis input[type='range'] {
    width: 100%; height: 12px; margin: 0; padding: 0;
    -webkit-appearance: none; appearance: none; background: transparent; cursor: pointer;
  }
  .axis input[type='range']::-webkit-slider-runnable-track {
    height: 3px; border-radius: 2px; background: #2a333d;
  }
  .axis input[type='range']::-webkit-slider-thumb {
    -webkit-appearance: none; appearance: none;
    width: 9px; height: 12px; margin-top: -4.5px; border-radius: 2px;
    background: #7d8894; border: 1px solid #101315;
  }
  .axis.on input[type='range']::-webkit-slider-runnable-track { background: #24313d; }
  .axis.on input[type='range']::-webkit-slider-thumb { background: #7fb4e0; }

  .thumb { display: block; width: 100%; height: 22px; background: #101315; border-radius: 3px; }
  .thumb.unheard {
    display: flex; align-items: center; justify-content: center;
    border: 1px dashed #2a333d; color: #4d565f; font-size: 9px; letter-spacing: 0.06em;
  }
  .thumb polygon { fill: #6fb0c9; fill-opacity: 0.85; }
  .thumb line { stroke: #7fb4e0; stroke-opacity: 0.3; stroke-width: 0.4; }

  .listen-progress { display: flex; flex-direction: column; gap: 3px; padding: 2px 0; }
  .listen-progress .bar {
    height: 4px; border-radius: 2px; background: #101315; border: 1px solid #2a333d;
    overflow: hidden;
  }
  .listen-progress .bar i { display: block; height: 100%; background: #4a86bd; }
  .listen-what { color: #7d8894; font-size: 10px; padding: 2px 0; }
  .dup-note { color: #d9a13c; font-size: 10.5px; padding: 2px 0; }
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

  .vrail { display: flex; flex-direction: column; gap: 0; }
  .vrow { display: grid; grid-template-columns: 10px minmax(0, 1fr) auto; gap: 6px;
          align-items: center; position: relative; padding: 2px 0; }
  .vrow .pip { width: 6px; height: 6px; border-radius: 50%; background: #3b4652; margin-left: 2px;
               z-index: 1; }
  .vrow.now .pip { background: #7fb4e0; box-shadow: 0 0 0 3px #7fb4e026; }
  .vrow .pip.origin { background: #7d8894; }
  /* The line down the rail is the history; the first and last rows only own half of it. */
  .vrow::before { content: ''; position: absolute; left: 4.5px; top: 0; bottom: 0; width: 1px;
                  background: #2a333d; }
  .vrow:first-child::before { top: 50%; }
  .vrow:last-child::before { bottom: 50%; }
  button.vlabel { text-align: left; padding: 1px 3px; font-size: 11px; color: #9aa5b1;
                  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .vrow.now button.vlabel { color: #d6dbe0; font-weight: 600; }
  .vwhen { color: #66707b; font-size: 10px; white-space: nowrap; }
  .branched { color: #7d8894; font-size: 10.5px; margin-top: 6px; }
  .branched b { color: #9aa5b1; font-weight: 600; }
  .vsave { display: flex; gap: 4px; margin-top: 8px; flex-wrap: wrap; }
  .vsave .name-field { width: 130px; }
  button.more { margin-left: auto; color: #7fb4e0; font-size: 9px; letter-spacing: 0.06em;
                padding: 0 2px; }

  .diff {
    display: flex; flex-direction: column; gap: 6px; padding: 9px 10px;
    border: 1px solid #3b4652; border-radius: 5px; background: #14181b;
  }
  .diff-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .diff-title { font-weight: 600; font-size: 12px; color: #d6dbe0; }
  .diff-count { color: #7d8894; font-size: 11px; margin-right: auto; }
  .diff-rows { display: flex; flex-direction: column; max-height: 190px; overflow-y: auto; }
  .drow {
    display: grid; grid-template-columns: 130px 1fr 78px 78px; gap: 8px; align-items: center;
    padding: 4px 0; border-bottom: 1px solid #1c2126; font-size: 11px;
  }
  .dname { color: #9aa5b1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .drow.changed .dname { color: #d6dbe0; }
  .dbar { position: relative; height: 12px; background: #101315; border: 1px solid #2a333d;
          border-radius: 2px; }
  /* A's value is the ground the change happened on; B's is drawn thinner on top of it, so a
     row reads as one bar moving rather than two bars competing. */
  .dbar .da { position: absolute; left: 1px; top: 1px; bottom: 1px; background: #39424d;
              border-radius: 1px; }
  .dbar .db { position: absolute; left: 1px; top: 3px; bottom: 3px; border-radius: 1px;
              background: linear-gradient(90deg, #4a86bd, #7fb4e0); }
  .dval { color: #7d8894; font-size: 10.5px; text-align: right; font-variant-numeric: tabular-nums; }
  .dval.b { color: #7fb4e0; }
  .diff-foot { color: #66707b; font-size: 10.5px; }

  button.simrow {
    display: flex; align-items: baseline; gap: 6px; width: 100%; text-align: left;
    padding: 3px 4px; border-radius: 3px; font-size: 11px;
  }
  button.simrow:hover:not(:disabled) { background: #1c2126; border-color: transparent; }
  button.simrow.best { border-color: #35c46f66; background: #35c46f0d; }
  .simname { color: #9aa5b1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
             min-width: 0; flex: 1; }
  .simpct { color: #35c46f; font-size: 10.5px; font-variant-numeric: tabular-nums; }
  .simwhy { font-size: 10px; margin-top: 4px; }
  .subneed { color: #d9a13c; font-size: 11px; margin-bottom: 6px; }
  .subpart { border-top: 1px solid #1c2126; padding-top: 6px; margin-top: 6px; }
  .subwant { color: #7d8894; font-size: 10.5px; margin-bottom: 4px; }
  .subwant b { color: #d6dbe0; font-weight: 600; }

  .mapwrap { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 6px; }
  .mapaxes { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
  .map {
    /* A fixed height rather than flex:1. Growing to fit pushed the audition bar off the bottom
       of the window, which is exactly the control somebody reaches for while browsing a map. */
    position: relative; height: 300px; flex: 0 0 300px;
    border: 1px solid #2a333d; border-radius: 5px;
    background:
      linear-gradient(#1c212633 1px, transparent 1px) 0 0 / 100% 20%,
      linear-gradient(90deg, #1c212633 1px, transparent 1px) 0 0 / 20% 100%,
      #101315;
    touch-action: none; cursor: crosshair; overflow: hidden;
  }
  button.dot {
    position: absolute; width: 9px; height: 9px; padding: 0; margin: -4.5px 0 0 -4.5px;
    border-radius: 50%; border: 1px solid #101315; background: #7fb4e0; opacity: 0.8;
  }
  button.dot:hover:not(:disabled) { opacity: 1; border-color: #d6dbe0; }
  button.dot.sel { background: #d6dbe0; box-shadow: 0 0 0 3px #7fb4e044; opacity: 1; }
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
    background: #171a1d; border: 1px solid #4a86bd; border-radius: 4px;
    display: flex; flex-direction: column; gap: 1px; pointer-events: none;
    box-shadow: 0 8px 22px #000a;
  }
  .mapcard-name { font-weight: 600; font-size: 11.5px; color: #d6dbe0; }
  .mapcard-sub { color: #7d8894; font-size: 10px; }
  .mapcard-nums { color: #9aa5b1; font-size: 10px; margin-top: 3px; }
  .mapfoot { display: flex; }

  .audition {
    display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
    padding: 8px 10px; margin-top: 2px;
    border: 1px solid #2a333d; border-radius: 5px; background: #101315;
  }
  button.play {
    width: 26px; height: 26px; padding: 0; border-radius: 50%;
    background: #7fb4e01f; border-color: #4a86bd; color: #7fb4e0; font-size: 11px;
  }
  .now { display: flex; flex-direction: column; gap: 1px; min-width: 190px; }
  .now-name { font-weight: 600; font-size: 12px; color: #d6dbe0; }
  .now-stage { display: flex; align-items: center; gap: 5px; color: #7d8894; font-size: 10.5px; }
  .pip { width: 7px; height: 7px; border-radius: 50%; background: #3b4652; flex: 0 0 7px; }
  .pip.snap { background: #7fb4e0; }
  .pip.live { background: #35c46f; }
  .pip.none { background: #566372; }
  .phrase { display: flex; align-items: center; gap: 4px; }
  .phrase-label {
    color: #7d8894; font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase;
    margin-right: 2px;
  }
  .cache { margin-left: auto; color: #66707b; font-size: 10.5px; }
</style>
