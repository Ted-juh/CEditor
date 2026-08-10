<script>
  // Player mode (Phase B2): renders ONE panel read-only/interactive with no editor chrome.
  // Reuses the editor's PanelPreviewSurface so interaction -> device-binding MIDI works
  // identically. Boots from a panel document injected by the host (C++) or a test caller.
  import { onMount } from 'svelte';
  import PanelPreviewSurface from './CE_Application/editor/PanelPreviewSurface.svelte';
  import { deserializePanel } from './CE_Application/stores/panelModel.js';
  import { syncPanelPreviewSessions, updatePanelPreviewSession, panelPreviewSessions, setPreviewModeEnabled } from './CE_Application/stores/interactionPreview.js';
  import { initPanelRuntime, setRuntimeHost } from './CE_Application/scripting/panelRuntime.js';
  import { createPlayerHost } from './CE_Application/scripting/playerScriptHost.js';
  import { buildSolidStyle, buildGradientStyle, buildLayerStyle } from './CE_Application/utils/backgroundCSS.js';
  import { buildGridStyle } from './CE_Application/utils/gridCSS.js';
  import { choiceIndexOf, choiceValueAt } from './CE_Application/utils/exportParameters.js';
  import { fileCache, loadFile } from './CE_Application/stores/fileCache.js';
  import { midiDestinations, midiInputs, mapDeviceRole, initDeviceProfileBridge, commitDeviceParameter, deviceSessionState, requestProfileSource } from './CE_Application/stores/deviceProfiles.js';
  import { profileSources, latestPresetListScan } from './CE_Application/stores/deviceProfileStores.js';
  import { injectPresetRowsIntoPanel } from './CE_Application/utils/presetChoiceRows.js';
  import { decodeInbound, inboundReadTargets } from './CE_Application/utils/inboundParameterIndex.js';
  import { inboundIndexFor } from './CE_Application/stores/inboundIndexCache.js';
  import { activeMidiControlBindings, matchesMidiControl } from './CE_Application/utils/midiControlBindings.js';
  import { expressionEventsFromHex } from './CE_Application/utils/midiNoteInput.js';
  import { getDeviceSessionState } from './CE_Application/bridge/bridge.js';
  import { listMidiDestinations, listMidiInputs, listDeviceProfiles, listProfileParameters, onMidiInputMessage, onSysexInputMessage, triggerRawMidiAction } from './CE_Application/bridge/bridge.js';
  // The GAIA-specific inbound maps this used to decode with. Now only a fallback for the window
  // before the profile source arrives — see the index below, which covers any profile.
  import deviceRuntime from './CE_Application/generated/roland.gaia.runtime.json';
  import { DEFAULT_DEVICE_ROLE } from './CE_Application/stores/deviceConstants.js';

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
  // When the plugin reloads, the processor restores the role→port mapping into its DeviceProfileService
  // BEFORE the window opens. On open we ADOPT that restored port (show it in the dropdown, don't
  // re-map) so the SH-01 selection survives a project reload instead of resetting to Preview Only.
  let mappingAdopted = false;
  let currentSession = {};

  // --- Incoming MIDI (bidirectional): the panel follows the synth ---
  // Built from the loaded device profile by compiling each parameter and keeping the bytes that do
  // not move — see utils/inboundParameterIndex.js. It replaces a hand-emitted map that covered 39
  // of the GAIA's 793 parameters and named 12 the profile no longer has, so turning a knob on the
  // instrument moved the matching control for 39 of them and silently did nothing for the rest.
  let inboundIndex = $state(null);

  // Until the profile source arrives (it is fetched over the bridge, asynchronously) fall back to
  // the generated map, so inbound never goes backwards from where it was. Both are the same shape
  // of answer; the index is the one that covers the whole instrument.
  const FALLBACK_CC = Object.fromEntries(Object.entries(deviceRuntime.ccIn ?? {}).map(([cc, id]) => [Number(cc), id]));
  const FALLBACK_SYSEX = { ...(deviceRuntime.sysexIn ?? {}) };

  let paramControlMap = {};  // parameterId -> controlId, rebuilt from the loaded panel's bindings
  let paramPortMap = {};     // parameterId -> binding port (value | brightness | backlight | text | …)
  let paramRows = {};        // parameterId -> Value.rows (choice controls), for numeric -> id mapping
  let midiControlBindings = [];  // [controlId, binding] for raw CC bindings — no parameter to key on

  // The generated GAIA panel binds scoped ids ('tone1.filter.cutoff'); the slim demo panel binds
  // Tone 1 flat ('filter.cutoff'). Try the id the profile gave, then the flat form, so a panel
  // written either way binds — 'tone2/3.*' simply find no control in a flat panel and are ignored.
  const flatId = (id) => String(id).replace(/^tone1\./, '');
  function panelKeyFor(parameterId) {
    if (paramControlMap[parameterId]) return parameterId;
    const flat = flatId(parameterId);
    return paramControlMap[flat] ? flat : null;
  }

  // Coalesce high-rate incoming CC to ONE DOM update per animation frame. The GAIA streams
  // CC 102/103/104 on every knob tick (hundreds/sec); applying each immediately floods
  // re-renders and makes the slider trail the knob. We keep only the latest value per control.
  let pendingIncoming = null;   // { [controlId]: latestValue }
  let lastAppliedValue = {};    // { [controlId]: value } — skip redundant updates
  let incomingRaf = 0;

  function rebuildParamControlMap(controls) {
    const map = {};
    const rows = {};
    const ports = {};
    const raw = [];
    for (const c of controls ?? []) {
      const id = c?._children?.Core?.id;
      if (!id) continue;
      const valueRows = c?._children?.Value?.rows;
      for (const b of c?._children?.DeviceBindings?.bindings ?? [])
        if (b?.kind === 'deviceParameter' && b?.parameterId) {
          map[b.parameterId] = id;
          ports[b.parameterId] = String(b.port ?? 'value');
          if (Array.isArray(valueRows) && valueRows.length) rows[b.parameterId] = valueRows;
        }
      // Raw CC bindings are keyed by control, not by parameter id — they have no parameter.
      for (const b of activeMidiControlBindings(c)) {
        if (b?.feedback?.receiveUpdates === false) continue;
        raw.push([id, b]);
      }
    }
    paramControlMap = map;
    paramPortMap = ports;
    paramRows = rows;
    midiControlBindings = raw;
    lastAppliedValue = {};
  }

  // --- Host parameter sync (M2): panel control <-> DAW automation parameter (two-way) ---
  // controlByParam: parameterId -> { controlId, leaf }. Built from the panel's baked
  // exportParameters (the same list the C++ APVTS is built from), matched to controls by name.
  let controlByParam = {};
  let lastParamValue = {};   // parameterId -> last value seen (dedup, both directions, no loop)
  let paramSyncReady = false; // skip emitting the initial seed (would clobber restored automation)

  function rebuildHostParamMaps(p) {
    controlByParam = {};
    lastParamValue = {};
    paramSyncReady = false;
    const idByName = {};
    const controlsById = {};
    for (const c of p?.controls ?? []) {
      const core = c?._children?.Core;
      if (core?.id) { controlsById[core.id] = c; idByName[core.id] = core.id; }
      if (core?.name) idByName[core.name] = core.id;
    }
    for (const param of p?.exportParameters ?? []) {
      const controlId = idByName[param.controlName] ?? idByName[String(param.id).split('.')[0]];
      if (!controlId) continue;
      const leaf = String(param.path ?? '').split('.').slice(1).join('.') || 'value';
      const bindings = (controlsById[controlId]?._children?.DeviceBindings?.bindings ?? [])
        .filter((b) => b?.kind === 'deviceParameter' && b?.parameterId);
      // Store-by-name selectors carry a fixed choice list; keep the param so the
      // choice name ↔ host index mapping stays stable across cascading changes.
      const choiceParam = String(param?.choiceMode ?? '') === 'value' ? param : null;
      controlByParam[param.id] = { controlId, leaf, bindings, choiceParam };
    }
  }

  // The numeric value a control currently holds in its preview session (matches the param's range).
  function controlParamValue(session, leaf, choiceParam = null) {
    if (!session) return undefined;
    if (leaf && leaf !== 'value') {
      const n = Number(session.customValues?.[leaf]);
      return Number.isFinite(n) ? n : undefined;
    }
    let v;
    if (session.currentValueOverrideEnabled) v = session.currentValueOverride;
    else if (session.valueOverrideEnabled) v = session.valueOverride;
    else if (typeof session.checked === 'boolean') v = session.checked ? 1 : 0;
    // Store-by-name selector: the live value is a choice name → its fixed host index.
    if (choiceParam) {
      const idx = choiceIndexOf(choiceParam, v);
      return idx == null ? undefined : idx;
    }
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;  // non-numeric (e.g. select ids) -> skip
  }

  // DAW automation moved a parameter -> move the on-screen control AND drive the synth. We route
  // through the surface's patchSession (the same path a user drag uses) so the device binding
  // actually sends MIDI on playback. The lastParamValue guard stops this from echoing back into a
  // recorded value (set BEFORE the patch, so the session watcher sees no change to re-emit).
  function applyParamSync(parameterId, value) {
    const m = controlByParam[parameterId];
    const v = Number(value);
    if (!m || !Number.isFinite(v) || lastParamValue[parameterId] === v) return;
    lastParamValue[parameterId] = v;
    // Store-by-name selector: the host index maps back to a choice name to write.
    const writeValue = m.choiceParam ? choiceValueAt(m.choiceParam, v) : v;
    // 1. Move the on-screen control (silent — no echo back into the recorded value).
    updatePanelPreviewSession(m.controlId, (m.leaf && m.leaf !== 'value')
      ? { customValues: { [m.leaf]: v } }
      : { valueOverrideEnabled: true, valueOverride: writeValue });
    // 2. Send the bound device parameter(s) to the synth — the same call a user drag makes, so
    //    automation playback drives the hardware. 'continuous' = rate-limited stream.
    for (const b of m.bindings ?? []) {
      commitDeviceParameter({
        requestId: `automation_${parameterId}_${Date.now()}`,
        deviceRole: b.deviceRole || DEFAULT_DEVICE_ROLE,
        parameterId: b.parameterId,
        value: writeValue,
        interactionPhase: 'continuous',
        dryRun: false,
      });
    }
  }

  // The user moved a control -> tell C++ to drive the matching host parameter (records automation).
  function emitChangedParams(sessions, backend) {
    for (const parameterId in controlByParam) {
      const { controlId, leaf, choiceParam } = controlByParam[parameterId];
      const v = controlParamValue(sessions?.[controlId], leaf, choiceParam);
      if (v === undefined || lastParamValue[parameterId] === v) continue;
      lastParamValue[parameterId] = v;
      if (paramSyncReady) backend.emitEvent('paramChanged', { id: parameterId, value: v });
    }
    paramSyncReady = true;  // first pass only seeds lastParamValue, never emits
  }

  function flushIncoming() {
    incomingRaf = 0;
    const pend = pendingIncoming;
    pendingIncoming = null;
    if (!pend) return;
    for (const controlId in pend) {
      const { v: value, port } = pend[controlId];
      if (lastAppliedValue[controlId] === value) continue;  // no change -> no render
      lastAppliedValue[controlId] = value;
      // Move the on-screen control WITHOUT re-emitting a send (updatePanelPreviewSession
      // directly, not patchControlSession) so we don't fight the synth / create a loop.
      // Display ports drive the panel's lighting/text, not a value override, so a
      // display bound directly to a device parameter responds live in the player.
      let patch;
      if (port === 'brightness') patch = { brightnessOverride: Math.max(0, Math.min(100, Math.round((Number(value) / 127) * 100))) };
      else if (port === 'backlight') patch = { backlightOverride: Number(value) >= 64 };
      else if (port === 'text') patch = { textOverride: String(value) };
      else patch = { valueOverrideEnabled: true, valueOverride: value };
      updatePanelPreviewSession(controlId, patch);
    }
  }

  // Queue a decoded device value for the next frame (shared by the CC and SysEx decoders).
  // For choice controls (radio/combobox) the device sends a NUMERIC value, but the control keys
  // on the row's id — so map number -> row.internalValue here; sliders keep the numeric value.
  function queueControlValue(rawParameterId, value) {
    const parameterId = panelKeyFor(rawParameterId);
    if (!parameterId) return;
    const controlId = paramControlMap[parameterId];
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
    queueSessionValue(controlId, paramPortMap[parameterId] ?? 'value', v);
  }

  // The same queue, addressed by control instead of by parameter — what a raw CC binding needs,
  // since it has no parameter id to go through.
  function queueSessionValue(controlId, port, value) {
    if (!controlId) return;
    (pendingIncoming ??= {})[controlId] = { v: value, port: String(port ?? 'value') };
    if (!incomingRaf) incomingRaf = requestAnimationFrame(flushIncoming);
  }

  // Incoming channel MIDI (GAIA knob with Tx Edit Data OFF -> CC 102/103/104).
  function applyIncomingMidi(payload) {
    if (!payload?.hex) return;
    // Raw bindings first, and BEFORE the messageType gate: C++ labels a message "cc" only for 0xB0
    // and "midi"/"raw" for everything else, so aftertouch, velocity, poly pressure and bend all
    // arrive unlabelled. Gating them out here is what would make those binding kinds dead.
    applyMidiControlBindings(payload.hex);
    if (payload.messageType !== 'cc') return;
    if (inboundIndex) { applyDecoded(payload.hex); return; }
    const b = String(payload.hex).trim().split(/\s+/).map((h) => parseInt(h, 16));
    if (b.length < 3 || (b[0] & 0xf0) !== 0xb0) return;  // CC status nibble 0xB
    const parameterId = FALLBACK_CC[b[1]];
    if (parameterId) queueControlValue(parameterId, b[2]);
  }

  // Incoming Roland DT1 SysEx (GAIA Tx Edit Data ON, or an RQ1 reply):
  // F0 41 <dev> 00 00 41 12 <a0 a1 a2 a3> <data...> <checksum> F7
  function applyIncomingSysex(payload) {
    if (!payload || !payload.hex) return;
    if (inboundIndex) { applyDecoded(payload.hex); return; }
    const b = String(payload.hex).trim().split(/\s+/).map((h) => parseInt(h, 16));
    if (b.length < 14 || b[0] !== 0xF0 || b[1] !== 0x41 || b[6] !== 0x12) return;  // Roland DT1
    if (b[3] !== 0x00 || b[4] !== 0x00 || b[5] !== 0x41) return;                   // model 00 00 41
    const addr = b.slice(7, 11).map((x) => x.toString(16).padStart(2, '0').toUpperCase()).join(' ');
    const parameterId = FALLBACK_SYSEX[addr];
    if (parameterId) queueControlValue(parameterId, b[11]);  // 1-byte value (cutoff/resonance 0-127)
  }

  // Both paths, once the index is up: it recognises the message and decodes the value with the
  // parameter's own encoder, which is what makes a nibbled parameter read as its whole value rather
  // than as its top nibble. An unknown or ambiguous message returns null and is ignored.
  function applyDecoded(hex) {
    const hit = decodeInbound(inboundIndex, hex);
    if (hit) queueControlValue(hit.parameterId, hit.value);
  }

  // Raw MIDI bindings, which run alongside the index rather than instead of it: a controller the
  // profile does not describe drives its control by message, and a CC the profile DOES describe can
  // legitimately do both — one panel binding it by name, another by number. matchesMidiControl does
  // the kind check, so aftertouch, velocity, poly pressure and bend all land here too.
  function applyMidiControlBindings(hex) {
    if (!midiControlBindings.length) return;
    for (const event of expressionEventsFromHex(hex)) {
      for (const [controlId, binding] of midiControlBindings) {
        if (matchesMidiControl(binding, event)) queueSessionValue(controlId, binding.port, event.value);
      }
    }
  }

  // --- SysEx read-back (RQ1): ask the synth for the current value of each bound parameter.
  // The DT1 replies flow back through applyIncomingSysex and update the panel. Pure SysEx,
  // works for every param (incl. SysEx-only ones) regardless of whether the knob sends CC.
  function rolandChecksum(bytes) {
    let sum = 0;
    for (const v of bytes) sum = (sum + v) & 0x7f;
    return (128 - sum) & 0x7f;
  }
  // What to ask for, and how many bytes each answer is. The size mattered and was wrong: this asked
  // for one byte for every parameter, which is right for a u7 and short for every nibbled and
  // 14-bit one — the instrument would have answered with a message longer than the request implied.
  function readTargets() {
    if (inboundIndex) return inboundReadTargets(inboundIndex);
    return Object.entries(FALLBACK_SYSEX).map(([address, parameterId]) => ({ parameterId, address, valueLength: 1 }));
  }

  function syncFromSynth() {
    if (!hasBridge) return;
    for (const target of readTargets()) {
      if (!panelKeyFor(target.parameterId)) continue;    // only request params present on this panel
      const addrBytes = target.address.split(/\s+/).map((h) => parseInt(h, 16));
      const size = [0x00, 0x00, 0x00, target.valueLength & 0x7f];
      const body = [0xF0, 0x41, 0x7F, 0x00, 0x00, 0x41, 0x11, ...addrBytes, ...size,
        rolandChecksum([...addrBytes, ...size]), 0xF7];
      const message = body.map((v) => v.toString(16).padStart(2, '0').toUpperCase()).join(' ');
      triggerRawMidiAction({ deviceRole: DEFAULT_DEVICE_ROLE, actionId: `rq1_${target.parameterId}`, message, dryRun: false });
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
    mapDeviceRole(DEFAULT_DEVICE_ROLE, profileId, { midiDestination: dest, midiInput: input });
    // Load this profile's parameter list so resolveParameterSend recognizes the bound params.
    if (profileId) listProfileParameters({ profileId, deviceRole: DEFAULT_DEVICE_ROLE });
    // Pull current values from the synth via RQ1 once the hardware port is open (SysEx read-back).
    if (dest.type === 'hardwareOutput') setTimeout(syncFromSynth, 600);
  }
  function selectPort(id) {
    selectedOut = id;
    mapRole();
  }

  // Adopt a hardware port the processor restored from plugin state: reflect it in the dropdown and
  // load its profile params, WITHOUT calling mapRole (which would re-send the mapping and, with a
  // stale default, clobber it). Retried as the session and the port list arrive (either order).
  function maybeAdoptMapping(session) {
    if (mappingAdopted || !hasBridge) return;
    const m = session?.mainSynth;
    const dest = m?.midiDestination;
    if (dest?.type === 'hardwareOutput' && dest.id && ports.some((p) => p.id === dest.id)) {
      mappingAdopted = true;
      selectedOut = dest.id;
      if (m.profileId) profileId = m.profileId;
      if (profileId) listProfileParameters({ profileId, deviceRole: DEFAULT_DEVICE_ROLE });
      setTimeout(syncFromSynth, 600);
    }
  }

  // Auto-connect: if nothing was restored, pick the hardware port that matches this panel's synth
  // (SH-01 / GAIA / Roland), or the only REAL hardware port. Windows' built-in GS Wavetable / GM
  // synths are ignored so they don't count as "another device". Removes the manual MIDI-out step.
  function autoConnect() {
    if (mappingAdopted || !hasBridge) return;
    // Real hardware outputs only (ignore Windows' built-in GM/GS synths).
    const hw = ports.filter((p) => p.type === 'hardwareOutput'
      && !/microsoft|wavetable|gs synth|gm |general midi/i.test(p.name ?? ''));
    if (hw.length === 0) return;   // nothing plugged in yet — retry when ports update
    // Prefer a name match for this panel's synth; otherwise just take the first real port.
    const match = hw.find((p) => /SH-?01|GAIA|Roland/i.test(p.name ?? '')) ?? hw[0];
    mappingAdopted = true;
    selectPort(match.id);          // opens the port + loads params + RQ1 sync
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
    // Start (or restart) the panel script runtime for this panel — the SAME Lua/JS runtime the editor
    // preview uses, now driving the shipped plugin. Close the previous panel's scripts (no-op on first
    // load), install the new panel as the runtime host, then previewMode off→on fires onPanelLoad +
    // onPanelReady so lifecycle scripts run.
    setPreviewModeEnabled(false);
    setRuntimeHost(createPlayerHost(panel));
    setPreviewModeEnabled(true);
    rebuildParamControlMap(panel.controls ?? []);
    rebuildHostParamMaps(panel);
    // Ask the host to push current parameter values now that our maps exist (restored automation).
    if (hasBridge && window.__JUCE__?.backend) window.__JUCE__.backend.emitEvent('requestParamSync', {});
    if (panel?.bgImageEnabled && panel?.bgImage) loadFile(panel.bgImage);
    if (panel?.bgTextureEnabled && panel?.bgTexture) loadFile(panel.bgTexture);
    // Do NOT map to the default (previewOnly) on load — that would overwrite a port restored from
    // plugin state. maybeAdoptMapping() picks up a restored hardware port; first-time use sets it
    // when the user chooses a port from the dropdown.
    if (hasBridge) { maybeAdoptMapping(currentSession); autoConnect(); }
    return panel;
  }

  // Preset-sourced listboxes: rebuild their `_presetRows` whenever the profile source or a preset
  // scan arrives. The panel is $state.raw, so the injector returns a NEW panel only when rows really
  // changed (deep-equal rows are skipped) — replacing it wholesale is the Player's update model.
  $effect(() => {
    if (hasBridge && profileId) requestProfileSource(profileId);
  });
  $effect(() => {
    const source = $profileSources?.[profileId]?.source;
    const scan = $latestPresetListScan;
    if (!panel || !source) return;
    let profile = null;
    try { profile = JSON.parse(source); } catch { return; }
    const result = injectPresetRowsIntoPanel(panel, profile, scan);
    if (result.updated && result.panel !== panel) panel = result.panel;
  });

  // The inbound index for this profile, from the shared cache — built once per profile because it
  // compiles every parameter five times, measured at ~87ms for the GAIA's 793, which would be
  // absurd on a CC stream (a matched message costs ~4us, a wholly unrecognised one ~9us). The MIDI
  // tab reads the same cache, so the two cannot disagree about what a message means. Deliberately
  // independent of `panel`: the index describes the instrument, not the layout.
  $effect(() => {
    inboundIndex = inboundIndexFor(profileId, $profileSources?.[profileId]?.source)?.index ?? null;
  });

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
    initPanelRuntime();   // start the panel script runtime (Lua/JS) so the loaded panel's scripts run
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
    let sessionsUnsub = null;
    let paramSyncToken = null;
    let deviceUnsub = null;
    if (backend) {
      initDeviceProfileBridge();   // register device event listeners (incl. the port-list reply)
      listDeviceProfiles();        // populate the profile list — resolveParameterSend gates on it
      listMidiDestinations();      // ask C++ for available MIDI outputs -> fills midiDestinations
      listMidiInputs();            // ask C++ for available MIDI inputs -> fills midiInputs (bidirectional)
      getDeviceSessionState();     // fetch any port restored from plugin state (project reload)
      // Adopt a restored hardware port as soon as both the session state and the port list exist.
      deviceUnsub = deviceSessionState.subscribe((s) => { currentSession = s ?? {}; maybeAdoptMapping(currentSession); autoConnect(); });
      portsUnsub = midiDestinations.subscribe((d) => { if (Array.isArray(d) && d.length) ports = d; maybeAdoptMapping(currentSession); autoConnect(); });
      inputsUnsub = midiInputs.subscribe((d) => {
        if (Array.isArray(d) && d.length) inPorts = d;
        // Auto-connect may have mapped the OUTPUT before this input list arrived, leaving no input
        // paired (so the synth's knob couldn't move the panel). Re-pair now that inputs exist.
        if (mappingAdopted && ports.some((p) => p.id === selectedOut && p.type === 'hardwareOutput')) mapRole();
      });
      inMsgUnsub = onMidiInputMessage(applyIncomingMidi);   // panel follows synth: incoming CC -> control
      sysexUnsub = onSysexInputMessage(applyIncomingSysex); // panel follows synth: incoming DT1 SysEx -> control
      // Host parameter <-> control (M2 two-way): user moves a control -> emitChangedParams records
      // automation; DAW automation -> applyParamSync moves the control.
      sessionsUnsub = panelPreviewSessions.subscribe((sessions) => emitChangedParams(sessions, backend));
      paramSyncToken = backend.addEventListener('paramSync', (p) => applyParamSync(p?.id, p?.value));
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
      if (backend && paramSyncToken != null) backend.removeEventListener(paramSyncToken);
      if (portsUnsub) portsUnsub();
      if (inputsUnsub) inputsUnsub();
      if (inMsgUnsub) inMsgUnsub();
      if (sysexUnsub) sysexUnsub();
      if (sessionsUnsub) sessionsUnsub();
      if (deviceUnsub) deviceUnsub();
    };
  });
</script>

<div class="player-root">
  <!-- No MIDI-out picker: the plugin auto-connects to the synth's hardware port (see autoConnect). -->
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
