<script>
  import { meterPercent, meterDbText } from '../utils/mixerMeters.js';
  import { resetHostMeterPeaks } from '../stores/hostMeters.js';
  let { id, label, reading } = $props();
  let levels = $derived(reading?.levels ?? [-Infinity, -Infinity]);
  let holds = $derived(reading?.holds ?? [-Infinity, -Infinity]);
</script>

<div class="stereo-meter" data-testid="stereo-meter" data-meter-id={id}>
  <button type="button" class="over" class:lit={reading?.over} disabled={!reading}
    aria-pressed={reading?.over ?? false} aria-label={`Clear overload — ${label}`}
    title={reading?.over ? 'Peak reached 0 dBFS. Click to clear.' : 'Clear this channel’s peak and overload memory.'}
    onclick={() => resetHostMeterPeaks(id)}>OVER</button>
  <div class="meter-bars" role="img" aria-label={reading
    ? `${label}: left ${meterDbText(levels[0])}, right ${meterDbText(levels[1])} dBFS`
    : `${label}: no audio meter data`}>
    {#each levels as level, i}
      <div class="meter-track">
        <span class="meter-fill" class:near={level > -6} class:over-range={level >= 0}
          style={`height:${meterPercent(level)}%`}></span>
        {#if holds[i] >= -60}<span class="peak-hold" style={`bottom:${Math.min(99, meterPercent(holds[i]))}%`}></span>{/if}
      </div>
    {/each}
  </div>
  <div class="meter-scale" aria-hidden="true"><span>0</span><span>−12</span><span>−24</span><span>−36</span><span>−48</span><span>−60</span></div>
</div>

<style>
  .stereo-meter { position: relative; display: flex; gap: 7px; height: var(--mixer-meter-height, 180px); flex: none; }
  .meter-bars { display: flex; gap: 3px; height: 100%; }
  .meter-track { position: relative; width: 9px; height: 100%; overflow: hidden; background: var(--host-bg-deep); }
  .meter-fill { position: absolute; bottom: 0; width: 100%; background: #4aa88c; }
  .meter-fill.near { background: #dda549; }
  .meter-fill.over-range { background: var(--host-danger); }
  .peak-hold { position: absolute; height: 2px; width: 100%; background: var(--host-text); }
  .meter-scale { display: flex; flex-direction: column; justify-content: space-between; width: 22px; text-align: right; font-size: 10px; line-height: 1; color: var(--host-text-soft); }
  /* Beat the theme's three :not() exclusions so the compact lamp clears the 0 dB tick. */
  :global(.host-workspace.host-workspace) .stereo-meter button.over.over { position: absolute; top: -24px; left: -3px; padding: 1px 3px; min-height: 18px; height: 18px; font-size: 10px; line-height: 1.3; border: 1px solid var(--host-line-soft); color: var(--host-text-soft); background: var(--host-surface); border-radius: 2px; }
  :global(.host-workspace.host-workspace) .stereo-meter button.over.over.lit { color: var(--host-danger); border-color: var(--host-danger); background: var(--host-surface-raised); }
</style>
