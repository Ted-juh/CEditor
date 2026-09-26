<script>
  /**
   * Chance, Length and Latch: three small modules, one picture each of what they do to a bar
   * of notes, and the options that make them musical rather than random. `kind` picks which.
   * The pictures come from noteModuleViews.js, which follows ChanceEngine, NoteLengthEngine and
   * LatchEngine.
   */
  import ScrubValue from './ScrubValue.svelte';
  import Segmented from './Segmented.svelte';
  import PropertyToggle from '../../properties/PropertyToggle.svelte';
  import { chanceBar, lengthOut } from '../../utils/noteModuleViews.js';

  let { kind, mod, set, beatChoices = [] } = $props();

  // --- chance
  let seed = $state(3);
  const bar = $derived(chanceBar(mod, seed));
  const kept = $derived(bar.filter((n) => n.plays).length);

  // --- length
  const PLAYED = [{ at: 0, length: 0.2 }, { at: 0.5, length: 0.9 }, { at: 1.5, length: 0.35 }, { at: 2, length: 1.6 }, { at: 3.75, length: 0.15 }];
  const lengthModeOf = (m) => (m.legato ? 'legato' : !(m.lengthBeats > 0) ? 'played' : m.lengthMode);
  const LENGTH_MODES = [
    { value: 'played', label: 'as played' },
    { value: 'fixed', label: 'fixed', title: 'Every note exactly this long' },
    { value: 'at most', label: 'at most', title: 'Notes held longer are cut; shorter ones are left alone' },
    { value: 'at least', label: 'at least', title: 'Short taps ring on to this length; longer notes end as played' },
    { value: 'legato', label: 'legato', title: 'Each note holds until the next one' },
  ];
  function pickLength(value) {
    if (value === 'played') set({ legato: false, lengthBeats: 0 });
    else if (value === 'legato') set({ legato: true });
    else set({ legato: false, lengthMode: value, lengthBeats: mod.lengthBeats > 0 ? mod.lengthBeats : 0.25 });
  }
  const sent = $derived(lengthOut(mod, PLAYED));
  const LX = (b) => 64 + b * 110;

  // --- latch
  const LATCH_MODES = [
    { value: 'replace', label: 'replaces', title: 'A new phrase replaces what is held' },
    { value: 'add', label: 'adds', title: 'New notes join what is held' },
    { value: 'toggle', label: 'toggles notes', title: 'A held note played again lets go of it; others join' },
  ];
  const WHITE = [0, 2, 4, 5, 7, 9, 11];
  const latchHeld = $derived(mod.latchMode === 'add' ? [60, 64, 67, 62, 65]
    : mod.latchMode === 'toggle' ? [60, 67, 62, 65] : [62, 65]);
  const latchText = $derived(mod.latchMode === 'add' ? 'Held C–E–G, then played D–F: all five ring.'
    : mod.latchMode === 'toggle' ? 'Held C–E–G, then played E and D–F: E stops, D–F join.'
    : 'Held C–E–G, then played D–F: D–F replace them.');
</script>

{#if kind === 'chance'}
  <div class="editor" data-testid="chance-editor">
    <svg class="picture" viewBox="0 0 560 110" role="img" data-testid="chance-picture" aria-label="Which notes of a bar play">
      {#each bar as n (n.step)}
        {@const h = (n.velocity / 127) * 70}
        <rect x={16 + n.step * 33} y={84 - h} width="22" height={h} rx="2" class="note" class:dropped={!n.plays} />
        {#if n.onBeat}<rect x={16 + n.step * 33} y="90" width="22" height="4" class="beat" class:kept={mod.chanceKeepDownbeats} />{/if}
      {/each}
      <text x="16" y="106" class="axis">{kept} of 16 play this bar · outlined: dropped</text>
    </svg>
    <div class="row">
      <div class="mf"><span class="lbl">Plays</span>
        <ScrubValue value={Math.round(mod.chance * 100)} min={0} max={100} step={5} unit="%" label="Chance a note plays"
                    testid="chance-amount" onchange={(v) => set({ chance: v / 100 })} />
      </div>
      <div class="mf"><span class="lbl">Keep</span>
        <div class="toggles">
          <PropertyToggle compact label="Notes on the beat" value={mod.chanceKeepDownbeats}
                          title="A note on a whole beat always plays, so the pulse survives"
                          onchange={(on) => set({ chanceKeepDownbeats: on })} />
          <PropertyToggle compact label="Soft notes drop first" value={mod.chanceSoftFirst}
                          title="Loud notes get through more often than soft ones"
                          onchange={(on) => set({ chanceSoftFirst: on })} />
        </div>
      </div>
      <button type="button" class="ctl pill" data-testid="chance-roll" onclick={() => (seed = (seed * 7 + 11) % 997 + 1)}>↻ another bar</button>
    </div>
  </div>
{:else if kind === 'length'}
  <div class="editor" data-testid="length-editor">
    <svg class="picture" viewBox="0 0 560 96" role="img" data-testid="length-picture" aria-label="Note lengths as played and as sent">
      <text x="8" y="30" class="axis">played</text>
      <text x="8" y="70" class="axis">sent</text>
      {#each PLAYED as n, i (i)}
        <rect x={LX(n.at)} y="20" width={Math.max(3, n.length * 110 - 3)} height="12" rx="2" class="played" />
        <rect x={LX(n.at)} y="60" width={Math.max(3, Math.min(560 - LX(n.at), sent[i] * 110) - 3)} height="12" rx="2" class="note" />
      {/each}
      {#if mod.lengthBeats > 0 && !mod.legato}
        {#each PLAYED as n, i (i)}<line x1={LX(n.at + mod.lengthBeats)} x2={LX(n.at + mod.lengthBeats)} y1="54" y2="78" class="mark" />{/each}
      {/if}
    </svg>
    <div class="row">
      <div class="mf"><span class="lbl">Length</span>
        <Segmented options={LENGTH_MODES} value={lengthModeOf(mod)} label="Length mode" testid="length-mode" onchange={pickLength} />
      </div>
      {#if lengthModeOf(mod) !== 'played' && lengthModeOf(mod) !== 'legato'}
        <div class="mf"><span class="lbl">{mod.lengthMode === 'at most' ? 'Longest' : mod.lengthMode === 'at least' ? 'Shortest' : 'Each note'}</span>
          <ScrubValue value={mod.lengthBeats} choices={beatChoices} label="Note length" testid="length-value"
                      onchange={(v) => set({ lengthBeats: v })} />
        </div>
      {/if}
    </div>
  </div>
{:else if kind === 'latch'}
  <div class="editor" data-testid="latch-editor">
    <svg class="picture" viewBox="0 0 560 100" role="img" data-testid="latch-picture" aria-label="Which notes are held">
      {#each Array.from({ length: 14 }, (_, k) => 60 + WHITE[k % 7] + Math.floor(k / 7) * 12) as n, k (n)}
        <rect x={12 + k * 38} y="8" width="36" height="66" rx="3" class="key" class:held={mod.latchOn && latchHeld.includes(n)} />
      {/each}
      <text x="12" y="92" class="axis">{mod.latchOn ? latchText : 'Off: notes stop when you let go.'}</text>
    </svg>
    <div class="row">
      <div class="mf"><span class="lbl">Latch</span>
        <PropertyToggle compact label="Keep notes sounding" value={mod.latchOn} ariaLabel="Latch held notes"
                        onchange={(on) => set({ latchOn: on })} />
      </div>
      <div class="mf"><span class="lbl">A new phrase</span>
        <Segmented options={LATCH_MODES} value={mod.latchMode} label="Latch mode" testid="latch-mode" onchange={(v) => set({ latchMode: v })} />
      </div>
      <div class="mf"><span class="lbl">Let go</span>
        <PropertyToggle compact label="With the sustain pedal" value={mod.latchPedalRelease}
                        title="The pedal releases everything held (and no longer sustains)"
                        onchange={(on) => set({ latchPedalRelease: on })} />
      </div>
    </div>
  </div>
{/if}

<style>
  .editor { display: flex; flex-direction: column; gap: 10px; width: 100%; }
  .picture { width: 100%; max-width: 640px; background: var(--host-field, #12171b); border: 1px solid var(--host-line-soft, #2c353e); border-radius: 5px; }
  .note { fill: var(--host-accent, #5b9bd5); }
  .note.dropped { fill: none; stroke: var(--host-line-strong, #526170); stroke-dasharray: 2 2; }
  .beat { fill: var(--host-line, #3b4652); }
  .beat.kept { fill: var(--host-active, #58a879); }
  .played { fill: var(--host-line-strong, #526170); }
  .mark { stroke: #d7a44e; stroke-dasharray: 2 2; }
  .key { fill: #d8dde2; stroke: #0e1216; }
  .key.held { fill: var(--host-accent, #5b9bd5); }
  .axis { font: 10px var(--host-font-mono, monospace); fill: var(--host-text-dim, #7f8b96); }
  .row { display: flex; gap: 14px; flex-wrap: wrap; align-items: flex-end; }
  .mf { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
  .toggles { display: flex; gap: 6px; flex-wrap: wrap; }
  .lbl { font: 600 10px var(--host-font-mono, monospace); letter-spacing: .08em; text-transform: uppercase; color: var(--host-text-dim, #7f8b96); }
  .pill { font: 500 12px var(--host-font, sans-serif); color: var(--host-text-soft, #aab5be); cursor: pointer;
          background: var(--host-surface-raised, #20272e); border: 1px solid var(--host-line, #3b4652); border-radius: 12px; padding: 3px 10px; }
</style>
