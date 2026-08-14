<script>
  /**
   * Unified editor for Image/Texture background layers. Reads and writes
   * `panel[bg${prefix}Foo]` properties so one template handles both.
   *
   * Renders three PropertySections: collapsible header with file picker,
   * Geometry, and Color Effects.
   */
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import PropertyColor from '../properties/PropertyColor.svelte';
  import PropertyScrub from '../properties/PropertyScrub.svelte';
  import AlignmentPicker from '../properties/AlignmentPicker.svelte';
  import NumberCell from '../properties/NumberCell.svelte';
  import Segmented from '../properties/Segmented.svelte';
  import BlendModeSelect from '../properties/BlendModeSelect.svelte';
  import FitModeSelect from '../properties/FitModeSelect.svelte';

  let {
    panel,
    prefix,                 // 'Image' | 'Texture'
    label,                  // 'Image' | 'Texture'
    defaultFit = 'fill',    // 'fill' for Image, 'tile' for Texture
    placeholder = 'No file selected',
    collapsed = true,
    showClipping = false,
    soloActive = false,
    muteActive = false,
    canPaste = false,
    onupdate = null,        // (patch) => void — partial panel update
    onbrowse = null,        // () => void
    oncollapsetoggle = null,
    onswatchclick = null,   // (prop, value) => void
    onsolo = null,
    onmute = null,
    onreset = null,
    oncopy = null,
    onpaste = null,
  } = $props();

  // Typed field accessors — one place, one source of truth
  const f = (name) => `bg${prefix}${name}`;
  function get(name, fallback = undefined) {
    const v = panel?.[f(name)];
    return v === undefined || v === null ? fallback : v;
  }
  function set(name, value) { onupdate?.({ [f(name)]: value }); }
  function toggle(name) { set(name, !get(name, false)); }

  let fit = $derived(get('Fit', defaultFit));
  let clipMode = $derived(get('ClipMode', 'shape'));
</script>

<PropertySection title={label} {collapsed} ontoggle={(v) => oncollapsetoggle?.(v)}>
  <div class="bg-file-row">
    <button class="bg-browse-btn" title="Browse..." onclick={() => onbrowse?.()}>...</button>
    <input class="val"
           type="text"
           value={panel?.[f('')] ?? ''}
           {placeholder}
           onfocus={(e) => e.target.select()}
           onchange={(e) => set('', e.target.value)} />
  </div>
</PropertySection>

{#if !collapsed}
  <div class="layer-tools-row">
    <button class="layer-tool-btn" class:active={soloActive} title="Solo layer" onclick={() => onsolo?.()}>S</button>
    <button class="layer-tool-btn" class:active={muteActive} title="Mute layer" onclick={() => onmute?.()}>M</button>
    <button class="layer-tool-btn" title="Reset layer" onclick={() => onreset?.()}>R</button>
    <button class="layer-tool-btn" title="Copy layer settings" onclick={() => oncopy?.()}>C</button>
    <button class="layer-tool-btn" disabled={!canPaste} title="Paste layer settings" onclick={() => onpaste?.()}>P</button>
  </div>

  <PropertySection title="Geometry">
    <div class="bg-props-layout">
      <div class="bg-props-left">
        <span class="bg-props-label">Align</span>
        <AlignmentPicker value={get('Align', 'center')}
                         onchange={(v) => set('Align', v)} />
      </div>
      <div class="bg-props-right">
        <PropertyCell label="Fit" span={1} hint="How the {label.toLowerCase()} fills the panel area">
          <FitModeSelect value={fit} onchange={(v) => set('Fit', v)} />
        </PropertyCell>
        <PropertyCell label="Offset X" span={1} compact hint="Horizontal offset from anchor in pixels">
          <NumberCell label="X" value={get('OffsetX', 0)} step={1} defaultValue={0}
                      onchange={(v) => set('OffsetX', v)} />
        </PropertyCell>
        <PropertyCell label="Offset Y" span={1} compact hint="Vertical offset from anchor in pixels">
          <NumberCell label="Y" value={get('OffsetY', 0)} step={1} defaultValue={0}
                      onchange={(v) => set('OffsetY', v)} />
        </PropertyCell>
      </div>
    </div>
    <PropertyCell label="Flip H" span={1} hint="Flip {label.toLowerCase()} horizontally">
      <PropertyToggle value={get('FlipH', false)} onchange={() => toggle('FlipH')} />
    </PropertyCell>
    <PropertyCell label="Flip V" span={1} hint="Flip {label.toLowerCase()} vertically">
      <PropertyToggle value={get('FlipV', false)} onchange={() => toggle('FlipV')} />
    </PropertyCell>
    <PropertyCell label="Angle" span={2} compact hint="Rotate the {label.toLowerCase()} in degrees">
      <NumberCell label="Angle" value={get('Rotation', 0)} step={1} min={-360} max={360} defaultValue={0}
                  onchange={(v) => set('Rotation', v)} />
    </PropertyCell>
    {#if fit === 'tile'}
      <PropertyCell label="Scale" span={4} compact hint="Tile size multiplier">
        <NumberCell label="Scale" value={get('TileScale', 1.0)} step={0.1} min={0.1} defaultValue={1}
                    onchange={(v) => set('TileScale', v)} />
      </PropertyCell>
    {/if}
  </PropertySection>

  <PropertySection title="Colour Effects">
    <PropertyCell label="Blend" span={1} hint="Blend mode for compositing">
      <BlendModeSelect value={get('Blend', 'normal')}
                       onchange={(v) => set('Blend', v)} />
    </PropertyCell>
    <PropertyCell label="Opacity" span={1} compact hint="{label} layer opacity (0–100%)">
      <NumberCell label="Opac" value={get('Opacity', 100)} step={1} min={0} max={100} defaultValue={100}
                  onchange={(v) => set('Opacity', v)} />
    </PropertyCell>
    <PropertyCell label="Blur" span={1} compact hint="Blur amount in pixels">
      <NumberCell label="Blur" value={get('Blur', 0)} step={1} min={0} defaultValue={0}
                  onchange={(v) => set('Blur', v)} />
    </PropertyCell>
    <PropertyCell label="Tint" span={1} hint="Colour tint applied over the {label.toLowerCase()}">
      <PropertyColor value={String(get('Tint', 'FFFFFF'))}
                     onchange={(v) => set('Tint', v)}
                     onswatchclick={() => onswatchclick?.(f('Tint'), get('Tint', 'FFFFFF'))} />
    </PropertyCell>
    <div class="bg-effects-layout">
      <div class="bg-scrub-group">
        <PropertyScrub label="Sat" value={get('Saturation', 100)} min={0} max={200} defaultValue={100}
                       onchange={(v) => set('Saturation', v)} />
        <PropertyScrub label="Bri" value={get('Brightness', 100)} min={0} max={200} defaultValue={100}
                       onchange={(v) => set('Brightness', v)} />
        <PropertyScrub label="Con" value={get('Contrast', 100)} min={0} max={200} defaultValue={100}
                       onchange={(v) => set('Contrast', v)} />
      </div>
      <div class="bg-grayscale-col">
        <span class="bg-props-label">Gray</span>
        <button class="bg-grayscale-btn" class:active={get('Grayscale', false)}
                title="Toggle grayscale"
                onclick={() => toggle('Grayscale')}>
          B/W
        </button>
      </div>
    </div>
  </PropertySection>

  {#if showClipping}
    <PropertySection title="Clipping">
      <PropertyCell label="Mode" span={4} hint="How this layer is clipped inside the component background">
        <Segmented
          ariaLabel="Clipping mode"
          value={clipMode}
          options={[
            { value: 'none', label: 'None' },
            { value: 'shape', label: 'Shape' },
            { value: 'border-inner', label: 'Border Inner' },
          ]}
          onchange={(v) => set('ClipMode', v)}
        />
      </PropertyCell>
    </PropertySection>
  {/if}
{/if}

<style>
  .val {
    color: #DDD;
    font-size: 11px;
    background: #1A1A1A;
    padding: 4px 6px;
    border-radius: 3px;
    border: 1px solid #333;
    flex: 1;
    min-width: 0;
    font-family: inherit;
    outline: none;
    height: 26px;
  }
  .val:focus { border-color: #5B9BD5; }

  .bg-file-row {
    grid-column: span 4;
    display: flex;
    gap: 4px;
    align-items: center;
  }

  .bg-browse-btn {
    width: 36px;
    flex-shrink: 0;
    height: 26px;
    background: #252525;
    border: 1px solid #333;
    color: #888;
    font-size: 11px;
    border-radius: 3px;
    cursor: pointer;
    font-family: inherit;
  }
  .bg-browse-btn:hover { border-color: #5B9BD5; color: #DDD; }

  .bg-props-layout {
    grid-column: span 4;
    display: flex;
    gap: 4px;
  }

  .bg-props-left {
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 50%;
    flex-shrink: 0;
  }

  .bg-props-right {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  .bg-props-label {
    font-size: 9px;
    color: #5B9BD5;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    line-height: 1;
    padding-left: 2px;
    user-select: none;
  }

  .layer-tools-row {
    display: flex;
    gap: 4px;
    padding: 2px 0 4px 0;
  }

  .layer-tool-btn {
    width: 24px;
    height: 22px;
    background: #1A1A1A;
    border: 1px solid #333;
    border-radius: 3px;
    color: #777;
    font-size: 10px;
    font-family: inherit;
    cursor: pointer;
    flex-shrink: 0;
  }

  .layer-tool-btn:hover {
    border-color: #5B9BD5;
    color: #DDD;
  }

  .layer-tool-btn.active {
    border-color: #5B9BD5;
    color: #5B9BD5;
    background: #0D2A3E;
  }

  .layer-tool-btn:disabled {
    opacity: 0.3;
    pointer-events: none;
  }

  .bg-effects-layout {
    grid-column: span 4;
    display: flex;
    gap: 4px;
  }
  .bg-effects-layout .bg-scrub-group {
    flex: 3;
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 2px 0;
  }

  .bg-grayscale-col {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .bg-grayscale-btn {
    flex: 1;
    background: #1A1A1A;
    border: 1px solid #333;
    border-radius: 3px;
    color: #666;
    font-size: 10px;
    font-family: inherit;
    cursor: pointer;
    font-weight: 600;
  }
  .bg-grayscale-btn:hover { border-color: #555; color: #AAA; }
  .bg-grayscale-btn.active {
    border-color: #5B9BD5;
    color: #5B9BD5;
    background: #0D2A3E;
  }
</style>
