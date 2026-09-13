<script>
  import PluginTile from './PluginTile.svelte';
  import { partColor } from '../stores/instrumentHost.js';
  import { hostPartLabel, hostPartTitle } from '../utils/hostTargetContext.js';
  let { parts = [], partId = '', label = 'Part', ariaLabel = 'Target rack part', onchange } = $props();
  let index = $derived(parts.findIndex(part => part.partId === partId));
  let part = $derived(parts[index] ?? null);
</script>

<label class="part-picker" style={`--identity-color:${partColor(Math.max(0, index))}`}>
  <span class="picker-label">{label}</span>
  <span class="picker-control">
    {#if part}<span class="picker-thumbnail"><PluginTile ceId={part.pluginCeId || part.deviceProfileId || ''}
      name={part.pluginName || hostPartTitle(part)} vendor={part.pluginVendor || ''} fill /></span>{/if}
    <select aria-label={ariaLabel} value={partId} onchange={(event) => onchange?.(event.currentTarget.value)}>
      {#if !part}<option value="">Select a part</option>{/if}
      {#each parts as candidate, i (candidate.partId)}<option value={candidate.partId}>{hostPartLabel(candidate, i)}</option>{/each}
    </select>
  </span>
</label>

<style>
  .part-picker { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; min-width: 0; max-width: 100%; }
  .picker-label { font-size: 10px; color: var(--host-text-soft); letter-spacing: .07em; }
  .picker-control { display: flex; gap: 6px; align-items: center; min-width: 0; max-width: 100%; }
  .picker-thumbnail { position: relative; display: inline-block; width: 40px; height: 28px; flex: none; border-left: 3px solid var(--identity-color); border-radius: 3px; overflow: hidden; }
  .picker-control select { min-width: 0; max-width: 240px; width: 100%; }
</style>
