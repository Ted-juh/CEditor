<script>
  import { PaintBucket, Blend, Image, Layers, ChevronUp, ChevronDown } from 'lucide-svelte';
  import { getSection, updateControlProperty, updateSelectedProperty } from '../stores/controls.js';
  import { selectedComponentIds } from '../stores/panels.js';
  import { activateColorTarget } from '../stores/colorTarget.js';
  import { activateGradientTarget } from '../stores/gradientTarget.js';
  import PropertySection from '../properties/PropertySection.svelte';
  import { sectionCollapse, setCollapsed } from '../stores/sectionCollapse.js';
  import { deepClone } from '../utils/deepClone.js';
  import { gradientToCSS } from '../utils/gradientCSS.js';
  import LayerEffectsSection from '../panels/LayerEffectsSection.svelte';
  import NumberInput from './NumberInput.svelte';
  import { browseImage, onImageBrowsed } from '../bridge/bridge.js';
  import BlendModeSelect from '../properties/BlendModeSelect.svelte';
  import { SECTION_DEFAULTS } from '../models/sectionDefaults.js';
  import { backgroundLayerClipboard, copyBackgroundLayer, getBackgroundLayerClipboard } from '../stores/backgroundLayerClipboard.js';

  let { control = null } = $props();

  const DEFAULT_FILL_GRADIENT = {
    type: 'linear',
    angle: 90,
    centerX: 50,
    centerY: 50,
    radiusX: 50,
    radiusY: 50,
    edge: 0,
    stops: [
      { color: 'FF0000', position: 0 },
      { color: '0000FF', position: 100 },
    ],
  };

  const DEFAULT_FILL_ORDER = ['solid', 'gradient', 'image', 'overlay'];
  const layerLabels = { solid: 'Solid', gradient: 'Gradient', image: 'Image', overlay: 'Overlay' };
  const layerIcons = { solid: PaintBucket, gradient: Blend, image: Image, overlay: Layers };
  const LAYER_PROP_GROUPS = {
    solid: ['colour', 'solidBlend', 'solidClipMode'],
    gradient: ['gradient', 'gradientOpacity', 'gradientName', 'gradientBlend', 'gradientClipMode'],
    image: ['imageSrc', 'imageOpacity', 'imageFit', 'imageAlign', 'imageOffsetX', 'imageOffsetY', 'imageBlend', 'imageBlur', 'imageTint', 'imageFlipH', 'imageFlipV', 'imageRotation', 'imageGrayscale', 'imageSaturation', 'imageBrightness', 'imageContrast', 'imageTileScale', 'imageClipMode'],
    overlay: ['overlaySrc', 'overlayOpacity', 'overlayFit', 'overlayAlign', 'overlayOffsetX', 'overlayOffsetY', 'overlayBlend', 'overlayBlur', 'overlayTint', 'overlayFlipH', 'overlayFlipV', 'overlayRotation', 'overlayGrayscale', 'overlaySaturation', 'overlayBrightness', 'overlayContrast', 'overlayTileScale', 'overlayClipMode'],
  };

  let core = $derived(getSection(control, 'Core'));
  let background = $derived(getSection(control, 'Background'));
  let fill = $derived(background?._children?.Fill);

  function set(path, value) {
    if (!core?.id) return;
    if ($selectedComponentIds.size > 1) {
      updateSelectedProperty(path, value);
    } else {
      updateControlProperty(core.id, path, value);
    }
  }

  function selectAll(e) {
    e.target.select();
  }

  function legacyMode() {
    return background?.mode === 'none' ? 'overlay' : (background?.mode ?? 'solid');
  }

  function fillOrder() {
    return fill?.layerOrder?.length ? fill.layerOrder : DEFAULT_FILL_ORDER;
  }

  function isLayerEnabled(layerId) {
    if (layerId === 'solid') {
      return fill?.solidEnabled !== undefined ? fill.solidEnabled !== false : legacyMode() === 'solid';
    }
    if (layerId === 'gradient') {
      return fill?.gradientEnabled !== undefined ? fill.gradientEnabled === true : legacyMode() === 'gradient';
    }
    if (layerId === 'image') {
      return fill?.imageEnabled !== undefined ? fill.imageEnabled === true : legacyMode() === 'image';
    }
    if (layerId === 'overlay') {
      return fill?.overlayEnabled !== undefined ? fill.overlayEnabled === true : legacyMode() === 'overlay';
    }
    return false;
  }

  function layerCollapseKey(layerId) {
    return `component-bg:${core?.id ?? 'global'}:layer:${layerId}`;
  }

  function sectionKey(name) {
    return `component-bg:${core?.id ?? 'global'}:${name}`;
  }

  function setPrimaryLayer(layerId) {
    set('Background.mode', layerId);
    set('Background.Fill.mode', layerId);
  }

  function topEnabledLayer(excluding = null) {
    for (const layerId of [...fillOrder()].reverse()) {
      if (layerId === excluding) continue;
      if (isLayerEnabled(layerId)) return layerId;
    }
    return 'solid';
  }

  function ensureFillGradient() {
    if (fill?.gradient?.stops?.length >= 2) return fill.gradient;
    const seeded = deepClone(DEFAULT_FILL_GRADIENT);
    set('Background.Fill.gradient', seeded);
    return seeded;
  }

  function openGradientEditor() {
    if (!core?.id || $selectedComponentIds.size > 1) return;
    const currentGradient = ensureFillGradient();
    activateGradientTarget(
      { type: 'control', controlId: core.id, path: 'Background.Fill' },
      currentGradient
    );
  }

  function chooseFillAsset(layerId) {
    if ($selectedComponentIds.size > 1) return;
    browseImage(`componentBackground:${core?.id ?? 'unknown'}:${layerId}`);
  }

  onImageBrowsed((result) => {
    if (!core?.id) return;
    const imageRequestId = `componentBackground:${core.id}:image`;
    const overlayRequestId = `componentBackground:${core.id}:overlay`;
    if (result.requestId === imageRequestId) {
      set('Background.Fill.imageSrc', result.filePath);
    } else if (result.requestId === overlayRequestId) {
      set('Background.Fill.overlaySrc', result.filePath);
    }
  });

  function setFillProp(prop, value) {
    set(`Background.Fill.${prop}`, value);
  }

  function getFillDefault(prop) {
    return deepClone(SECTION_DEFAULTS.Background._children.Fill[prop]);
  }

  function isLayerMuted(layerId) {
    return fill?.[`${layerId}Muted`] === true;
  }

  function isLayerSolo(layerId) {
    return fill?.soloLayer === layerId;
  }

  function toggleLayerMute(layerId) {
    setFillProp(`${layerId}Muted`, !isLayerMuted(layerId));
  }

  function toggleLayerSolo(layerId) {
    setFillProp('soloLayer', isLayerSolo(layerId) ? '' : layerId);
  }

  function resetLayer(layerId) {
    const props = LAYER_PROP_GROUPS[layerId] ?? [];
    for (const prop of props) {
      setFillProp(prop, getFillDefault(prop));
    }
    setFillProp(`${layerId}Muted`, false);
    if (isLayerSolo(layerId)) setFillProp('soloLayer', '');
  }

  function copyLayer(layerId) {
    const props = LAYER_PROP_GROUPS[layerId] ?? [];
    const data = {};
    for (const prop of props) {
      data[prop] = deepClone(fill?.[prop] ?? getFillDefault(prop));
    }
    copyBackgroundLayer({ layerId, data });
  }

  function canPasteLayer(layerId) {
    return $backgroundLayerClipboard?.layerId === layerId;
  }

  function pasteLayer(layerId) {
    const clip = getBackgroundLayerClipboard();
    if (!clip || clip.layerId !== layerId) return;
    for (const [prop, value] of Object.entries(clip.data ?? {})) {
      setFillProp(prop, deepClone(value));
    }
    if (layerId === 'gradient' && clip.data?.gradient && !isLayerEnabled('gradient')) {
      set('Background.Fill.gradientEnabled', true);
    }
    if (layerId === 'image' && !isLayerEnabled('image')) {
      set('Background.Fill.imageEnabled', true);
    }
    if (layerId === 'overlay' && !isLayerEnabled('overlay')) {
      set('Background.Fill.overlayEnabled', true);
    }
    if (layerId === 'solid' && !isLayerEnabled('solid')) {
      set('Background.Fill.solidEnabled', true);
    }
  }

  function panelKeyToFillProp(key, prefix) {
    const source = prefix === 'Image' ? 'image' : 'overlay';
    const fullPrefix = `bg${prefix}`;
    if (!key.startsWith(fullPrefix)) return null;
    const suffix = key.slice(fullPrefix.length);
    if (!suffix) return `${source}Src`;
    return `${source}${suffix}`;
  }

  function handleFillSwatchClick(prop, currentColor) {
    if (!core?.id) return;
    const fillProp = prop.startsWith('bg') ? (panelKeyToFillProp(prop, prop.startsWith('bgImage') ? 'Image' : 'Texture')) : prop;
    if (!fillProp) return;
    activateColorTarget(
      { type: 'control', controlId: core.id, path: `Background.Fill.${fillProp}` },
      currentColor
    );
  }

  function fillLayerPanel(prefix) {
    const source = prefix === 'Image' ? 'image' : 'overlay';
    return {
      [`bg${prefix}`]: fill?.[`${source}Src`] ?? '',
      [`bg${prefix}Fit`]: fill?.[`${source}Fit`] ?? (source === 'image' ? 'fill' : 'tile'),
      [`bg${prefix}Align`]: fill?.[`${source}Align`] ?? 'center',
      [`bg${prefix}OffsetX`]: fill?.[`${source}OffsetX`] ?? 0,
      [`bg${prefix}OffsetY`]: fill?.[`${source}OffsetY`] ?? 0,
      [`bg${prefix}FlipH`]: fill?.[`${source}FlipH`] ?? false,
      [`bg${prefix}FlipV`]: fill?.[`${source}FlipV`] ?? false,
      [`bg${prefix}Rotation`]: fill?.[`${source}Rotation`] ?? 0,
      [`bg${prefix}TileScale`]: fill?.[`${source}TileScale`] ?? 1.0,
      [`bg${prefix}Blend`]: fill?.[`${source}Blend`] ?? 'normal',
      [`bg${prefix}Opacity`]: fill?.[`${source}Opacity`] ?? 100,
      [`bg${prefix}Blur`]: fill?.[`${source}Blur`] ?? 0,
      [`bg${prefix}Tint`]: fill?.[`${source}Tint`] ?? 'FFFFFF',
      [`bg${prefix}Saturation`]: fill?.[`${source}Saturation`] ?? 100,
      [`bg${prefix}Brightness`]: fill?.[`${source}Brightness`] ?? 100,
      [`bg${prefix}Contrast`]: fill?.[`${source}Contrast`] ?? 100,
      [`bg${prefix}Grayscale`]: fill?.[`${source}Grayscale`] ?? false,
      [`bg${prefix}ClipMode`]: fill?.[`${source}ClipMode`] ?? 'shape',
    };
  }

  function updateFillLayer(prefix, patch) {
    for (const [key, value] of Object.entries(patch)) {
      const prop = panelKeyToFillProp(key, prefix);
      if (!prop) continue;
      setFillProp(prop, value);
    }
  }

  function toggleLayer(layerId) {
    const next = !isLayerEnabled(layerId);

    if (layerId === 'solid') {
      set('Background.Fill.solidEnabled', next);
    } else if (layerId === 'gradient') {
      if (next) ensureFillGradient();
      set('Background.Fill.gradientEnabled', next);
    } else if (layerId === 'image') {
      set('Background.Fill.imageEnabled', next);
    } else if (layerId === 'overlay') {
      set('Background.Fill.overlayEnabled', next);
    }

    if (next) {
      setPrimaryLayer(layerId);
      setCollapsed(layerCollapseKey(layerId), false);
      if (layerId === 'gradient') {
        openGradientEditor();
      } else if ((layerId === 'image' || layerId === 'overlay') && !(layerId === 'image' ? fill?.imageSrc : fill?.overlaySrc)) {
        chooseFillAsset(layerId);
      }
    } else {
      setPrimaryLayer(topEnabledLayer(layerId));
    }
  }

  function activateLayerForEditing(layerId, e) {
    e.preventDefault();
    e.stopPropagation();

    if (!isLayerEnabled(layerId)) {
      if (layerId === 'solid') {
        set('Background.Fill.solidEnabled', true);
      } else if (layerId === 'gradient') {
        ensureFillGradient();
        set('Background.Fill.gradientEnabled', true);
      } else if (layerId === 'image') {
        set('Background.Fill.imageEnabled', true);
      } else if (layerId === 'overlay') {
        set('Background.Fill.overlayEnabled', true);
      }
    }

    setPrimaryLayer(layerId);
    setCollapsed(layerCollapseKey(layerId), false);

    if (layerId === 'gradient') {
      openGradientEditor();
    } else if ((layerId === 'image' || layerId === 'overlay') && !(layerId === 'image' ? fill?.imageSrc : fill?.overlaySrc)) {
      chooseFillAsset(layerId);
    }
  }

  function moveLayer(layerId, dir) {
    const order = [...fillOrder()];
    const idx = order.indexOf(layerId);
    const newIdx = idx + dir;
    if (idx < 0 || newIdx < 0 || newIdx >= order.length) return;
    [order[idx], order[newIdx]] = [order[newIdx], order[idx]];
    set('Background.Fill.layerOrder', order);
  }

  function handleSwatchClick() {
    if (!core?.id || !fill?.colour) return;
    activateColorTarget(
      { type: 'control', controlId: core.id, path: 'Background.Fill.colour' },
      fill.colour
    );
  }

  function setColour(e) {
    let val = e.target.value.replace(/^#/, '').toUpperCase();
    if (val.length === 6) val = 'FF' + val;
    set('Background.Fill.colour', val);
  }

  let displayColour = $derived(fill?.colour ? fill.colour.slice(-6) : '3A3A3A');
  let gradientPreview = $derived(gradientToCSS(fill?.gradient ?? DEFAULT_FILL_GRADIENT));
</script>

{#if background}
  <div class="bg-editor">
    <PropertySection title="Background">
      <div class="bg-layer-buttons">
        {#each fillOrder() as layerId (layerId)}
          {@const Icon = layerIcons[layerId]}
          <button
            class="bg-layer-btn"
            class:active={isLayerEnabled(layerId)}
            title={`${layerLabels[layerId]} — left-click toggles, right-click edits`}
            onclick={() => toggleLayer(layerId)}
            oncontextmenu={(e) => activateLayerForEditing(layerId, e)}
          >
            <Icon size={14} strokeWidth={1.5} />
            <span class="bg-layer-label">{layerLabels[layerId]}</span>
          </button>
        {/each}
      </div>
    </PropertySection>

    <PropertySection
      title="Z-Order"
      collapsed={$sectionCollapse[sectionKey('zorder')] ?? true}
      ontoggle={(v) => setCollapsed(sectionKey('zorder'), v)}
    >
      <div class="zorder-hint">Front</div>
      {#each [...fillOrder()].reverse() as layerId, i}
        {@const realIdx = fillOrder().length - 1 - i}
        <div class="zorder-row" class:enabled={isLayerEnabled(layerId)}>
          <span class="zorder-label">{layerLabels[layerId]}</span>
          <span class="zorder-status">{isLayerEnabled(layerId) ? 'on' : 'off'}</span>
          <button class="zorder-btn" disabled={realIdx === fillOrder().length - 1} title="Move up (front)" onclick={() => moveLayer(layerId, 1)}>
            <ChevronUp size={12} strokeWidth={1.5} />
          </button>
          <button class="zorder-btn" disabled={realIdx === 0} title="Move down (back)" onclick={() => moveLayer(layerId, -1)}>
            <ChevronDown size={12} strokeWidth={1.5} />
          </button>
        </div>
      {/each}
      <div class="zorder-hint">Back</div>
    </PropertySection>

    {#each [...fillOrder()].reverse() as layerId (layerId)}
      {#if layerId === 'solid' && isLayerEnabled('solid')}
        <PropertySection
          title="Solid"
          collapsed={$sectionCollapse[layerCollapseKey('solid')] ?? false}
          ontoggle={(v) => setCollapsed(layerCollapseKey('solid'), v)}
        >
          <div class="layer-tools-row">
            <button class="layer-tool-btn" class:active={isLayerSolo('solid')} title="Solo layer" onclick={() => toggleLayerSolo('solid')}>S</button>
            <button class="layer-tool-btn" class:active={isLayerMuted('solid')} title="Mute layer" onclick={() => toggleLayerMute('solid')}>M</button>
            <button class="layer-tool-btn" title="Reset layer" onclick={() => resetLayer('solid')}>R</button>
            <button class="layer-tool-btn" title="Copy layer settings" onclick={() => copyLayer('solid')}>C</button>
            <button class="layer-tool-btn" disabled={!canPasteLayer('solid')} title="Paste layer settings" onclick={() => pasteLayer('solid')}>P</button>
          </div>
          <div class="prop-row full-span">
            <span class="lbl">Colour</span>
            <div class="color-input">
              <button class="mini-swatch" title="Pick colour" style="background:#{displayColour}" onclick={handleSwatchClick}></button>
              <input class="val" type="text" value={displayColour} onfocus={selectAll} onchange={setColour} />
            </div>
          </div>
          <div class="prop-row full-span">
            <span class="lbl">Blend</span>
            <BlendModeSelect value={fill?.solidBlend ?? 'normal'} onchange={(v) => setFillProp('solidBlend', v)} />
          </div>
          <div class="prop-row full-span">
            <span class="lbl">Clipping</span>
            <select class="val" value={fill?.solidClipMode ?? 'shape'} onchange={(e) => setFillProp('solidClipMode', e.target.value)}>
              <option value="none">None</option>
              <option value="shape">Shape</option>
              <option value="border-inner">Border Inner</option>
            </select>
          </div>
        </PropertySection>
      {/if}

      {#if layerId === 'gradient' && isLayerEnabled('gradient')}
        <PropertySection
          title="Gradient"
          collapsed={$sectionCollapse[layerCollapseKey('gradient')] ?? false}
          ontoggle={(v) => setCollapsed(layerCollapseKey('gradient'), v)}
        >
          <div class="layer-tools-row">
            <button class="layer-tool-btn" class:active={isLayerSolo('gradient')} title="Solo layer" onclick={() => toggleLayerSolo('gradient')}>S</button>
            <button class="layer-tool-btn" class:active={isLayerMuted('gradient')} title="Mute layer" onclick={() => toggleLayerMute('gradient')}>M</button>
            <button class="layer-tool-btn" title="Reset layer" onclick={() => resetLayer('gradient')}>R</button>
            <button class="layer-tool-btn" title="Copy layer settings" onclick={() => copyLayer('gradient')}>C</button>
            <button class="layer-tool-btn" disabled={!canPasteLayer('gradient')} title="Paste layer settings" onclick={() => pasteLayer('gradient')}>P</button>
          </div>
          <div class="prop-row full-span">
            <span class="lbl">Preview</span>
            <button class="bg-swatch" style="background:{gradientPreview}" title="Edit gradient" onclick={openGradientEditor}></button>
          </div>
          <div class="prop-row full-span">
            <span class="lbl">Gradient</span>
            <div class="asset-row">
              <button class="action-btn" onclick={openGradientEditor}>Edit</button>
              <span class="hint-text">Display Panel → Gradient</span>
            </div>
          </div>
          <div class="prop-row full-span">
            <span class="lbl">Name</span>
            <input class="val" type="text" value={fill?.gradientName ?? ''} placeholder="Unnamed" onfocus={selectAll} onchange={(e) => setFillProp('gradientName', e.target.value)} />
          </div>
          <div class="prop-row full-span">
            <span class="lbl">Opacity</span>
            <NumberInput value={fill?.gradientOpacity ?? 100} step={1} min={0} max={100} onchange={(v) => setFillProp('gradientOpacity', v)} />
          </div>
          <div class="prop-row full-span">
            <span class="lbl">Blend</span>
            <BlendModeSelect value={fill?.gradientBlend ?? 'normal'} onchange={(v) => setFillProp('gradientBlend', v)} />
          </div>
          <div class="prop-row full-span">
            <span class="lbl">Clipping</span>
            <select class="val" value={fill?.gradientClipMode ?? 'shape'} onchange={(e) => setFillProp('gradientClipMode', e.target.value)}>
              <option value="none">None</option>
              <option value="shape">Shape</option>
              <option value="border-inner">Border Inner</option>
            </select>
          </div>
        </PropertySection>
      {/if}

      {#if layerId === 'image' && isLayerEnabled('image')}
        <LayerEffectsSection
          panel={fillLayerPanel('Image')}
          prefix="Image"
          label="Image"
          defaultFit="fill"
          placeholder="No image selected"
          showClipping={true}
          soloActive={isLayerSolo('image')}
          muteActive={isLayerMuted('image')}
          canPaste={canPasteLayer('image')}
          collapsed={$sectionCollapse[layerCollapseKey('image')] ?? false}
          onupdate={(patch) => updateFillLayer('Image', patch)}
          onbrowse={() => chooseFillAsset('image')}
          oncollapsetoggle={(v) => setCollapsed(layerCollapseKey('image'), v)}
          onswatchclick={(prop, value) => handleFillSwatchClick(prop, value)}
          onsolo={() => toggleLayerSolo('image')}
          onmute={() => toggleLayerMute('image')}
          onreset={() => resetLayer('image')}
          oncopy={() => copyLayer('image')}
          onpaste={() => pasteLayer('image')}
        />
      {/if}

      {#if layerId === 'overlay' && isLayerEnabled('overlay')}
        <LayerEffectsSection
          panel={fillLayerPanel('Texture')}
          prefix="Texture"
          label="Overlay"
          defaultFit="tile"
          placeholder="No overlay selected"
          showClipping={true}
          soloActive={isLayerSolo('overlay')}
          muteActive={isLayerMuted('overlay')}
          canPaste={canPasteLayer('overlay')}
          collapsed={$sectionCollapse[layerCollapseKey('overlay')] ?? false}
          onupdate={(patch) => updateFillLayer('Texture', patch)}
          onbrowse={() => chooseFillAsset('overlay')}
          oncollapsetoggle={(v) => setCollapsed(layerCollapseKey('overlay'), v)}
          onswatchclick={(prop, value) => handleFillSwatchClick(prop, value)}
          onsolo={() => toggleLayerSolo('overlay')}
          onmute={() => toggleLayerMute('overlay')}
          onreset={() => resetLayer('overlay')}
          oncopy={() => copyLayer('overlay')}
          onpaste={() => pasteLayer('overlay')}
        />
      {/if}
    {/each}
  </div>
{/if}

<style>
  .bg-editor {
    display: flex;
    flex-direction: column;
  }

  .bg-editor :global(.property-grid) {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .full-span {
    width: 100%;
  }

  .prop-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 2px 0;
  }

  .lbl {
    color: #888;
    font-size: 11px;
    min-width: 52px;
    flex-shrink: 0;
  }

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

  .val:focus {
    border-color: #5B9BD5;
  }

  .color-input,
  .asset-row {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    min-width: 0;
  }

  .mini-swatch,
  .bg-swatch {
    border-radius: 3px;
    border: 1px solid #555;
    cursor: pointer;
    padding: 0;
  }

  .mini-swatch {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
  }

  .bg-swatch {
    width: 100%;
    height: 26px;
  }

  .mini-swatch:hover,
  .bg-swatch:hover {
    border-color: #5B9BD5;
  }

  .action-btn {
    height: 26px;
    padding: 0 10px;
    border-radius: 3px;
    border: 1px solid #333;
    background: #252525;
    color: #DDD;
    font-size: 10px;
    font-family: inherit;
    cursor: pointer;
    flex-shrink: 0;
  }

  .action-btn:hover {
    border-color: #5B9BD5;
  }

  .hint-text {
    color: #555;
    font-size: 10px;
    font-style: italic;
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

  .bg-layer-buttons {
    display: flex;
    gap: 3px;
  }

  .bg-layer-btn {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    padding: 6px 0;
    background: #1A1A1A;
    border: 1px solid #333;
    border-radius: 3px;
    color: #666;
    cursor: pointer;
    font-family: inherit;
  }

  .bg-layer-btn:hover {
    border-color: #555;
    color: #AAA;
  }

  .bg-layer-btn.active {
    border-color: #5B9BD5;
    color: #5B9BD5;
    background: #0D2A3E;
  }

  .bg-layer-label {
    font-size: 8px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    line-height: 1;
  }

  .zorder-hint {
    font-size: 8px;
    color: #5B9BD5;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    text-align: center;
    user-select: none;
  }

  .zorder-row {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px;
    border-radius: 3px;
    opacity: 0.4;
  }

  .zorder-row.enabled {
    opacity: 1;
  }

  .zorder-label {
    font-size: 10px;
    color: #DDD;
    flex: 1;
    min-width: 0;
  }

  .zorder-status {
    font-size: 9px;
    color: #555;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    margin-right: 4px;
  }

  .zorder-row.enabled .zorder-status {
    color: #5B9BD5;
  }

  .zorder-btn {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #252525;
    border: 1px solid #333;
    border-radius: 3px;
    color: #888;
    cursor: pointer;
    padding: 0;
    flex-shrink: 0;
  }

  .zorder-btn:hover {
    border-color: #5B9BD5;
    color: #DDD;
  }

  .zorder-btn:disabled {
    opacity: 0.2;
    pointer-events: none;
  }
</style>
