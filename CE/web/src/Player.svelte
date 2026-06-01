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
  import { midiDestinations, mapDeviceRole, initDeviceProfileBridge } from './CE_Application/stores/deviceProfiles.js';
  import { listMidiDestinations } from './CE_Application/bridge/bridge.js';

  // $state.raw: the panel is replaced wholesale, never deep-mutated here. A deep $state
  // proxy would make PanelPreviewSurface's structuredClone() throw DataCloneError, and
  // mirrors how the editor feeds a non-proxied panel (via $derived) to the same surface.
  let panel = $state.raw(null);
  let surfaceRef = $state(null);

  // --- Live device output (step 1): pick a MIDI port and send for real ---
  let hasBridge = $state(false);
  let ports = $state([{ type: 'previewOnly', id: 'previewOnly', name: 'Preview Only' }]);
  let selectedOut = $state('previewOnly');
  let profileId = $state('roland-gaia');

  function mapRole() {
    const dest = ports.find((p) => p.id === selectedOut)
      ?? { type: 'previewOnly', id: 'previewOnly', name: 'Preview Only' };
    // Updates the role mapping AND tells C++ to open the MIDI output (setDeviceRoleMapping).
    mapDeviceRole('mainSynth', profileId, { midiDestination: dest });
  }
  function selectPort(id) {
    selectedOut = id;
    mapRole();
  }

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
    // Player is a runtime: make bound controls SEND (not dry-run). Safe — the engine still
    // only transmits when the role's output is a real hardware port (else it's a no-op).
    for (const c of next.controls ?? [])
      for (const b of c?._children?.DeviceBindings?.bindings ?? [])
        if (b && typeof b === 'object') b.dryRun = false;
    profileId = next.deviceSession?.mainSynth?.profileId || 'roland-gaia';
    panel = next;
    syncPanelPreviewSessions(panel.controls ?? []);
    if (panel?.bgImageEnabled && panel?.bgImage) loadFile(panel.bgImage);
    if (panel?.bgTextureEnabled && panel?.bgTexture) loadFile(panel.bgTexture);
    if (hasBridge) mapRole();
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
    // Expose a loader the host can call directly (and for browser testing).
    window.__CE_LOAD_PANEL__ = (doc, filePath) => loadPanelDocument(doc, filePath);

    // Native player host (B3): announce readiness, then receive the panel via "loadPanel".
    const backend = typeof window !== 'undefined' && window.__JUCE__ && window.__JUCE__.backend;
    hasBridge = !!backend;
    let loadToken = null;
    let portsUnsub = null;
    if (backend) {
      initDeviceProfileBridge();   // register device event listeners (incl. the port-list reply)
      listMidiDestinations();      // ask C++ for available MIDI outputs -> fills midiDestinations
      portsUnsub = midiDestinations.subscribe((d) => { if (Array.isArray(d) && d.length) ports = d; });
      loadToken = backend.addEventListener('loadPanel', (payload) => {
        loadPanelDocument(payload?.panel ?? payload?.json ?? payload);
      });
      backend.emitEvent('playerReady', {});
    } else if (window.__CE_PANEL__ != null) {
      // Browser/dev fallback: boot from a pre-injected document.
      loadPanelDocument(window.__CE_PANEL__);
    }

    const onResize = () => { vw = window.innerWidth; vh = window.innerHeight; };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (backend && loadToken != null) backend.removeEventListener(loadToken);
      if (portsUnsub) portsUnsub();
    };
  });
</script>

<div class="player-root">
  {#if hasBridge}
    <div class="device-bar">
      <label>MIDI Out
        <select value={selectedOut} onchange={(e) => selectPort(e.target.value)}>
          {#each ports as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
        </select>
      </label>
    </div>
  {/if}
  <div class="player-viewport">
    {#if panel}
      <div class="player-stage" style="width: {panel.width * scale}px; height: {panel.height * scale}px;">
        <PanelPreviewSurface bind:surfaceRef {panel} {scale} {bgLayers} {gridStyle} />
      </div>
    {:else}
      <div class="placeholder">No panel loaded.</div>
    {/if}
  </div>
</div>

<style>
  .player-root {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    background: #1E1E1E;
  }
  .device-bar {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px;
    background: #252525;
    border-bottom: 1px solid #333;
    color: #AAA;
    font-size: 11px;
  }
  .device-bar label { display: flex; align-items: center; gap: 6px; }
  .device-bar select {
    background: #1A1A1A;
    color: #DDD;
    border: 1px solid #3B3B3B;
    border-radius: 3px;
    font-size: 11px;
    padding: 2px 6px;
    outline: none;
  }
  .player-viewport {
    flex: 1 1 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: auto;
  }
  .player-stage { position: relative; }
  .placeholder { color: #777; font-size: 13px; }
</style>
