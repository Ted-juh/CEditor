<script>
  // The "sync to transport" row, shared by every component that can follow the
  // clock (Arp, Looper, Turing, Kinetic, Constellation). One copy so the toggle,
  // the wording and — the part that actually matters — the no-Transport warning
  // stay identical everywhere. Renders bare PropertyCells, no wrapper element,
  // so it drops straight into a PropertySection's grid.
  import { activePanel } from '../stores/panels.js';
  import PropertyCell from './PropertyCell.svelte';
  import PropertyToggle from './PropertyToggle.svelte';

  let {
    synced = false,
    onchange = null,
    span = 2,
    hint = '',
    children = null,
  } = $props();

  // Syncing to a transport the panel doesn't have leaves the component parked,
  // which reads as a bug rather than a missing part. Say so instead.
  let hasTransport = $derived(
    ($activePanel?.controls ?? []).some((c) => String(c?._children?.Core?.controlType ?? '') === 'Transport')
  );
</script>

<PropertyCell label="Sync to transport" {span} hint={hint || "Follow the panel's Transport instead of a free-running rate."}>
  <PropertyToggle value={synced} onchange={(v) => onchange?.(v === true)} />
</PropertyCell>
{#if synced}
  {@render children?.()}
  {#if !hasTransport}
    <PropertyCell label="" span={4} hint="">
      <div class="sync-warn">This panel has no Transport, so there is no clock to follow. Add one from the palette.</div>
    </PropertyCell>
  {/if}
{/if}

<style>
  .sync-warn {
    font-size: 11px;
    color: #F2C94C;
    background: #241f10;
    border: 1px solid #4a3f18;
    border-radius: 5px;
    padding: 6px 8px;
    line-height: 1.5;
  }
</style>
