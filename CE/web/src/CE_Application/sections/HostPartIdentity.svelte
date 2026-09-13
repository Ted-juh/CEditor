<script>
  import PluginTile from './PluginTile.svelte';
  import { partColor } from '../stores/instrumentHost.js';
  import { hostPartTitle, hostPartNumber } from '../utils/hostTargetContext.js';
  let { part, index = -1, thumbnail = true, stacked = false } = $props();
</script>

<span class="part-identity" class:stacked class:no-thumbnail={!thumbnail}
  style={`--identity-color:${partColor(Math.max(0, index))}`} data-testid="host-part-identity">
  {#if thumbnail}
    <span class="identity-thumbnail"><PluginTile ceId={part?.pluginCeId || part?.deviceProfileId || ''}
      name={part?.pluginName || hostPartTitle(part)} vendor={part?.pluginVendor || ''} fill /></span>
  {/if}
  <span class="identity-text" title={`${hostPartNumber(index)} · ${hostPartTitle(part)}`}>
    <span class="identity-number">{hostPartNumber(index)}</span> · <span class="identity-name">{hostPartTitle(part)}</span>
  </span>
</span>

<style>
  .part-identity { display: inline-flex; align-items: center; gap: 7px; min-width: 0; max-width: 100%; vertical-align: middle; }
  .identity-thumbnail { position: relative; display: inline-block; width: 44px; height: 30px; flex: none; border-left: 3px solid var(--identity-color); border-radius: 3px; overflow: hidden; }
  .identity-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
  .identity-number { font-variant-numeric: tabular-nums; color: var(--host-text-soft); }
  .identity-name { font-weight: 600; }
  .no-thumbnail .identity-text { border-left: 3px solid var(--identity-color); padding-left: 7px; }
  .stacked { flex-direction: column; align-items: center; gap: 5px; width: 100%; }
  .stacked .identity-thumbnail { width: 64px; height: 40px; }
  .stacked .identity-text { max-width: 100%; }
</style>
