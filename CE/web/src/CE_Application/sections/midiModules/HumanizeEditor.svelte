<script>
  /**
   * Humanize, drawn. A bar of sixteenth notes against the grid: how late each one lands and how
   * hard it plays, computed with the engine's rules (late only; protected beats stay put). Pick a
   * named feel to set all the amounts at once, or set them one by one.
   */
  import ScrubValue from './ScrubValue.svelte';
  import Segmented from './Segmented.svelte';
  import PropertyToggle from '../../properties/PropertyToggle.svelte';
  import { HUMANIZE_FEELS, humanizeFeelOf, humanizeExample, beatsToMs } from '../../utils/noteModuleViews.js';

  let { mod, set, tempo = 120 } = $props();

  let seed = $state(7);
  const amounts = $derived({ timing: mod.humanizeTimingBeats, velocity: mod.humanizeVelocity, gate: mod.humanizeGatePercent });
  const feel = $derived(humanizeFeelOf(amounts));
  const bar = $derived(humanizeExample({ ...amounts, protectBeats: mod.humanizeProtectBeats }, seed));

  const W = 560, H = 132, LEFT = 10, BOTTOM = 112;
  const stepW = (W - LEFT * 2) / 16;
  // A sixteenth is a quarter of a beat; draw the lateness on that scale.
  const lateX = (beats) => (beats / 0.25) * stepW;

  function pickFeel(id) {
    const f = HUMANIZE_FEELS.find((x) => x.id === id);
    if (f) set({ humanizeTimingBeats: f.timing, humanizeVelocity: f.velocity, humanizeGatePercent: f.gate });
  }
</script>

<div class="editor" data-testid="humanize-editor">
  <div class="top">
    <div class="mf"><span class="lbl">Feel</span>
      <Segmented options={HUMANIZE_FEELS.map((f) => ({ value: f.id, label: f.label,
                    title: `timing ${beatsToMs(f.timing, tempo)} ms · velocity ±${f.velocity} · length ±${f.gate}%` }))}
                 value={feel} label="Feel" testid="humanize-feel" onchange={pickFeel} />
      <span class="sub">{feel ? 'a named feel — fine-tune below' : 'your own amounts'}</span>
    </div>
    <button type="button" class="again" onclick={() => (seed = (seed * 48271) % 2147483647)}
            title="Show another bar with the same amounts">↻ another bar</button>
  </div>

  <svg class="picture" viewBox={`0 0 ${W} ${H}`} role="img" data-testid="humanize-picture"
       aria-label="Sixteen notes, each landing a little late and played a little harder or softer">
    {#each Array(17) as _, i (i)}
      <line x1={LEFT + i * stepW} x2={LEFT + i * stepW} y1="6" y2={BOTTOM} class="grid" class:beat={i % 4 === 0} />
    {/each}
    {#each bar as n (n.step)}
      {@const gx = LEFT + n.step * stepW}
      {@const nx = gx + lateX(n.lateBeats)}
      {@const h = (BOTTOM - 10) * n.velocity / 127}
      {#if n.lateBeats > 0}<line x1={gx} x2={nx} y1={BOTTOM + 5} y2={BOTTOM + 5} class="late" />{/if}
      <rect x={nx - 3} y={BOTTOM - h} width="6" height={h} rx="2" class="stem" />
      <circle cx={nx} cy={BOTTOM - h} r="3.5" class="head" />
      {#if mod.humanizeProtectBeats && n.step % 4 === 0}<rect x={gx - 4} y={BOTTOM + 2} width="8" height="6" class="anchor" />{/if}
    {/each}
    <text x={LEFT} y={H - 4} class="axis">grid</text>
    <text x={W - LEFT} y={H - 4} class="axis" text-anchor="end">orange: how late · height: how hard</text>
  </svg>

  <div class="controls">
    <div class="mf"><span class="lbl">Timing</span>
      <ScrubValue value={mod.humanizeTimingBeats} min={0} max={0.25} step={0.005} label="Humanize timing" testid="humanize-timing"
                  format={(v) => (v === 0 ? 'off' : `${beatsToMs(v, tempo)} ms`)}
                  title="How late a note can land: drag or type (in beats, e.g. 0.03)"
                  onchange={(v) => set({ humanizeTimingBeats: v })} />
      <span class="sub">{mod.humanizeTimingBeats > 0 ? `up to ${mod.humanizeTimingBeats.toFixed(3)} beat late` : 'on the grid'}</span>
    </div>
    <div class="mf"><span class="lbl">Velocity</span>
      <ScrubValue value={mod.humanizeVelocity} min={0} max={64} label="Humanize velocity" testid="humanize-velocity"
                  format={(v) => (v === 0 ? 'off' : `±${v}`)} onchange={(v) => set({ humanizeVelocity: v })} />
    </div>
    <div class="mf"><span class="lbl">Length</span>
      <ScrubValue value={mod.humanizeGatePercent} min={0} max={100} unit="%" label="Humanize note length" testid="humanize-gate"
                  format={(v) => (v === 0 ? 'off' : `±${v}`)} onchange={(v) => set({ humanizeGatePercent: v })} />
    </div>
    <div class="toggles">
      <PropertyToggle compact label="Keep chords together" value={mod.humanizePreserveChords}
                      onchange={(on) => set({ humanizePreserveChords: on })} />
      <PropertyToggle compact label="Protect whole beats" value={mod.humanizeProtectBeats}
                      onchange={(on) => set({ humanizeProtectBeats: on })} />
    </div>
  </div>
  <span class="hint">Notes only ever land late, never early: early would need to know the future. A changed length never ends a note before it starts.</span>
</div>

<style>
  .editor { display: flex; flex-direction: column; gap: 10px; width: 100%; }
  .top { display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap; }
  .picture { width: 100%; max-width: 640px; background: var(--host-field, #12171b); border: 1px solid var(--host-line-soft, #2c353e); border-radius: 5px; }
  .grid { stroke: var(--host-line-soft, #2c353e); stroke-width: 1; }
  .grid.beat { stroke: var(--host-line, #3b4652); }
  .late { stroke: var(--host-pending, #d7a44e); stroke-width: 3; stroke-linecap: round; }
  .stem { fill: var(--host-accent, #5b9bd5); }
  .head { fill: var(--host-accent-strong, #79b9ee); }
  .anchor { fill: var(--host-active, #58a879); }
  .axis { font: 10px var(--host-font-mono, monospace); fill: var(--host-text-faint, #65717c); }
  .controls { display: flex; flex-wrap: wrap; gap: 14px; align-items: flex-start; }
  .toggles { display: flex; flex-direction: column; gap: 4px; justify-content: flex-end; }
  .mf { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
  .lbl { font: 600 10px var(--host-font-mono, monospace); letter-spacing: .08em; text-transform: uppercase; color: var(--host-text-dim, #7f8b96); }
  .sub { font-size: 11px; color: var(--host-text-faint, #65717c); }
  .hint { font-size: 11px; color: var(--host-text-faint, #65717c); }
  .again { font: 500 12px var(--host-font, sans-serif); color: var(--host-text-soft, #aab5be); background: var(--host-surface-raised, #20272e);
           border: 1px solid var(--host-line, #3b4652); border-radius: 12px; padding: 3px 10px; cursor: pointer; }
  .again:hover { border-color: var(--host-accent, #5b9bd5); }
</style>
