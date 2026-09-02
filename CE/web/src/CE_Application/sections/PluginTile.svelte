<script>
  /**
   * PluginTile.svelte — a plug-in's face: the vendor's when it shipped one, a derived one when
   * it did not.
   *
   * Most plug-ins ship no artwork, so the fallback is the normal case, not the error case: the
   * tile comes from the catalogue's stable class identity — same ceId, same colour, same
   * pattern, same initials, on every machine and after every rescan. That is what makes a list
   * recognisable by shape and colour instead of by reading, and a canvas node pickable at a
   * glance.
   *
   * The pattern is not decoration. Colour alone excludes anyone who cannot separate two hues,
   * so the same hash picks a second, non-colour channel.
   *
   * When the vendor DID ship artwork, that wins: VST3 defines Contents/Resources/Snapshots and
   * the scan already reads that folder. The URL is a native route, not a path — the WebView
   * fetches a token the catalogue published and can reach nothing else.
   *
   * A broken image falls back to the generated tile rather than to a broken-image glyph, and
   * the failure is remembered per ceId so switching plug-ins re-tries the new one.
   */
  import { pluginTile, pluginSnapshots } from '../stores/instrumentHost.js';

  // `fill` sizes the tile to whatever box it is put in — a rack row's full height rather than
  // a fixed square — which is where a snapshot earns its space: a plug-in window is wider than
  // it is tall, and at 24px it was a smudge.
  let { ceId = '', name = '', vendor = '', size = 26, fill = false } = $props();

  let tile = $derived(pluginTile(ceId, name, vendor));
  let failedFor = $state('');
  let artwork = $derived(failedFor === ceId ? '' : ($pluginSnapshots[ceId] ?? ''));
</script>

{#if artwork}
  <img class="plugin-tile art" class:fill src={artwork} alt="" aria-hidden="true"
       style={fill ? `--tile-edge:${tile.edge}` : `--tile-edge:${tile.edge};width:${size}px;height:${size}px`}
       onerror={() => (failedFor = ceId)} />
{:else}
  <span class={`plugin-tile ${tile.pattern}`} class:fill aria-hidden="true"
        style={fill
          ? `--tile-bg:${tile.background};--tile-edge:${tile.edge};--tile-ink:${tile.ink}`
          : `--tile-bg:${tile.background};--tile-edge:${tile.edge};--tile-ink:${tile.ink};
             width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px`}>
    {tile.initials}
  </span>
{/if}

<style>
  .plugin-tile {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    border: 1px solid var(--tile-edge);
    border-radius: 4px;
    background-color: var(--tile-bg);
    color: var(--tile-ink);
    font-weight: 600;
    letter-spacing: 0.5px;
    user-select: none;
  }
  /* Snapshots are wider than they are tall — a plug-in window, not an icon — so the tile crops
     to its own square rather than letterboxing it into a shape nothing else in the list has. */
  .plugin-tile.art {
    object-fit: cover;
    background-color: #12151b;
  }
  /* Filling a box: the tile covers whatever box holds it and never sizes that box. This has
     to be absolute — an image with `height: 100%` in a stretched flex item resolves to its own
     natural height, and a 320-pixel snapshot then makes a 260-pixel rack row, which is the
     picture sizing the row rather than the row sizing the picture. The crop stays `cover`,
     so the picture keeps its face rather than letterboxing to a strip. */
  .plugin-tile.fill {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    font-size: 18px;
  }
  .plugin-tile.stripe {
    background-image: repeating-linear-gradient(45deg,
      rgba(255, 255, 255, 0.09) 0 3px, transparent 3px 7px);
  }
  .plugin-tile.dots {
    background-image: radial-gradient(rgba(255, 255, 255, 0.14) 1px, transparent 1.2px);
    background-size: 6px 6px;
  }
  .plugin-tile.corner {
    background-image: linear-gradient(225deg, rgba(255, 255, 255, 0.16) 0 34%, transparent 34%);
  }
</style>
