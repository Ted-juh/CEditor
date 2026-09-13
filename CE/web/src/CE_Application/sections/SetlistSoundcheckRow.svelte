<script>
  import CircleHelp from 'lucide-svelte/icons/circle-help';
  import CircleCheck from 'lucide-svelte/icons/circle-check';
  import TriangleAlert from 'lucide-svelte/icons/triangle-alert';
  import Plug from 'lucide-svelte/icons/plug';
  import Info from 'lucide-svelte/icons/info';
  import { soundcheckDb, soundcheckReferenceStatus } from '../utils/setlistSoundcheck.js';

  let { item, soundcheck, onMeasure, onStop } = $props();
  let expanded = $state(false);
  let entry = $derived(soundcheck.entries.find(row => row.itemId === item.itemId));
  let status = $derived(soundcheckReferenceStatus(entry));
  let active = $derived(soundcheck.activeItemId === item.itemId);
  let current = $derived(soundcheck.currentItemId === item.itemId);
  let blocked = $derived(!current ? 'Select this song before measuring.'
    : soundcheck.blockedReason || (soundcheck.activeItemId && !active ? 'Stop the current measurement first.' : ''));
  const when = value => value ? new Date(value).toLocaleString() : '—';
</script>

<div class="soundcheck-row" class:active data-testid={`soundcheck-${item.itemId}`}>
  <button type="button" class={`status ${status.kind}`} aria-label={`${item.name}: ${status.label}`}
    title={`${status.label}${entry?.checkedAt ? ` · ${when(entry.checkedAt)}` : ''}`}
    aria-expanded={expanded} onclick={() => expanded = !expanded}>
    {#if status.kind === 'warning'}<TriangleAlert size={15}/>
    {:else if status.kind === 'checked'}<CircleCheck size={15}/>
    {:else}<CircleHelp size={15}/>{/if}
  </button>
  <span class="loaded" class:present={current && !soundcheck.blockedReason}
    title={current && !soundcheck.blockedReason ? 'Current rig processors loaded; audibility is checked by playing.' : 'Rig loading has not been verified for this song.'}
    aria-label={current && !soundcheck.blockedReason ? 'Current rig loaded' : 'Load unverified'}><Plug size={14}/></span>
  <span class="reading" title="Main output 1/2 peak, after the master fader (dBFS)">Peak
    <b class:clip={entry?.measured && entry.peak >= 1} data-testid="soundcheck-peak">{soundcheckDb(entry?.peak, entry?.measured)}</b>
  </span>
  <span class="reading" title="Main output 1/2 RMS average, including silence (dBFS; not LUFS)">Avg
    <b data-testid="soundcheck-average">{soundcheckDb(entry?.rms, entry?.measured)}</b>
  </span>
  <span class="duration">{entry?.seconds > 0 ? `${entry.seconds.toFixed(1)}s` : '—'}</span>
  <button type="button" class="measure" disabled={!active && !!blocked}
    title={active ? 'Finish this passage' : blocked || 'Play a comparable passage; stops after 2 minutes.'}
    onclick={() => active ? onStop() : onMeasure(item.itemId)}>{active ? 'Stop' : 'Measure'}</button>
  <button type="button" class="details" class:warning={!!entry?.error} title={entry?.error || 'Soundcheck details'}
    aria-label={`Soundcheck details for ${item.name}`} aria-expanded={expanded} onclick={() => expanded = !expanded}>
    {#if entry?.error}<TriangleAlert size={14}/>{:else}<Info size={14}/>{/if}
  </button>
</div>
{#if expanded}
  <div class="soundcheck-details" data-testid="soundcheck-details">
    <div>Rig: {entry?.basis || '—'} · Checked: {when(entry?.checkedAt)}</div>
    {#each entry?.issues ?? [] as issue}<div class="warning">{issue}</div>{/each}
    {#if entry?.error}<div class="warning">{entry.error}</div>{/if}
    <div>Measured: {active ? 'Recording passage…' : when(entry?.measuredAt)} · Main output 1/2 · Peak / RMS average in dBFS.</div>
    <div>Checks and readings are session snapshots. Recheck after rig changes; adjust in Mixer and remeasure using a comparable passage.</div>
  </div>
{/if}

<style>
  .soundcheck-row { display:flex; align-items:center; gap:12px; flex-wrap:wrap; padding:5px 10px 7px 44px; color:var(--host-text-soft); font-size:11px; }
  button { display:inline-flex; align-items:center; justify-content:center; border:1px solid var(--host-line); background:var(--host-surface-alt, #202930); color:var(--host-text); border-radius:4px; min-height:26px; cursor:pointer; }
  button:focus-visible { outline:2px solid var(--host-accent, #e88c28); outline-offset:2px; }
  button:disabled { opacity:.4; cursor:default; }
  :global(.host-workspace.host-workspace) .soundcheck-row button.status,
  :global(.host-workspace.host-workspace) .soundcheck-row button.details { width:26px; min-height:26px; padding:0; flex:none; }
  .soundcheck-row :global(svg) { flex:none; }
  :global(.host-workspace.host-workspace) .soundcheck-row button.unchecked { color:var(--host-text-soft); }
  :global(.host-workspace.host-workspace) .soundcheck-row button.checked,.present { color:#86bdaa; }
  :global(.host-workspace.host-workspace) .soundcheck-row button.warning { color:#e9b269; }
  .warning,.clip { color:#e9b269; }
  .loaded { display:inline-flex; opacity:.3; }
  .loaded.present { opacity:1; }
  .reading { display:flex; align-items:center; gap:8px; }
  .reading b { min-width:40px; text-align:right; font-variant-numeric:tabular-nums; font-weight:500; color:var(--host-text); }
  .reading b.clip { color:#f39480; }
  .duration { min-width:40px; font-variant-numeric:tabular-nums; text-align:right; }
  .measure { min-width:70px; font-size:11px; }
  :global(.host-workspace.host-workspace) .soundcheck-row.active button.measure { border-color:var(--host-accent, #e88c28); color:var(--host-accent, #e88c28); }
  .soundcheck-details { font-size:11px; line-height:1.7; color:var(--host-text-soft); padding:4px 12px 10px 44px; overflow-wrap:anywhere; }
  @media(max-width:700px) { .soundcheck-row { padding-left:10px; gap:8px; } .soundcheck-details { padding-left:10px; } }
</style>
