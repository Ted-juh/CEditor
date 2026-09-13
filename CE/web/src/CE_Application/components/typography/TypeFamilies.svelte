<script>
  /**
   * The family list, each row set in its own face.
   *
   * There is no font specimen anywhere in the editor today, so choosing a family means setting it,
   * looking at the canvas, and coming back. `availableFonts` already merges the built-in faces with
   * the user's imported ones and `ensureStoredFontLoaded` gets a face on screen, so this is mostly
   * a matter of asking.
   */
  import { availableFonts, ensureStoredFontLoaded } from '../../stores/appSettings.js';

  let { family = '', onpick = () => {} } = $props();

  let filter = $state('');

  let rows = $derived(($availableFonts ?? []).filter((entry) => {
    const needle = filter.trim().toLowerCase();
    return !needle || String(entry.label ?? entry.value ?? '').toLowerCase().includes(needle);
  }));

  // Loading faces ON DEMAND rather than all of them, which matters: a list of thirty families where
  // several are Google fonts would fetch thirty faces the moment the tab opened, and TextEditor's
  // own effect deliberately loads only the selected one. So the selected face is fetched eagerly
  // and any other row is fetched when the pointer or focus reaches it — by which point you are
  // about to look at it. A row not yet fetched draws in the fallback face for a frame; `font-display:
  // swap` in webFonts.css is the same trade the editor already makes.
  const loaded = new Set();
  function warm(entry) {
    if (!entry || loaded.has(entry.value)) return;
    loaded.add(entry.value);
    ensureStoredFontLoaded(entry, { allowFeatureBackfill: false, delayMs: 0 });
  }

  $effect(() => {
    const selected = ($availableFonts ?? []).find((entry) => entry.value === family);
    if (selected) warm(selected);
  });

  const cssFor = (entry) => entry?.cssFamily ?? entry?.value ?? 'sans-serif';
</script>

<div class="famcol">
  <input
    class="famfilter"
    type="text"
    placeholder="Filter…"
    aria-label="Filter font families"
    bind:value={filter}
  />
  <div class="fams" role="listbox" aria-label="Font family">
    {#each rows as entry (entry.value)}
      <button
        type="button"
        class="fam"
        class:on={entry.value === family}
        role="option"
        aria-selected={entry.value === family}
        title={entry.label ?? entry.value}
        onclick={() => onpick(entry.value)}
        onpointerenter={() => warm(entry)}
        onfocus={() => warm(entry)}
      >
        <span class="nm" style={`font-family:${cssFor(entry)}`}>{entry.label ?? entry.value}</span>
        {#if entry.supportsWeight}<span class="wt" title="Variable weight">W</span>{/if}
      </button>
    {:else}
      <p class="none">No families match.</p>
    {/each}
  </div>
</div>

<style>
  .famcol { display: flex; flex-direction: column; min-height: 0; }

  .famfilter {
    height: 24px;
    margin-bottom: 6px;
    border: 1px solid #333;
    border-radius: 3px;
    background: #1A1A1A;
    color: #DDD;
    font: 400 10px/1 'IBM Plex Sans', system-ui, sans-serif;
    padding: 0 7px;
    outline: none;
  }
  .famfilter:focus { border-color: #5B9BD5; }

  .fams {
    background: #1E1E1E;
    border: 1px solid #333;
    border-radius: 4px;
    overflow-y: auto;
    max-height: 232px;
  }

  .fam {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 6px 8px;
    border: 0;
    border-bottom: 1px solid #242424;
    background: none;
    cursor: pointer;
    text-align: left;
  }
  .fam:last-child { border-bottom: 0; }
  .fam:hover { background: #252525; }
  .fam.on { background: #173449; box-shadow: inset 2px 0 0 #5B9BD5; }

  .nm {
    flex: 1;
    min-width: 0;
    font-size: 14px;
    line-height: 1.25;
    color: #C8D2DA;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .fam.on .nm { color: #EAF5FF; }

  .wt { font: 500 8px/1 'IBM Plex Mono', ui-monospace, monospace; color: #616C75; }

  .none { margin: 0; padding: 10px 8px; font: 400 10px/1.5 'IBM Plex Sans', system-ui, sans-serif; color: #616C75; }
</style>
