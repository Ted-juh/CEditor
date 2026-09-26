<script module>
  // A/B memory, per slot, for the life of the page: the other version of each module you are
  // comparing. Not saved: a comparison is a moment, a preset is what you keep.
  const abMemory = new Map();
</script>

<script>
  /**
   * The strip above every MIDI module: its presets (saved by name, per module type, for every
   * rack), an A/B switch to compare two versions while playing, and for Strum, Humanize, Echo and
   * Chance an Amount that scales the effect, which a control-page knob can ride.
   */
  import ScrubValue from './ScrubValue.svelte';
  import Segmented from './Segmented.svelte';
  import HostConfirmButton from '../HostConfirmButton.svelte';

  let { slot, presets = [], set, onsave = () => {}, onremove = () => {} } = $props();

  const NOTE_MODULES = ['echo', 'strum', 'humanize', 'chance', 'length', 'latch', 'mpe', 'articulation'];
  const AMOUNT = ['strum', 'humanize', 'echo', 'chance'];
  const blockOf = (s) => (s.type === 'arp' ? s.arp : NOTE_MODULES.includes(s.type) ? s.mod : s.fx);
  const copy = (value) => JSON.parse(JSON.stringify(value));

  let side = $state('A');
  $effect(() => { side = (abMemory.get(slot.slotId) ?? { active: 'A' }).active; });

  function flip(to) {
    if (to === side) return;
    const memory = abMemory.get(slot.slotId) ?? { active: 'A', other: null };
    const current = copy(blockOf(slot));
    // The first time, B starts as a copy of A: nothing changes until you change it.
    if (memory.other) set(memory.other);
    abMemory.set(slot.slotId, { active: to, other: current });
    side = to;
  }

  let naming = $state(null);
  function save() {
    const name = (naming ?? '').trim();
    if (!name) return;
    onsave(name, copy(blockOf(slot)));
    naming = null;
  }
  const focusSelect = (node) => { node.focus(); node.select(); };
</script>

<div class="bar" data-testid="module-bar">
  <div class="presets" role="group" aria-label="Presets">
    {#each presets as p (p.name)}
      <span class="preset">
        <button type="button" class="ctl chip" data-name={p.name} title={`Load “${p.name}”`}
                onclick={() => set(copy(p.settings))}>{p.name}</button>
        <HostConfirmButton title={`Remove the preset “${p.name}”`} identity={JSON.stringify([slot.type, p.name])}
                           type="button" class="ctl x" onclick={() => onremove(p.name)}>×</HostConfirmButton>
      </span>
    {/each}
    {#if naming !== null}
      <input type="text" aria-label="Preset name" placeholder="Preset name" bind:value={naming} use:focusSelect
             onkeydown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') naming = null; }}
             onblur={() => { if (!(naming ?? '').trim()) naming = null; }} />
      <button type="button" class="ctl chip" onclick={save} disabled={!(naming ?? '').trim()}>Save</button>
    {:else}
      <button type="button" class="ctl chip add" data-testid="module-save" onclick={() => (naming = '')}>+ save preset</button>
    {/if}
  </div>
  <span class="grow"></span>
  <Segmented options={[{ value: 'A', label: 'A', title: 'Version A' }, { value: 'B', label: 'B', title: 'Version B: starts as a copy of A' }]}
             value={side} label="Compare A and B" testid="module-ab" onchange={flip} />
  {#if AMOUNT.includes(slot.type)}
    <span class="amount">
      <span class="lbl">Amount</span>
      <ScrubValue value={Math.round(slot.amount * 100)} min={0} max={100} step={5} unit="%" label="Module amount"
                  testid="module-amount" title="How much of its effect this module applies. A control-page knob can ride it."
                  onchange={(v) => set({ amount: v / 100 })} />
    </span>
  {/if}
</div>

<style>
  .bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; width: 100%; padding-bottom: 6px;
         border-bottom: 1px solid var(--host-line-soft, #2c353e); }
  .presets { display: flex; gap: 5px; flex-wrap: wrap; align-items: center; }
  .preset { display: inline-flex; align-items: center; }
  .grow { flex: 1; }
  .chip { font: 500 11px var(--host-font, sans-serif); color: var(--host-text-soft, #aab5be); cursor: pointer;
          background: var(--host-surface-raised, #20272e); border: 1px solid var(--host-line, #3b4652); border-radius: 12px; padding: 2px 9px; }
  .chip:hover { border-color: var(--host-accent, #5b9bd5); }
  .chip.add { border-style: dashed; }
  .chip:disabled { opacity: .45; cursor: default; }
  :global(.preset .x.ctl) { background: none; border: 0; color: var(--host-text-dim, #7f8b96); cursor: pointer; padding: 0 3px; font-size: 12px; }
  input { font: 12px var(--host-font, sans-serif); color: var(--host-text, #d9e0e6); background: var(--host-bg-deep, #101418);
          border: 1px solid var(--host-line, #3b4652); border-radius: 3px; padding: 3px 7px; width: 150px; }
  .amount { display: inline-flex; align-items: center; gap: 6px; }
  .lbl { font: 600 10px var(--host-font-mono, monospace); letter-spacing: .08em; text-transform: uppercase; color: var(--host-text-dim, #7f8b96); }
</style>
