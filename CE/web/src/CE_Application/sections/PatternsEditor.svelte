<script>
  /**
   * A background's patterns (utils/patternLayers.js): one tile, tinted and repeated, behind the
   * content or in front of it, and moving on its own if it has a speed. Several at once, each its
   * own section, in the order they draw.
   *
   * A pattern's image is a built-in tile or one read into the panel as a data URL, never a path:
   * the plug-in a panel is exported to has to draw it, and a path names a file on this machine.
   */
  import { onDestroy } from 'svelte';
  import Waves from 'lucide-svelte/icons/waves';
  import Plus from 'lucide-svelte/icons/plus';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertyScrub from '../properties/PropertyScrub.svelte';
  import BlendModeSelect from '../properties/BlendModeSelect.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import { updateInspectorControlProperty } from '../stores/controls.js';
  import { browseImage, onImageBrowsed } from '../bridge/bridge.js';
  import { fileCache, loadFile } from '../stores/fileCache.js';
  import {
    PATTERN_TILES, PATTERN_TILE_NAMES, addPatternPatch, builtinTile, cleanTint, patternEntries,
    patternLabel, patternVelocity, readPattern,
  } from '../utils/patternLayers.js';

  let {
    controlId = '',
    background = null,
    pathPrefix = 'Background',
    // The Background editor's write, which goes to every selected control.
    set = () => {},
  } = $props();

  let entries = $derived(patternEntries(background));

  const DIRECTIONS = [
    { value: 0, label: '→ right' }, { value: 180, label: '← left' }, { value: 90, label: '↓ down' }, { value: 270, label: '↑ up' },
    { value: 45, label: '↘' }, { value: 135, label: '↙' }, { value: 225, label: '↖' }, { value: 315, label: '↗' },
  ];

  function field(name, key, value) {
    set(`${pathPrefix}.Patterns.${name}.${key}`, value);
  }

  // Added to and removed from the control being edited: patterns are named per control, so the same
  // write on several would put pattern2 on one and overwrite another's.
  function addPattern() {
    if (!controlId) return;
    const { patch } = addPatternPatch(background, pathPrefix);
    for (const [path, value] of Object.entries(patch)) updateInspectorControlProperty(controlId, path, value);
  }

  function removePattern(name) {
    if (!controlId) return;
    const rest = Object.fromEntries(entries.filter(([key]) => key !== name));
    updateInspectorControlProperty(controlId, `${pathPrefix}.Patterns`, { _type: 'Patterns', _children: rest });
  }

  function tileValue(src) {
    const match = /^builtin:([a-z]+)$/.exec(String(src ?? ''));
    return match && PATTERN_TILES[match[1]] ? match[1] : 'image';
  }

  // --- Your own image: picked, read into the panel, then stored ---------------------------------
  // { name, requestId, filePath, stop }: the pattern whose image is being read, shown as Reading….
  let waitingFor = $state.raw(null);

  function chooseImage(name) {
    if (!controlId) return;
    const requestId = `pattern:${controlId}:${pathPrefix}:${name}`;
    waitingFor = { name, requestId, filePath: '', stop: null };
    browseImage(requestId);
  }

  const stopBrowsed = onImageBrowsed((result) => {
    if (!waitingFor || result.requestId !== waitingFor.requestId || !result.filePath) return;
    const wanted = waitingFor;
    wanted.filePath = result.filePath;
    loadFile(result.filePath);
    wanted.stop = fileCache.subscribe((cache) => {
      const data = cache[wanted.filePath];
      if (typeof data !== 'string' || !data.startsWith('data:')) return;
      queueMicrotask(() => wanted.stop?.());
      if (waitingFor === wanted) waitingFor = null;
      updateInspectorControlProperty(controlId, `${pathPrefix}.Patterns.${wanted.name}.src`, data);
    });
  });

  onDestroy(() => {
    stopBrowsed?.();
    waitingFor?.stop?.();
  });

  const argbHex = (argb) => `#${String(argb).slice(2).toLowerCase()}`;
</script>

<PropertySection title="Patterns" icon={Waves}>
  <div class="patterns-head">
    <p class="hint">One tile, tinted and repeated — a wave, dots, lines — behind the content or in front of it. With a speed it moves, in Preview and in the plug-in.</p>
    <button type="button" class="action-btn add" onclick={addPattern} disabled={!controlId}><Plus size={12} /> Add a pattern</button>
  </div>
</PropertySection>

{#each entries as [name, node] (name)}
  {@const pattern = readPattern(node)}
  {@const velocity = patternVelocity(pattern)}
  <PropertySection title={patternLabel(name)} icon={Waves}>
    {#snippet tools()}
      <button type="button" class="tool" title="Remove this pattern" aria-label={`Remove ${patternLabel(name)}`} onclick={() => removePattern(name)}>
        <Trash2 size={12} />
      </button>
    {/snippet}
    <PropertyCell label="Tile" span={2} hint="The picture repeated: a built-in tile, or an image of your own, read into the panel so it travels with it.">
      <select class="val" value={tileValue(pattern.src)} aria-label={`${patternLabel(name)} tile`}
              onchange={(event) => { if (event.currentTarget.value !== 'image') field(name, 'src', `builtin:${event.currentTarget.value}`); else chooseImage(name); }}>
        {#each PATTERN_TILE_NAMES as tile (tile)}<option value={tile}>{PATTERN_TILES[tile].label}</option>{/each}
        <option value="image">{builtinTile(pattern.src) ? 'Your image…' : 'Your image'}</option>
      </select>
    </PropertyCell>
    <PropertyCell label="Image" span={2} hint="Choose an image for this pattern. Its opaque pixels are painted in the tint; a one-colour PNG works best.">
      <button type="button" class="action-btn" onclick={() => chooseImage(name)}>{waitingFor?.name === name ? 'Reading…' : 'Choose…'}</button>
    </PropertyCell>
    <PropertyCell label="Tint" span={2} path={`${pathPrefix}.Patterns.${name}.tint`} hint="The colour it is painted in, AARRGGBB. Animate it like a fill colour: Background › Pattern tint.">
      <div class="color-input">
        <input type="color" class="swatch" value={argbHex(pattern.tint)} aria-label={`${patternLabel(name)} tint colour`}
               onchange={(event) => field(name, 'tint', `${pattern.tint.slice(0, 2)}${event.currentTarget.value.slice(1).toUpperCase()}`)} />
        <input class="val" type="text" value={pattern.tint} aria-label={`${patternLabel(name)} tint`}
               onchange={(event) => field(name, 'tint', cleanTint(event.currentTarget.value, pattern.tint))} />
      </div>
    </PropertyCell>
    <PropertyCell label="Opacity" span={2} hint="0 to 100.">
      <PropertyScrub value={pattern.opacity} step={1} min={0} max={100} defaultValue={100} onchange={(v) => field(name, 'opacity', v)} />
    </PropertyCell>
    <PropertyCell label="Size" span={2} hint="The tile's size: 1 is as drawn, 2 twice as large.">
      <PropertyScrub value={pattern.scale} step={0.05} min={0.1} max={10} defaultValue={1} onchange={(v) => field(name, 'scale', v)} />
    </PropertyCell>
    <PropertyCell label="Repeat" span={2} hint="Everywhere, along one row, or down one column.">
      <select class="val" value={pattern.repeat} onchange={(event) => field(name, 'repeat', event.currentTarget.value)}>
        <option value="both">Everywhere</option>
        <option value="x">One row</option>
        <option value="y">One column</option>
      </select>
    </PropertyCell>
    {#if pattern.repeat !== 'both'}
      <PropertyCell label="Sits" span={2} hint="Where the row or column is in the control; Offset moves it from there.">
        <select class="val" value={pattern.align} onchange={(event) => field(name, 'align', event.currentTarget.value)}>
          <option value="start">{pattern.repeat === 'x' ? 'Top' : 'Left'}</option>
          <option value="center">{pattern.repeat === 'x' ? 'Middle' : 'Centre'}</option>
          <option value="end">{pattern.repeat === 'x' ? 'Bottom' : 'Right'}</option>
        </select>
      </PropertyCell>
    {/if}
    <PropertyCell label="Place" span={2} hint="Behind the text and content, over the fill; or in front of them.">
      <select class="val" value={pattern.place} onchange={(event) => field(name, 'place', event.currentTarget.value)}>
        <option value="behind">Behind the content</option>
        <option value="front">In front of the content</option>
      </select>
    </PropertyCell>
    <PropertyCell label="Speed" span={2} hint="Pixels a second; 0 holds it still. It stops under reduced motion.">
      <PropertyScrub value={pattern.speed} step={1} min={0} max={2000} defaultValue={0} onchange={(v) => field(name, 'speed', v)} />
    </PropertyCell>
    <PropertyCell label="Direction" span={2} hint="Which way it moves, in degrees: 0 right, 90 down, 180 left, 270 up.">
      <div class="color-input">
        <select class="val" value={DIRECTIONS.some((entry) => entry.value === pattern.direction) ? String(pattern.direction) : ''}
                aria-label={`${patternLabel(name)} direction`}
                onchange={(event) => { if (event.currentTarget.value !== '') field(name, 'direction', Number(event.currentTarget.value)); }}>
          {#each DIRECTIONS as entry (entry.value)}<option value={String(entry.value)}>{entry.label}</option>{/each}
          <option value="">{pattern.direction}°</option>
        </select>
        <PropertyScrub value={pattern.direction} step={1} min={0} max={359} defaultValue={0} onchange={(v) => field(name, 'direction', v)} />
      </div>
    </PropertyCell>
    {#if pattern.speed > 0 && pattern.repeat !== 'both' && ((pattern.repeat === 'x' && !velocity.vx) || (pattern.repeat === 'y' && !velocity.vy))}
      <p class="note">A {pattern.repeat === 'x' ? 'row moves only left or right' : 'column moves only up or down'}: this direction holds it still. Repeat it everywhere to move it this way.</p>
    {/if}
    <PropertyCell label="Offset X" span={1} hint="Pixels: where a tile edge falls.">
      <PropertyScrub value={pattern.offsetX} step={1} defaultValue={0} onchange={(v) => field(name, 'offsetX', v)} />
    </PropertyCell>
    <PropertyCell label="Offset Y" span={1} hint="Pixels: where a tile edge falls.">
      <PropertyScrub value={pattern.offsetY} step={1} defaultValue={0} onchange={(v) => field(name, 'offsetY', v)} />
    </PropertyCell>
    <PropertyCell label="Blend" span={2} hint="How it composites with what is under it.">
      <BlendModeSelect value={pattern.blend} onchange={(v) => field(name, 'blend', v)} />
    </PropertyCell>
    <PropertyCell label="Flip" span={2} hint="Mirror the tile across or up and down.">
      <div class="flips">
        <PropertyToggle compact label="Across" value={pattern.flipX} ariaLabel={`${patternLabel(name)} flipped across`} onchange={(v) => field(name, 'flipX', v)} />
        <PropertyToggle compact label="Up and down" value={pattern.flipY} ariaLabel={`${patternLabel(name)} flipped up and down`} onchange={(v) => field(name, 'flipY', v)} />
      </div>
    </PropertyCell>
    <PropertyCell label="Show" span={2} hint="Switch the pattern off without losing it.">
      <PropertyToggle value={pattern.enabled} ariaLabel={`${patternLabel(name)} shown`} onchange={(v) => field(name, 'enabled', v)} />
    </PropertyCell>
  </PropertySection>
{/each}

<style>
  .patterns-head { grid-column: span 4; display: flex; flex-direction: column; gap: 6px; }
  .hint { margin: 0; color: #9AA4AD; font-size: 11px; line-height: 1.4; }
  .note { grid-column: span 4; margin: 0; color: #D9B26C; font-size: 11px; line-height: 1.4; }
  .val { box-sizing: border-box; width: 100%; min-width: 0; height: var(--pp-field-height, 26px); padding: var(--pp-field-padding, 0 6px); background: var(--pp-field-bg, #1A1A1A); border: 1px solid var(--pp-field-border, #333); border-radius: var(--pp-field-radius, 3px); color: var(--pp-field-fg, #DDD); font-size: var(--pp-field-font, 11px); font-family: inherit; outline: none; }
  .val:focus { border-color: var(--pp-field-focus, #5B9BD5); }
  .color-input { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; }
  .swatch { width: 22px; height: 22px; flex: none; padding: 0; border: 1px solid #555; border-radius: 3px; background: transparent; cursor: pointer; }
  .action-btn {
    height: 26px; padding: 0 10px; border-radius: 3px; border: 1px solid #333; background: #252525; color: #DDD;
    font-size: 11px; font-family: inherit; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;
  }
  .action-btn:hover:not(:disabled) { border-color: #5B9BD5; }
  .action-btn.add { align-self: flex-start; }
  .tool { width: 20px; height: 20px; display: inline-flex; align-items: center; justify-content: center; padding: 0; border: 1px solid transparent; border-radius: 3px; background: transparent; color: #9AA4AD; cursor: pointer; }
  .tool:hover { border-color: #5C3A3A; color: #D98C8C; }
  .flips { display: flex; gap: 6px; align-items: center; }
</style>
