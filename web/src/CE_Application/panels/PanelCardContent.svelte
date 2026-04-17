<script>
  import { panels, activePanel, updatePanel } from '../stores/panels.js';
  import { activateColorTarget } from '../stores/colorTarget.js';
  import { browseImage, onImageBrowsed, requestFileInfo, onFileInfo } from '../bridge/bridge.js';
  import NumberInput from '../sections/NumberInput.svelte';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import PropertyColor from '../properties/PropertyColor.svelte';
  import LayerEffectsSection from './LayerEffectsSection.svelte';
  import { PaintBucket, Blend, Image, BrickWall, ChevronUp, ChevronDown } from 'lucide-svelte';
  import { gradientToCSS } from '../utils/gradientCSS.js';
  import { formatFileSize, formatDate } from '../utils/formatting.js';
  import { validateScriptId } from '../utils/scriptIdValidation.js';
  import { displayTabRequest } from '../stores/displayTab.js';
  import { sectionCollapse, setCollapsed } from '../stores/sectionCollapse.js';

  let { tabId = '' } = $props();

  let panel = $derived($activePanel);

  // Collapse state from persistent store
  let imageCollapsed = $derived($sectionCollapse['bg-image'] ?? true);
  let textureCollapsed = $derived($sectionCollapse['bg-texture'] ?? true);

  // --- File info for Info section ---
  let fileInfo = $state(null);
  let lastInfoPath = $state(null);

  onFileInfo((result) => {
    fileInfo = result;
  });

  $effect(() => {
    const path = panel?.filePath;
    if (path && path !== lastInfoPath) {
      lastInfoPath = path;
      requestFileInfo(path);
    }
    if (!path) {
      fileInfo = null;
      lastInfoPath = null;
    }
  });

  function handleSwatchClick(prop, currentColor) {
    activateColorTarget({ type: 'panel', prop }, currentColor);
  }

  const stringProps = new Set([
    'bgColour', 'gridColour', 'name', 'scriptId', 'author', 'version', 'description',
    'bgMode', 'bgImage', 'bgImageFit', 'bgImageAlign', 'bgImageBlend', 'bgImageTint',
    'bgTexture', 'bgTextureFit', 'bgTextureAlign', 'bgTextureBlend', 'bgTextureTint',
    'bgGradientName',
  ]);

  function handlePropChange(prop, e) {
    if (!panel) return;
    let value = e.target.value;
    if (!stringProps.has(prop)) {
      const num = Number(value);
      if (!isNaN(num) && value !== '') value = num;
    }
    updatePanel(panel.id, { [prop]: value });
  }

  // --- Image/Texture browse ---
  onImageBrowsed((result) => {
    if (!panel) return;
    if (result.requestId === 'bgImage') {
      updatePanel(panel.id, { bgImage: result.filePath });
    } else if (result.requestId === 'bgTexture') {
      updatePanel(panel.id, { bgTexture: result.filePath });
    }
  });

  function handleBrowseImage() {
    browseImage('bgImage');
  }

  function handleBrowseTexture() {
    browseImage('bgTexture');
  }

  // --- Z-Order ---
  const layerLabels = { solid: 'Solid', gradient: 'Gradient', image: 'Image', texture: 'Texture' };

  function layerOrder() {
    return panel?.bgLayerOrder ?? ['solid', 'gradient', 'image', 'texture'];
  }

  function moveLayer(layerId, dir) {
    if (!panel) return;
    const order = [...layerOrder()];
    const idx = order.indexOf(layerId);
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= order.length) return;
    [order[idx], order[newIdx]] = [order[newIdx], order[idx]];
    updatePanel(panel.id, { bgLayerOrder: order });
  }

  function isLayerEnabled(layerId) {
    if (!panel) return false;
    if (layerId === 'solid') return panel.bgSolid !== false;
    if (layerId === 'gradient') return panel.bgGradientEnabled === true;
    if (layerId === 'image') return panel.bgImageEnabled === true;
    if (layerId === 'texture') return panel.bgTextureEnabled === true;
    return false;
  }

  function handleToggle(prop) {
    if (!panel) return;
    const updates = { [prop]: !panel[prop] };

    // When enabling Resizable, initialise min/max from current size
    if (prop === 'resizable' && !panel.resizable) {
      if (panel.minWidth === 0) updates.minWidth = panel.width;
      if (panel.minHeight === 0) updates.minHeight = panel.height;
      if (panel.maxWidth === 0) updates.maxWidth = panel.width;
      if (panel.maxHeight === 0) updates.maxHeight = panel.height;
    }

    updatePanel(panel.id, updates);
  }

  // --- Script ID validation ---
  // Stoplight: 'red' = error (blocks save), 'yellow' = warning, 'green' = valid
  let idEditing = $state(false);
  let idDraft = $state('');
  let idLevel = $state('green');
  let idMessage = $state('');

  function applyValidation(value) {
    const result = validateScriptId(value, $panels, panel.id);
    idLevel = result.level;
    idMessage = result.msg;
  }

  function onIdFocus(e) {
    idEditing = true;
    idDraft = panel.scriptId ?? '';
    applyValidation(idDraft);
    e.target.select();
  }

  function onIdInput(e) {
    idDraft = e.target.value;
    applyValidation(idDraft);
  }

  function onIdKeydown(e) {
    if (e.key === 'Enter') {
      e.target.blur();
    } else if (e.key === 'Escape') {
      idDraft = panel.scriptId ?? '';
      idEditing = false;
      e.target.blur();
    }
  }

  function onIdBlur() {
    if (idLevel !== 'red' && idDraft && idDraft !== panel.scriptId) {
      updatePanel(panel.id, { scriptId: idDraft });
    }
    idEditing = false;
    idMessage = '';
  }
</script>

{#if panel}
  {#if tabId === 'core'}
    <PropertySection title="Identity">
      <PropertyCell label="Name" span={2} hint="Display name of the panel">
        <input class="val" type="text" value={panel.name}
               onchange={(e) => handlePropChange('name', e)} />
      </PropertyCell>
      <PropertyCell label="Id" span={2} hint="Unique script identifier. Use camelCase or snake_case.">
        <input class="val"
               class:val-error={idEditing && idLevel === 'red'}
               class:val-warn={idEditing && idLevel === 'yellow'}
               class:val-ok={idEditing && idLevel === 'green'}
               type="text"
               value={idEditing ? idDraft : (panel.scriptId ?? '')}
               onfocus={onIdFocus}
               oninput={onIdInput}
               onkeydown={onIdKeydown}
               onblur={onIdBlur} />
      </PropertyCell>
      {#if idEditing && idMessage}
        <div class="validation-row">
          <span class="validation-msg" class:msg-red={idLevel === 'red'} class:msg-yellow={idLevel === 'yellow'} class:msg-green={idLevel === 'green'}>{idMessage}</span>
        </div>
      {/if}
      <PropertyCell label="Author" span={2} hint="Author of this panel">
        <input class="val" type="text" value={panel.author ?? ''}
               placeholder="Author name"
               onchange={(e) => handlePropChange('author', e)} />
      </PropertyCell>
      <PropertyCell label="Version" span={2} hint="Version string, e.g. 1.0.0">
        <input class="val" type="text" value={panel.version ?? '1.0.0'}
               onchange={(e) => handlePropChange('version', e)} />
      </PropertyCell>
      <PropertyCell label="Description" span={4} hint="Optional description or notes about this panel">
        <textarea class="val val-textarea" rows="3"
                  value={panel.description ?? ''}
                  placeholder="Panel description..."
                  onchange={(e) => handlePropChange('description', e)}></textarea>
      </PropertyCell>
    </PropertySection>
    <PropertySection title="State">
      <PropertyCell label="Enabled" span={2} hint="Enable or disable all interaction on this panel at runtime">
        <PropertyToggle value={panel.enabled}
                        onchange={() => handleToggle('enabled')} />
      </PropertyCell>
      <PropertyCell label="Locked" span={2} hint="Lock panel to prevent editing in the designer">
        <PropertyToggle value={panel.locked}
                        onchange={() => handleToggle('locked')} />
      </PropertyCell>
    </PropertySection>
    <PropertySection title="Size">
      <PropertyCell label="Width" span={2} hint="Panel width in pixels">
        <NumberInput value={panel.width} step={1} min={1}
                     onchange={(v) => updatePanel(panel.id, { width: v })} />
      </PropertyCell>
      <PropertyCell label="Height" span={2} hint="Panel height in pixels">
        <NumberInput value={panel.height} step={1} min={1}
                     onchange={(v) => updatePanel(panel.id, { height: v })} />
      </PropertyCell>
    </PropertySection>
    <PropertySection title="Constraints" collapsed={$sectionCollapse['core-constraints'] ?? true} ontoggle={(v) => setCollapsed('core-constraints', v)}>
      <PropertyCell label="Lock Ratio" span={2} hint="Keep width/height ratio when resizing">
        <PropertyToggle value={panel.lockAspectRatio}
                        onchange={() => handleToggle('lockAspectRatio')} />
      </PropertyCell>
      <PropertyCell label="Resizable" span={2} hint="Allow end-user to resize at runtime. When Off, min/max are set to current size.">
        <PropertyToggle value={panel.resizable}
                        onchange={() => handleToggle('resizable')} />
      </PropertyCell>
      <PropertyCell label="Min W" span={2} hint="Minimum width when resizable" disabled={!panel.resizable}>
        <NumberInput value={panel.resizable ? panel.minWidth : panel.width} step={1} min={0}
                     onchange={(v) => updatePanel(panel.id, { minWidth: v })} />
      </PropertyCell>
      <PropertyCell label="Min H" span={2} hint="Minimum height when resizable" disabled={!panel.resizable}>
        <NumberInput value={panel.resizable ? panel.minHeight : panel.height} step={1} min={0}
                     onchange={(v) => updatePanel(panel.id, { minHeight: v })} />
      </PropertyCell>
      <PropertyCell label="Max W" span={2} hint="Maximum width when resizable. 0 = no limit." disabled={!panel.resizable}>
        <NumberInput value={panel.resizable ? panel.maxWidth : panel.width} step={1} min={0}
                     onchange={(v) => updatePanel(panel.id, { maxWidth: v })} />
      </PropertyCell>
      <PropertyCell label="Max H" span={2} hint="Maximum height when resizable. 0 = no limit." disabled={!panel.resizable}>
        <NumberInput value={panel.resizable ? panel.maxHeight : panel.height} step={1} min={0}
                     onchange={(v) => updatePanel(panel.id, { maxHeight: v })} />
      </PropertyCell>
    </PropertySection>
    <PropertySection title="Info" collapsed={$sectionCollapse['core-info'] ?? true} ontoggle={(v) => setCollapsed('core-info', v)}>
      <div class="info-row">
        <span class="info-label">Panel ID</span>
        <span class="info-value">{panel.id}</span>
      </div>
      <div class="info-row">
        <span class="info-label">File</span>
        <span class="info-value" title={panel.filePath ?? ''}>{panel.filePath ?? 'Not saved'}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Size</span>
        <span class="info-value">{fileInfo ? formatFileSize(fileInfo.size) : '—'}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Created</span>
        <span class="info-value">{fileInfo ? formatDate(fileInfo.created) : '—'}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Modified</span>
        <span class="info-value">{fileInfo ? formatDate(fileInfo.modified) : '—'}</span>
      </div>
    </PropertySection>

  {:else if tabId === 'background'}
    <PropertySection title="Background">
      <div class="bg-layer-buttons">
        <button class="bg-layer-btn" class:active={panel.bgSolid !== false}
                title="Solid fill"
                onclick={() => updatePanel(panel.id, { bgSolid: panel.bgSolid === false ? true : false })}>
          <PaintBucket size={14} strokeWidth={1.5} />
          <span class="bg-layer-label">Solid</span>
        </button>
        <button class="bg-layer-btn" class:active={panel.bgGradientEnabled === true}
                title="Gradient overlay"
                onclick={() => updatePanel(panel.id, { bgGradientEnabled: !panel.bgGradientEnabled })}>
          <Blend size={14} strokeWidth={1.5} />
          <span class="bg-layer-label">Gradient</span>
        </button>
        <button class="bg-layer-btn" class:active={panel.bgImageEnabled === true}
                title="Image overlay"
                onclick={() => updatePanel(panel.id, { bgImageEnabled: !panel.bgImageEnabled })}>
          <Image size={14} strokeWidth={1.5} />
          <span class="bg-layer-label">Image</span>
        </button>
        <button class="bg-layer-btn" class:active={panel.bgTextureEnabled === true}
                title="Texture overlay"
                onclick={() => updatePanel(panel.id, { bgTextureEnabled: !panel.bgTextureEnabled })}>
          <BrickWall size={14} strokeWidth={1.5} />
          <span class="bg-layer-label">Texture</span>
        </button>
      </div>
    </PropertySection>

    <PropertySection title="Z-Order" collapsed={$sectionCollapse['bg-zorder'] ?? true} ontoggle={(v) => setCollapsed('bg-zorder', v)}>
      <div class="zorder-hint">Front</div>
      {#each [...layerOrder()].reverse() as layerId, i}
        {@const realIdx = layerOrder().length - 1 - i}
        <div class="zorder-row" class:enabled={isLayerEnabled(layerId)}>
          <span class="zorder-label">{layerLabels[layerId]}</span>
          <span class="zorder-status">{isLayerEnabled(layerId) ? 'on' : 'off'}</span>
          <button class="zorder-btn" disabled={realIdx === layerOrder().length - 1}
                  title="Move up (front)" onclick={() => moveLayer(layerId, 1)}>
            <ChevronUp size={12} strokeWidth={1.5} />
          </button>
          <button class="zorder-btn" disabled={realIdx === 0}
                  title="Move down (back)" onclick={() => moveLayer(layerId, -1)}>
            <ChevronDown size={12} strokeWidth={1.5} />
          </button>
        </div>
      {/each}
      <div class="zorder-hint">Back</div>
    </PropertySection>

    {#each [...layerOrder()].reverse() as layerId (layerId)}
      {#if layerId === 'solid' && panel.bgSolid !== false}
        <PropertySection title="Solid">
          <PropertyCell label="" span={2} hint="Background fill colour — click swatch to open colour picker">
            <button class="bg-swatch"
                    style="background:#{String(panel.bgColour ?? '333333').slice(-6)}"
                    title="Pick colour"
                    onclick={() => handleSwatchClick('bgColour', panel.bgColour)}
                    oncontextmenu={(e) => { e.preventDefault(); /* TODO: add to swatches */ }}></button>
          </PropertyCell>
          <PropertyCell label="" span={2} hint="Hex colour value — type to change">
            <input class="val"
                   type="text"
                   value={String(panel.bgColour ?? '333333')}
                   onfocus={(e) => e.target.select()}
                   onchange={(e) => updatePanel(panel.id, { bgColour: e.target.value })} />
          </PropertyCell>
        </PropertySection>

      {/if}
      {#if layerId === 'gradient' && panel.bgGradientEnabled === true}
        <PropertySection title="Gradient">
          <PropertyCell label="" span={2} hint="Gradient preview — click to edit">
            <button class="bg-swatch"
                    style="background:{gradientToCSS(panel.bgGradient)}"
                    title="Edit gradient"
                    onclick={() => displayTabRequest.set({ tab: 'gradient' })}></button>
          </PropertyCell>
          <PropertyCell label="" span={2} hint="Gradient name">
            <input class="val"
                   type="text"
                   value={panel.bgGradientName ?? ''}
                   placeholder="Unnamed"
                   onfocus={(e) => e.target.select()}
                   onchange={(e) => updatePanel(panel.id, { bgGradientName: e.target.value })} />
          </PropertyCell>
          <PropertyCell label="Opacity" span={4} hint="Gradient layer opacity (0–100%)">
            <NumberInput value={panel.bgGradientOpacity ?? 100} step={1} min={0} max={100}
                         onchange={(v) => updatePanel(panel.id, { bgGradientOpacity: v })} />
          </PropertyCell>
        </PropertySection>

      {/if}
      {#if layerId === 'image' && panel.bgImageEnabled === true}
        <LayerEffectsSection
          {panel}
          prefix="Image"
          label="Image"
          defaultFit="fill"
          placeholder="No image selected"
          collapsed={imageCollapsed}
          onupdate={(patch) => updatePanel(panel.id, patch)}
          onbrowse={handleBrowseImage}
          oncollapsetoggle={(v) => setCollapsed('bg-image', v)}
          onswatchclick={handleSwatchClick}
        />
      {/if}
      {#if layerId === 'texture' && panel.bgTextureEnabled === true}
        <LayerEffectsSection
          {panel}
          prefix="Texture"
          label="Texture"
          defaultFit="tile"
          placeholder="No texture selected"
          collapsed={textureCollapsed}
          onupdate={(patch) => updatePanel(panel.id, patch)}
          onbrowse={handleBrowseTexture}
          oncollapsetoggle={(v) => setCollapsed('bg-texture', v)}
          onswatchclick={handleSwatchClick}
        />
      {/if}
    {/each}
  {:else if tabId === 'grid'}
    <PropertySection title="Grid">
      <PropertyCell label="Show" span={2} hint="Show or hide the grid overlay">
        <PropertyToggle value={panel.gridEnabled}
                        onchange={() => handleToggle('gridEnabled')} />
      </PropertyCell>
      <PropertyCell label="Snap" span={2} hint="Snap components to grid when moving or resizing">
        <PropertyToggle value={panel.snapToGrid}
                        onchange={() => handleToggle('snapToGrid')} />
      </PropertyCell>
      <PropertyCell label="Size" span={2} hint="Grid cell size in pixels">
        <NumberInput value={panel.gridSize} step={1} min={1}
                     onchange={(v) => updatePanel(panel.id, { gridSize: v })} />
      </PropertyCell>
      <PropertyCell label="Thickness" span={2} hint="Grid line thickness in pixels">
        <NumberInput value={panel.gridLineWidth ?? 1} step={1} min={1} max={10}
                     onchange={(v) => updatePanel(panel.id, { gridLineWidth: v })} />
      </PropertyCell>
      <PropertyCell label="Type" span={2} hint="Grid line style">
        <select class="val" value={panel.gridType ?? 'lines'}
                onchange={(e) => updatePanel(panel.id, { gridType: e.target.value })}>
          <option value="lines">Lines</option>
          <option value="dots">Dots</option>
          <option value="crosses">Crosses</option>
        </select>
      </PropertyCell>
      <PropertyCell label="Colour" span={2} hint="Grid line colour (AARRGGBB hex)">
        <PropertyColor value={panel.gridColour ?? '33FFFFFF'}
                       onchange={(v) => updatePanel(panel.id, { gridColour: v })}
                       onswatchclick={() => handleSwatchClick('gridColour', panel.gridColour ?? '33FFFFFF')} />
      </PropertyCell>
    </PropertySection>
    <PropertySection title="Subdivision" collapsed={$sectionCollapse['grid-subdivision'] ?? true} ontoggle={(v) => setCollapsed('grid-subdivision', v)}>
      <PropertyCell label="Divisions" span={2} hint="Group every Nth cell with a thicker border (1 = none)">
        <NumberInput value={panel.gridSubdivision ?? 1} step={1} min={1} max={10}
                     onchange={(v) => updatePanel(panel.id, { gridSubdivision: v })} />
      </PropertyCell>
      <PropertyCell label="Colour" span={2} hint="Subdivision border colour (AARRGGBB hex)">
        <PropertyColor value={panel.gridSubColour ?? '55FFFFFF'}
                       onchange={(v) => updatePanel(panel.id, { gridSubColour: v })}
                       onswatchclick={() => handleSwatchClick('gridSubColour', panel.gridSubColour ?? '55FFFFFF')} />
      </PropertyCell>
    </PropertySection>
    <PropertySection title="Origin" collapsed={$sectionCollapse['grid-origin'] ?? true} ontoggle={(v) => setCollapsed('grid-origin', v)}>
      <PropertyCell label="Center" span={4} hint="Center the grid on the panel — lines radiate from the middle">
        <PropertyToggle value={panel.gridCentered ?? false}
                        onchange={() => updatePanel(panel.id, { gridCentered: !panel.gridCentered })} />
      </PropertyCell>
      <PropertyCell label="Offset X" span={2} hint="Shift grid origin horizontally in pixels" disabled={panel.gridCentered}>
        <NumberInput value={panel.gridOriginX ?? 0} step={1}
                     onchange={(v) => updatePanel(panel.id, { gridOriginX: v })} />
      </PropertyCell>
      <PropertyCell label="Offset Y" span={2} hint="Shift grid origin vertically in pixels" disabled={panel.gridCentered}>
        <NumberInput value={panel.gridOriginY ?? 0} step={1}
                     onchange={(v) => updatePanel(panel.id, { gridOriginY: v })} />
      </PropertyCell>
    </PropertySection>
  {:else if tabId === 'export'}
    <PropertySection title="Export">
      <div class="placeholder">No export settings configured</div>
    </PropertySection>

  {:else}
    <div class="placeholder">Panel: {tabId}</div>
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

  .val:focus {
    border-color: #5B9BD5;
  }

  .val-textarea {
    height: auto;
    resize: vertical;
    min-height: 54px;
    line-height: 1.4;
  }

  .val-error { border-color: #C45454 !important; }
  .val-warn  { border-color: #C4A854 !important; }
  .val-ok    { border-color: #5B9B5B !important; }

  .validation-row {
    grid-column: span 4;
    padding: 0 2px;
  }

  .validation-msg {
    font-size: 13px;
    line-height: 1.3;
  }

  .msg-red    { color: #C45454; }
  .msg-yellow { color: #C4A854; }
  .msg-green  { color: #5B9B5B; }

  select.val {
    cursor: pointer;
    appearance: none;
    -webkit-appearance: none;
    padding-right: 20px;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23888'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 6px center;
  }

  .info-row {
    grid-column: span 4;
    display: flex;
    gap: 6px;
    padding: 1px 2px;
    align-items: baseline;
  }

  .info-label {
    font-size: 9px;
    color: #5B9BD5;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    flex-shrink: 0;
    min-width: 46px;
    user-select: none;
  }

  .info-value {
    font-size: 10px;
    color: #888;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    user-select: text;
  }

  .bg-layer-buttons {
    grid-column: span 4;
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
    grid-column: span 4;
    font-size: 8px;
    color: #5B9BD5;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    text-align: center;
    user-select: none;
  }

  .zorder-row {
    grid-column: span 4;
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

  .bg-swatch {
    width: 100%;
    height: 26px;
    border-radius: 3px;
    border: 1px solid #555;
    cursor: pointer;
    padding: 0;
  }

  .bg-swatch:hover {
    border-color: #5B9BD5;
  }

  .placeholder {
    grid-column: span 4;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    color: #444;
    font-size: 11px;
  }
</style>
