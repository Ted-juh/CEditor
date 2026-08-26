<script>
  /**
   * InstrumentHostView.svelte — the Instrument Host workspace (VIP-successor Stage 1).
   *
   * Left column: the rack — parts in order, click to focus, per-part mixer and the focused
   * part's MIDI zone. Right column: the instrument browser over the native catalogue, the
   * scan controls and the quarantine list. Everything here renders the latest
   * `instrumentHostState` push and sends commands; the native side stays authoritative
   * (a control that "didn't take" reverts on the next push instead of lying).
   *
   * The native plug-in editor pane is the NEXT increment — loading works from here already,
   * the vendor UI does not show yet.
   */
  import {
    hostState, hostScanLog, hostLastError, initInstrumentHostBridge,
    filterInstruments, scanForInstruments, addScanPath, removeScanPath, clearQuarantine,
    addRackPart, removeRackPart, focusRackPart, loadInstrument, unloadInstrument,
    setPartMixer, setPartMidiRules, hostPanic,
  } from '../stores/instrumentHost.js';

  initInstrumentHostBridge();

  let search = $state('');
  let newScanPath = $state('');

  let instruments = $derived(filterInstruments($hostState.instruments, search));
  let parts = $derived($hostState.rack.parts);
  let focusedPartId = $derived($hostState.rack.focusedPartId);
  let focusedPart = $derived(parts.find((p) => p.partId === focusedPartId) ?? null);
  let quarantined = $derived($hostState.modules.filter((m) => m.quarantined));
  let lastScanLine = $derived($hostScanLog.at(-1) ?? '');

  function partTitle(part) {
    if (part.hasInstrument) return part.pluginName || 'Loaded instrument';
    if (part.unresolved) return `${part.pluginName || part.pluginCeId} (missing)`;
    return 'Empty part';
  }

  function submitScanPath() {
    const path = newScanPath.trim();
    if (!path) return;
    addScanPath(path);
    newScanPath = '';
  }
</script>

<div class="host-workspace" data-testid="instrument-host-workspace">
  <header class="host-header">
    <div class="host-title">
      <strong>Instrument Host</strong>
      <span class="host-subtitle">VST3 rack — the plug-in editor pane arrives in a later build</span>
    </div>
    <div class="host-actions">
      {#if $hostState.scanning}
        <span class="scan-status" role="status">Scanning… {lastScanLine}</span>
      {:else if lastScanLine}
        <span class="scan-status">{lastScanLine}</span>
      {/if}
      <button type="button" onclick={() => scanForInstruments()} disabled={$hostState.scanning}
              data-testid="host-scan">
        {$hostState.scanning ? 'Scanning…' : 'Scan for instruments'}
      </button>
      <button type="button" class="panic" title="All notes off, every part" onclick={() => hostPanic()}>
        Panic
      </button>
    </div>
  </header>

  {#if $hostLastError}
    <div class="host-error" role="alert">
      {$hostLastError}
      <button type="button" onclick={() => hostLastError.set('')}>×</button>
    </div>
  {/if}

  <div class="host-columns">
    <section class="rack-column" aria-label="Instrument rack">
      <div class="column-head">
        <strong>Rack</strong>
        <button type="button" onclick={() => addRackPart()} data-testid="host-add-part">+ Add part</button>
      </div>

      {#if parts.length === 0}
        <div class="empty-hint">No parts yet. Add one, then load an instrument from the right.</div>
      {/if}

      {#each parts as part (part.partId)}
        <div class="part" class:focused={part.partId === focusedPartId} class:disabled={!part.enabled}>
          <button type="button" class="part-main" onclick={() => focusRackPart(part.partId)}>
            <span class="part-name">{partTitle(part)}</span>
            <span class="part-vendor">{part.pluginVendor}</span>
          </button>
          <div class="part-controls">
            <button type="button" class="toggle" class:on={part.enabled} title="Part enabled (off panics its notes)"
                    onclick={() => setPartMixer(part.partId, { enabled: !part.enabled })}>On</button>
            <button type="button" class="toggle" class:on={part.mute} title="Mute (audio only; notes keep running)"
                    onclick={() => setPartMixer(part.partId, { mute: !part.mute })}>M</button>
            <button type="button" class="toggle" class:on={part.solo} title="Solo"
                    onclick={() => setPartMixer(part.partId, { solo: !part.solo })}>S</button>
            <label class="mini" title="Volume">
              <input type="range" min="0" max="2" step="0.01" value={part.volume}
                     oninput={(e) => setPartMixer(part.partId, { volume: Number(e.currentTarget.value) })} />
            </label>
            <label class="mini" title="Pan">
              <input type="range" min="-1" max="1" step="0.01" value={part.pan}
                     oninput={(e) => setPartMixer(part.partId, { pan: Number(e.currentTarget.value) })} />
            </label>
            {#if part.hasInstrument}
              <button type="button" class="ghost" title="Unload the instrument, keep the part"
                      onclick={() => unloadInstrument(part.partId)}>Unload</button>
            {/if}
            <button type="button" class="ghost danger" title="Remove this part"
                    onclick={() => removeRackPart(part.partId)}>×</button>
          </div>
        </div>
      {/each}

      {#if focusedPart}
        <div class="midi-zone">
          <strong>MIDI zone — {partTitle(focusedPart)}</strong>
          <div class="zone-grid">
            <label>Channel
              <select value={focusedPart.channel}
                      onchange={(e) => setPartMidiRules(focusedPart.partId, { channel: Number(e.currentTarget.value) })}>
                <option value={0}>Omni</option>
                {#each Array.from({ length: 16 }, (_, i) => i + 1) as ch}
                  <option value={ch}>{ch}</option>
                {/each}
              </select>
            </label>
            <label>Key low
              <input type="number" min="0" max="127" value={focusedPart.keyLow}
                     onchange={(e) => setPartMidiRules(focusedPart.partId, { keyLow: Number(e.currentTarget.value) })} />
            </label>
            <label>Key high
              <input type="number" min="0" max="127" value={focusedPart.keyHigh}
                     onchange={(e) => setPartMidiRules(focusedPart.partId, { keyHigh: Number(e.currentTarget.value) })} />
            </label>
            <label>Vel low
              <input type="number" min="1" max="127" value={focusedPart.velocityLow}
                     onchange={(e) => setPartMidiRules(focusedPart.partId, { velocityLow: Number(e.currentTarget.value) })} />
            </label>
            <label>Vel high
              <input type="number" min="1" max="127" value={focusedPart.velocityHigh}
                     onchange={(e) => setPartMidiRules(focusedPart.partId, { velocityHigh: Number(e.currentTarget.value) })} />
            </label>
            <label>Transpose
              <input type="number" min="-60" max="60" value={focusedPart.transpose}
                     onchange={(e) => setPartMidiRules(focusedPart.partId, { transpose: Number(e.currentTarget.value) })} />
            </label>
          </div>
        </div>
      {/if}
    </section>

    <section class="browser-column" aria-label="Instrument browser">
      <div class="column-head">
        <strong>Instruments</strong>
        <input type="search" placeholder="Search name or vendor…" bind:value={search}
               data-testid="host-search" />
      </div>

      {#if instruments.length === 0}
        <div class="empty-hint">
          {$hostState.instruments.length === 0
            ? 'Nothing in the catalogue yet — run a scan.'
            : 'Nothing matches the search.'}
        </div>
      {/if}

      <div class="instrument-list">
        {#each instruments as instrument (instrument.ceId)}
          <div class="instrument">
            <div class="instrument-id">
              <span class="instrument-name">{instrument.name}</span>
              <span class="instrument-vendor">{instrument.vendor} {instrument.version}</span>
            </div>
            <button type="button" disabled={!focusedPart}
                    title={focusedPart ? `Load into ${partTitle(focusedPart)}` : 'Add and focus a rack part first'}
                    onclick={() => focusedPart && loadInstrument(focusedPart.partId, instrument.ceId)}>
              Load
            </button>
          </div>
        {/each}
      </div>

      <div class="scan-paths">
        <strong>Extra scan folders</strong>
        <div class="scan-path-add">
          <input type="text" placeholder="D:\\More VST3s" bind:value={newScanPath}
                 onkeydown={(e) => e.key === 'Enter' && submitScanPath()} />
          <button type="button" onclick={submitScanPath}>Add</button>
        </div>
        {#each $hostState.scanPaths as path (path)}
          <div class="scan-path">
            <span>{path}</span>
            <button type="button" class="ghost danger" onclick={() => removeScanPath(path)}>×</button>
          </div>
        {/each}
      </div>

      {#if quarantined.length > 0}
        <div class="quarantine">
          <strong>Quarantined modules</strong>
          {#each quarantined as module (module.path)}
            <div class="quarantined-module" title={module.lastFailureReason}>
              <span>{module.path}</span>
              <button type="button" onclick={() => clearQuarantine(module.path)}>Retry</button>
            </div>
          {/each}
        </div>
      {/if}
    </section>
  </div>
</div>

<style>
  .host-workspace {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background: #1e1e1e;
    color: #d6dbe0;
    font-size: 13px;
  }

  .host-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 14px;
    border-bottom: 1px solid #3b4652;
    background: #171a1d;
  }

  .host-title { display: flex; flex-direction: column; gap: 2px; }
  .host-subtitle { color: #7d8894; font-size: 11px; }
  .host-actions { display: flex; align-items: center; gap: 8px; }
  .scan-status { color: #7d8894; font-size: 11px; max-width: 380px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .host-error {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin: 8px 14px 0;
    padding: 6px 10px;
    border: 1px solid #7a4a4a;
    border-radius: 4px;
    background: #2a1d1d;
    color: #e4b3b3;
  }

  .host-columns {
    flex: 1;
    display: flex;
    gap: 12px;
    min-height: 0;
    padding: 12px 14px;
  }

  .rack-column, .browser-column {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
    border: 1px solid #3b4652;
    border-radius: 6px;
    background: #171a1d;
    padding: 10px;
  }

  .column-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .column-head input[type="search"] {
    flex: 1;
    max-width: 260px;
  }

  .empty-hint { color: #7d8894; padding: 12px 4px; }

  .part {
    display: flex;
    flex-direction: column;
    gap: 6px;
    border: 1px solid #2c343d;
    border-radius: 5px;
    padding: 8px;
    background: #1c2126;
  }
  .part.focused { border-color: #5b9bd5; }
  .part.disabled { opacity: 0.55; }

  .part-main {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    background: none;
    border: none;
    color: inherit;
    text-align: left;
    cursor: pointer;
    padding: 0;
    font: inherit;
  }
  .part-name { font-weight: 600; }
  .part-vendor { color: #7d8894; }

  .part-controls { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .mini input[type="range"] { width: 70px; }

  .midi-zone {
    border: 1px solid #2c343d;
    border-radius: 5px;
    padding: 8px;
    background: #1c2126;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .zone-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }
  .zone-grid label { display: flex; flex-direction: column; gap: 3px; color: #9aa5b1; font-size: 11px; }
  .zone-grid input, .zone-grid select { width: 100%; }

  .instrument-list { display: flex; flex-direction: column; gap: 4px; }
  .instrument {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    border: 1px solid #2c343d;
    border-radius: 5px;
    padding: 6px 8px;
    background: #1c2126;
  }
  .instrument-id { display: flex; flex-direction: column; min-width: 0; }
  .instrument-name { font-weight: 600; }
  .instrument-vendor { color: #7d8894; font-size: 11px; }

  .scan-paths, .quarantine {
    display: flex;
    flex-direction: column;
    gap: 6px;
    border-top: 1px solid #2c343d;
    padding-top: 8px;
  }
  .scan-path-add { display: flex; gap: 6px; }
  .scan-path-add input { flex: 1; }
  .scan-path, .quarantined-module {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    color: #9aa5b1;
    font-size: 12px;
    overflow-wrap: anywhere;
  }

  button {
    background: #232a31;
    border: 1px solid #3b4652;
    border-radius: 4px;
    color: #d6dbe0;
    padding: 4px 10px;
    cursor: pointer;
    font: inherit;
    font-size: 12px;
  }
  button:hover:not(:disabled) { border-color: #5b9bd5; }
  button:disabled { opacity: 0.5; cursor: default; }
  button.toggle { padding: 3px 7px; color: #7d8894; }
  button.toggle.on { color: #d6dbe0; border-color: #5b9bd5; background: #24313d; }
  button.ghost { background: none; border-color: transparent; color: #7d8894; }
  button.ghost:hover { color: #d6dbe0; border-color: #3b4652; }
  button.ghost.danger:hover { color: #e4b3b3; border-color: #7a4a4a; }
  button.panic { border-color: #7a4a4a; color: #e4b3b3; }

  input, select {
    background: #14171a;
    border: 1px solid #3b4652;
    border-radius: 4px;
    color: #d6dbe0;
    padding: 3px 6px;
    font: inherit;
    font-size: 12px;
  }
</style>
