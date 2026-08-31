<script>
  /**
   * PluginTile.svelte — a plug-in's face, derived rather than found.
   *
   * VST3 ships no icon and there is nothing on disk to read, so the tile comes from the
   * catalogue's stable class identity: same ceId, same colour, same pattern, same initials,
   * on every machine and after every rescan. That is the whole point — a list you recognise
   * by shape and colour instead of reading, and a canvas node you can pick out at a glance.
   *
   * The pattern is not decoration. Colour alone excludes anyone who cannot separate two hues,
   * so the same hash picks a second, non-colour channel.
   *
   * A real snapshot of the plug-in's own window would be better and is the next increment;
   * this needs nothing loaded, which is why it comes first.
   */
  import { pluginTile } from '../stores/instrumentHost.js';

  let { ceId = '', name = '', vendor = '', size = 26 } = $props();
  let tile = $derived(pluginTile(ceId, name, vendor));
</script>

<span class={`plugin-tile ${tile.pattern}`} aria-hidden="true"
      style={`--tile-bg:${tile.background};--tile-edge:${tile.edge};--tile-ink:${tile.ink};
              width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px`}>
  {tile.initials}
</span>

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
