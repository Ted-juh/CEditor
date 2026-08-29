<script>
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
  } from '../stores/instrumentHost.js';

  let parts = $derived($hostState.rack.parts);
  let returns = $derived($hostState.rack.returns);
  let outputPairs = $derived($hostState.product.daw.outputPairs);

  function db(gain) {
    if (gain <= 0.001) return '-∞';
    const value = 20 * Math.log10(gain);
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}`;
  }

  function stripTitle(part) {
    if (part.hardware) return part.midiOutputName || 'Hardware';
    return part.pluginName || 'empty';
  }
</script>

<div class="mixer" data-testid="host-mixer">
  <div class="strips">
    {#each parts as part (part.partId)}
      <div class="strip" class:focused={part.partId === $hostState.rack.focusedPartId}
           class:disabled={!part.enabled}>
        <button type="button" class="strip-name" title={stripTitle(part)}
                onclick={() => focusRackPart(part.partId)}>{stripTitle(part)}</button>
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
        <input class="fader" type="range" min="0" max="2" step="0.01" value={part.volume}
               aria-label={`Volume — ${stripTitle(part)}`}
               ondblclick={() => setPartMixer(part.partId, { volume: 1 })}
               oninput={(e) => setPartMixer(part.partId, { volume: Number(e.currentTarget.value) })} />
        <span class="db">{db(part.volume)}</span>
        <div class="switches">
          <button type="button" class="toggle" class:on={part.mute} title="Mute"
                  onclick={() => setPartMixer(part.partId, { mute: !part.mute })}>M</button>
          <button type="button" class="toggle" class:on={part.solo} title="Solo"
                  onclick={() => setPartMixer(part.partId, { solo: !part.solo })}>S</button>
          <button type="button" class="toggle" class:on={part.enabled} title="Part enabled"
                  onclick={() => setPartMixer(part.partId, { enabled: !part.enabled })}>On</button>
        </div>
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

    {#each returns as chain (chain.returnId)}
      <div class="strip return">
        <span class="strip-name" title={`Return — ${chain.name}`}>{chain.name}</span>
        <span class="strip-kind">return{chain.effects.length ? ` · ${chain.effects.length} fx` : ''}</span>
        <input class="fader" type="range" min="0" max="2" step="0.01" value={chain.level}
               aria-label={`Return level — ${chain.name}`}
               ondblclick={() => setReturnLevel(chain.returnId, 1)}
               oninput={(e) => setReturnLevel(chain.returnId, Number(e.currentTarget.value))} />
        <span class="db">{db(chain.level)}</span>
      </div>
    {/each}

    <div class="strip master">
      <span class="strip-name">Master</span>
      <span class="strip-kind">{$hostState.rack.masterLatencyMs.toFixed(1)} ms</span>
      <input class="fader" type="range" min="0" max="2" step="0.01" value={$hostState.product.daw.masterLevel}
             aria-label="Master level"
             ondblclick={() => setMasterLevel(1)}
             oninput={(e) => setMasterLevel(Number(e.currentTarget.value))} />
      <span class="db">{db($hostState.product.daw.masterLevel)}</span>
      <span class="engine" class:hot={$hostState.audio.cpu > 0.8}>
        {Math.round($hostState.audio.cpu * 100)}% CPU{$hostState.audio.xruns > 0 ? ` · ${$hostState.audio.xruns} xruns` : ''}
      </span>
    </div>

    {#if parts.length === 0}
      <div class="empty-hint">Nothing to mix yet — add parts in the rack above.</div>
    {/if}
  </div>
</div>

<style>
  .mixer { background: #10161c; border: 1px solid #232c36; border-radius: 6px; padding: 10px; }
  .strips { display: flex; gap: 8px; overflow-x: auto; align-items: stretch; }
  .strip { display: flex; flex-direction: column; align-items: center; gap: 6px;
           background: #161e27; border: 1px solid #232c36; border-radius: 5px;
           padding: 8px 6px; min-width: 84px; }
  .strip.focused { border-color: #3d81c4; }
  .strip.disabled { opacity: 0.55; }
  .strip.return { background: #142020; }
  .strip.master { background: #1d1a14; border-color: #3a3223; }
  .strip-name { max-width: 78px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
                font-size: 11px; font-weight: 600; color: #d6dbe0; background: none; border: none;
                cursor: pointer; padding: 0; }
  span.strip-name { cursor: default; }
  .strip-kind { font-size: 10px; color: #66707b; }
  .pan input { width: 64px; }
  .sends { display: flex; flex-direction: column; gap: 2px; width: 100%; }
  .send { display: flex; align-items: center; gap: 3px; font-size: 9px; color: #7d8894; }
  .send input { flex: 1; min-width: 0; height: 10px; }
  /* The one vertical control in the app: a real fader. Chromium (which WebView2 is)
     renders a range vertically from writing-mode alone; rtl puts loud at the top. */
  .fader { writing-mode: vertical-lr; direction: rtl; width: 22px; height: 130px; margin: 2px 0; }
  .db { font-size: 10px; color: #9aa5b1; font-variant-numeric: tabular-nums; }
  .switches { display: flex; gap: 3px; }
  .switches .toggle { font-size: 10px; padding: 2px 6px; background: #1c2630; color: #9aa5b1;
                      border: 1px solid #2c3742; border-radius: 3px; cursor: pointer; }
  .switches .toggle.on { background: #2c6ca8; color: #fff; border-color: #2c6ca8; }
  .out { font-size: 10px; background: #1c2630; color: #d6dbe0; border: 1px solid #2c3742;
         border-radius: 3px; }
  .engine { font-size: 10px; color: #7d8894; }
  .engine.hot { color: #e0a056; }
  .empty-hint { color: #66707b; font-size: 12px; align-self: center; padding: 20px; }
</style>
