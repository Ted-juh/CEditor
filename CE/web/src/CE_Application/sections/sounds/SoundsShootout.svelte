<script>
  /**
   * Two to four sounds side by side: their envelopes drawn over each other, their measurements
   * in columns, and keys 1 to 4 to hear each one on the same phrase. Then load the one you want.
   */
  import { auditionRecord, measuredLabel } from '../../stores/instrumentHost.js';
  import { AXIS_LABELS, envelopeLine } from './soundsText.js';

  let { records = [], canLoad = false, onload = () => {}, onclose = () => {} } = $props();

  const COLOURS = ['#79b9ee', '#e6b04e', '#58a879', '#c98ae0'];
  const AXES = ['brightness', 'attack', 'tail', 'width'];
  const shown = $derived(records.slice(0, 4));
  let active = $state(-1);

  function play(index) {
    const record = shown[index];
    if (!record) return;
    active = index;
    if (record.available && !record.isEffect && record.type === 'preset') auditionRecord(record.recordId);
  }
  function key(event) {
    if (event.key === 'Escape') { event.preventDefault(); onclose(); return; }
    const n = Number(event.key);
    if (n >= 1 && n <= shown.length && !event.target.closest?.('input, textarea')) { event.preventDefault(); play(n - 1); }
  }
</script>

<svelte:window onkeydown={key} />

<div class="shootout" role="dialog" aria-label="Compare sounds" data-testid="sounds-shootout">
  <div class="head">
    <strong>Side by side · {shown.length} sounds on the same phrase</strong>
    <span class="hint">keys 1–{shown.length} play each one · Esc closes</span>
    <span class="spacer"></span>
    <button type="button" class="ghost" data-testid="shootout-close" onclick={onclose}>Close</button>
  </div>
  <svg class="env" viewBox="0 0 400 90" preserveAspectRatio="none" aria-label="The envelopes over each other" data-testid="shootout-envelopes">
    {#each shown as record, index (record.recordId)}
      {#if record.sonic}
        <path d={envelopeLine(record.sonic.envelope, 400, 90, 4)} style={`stroke:${COLOURS[index]}`}
              class:dim={active >= 0 && active !== index} />
      {/if}
    {/each}
  </svg>
  <div class="cards">
    {#each shown as record, index (record.recordId)}
      <div class="card" class:on={active === index} data-testid="shootout-card">
        <span class="name" style={`color:${COLOURS[index]}`}>{index + 1} · {record.name}</span>
        <span class="sub">{record.instrument || record.type}{record.category ? ` · ${record.category}` : ''}</span>
        {#if record.sonic && !record.sonic.silent}
          <div class="axes">
            {#each AXES as axis (axis)}
              <span>{AXIS_LABELS[axis]}</span>
              <span class="bar"><i style={`width:${record.sonic[axis] * 100}%;background:${COLOURS[index]}`}></i></span>
              <span class="v">{measuredLabel(axis, record.sonic[axis])}</span>
            {/each}
          </div>
        {:else}
          <span class="sub">Not measured yet.</span>
        {/if}
        <div class="actions">
          <button type="button" data-testid="shootout-play" onclick={() => play(index)}>▶ Play {index + 1}</button>
          <button type="button" data-testid="shootout-load" disabled={!canLoad || !record.available}
                  onclick={() => onload(record)}>Load this one</button>
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  .shootout { position: absolute; inset: 0; z-index: 6; display: flex; flex-direction: column; gap: 10px; padding: 14px;
              background: #0b0e11f2; overflow-y: auto; }
  .head { display: flex; align-items: center; gap: 10px; }
  .hint { color: var(--host-text-dim); font-size: 11px; }
  .spacer { flex: 1; }
  .env { width: 100%; height: 110px; flex: none; background: var(--host-bg-deep); border: 1px solid var(--host-line-soft); border-radius: 4px; }
  .env path { fill: none; stroke-width: 2; vector-effect: non-scaling-stroke; }
  .env path.dim { opacity: .35; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; }
  .card { display: flex; flex-direction: column; gap: 6px; padding: 10px; border: 1px solid var(--host-line-soft); border-radius: 6px; background: var(--host-surface); }
  .card.on { border-color: #ff9408; box-shadow: 0 0 0 1px #ff9408; }
  .name { font-weight: 700; font-size: 13px; }
  .sub { color: var(--host-text-dim); font-size: 11px; }
  .axes { display: grid; grid-template-columns: 70px 1fr 64px; gap: 4px 8px; align-items: center; font-size: 11px; color: var(--host-text-dim); }
  .bar { height: 6px; border-radius: 3px; background: var(--host-field); position: relative; }
  .bar i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 3px; }
  .v { text-align: right; font: 10.5px var(--host-font-mono, monospace); color: var(--host-text-soft); }
  .actions { display: flex; gap: 6px; flex-wrap: wrap; }
</style>
