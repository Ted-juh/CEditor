<script>
  /**
   * A part's zone, drawn: which keys it answers (drag the edges on the keyboard), which
   * velocities (drag the edges of the band), which channel and how far it transposes. The other
   * parts' ranges sit faintly above the keys, so a split or a layer is visible where you make it.
   *
   * "Learn by playing" listens to what you play (the host's touch readout) and makes the lowest
   * and highest key the range.
   */
  import { isBlack, keySpan, whiteCount } from '../utils/pianoGeometry.js';
  import { noteLabel } from '../utils/chordBuilder.js';
  import ScrubValue from '../components/controls/ScrubValue.svelte';

  let { part, others = [], activity = { touch: [], seq: 0 }, onset = () => {} } = $props();

  const LOW = 0, HIGH = 127;
  const KEY_W = 10, KEYS_TOP = 34, WHITE_H = 58, BLACK_H = 36;
  const width = whiteCount(LOW, HIGH) * KEY_W;
  const notes = Array.from({ length: HIGH - LOW + 1 }, (_, i) => LOW + i);
  const whites = notes.filter((n) => !isBlack(n));
  const blacks = notes.filter((n) => isBlack(n));
  const x = (n) => keySpan(n, LOW)[0] * KEY_W;
  const w = (n) => (keySpan(n, LOW)[1] - keySpan(n, LOW)[0]) * KEY_W;

  // A drag edits a draft; the part hears about it once, on release.
  let draft = $state(null);
  const lo = $derived(draft?.keyLow ?? part.keyLow);
  const hi = $derived(draft?.keyHigh ?? part.keyHigh);
  const vlo = $derived(draft?.velocityLow ?? part.velocityLow);
  const vhi = $derived(draft?.velocityHigh ?? part.velocityHigh);

  function noteAt(svg, clientX) {
    const r = svg.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * width;
    let best = LOW, d = Infinity;
    for (const n of notes) {
      const c = x(n) + w(n) / 2;
      if (Math.abs(c - px) < d) { d = Math.abs(c - px); best = n; }
    }
    return best;
  }
  function drag(e, apply) {
    e.preventDefault();
    const target = e.currentTarget;
    const svg = target.ownerSVGElement ?? target;
    target.setPointerCapture?.(e.pointerId);
    draft = {};
    const move = (ev) => apply(svg, ev);
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      const fields = draft;
      draft = null;
      if (fields && Object.keys(fields).length) onset(fields);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
    move(e);
  }
  const dragLow = (e) => drag(e, (svg, ev) => { draft = { ...draft, keyLow: Math.min(noteAt(svg, ev.clientX), hi) }; });
  const dragHigh = (e) => drag(e, (svg, ev) => { draft = { ...draft, keyHigh: Math.max(noteAt(svg, ev.clientX), lo) }; });
  const velAt = (svg, clientX) => {
    const r = svg.getBoundingClientRect();
    return Math.max(1, Math.min(127, Math.round(((clientX - r.left) / r.width) * 127)));
  };
  // A grip is kept inside its drawing: at 1 or 127 half of it would hang off the edge.
  const vgrip = (v) => Math.max(0, Math.min(990, (v / 127) * 1000 - 5));
  const dragVelLow = (e) => drag(e, (svg, ev) => { draft = { ...draft, velocityLow: Math.min(velAt(svg, ev.clientX), vhi) }; });
  const dragVelHigh = (e) => drag(e, (svg, ev) => { draft = { ...draft, velocityHigh: Math.max(velAt(svg, ev.clientX), vlo) }; });

  // Learn by playing.
  let learning = $state(null);
  let lastSeq = -1;
  $effect(() => {
    const seq = activity?.seq ?? 0;
    if (seq === lastSeq) return;
    lastSeq = seq;
    if (!learning) return;
    const keys = (activity?.touch ?? []).filter((t) => t[0] === 0 && t[2] > 0).map((t) => t[1]);
    if (keys.length) learning = { lo: Math.min(learning.lo, ...keys), hi: Math.max(learning.hi, ...keys), n: learning.n + keys.length };
  });
  function toggleLearn() {
    if (!learning) { learning = { lo: 127, hi: 0, n: 0 }; return; }
    const done = learning;
    learning = null;
    if (done.n > 0) onset({ keyLow: done.lo, keyHigh: done.hi });
  }
  const CHANNELS = [[0, 'Omni'], ...Array.from({ length: 16 }, (_, i) => [i + 1, String(i + 1)])];
  const whole = $derived(lo === 0 && hi === 127);
</script>

<div class="zone" data-testid="host-zone">
  <div class="head">
    <strong>Zone</strong>
    <span class="sum" data-testid="zone-summary">{whole ? 'every key' : `${noteLabel(lo)}–${noteLabel(hi)}`} · velocity {vlo}–{vhi}{part.channel ? ` · channel ${part.channel}` : ''}{part.transpose ? ` · ${part.transpose > 0 ? '+' : ''}${part.transpose} st` : ''}</span>
  </div>

  <svg class="keys" viewBox={`0 0 ${width} ${KEYS_TOP + WHITE_H + 2}`} role="group" aria-label="Key range: drag its edges"
       data-testid="zone-keys" preserveAspectRatio="none">
    {#each others as o, i (o.partId)}
      <rect x={x(o.keyLow)} y={2 + (i % 2) * 9} width={Math.max(3, x(o.keyHigh) + w(o.keyHigh) - x(o.keyLow))} height="7" rx="2" class="other" />
      <text x={x(o.keyLow) + 3} y={8 + (i % 2) * 9} class="other-name">{o.name}</text>
    {/each}
    <rect x={x(lo)} y="22" width={x(hi) + w(hi) - x(lo)} height="8" rx="2" class="mine" />
    {#each whites as n (n)}
      <rect x={x(n) + 0.5} y={KEYS_TOP} width={w(n) - 1} height={WHITE_H} rx="1.5" class="white" class:in={n >= lo && n <= hi} />
      {#if n % 12 === 0}<text x={x(n) + 2} y={KEYS_TOP + WHITE_H - 4} class="c">{noteLabel(n)}</text>{/if}
    {/each}
    {#each blacks as n (n)}
      <rect x={x(n)} y={KEYS_TOP} width={w(n)} height={BLACK_H} rx="1" class="black" class:in={n >= lo && n <= hi} />
    {/each}
    <rect x={Math.max(0, x(lo) - 2)} y="18" width="6" height={KEYS_TOP + WHITE_H - 16} rx="2" class="grip" data-testid="zone-low"
          role="slider" tabindex="-1" aria-label="Lowest key" aria-valuenow={lo} onpointerdown={dragLow}><title>Lowest key: drag</title></rect>
    <rect x={Math.min(width - 6, x(hi) + w(hi) - 4)} y="18" width="6" height={KEYS_TOP + WHITE_H - 16} rx="2" class="grip" data-testid="zone-high"
          role="slider" tabindex="-1" aria-label="Highest key" aria-valuenow={hi} onpointerdown={dragHigh}><title>Highest key: drag</title></rect>
  </svg>

  <svg class="vel" viewBox="0 0 1000 30" preserveAspectRatio="none" role="group" aria-label="Velocity range: drag its edges"
       data-testid="zone-velocity">
    <rect x="0" y="8" width="1000" height="16" rx="3" class="vtrack" />
    <rect x={(vlo / 127) * 1000} y="8" width={((vhi - vlo) / 127) * 1000} height="16" rx="3" class="vband" />
    <rect x={vgrip(vlo)} y="4" width="10" height="24" rx="2" class="vgrip" data-testid="zone-vel-low"
          role="slider" tabindex="-1" aria-label="Softest velocity" aria-valuenow={vlo} onpointerdown={dragVelLow} />
    <rect x={vgrip(vhi)} y="4" width="10" height="24" rx="2" class="vgrip" data-testid="zone-vel-high"
          role="slider" tabindex="-1" aria-label="Hardest velocity" aria-valuenow={vhi} onpointerdown={dragVelHigh} />
  </svg>

  <div class="row">
    <div class="mf"><span class="lbl">Channel</span>
      <ScrubValue value={part.channel} choices={CHANNELS} label="MIDI channel" testid="zone-channel"
                  onchange={(v) => onset({ channel: v })} />
    </div>
    <div class="mf"><span class="lbl">Transpose</span>
      <ScrubValue value={part.transpose} min={-60} max={60} label="Transpose" testid="zone-transpose"
                  format={(v) => (v === 0 ? 'none' : `${v > 0 ? '+' : ''}${v} st`)} onchange={(v) => onset({ transpose: v })} />
    </div>
    <button type="button" class="ctl pill" class:armed={learning} data-testid="zone-learn" onclick={toggleLearn}>
      {learning ? (learning.n ? `■ done: ${noteLabel(learning.lo)}–${noteLabel(learning.hi)}` : '■ done (play the lowest and highest key)') : '● learn range by playing'}</button>
    <button type="button" class="ctl pill" data-testid="zone-all" disabled={whole && vlo === 1 && vhi === 127}
            onclick={() => onset({ keyLow: 0, keyHigh: 127, velocityLow: 1, velocityHigh: 127 })}>every key</button>
  </div>
</div>

<style>
  .zone { display: flex; flex-direction: column; gap: 8px; }
  .head { display: flex; align-items: baseline; gap: 10px; }
  .sum { font: 12px var(--host-font-mono, monospace); color: var(--host-text-dim, #7f8b96); }
  .keys { width: 100%; height: 104px; display: block; user-select: none; touch-action: none; }
  .vel { width: 100%; height: 30px; display: block; touch-action: none; }
  .white { fill: #b9c0c7; stroke: #0e1216; stroke-width: 1; }
  .white.in { fill: #e8edf1; }
  .black { fill: #262c32; stroke: #0e1216; }
  .black.in { fill: #10151a; }
  .white.in, .black.in { filter: none; }
  .c { font: 7px var(--host-font-mono, monospace); fill: #4a535c; pointer-events: none; }
  .mine { fill: var(--host-accent, #5b9bd5); }
  .other { fill: var(--host-line-strong, #526170); opacity: .55; }
  .other-name { font: 6px var(--host-font, sans-serif); fill: var(--host-text, #d9e0e6); pointer-events: none; }
  .grip { fill: var(--host-accent-strong, #79b9ee); cursor: ew-resize; }
  .vtrack { fill: var(--host-field, #12171b); stroke: var(--host-line-soft, #2c353e); }
  .vband { fill: #d7a44e; opacity: .55; }
  .vgrip { fill: #d7a44e; cursor: ew-resize; }
  .row { display: flex; gap: 14px; flex-wrap: wrap; align-items: flex-end; }
  .mf { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
  .lbl { font: 600 10px var(--host-font-mono, monospace); letter-spacing: .08em; text-transform: uppercase; color: var(--host-text-dim, #7f8b96); }
  .pill { font: 500 12px var(--host-font, sans-serif); color: var(--host-text-soft, #aab5be); cursor: pointer;
          background: var(--host-surface-raised, #20272e); border: 1px solid var(--host-line, #3b4652); border-radius: 12px; padding: 3px 10px; }
  .pill:disabled { opacity: .45; cursor: default; }
  .pill.armed { color: #d9a13c; border-color: #d9a13c; }
</style>
