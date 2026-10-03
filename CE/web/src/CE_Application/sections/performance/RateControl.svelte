<script>
  /**
   * How fast a modulator runs: free, in Hz, or locked to the beat. The toggle and the value sit
   * side by side, and the value is the kind the toggle says: Hz step by ratio (0.05 Hz and 30 Hz
   * both get fine steps), a synced rate steps through note lengths.
   */
  import Segmented from '../../components/controls/Segmented.svelte';
  import ScrubValue from '../../components/controls/ScrubValue.svelte';
  import { SYNC_RATES, formatHz, stepRateHz } from '../../utils/modulatorShapes.js';

  let { sync = false, rateHz = 1, syncBeats = 1, label = 'Rate', onchange = () => {}, testid = 'rate' } = $props();
  const SYNC_CHOICES = SYNC_RATES.map((rate) => [rate.beats, rate.label]);
</script>

<div class="rate">
  <span class="lbl">{label}</span>
  <div class="row">
    <Segmented options={[{ value: false, label: 'Hz', title: 'Free running, in Hz' },
                         { value: true, label: 'Beat', title: 'Locked to the tempo' }]}
               value={sync} label={`${label}: free or synced`} testid={`${testid}-sync`}
               onchange={(v) => onchange({ sync: v })} />
    {#if sync}
      <ScrubValue value={syncBeats} choices={SYNC_CHOICES} label={`${label} (note length)`} testid={`${testid}-beats`}
                  pixelsPerStep={10} onchange={(v) => onchange({ syncBeats: v })} />
    {:else}
      <ScrubValue value={rateHz} min={0.01} max={40} stepper={stepRateHz} format={formatHz} unit="Hz"
                  label={`${label} in Hz`} testid={`${testid}-hz`} onchange={(v) => onchange({ rateHz: v })} />
    {/if}
  </div>
</div>

<style>
  .rate { display: flex; flex-direction: column; gap: 4px; }
  .row { display: flex; gap: 6px; align-items: center; }
  .lbl { font: 600 10px var(--host-font-mono, monospace); letter-spacing: .08em; text-transform: uppercase; color: #8d969e; }
</style>
