<script>
  import HostConfirmButton from './HostConfirmButton.svelte';
  import { onMount } from 'svelte';
  /**
   * HostMixerPanel.svelte — the whole rack as one mixing desk.
   *
   * Every number here already lived in the host state (part faders, sends, returns, the
   * master, CPU); what was missing was the view a keyboard player actually mixes on: strips
   * side by side instead of controls scattered per-part. Nothing keeps its own state — every
   * control sends the same command the part rows send, and the next state push is what gets
   * drawn. The dB readouts are display only: the model stays linear 0..2 like everywhere
   * else, because two representations of one fader is how mixes drift.
   */
  import {
    hostState, focusRackPart, setPartMixer, setSendLevel, setReturnLevel,
    setMasterLevel, setPartOutputPair,
    addBus, removeBus, renameBus, setBusLevel, setBusDestination, setPartDestination,
    busDestinationWouldLoop,
  } from '../stores/instrumentHost.js';
  import HostPartIdentity from './HostPartIdentity.svelte';
  import { hostPartLabel } from '../utils/hostTargetContext.js';
  import HostStereoMeter from './HostStereoMeter.svelte';
  import { hostMeters, advanceHostMeters, resetHostMeterPeaks } from '../stores/hostMeters.js';
  import { meterDbText } from '../utils/mixerMeters.js';

  // Release the display smoothly, including if audio or bridge delivery stops. The timer
  // exists only while Mixer is mounted; native packets keep the peak memory across views.
  onMount(() => {
    advanceHostMeters();
    const timer = window.setInterval(advanceHostMeters, 33);
    return () => window.clearInterval(timer);
  });

  let parts = $derived($hostState.rack.parts);
  let returns = $derived($hostState.rack.returns);
  let buses = $derived($hostState.rack.buses);
  let outputPairs = $derived($hostState.product.daw.outputPairs);

  function db(gain) {
    if (gain <= 0.001) return '-∞';
    const value = 20 * Math.log10(gain);
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}`;
  }

  function stripTitle(part) {
    return hostPartLabel(part, parts.findIndex(candidate => candidate.partId === part.partId));
  }
</script>

{#snippet levelControl(id, label, accessibleLabel, value, change)}
  <div class="level-control">
    <input class="fader" type="range" min="0" max="2" step="0.01" {value}
      aria-label={accessibleLabel} ondblclick={() => change(1)}
      oninput={(e) => change(Number(e.currentTarget.value))} />
    <HostStereoMeter {id} {label} reading={$hostMeters.channels[id]} />
  </div>
  <span class="db">Gain {db(value)} dB</span>
  <span class="peak-reading" data-testid="mixer-peak">Peak {$hostMeters.channels[id]
    ? `${meterDbText($hostMeters.channels[id].maximumDb)} dBFS` : '—'}</span>
{/snippet}

<div class="mixer" data-testid="host-mixer" style={`--mixer-upper-height:${34 + returns.length * 28}px`}>
  <div class="mixer-heading"><h2>Mixer</h2><span>OUTPUT · dBFS</span>
    <button type="button" class="ghost" data-testid="mixer-clear-peaks" onclick={() => resetHostMeterPeaks()}>Clear peaks</button>
  </div>
  <div class="strips">
    {#each parts as part, index (part.partId)}
      <div class="strip" class:focused={part.partId === $hostState.rack.focusedPartId}
           class:disabled={!part.enabled} data-testid="mixer-part-strip" data-part-id={part.partId}>
        <button type="button" class="strip-name part-strip-name" title={stripTitle(part)} aria-label={`Select ${stripTitle(part)}`}
                aria-pressed={part.partId === $hostState.rack.focusedPartId}
                onclick={() => focusRackPart(part.partId, { followEditor: false })}>
          <HostPartIdentity {part} {index} stacked />
        </button>
        <div class="strip-upper">
        <label class="pan" title={`Pan ${part.pan.toFixed(2)}`}>
          <input type="range" min="-1" max="1" step="0.01" value={part.pan}
                 aria-label={`Pan — ${stripTitle(part)}`}
                 ondblclick={() => setPartMixer(part.partId, { pan: 0 })}
                 oninput={(e) => setPartMixer(part.partId, { pan: Number(e.currentTarget.value) })} />
        </label>
        {#if returns.length > 0}
          <!-- One send row per RETURN, whether the part sends there yet or not: moving a
               silent row's slider creates the send natively (setSendLevel is create-or-
               update), which is exactly how a desk's aux knobs behave at zero. -->
          <div class="sends">
            {#each returns as chain (chain.returnId)}
              <label class="send" title={`Send to ${chain.name}`}>
                <span>{chain.name.slice(0, 6)}</span>
                <input type="range" min="0" max="2" step="0.01"
                       value={part.sends.find((s) => s.returnId === chain.returnId)?.level ?? 0}
                       oninput={(e) => setSendLevel(part.partId, chain.returnId, Number(e.currentTarget.value))} />
              </label>
            {/each}
          </div>
        {/if}
        </div>
        {@render levelControl(part.partId, stripTitle(part), `Volume — ${stripTitle(part)}`, part.volume,
          (volume) => setPartMixer(part.partId, { volume }))}
        <div class="switches">
          <button type="button" class="toggle" class:on={part.mute} title="Mute"
                  onclick={() => setPartMixer(part.partId, { mute: !part.mute })}>M</button>
          <button type="button" class="toggle" class:on={part.solo} title="Solo"
                  onclick={() => setPartMixer(part.partId, { solo: !part.solo })}>S</button>
          <button type="button" class="toggle" class:on={part.enabled} title="Part enabled"
                  onclick={() => setPartMixer(part.partId, { enabled: !part.enabled })}>On</button>
        </div>
        {#if buses.length > 0}
          <!-- Where this part goes. A bus is a destination, not a copy: routed here, the
               part reaches the master through the bus and its inserts. -->
          <select class="out" title="Destination" value={part.destinationBusId}
                  data-testid="strip-destination"
                  onchange={(e) => setPartDestination(part.partId, e.currentTarget.value)}>
            <option value="">Master</option>
            {#each buses as bus (bus.busId)}
              <option value={bus.busId}>{bus.name}</option>
            {/each}
          </select>
        {/if}
        {#if outputPairs > 1 && !part.hardware}
          <select class="out" title="Output pair" value={part.outputPair}
                  onchange={(e) => setPartOutputPair(part.partId, Number(e.currentTarget.value))}>
            {#each Array.from({ length: outputPairs }, (_, i) => i) as pair}
              <option value={pair}>{pair === 0 ? 'Main' : `Out ${pair + 1}`}</option>
            {/each}
          </select>
        {/if}
      </div>
    {/each}

    {#each buses as bus (bus.busId)}
      <div class="strip bus" data-testid="bus-strip">
        <div class="strip-header">
        <input type="text" class="strip-name editable-name" value={bus.name}
               aria-label="Bus name" title="Rename group bus"
               onchange={(e) => renameBus(bus.busId, e.currentTarget.value)} />
        <span class="strip-kind">
          bus{bus.effects.length ? ` · ${bus.effects.length} fx` : ''}
          {#if bus.latencyMs > 0.05}<br />+{bus.latencyMs.toFixed(1)} ms{/if}
        </span>
        </div>
        <div class="strip-upper"></div>
        {@render levelControl(bus.busId, `Bus · ${bus.name}`, `Bus level — ${bus.name}`, bus.level,
          (level) => setBusLevel(bus.busId, level))}
        <!-- A bus can feed another bus; a routing that would close a loop is refused natively
             and is not offered here either. Excluding only the bus ITSELF was not enough — an
             indirect loop (A into B, then B into A) was still on the menu, and picking it got
             you an error instead of a destination. -->
        <select class="out" title="Destination" value={bus.destinationBusId}
                onchange={(e) => setBusDestination(bus.busId, e.currentTarget.value)}>
          <option value="">Master</option>
          {#each buses.filter((other) => !busDestinationWouldLoop($hostState.rack, bus.busId, other.busId)) as other (other.busId)}
            <option value={other.busId}>{other.name}</option>
          {/each}
        </select>
        <HostConfirmButton identity={JSON.stringify([bus.busId])} aria-label="Remove bus" type="button" class="ghost danger" title="Remove this bus (its parts go back to the master)"
                onclick={() => removeBus(bus.busId)}>×</HostConfirmButton>
      </div>
    {/each}

    {#each returns as chain (chain.returnId)}
      <div class="strip return">
        <div class="strip-header">
        <span class="strip-name" title={`Return — ${chain.name}`}>{chain.name}</span>
        <span class="strip-kind">return{chain.effects.length ? ` · ${chain.effects.length} fx` : ''}</span>
        </div>
        <div class="strip-upper"></div>
        {@render levelControl(chain.returnId, `Return · ${chain.name}`, `Return level — ${chain.name}`, chain.level,
          (level) => setReturnLevel(chain.returnId, level))}
      </div>
    {/each}

    <div class="strip master">
      <div class="strip-header">
      <span class="strip-name">Master</span>
      <span class="strip-kind">{$hostState.rack.masterLatencyMs.toFixed(1)} ms</span>
      </div>
      <div class="strip-upper"><span class="strip-kind">Output 1–2</span></div>
      {@render levelControl('@master', 'Master', 'Master level', $hostState.product.daw.masterLevel,
        (level) => setMasterLevel(level))}
      <span class="engine" class:hot={$hostState.audio.cpu > 0.8}>
        {Math.round($hostState.audio.cpu * 100)}% CPU{$hostState.audio.xruns > 0 ? ` · ${$hostState.audio.xruns} xruns` : ''}
      </span>
    </div>

    <div class="strip add-bus">
      <button type="button" class="ghost" title="Group several instruments into one bus with its own effects"
              data-testid="mixer-add-bus" onclick={() => addBus()}>+ Bus</button>
    </div>

    {#if parts.length === 0}
      <div class="empty-hint">Nothing to mix yet — add parts in the rack above.</div>
    {/if}
  </div>
</div>

<style>
  :global(.host-workspace.host-workspace) .mixer button.part-strip-name { width: 120px; max-width: 120px; height: 76px; flex: none; padding: 6px; white-space: normal; }
  .mixer { --mixer-meter-height: 180px; min-width: 0; background: var(--host-bg-deep); border: 1px solid var(--host-line-soft); border-radius: var(--host-radius-panel); padding: 10px; }
  .mixer-heading { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }
  .mixer-heading h2 { margin: 0; font-size: 16px; }
  .mixer-heading > span { font-size: 10px; letter-spacing: .06em; color: var(--host-text-soft); }
  .mixer-heading > button { margin-left: auto; }
  .strips { display: flex; gap: 10px; overflow-x: auto; align-items: stretch; }
  .strip { display: flex; flex-direction: column; align-items: center; gap: 8px;
           background: var(--host-surface); border: 1px solid var(--host-line-soft); border-radius: var(--host-radius-panel);
           padding: 10px 8px; min-width: 136px; flex: none; }
  .strip-header { height: 76px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; flex: none; }
  .strip-upper { height: var(--mixer-upper-height); display: flex; flex-direction: column; align-items: center; gap: 4px; width: 100%; flex: none; }
  .level-control { display: flex; align-items: stretch; justify-content: center; gap: 12px; margin-top: 24px; }
  .peak-reading { font-size: 11px; color: var(--host-text-soft); font-variant-numeric: tabular-nums; }
  .strip.focused { border-color: #67abe3; box-shadow: inset 0 0 0 1px #3d81c4; }
  .strip.disabled { opacity: 0.68; }
  .strip.return { background: #142020; }
  .strip.master { background: #1d1a14; border-color: #3a3223; }
  .strip.bus { background: #171d2a; border-color: #29344a; }
  .strip.add-bus { justify-content: center; min-width: 76px; background: none; border-style: dashed; }
  .ghost { background: none; border: 1px solid var(--host-line-soft); border-radius: var(--host-radius-control); color: var(--host-text-soft);
           cursor: pointer; font-size: 12px; padding: 3px 7px; }
  .mixer :global(.ghost.danger) { color: var(--host-danger); }
  .strip-name { max-width: 92px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
                font-size: 12px; font-weight: 600; color: #e2e8ed; background: none; border: none;
                cursor: pointer; padding: 2px 4px; }
  span.strip-name { cursor: default; }
  input.strip-name { width: 92px; box-sizing: border-box; text-align: center; }
  .strip-kind { font-size: 11px; color: #8d9aa5; }
  .pan input { width: 76px; }
  .sends { display: flex; flex-direction: column; gap: 4px; width: 100%; }
  .send { display: flex; height: 24px; align-items: center; gap: 5px; font-size: 11px; color: #96a2ad; }
  .send input { flex: 1; min-width: 0; }
  /* The one vertical control in the app: a real fader. Chromium (which WebView2 is)
     renders a range vertically from writing-mode alone; rtl puts loud at the top. */
  .fader { writing-mode: vertical-lr; direction: rtl; width: 22px; height: var(--mixer-meter-height); margin: 0; }
  .db { font-size: 12px; color: #b1bbc3; font-variant-numeric: tabular-nums; }
  .switches { display: flex; gap: 4px; }
  .switches .toggle { min-width: 30px; font-size: 11px; padding: 3px 7px; background: var(--host-surface-raised); color: var(--host-text-soft);
                      border: 1px solid var(--host-line-soft); border-radius: var(--host-radius-control); cursor: pointer; }
  .switches .toggle.on { background: var(--host-accent-surface); color: var(--host-text); border-color: var(--host-accent); }
  .out { font-size: 11px; background: var(--host-field); color: var(--host-text); border: 1px solid var(--host-line-soft);
         border-radius: var(--host-radius-control); }
  .engine { font-size: 11px; color: #96a2ad; }
  .engine.hot { color: #e0a056; }
  .empty-hint { color: #66707b; font-size: 12px; align-self: center; padding: 20px; }
</style>
