<script>
  // The song-chain editor, shared by the Phrase Sequencer (chaining patterns)
  // and the Phrase Recorder (chaining takes). One component for the same reason
  // the engine is one file: a chain is a chain, and two copies would drift.
  //
  // The host passes `slotNames` — what the chain's slot numbers point at — and
  // gets back writes through `onchange`.
  import {
    normalizeChain, activeChain, chainLength, chainSummary,
    addLink, removeLink, updateLink, moveLink, MAX_CHAIN_STEPS, MAX_REPEATS,
  } from '../utils/songChain.js';
  import PropertyCell from './PropertyCell.svelte';
  import NumberCell from './NumberCell.svelte';

  let {
    chain = [],
    slotNames = [],
    enabled = false,
    loop = true,
    unit = 'pass',
    onchange = () => {},
    ontoggle = () => {},
    onloop = () => {},
  } = $props();

  let links = $derived(normalizeChain(chain));
  let live = $derived(activeChain(chain));
  let total = $derived(chainLength(chain));
  let summary = $derived(chainSummary(chain, slotNames));
  function clampInt(v, lo, hi, f) {
    const n = Math.round(Number(v));
    const x = Number.isFinite(n) ? n : f;
    return x < lo ? lo : x > hi ? hi : x;
  }
</script>

<PropertyCell label="Song mode" span={1} hint="Play a chain of stored slots instead of one. A link's repeat count is in passes of that slot.">
  <button type="button" class="btn" class:on={enabled} onclick={() => ontoggle(!enabled)}>{enabled ? 'On' : 'Off'}</button>
</PropertyCell>
<PropertyCell label="At the end" span={1} hint="Loop restarts from the first link. One-shot holds on the last link.">
  <button type="button" class="btn" onclick={() => onloop(!loop)}>{loop ? 'Loop' : 'Stop at the end'}</button>
</PropertyCell>
<PropertyCell label="" span={2} hint="">
  <div class="note">{summary}{total ? ` · ${total} ${unit}${total === 1 ? '' : 'es'}` : ''}</div>
</PropertyCell>

{#each links as link, i (link.id)}
  <PropertyCell label="" span={4} hint="">
    <div class="link" class:off={!link.enabled}>
      <span class="idx">{i + 1}</span>
      <select class="val" value={String(link.slot)} onchange={(e) => onchange(updateLink(chain, i, { slot: Number(e.target.value) }))}>
        {#each Array.from({ length: Math.max(1, slotNames.length) }, (_, k) => k) as k (k)}
          <option value={String(k)}>{slotNames[k] ?? `Slot ${k + 1}`}</option>
        {/each}
      </select>
      <label class="lbl">×<span class="tiny nc-wrap"><NumberCell min={1} max={MAX_REPEATS} value={link.repeats}
        onchange={(v) => onchange(updateLink(chain, i, { repeats: clampInt(v, 1, MAX_REPEATS, 1) }))} /></span></label>
      <button type="button" class="mini" title="Move up" onclick={() => onchange(moveLink(chain, i, -1))} disabled={i === 0}>↑</button>
      <button type="button" class="mini" title="Move down" onclick={() => onchange(moveLink(chain, i, 1))} disabled={i === links.length - 1}>↓</button>
      <button type="button" class="mini" title={link.enabled ? 'Skip this link' : 'Play this link'} onclick={() => onchange(updateLink(chain, i, { enabled: !link.enabled }))}>{link.enabled ? '●' : '○'}</button>
      <button type="button" class="mini danger" title="Remove" onclick={() => onchange(removeLink(chain, i))}>×</button>
    </div>
  </PropertyCell>
{/each}

<PropertyCell label="" span={4} hint="A disabled link is skipped, not played for zero passes.">
  <div class="row">
    <button type="button" class="btn" disabled={links.length >= MAX_CHAIN_STEPS} onclick={() => onchange(addLink(chain, 0, 1))}>Add link</button>
    {#if links.length !== live.length}<span class="hintline">{links.length - live.length} skipped</span>{/if}
  </div>
</PropertyCell>

<style>
  .val { width: 100%; background: #141420; border: 1px solid #2a2a36; color: #E8E8EE; font-size: 12px; padding: 3px 6px; border-radius: 4px; }
  .tiny { width: 44px; }
  .nc-wrap { display: flex; }
  .note { font-size: 11px; color: #9a9aa4; background: #141420; border: 1px solid #2a2a36; border-radius: 5px; padding: 5px 7px; line-height: 1.5; }
  .link { display: flex; align-items: center; gap: 4px; }
  .link.off { opacity: 0.5; }
  .idx { font-size: 10.5px; color: #7a7a84; width: 14px; text-align: right; }
  .lbl { display: flex; align-items: center; gap: 3px; font-size: 10.5px; color: #9a9aa4; }
  .row { display: flex; align-items: center; gap: 6px; }
  .hintline { font-size: 10.5px; color: #7a7a84; }
  .btn { background: #1A1A1A; border: 1px solid #333; color: #C8C8CE; font-size: 11px; padding: 4px 10px; border-radius: 4px; cursor: pointer; }
  .btn:hover:not(:disabled) { border-color: #4a4a58; color: #E8E8EE; }
  .btn:disabled { opacity: 0.4; cursor: default; }
  .btn.on { border-color: #56CCF2; color: #E8E8EE; }
  .mini { background: #1A1A1A; border: 1px solid #333; color: #C8C8CE; font-size: 11px; line-height: 1; padding: 3px 6px; border-radius: 3px; cursor: pointer; }
  .mini:hover:not(:disabled) { border-color: #4a4a58; }
  .mini:disabled { opacity: 0.35; cursor: default; }
  .mini.danger:hover { border-color: #EB5757; color: #EB5757; }
</style>
