<script>
  // Player mode (Phase B2): renders ONE panel read-only/interactive with no editor chrome.
  // Reuses the editor's PanelPreviewSurface so interaction -> device-binding MIDI works
  // identically. Boots from a panel document injected by the host (C++) or a test caller.
  import { onMount } from 'svelte';
  import PanelPreviewSurface from './CE_Application/editor/PanelPreviewSurface.svelte';
  import { deserializePanel } from './CE_Application/stores/panelModel.js';
  import { syncPanelPreviewSessions } from './CE_Application/stores/interactionPreview.js';
  import { buildSolidStyle, buildGradientStyle, buildLayerStyle } from './CE_Application/utils/backgroundCSS.js';
  import { buildGridStyle } from './CE_Application/utils/gridCSS.js';
  import { fileCache, loadFile } from './CE_Application/stores/fileCache.js';

  // $state.raw: the panel is replaced wholesale, never deep-mutated here. A deep $state
  // proxy would make PanelPreviewSurface's structuredClone() throw DataCloneError, and
  // mirrors how the editor feeds a non-proxied panel (via $derived) to the same surface.
  let panel = $state.raw(null);
  let surfaceRef = $state(null);

  // Accepts a panel object, a JSON string, or a saved .cepanel document.
  function loadPanelDocument(input, filePath = null) {
    if (input == null) return null;
    let next = null;
    if (typeof input === 'string') {
      next = deserializePanel(input, filePath, null);
    } else if (typeof input === 'object') {
      // Round-trip through deserialize to merge defaults/normalize.
      next = deserializePanel(JSON.stringify(input), input.filePath ?? filePath, input.name ?? null);
    }
    if (!next) return null;
    panel = next;
    syncPanelPreviewSessions(panel.controls ?? []);
    if (panel?.bgImageEnabled && panel?.bgImage) loadFile(panel.bgImage);
    if (panel?.bgTextureEnabled && panel?.bgTexture) loadFile(panel.bgTexture);
    return panel;
  }

  // Fit the panel inside the viewport (whole panel visible), capped at 1x.
  let vw = $state(typeof window !== 'undefined' ? window.innerWidth : 800);
  let vh = $state(typeof window !== 'undefined' ? window.innerHeight : 600);
  let scale = $derived(
    panel && panel.width > 0 && panel.height > 0
      ? Math.min(1, (vw - 32) / panel.width, (vh - 32) / panel.height)
      : 1
  );

  let bgLayers = $derived(panel
    ? {
        solid: buildSolidStyle(panel),
        gradient: buildGradientStyle(panel),
        image: buildLayerStyle(panel, 'Image', panel?.bgImage ? $fileCache[panel.bgImage] : null),
        texture: buildLayerStyle(panel, 'Texture', panel?.bgTexture ? $fileCache[panel.bgTexture] : null),
      }
    : {});

  let gridStyle = $derived(panel
    ? buildGridStyle(panel, {
        gridEnabled: panel?.gridEnabled ?? false,
        gridSize: panel?.gridSize ?? 10,
        gridColour: panel?.gridColour ?? '33FFFFFF',
        gridLineWidth: panel?.gridLineWidth ?? 1,
      })
    : '');

  onMount(() => {
    // Expose a loader the host (C++ WebView / B3 player bridge) can call at any time.
    window.__CE_LOAD_PANEL__ = (doc, filePath) => loadPanelDocument(doc, filePath);
    // Boot from a pre-injected document if present.
    if (window.__CE_PANEL__ != null) loadPanelDocument(window.__CE_PANEL__);

    const onResize = () => { vw = window.innerWidth; vh = window.innerHeight; };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  });
</script>

<div class="player-viewport">
  {#if panel}
    <div class="player-stage" style="width: {panel.width * scale}px; height: {panel.height * scale}px;">
      <PanelPreviewSurface bind:surfaceRef {panel} {scale} {bgLayers} {gridStyle} />
    </div>
  {:else}
    <div class="placeholder">No panel loaded.</div>
  {/if}
</div>

<style>
  .player-viewport {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #1E1E1E;
    overflow: auto;
  }
  .player-stage { position: relative; }
  .placeholder { color: #777; font-size: 13px; }
</style>
