<script>
  /**
   * ProductPanel.svelte — the mature generated Hostage product.
   *
   * What a person needs to see once this rack is a plug-in inside somebody's DAW, and what
   * they need to see about the machine it is running on. Four honest readouts and one control
   * surface, none of which invents anything: every number here is reported by the native side
   * and every claim is one it actually checked.
   *
   * The exposed-automation list is deliberately a READOUT rather than an editor. The whole
   * point of §18.9.3 is that these sixteen slots are stable — a DAW project's automation lane
   * has to keep meaning after the rack is edited — so the slot a macro occupies is its index
   * in the rack, not something to be dragged around here.
   */
  import {
    hostState,
    setMasterLevel, setOutputPairs, setPartOutputPair,
    claimHardwareSurface, releaseHardwareSurface, clearActiveHostingIncidents,
  } from '../stores/instrumentHost.js';

  let product = $derived($hostState.product);
  let parts = $derived($hostState.rack.parts);
  let latencyMs = $derived(
    $hostState.audio.sampleRate > 0
      ? (product.daw.latencySamples / $hostState.audio.sampleRate) * 1000
      : 0);
</script>

<div class="product-panel" data-testid="host-product-panel">
  <div class="product-grid">
    <section class="product-block">
      <strong>In a DAW</strong>
      <div class="readout">
        <span class="label">Clock</span>
        <span class="value" class:on={product.daw.followingHost}>
          {product.daw.followingHost ? 'following the host'
            : product.daw.hostSync ? 'host sync on, no playhead yet'
            : 'internal'}
        </span>
      </div>
      <div class="readout">
        <span class="label">Latency</span>
        <span class="value">
          {product.daw.latencySamples} samples{latencyMs >= 0.05 ? ` · ${latencyMs.toFixed(1)} ms` : ''}
        </span>
      </div>
      <div class="readout">
        <span class="label">Tail</span>
        <span class="value">{product.daw.tailSeconds.toFixed(2)} s</span>
      </div>
      {#if product.daw.offlineRender}
        <div class="readout"><span class="label">Render</span>
          <span class="value on">offline — hardware ports released</span></div>
      {/if}

      <label class="field">Master level
        <input type="range" min="0" max="2" step="0.01" value={product.daw.masterLevel}
               aria-label="Master level"
               oninput={(e) => setMasterLevel(Number(e.currentTarget.value))} />
        <span class="value">{product.daw.masterLevel.toFixed(2)}</span>
      </label>

      <label class="field">Output pairs
        <select value={product.daw.outputPairs} aria-label="Output pairs"
                onchange={(e) => setOutputPairs(Number(e.currentTarget.value))}>
          {#each [1, 2, 3, 4, 5, 6, 7, 8] as pairs (pairs)}
            <option value={pairs}>{pairs}</option>
          {/each}
        </select>
      </label>

      {#if product.daw.outputPairs > 1}
        <div class="routing" data-testid="product-routing">
          {#each parts as part (part.partId)}
            <div class="readout">
              <span class="label">{part.pluginName || 'Empty part'}</span>
              <select value={part.outputPair} aria-label={`Output pair for ${part.pluginName || 'part'}`}
                      onchange={(e) => setPartOutputPair(part.partId, Number(e.currentTarget.value))}>
                {#each Array.from({ length: product.daw.outputPairs }, (_, i) => i) as pair (pair)}
                  <option value={pair}>{pair === 0 ? 'Main (1/2)' : `Out ${pair * 2 + 1}/${pair * 2 + 2}`}</option>
                {/each}
              </select>
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <section class="product-block">
      <strong>Automation the host sees</strong>
      <p class="note">
        Sixteen stable slots, a scene selector and the master level — never every inner
        parameter, so a project's automation keeps meaning after the rack is edited.
      </p>
      <div class="macro-grid" data-testid="product-macros">
        {#each product.daw.exposedMacros as macro (macro.index)}
          <span class="macro-slot" class:bound={macro.bound} title={macro.name}>
            <span class="macro-index">{macro.index + 1}</span>
            <span class="macro-name">{macro.bound ? macro.name.replace(/^Macro \d+ — /, '') : '—'}</span>
          </span>
        {/each}
      </div>
    </section>

    <section class="product-block">
      <strong>This machine</strong>
      <div class="readout">
        <span class="label">Platform</span>
        <span class="value" class:warn={!product.platform.supported}>
          {product.platform.name}{product.platform.supported ? '' : ' — unsupported'}
        </span>
      </div>
      <div class="matrix" data-testid="product-platform">
        {#each product.platform.rows as row (row.id)}
          <div class="matrix-row" class:missing={row.required && !row.present}>
            <span class="tick">{row.present ? '✓' : row.required ? '✕' : '·'}</span>
            <span class="label">{row.description}</span>
            <span class="detail">{row.detail}</span>
          </div>
        {/each}
      </div>

      <div class="readout">
        <span class="label">Hardware surface</span>
        <span class="value">{product.hardware.owner}</span>
        <button type="button" class="ghost"
                onclick={() => (product.hardware.owned ? releaseHardwareSurface() : claimHardwareSurface())}
                data-testid="product-claim-hardware">
          {product.hardware.owned ? 'Release' : 'Claim'}
        </button>
      </div>
      {#if product.surfaceProfiles.length > 0}
        <div class="readout">
          <span class="label">Surface profiles</span>
          <span class="value">{product.surfaceProfiles.join(', ')}</span>
        </div>
      {/if}
    </section>

    <section class="product-block">
      <strong>Project health</strong>
      {#if product.restore.degraded}
        <div class="degraded" data-testid="product-degraded">
          {#each product.restore.notes as note (note)}
            <p class="note">{note}</p>
          {/each}
          {#if product.restore.missingInstruments.length > 0}
            <div class="readout"><span class="label">Missing instruments</span>
              <span class="value warn">{product.restore.missingInstruments.join(', ')}</span></div>
          {/if}
          {#if product.restore.missingEffects.length > 0}
            <div class="readout"><span class="label">Missing effects</span>
              <span class="value warn">{product.restore.missingEffects.join(', ')}</span></div>
          {/if}
        </div>
      {:else}
        <p class="note">Everything this project references resolved.</p>
      {/if}

      <strong class="sub">Crash evidence</strong>
      <p class="note">
        Plug-ins that were live when the process died. Recorded so a decision about isolating
        active processing can rest on data rather than a hunch — nothing here changes how they
        are hosted.
      </p>
      {#if product.activeHostingIncidents.length === 0}
        <p class="note quiet">Nothing recorded.</p>
      {:else}
        <div class="matrix" data-testid="product-incidents">
          {#each product.activeHostingIncidents as incident (incident.modulePath)}
            <div class="matrix-row">
              <span class="tick warn">!</span>
              <span class="label">{incident.name || incident.modulePath}</span>
              <span class="detail">{incident.count}×</span>
            </div>
          {/each}
        </div>
        <button type="button" class="ghost" onclick={() => clearActiveHostingIncidents()}>
          Clear the log
        </button>
      {/if}
    </section>
  </div>
</div>

<style>
  .product-panel {
    margin: 8px 14px 0;
    padding: 10px;
    border: 1px solid var(--host-line);
    border-radius: var(--host-radius-panel);
    background: var(--host-surface);
    max-height: 420px;
    overflow-y: auto;
  }

  .product-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 16px;
  }

  .product-block { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .sub { margin-top: 6px; }
  .note { margin: 0; color: #7d8894; font-size: 11px; line-height: 1.45; }
  .note.quiet { color: #66707b; }

  .readout { display: flex; align-items: center; gap: 8px; font-size: 12px; }
  .label { flex: 0 0 118px; color: #9aa5b1; font-size: 11px; }
  .value { color: #d6dbe0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .value.on { color: #9fd6a3; }
  .value.warn { color: #e4b3b3; }

  .field { display: flex; align-items: center; gap: 8px; color: #9aa5b1; font-size: 11px; }
  .field input[type='range'] { flex: 1; min-width: 60px; }

  .routing { display: flex; flex-direction: column; gap: 4px; border-top: 1px solid #2c343d; padding-top: 6px; }

  .macro-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; }
  .macro-slot {
    display: flex;
    flex-direction: column;
    gap: 1px;
    border: 1px solid #2c343d;
    border-radius: 3px;
    padding: 3px 5px;
    min-width: 0;
  }
  .macro-slot.bound { border-color: #5b9bd5; background: #1c2126; }
  .macro-index { color: #66707b; font-size: 10px; }
  .macro-name { color: #7d8894; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .macro-slot.bound .macro-name { color: #d6dbe0; }

  .matrix { display: flex; flex-direction: column; gap: 3px; }
  .matrix-row { display: flex; align-items: baseline; gap: 8px; font-size: 12px; }
  .matrix-row .label { flex: 1; color: #d6dbe0; }
  .matrix-row.missing .label { color: #e4b3b3; }
  .tick { flex: 0 0 12px; color: #9fd6a3; }
  .tick.warn { color: #e4b3b3; }
  .matrix-row.missing .tick { color: #e4b3b3; }
  .detail { flex: 0 0 auto; color: #66707b; font-size: 11px; max-width: 40%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .degraded {
    border: 1px solid #7a4a4a;
    border-radius: 4px;
    background: #2a1d1d;
    padding: 6px 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  button.ghost { align-self: flex-start; }
</style>
