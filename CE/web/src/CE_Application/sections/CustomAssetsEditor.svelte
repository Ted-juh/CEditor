<script>
  import { getSection, updateControlProperty, removeControlNode, applyControlPatch } from '../stores/controls.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import NumberCell from '../properties/NumberCell.svelte';
  import { bakeCustomComponentFilmstrip, estimateFilmstripBake, normalizeFilmstripBakeOptions } from '../utils/customComponentFilmstripBaker.js';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let transform = $derived(getSection(control, 'Transform'));
  let designer = $derived(getSection(control, 'Designer'));
  let parts = $derived(getSection(control, 'Parts'));
  let assets = $derived(getSection(control, 'Assets'));
  let channels = $derived(getSection(control, 'ValueChannels'));
  let partNames = $derived(Object.keys(parts?._children ?? {}));
  let selectedLayer = $derived(designer?.selectedLayer ?? partNames[0] ?? '');
  let filmstripNames = $derived(Object.keys(assets?.filmstrips ?? {}));
  let imageNames = $derived(Object.keys(assets?.images ?? {}));
  let channelNames = $derived(Object.keys(channels?._children ?? {}));
  let selectedImage = $state('');
  let newImageName = $state('');
  let selectedFilmstrip = $state('');
  let newFilmstrip = $state('');
  let bakeName = $state('bakedFilmstrip');
  let bakeFrameCount = $state(64);
  let bakeFrameWidth = $state(0);
  let bakeFrameHeight = $state(0);
  let bakeOutputScale = $state(1);
  let bakeOrientation = $state('vertical');
  let bakeValueSource = $state('mainValue');
  let bakeInterpolation = $state('nearest');
  let bakeStatus = $state('');
  let bakeBusy = $state(false);
  let imageAsset = $derived(assets?.images?.[selectedImage] ?? null);
  let filmstrip = $derived(assets?.filmstrips?.[selectedFilmstrip] ?? null);
  let bakeEstimate = $derived(estimateFilmstripBake(control, {
    name: bakeName,
    frameCount: bakeFrameCount,
    frameWidth: bakeFrameWidth || transform?.width,
    frameHeight: bakeFrameHeight || transform?.height,
    outputScale: bakeOutputScale,
    orientation: bakeOrientation,
    valueSource: bakeValueSource,
    interpolation: bakeInterpolation,
  }));
  let bakeEstimateText = $derived(`${bakeEstimate.canvasWidth}x${bakeEstimate.canvasHeight} | ${formatBytes(bakeEstimate.estimatedMemoryBytes)}${bakeEstimate.blockReason ? ` | ${bakeEstimate.blockReason}` : ''}`);
  let bakeWillReplace = $derived(!!assets?.filmstrips?.[bakeEstimate.name]);

  $effect(() => {
    if (!imageNames.length) {
      selectedImage = '';
      return;
    }
    if (!selectedImage || !imageNames.includes(selectedImage)) selectedImage = imageNames[0];
  });

  $effect(() => {
    if (!filmstripNames.length) {
      selectedFilmstrip = '';
      return;
    }
    if (!selectedFilmstrip || !filmstripNames.includes(selectedFilmstrip)) selectedFilmstrip = filmstripNames[0];
  });

  function setAsset(path, value) {
    if (!core?.id) return;
    updateControlProperty(core.id, `Assets.${path}`, value);
  }

  function setFilmstrip(path, value) {
    if (!core?.id || !selectedFilmstrip) return;
    updateControlProperty(core.id, `Assets.filmstrips.${selectedFilmstrip}.${path}`, value);
  }

  function addImageAsset() {
    const name = String(newImageName ?? '').trim();
    if (!core?.id || !name || assets?.images?.[name]) return;
    updateControlProperty(core.id, `Assets.images.${name}`, {
      _type: 'ImageAsset',
      name,
      source: '',
      width: 0,
      height: 0,
      package: true,
    });
    newImageName = '';
    selectedImage = name;
  }

  function removeImageAsset() {
    if (!core?.id || !selectedImage) return;
    removeControlNode(core.id, `Assets.images.${selectedImage}`);
    selectedImage = '';
  }

  function addFilmstrip() {
    const name = String(newFilmstrip ?? '').trim();
    if (!core?.id || !name || assets?.filmstrips?.[name]) return;
    updateControlProperty(core.id, `Assets.filmstrips.${name}`, {
      _type: 'FilmstripAsset',
      name,
      source: '',
      frameCount: 128,
      frameWidth: 0,
      frameHeight: 0,
      orientation: 'vertical',
      interpolation: 'nearest',
      valueSource: 'mainValue',
      package: true,
    });
    newFilmstrip = '';
    selectedFilmstrip = name;
  }

  function removeFilmstrip() {
    if (!core?.id || !selectedFilmstrip) return;
    removeControlNode(core.id, `Assets.filmstrips.${selectedFilmstrip}`);
    selectedFilmstrip = '';
  }

  function formatBytes(bytes) {
    const value = Number(bytes);
    if (!Number.isFinite(value) || value <= 0) return '0 B';
    if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
    return `${(value / (1024 * 1024)).toFixed(value >= 100 * 1024 * 1024 ? 0 : 1)} MB`;
  }

  function safeFileName(value, fallback = 'filmstrip') {
    return String(value ?? '').trim().toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80)
      || fallback;
  }

  function dataUrlExtension(source) {
    const match = String(source ?? '').match(/^data:image\/([a-z0-9.+-]+);/i);
    if (!match) return 'png';
    if (match[1] === 'jpeg') return 'jpg';
    return match[1].replace(/[^a-z0-9]+/gi, '') || 'png';
  }

  function sourceByteEstimate(source) {
    const text = String(source ?? '');
    if (!text.startsWith('data:')) return 0;
    const encoded = text.split(',', 2)[1] ?? '';
    return Math.floor((encoded.length * 3) / 4);
  }

  function downloadFilmstrip() {
    const source = String(filmstrip?.source ?? '');
    if (!source) {
      bakeStatus = 'Selected filmstrip has no source to download.';
      return;
    }
    const link = document.createElement('a');
    link.href = source;
    link.download = `${safeFileName(selectedFilmstrip)}.${dataUrlExtension(source)}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    bakeStatus = `Downloaded ${selectedFilmstrip}`;
  }

  function downloadImageAsset() {
    const source = String(imageAsset?.source ?? '');
    if (!source) {
      bakeStatus = 'Selected image has no source to download.';
      return;
    }
    const link = document.createElement('a');
    link.href = source;
    link.download = `${safeFileName(selectedImage, 'image')}.${dataUrlExtension(source)}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    bakeStatus = `Downloaded ${selectedImage}`;
  }

  function applyImageToSelectedLayer(layer = 'image') {
    const source = String(imageAsset?.source ?? '');
    if (!core?.id || !selectedLayer || !source) return;
    const prefix = layer === 'overlay' ? 'overlay' : 'image';
    applyControlPatch(core.id, {
      [`Parts.${selectedLayer}.Background.Fill.${prefix}Enabled`]: true,
      [`Parts.${selectedLayer}.Background.Fill.${prefix}Src`]: source,
      [`Parts.${selectedLayer}.Background.Fill.${prefix}Fit`]: layer === 'overlay' ? 'cover' : 'fill',
      [`Parts.${selectedLayer}.Background.Fill.${prefix}Opacity`]: 100,
      'Designer.focusSurfaceDock': 'layers',
      'Designer.selectedLayer': selectedLayer,
      'Designer.preview.showBounds': true,
    });
    bakeStatus = `${selectedImage} applied to ${selectedLayer}`;
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error ?? new Error('Could not read filmstrip file.'));
      reader.readAsDataURL(file);
    });
  }

  function imageDimensions(source) {
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth || image.width || 0, height: image.naturalHeight || image.height || 0 });
      image.onerror = () => resolve({ width: 0, height: 0 });
      image.src = source;
    });
  }

  async function importFilmstripFile(event) {
    const file = event?.target?.files?.[0];
    if (!core?.id || !file) return;
    try {
      const source = await fileToDataUrl(file);
      if (!source.startsWith('data:image/')) {
        bakeStatus = 'Filmstrip import expects an image file.';
        return;
      }
      const name = selectedFilmstrip || safeFileName(file.name.replace(/\.[^.]+$/, ''), 'importedFilmstrip');
      const frameCount = Math.max(1, Math.round(Number(filmstrip?.frameCount ?? 128)));
      const orientation = filmstrip?.orientation ?? 'vertical';
      const dimensions = await imageDimensions(source);
      const frameWidth = orientation === 'horizontal'
        ? Math.round(dimensions.width / frameCount)
        : dimensions.width;
      const frameHeight = orientation === 'horizontal'
        ? dimensions.height
        : Math.round(dimensions.height / frameCount);
      applyControlPatch(core.id, {
        [`Assets.filmstrips.${name}`]: {
          _type: 'FilmstripAsset',
          name,
          source,
          frameCount,
          frameWidth: Number.isFinite(frameWidth) && frameWidth > 0 ? frameWidth : (filmstrip?.frameWidth ?? 0),
          frameHeight: Number.isFinite(frameHeight) && frameHeight > 0 ? frameHeight : (filmstrip?.frameHeight ?? 0),
          orientation,
          interpolation: filmstrip?.interpolation ?? 'nearest',
          valueSource: filmstrip?.valueSource ?? 'mainValue',
          package: true,
          importedAt: new Date().toISOString(),
          sourceFileName: file.name,
        },
      });
      selectedFilmstrip = name;
      bakeStatus = `Imported ${file.name}`;
    } catch (error) {
      bakeStatus = error?.message ?? 'Filmstrip import failed';
    } finally {
      if (event?.target) event.target.value = '';
    }
  }

  async function importImageFile(event) {
    const file = event?.target?.files?.[0];
    if (!core?.id || !file) return;
    try {
      const source = await fileToDataUrl(file);
      if (!source.startsWith('data:image/')) {
        bakeStatus = 'Image import expects an image file.';
        return;
      }
      const name = selectedImage || safeFileName(file.name.replace(/\.[^.]+$/, ''), 'importedImage');
      const dimensions = await imageDimensions(source);
      applyControlPatch(core.id, {
        [`Assets.images.${name}`]: {
          _type: 'ImageAsset',
          name,
          source,
          width: dimensions.width,
          height: dimensions.height,
          package: true,
          importedAt: new Date().toISOString(),
          sourceFileName: file.name,
        },
      });
      selectedImage = name;
      bakeStatus = `Imported ${file.name}`;
    } catch (error) {
      bakeStatus = error?.message ?? 'Image import failed';
    } finally {
      if (event?.target) event.target.value = '';
    }
  }

  async function bakeFilmstrip() {
    if (!core?.id || bakeBusy) return;
    bakeBusy = true;
    bakeStatus = 'Baking...';
    const options = normalizeFilmstripBakeOptions(control, {
      name: bakeName,
      frameCount: bakeFrameCount,
      frameWidth: bakeFrameWidth || transform?.width,
      frameHeight: bakeFrameHeight || transform?.height,
      outputScale: bakeOutputScale,
      orientation: bakeOrientation,
      valueSource: bakeValueSource,
      interpolation: bakeInterpolation,
    });
    const guard = estimateFilmstripBake(control, options);
    if (guard.blocked) {
      bakeStatus = `Bake is too large: ${guard.blockReason}`;
      bakeBusy = false;
      return;
    }

    try {
      const asset = await bakeCustomComponentFilmstrip(control, options);
      applyControlPatch(core.id, {
        [`Assets.filmstrips.${asset.name}`]: asset,
        [`Generators.${asset.name}Filmstrip`]: {
          _type: 'Generator',
          name: `${asset.name}Filmstrip`,
          type: 'filmstrip-frames',
          enabled: true,
          assetName: asset.name,
          generatedPartPrefix: 'film',
          zIndex: 20,
        },
      });
      selectedFilmstrip = asset.name;
      bakeStatus = `${bakeWillReplace ? 'Rebaked' : 'Baked'} ${asset.frameCount} frames`;
    } catch (error) {
      bakeStatus = error?.message ?? 'Bake failed';
    } finally {
      bakeBusy = false;
    }
  }
</script>

{#if assets}
  <PropertySection title="Packaging">
    <PropertyCell label="Embed" span={2} hint="Package images and filmstrips with saved components.">
      <PropertyToggle value={assets.packagePolicy?.embedAssets !== false} onchange={() => setAsset('packagePolicy.embedAssets', !(assets.packagePolicy?.embedAssets !== false))} />
    </PropertyCell>
    <PropertyCell label="Fonts" span={2} hint="Warn when downloaded components reference missing fonts.">
      <PropertyToggle value={assets.packagePolicy?.warnMissingFonts !== false} onchange={() => setAsset('packagePolicy.warnMissingFonts', !(assets.packagePolicy?.warnMissingFonts !== false))} />
    </PropertyCell>
    <PropertyCell label="Images" span={2} hint="Image assets currently recorded in this component.">
      <div class="metric">{imageNames.length}</div>
    </PropertyCell>
    <PropertyCell label="Filmstrips" span={2} hint="Filmstrip assets currently recorded in this component.">
      <div class="metric">{filmstripNames.length}</div>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Images">
    <PropertyCell label="Add" span={3} hint="Create a reusable image asset slot for this component package.">
      <input class="val" type="text" bind:value={newImageName} placeholder="imageName" />
    </PropertyCell>
    <PropertyCell label="" span={1} hint="Add an image asset slot.">
      <button class="action-btn" type="button" onclick={addImageAsset}>Add</button>
    </PropertyCell>
    <PropertyCell label="Selected" span={2} hint="Choose which image asset to inspect or replace.">
      <select class="val" bind:value={selectedImage}>
        {#each imageNames as name}
          <option value={name}>{name}</option>
        {/each}
      </select>
    </PropertyCell>
    <PropertyCell label="" span={1} hint="Remove the selected image asset.">
      <button class="action-btn danger" type="button" onclick={removeImageAsset} disabled={!selectedImage}>Remove</button>
    </PropertyCell>
    <PropertyCell label="Export" span={1} hint="Download the selected image asset.">
      <button class="action-btn" type="button" onclick={downloadImageAsset} disabled={!imageAsset?.source}>Download</button>
    </PropertyCell>
    <PropertyCell label="Import" span={4} hint="Load a PNG/JPEG/WebP/GIF image and embed it into the package.">
      <input class="file-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onchange={importImageFile} />
    </PropertyCell>
    {#if imageAsset}
      {#if imageAsset.source}
        <PropertyCell label="Preview" span={4} hint="Visual check of the selected package image.">
          <div class="filmstrip-preview-wrap">
            <img class="filmstrip-preview" src={imageAsset.source} alt="" />
          </div>
        </PropertyCell>
      {/if}
      <PropertyCell label="Source" span={4} hint="Data URL or future packaged file reference.">
        <input class="val" type="text" value={imageAsset.source ?? ''} onchange={(event) => setAsset(`images.${selectedImage}.source`, event.target.value)} placeholder="data:image/png;base64,..." />
      </PropertyCell>
      <PropertyCell label="Size" span={2} hint="Imported image dimensions.">
        <div class="status">{imageAsset.width || 0}x{imageAsset.height || 0}</div>
      </PropertyCell>
      <PropertyCell label="Bytes" span={2} hint="Embedded source size estimate.">
        <div class="status">{imageAsset.source ? formatBytes(sourceByteEstimate(imageAsset.source)) : 'No source'}</div>
      </PropertyCell>
      <PropertyCell label="Apply" span={2} hint="Use this image as the selected custom layer fill.">
        <button class="action-btn" type="button" onclick={() => applyImageToSelectedLayer('image')} disabled={!imageAsset.source || !selectedLayer}>Layer image</button>
      </PropertyCell>
      <PropertyCell label="Overlay" span={2} hint="Use this image as the selected custom layer overlay.">
        <button class="action-btn" type="button" onclick={() => applyImageToSelectedLayer('overlay')} disabled={!imageAsset.source || !selectedLayer}>Layer overlay</button>
      </PropertyCell>
    {/if}
  </PropertySection>

  <PropertySection title="Filmstrips">
    <PropertyCell label="Add" span={3} hint="Create a KnobMan-style filmstrip asset definition.">
      <input class="val" type="text" bind:value={newFilmstrip} placeholder="filmstripName" />
    </PropertyCell>
    <PropertyCell label="" span={1} hint="Add a filmstrip asset.">
      <button class="action-btn" type="button" onclick={addFilmstrip}>Add</button>
    </PropertyCell>
    <PropertyCell label="Selected" span={3} hint="Choose which filmstrip to configure.">
      <select class="val" bind:value={selectedFilmstrip}>
        {#each filmstripNames as name}
          <option value={name}>{name}</option>
        {/each}
      </select>
    </PropertyCell>
    <PropertyCell label="" span={1} hint="Remove the selected filmstrip.">
      <button class="action-btn danger" type="button" onclick={removeFilmstrip} disabled={!selectedFilmstrip}>Remove</button>
    </PropertyCell>
    <PropertyCell label="Source" span={2} hint="Embedded filmstrip source size if this asset is baked or imported as a data URL.">
      <div class="status">{filmstrip?.source ? formatBytes(sourceByteEstimate(filmstrip.source)) : 'No source'}</div>
    </PropertyCell>
    <PropertyCell label="Export" span={2} hint="Download the selected generated or imported filmstrip image.">
      <button class="action-btn" type="button" onclick={downloadFilmstrip} disabled={!filmstrip?.source}>Download PNG</button>
    </PropertyCell>
    <PropertyCell label="Import" span={4} hint="Load a PNG/JPEG/WebP filmstrip from disk and embed it into the component package.">
      <input class="file-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onchange={importFilmstripFile} />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Generate Filmstrip">
    <PropertyCell label="Name" span={2} hint="Filmstrip asset name to create or replace.">
      <input class="val" type="text" bind:value={bakeName} placeholder="bakedFilmstrip" />
    </PropertyCell>
    <PropertyCell label="Value" span={2} hint="Value channel sampled from minimum to maximum while baking.">
      <input class="val" type="text" list="custom-filmstrip-channels" bind:value={bakeValueSource} />
      <datalist id="custom-filmstrip-channels">
        {#each channelNames as name}
          <option value={name}></option>
        {/each}
      </datalist>
    </PropertyCell>
    <PropertyCell label="Frames" span={1} compact hint="Number of frames to bake into the strip.">
      <NumberCell label="Frames" value={bakeFrameCount} step={1} min={1} onchange={(value) => bakeFrameCount = Math.max(1, Math.round(value))} />
    </PropertyCell>
    <PropertyCell label="Frame W" span={1} compact hint="Single-frame width. Zero uses the component width.">
      <NumberCell label="W" value={bakeFrameWidth} step={1} min={0} onchange={(value) => bakeFrameWidth = Math.max(0, Math.round(value))} />
    </PropertyCell>
    <PropertyCell label="Frame H" span={1} compact hint="Single-frame height. Zero uses the component height.">
      <NumberCell label="H" value={bakeFrameHeight} step={1} min={0} onchange={(value) => bakeFrameHeight = Math.max(0, Math.round(value))} />
    </PropertyCell>
    <PropertyCell label="Scale" span={1} compact hint="Output pixel scale. 2x gives crisper baked assets but larger strips.">
      <NumberCell label="Scale" value={bakeOutputScale} step={0.5} min={1} max={4} onchange={(value) => bakeOutputScale = Math.max(1, Math.min(4, value))} />
    </PropertyCell>
    <PropertyCell label="Axis" span={1} hint="Bake frames vertically or horizontally.">
      <select class="val" bind:value={bakeOrientation}>
        <option value="vertical">vertical</option>
        <option value="horizontal">horizontal</option>
      </select>
    </PropertyCell>
    <PropertyCell label="Interp" span={2} hint="Runtime interpolation for this generated filmstrip.">
      <select class="val" bind:value={bakeInterpolation}>
        <option value="nearest">nearest</option>
        <option value="linear">linear</option>
      </select>
    </PropertyCell>
    <PropertyCell label="Bake" span={2} hint="Render the editable custom component into a reusable PNG filmstrip asset.">
      <button class="action-btn" class:warn={bakeWillReplace} type="button" onclick={bakeFilmstrip} disabled={bakeBusy || !core?.id || bakeEstimate.blocked}>
        {bakeBusy ? 'Baking' : (bakeWillReplace ? 'Rebake' : 'Generate')}
      </button>
    </PropertyCell>
    <PropertyCell label="Estimate" span={2} hint="Output strip size and approximate RGBA memory while baking.">
      <div class="status" class:warn={bakeEstimate.warning} class:danger={bakeEstimate.blocked}>{bakeEstimateText}</div>
    </PropertyCell>
    <PropertyCell label="Mode" span={2} hint="Whether this bake will create a new asset or replace an existing one.">
      <div class="status" class:warn={bakeWillReplace}>{bakeWillReplace ? 'Replace existing' : 'Create new'}</div>
    </PropertyCell>
    <PropertyCell label="Status" span={4} hint="Last bake result.">
      <div class="status">{bakeStatus || 'Ready'}</div>
    </PropertyCell>
  </PropertySection>

  {#if filmstrip}
    <PropertySection title="Filmstrip Setup">
      {#if filmstrip.source}
        <PropertyCell label="Preview" span={4} hint="Visual check of the selected filmstrip asset.">
          <div class="filmstrip-preview-wrap">
            <img class="filmstrip-preview" src={filmstrip.source} alt="" />
          </div>
        </PropertyCell>
      {/if}
      <PropertyCell label="Source" span={4} hint="Data URL or future packaged file reference.">
        <input class="val" type="text" value={filmstrip.source ?? ''} onchange={(event) => setFilmstrip('source', event.target.value)} placeholder="data:image/png;base64,..." />
      </PropertyCell>
      <PropertyCell label="Frames" span={1} compact hint="Total frame count.">
        <NumberCell label="Frames" value={filmstrip.frameCount ?? 128} step={1} min={1} defaultValue={128} onchange={(value) => setFilmstrip('frameCount', Math.max(1, Math.round(value)))} />
      </PropertyCell>
      <PropertyCell label="Frame W" span={1} compact hint="Frame width. Zero means detect later.">
        <NumberCell label="W" value={filmstrip.frameWidth ?? 0} step={1} min={0} defaultValue={0} onchange={(value) => setFilmstrip('frameWidth', Math.max(0, Math.round(value)))} />
      </PropertyCell>
      <PropertyCell label="Frame H" span={1} compact hint="Frame height. Zero means detect later.">
        <NumberCell label="H" value={filmstrip.frameHeight ?? 0} step={1} min={0} defaultValue={0} onchange={(value) => setFilmstrip('frameHeight', Math.max(0, Math.round(value)))} />
      </PropertyCell>
      <PropertyCell label="Axis" span={1} hint="Filmstrip direction.">
        <select class="val" value={filmstrip.orientation ?? 'vertical'} onchange={(event) => setFilmstrip('orientation', event.target.value)}>
          <option value="vertical">vertical</option>
          <option value="horizontal">horizontal</option>
        </select>
      </PropertyCell>
      <PropertyCell label="Value" span={2} hint="Value channel that chooses the frame.">
        <input class="val" type="text" value={filmstrip.valueSource ?? 'mainValue'} onchange={(event) => setFilmstrip('valueSource', event.target.value)} />
      </PropertyCell>
      <PropertyCell label="Interp" span={2} hint="Frame interpolation mode.">
        <select class="val" value={filmstrip.interpolation ?? 'nearest'} onchange={(event) => setFilmstrip('interpolation', event.target.value)}>
          <option value="nearest">nearest</option>
          <option value="linear">linear</option>
        </select>
      </PropertyCell>
    </PropertySection>
  {/if}
{/if}

<style>
  .val { width: 100%; min-width: 0; background: #1A1A1A; border: 1px solid #333; border-radius: 3px; color: #DDD; font-size: 11px; padding: 4px 6px; font-family: inherit; outline: none; box-sizing: border-box; }
  .val:focus { border-color: #5B9BD5; }
  .file-input { width: 100%; min-width: 0; min-height: 26px; background: #1A1A1A; border: 1px solid #333; border-radius: 3px; color: #DDD; font-size: 11px; padding: 3px 6px; font-family: inherit; box-sizing: border-box; }
  .file-input::file-selector-button { margin-right: 8px; background: #252525; border: 1px solid #3B3B3B; border-radius: 3px; color: #DDD; font-size: 11px; padding: 3px 8px; cursor: pointer; font-family: inherit; }
  .file-input::file-selector-button:hover { border-color: #5B9BD5; color: #FFF; }
  .metric { min-height: 26px; display: flex; align-items: center; justify-content: center; border: 1px solid #333; border-radius: 4px; background: #191919; color: #F0F0F0; font-size: 13px; font-weight: 700; }
  .status { min-height: 26px; display: flex; align-items: center; border: 1px solid #333; border-radius: 4px; background: #191919; color: #DDD; font-size: 11px; padding: 0 8px; box-sizing: border-box; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .status.warn { border-color: #8B6A25; color: #F0D48A; background: #221D12; }
  .status.danger { border-color: #8B3A3A; color: #F0B0A8; background: #241515; }
  .action-btn { width: 100%; background: #252525; border: 1px solid #3B3B3B; border-radius: 3px; color: #DDD; font-size: 11px; padding: 4px 8px; cursor: pointer; font-family: inherit; }
  .action-btn.warn { border-color: #8B6A25; color: #F0D48A; }
  .action-btn:hover:not(:disabled) { border-color: #5B9BD5; color: #FFF; }
  .action-btn.danger:hover:not(:disabled) { border-color: #D56B6B; }
  .action-btn:disabled { opacity: 0.4; cursor: default; }
  .filmstrip-preview-wrap { width: 100%; min-height: 78px; max-height: 178px; border: 1px solid #333; border-radius: 4px; background: #151515; display: flex; align-items: center; justify-content: center; overflow: auto; box-sizing: border-box; padding: 6px; }
  .filmstrip-preview { max-width: 100%; max-height: 160px; image-rendering: auto; object-fit: contain; }
</style>
