<script>
  // Player mode (Phase B2): renders ONE panel read-only/interactive with no editor chrome.
  // Reuses the editor's PanelPreviewSurface so interaction -> device-binding MIDI works
  // identically. Boots from a panel document injected by the host (C++) or a test caller.
  import { onMount } from 'svelte';
  import PanelPreviewSurface from './CE_Application/editor/PanelPreviewSurface.svelte';
  import { deserializePanel } from './CE_Application/stores/panelModel.js';
  import { syncPanelPreviewSessions, updatePanelPreviewSession } from './CE_Application/stores/interactionPreview.js';
  import { buildSolidStyle, buildGradientStyle, buildLayerStyle } from './CE_Application/utils/backgroundCSS.js';
  import { buildGridStyle } from './CE_Application/utils/gridCSS.js';
  import { fileCache, loadFile } from './CE_Application/stores/fileCache.js';
  import { midiDestinations, midiInputs, mapDeviceRole, initDeviceProfileBridge } from './CE_Application/stores/deviceProfiles.js';
  import { listMidiDestinations, listMidiInputs, listDeviceProfiles, listProfileParameters, onMidiInputMessage, onSysexInputMessage, triggerRawMidiAction } from './CE_Application/bridge/bridge.js';
  // Inbound decode maps are generated from the DPD device profile (CE/dpd), not hardcoded.
  import deviceRuntime from './CE_Application/generated/roland.gaia.runtime.json';

  // $state.raw: the panel is replaced wholesale, never deep-mutated here. A deep $state
  // proxy would make PanelPreviewSurface's structuredClone() throw DataCloneError, and
  // mirrors how the editor feeds a non-proxied panel (via $derived) to the same surface.
  let panel = $state.raw(null);
  let surfaceRef = $state(null);

  // --- Live device output (step 1): pick a MIDI port and send for real ---
  let hasBridge = $state(false);
  let ports = $state([{ type: 'previewOnly', id: 'previewOnly', name: 'Preview Only' }]);
  let inPorts = $state([{ type: 'none', id: 'none', name: 'No MIDI Input' }]);
  let selectedOut = $state('previewOnly');
  let profileId = $state('roland-gaia');

  // --- Incoming MIDI (bidirectional): the panel follows the synth ---
  // The GAIA's filter knob transmits CC 102/103/104 (Tone 1/2/3 cutoff). Map the CCs we
  // mirror on-screen to device parameters. First pass — later sourced from the device profile.
  // INBOUND_CC (cc -> paramId) and INBOUND_SYSEX (DT1 address -> paramId) are DERIVED from the
  // DPD runtime map (CE/dpd/tools/emit-runtime.mjs) — the "maps -> profile" generalization, no
  // hardcoding. This slim panel binds Tone 1 with flat ids ('filter.cutoff'), so resolved
  // 'tone1.*' ids map back to flat; 'tone2/3.*' entries stay scoped (unbound here -> ignored).
  const flatId = (rid) => rid.replace(/^tone1\./, '');
  const INBOUND_CC = Object.fromEntries(Object.entries(deviceRuntime.ccIn ?? {}).map(([cc, rid]) => [Number(cc), flatId(rid)]));
  const INBOUND_SYSEX = Object.fromEntries(Object.entries(deviceRuntime.sysexIn ?? {}).map(([addr, rid]) => [addr, flatId(rid)]));
  let paramControlMap = {};  // parameterId -> controlId, rebuilt from the loaded panel's bindings
  let paramRows = {};        // parameterId -> Value.rows (choice controls), for numeric -> id mapping

  // Coalesce high-rate incoming CC to ONE DOM update per animation frame. The GAIA streams
  // CC 102/103/104 on every knob tick (hundreds/sec); applying each immediately floods
  // re-renders and makes the slider trail the knob. We keep only the latest value per control.
  let pendingIncoming = null;   // { [controlId]: latestValue }
  let lastAppliedValue = {};    // { [controlId]: value } — skip redundant updates
  let incomingRaf = 0;

  function rebuildParamControlMap(controls) {
    const map = {};
    const rows = {};
    for (const c of controls ?? []) {
      const id = c?._children?.Core?.id;
      if (!id) continue;
      const valueRows = c?._children?.Value?.rows;
      for (const b of c?._children?.DeviceBindings?.bindings ?? [])
        if (b?.kind === 'deviceParameter' && b?.parameterId) {
          map[b.parameterId] = id;
          if (Array.isArray(valueRows) && valueRows.length) rows[b.parameterId] = valueRows;
        }
    }
    paramControlMap = map;
    paramRows = rows;
    lastAppliedValue = {};
  }

  function flushIncoming() {
    incomingRaf = 0;
    const pend = pendingIncoming;
    pendingIncoming = null;
    if (!pend) return;
    for (const controlId in pend) {
      const value = pend[controlId];
      if (lastAppliedValue[controlId] === value) continue;  // no change -> no render
      lastAppliedValue[controlId] = value;
      // Move the on-screen control WITHOUT re-emitting a send (updatePanelPreviewSession
      // directly, not patchControlSession) so we don't fight the synth / create a loop.
      updatePanelPreviewSession(controlId, { valueOverrideEnabled: true, valueOverride: value });
    }
  }

  // Queue a decoded device value for the next frame (shared by the CC and SysEx decoders).
  // For choice controls (radio/combobox) the device sends a NUMERIC value, but the control keys
  // on the row's id — so map number -> row.internalValue here; sliders keep the numeric value.
  function queueControlValue(parameterId, value) {
    const controlId = paramControlMap[parameterId];
    if (!controlId) return;
    const rows = paramRows[parameterId];
    let v;
    if (rows && rows.length) {
      const row = rows.find((r) => Number(r.sendValue) === Number(value))
        ?? rows.find((r) => String(r.receiveValue) === String(value));
      if (!row) return;                       // unknown choice value -> ignore
      v = row.internalValue ?? row.id;
    } else {
      if (!Number.isFinite(value)) return;    // sliders: numeric only
      v = value;
    }
    (pendingIncoming ??= {})[controlId] = v;
    if (!incomingRaf) incomingRaf = requestAnimationFrame(flushIncoming);
  }

  // Incoming CC (GAIA knob with Tx Edit Data OFF -> CC 102/103/104).
  function applyIncomingMidi(payload) {
    if (!payload || payload.messageType !== 'cc' || !payload.hex) return;
    const b = String(payload.hex).trim().split(/\s+/).map((h) => parseInt(h, 16));
    if (b.length < 3 || (b[0] & 0xf0) !== 0xb0) return;  // CC status nibble 0xB
    const parameterId = INBOUND_CC[b[1]];
    if (parameterId) queueControlValue(parameterId, b[2]);
  }

  // Incoming Roland DT1 SysEx (GAIA Tx Edit Data ON, or an RQ1 reply):
  // F0 41 <dev> 00 00 41 12 <a0 a1 a2 a3> <data...> <checksum> F7
  function applyIncomingSysex(payload) {
    if (!payload || !payload.hex) return;
    const b = String(payload.hex).trim().split(/\s+/).map((h) => parseInt(h, 16));
    if (b.length < 14 || b[0] !== 0xF0 || b[1] !== 0x41 || b[6] !== 0x12) return;  // Roland DT1
    if (b[3] !== 0x00 || b[4] !== 0x00 || b[5] !== 0x41) return;                   // model 00 00 41
    const addr = b.slice(7, 11).map((x) => x.toString(16).padStart(2, '0').toUpperCase()).join(' ');
    const parameterId = INBOUND_SYSEX[addr];
    if (parameterId) queueControlValue(parameterId, b[11]);  // 1-byte value (cutoff/resonance 0-127)
  }

  // --- SysEx read-back (RQ1): ask the synth for the current value of each bound parameter.
  // The DT1 replies flow back through applyIncomingSysex and update the panel. Pure SysEx,
  // works for every param (incl. SysEx-only ones) regardless of whether the knob sends CC.
  function rolandChecksum(bytes) {
    let sum = 0;
    for (const v of bytes) sum = (sum + v) & 0x7f;
    return (128 - sum) & 0x7f;
  }
  function syncFromSynth() {
    if (!hasBridge) return;
    for (const addr in INBOUND_SYSEX) {
      const parameterId = INBOUND_SYSEX[addr];
      if (!paramControlMap[parameterId]) continue;       // only request params present on this panel
      const addrBytes = addr.split(/\s+/).map((h) => parseInt(h, 16));
      const size = [0x00, 0x00, 0x00, 0x01];             // 1-byte params (cutoff/resonance)
      const body = [0xF0, 0x41, 0x7F, 0x00, 0x00, 0x41, 0x11, ...addrBytes, ...size,
        rolandChecksum([...addrBytes, ...size]), 0xF7];
      const message = body.map((v) => v.toString(16).padStart(2, '0').toUpperCase()).join(' ');
      triggerRawMidiAction({ deviceRole: 'mainSynth', actionId: `rq1_${parameterId}`, message, dryRun: false });
    }
  }

  function mapRole() {
    const dest = ports.find((p) => p.id === selectedOut)
      ?? { type: 'previewOnly', id: 'previewOnly', name: 'Preview Only' };
    // Pair the matching hardware INPUT (same device name) so the panel can follow the synth
    // (bidirectional): turning a knob on the hardware sends MIDI back in on this port.
    const input = (dest.type === 'hardwareOutput'
      ? inPorts.find((p) => p.type === 'hardwareInput' && p.name === dest.name)
        ?? inPorts.find((p) => p.type === 'hardwareInput'
          && (p.name?.includes(dest.name) || dest.name?.includes(p.name)))
      : null)
      ?? { type: 'none', id: 'none', name: 'No MIDI Input' };
    // Updates the role mapping AND tells C++ to open the MIDI output + input (setDeviceRoleMapping).
    mapDeviceRole('mainSynth', profileId, { midiDestination: dest, midiInput: input });
    // Load this profile's parameter list so resolveParameterSend recognizes the bound params.
    if (profileId) listProfileParameters({ profileId, deviceRole: 'mainSynth' });
    // Pull current values from the synth via RQ1 once the hardware port is open (SysEx read-back).
    if (dest.type === 'hardwareOutput') setTimeout(syncFromSynth, 600);
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
    rebuildParamControlMap(panel.controls ?? []);
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
    let inputsUnsub = null;
    let inMsgUnsub = null;
    let sysexUnsub = null;
    if (backend) {
      initDeviceProfileBridge();   // register device event listeners (incl. the port-list reply)
      listDeviceProfiles();        // populate the profile list — resolveParameterSend gates on it
      listMidiDestinations();      // ask C++ for available MIDI outputs -> fills midiDestinations
      listMidiInputs();            // ask C++ for available MIDI inputs -> fills midiInputs (bidirectional)
      portsUnsub = midiDestinations.subscribe((d) => { if (Array.isArray(d) && d.length) ports = d; });
      inputsUnsub = midiInputs.subscribe((d) => { if (Array.isArray(d) && d.length) inPorts = d; });
      inMsgUnsub = onMidiInputMessage(applyIncomingMidi);   // panel follows synth: incoming CC -> control
      sysexUnsub = onSysexInputMessage(applyIncomingSysex); // panel follows synth: incoming DT1 SysEx -> control
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
      if (inputsUnsub) inputsUnsub();
      if (inMsgUnsub) inMsgUnsub();
      if (sysexUnsub) sysexUnsub();
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
      <button class="sync-btn" onclick={syncFromSynth} title="Request current values from the synth (SysEx RQ1)">Sync from synth</button>
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
  .sync-btn {
    background: #2A2A2A;
    color: #DDD;
    border: 1px solid #3B3B3B;
    border-radius: 3px;
    font-size: 11px;
    padding: 2px 8px;
    cursor: pointer;
  }
  .sync-btn:hover { background: #333; }
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
