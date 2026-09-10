<script>
  /**
   * The Assets tab.
   *
   * Candidate 3 of the display-panel plan; `docs/design/assets-tab-design.md` has the argument. Two
   * things are worth knowing before editing this file.
   *
   * FIRST, the tab exists because of a defect, not only because of space. `InteractivePartRenderer`
   * takes the whole strip image to be exactly `frameCount` frames, so a file carrying anything else
   * — stray rows, or a count that is simply wrong — is sliced at the wrong pitch and the error grows
   * to a whole frame or more by the end. Nothing in the application has ever checked that, and the
   * check is one modulo. `utils/assetsModel.js` has the mechanism, measured rather than assumed.
   * Running it needs the image's NATURAL size, which the asset does not store, so this file
   * measures and caches it. That measurement is never written back on its own: recording it is an
   * action the user takes, because a tab that dirties the document by being opened is a tab people
   * learn to avoid.
   *
   * SECOND, THE PROPERTIES PANEL IS UNTOUCHED. Every field here is still in `CustomAssetsEditor`
   * and still editable there. Nothing has been relocated yet; the tab has to be shown to work
   * first. `allAssetFieldLabels()` is ready for the day the panel's rows come out, because moving a
   * group without its search index is losing it rather than moving it.
   */
  import { onMount } from 'svelte';
  import AssetLibrary from './assets/AssetLibrary.svelte';
  import AssetStage from './assets/AssetStage.svelte';
  import AssetSettings from './assets/AssetSettings.svelte';
  import AssetBake from './assets/AssetBake.svelte';
  import { activePanel, selectedComponentIds } from '../stores/panels.js';
  import { applyControlPatch, updateControlProperty, removeControlNode, getSection } from '../stores/controls.js';
  import { flatControls } from '../utils/containment.js';
  import {
    editorTarget,
    activateEditorTarget,
    clearEditorTarget,
    targetOfKind,
  } from '../stores/editorTarget.js';
  import { bakeCustomComponentFilmstrip } from '../utils/customComponentFilmstripBaker.js';
  import {
    listAssets,
    findAsset,
    assetPath,
    assetFileName,
    frameCountPatch,
    assetSizePatch,
    importedAsset,
    safeAssetFileName,
    clampFrameIndex,
  } from '../utils/assetsModel.js';

  let mine = $derived(targetOfKind($editorTarget, 'assets'));
  let panelControls = $derived(flatControls($activePanel?.controls ?? []));

  let control = $derived(
    mine?.controlId
      ? panelControls.find((entry) => entry._children?.Core?.id === mine.controlId) ?? null
      : null
  );

  let controlId = $derived(control?._children?.Core?.id ?? '');
  let controlName = $derived(control?._children?.Core?.name || control?._children?.Core?.controlType || '');
  let assets = $derived(getSection(control, 'Assets'));
  let designer = $derived(getSection(control, 'Designer'));
  let partNames = $derived(Object.keys(getSection(control, 'Parts')?._children ?? {}));
  let layerName = $derived(designer?.selectedLayer || partNames[0] || '');
  let channelNames = $derived(Object.keys(getSection(control, 'ValueChannels')?._children ?? {}));

  let library = $derived(listAssets(assets));

  // The wanted key is what the user last clicked; the selected key is what still exists. Deriving
  // the second from the first means an asset deleted, renamed or arrived-at from another control
  // self-heals to the first in the library with no effect chasing it.
  let wantedKey = $state('');
  let selectedKey = $derived(
    library.some((entry) => entry.key === wantedKey) ? wantedKey : (library[0]?.key ?? '')
  );
  let selected = $derived(selectedKey ? findAsset(assets, selectedKey) : null);

  let rawFrameIndex = $state(0);
  let frameIndex = $derived(clampFrameIndex(rawFrameIndex, selected?.frameCount ?? 1));

  let baking = $state(false);
  let bakeBusy = $state(false);
  let status = $state('');

  // --- Measuring --------------------------------------------------------------
  // Keyed by source, so switching back to an asset is instant and a changed source re-measures.
  // The cache is per-mount and deliberately not a store: it holds nothing worth persisting and
  // everything in it can be recomputed from an <img>.
  const measured = new Map();
  let natural = $state({ width: 0, height: 0, pending: false });

  $effect(() => {
    const source = selected?.source ?? '';
    if (!source) { natural = { width: 0, height: 0, pending: false }; return; }
    const cached = measured.get(source);
    if (cached) { natural = { ...cached, pending: false }; return; }

    let cancelled = false;
    natural = { width: 0, height: 0, pending: true };
    const image = new Image();
    image.onload = () => {
      const size = { width: image.naturalWidth || image.width || 0, height: image.naturalHeight || image.height || 0 };
      measured.set(source, size);
      if (!cancelled) natural = { ...size, pending: false };
    };
    image.onerror = () => {
      if (!cancelled) natural = { width: 0, height: 0, pending: false };
    };
    image.src = source;
    return () => { cancelled = true; };
  });

  onMount(() => {
    if (mine) return;
    const first = [...($selectedComponentIds ?? [])][0];
    if (first) activateEditorTarget('assets', first);
  });

  function armFromSelection() {
    const first = [...($selectedComponentIds ?? [])][0];
    if (first) { activateEditorTarget('assets', first); status = ''; }
  }

  // --- Writes -----------------------------------------------------------------

  function setField(key, value) {
    if (!controlId || !selected) return;
    updateControlProperty(controlId, assetPath(selected.kind, selected.name, key), value);
  }

  function setPolicy(key, value) {
    if (!controlId) return;
    updateControlProperty(controlId, `Assets.packagePolicy.${key}`, value);
  }

  function patch(next) {
    if (!controlId || !next || !Object.keys(next).length) return;
    applyControlPatch(controlId, next);
  }

  function fixFrameCount(count) {
    if (!selected) return;
    patch(frameCountPatch({
      kind: selected.kind,
      name: selected.name,
      frameCount: count,
      width: natural.width,
      height: natural.height,
      orientation: selected.orientation,
    }));
    rawFrameIndex = clampFrameIndex(frameIndex, count);
    status = `${selected.name} set to ${count} frames`;
  }

  function recordSize() {
    if (!selected) return;
    patch(assetSizePatch({ kind: selected.kind, name: selected.name, width: natural.width, height: natural.height }));
    status = `${selected.name} recorded as ${natural.width}×${natural.height}`;
  }

  function removeSelected() {
    if (!controlId || !selected) return;
    removeControlNode(controlId, assetPath(selected.kind, selected.name));
    status = `Removed ${selected.name}`;
    wantedKey = '';
  }

  function download() {
    if (!selected?.hasSource) return;
    const link = document.createElement('a');
    link.href = selected.source;
    link.download = assetFileName(selected);
    document.body.appendChild(link);
    link.click();
    link.remove();
    status = `Saved ${assetFileName(selected)}`;
  }

  function applyToLayer(slot) {
    if (!controlId || !selected?.hasSource || !layerName) return;
    const prefix = slot === 'overlay' ? 'overlay' : 'image';
    patch({
      [`Parts.${layerName}.Background.Fill.${prefix}Enabled`]: true,
      [`Parts.${layerName}.Background.Fill.${prefix}Src`]: selected.source,
      [`Parts.${layerName}.Background.Fill.${prefix}Fit`]: slot === 'overlay' ? 'cover' : 'fill',
      [`Parts.${layerName}.Background.Fill.${prefix}Opacity`]: 100,
      'Designer.selectedLayer': layerName,
    });
    status = `${selected.name} applied to ${layerName}`;
  }

  // --- Import and bake --------------------------------------------------------

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error ?? new Error('Could not read the file.'));
      reader.readAsDataURL(file);
    });
  }

  function measure(source) {
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth || image.width || 0, height: image.naturalHeight || image.height || 0 });
      image.onerror = () => resolve({ width: 0, height: 0 });
      image.src = source;
    });
  }

  function uniqueName(kind, base) {
    const taken = new Set(library.filter((entry) => entry.kind === kind).map((entry) => entry.name));
    if (!taken.has(base)) return base;
    let n = 2;
    while (taken.has(`${base}${n}`)) n += 1;
    return `${base}${n}`;
  }

  async function importAsset(kind, file) {
    if (!controlId || !file) return;
    try {
      const source = await readFile(file);
      if (!source.startsWith('data:image/')) { status = 'That is not an image file.'; return; }
      const size = await measure(source);
      measured.set(source, size);
      const name = uniqueName(kind, safeAssetFileName(file.name.replace(/\.[^.]+$/, ''), kind));
      const asset = importedAsset({ kind, name, source, width: size.width, height: size.height, fileName: file.name });
      patch({ [assetPath(kind, name)]: asset });
      wantedKey = `${kind}:${name}`;
      rawFrameIndex = 0;
      status = kind === 'filmstrip'
        ? `Imported ${file.name} — ${asset.frameCount} frames guessed from its shape, check below`
        : `Imported ${file.name}`;
    } catch (error) {
      status = error?.message ?? 'Import failed';
    }
  }

  async function runBake(options) {
    if (!controlId || bakeBusy) return;
    bakeBusy = true;
    status = 'Baking…';
    try {
      const asset = await bakeCustomComponentFilmstrip(control, options);
      // The generator is written alongside the asset for the same reason the properties panel does
      // it: a baked strip nothing draws is a file, not a component.
      patch({
        [assetPath('filmstrip', asset.name)]: asset,
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
      wantedKey = `filmstrip:${asset.name}`;
      rawFrameIndex = 0;
      baking = false;
      status = `Baked ${asset.frameCount} frames into ${asset.name}`;
    } catch (error) {
      status = error?.message ?? 'Bake failed';
    } finally {
      bakeBusy = false;
    }
  }

  function selectAsset(key) {
    wantedKey = key;
    rawFrameIndex = 0;
    status = '';
  }
</script>

<div class="assets-tab">
  {#if !control}
    <div class="empty">
      <strong>Nothing armed.</strong>
      <p>
        Select a control on the canvas, then use the button below. This tab stays on the control you
        open it with, so it will not change under you while you work.
      </p>
      <button type="button" class="arm" disabled={!($selectedComponentIds?.size)} onclick={armFromSelection}>
        {($selectedComponentIds?.size) ? 'Edit the selected control’s assets' : 'Select a control first'}
      </button>
    </div>
  {:else if !assets}
    <div class="empty">
      <strong>{controlName} carries no assets.</strong>
      <p>
        Images and filmstrips belong to custom components. Pick one — or anything else with an
        Assets section — and this tab will show its library.
      </p>
      <button type="button" class="arm" onclick={armFromSelection}>Use the selection</button>
    </div>
  {:else}
    <div class="head">
      <span class="who">
        editing <b>{controlName}</b>
        {#if !($selectedComponentIds?.has?.(controlId))}
          <i class="stale" title="This is not the control currently selected — the tab stays where you opened it">not selected</i>
        {/if}
      </span>

      {#if status}<span class="status" role="status">{status}</span>{/if}

      <div class="headtools">
        <button type="button" disabled={!($selectedComponentIds?.size)} onclick={armFromSelection}
                title="Point this tab at the control that is selected now">Use selection</button>
        <button type="button" onclick={clearEditorTarget} title="Stop editing this control">Clear</button>
      </div>
    </div>

    <div class="cols">
      <div class="libcol">
        <div class="colh">Library <s>{library.length}</s></div>
        <AssetLibrary
          assets={library}
          {selectedKey}
          {baking}
          onselect={selectAsset}
          onimport={importAsset}
          onbake={() => { baking = !baking; }}
        />
      </div>

      <div class="stagecol">
        <div class="colh">
          {selected?.name ?? 'No asset'}
          <s>
            {#if selected?.kind === 'filmstrip'}
              {natural.width && natural.height ? `${natural.width}×${natural.height} · ` : ''}{selected.frameCount} frames
            {:else if selected}
              {natural.width && natural.height ? `${natural.width}×${natural.height}` : 'image'}
            {/if}
          </s>
        </div>
        {#if selected}
          <AssetStage
            entry={selected}
            {natural}
            {frameIndex}
            onframe={(index) => rawFrameIndex = index}
            onfix={fixFrameCount}
            onrecordsize={recordSize}
          />
        {:else}
          <p class="nothing">This component has no images or filmstrips yet.</p>
        {/if}
      </div>

      <div class="setcol">
        <div class="colh">{baking ? 'Bake' : 'Settings'}</div>
        {#if baking}
          <AssetBake
            {control}
            channels={channelNames}
            existingNames={library.filter((entry) => entry.kind === 'filmstrip').map((entry) => entry.name)}
            busy={bakeBusy}
            status={bakeBusy ? status : ''}
            onbake={runBake}
            oncancel={() => { baking = false; }}
          />
        {:else}
          <AssetSettings
            entry={selected}
            policy={assets?.packagePolicy}
            {layerName}
            onset={setField}
            onpolicy={setPolicy}
            ondownload={download}
            onremove={removeSelected}
            onapply={applyToLayer}
          />
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .assets-tab {
    height: 100%;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: auto;
    background: #15181B;
  }

  .head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 10px;
    border-bottom: 1px solid #2A2A2A;
    flex: 0 0 auto;
  }

  .who {
    font: 500 9.5px/1 'IBM Plex Mono', ui-monospace, monospace;
    color: #616C75;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .who b { color: #8FEDE3; font-weight: 600; }
  .who .stale {
    font-style: normal;
    margin-left: 6px;
    color: #E5A029;
    border: 1px solid #4A3A1C;
    background: #241d10;
    border-radius: 2px;
    padding: 2px 4px;
  }

  .status {
    font: 400 9.5px/1 'IBM Plex Sans', system-ui, sans-serif;
    color: #8A949C;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .headtools { margin-left: auto; display: flex; gap: 4px; }
  .headtools button {
    border: 1px solid #333B42;
    background: #12171A;
    color: #9AA6AE;
    font: 600 9px/1 'IBM Plex Sans', system-ui, sans-serif;
    padding: 5px 8px;
    border-radius: 3px;
    cursor: pointer;
  }
  .headtools button:hover:not(:disabled) { border-color: #4A555E; color: #E8EEF5; }
  .headtools button:disabled { opacity: 0.4; cursor: default; }

  .cols {
    display: flex;
    gap: 10px;
    padding: 10px;
    align-items: flex-start;
    min-width: 0;
    flex: 1 1 auto;
  }

  .libcol { flex: 0 0 236px; min-width: 0; }
  .stagecol { flex: 1 1 0; min-width: 280px; }
  .setcol { flex: 0 0 262px; min-width: 0; }

  .colh {
    display: flex;
    align-items: center;
    gap: 6px;
    font: 600 8.5px/1 'IBM Plex Mono', ui-monospace, monospace;
    letter-spacing: 0.13em;
    text-transform: uppercase;
    color: #616C75;
    margin-bottom: 7px;
    white-space: nowrap;
    overflow: hidden;
  }
  .colh s { margin-left: auto; text-decoration: none; font-size: 8.5px; letter-spacing: 0.06em; }

  .nothing {
    margin: 0;
    padding: 30px 12px;
    text-align: center;
    border: 1px dashed #2E3540;
    border-radius: 4px;
    font: 400 10px/1.5 'IBM Plex Sans', system-ui, sans-serif;
    color: #69737B;
  }

  .empty { padding: 22px; max-width: 46ch; color: #8A949C; }
  .empty strong { display: block; font: 600 13px/1.4 'IBM Plex Sans', system-ui, sans-serif; color: #E8EEF5; }
  .empty p { margin: 8px 0 14px; font: 400 12px/1.6 'IBM Plex Sans', system-ui, sans-serif; }

  .arm {
    border: 1px solid #0E7C70;
    background: #0B2320;
    color: #8FEDE3;
    font: 600 11px/1 'IBM Plex Sans', system-ui, sans-serif;
    padding: 8px 12px;
    border-radius: 3px;
    cursor: pointer;
  }
  .arm:disabled { opacity: 0.45; cursor: default; border-color: #333B42; background: #12171A; color: #69737B; }

  @media (max-width: 1040px) {
    .cols { flex-wrap: wrap; }
    .stagecol { flex: 1 1 100%; order: -1; }
  }
</style>
