<script>
  /**
   * The library — every image and every filmstrip in one grid.
   *
   * This is the column that replaces two `<select>` dropdowns. The properties panel picks an image
   * from `Object.keys(Assets.images)` and a filmstrip from `Object.keys(Assets.filmstrips)`, which
   * means a component with eight pictures is eight words in a list and one preview at a time. An
   * image is chosen by looking at it, so the picker has to show them.
   *
   * The two kinds share the grid rather than getting a section each. Sorting by name across both
   * (see `listAssets`) is what makes it one library instead of the same two dropdowns with a gap
   * between them; the badge on each tile says which kind it is.
   */
  import ImageIcon from 'lucide-svelte/icons/image';
  import Film from 'lucide-svelte/icons/film';
  import WandSparkles from 'lucide-svelte/icons/wand-sparkles';
  import { frameBackground, formatBytes } from '../../utils/assetsModel.js';

  let {
    assets = [],
    selectedKey = '',
    baking = false,
    onselect = () => {},
    onimport = () => {},
    onbake = () => {},
  } = $props();

  let imageInput = $state(null);
  let stripInput = $state(null);

  // The first frame of a strip, drawn the way the renderer draws it. A strip shown whole in a
  // 46px tile is a grey smear; one frame is a picture.
  function tileStyle(entry) {
    if (!entry.hasSource) return '';
    const rendering = entry.interpolation === 'nearest' ? 'pixelated' : 'auto';
    if (entry.kind !== 'filmstrip') {
      return `background-image:url("${entry.source.replaceAll('"', '\\"')}");background-size:contain;background-position:center;background-repeat:no-repeat;image-rendering:${rendering}`;
    }
    const css = frameBackground({ frameCount: entry.frameCount, frameIndex: 0, orientation: entry.orientation });
    return [
      `background-image:url("${entry.source.replaceAll('"', '\\"')}")`,
      `background-size:${css.backgroundSize}`,
      `background-position:${css.backgroundPosition}`,
      'background-repeat:no-repeat',
      `image-rendering:${rendering}`,
    ].join(';');
  }

  function sizeNote(entry) {
    if (entry.kind === 'filmstrip') return `${entry.frameCount} frames`;
    if (entry.width && entry.height) return `${entry.width}×${entry.height}`;
    return entry.hasSource ? formatBytes(entry.bytes) : 'empty';
  }

  function pick(input, event) {
    const file = event?.target?.files?.[0];
    if (file) onimport(input, file);
    if (event?.target) event.target.value = '';
  }
</script>

<div class="library">
  {#if !assets.length}
    <p class="none">No images or filmstrips yet. Import one, or bake the component itself into a strip.</p>
  {:else}
    <div class="grid" role="listbox" aria-label="Component assets" tabindex="-1">
      {#each assets as entry (entry.key)}
        <div
          class="tile"
          class:sel={entry.key === selectedKey}
          class:empty={!entry.hasSource}
          role="option"
          tabindex="0"
          aria-selected={entry.key === selectedKey}
          title={`${entry.name} — ${sizeNote(entry)}`}
          onclick={() => onselect(entry.key)}
          onkeydown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onselect(entry.key); }
          }}
        >
          <span class="badge" class:film={entry.kind === 'filmstrip'}>
            {#if entry.kind === 'filmstrip'}<Film size={9} />{:else}<ImageIcon size={9} />{/if}
          </span>
          <span class="box" style={tileStyle(entry)}>
            {#if !entry.hasSource}<i>no source</i>{/if}
          </span>
          <span class="name">{entry.name}</span>
          <span class="note">{sizeNote(entry)}</span>
        </div>
      {/each}
    </div>
  {/if}

  <div class="tools">
    <button type="button" onclick={() => imageInput?.click()} title="Import a PNG, JPEG, WebP or GIF as an image asset">
      <ImageIcon size={11} /> Image
    </button>
    <button type="button" onclick={() => stripInput?.click()} title="Import an image as a filmstrip asset">
      <Film size={11} /> Strip
    </button>
    <button type="button" class:on={baking} onclick={onbake} title="Render this component into a filmstrip">
      <WandSparkles size={11} /> Bake
    </button>
  </div>

  <input bind:this={imageInput} class="hidden-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif"
         onchange={(event) => pick('image', event)} />
  <input bind:this={stripInput} class="hidden-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif"
         onchange={(event) => pick('filmstrip', event)} />
</div>

<style>
  .library { display: flex; flex-direction: column; gap: 7px; min-width: 0; }

  .grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 5px;
    max-height: 214px;
    overflow-y: auto;
    padding: 1px;
    outline: none;
  }

  .tile {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 4px;
    border: 1px solid #2E3540;
    border-radius: 4px;
    background: #12171A;
    cursor: pointer;
    position: relative;
    min-width: 0;
    outline: none;
  }
  .tile:hover { border-color: #4A555E; }
  .tile:focus-visible { box-shadow: 0 0 0 1px #5B9BD5; }
  .tile.sel { border-color: #5B9BD5; background: #173449; }
  .tile.empty .box { border-style: dashed; }

  .badge {
    position: absolute;
    top: 5px;
    left: 5px;
    display: flex;
    padding: 2px;
    border-radius: 2px;
    background: rgba(10, 14, 18, 0.8);
    color: #7E8C98;
    line-height: 0;
  }
  .badge.film { color: #8FEDE3; }

  .box {
    height: 44px;
    border: 1px solid #2A3038;
    border-radius: 2px;
    background-color: #0C0F12;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .box i {
    font: 400 8px/1 'IBM Plex Mono', ui-monospace, monospace;
    font-style: normal;
    color: #4B545C;
  }

  .name {
    font: 500 9.5px/1.2 'IBM Plex Sans', system-ui, sans-serif;
    color: #C3D0DA;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tile.sel .name { color: #EAF5FF; }

  .note {
    font: 400 8px/1 'IBM Plex Mono', ui-monospace, monospace;
    color: #616C75;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .none {
    margin: 0;
    padding: 14px 10px;
    border: 1px dashed #2E3540;
    border-radius: 4px;
    font: 400 10px/1.5 'IBM Plex Sans', system-ui, sans-serif;
    color: #69737B;
  }

  .tools { display: flex; gap: 4px; }
  .tools button {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    border: 1px solid #333B42;
    background: #12171A;
    color: #9AA6AE;
    font: 600 9px/1 'IBM Plex Sans', system-ui, sans-serif;
    padding: 6px 4px;
    border-radius: 3px;
    cursor: pointer;
    min-width: 0;
  }
  .tools button:hover { border-color: #4A555E; color: #E8EEF5; }
  .tools button.on { border-color: #0E7C70; background: #0B2320; color: #8FEDE3; }

  .hidden-input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
</style>
